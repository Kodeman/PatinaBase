/**
 * THE CROSS-BOUNDARY ROUND TRIP — Layer 2's real output, rendered by Layer 3.
 *
 * ─── WHY THIS FILE EXISTS ───────────────────────────────────────────────────
 *
 * `refine_delivery.py` (the writer, Layer 2) and `use-scan-refine-artifacts.ts`
 * + `RefineReadout` (the reader, Layer 3) shipped on the same day, each with a
 * thorough suite, and did not agree about the record they exchange. The reader
 * looked for the delivery record under `present.refine_engine` — which holds
 * the engine NAME as a string, and which migration 00377 (already applied to
 * production) reads as TEXT — and for the verdict at the record's top level,
 * where the writer nests it under `verdict`. A successful production delivery
 * would have written eleven immutable objects and rendered NOTHING, silently,
 * looking exactly like correct pre-enablement behaviour.
 *
 * Both suites passed in isolation. That is the failure mode this file exists
 * to make impossible: it runs the WHOLE chain on bytes the pipeline actually
 * produced.
 *
 *   room_files.present  (build_present_patch, pinned)
 *     → parseScanRefineRecord          [@patina/supabase]
 *       → buildRefineReadoutProps      [lib/room-view]
 *         → <RefineReadout />          [this directory]
 *           → the DOM a designer reads
 *
 * ─── THE FIXTURES ARE GENERATED, AND PINNED FROM THE PYTHON SIDE ────────────
 *
 * All three are produced by driving the SHIPPED runner + publisher into a local
 * scratch sink and are asserted byte-for-byte by
 * `services/scan-pipeline/tests/test_refine_delivery.py`:
 *
 *   · `refine-present-patch.json`            ← `build_present_patch(...)`
 *   · `refine-published-pose-deltas-v1.json` ← the published artifact's bytes
 *   · `refine-published-evidence-v1.json`    ← the published artifact's bytes
 *
 * So the writer cannot move without a Python test reddening, and the reader
 * cannot move without this one reddening. Neither can drift alone.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import { parseScanRefineRecord, type ScanRefineArtifactSet } from '@patina/supabase';
import type { PhotoProvenance } from '@/lib/room-view/photo-poses';
import { buildRefineReadoutProps } from '@/lib/room-view/refine-readout-props';
import { RefineReadout } from '../refine-readout';
import { REFINE_COPY } from '../refine-copy';

// ─────────────────────────────────────────────────────────────────────────────
// The pinned artefacts, read from disk as bytes → JSON
// ─────────────────────────────────────────────────────────────────────────────

const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..', '..', '..', '..');

function readFixture(relative: string): unknown {
  return JSON.parse(readFileSync(join(REPO_ROOT, relative), 'utf-8'));
}

const PRESENT = readFixture(
  'packages/supabase/src/hooks/__fixtures__/refine-present-patch.json',
) as Record<string, unknown>;

const POSE_DELTAS = readFixture(
  'apps/designer-portal/src/lib/room-view/__fixtures__/refine-published-pose-deltas-v1.json',
);

const EVIDENCE = readFixture(
  'apps/designer-portal/src/lib/room-view/__fixtures__/refine-published-evidence-v1.json',
);

/** The delivery's own CLI identity — `room_file/user-1/scan-1/v3/refine`. */
const CTX = { scanId: 'scan-1', roomFileId: 'room-file-1', roomFileVersion: 3 };

/** The simplest well-formed plan frame: no yaw, no offset. */
const PROVENANCE: PhotoProvenance = {
  originYawDeg: 0,
  originOffsetM: { x: 0, z: 0 },
};

/** The advisory as the PIPELINE wrote it — the string every step must preserve. */
const PUBLISHED_ADVISORY = (
  ((PRESENT.refine as Record<string, unknown>).verdict as Record<string, unknown>)
    .loopConsistencyAdvisory
) as string;

