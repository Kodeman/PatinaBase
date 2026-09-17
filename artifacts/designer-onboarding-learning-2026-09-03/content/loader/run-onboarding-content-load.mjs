// Onboarding & Learning — content loader (direct @sanity/client entry).
//
// Modelled on studios/help-system/scripts/run-decisions-help-seed.mjs: direct
// @sanity/client invocation, bypassing the sanity/cli getCliClient import
// that run-decisions-help-seed.mjs's own comment notes is unstable on
// @latest. Where that script reads pre-authored JSON, this one reads the
// approved markdown source directly (wave-1/NN-<slug>.md and
// glossary/<slug>.md) and parses front matter + a small Markdown subset
// itself, so the two loader entry points (this file and the sibling
// load-onboarding-content.ts, for `sanity exec`) both read the exact same
// source files with no JSON intermediate to drift.
//
// Loads THREE sets — see load-onboarding-content.ts's header comment for the
// full rationale, kept in sync here:
//   1. wave-1/*.md   → helpArticle, _id = helpContent.onboarding.<slug>
//   2. glossary/*.md → helpArticle, shelf "Ideas & vocabulary",
//      _id = helpContent.glossary.<slug>, surfaceKey from front matter
//      (falls back to designer-portal/document/concept/<slug> if a file
//      ever omits one — every current glossary file already carries one)
//   3. the root the-keys.md — NEVER loaded (wave-1/20-the-keys.md already
//      covers it as the Help Center article; the root file is
//      keys-reference.ts's source doc, not a Sanity input). Reported as a
//      note in the summary, not silently dropped.
//
// Respects APPROVALS.md: only files whose checklist line is `- [x]` are
// loaded; anything else is skipped and reported in the summary.
//
// Usage:
//   node run-onboarding-content-load.mjs                                       # dry run
//   SANITY_AUTH_TOKEN=<token> node run-onboarding-content-load.mjs --commit               # write (draft)
//   SANITY_AUTH_TOKEN=<token> node run-onboarding-content-load.mjs --commit --publish      # write (published)
//   node run-onboarding-content-load.mjs --content /path/to/content            # override content dir
//     (default: the content/ directory resolved relative to this file, i.e.
//     join(__dirname, '..') — works from any cwd, and from a copied location
//     as long as wave-1/, glossary/, and APPROVALS.md stay siblings of it.)

import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const DEFAULT_CONTENT_DIR = join(__dirname, '..')

const KNOWN_SHELVES = new Set([
  'Getting started',
  'The Desk & the Studio',
  'Your documents',
  'Rooms',
  'Ledgers & money',
  'Ideas & vocabulary',
  'How do I…',
  'For your clients',
])

function parseArgs(argv) {
  const commit = argv.includes('--commit')
  const publish = argv.includes('--publish')
  const contentFlagIdx = argv.indexOf('--content')
  const contentDir =
    contentFlagIdx !== -1 && argv[contentFlagIdx + 1] ? argv[contentFlagIdx + 1] : DEFAULT_CONTENT_DIR
  return { commit, publish, contentDir }
}

const { commit, publish, contentDir: CONTENT_DIR } = parseArgs(process.argv.slice(2))

function stripQuotes(value) {
  const v = value.trim()
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1)
  }
  return v
}

function parseFrontMatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)
  if (!match) {
    throw new Error('missing front matter (expected leading --- ... --- block)')
  }
  const [, fmBlock, body] = match
  const fm = {}
  for (const line of fmBlock.split(/\r?\n/)) {
    if (!line.trim()) continue
    const idx = line.indexOf(':')
    if (idx === -1) continue
    const key = line.slice(0, idx).trim()
    const value = stripQuotes(line.slice(idx + 1))
    fm[key] = value
  }
  // surfaceKey is intentionally NOT required here — the glossary set
  // supplies a default when a file omits it.
  for (const required of ['title', 'persona', 'contentType', 'shelf']) {
    if (!fm[required]) throw new Error(`front matter missing required field "${required}"`)
  }
  return { frontMatter: fm, body: body.trim() }
}

function firstSentence(text) {
  const cleaned = text.replace(/\*\*/g, '').trim()
  const match = cleaned.match(/^.*?[.!?](?:\s|$)/)
  return (match ? match[0] : cleaned).trim()
}

function inlineSpans(line) {
  const boldMatch = line.match(/^\*\*(.+)\*\*$/)
  if (boldMatch) {
    return [{ _type: 'span', text: boldMatch[1], marks: ['strong'] }]
  }
  return [{ _type: 'span', text: line, marks: [] }]
}

function markdownToBlocks(markdown) {
  const lines = markdown.split(/\r?\n/)
  const blocks = []
  let paragraph = []
  let bulletRun = []

  const flushParagraph = () => {
    if (paragraph.length === 0) return
    blocks.push({
      _type: 'block',
      style: 'normal',
      children: [{ _type: 'span', text: paragraph.join(' '), marks: [] }],
      markDefs: [],
    })
    paragraph = []
  }

  const flushBullets = () => {
    for (const item of bulletRun) {
      blocks.push({
        _type: 'block',
        style: 'normal',
        listItem: 'bullet',
        level: 1,
        children: inlineSpans(item),
        markDefs: [],
      })
    }
    bulletRun = []
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (line === '') {
      flushParagraph()
      flushBullets()
      continue
    }
    const heading = line.match(/^(#{1,2})\s+(.*)$/)
    if (heading) {
      flushParagraph()
      flushBullets()
      blocks.push({
        _type: 'block',
        style: heading[1].length === 1 ? 'h1' : 'h2',
        children: [{ _type: 'span', text: heading[2], marks: [] }],
        markDefs: [],
      })
      continue
    }
    if (line.startsWith('- ')) {
      flushParagraph()
      bulletRun.push(line.slice(2))
      continue
    }
    flushBullets()
    paragraph.push(line)
  }
  flushParagraph()
  flushBullets()
  return blocks
}

function parseApprovals(approvalsPath) {
  const map = new Map()
  if (!existsSync(approvalsPath)) return map
  const raw = readFileSync(approvalsPath, 'utf8')
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^-\s*\[([ xX])\]\s+(content\/\S+)/)
    if (m) map.set(m[2], m[1].toLowerCase() === 'x')
  }
  return map
}

