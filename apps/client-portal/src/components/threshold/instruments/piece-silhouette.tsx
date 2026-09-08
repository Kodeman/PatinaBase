/* ── PIECE SILHOUETTE — what stands in the plate when no photograph does ─────
   R142: the source hierarchy ends in a DRAWING, never a hash block, never a
   blank fill, never the browser's broken-image glyph. Five generic outlines —
   chair, table, case, light, textile — each one line work at 1px in
   `--ink-faint`, with a single detail line and one secondary hatch at half
   stroke opacity (house sheet §F-A: `--rail` is for fills, never a stroke).

   THE CATEGORY IS READ, NOT INVENTED. `ClientSelection` carries a loose
   `itemType` ('furniture', 'lighting', 'trade', 'product') and the piece's own
   name, so the outline is chosen from both. Nothing matches → `case`, the most
   neutral of the five: a box standing on a floor line, which claims nothing
   about the piece beyond that it is a thing in a room. ───────────────────── */

export type SilhouetteCategory = 'chair' | 'table' | 'case' | 'light' | 'textile';

/** First match wins, so the narrower vocabularies are read first. */
const CATEGORY_WORDS: ReadonlyArray<readonly [SilhouetteCategory, RegExp]> = [
  ['light', /light|lamp|sconce|chandelier|pendant|luminaire|fixture/i],
  ['textile', /rug|runner|carpet|curtain|drape|textile|upholst|pillow|cushion|throw/i],
  ['chair', /chair|stool|settee|sofa|bench|seating|ottoman/i],
  ['table', /table|desk|console/i],
  ['case', /case|cabinet|shelv|shelf|credenza|sideboard|bookcase|dresser|wardrobe|storage/i],
];

export function silhouetteCategory(
  name: string,
  itemType?: string | null,
): SilhouetteCategory {
  const subject = `${name} ${itemType ?? ''}`;
  for (const [category, pattern] of CATEGORY_WORDS) {
    if (pattern.test(subject)) return category;
  }
  return 'case';
}

const STROKE = 'var(--ink-faint)';
const FLOOR_Y = 82;

/** The outline, the one detail line, and the one hatch, per category. */
const OUTLINES: Record<SilhouetteCategory, { paths: string[]; detail: string; hatch: string }> = {
  chair: {
    paths: ['M30 14 C24 30 24 46 30 58', 'M30 58 L70 60', 'M70 60 L76 50', 'M34 60 L30 80', 'M69 62 L74 80'],
    detail: 'M36 46 L69 48',
    hatch: 'M34 22 C30 34 30 44 34 52',
  },
  table: {
    paths: ['M14 40 L82 40', 'M20 40 L20 80', 'M76 40 L76 80'],
    detail: 'M18 48 L78 48',
    hatch: 'M28 42 L28 46 M36 42 L36 46 M44 42 L44 46',
  },
  case: {
    paths: ['M22 14 L74 14 L74 80 L22 80 Z'],
    detail: 'M22 38 L74 38 M22 60 L74 60',
    hatch: 'M30 20 L30 34 M36 20 L36 34 M42 22 L42 34',
  },
  light: {
    paths: ['M34 20 L62 20 L70 44 L26 44 Z', 'M48 44 L48 74', 'M34 76 L62 76'],
    detail: 'M28 52 L68 52',
    hatch: 'M40 24 L36 40 M48 24 L44 40 M56 24 L52 40',
  },
  textile: {
    paths: ['M14 60 L74 60 L82 76 L22 76 Z', 'M74 60 L82 76'],
    detail: 'M22 66 L70 66',
    hatch: 'M30 62 L26 74 M40 62 L36 74 M50 62 L46 74',
  },
};

export interface PieceSilhouetteProps {
  category: SilhouetteCategory;
  /** The piece, so the drawing says whose outline it is. */
  name: string;
}

export function PieceSilhouette({ category, name }: PieceSilhouetteProps) {
  const outline = OUTLINES[category];
  return (
    <svg
      data-testid="piece-silhouette"
      data-silhouette={category}
      role="img"
      aria-label={`A drawing of ${name}`}
      viewBox="0 0 96 96"
      className="block h-full w-full"
      style={{ fill: 'none', stroke: STROKE, strokeWidth: 1 }}
    >
      <g vectorEffect="non-scaling-stroke">
        {outline.paths.map((d) => (
          <path key={d} d={d} />
        ))}
        <path data-testid="piece-silhouette-detail" d={outline.detail} />
        <path data-testid="piece-silhouette-hatch" d={outline.hatch} strokeOpacity={0.5} />
        <line x1={10} y1={FLOOR_Y} x2={86} y2={FLOOR_Y} />
      </g>
    </svg>
  );
}
