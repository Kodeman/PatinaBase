/**
 * F56 — the contrast guard.
 *
 * Clay and Terracotta are material pigments: they paint fills, borders, rules,
 * pools and stamp outlines, and nothing requires a fill to be legible. The
 * `-ink` companions are the same pigments asked to be READ, so they answer to
 * WCAG 2.2 AA instead — 4.5:1, since no site that spends them qualifies as
 * large text (the mono eyebrows and meta lines are 8–12px).
 *
 * This parses globals.css rather than restating the hexes, so a token that is
 * retuned, renamed or added is measured on its real value. Without it, the
 * next `-ink` token someone adds is unmeasured until a human notices.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const GLOBALS_CSS = join(__dirname, '../../../app/globals.css');

/** The three grounds the surface actually paints behind text. Off-white is the
 *  darkest and therefore the binding one — a token that clears it clears all. */
const GROUNDS = {
  '--doc-paper': '#FCFAF6',
  '--color-off-white': '#FAF7F2',
  white: '#FFFFFF',
} as const;

const AA_NORMAL_TEXT = 4.5;

function parseTokens(css: string): Map<string, string> {
  const tokens = new Map<string, string>();
  const declaration = /(--[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g;
  let match: RegExpExecArray | null;
  while ((match = declaration.exec(css)) !== null) {
    tokens.set(match[1]!, match[2]!);
  }
  return tokens;
}

function toRgb(hex: string): [number, number, number] {
  const raw = hex.replace('#', '');
  const full =
    raw.length === 3
      ? raw
          .split('')
          .map((c) => c + c)
          .join('')
      : raw.slice(0, 6);
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [
    number,
    number,
    number,
  ];
}

/** WCAG 2.2 relative luminance (sRGB). */
function relativeLuminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map((v) => {
    const channel = v / 255;
    return channel <= 0.04045
      ? channel / 12.92
      : Math.pow((channel + 0.055) / 1.055, 2.4);
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a: string, b: string): number {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort(
    (x, y) => y - x,
  ) as [number, number];
  return (lighter + 0.05) / (darker + 0.05);
}

const css = readFileSync(GLOBALS_CSS, 'utf8');
const tokens = parseTokens(css);
const inkTokens = [...tokens.entries()].filter(([name]) => name.endsWith('-ink'));

describe('F56 · text-grade ink tokens clear WCAG AA', () => {
  it('finds the ink tokens in globals.css', () => {
    // A rename or a moved :root block must fail loudly rather than silently
    // reduce this suite to zero assertions.
    expect(inkTokens.length).toBeGreaterThanOrEqual(3);
    expect(tokens.get('--color-clay-ink')).toBeDefined();
    expect(tokens.get('--color-terracotta-ink')).toBeDefined();
  });

  it.each(inkTokens)('%s reaches 4.5:1 on every ground', (name, hex) => {
    // Reported as a labelled map so a failure names the ground and the ratio
    // rather than just "5 is not >= 4.5".
    const measured = Object.fromEntries(
      Object.entries(GROUNDS).map(([ground, groundHex]) => [
        `${name} on ${ground} (${groundHex})`,
        Number(contrastRatio(hex, groundHex).toFixed(2)),
      ]),
    );
    const failing = Object.entries(measured).filter(
      ([, ratio]) => ratio < AA_NORMAL_TEXT,
    );
    expect(failing).toEqual([]);
  });

  it('keeps clay-ink and terracotta-ink telling two stamp kinds apart', () => {
    // A2-L4 chose WHICH token each red-letter stamp wears; this lane changed
    // WHAT the tokens are worth. The two kinds have always separated by hue,
    // never by luminance, so the guard is that the darkening did not collapse
    // the hue gap the base pigments already carry.
    const hue = (hex: string) => {
      const [r, g, b] = toRgb(hex).map((v) => v / 255) as [
        number,
        number,
        number,
      ];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      if (max === min) return 0;
      const d = max - min;
      const h =
        max === r
          ? ((g - b) / d + (g < b ? 6 : 0)) / 6
          : max === g
            ? ((b - r) / d + 2) / 6
            : ((r - g) / d + 4) / 6;
      return h * 360;
    };
    const baseGap = Math.abs(hue('#C4A57B') - hue('#D4A090'));
    const inkGap = Math.abs(
      hue(tokens.get('--color-clay-ink')!) -
        hue(tokens.get('--color-terracotta-ink')!),
    );
    expect(inkGap).toBeGreaterThanOrEqual(baseGap - 1);
  });
});

describe('F56 · the base pigments are not spent as text', () => {
  /** The files the finding named as the worst offenders. Cheap to hold; each
   *  is a surface where a base pigment as text was a real AA failure. */
  const ALLOW_LISTED = [
    'src/components/document/red-letter-zone.tsx',
    'src/components/document/letterhead-vitals.tsx',
    'src/components/document/stamp.tsx',
    'src/lib/document/desk-derivation.ts',
    'src/lib/document/proposal-watch-derivation.ts',
  ];

  it.each(ALLOW_LISTED)('%s spends no base pigment on text', (relative) => {
    const source = readFileSync(join(__dirname, '../../../..', relative), 'utf8');
    // Only patterns that are text WHEREVER they appear. A bare `color:` is
    // deliberately not one of them: in a stamp descriptor `color` is the
    // border and `ink` is the text (see stamp.tsx), so a source scan cannot
    // tell a CSS `color:` from a descriptor field. Those files are held by
    // the Stamp contract instead — every clay/terracotta descriptor carries
    // an explicit `-ink`, so nothing falls through `ink ?? color`.
    const textUses = [
      /text-\[var\(--color-(?:clay|terracotta)\)\]/g,
      /text-patina-(?:clay|terracotta)(?![-\w])/g,
      /#C4836F/gi,
    ];
    const offences = textUses.flatMap((pattern) => source.match(pattern) ?? []);
    expect(offences).toEqual([]);
  });

  it('every clay/terracotta Stamp descriptor carries an explicit ink', () => {
    // Stamp renders `color: ink ?? color` — a descriptor that names a base
    // pigment and omits `ink` paints its label with the pigment, which is the
    // F56 defect at chip grain. Borders are unaffected either way.
    const modules = [
      'src/lib/document/desk-derivation.ts',
      'src/lib/document/proposal-watch-derivation.ts',
      'src/components/document/orders-ledger.tsx',
      'src/components/document/orders-book-vendors.tsx',
    ];
    const inkless: string[] = [];
    for (const relative of modules) {
      const source = readFileSync(join(__dirname, '../../../..', relative), 'utf8');
      for (const line of source.split('\n')) {
        const namesPigment =
          /color:\s*(?:'var\(--color-(?:clay|terracotta)\)'|CLAY|TERRACOTTA)\b/.test(
            line,
          );
        if (namesPigment && !/\bink:/.test(line)) {
          inkless.push(`${relative}: ${line.trim()}`);
        }
      }
    }
    expect(inkless).toEqual([]);
  });
});
