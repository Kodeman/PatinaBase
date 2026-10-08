import type { DocumentStateRow } from '../desk-derivation';
import { sentProposalVoice, type SentProposalRecord } from '../sent-proposal-voice';

// US-19 FR8 F8-3 / F8-4 — the sentence line 2 prints off a sent proposal where
// Message is held and the reminder cannot be sent, and the countersign fact.
describe('sentProposalVoice (FR8 F8-3, F8-4)', () => {
  const now = new Date('2026-10-08T15:00:00Z');
  const fiveDays = '2026-10-03T12:00:00Z';
  const row = (over: Partial<DocumentStateRow> = {}) =>
    ({
      engagement_id: 'tanaka',
      engagement_kind: 'proposal',
      active_section: 'proposal',
      client_name: 'Mei Tanaka',
      title: 'Tanaka Garden Flat',
      client_profile_id: null,
      proposal_status: 'sent',
      proposal_sent_at: fiveDays,
      proposal_viewed_at: null,
      proposal_last_opened_at: null,
      ...over,
    }) as unknown as DocumentStateRow;
  const proposal = (over: Partial<SentProposalRecord> = {}): SentProposalRecord => ({
    status: 'sent',
    sent_at: fiveDays,
    viewed_at: null,
    last_nudged_at: null,
    commercial_state: null,
    issued_on_paper: false,
    ...over,
  });
  const paperIssue = () => ({
    row: row({ proposal_sent_at: null }),
    proposal: proposal({ sent_at: null, issued_on_paper: true }),
  });

  it('issued on paper, no login, never reminded: `Issued on paper — awaiting Mei’s signature.`', () => {
    const read = sentProposalVoice({
      ...paperIssue(),
      clientMessageable: false,
      clientFirstName: 'Mei',
      now,
    });
    expect(read.reminderAvailable).toBe(false);
    expect(read.ownSentence).toBe('Issued on paper — awaiting Mei’s signature.');
    expect(read.countersignPending).toBe(false);
  });

  it('no name: `Issued on paper — awaiting the client’s signature.`', () => {
    for (const clientFirstName of [null, undefined, ' ']) {
      const read = sentProposalVoice({
        ...paperIssue(),
        clientMessageable: false,
        clientFirstName,
        now,
      });
      expect(read.ownSentence).toBe('Issued on paper — awaiting the client’s signature.');
    }
  });

  it('inside the reminder’s cooldown: unchanged, `Reminder sent 7 October.`', () => {
    const read = sentProposalVoice({
      row: row(),
      proposal: proposal({ last_nudged_at: '2026-10-07T12:00:00Z' }),
      clientMessageable: false,
      clientFirstName: 'Mei',
      now,
    });
    expect(read.reminderAvailable).toBe(false);
    expect(read.ownSentence).toBe('Reminder sent 7 October.');
  });

  it('client signed: ownSentence is null, the countersign pending on a design-services paper', () => {
    for (const clientMessageable of [true, false]) {
      const read = sentProposalVoice({
        row: row(),
        proposal: proposal({ commercial_state: 'client_signed', document_kind: 'design_services' }),
        clientMessageable,
        clientFirstName: 'Mei',
        now,
      });
      expect(read.ownSentence).toBeNull();
      expect(read.countersignPending).toBe(true);
    }
  });

  it('client signed with no countersign form mounted (not the design-services experience): no pending act', () => {
    for (const document_kind of ['legacy', 'furnishings_authorization', null]) {
      const read = sentProposalVoice({
        row: row(),
        proposal: proposal({ commercial_state: 'client_signed', document_kind }),
        clientMessageable: false,
        clientFirstName: 'Mei',
        now,
      });
      expect(read.countersignPending).toBe(false);
      expect(read.ownSentence).toBeNull();
    }
    for (const document_kind of ['service_addendum', 'design_build']) {
      expect(
        sentProposalVoice({
          row: row(),
          proposal: proposal({ commercial_state: 'client_signed', document_kind }),
          clientMessageable: false,
          now,
        }).countersignPending,
      ).toBe(true);
    }
  });
});
