/**
 * F3 — People-room "Editing someone's details" help-content seed.
 *
 * Authors the Sanity `helpContent` document for the People room
 * (`designer-portal/document/people`, filed under the "Rooms" shelf per
 * apps/designer-portal/src/lib/help-system/help-topics.ts).
 *
 * F3-R1-04 — the first draft of this content shipped as `contentType:
 * 'tooltip'`, which the Help Center's ContextualHelpPanel can never surface:
 * its ARTICLES_QUERY only matches `contentType == "helpArticle"`
 * (packages/help-system/src/reactive/ContextualHelpPanel/ContextualHelpPanel.tsx),
 * and no People-room component renders a tooltip bound to this surfaceKey
 * either. This seed instead authors it as a `helpArticle`, with the seed pair
 * (this file + the .mjs runner) the Decisions dashboard precedent uses, so
 * someone with Sanity write access can actually push it.
 *
 * F3-R2-04 — the docs come from the typed `people-editing-details-help-
 * content.ts` module (as `seed-decisions-help.ts` imports
 * `DECISIONS_HELP_DOCS` from `decisions-help-content.ts`), not the raw JSON
 * with a locally re-declared type — one typed module, matching the
 * Decisions precedent exactly.
 *
 * Idempotent: a deterministic `_id`, so re-running with --commit
 * `createOrReplace`s rather than duplicating. Mirrors
 * seed-decisions-help.ts's shape and usage.
 *
 * Prerequisites
 * -------------
 *   1. The helpContent schema (helpArticleContent block) is already deployed.
 *   2. Write access to project `kv3qrinl` dataset `production` — either a
 *      `--with-user-token` CLI session or `SANITY_AUTH_TOKEN` for the .mjs
 *      runner counterpart (`run-people-editing-details-help-seed.mjs`).
 *
 * Usage
 * -----
 *   # Inside studios/help-system
 *   npx sanity@latest exec --with-user-token scripts/seed-people-editing-details-help.ts          # dry run
 *   npx sanity@latest exec --with-user-token scripts/seed-people-editing-details-help.ts --commit # write
 */

import { getCliClient } from 'sanity/cli'
import { PEOPLE_EDITING_DETAILS_HELP_DOCS } from './people-editing-details-help-content'

const DOCS = PEOPLE_EDITING_DETAILS_HELP_DOCS
const commit = process.argv.includes('--commit')

async function main() {
  const client = getCliClient()

  console.log(
    `[F3] ${commit ? 'COMMIT' : 'DRY RUN'} — seeding ${DOCS.length} People help doc(s)…\n`,
  )

  let written = 0
  let errored = 0

  for (const doc of DOCS) {
    if (commit) {
      try {
        await client.createOrReplace(doc)
        console.log(`  ✓ ${doc.contentType.padEnd(11)} ${doc.surfaceKey}`)
        written += 1
      } catch (err) {
        console.log(
          `  ✗ ${doc.contentType.padEnd(11)} ${doc.surfaceKey} — ${err instanceof Error ? err.message : String(err)}`,
        )
        errored += 1
      }
    } else {
      console.log(
        `  · would-write ${doc.contentType.padEnd(11)} ${doc.surfaceKey} (_id=${doc._id})`,
      )
      written += 1
    }
  }

  if (!commit) {
    console.log('\n[F3] DRY RUN complete. Re-run with --commit to apply.')
  } else {
    console.log(`\n[F3] Done. ${written} written, ${errored} errored.`)
    if (errored > 0) process.exit(1)
  }
}

main().catch((err) => {
  console.error('[F3] Unexpected failure:', err)
  process.exit(1)
})
