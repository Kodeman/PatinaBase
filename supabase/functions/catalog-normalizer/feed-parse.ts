// catalog-normalizer/feed-parse.ts — pure feed-file parsing. No I/O, no
// Supabase, no inference calls. Accepts CSV (first line = headers, tolerates
// quoted fields with embedded commas/newlines/doubled-quote escaping) and a
// bare JSON array of row objects. Unit-tested directly (feed-parse.test.ts).

export interface ParsedFeed {
  format: 'csv' | 'json';
  rows: Record<string, string>[];
}

/**
 * Detect + parse a feed file's content. JSON is recognized by a leading `[`
 * (after trimming whitespace); everything else is treated as CSV.
 */
export function parseFeed(content: string): ParsedFeed {
  const trimmed = content.trim();
  if (trimmed.startsWith('[')) {
    return { format: 'json', rows: parseJsonArray(trimmed) };
  }
  return { format: 'csv', rows: parseCsv(content) };
}

/** Parse a JSON array of flat row objects into string-valued rows. */
export function parseJsonArray(content: string): Record<string, string>[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    throw new Error(`feed-parse: invalid JSON array (${(e as Error).message})`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error('feed-parse: JSON feed must be an array of row objects');
  }
  return parsed.map((obj) => {
    const out: Record<string, string> = {};
    if (obj && typeof obj === 'object') {
      for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
        out[k] = v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v);
      }
    }
    return out;
  });
}

/**
 * RFC4180-ish CSV tokenizer: handles quoted fields (embedded commas,
 * embedded newlines, doubled-quote `""` escaping), CRLF/LF line endings, and
 * a trailing row without a final newline. Returns raw string[][] cells —
 * header mapping happens in parseCsv.
 */
function tokenizeCsv(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let sawAnyField = false;
  const n = content.length;
  let i = 0;

  while (i < n) {
    const c = content[i];
    if (inQuotes) {
      if (c === '"') {
        if (content[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      sawAnyField = true;
      i++;
      continue;
    }
    if (c === ',') {
      row.push(field);
      field = '';
      sawAnyField = true;
      i++;
      continue;
    }
    if (c === '\r') {
      i++;
      continue;
    }
    if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      sawAnyField = false;
      i++;
      continue;
    }
    field += c;
    sawAnyField = true;
    i++;
  }
  // Flush a trailing field/row that wasn't newline-terminated.
  if (field.length > 0 || row.length > 0 || sawAnyField) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Parse CSV text into header-keyed row objects. Empty input yields []. */
export function parseCsv(content: string): Record<string, string>[] {
  const table = tokenizeCsv(content);
  if (table.length === 0) return [];

  const headers = table[0].map((h) => h.trim());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < table.length; i++) {
    const cells = table[i];
    // Skip a wholly-blank trailing line (single empty cell, no header match).
    if (cells.length === 1 && cells[0].trim() === '') continue;
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = (cells[idx] ?? '').trim();
    });
    rows.push(row);
  }
  return rows;
}

/**
 * Stable hash of a raw row's contents — sorted-key JSON, SHA-256 hex. Used as
 * catalog_feed_items.source_row_hash so re-normalizing an already-seen row
 * (identical vendor feed re-uploaded, or a mid-batch retry) is a no-op.
 */
export async function stableRowHash(raw: Record<string, string>): Promise<string> {
  const sortedKeys = Object.keys(raw).sort();
  const normalized: Record<string, string> = {};
  for (const k of sortedKeys) normalized[k] = raw[k];
  const json = JSON.stringify(normalized);
  const bytes = new TextEncoder().encode(json);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
