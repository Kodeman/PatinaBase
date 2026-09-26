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
  let errored = 0

  for (const doc of DOCS) {
    if (commit) {
      try {
        await client.createOrReplace(doc)
        console.log(`  ✅ ${summarize(doc)} (_id=${doc._id})`)
        written++
      } catch (err) {
        console.log(`  ❌ ${summarize(doc)} — ${err.message}`)
        errored++
      }
    } else {
      console.log(`  📝 ${summarize(doc)} (_id=${doc._id})`)
      written++
    }
  }

  console.log(`\n[W3-c] ${commit ? 'committed' : 'dry-run'}: ${written} written, ${errored} errored`)
  if (errored > 0) process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
