/**
 * Proposal-watch derivation — pure logic, no DOM, no component imports
 * (stays off the help-system → @portabletext ESM trap, like desk-derivation).
 */
import {
  deriveProposalWatch,
  sectionLabel,
  AWAITING_AGED_DAYS,
  NUDGE_COOLDOWN_DAYS,
  type ProposalWatchInput,
} from '../proposal-watch-derivation';
import type { ProposalEngagementEvent, ProposalEngagementStats } from '@patina/supabase';

const NOW = new Date('2026-06-24T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

function open(at: string): ProposalEngagementEvent {
  return {
    id: `e-${at}`,
    proposal_id: 'p1',
    viewer_id: 'v1',
    event_type: 'opened',
    section_type: null,
    duration_seconds: null,
    metadata: {},
    created_at: at,
  };
}

const stats = (over: Partial<ProposalEngagementStats> = {}): ProposalEngagementStats => ({
  timesOpened: 0,
  totalReadingSeconds: 0,
  lastOpenedAt: null,
  sectionBreakdown: [],
  mostViewedSection: null,
  ...over,
});

const input = (over: Partial<ProposalWatchInput>): ProposalWatchInput => ({
  status: 'sent',
  sentAt: daysAgo(0),
  viewedAt: null,
  version: 1,
  ...over,
});

describe('deriveProposalWatch — status → stamp', () => {
  it('sent + unopened reads SENT (clay), awaiting the client, no opens', () => {
    const m = deriveProposalWatch(input({ status: 'sent', sentAt: daysAgo(0) }), stats(), [], NOW);
    expect(m.stamp.label).toBe('SENT');
    expect(m.stamp.color).toBe('var(--color-clay)');
    expect(m.awaitingClient).toBe(true);
    expect(m.settled).toBe(false);
    expect(m.terminal).toBe(false);
    expect(m.openedCount).toBe(0);
  });

  it('viewed + recent reads VIEWED (sage), not aged', () => {
    const m = deriveProposalWatch(
      input({ status: 'viewed', sentAt: daysAgo(1), viewedAt: daysAgo(1) }),
      stats({ timesOpened: 2, lastOpenedAt: daysAgo(0), totalReadingSeconds: 300 }),
      [open(daysAgo(0)), open(daysAgo(1))],
      NOW,
    );
    expect(m.stamp.label).toBe('VIEWED');
    expect(m.stamp.color).toBe('var(--color-sage)');
    expect(m.isAwaitingAged).toBe(false);
    expect(m.openedCount).toBe(2);
    expect(m.readingSeconds).toBe(300);
  });

  it('viewed + sitting >= AWAITING_AGED_DAYS promotes to AWAITING (golden)', () => {
    const m = deriveProposalWatch(
      input({ status: 'viewed', sentAt: daysAgo(5), viewedAt: daysAgo(AWAITING_AGED_DAYS) }),
      stats({ timesOpened: 1, lastOpenedAt: daysAgo(AWAITING_AGED_DAYS) }),
      [open(daysAgo(AWAITING_AGED_DAYS))],
      NOW,
    );
    expect(m.isAwaitingAged).toBe(true);
    expect(m.stamp.label).toBe('AWAITING');
    expect(m.stamp.color).toBe('var(--color-golden-hour)');
    expect(m.awaitingDays).toBe(AWAITING_AGED_DAYS);
  });

  it('accepted is settled — SIGNED seal, not awaiting', () => {
    const m = deriveProposalWatch(input({ status: 'accepted' }), stats(), [], NOW);
    expect(m.stamp.label).toBe('SIGNED');
    expect(m.settled).toBe(true);
    expect(m.awaitingClient).toBe(false);
  });

  it('declined is terminal — DECLINED (terracotta)', () => {
    const m = deriveProposalWatch(input({ status: 'declined' }), stats(), [], NOW);
    expect(m.stamp.label).toBe('DECLINED');
    expect(m.stamp.color).toBe('var(--color-terracotta)');
    expect(m.terminal).toBe(true);
    expect(m.awaitingClient).toBe(false);
  });

  it('expired is terminal — EXPIRED', () => {
    const m = deriveProposalWatch(input({ status: 'expired' }), stats(), [], NOW);
    expect(m.stamp.label).toBe('EXPIRED');
    expect(m.terminal).toBe(true);
  });

  it('revised reads REVISED and still awaits the client', () => {
    const m = deriveProposalWatch(input({ status: 'revised' }), stats(), [], NOW);
    expect(m.stamp.label).toBe('REVISED');
    expect(m.awaitingClient).toBe(true);
  });

  it('sent stays SENT even when sitting unopened (the aging line carries it, not the stamp)', () => {
    const m = deriveProposalWatch(
      input({ status: 'sent', sentAt: daysAgo(5) }),
      stats(),
      [],
      NOW,
    );
    expect(m.stamp.label).toBe('SENT');
    expect(m.isAwaitingAged).toBe(true); // line emphasis, not stamp promotion
  });
});

describe('deriveProposalWatch — the record', () => {
  it('lists opens newest-first with dispatched as the oldest entry', () => {
    const events = [open(daysAgo(0)), open(daysAgo(1)), open(daysAgo(3))]; // desc, as the query returns
    const m = deriveProposalWatch(
      input({ status: 'viewed', sentAt: daysAgo(4), viewedAt: daysAgo(3) }),
      stats({ timesOpened: 3 }),
      events,
      NOW,
    );
    expect(m.record.map((r) => r.kind)).toEqual(['opened', 'opened', 'opened', 'dispatched']);
    expect(m.record[0].at).toBe(daysAgo(0)); // most recent open first
    expect(m.record[m.record.length - 1].at).toBe(daysAgo(4)); // dispatched (sent_at) last
  });

  it('with no sent_at, the record is opens only', () => {
    const m = deriveProposalWatch(input({ status: 'sent', sentAt: null }), stats(), [], NOW);
    expect(m.record).toEqual([]);
  });
});

describe('deriveProposalWatch — per-open attention (Phase 4)', () => {
  // section_viewed event in the vocabulary the client portal records.
  const sview = (at: string, section: string, seconds: number): ProposalEngagementEvent => ({
    id: `s-${at}-${section}`,
    proposal_id: 'p1',
    viewer_id: 'v1',
    event_type: 'section_viewed',
    section_type: section,
    duration_seconds: seconds,
    metadata: {},
    created_at: at,
  });
  const at = (msFromNow: number) => new Date(NOW.getTime() - msFromNow).toISOString();
  const HOUR = 3_600_000;
  const DAY = 86_400_000;

  // Two sessions (events arrive newest-first, as the query returns):
  //   session 2 (newer, opened 2h ago): selections 120s + vision 30s
  //   session 1 (older, opened 1d ago):  investment 200s + selections 40s
  const events: ProposalEngagementEvent[] = [
    open(at(2 * HOUR)),
    sview(at(2 * HOUR - 60_000), 'selections', 120),
    sview(at(2 * HOUR - 120_000), 'vision', 30),
    open(at(DAY)),
    sview(at(DAY - 60_000), 'investment', 200),
    sview(at(DAY - 120_000), 'selections', 40),
  ];

  it('attributes each session’s minutes + most-dwelt section to its open', () => {
    const m = deriveProposalWatch(
      input({ status: 'viewed', sentAt: at(2 * DAY), viewedAt: at(DAY) }),
      stats({ timesOpened: 2 }),
      events,
      NOW,
    );
    expect(m.record.map((r) => r.kind)).toEqual(['opened', 'opened', 'dispatched']);
    // session 2: 150s → 3 min, most-dwelt = Selections (120 > 30)
    expect(m.record[0].minutes).toBe(3);
    expect(m.record[0].sectionLabel).toBe('Selections');
    // session 1: 240s → 4 min, most-dwelt = Investment (200 > 40)
    expect(m.record[1].minutes).toBe(4);
    expect(m.record[1].sectionLabel).toBe('Investment');
    // dispatched line carries no attention
    expect(m.record[2].minutes).toBeUndefined();
    expect(m.record[2].sectionLabel).toBeUndefined();
  });

  it('an open with no section views in its window carries no minutes/section', () => {
    const m = deriveProposalWatch(
      input({ status: 'viewed', sentAt: at(DAY), viewedAt: at(0) }),
      stats({ timesOpened: 1 }),
      [open(at(0))],
      NOW,
    );
    expect(m.record[0].minutes).toBeUndefined();
    expect(m.record[0].sectionLabel).toBeUndefined();
  });
});

describe('deriveProposalWatch — nudge eligibility (Phase 3)', () => {
  it('sent/viewed with no prior nudge → canNudge', () => {
    expect(deriveProposalWatch(input({ status: 'sent' }), stats(), [], NOW).canNudge).toBe(true);
    expect(
      deriveProposalWatch(input({ status: 'viewed', viewedAt: daysAgo(1) }), stats(), [], NOW).canNudge,
    ).toBe(true);
  });

  it('within the cooldown → cannot nudge again; lastNudgedAt is surfaced', () => {
    const m = deriveProposalWatch(
      input({ status: 'viewed', viewedAt: daysAgo(5), lastNudgedAt: daysAgo(1) }),
      stats(),
      [],
      NOW,
    );
    expect(m.canNudge).toBe(false);
    expect(m.lastNudgedAt).toBe(daysAgo(1));
  });

  it('past the cooldown → can nudge again', () => {
    const m = deriveProposalWatch(
      input({ status: 'viewed', viewedAt: daysAgo(7), lastNudgedAt: daysAgo(NUDGE_COOLDOWN_DAYS) }),
      stats(),
      [],
      NOW,
    );
    expect(m.canNudge).toBe(true);
  });

  it('accepted / declined / expired are not nudgeable', () => {
    for (const status of ['accepted', 'declined', 'expired'] as const) {
      expect(deriveProposalWatch(input({ status }), stats(), [], NOW).canNudge).toBe(false);
    }
  });
});

describe('sectionLabel + mostReadSectionLabel', () => {
  it('maps the known section vocabulary', () => {
    expect(sectionLabel('selections')).toBe('Selections');
    expect(sectionLabel('space_plan')).toBe('Space plan');
    expect(sectionLabel('investment')).toBe('Investment');
  });

  it('humanizes unknown types and passes null through', () => {
    expect(sectionLabel('some_new_thing')).toBe('some new thing');
    expect(sectionLabel(null)).toBeNull();
    expect(sectionLabel(undefined)).toBeNull();
  });

  it('surfaces the most-read section as a label on the model', () => {
    const m = deriveProposalWatch(
      input({ status: 'viewed', viewedAt: daysAgo(0) }),
      stats({ timesOpened: 1, mostViewedSection: 'selections' }),
      [open(daysAgo(0))],
      NOW,
    );
    expect(m.mostReadSectionLabel).toBe('Selections');
  });
});
