'use client';

/**
 * A pre-work stop's root (Wave 5, OD-2). Before this the brief, discovery,
 * direction and proposal spreads printed zero `[data-index-region]` and zero
 * `[data-region-head]` elements (F16) — the ladder had nothing to index and
 * the lens had nothing to observe.
 *
 * The head, the rule and the quiet form are the paper's existing region
 * grammar; the only thing this component adds is the root that carries the key.
 * The quiet form is W4-R1's, unchanged for a pre-work stop: the head, its own
 * status line, its leader act (there is none yet — `allowNoActs`), and one
 * sr-only sentence.
 *
 * DENSITY (C-8). A pre-work key is not a `RegionFoldKey` and therefore not a
 * `STOP_FOLD_KEY`: `use-region-fold.ts` declares a closed union of eight
 * project keys, and a pre-work stop has no fold of its own to remember. So the
 * lens's reading is taken straight from the store, exactly as
 * `previous-work.tsx` takes it for `record` — the same expression C-8 states
 * for a stop with no explicit choice, written directly. The lens speaks `full`
 * or is silent, and silence means quiet.
 *
 * The head carries no ledger. A pre-work region has no fold to offer and no
 * leader act wired to it yet, which is the ratified state `allowNoActs` names.
 */

import type { CSSProperties, ReactNode } from 'react';
import { RegionHead } from '../region/region-head';
import { RegionRule } from '../region/region-rule';
import type { RegionDensity } from '../region/use-region-fold';
import { useLensDensityStore } from '@/hooks/use-lens-density';
import { quietStateSentence } from '@/lib/document/lens-quiet-status';
import {
  DOCUMENT_INDEX_LABELS,
  regionHeadingId,
  type DocumentIndexKey,
} from '@/lib/document/document-index';

/** OD-12 — the quiet height, held at every density. A pre-work head prints no
 *  standing exceptions, so every one of these roots takes the minimum. */
const QUIET_RESERVE = {
  '--doc-quiet-reserve': 'var(--doc-quiet-reserve-min)',
} as CSSProperties;

export function PreworkRegion({
  region,
  status,
  eyebrow,
  children,
}: {
  region: DocumentIndexKey;
  /**
   * The region's one-line state, sentence case — the SAME string the ladder
   * segment prints as its count line, so the rail and the paper's own head can
   * never state the stop two ways. `Nothing yet` where the stop carries no
   * number (OD-2).
   */
  status: string;
  /** The mono line above the name — the proposal's version and the stage's own
   *  sub-label, which used to ride the plain 16px head this region replaces. */
  eyebrow?: string;
  /** The spread's own body for this stop. Absent where the stop has a name and
   *  a position on the paper but nothing mounted under it yet. */
  children?: ReactNode;
}) {
  const density: RegionDensity = useLensDensityStore(region) ?? 'quiet';
  const name = DOCUMENT_INDEX_LABELS[region];
  const quiet = density === 'quiet';

  return (
    <section
      data-index-region={region}
      data-density={density}
      style={QUIET_RESERVE}
      className="mt-[var(--doc-region-gap)]"
      aria-label={name}
    >
      <RegionRule />
      <RegionHead
        // The pre-work heading ids take no project id: a brief, a discovery and
        // a proposal all exist before a project does.
        headingId={regionHeadingId(region, '')}
        name={name}
        status={status}
        eyebrow={eyebrow}
        surfaceKey="prework"
        regionKey={region}
        actions={[]}
        actsAtQuiet={quiet ? 'leader' : 'all'}
        allowNoActs
      />
      {quiet ? (
        // W4-R1 — a quiet stop prints its `RegionHead` AND NOTHING ELSE. The
        // count line IS the head's own status line, which `RegionHead` printed
        // above from the same `status` string; a second uppercase paragraph
        // beside it states one fact twice, and `data-region-count-line` is an
        // attribute the DOM contract (technical-design §5, F5) says does not
        // exist. Both were deleted from the six project stops by name, and the
        // sr-only line is the ruled per-region sentence, not a stock string.
        <p className="sr-only">{quietStateSentence(status, name)}</p>
      ) : (
        children
      )}
    </section>
  );
}
