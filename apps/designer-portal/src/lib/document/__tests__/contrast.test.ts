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
 *
 * The inks are PAPER inks. Darkening a pigment raises it on paper and drops it
 * on charcoal, so the guard holds both halves: every `-ink` token clears AA on
 * every light ground, and the base pigments still clear AA on charcoal, which
 * is what makes the dark-ground sites' choice of the base pigment correct
 * rather than an oversight.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const APP_ROOT = join(__dirname, '../../../..');
const SRC_ROOT = join(APP_ROOT, 'src');
const GLOBALS_CSS = join(SRC_ROOT, 'app/globals.css');

/** Every LIGHT ground the surface actually paints behind text. The two bands
 *  are tints laid over paper (the red-letter zone's rgba(212,160,144,0.08) and
 *  the note band's rgba(196,124,92,0.08)) and are darker than off-white, so
 *  they — not off-white — are the binding grounds. */
const LIGHT_GROUNDS = {
  '--doc-paper': '#FCFAF6',
  '--color-off-white': '#FAF7F2',
  white: '#FFFFFF',
  'red-letter band over paper': '#F9F3EE',
  'note band over paper': '#F8F0EA',
} as const;

/** The charcoal the mobile bar, the dark Sheet, the log strip below 1180 and
 *  the two client-preview banners paint. */
const DARK_GROUND = '#2C2926';

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

/** `--*-ink` tokens declared as an ALIAS (`--x-ink: var(--color-clay)`).
 *  parseTokens only sees hexes, so an alias would keep the parsed count
 *  healthy and ship unmeasured — the exact "next token someone adds" case.
 *  (A non-hex, non-alias value such as `--doc-desk-ink`'s rgba() wash is not
 *  a pigment companion and is not claimed here.) */
