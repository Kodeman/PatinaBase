/**
 * R26 CI contract — "Marked 'Studio eyes only' and excluded from the client
 * mirror — enforce with a CI test, not a convention."
 *
 * The client mirror (R27 preview session) is the enforceable projection of
 * what the client's copy carries. This suite holds two lines mechanically
 * (the R3 shadow-lint precedent — source-level, CI-blocking):
 *   1. the mirror reads ONLY folio files flagged client_visible (R24);
 *   2. the mirror never references the Account Page, section tasks, margin
 *      notes, or any trade/margin/fee figure (R26).
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const COMPONENTS = join(__dirname, '..', '..', '..', 'components', 'document');

const mirrorSource = readFileSync(join(COMPONENTS, 'client-mirror.tsx'), 'utf8');

describe('the client mirror (R26/R27 contract)', () => {
  it('reads only folio files flagged client_visible', () => {
    // The project_documents query must carry the flag filter.
    expect(mirrorSource).toMatch(/\.eq\('client_visible',\s*true\)/);
  });

  it('never references the Account Page or its figures', () => {
    for (const forbidden of [
      'account-band',
      'AccountBand',
      'use-account-page',
      'useAccountPage',
      'trade_price',
      'trade_cost',
      'design_fee',
      'margin_pct',
      'marginPct',
      'budget_cents',
    ]) {
      expect(mirrorSource).not.toContain(forbidden);
    }
  });

  it('never references section tasks or margin notes (the studio layer)', () => {
    for (const forbidden of ['project_tasks', 'work-block', 'WorkBlock', 'margin_notes', 'useSectionTasks']) {
      expect(mirrorSource).not.toContain(forbidden);
    }
  });

  it('is read-only: the only mutations are none at all', () => {
    // No insert/update/delete/rpc calls — a preview session cannot mutate.
    expect(mirrorSource).not.toMatch(/\.(insert|update|delete|upsert|rpc)\(/);
  });
});

describe('the account band stays out of every mirror-side import', () => {
  it('client-mirror does not import the band, the band does not import the mirror', () => {
    const bandSource = readFileSync(join(COMPONENTS, 'account-band.tsx'), 'utf8');
    expect(mirrorSource).not.toContain('account-band');
    expect(bandSource).not.toContain('client-mirror');
  });
});
