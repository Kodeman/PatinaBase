// W3-c (Return teaching, 2026-09-25) — teaching-notes content seed runner.
//
// Direct @sanity/client invocation (mirrors run-people-help-seed.mjs),
// bypassing the sanity/cli getCliClient import which is unstable on @latest.
// Reads the authored copy from teaching-notes-content.json: three
// `teachingRelease` docs (§1.2, `apps/designer-portal/src/content/teaching-releases.ts`
// manifest ids) and eight `teachingNote` docs (§1.1, §D copy samples). Every
// _id here is a `drafts.` id, so a --commit run never publishes: Leah reviews
// and publishes from the Studio (system-architecture.md §6).
//
// Usage:
//   node studios/help-system/scripts/run-teaching-notes-seed.mjs           # dry run, no token needed
//   SANITY_AUTH_TOKEN=<token> node studios/help-system/scripts/run-teaching-notes-seed.mjs --commit  # write drafts
//
// Provenance note (moved out of the content JSON's non-schema `_comment`
// fields, R2-F6 #6/#7): every note's `successEvent` is a proposed telemetry
// name, not yet instrumented in document-events.ts. Each should fire on:
//   - invoice-delivery-status@1: a delivery row read on a visit after the invoice's own send
//   - invoice-print@1: a printed invoice later recorded as paid outside Stripe
//   - galley-parts-fold@1: an agreement sent after this note is signed with no superseding revision
//   - hours-shortcut@1: a time entry logged from the `t` key, distinct from the sheet form
//   - draw-from-time@1: an invoice sent with lines drawn from time entries
//   - field-hours@1: a project_time_entries row with source field_visit within 30 days
//   - second-seat-hours@1: an invoice drawn from hours that include a hand's entries
//   - invite-handoff-note@1: a later invite accepted with a handoff_note

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DOCS = JSON.parse(
  readFileSync(join(__dirname, 'teaching-notes-content.json'), 'utf8'),
)

const commit = process.argv.includes('--commit')

function summarize(doc) {
  if (doc._type === 'teachingRelease') {
    return `release  ${doc.id.padEnd(34)} ${doc.headline}`
  }
  return `note     ${doc.noteKey.padEnd(28)} ${doc.surfaceKey}`
}

async function main() {
  console.log(`[W3-c] ${commit ? 'COMMIT' : 'DRY RUN'} — seeding ${DOCS.length} teaching docs (all as drafts)…\n`)

  // Only require a token + the @sanity/client dependency when actually
  // writing — the dry run validates the content offline (no studio deps
  // needed) so Leah's review can sanity-check copy without a Sanity session.
  let client = null
  if (commit) {
    const token = process.env.SANITY_AUTH_TOKEN
    if (!token) {
      console.error('SANITY_AUTH_TOKEN missing')
      process.exit(2)
    }
    const { createClient } = await import('@sanity/client')
    client = createClient({
      projectId: 'kv3qrinl',
      dataset: 'production',
      apiVersion: '2024-01-01',
      token,
      useCdn: false,
    })
  }

  let written = 0
  let skipped = 0
  let errored = 0

  for (const doc of DOCS) {
    if (commit) {
      try {
        // createIfNotExists is a no-op when the _id already exists, so a
        // re-run never overwrites Leah's edits to a doc she has already
        // reviewed. Check first so the log can say which happened.
        const existing = await client.getDocument(doc._id)
        if (existing) {
          console.log(`  ⏭️  ${summarize(doc)} (_id=${doc._id}) — exists, skipped`)
          skipped++
        } else {
          await client.createIfNotExists(doc)
          console.log(`  ✅ ${summarize(doc)} (_id=${doc._id})`)
          written++
        }
      } catch (err) {
        console.log(`  ❌ ${summarize(doc)} — ${err.message}`)
        errored++
      }
    } else {
      console.log(`  📝 ${summarize(doc)} (_id=${doc._id})`)
      written++
    }
  }

  console.log(
    `\n[W3-c] ${commit ? 'committed' : 'dry-run'}: ${written} written, ${skipped} exists (skipped), ${errored} errored`,
  )
  if (errored > 0) process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
