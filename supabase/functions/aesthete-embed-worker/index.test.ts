// Deno tests for the aesthete-embed-worker pure helpers (Wave 2B).
// Run: deno test --allow-all supabase/functions/aesthete-embed-worker/
//
// Tests ./lib.ts + ../_shared/aesthete.ts pure functions directly — importing
// ./index.ts would boot Deno.serve (po-send convention). The orchestration
// (runEmbedBatch with fake db + fake inference) lives in ./runner.test.ts.

import {
  assert,
  assertAlmostEquals,
  assertEquals,
  assertThrows,
} from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import {
  chunk,
  fuseVectors,
  l2Normalize,
  meanVector,
  retryDelayMs,
  toPgVector,
} from '../_shared/aesthete.ts';
import {
  buildEmbedText,
  buildStyleCaption,
  DEFAULT_BATCH_SIZE,
  parseBatchSize,
} from './lib.ts';

// ─── parseBatchSize ──────────────────────────────────────────────────────────

Deno.test('parseBatchSize defaults to 16 for empty/garbage bodies', () => {
  for (const body of [{}, null, undefined, 42, 'x', { batch_size: 'many' }, { batch_size: NaN }]) {
    assertEquals(parseBatchSize(body), DEFAULT_BATCH_SIZE);
  }
});

Deno.test('parseBatchSize clamps to [1, 16] and floors', () => {
  assertEquals(parseBatchSize({ batch_size: 4 }), 4);
  assertEquals(parseBatchSize({ batch_size: '8' }), 8);
  assertEquals(parseBatchSize({ batch_size: 7.9 }), 7);
  assertEquals(parseBatchSize({ batch_size: 0 }), 1);
  assertEquals(parseBatchSize({ batch_size: -3 }), 1);
  assertEquals(parseBatchSize({ batch_size: 100 }), 16);
});

// ─── buildEmbedText — name ‖ description ‖ materials ─────────────────────────

Deno.test('buildEmbedText joins name, description, materials', () => {
  assertEquals(
    buildEmbedText({
      name: 'Walnut Credenza',
      description: 'A low storage piece.',
      materials: ['Solid black walnut', 'Brass'],
    }),
    'Walnut Credenza\nA low storage piece.\nSolid black walnut, Brass',
  );
});

Deno.test('buildEmbedText drops missing parts', () => {
  assertEquals(
    buildEmbedText({ name: 'Lamp', description: null, materials: [] }),
    'Lamp',
  );
  assertEquals(
    buildEmbedText({ name: '  ', description: 'Glazed stoneware base.', materials: null }),
    'Glazed stoneware base.',
  );
});

Deno.test('buildEmbedText returns empty string when nothing embeddable', () => {
  assertEquals(buildEmbedText({ name: null, description: '  ', materials: [] }), '');
});

// ─── buildStyleCaption — the §4.3 deterministic template ─────────────────────

Deno.test('buildStyleCaption renders the full template', () => {
  assertEquals(
    buildStyleCaption({
      silhouette: 'low_slung',
      category: 'sofa',
      materials: ['walnut', 'boucle'],
      finish: 'natural_oil',
      palette_family: 'warm_earth',
      mood_keywords: ['grounded', 'quiet'],
      ambiance: 'Refined Casual',
      name: 'Should Not Appear',
    }),
    'low slung sofa in walnut, boucle, natural oil finish, warm earth, grounded, quiet, Refined Casual',
  );
});

Deno.test('buildStyleCaption degrades to products-only fields pre-DNA', () => {
  assertEquals(
    buildStyleCaption({
      silhouette: null,
      palette_family: null,
      mood_keywords: null,
      ambiance: null,
      category: 'table',
      materials: ['Quarter-sawn white oak'],
      finish: 'Hand-rubbed tung oil',
      name: 'Heirloom Oak Dining Table',
    }),
    'table in Quarter-sawn white oak, Hand-rubbed tung oil finish',
  );
});

Deno.test('buildStyleCaption falls back to the name as a last resort', () => {
  assertEquals(
    buildStyleCaption({
      silhouette: null,
      palette_family: null,
      mood_keywords: null,
      ambiance: null,
      category: null,
      materials: null,
      finish: null,
      name: 'Mystery Object',
    }),
    'Mystery Object',
  );
});

Deno.test('buildStyleCaption is empty only when every input is empty', () => {
  assertEquals(
    buildStyleCaption({
      silhouette: null,
      palette_family: null,
      mood_keywords: [],
      ambiance: '  ',
      category: null,
      materials: [],
      finish: null,
      name: null,
    }),
    '',
  );
});

