/**
 * Refine readout — user-facing copy catalogue (Field Capture P2, Layer 3 §3.4).
 *
 * ⚠ ESCALATE-CLASS PLACEHOLDERS, in `room-file-copy.ts`'s form and for the
 * same reason: every designer-visible string here is a design-owned decision,
 * gathered in ONE place so the design session can rule on wording without a
 * component hunt. Treat as provisional until that ruling lands.
 *
 * ─── THREE RULES THAT ARE NOT WORDING PREFERENCES ───────────────────────────
 *
 * 1. **`absoluteAccuracyCertified` is always `false`.**
 *    `evaluate_refinement_evidence` never sets it true, so `true` is
 *    unreachable. The NOT-CERTIFIED treatment therefore renders
 *    UNCONDITIONALLY — there is no "certified" branch to write, and adding one
 *    would be writing copy for a state the pipeline cannot produce.
 *
 * 2. **`loopConsistencyAdvisory` renders VERBATIM or not at all.**
 *    `refine_adapter.py:1116`: *"Nothing reads this string; it exists to be
 *    read."* R123 removed the loop comparables from the refusal set and
 *    required them reported more prominently, not interpreted. Rewriting
 *    "loop_rotation_rmse_deg 1.25→1.31 (+4.80%)" as "loop consistency: poor"
 *    would launder a number nobody in this codebase has the authority to
 *    interpret. There is deliberately NO copy key for a paraphrase.
 *
 * 3. **No string may imply the context photos were corrected.**
 *    Refine refines SfM keyframes; the plan's photo markers come from
 *    `room_scan_images` and are untouched. A designer looking at a drift
 *    figure will infer the photos moved unless told otherwise — which is
 *    exactly what `photosUnaffected` exists to say. Do not delete it as
 *    redundant; it is load-bearing.
 */

/** Metres → inches, for the one place the readout speaks the portal's unit. */
export const M_TO_IN = 39.3701;

export const REFINE_COPY = {
  /** Facts-rail key. */
  factKey: 'Refine',

  /** The mono badge. Rendered unconditionally — see rule 1 above. */
  notCertifiedBadge: 'NOT CERTIFIED',

  /** One italic sentence naming the consequence, per room-file-copy's voice. */
  notCertifiedNote:
    'These figures describe a camera reconstruction, not a measured room. Order from the drawing set’s dimensions and their tolerances — never from anything on this line.',

  /** Rendered when the run failed its own evidence test. */
  notEvidencedNote:
    'This run did not evidence refinement, so its corrected poses are not preferred anywhere. The figures below are reported as captured.',

  /** Rule 3. Load-bearing — do not remove as redundant. */
  photosUnaffected:
    'The photos pinned to this plan are unchanged. They come from a different capture lane and were never re-posed.',

  /** Fact-line summary. */
  keyframes: (n: number) => `${n} keyframe${n === 1 ? '' : 's'}`,
  unreadable: (n: number) => `${n} unreadable`,
  driftHeadline: (inches: string) => `${inches} in max shift`,
  driftUnknown: 'shift not reported',

  /** Disclosure. */
  disclosureSummary: 'the numbers',
  labelDriftMax: 'Max camera shift',
  labelDriftMedian: 'Median camera shift',
  labelKeyframes: 'Keyframes read',
  labelDropped: 'Unreadable poses',
  labelBasis: 'Path basis',
  basisRefined: 'refined',
  basisCaptured: 'as captured',
  /** §3.3's second ruling, said plainly where a reader will meet it. */
  basisMixedNote:
    'A path is called refined only when every point on it came from a refined pose. Any shortfall reads “as captured”.',
  labelVerdict: 'Verdict',
  labelAdvisory: 'Loop consistency (advisory, not gating)',
  /** Frames the verbatim string without characterising it. */
  advisoryNote:
    'Reported by the pipeline exactly as written. It gates nothing, and nothing here interprets it.',
  advisoryAbsent: 'No advisory was recorded.',
} as const;
