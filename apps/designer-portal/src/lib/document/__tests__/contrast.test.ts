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

import { existsSync, readdirSync, readFileSync } from 'node:fs';
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

/* ── R126 · The Life Review ──────────────────────────────────────────────
 *
 * The direction added three kinds of token the F56 guard above cannot see: a
 * third paper stock, five stamp fills, and six saturated tabs. LIGHT_GROUNDS
 * is a hand-authored map, so a new ground is silently unmeasured until someone
 * names it — these describes name them.
 *
 * The rail is gated against the register it ACTUALLY prints, not the
 * cross-product. Its register is partial by ruling (charcoal, the muted ramp,
 * clay-ink); terracotta-, golden-hour- and sage-ink never appear on it, and
 * measuring those three deliberate absences would read them as failures.
 */

/** `--x: var(--y)` aliases, so a token declared through another resolves to a
 *  real hex rather than dropping out of parseTokens' hex-only map. */
function parseAliases(css: string): Map<string, string> {
  const aliases = new Map<string, string>();
  const declaration = /(--[a-z0-9-]+)\s*:\s*var\((--[a-z0-9-]+)\)\s*;/g;
  let match: RegExpExecArray | null;
  while ((match = declaration.exec(css)) !== null) {
    aliases.set(match[1]!, match[2]!);
  }
  return aliases;
}

const aliases = parseAliases(css);

function resolveToken(name: string): string {
  let current = name;
  for (let hop = 0; hop < 8; hop += 1) {
    const hex = tokens.get(current);
    if (hex) return hex;
    const next = aliases.get(current);
    if (!next) break;
    current = next;
  }
  throw new Error(`${name} resolves to no hex in globals.css`);
}

/** The three real muted steps (R126). All three were --color-quiet-ink. */
const MUTED_RAMP = ['--text-muted', '--text-subtle', '--text-faint'] as const;

/** The three paper stocks, and only three. */
const PAPER_STOCKS = {
  '--doc-paper': '#FCFAF6',
  '--color-off-white': '#FAF7F2',
  '--doc-rail-stock': '#E8E3DB',
} as const;

const STAMP_FILLS = [
  '--fill-ordered-tint',
  '--fill-delivered-tint',
  '--fill-decision-tint',
  '--fill-damaged-tint',
  '--fill-anchor-tint',
] as const;

const STAGE_TABS = [
  '--tab-brief',
  '--tab-discovery',
  '--tab-direction',
  '--tab-proposal',
  '--tab-project',
  '--tab-install',
] as const;

const WHITE = '#FFFFFF';

/** Reported as a labelled map so a failure names the pair and the ratio. */
function failuresBelowAA(
  pairs: [label: string, ink: string, ground: string][],
): [string, number][] {
  return pairs
    .map(([label, ink, ground]) => [
      label,
      Number(contrastRatio(ink, ground).toFixed(2)),
    ] as [string, number])
    .filter(([, ratio]) => ratio < AA_NORMAL_TEXT);
}

describe('R126 · the three muted steps are three, and all three are legible', () => {
  it('declares muted, subtle and faint as three DIFFERENT values', () => {
    // The defect this replaces: all three aliased --color-quiet-ink, so the
    // ramp had one step wearing three names. A regression that re-collapses
    // any two of them must fail here rather than read as a quiet ramp.
    const values = MUTED_RAMP.map(resolveToken);
    expect(new Set(values).size).toBe(MUTED_RAMP.length);
  });

  it('clears 4.5:1 on the paper, the desk ground and the rail', () => {
    const pairs = MUTED_RAMP.flatMap((ink) =>
      Object.entries(PAPER_STOCKS).map(
        ([ground, groundHex]) =>
          [`${ink} on ${ground} (${groundHex})`, resolveToken(ink), groundHex] as [
            string,
            string,
            string,
          ],
      ),
    );
    expect(failuresBelowAA(pairs)).toEqual([]);
  });
});

/** A file "on the rail" by name (any `spine*` file at the top of
 *  components/document/, or anything under a components/document/spine/
 *  subdirectory — OD-16 has that directory arriving in W3 while
 *  spine-running-index.tsx/spine-shelved-blocks.tsx/spine-timer.tsx are
 *  deleted piecemeal across Waves 1-2), plus margin-rail.tsx explicitly. A
 *  hard-coded list goes stale the day any of those moves lands; this
 *  resolves the set fresh on every run so the guard tracks whatever ships. */
