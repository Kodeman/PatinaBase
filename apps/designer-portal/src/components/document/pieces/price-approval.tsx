"use client";

/**
 * US-37 #4, after approval (00810, R188). What the client approved, beside
 * what the line or the job stands at now: pricing stays editable, and a line
 * whose client-facing figures moved prints the approved figure in muted type
 * next to the current one, under a hairline mark (no badge). The job summary
 * carries `Approved total $X · Current $Y (+$Z)` once an approval exists, and
 * the change log of every pricing edit since (who · when · field · old → new)
 * opens in a DocSheet, for one line or for the job.
 *
 * Designer-team only: the readers refuse anyone else (42501), and the log
 * prints cost and markup, so none of this reaches a client surface.
 */
import { Fragment } from "react";
import { History } from "lucide-react";
import {
  useFfePricingEvents,
  type FfePricingEvent,
  type FfePricingEventField,
  type ProjectPricingApprovalLine,
  type ProjectPricingApprovalTotal,
} from "@patina/supabase";
import { DocSheet } from "@/components/document/overlays/doc-sheet";
import { formatPct } from "@/lib/document/trade-pricing";
import { ItemLabelPrefix } from "./item-label";
import { money } from "./placement-chips";

const MINUS = "−";
const DASH = "—";

/** The approved figures a differing line prints beside its current ones. */
export interface ApprovedFigures {
  unitClientCents: number;
  quantity: number;
  lineTotalCents: number;
  currency: string;
  /** Which of them moved: each prints only beside the figure it differs from. */
  unitDiffers: boolean;
  quantityDiffers: boolean;
}

/**
 * The approved figures for a line, or null when it matches what the client
 * approved (or she never approved it). The server's `differs` also counts a
 * currency move; the figures are compared here too, so a typed figure flags
 * at once, before the server's line answers.
 */
export function approvedFiguresFor(
  approved: ProjectPricingApprovalLine | undefined,
  current: { unitClientCents: number | null; quantity: number; lineTotalCents: number | null },
): ApprovedFigures | null {
  if (!approved) return null;
  const unitDiffers = current.unitClientCents !== approved.approvedUnitClientPriceCents;
  const quantityDiffers = current.quantity !== approved.approvedQuantity;
  const totalDiffers = current.lineTotalCents !== approved.approvedLineTotalCents;
  if (!approved.differs && !unitDiffers && !quantityDiffers && !totalDiffers) return null;
  return {
    unitClientCents: approved.approvedUnitClientPriceCents,
    quantity: approved.approvedQuantity,
    lineTotalCents: approved.approvedLineTotalCents,
    currency: approved.currency,
    unitDiffers,
    quantityDiffers,
  };
}

/** `$2,400`; another currency prints with its own sign (`€2,400`). */
export function approvedMoney(cents: number, currency: string): string {
  if (currency === "USD") return money(cents);
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
    }).format(cents / 100);
  } catch {
    return `${money(cents)} ${currency}`;
  }
}

/** `Approved $2,400`, muted, under the current figure. */
export function ApprovedValue({ text }: { text: string }) {
  return (
    <span
      data-approved-value=""
      className="block font-sans text-[13px] leading-[1.4] text-[var(--sheet-ink-muted)]"
    >
      {`Approved ${text}`}
    </span>
  );
}

const QUIET_ACT =
  "inline-flex min-h-6 items-center self-start font-sans text-[13px] leading-[1.4] text-[var(--sheet-ink-muted)] underline decoration-[var(--sheet-rule-strong)] decoration-1 underline-offset-4 hover:text-[var(--sheet-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay-ink)]";

/** Under the line's name: it moved since the approval, and its log. */
export function ChangedSinceApproval({
  name,
  onChangeLog,
}: {
  name: string;
  onChangeLog?: () => void;
}) {
  return (
    <span data-differs-note="" className="flex flex-wrap items-center gap-x-2 text-[13px] leading-[1.4] text-[var(--sheet-ink-muted)]">
      <span>Changed since the client approved it.</span>
      {onChangeLog ? (
        <button
          type="button"
          onClick={onChangeLog}
          aria-label={`Change log, ${name}`}
          className={QUIET_ACT}
        >
          Change log
        </button>
      ) : null}
    </span>
  );
}

