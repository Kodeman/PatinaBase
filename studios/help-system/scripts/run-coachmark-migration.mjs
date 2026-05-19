// One-off migration runner — Sprint 4 S4-4 deploy
// Direct @sanity/client invocation, bypasses the sanity/cli getCliClient import which is unstable on @latest.
//
// Usage:
//   SANITY_AUTH_TOKEN=<token> node studios/help-system/scripts/run-coachmark-migration.mjs --commit
//
// Reuses migration logic from migrate-coachmark-s4-4.ts.

import { createClient } from '@sanity/client'

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
]

const commit = process.argv.includes('--commit')
const token = process.env.SANITY_AUTH_TOKEN
if (!token) {
  console.error('SANITY_AUTH_TOKEN missing')
  process.exit(2)
}

const client = createClient({
  projectId: 'kv3qrinl',
  dataset: 'production',
  apiVersion: '2024-01-01',
  token,
  useCdn: false,
})

async function main() {
  console.log(`[S4-4] ${commit ? 'COMMIT' : 'DRY RUN'} — migrating ${SURFACE_KEYS.length} coachmark docs…\n`)

  const docs = await client.fetch(
    `*[_type == "helpContent" && contentType == "coachmark" && surfaceKey in $keys]{
      _id, _rev, surfaceKey, tooltipContent, coachmarkContent
    }`,
    { keys: SURFACE_KEYS },
  )

  if (docs.length === 0) {
    console.error('No coachmark docs matched the expected surfaceKeys.')
    process.exit(1)
  }

  let migrated = 0
  let skipped = 0
  let errored = 0

  for (const doc of docs) {
    const eyebrow = doc.tooltipContent?.eyebrow
    const body = doc.tooltipContent?.body
    const heading = doc.coachmarkContent?.heading
    const existingBody = doc.coachmarkContent?.body
    const alreadyMigrated = heading && existingBody

    if (alreadyMigrated) {
      console.log(`  ⏭️  ${doc.surfaceKey} — already migrated, skip`)
      skipped++
      continue
    }

    if (!eyebrow || !body) {
      console.log(`  ❌ ${doc.surfaceKey} — missing tooltipContent.eyebrow or body (id=${doc._id})`)
      errored++
      continue
    }

    const patch = {
      coachmarkContent: {
        heading: eyebrow,
        body,
      },
    }

    if (commit) {
      try {
        await client.patch(doc._id).set(patch).commit()
        console.log(`  ✅ ${doc.surfaceKey} — patched (id=${doc._id})`)
        migrated++
      } catch (err) {
        console.log(`  ❌ ${doc.surfaceKey} — patch failed: ${err.message}`)
        errored++
      }
    } else {
      console.log(`  📝 ${doc.surfaceKey} — would patch (id=${doc._id}) heading=${JSON.stringify(eyebrow)} body[${body.length}ch]`)
      migrated++
    }
  }

  console.log(`\n[S4-4] ${commit ? 'committed' : 'dry-run'}: ${migrated} migrated, ${skipped} skipped, ${errored} errored`)
  if (errored > 0) process.exit(1)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
