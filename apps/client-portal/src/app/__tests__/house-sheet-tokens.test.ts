/**
 * House-sheet tokens and the seven type steps (I153 / Lane H2).
 *
 * docs/design/house-sheet/SPEC.md §A1 names sixteen distinct hexes; twelve of
 * them already lived in this portal under its own token names (--color-charcoal
 * for --ink, --color-clay for --clay, and so on) and four were genuinely
 * missing (--paper-doc, --rail, --ink-subtle, --sage-ink). This is a contract
 * test in the manner of the designer portal's contrast.test.ts: it parses
 * globals.css as text so a token that is retuned, renamed, or dropped is
 * caught here rather than by a human noticing a caption go quiet.
 *
 * It also holds the two houses-sheet regions to their own file boundaries —
 * the tokens/type-step markers this lane owns, and the untouched Scored Ink
 * (`.da-*`) block that is Lane H4's — so a future edit to either can't creep
 * into the other unnoticed.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const GLOBALS_CSS = join(__dirname, '../globals.css');
const css = readFileSync(GLOBALS_CSS, 'utf8');

/** The sheet's sixteen distinct hexes (§A1), each already present in this
 * file — either under the portal's own existing token name, or (for the
 * four the portal lacked) under the new sheet-named token this lane adds. */
const SHEET_HEXES = [
  '#FAF7F2', // paper / ink-paper
  '#FCFAF6', // paper-doc (new)
  '#E8E3DB', // rail / hairline (new)
  '#2C2926', // ink
  '#4E4339', // ink-muted
  '#5A4E43', // ink-subtle (new)
  '#65594E', // ink-faint
  '#8B7355', // oak
  '#C4A57B', // clay
  '#7C5E30', // clay-ink
  '#E8C547', // golden
  '#79651E', // golden-ink
  '#D4A090', // terracotta
  '#9C5340', // terracotta-ink
  '#A8B5A0', // sage
  '#5F6B57', // sage-ink (new)
] as const;

/** The four tokens this portal lacked outright (Lane H2 step 1). */
const NEW_TOKENS: Record<string, string> = {
  '--paper-doc': '#FCFAF6',
  '--rail': '#E8E3DB',
  '--ink-subtle': '#5A4E43',
  '--sage-ink': '#5F6B57',
};

/** Aliases onto tokens already carried under the portal's own name (step 2).
 * Each maps a sheet name to the existing var it must point at — never a hex,
 * never a redefinition. */
const ALIASES: Record<string, string> = {
  '--oak': '--color-aged-oak',
  '--ink-faint': '--color-quiet-ink',
  '--ink': '--color-charcoal',
  '--paper': '--color-off-white',
  '--clay-ink': '--color-clay-ink',
  '--golden-ink': '--color-golden-hour-ink',
  '--terracotta-ink': '--color-terracotta-ink',
};

/** The nine named type-step classes (§A3) plus the consequence sentence
 * (§A6), each with the exact size/line-height/weight/tracking/case the sheet
 * pins. text-transform is asserted explicitly everywhere: .t-head is the
 * ONLY uppercase step, and swapping it with .t-meta silently breaks every
 * caption on the page. */
const TYPE_STEPS: Record<
  string,
  {
    family: '--font-display' | '--font-body' | '--font-meta';
    size: string;
    lineHeight: string;
    weight: string;
    tracking: string;
    transform: 'none' | 'uppercase';
  }
> = {
  '.t-d1': { family: '--font-display', size: '34px', lineHeight: '1.15', weight: '500', tracking: '0', transform: 'none' },
  '.t-d2': { family: '--font-display', size: '26px', lineHeight: '1.2', weight: '500', tracking: '0', transform: 'none' },
  '.t-d3': { family: '--font-display', size: '20px', lineHeight: '1.3', weight: '500', tracking: '0', transform: 'none' },
  '.t-body': { family: '--font-body', size: '16px', lineHeight: '1.55', weight: '400', tracking: '0', transform: 'none' },
  '.t-body-sm': { family: '--font-body', size: '14px', lineHeight: '1.5', weight: '400', tracking: '0', transform: 'none' },
  '.t-meta': { family: '--font-meta', size: '12px', lineHeight: '1.5', weight: '400', tracking: '0.08em', transform: 'none' },
  '.t-head': { family: '--font-meta', size: '11px', lineHeight: '1.5', weight: '500', tracking: '0.08em', transform: 'uppercase' },
  '.t-money': { family: '--font-meta', size: '15px', lineHeight: '1.5', weight: '400', tracking: '0.02em', transform: 'none' },
  '.t-authorship': { family: '--font-display', size: '20px', lineHeight: '1.3', weight: '400', tracking: '0', transform: 'none' },
};

/** Extracts the text between a pair of `/* — <label>:start — *\/` /
 * `/* — <label>:end — *\/` comment markers, so assertions about "what this
 * lane added" don't have to scan the whole file (which already carries many
 * hexes and classes this lane did not write and must not touch). */
