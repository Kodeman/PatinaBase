// PT-D-2-T6-2 — Decisions help-content seed runner.
//
// Direct @sanity/client invocation (mirrors run-coachmark-migration.mjs),
// bypassing the sanity/cli getCliClient import which is unstable on @latest.
// Reads the authored copy from decisions-help-content.json so it never drifts
// from the typed seed-decisions-help.ts exec script.
//
// Usage:
//   SANITY_AUTH_TOKEN=<token> node studios/help-system/scripts/run-decisions-help-seed.mjs           # dry run
//   SANITY_AUTH_TOKEN=<token> node studios/help-system/scripts/run-decisions-help-seed.mjs --commit  # write

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DOCS = JSON.parse(
  readFileSync(join(__dirname, 'decisions-help-content.json'), 'utf8'),
)

const commit = process.argv.includes('--commit')

async function main() {
  console.log(`[T6-2] ${commit ? 'COMMIT' : 'DRY RUN'} — seeding ${DOCS.length} decisions help docs…\n`)

  // Only require a token + the @sanity/client dependency when actually
  // writing — the dry run validates the content offline (no studio deps
  // needed) so reviewers can sanity-check copy without a Sanity session.
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
        console.log(`  ✅ ${doc.contentType.padEnd(11)} ${doc.surfaceKey}`)
        written++
      } catch (err) {
        console.log(`  ❌ ${doc.contentType.padEnd(11)} ${doc.surfaceKey} — ${err.message}`)
        errored++
      }
    } else {
      console.log(`  📝 ${doc.contentType.padEnd(11)} ${doc.surfaceKey} (_id=${doc._id})`)
      written++
    }
  }

  console.log(`\n[T6-2] ${commit ? 'committed' : 'dry-run'}: ${written} written, ${errored} errored`)
  if (errored > 0) process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
