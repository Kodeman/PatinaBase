/**
 * R43 · R86 CI contract — "Sarah's copy" (the proposal-grain live preview).
 *
 * The proposal mirror (drafting/proposal-mirror.tsx) is the enforceable
 * projection of what a *draft proposal's* client copy carries. R86 upgraded it
 * to render the SAME shared blocks the client sees, gated by the visibility
 * tier — so preview IS truth. That means the mirror now DOES carry the
 * client-facing SELL figures the client sees at 'full' (line totals, allowance
 * ranges, per-room budgets); they are tier-gated, not forbidden.
 *
 * What survives from R43 (the client sees these at NO tier):
 *   1. the mirror never references a TRADE cost, markup, or margin column — the
 *      studio-internal figures the client must never see at any tier;
 *   2. the mirror filters out `tbd` pieces (studio-side scaffolding);
 *   3. the mirror is read-only — no insert/update/delete/upsert/rpc in the
 *      PROJECTION (the tier setter's write lives in its own small instrument,
 *      excluded from this projection guard).
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const COMPONENTS = join(__dirname, '..', '..', '..', 'components', 'document');

const mirrorSource = readFileSync(join(COMPONENTS, 'drafting', 'proposal-mirror.tsx'), 'utf8');

describe('the proposal mirror (R43 · R86 contract)', () => {
  it('never references a TRADE cost, markup, or margin figure (client sees these at no tier)', () => {
    for (const forbidden of [
      'trade_price',
      'trade_cost',
      'unit_sell_price',
      'markup_percent',
      'markup_pct',
      'margin_pct',
      'marginPct',
      'design_fee',
    ]) {
      expect(mirrorSource).not.toContain(forbidden);
    }
  });

  it('filters out tbd pieces — the studio scaffolding never reaches the client copy', () => {
    const filtersTbd =
      /item_type !== 'tbd'/.test(mirrorSource) || /\.filter\([^)]*tbd/.test(mirrorSource);
    expect(filtersTbd).toBe(true);
  });

  it('is tier-gated (R86) — it imports the ONE shared visibility law', () => {
    expect(mirrorSource).toMatch(/proposalTierVisibility/);
    expect(mirrorSource).toMatch(/@patina\/utils/);
  });

  it('the projection is read-only — no insert/delete/upsert/rpc; the only update is the tier setter', () => {
    expect(mirrorSource).not.toMatch(/\.(insert|delete|upsert|rpc)\(/);
    // A single mutation is allowed: the tier setter (useUpdateProposal.mutate).
    // Guard that no bare supabase `.update(` write leaks into the projection.
    expect(mirrorSource).not.toMatch(/\.update\(/);
  });
});
