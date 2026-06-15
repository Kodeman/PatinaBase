/**
 * R43 CI contract — "Sarah's copy" (the proposal-grain live preview).
 *
 * The proposal mirror (drafting/proposal-mirror.tsx) is the enforceable
 * projection of what a *draft proposal's* client copy carries. It follows the
 * R26 precedent set by the project-grain client mirror: hold the line
 * mechanically, source-level and CI-blocking (the R3 shadow-lint pattern), so a
 * future edit can't silently leak a trade figure, a margin, or a `tbd`
 * placeholder into the client's live preview.
 *
 * This suite holds three lines:
 *   1. the mirror never references a trade/cost/unit-price/budget/markup/margin
 *      column — it can only render NAME / ROOM / CATEGORY + the one rolled-up
 *      proposal total;
 *   2. the mirror filters out `tbd` pieces (studio-side scaffolding);
 *   3. the mirror is read-only — no insert/update/delete/upsert/rpc.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const COMPONENTS = join(__dirname, '..', '..', '..', 'components', 'document');

const mirrorSource = readFileSync(join(COMPONENTS, 'drafting', 'proposal-mirror.tsx'), 'utf8');

describe('the proposal mirror (R43 contract)', () => {
  it('never references a trade, cost, price, budget, markup, margin, or fee figure', () => {
    for (const forbidden of [
      'trade_price',
      'trade_cost',
      'unit_price',
      'unit_sell_price',
      'line_total_cents',
      'markup_percent',
      'budget_min_cents',
      'budget_max_cents',
      'budget_cents',
      'margin_pct',
      'marginPct',
      'design_fee',
    ]) {
      expect(mirrorSource).not.toContain(forbidden);
    }
  });

  it('filters out tbd pieces — the studio scaffolding never reaches the client copy', () => {
    // Either the strict-inequality guard or a .filter excluding 'tbd'.
    const filtersTbd =
      /item_type !== 'tbd'/.test(mirrorSource) ||
      /\.filter\([^)]*tbd/.test(mirrorSource);
    expect(filtersTbd).toBe(true);
  });

  it('is read-only: the only mutations are none at all', () => {
    // No insert/update/delete/upsert/rpc calls — a live preview cannot mutate.
    expect(mirrorSource).not.toMatch(/\.(insert|update|delete|upsert|rpc)\(/);
  });
});
