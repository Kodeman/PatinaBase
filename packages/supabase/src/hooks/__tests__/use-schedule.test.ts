import { describe, it, expect } from 'vitest';
import type { PhaseRow, MilestoneRow } from '../use-schedule';
import { mapPhaseRowToScheduleInput, mapMilestoneRowToScheduleInput } from '../use-schedule';

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures — full DB row shapes (Tables<'project_phases'> / Tables<'schedule_milestones'>),
// overridden per test. Pure mappers only — no Supabase, no React Query involved.
// ─────────────────────────────────────────────────────────────────────────────

function makePhaseRow(overrides: Partial<PhaseRow> = {}): PhaseRow {
  return {
    id: 'ph1',
    project_id: 'proj1',
    name: 'Schematic Design',
    phase_key: 'schematic_design',
    status: 'pending',
    progress: null,
    sort_order: 0,
    fee_cents: null,
    estimated_hours: null,
    gate_condition: null,
    deliverables: null,
    revision_limit: null,
    revisions_used: null,
    start_date: null,
    target_end_date: null,
    completed_at: null,
    source_proposal_phase_id: null,
    duration_days: null,
    duration_weeks: null,
    follows_phase_id: null,
    anchor_date: null,
    lane: 'main',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeMilestoneRow(overrides: Partial<MilestoneRow> = {}): MilestoneRow {
  return {
    id: 'ms1',
    phase_id: 'ph1',
    name: 'Client sign-off',
    kind: 'event',
    offset_days: null,
    anchor_date: null,
    status: 'upcoming',
    sort_order: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// mapPhaseRowToScheduleInput
// ─────────────────────────────────────────────────────────────────────────────

describe('mapPhaseRowToScheduleInput', () => {
  it('maps a fully-populated chain row snake_case → camelCase', () => {
    const row = makePhaseRow({
      duration_days: 14,
      duration_weeks: 3,
      follows_phase_id: 'ph0',
      anchor_date: '2026-03-01',
      lane: 'thread',
      start_date: '2026-02-01',
      target_end_date: '2026-02-15',
      sort_order: 2,
      status: 'in_progress',
    });

    expect(mapPhaseRowToScheduleInput(row)).toEqual({
      id: 'ph1',
      name: 'Schematic Design',
      durationDays: 14,
      durationWeeks: 3,
      followsPhaseId: 'ph0',
      anchorDate: '2026-03-01',
      lane: 'thread',
      startDate: '2026-02-01',
      targetEndDate: '2026-02-15',
      sortOrder: 2,
      status: 'in_progress',
    });
  });

  it('null-coalesces every nullable chain column to null', () => {
    const row = makePhaseRow({
      duration_days: null,
      duration_weeks: null,
      follows_phase_id: null,
      anchor_date: null,
      start_date: null,
      target_end_date: null,
    });

    const mapped = mapPhaseRowToScheduleInput(row);
    expect(mapped.durationDays).toBeNull();
    expect(mapped.durationWeeks).toBeNull();
    expect(mapped.followsPhaseId).toBeNull();
    expect(mapped.anchorDate).toBeNull();
    expect(mapped.startDate).toBeNull();
    expect(mapped.targetEndDate).toBeNull();
  });

  it('narrows lane to "main" for anything other than the literal "thread"', () => {
    expect(mapPhaseRowToScheduleInput(makePhaseRow({ lane: 'main' })).lane).toBe('main');
    expect(mapPhaseRowToScheduleInput(makePhaseRow({ lane: 'thread' })).lane).toBe('thread');
    // Defensive: the column has no CHECK constraint — an unexpected value
    // must fall back to 'main', never propagate an unknown lane string.
    expect(mapPhaseRowToScheduleInput(makePhaseRow({ lane: 'bogus' })).lane).toBe('main');
  });

  it('narrows status to a known PhaseStatus, defaulting to "pending"', () => {
    expect(mapPhaseRowToScheduleInput(makePhaseRow({ status: 'completed' })).status).toBe('completed');
    expect(mapPhaseRowToScheduleInput(makePhaseRow({ status: 'delayed' })).status).toBe('delayed');
    expect(mapPhaseRowToScheduleInput(makePhaseRow({ status: 'some-legacy-value' })).status).toBe('pending');
  });

  it('defaults sortOrder to 0 (row column is NOT NULL, but stays defensive)', () => {
    expect(mapPhaseRowToScheduleInput(makePhaseRow({ sort_order: 5 })).sortOrder).toBe(5);
    expect(mapPhaseRowToScheduleInput(makePhaseRow({ sort_order: 0 })).sortOrder).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// mapMilestoneRowToScheduleInput
// ─────────────────────────────────────────────────────────────────────────────

describe('mapMilestoneRowToScheduleInput', () => {
  it('maps a fully-populated milestone row snake_case → camelCase', () => {
    const row = makeMilestoneRow({
      phase_id: 'ph2',
      name: 'Vendor submittal due',
      kind: 'submittal-does-not-exist',
      offset_days: -3,
      anchor_date: '2026-04-01',
      status: 'due',
      sort_order: 1,
    });

    const mapped = mapMilestoneRowToScheduleInput(row);
    expect(mapped).toEqual({
      id: 'ms1',
      phaseId: 'ph2',
      name: 'Vendor submittal due',
      kind: 'event', // narrowed — 'submittal-does-not-exist' is not a valid MilestoneKind
      offsetDays: -3,
      anchorDate: '2026-04-01',
      status: 'due',
      sortOrder: 1,
    });
  });

  it('null-coalesces offsetDays and anchorDate to null', () => {
    const mapped = mapMilestoneRowToScheduleInput(
      makeMilestoneRow({ offset_days: null, anchor_date: null })
    );
    expect(mapped.offsetDays).toBeNull();
    expect(mapped.anchorDate).toBeNull();
  });

  it('narrows kind to a known MilestoneKind, defaulting to "event"', () => {
    for (const kind of ['signoff', 'decision', 'delivery', 'event'] as const) {
      expect(mapMilestoneRowToScheduleInput(makeMilestoneRow({ kind })).kind).toBe(kind);
    }
    expect(mapMilestoneRowToScheduleInput(makeMilestoneRow({ kind: 'unknown-kind' })).kind).toBe('event');
  });

  it('narrows status to a known MilestoneStatus, defaulting to "upcoming"', () => {
    for (const status of ['upcoming', 'due', 'signed', 'slipped'] as const) {
      expect(mapMilestoneRowToScheduleInput(makeMilestoneRow({ status })).status).toBe(status);
    }
    expect(mapMilestoneRowToScheduleInput(makeMilestoneRow({ status: 'unknown-status' })).status).toBe('upcoming');
  });

  it('carries phaseId from phase_id and defaults sortOrder to 0', () => {
    const mapped = mapMilestoneRowToScheduleInput(makeMilestoneRow({ phase_id: 'ph9', sort_order: 4 }));
    expect(mapped.phaseId).toBe('ph9');
    expect(mapped.sortOrder).toBe(4);
  });
});
