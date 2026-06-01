/**
 * PT-D-2-T6-2 — Decisions help-content seed.
 *
 * Authors the Sanity `helpContent` documents for the Designer-Portal Decisions
 * dashboard surfaces declared in
 * `packages/help-system/src/surfaceKeys.ts` → SurfaceKeys.DesignerPortal.Decisions.
 *
 * Until these docs exist the dashboard renders only the inline `fallback`
 * strings hard-coded in `apps/designer-portal/.../portal/decisions/page.tsx`.
 * This script promotes that copy (refined) into the CMS so it can be edited
 * without a deploy and so the persona-fallback chain has a base to resolve to.
 *
 * Surfaces covered (9):
 *   - 1× fieldHelper  → ListIntro (rendered by <SectionIntro>)
 *   - 4× tooltip      → Metric.* (rendered by <StrataInfoIcon>)
 *   - 4× emptyState   → Empty.*  (rendered by <EmptyState>)
 *
 * Persona: all docs are authored as persona='all'. The dashboard components
 * fetch with the default persona ('all'), so step-1 of the 4-step fallback
 * chain (exact surfaceKey + contentType + 'all') resolves directly. A future
 * designer-specific voice pass can layer persona='designer' docs on top.
 *
 * Idempotent: every doc uses a deterministic `_id` (`helpContent.<slug>`), so
 * re-running with --commit `createOrReplace`s rather than duplicating.
 *
 * Prerequisites
 * -------------
 *   1. The helpContent schema is already deployed (it predates this seed).
 *   2. Write access to project `kv3qrinl` dataset `production` — either a
 *      `--with-user-token` CLI session or `SANITY_AUTH_TOKEN` for the .mjs
 *      runner counterpart (`run-decisions-help-seed.mjs`).
 *
 * Usage
 * -----
 *   # Inside studios/help-system
 *   npx sanity@latest exec --with-user-token scripts/seed-decisions-help.ts          # dry run
 *   npx sanity@latest exec --with-user-token scripts/seed-decisions-help.ts --commit # write
 */

import { getCliClient } from 'sanity/cli'
import { DECISIONS_HELP_DOCS } from './decisions-help-content'

const commit = process.argv.includes('--commit')

async function main() {
  const client = getCliClient()

  console.log(
    `[T6-2] ${commit ? 'COMMIT' : 'DRY RUN'} — seeding ${DECISIONS_HELP_DOCS.length} decisions help docs…\n`,
  )

  let written = 0
  let errored = 0

  for (const doc of DECISIONS_HELP_DOCS) {
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
    console.log('\n[T6-2] DRY RUN complete. Re-run with --commit to apply.')
  } else {
    console.log(`\n[T6-2] Done. ${written} written, ${errored} errored.`)
    if (errored > 0) process.exit(1)
  }
}

main().catch((err) => {
  console.error('[T6-2] Unexpected failure:', err)
  process.exit(1)
})
