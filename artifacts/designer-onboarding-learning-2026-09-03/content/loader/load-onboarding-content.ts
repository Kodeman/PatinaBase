/**
 * Onboarding & Learning — content loader (typed, `sanity exec` entry).
 *
 * Modelled on `studios/help-system/scripts/seed-decisions-help.ts`, but where
 * that script hydrates from a pre-authored JSON file, this one reads the
 * approved markdown source directly — `wave-1/NN-<slug>.md` and
 * `glossary/<slug>.md` — so the markdown Kody approved in `APPROVALS.md` is
 * the exact source that gets seeded, with no separate JSON to drift out of
 * sync.
 *
 * Loads THREE sets:
 *   1. `wave-1/*.md`   → helpArticle docs, `_id = helpContent.onboarding.<slug>`
 *   2. `glossary/*.md` → helpArticle docs, shelf "Ideas & vocabulary",
 *      `_id = helpContent.glossary.<slug>`, surfaceKey defaults to
 *      `designer-portal/document/concept/<slug>` when the file's own front
 *      matter doesn't already carry one (every current glossary file does —
 *      `designer-portal/document/concept/glossary/<slug>` — so the default
 *      is a safety net, not the common path).
 *   3. The root `the-keys.md` — NEVER loaded. It is source-of-truth for
 *      `keys-reference.ts`'s `buildKeysReference()`, not a Sanity input
 *      (see its own header comment); `wave-1/20-the-keys.md` is the Help
 *      Center article that already covers the same ground and IS loaded as
 *      part of set 1. Loading the root file too would create a duplicate
 *      `helpContent` document for overlapping content, so it is skipped —
 *      the dry-run summary says so explicitly.
 *
 * Respects `APPROVALS.md`: only files whose checklist line is `- [x]` are
 * loaded; anything else (`- [ ]`, or a file with no line at all) is skipped
 * and reported in the summary rather than silently dropped or silently
 * loaded.
 *
 * Front matter per article (see any file in wave-1/ or glossary/ for
 * examples):
 *   title:       string                       — required
 *   surfaceKey:  string                        — required, matches the
 *                designer-portal registry's `help.surfaceKey` shape and the
 *                `helpContent` schema's validation regex
 *                (`/^[a-z0-9-]+(\/[a-z0-9-]+)+$/`):
 *                `designer-portal/document/<surface>` for a real surface,
 *                or `designer-portal/document/{guide,concept,how-to}/<slug>`
 *                for a CMS-only authoring namespace (see help-topics.ts).
 *   persona:     'designer' | 'teammate' | 'maker' | 'consumer' | 'admin' | 'all'
 *                (the schema's `persona` options list — see helpContent.ts)
 *   contentType: 'helpArticle' (this loader only ever writes helpArticle docs)
 *   shelf:       string — one of the 8 HELP_TOPICS labels; carried through
 *                for the deploy steward's own bookkeeping only. It is NOT a
 *                field on the `helpContent` schema (shelf placement is
 *                derived from `surfaceKey` at read time by `topicLabelFor()`
 *                in `apps/designer-portal/src/lib/help-system/help-topics.ts`)
 *                — this loader validates the front-matter value is one of
 *                the 8 known labels but does not write it to Sanity.
 *
 * Body: everything after the closing `---` is parsed into Portable Text
 * blocks — blank-line-separated paragraphs become `normal` blocks, a line
 * starting with `#`/`##` becomes an `h1`/`h2` block, and a run of lines
 * starting with `- ` becomes a bulleted list. This is intentionally a small
 * subset of Markdown — inline bold (`**text**`) is preserved as a single
 * strong-marked span per line; no tables, links, or nested lists.
 *
 * Usage (from any cwd, once copied into studios/help-system/scripts/):
 *   npx sanity@latest exec --with-user-token scripts/load-onboarding-content.ts           # dry run
 *   npx sanity@latest exec --with-user-token scripts/load-onboarding-content.ts --commit  # write (draft)
 *   npx sanity@latest exec --with-user-token scripts/load-onboarding-content.ts --commit --publish
 *     # --publish additionally sets `_id` without a `drafts.` prefix, i.e.
 *     # publishes immediately rather than leaving the doc as a draft.
 *   ... --content /path/to/content   # override the content dir (default:
 *     the `content/` directory resolved relative to this file, i.e.
 *     `join(__dirname, '..')` — so the script works from any cwd, and still
 *     works when both loader files are copied to a new home together, as
 *     long as they stay siblings of `wave-1/`, `glossary/`, and
 *     `APPROVALS.md`).
 *
 * Idempotent: each doc's `_id` is deterministic, so re-running
 * `createOrReplace`s rather than duplicating.
 */

