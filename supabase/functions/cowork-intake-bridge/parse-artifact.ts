// cowork-intake-bridge/parse-artifact.ts — PURE artifact parser.
//
// Tolerant front-matter parse of a Cowork .md/.txt artifact. The Cowork handoff
// mandates every queued deliverable begin with a header block:
//
//   ---
//   task_type: vendor_qualification
//   confidence: 0.82
//   assignee: kody
//   summary: one line
//   ---
//   <body…>
//
// No YAML dependency — this handles the exact `key: value` fence shape, tolerant
// of BOM, CRLF/CR line endings, leading blank lines, and quoted values. It
// validates the three load-bearing fields (task_type slug, confidence ∈[0,1],
// assignee ∈{kody,leah}); a malformed artifact returns ok=false with an error so
// the bridge can enqueue it as a reviewable intake_error rather than drop it.

export type Assignee = 'kody' | 'leah';

export interface ParsedFields {
  task_type?: string;
  confidence?: number;
  assignee?: Assignee;
  summary?: string;
}

/** Best-effort structured pull of the vendor Leah card (images/bullets/story). */
export interface LeahCard {
  images: string[];
  bullets: string[];
  story: string | null;
}

export interface ParseResult {
  ok: boolean;
  fields: ParsedFields;
  /** First 2000 chars of the body after the front-matter fence. */
  bodyExcerpt: string;
  leahCard?: LeahCard;
  error?: string;
}

const BODY_EXCERPT_MAX = 2000;
// A task_type slug: lowercase alnum groups joined by - or _ (e.g. vendor_qualification).
const SLUG_RE = /^[a-z0-9]+(?:[_-][a-z0-9]+)*$/;
const ASSIGNEES: readonly string[] = ['kody', 'leah'] as const;

function normalize(content: string): string {
  return content.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function stripQuotes(v: string): string {
  const t = v.trim();
  if (t.length >= 2 && ((t[0] === '"' && t.endsWith('"')) || (t[0] === "'" && t.endsWith("'")))) {
    return t.slice(1, -1);
  }
  return t;
}

export function parseArtifact(content: string): ParseResult {
  const text = normalize(content ?? '');
  const lines = text.split('\n');

  // Find the opening fence, skipping leading blank lines only.
  let i = 0;
  while (i < lines.length && lines[i].trim() === '') i++;

  if (i >= lines.length || lines[i].trim() !== '---') {
    return {
      ok: false,
      fields: {},
      bodyExcerpt: text.slice(0, BODY_EXCERPT_MAX),
      error: 'missing front-matter fence (expected a leading --- block)',
    };
  }

  // Collect key: value lines until the closing fence.
  const raw: Record<string, string> = {};
  let closed = false;
  let j = i + 1;
  for (; j < lines.length; j++) {
    const line = lines[j];
    if (line.trim() === '---') {
      closed = true;
      break;
    }
    const colon = line.indexOf(':');
    if (colon === -1) continue; // tolerate stray lines
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = stripQuotes(line.slice(colon + 1));
    if (key) raw[key] = value;
  }

  const body = closed ? lines.slice(j + 1).join('\n').replace(/^\n+/, '') : '';
  const bodyExcerpt = body.slice(0, BODY_EXCERPT_MAX);

  if (!closed) {
    return {
      ok: false,
      fields: {},
      bodyExcerpt: lines.slice(i + 1).join('\n').slice(0, BODY_EXCERPT_MAX),
      error: 'unterminated front-matter fence (no closing ---)',
    };
  }

  // Extract + validate.
  const fields: ParsedFields = {};
  const errors: string[] = [];

  const taskType = raw['task_type'] ?? '';
  if (taskType && SLUG_RE.test(taskType)) {
    fields.task_type = taskType;
  } else {
    errors.push(`invalid task_type: ${JSON.stringify(taskType)}`);
  }

  const confRaw = raw['confidence'];
  const conf = confRaw == null ? NaN : Number(confRaw);
  if (Number.isFinite(conf) && conf >= 0 && conf <= 1) {
    fields.confidence = conf;
  } else {
    errors.push(`invalid confidence: ${JSON.stringify(confRaw ?? null)} (want a number in [0,1])`);
  }

  const assignee = (raw['assignee'] ?? '').toLowerCase();
  if (ASSIGNEES.includes(assignee)) {
    fields.assignee = assignee as Assignee;
  } else {
    errors.push(`invalid assignee: ${JSON.stringify(raw['assignee'] ?? null)} (want kody|leah)`);
  }

  if (raw['summary'] != null) fields.summary = raw['summary'];

  const ok = errors.length === 0;
  const result: ParseResult = {
    ok,
    fields,
    bodyExcerpt,
    ...(ok ? {} : { error: errors.join('; ') }),
  };

  // Best-effort Leah card — only for vendor qualifications carrying one.
  if (fields.task_type === 'vendor_qualification') {
    const card = extractLeahCard(body);
    if (card) result.leahCard = card;
  }

  return result;
}

/**
 * Pull the LEAH CARD block (3 images, 3 bullets, 1-line story) if present.
 * Best-effort and forgiving — returns undefined when there's no card marker.
 */
export function extractLeahCard(body: string): LeahCard | undefined {
  const lower = body.toLowerCase();
  const markerIdx = lower.indexOf('leah card');
  if (markerIdx === -1) return undefined;

  // Bound the section: from the marker to the next numbered/markdown heading.
  const after = body.slice(markerIdx);
  const afterLines = after.split('\n');
  const sectionLines: string[] = [];
  for (let k = 1; k < afterLines.length; k++) {
    const l = afterLines[k];
    if (/^\s*(#{1,6}\s|\d+[.)]\s|[A-Z][A-Z &]{3,}\s*$)/.test(l)) break;
    sectionLines.push(l);
  }
  const section = sectionLines.join('\n');

  // Images: markdown image links, else bare http(s) urls.
  const images: string[] = [];
  for (const m of section.matchAll(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/g)) images.push(m[1]);
  if (images.length === 0) {
    for (const m of section.matchAll(/\bhttps?:\/\/[^\s)]+/g)) {
      if (/\.(png|jpe?g|webp|gif|avif)(\?|$)/i.test(m[0])) images.push(m[0]);
    }
  }

  // Bullets: -, *, • lines that aren't pure image links.
  const bullets: string[] = [];
  let story: string | null = null;
  for (const l of sectionLines) {
    const bullet = l.match(/^\s*[-*•]\s+(.*\S)\s*$/);
    if (!bullet) continue;
    const t = bullet[1].trim();
    if (/^!\[[^\]]*\]\(/.test(t) || /^https?:\/\/\S+$/.test(t)) continue; // image-only bullet
    if (story === null && /\b(since|est\.?|founded|\b(1[89]|20)\d{2}\b)/i.test(t)) {
      story = t; // the maker-story line
    } else {
      bullets.push(t);
    }
  }

  if (images.length === 0 && bullets.length === 0 && story === null) return undefined;
  return { images, bullets, story };
}
