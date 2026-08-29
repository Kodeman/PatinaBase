/**
 * R126 / Q04 — the elevation budget, gated at the CSS level.
 *
 * D4 ("no shadows, anywhere") is enforced by `no-restricted-syntax` rules in
 * eslint.config.mjs that read `.ts` and `.tsx` ONLY. No stylelint config exists
 * anywhere in this repo, so a shadow written straight into a stylesheet has
 * never been caught by anything — which is how R72's `.folio-face` exception
 * shipped, went unused, and sat in globals.css untripped until this lane
 * deleted it.
 *
 * D4 as amended: ONE token, `--elevation-sheet`, spent at exactly three sites
 * — the margin chips, the open ledger sheet, the studio drawer. This suite
 * holds the half the linter cannot see.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const APP_ROOT = join(__dirname, '../../../..');
const SRC_ROOT = join(APP_ROOT, 'src');
const GLOBALS_CSS = join(SRC_ROOT, 'app/globals.css');

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

const ALL_STYLESHEETS = stylesheets(SRC_ROOT);

/** The one shadow in this app that predates the amendment and sits outside
 *  The Document entirely — a portal-zone timeline card. It is frozen here by
 *  its exact value so it cannot grow, move, or be joined by a second. */
const LEGACY_NON_DOCUMENT_SHADOW =
  'src/components/timeline/MilestoneCard.module.css — 0 2px 8px rgba(0, 0, 0, 0.08)';

describe('R126 · D4 as amended — one elevation token, one declaration', () => {
  it('finds stylesheets to measure, so a moved src/ fails loudly', () => {
    expect(ALL_STYLESHEETS).toContain(GLOBALS_CSS);
  });

  it('declares exactly one shadow in globals.css, and it is .doc-elevated', () => {
    expect(shadowsIn(GLOBALS_CSS)).toEqual([
      'src/app/globals.css — var(--elevation-sheet)',
    ]);
    // The value alone is not the budget — the selector is. A second rule
    // reaching for the token would pass the count above and fail here.
    const source = readFileSync(GLOBALS_CSS, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const rules = source.match(/([^{}]+)\{[^}]*box-shadow\s*:\s*var\(--elevation-sheet\)/g) ?? [];
    expect(rules).toHaveLength(1);
    expect(rules[0]!.split('{')[0]!.trim()).toBe('.doc-elevated');
  });

  it('adds no shadow to any other stylesheet under src/', () => {
    // A frozen inventory rather than a count: any NEW shadow anywhere under
    // src/ fails, and the one pre-existing non-Document declaration is named
    // rather than hidden behind an ignore list.
    const elsewhere = ALL_STYLESHEETS.filter((file) => file !== GLOBALS_CSS).flatMap(
      shadowsIn,
    );
    expect(elsewhere).toEqual([LEGACY_NON_DOCUMENT_SHADOW]);
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

  it('declares --elevation-sheet exactly once', () => {
    const source = readFileSync(GLOBALS_CSS, 'utf8');
    expect(source.match(/--elevation-sheet\s*:/g)).toHaveLength(1);
  });

  it('spends .doc-elevated at no more than the three ruled sites', () => {
    // The margin chips, the open ledger sheet and the studio drawer. Lanes add
    // them; zero here is the honest count before they land.
    const wearers = tsxFiles(join(SRC_ROOT, 'components/document'))
      .filter((file) => /\bdoc-elevated\b/.test(readFileSync(file, 'utf8')))
      .map(relative);
    expect(wearers.length).toBeLessThanOrEqual(3);
  });
});
