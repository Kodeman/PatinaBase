/**
 * `deriveAsBuiltChain` — pure TS mirror of `copy_schedule_as_built`'s
 * per-phase duration rule (migration 00324 §1d). Pins the SQL rule exactly:
 * actual elapsed (floored at 1) when the source phase carries real dates,
 * else the planned fallback (`duration_days ?? duration_weeks*7 ?? 14`),
 * sorted by `sortOrder`, normalized `lane`. Total — never throws.
 */

import { deriveAsBuiltChain, type AsBuiltSourcePhase } from './schedule-compose';

function src(over: Partial<AsBuiltSourcePhase> & { name: string; sortOrder: number }): AsBuiltSourcePhase {
  return {
    name: over.name,
    phaseKey: over.phaseKey ?? null,
    startDate: over.startDate ?? null,
    completedAt: over.completedAt ?? null,
    targetEndDate: over.targetEndDate ?? null,
    durationDays: over.durationDays ?? null,
    durationWeeks: over.durationWeeks ?? null,
    lane: over.lane ?? null,
    sortOrder: over.sortOrder,
  };
}

describe('deriveAsBuiltChain — actual-elapsed branch', () => {
  it('start + completed_at → GREATEST(1, completed - start)', () => {
    const result = deriveAsBuiltChain([
      src({ name: 'Consultation', sortOrder: 0, startDate: '2026-01-01', completedAt: '2026-01-15' }),
    ]);
    expect(result).toEqual([{ name: 'Consultation', phaseKey: null, durationDays: 14, lane: 'main' }]);
  });

  it('start + target_end_date (no completed_at) → GREATEST(1, target_end - start)', () => {
    const result = deriveAsBuiltChain([
      src({ name: 'Schematic Design', sortOrder: 0, startDate: '2026-01-01', targetEndDate: '2026-01-22' }),
    ]);
    expect(result[0].durationDays).toBe(21);
  });

  it('completed_at takes precedence over target_end_date when both are present', () => {
    const result = deriveAsBuiltChain([
      src({
        name: 'Design Development',
        sortOrder: 0,
        startDate: '2026-01-01',
        completedAt: '2026-01-10',
        targetEndDate: '2026-02-01', // must be ignored — completed_at wins
      }),
    ]);
    expect(result[0].durationDays).toBe(9);
  });

  it('a same-day start/end floors to 1 (GREATEST(1, 0))', () => {
    const result = deriveAsBuiltChain([
      src({ name: 'Same Day', sortOrder: 0, startDate: '2026-03-01', completedAt: '2026-03-01' }),
    ]);
    expect(result[0].durationDays).toBe(1);
  });

  it('a completed_at BEFORE start floors to 1 (GREATEST(1, negative))', () => {
    const result = deriveAsBuiltChain([
      src({ name: 'Backwards', sortOrder: 0, startDate: '2026-03-10', completedAt: '2026-03-01' }),
    ]);
    expect(result[0].durationDays).toBe(1);
  });

  it('completed_at may be a full timestamp — only the date portion is used (mirrors ::date)', () => {
    const result = deriveAsBuiltChain([
      src({ name: 'Timestamped', sortOrder: 0, startDate: '2026-01-01', completedAt: '2026-01-15T22:41:03.512Z' }),
    ]);
    expect(result[0].durationDays).toBe(14);
  });
});

