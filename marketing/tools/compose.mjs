#!/usr/bin/env node
/**
 * compose.mjs <runDir> [--piece P]
 *
 * Fills marketing/templates/<kind>.html from copy/<P>.final.md into compose/<P>/index.html
 * for social, pin, poster, one-pager and email. pr-pitch becomes compose/<P>/pitch.md (plain
 * text, claim markers stripped). Deck and video are composed by agents from
 * marketing/templates/deck/ and marketing/templates/video/, so this tool skips them.
 *
 * Image choice per piece: mj/picks.json {J01:"<abs path>"}, else the first file for the job in
 * mj/assets.json, else a neutral IMAGE PENDING block. The image is copied into compose/<P>/.
 * Email is a letter first: it carries one image, under the first paragraph, only when its
 * frontmatter names `visual: Jnn`.
 *
 * Eyebrow: the piece's own frontmatter `eyebrow`, else the run's place line (plan.json `place`,
 * plan.json `concept.place`, or brief.md frontmatter `place`), else nothing. Never the concept
 * name: that appears only where a piece's copy puts it.
 *
 * Prints one line per piece: "<id> (<kind>): ok <file>", "image-missing <file> (<reason>)",
 * "skipped; ..." or "failed (<reason>)". image-missing and failed pieces get a ledger entry
 * (step compose). Exits 1 after the last piece when any piece failed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import YAML from 'yaml';
import { REPO_ROOT, CHANNELS, runPaths, readPlan, readFinal, appendLedger } from './lib/run.mjs';

export const TEMPLATES_DIR = path.join(REPO_ROOT, 'marketing', 'templates');
const WORDMARK_FILE = path.join(REPO_ROOT, 'marketing', 'canon', 'wordmark.svg');
const TEMPLATE_KINDS = ['social', 'pin', 'poster', 'one-pager', 'email'];

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * `{{key}}` is HTML-escaped, `{{{key}}}` is inserted raw. Keys the caller does not supply stay
 * in place, so a sender's merge tags (e.g. `{{unsub_url}}` in email.html) survive.
 */
export function fill(template, vars) {
  const has = (key) => Object.prototype.hasOwnProperty.call(vars, key);
  // One pass, so a value that happens to contain `{{x}}` is never substituted again.
  return template.replace(/\{\{\{\s*([\w-]+)\s*\}\}\}|\{\{\s*([\w-]+)\s*\}\}/g, (m, raw, escaped) => {
    if (raw !== undefined) return has(raw) ? String(vars[raw] ?? '') : m;
    return has(escaped) ? escapeHtml(vars[escaped]) : m;
  });
}

/** Remove `[C01]` claim markers (and the space before them) from a string or nested value. */
export function stripClaims(value) {
  if (typeof value === 'string') {
    return value.replace(/[ \t]*\[C\d{2,}\]/g, '');
  }
  if (Array.isArray(value)) return value.map(stripClaims);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, stripClaims(v)]));
  }
  return value;
}