/**
 * The summary's approval row: `Approved total $X · Current $Y (+$Z)`. Totals
 * are never summed across currencies (R188): each approved total is compared
 * with the current lines' client total in that same currency, dollars first.
 * A currency with current lines but no approved lines prints its current total.
 */
export function ApprovedTotalRow({
  totals,
  currentTotals,
  onChangeLog,
  jobName,
  changeLogOpen = false,
}: {
  totals: ProjectPricingApprovalTotal[];
  /** The current lines' client total before tax, per currency code. */
  currentTotals: ReadonlyMap<string, number>;
  onChangeLog: () => void;
  /** The job's name, so the log's button names its scope. */
  jobName?: string | null;
  /** Whether the job's change log is open. */
  changeLogOpen?: boolean;
}) {
  const approvedByCurrency = new Map(totals.map((t) => [t.currency, t.cents]));
  const currencies = [...new Set([...approvedByCurrency.keys(), ...currentTotals.keys()])];
  const ordered = [
    ...currencies.filter((currency) => currency === "USD"),
    ...currencies.filter((currency) => currency !== "USD"),
  ];
  // A budget approval records the event with no lines (R188).
  const parts: string[] = totals.length === 0 ? ["Approved without line prices"] : [];
  for (const currency of ordered) {
    const approved = approvedByCurrency.get(currency);
    const current = currentTotals.get(currency) ?? 0;
    if (approved === undefined) {
      parts.push(`Current ${approvedMoney(current, currency)}`);
      continue;
    }
    const delta = current - approved;
    const moved =
      delta === 0
        ? "no change"
        : `${delta < 0 ? MINUS : "+"}${approvedMoney(Math.abs(delta), currency)}`;
    parts.push(
      `Approved total ${approvedMoney(approved, currency)}`,
      `Current ${approvedMoney(current, currency)} (${moved})`,
    );
  }
  if (ordered.length === 0) parts.push("Current $0");
  return (
    <p
      data-approved-total=""
      className="t-body-sm mt-2 flex flex-wrap items-center gap-x-3 text-[var(--sheet-ink)]"
    >
      <span className="t-money">
        {/* Each figure keeps its sign with it when the row wraps at 390. */}
        {parts.map((part, i) => (
          <Fragment key={part}>
            {i > 0 ? " · " : null}
            <span className="whitespace-nowrap">{part}</span>
          </Fragment>
        ))}
      </span>
      <button
        type="button"
        onClick={onChangeLog}
        aria-label={`Change log for ${jobName?.trim() || "this job"}`}
        aria-expanded={changeLogOpen}
        className={QUIET_ACT}
      >
        Change log
      </button>
    </p>
  );
}

/** An approved line that has since left the job, as the client approved it. */
export interface RemovedApprovedLine {
  itemId: string;
  name: string;
  /** Its item label (doc_code), printed as the live rows print theirs. */
  label?: string | null;
  lineTotalCents: number;
  currency: string;
}

/**
 * Under the table: approved lines that are no longer on the job (removed,
 * archived or replaced). They cannot be rows of the editable table, so each
 * prints its name, the figure she approved and its change log, under the same
 * hairline as a line that moved.
 */
