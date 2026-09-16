// F3 — People-room help-content seed runner.
//
// Direct @sanity/client invocation (mirrors run-decisions-help-seed.mjs),
// bypassing the sanity/cli getCliClient import which is unstable on @latest.
// Reads the authored copy from people-editing-details-help-content.json so it
// never drifts from the typed seed-people-editing-details-help.ts exec script.
//
// Usage:
//   SANITY_AUTH_TOKEN=<token> node studios/help-system/scripts/run-people-editing-details-help-seed.mjs           # dry run
//   SANITY_AUTH_TOKEN=<token> node studios/help-system/scripts/run-people-editing-details-help-seed.mjs --commit  # write

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DOCS = JSON.parse(
  readFileSync(join(__dirname, 'people-editing-details-help-content.json'), 'utf8'),
)

const commit = process.argv.includes('--commit')

async function main() {
  console.log(`[F3] ${commit ? 'COMMIT' : 'DRY RUN'} — seeding ${DOCS.length} People help doc(s)…\n`)

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

  console.log(`\n[F3] ${commit ? 'committed' : 'dry-run'}: ${written} written, ${errored} errored`)
  if (errored > 0) process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
