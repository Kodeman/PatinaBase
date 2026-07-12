/// <reference lib="deno.ns" />
// Unit matrix for feed-parse.ts: pure CSV/JSON parsing, no I/O. Run:
//   deno test --allow-all --config supabase/functions/deno.json supabase/functions/catalog-normalizer/feed-parse.test.ts

import { assertEquals, assertThrows } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import { parseCsv, parseFeed, parseJsonArray, stableRowHash } from './feed-parse.ts';

Deno.test('parseCsv: simple header + rows', () => {
  const rows = parseCsv('name,price\nSofa,100\nChair,50\n');
  assertEquals(rows, [
    { name: 'Sofa', price: '100' },
    { name: 'Chair', price: '50' },
  ]);
});

Deno.test('parseCsv: quoted field with an embedded comma', () => {
  const rows = parseCsv('name,price\n"Sofa, Deluxe",1299\n');
  assertEquals(rows, [{ name: 'Sofa, Deluxe', price: '1299' }]);
});

Deno.test('parseCsv: quoted field with doubled-quote escaping', () => {
  const rows = parseCsv('name,dimensions\nLamp,"24""W x 30""H"\n');
  assertEquals(rows, [{ name: 'Lamp', dimensions: '24"W x 30"H' }]);
});

Deno.test('parseCsv: quoted field with an embedded newline', () => {
  const rows = parseCsv('name,notes\nSofa,"Line one\nLine two"\n');
  assertEquals(rows, [{ name: 'Sofa', notes: 'Line one\nLine two' }]);
});

Deno.test('parseCsv: CRLF line endings', () => {
  const rows = parseCsv('name,price\r\nSofa,100\r\nChair,50\r\n');
  assertEquals(rows, [
    { name: 'Sofa', price: '100' },
    { name: 'Chair', price: '50' },
  ]);
});

Deno.test('parseCsv: trailing row without a final newline', () => {
  const rows = parseCsv('name,price\nSofa,100');
  assertEquals(rows, [{ name: 'Sofa', price: '100' }]);
});

Deno.test('parseCsv: blank trailing line is skipped, not returned as a row', () => {
  const rows = parseCsv('name,price\nSofa,100\n\n');
  assertEquals(rows, [{ name: 'Sofa', price: '100' }]);
});

Deno.test('parseCsv: header only (no data rows) yields an empty array', () => {
  const rows = parseCsv('name,price\n');
  assertEquals(rows, []);
});

Deno.test('parseCsv: empty string input yields an empty array', () => {
  assertEquals(parseCsv(''), []);
});

Deno.test('parseCsv: cell values are trimmed', () => {
  const rows = parseCsv('name, price \n Sofa , 100 \n');
  assertEquals(rows, [{ name: 'Sofa', price: '100' }]);
});

Deno.test('parseJsonArray: array of flat row objects', () => {
  const rows = parseJsonArray('[{"name":"Sofa","price":100},{"name":"Chair","price":50}]');
  assertEquals(rows, [
    { name: 'Sofa', price: '100' },
    { name: 'Chair', price: '50' },
  ]);
});

Deno.test('parseJsonArray: null values become empty strings', () => {
  const rows = parseJsonArray('[{"name":"Sofa","description":null}]');
  assertEquals(rows, [{ name: 'Sofa', description: '' }]);
});

Deno.test('parseJsonArray: non-array JSON throws', () => {
  assertThrows(() => parseJsonArray('{"name":"Sofa"}'), Error, 'array');
});

Deno.test('parseJsonArray: invalid JSON throws', () => {
  assertThrows(() => parseJsonArray('[{'), Error, 'invalid JSON');
});

Deno.test('parseFeed: detects CSV by default', () => {
  const parsed = parseFeed('name,price\nSofa,100\n');
  assertEquals(parsed.format, 'csv');
  assertEquals(parsed.rows, [{ name: 'Sofa', price: '100' }]);
});

Deno.test('parseFeed: detects a JSON array by a leading [', () => {
  const parsed = parseFeed('  [{"name":"Sofa","price":100}]');
  assertEquals(parsed.format, 'json');
  assertEquals(parsed.rows, [{ name: 'Sofa', price: '100' }]);
});

Deno.test('parseFeed: empty content parses as zero CSV rows', () => {
  const parsed = parseFeed('');
  assertEquals(parsed.format, 'csv');
  assertEquals(parsed.rows, []);
});

Deno.test('stableRowHash: identical rows (any key order) hash identically', async () => {
  const a = await stableRowHash({ name: 'Sofa', price: '100' });
  const b = await stableRowHash({ price: '100', name: 'Sofa' });
  assertEquals(a, b);
});

Deno.test('stableRowHash: different rows hash differently', async () => {
  const a = await stableRowHash({ name: 'Sofa', price: '100' });
  const b = await stableRowHash({ name: 'Sofa', price: '101' });
  assertEquals(a === b, false);
});

Deno.test('stableRowHash: returns a 64-char hex SHA-256 digest', async () => {
  const h = await stableRowHash({ name: 'Sofa' });
  assertEquals(h.length, 64);
  assertEquals(/^[0-9a-f]{64}$/.test(h), true);
});