describe('deriveAsBuiltChain — planned-fallback branch', () => {
  it('no start_date at all → falls to durationDays', () => {
    const result = deriveAsBuiltChain([src({ name: 'No Dates', sortOrder: 0, durationDays: 30 })]);
    expect(result[0].durationDays).toBe(30);
  });

  it('start_date present but neither completed_at nor target_end_date → falls to durationDays', () => {
    const result = deriveAsBuiltChain([
      src({ name: 'Open-ended', sortOrder: 0, startDate: '2026-01-01', durationDays: 12 }),
    ]);
    expect(result[0].durationDays).toBe(12);
  });

  it('durationDays null → falls to durationWeeks * 7', () => {
    const result = deriveAsBuiltChain([src({ name: 'Weeks Only', sortOrder: 0, durationWeeks: 8 })]);
    expect(result[0].durationDays).toBe(56);
  });

  it('durationDays and durationWeeks both null → falls to the 14-day default', () => {
    const result = deriveAsBuiltChain([src({ name: 'Nothing Stored', sortOrder: 0 })]);
    expect(result[0].durationDays).toBe(14);
  });

  it('durationDays === 0 is honored as 0 — COALESCE picks the first non-null value, not the first truthy one', () => {
    const result = deriveAsBuiltChain([src({ name: 'Zero Days', sortOrder: 0, durationDays: 0 })]);
    expect(result[0].durationDays).toBe(0);
  });

  it('durationWeeks === 0 (with durationDays null) is honored as 0 for the same reason', () => {
    const result = deriveAsBuiltChain([src({ name: 'Zero Weeks', sortOrder: 0, durationWeeks: 0 })]);
    expect(result[0].durationDays).toBe(0);
  });

  it('a malformed startDate degrades to the fallback instead of throwing', () => {
    const result = deriveAsBuiltChain([
      src({ name: 'Bad Date', sortOrder: 0, startDate: 'not-a-date', completedAt: '2026-01-15', durationDays: 5 }),
    ]);
    expect(result[0].durationDays).toBe(5);
  });
});

describe('deriveAsBuiltChain — name/phaseKey/lane carry + ordering', () => {
  it('carries name, phaseKey, and normalizes lane', () => {
    const result = deriveAsBuiltChain([
      src({ name: 'Procurement', phaseKey: 'procurement', sortOrder: 0, durationDays: 56, lane: 'thread' }),
    ]);
    expect(result).toEqual([{ name: 'Procurement', phaseKey: 'procurement', durationDays: 56, lane: 'thread' }]);
  });

  it('a null/garbage lane normalizes to "main"', () => {
    const result = deriveAsBuiltChain([src({ name: 'No Lane', sortOrder: 0, durationDays: 7, lane: null })]);
    expect(result[0].lane).toBe('main');
  });

  it('sorts by sortOrder regardless of input array order', () => {
    const result = deriveAsBuiltChain([
      src({ name: 'Third', sortOrder: 2, durationDays: 1 }),
      src({ name: 'First', sortOrder: 0, durationDays: 1 }),
      src({ name: 'Second', sortOrder: 1, durationDays: 1 }),
    ]);
    expect(result.map((r) => r.name)).toEqual(['First', 'Second', 'Third']);
  });

  it('mirrors the Patina Six template durations end to end', () => {
    const result = deriveAsBuiltChain([
      src({ name: 'Consultation', phaseKey: 'consultation', sortOrder: 0, durationDays: 7 }),
      src({ name: 'Schematic Design', phaseKey: 'concept_development', sortOrder: 1, durationDays: 21 }),
      src({ name: 'Design Development', phaseKey: 'design_refinement', sortOrder: 2, durationDays: 28 }),
      src({ name: 'Procurement & Orders', phaseKey: 'procurement', sortOrder: 3, durationDays: 56 }),
      src({ name: 'Installation & Styling', phaseKey: 'installation', sortOrder: 4, durationDays: 21 }),
      src({ name: 'Completion', phaseKey: 'final_walkthrough', sortOrder: 5, durationDays: 7 }),
    ]);
    expect(result.map((r) => r.durationDays)).toEqual([7, 21, 28, 56, 21, 7]);
  });
});

describe('deriveAsBuiltChain — totality', () => {
  it('an empty array returns an empty array', () => {
    expect(deriveAsBuiltChain([])).toEqual([]);
  });

  it('non-array input never throws — returns an empty array', () => {
    expect(() => deriveAsBuiltChain(null as unknown as AsBuiltSourcePhase[])).not.toThrow();
    expect(deriveAsBuiltChain(null as unknown as AsBuiltSourcePhase[])).toEqual([]);
    expect(deriveAsBuiltChain(undefined as unknown as AsBuiltSourcePhase[])).toEqual([]);
  });

  it('a garbage entry in the array (missing name) is dropped, not thrown', () => {
    const result = deriveAsBuiltChain([
      src({ name: 'Real Phase', sortOrder: 0, durationDays: 5 }),
      { sortOrder: 1 } as unknown as AsBuiltSourcePhase,
      null as unknown as AsBuiltSourcePhase,
    ]);
    expect(result).toEqual([{ name: 'Real Phase', phaseKey: null, durationDays: 5, lane: 'main' }]);
  });
});
