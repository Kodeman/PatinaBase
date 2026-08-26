import type { SectionKey } from '../desk-derivation';
import { deriveTicketLeader, leadTicketException } from '../ticket-leader';
import type { TicketException, TicketRow, TicketRowKey } from '../ticket-derivation';

const LABELS: Record<TicketRowKey, string> = {
  rooms: 'Rooms',
  pieces: 'Pieces',
  drawings: 'Drawings',
  spec: 'Spec',
  boards: 'Boards',
  money: 'Money',
  dates: 'Dates',
  people: 'People',
};

const ROW_ORDER: readonly TicketRowKey[] = [
  'rooms', 'pieces', 'drawings', 'spec', 'boards', 'money', 'dates', 'people',
];

const SECTIONS: readonly SectionKey[] = [
  'brief', 'discovery', 'direction', 'proposal', 'project', 'install', 'care',
];

const row = (
  key: TicketRowKey,
  exception: TicketException | null = null,
  value = 'Nothing to report',
): TicketRow => ({
  key,
  label: LABELS[key],
  value,
  emphasis: exception?.phrase ?? null,
  door: { kind: 'none' },
  exception,
});

/** The eight rows, always eight, always in order — quiet unless a caller
 *  stands one of them up. */
const ticket = (exceptions: Partial<Record<TicketRowKey, TicketException>> = {}) =>
  ROW_ORDER.map((key) => row(key, exceptions[key] ?? null));

const moneyAtRisk = (standingSince: string | null = null): TicketException => ({
  rank: 'money-at-risk',
  phrase: '1 damaged',
  standingSince,
});

const promisePastDue = (standingSince: string | null = null): TicketException => ({
  rank: 'promise-past-due',
  phrase: '$17,500 owed you',
  standingSince,
});

const pieceStuck = (standingSince: string | null = null): TicketException => ({
  rank: 'piece-stuck',
  phrase: '2 unspecified',
  standingSince,
});

describe('deriveTicketLeader — the fourteen states', () => {
  // The rest half: no row on the ticket is unclear, so the leader prints the
  // stage's rest sentence and act (direction-b §3.2's closing clause).
  it.each([
    ['brief', 'Nothing to decide yet.', null, null],
    ['discovery', 'Discovery is complete. Shape the direction.', 'Begin the direction', 'direction'],
    ['direction', 'The direction is written. Send it.', 'Send the agreement', 'direction'],
    ['proposal', 'Signed. Open the project.', 'Open the project', 'proposal'],
    ['project', 'Everything ordered is moving.', 'Release the next room', 'project'],
    // The dated form is the guide's to substitute — only it holds the
    // schedule facts — so the leader states the vocabulary's own row.
    ['install', 'Install day is {Weekday}, {Month d}.', 'Hold the window', 'install'],
    ['care', 'Everything is settled.', 'Close the book', 'care'],
  ] as const)(
    'prints %s its rest sentence and act when no row is unclear',
    (stage, headline, label, section) => {
      const leader = deriveTicketLeader(ticket(), stage);

      expect(leader.headline).toBe(headline);
      expect(leader.action?.label ?? null).toBe(label);
      expect(leader.action?.key ?? null).toBe(label === null ? null : `rest-${stage}`);
      expect(
        leader.action?.destination.kind === 'anchor' ? leader.action.destination.section : null,
      ).toBe(section);
    },
  );

  // The active half: a row is unclear, so the leader names it in the ticket's
  // own words and offers the stage's own act.
  it.each([
    ['brief', 'Accept and begin'],
    ['discovery', 'Add scope & rooms'],
    ['direction', 'Open the Drafting Room'],
    // `proposal` never reaches the sixth rung — rung five owns it
    // (direction-b §3.3) — but the leader is total over the seven stages.
    ['proposal', 'Review signing controls'],
    ['project', 'Open the FF&E schedule'],
    ['install', "Check what's arriving"],
    ['care', 'Run the closeout checklist'],
  ] as const)('names the unclear row on %s and offers the stage act', (stage, label) => {
    const leader = deriveTicketLeader(ticket({ money: promisePastDue('2026-08-01') }), stage);

    expect(leader.headline).toBe('Money · $17,500 owed you');
    expect(leader.action?.label).toBe(label);
  });

  it('never leads a rest act with the word Review', () => {
    const labels = SECTIONS.map((stage) => deriveTicketLeader(ticket(), stage).action?.label ?? '');

    expect(labels.filter((label) => /\bReview\b/.test(label))).toEqual([]);
  });

  it('never leads an active act with the word Review, except the proposal signing controls SP-12 preserves', () => {
    const labels = SECTIONS.map(
      (stage) =>
        deriveTicketLeader(ticket({ pieces: pieceStuck() }), stage).action?.label ?? '',
    );

    expect(labels.filter((label) => /\bReview\b/.test(label))).toEqual(['Review signing controls']);
  });

  it('never states the word Review in any of the fourteen sentences', () => {
    const headlines = SECTIONS.flatMap((stage) => [
      deriveTicketLeader(ticket(), stage).headline,
      deriveTicketLeader(ticket({ money: promisePastDue('2026-08-01') }), stage).headline,
    ]);

    expect(headlines.filter((headline) => /\bReview\b/.test(headline))).toEqual([]);
  });
});

