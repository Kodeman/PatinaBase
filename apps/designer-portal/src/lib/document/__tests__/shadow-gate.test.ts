/**
 * US-28 S1 — zero shadows, gated at the CSS level (V20 U-Q12; house sheet
 * §G-2, §G-9).
 *
 * D4 ("no shadows, anywhere") is enforced by `no-restricted-syntax` rules in
 * eslint.config.mjs that read `.ts` and `.tsx` ONLY. No stylelint config exists
 * anywhere in this repo, so a shadow written straight into a stylesheet has
 * never been caught by anything — which is how R72's `.folio-face` exception
 * shipped, went unused, and sat in globals.css untripped until a lane deleted
 * it.
 *
 * R126 once allowed ONE token, `--elevation-sheet`, at three sites (the margin
 * chips, the open ledger sheet, the studio drawer). U-Q12 retired it: depth is
 * the order of the stocks, the weight of the edge, and the veil. This suite
 * holds the half the linter cannot see — at zero.
 *
 * P02 (Kody, 2026-10-23; house sheet SPEC §H-3.3) is the one scoped
 * exception: inside the round-8 renderer, two depth tokens at five enumerated
 * sites, all in components/document/paper/round8.css, which only the round-8
 * renderer imports. The allowlist is the exact (selector, token) inventory,
 * not a switch — every other stylesheet, globals.css included, stays at zero.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const APP_ROOT = join(__dirname, '../../../..');
const SRC_ROOT = join(APP_ROOT, 'src');
const GLOBALS_CSS = join(SRC_ROOT, 'app/globals.css');
const ROUND8_CSS = join(SRC_ROOT, 'components/document/paper/round8.css');

const ROUND8_SCOPE = '[data-paper-renderer="round8"]';
const FLOAT = 'var(--r8-shadow-float)';
const STACK = 'var(--r8-stack-edge)';

/** token-mapping §7.1 — the frozen inventory. A sixth site fails here until
 *  this array and SPEC §H-3.3 change together. */
const ROUND8_SHADOW_SITES: readonly (readonly [selector: string, token: string])[] = Object.freeze([
  [`${ROUND8_SCOPE} .r8-return-bar`, FLOAT],
  [`${ROUND8_SCOPE} .r8-toast`, FLOAT],
  [`${ROUND8_SCOPE} .r8-client-review-paper`, STACK],
  [`${ROUND8_SCOPE} .r8-set-preview`, STACK],
  [`${ROUND8_SCOPE} .r8-field-copy`, STACK],
] as const);

/** The two depth values, byte for byte (SPEC §H-3.3). */
const ROUND8_DEPTH_TOKENS = {
  '--r8-shadow-float': '0 4px 20px rgba(44, 41, 38, 0.13)',
  '--r8-stack-edge': '0 3px 0 var(--doc-sheet-2), 0 4px 0 var(--hairline-strong)',
} as const;

/** A `box-shadow: none` is a shadow REMOVAL, not a shadow — the D4 lint makes
 *  the same carve-out for `shadow-none`, which is there to neutralise a
 *  primitive that ships one. */
const SHADOW_DECLARATION = /box-shadow\s*:\s*([^;}]+)/g;

function stylesheets(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) stylesheets(full, out);
    else if (entry.name.endsWith('.css')) out.push(full);
  }
  return out;
}

function tsxFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') continue;
      tsxFiles(full, out);
    } else if (
      entry.name.endsWith('.tsx') &&
      !entry.name.endsWith('.test.tsx') &&
      !entry.name.endsWith('.spec.tsx')
    ) {
      out.push(full);
    }
  }
  return out;
}

function relative(file: string): string {
  return file.slice(APP_ROOT.length + 1);
}

/** Every real shadow declaration in a stylesheet, as `path — value`. */
function shadowsIn(file: string): string[] {
  const source = readFileSync(file, 'utf8');
  const found: string[] = [];
  let match: RegExpExecArray | null;
  SHADOW_DECLARATION.lastIndex = 0;
  while ((match = SHADOW_DECLARATION.exec(source)) !== null) {
    const value = match[1]!.trim().replace(/\s*!important$/, '');
    if (value === 'none') continue;
    found.push(`${relative(file)} — ${value}`);
  }
  return found;
}

