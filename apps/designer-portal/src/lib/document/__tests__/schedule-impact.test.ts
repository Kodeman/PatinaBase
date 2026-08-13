/**
 * R110 — "Hardening is disclosed at consent." Pins the ceremony IMPACT
 * derivation: what a studio-side act may state before it is confirmed, and when
 * it must say honestly that it cannot compute the effect (the downgrade the
 * server then enforces by writing a proposal instead of an anchor).
 */

import {
  deriveScheduleImpact,
  IMPACT_READING,
  IMPACT_UNAVAILABLE,
  IMPACT_UNCOMPUTABLE_LINE,
  impactIsSettled,
} from '../schedule-impact';
import type { SchedulePhaseInput, ScheduleMilestoneInput } from '@patina/utils';

const TODAY = '2026-01-01';

function phase(
  over: Partial<SchedulePhaseInput> & { id: string },
): SchedulePhaseInput {
  return {
    id: over.id,
    name: over.name ?? over.id,
    durationDays: over.durationDays ?? null,
    durationWeeks: over.durationWeeks ?? null,
    followsPhaseId: over.followsPhaseId ?? null,
    anchorDate: over.anchorDate ?? null,
    lane: over.lane ?? 'main',
    startDate: over.startDate ?? null,
    targetEndDate: over.targetEndDate ?? null,
    sortOrder: over.sortOrder ?? 0,
    status: over.status ?? 'pending',
  };
}

function milestone(
  over: Partial<ScheduleMilestoneInput> & { id: string; phaseId: string },
): ScheduleMilestoneInput {
  return {
    id: over.id,
    phaseId: over.phaseId,
    name: over.name ?? over.id,
    kind: over.kind ?? 'event',
    offsetDays: over.offsetDays ?? null,
    anchorDate: over.anchorDate ?? null,
    status: over.status ?? 'upcoming',
    sortOrder: over.sortOrder ?? 0,
  };
}

const chain = () => [
  phase({ id: 'a', startDate: '2026-01-01', durationDays: 10 }),
  phase({ id: 'thread', lane: 'thread', followsPhaseId: 'a', durationDays: 10 }),
];

describe('deriveScheduleImpact — the computable case', () => {
  it('states the ripple for a prospective phase anchor', () => {
    const impact = deriveScheduleImpact(
      chain(),
      [],
      { kind: 'phase-anchor', phaseId: 'thread', anchorDate: '2026-02-01' },
      TODAY,
    );
    expect(impact.computable).toBe(true);
    if (!impact.computable) return;
    expect(impact.sentence).toContain('anchored Feb 1');
    expect(impact.disclosure.kind).toBe('phase-anchor');
    expect(impact.disclosure.anchorDate).toBe('2026-02-01');
    // The disclosure carries the sentence verbatim — 00475 stamps it into the
    // revision's reason, so the ledger records what the ceremony said.
    expect(impact.disclosure.sentence).toBe(impact.sentence);
  });

  it('states the ripple for a prospective milestone anchor', () => {
    const impact = deriveScheduleImpact(
      chain(),
      [milestone({ id: 'm', phaseId: 'thread', offsetDays: 0 })],
      { kind: 'milestone-anchor', milestoneId: 'm', anchorDate: '2026-03-01' },
      TODAY,
    );
    expect(impact.computable).toBe(true);
    if (!impact.computable) return;
    expect(impact.disclosure.kind).toBe('milestone-anchor');
    expect(impact.disclosure.anchorDate).toBe('2026-03-01');
  });
});

describe('deriveScheduleImpact — the honest downgrade (R110)', () => {
  const line = (result: ReturnType<typeof deriveScheduleImpact>) =>
    result.computable ? null : result.line;

  it('says so when there is no chain at all', () => {
    const result = deriveScheduleImpact(
      [],
      [],
      { kind: 'phase-anchor', phaseId: 'thread', anchorDate: '2026-02-01' },
      TODAY,
    );
    expect(result.computable).toBe(false);
    expect(line(result)).toBe(IMPACT_UNCOMPUTABLE_LINE);
  });

  it('says so when there is no identifiable target', () => {
    expect(deriveScheduleImpact(chain(), [], null, TODAY).computable).toBe(false);
  });

  it('says so when the named phase is not in the chain', () => {
    const result = deriveScheduleImpact(
      chain(),
      [],
      { kind: 'phase-anchor', phaseId: 'nowhere', anchorDate: '2026-02-01' },
      TODAY,
    );
    expect(result.computable).toBe(false);
  });

  it('says so when the named milestone is not in the chain', () => {
    const result = deriveScheduleImpact(
      chain(),
      [],
      { kind: 'milestone-anchor', milestoneId: 'nowhere', anchorDate: '2026-02-01' },
      TODAY,
    );
    expect(result.computable).toBe(false);
  });

  it('refuses to state an effect for a non-anchor edit kind', () => {
    const result = deriveScheduleImpact(
      chain(),
      [],
      { kind: 'phase-duration', phaseId: 'a', durationDays: 20 },
      TODAY,
    );
    expect(result.computable).toBe(false);
  });

  it('says so when the chain cannot resolve (a cycle)', () => {
    const cyclic = [
      phase({ id: 'x', followsPhaseId: 'y', durationDays: 5 }),
      phase({ id: 'y', followsPhaseId: 'x', durationDays: 5 }),
    ];
    const result = deriveScheduleImpact(
      cyclic,
      [],
      { kind: 'phase-anchor', phaseId: 'x', anchorDate: '2026-02-01' },
      TODAY,
    );
    expect(result.computable).toBe(false);
    expect(line(result)).toBe(IMPACT_UNCOMPUTABLE_LINE);
  });

  it('reports the computed state distinctly from the three silent ones', () => {
    const computed = deriveScheduleImpact(
      chain(),
      [],
      { kind: 'phase-anchor', phaseId: 'thread', anchorDate: '2026-02-01' },
      TODAY,
    );
    expect(computed.status).toBe('computed');
    expect(
      deriveScheduleImpact([], [], null, TODAY).status,
    ).toBe('uncomputable');
  });

  it('a ceremony may only be confirmed once the schedule has answered', () => {
    // Reading and unavailable are NOT the R110 downgrade — confirming through
    // them would turn a hardening into a proposal by a race.
    expect(impactIsSettled(IMPACT_READING)).toBe(false);
    expect(impactIsSettled(IMPACT_UNAVAILABLE)).toBe(false);
    expect(
      impactIsSettled(deriveScheduleImpact([], [], null, TODAY)),
    ).toBe(true);
    expect(
      impactIsSettled(
        deriveScheduleImpact(
          chain(),
          [],
          { kind: 'phase-anchor', phaseId: 'thread', anchorDate: '2026-02-01' },
          TODAY,
        ),
      ),
    ).toBe(true);
  });

  it('degrades rather than throwing on malformed input', () => {
    expect(
      deriveScheduleImpact(
        null,
        undefined,
        { kind: 'phase-anchor', phaseId: 'a', anchorDate: '2026-02-01' },
        TODAY,
      ).computable,
    ).toBe(false);
  });
});
