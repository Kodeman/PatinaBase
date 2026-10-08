/**
 * US-19 FR7 F7-2 / F7-3 (`one-voice`) — what the band reads off a sent
 * proposal: the two facts `ownAct` takes for it, and the sentence line 2
 * prints, lead none, where those facts leave the paper with no act.
 *
 * The reminder is read exactly as the send wall reads it (`deriveSendWallLine`
 * over the watch, as `proposal-instruments.tsx` does), so the band never names
 * a `Send a reminder` the wall has not mounted (P-2).
 */

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
}

export interface SentProposalVoice {
  /** `OwnActFacts.proposalHesitating`: the Desk prints its reason line. */
  proposalHesitating: boolean;
  /** `OwnActFacts.reminderAvailable`: the send wall offers the reminder. */
  reminderAvailable: boolean;
  /** Line 2 where the paper has no own act: the reminder's voiced state
   *  (`Reminder sent 8 October.`) where Message is held and the reminder
   *  cannot be sent, the paper's standing fact (`Sent 8 October.`) inside the
   *  hesitation threshold. Null where an act stands, or the paper is not out. */
  ownSentence: string | null;
}

export function sentProposalVoice({
  row,
  proposal,
  clientMessageable,
  now,
}: {
  row: DocumentStateRow;
  proposal: SentProposalRecord;
  /** `OwnActFacts.clientMessageable` — the letterhead's Message can open. */
  clientMessageable: boolean;
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
  const ownSentence = !sent
    ? null
    : reminderHeld
      ? sendWallStateWord(watch, commercialState, true)
      : !proposalHesitating
        ? sentProposalStandingLine(row)
        : null;
  return { proposalHesitating, reminderAvailable, ownSentence };
}
