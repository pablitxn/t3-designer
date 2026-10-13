import { startSharedEditorScenario } from '../e2e/shared-editor-fixture.ts'

const scenario = await startSharedEditorScenario()
const fixture = await scenario.seed()
console.log(JSON.stringify({ origin: scenario.origin, project: `${scenario.origin}/app/projects/${fixture.project.id}`,
  accounts: { editor: fixture.editor.email, owner: fixture.owner.email, stranger: fixture.stranger.email, admin: scenario.admin.email },
  fixturePassword: scenario.password, generation: 'disabled', data: 'temporary fictional SQLite; removed on exit' }, null, 2))
let closing = false
async function close() { if (closing) return; closing = true; await scenario.close() }
process.once('SIGINT', () => { void close() })
process.once('SIGTERM', () => { void close() })
