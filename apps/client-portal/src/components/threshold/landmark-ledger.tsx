'use client';

import { ScoredAction } from '@/components/threshold/instruments/scored-action';

/* ── The landmark ledger (PP-5 · IA-20) ─────────────────────────────────────
   Five names under the doorplate, each one a jump to the place it names. It
   is page furniture, not a header and not persistent navigation: it is struck
   once at the top of the page, where a reader looks for the index, rather
   than printed after the content it indexes.

   A LANDMARK WHOSE TARGET DOES NOT RENDER IS OMITTED — never drawn dim, never
   drawn disabled. An index pointing at an id that is not on the page is the
   failure IA-21 names, and a disabled landmark is that same lie with a
   costume on. The caller answers for each target, because only the page knows
   which of its regions drew.

   "What you owe" carries `data-never-dim`: the money is the one landmark that
   must stay legible while the house is read as it moved. ─────────────────── */

interface Landmark {
  key: string;
  label: string;
  /** The element id, without its hash. */
  anchor: string;
  neverDim?: true;
}

export interface LandmarkLedgerProps {
  /** `#doorstep` — the page has spoken and the doorstep stands. */
  whereWeAre: boolean;
  /** `#changed` — the doorstep's since-yesterday block drew. */
  whatChanged: boolean;
  /** `#letterbox` — the letterbox drew. */
  whatYouOwe: boolean;
  /**
   * The first ask that actually drew — `wall`, `door`, or `approval-<id>` —
   * or null when nothing is asking.
   */
  whatNeedsYou: string | null;
  /** `#mat-papers` — the mat's papers column drew. */
  thePapers: boolean;
}

export function LandmarkLedger({
  whereWeAre,
  whatChanged,
  whatYouOwe,
  whatNeedsYou,
  thePapers,
}: LandmarkLedgerProps) {
  const landmarks: Landmark[] = [
    ...(whereWeAre
      ? [{ key: 'where_we_are', label: 'Where we are', anchor: 'doorstep' }]
      : []),
    ...(whatChanged
      ? [{ key: 'what_changed', label: 'What changed', anchor: 'changed' }]
      : []),
    ...(whatYouOwe
      ? [
          {
            key: 'what_you_owe',
            label: 'What you owe',
            anchor: 'letterbox',
            neverDim: true as const,
          },
        ]
      : []),
    ...(whatNeedsYou
      ? [{ key: 'what_needs_you', label: 'What needs you', anchor: whatNeedsYou }]
      : []),
    ...(thePapers
      ? [{ key: 'the_papers', label: 'The papers', anchor: 'mat-papers' }]
      : []),
  ];

  if (landmarks.length === 0) return null;

  return (
    <nav
      aria-label="Landmarks"
      data-testid="landmark-ledger"
      className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-0 p-0.5"
    >
      {landmarks.map((landmark) => (
        <ScoredAction
          key={landmark.key}
          href={`#${landmark.anchor}`}
          actionKey={`landmark_${landmark.key}`}
          regionKey="landmarks"
          surfaceKey="the_threshold"
          variant="tertiary"
          className="t-head"
          data-landmark={landmark.key}
          data-never-dim={landmark.neverDim ? '' : undefined}
        >
          {landmark.label}
        </ScoredAction>
      ))}
    </nav>
  );
}
