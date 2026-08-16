/**
 * SP3 — the send wall's state line. Pure logic, no DOM, no component imports
 * (stays off the help-system → @portabletext ESM trap, like its sibling).
 *
 * The matrix that matters is watch status × commercial_state × nudge cooldown
 * × issued_on_paper, because those three sources disagree by design: a client
 * signature moves `commercial_state` while `proposals.status` stays 'sent',
 * and a paper issuance moves `status` to 'sent' with no `sent_at` at all.
 */
import {
  deriveProposalWatch,
  deriveSendWallLine,
  NUDGE_COOLDOWN_DAYS,
  type SendWallLine,
} from '../proposal-watch-derivation';

const NOW = new Date('2026-06-24T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

/** The wall as it stands for one proposal shape. */
function line(over: {
  status?: string;
  sentAt?: string | null;
  viewedAt?: string | null;
  acceptedAt?: string | null;
  lastNudgedAt?: string | null;
  commercialState?: string | null;
  issuedOnPaper?: boolean;
}): SendWallLine | null {
  const watch = deriveProposalWatch(
    {
      status: over.status ?? 'sent',
      sentAt: over.sentAt === undefined ? daysAgo(3) : over.sentAt,
      viewedAt: over.viewedAt ?? null,
      acceptedAt: over.acceptedAt ?? null,
      lastNudgedAt: over.lastNudgedAt ?? null,
    },
    null,
    null,
    NOW,
  );
  return deriveSendWallLine(
    {
      watch,
      commercialState: over.commercialState ?? null,
      issuedOnPaper: over.issuedOnPaper ?? false,
    },
    NOW,
  );
}

/** Every shape the wall can be asked about, for the whole-matrix invariants. */
const MATRIX = [
  { status: 'sent' },
  { status: 'sent', lastNudgedAt: daysAgo(1) },
  { status: 'sent', lastNudgedAt: daysAgo(NUDGE_COOLDOWN_DAYS) },
  { status: 'sent', sentAt: null, issuedOnPaper: true },
  { status: 'sent', commercialState: 'sent' },
  { status: 'sent', commercialState: 'client_signed' },
  { status: 'viewed', viewedAt: daysAgo(1) },
  { status: 'viewed', viewedAt: daysAgo(1), lastNudgedAt: daysAgo(1) },
  { status: 'revised' },
  { status: 'expired' },
  { status: 'declined' },
] as const;

describe('deriveSendWallLine — the wall stands down', () => {
  it('says nothing about a draft: there is no wall before the send', () => {
    expect(line({ status: 'draft', sentAt: null })).toBeNull();
  });

  it('says nothing once the proposal is signed — the seal speaks for itself', () => {
    expect(line({ status: 'accepted', acceptedAt: daysAgo(1) })).toBeNull();
  });

  it.each(['executed', 'declined', 'superseded'])(
    'stands down on a %s commercial edition — the status block states it in full',
    (commercialState) => {
      expect(line({ status: 'sent', commercialState })).toBeNull();
    },
  );

  it("does NOT stand down on a live commercial edition ('sent' / 'client_signed')", () => {
    expect(line({ status: 'sent', commercialState: 'sent' })).not.toBeNull();
    expect(line({ status: 'sent', commercialState: 'client_signed' })).not.toBeNull();
  });
});

describe('deriveSendWallLine — the verb', () => {
  it('offers the nudge on a sent proposal that has never been nudged', () => {
    expect(line({ status: 'sent' })).toMatchObject({ verb: 'nudge', stateWord: null });
  });

  it('withholds the nudge inside the cooldown and names the last one instead', () => {
    expect(line({ status: 'sent', lastNudgedAt: daysAgo(1) })).toMatchObject({
      verb: null,
      stateWord: 'nudged Jun 23',
    });
  });

  it('offers the nudge again once the cooldown has lapsed', () => {
    expect(
      line({ status: 'sent', lastNudgedAt: daysAgo(NUDGE_COOLDOWN_DAYS) }),
    ).toMatchObject({ verb: 'nudge' });
  });

  // F1: nudge_proposal (00231) would accept a paper-issued agreement, burn the
  // cooldown and dispatch an email to a household that was never emailed and
  // may have no address on file.
  it('NEVER offers the nudge on a paper-issued agreement, cooldown or not', () => {
    expect(line({ status: 'sent', sentAt: null, issuedOnPaper: true })).toMatchObject({
      sentText: 'Issued on paper',
      verb: null,
    });
    expect(
      line({ status: 'sent', sentAt: null, issuedOnPaper: true, lastNudgedAt: daysAgo(9) }),
    ).toMatchObject({ verb: null });
  });

  it('withholds the nudge from a household that has already signed', () => {
    expect(line({ status: 'sent', commercialState: 'client_signed' })).toMatchObject({
      verb: null,
      stateWord: 'awaiting countersign',
    });
  });
});

describe('deriveSendWallLine — the state word', () => {
  it('names "awaiting countersign" ONLY when the client has signed', () => {
    const said = MATRIX.map((shape) => ({ shape, model: line({ ...shape }) })).filter(
      ({ model }) => model?.stateWord === 'awaiting countersign',
    );
    expect(said).toHaveLength(1);
    expect(said[0].shape).toMatchObject({ commercialState: 'client_signed' });
  });

  it('states the terminal words rather than a reminder that cannot help', () => {
    expect(line({ status: 'declined' })).toMatchObject({
      stateWord: 'declined by the client',
    });
    expect(line({ status: 'expired' })).toMatchObject({ stateWord: 'expired unsigned' });
    expect(line({ status: 'revised' })).toMatchObject({
      stateWord: 'superseded by a newer version',
    });
  });

  it('falls back to the client’s signature, never to a countersign that is not owed', () => {
    expect(line({ status: 'sent', sentAt: null, issuedOnPaper: true })).toMatchObject({
      stateWord: 'awaiting the client’s signature',
    });
  });
});

describe('deriveSendWallLine — invariants across the matrix', () => {
  it('prints exactly one of {verb, state word} for every shape it speaks about', () => {
    for (const shape of MATRIX) {
      const model = line({ ...shape });
      expect(model).not.toBeNull();
      const spoke = [model!.verb, model!.stateWord].filter((v) => v !== null);
      // The shape rides in the assertion so a failure names which one broke.
      expect({ shape, spoke }).toEqual({ shape, spoke: [expect.any(String)] });
    }
  });

  it('never prints an empty sent text', () => {
    for (const shape of MATRIX) {
      expect(line({ ...shape })!.sentText.length).toBeGreaterThan(0);
    }
  });
});

describe('deriveSendWallLine — the sent phrase', () => {
  // F6: calendar days in the viewer's own zone, not 24h buckets — something
  // sent at 11pm reads "yesterday" at 1am, the way a person reads a date.
  it('reads the dispatch in calendar days', () => {
    const today = new Date(NOW.getTime() - 60 * 60 * 1000).toISOString();
    expect(line({ sentAt: today })!.sentText).toBe('Sent today');
    expect(line({ sentAt: daysAgo(1) })!.sentText).toBe('Sent yesterday');
    expect(line({ sentAt: daysAgo(3) })!.sentText).toBe('Sent 3 days ago');
  });

  it('crosses to "yesterday" on the calendar boundary, not on the 24th hour', () => {
    // 23:30 local the previous day, read at 00:30 local — one hour elapsed,
    // one calendar day crossed.
    const justBeforeMidnight = new Date(2026, 5, 23, 23, 30).toISOString();
    const justAfterMidnight = new Date(2026, 5, 24, 0, 30);
    const watch = deriveProposalWatch(
      { status: 'sent', sentAt: justBeforeMidnight },
      null,
      null,
      justAfterMidnight,
    );
    expect(
      deriveSendWallLine(
        { watch, commercialState: null, issuedOnPaper: false },
        justAfterMidnight,
      )!.sentText,
    ).toBe('Sent yesterday');
  });

  it('stops counting days past the ceiling and states the day instead', () => {
    expect(line({ sentAt: daysAgo(30) })!.sentText).toBe('Sent 30 days ago');
    expect(line({ sentAt: daysAgo(31) })!.sentText).toBe('Sent May 24');
  });

  // 00477's paper door writes no sent_at, because nothing was sent.
  it('says how a paper-issued agreement reached the client', () => {
    expect(line({ sentAt: null, issuedOnPaper: true })!.sentText).toBe('Issued on paper');
  });
});