import { getCliClient } from 'sanity/cli';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Default content dir: this file lives at content/loader/, so '..' from here
// is content/. Overridable with --content <dir> so the script works from any
// cwd, and from a copied location whose relative layout still puts wave-1/,
// glossary/, and APPROVALS.md as siblings under one content dir.
const DEFAULT_CONTENT_DIR = join(__dirname, '..');

const KNOWN_SHELVES = new Set([
  'Getting started',
  'The Desk & the Studio',
  'Your documents',
  'Rooms',
  'Ledgers & money',
  'Ideas & vocabulary',
  'How do I…',
  'For your clients',
]);

interface PortableTextBlock {
  _type: 'block';
  style: 'normal' | 'h1' | 'h2';
  listItem?: 'bullet';
  level?: number;
  children: { _type: 'span'; text: string; marks: string[] }[];
  markDefs: [];
}

export interface OnboardingSeedDoc {
  _id: string;
  _type: 'helpContent';
  surfaceKey: string;
  persona: string;
  contentType: 'helpArticle';
  helpArticleContent: {
    title: string;
    oneSentenceAnswer: string;
    body: PortableTextBlock[];
  };
}

export interface LoadResult {
  docs: OnboardingSeedDoc[];
  /** file → reason it was not loaded (not approved, no approvals line, etc). */
  skipped: { file: string; reason: string }[];
  /** informational notes for the summary (e.g. the root the-keys.md skip). */
  notes: string[];
}

interface FrontMatter {
  title: string;
  surfaceKey?: string;
  persona: string;
  contentType: string;
  shelf: string;
}

function stripQuotes(value: string): string {
  const v = value.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1);
  }
  return v;
}

function parseFrontMatter(raw: string): { frontMatter: FrontMatter; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    throw new Error('missing front matter (expected leading --- ... --- block)');
  }
  const [, fmBlock, body] = match;
  const fm: Record<string, string> = {};
  for (const line of fmBlock.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = stripQuotes(line.slice(idx + 1));
    fm[key] = value;
  }
  // surfaceKey is intentionally NOT in this required list — the glossary set
  // supplies a default when a file omits it (see loadSet's surfaceKeyFor).
  for (const required of ['title', 'persona', 'contentType', 'shelf']) {
    if (!fm[required]) throw new Error(`front matter missing required field "${required}"`);
  }
  return {
    frontMatter: fm as unknown as FrontMatter,
    body: body.trim(),
  };
}

function firstSentence(text: string): string {
  const cleaned = text.replace(/\*\*/g, '').trim();
  const match = cleaned.match(/^.*?[.!?](?:\s|$)/);
  return (match ? match[0] : cleaned).trim();
}

function inlineSpans(line: string): { _type: 'span'; text: string; marks: string[] }[] {
  // Small subset: a line wholly wrapped in **...** becomes one strong span;
  // otherwise the whole line is one plain span. No nested/partial bolding.
  const boldMatch = line.match(/^\*\*(.+)\*\*$/);
  if (boldMatch) {
    return [{ _type: 'span', text: boldMatch[1], marks: ['strong'] }];
  }
  return [{ _type: 'span', text: line, marks: [] }];
}

