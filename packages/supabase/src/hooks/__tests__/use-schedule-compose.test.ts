import { describe, it, expect } from 'vitest';
import { serializeRippleEditForRpc } from '../use-schedule-compose';
import type { RipplePendingEditInput } from '../use-schedule-compose';

// ─────────────────────────────────────────────────────────────────────────────
// serializeRippleEditForRpc — pure camelCase → snake_case mapper feeding the
// commit_schedule_edit RPC (00325). No Supabase, no React Query involved.
// ─────────────────────────────────────────────────────────────────────────────

describe('serializeRippleEditForRpc', () => {
  it('serializes a phase-duration edit', () => {
    const edit: RipplePendingEditInput = {
      kind: 'phase-duration',
      phaseId: 'ph1',
      durationDays: 21,
    };
    expect(serializeRippleEditForRpc(edit)).toEqual({
      kind: 'phase-duration',
      phase_id: 'ph1',
      duration_days: 21,
    });
  });

  it('serializes a phase-anchor edit', () => {
    const edit: RipplePendingEditInput = {
      kind: 'phase-anchor',
      phaseId: 'ph2',
      anchorDate: '2026-09-01',
    };
    expect(serializeRippleEditForRpc(edit)).toEqual({
      kind: 'phase-anchor',
      phase_id: 'ph2',
      anchor_date: '2026-09-01',
    });
  });

  it('serializes a milestone-offset edit, including the host phaseId', () => {
    const edit: RipplePendingEditInput = {
      kind: 'milestone-offset',
      milestoneId: 'ms1',
      phaseId: 'ph2',
      offsetDays: -3,
    };
    expect(serializeRippleEditForRpc(edit)).toEqual({
      kind: 'milestone-offset',
      milestone_id: 'ms1',
      phase_id: 'ph2',
      offset_days: -3,
    });
  });

  it('round-trips a negative duration delta and a zero offset without dropping falsy values', () => {
    expect(
      serializeRippleEditForRpc({ kind: 'phase-duration', phaseId: 'ph1', durationDays: 0 }),
    ).toEqual({ kind: 'phase-duration', phase_id: 'ph1', duration_days: 0 });

    expect(
      serializeRippleEditForRpc({
        kind: 'milestone-offset',
        milestoneId: 'ms1',
        phaseId: 'ph1',
        offsetDays: 0,
      }),
    ).toEqual({ kind: 'milestone-offset', milestone_id: 'ms1', phase_id: 'ph1', offset_days: 0 });
  });

  it('throws on an unknown edit kind rather than silently dropping fields', () => {
    const bogus = { kind: 'phase-teleport', phaseId: 'ph1' } as unknown as RipplePendingEditInput;
    expect(() => serializeRippleEditForRpc(bogus)).toThrow(/unknown edit kind/i);
  });
});
