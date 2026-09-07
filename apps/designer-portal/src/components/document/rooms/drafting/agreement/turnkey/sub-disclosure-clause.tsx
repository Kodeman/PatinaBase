"use client";

/**
 * Sub disclosure — open-book or closed-book, one per contract.
 *
 * The choice decides how the schedule of values reads on the homeowner's
 * page, and it is the whole of R13's studio-side half:
 *
 *   · closed-book — the lines are pro-rated, so no line divided by (1 + fee)
 *     backs out a trade's bid;
 *   · open-book — the trades stand at cost and the fee is its own line.
 *
 * Either way the IDENTITIES are shown. Who is doing the work in someone's
 * house is theirs to know; what each trade was paid is the studio's business
 * under closed-book, and the bid ledger is never anybody's but the studio's,
 * in either mode, at any state.
 *
 * The mode is stored on the pricing basis — `_validate_pricing_basis_payload`
 * requires `subDisclosure` exactly once per contract — and mirrored here so
 * the clause a designer reads and the payload the database validates cannot
 * disagree.
 */

import { useTradeAgreements } from "@patina/supabase";
import { Textarea } from "@/components/ui/controls";
import { SUB_DISCLOSURE_MODES, type SubDisclosureMode } from "@patina/types";
import { readSubDisclosure } from "@/lib/document/design-build";
import { payloadOf, TURNKEY_PART_KEYS, type TurnkeyContext } from "./context";
import type { TurnkeyEditorProps } from "./pricing-basis-editor";

const LABEL =
  "font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-aged-oak)]";

export const MODE_LABELS: Record<SubDisclosureMode, string> = {
  open_book: "Open-book",
  closed_book: "Closed-book",
};

export const MODE_NOTES: Record<SubDisclosureMode, string> = {
  open_book:
    "Your client reads each trade at cost, with your fee on its own line.",
  closed_book:
    "Your client reads one price per line, your fee spread across all of them.",
};

export const NO_TRADES_YET =
  "Trade Agreements appear here once this agreement has a project behind it.";

export function SubDisclosureClause({
  payload,
  onChange,
  readOnly,
  turnkey,
}: TurnkeyEditorProps) {
  const clause = readSubDisclosure(payload);
  const basisPayload = payloadOf(turnkey, TURNKEY_PART_KEYS.pricingBasis);
  const trades = useTradeAgreements(turnkey?.projectId ?? null);

  const chooseMode = (mode: SubDisclosureMode) => {
    onChange({ ...payload, mode });
    turnkey?.writePart(TURNKEY_PART_KEYS.pricingBasis, {
      ...basisPayload,
      subDisclosure: mode,
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <p className={LABEL}>How the trades are shown</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {SUB_DISCLOSURE_MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              disabled={readOnly}
              aria-pressed={clause.mode === mode}
              onClick={() => chooseMode(mode)}
              className={`rounded-[3px] border px-3 py-1.5 text-[12px] transition-colors ${
                clause.mode === mode
                  ? "border-[var(--color-clay)] bg-[var(--color-clay)] text-white"
                  : "border-[var(--doc-ink-border)] text-[var(--color-charcoal)] hover:border-[var(--color-clay)]"
              }`}
            >
              {MODE_LABELS[mode]}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-[var(--text-muted)]">
          {MODE_NOTES[clause.mode]}
        </p>
      </div>

      <label className={LABEL}>
        Body
        <Textarea
          className="mt-2 min-h-32 normal-case tracking-normal"
          disabled={readOnly}
          value={clause.body}
          onChange={(event) =>
            onChange({ ...payload, body: event.target.value })
          }
          placeholder="The language the client reads and signs."
        />
      </label>

      <section aria-label="Who is doing the work" className="space-y-2">
        <p className={LABEL}>Who is doing the work</p>
        {turnkey?.projectId == null ? (
          <p className="text-[11.5px] italic text-[var(--text-muted)]">
            {NO_TRADES_YET}
          </p>
        ) : trades.isLoading ? (
          <p className="text-[11.5px] italic text-[var(--text-muted)]">
            Reading the studio&rsquo;s Trade Agreements…
          </p>
        ) : (trades.data ?? []).length === 0 ? (
          <p className="text-[11.5px] italic text-[var(--text-muted)]">
            No Trade Agreements on this project yet.
          </p>
        ) : (
          <div className="divide-y divide-[var(--doc-ink-border)] border-y border-[var(--doc-ink-border)]">
            {(trades.data ?? []).map((agreement) => (
              <div
                key={agreement.id}
                className="flex items-baseline justify-between gap-4 py-2"
              >
                <span className="text-[12px] text-[var(--text-body)]">
                  {agreement.contactCompanyName ?? agreement.contactDisplayName}
                  {agreement.trade ? ` · ${agreement.trade}` : ""}
                </span>
                {/* Studio-side only. Under closed-book the homeowner reads no
                    price per trade at all; under open-book she reads the
                    AWARDED price. Neither ever reads a bid. */}
                <span className="font-mono text-[11px] text-[var(--color-aged-oak)]">
                  {clause.mode === "open_book"
                    ? "Shown to your client"
                    : "Held from your client"}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