function markdownToBlocks(markdown: string): PortableTextBlock[] {
  const lines = markdown.split(/\r?\n/);
  const blocks: PortableTextBlock[] = [];
  let paragraph: string[] = [];
  let bulletRun: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    blocks.push({
      _type: 'block',
      style: 'normal',
      children: [{ _type: 'span', text: paragraph.join(' '), marks: [] }],
      markDefs: [],
    });
    paragraph = [];
  };

  const flushBullets = () => {
    for (const item of bulletRun) {
      blocks.push({
        _type: 'block',
        style: 'normal',
        listItem: 'bullet',
        level: 1,
        children: inlineSpans(item),
        markDefs: [],
      });
    }
    bulletRun = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === '') {
      flushParagraph();
      flushBullets();
      continue;
    }
    const heading = line.match(/^(#{1,2})\s+(.*)$/);
    if (heading) {
      flushParagraph();
      flushBullets();
      blocks.push({
        _type: 'block',
        style: heading[1].length === 1 ? 'h1' : 'h2',
        children: [{ _type: 'span', text: heading[2], marks: [] }],
        markDefs: [],
      });
      continue;
    }
    if (line.startsWith('- ')) {
      flushParagraph();
      bulletRun.push(line.slice(2));
      continue;
    }
    flushBullets();
    paragraph.push(line);
  }
  flushParagraph();
  flushBullets();
  return blocks;
}

function slugFromFilename(filename: string): string {
  return filename.replace(/\.md$/, '');
}

/** Parses APPROVALS.md's `- [x] content/<path> — ...` checklist lines into a
 *  path → approved map. A path with no line at all is treated as NOT
 *  approved (held) rather than silently loaded. */
function parseApprovals(approvalsPath: string): Map<string, boolean> {
  const map = new Map<string, boolean>();
  if (!existsSync(approvalsPath)) return map;
  const raw = readFileSync(approvalsPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^-\s*\[([ xX])\]\s+(content\/\S+)/);
    if (m) map.set(m[2], m[1].toLowerCase() === 'x');
  }
  return map;
}

interface SetSpec {
  name: string;
  dir: string;
  approvalsPrefix: string; // e.g. 'content/wave-1/' or 'content/glossary/'
  idFor: (slug: string) => string;
  surfaceKeyFor: (slug: string, frontMatter: FrontMatter) => string;
  shelfOverride?: string; // glossary set forces its shelf regardless of front matter
}

