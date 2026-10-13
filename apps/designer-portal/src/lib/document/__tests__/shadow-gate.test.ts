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

describe('US-28 S1 · zero shadows', () => {
  it('finds stylesheets to measure, so a moved src/ fails loudly', () => {
    expect(ALL_STYLESHEETS).toContain(GLOBALS_CSS);
  });

  it('declares no shadow in globals.css', () => {
    expect(shadowsIn(GLOBALS_CSS)).toEqual([]);
  });

  it('declares no shadow in any stylesheet under src/', () => {
    // The last legacy declaration (MilestoneCard.module.css's timeline card)
    // went with S1, so the inventory is empty rather than frozen.
    expect(ALL_STYLESHEETS.flatMap(shadowsIn)).toEqual([]);
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
