// Coachmark CTA-label maintenance script — direct @sanity/client entry.
//
// One-off/repeatable patch tool: given a tour + step, finds the Sanity
// `helpContent` document(s) (contentType == 'coachmark') for that step's
// surfaceKey and patches `coachmarkContent.ctaLabel` on the published
// document AND any draft, so an editor never has to hand-write the GROQ
// query or hunt the studio for the right doc.
//
// This is a maintenance sibling of load-onboarding-content.ts /
// run-onboarding-content-load.mjs — NOT part of the onboarding-content
// loader itself (out of scope per the loader's own remit: onboarding-content
// only ever writes helpArticle docs). Coachmark docs are authored/patched
// separately because their _id scheme is not the deterministic
// helpContent.onboarding.* / helpContent.glossary.* one those loaders use —
// see migrate-coachmark-s4-4.ts / run-coachmark-migration.mjs for the
// precedent of looking coachmark docs up by surfaceKey instead of by _id.
//
// Surface keys for the Desk Walkthrough's six steps live in
// packages/help-system/src/surfaceKeys.ts under
// SurfaceKeys.DesignerPortal.Tours.DeskWalkthrough — step 6's is
// 'designer-portal/tours/desk-walkthrough/step-6-begin' (see
// apps/designer-portal/src/components/document/help/desk-walkthrough.tsx,
// where STEPS[5].surfaceKey = TOUR.Step6Begin). ctaLabel itself lives at
// coachmarkContent.ctaLabel on the helpContent doc — see
// studios/help-system/schemas/helpContent.ts's `coachmarkContent` field and
// studios/help-system/schemas/coachmarkContent.ts (the field's shape,
// capped at 20 chars per spec §8). When no published/draft doc is
// published yet, the component's own `fallbackCtaLabel` is what renders —
// this script only ever touches CMS content, never the fallback constants
// in desk-walkthrough.tsx.
//
// Usage:
//   node set-coachmark-cta.mjs --tour desk-walkthrough --step 6 --label "Capture a lead"                  # dry run
//   node set-coachmark-cta.mjs --tour desk-walkthrough --step 6 --label "Capture a lead" --print-query     # dry run, print the GROQ query only, no token/network needed
//   SANITY_AUTH_TOKEN=<token> node set-coachmark-cta.mjs --tour desk-walkthrough --step 6 --label "Capture a lead" --commit   # write

import { fileURLToPath } from 'node:url'

// The only tour currently defined in packages/help-system/surfaceKeys.ts
// under a `stepN-<slug>` naming scheme this script can generate from a
// --step number. Add an entry here (and the slug list) before pointing this
// script at another tour.
const TOUR_STEP_SLUGS = {
  'desk-walkthrough': [
    'step-1-the-desk',
    'step-2-the-folder',
    'step-3-the-studio',
    'step-4-the-drawer',
    'step-5-find-anything',
    'step-6-begin',
  ],
}

function parseArgs(argv) {
  const args = { commit: false, printQuery: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--tour') args.tour = argv[++i]
    else if (a === '--step') args.step = Number(argv[++i])
    else if (a === '--label') args.label = argv[++i]
    else if (a === '--commit') args.commit = true
    else if (a === '--print-query') args.printQuery = true
  }
  return args
}

function surfaceKeyFor(tour, step) {
  const slugs = TOUR_STEP_SLUGS[tour]
  if (!slugs) {
    throw new Error(
      `unknown --tour "${tour}" — known tours: ${Object.keys(TOUR_STEP_SLUGS).join(', ')}`,
    )
  }
  const slug = slugs[step - 1]
  if (!slug) {
    throw new Error(`--step ${step} out of range for tour "${tour}" (1..${slugs.length})`)
  }
  return `designer-portal/tours/${tour}/${slug}`
}

const QUERY = `*[_type == "helpContent" && contentType == "coachmark" && surfaceKey == $surfaceKey]{
  _id, _rev, persona, "ctaLabel": coachmarkContent.ctaLabel
}`

async function main() {
  const args = parseArgs(process.argv.slice(2))

  if (!args.tour || !args.step || !args.label) {
    console.error('Usage: set-coachmark-cta.mjs --tour <tour> --step <N> --label "<label>" [--commit] [--print-query]')
    process.exit(2)
  }
  if (args.label.length > 20) {
    console.error(
      `--label "${args.label}" is ${args.label.length} chars — coachmarkContent.ctaLabel is capped at 20 (spec §8, advisory warning in the schema, enforced here since this is an unattended patch).`,
    )
    process.exit(2)
  }

  const surfaceKey = surfaceKeyFor(args.tour, args.step)

  console.log(`[coachmark-cta] tour="${args.tour}" step=${args.step} → surfaceKey="${surfaceKey}"`)
  console.log(`[coachmark-cta] GROQ query:\n${QUERY}\n[coachmark-cta] $surfaceKey = "${surfaceKey}"`)

  if (args.printQuery) {
    // --print-query is a pure, offline, tokenless mode: print the query and
    // exit before touching the network or requiring SANITY_AUTH_TOKEN, so a
    // reviewer can confirm exactly what will run without any Sanity access.
    console.log('\n[coachmark-cta] --print-query: stopping before any network call (no token required).')
    return
  }

  const token = process.env.SANITY_AUTH_TOKEN
  if (!token) {
    console.error('\nSANITY_AUTH_TOKEN missing — set it before running (read-only query still needs a token; use --print-query to inspect the query without one).')
    process.exit(2)
  }

  const { createClient } = await import('@sanity/client')
  const client = createClient({
    projectId: 'kv3qrinl',
    dataset: 'production',
    apiVersion: '2024-01-01',
    token,
    useCdn: false,
  })

  const docs = await client.fetch(QUERY, { surfaceKey })

  if (docs.length === 0) {
    console.error(`\n[coachmark-cta] No coachmark doc found for surfaceKey "${surfaceKey}" (published or draft).`)
    process.exit(1)
  }

  console.log(`\n[coachmark-cta] ${args.commit ? 'COMMIT' : 'DRY RUN'} — ${docs.length} doc(s) matched:`)

  let written = 0
  let errored = 0

  for (const doc of docs) {
    const kind = doc._id.startsWith('drafts.') ? 'draft' : 'published'
    if (args.commit) {
      try {
        await client.patch(doc._id).set({ 'coachmarkContent.ctaLabel': args.label }).commit()
        console.log(`  ✅ ${kind.padEnd(9)} ${doc._id}  ctaLabel: "${doc.ctaLabel ?? ''}" → "${args.label}"`)
        written++
      } catch (err) {
        console.log(`  ❌ ${kind.padEnd(9)} ${doc._id} — ${err.message}`)
        errored++
      }
    } else {
      console.log(`  📝 ${kind.padEnd(9)} ${doc._id}  ctaLabel: "${doc.ctaLabel ?? ''}" → "${args.label}"`)
      written++
    }
  }

  console.log(`\n[coachmark-cta] ${args.commit ? 'committed' : 'dry-run'}: ${written} written, ${errored} errored`)
  if (errored > 0) process.exit(1)
}

// Only auto-run when executed directly (also importable for tests).
if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