Deno.test('buildStyleCaption handles materials without a head', () => {
  assertEquals(
    buildStyleCaption({
      silhouette: null,
      palette_family: 'cool_neutral',
      mood_keywords: null,
      ambiance: null,
      category: null,
      materials: ['steel'],
      finish: null,
      name: 'X',
    }),
    'in steel, cool neutral',
  );
});

Deno.test('buildStyleCaption is deterministic', () => {
  const fields = {
    silhouette: 'sculptural',
    palette_family: 'jewel',
    mood_keywords: ['bold'],
    ambiance: 'Dramatic',
    category: 'lighting',
    materials: ['brass'],
    finish: 'patinated',
    name: 'Lamp',
  };
  assertEquals(buildStyleCaption(fields), buildStyleCaption(fields));
});

// ─── vector math (§4.3) ──────────────────────────────────────────────────────

Deno.test('l2Normalize produces a unit vector', () => {
  assertEquals(l2Normalize([3, 4]), [0.6, 0.8]);
});

Deno.test('l2Normalize passes zero vectors through unchanged', () => {
  assertEquals(l2Normalize([0, 0, 0]), [0, 0, 0]);
});

Deno.test('meanVector averages element-wise', () => {
  assertEquals(meanVector([[1, 0, 3], [3, 2, 1]]), [2, 1, 2]);
});

Deno.test('meanVector rejects empty and mismatched input', () => {
  assertThrows(() => meanVector([]));
  assertThrows(() => meanVector([[1, 2], [1, 2, 3]]));
});

Deno.test('fuseVectors implements normalize(0.65·mean(images) + 0.35·caption)', () => {
  const images = [[1, 0, 0], [0, 1, 0]];
  const caption = [0, 0, 1];
  // mean(images) = [0.5, 0.5, 0]; weighted = [0.325, 0.325, 0.35]
  const raw = [0.325, 0.325, 0.35];
  const norm = Math.sqrt(raw.reduce((s, x) => s + x * x, 0));
  const fused = fuseVectors(images, caption);
  for (let i = 0; i < 3; i++) assertAlmostEquals(fused[i], raw[i] / norm, 1e-12);
  // and it is unit-length
  assertAlmostEquals(Math.sqrt(fused.reduce((s, x) => s + x * x, 0)), 1, 1e-12);
});

Deno.test('fuseVectors with a single image equals normalize of the weighted sum', () => {
  const fused = fuseVectors([[0, 1]], [1, 0]);
  const norm = Math.sqrt(0.65 * 0.65 + 0.35 * 0.35);
  assertAlmostEquals(fused[0], 0.35 / norm, 1e-12);
  assertAlmostEquals(fused[1], 0.65 / norm, 1e-12);
});

Deno.test('fuseVectors refuses an empty image set (caption-only is a caller decision)', () => {
  assertThrows(() => fuseVectors([], [1, 0]));
});

Deno.test('fuseVectors rejects image/caption dimension mismatch', () => {
  assertThrows(() => fuseVectors([[1, 0, 0]], [1, 0]));
});

Deno.test('toPgVector renders the pgvector text literal', () => {
  assertEquals(toPgVector([0.5, -1, 0.25]), '[0.5,-1,0.25]');
});

Deno.test('chunk splits into ≤ size groups', () => {
  assertEquals(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assertEquals(chunk([], 4), []);
  assertThrows(() => chunk([1], 0));
});

// ─── retryDelayMs — the in-invocation 429 backoff mapping ────────────────────

Deno.test('retryDelayMs honors a numeric Retry-After (seconds)', () => {
  assertEquals(retryDelayMs('1', 1), 1000);
  assertEquals(retryDelayMs('2', 3), 2000);
  assertEquals(retryDelayMs('0', 1), 0);
});

Deno.test('retryDelayMs caps Retry-After at 5 s (60 s pg_net window)', () => {
  assertEquals(retryDelayMs('30', 1), 5000);
});

Deno.test('retryDelayMs falls back to 500·2^(attempt−1) without a header', () => {
  assertEquals(retryDelayMs(null, 1), 500);
  assertEquals(retryDelayMs(null, 2), 1000);
  assertEquals(retryDelayMs(null, 3), 2000);
  assertEquals(retryDelayMs('soon', 2), 1000); // unparseable header → fallback
});

// sanity: assert() is used so the import is load-bearing for future edits
Deno.test('unit vectors stay unit under fusion regardless of weights', () => {
  const fused = fuseVectors([[1, 0]], [0, 1], 0.8, 0.2);
  assert(Math.abs(Math.sqrt(fused[0] ** 2 + fused[1] ** 2) - 1) < 1e-12);
});