const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');

interface Rule {
  selector: string;
  body: string;
}

/** Every top-level and at-rule-nested rule, as selector + declaration body
 *  (the walk action-rest-rules.test.ts uses). Comments must be stripped first. */
function rules(css: string): Rule[] {
  const found: Rule[] = [];
  const RULE = /([^{}]+)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = RULE.exec(css)) !== null) {
    const selector = match[1]!.trim().replace(/\s+/g, ' ');
    if (!selector || selector.startsWith('@')) continue;
    found.push({ selector, body: match[2]! });
  }
  return found;
}

/** Split on the commas that separate values or selectors, never on a comma
 *  inside parentheses (`rgba(…)`, `:is(…)`). */
function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '(') depth += 1;
    else if (text[i] === ')') depth -= 1;
    else if (text[i] === ',' && depth === 0) {
      parts.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(text.slice(start).trim());
  return parts;
}

const ALL_STYLESHEETS = stylesheets(SRC_ROOT);

describe('US-28 S1 · zero shadows', () => {
  it('finds stylesheets to measure, so a moved src/ fails loudly', () => {
    expect(ALL_STYLESHEETS).toContain(GLOBALS_CSS);
    expect(ALL_STYLESHEETS).toContain(ROUND8_CSS);
  });

  it('declares no shadow in globals.css', () => {
    expect(shadowsIn(GLOBALS_CSS)).toEqual([]);
  });

  it('declares no shadow in any stylesheet under src/ but the scoped round-8 sheet', () => {
    // The last legacy declaration (MilestoneCard.module.css's timeline card)
    // went with S1, so the inventory is empty rather than frozen. round8.css
    // is held to its own exact inventory below, never exempted wholesale.
    expect(ALL_STYLESHEETS.filter((file) => file !== ROUND8_CSS).flatMap(shadowsIn)).toEqual([]);
  });

  it('spends no drop-shadow and no shadow filter in any stylesheet', () => {
    // R72's `.folio-face` exception was a `filter: drop-shadow(...)`, which the
    // box-shadow assertions above would never have seen.
    const offences: string[] = [];
    for (const file of ALL_STYLESHEETS) {
      const source = readFileSync(file, 'utf8');
      // The offence is worded rather than quoted: the D4 lint bans the literal
      // form in src/lib/document/**, which is where the gate that enforces D4
      // has to live.
      if (/drop-shadow\(/.test(source)) offences.push(`${relative(file)} — a drop shadow filter`);
      for (const declaration of source.match(/filter\s*:\s*[^;}]+/g) ?? []) {
        if (/shadow/.test(declaration)) offences.push(`${relative(file)} — ${declaration.trim()}`);
      }
    }
    expect(offences).toEqual([]);
  });

  it('retires the one depth token and its class (U-Q12)', () => {
    const source = readFileSync(GLOBALS_CSS, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(source).not.toMatch(/--elevation-sheet\s*:/);
    expect(source).not.toMatch(/var\(--elevation-sheet\)/);
    expect(source).not.toMatch(/\.doc-elevated\b/);
  });

  it('leaves no Document component wearing the retired class', () => {
    // The three R126 sites — the margin chips, the open ledger sheet, the
    // studio drawer — wore `doc-elevated`; none may wear it now.
    const wearers = tsxFiles(join(SRC_ROOT, 'components/document'))
      .filter((file) => /\bdoc-elevated\b/.test(readFileSync(file, 'utf8')))
      .map(relative);
    expect(wearers).toEqual([]);
  });

  it('pins the S1 depth ladder tokens that replace the shadow', () => {
    // The sheet separates from the page by the veil and the edge (4.16:1),
    // where the retired shadow reached 1.16:1 (uplift.md (b)).
    const source = readFileSync(GLOBALS_CSS, 'utf8');
    expect(source).toMatch(/--card-edge:\s*var\(--color-card-edge\);/);
    expect(source).toMatch(/--paper-lift:\s*var\(--bg-surface\);/);
    expect(source).toMatch(/--veil:\s*rgba\(20, 18, 16, 0\.55\);/);
    expect(source).toMatch(/--edge-stage:\s*3px;/);
    expect(source).toMatch(/--tick-stage:\s*2px;/);
    expect(source).toMatch(/--edge-note:\s*2px solid var\(--oak\);/);
  });
});

describe('P02 · round-8 depth, scoped and enumerated (Kody 2026-10-23, SPEC §H-3.3)', () => {
  const round8 = stripComments(readFileSync(ROUND8_CSS, 'utf8'));
  const round8Rules = rules(round8);
  const depthDeclaration = (name: string) => new RegExp(`${name}\\s*:\\s*([^;}]+);`, 'g');

  it('spends depth only at the five frozen (selector, token) pairs', () => {
    // Each rule that declares a non-none shadow, as `selector — value`. A rule
    // with a second selector, a value other than the two tokens, or a site not
    // in the inventory all read as a mismatch here.
    const spent = round8Rules.flatMap(({ selector, body }) =>
      [...body.matchAll(SHADOW_DECLARATION)]
        .map((match) => match[1]!.trim().replace(/\s*!important$/, ''))
        .filter((value) => value !== 'none')
        .map((value) => `${selector} — ${value}`),
    );
    expect(spent).toEqual(ROUND8_SHADOW_SITES.map(([selector, token]) => `${selector} — ${token}`));
  });

  it('keeps every allowlisted site inside the round-8 scope, one selector each', () => {
    for (const [selector, token] of ROUND8_SHADOW_SITES) {
      expect(splitTopLevel(selector)).toEqual([selector]);
      expect(selector.startsWith(`${ROUND8_SCOPE} `)).toBe(true);
      expect([FLOAT, STACK]).toContain(token);
    }
  });

  it('finds no shadow the rule walk missed (a raw sweep agrees with the inventory)', () => {
    // shadowsIn reads the file raw, comments included, so a shadow written
    // where the walk cannot see it still surfaces here.
    expect(shadowsIn(ROUND8_CSS).map((found) => found.split(' — ')[1])).toEqual(
      ROUND8_SHADOW_SITES.map(([, token]) => token),
    );
  });

  it.each(Object.entries(ROUND8_DEPTH_TOKENS))(
    'pins %s byte for byte, declared once on the scope rule itself',
    (name, value) => {
      expect([...round8.matchAll(depthDeclaration(name))].map((match) => match[1]!.trim())).toEqual([value]);
      // the scope rule is the sheet's first rule, at top level — not a nested
      // @media twin and not a descendant selector
      const first = round8Rules[0]!;
      expect(first.selector).toBe(ROUND8_SCOPE);
      expect(round8.trimStart().startsWith(`${ROUND8_SCOPE} {`)).toBe(true);
      expect(first.body).toMatch(depthDeclaration(name));
    },
  );

  it('declares neither depth token anywhere else, and never at :root', () => {
    const elsewhere = ALL_STYLESHEETS.filter((file) => file !== ROUND8_CSS).flatMap((file) =>
      Object.keys(ROUND8_DEPTH_TOKENS)
        .filter((name) => new RegExp(`${name}\\s*:`).test(readFileSync(file, 'utf8')))
        .map((name) => `${relative(file)} — ${name}`),
    );
    expect(elsewhere).toEqual([]);
    expect(round8).not.toMatch(/:root/);
  });

  it('keeps the stacked edge a flat edge: zero blur, never inset', () => {
    const layers = splitTopLevel(ROUND8_DEPTH_TOKENS['--r8-stack-edge']);
    expect(layers).toHaveLength(2);
    for (const layer of layers) {
      expect(layer).not.toMatch(/\binset\b/);
      // <x> <y> <blur> <colour>: the third length is the blur
      const [, , blur] = layer.split(/\s+/);
      expect(blur).toBe('0');
    }
  });
});