function loadSet(
  spec: SetSpec,
  approvals: Map<string, boolean>,
  publish: boolean,
  skipped: LoadResult['skipped'],
): OnboardingSeedDoc[] {
  if (!existsSync(spec.dir)) return [];
  const files = readdirSync(spec.dir)
    .filter((f) => f.endsWith('.md'))
    .sort();
  const docs: OnboardingSeedDoc[] = [];
  for (const file of files) {
    const approvalsKey = `${spec.approvalsPrefix}${file}`;
    const approved = approvals.get(approvalsKey);
    if (approved !== true) {
      skipped.push({
        file: approvalsKey,
        reason: approved === false ? 'held (APPROVALS.md marks it "- [ ]")' : 'no APPROVALS.md line found',
      });
      continue;
    }

    const raw = readFileSync(join(spec.dir, file), 'utf8');
    let frontMatter: FrontMatter;
    let body: string;
    try {
      ({ frontMatter, body } = parseFrontMatter(raw));
    } catch (err) {
      throw new Error(`${file}: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (frontMatter.contentType !== 'helpArticle') {
      throw new Error(`${file}: contentType must be "helpArticle", got "${frontMatter.contentType}"`);
    }
    const shelf = spec.shelfOverride ?? frontMatter.shelf;
    if (!KNOWN_SHELVES.has(shelf)) {
      throw new Error(`${file}: shelf "${shelf}" is not one of the 8 HELP_TOPICS labels`);
    }
    const slug = slugFromFilename(file);
    const idPrefix = publish ? '' : 'drafts.';
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
    });
  }
  return docs;
}

export function loadOnboardingContentDocs(contentDir: string = DEFAULT_CONTENT_DIR, publish = false): LoadResult {
  const approvals = parseApprovals(join(contentDir, 'APPROVALS.md'));
  const skipped: LoadResult['skipped'] = [];
  const notes: string[] = [];

  const wave1Docs = loadSet(
    {
      name: 'wave-1',
      dir: join(contentDir, 'wave-1'),
      approvalsPrefix: 'content/wave-1/',
      idFor: (slug) => `helpContent.onboarding.${slug}`,
      surfaceKeyFor: (_slug, fm) => fm.surfaceKey!,
    },
    approvals,
    publish,
    skipped,
  );

  const glossaryDocs = loadSet(
    {
      name: 'glossary',
      dir: join(contentDir, 'glossary'),
      approvalsPrefix: 'content/glossary/',
      idFor: (slug) => `helpContent.glossary.${slug}`,
      // Every current glossary file's own front matter already carries a
      // surfaceKey (designer-portal/document/concept/glossary/<slug>); this
      // default only fires if a future glossary file omits one.
      surfaceKeyFor: (slug, fm) => fm.surfaceKey ?? `designer-portal/document/concept/${slug}`,
      shelfOverride: 'Ideas & vocabulary',
    },
    approvals,
    publish,
    skipped,
  );

  // Set 3 (the-keys.md root file): deliberately never loaded. It exists as
  // the source doc for keys-reference.ts's buildKeysReference(), and
  // wave-1/20-the-keys.md already IS the Help Center article covering the
  // same ground (loaded above as part of set 1) — loading the root file too
  // would duplicate that content under a second helpContent document.
  const rootKeysPath = join(contentDir, 'the-keys.md');
  if (existsSync(rootKeysPath)) {
    notes.push(
      'content/the-keys.md — SKIPPED (not a loader input): wave-1/20-the-keys.md already covers this content as the Help Center article; the root file is keys-reference.ts\'s source doc, not a Sanity document.',
    );
  }

  return { docs: [...wave1Docs, ...glossaryDocs], skipped, notes };
}

function parseArgs(argv: string[]) {
  const commit = argv.includes('--commit');
  const publish = argv.includes('--publish');
  const contentFlagIdx = argv.indexOf('--content');
  const contentDir = contentFlagIdx !== -1 && argv[contentFlagIdx + 1] ? argv[contentFlagIdx + 1] : DEFAULT_CONTENT_DIR;
  return { commit, publish, contentDir };
}

const { commit, publish, contentDir: CONTENT_DIR } = parseArgs(process.argv.slice(2));

async function main() {
  const { docs, skipped, notes } = loadOnboardingContentDocs(CONTENT_DIR, publish);
  console.log(
    `[onboarding-content] ${commit ? 'COMMIT' : 'DRY RUN'}${publish ? ' (publish)' : ' (draft)'} — ${docs.length} docs from ${CONTENT_DIR}\n`,
  );

  let written = 0;
  let errored = 0;

  if (commit) {
    const client = getCliClient();
    for (const doc of docs) {
      try {
        await client.createOrReplace(doc);
        console.log(`  ✓ ${doc.surfaceKey}  (${doc._id})`);
        written += 1;
      } catch (err) {
        console.log(`  ✗ ${doc.surfaceKey} — ${err instanceof Error ? err.message : String(err)}`);
        errored += 1;
      }
    }
  } else {
    for (const doc of docs) {
      console.log(`  · would-write ${doc.surfaceKey}  (${doc._id})`);
      written += 1;
    }
  }

  if (skipped.length > 0) {
    console.log(`\n[onboarding-content] skipped/held (${skipped.length}):`);
    for (const s of skipped) {
      console.log(`  - ${s.file} — ${s.reason}`);
    }
  }
  if (notes.length > 0) {
    console.log(`\n[onboarding-content] notes:`);
    for (const n of notes) {
      console.log(`  - ${n}`);
    }
  }

  if (!commit) {
    console.log('\n[onboarding-content] DRY RUN complete. Re-run with --commit to apply.');
  } else {
    console.log(`\n[onboarding-content] Done. ${written} written, ${errored} errored.`);
    if (errored > 0) process.exit(1);
  }
}

// Only auto-run under `sanity exec` (this module is also imported for its
// `loadOnboardingContentDocs` export by tests / the .mjs sibling's parity
// check, if one is ever written).
if (process.argv[1] && process.argv[1].includes('load-onboarding-content')) {
  main().catch((err) => {
    console.error('[onboarding-content] Unexpected failure:', err);
    process.exit(1);
  });
}
