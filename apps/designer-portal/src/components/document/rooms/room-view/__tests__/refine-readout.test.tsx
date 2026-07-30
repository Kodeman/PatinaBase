/**
 * RefineReadout — Layer 3's ONLY designer-visible surface (ruling R-G).
 *
 * The assertions here are honesty constraints, not layout preferences:
 *
 *  · NOT CERTIFIED renders unconditionally — including for the unreachable
 *    `absoluteAccuracyCertified: true`, which the pipeline can never produce
 *    but which must not silently unlock a "certified" treatment if it ever
 *    appears.
 *  · `loopConsistencyAdvisory` renders VERBATIM, character for character.
 *  · Nothing implies the context photos were corrected, and a line saying so
 *    explicitly is always present.
 *  · No plan or orbit rendering is reachable from here (R-G): no <svg>,
 *    no <canvas>.
 */

import { render, screen } from '@testing-library/react';
import { prototypeRoom } from '@/lib/room-view/__fixtures__/room-fixture';
import { FactsRail } from '../facts-rail';
import { REFINE_COPY } from '../refine-copy';
import { RefineReadout, type RefineReadoutProps } from '../refine-readout';

const ADVISORY =
  'advisory_not_gating_r123: loop_rotation_rmse_deg 1.250000->1.310000 (+4.80%); ' +
  'loop_translation_direction_rmse_deg 2.000000->1.900000 (-5.00%); verified_loop_edges 31';

function props(overrides: Partial<RefineReadoutProps> = {}): RefineReadoutProps {
  return {
    frameCount: 62,
    usableCount: 62,
    droppedCount: 0,
    driftMaxM: 0.0428,
    driftMedianM: 0.0119,
    refinementEvidenced: true,
    absoluteAccuracyCertified: false,
    pathSource: 'refined',
    verdictReason: 'reprojection improved and loop evidence held',
    loopConsistencyAdvisory: ADVISORY,
    ...overrides,
  };
}

describe('RefineReadout — the not-certified treatment', () => {
  it('renders the NOT CERTIFIED badge and its consequence sentence', () => {
    render(<RefineReadout {...props()} />);
    expect(screen.getByText(REFINE_COPY.notCertifiedBadge)).toBeInTheDocument();
    expect(screen.getByText(REFINE_COPY.notCertifiedNote)).toBeInTheDocument();
  });

  it('renders the SAME not-certified treatment even for the unreachable true', () => {
    // `evaluate_refinement_evidence` never sets this true. If it somehow
    // appeared, nothing may relax — there is no certified branch to reach.
    render(<RefineReadout {...props({ absoluteAccuracyCertified: true })} />);
    expect(screen.getByText(REFINE_COPY.notCertifiedBadge)).toBeInTheDocument();
    expect(screen.getByText(REFINE_COPY.notCertifiedNote)).toBeInTheDocument();
    expect(screen.queryByText(/certified/i)).not.toBeNull();
    // and nothing anywhere claims certification
    expect(screen.queryByText(/\bis certified\b/i)).toBeNull();
  });

  it('adds the not-evidenced line only when the run failed its own test', () => {
    const { rerender } = render(<RefineReadout {...props()} />);
    expect(screen.queryByText(REFINE_COPY.notEvidencedNote)).toBeNull();
    rerender(<RefineReadout {...props({ refinementEvidenced: false })} />);
    expect(screen.getByText(REFINE_COPY.notEvidencedNote)).toBeInTheDocument();
  });
});

describe('RefineReadout — the advisory is verbatim', () => {
  it('renders loopConsistencyAdvisory character for character', () => {
    render(<RefineReadout {...props()} />);
    const node = screen.getByText(ADVISORY);
    expect(node).toBeInTheDocument();
    expect(node.textContent).toBe(ADVISORY);
  });

  it('does not truncate, ellipsise or reformat a long advisory', () => {
    const long = `${ADVISORY} ${'x'.repeat(400)}`;
    render(<RefineReadout {...props({ loopConsistencyAdvisory: long })} />);
    expect(screen.getByText(long).textContent).toBe(long);
    expect(screen.queryByText(/…|\.\.\./)).toBeNull();
  });

  it('never paraphrases — no "good"/"poor"/"acceptable" verdict wording appears', () => {
    const { container } = render(<RefineReadout {...props()} />);
    const text = container.textContent ?? '';
    for (const word of ['loop consistency good', 'loop consistency poor', 'acceptable drift']) {
      expect(text.toLowerCase()).not.toContain(word);
    }
  });

  it('says so plainly when no advisory was recorded, rather than inventing one', () => {
    render(<RefineReadout {...props({ loopConsistencyAdvisory: null })} />);
    expect(screen.getByText(REFINE_COPY.advisoryAbsent)).toBeInTheDocument();
  });
});

