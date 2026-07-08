import {
  describeFieldEffect,
  fieldEffectType,
  fmtFieldDate,
  isDelayEffect,
} from '../field-sms';
import {
  deriveKindLine,
  isResolved,
  marginAccent,
  partitionMargin,
  type MarginItemRow,
} from '../margin-derivation';
import type { FieldParsedIntent } from '@patina/supabase';

function mkFieldSms(partial: Partial<MarginItemRow>): MarginItemRow {
  return {
    kind: 'field_sms',
    item_id: 'sms1',
    project_id: 'p1',
    proposal_id: null,
    anchor_kind: 'letterhead',
    anchor_id: null,
    state: 'logged',
    title: 'Sal Moretti',
    detail: "can't get the valve till Tues",
    ts: '2026-07-08T12:00:00Z',
    payload: {},
    ...partial,
  };
}

describe('fieldEffectType', () => {
  it('reads `type` or `intent`, else null', () => {
    expect(fieldEffectType({ type: 'mark_done' })).toBe('mark_done');
    expect(fieldEffectType({ intent: 'report_delay' })).toBe('report_delay');
    expect(fieldEffectType({})).toBeNull();
    expect(fieldEffectType(null)).toBeNull();
  });
});

describe('fmtFieldDate', () => {
  it('formats a bare YYYY-MM-DD at LOCAL midnight (no day slip)', () => {
    // Parsed as local midnight, so the weekday/day never drift by a day.
    expect(fmtFieldDate('2026-07-14')).toBe('Tue, Jul 14');
  });
  it('returns null for empty / unparseable input', () => {
    expect(fmtFieldDate(null)).toBeNull();
    expect(fmtFieldDate('')).toBeNull();
    expect(fmtFieldDate('not-a-date')).toBeNull();
  });
});

describe('isDelayEffect', () => {
  it('is true only for report_delay', () => {
    expect(isDelayEffect({ type: 'report_delay' })).toBe(true);
    expect(isDelayEffect({ type: 'mark_done' })).toBe(false);
    expect(isDelayEffect(null)).toBe(false);
  });
});

describe('describeFieldEffect', () => {
  const cases: Array<[FieldParsedIntent, string | null, string]> = [
    [{ type: 'mark_done' }, 'Rough-in plumbing', 'Mark “Rough-in plumbing” done'],
    [
      { type: 'report_delay', new_date: '2026-07-14' },
      'Rough-in plumbing',
      'Move “Rough-in plumbing” to Tue, Jul 14',
    ],
    [{ type: 'report_delay' }, null, 'Move it'],
    [{ type: 'flag_blocker', note: 'valve stuck' }, null, 'Raise a blocker: valve stuck'],
    [{ type: 'punch_report', note: 'scuffed trim' }, null, 'Log a punch item: scuffed trim'],
    [{ type: 'confirm_delivery' }, 'Receive sofa', 'Confirm delivery — close “Receive sofa”'],
    [{ type: 'note', note: 'on site' }, null, 'Note: on site'],
    [{ type: 'unclear' }, null, 'Unclear — needs your read'],
  ];

  it.each(cases)('renders %o → %s', (parsed, title, expected) => {
    expect(describeFieldEffect(parsed, title)).toBe(expected);
  });

  it('returns null when there is no effect type', () => {
    expect(describeFieldEffect({}, 'anything')).toBeNull();
    expect(describeFieldEffect(null, null)).toBeNull();
  });
});

describe('margin_items field_sms branch', () => {
  it('carries the field-triage accent (golden-hour)', () => {
    expect(marginAccent('field_sms').border).toBe('var(--color-golden-hour)');
  });

  it('labels the kind line by review state', () => {
    expect(deriveKindLine(mkFieldSms({ state: 'needs_review' }))).toBe('Field text · needs review');
    expect(deriveKindLine(mkFieldSms({ state: 'logged' }))).toBe('Field text');
  });

  it('sinks a logged text to settled but keeps a needs_review one raised', () => {
    expect(isResolved(mkFieldSms({ state: 'logged' }))).toBe(true);
    expect(isResolved(mkFieldSms({ state: 'needs_review' }))).toBe(false);
  });

  it('floats a needs_review text into needs-action, above notes/pulses', () => {
    const now = new Date('2026-07-08T18:00:00Z');
    const review = mkFieldSms({ item_id: 'r', state: 'needs_review' });
    const logged = mkFieldSms({ item_id: 'l', state: 'logged' });
    const { raised, settled } = partitionMargin([logged, review], now);
    expect(raised[0]?.item_id).toBe('r'); // needs_review floats to the top
    expect(settled.map((s) => s.item_id)).toContain('l'); // logged sinks
  });
});
