import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { AssetRequestSchema } from '@t3-designer/asset-schema'
import { codexConfig, codexEnvironment, multimodalInput, parsePlanResponse, parseReviewResponse, planAsset, planningError, productPrompt, reviewAsset, reviewPrompt, webActivity } from '../src/codex.ts'

const input = { url: 'https://example.com/product/table', notes: '' }
const recipe = {
  schemaVersion: 1, id: 'table', label: 'Mesa', kind: 'table', units: 'meters',
  dimensions: [1.2, .75, .7], material: { baseColor: '#887755', roughness: .8 },
  source: { description: 'Manufacturer dimensions', dimensionalStatus: 'manufacturer-specified' },
  parameters: { topThickness: .04, legWidth: .05, legInset: .04 },
}
const response = (value: unknown = recipe) => JSON.stringify({
  status: 'ready', label: 'Mesa', summary: 'Mesa de cuatro patas.', questions: [], warnings: [], recipeJson: JSON.stringify(value),
})
const reviewResponse = (verdict: 'accept' | 'revise' | 'needs_input', value: unknown = null) => JSON.stringify({
  verdict, summary: 'Comparación de las tres vistas con las fotos del producto.', issues: verdict === 'revise' ? ['Ajustar el grosor de las patas.'] : [],
  questions: verdict === 'needs_input' ? ['¿Tenés una foto de perfil?'] : [], recipeJson: value ? JSON.stringify(value) : '',
})

test('live activity exposes web actions while excluding reasoning and raw model output', () => {
  assert.deepEqual(webActivity({ type: 'item.completed', item: { type: 'web_search', id: 's1', query: 'IKEA product dimensions' } }),
    { kind: 'search', message: 'Consulta web completada', detail: 'IKEA product dimensions' })
  assert.equal(webActivity({ type: 'item.completed', item: { type: 'reasoning', id: 'r1', text: 'private internal analysis' } }), null)
  assert.equal(webActivity({ type: 'item.completed', item: { type: 'agent_message', id: 'm1', text: 'raw recipe JSON' } }), null)
  const source = webActivity({ type: 'item.completed', item: { type: 'web_search', id: 's2', query: 'https://www.ikea.com/product?token=secret#details' } })
  assert.equal(source?.url, 'https://www.ikea.com/product')
  assert.equal(source?.detail, 'www.ikea.com')
})

test('Codex environment keeps the local auth location and excludes credentials from other applications', () => {
  const env = codexEnvironment({ PATH: '/bin', HOME: '/home/example', CODEX_HOME: '/home/example/.codex',
    OPENAI_API_KEY: 'secret', CODEX_API_KEY: 'secret', GITHUB_TOKEN: 'secret', NODE_OPTIONS: '--require=untrusted.js' })
  assert.equal(env.CODEX_HOME, '/home/example/.codex')
  assert.equal(env.HOME, '/home/example')
  assert.equal(env.OPENAI_API_KEY, undefined)
  assert.equal(env.CODEX_API_KEY, undefined)
  assert.equal(env.GITHUB_TOKEN, undefined)
  assert.equal(env.NODE_OPTIONS, undefined)
  assert.equal(codexConfig.forced_login_method, 'chatgpt')
})

test('plans preserve trusted source URLs and enforce dimensions supplied by the user', () => {
  const plan = parsePlanResponse(response({ ...recipe, source: { ...recipe.source, url: 'https://other.example/product' } }),
    { ...input, dimensions: [1.4, .8, .9] })
  assert.deepEqual(plan.recipe?.dimensions, [1.4, .8, .9])
  assert.equal(plan.recipe?.source.dimensionalStatus, 'user-supplied')
  assert.equal(plan.recipe?.source.url, input.url)
})

test('invalid and executable recipes never reach Blender', () => {
  assert.throws(() => parsePlanResponse(response({ ...recipe, python: 'import os' }), input), /no cumple/)
  assert.throws(() => parsePlanResponse(response({ ...recipe, dimensions: [0, .5, .5] }), input), /no cumple/)
  assert.throws(() => parsePlanResponse(response({ ...recipe, parameters: { topThickness: 2, legWidth: .1, legInset: .1 } }), input), /no cumple/)
  assert.throws(() => parsePlanResponse('not json with secret', input), /no cumple/)
})

test('incomplete plans require actionable questions without a recipe', () => {
  const envelope = { status: 'needs_input', label: 'Mesa', summary: '', questions: ['¿Cuánto mide de alto?'], warnings: [], recipeJson: '' }
  assert.equal(parsePlanResponse(JSON.stringify(envelope), input).recipe, null)
  assert.throws(() => parsePlanResponse(JSON.stringify({ ...envelope, questions: [] }), input), /no cumple/)
})

