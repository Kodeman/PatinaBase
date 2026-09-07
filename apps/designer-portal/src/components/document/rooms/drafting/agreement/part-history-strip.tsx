"use client";

/**
 * What has happened to this part — P8.
 *
 * A quiet strip under the open part: what changed, who changed it, when, and
 * — when the studio wrote one — why. `agreement_part_events` is studio-only
 * (R8: the client reads the agreement, not the studio's revision log), so
 * nothing here ever reaches the homeowner's page.
 *
 * A part with no events renders **nothing at all**. There is no empty state,
 * no "no changes yet" — a part nobody has touched is simply a part, and the
 * room does not spend a line saying so.
 */

import { useState } from "react";
import { useAgreementPartEvents } from "@patina/supabase";
import type { AgreementPartEvent } from "@patina/types";

const LABEL =
  "font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-aged-oak)]";

const FIRST_FEW = 5;

/** The database's word for the act, in the designer's. `materialized` is what
 *  `materialize_agreement_template` writes; a designer knows it as the moment
 *  a template was laid in. */
const ACTION_WORD: Record<string, string> = {
  added: "Added",
  edited: "Edited",
  removed: "Removed",
  reordered: "Moved",
  renamed: "Renamed",
  materialized: "Added from a template",
};

/** Paper time, not chat time. */
export function relativeDay(at: string, now: Date = new Date()): string {
  const then = new Date(at);
  if (Number.isNaN(then.getTime())) return "";
  const days = Math.floor(
    (Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) -
      Date.UTC(then.getFullYear(), then.getMonth(), then.getDate())) /
      86_400_000,
  );
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return then.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function PartHistoryStrip({
  proposalId,
  partKey,
}: {
  proposalId: string;
  partKey: string;
}) {
  const events = useAgreementPartEvents(proposalId);
  const [showAll, setShowAll] = useState(false);

  const mine = ((events.data ?? []) as AgreementPartEvent[])
    .filter((event) => event.partKey === partKey)
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

  if (mine.length === 0) return null;

  const shown = showAll ? mine : mine.slice(0, FIRST_FEW);

  return (
    <section
      aria-label="Part history"
      className="border-t border-[var(--doc-ink-border)] pt-4"
    >
      <p className={LABEL}>History</p>
      <ul className="mt-2 space-y-1.5">
        {shown.map((event) => (
          <li key={event.id}>
            <span className="block text-[11.5px] text-[var(--color-mocha)]">
              {ACTION_WORD[event.action] ?? event.action} ·{" "}
              {event.actorName ?? "A teammate"} · {relativeDay(event.at)}
            </span>
            {event.why && (
              <span className="block text-[12.5px] leading-relaxed text-[var(--color-charcoal)]">
                {event.why}
              </span>
            )}
          </li>
        ))}
      </ul>
      {mine.length > FIRST_FEW && !showAll && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mt-2 font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-aged-oak)]"
        >
          Show all {mine.length}
        </button>
      )}
    </section>
  );
}
