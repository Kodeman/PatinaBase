/**
 * The Drafting Room's own editability rule, lifted out of the Room so a second
 * surface can obey it instead of re-deciding it.
 *
 * The rule was inline in drafting-room.tsx: a legacy proposal is editable only
 * while `status='draft'`; a design-services agreement only while
 * `commercial_state='draft'`; a furnishings authorization never (it is read
 * elsewhere entirely). Anything else the Room evicts to `/doc/<id>` with the
 * words "already been issued. Returning to its read-only document" — so
 * "issued" is the Room's own name for the state, not a new one.
 *
 * This module invents no permission: it is that same matrix, addressable.
 * `readonly` and `issued` differ only in which sentence the Room says, which
 * is why both are returned rather than one "not editable".
 */

import { commercialDocumentExperience } from './commercial-documents';

export type DraftingEditability =
  | 'editable'
  | 'ledger'
  | 'issued'
  | 'readonly';

/**
 * W3R1-01 — THE TURNKEY PRIME KEEPS ITS ROOM AFTER IT LEAVES THE STUDIO.
 *
 * A design-build agreement's draw ledger, its lien-waiver exchange and its
 * Trade Agreements strip are mounted in the Contract Room and nowhere else,
 * and all three only come into existence once the agreement is sent (the
 * ledger is materialized at send) or executed (a Trade Agreement needs the
 * project countersign creates). Evicting the room the moment the document
 * leaves `draft` therefore left the studio with no door at all: draw two
 * could not be issued, no Trade Agreement could be composed, and no lien
 * waiver could be attached to a draw.
 *
 * `ledger` is `issued` plus a room. The parts stay frozen (R6) — the composer
 * reads `document.state !== 'draft'` as read-only on its own — so nothing
 * about the paper can move; what opens is the machine state hung off it.
 *
 * The three states below and no others: a `superseded`, `declined` or
 * `expired` turnkey prime has a ledger nobody may act on.
 */
const LEDGER_STATES = ['sent', 'client_signed', 'executed'];

export interface DraftingEditabilityInput {
  /** `proposals.document_kind`. */
  documentKind: string | null | undefined;
  /** `proposals.status`. */
  status: string | null | undefined;
  /** `proposals.commercial_state` — the Room reads a missing value as draft. */
  commercialState: string | null | undefined;
}

export function draftingEditability({
  documentKind,
  status,
  commercialState,
}: DraftingEditabilityInput): DraftingEditability {
  const experience = commercialDocumentExperience(documentKind);
  if (experience === 'commercial_readonly') return 'readonly';
  if (experience === 'design_services') {
    const state = commercialState ?? 'draft';
    if (state === 'draft') return 'editable';
    if (documentKind === 'design_build' && LEDGER_STATES.includes(state)) {
      return 'ledger';
    }
    return 'issued';
  }
  return status === 'draft' ? 'editable' : 'issued';
}
