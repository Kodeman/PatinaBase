/**
 * US-19 FR7 F7-2 / F7-3 (`one-voice`) — what the band reads off a sent
 * proposal: the two facts `ownAct` takes for it, and the sentence line 2
 * prints, lead none, where those facts leave the paper with no act.
 *
 * The reminder is read exactly as the send wall reads it (`deriveSendWallLine`
 * over the watch, as `proposal-instruments.tsx` does), so the band never names
 * a `Send a reminder` the wall has not mounted (P-2).
 */

import { commercialDocumentExperience } from './commercial-documents';
import type { DocumentStateRow } from './desk-derivation';
import { sentProposalReasonLine, sentProposalStandingLine } from './desk-roster-derivation';
import {
  deriveProposalWatch,
  deriveSendWallLine,
  sendWallStateWord,
} from './proposal-watch-derivation';

/** The `proposals` columns the send wall reads. */
export interface SentProposalRecord {
  status: string | null;
  sent_at?: string | null;
  viewed_at?: string | null;
  accepted_at?: string | null;
  last_nudged_at?: string | null;
  version?: number | null;
  commercial_state?: string | null;
  issued_on_paper?: boolean | null;
  document_kind?: string | null;
}

export interface SentProposalVoice {
  /** `OwnActFacts.proposalHesitating`: the Desk prints its reason line. */
  proposalHesitating: boolean;
  /** `OwnActFacts.reminderAvailable`: the send wall offers the reminder. */
  reminderAvailable: boolean;
  /** Line 2 where the paper has no own act: the reminder's voiced state
   *  (`Reminder sent 8 October.`) where Message is held and the reminder
   *  cannot be sent (`Issued on paper — awaiting Mei’s signature.` for a
   *  paper issue never reminded), the paper's standing fact (`Sent 8
   *  October.`) inside the hesitation threshold. Null where an act stands,
   *  the client has signed, or the paper is not out. */
  ownSentence: string | null;
  /** `OwnActFacts.countersignPending` (FR8 F8-4): the client has signed and
   *  the studio's countersign form is mounted — `ProposalInstruments` mounts
   *  `ServiceAgreementInstruments` only for the design-services experience,
   *  and that prints `CountersignAct` only on `client_signed`. */
  countersignPending: boolean;
}

export function sentProposalVoice({
  row,
  proposal,
  clientMessageable,
  clientFirstName = null,
  now,
}: {
  row: DocumentStateRow;
  proposal: SentProposalRecord;
  /** `OwnActFacts.clientMessageable` — the letterhead's Message can open. */
  clientMessageable: boolean;
  /** `OwnActFacts.clientFirstName` — through the placeholder guard; null
   *  prints `the client` (FR8 F8-3). */
  clientFirstName?: string | null;
  now: Date;
}): SentProposalVoice {
  const watch = deriveProposalWatch(
    {
      status: proposal.status,
      sentAt: proposal.sent_at ?? null,
      viewedAt: proposal.viewed_at ?? null,
      acceptedAt: proposal.accepted_at ?? null,
      lastNudgedAt: proposal.last_nudged_at ?? null,
      version: proposal.version ?? null,
    },
    null,
    null,
    now,
  );
  const commercialState = proposal.commercial_state ?? null;
  const line = deriveSendWallLine(
    { watch, commercialState, issuedOnPaper: Boolean(proposal.issued_on_paper) },
    now,
  );
  const proposalHesitating = sentProposalReasonLine(row, now) !== null;
  const reminderAvailable = line?.verb === 'nudge';
  const sent = proposal.status === 'sent' || proposal.status === 'viewed';
  const reminderHeld = !clientMessageable && !reminderAvailable;
  const clientSigned = commercialState === 'client_signed';
  const countersignPending =
    clientSigned && commercialDocumentExperience(proposal.document_kind) === 'design_services';
  // FR8 F8-3 — a paper issue has no `sent_at` and was never reminded: the
  // wall's `Issued on paper` in sentence form, with no date.
  const heldSentence =
    !watch.lastNudgedAt && proposal.issued_on_paper
      ? `Issued on paper — awaiting ${clientFirstName?.trim() || 'the client'}’s signature.`
      : sendWallStateWord(watch, commercialState, true);
  // FR8 F8-4 — once the client has signed, the act carries the sentence.
  const ownSentence =
    !sent || clientSigned
      ? null
      : reminderHeld
        ? heldSentence
        : !proposalHesitating
          ? sentProposalStandingLine(row)
          : null;
  return { proposalHesitating, reminderAvailable, ownSentence, countersignPending };
}