test('estimated measurements require user clarification before rendering', () => {
  const plan = parsePlanResponse(response({ ...recipe, source: { ...recipe.source, dimensionalStatus: 'estimated' } }), input)
  assert.equal(plan.status, 'needs_input')
  assert.equal(plan.recipe, null)
  assert.equal(plan.questions.length, 1)
})

test('the authored STRANDMON recipe cannot be silently used for another chair', () => {
  const chair = { ...recipe, kind: 'wingback-chair', dimensions: [.82, 1.01, .96], parameters: { seatDimensions: [.49, .45, .54] } }
  assert.throws(() => parsePlanResponse(response(chair), input), /no cumple/)
  assert.equal(parsePlanResponse(response(chair), { ...input, url: 'https://www.ikea.com/es/es/p/strandmon-20343224/' }).recipe?.kind, 'wingback-chair')
})

test('errors expose actionable categories without forwarding raw CLI output', () => {
  const failure = planningError(new Error('Authentication failed: token super-secret-value'))
  assert.equal(failure.code, 'authentication')
  assert.doesNotMatch(failure.message, /super-secret-value/)
  assert.equal(planningError(new Error('429 quota')).code, 'usage_limit')
  assert.equal(planningError(new Error('a private local path')).code, 'codex_failed')
})

test('the prompt contains product data and the correct schema coordinate constraints', () => {
  const prompt = productPrompt({ ...input, notes: 'Roble claro' })
  assert.ok(prompt.includes(JSON.stringify({ ...input, notes: 'Roble claro' })))
  assert.match(prompt, /X=width, Y=up, Z=front/)
  assert.match(prompt, /between -180 and 180/)
  assert.match(prompt, /No code execution/)
  assert.match(prompt, /"cushion"/)
  assert.match(prompt, /"corduroy"/)
  assert.match(prompt, /Do not replace upholstery with separate balls/)
})

test('multimodal labels preserve reference and render identities through SDK image grouping', () => {
  const images = multimodalInput('Compare', [{ path: '/references/one.jpg', label: 'Frente' }, { path: '/references/two.jpg', label: 'Perfil' }],
    ['/renders/preview.png', '/renders/front.png', '/renders/side.png'])
  assert.deepEqual(images.filter((item) => item.type === 'local_image').map((item) => item.path),
    ['/references/one.jpg', '/references/two.jpg', '/renders/preview.png', '/renders/front.png', '/renders/side.png'])
  const text = images.filter((item) => item.type === 'text').map((item) => item.text).join('\n')
  assert.match(text, /IMAGE 2: PRODUCT REFERENCE — Perfil/)
  assert.match(text, /IMAGE 3: GENERATED MODEL RENDER — preview.png/)
  assert.match(text, /IMAGE 5: GENERATED MODEL RENDER — side.png/)
})

test('planning and review request missing imagery without starting an inference', async () => {
  const options = { signal: new AbortController().signal, workingDirectory: '/does-not-exist', onProgress() {} }
  const plan = await planAsset(input, options)
  assert.equal(plan.status, 'needs_input')
  assert.match(plan.questions[0], /Adjuntá fotos/)
  const request = AssetRequestSchema.parse(recipe)
  assert.equal((await reviewAsset(request, { ...options, renderPaths: [], iteration: 1 })).verdict, 'needs_input')
  const missingViews = await reviewAsset(request, { ...options, referenceImages: [{ path: '/photo.jpg', label: 'Producto' }], renderPaths: ['/preview.png'], iteration: 1 })
  assert.equal(missingViews.verdict, 'needs_input')
  assert.match(missingViews.issues.join(' '), /perspectiva, de frente y de perfil/)
})

test('visual revisions preserve dimensions and provenance and require a real change', () => {
  const original = AssetRequestSchema.parse({ ...recipe, source: { ...recipe.source, url: input.url } })
  const revised = { ...recipe, id: 'invented-id', label: 'Wrong product', source: { ...recipe.source, url: 'https://other.example/product' }, parameters: { ...recipe.parameters, legWidth: .06 } }
  const review = parseReviewResponse(reviewResponse('revise', revised), original)
  assert.equal(review.recipe?.id, original.id)
  assert.equal(review.recipe?.label, original.label)
  assert.deepEqual(review.recipe?.source, original.source)
  assert.deepEqual(review.recipe?.dimensions, original.dimensions)
  assert.throws(() => parseReviewResponse(reviewResponse('revise', { ...revised, dimensions: [1.3, .75, .7] }), original), /corrección válida/)
  assert.throws(() => parseReviewResponse(reviewResponse('revise', original), original), /corrección válida/)
  assert.throws(() => parseReviewResponse(reviewResponse('revise', { ...revised, python: 'untrusted' }), original), /corrección válida/)
})

