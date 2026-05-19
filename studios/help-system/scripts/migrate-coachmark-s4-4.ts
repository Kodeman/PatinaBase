/**
 * Sprint 4 Task S4-4 — coachmark schema migration script.
 *
 * Migrates the 8 existing `contentType == "coachmark"` documents from the
 * legacy shared `tooltipContent` block (eyebrow + body) to the dedicated
 * `coachmarkContent` block (heading + body + optional ctaLabel) added in
 * S4-4.
 *
 * Prerequisites
 * -------------
 *   1. The new schema must be deployed first:
 *
 *        cd studios/help-system
 *        npx sanity@latest schema deploy
 *
 *   2. The runner must have write access to project `kv3qrinl` dataset
 *      `production` (Kody's CLI session or a token in `SANITY_AUTH_TOKEN`).
 *
 * Usage
 * -----
 *   # Inside studios/help-system
 *   npx sanity@latest exec --with-user-token scripts/migrate-coachmark-s4-4.ts
 *
 * Pass `--commit` to actually run the mutations; default is dry run.
 *
 * What it does
 * ------------
 *   For each of the 8 docs listed below:
 *     - Sets `coachmarkContent.heading` ← `tooltipContent.eyebrow`
 *     - Sets `coachmarkContent.body`    ← `tooltipContent.body`
 *     - Leaves `tooltipContent` in place for the transition window so the
 *       iOS Codable fallback path remains valid until all clients ship.
 *
 *   The 8 docs (5 D5 designer-portal + 3 G9 iOS) are looked up by
 *   `surfaceKey` rather than by `_id`, so re-running the script after a
 *   doc has been republished still works.
 *
 *   `ctaLabel` is intentionally not authored here — pilot-time addition.
 */

import { getCliClient } from 'sanity/cli'

interface CoachmarkDoc {
  _id: string
  _rev: string
  surfaceKey: string
  tooltipContent?: {
    eyebrow?: string
    body?: string
  }
  coachmarkContent?: {
    heading?: string
    body?: string
    ctaLabel?: string
  }
}

const SURFACE_KEYS = [
  // D5 designer-portal tour (5)
  'designer-portal/tours/first-project-walkthrough/step-1-today',
  'designer-portal/tours/first-project-walkthrough/step-2-pipeline',
  'designer-portal/tours/first-project-walkthrough/step-3-aesthete',
  'designer-portal/tours/first-project-walkthrough/step-4-products-capture',
  'designer-portal/tours/first-project-walkthrough/step-5-profile',
  // G9 iOS first-launch tour (3)
  'ios-app/first-launch-tour/step-1-home',
  'ios-app/first-launch-tour/step-2-saved',
  'ios-app/first-launch-tour/step-3-profile',
] as const

const commit = process.argv.includes('--commit')

async function main() {
  const client = getCliClient()

  console.log(`[S4-4] ${commit ? 'COMMIT' : 'DRY RUN'} — migrating ${SURFACE_KEYS.length} coachmark docs…\n`)

  const docs = await client.fetch<CoachmarkDoc[]>(
    `*[_type == "helpContent" && contentType == "coachmark" && surfaceKey in $keys]{
      _id, _rev, surfaceKey, tooltipContent, coachmarkContent
    }`,
    { keys: SURFACE_KEYS },
  )

  if (docs.length === 0) {
    console.error('[S4-4] No coachmark docs matched the expected surfaceKeys. Aborting.')
    process.exit(1)
  }

  const summary: Array<{ surfaceKey: string; status: string; note?: string }> = []

  for (const doc of docs) {
    const eyebrow = doc.tooltipContent?.eyebrow
    const body = doc.tooltipContent?.body
    const alreadyMigrated =
      typeof doc.coachmarkContent?.heading === 'string' &&
      doc.coachmarkContent.heading.length > 0 &&
      typeof doc.coachmarkContent?.body === 'string' &&
      doc.coachmarkContent.body.length > 0

    if (alreadyMigrated) {
      summary.push({ surfaceKey: doc.surfaceKey, status: 'skip', note: 'already migrated' })
      continue
    }
    if (!eyebrow || !body) {
      summary.push({
        surfaceKey: doc.surfaceKey,
        status: 'error',
        note: `tooltipContent missing eyebrow=${eyebrow ?? '∅'} body=${body ?? '∅'}`,
      })
      continue
    }

    const next = {
      heading: eyebrow,
      body,
    }

    if (commit) {
      try {
        await client
          .patch(doc._id)
          .set({ coachmarkContent: next })
          .commit({ visibility: 'async' })
        summary.push({ surfaceKey: doc.surfaceKey, status: 'patched' })
      } catch (err) {
        summary.push({
          surfaceKey: doc.surfaceKey,
          status: 'error',
          note: err instanceof Error ? err.message : String(err),
        })
      }
    } else {
      summary.push({
        surfaceKey: doc.surfaceKey,
        status: 'would-patch',
        note: `heading="${next.heading}" body="${next.body.slice(0, 60)}…"`,
      })
    }
  }

  console.log('\n[S4-4] Results:')
  for (const row of summary) {
    const marker = row.status === 'error' ? '✗' : row.status === 'skip' ? '·' : '✓'
    console.log(`  ${marker} ${row.status.padEnd(12)} ${row.surfaceKey}${row.note ? ` — ${row.note}` : ''}`)
  }

  if (!commit) {
    console.log('\n[S4-4] DRY RUN complete. Re-run with --commit to apply.')
  } else {
    const errored = summary.filter((r) => r.status === 'error').length
    console.log(`\n[S4-4] Done. ${summary.length - errored} patched, ${errored} errored.`)
    if (errored > 0) process.exit(1)
  }
}

main().catch((err) => {
  console.error('[S4-4] Unexpected failure:', err)
  process.exit(1)
})
