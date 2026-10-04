// deno test --allow-all --config supabase/functions/deno.json supabase/functions/board-deck-import-resolve/
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { cosine, pairByLook } from './pairing.ts';

const TAU = 0.8;
const MARGIN = 0.05;

Deno.test('pairByLook: a clear win pairs each link to its crop', () => {
  const sim = [
    [0.95, 0.40, 0.30],
    [0.35, 0.91, 0.20],
  ];
  const pairs = pairByLook(sim, TAU, MARGIN).map(({ link, crop }) => ({ link, crop }));
  assertEquals(pairs, [{ link: 0, crop: 0 }, { link: 1, crop: 1 }]);
});

Deno.test('pairByLook: ambiguous similarity stays unassigned', () => {
  // Link 0 looks equally like crops 0 and 1: below the margin.
  assertEquals(pairByLook([[0.90, 0.88]], TAU, MARGIN), []);
  // Two links compete for one crop.
  assertEquals(pairByLook([[0.90], [0.89]], TAU, MARGIN), []);
  // Clear but too weak.
  assertEquals(pairByLook([[0.70, 0.10]], TAU, MARGIN), []);
});

Deno.test('pairByLook: more links than crops leaves the extra links unassigned', () => {
  const sim = [
    [0.92],
    [0.30],
    [0.25],
  ];
  const pairs = pairByLook(sim, TAU, MARGIN).map(({ link, crop }) => ({ link, crop }));
  assertEquals(pairs, [{ link: 0, crop: 0 }]);
});

Deno.test('pairByLook: more crops than links leaves the extra crops unclaimed', () => {
  const sim = [[0.10, 0.20, 0.93, 0.30]];
  const pairs = pairByLook(sim, TAU, MARGIN);
  assertEquals(pairs.length, 1);
  assertEquals(pairs[0].crop, 2);
});

Deno.test('pairByLook: one-to-one — a crop is never given to two links', () => {
  const sim = [
    [0.95, 0.10],
    [0.20, 0.94],
    [0.15, 0.12],
  ];
  const pairs = pairByLook(sim, TAU, MARGIN);
  assertEquals(new Set(pairs.map((p) => p.crop)).size, pairs.length);
  assertEquals(pairs.map(({ link, crop }) => ({ link, crop })), [{ link: 0, crop: 0 }, { link: 1, crop: 1 }]);
});

Deno.test('cosine from vectors', () => {
  assertEquals(cosine([1, 0], [1, 0]), 1);
  assertEquals(cosine([1, 0], [0, 1]), 0);
  assertEquals(cosine([], []), 0);
  assertEquals(cosine([1, 2], [1]), 0);
});
