/**
 * DraftingStrip — the deck's Option 04 anatomy, pinned as a contract.
 *
 * The live walk's finding was that the anatomy never shipped, not that a
 * behaviour was wrong. So this asserts the PARTS: the card header, the engaged
 * phase's Playfair name and live mono readout, month columns, one lane per
 * phase with its own gutter label, thread lanes after the main ones, milestone
 * diamonds inside their host lane, today's dated tick, and the hint caption.
 * If a future change quietly drops one of them, this fails.
 */

import { createRef } from 'react';
import { render, screen, within } from '@testing-library/react';
import { epochDayFromISO } from '@patina/utils';
import { DraftingStrip } from '../drafting-strip';
import {
  buildTimeScale,
  ruleLanes,
  monthColumns,
  weekGridlines,
  MAIN_LANE_H,
  type RuleBar,
} from '@/lib/document/schedule-rule-derivation';
import type { ResolvedPhase } from '@patina/utils';

const TODAY = '2026-09-15';

const phase = (id: string, start: string, end: string, lane: 'main' | 'thread' = 'main'): ResolvedPhase => ({
  id,
  start,
  end,
  lane,
  anchored: false,
  source: 'chain',
  slackDays: null,
  governingAnchorId: null,
  origin: 'anchor',
});

const PHASES = [
  phase('p1', '2026-08-01', '2026-08-28'),
  phase('p2', '2026-08-28', '2026-10-02'),
  phase('t1', '2026-09-01', '2026-11-01', 'thread'),
];

const SCALE = buildTimeScale(
  PHASES.map((p) => ({ start: p.start, end: p.end })),
  TODAY,
)!;

const bar = (id: string, name: string, start: string, durationDays: number): RuleBar => ({
  id,
  name,
  leftPct: SCALE.toX(start)!,
  widthPct: 20,
  startEpoch: epochDayFromISO(start)!,
  durationDays,
  anchored: false,
  hasInternalEndBoundary: false,
  endBoundaryLocked: false,
});

function renderStrip(overrides: Partial<React.ComponentProps<typeof DraftingStrip>> = {}) {
  const layout = ruleLanes(PHASES, ['p1', 'p2', 't1']);
  return render(
    <DraftingStrip
      layout={layout}
      bars={[bar('p1', 'Consultation', '2026-08-01', 27), bar('p2', 'Schematic Design', '2026-08-28', 35)]}
      threads={[{ id: 't1', name: 'Long Lead Procurement', leftPct: 30, widthPct: 40 }]}
      months={monthColumns(SCALE)}
      weekLines={weekGridlines(SCALE)}
      diamonds={[
        { id: 'm1', phaseId: 'p2', xPct: 55, status: 'upcoming', anchored: false },
      ]}
      milestoneNameById={() => 'Sofa approval'}
      scale={SCALE}
      todayXPct={SCALE.toX(TODAY)}
      today={TODAY}
      headerName="Schematic Design"
      headerMeta="Follows Consultation · 5w"
      rippleDiff={null}
      baselineDiff={null}
      trackRef={createRef<HTMLDivElement>()}
      barsEnabled
      engagedPhaseId="p2"
      session={null}
      getBarEdit={() => null}
      setBarEdit={() => {}}
      registerBarEl={() => {}}
      xToDay={() => epochDayFromISO(TODAY)!}
      domainMinEpoch={epochDayFromISO('2026-08-01')!}
      domainMaxEpoch={epochDayFromISO('2026-11-01')!}
      onMoveBegin={() => {}}
      onMoveFrame={() => {}}
      onResizeBegin={() => {}}
      onResizeFrame={() => {}}
      onRevealPhase={() => {}}
      onRevealMilestone={() => {}}
      onDiamondDragBegin={() => {}}
      onDiamondDragFrame={() => {}}
      phaseEndEpochById={new Map([['p2', epochDayFromISO('2026-10-02')!]])}
      suppressRefuse={false}
      {...overrides}
    />,
  );
}