function region(label: string): string {
  const start = `— ${label}:start —`;
  const end = `— ${label}:end —`;
  const startIdx = css.indexOf(start);
  const endIdx = css.indexOf(end);
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    throw new Error(`house-sheet region marker "${label}" not found in globals.css`);
  }
  return css.slice(startIdx, endIdx);
}

/** Finds a single top-level rule block for `selector { ... }` and returns its
 * declaration body. Anchored so `.t-d1` never matches inside `.t-d1x` or a
 * later `.t-d10`. */
function ruleBody(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'm');
  const match = css.match(re);
  if (!match) {
    throw new Error(`rule "${selector}" not found in globals.css`);
  }
  return match[1]!;
}

describe('house-sheet tokens (§A1)', () => {
  it('carries all sixteen of the sheet hexes somewhere in the file', () => {
    for (const hex of SHEET_HEXES) {
      expect(css.toUpperCase()).toContain(hex.toUpperCase());
    }
  });

  it('declares the four tokens this portal lacked, at the sheet value', () => {
    for (const [name, hex] of Object.entries(NEW_TOKENS)) {
      const re = new RegExp(`${name.replace(/[-]/g, '\\-')}:\\s*${hex}\\s*;`, 'i');
      expect(css).toMatch(re);
    }
  });

  it('declares every alias pointing at an existing token, never a hex', () => {
    for (const [alias, target] of Object.entries(ALIASES)) {
      const re = new RegExp(`${alias.replace(/[-]/g, '\\-')}:\\s*var\\(${target.replace(/[-]/g, '\\-')}\\)\\s*;`);
      expect(css).toMatch(re);
      // the target itself must actually be declared somewhere (never an
      // alias pointing at a token that does not exist)
      const targetDeclared = new RegExp(`${target.replace(/[-]/g, '\\-')}:\\s*#[0-9a-fA-F]{3,8}\\s*;`);
      expect(css).toMatch(targetDeclared);
    }
  });

  it('adds no hex literal in its own token block beyond the four new ones', () => {
    const tokenRegion = region('house-sheet tokens');
    const hexes = tokenRegion.match(/#[0-9a-fA-F]{3,8}/g) ?? [];
    const allowed = new Set(Object.values(NEW_TOKENS).map((h) => h.toUpperCase()));
    for (const hex of hexes) {
      expect(allowed.has(hex.toUpperCase())).toBe(true);
    }
  });
});

describe('house-sheet type steps (§A3) and the consequence sentence (§A6)', () => {
  it.each(Object.entries(TYPE_STEPS))('%s matches the sheet exactly', (selector, spec) => {
    const body = ruleBody(selector);
    expect(body).toMatch(new RegExp(`font-family:\\s*var\\(${spec.family}\\)`));
    expect(body).toMatch(new RegExp(`font-size:\\s*${spec.size}\\s*;`));
    expect(body).toMatch(new RegExp(`line-height:\\s*${spec.lineHeight}\\s*;`));
    expect(body).toMatch(new RegExp(`font-weight:\\s*${spec.weight}\\s*;`));
    expect(body).toMatch(new RegExp(`letter-spacing:\\s*${spec.tracking}\\s*;`));
    expect(body).toMatch(new RegExp(`text-transform:\\s*${spec.transform}\\s*;`));
  });

  it('.t-authorship is Playfair italic — never a heading, never a control', () => {
    const body = ruleBody('.t-authorship');
    expect(body).toMatch(/font-style:\s*italic\s*;/);
  });

  it('.t-head is the only uppercase step; .t-meta stays sentence case', () => {
    expect(ruleBody('.t-head')).toMatch(/text-transform:\s*uppercase\s*;/);
    expect(ruleBody('.t-meta')).toMatch(/text-transform:\s*none\s*;/);
  });

  it('.consequence is the 15px floor, --ink, capped at 56ch', () => {
    const body = ruleBody('.consequence');
    expect(body).toMatch(/font-family:\s*var\(--font-body\)/);
    expect(body).toMatch(/font-size:\s*15px\s*;/);
    expect(body).toMatch(/line-height:\s*1\.55\s*;/);
    expect(body).toMatch(/color:\s*var\(--ink\)\s*;/);
    expect(body).toMatch(/max-width:\s*56ch\s*;/);
    expect(body).toMatch(/margin:\s*0\s+0\s+12px\s*;/);
  });

  it('adds no hex literal in the type-step block — typography only, no color', () => {
    const typeRegion = region('house-sheet type steps');
    expect(typeRegion.match(/#[0-9a-fA-F]{3,8}/g)).toBeNull();
  });
});

describe('the Scored Ink block stays Lane H4\'s', () => {
  it('is untouched — its banner comment and .da-tertiary rest rule still stand', () => {
    expect(css).toContain('The Scored Ink (I107) — DocumentAction grammar');
    // H4 removes this scaleX(0) rest rule; until that lane lands it must
    // still be exactly what it was before this lane touched the file, so a
    // future H2 edit that strays into :193+ trips this assertion instead of
    // silently reverting H4's work at merge time.
    expect(css).toContain('transform: scaleX(0);');
  });
});