describe('RefineReadout — the photos are not implicated', () => {
  it('always states that the pinned photos are unchanged', () => {
    render(<RefineReadout {...props()} />);
    expect(screen.getByText(REFINE_COPY.photosUnaffected)).toBeInTheDocument();
  });

  it.each([
    ['evidenced + refined', props()],
    ['not evidenced', props({ refinementEvidenced: false })],
    ['captured basis', props({ pathSource: 'captured' })],
    ['no drift reported', props({ driftMaxM: null, driftMedianM: null })],
  ])('%s — no copy claims a photo was corrected', (_label, p) => {
    const { container } = render(<RefineReadout {...p} />);
    const text = (container.textContent ?? '').toLowerCase();
    expect(screen.getByText(REFINE_COPY.photosUnaffected)).toBeInTheDocument();
    for (const claim of [
      'photos corrected',
      'photos were corrected',
      'photo positions updated',
      'markers corrected',
      'repositioned the photos',
    ]) {
      expect(text).not.toContain(claim);
    }
  });
});

describe('RefineReadout — the figures', () => {
  it('leads with the max shift in inches and the usable keyframe count', () => {
    render(<RefineReadout {...props()} />);
    // 0.0428 m → 1.69 in
    expect(screen.getByText(/62 keyframes · 1\.69 in max shift/)).toBeInTheDocument();
  });

  it('reports both units in the disclosure, published unit first', () => {
    render(<RefineReadout {...props()} />);
    expect(screen.getByText('0.0428 m · 1.69 in')).toBeInTheDocument();
    expect(screen.getByText('0.0119 m · 0.47 in')).toBeInTheDocument();
  });

  it('says the shift was not reported rather than printing 0', () => {
    render(<RefineReadout {...props({ driftMaxM: null, driftMedianM: null })} />);
    expect(screen.getByText(new RegExp(REFINE_COPY.driftUnknown))).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
  });

  it('surfaces dropped poses when there are any, and stays silent when there are none', () => {
    const { rerender } = render(<RefineReadout {...props()} />);
    expect(screen.queryByText(/unreadable/)).toBeNull();
    rerender(<RefineReadout {...props({ droppedCount: 3, usableCount: 59 })} />);
    expect(screen.getByText(/3 unreadable/)).toBeInTheDocument();
  });

  it('labels a mixed path "as captured" and explains why', () => {
    render(<RefineReadout {...props({ pathSource: 'captured' })} />);
    expect(screen.getByText(REFINE_COPY.basisCaptured)).toBeInTheDocument();
    expect(screen.getByText(REFINE_COPY.basisMixedNote)).toBeInTheDocument();
  });

  it('omits the mixed-path explanation when every point was refined', () => {
    render(<RefineReadout {...props()} />);
    expect(screen.getByText(REFINE_COPY.basisRefined)).toBeInTheDocument();
    expect(screen.queryByText(REFINE_COPY.basisMixedNote)).toBeNull();
  });

  it('omits the verdict row when no reason was recorded', () => {
    render(<RefineReadout {...props({ verdictReason: null })} />);
    expect(screen.queryByText(REFINE_COPY.labelVerdict)).toBeNull();
  });
});

describe('RefineReadout — R-G scope: readout only', () => {
  it('renders no plan or orbit geometry of any kind', () => {
    const { container } = render(<RefineReadout {...props()} />);
    expect(container.querySelector('svg')).toBeNull();
    expect(container.querySelector('canvas')).toBeNull();
    expect(container.querySelector('polyline')).toBeNull();
    expect(container.querySelector('path')).toBeNull();
  });

  it('is a disclosure, not a control — no buttons, no links', () => {
    const { container } = render(<RefineReadout {...props()} />);
    expect(container.querySelector('button')).toBeNull();
    expect(container.querySelector('a')).toBeNull();
    expect(container.querySelector('details')).not.toBeNull();
  });

  it('does not throw on any degenerate combination', () => {
    expect(() =>
      render(
        <RefineReadout
          frameCount={0}
          usableCount={0}
          droppedCount={0}
          driftMaxM={null}
          driftMedianM={null}
          refinementEvidenced={false}
          absoluteAccuracyCertified={false}
          pathSource="captured"
          verdictReason={null}
          loopConsistencyAdvisory={null}
        />,
      ),
    ).not.toThrow();
  });
});

describe('FactsRail — the Refine line is absent unless the caller resolves one', () => {
  const base = {
    geometry: prototypeRoom(),
    thicknessConvention: false,
    scanDate: null,
    qualityGrade: null,
    coveragePercentage: null,
  };

  it('renders NO Refine line when the prop is omitted (the production default)', () => {
    render(<FactsRail {...base} />);
    expect(screen.queryByText(REFINE_COPY.factKey)).toBeNull();
    expect(screen.queryByText(REFINE_COPY.notCertifiedBadge)).toBeNull();
    expect(screen.queryByText(REFINE_COPY.photosUnaffected)).toBeNull();
  });

  it('renders the line, badge and disclosure when the prop is supplied', () => {
    render(<FactsRail {...base} refine={props()} />);
    expect(screen.getByText(REFINE_COPY.factKey)).toBeInTheDocument();
    expect(screen.getByText(REFINE_COPY.notCertifiedBadge)).toBeInTheDocument();
    expect(screen.getByText(ADVISORY)).toBeInTheDocument();
  });

  it('leaves every pre-existing fact untouched', () => {
    render(<FactsRail {...base} refine={props()} />);
    expect(screen.getByText(/266 sq ft/)).toBeInTheDocument();
    expect(screen.getByText(/5 walls/)).toBeInTheDocument();
    expect(
      screen.getByText('stands in for ceiling — RoomPlan captures none'),
    ).toBeInTheDocument();
  });
});
