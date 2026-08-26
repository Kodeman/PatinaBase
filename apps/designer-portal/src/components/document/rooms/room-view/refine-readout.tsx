/**
 * RefineReadout — Refine's output, as a diagnostic readout and nothing more
 * (Field Capture P2, Layer 3, ruling R-G).
 *
 * ─── WHAT THIS DELIBERATELY IS NOT ──────────────────────────────────────────
 *
 * Ruling R-G scoped Layer 3 to the parser, the conversion and the test suite,
 * surfaced ONLY as this readout: drift figures plus the advisory. There is no
 * plan polyline and no orbit geometry, on purpose — the product value of a
 * walked-path overlay is genuinely uncertain, no refine artifact exists in
 * production to look at, and a readout puts nothing in front of a designer
 * they might over-trust. If the rendering is later ruled in, it consumes
 * `buildCameraPath` from `lib/room-view/refined-poses.ts`; nothing here needs
 * to change.
 *
 * Pure-prop, exactly like `FactsRail`: every number is resolved by the caller
 * (room-view.tsx, from `useScanRefineArtifacts` + `refined-poses.ts`), so this
 * component owns no state, no query and no math and is unit-testable without
 * React Query or Supabase in the loop.
 *
 * The copy is in `refine-copy.ts`, which carries the three honesty rules —
 * unconditional NOT-CERTIFIED, verbatim advisory, and a photos-unaffected line
 * that is load-bearing rather than decorative.
 */

import type { ReactNode } from 'react';
import { M_TO_IN, REFINE_COPY as COPY } from './refine-copy';

export interface RefineReadoutProps {
  /** Keyframes present in the artifact. */
  frameCount: number;
  /** Keyframes that yielded a usable plan pose. */
  usableCount: number;
  /** Keyframes usable in NEITHER lane. */
  droppedCount: number;
  /** Camera-centre correction, metres. `null` when no row reported one. */
  driftMaxM: number | null;
  driftMedianM: number | null;
  /** Did the run pass its own evidence test (`refinement-evidence-v1.json`)? */
  refinementEvidenced: boolean;
  /**
   * ⚠ Always `false` in practice. Accepted as a prop so the unreachable
   * `true` can be asserted to render the SAME not-certified treatment.
   */
  absoluteAccuracyCertified: boolean;
  /** `'refined'` only when every retained point came from a refined pose. */
  pathSource: 'refined' | 'captured';
  verdictReason: string | null;
  /** R123's advisory. Rendered verbatim in DM Mono, or replaced by a plain
   *  "none recorded" line. NEVER paraphrased. */
  loopConsistencyAdvisory: string | null;
}

function inches(metres: number): string {
  return (metres * M_TO_IN).toFixed(2);
}

/** "0.043 m · 1.69 in" — the published unit first, the portal's unit beside it. */
function bothUnits(metres: number | null): string {
  if (metres == null) return '—';
  return `${metres.toFixed(4)} m · ${inches(metres)} in`;
}

export function RefineReadout({
  frameCount,
  usableCount,
  droppedCount,
  driftMaxM,
  driftMedianM,
  refinementEvidenced,
  absoluteAccuracyCertified,
  pathSource,
  verdictReason,
  loopConsistencyAdvisory,
}: RefineReadoutProps) {
  // `absoluteAccuracyCertified` is read ONLY to be ignored: the pipeline can
  // never set it true, so branching on it would write copy for an unreachable
  // state. Referenced here so the prop is not silently dead and the test that
  // passes `true` is exercising something real.
  void absoluteAccuracyCertified;

  const summary = [
    COPY.keyframes(usableCount),
    driftMaxM != null ? COPY.driftHeadline(inches(driftMaxM)) : COPY.driftUnknown,
    droppedCount > 0 ? COPY.unreadable(droppedCount) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-[14px] text-[var(--color-charcoal)]">{summary}</span>
        <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--color-clay-ink)]">
          {COPY.notCertifiedBadge}
        </span>
      </div>

      <Note>{COPY.notCertifiedNote}</Note>
      {!refinementEvidenced && <Note>{COPY.notEvidencedNote}</Note>}
      <Note>{COPY.photosUnaffected}</Note>

      <details className="mt-2">
        <summary className="inline-flex min-h-11 cursor-pointer items-center font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--color-aged-oak)] outline-none transition-colors hover:text-[var(--color-charcoal)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]">
          {COPY.disclosureSummary}
        </summary>

        <dl className="mt-1.5 space-y-1.5">
          <Row label={COPY.labelDriftMax} value={bothUnits(driftMaxM)} />
          <Row label={COPY.labelDriftMedian} value={bothUnits(driftMedianM)} />
          <Row
            label={COPY.labelKeyframes}
            value={`${usableCount} of ${frameCount}`}
          />
          <Row label={COPY.labelDropped} value={String(droppedCount)} />
          <Row
            label={COPY.labelBasis}
            value={
              pathSource === 'refined' ? COPY.basisRefined : COPY.basisCaptured
            }
          />
          {pathSource !== 'refined' && <Note>{COPY.basisMixedNote}</Note>}
          {verdictReason && <Row label={COPY.labelVerdict} value={verdictReason} />}

          <div className="pt-1">
            <dt className="font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--color-aged-oak)]">
              {COPY.labelAdvisory}
            </dt>
            <dd className="mt-1">
              {loopConsistencyAdvisory ? (
                // VERBATIM. refine_adapter.py:1116 — "Nothing reads this
                // string; it exists to be read." No truncation, no ellipsis,
                // no reformatting: `break-words` wraps it, nothing rewrites it.
                <code className="block whitespace-pre-wrap break-words font-mono text-[10.5px] leading-relaxed text-[var(--color-charcoal)]">
                  {loopConsistencyAdvisory}
                </code>
              ) : (
                <span className="text-[12px] text-[var(--color-mocha)]">
                  {COPY.advisoryAbsent}
                </span>
              )}
            </dd>
            <Note>{COPY.advisoryNote}</Note>
          </div>
        </dl>
      </details>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--color-aged-oak)]">
        {label}
      </dt>
      <dd className="font-mono text-[11.5px] text-[var(--color-charcoal)]">{value}</dd>
    </div>
  );
}

function Note({ children }: { children: ReactNode }) {
  return (
    <p className="mt-1 font-heading text-[12px] italic leading-snug text-[var(--color-mocha)]">
      {children}
    </p>
  );
}
