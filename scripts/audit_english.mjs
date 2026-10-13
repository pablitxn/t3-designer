import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

// This bounded regression check is not general language detection. Reviewers
// still classify localization, fixtures, quotations, names and prose meaning.
const phrases = [
  'base de conocimiento compartida', 'estado implementado', 'rama de trabajo',
  'pruebas ejecutadas', 'comandos y resultados', 'sin cambios de contenido',
  'pendiente de consolidacion', 'pendiente de consolidación',
  'no se ejecutaron', 'no se modificaron', 'se conservan los',
]
const args = process.argv.slice(2)
if (args.length && (args.length !== 2 || args[0] !== '--base')) {
  console.error('Usage: node scripts/audit_english.mjs [--base <revision>]')
  process.exit(2)
}
const git = (...values) => execFileSync('git', values, { encoding: 'utf8' })
const files = git('ls-files', '-z').split('\0').filter(Boolean)
const findings = []
let inspected = 0
for (const file of files) {
  const markdown = file.endsWith('.md')
  const source = /\.(?:ts|tsx|mjs|js|py|sh|css|ya?ml)$/.test(file)
  if (!markdown && !source) continue
  const lines = readFileSync(file, 'utf8').split('\n')
  let fence = false
  let blockComment = false
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    if (markdown && /^\s*(```|~~~)/.test(line)) { fence = !fence; continue }
    if (markdown && fence) continue
    // Only standalone comment lines and single-line test descriptions in code.
    // Multiline strings, docstrings and inline comments require human review.
    const comment = /^\s*(?:\/\/|\/\*|\*|#(?![!]))/.test(line) || blockComment
    const test = /^\s*(?:test|it|describe)(?:\.[a-z]+)?\(\s*['"`]/.test(line)
    if (/^\s*\/\*/.test(line)) blockComment = true
    if (line.includes('*/')) blockComment = false
    if (!markdown && !comment && !test) continue
    inspected++
    // Preserve literal contracts and external link targets. Quoted UI/source
    // phrases may still need explicit classification if a bounded term matches.
    const prose = line.replace(/`[^`]*`/g, '').replace(/\]\([^)]*\)/g, ']').toLowerCase()
    for (const phrase of phrases) {
      if (prose.includes(phrase)) findings.push(`${file}:${index + 1}: review phrase ${JSON.stringify(phrase)}`)
    }
  }
}
if (args.length) {
  // Only explicitly selected new commits; never rewrite or judge old history.
  git('rev-parse', '--verify', `${args[1]}^{commit}`)
  const messages = git('log', '--format=%H%x09%s', `${args[1]}..HEAD`).trim()
  for (const row of messages ? messages.split('\n') : []) {
    const [sha, subject] = row.split('\t')
    if (!/^(?:feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)\([a-z0-9][a-z0-9._/-]*\)!?: .+/.test(subject)) {
      findings.push(`${sha}: expected type(scope): description`)
    }
    if (phrases.some(phrase => subject.toLowerCase().includes(phrase))) findings.push(`${sha}: review commit language`)
  }
}
if (findings.length) {
  console.error(findings.join('\n'))
  process.exitCode = 1
} else {
  console.log(`English audit: ${inspected} technical lines checked; no bounded phrase findings.`)
  console.log('Human review is required for language, meaning, exceptions and remote PR metadata.')
}