test('visual verdicts enforce the correct recipe and question combinations', () => {
  const request = AssetRequestSchema.parse(recipe)
  assert.equal(parseReviewResponse(reviewResponse('accept'), request).recipe, null)
  assert.equal(parseReviewResponse(reviewResponse('needs_input'), request).questions.length, 1)
  assert.throws(() => parseReviewResponse(reviewResponse('revise'), request), /corrección válida/)
  assert.throws(() => parseReviewResponse(reviewResponse('accept', recipe), request), /corrección válida/)
  assert.throws(() => parseReviewResponse(JSON.stringify({ verdict: 'needs_input', summary: 'Sin fotos', issues: [], questions: [], recipeJson: '' }), request), /corrección válida/)
  assert.match(reviewPrompt(request, 2), /Passing the dimension\/GLB audit is not visual acceptance/)
})

test('the SDK receives photo and prior-render attachments on planning, and all views on review', async () => {
  const directory = await mkdtemp(join(tmpdir(), 't3-codex-images-'))
  const previousBinary = process.env.T3_CODEX_BIN
  try {
    const command = join(directory, 'fake-codex')
    const capture = join(directory, 'captured.json')
    const setup = async (final: string) => {
      await writeFile(command, `#!${process.execPath}\nimport {writeFileSync} from 'node:fs';\nlet prompt='';process.stdin.on('data',x=>prompt+=x);process.stdin.on('end',()=>{writeFileSync(${JSON.stringify(capture)},JSON.stringify({args:process.argv.slice(2),prompt}));process.stdout.write(JSON.stringify({type:'item.completed',item:{id:'reply',type:'agent_message',text:${JSON.stringify(final)}}})+'\\n');});\n`)
      await chmod(command, 0o700)
    }
    process.env.T3_CODEX_BIN = command
    const referenceImages = [{ path: join(directory, 'photo.jpg'), label: 'Producto real' }]
    const renderPaths = ['preview.png', 'front.png', 'side.png'].map((name) => join(directory, name))
    const options = { signal: new AbortController().signal, onProgress() {}, workingDirectory: directory, referenceImages }
    const request = AssetRequestSchema.parse(recipe)
    await setup(response())
    const plan = await planAsset(input, { ...options, previous: { recipe: request, feedback: 'El respaldo flota', renderPaths } })
    assert.equal(plan.status, 'ready')
    assert.equal(plan.recipe?.source.dimensionalStatus, 'manufacturer-specified')
    let captured = JSON.parse(await readFile(capture, 'utf8')) as { args: string[]; prompt: string }
    const attached = () => captured.args.flatMap((value, index) => value === '--image' ? [captured.args[index + 1]] : [])
    assert.deepEqual(attached(), [referenceImages[0].path, ...renderPaths])
    assert.match(captured.prompt, /El respaldo flota/)
    assert.match(captured.prompt, /IMAGE 4: GENERATED MODEL RENDER — side.png/)
    const preserved = await planAsset({ ...input, dimensions: request.dimensions },
      { ...options, previous: { recipe: request, feedback: 'Mantener medidas', renderPaths } })
    assert.equal(preserved.recipe?.source.dimensionalStatus, 'manufacturer-specified')
    const changed = await planAsset({ ...input, dimensions: [1.4, .75, .7] },
      { ...options, previous: { recipe: request, feedback: 'Ahora el ancho es 1,4 m', renderPaths } })
    assert.equal(changed.recipe?.source.dimensionalStatus, 'user-supplied')
    assert.deepEqual(changed.recipe?.dimensions, [1.4, .75, .7])
    await setup(reviewResponse('accept'))
    assert.equal((await reviewAsset(request, { ...options, renderPaths, iteration: 2 })).verdict, 'accept')
    captured = JSON.parse(await readFile(capture, 'utf8')) as { args: string[]; prompt: string }
    assert.deepEqual(attached(), [referenceImages[0].path, ...renderPaths])
    assert.ok(captured.args.includes('web_search="disabled"'))
  } finally {
    if (previousBinary === undefined) delete process.env.T3_CODEX_BIN
    else process.env.T3_CODEX_BIN = previousBinary
    await rm(directory, { recursive: true, force: true })
  }
})

test('SDK wrapper keeps CLI arguments separate and injects isolation switches', async () => {
  const directory = await mkdtemp(join(tmpdir(), 't3-codex-wrapper-'))
  try {
    const command = join(directory, 'fake-codex')
    await writeFile(command, `#!${process.execPath}\nprocess.stdout.write(JSON.stringify(process.argv.slice(2)))\n`)
    await chmod(command, 0o700)
    const wrapper = fileURLToPath(new URL('../src/codex-local.mjs', import.meta.url))
    const result = await promisify(execFile)(process.execPath, [wrapper, 'exec', '--json', '--config', 'model="a b"'], {
      env: { ...codexEnvironment(), T3_CODEX_BIN: command },
    })
    assert.deepEqual(JSON.parse(result.stdout), ['exec', '--ignore-user-config', '--ignore-rules', '--ephemeral', '--json', '--config', 'model="a b"'])
  } finally { await rm(directory, { recursive: true, force: true }) }
})
