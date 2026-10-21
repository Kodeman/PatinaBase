/**
 * Green direction contrast (US-45 · spec §3a A1–A3, CPUX-07).
 *
 * Every pair below is measured from the values globals.css actually declares
 * — the test resolves `var()` chains in the :root block and computes the
 * WCAG 2.x relative-luminance ratio — so retuning a token re-measures it.
 *
 * Floors: text 4.5:1; non-text control edges, focus ring and the hold's
 * progress rule 3:1 (WCAG 1.4.3 / 1.4.11). The terminal's hover/press ground
 * also has to keep its ink at 8:1 or better (story contract).
 *
 * The card rule and the record rule are decorative boundaries of a block,
 * not the edge of anything a client operates, so 1.4.11 does not apply; they
 * are measured and reported, and the action grammar is held to never drawing
 * a control edge in either.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const css = readFileSync(join(__dirname, '../globals.css'), 'utf8');
const root = css.slice(css.indexOf(':root {'), css.indexOf('.dark {'));

const declared = new Map<string, string>();
for (const match of root.matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
  declared.set(match[1]!, match[2]!.trim());
}

/** Resolves a token through any `var()` chain to the hex it renders. */
function hex(token: string, seen: string[] = []): string {
  const value = declared.get(token);
  if (value === undefined) throw new Error(`${token} is not declared in :root`);
  const alias = value.match(/^var\((--[\w-]+)\)$/);
  if (alias) {
    if (seen.includes(alias[1]!)) throw new Error(`var() cycle at ${token}`);
    return hex(alias[1]!, [...seen, token]);
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(value)) {
    throw new Error(`${token} resolves to ${value}, not a six-digit hex`);
  }
  return value.toUpperCase();
}

function luminance(value: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(value.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(hex(a)), luminance(hex(b))].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

type Pair = [foreground: string, background: string, where: string];

const TEXT_PAIRS: Pair[] = [
  ['--color-card', '--color-forest', 'terminal label, picked choice'],
  ['--color-card', '--color-forest-press', 'terminal hover, picked choice hover/press'],
  ['--color-off-white', '--color-forest', 'primary word turned over under its forest flood'],
  ['--color-forest', '--color-off-white', 'links, italic party names, secondary/choice word on paper'],
  ['--color-forest', '--color-card', 'links and choice word on a card'],
  ['--color-forest', '--color-green-note', 'link in a note; choice word under its press flood'],
  ['--color-forest', '--color-green-record', 'link in a recorded response'],
  ['--color-forest-press', '--color-off-white', 'link and outline hover on paper'],
  ['--color-forest-press', '--color-card', 'link and outline hover on a card'],
  ['--color-charcoal', '--color-card', 'card body'],
  ['--color-charcoal', '--color-green-note', 'note body'],
  ['--color-charcoal', '--color-green-record', 'record body'],
  ['--color-oak-ink', '--color-card', 'muted copy on a card'],
  ['--color-oak-ink', '--color-green-note', 'muted copy in a note'],
  ['--color-oak-ink', '--color-green-record', 'muted copy in a record'],
  ['--color-unavailable-ink', '--color-green-record', 'unavailable act label'],
  ['--color-unavailable-ink', '--color-off-white', 'unavailable reason line on paper'],
  ['--color-unavailable-ink', '--color-card', 'unavailable reason line on a card'],
];

const EDGE_PAIRS: Pair[] = [
  ['--color-forest', '--color-off-white', 'choice/secondary outline and focus ring on paper'],
  ['--color-forest', '--color-card', 'choice/secondary outline and focus ring on a card'],
  ['--color-forest', '--color-green-note', 'focus ring inside a note'],
  ['--focus-ring', '--color-off-white', 'the focus ring token itself, on paper'],
  ['--color-forest', '--color-green-record', 'focus ring inside a record'],
  ['--color-unavailable-edge', '--color-off-white', 'dashed unavailable edge on paper'],
  ['--color-unavailable-edge', '--color-card', 'dashed unavailable edge on a card'],
  ['--color-unavailable-edge', '--color-green-record', 'dashed edge against its own fill'],
  ['--color-unavailable-edge', '--color-green-note', 'dashed edge inside a note'],
  ['--color-forest', '--color-green-record', '.cp-record edge against its fill'],
  ['--color-forest', '--color-off-white', '.cp-record edge on paper'],
  ['--color-green-record', '--color-forest', 'the hold progress rule on the terminal'],
  ['--color-green-record', '--color-forest-press', 'the hold progress rule on a hovered terminal'],
];

describe('green direction — text contrast ≥ 4.5:1', () => {
  it.each(TEXT_PAIRS)('%s on %s (%s)', (fg, bg) => {
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('green direction — non-text edges ≥ 3:1', () => {
  it.each(EDGE_PAIRS)('%s against %s (%s)', (fg, bg) => {
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(3);
  });
});

describe('the pinned values', () => {
  it('forest carries card ink at 8.38:1, as A1 states', () => {
    expect(hex('--color-forest')).toBe('#3E5145');
    expect(ratio('--color-card', '--color-forest')).toBeCloseTo(8.38, 2);
  });

  it('forest-press is darker than forest and keeps its ink at 8:1 or better', () => {
    expect(luminance(hex('--color-forest-press'))).toBeLessThan(
      luminance(hex('--color-forest')),
    );
    expect(ratio('--color-card', '--color-forest-press')).toBeGreaterThanOrEqual(8);
  });

  it('accent and focus ring both resolve to forest', () => {
    expect(hex('--accent-primary')).toBe(hex('--color-forest'));
    expect(hex('--focus-ring')).toBe(hex('--color-forest'));
  });
});

describe('sub-3:1 rules are never an edge anyone relies on', () => {
  it('measures the card and record rules (informational: below 3:1)', () => {
    // Recorded so a retune is visible in review. The card rule is decorative
    // (the card's fill and shadow carry the boundary); the record rule is not
    // drawn at all — the record's edge is forest, asserted above.
    expect(ratio('--color-card-rule', '--color-card')).toBeLessThan(3);
    expect(ratio('--color-green-record-rule', '--color-green-record')).toBeLessThan(3);
  });

  it('the action grammar draws no edge in either rule colour', () => {
    const grammar = css.slice(
      css.indexOf('/* The Scored Ink (I107)'),
      css.indexOf('/* Typography: now provided by'),
    );
    expect(grammar).not.toContain('--color-card-rule');
    expect(grammar).not.toContain('--color-green-record-rule');
  });

  it('the record rule colour is declared but drawn nowhere', () => {
    const uses = css.match(/var\(--color-green-record-rule\)/g) ?? [];
    expect(uses).toHaveLength(0);
  });
});
