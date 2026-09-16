/**
 * W4-help (People room CRM, 2026-09-11) — People room help-content seed.
 *
 * Authors the Sanity `helpContent` documents for the People room CRM panel's
 * five surfaces declared in `packages/help-system/src/surfaceKeys.ts` →
 * `SurfaceKeys.DesignerPortal.Document.{People,PeoplePerson,PeopleFirm,
 * CallSheet.SiteAccess,CallSheet.BringForward}` (the last three minted in
 * this same wave and mirrored in
 * `apps/designer-portal/src/lib/help-system/document-surface-keys.ts`).
 *
 * Surfaces covered (18 docs):
 *   - 2× fieldHelper / 6× tooltip / 1× emptyState → designer-portal/document/people
 *   - 1× helpArticle / 3× tooltip                 → .../people/person
 *   - 1× fieldHelper / 2× tooltip                 → .../people/firm
 *   - 1× fieldHelper / 1× tooltip                 → .../call-sheet/site-access
 *   - 1× fieldHelper                              → .../call-sheet/bring-forward
 *
 * Persona: all docs are authored as persona='all'; the room has no
 * persona-specific voice split yet.
 *
 * Idempotent: every doc uses a deterministic `_id` (`helpContent.<slug>`,
 * one dash-doubled segment per surfaceKey path element), so re-running with
 * --commit `createOrReplace`s rather than duplicating.
 *
 * Prerequisites
 * -------------
 *   1. The helpContent schema is already deployed (it predates this seed).
 *   2. Write access to project `kv3qrinl` dataset `production` — either a
 *      `--with-user-token` CLI session or `SANITY_AUTH_TOKEN` for the .mjs
 *      runner counterpart (`run-people-help-seed.mjs`).
 *
 * Usage
 * -----
 *   # Inside studios/help-system
 *   npx sanity@latest exec --with-user-token scripts/seed-people-help.ts          # dry run
 *   npx sanity@latest exec --with-user-token scripts/seed-people-help.ts --commit # write
 */

import { getCliClient } from 'sanity/cli'
import { PEOPLE_HELP_DOCS } from './people-help-content'

const commit = process.argv.includes('--commit')

async function main() {
  const client = getCliClient()

  console.log(
    `[W4-help] ${commit ? 'COMMIT' : 'DRY RUN'} — seeding ${PEOPLE_HELP_DOCS.length} people-room help docs…\n`,
  )

  let written = 0
  let errored = 0

  for (const doc of PEOPLE_HELP_DOCS) {
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
    console.log('\n[W4-help] DRY RUN complete. Re-run with --commit to apply.')
  } else {
    console.log(`\n[W4-help] Done. ${written} written, ${errored} errored.`)
    if (errored > 0) process.exit(1)
  }
}

main().catch((err) => {
  console.error('[W4-help] Unexpected failure:', err)
  process.exit(1)
})
