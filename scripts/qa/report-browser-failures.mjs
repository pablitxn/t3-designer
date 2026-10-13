import { existsSync, readFileSync } from 'node:fs'
import { stripVTControlCharacters } from 'node:util'

// CI diagnostics only. Read Playwright's saved results; never change test status.
// Annotations remain readable through GitHub's API when log downloads are blocked.
const escape = value => String(value).replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A')
const property = value => escape(value).replaceAll(',', '%2C').replaceAll(':', '%3A')
let failures = 0
function report(title, error) {
  if (failures++ >= 30) return
  const message = stripVTControlCharacters(String(error?.stack ?? error?.message ?? error ?? 'Unknown browser failure')).slice(0, 4000)
  console.log(`::error title=${property(title)}::${escape(message)}`)
}
function visit(suites) {
  for (const suite of suites ?? []) {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        if (!['unexpected', 'flaky'].includes(test.status)) continue
        const result = test.results?.findLast(result => result.error || result.errors?.length)
        report(`${test.projectName || 'default'} / ${spec.title}`, result?.error ?? result?.errors?.[0])
      }
    }
    visit(suite.suites)
  }
}
let reports = 0
for (const filename of process.argv.slice(2)) {
  if (!existsSync(filename)) continue
  try {
    const data = JSON.parse(readFileSync(filename, 'utf8'))
    reports++
    visit(data.suites)
    for (const error of data.errors ?? []) report(filename, error)
  } catch { console.log(`::warning::Unreadable browser report ${property(filename)}`) }
}
console.log(`Browser diagnostics: ${reports} reports, ${failures} recorded failures. Original test exit status is preserved.`)
