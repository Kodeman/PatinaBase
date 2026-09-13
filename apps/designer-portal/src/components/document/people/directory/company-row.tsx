"use client";

/**
 * A DIRECTORY FIRM ROW — the person row's grammar, wearing the one visual
 * difference a firm gets: a 42px rounded SQUARE where a person has a 34px
 * circle (direction §1 line 2).
 *
 * TWO WORD COLUMNS, NOT THREE (R-G). A firm has no reach and no consent — no
 * door is minted onto a company and a company cannot agree to a text message —
 * so the row carries its paper word and its payee marker, and nothing else.
 *
 * R-A / C13 / C18: a firm whose only people are inspectors or lenders never
 * owed the studio paper. The caller passes `paperState: null` and the row
 * prints NO paper word at all — never "Not on file", never blocked — and no
 * payee marker either. The word "Not on file" implies an obligation that was
 * never the studio's to collect.
 */

import { Avatar } from "../person-bits";
import { StateWord, PlainFact } from "../state-word";

/**
 * A company's OWN kind vocabulary — deliberately DISTINCT from a person's
 * PartyKind: a firm card names what KIND OF FIRM it is, not a role on a
 * project. CR-6 moved the vocabulary itself into `lib/document/people-derivation`
 * so `firmIdentityLine` can reach it without importing a client component; it
 * is re-exported here, where the rolodex seed sheet and the picker's mini row
 * already read it.
 */
export { companyKindLabel } from "@/lib/document/people-derivation";

export interface CompanyRowProps {
  /** The firm's card id — the `?firm=` the row opens. */
  firmId: string;
  name: string;
  /** The firm's own kind vocabulary (`company_kind` / `contact_kind`). */
  kind: string;
  /** "GC · 3 on the crew · 2 open jobs" — composed by `firmIdentityLine`. */
  line: string;
  /**
   * The firm's paper word. `null` where none is owed (R-A) — `StateWord` then
   * prints nothing, which is the whole rule.
   */
  paperState?: string | null;
  /** "Signs: Tom Marrow" — plain and uncoloured; a designation is not a state. */
  payeeMarker?: string | null;
  onOpen: () => void;
}

export function CompanyRow({
  firmId,
  name,
  kind,
  line,
  paperState,
  payeeMarker,
  onOpen,
}: CompanyRowProps) {
  return (
    <li
      data-company-row={firmId}
      className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-[var(--hairline-strong)] px-4 py-3"
    >
      <Avatar name={name} role={kind} shape="square" />
      <div className="min-w-0 flex-1 basis-[320px]">
        <button
          type="button"
          data-open-firm={firmId}
          onClick={onOpen}
          className="min-h-11 text-left text-[14px] font-semibold leading-[1.4] text-[var(--ink)]"
        >
          {name}
        </button>
        <p className="t-meta text-[var(--ink-subtle)]">{line}</p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <StateWord family="paper" value={paperState} className="w-[108px]" />
        {payeeMarker ? <PlainFact>{payeeMarker}</PlainFact> : null}
      </div>
    </li>
  );
}