describe('DraftingStrip — the deck’s anatomy', () => {
  it('wears the paper card header', () => {
    renderStrip();
    expect(screen.getByText('Frame · Schedule')).toBeVisible();
    expect(screen.getByText('Phase Dates')).toBeVisible();
  });

  it('names the engaged phase in Playfair with its live readout beside it', () => {
    renderStrip();
    // The name appears twice — as the header line and as its own lane's gutter
    // label. The header is the Playfair one.
    const heading = screen
      .getAllByText('Schematic Design')
      .find((el) => el.className.includes('font-heading'));
    expect(heading).toBeVisible();
    expect(screen.getByText('Follows Consultation · 5w')).toBeVisible();
  });

  it('rules the graph paper with month columns across the top', () => {
    renderStrip();
    for (const label of ['SEP', 'OCT', 'NOV']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it('gives every phase its own lane, labelled in its own gutter', () => {
    renderStrip();
    for (const name of ['Consultation', 'Schematic Design', 'Long Lead Procurement']) {
      expect(screen.getByRole('button', { name })).toBeVisible();
    }
  });

  it('gives every bar a slider — one per main-lane phase, none for the thread', () => {
    renderStrip();
    const sliders = screen.getAllByRole('slider');
    expect(sliders).toHaveLength(2);
    expect(sliders[0]).toHaveAttribute('aria-valuetext', expect.stringContaining('Consultation'));
  });

  it('stacks the thread lane BELOW both main lanes', () => {
    const layout = ruleLanes(PHASES, ['p1', 'p2', 't1']);
    const threadLane = layout.lanes.find((l) => l.id === 't1')!;
    expect(threadLane.index).toBe(2);
    expect(threadLane.topPx).toBe(MAIN_LANE_H * 2);
  });

  it('hosts the milestone diamond inside its phase’s lane, on the bar', () => {
    renderStrip();
    const diamond = screen.getByRole('button', { name: /Sofa approval/ });
    // p2's lane starts at MAIN_LANE_H; the bar sits at +19 and the 8px diamond
    // centres on it (+3) → the diamond must be inside p2's band, not p1's.
    expect(diamond.style.top).toBe(`${MAIN_LANE_H + 19 + 3}px`);
  });

  it('marks today and dates it under the strip', () => {
    renderStrip();
    expect(screen.getByText(/Today · Sep 15/)).toBeVisible();
  });

  it('names the three gestures in the hint caption', () => {
    renderStrip();
    expect(
      screen.getByText('Drag the bar to move it · Drag its right edge to resize · Others follow'),
    ).toBeVisible();
  });

  it('every bar carries a resize grip — a lane per phase means no shared edge', () => {
    renderStrip();
    // the grips are aria-hidden siblings with an ew-resize cursor.
    const grips = document.querySelectorAll('[style*="ew-resize"]');
    expect(grips).toHaveLength(2);
  });

  it('renders no sliders when no ripple provider is present', () => {
    renderStrip({ barsEnabled: false });
    expect(screen.queryAllByRole('slider')).toHaveLength(0);
    // the lanes and their committed spans still draw — the strip is still legible.
    expect(screen.getByRole('button', { name: 'Consultation' })).toBeVisible();
  });

  it('a previewing lane shows its consequence chip beside the lane label', () => {
    renderStrip({
      rippleDiff: {
        edit: { kind: 'phase-duration', phaseId: 'p1', durationDays: 34 },
        editedName: 'Consultation',
        phaseChanges: [
          {
            phaseId: 'p1',
            name: 'Consultation',
            fromStart: '2026-08-01',
            toStart: '2026-08-01',
            fromEnd: '2026-08-28',
            toEnd: '2026-09-04',
            moved: true,
            anchored: false,
            holds: false,
          },
          {
            phaseId: 'p2',
            name: 'Schematic Design',
            fromStart: '2026-08-28',
            toStart: '2026-09-04',
            fromEnd: '2026-10-02',
            toEnd: '2026-10-09',
            moved: true,
            anchored: false,
            holds: false,
          },
        ],
        milestoneMoves: [],
        followerCount: 1,
        heldAnchors: [],
        slackBefore: null,
        slackAfter: null,
        slackDelta: null,
        conflicts: [],
        anchorViolation: false,
        rippleSize: 2,
        durationDelta: 7,
      },
    });
    const follower = screen.getByRole('button', { name: /Schematic Design/ });
    expect(within(follower).getByText('+7d')).toBeVisible();
    // the edited lane is the cause, so it carries no chip.
    expect(within(screen.getByRole('button', { name: /Consultation/ })).queryByText(/d$/)).toBeNull();
  });
});
