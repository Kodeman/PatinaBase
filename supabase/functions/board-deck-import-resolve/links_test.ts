// links.ts normalizeProductUrl against the shared URL vector table, the same
// rows lookup_indexes.test.sql runs through the SQL
// _board_deck_import_normalize_url (00683). One table, two normalizers.

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { normalizeProductUrl } from './links.ts';

const SQL_TEST = new URL('../../tests/deck_import/lookup_indexes.test.sql', import.meta.url);

/** Rows between the url-vectors markers: ('input', 'expected' | NULL). */
async function vectors(): Promise<[string, string | null][]> {
  const sql = await Deno.readTextFile(SQL_TEST);
  const block = sql.split('-- url-vectors:begin')[1]?.split('-- url-vectors:end')[0] ?? '';
  const literal = "'((?:[^']|'')*)'";
  const row = new RegExp(`\\(\\s*${literal}\\s*,\\s*(?:${literal}|NULL)\\s*\\)`, 'g');
  const unquote = (s: string) => s.replace(/''/g, "'");
  return [...block.matchAll(row)].map((m) => [unquote(m[1]), m[2] == null ? null : unquote(m[2])]);
}

Deno.test('normalizeProductUrl matches every shared URL vector', async () => {
  const rows = await vectors();
  assert(rows.length >= 25, `vector table parsed: ${rows.length} rows`);
  for (const [input, expected] of rows) {
    assertEquals(normalizeProductUrl(input), expected, input);
  }
});

Deno.test('normalizeProductUrl is a fixed point on its own output', async () => {
  for (const [, expected] of await vectors()) {
    if (expected != null) assertEquals(normalizeProductUrl(expected), expected, expected);
  }
});