function loadSet(spec, approvals, publish, skipped) {
  if (!existsSync(spec.dir)) return []
  const files = readdirSync(spec.dir)
    .filter((f) => f.endsWith('.md'))
    .sort()
  const docs = []
  for (const file of files) {
    const approvalsKey = `${spec.approvalsPrefix}${file}`
    const approved = approvals.get(approvalsKey)
    if (approved !== true) {
      skipped.push({
        file: approvalsKey,
        reason: approved === false ? 'held (APPROVALS.md marks it "- [ ]")' : 'no APPROVALS.md line found',
      })
      continue
    }

    const raw = readFileSync(join(spec.dir, file), 'utf8')
    let frontMatter, body
    try {
      ;({ frontMatter, body } = parseFrontMatter(raw))
    } catch (err) {
      throw new Error(`${file}: ${err.message}`)
    }
    if (frontMatter.contentType !== 'helpArticle') {
      throw new Error(`${file}: contentType must be "helpArticle", got "${frontMatter.contentType}"`)
    }
    const shelf = spec.shelfOverride ?? frontMatter.shelf
    if (!KNOWN_SHELVES.has(shelf)) {
      throw new Error(`${file}: shelf "${shelf}" is not one of the 8 HELP_TOPICS labels`)
    }
    const slug = file.replace(/\.md$/, '')
    const idPrefix = publish ? '' : 'drafts.'
    docs.push({
      _id: `${idPrefix}${spec.idFor(slug)}`,
      _type: 'helpContent',
      surfaceKey: spec.surfaceKeyFor(slug, frontMatter),
      persona: frontMatter.persona,
      contentType: 'helpArticle',
      helpArticleContent: {
        title: frontMatter.title,
        oneSentenceAnswer: firstSentence(body),
        body: markdownToBlocks(body),
      },
    })
  }
  return docs
}

function loadDocs(contentDir, publish) {
  const approvals = parseApprovals(join(contentDir, 'APPROVALS.md'))
  const skipped = []
  const notes = []

  const wave1Docs = loadSet(
    {
      dir: join(contentDir, 'wave-1'),
      approvalsPrefix: 'content/wave-1/',
      idFor: (slug) => `helpContent.onboarding.${slug}`,
      surfaceKeyFor: (_slug, fm) => fm.surfaceKey,
    },
    approvals,
    publish,
    skipped,
  )

  const glossaryDocs = loadSet(
    {
      dir: join(contentDir, 'glossary'),
      approvalsPrefix: 'content/glossary/',
      idFor: (slug) => `helpContent.glossary.${slug}`,
      surfaceKeyFor: (slug, fm) => fm.surfaceKey ?? `designer-portal/document/concept/${slug}`,
      shelfOverride: 'Ideas & vocabulary',
    },
    approvals,
    publish,
    skipped,
  )

  const rootKeysPath = join(contentDir, 'the-keys.md')
  if (existsSync(rootKeysPath)) {
    notes.push(
      'content/the-keys.md — SKIPPED (not a loader input): wave-1/20-the-keys.md already covers this content as the Help Center article; the root file is keys-reference.ts\'s source doc, not a Sanity document.',
    )
  }

  return { docs: [...wave1Docs, ...glossaryDocs], skipped, notes }
}

async function main() {
  const { docs, skipped, notes } = loadDocs(CONTENT_DIR, publish)
  console.log(
    `[onboarding-content] ${commit ? 'COMMIT' : 'DRY RUN'}${publish ? ' (publish)' : ' (draft)'} — ${docs.length} docs from ${CONTENT_DIR}\n`,
  )

  let client = null
  if (commit) {
    const token = process.env.SANITY_AUTH_TOKEN
    if (!token) {
      console.error('SANITY_AUTH_TOKEN missing — set it before running with --commit.')
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

  for (const doc of docs) {
    if (commit) {
      try {
        await client.createOrReplace(doc)
        console.log(`  ✅ ${doc.surfaceKey}  (${doc._id})`)
        written++
      } catch (err) {
        console.log(`  ❌ ${doc.surfaceKey} — ${err.message}`)
        errored++
      }
    } else {
      console.log(`  📝 ${doc.surfaceKey}  (${doc._id})`)
      written++
    }
  }

  if (skipped.length > 0) {
    console.log(`\n[onboarding-content] skipped/held (${skipped.length}):`)
    for (const s of skipped) {
      console.log(`  - ${s.file} — ${s.reason}`)
    }
  }
  if (notes.length > 0) {
    console.log(`\n[onboarding-content] notes:`)
    for (const n of notes) {
      console.log(`  - ${n}`)
    }
  }

  console.log(`\n[onboarding-content] ${commit ? 'committed' : 'dry-run'}: ${written} written, ${errored} errored`)
  if (errored > 0) process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