function aliasedInkNames(css: string): string[] {
  const names: string[] = [];
  const declaration = /(--[a-z0-9-]+-ink)\s*:\s*var\(/g;
  let match: RegExpExecArray | null;
  while ((match = declaration.exec(css)) !== null) names.push(match[1]!);
  return names;
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
/** `--color-quiet-ink` and `--doc-*-ink*` are not pigment companions; the
 *  companions are the ones named for a base pigment this guard also holds. */
const PIGMENT_INKS = [
  '--color-clay-ink',
  '--color-terracotta-ink',
  '--color-golden-hour-ink',
  '--color-sage-ink',
] as const;

describe('F56 · text-grade ink tokens clear WCAG AA', () => {
  it('finds every ink token in globals.css, and every one of them as a hex', () => {
    // A rename or a moved :root block must fail loudly rather than silently
    // reduce this suite to zero assertions.
    expect(inkTokens.length).toBeGreaterThanOrEqual(PIGMENT_INKS.length);
    for (const name of PIGMENT_INKS) expect(tokens.get(name)).toBeDefined();
    // An alias-form ink (`--x-ink: var(--color-clay)`) parses to no hex. It
    // would keep the count healthy and ship unmeasured, so name it here.
    expect(aliasedInkNames(css)).toEqual([]);
  });

  it.each(inkTokens)('%s reaches 4.5:1 on every light ground', (name, hex) => {
    // Reported as a labelled map so a failure names the ground and the ratio
    // rather than just "5 is not >= 4.5".
    const measured = Object.fromEntries(
      Object.entries(LIGHT_GROUNDS).map(([ground, groundHex]) => [
        `${name} on ${ground} (${groundHex})`,
        Number(contrastRatio(hex, groundHex).toFixed(2)),
      ]),
    );
    const failing = Object.entries(measured).filter(
      ([, ratio]) => ratio < AA_NORMAL_TEXT,
    );
    expect(failing).toEqual([]);
  });

  it('leaves the base pigments legible on charcoal, where the inks are not', () => {
    // B3-01: darkening inverts on a dark ground. clay-ink falls to 2.41:1 on
    // charcoal while base clay reads 6.21:1 — which is why the mobile bar, the
    // dark Sheet, the log strip's sub-1180 branch and the two preview banners
    // keep the base pigment. Both halves are asserted so neither a retune of
    // the bases nor a well-meant sweep of those sites to `-ink` can land quiet.
    const onDark = (hex: string) => Number(contrastRatio(hex, DARK_GROUND).toFixed(2));
    const bases = {
      '--color-clay': onDark(tokens.get('--color-clay')!),
      '--color-terracotta': onDark(tokens.get('--color-terracotta')!),
    };
    expect(
      Object.entries(bases).filter(([, ratio]) => ratio < AA_NORMAL_TEXT),
    ).toEqual([]);
    expect(onDark(tokens.get('--color-clay-ink')!)).toBeLessThan(AA_NORMAL_TEXT);
    expect(onDark(tokens.get('--color-terracotta-ink')!)).toBeLessThan(
      AA_NORMAL_TEXT,
    );
  });

  it('keeps clay-ink and terracotta-ink telling two stamp kinds apart', () => {
    // A2-L4 chose WHICH token each red-letter stamp wears; this lane changed
    // WHAT the tokens are worth. The two kinds have always separated by hue,
    // never by luminance, so the guard is that the darkening did not collapse
    // the hue gap the base pigments already carry. Both gaps are read from the
    // parsed map, so a retune of a base moves the bar with it.
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
    const gap = (a: string, b: string) =>
      Math.abs(hue(tokens.get(a)!) - hue(tokens.get(b)!));
    expect(gap('--color-clay-ink', '--color-terracotta-ink')).toBeGreaterThanOrEqual(
      gap('--color-clay', '--color-terracotta') - 1,
    );
  });
});

/** Every source file under src/, so a base pigment spent as text is caught
 *  wherever it is written — not only in the five files the finding named. */
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, out);
    else if (/\.(tsx?|css)$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe('F56 · the base pigments are not spent as text', () => {
  /** Forms that are text WHEREVER they appear. A bare `color:` is deliberately
   *  not one of them: in a stamp descriptor `color` is the border and `ink` is
   *  the text (see stamp.tsx), and in a StatusChip descriptor `color` is a 6px
   *  dot. Those are held by the Stamp contract below instead. The inline
   *  `style={{ color: … }}` form IS text, and is the form the class-name sweep
   *  could not see — six survivors had to be found by hand. */
  const TEXT_FORMS: [RegExp, string][] = [
    [/text-\[var\(--color-(?:clay|terracotta)\)\]/g, 'text-[var(--color-…)]'],
    [/text-patina-(?:clay|terracotta)(?![-\w])/g, 'text-patina-…'],
    [/style=\{\{[^}]*?color:\s*['"]?var\(--color-(?:clay|terracotta)\)/gs, 'style={{ color: … }}'],
    [/#C4836F/gi, 'the retired #C4836F ink'],
  ];

  /** The charcoal-ground sites. On a dark ground the base pigment is the
   *  AA-passing choice (6.2:1) and the `-ink` companion is the failure
   *  (2.4:1) — see the charcoal assertion above. */
  const DARK_GROUND_SITES = [
    'src/components/document/mobile/mobile-bar.tsx',
    'src/components/document/mobile/mobile-sheets.tsx',
    'src/components/document/log-strip.tsx',
    'src/components/document/client-mirror.tsx',
    'src/components/document/proposal-preview.tsx',
  ];

  /** Not text: a 6px StatusChip dot, or this guard's own patterns. */
  const NOT_TEXT = [
    'src/components/document/people/profile/relationship-journey.tsx',
    'src/lib/document/__tests__/contrast.test.ts',
  ];

  it('finds no base pigment spent as text anywhere under src/', () => {
    const exempt = new Set([...DARK_GROUND_SITES, ...NOT_TEXT]);
    const offences: string[] = [];
    for (const file of sourceFiles(SRC_ROOT)) {
      const relative = file.slice(APP_ROOT.length + 1);
      if (exempt.has(relative)) continue;
      // globals.css names the retired ink in the token's own comment.
      const source =
        relative === 'src/app/globals.css'
          ? readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
          : readFileSync(file, 'utf8');
      for (const [pattern, label] of TEXT_FORMS) {
        const hits = source.match(pattern);
        if (hits) offences.push(`${relative} — ${hits.length}× ${label}`);
      }
    }
    expect(offences).toEqual([]);
  });

  it('every clay/terracotta Stamp descriptor carries an explicit ink', () => {
    // Stamp renders `color: ink ?? color` — a descriptor that names a base
    // pigment and omits `ink` paints its label with the pigment, which is the
    // F56 defect at chip grain. Borders are unaffected either way.
    //
    // No trailing \b after the quoted form: it ends in `'`, and the next
    // character in real source is `,` or a newline — both non-word, so a \b
    // there can never match and the assertion would only ever hold the bare
    // CLAY/TERRACOTTA form. It shipped that way once and hid a live escapee.
    const modules = [
      'src/lib/document/desk-derivation.ts',
      'src/lib/document/proposal-watch-derivation.ts',
      'src/components/document/orders-ledger.tsx',
      'src/components/document/orders-book-vendors.tsx',
      'src/components/document/ffe-section.tsx',
      'src/components/document/accounts/invoice-folio.tsx',
      'src/components/document/accounts/accounts-ledger-page.tsx',
      'src/components/document/schedule/authorization-stamp.tsx',
    ];
    const inkless: string[] = [];
    for (const relative of modules) {
      const source = readFileSync(join(APP_ROOT, relative), 'utf8');
      const lines = source.split('\n');
      lines.forEach((line, i) => {
        const namesPigment =
          /color:\s*(?:'var\(--color-(?:clay|terracotta)\)'|"var\(--color-(?:clay|terracotta)\)"|(?:CLAY|TERRACOTTA)\b)/.test(
            line,
          );
        // A multi-line descriptor puts `ink:` on the following line.
        const carriesInk = /\bink:/.test(line) || /\bink:/.test(lines[i + 1] ?? '');
        if (namesPigment && !carriesInk) inkless.push(`${relative}: ${line.trim()}`);
      });
    }
    expect(inkless).toEqual([]);
  });
});
