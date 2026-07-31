/**
 * The composition step between Layer 2's delivery record and Layer 3's readout
 * (Field Capture P2, ruling R-G).
 *
 * Extracted out of `room-view.tsx`'s `useMemo` so the whole chain —
 * `room_files.present` → `parseScanRefineRecord` → these props → the rendered
 * `RefineReadout` — can be exercised by one test against the document Layer 2
 * actually writes. Layer 2 and Layer 3 shipped the same day with thorough
 * suites on either side of a boundary neither crossed, and disagreed about the
 * record completely; a pure function here is what lets a test cross it.
 *
 * Behaviour is byte-for-byte the caller's previous inline body. `undefined`
 * means "render nothing", and every rung degrades to it: no error UI, no toast,
 * no console noise.
 */

import type { ScanRefineArtifactSet } from '@patina/supabase';
import type { PhotoProvenance } from './photo-poses';
import {
  buildCameraPath,
  parsePoseDeltas,
  parseRefinementEvidence,
  poseDriftStats,
} from './refined-poses';
import type { RefineReadoutProps } from '@/components/document/rooms/room-view/refine-readout';

export function buildRefineReadoutProps(
  artifacts: ScanRefineArtifactSet | null | undefined,
  provenance: PhotoProvenance | null | undefined,
): RefineReadoutProps | undefined {
  if (!artifacts) return undefined;

  const evidence = parseRefinementEvidence(
    artifacts.documents['refinement-evidence-v1.json'],
  );
  const deltas = parsePoseDeltas(artifacts.documents['pose-deltas-v1.json']);
  if (!deltas || deltas.length === 0) return undefined;

  // The record's verdict and the evidence document's verdict should agree;
  // when only one is readable, take it. `false` is the fail-closed default,
  // and it only ever makes the readout MORE conservative.
  const refinementEvidenced =
    evidence?.refinementEvidenced ?? artifacts.record.refinementEvidenced;

  const path = buildCameraPath(deltas, provenance, { refinementEvidenced });
  if (!path) return undefined;

  const drift = poseDriftStats(deltas);
  return {
    frameCount: path.frameCount,
    usableCount: path.usableCount,
    droppedCount: path.droppedCount,
    driftMaxM: drift?.maxM ?? null,
    driftMedianM: drift?.medianM ?? null,
    refinementEvidenced,
    absoluteAccuracyCertified:
      evidence?.absoluteAccuracyCertified ??
      artifacts.record.absoluteAccuracyCertified,
    pathSource: path.source,
    verdictReason:
      evidence?.verdictReason ?? artifacts.record.verdictReason ?? null,
    // Verbatim, from whichever source carries it. Never rewritten.
    loopConsistencyAdvisory:
      evidence?.loopConsistencyAdvisory ??
      artifacts.record.loopConsistencyAdvisory ??
      null,
  };
}