function resolveRailFiles(): string[] {
  const documentDir = join(SRC_ROOT, 'components/document');
  const topLevel = readdirSync(documentDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /spine.*\.tsx$/i.test(entry.name))
    .map((entry) => join(documentDir, entry.name));

  const spineSubdir = join(documentDir, 'spine');
  const nested = existsSync(spineSubdir)
    ? readdirSync(spineSubdir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.tsx'))
        .map((entry) => join(spineSubdir, entry.name))
    : [];

  const marginRail = join(documentDir, 'margin-rail.tsx');

  return [...new Set([...topLevel, ...nested, marginRail])]
    .filter((file) => existsSync(file))
    .map((file) => file.slice(APP_ROOT.length + 1));
}

/** The rail's register is partial BY RULING — files painting ON the rail may
 *  only spend inks the rail holds. Shared by the rail and (once it exists)
 *  the paper-ground scan below, so both check the same three text forms:
 *  the Tailwind arbitrary-value class, the Tailwind arbitrary-property
 *  class, and the inline `style={{ color: … }}` form. */
function pigmentOffenders(files: string[], pigments: readonly string[]): string[] {
  return files.flatMap((file) => {
    const source = readFileSync(join(APP_ROOT, file), 'utf8');
    return pigments.flatMap((pigment) => {
      const escaped = pigment.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
      const forms = [
        new RegExp(`text-\\[var\\(${escaped}\\)\\]`),
        new RegExp(`\\[color:var\\(${escaped}\\)\\]`),
        new RegExp(`style=\\{\\{[^}]*?color:\\s*['"]?var\\(${escaped}\\)`, 's'),
      ];
      return forms.some((form) => form.test(source)) ? [`${file} → ${pigment}`] : [];
    });
  });
}

describe('R126 · --doc-rail-stock holds the register it prints', () => {
  it('is declared, and at the ruled value', () => {
    // The rail was ruled to #E8E3DB over A's own #EFE7DA — separation over
    // register — so a retune has to be a ruling, not an edit.
    expect(tokens.get('--doc-rail-stock')).toBe('#E8E3DB');
  });

  it('carries charcoal, the muted ramp and clay-ink at 4.5:1', () => {
    const rail = resolveToken('--doc-rail-stock');
    const printed = ['--text-primary', ...MUTED_RAMP, '--color-clay-ink'];
    const pairs = printed.map(
      (ink) => [`${ink} on the rail`, resolveToken(ink), rail] as [string, string, string],
    );
    expect(failuresBelowAA(pairs)).toEqual([]);
  });

  it('resolves the rail file glob to at least today\'s five files', () => {
    // A glob that silently resolves to zero (or too few) files would make
    // every offender assertion below vacuously true — a renamed or moved
    // rail file must fail this loudly, not go quiet.
    expect(resolveRailFiles().length).toBeGreaterThanOrEqual(5);
  });

  it('prints no rail label in a pigment that fails on it', () => {
    // The walk measured "On this paper" at 3.51:1 — --color-aged-oak on the
    // rail — and the running index's inactive values with it. The rail's
    // register is partial BY RULING, so the guard is the other half of that
    // ruling: the files that paint ON the rail may only spend inks the rail
    // holds. aged-oak (3.51) and clay (1.82) are not among them.
    const rail = resolveToken('--doc-rail-stock');
    const OFF_REGISTER = ['--color-aged-oak', '--color-clay'] as const;
    for (const pigment of OFF_REGISTER) {
      expect(contrastRatio(resolveToken(pigment), rail)).toBeLessThan(
        AA_NORMAL_TEXT,
      );
    }

    expect(pigmentOffenders(resolveRailFiles(), OFF_REGISTER)).toEqual([]);
  });

  it('scans the paper-ground files (once they exist) against --doc-paper, not rail stock', () => {
    // lens-band.tsx lands in W3 (OD-6/OD-8) sitting on the PAPER ground, not
    // the rail — lumping it into RAIL_FILES above would measure it against
    // the wrong stock. This list is separate so the day the file exists it
    // is scanned against --doc-paper, with whichever base pigments actually
    // fail there (computed fresh, not assumed identical to the rail's set).
    const PAPER_FILES = ['src/components/document/lens-band.tsx'].filter(
      (file) => existsSync(join(APP_ROOT, file)),
    );
    if (PAPER_FILES.length === 0) {
      return;
    }
    const paper = resolveToken('--doc-paper');
    const OFF_REGISTER_ON_PAPER = (['--color-aged-oak', '--color-clay'] as const).filter(
      (pigment) => contrastRatio(resolveToken(pigment), paper) < AA_NORMAL_TEXT,
    );
    expect(pigmentOffenders(PAPER_FILES, OFF_REGISTER_ON_PAPER)).toEqual([]);
  });

  it('holds the inks the rail labels now take, at their measured ratios', () => {
    // The two labels the walk failed, at the tokens they were moved to.
    const rail = resolveToken('--doc-rail-stock');
    const measured = {
      'On this paper (--text-muted)': Number(
        contrastRatio(resolveToken('--text-muted'), rail).toFixed(2),
      ),
      'running-index value (--text-muted)': Number(
        contrastRatio(resolveToken('--text-muted'), rail).toFixed(2),
      ),
      'spine timer label (--color-quiet-ink)': Number(
        contrastRatio(resolveToken('--color-quiet-ink'), rail).toFixed(2),
      ),
      'clay-ink, where the mockup shows clay': Number(
        contrastRatio(resolveToken('--color-clay-ink'), rail).toFixed(2),
      ),
    };
    expect(
      Object.entries(measured).filter(([, ratio]) => ratio < AA_NORMAL_TEXT),
    ).toEqual([]);
  });

  it('separates from the sheet and the desk ground it flanks', () => {
    // The rail is a GROUND against two other grounds: it has to be seen as a
    // different stock without becoming a second colour field.
    const rail = resolveToken('--doc-rail-stock');
    for (const ground of ['--doc-paper', '--color-off-white'] as const) {
      expect(contrastRatio(rail, resolveToken(ground))).toBeGreaterThan(1.1);
    }
  });
});

describe('R126 · the five stamp fills are grounds, and fully gated', () => {
  it.each(STAMP_FILLS)('%s carries charcoal and the muted ramp', (fill) => {
    // The recipe's whole unlock: a CHARCOAL word, not the state's own ink, is
    // what let the fill sit deep enough to read as filled. State is hue;
    // legibility is charcoal.
    const ground = resolveToken(fill);
    const pairs = ['--text-primary', ...MUTED_RAMP].map(
      (ink) => [`${ink} on ${fill}`, resolveToken(ink), ground] as [string, string, string],
    );
    expect(failuresBelowAA(pairs)).toEqual([]);
  });

  it('keeps all five at one value, so they separate by hue and not by depth', () => {
    // One recipe at one common value (~1.18:1 off the paper) is the ruling.
    // S5's DELIVERED joined on the same terms: sage cut to the same value, so
    // it takes its place on the plane rather than outranking the other four.
    // A fill that drifts deeper would read as a different rank of state.
    const paper = resolveToken('--doc-paper');
    for (const fill of STAMP_FILLS) {
      const ratio = contrastRatio(resolveToken(fill), paper);
      expect(ratio).toBeGreaterThan(1.15);
      expect(ratio).toBeLessThan(1.22);
    }
  });
});

/* T3 — the eighteen hover washes. parseTokens is hex-only, so every rgba wash
 * was invisible to this guard: FINAL's stated invariant ("every wash lands at
 * ~1.12:1 over its own ground; the rule is the ratio, not the alpha") was
 * unmeasured, and a wash IS a ground — body text prints on it the moment a
 * pointer lands on the row. Composited here over the ground each one actually
 * paints on, and gated on the inks that print over it. */

interface Wash {
  name: string;
  rgba: [number, number, number, number];
}

function parseWashes(css: string): Wash[] {
  const washes: Wash[] = [];
  const declaration =
    /(--wash-[a-z0-9-]+)\s*:\s*rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)\s*;/g;
  let match: RegExpExecArray | null;
  while ((match = declaration.exec(css)) !== null) {
    washes.push({
      name: match[1]!,
      rgba: [
        Number(match[2]),
        Number(match[3]),
        Number(match[4]),
        Number(match[5]),
      ],
    });
  }
  return washes;
}

