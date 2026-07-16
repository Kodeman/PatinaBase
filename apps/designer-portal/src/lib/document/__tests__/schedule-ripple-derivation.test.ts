/**
 * Slice 04 · the ripple's pure core (R100 "Editing: the ripple"). Pins
 * `rippleDiff` (resolve twice, diff) and `rippleSentence` (the confirm strip's
 * one honest sentence) against a frozen contract, so the ghost layer, confirm
 * strip, and commit RPC can all be built against exact dates/counts and any
 * future edit that changes a derived value fails here. Both functions are TOTAL:
 * unknown ids and malformed input degrade, they never throw.
 *
 * Date math is the resolver's contiguous same-day handoff (follower.start =
 * predecessor.end) over UTC epoch days; 2026 is NOT a leap year.
 */

import { rippleDiff, rippleSentence } from '../schedule-ripple-derivation';
import type { SchedulePhaseInput, ScheduleMilestoneInput } from '@patina/utils';

// Brand glyphs the sentence uses — pinned by codepoint so a hyphen never sneaks in.
const MINUS = '−'; // U+2212 MINUS SIGN
const EM = '—'; // U+2014 EM DASH
const MID = '·'; // U+00B7 MIDDLE DOT (clause separator)
const ARROW = '→'; // U+2192 RIGHTWARDS ARROW

const TODAY = '2026-01-01';

// ─────────────────────────────────────────────────────────────────────────────
// Factories — every field defaulted (mirrors schedule.test.ts conventions).
// ─────────────────────────────────────────────────────────────────────────────

