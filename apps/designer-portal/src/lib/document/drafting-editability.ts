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

export type DraftingEditability = 'editable' | 'issued' | 'readonly';

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
    return (commercialState ?? 'draft') === 'draft' ? 'editable' : 'issued';
  }
  return status === 'draft' ? 'editable' : 'issued';
}
