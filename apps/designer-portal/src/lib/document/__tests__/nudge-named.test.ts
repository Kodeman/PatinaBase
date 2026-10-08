/**
 * US-19 FR6 F6-1 (D1-d) — the clauses a Nudge names above the Message
 * composer: the proposal first while it is out, then the overdue decisions in
 * the margin's order (a proposal paper) or the approvals filter's (a project).
 */
import type { MarginItemRow } from '../margin-derivation';
import {
  overdueApprovalTitles,
  overdueMarginDecisionTitles,
  waitingOnNamed,
} from '../nudge-named';

const at = (day: number) => new Date(2026, 9, day, 12).toISOString();
const margin = (over: Partial<MarginItemRow>): MarginItemRow => ({
  kind: 'decision',
  item_id: String(over.title),
  project_id: null,
  proposal_id: 'proposal-53',
  anchor_kind: 'letterhead',
  anchor_id: null,
  state: 'overdue',
  title: '',
  detail: '',
  ts: at(1),
  payload: {},
  ...over,
});

describe('waitingOnNamed', () => {
  it('leads with the proposal while it is sent or viewed', () => {
    for (const status of ['sent', 'viewed']) {
      expect(waitingOnNamed({ status, sentAt: at(3) }, ['Rug size'])).toEqual([
        'the proposal, sent 3 October',
        'Rug size',
      ]);
    }
  });

  it('names no proposal once it is signed, or before it is sent', () => {
    expect(waitingOnNamed({ status: 'accepted', sentAt: at(3) }, ['Rug size'])).toEqual(['Rug size']);
    expect(waitingOnNamed({ status: 'sent', sentAt: null }, [])).toEqual([]);
    expect(waitingOnNamed(null, ['Rug size'])).toEqual(['Rug size']);
  });
});

describe('overdueMarginDecisionTitles', () => {
  it('Tanaka: the two overdue decisions, in the order the margin prints them', () => {
    const rows = [
      margin({ title: 'Rug size — 8x10 vs 9x12', ts: at(5) }),
      margin({ kind: 'message', state: 'open', title: 'Mei wrote', ts: at(2) }),
      margin({ title: 'Side table finish', state: 'pending', ts: at(20) }),
      margin({ title: 'Lamp shade', state: 'responded', ts: at(1) }),
      margin({ title: 'Daybed cushion — undyed linen vs moss wool', ts: at(4) }),
    ];
    expect(overdueMarginDecisionTitles(rows, new Date(2026, 9, 7, 9))).toEqual([
      'Daybed cushion — undyed linen vs moss wool',
      'Rug size — 8x10 vs 9x12',
    ]);
  });
});

describe('overdueApprovalTitles', () => {
  it('is the overdue_decision row’s filter: active, not approved, overdue', () => {
    const approval = (artifactTitle: string, over: Record<string, unknown> = {}) => ({
      artifactTitle,
      disposition: 'active',
      outcome: null,
      isOverdue: true,
      ...over,
    });
    expect(
      overdueApprovalTitles([
        approval('Living room rug'),
        approval('Dining chairs', { outcome: 'approved' }),
        approval('Sconces', { disposition: 'withdrawn' }),
        approval('Drapery', { isOverdue: false }),
        approval(''),
        approval('Bench'),
      ]),
    ).toEqual(['Living room rug', 'Bench']);
  });
});
