/**
 * Dissolve-parity grammar contracts (the R3/R16 shadow-lint precedent) — the
 * design authority (patina-dissolve-eleven-surfaces-v1.html) specifies a
 * shared visual grammar; these source-level assertions stop it drifting
 * back into one-off markup.
 *
 *   1. anti-drift: the margin rail AND the vendor thread both render through
 *      the shared `MItem`/`MItemContent` grammar (I21 — the two surfaces
 *      "cannot drift"; §6 had drifted to flat <li>s before this pass).
 *   2. §7 The Week renders events as `.wk-ev` pill chips, not plain text.
 *   3. §1 The Work's gate line wears the Golden-Hour "Gate" stamp.
 *   4. §3 room headings carry the Strata mini-rule divider.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const COMPONENTS = join(__dirname, '..', '..', '..', 'components', 'document');
const read = (f: string) => readFileSync(join(COMPONENTS, f), 'utf8');

const mItem = read('m-item.tsx');
const marginItem = read('margin-item.tsx');
const vendors = read('orders-book-vendors.tsx');
const week = read('orders-book-week.tsx');
const work = read('work-block.tsx');
const ffe = read('ffe-section.tsx');

describe('the shared .mitem grammar (anti-drift)', () => {
  it('m-item exports both the content unit and the standalone card', () => {
    expect(mItem).toMatch(/export function MItemContent\b/);
    expect(mItem).toMatch(/export function MItem\b/);
    // The three layers + the ownVoice clay variant are the contract.
    expect(mItem).toContain('var(--color-clay)');
    expect(mItem).toMatch(/ownVoice/);
  });

  it('the margin rail renders through MItemContent', () => {
    expect(marginItem).toMatch(/from '\.\/m-item'/);
    expect(marginItem).toContain('<MItemContent');
    // The old inline 3-span block must be gone (it would re-drift).
    expect(marginItem).not.toContain("text-[11.5px] font-medium leading-snug text-[var(--color-charcoal)]");
  });

  it('the vendor thread renders through MItem (not a flat <li>)', () => {
    expect(vendors).toMatch(/from '\.\/m-item'/);
    expect(vendors).toContain('<MItem');
    // own-voice "You" + clay, the studio's own hand in the thread.
    expect(vendors).toContain("'You'");
    expect(vendors).toMatch(/ownVoice=\{own\}/);
  });
});

describe('§7 The Week — pill chips, not plain text', () => {
  it('events use the .wk-ev pill recipe (left border + tinted bg + radius)', () => {
    expect(week).toMatch(/border-l-\[2\.5px\]/);
    expect(week).toMatch(/WK_EV_TONE/);
    // received / collision tones present.
    expect(week).toContain('✓ recvd');
    expect(week).toContain('⚠ collides');
  });

  it('only true install collisions wear the collides word', () => {
    // The collides annotation keys on the collision-only set, not the wider
    // conflict set (a delivery overlap gets the border, no word).
    expect(week).toMatch(/collisionWeeksByProject/);
    expect(week).toMatch(/collides ? '|collides'/);
  });

  it('carries the legend, not a verbose conflict list', () => {
    expect(week).toContain('also on your Desk');
  });
});

describe('§1 The Work — the gate stamp', () => {
  it("the gate line wears a Golden-Hour 'Gate' stamp", () => {
    expect(work).toMatch(/from '\.\/stamp'/);
    expect(work).toContain("label: 'Gate'");
    expect(work).toContain('var(--color-golden-hour)');
    expect(work).toContain('Request sign-off');
  });

  it('the tick is a stamp with the ✓ glyph, not a SaaS checkbox', () => {
    expect(work).toContain("done ? '✓'");
  });
});

describe('§3 Rooms — the Strata mini-rule', () => {
  it('room headings render the StrataMiniRule divider', () => {
    expect(ffe).toMatch(/from '\.\/strata-mini-rule'/);
    expect(ffe).toContain('<StrataMiniRule');
  });
});
