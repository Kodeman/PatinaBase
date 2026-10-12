/**
 * US-28 S1 — one sheet stock, zero shadows (V20 U-Q1, U-Q12; house sheet §G).
 * Every DocSheet is `--paper-doc` with a 1px `--card-edge` and a 2px radius
 * over the `--veil`, and it settles UP as it opens. Asserted at the source:
 * DocSheet portals into document.body behind an overlay-stack context, and
 * the facts under test are class strings on the panel, the veil and the head.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SOURCE = readFileSync(join(__dirname, 'doc-sheet.tsx'), 'utf8');
// Comments may name the retired token; the rendered class strings may not.
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('US-28 S1 · the sheet', () => {
  it('casts no shadow: no elevation class, no shadow utility, no shadow style', () => {
    expect(CODE).not.toMatch(/doc-elevated/);
    expect(CODE).not.toMatch(/shadow-|box-shadow|boxShadow/);
  });

  it('wears the one stock: --paper-doc, a 1px --card-edge, a 2px radius', () => {
    expect(SOURCE).toContain(
      'rounded-[2px] border border-[var(--card-edge)] bg-[var(--paper-doc)]',
    );
    // The three retired stocks and the 5px radius are gone from the panel.
    expect(CODE).not.toMatch(/rounded-\[5px\]/);
    expect(CODE).not.toMatch(/--color-rule-strong/);
    expect(CODE).not.toMatch(/bg-\[var\(--doc-paper/);
  });

  it('lays the sheet over the named --veil, not a literal', () => {
    expect(SOURCE).toContain('cursor-default bg-[var(--veil)]');
    expect(CODE).not.toMatch(/rgba\(20,\s*18,\s*16/);
  });

  it('wraps the head and never truncates it', () => {
    const titleLine = SOURCE.match(/className="([^"]*)"\s*data-doc-sheet-title-line/);
    expect(titleLine).not.toBeNull();
    expect(titleLine![1]).not.toMatch(/\btruncate\b|\bline-clamp|\bwhitespace-nowrap\b/);
    expect(titleLine![1]).toMatch(/\bbreak-words\b/);
    expect(SOURCE).toMatch(/className="mb-5 flex flex-wrap /);
  });

  it('settles up on open, and only when motion is welcome', () => {
    expect(SOURCE).toContain(
      'motion-safe:!animate-[doc-sheet-up_240ms_var(--ease-editorial)]',
    );
  });
});