/** Source-over compositing, which is what the browser does with an rgba
 *  background on an opaque ground. */
function composite(
  rgba: [number, number, number, number],
  groundHex: string,
): string {
  const ground = toRgb(groundHex);
  const [r, g, b, alpha] = rgba;
  const mixed = [r, g, b].map((channel, i) =>
    Math.round(channel * alpha + ground[i]! * (1 - alpha)),
  );
  return `#${mixed.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** Where each wash is painted. The six stage washes open under a ROSTER line,
 *  which sits on the desk ground; the three state washes open under an FF&E
 *  line, which sits on the document sheet. `-still` is the same wash at three
 *  quarters of the alpha, on the same ground. */
const ROSTER_WASHES = [
  'brief',
  'discovery',
  'direction',
  'proposal',
  'project',
  'install',
];

function washGround(name: string): string {
  const stem = name.replace(/^--wash-/, '').replace(/-still$/, '');
  return ROSTER_WASHES.includes(stem) ? '#FAF7F2' : '#FCFAF6';
}

/** What prints on a hovered row: the name, the meta lines, the clay score and
 *  the overdue clause. */
const WASH_INKS = [
  '--text-primary',
  '--text-muted',
  '--color-clay-ink',
  '--color-terracotta-ink',
] as const;

describe('R126 · every hover wash is a ground, and holds the ink that prints on it', () => {
  const washes = parseWashes(css);

  it('finds all eighteen, so a renamed or deleted wash fails loudly', () => {
    // Nine tones × swept and still. A guard that silently measures nothing is
    // the exact failure this describe exists to close.
    expect(washes).toHaveLength(18);
  });

  it.each(washes.map((wash) => [wash.name, wash] as const))(
    '%s carries body ink, muted, clay-ink and terracotta-ink at 4.5:1',
    (_name, wash) => {
      const ground = washGround(wash.name);
      const composited = composite(wash.rgba, ground);
      const pairs = WASH_INKS.map(
        (ink) =>
          [
            `${ink} on ${wash.name} over ${ground} (${composited})`,
            resolveToken(ink),
            composited,
          ] as [string, string, string],
      );
      expect(failuresBelowAA(pairs)).toEqual([]);
    },
  );

  it('holds each wash at ~1.12:1 over its own ground — the ratio, not the alpha', () => {
    // FINAL: "the alpha follows the pigment's value ... so the highlight reads
    // the same on both surfaces." A retune of any alpha that breaks the common
    // value lands here rather than silently.
    const swept = washes.filter((wash) => !wash.name.endsWith('-still'));
    for (const wash of swept) {
      const ground = washGround(wash.name);
      const ratio = contrastRatio(composite(wash.rgba, ground), ground);
      expect(ratio).toBeGreaterThan(1.09);
      expect(ratio).toBeLessThan(1.16);
    }
  });

  it('keeps every -still wash lighter than the swept wash it stands in for', () => {
    // Reduced motion takes three quarters of the alpha: a flat tint, applied
    // instantly. Lighter, never deeper.
    for (const wash of washes.filter((w) => w.name.endsWith('-still'))) {
      const swept = washes.find(
        (w) => w.name === wash.name.replace(/-still$/, ''),
      );
      expect(swept).toBeDefined();
      expect(wash.rgba[3]).toBeLessThan(swept!.rgba[3]);
    }
  });
});

describe('R126 · the six stage tabs are dark grounds for a white label', () => {
  it.each(STAGE_TABS)('%s reaches 4.5:1 against white', (tab) => {
    // White is a literal, not a token: naming it as a text token would measure
    // it against every paper ground it never touches.
    expect(failuresBelowAA([[`white on ${tab}`, WHITE, resolveToken(tab)]])).toEqual([]);
  });

  it('steps down in value across the six, so the naming survives greyscale', () => {
    // The six carry a movement's name on two ladders at once. The value ladder
    // is the one a colourblind read and a greyscale print are left with.
    const ratios = STAGE_TABS.map((tab) => contrastRatio(WHITE, resolveToken(tab)));
    for (let i = 1; i < ratios.length; i += 1) {
      expect(ratios[i]! / ratios[i - 1]!).toBeGreaterThanOrEqual(1.05);
    }
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