function phase(over: Partial<SchedulePhaseInput> & { id: string }): SchedulePhaseInput {
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

function milestone(over: Partial<ScheduleMilestoneInput> & { id: string; phaseId: string }): ScheduleMilestoneInput {
  return {
    id: over.id,
    phaseId: over.phaseId,
    name: over.name ?? over.id,
    kind: over.kind ?? 'delivery',
    offsetDays: over.offsetDays ?? null,
    anchorDate: over.anchorDate ?? null,
    status: over.status ?? 'upcoming',
    sortOrder: over.sortOrder ?? 0,
  };
}

const noNames = () => undefined;
const names =
  (map: Record<string, string>) =>
  (id: string): string | undefined =>
    map[id];

/** A canonical forward chain: a(Jan1–Jan11) → b(→Jan21) → c(→Jan31) → d(→Feb10), all 10d. */
const chain4 = () => [
  phase({ id: 'a', startDate: '2026-01-01', durationDays: 10 }),
  phase({ id: 'b', followsPhaseId: 'a', durationDays: 10 }),
  phase({ id: 'c', followsPhaseId: 'b', durationDays: 10 }),
  phase({ id: 'd', followsPhaseId: 'c', durationDays: 10 }),
];

// ═══════════════════════════════════════════════════════════════════════════
// rippleDiff — phase-duration
// ═══════════════════════════════════════════════════════════════════════════

describe('rippleDiff — phase-duration', () => {
  it('positive delta: downstream chain follows, rippleSize counts the edited phase, followerCount excludes it', () => {
    const diff = rippleDiff(chain4(), [], { kind: 'phase-duration', phaseId: 'a', durationDays: 15 }, noNames, TODAY);
    expect(diff.durationDelta).toBe(5);
    expect(diff.followerCount).toBe(3); // b, c, d — not a
    expect(diff.rippleSize).toBe(4); // a, b, c, d all moved
    expect(diff.anchorViolation).toBe(false);

    const a = diff.phaseChanges.find((p) => p.phaseId === 'a')!;
    expect(a.fromStart).toBe('2026-01-01');
    expect(a.toStart).toBe('2026-01-01'); // start unchanged, end shifts
    expect(a.fromEnd).toBe('2026-01-11');
    expect(a.toEnd).toBe('2026-01-16');
    expect(a.moved).toBe(true);

    const d = diff.phaseChanges.find((p) => p.phaseId === 'd')!;
    expect(d.fromStart).toBe('2026-01-31');
    expect(d.toStart).toBe('2026-02-05'); // +5 rides all the way down
    expect(d.moved).toBe(true);
  });

  it('negative delta renders a U+2212 minus in the lead', () => {
    const diff = rippleDiff(chain4(), [], { kind: 'phase-duration', phaseId: 'a', durationDays: 6 }, noNames, TODAY);
    expect(diff.durationDelta).toBe(-4);
    expect(rippleSentence(diff).lead).toBe(`a ${MINUS}4d`);
  });

  it('durationDelta is computed against the committed EFFECTIVE duration (weeks×7 when days null)', () => {
    const p = [phase({ id: 'a', startDate: '2026-01-01', durationWeeks: 2 })]; // effective 14d
    const diff = rippleDiff(p, [], { kind: 'phase-duration', phaseId: 'a', durationDays: 20 }, noNames, TODAY);
    expect(diff.durationDelta).toBe(6); // 20 − 14
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// rippleDiff — phase-anchor
// ═══════════════════════════════════════════════════════════════════════════

describe('rippleDiff — phase-anchor', () => {
  it('anchoring a phase moves it, creates slack where there was none (null → number), and it does not "hold"', () => {
    const phases = [
      phase({ id: 'a', startDate: '2026-01-01', durationDays: 10 }),
      phase({ id: 'b', followsPhaseId: 'a', durationDays: 10 }),
    ];
    const diff = rippleDiff(phases, [], { kind: 'phase-anchor', phaseId: 'b', anchorDate: '2026-02-01' }, noNames, TODAY);

    const b = diff.phaseChanges.find((p) => p.phaseId === 'b')!;
    expect(b.anchored).toBe(true);
    expect(b.fromStart).toBe('2026-01-11');
    expect(b.toStart).toBe('2026-02-01');
    expect(b.moved).toBe(true);
    expect(b.holds).toBe(false); // anchored BUT moved (it is the edit) → not held

    expect(diff.slackBefore).toBeNull();
    expect(diff.slackAfter).toBe(21); // Feb 1 − Jan 11
    expect(diff.slackDelta).toBeNull(); // a numeric delta across a null boundary is meaningless
    expect(diff.followerCount).toBe(0);
    expect(diff.rippleSize).toBe(1);
    expect(diff.heldAnchors).toEqual([]);

    const s = rippleSentence(diff);
    expect(s.lead).toBe('b anchored Feb 1');
    expect(s.slackClause).toBe(`slack ${EM} ${ARROW} 21 days`);
    expect(s.holdClause).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// rippleDiff — milestone-offset
// ═══════════════════════════════════════════════════════════════════════════

describe('rippleDiff — milestone-offset', () => {
  it('slides a milestone to a new offset off its phase end; lead names the resolved new date', () => {
    const phases = [phase({ id: 'a', startDate: '2026-01-01', durationDays: 10 })];
    const ms = [milestone({ id: 'm', phaseId: 'a', offsetDays: 0 })];
    const diff = rippleDiff(
      phases,
      ms,
      { kind: 'milestone-offset', milestoneId: 'm', phaseId: 'a', offsetDays: 3 },
      noNames,
      TODAY,
    );
    const m = diff.milestoneMoves.find((x) => x.milestoneId === 'm')!;
    expect(m.fromDate).toBe('2026-01-11'); // phase end + 0
    expect(m.toDate).toBe('2026-01-14'); // + 3
    expect(m.moved).toBe(true);
    expect(diff.rippleSize).toBe(1);
    expect(diff.followerCount).toBe(0);
    expect(diff.durationDelta).toBeNull();
    expect(rippleSentence(diff).lead).toBe(`m ${ARROW} Jan 14`);
  });

  it('a slid milestone unpins (an anchored milestone rejoins the phase-end offset)', () => {
    const phases = [phase({ id: 'a', startDate: '2026-01-01', durationDays: 10 })];
    const ms = [milestone({ id: 'm', phaseId: 'a', anchorDate: '2026-03-01' })];
    const diff = rippleDiff(
      phases,
      ms,
      { kind: 'milestone-offset', milestoneId: 'm', phaseId: 'a', offsetDays: 5 },
      noNames,
      TODAY,
    );
    const m = diff.milestoneMoves.find((x) => x.milestoneId === 'm')!;
    expect(m.fromDate).toBe('2026-03-01'); // was anchored
    expect(m.toDate).toBe('2026-01-16'); // phase end (Jan 11) + 5
    expect(m.anchored).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// followerCount — chains and diamonds
// ═══════════════════════════════════════════════════════════════════════════

describe('followerCount', () => {
  it('a linear chain: every downstream phase is a follower', () => {
    const diff = rippleDiff(chain4(), [], { kind: 'phase-duration', phaseId: 'a', durationDays: 12 }, noNames, TODAY);
    expect(diff.followerCount).toBe(3);
  });

  it('a diamond/fork: both branches following the edited phase are followers', () => {
    const phases = [
      phase({ id: 'a', startDate: '2026-01-01', durationDays: 10 }),
      phase({ id: 'b', followsPhaseId: 'a', durationDays: 5 }),
      phase({ id: 'c', followsPhaseId: 'a', durationDays: 7 }),
    ];
    const diff = rippleDiff(phases, [], { kind: 'phase-duration', phaseId: 'a', durationDays: 15 }, noNames, TODAY);
    expect(diff.followerCount).toBe(2); // b and c
    expect(diff.rippleSize).toBe(3); // a, b, c
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// heldAnchors + slack shrink — the canonical prototype scenario
// ═══════════════════════════════════════════════════════════════════════════

describe('heldAnchors + slack', () => {
  const anchored = () => [
    phase({ id: 'p1', startDate: '2026-01-01', durationDays: 10 }),
    phase({ id: 'p2', followsPhaseId: 'p1', durationDays: 10 }),
    phase({ id: 'p3', followsPhaseId: 'p2', durationDays: 5, anchorDate: '2026-02-01' }),
  ];
  const NAMES = names({ p1: 'Design', p2: 'Procurement', p3: 'Install' });

  it('the downstream anchor holds; slack shrinks; the sentence reads like the prototype confirm strip', () => {
    const diff = rippleDiff(anchored(), [], { kind: 'phase-duration', phaseId: 'p1', durationDays: 15 }, NAMES, TODAY);

    expect(diff.slackBefore).toBe(11); // Feb 1 − Jan 21
    expect(diff.slackAfter).toBe(6); // Feb 1 − Jan 26
    expect(diff.slackDelta).toBe(-5);
    expect(diff.heldAnchors).toEqual([{ phaseId: 'p3', name: 'Install', date: '2026-02-01' }]);
    expect(diff.followerCount).toBe(1); // p2 moved; p3 held; p1 excluded
    expect(diff.rippleSize).toBe(2); // p1, p2

    const p3 = diff.phaseChanges.find((p) => p.phaseId === 'p3')!;
    expect(p3.moved).toBe(false);
    expect(p3.holds).toBe(true);
    expect(p3.anchored).toBe(true);

    const s = rippleSentence(diff);
    expect(s.lead).toBe('Design +5d');
    expect(s.followClause).toBe('1 phase follows');
    expect(s.holdClause).toBe('Install holds Feb 1');
    expect(s.slackClause).toBe(`slack 11 ${ARROW} 6 days`);
    expect(s.conflictClause).toBeNull();
    expect(s.plain).toBe(`Design +5d. 1 phase follows ${MID} Install holds Feb 1 ${MID} slack 11 ${ARROW} 6 days.`);
  });

  it('unchanged slack does NOT render a slack clause (no "11 → 11" noise), though slackDelta is a numeric 0', () => {
    // A milestone slide on the anchor's own phase moves no phase → the anchor's
    // arrival is unchanged → slack 11 both sides.
    const ms = [milestone({ id: 'm', phaseId: 'p3', offsetDays: -1 })];
    const diff = rippleDiff(
      anchored(),
      ms,
      { kind: 'milestone-offset', milestoneId: 'm', phaseId: 'p3', offsetDays: -2 },
      NAMES,
      TODAY,
    );
    expect(diff.slackBefore).toBe(11);
    expect(diff.slackAfter).toBe(11);
    expect(diff.slackDelta).toBe(0);
    expect(rippleSentence(diff).slackClause).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// anchorViolation + conflict clause
// ═══════════════════════════════════════════════════════════════════════════

describe('anchorViolation — chain_does_not_fit (phase overruns a downstream anchor)', () => {
  const overrunning = () => [
    phase({ id: 'p1', startDate: '2026-01-01', durationDays: 10 }),
    phase({ id: 'p2', followsPhaseId: 'p1', durationDays: 10 }),
    phase({ id: 'p3', followsPhaseId: 'p2', durationDays: 5, anchorDate: '2026-01-25' }),
  ];

  it('slack goes number → null on overrun, flags the violation, and the clause names the projected date', () => {
    const diff = rippleDiff(
      overrunning(),
      [],
      { kind: 'phase-duration', phaseId: 'p1', durationDays: 20 },
      names({ p3: 'Install' }),
      TODAY,
    );
    expect(diff.slackBefore).toBe(4); // Jan 25 − Jan 21
    expect(diff.slackAfter).toBeNull(); // chain now overruns → no absorbed float
    expect(diff.slackDelta).toBeNull();
    expect(diff.anchorViolation).toBe(true);

    const s = rippleSentence(diff);
    expect(s.lead).toBe('p1 +10d');
    expect(s.conflictClause).toBe(`The chain projects Jan 31 ${EM} 6 days past Install`);
  });
});

describe('anchorViolation — past_anchor (a milestone lands past a downstream anchor)', () => {
  it('flags the violation and the terracotta clause names the milestone, its projected date, and the anchor', () => {
    const phases = [
      phase({ id: 'p1', startDate: '2026-01-01', durationDays: 10 }),
      phase({ id: 'p2', followsPhaseId: 'p1', durationDays: 10 }),
      phase({ id: 'p3', followsPhaseId: 'p2', durationDays: 5, anchorDate: '2026-01-25' }),
    ];
    const ms = [milestone({ id: 'm', phaseId: 'p1', offsetDays: 0, name: 'Sofa delivery' })];
    const diff = rippleDiff(
      phases,
      ms,
      { kind: 'milestone-offset', milestoneId: 'm', phaseId: 'p1', offsetDays: 20 },
      names({ p3: 'Install' }), // 'm' unnamed → falls back to the input name 'Sofa delivery'
      TODAY,
    );
    expect(diff.anchorViolation).toBe(true);
    expect(diff.rippleSize).toBe(1); // only the milestone moved
    expect(diff.followerCount).toBe(0);

    const s = rippleSentence(diff);
    expect(s.lead).toBe(`Sofa delivery ${ARROW} Jan 31`);
    expect(s.conflictClause).toBe(`Sofa delivery projects Jan 31 ${EM} 6 days past Install`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Name resolution: nameById → committed input name → the raw id
// ═══════════════════════════════════════════════════════════════════════════

describe('name resolution', () => {
  it('prefers the nameById callback over the committed input name', () => {
    const phases = [phase({ id: 'a', name: 'Kitchen', startDate: '2026-01-01', durationDays: 10 })];
    const diff = rippleDiff(
      phases,
      [],
      { kind: 'phase-duration', phaseId: 'a', durationDays: 13 },
      names({ a: 'Kitchen Cabinets' }),
      TODAY,
    );
    expect(diff.editedName).toBe('Kitchen Cabinets');
  });

  it('falls back to the committed input name when nameById returns nothing', () => {
    const phases = [phase({ id: 'a', name: 'Kitchen', startDate: '2026-01-01', durationDays: 10 })];
    const diff = rippleDiff(phases, [], { kind: 'phase-duration', phaseId: 'a', durationDays: 13 }, noNames, TODAY);
    expect(diff.editedName).toBe('Kitchen');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The standalone "plain" sentence (Slice 05 revision-reason default)
// ═══════════════════════════════════════════════════════════════════════════

describe('rippleSentence — plain standalone', () => {
  it('an inert edit (no followers, anchors, slack change, or conflict) reads as one honest sentence', () => {
    const phases = [phase({ id: 'a', name: 'Kitchen', startDate: '2026-01-01', durationDays: 10 })];
    const diff = rippleDiff(
      phases,
      [],
      { kind: 'phase-duration', phaseId: 'a', durationDays: 13 },
      names({ a: 'Kitchen Cabinets' }),
      TODAY,
    );
    const s = rippleSentence(diff);
    expect(s.followClause).toBeNull();
    expect(s.holdClause).toBeNull();
    expect(s.slackClause).toBeNull();
    expect(s.conflictClause).toBeNull();
    expect(s.lead).toBe('Kitchen Cabinets +3d');
    expect(s.plain).toBe('Kitchen Cabinets +3d.');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Totality — unknown ids, empty, malformed
// ═══════════════════════════════════════════════════════════════════════════

describe('rippleDiff — totality', () => {
  it('unknown phase id degrades to a no-op: editedName falls back to the id, nothing moves, no throw', () => {
    const phases = [phase({ id: 'a', startDate: '2026-01-01', durationDays: 10 })];
    const edit = { kind: 'phase-duration', phaseId: 'nope', durationDays: 5 } as const;
    expect(() => rippleDiff(phases, [], edit, noNames, TODAY)).not.toThrow();

    const diff = rippleDiff(phases, [], edit, noNames, TODAY);
    expect(diff.editedName).toBe('nope');
    expect(diff.rippleSize).toBe(0);
    expect(diff.followerCount).toBe(0);
    expect(diff.durationDelta).toBeNull();
    expect(diff.phaseChanges.every((p) => !p.moved)).toBe(true);
    expect(diff.anchorViolation).toBe(false);

    const s = rippleSentence(diff);
    expect(s.lead).toBe('nope +0d');
    expect(s.plain).toBe('nope +0d.');
  });

  it('unknown milestone id degrades to a no-op', () => {
    const phases = [phase({ id: 'a', startDate: '2026-01-01', durationDays: 10 })];
    const diff = rippleDiff(
      phases,
      [],
      { kind: 'milestone-offset', milestoneId: 'ghost', phaseId: 'a', offsetDays: 5 },
      noNames,
      TODAY,
    );
    expect(diff.editedName).toBe('ghost');
    expect(diff.rippleSize).toBe(0);
  });

  it('empty inputs never throw and produce an empty diff', () => {
    const edit = { kind: 'phase-duration', phaseId: 'x', durationDays: 5 } as const;
    expect(() => rippleDiff([], [], edit, noNames, TODAY)).not.toThrow();
    const diff = rippleDiff([], [], edit, noNames, TODAY);
    expect(diff.rippleSize).toBe(0);
    expect(diff.phaseChanges).toEqual([]);
    expect(diff.milestoneMoves).toEqual([]);
    expect(diff.heldAnchors).toEqual([]);
  });

  it('null entries in the input arrays are filtered, not fatal', () => {
    const phases = [null as unknown as SchedulePhaseInput, phase({ id: 'a', startDate: '2026-01-01', durationDays: 10 })];
    const ms = [null as unknown as ScheduleMilestoneInput];
    expect(() =>
      rippleDiff(phases, ms, { kind: 'phase-duration', phaseId: 'a', durationDays: 12 }, noNames, TODAY),
    ).not.toThrow();
    const diff = rippleDiff(phases, ms, { kind: 'phase-duration', phaseId: 'a', durationDays: 12 }, noNames, TODAY);
    expect(diff.phaseChanges).toHaveLength(1);
    expect(diff.durationDelta).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Fix round (S4-1 review): per-phase slack sourcing · day/days · legacy delta
// ═══════════════════════════════════════════════════════════════════════════

describe('slack sourcing — the edited phase\'s own chain, not the global min (M1)', () => {
  // Two independent chains, each ending at its own anchor:
  //   A: a1 (Jan 1, 10d → ends Jan 11) → a2 (anchored Jan 21) — slack 10
  //   B: b1 (Jan 1, 10d → ends Jan 11) → b2 (anchored Jan 14) — slack 3
  // Top-level slackDays = min(10, 3) = 3 on BOTH sides of an A-edit — reading
  // it would suppress the clause entirely. The edited phase's own slackDays
  // carries the honest number.
  const twoChains = () => [
    phase({ id: 'a1', startDate: '2026-01-01', durationDays: 10 }),
    phase({ id: 'a2', followsPhaseId: 'a1', durationDays: 5, anchorDate: '2026-01-21' }),
    phase({ id: 'b1', startDate: '2026-01-01', durationDays: 10 }),
    phase({ id: 'b2', followsPhaseId: 'b1', durationDays: 5, anchorDate: '2026-01-14' }),
  ];

  it('an edit on chain A reports A\'s own slack 10 → 5 while chain B holds the global min at 3', () => {
    const diff = rippleDiff(twoChains(), [], { kind: 'phase-duration', phaseId: 'a1', durationDays: 15 }, noNames, TODAY);
    expect(diff.slackBefore).toBe(10); // NOT the global min 3
    expect(diff.slackAfter).toBe(5);
    expect(diff.slackDelta).toBe(-5);
    expect(rippleSentence(diff).slackClause).toBe(`slack 10 ${ARROW} 5 days`);
    // Both anchors held (neither moved) — B's untouched anchor is still a hold.
    expect(diff.heldAnchors.map((a) => a.phaseId).sort()).toEqual(['a2', 'b2']);
    expect(diff.anchorViolation).toBe(false);
  });

  it('a phase-anchor edit also reads the edited phase\'s own slack (its new pin\'s absorbed float)', () => {
    // Anchor b1's follower-free twin: re-anchor a2 from Jan 21 to Jan 26 —
    // its own absorbed float goes 10 → 15 while the global min stays 3.
    const diff = rippleDiff(twoChains(), [], { kind: 'phase-anchor', phaseId: 'a2', anchorDate: '2026-01-26' }, noNames, TODAY);
    expect(diff.slackBefore).toBe(10);
    expect(diff.slackAfter).toBe(15);
    expect(diff.slackDelta).toBe(5);
    expect(rippleSentence(diff).slackClause).toBe(`slack 10 ${ARROW} 15 days`);
  });

  it('a milestone slide keeps the top-level slack (its host phase never moves)', () => {
    const ms = [milestone({ id: 'm', phaseId: 'a1', offsetDays: 0 })];
    const diff = rippleDiff(
      twoChains(),
      ms,
      { kind: 'milestone-offset', milestoneId: 'm', phaseId: 'a1', offsetDays: 2 },
      noNames,
      TODAY,
    );
    expect(diff.slackBefore).toBe(3); // global min — B's anchor
    expect(diff.slackAfter).toBe(3);
    expect(rippleSentence(diff).slackClause).toBeNull(); // unchanged → no clause
  });
});

describe('slack clause singularization (M2)', () => {
  it('a landing slack of 1 reads "day", not "days"', () => {
    const phases = [
      phase({ id: 'p1', startDate: '2026-01-01', durationDays: 10 }),
      phase({ id: 'p2', followsPhaseId: 'p1', durationDays: 5, anchorDate: '2026-01-15' }), // slack 4
    ];
    const diff = rippleDiff(phases, [], { kind: 'phase-duration', phaseId: 'p1', durationDays: 13 }, noNames, TODAY);
    expect(diff.slackBefore).toBe(4);
    expect(diff.slackAfter).toBe(1);
    expect(rippleSentence(diff).slackClause).toBe(`slack 4 ${ARROW} 1 day`);
  });
});

describe('durationDelta baseline for legacy-dated phases (M3)', () => {
  it('a legacy-dated phase (no duration fields) baselines against its resolved committed span', () => {
    // start Jan 1, targetEnd Jan 13 → resolved span 12 days (source legacy-dates).
    const phases = [phase({ id: 'a', startDate: '2026-01-01', targetEndDate: '2026-01-13' })];
    const diff = rippleDiff(phases, [], { kind: 'phase-duration', phaseId: 'a', durationDays: 15 }, noNames, TODAY);
    expect(diff.durationDelta).toBe(3); // 15 − 12, not 15 − 0
    expect(rippleSentence(diff).lead).toBe('a +3d');
    const a = diff.phaseChanges.find((p) => p.phaseId === 'a')!;
    expect(a.fromEnd).toBe('2026-01-13');
    expect(a.toEnd).toBe('2026-01-16'); // Jan 1 + 15
  });

  it('falls back to 0 only when the phase has no resolvable dates at all', () => {
    const phases = [phase({ id: 'x' })]; // no duration, no anchor, no dates → unresolved
    const diff = rippleDiff(phases, [], { kind: 'phase-duration', phaseId: 'x', durationDays: 15 }, noNames, TODAY);
    expect(diff.durationDelta).toBe(15); // 15 − 0
    expect(rippleSentence(diff).lead).toBe('x +15d');
  });

  it('effective duration still wins over the resolved span when both exist (weeks×7)', () => {
    const phases = [phase({ id: 'a', startDate: '2026-01-01', durationWeeks: 2 })]; // effective 14d
    const diff = rippleDiff(phases, [], { kind: 'phase-duration', phaseId: 'a', durationDays: 20 }, noNames, TODAY);
    expect(diff.durationDelta).toBe(6); // 20 − 14, baseline never falls through to the span
  });
});