function inlineMarkdown(text) {
  return escapeHtml(text)
    .replace(/\[([^\]]+)\]\(((?:https?:|mailto:)[^)\s]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
}

/**
 * A deliberately small markdown subset: paragraphs, `#` headings, `- ` lists, bold, italic and
 * http(s)/mailto links. Returns an array of HTML blocks. `styles` maps tag name to an inline
 * style string, for email.
 */
export function markdownBlocks(markdown, styles = {}) {
  const attr = (tag) => (styles[tag] ? ` style="${styles[tag]}"` : '');
  const blocks = [];
  for (const chunk of String(markdown || '').trim().split(/\n\s*\n/)) {
    const lines = chunk.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lines.length) continue;
    const heading = /^(#{1,3})\s+(.*)$/.exec(lines[0]);
    if (heading && lines.length === 1) {
      const tag = `h${heading[1].length + 1}`;
      blocks.push(`<${tag}${attr(tag)}>${inlineMarkdown(heading[2])}</${tag}>`);
    } else if (lines.every((l) => /^[-*]\s+/.test(l))) {
      const items = lines.map((l) => `<li${attr('li')}>${inlineMarkdown(l.replace(/^[-*]\s+/, ''))}</li>`);
      blocks.push(`<ul${attr('ul')}>${items.join('')}</ul>`);
    } else {
      blocks.push(`<p${attr('p')}>${inlineMarkdown(lines.join(' '))}</p>`);
    }
  }
  return blocks;
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

/** The job whose image a piece leads with: the poster's `visual`, else the piece's first visual. */
export function leadJob(piece, data) {
  if (typeof data?.visual === 'string' && /^J\d{2}$/.test(data.visual)) return data.visual;
  return Array.isArray(piece.visuals) && piece.visuals.length ? piece.visuals[0] : null;
}

/** Resolve the image file for a job: picks.json, else the first assets.json file, else null. */
export function pickImage(runDir, jobId) {
  if (!jobId) return null;
  const { mj } = runPaths(runDir);
  const picks = readJson(path.join(mj, 'picks.json'), {});
  const assets = readJson(path.join(mj, 'assets.json'), {});
  const candidates = [picks?.[jobId], assets?.[jobId]?.files?.[0]].filter((p) => typeof p === 'string' && p);
  for (const candidate of candidates) {
    const abs = path.isAbsolute(candidate) ? candidate : path.resolve(runDir, candidate);
    if (fs.existsSync(abs)) return abs;
  }
  return null;
}

/** The run's place line: plan.json `place` or `concept.place`, else brief.md frontmatter `place`. */
export function placeLine(runDir, plan) {
  const fromPlan = plan?.place ?? plan?.concept?.place;
  if (typeof fromPlan === 'string' && fromPlan.trim()) return stripClaims(fromPlan.trim());
  try {
    const brief = fs.readFileSync(runPaths(runDir).brief, 'utf8');
    const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(brief);
    const place = fm ? YAML.parse(fm[1])?.place : null;
    if (typeof place === 'string' && place.trim()) return stripClaims(place.trim());
  } catch {
    // No brief, or frontmatter that does not parse: no place line.
  }
  return '';
}

/** The email's one image: only a frontmatter `visual: Jnn` asks for it. */
function emailJob(data) {
  return typeof data?.visual === 'string' && /^J\d{2}$/.test(data.visual) ? data.visual : null;
}

function imageBlock(file, alt) {
  if (!file) {
    return '<div class="image image-pending" role="img" aria-label="Image pending"><span>IMAGE PENDING</span></div>';
  }
  return `<img class="image" src="${escapeHtml(file)}" alt="${escapeHtml(alt || '')}">`;
}

function wordmarkBlock() {
  if (fs.existsSync(WORDMARK_FILE)) {
    const svg = fs.readFileSync(WORDMARK_FILE).toString('base64');
    return `<img class="wordmark-logo" src="data:image/svg+xml;base64,${svg}" alt="Patina">`;
  }
  return '<span class="wordmark-type">Patina</span>';
}

function copyImage(src, destDir) {
  if (!src) return null;
  const name = `image${path.extname(src).toLowerCase() || '.png'}`;
  fs.copyFileSync(src, path.join(destDir, name));
  return name;
}

const EMAIL_STYLES = {
  p: "margin:0 0 16px; font-family:'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; font-size:16px; line-height:1.6; color:#4A453F;",
  h2: "margin:8px 0 12px; font-family:'Playfair Display', Georgia, 'Times New Roman', serif; font-size:22px; font-weight:400; line-height:1.3; color:#3F3B37;",
  h3: "margin:8px 0 10px; font-family:'Playfair Display', Georgia, 'Times New Roman', serif; font-size:19px; font-weight:400; line-height:1.3; color:#3F3B37;",
  h4: "margin:8px 0 8px; font-family:'Inter', Helvetica, Arial, sans-serif; font-size:16px; font-weight:600; color:#3F3B37;",
  ul: 'margin:0 0 16px; padding-left:20px;',
  li: "margin:0 0 6px; font-family:'Inter', Helvetica, Arial, sans-serif; font-size:16px; line-height:1.6; color:#4A453F;",
};

const EMAIL_IMAGE_STYLE = 'display:block; width:100%; max-width:520px; height:auto; border:0; margin:8px 0 24px;';
const EMAIL_PENDING_STYLE = "margin:8px 0 24px; height:347px; line-height:347px; background:#A3927C; color:#F5F2ED; text-align:center; font-family:'DM Mono', ui-monospace, Menlo, 'Courier New', monospace; font-size:12px; letter-spacing:0.2em;";

/**
 * Build the template variables for one piece. `image` is the copied file name or null; `job` is
 * the job the piece asked an image of (null: no image slot); `place` is the run's place line.
 */
function varsFor(piece, data, body, image, job, place) {
  const channel = CHANNELS[piece.channel] || {};
  const eyebrow = typeof data.eyebrow === 'string' || typeof data.eyebrow === 'number' ? String(data.eyebrow).trim() : '';
  const base = {
    piece: piece.id,
    kind: piece.kind,
    channel: piece.channel,
    width: channel.width ?? '',
    height: channel.height ?? '',
    eyebrow: eyebrow || place,
    wordmark: wordmarkBlock(),
  };
  switch (piece.kind) {
    case 'social':
    case 'pin':
      return {
        ...base,
        title: data.headline || piece.angle || piece.id,
        headline: data.headline || '',
        caption: data.caption || '',
        alt: data.alt || '',
        hashtags: (data.hashtags || []).map((t) => `#${String(t).replace(/^#/, '')}`).join(' '),
        image: imageBlock(image, data.alt),
      };
    case 'poster':
      return {
        ...base,
        title: data.headline || piece.id,
        headline: data.headline || '',
        subhead: data.subhead || '',
        body: data.body || '',
        imageLabel: data.imageLabel || '',
        image: imageBlock(image, data.alt || data.headline),
      };
    case 'one-pager': {
      const sections = (data.sections || [])
        .map((s) => `<section class="section"><h2>${escapeHtml(s.heading)}</h2>${markdownBlocks(s.body).join('')}</section>`)
        .join('\n');
      return {
        ...base,
        title: data.title || piece.id,
        sections,
        cta: data.cta || '',
        image: imageBlock(image, data.alt || data.title),
      };
    }
    case 'email': {
      const blocks = markdownBlocks(body, EMAIL_STYLES);
      let img = '';
      if (image) {
        img = `<img src="${escapeHtml(image)}" width="520" alt="${escapeHtml(data.alt || '')}" style="${EMAIL_IMAGE_STYLE}">`;
      } else if (job) {
        img = `<div class="image-pending" role="img" aria-label="Image pending" style="${EMAIL_PENDING_STYLE}">IMAGE PENDING</div>`;
      }
      return {
        ...base,
        title: data.subject || piece.id,
        subject: data.subject || '',
        preheader: data.preheader || '',
        body_first: blocks.slice(0, 1).join(''),
        image: img,
        body_rest: blocks.slice(1).join(''),
      };
    }
    default:
      return base;
  }
}

export function composePiece(runDir, plan, piece, log = console.log) {
  const paths = runPaths(runDir);
  const outDir = path.join(paths.compose, piece.id);

  if (piece.kind === 'deck' || piece.kind === 'video') {
    log(`${piece.id} (${piece.kind}): skipped; composed by an agent from marketing/templates/${piece.kind}/`);
    return { piece: piece.id, status: 'skipped' };
  }

  // Remove the previous composition first, so a recompose that fails can never leave stale copy
  // behind for render.mjs to pick up.
  for (const name of ['index.html', 'pitch.md']) fs.rmSync(path.join(outDir, name), { force: true });

  const { data: rawData, body: rawBody } = readFinal(runDir, piece.id);
  const data = stripClaims(rawData);
  const body = stripClaims(rawBody);
  fs.mkdirSync(outDir, { recursive: true });

  if (piece.kind === 'pr-pitch') {
    const file = path.join(outDir, 'pitch.md');
    const text = `${data.subject ? `Subject: ${data.subject}\n\n` : ''}${body.trim()}\n`;
    fs.writeFileSync(file, text);
    log(`${piece.id} (pr-pitch): ok ${path.relative(runDir, file)}`);
    return { piece: piece.id, status: 'ok', out: file };
  }

  if (!TEMPLATE_KINDS.includes(piece.kind)) {
    throw new Error(`${piece.id}: no template for kind "${piece.kind}"`);
  }

  const job = piece.kind === 'email' ? emailJob(rawData) : leadJob(piece, rawData);
  const wantsImage = piece.kind !== 'email' || job;
  const image = wantsImage ? copyImage(pickImage(runDir, job), outDir) : null;
  const template = fs.readFileSync(path.join(TEMPLATES_DIR, `${piece.kind}.html`), 'utf8');
  const html = fill(template, varsFor(piece, data, body, image, job, placeLine(runDir, plan)));
  const file = path.join(outDir, 'index.html');
  fs.writeFileSync(file, html);
  if (wantsImage && !image) {
    const reason = `no image for ${job || 'the piece'}; composed with IMAGE PENDING`;
    log(`${piece.id} (${piece.kind}): image-missing ${path.relative(runDir, file)} (${reason})`);
    return { piece: piece.id, status: 'image-missing', out: file, image, reason };
  }
  log(`${piece.id} (${piece.kind}): ok ${path.relative(runDir, file)}`);
  return { piece: piece.id, status: 'ok', out: file, image };
}

export function parseArgs(argv) {
  const args = { runDir: null, piece: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--piece') args.piece = argv[++i];
    else if (!args.runDir) args.runDir = argv[i];
  }
  return args;
}

export function selectPieces(plan, pieceId) {
  const pieces = plan.pieces || [];
  if (!pieceId) return pieces;
  const match = pieces.filter((p) => p.id === pieceId);
  if (!match.length) throw new Error(`piece ${pieceId} is not in plan.json`);
  return match;
}

function main() {
  const { runDir, piece } = parseArgs(process.argv.slice(2));
  if (!runDir) {
    console.error('usage: node marketing/tools/compose.mjs <runDir> [--piece P]');
    process.exit(2);
  }
  const root = path.resolve(runDir);
  const plan = readPlan(root);
  const failed = [];
  // One bad piece never stops the rest; the exit code still reports it.
  for (const p of selectPieces(plan, piece)) {
    try {
      const result = composePiece(root, plan, p);
      if (result.status === 'image-missing') {
        appendLedger(root, { piece: p.id, step: 'compose', kind: p.kind, status: 'image-missing', reason: result.reason });
      }
    } catch (err) {
      failed.push(p.id);
      console.log(`${p.id} (${p.kind}): failed (${err.message})`);
      appendLedger(root, { piece: p.id, step: 'compose', kind: p.kind, status: 'failed', reason: err.message });
    }
  }
  if (failed.length) {
    console.error(`compose.mjs: ${failed.length} piece(s) failed: ${failed.join(', ')}`);
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  try {
    main();
  } catch (err) {
    console.error(`compose.mjs: ${err.message}`);
    process.exit(1);
  }
}