function resolveArtifactSet(): ScanRefineArtifactSet {
  const record = parseScanRefineRecord(PRESENT, CTX);
  // Named here rather than asserted with `!`: a null record is the exact
  // defect this file exists to catch, and it should read as a sentence.
  if (!record) {
    throw new Error(
      'parseScanRefineRecord returned null for the document ' +
        'build_present_patch actually writes — the reader and the writer ' +
        'disagree about the record again',
    );
  }
  return {
    record,
    documents: {
      'pose-deltas-v1.json': POSE_DELTAS,
      'refinement-evidence-v1.json': EVIDENCE,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────

describe('round trip — a real delivery, all the way to the DOM', () => {
  it('the record parses; a null here IS the shipped defect', () => {
    expect(parseScanRefineRecord(PRESENT, CTX)).not.toBeNull();
  });

  it('the record resolves the two keys the readout needs, as bare keys', () => {
    const { record } = resolveArtifactSet();
    expect(record.bucket).toBe('room-scans');
    for (const name of ['pose-deltas-v1.json', 'refinement-evidence-v1.json']) {
      expect(record.keysByName[name]).toBe(
        `room_file/user-1/scan-1/v3/refine/${name}`,
      );
      expect(record.keysByName[name]).not.toContain('://');
    }
  });

  it('composes readout props from the published documents', () => {
    const props = buildRefineReadoutProps(resolveArtifactSet(), PROVENANCE);
    expect(props).toBeDefined();
    expect(props!.frameCount).toBeGreaterThan(0);
    expect(props!.usableCount).toBeGreaterThan(0);
    // Unreachable-by-construction — `evaluate_refinement_evidence` never sets
    // it. Asserted so a writer that started setting it is caught here.
    expect(props!.absoluteAccuracyCertified).toBe(false);
    expect(props!.loopConsistencyAdvisory).toBe(PUBLISHED_ADVISORY);
  });

  it('RENDERS — and shows the advisory verbatim, character for character', () => {
    const props = buildRefineReadoutProps(resolveArtifactSet(), PROVENANCE)!;
    render(<RefineReadout {...props} />);

    // The advisory reaches the DOM UNCHANGED: same node, exact text. Not a
    // substring match — a truncation or a re-format would pass containment
    // and fail this.
    const advisory = screen.getByText(PUBLISHED_ADVISORY);
    expect(advisory.textContent).toBe(PUBLISHED_ADVISORY);
    expect(PUBLISHED_ADVISORY).toMatch(/^advisory_not_gating_r123: /);
    expect(PUBLISHED_ADVISORY).toContain('loop_rotation_rmse_deg');
    expect(PUBLISHED_ADVISORY).toContain('loop_translation_direction_rmse_deg');
    expect(PUBLISHED_ADVISORY).toContain('verified_loop_edges');

    // The not-certified treatment is unconditional (rule 1 of refine-copy).
    expect(screen.getByText(REFINE_COPY.notCertifiedBadge)).toBeInTheDocument();
    expect(screen.getByText(REFINE_COPY.notCertifiedNote)).toBeInTheDocument();
    // …and the photos-unaffected line, which is load-bearing, not decorative.
    expect(screen.getByText(REFINE_COPY.photosUnaffected)).toBeInTheDocument();
  });

  it('renders the numbers the published deltas actually carry', () => {
    const props = buildRefineReadoutProps(resolveArtifactSet(), PROVENANCE)!;
    render(<RefineReadout {...props} />);

    expect(
      screen.getByText(new RegExp(REFINE_COPY.keyframes(props.usableCount))),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        props.pathSource === 'refined'
          ? REFINE_COPY.basisRefined
          : REFINE_COPY.basisCaptured,
      ),
    ).toBeInTheDocument();
  });

  it('nothing in the rendered output paraphrases the advisory', () => {
    const props = buildRefineReadoutProps(resolveArtifactSet(), PROVENANCE)!;
    const { container } = render(<RefineReadout {...props} />);
    const text = container.textContent ?? '';

    // The full string is present exactly once, and no interpretation of it
    // appears anywhere. R123 required the numbers reported, not judged.
    expect(text.split(PUBLISHED_ADVISORY)).toHaveLength(2);
    for (const banned of [
      'loop consistency: poor',
      'loop consistency: good',
      'loop consistency ok',
      'consistency degraded',
    ]) {
      expect(text.toLowerCase()).not.toContain(banned);
    }
  });
});