export function RemovedSinceApproval({
  lines,
  onChangeLog,
}: {
  lines: RemovedApprovedLine[];
  onChangeLog: (line: RemovedApprovedLine) => void;
}) {
  if (lines.length === 0) return null;
  return (
    <section data-removed-since-approval="" className="mb-6 mt-4">
      <p className="t-body-sm text-[var(--sheet-ink-muted)]">
        Removed since the client approved it.
      </p>
      <ul className="mt-1 flex flex-col">
        {lines.map((line) => (
          <li
            key={line.itemId}
            data-removed-approved-line={line.itemId}
            className="flex flex-wrap items-center gap-x-3 border-b border-l border-[var(--sheet-rule)] border-l-[var(--sheet-ink)] py-2 pl-2 font-sans text-[14px] leading-[1.4] text-[var(--sheet-ink)]"
          >
            <span className="flex flex-wrap items-center gap-2">
              <ItemLabelPrefix label={line.label} />
              <span>{line.name}</span>
            </span>
            <ApprovedValue text={approvedMoney(line.lineTotalCents, line.currency)} />
            <button
              type="button"
              onClick={() => onChangeLog(line)}
              aria-label={`Change log, ${line.name}`}
              className={QUIET_ACT}
            >
              Change log
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

const FIELD_WORDS: Record<FfePricingEventField, string> = {
  unit_price_cents: "Unit client",
  quantity: "Qty",
  line_total_cents: "Line total",
  markup_percent: "Markup",
  trade_price_cents: "Unit cost",
  line_kind: "Kind",
  currency: "Currency",
};

const CENTS_FIELDS: ReadonlySet<FfePricingEventField> = new Set([
  "unit_price_cents",
  "line_total_cents",
  "trade_price_cents",
]);

/** One logged value as the sheet prints it. */
export function eventValueText(field: FfePricingEventField, value: string | null): string {
  if (value == null || value === "") return DASH;
  if (CENTS_FIELDS.has(field)) {
    const cents = Number(value);
    return Number.isFinite(cents) ? money(cents) : value;
  }
  if (field === "markup_percent") {
    const pct = Number(value);
    return Number.isFinite(pct) ? formatPct(pct).replace("-", MINUS) : value;
  }
  return value;
}

const WHEN = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function whenText(at: string): string {
  const date = new Date(at);
  return Number.isNaN(date.getTime()) ? at : WHEN.format(date);
}

/**
 * The change log since the approval, newest first: one line's when `itemId`
 * is set, else the job's, each entry naming its line. Mounted only while open,
 * so the log is read only when she asks for it.
 */
export function PricingChangeLog({
  projectId,
  itemId,
  lineName,
  lineNames,
  onClose,
}: {
  projectId: string;
  /** One line's log; null for the job's. */
  itemId: string | null;
  /** The line's name, for the sheet's page. */
  lineName?: string | null;
  /** Every line's name, so the job's log can say which line moved. */
  lineNames: ReadonlyMap<string, string>;
  onClose: () => void;
}) {
  const { data, isLoading, isError } = useFfePricingEvents(projectId, itemId);
  const events = data ?? [];
  return (
    <DocSheet
      open
      onClose={onClose}
      title="Changes since approval"
      icon={History}
      pageLabel={itemId ? (lineName ?? undefined) : "Job"}
      kind="pricing-change-log"
    >
      {isLoading ? (
        <p className="t-body-sm text-[var(--sheet-ink-muted)]">Reading the changes…</p>
      ) : isError ? (
        <p role="alert" className="t-body-sm text-[var(--sheet-ink)]">
          The changes could not be read. Try again.
        </p>
      ) : events.length === 0 ? (
        <p className="t-body-sm text-[var(--sheet-ink)]">
          No pricing changes since the client approved.
        </p>
      ) : (
        <ol data-pricing-log="" className="flex flex-col">
          {events.map((event) => (
            <LogEntry
              key={event.id}
              event={event}
              line={itemId ? null : (lineNames.get(event.itemId) ?? "A removed line")}
            />
          ))}
        </ol>
      )}
    </DocSheet>
  );
}

function LogEntry({ event, line }: { event: FfePricingEvent; line: string | null }) {
  const who = event.actorName ?? (event.actorId ? "A teammate" : "Patina");
  return (
    <li
      data-pricing-event={event.id}
      className="border-b border-[var(--sheet-rule)] py-2 font-sans text-[14px] leading-[1.5] text-[var(--sheet-ink)]"
    >
      {line ? <span className="block font-medium">{line}</span> : null}
      <span className="text-[var(--sheet-ink-muted)]">{`${who} · ${whenText(event.at)} · `}</span>
      <span>{FIELD_WORDS[event.field] ?? event.field}</span>
      <span className="t-money">
        {` · ${eventValueText(event.field, event.oldValue)} → ${eventValueText(event.field, event.newValue)}`}
      </span>
    </li>
  );
}
