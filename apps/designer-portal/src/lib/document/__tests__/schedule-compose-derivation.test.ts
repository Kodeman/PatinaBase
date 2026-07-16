import { relinkOnDelete, composePreview, type RelinkPhase, type PendingEdit } from '../schedule-compose-derivation';
import type { SchedulePhaseInput, ScheduleMilestoneInput } from '@patina/utils';

// ─────────────────────────────────────────────────────────────────────────────
// Factories — every field defaulted so a case declares only what it exercises
// (mirrors schedule.test.ts / schedule-spine-derivation.test.ts conventions).
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

function relinkPhase(over: Partial<RelinkPhase> & { id: string }): RelinkPhase {
  return { id: over.id, followsPhaseId: over.followsPhaseId ?? null };
}

// ═══════════════════════════════════════════════════════════════════════════
// relinkOnDelete
// ═══════════════════════════════════════════════════════════════════════════

describe('relinkOnDelete', () => {
  it('repoints a single follower at the deleted phase\'s own predecessor', () => {
    const phases = [
      relinkPhase({ id: 'a', followsPhaseId: null }),
      relinkPhase({ id: 'b', followsPhaseId: 'a' }),
      relinkPhase({ id: 'c', followsPhaseId: 'b' }),
    ];
    expect(relinkOnDelete(phases, 'b')).toEqual([{ id: 'c', followsPhaseId: 'a' }]);
  });

  it('deleting a root (followsPhaseId null) repoints its followers to null (they become new roots)', () => {
    const phases = [relinkPhase({ id: 'a', followsPhaseId: null }), relinkPhase({ id: 'b', followsPhaseId: 'a' })];
    expect(relinkOnDelete(phases, 'a')).toEqual([{ id: 'b', followsPhaseId: null }]);
  });

  it('repoints ALL followers when more than one phase follows the deleted phase (a fork)', () => {
    const phases = [
      relinkPhase({ id: 'a', followsPhaseId: null }),
      relinkPhase({ id: 'b', followsPhaseId: 'a' }),
      relinkPhase({ id: 'c', followsPhaseId: 'a' }),
      relinkPhase({ id: 'd', followsPhaseId: 'a' }),
    ];
    const updates = relinkOnDelete(phases, 'a');
    expect(updates).toHaveLength(3);
    expect(updates).toEqual(
      expect.arrayContaining([
        { id: 'b', followsPhaseId: null },
        { id: 'c', followsPhaseId: null },
        { id: 'd', followsPhaseId: null },
      ]),
    );
  });

  it('a leaf phase (nothing follows it) produces an empty list', () => {
    const phases = [relinkPhase({ id: 'a', followsPhaseId: null }), relinkPhase({ id: 'b', followsPhaseId: 'a' })];
    expect(relinkOnDelete(phases, 'b')).toEqual([]);
  });

  it('an unknown deletedId (not present in phases) returns an empty list', () => {
    const phases = [relinkPhase({ id: 'a', followsPhaseId: null }), relinkPhase({ id: 'b', followsPhaseId: 'a' })];
    expect(relinkOnDelete(phases, 'does-not-exist')).toEqual([]);
  });

  it('an unknown deletedId does not accidentally relink phases with a dangling/orphan follows matching that id', () => {
    // 'ghost' isn't a real phase in this set, but 'b' happens to (invalidly)
    // follow it. Since 'ghost' is not actually being deleted, nothing should
    // be relinked.
    const phases = [relinkPhase({ id: 'a', followsPhaseId: null }), relinkPhase({ id: 'b', followsPhaseId: 'ghost' })];
    expect(relinkOnDelete(phases, 'ghost')).toEqual([]);
  });

  it('an empty phases array returns an empty list', () => {
    expect(relinkOnDelete([], 'a')).toEqual([]);
  });

  it('a defensive self-follow on the deleted phase relinks followers to null, not back to the deleted id', () => {
    const phases = [
      relinkPhase({ id: 'a', followsPhaseId: 'a' }), // DB-blocked in practice; handled defensively
      relinkPhase({ id: 'b', followsPhaseId: 'a' }),
    ];
    expect(relinkOnDelete(phases, 'a')).toEqual([{ id: 'b', followsPhaseId: null }]);
  });

  it('non-array phases never throws — returns an empty list', () => {
    expect(() => relinkOnDelete(null as unknown as RelinkPhase[], 'a')).not.toThrow();
    expect(relinkOnDelete(null as unknown as RelinkPhase[], 'a')).toEqual([]);
  });

  it('a non-string deletedId never throws — returns an empty list', () => {
    const phases = [relinkPhase({ id: 'a', followsPhaseId: null })];
    expect(() => relinkOnDelete(phases, undefined as unknown as string)).not.toThrow();
    expect(relinkOnDelete(phases, undefined as unknown as string)).toEqual([]);
  });

  it('an empty-string deletedId returns an empty list (never matches a real phase)', () => {
    const phases = [relinkPhase({ id: 'a', followsPhaseId: null })];
    expect(relinkOnDelete(phases, '')).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// composePreview
// ═══════════════════════════════════════════════════════════════════════════

describe('composePreview — add-phase', () => {
  const today = '2026-07-15';

  it('a new phase appended after a duration-only root computes start/end from the chain', () => {
    const committed = [phase({ id: 'a', durationDays: 10, startDate: '2026-01-01' })];
    const pending: PendingEdit = { kind: 'add-phase', name: 'New Phase', durationDays: 5, followsPhaseId: 'a' };
    const result = composePreview(committed, [], pending, today);
    expect(result.start).toBe('2026-01-11'); // a's end (start + 10)
    expect(result.end).toBe('2026-01-16'); // + 5
    expect(result.conflicts).toEqual([]);
  });

  it('a root add-phase (no follows, no anchor, no origin) has no computable date and no conflicts of its own beyond unresolvable', () => {
    const pending: PendingEdit = { kind: 'add-phase', name: 'Floating', durationDays: 5, followsPhaseId: null };
    const result = composePreview([], [], pending, today);
    expect(result.start).toBeNull();
    expect(result.end).toBeNull();
    expect(result.conflicts.some((c) => c.kind === 'unresolvable')).toBe(true);
  });

  it('an add-phase that overruns a downstream anchor surfaces the chain_does_not_fit conflict (tagged with the ANCHOR\'s id)', () => {
    const committed = [
      phase({ id: 'a', durationDays: 10, startDate: '2026-01-01' }),
      phase({ id: 'c', anchorDate: '2026-01-20', followsPhaseId: '__pending-phase__' }),
    ];
    const pending: PendingEdit = { kind: 'add-phase', name: 'Middle', durationDays: 20, followsPhaseId: 'a' };
    const result = composePreview(committed, [], pending, today);
    // a ends 2026-01-11; +20d → 2026-01-31, which overruns c's 2026-01-20 anchor by 11 days.
    expect(result.start).toBe('2026-01-11');
    expect(result.end).toBe('2026-01-31');
    // The resolver tags chain_does_not_fit with the anchored phase's id ('c'),
    // NOT the pending phase's — the preview must still surface it, because
    // warning about exactly this is the compute line's whole job.
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]).toMatchObject({ kind: 'chain_does_not_fit', anchorId: 'c', overrunDays: 11 });
    // No room at the anchor → no slack to report.
    expect(result.slackDays).toBeNull();
  });

  it('an add-phase that FITS before a downstream anchor reports the remaining room as slackDays', () => {
    const committed = [
      phase({ id: 'a', durationDays: 10, startDate: '2026-01-01' }),
      phase({ id: 'c', anchorDate: '2026-01-20', followsPhaseId: '__pending-phase__' }),
    ];
    const pending: PendingEdit = { kind: 'add-phase', name: 'Middle', durationDays: 5, followsPhaseId: 'a' };
    const result = composePreview(committed, [], pending, today);
    // a ends 2026-01-11; +5d → 2026-01-16; c's anchor 2026-01-20 leaves 4 days of room.
    expect(result.start).toBe('2026-01-11');
    expect(result.end).toBe('2026-01-16');
    expect(result.slackDays).toBe(4);
    expect(result.conflicts).toEqual([]);
  });

  it('a conflict on a phase UPSTREAM of (not downstream of) the pending add is not attributed to it', () => {
    const committed = [
      // 'up' is anchored and overrun by its own predecessor 'pre' — a conflict
      // that exists with or without the pending add, upstream of it.
      phase({ id: 'pre', durationDays: 30, startDate: '2026-01-01' }),
      phase({ id: 'up', anchorDate: '2026-01-10', followsPhaseId: 'pre', durationDays: 5 }),
    ];
    const pending: PendingEdit = { kind: 'add-phase', name: 'Tail', durationDays: 5, followsPhaseId: 'up' };
    const result = composePreview(committed, [], pending, today);
    // The pending phase resolves fine off 'up''s anchored end…
    expect(result.start).toBe('2026-01-15');
    // …and 'up''s pre-existing upstream overrun is NOT pinned on the new phase.
    expect(result.conflicts).toEqual([]);
  });

  it('a malformed pendingEdit (not an object) degrades to the empty preview', () => {
    const result = composePreview([], [], null as unknown as PendingEdit, today);
    expect(result).toEqual({ start: null, end: null, slackDays: null, conflicts: [] });
  });

  it('an unrecognized pendingEdit.kind degrades to the empty preview', () => {
    const result = composePreview([], [], { kind: 'bogus' } as unknown as PendingEdit, today);
    expect(result).toEqual({ start: null, end: null, slackDays: null, conflicts: [] });
  });
});

describe('composePreview — edit-phase', () => {
  const today = '2026-07-15';

  it('editing durationDays on an existing phase recomputes its own end date', () => {
    const committed = [phase({ id: 'a', durationDays: 10, startDate: '2026-01-01' })];
    const pending: PendingEdit = { kind: 'edit-phase', id: 'a', patch: { durationDays: 30 } };
    const result = composePreview(committed, [], pending, today);
    expect(result.start).toBe('2026-01-01');
    expect(result.end).toBe('2026-01-31');
  });

  it('editing a downstream phase does not mutate the committed array (no shared-reference bleed)', () => {
    const committed = [phase({ id: 'a', durationDays: 10, startDate: '2026-01-01' })];
    const pending: PendingEdit = { kind: 'edit-phase', id: 'a', patch: { durationDays: 999 } };
    composePreview(committed, [], pending, today);
    expect(committed[0].durationDays).toBe(10); // untouched
  });

  it('setting an anchorDate via the patch surfaces as an anchored resolution', () => {
    const committed = [phase({ id: 'a', durationDays: 10, startDate: '2026-01-01' })];
    const pending: PendingEdit = { kind: 'edit-phase', id: 'a', patch: { anchorDate: '2026-03-01', startDate: null } };
    const result = composePreview(committed, [], pending, today);
    expect(result.start).toBe('2026-03-01');
  });

  it('editing an unknown id degrades to the empty preview', () => {
    const committed = [phase({ id: 'a', durationDays: 10, startDate: '2026-01-01' })];
    const pending: PendingEdit = { kind: 'edit-phase', id: 'does-not-exist', patch: { durationDays: 5 } };
    expect(composePreview(committed, [], pending, today)).toEqual({
      start: null,
      end: null,
      slackDays: null,
      conflicts: [],
    });
  });

  it('a non-string id on edit-phase never throws — degrades to the empty preview', () => {
    const committed = [phase({ id: 'a', durationDays: 10, startDate: '2026-01-01' })];
    const pending = { kind: 'edit-phase', id: 42, patch: {} } as unknown as PendingEdit;
    expect(() => composePreview(committed, [], pending, today)).not.toThrow();
    expect(composePreview(committed, [], pending, today)).toEqual({
      start: null,
      end: null,
      slackDays: null,
      conflicts: [],
    });
  });
});

describe('composePreview — totality', () => {
  const today = '2026-07-15';

  it('non-array committedPhases/committedMilestones never throw', () => {
    const pending: PendingEdit = { kind: 'add-phase', name: 'X', durationDays: 5, followsPhaseId: null };
    expect(() =>
      composePreview(null as unknown as SchedulePhaseInput[], null as unknown as ScheduleMilestoneInput[], pending, today),
    ).not.toThrow();
  });

  it('never throws across a spread of malformed pendingEdit shapes', () => {
    const committed = [phase({ id: 'a', durationDays: 10, startDate: '2026-01-01' })];
    const shapes: unknown[] = [undefined, {}, { kind: 'add-phase' }, { kind: 'edit-phase' }, { kind: 'edit-phase', id: 'a' }];
    for (const shape of shapes) {
      expect(() => composePreview(committed, [], shape as PendingEdit, today)).not.toThrow();
    }
  });
});
