/// <reference lib="deno.ns" />
// ^ restores the Deno global under the repo-root tsconfig (see index.test.ts).
//
// Real-API smoke for aesthete-dna-draft (Wave 2C). NOT part of the normal
// suite: it is ignored unless BOTH env vars are set. The shared Claude client
// is imported dynamically so the normal suite keeps its fixture-only graph.
//
// Run (see README.md — costs real money, ~1–2¢):
//   DENO_NO_PACKAGE_JSON=1 RUN_REAL_SMOKE=1 ANTHROPIC_API_KEY=sk-ant-… \
//     deno test --allow-env --allow-net supabase/functions/aesthete-dna-draft/smoke.test.ts
// (DENO_NO_PACKAGE_JSON=1 lets claude.ts's npm: specifier resolve from the
// monorepo root, which otherwise runs in manual-node_modules mode.)

import { assert, assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import {
  type ArchetypeRow,
  BULK_MODEL,
  draftProduct,
  type ProductRow,
  SpendAccumulator,
} from './lib.ts';

/** Permission-safe env read: without --allow-env (the default mocked-suite
 * run) Deno.env.get throws NotCapable — treat that as "not set" so the smoke
 * simply stays ignored. */
function envGet(name: string): string | undefined {
  try {
    return Deno.env.get(name);
  } catch {
    return undefined;
  }
}

const RUN = envGet('RUN_REAL_SMOKE') === '1' && !!envGet('ANTHROPIC_API_KEY');

// A stable public product image (Wikimedia) + retailer-ish text; the smoke
// only asserts the structural contract, not the aesthetic judgment.
const SMOKE_PRODUCT: ProductRow = {
  id: 'smoke-product',
  name: 'Mid-century walnut sideboard',
  brand: 'Smoke Test',
  category: 'storage',
  subcategory: 'credenza',
  description:
    'Solid walnut sideboard with tapered legs, two sliding doors and brass hardware. Oil finish.',
  short_description: null,
  materials: ['walnut', 'brass'],
  price_retail: 149500,
  images: [
    'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/Culture_of_Denmark_-_Sideboard.jpg/640px-Culture_of_Denmark_-_Sideboard.jpg',
  ],
  source_url: null,
};

// The 12 seeded archetypes (00006) with throwaway ids — the smoke never
// touches the DB, it only proves the prompt + schema round-trip on the wire.
const SMOKE_ARCHETYPES: ArchetypeRow[] = [
  'Warm Modern',
  'Soft Contemporary',
  'Mid-Century Modern',
  'Scandinavian Minimal',
  'Modern Industrial',
  'Traditional',
  'Transitional',
  'Rustic',
  'Coastal',
  'Bohemian',
  'Maximalist',
  'Japandi',
].map((name, i) => ({
  id: `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
  name,
  description: `${name} archetype`,
  visual_markers: [],
}));

Deno.test({
  name: 'real-API smoke: haiku structured draft round-trip (RUN_REAL_SMOKE=1 only)',
  ignore: !RUN,
  fn: async () => {
    // Dynamic import keeps the SDK and client outside the skipped test graph.
    const { callClaude } = await import(new URL('../_shared/claude.ts', import.meta.url).href);
    const spend = new SpendAccumulator();
    const caller = async (role: 'triage' | 'extract', params: Record<string, unknown>) => {
      const result = await callClaude({
        feature: 'aesthete-dna-draft',
        role,
        studioId: null,
        userId: null,
        promptVersion: 'p1',
        params,
        timeoutMs: 20_000,
        ledger: {
          reserve: async () => ({ granted: true, reason: null, usageId: 1 }),
          settle: async () => {},
        },
      });
      if (!result.ok) throw new Error('denied' in result ? result.denied : result.error);
      spend.add(result.response.usage, result.usd);
      return result.response;
    };
    const log = (event: string, fields?: Record<string, unknown>) =>
      console.log(JSON.stringify({ smoke: event, ...fields }));

    const result = await draftProduct(caller, SMOKE_PRODUCT, SMOKE_ARCHETYPES, spend, log);

    assertEquals(result.outcome, 'drafted');
    if (result.outcome === 'drafted') {
      assert(result.confidence >= 0 && result.confidence <= 1);
      const style = result.draft.style as Record<string, unknown>;
      assert(SMOKE_ARCHETYPES.some((a) => a.name === style.primary_archetype));
      log('smoke_ok', {
        model: result.model,
        escalated: result.escalated,
        confidence: result.confidence,
        usd: spend.toDelta().usd,
      });
    }
    // Sanity on the governor inputs: real usage was accounted.
    assert(spend.toDelta().usd > 0);
    assertEquals(spend.products, 0, 'draftProduct itself does not count products');
    assert([BULK_MODEL].length === 1);
  },
});