describe('deriveTicketLeader — direction-b §3.2, the tie-break', () => {
  it('leads with money at risk today over a promise past its date', () => {
    const leader = deriveTicketLeader(
      ticket({
        pieces: moneyAtRisk('2026-08-20'),
        money: promisePastDue('2026-08-01'),
      }),
      'project',
    );

    expect(leader.headline).toBe('Pieces · 1 damaged');
  });

  // J2's contradiction, resolved in the tie-break's favour: direction-b §3.3's
  // project example elects the unanswered PO (rank three) over the two dated
  // approvals (rank two). The rule wins; the example is wrong. The rank-three
  // row here is also EARLIER in ticket order, so nothing but the rank can be
  // carrying the result.
  it('leads with a dated promise past its date over a piece that cannot move', () => {
    const leader = deriveTicketLeader(
      ticket({
        pieces: pieceStuck('2026-07-01'),
        spec: pieceStuck('2026-07-01'),
        money: promisePastDue('2026-08-01'),
      }),
      'project',
    );

    expect(leader.headline).toBe('Money · $17,500 owed you');
  });

  it('gives a tie inside a rank to the older date', () => {
    const older: TicketException = {
      rank: 'promise-past-due',
      phrase: 'Install day has passed',
      standingSince: '2026-07-04',
    };
    const leader = deriveTicketLeader(
      ticket({ money: promisePastDue('2026-08-01'), dates: older }),
      'project',
    );

    expect(leader.headline).toBe('Dates · Install day has passed');
  });

  it('sorts a row standing since no stated day behind a dated one of the same rank', () => {
    const leader = deriveTicketLeader(
      ticket({ pieces: pieceStuck(null), spec: pieceStuck('2026-08-19') }),
      'project',
    );

    expect(leader.headline).toBe('Spec · 2 unspecified');
  });

  it('falls back to ticket order when rank and standing day both tie', () => {
    const leader = deriveTicketLeader(
      ticket({ pieces: pieceStuck('2026-08-19'), spec: pieceStuck('2026-08-19') }),
      'project',
    );

    expect(leader.headline).toBe('Pieces · 2 unspecified');
  });
});

describe('leadTicketException', () => {
  it('elects nothing when no row is unclear', () => {
    expect(leadTicketException(ticket())).toBeNull();
  });

  it('elects nothing from an empty ticket', () => {
    expect(leadTicketException([])).toBeNull();
  });

  // The guide can never name what the map does not show: a spread that prints
  // a shorter ticket hands a shorter ticket here, and the rows it left off are
  // not candidates.
  it('never elects a leader for a row the ticket does not print', () => {
    const printed = ticket({ spec: pieceStuck('2026-08-19') }).filter((entry) => entry.key !== 'money');
    const unprintedMoney = row('money', promisePastDue('2026-08-01'));

    expect(printed).not.toContainEqual(unprintedMoney);
    expect(leadTicketException(printed)?.key).toBe('spec');
    expect(deriveTicketLeader(printed, 'project').headline).toBe('Spec · 2 unspecified');
  });

  it('never elects a row whose source has not answered', () => {
    // `deriveTicket` carries no exception on an unsettled row — `Reading…` is
    // not a fact the guide may lead with.
    const reading = ticket().map((entry) =>
      entry.key === 'money' ? row('money', null, 'Reading…') : entry,
    );

    expect(leadTicketException(reading)).toBeNull();
    expect(deriveTicketLeader(reading, 'project').headline).toBe('Everything ordered is moving.');
  });
});
