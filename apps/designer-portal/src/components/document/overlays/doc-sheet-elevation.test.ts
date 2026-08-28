/**
 * R126 — the open ledger sheet is ruled site 2 of 3 for `--elevation-sheet`,
 * and it settles UP as it opens. Asserted at the source: DocSheet portals into
 * document.body behind an overlay-stack context, and the facts under test are
 * two class strings on the panel element.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SOURCE = readFileSync(join(__dirname, 'doc-sheet.tsx'), 'utf8');

describe('R126 · the ledger sheet', () => {
  it('wears the one elevation class, never a shadow literal', () => {
    expect(SOURCE).toContain('doc-sheet-panel doc-elevated');
    expect(SOURCE.replace(/doc-elevated/g, '')).not.toMatch(/shadow-|box-shadow/);
  });

  it('settles up on open, and only when motion is welcome', () => {
    expect(SOURCE).toContain(
      'motion-safe:!animate-[doc-sheet-up_240ms_var(--ease-editorial)]',
    );
  });

  it('leaves the veil exactly as it was', () => {
    expect(SOURCE).toContain('cursor-default bg-[rgba(20,18,16,0.55)]');
  });
});
