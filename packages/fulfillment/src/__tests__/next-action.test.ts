import { describe, it, expect } from 'vitest';
import { describeNextAction, isBreachedAge, formatStageAge } from '../next-action';

describe('describeNextAction', () => {
  it.each([
    [{ kind: 'assign_vendor', params: { unmapped_count: 2 } }, 'Assign vendor — 2 unmapped'],
    [{ kind: 'assign_vendor', params: { unmapped_count: 1 } }, 'Assign vendor — 1 unmapped'],
    [{ kind: 'resolve_exception', params: { exception_count: 1 } }, 'Resolve exception — 1 open'],
    [{ kind: 'resolve_exception', params: { exception_count: 3 } }, 'Resolve exceptions — 3 open'],
    [{ kind: 'confirm_split' }, 'Confirm split'],
    [{ kind: 'transmit_pos', params: { po_count: 2 } }, 'Send 2 POs'],
    [{ kind: 'transmit_pos', params: { po_count: 1 } }, 'Send 1 PO'],
    [{ kind: 'chase_ack', params: { days_overdue: 2, client_surname: 'Vandermeer' } }, 'Chase Vandermeer — day 2'],
    [{ kind: 'chase_ack', params: { days_overdue: 3 } }, 'Chase — day 3'],
    [{ kind: 'chase_ack', params: {} }, 'Chase overdue acknowledgment'],
    [{ kind: 'awaiting_ack' }, 'Awaiting acknowledgment'],
    [{ kind: 'in_production' }, 'In production'],
    [{ kind: 'in_transit' }, 'In transit'],
    [{ kind: 'awaiting_settlement' }, 'Awaiting settlement'],
    [{ kind: 'review' }, 'Review order'],
  ])('renders %j -> %s', (action, expected) => {
    expect(describeNextAction(action as any)).toBe(expected);
  });

  it('falls back to a neutral verb for an unrecognized kind — never drops the row', () => {
    expect(describeNextAction({ kind: 'some_future_kind_not_yet_known' })).toBe('Review order');
    expect(describeNextAction({ kind: 'totally_made_up', params: { anything: 1 } })).toBe('Review order');
  });

  it('falls back to a neutral verb for null/undefined/empty-kind input', () => {
    expect(describeNextAction(null)).toBe('Review order');
    expect(describeNextAction(undefined)).toBe('Review order');
    expect(describeNextAction({ kind: '' })).toBe('Review order');
  });

  it('handles missing params gracefully (zero-ish fallback text, not a crash)', () => {
    expect(describeNextAction({ kind: 'assign_vendor' })).toBe('Assign vendor');
    expect(describeNextAction({ kind: 'resolve_exception' })).toBe('Resolve exception');
    expect(describeNextAction({ kind: 'transmit_pos' })).toBe('Send POs');
  });
});

describe('isBreachedAge', () => {
  it('is true only for breached === true', () => {
    expect(isBreachedAge(true)).toBe(true);
    expect(isBreachedAge(false)).toBe(false);
    expect(isBreachedAge(null)).toBe(false);
    expect(isBreachedAge(undefined)).toBe(false);
  });
});

describe('formatStageAge', () => {
  it('formats sub-hour, hour, and day-scale ages', () => {
    expect(formatStageAge(0.5)).toBe('<1h');
    expect(formatStageAge(3)).toBe('3h');
    expect(formatStageAge(23)).toBe('23h');
    expect(formatStageAge(24)).toBe('3d'); // 24 business hours / 8h business day = 3d
    expect(formatStageAge(40)).toBe('5d');
  });

  it('renders an em dash for missing data', () => {
    expect(formatStageAge(null)).toBe('—');
    expect(formatStageAge(undefined)).toBe('—');
    expect(formatStageAge(NaN)).toBe('—');
  });
});
