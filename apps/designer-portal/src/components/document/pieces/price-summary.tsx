"use client";

/**
 * US-37 #4 — the Price lens's job summary (contract D4). Always in view: it
 * sticks to the top of the sheet, and at 390 it docks to the foot of the
 * screen. Every figure is an extended total (`summarizeJob`): cost, client,
 * the blended markup and margin, the gap to the target, then sales tax on its
 * own row, outside the blend. The target and the tax rate are typed here, in
 * the summary (`set_project_pricing`); blank puts the target back on the
 * designer's default.
 *
 * Under it, in the sheet's flow: `Add freight`, `Add delivery`, `Add install`
 * and `Reset all to default markup`, which asks once, inline.
 */
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { FfePricedLineKind } from "@patina/types";
import { Input } from "@/components/ui/controls";
import { cn } from "@/lib/utils";
import { formatPct, type JobPricingSummary } from "@/lib/document/trade-pricing";
import { money } from "./placement-chips";

export type AddedLineKind = Exclude<FfePricedLineKind, "goods">;

export const ADDED_KINDS: ReadonlyArray<{ kind: AddedLineKind; label: string }> = [
  { kind: "freight", label: "Freight" },
  { kind: "delivery", label: "Delivery" },
  { kind: "install", label: "Install" },
];

export interface PriceSummaryProps {
  summary: JobPricingSummary;
  /** The project's override, or null when the designer's default applies. */
  targetOverridePct: number | null;
  /** The designer's default goods markup (35 until set). */
  defaultPct: number;
  /** A fraction (0.0825), or null when none is set. */
  salesTaxRate: number | null;
  onTarget: (pct: number | null) => void;
  onTaxRate: (rate: number | null) => void;
  /** The server's sentence for a refused target or tax write. */
  note?: string | null;
}

const ACT =
  "inline-flex min-h-11 items-center font-mono text-[12px] font-medium uppercase tracking-[0.06em] text-[var(--sheet-ink)] underline decoration-[var(--sheet-ink)] decoration-1 underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay-ink)] aria-[busy=true]:text-[var(--sheet-ink-muted)]";
const TERM = "t-head text-[var(--sheet-ink-muted)]";
const FIGURE = "t-money text-[var(--sheet-ink)]";
const FIELD_INPUT =
  "t-money h-9 w-[88px] rounded-none border-0 border-b border-[var(--sheet-rule-strong)] bg-transparent px-0 text-[15px] text-[var(--sheet-ink)] focus:border-[var(--sheet-rule-strong)] focus:ring-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay-ink)]";

const MINUS = "−";

/** `+1.2%`, `−0.8%`. */
function signedPct(value: number | null): string {
  if (value === null) return "—";
  const text = formatPct(Math.abs(value));
  if (text === "0.0%") return text;
  return `${value < 0 ? MINUS : "+"}${text}`;
}

function signedMoney(cents: number): string {
  if (cents === 0) return money(0);
  return `${cents < 0 ? MINUS : "+"}${money(Math.abs(cents))}`;
}

/** 0.0825 → `8.25`. */
export function ratePercentText(rate: number | null): string {
  if (rate === null) return "";
  return String(Math.round(rate * 100 * 1000) / 1000);
}

function parsePercent(text: string): number | null | undefined {
  const cleaned = text.replace(/[%\s,]/g, "");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

export function PriceSummary({
  summary,
  targetOverridePct,
  defaultPct,
  salesTaxRate,
  onTarget,
  onTaxRate,
  note,
}: PriceSummaryProps) {
  const targetPct = targetOverridePct ?? defaultPct;
  return (
    <section
      aria-label="Job summary"
      data-price-summary=""
      className="sticky top-0 z-10 mb-6 border-b border-[var(--sheet-rule-strong)] bg-[var(--sheet)] py-3 max-md:bottom-0 max-md:top-auto max-md:order-last max-md:mb-0 max-md:border-b-0 max-md:border-t max-md:px-1 max-md:py-2"
    >
      <dl className="flex flex-wrap items-end gap-x-8 gap-y-2 max-md:grid max-md:grid-cols-3 max-md:gap-x-3">
        <Figure term="Cost" value={money(summary.totalCostCents)} />
        <Figure term="Client" value={money(summary.totalClientCents)} />
        <Figure
          term="Markup"
          value={formatPct(summary.blendedMarkupPct)}
          testId="blended-markup"
        />
        <Figure
          term="Margin"
          value={formatPct(summary.blendedMarginPct)}
          testId="blended-margin"
        />
        <div className="flex flex-col">
          <dt className={TERM}>
            <label htmlFor="price-summary-target">Target</label>
          </dt>
          <dd>
            <PercentField
              id="price-summary-target"
              value={targetOverridePct}
              placeholder={formatPct(defaultPct)}
              onCommit={onTarget}
            />
          </dd>
        </div>
        <div className="flex flex-col" data-gap="">
          <dt className={TERM}>Gap</dt>
          <dd className={FIGURE}>
            {summary.gapPct === null
              ? "—"
              : `${signedPct(summary.gapPct)} · ${signedMoney(summary.gapCents)}`}
          </dd>
        </div>
        <div className="flex flex-col">
          <dt className={TERM}>
            <label htmlFor="price-summary-tax">Sales tax %</label>
          </dt>
          <dd>
            <PercentField
              id="price-summary-tax"
              value={salesTaxRate === null ? null : Number(ratePercentText(salesTaxRate))}
              placeholder="None"
              max={100}
              // A tax rate prints as set (8.25%), never rounded to one place.
              print={(pct) => `${pct}%`}
              onCommit={(pct) => onTaxRate(pct === null ? null : pct / 100)}
            />
          </dd>
        </div>
        <Figure term="Tax" value={money(summary.taxCents)} testId="tax" />
        <Figure
          term="With tax"
          value={money(summary.totalWithTaxCents)}
          testId="total-with-tax"
        />
      </dl>
      <p className="t-body-sm mt-2 text-[var(--sheet-ink-muted)]">
        {`Target ${formatPct(targetPct)}${targetOverridePct === null ? " (your default)" : " for this job"}. Tax is on the client price and stays out of the markup.`}
        {summary.unpricedCount > 0 ? (
          <span data-unpriced="" className="ml-1 text-[var(--sheet-ink)]">
            {`${summary.unpricedCount} ${summary.unpricedCount === 1 ? "line has" : "lines have"} no cost.`}
          </span>
        ) : null}
      </p>
      {note ? (
        <p role="alert" className="t-body-sm mt-1 text-[var(--sheet-ink)]">
          {note}
        </p>
      ) : null}
    </section>
  );
}

function Figure({
  term,
  value,
  testId,
}: {
  term: string;
  value: string;
  testId?: string;
}) {
  return (
    <div className="flex flex-col" data-figure={testId}>
      <dt className={TERM}>{term}</dt>
      <dd className={FIGURE}>{value}</dd>
    </div>
  );
}

/** A percent typed in the summary: commits on blur or Enter, Esc puts it back, blank clears. */
function PercentField({
  id,
  value,
  placeholder,
  max = 1000,
  print = formatPct,
  onCommit,
}: {
  id: string;
  value: number | null;
  placeholder: string;
  max?: number;
  print?: (pct: number) => string;
  onCommit: (pct: number | null) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  const reselect = useRef(false);
  useEffect(() => {
    if (!reselect.current) return;
    reselect.current = false;
    ref.current?.select();
  });

  function commit() {
    if (draft === null) return;
    const next = parsePercent(draft);
    setDraft(null);
    if (next === undefined || (next !== null && next > max)) return;
    if (next !== value) onCommit(next);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      commit();
      reselect.current = true;
    } else if (event.key === "Escape" && draft !== null) {
      event.preventDefault();
      event.stopPropagation();
      setDraft(null);
      reselect.current = true;
    }
  }

  return (
    <Input
      ref={ref}
      id={id}
      variant="underline"
      inputMode="decimal"
      placeholder={placeholder}
      value={draft ?? (value === null ? "" : print(value))}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={onKeyDown}
      className={FIELD_INPUT}
      style={{ fontFamily: "var(--font-meta)" }}
    />
  );
}

/** The acts under the summary: add a freight, delivery or install line; reset every line. */
export function PriceActs({
  onAdd,
  onResetAll,
  adding,
  resetting,
}: {
  onAdd: (kind: AddedLineKind) => void;
  onResetAll: () => void;
  adding: AddedLineKind | null;
  resetting: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const resetRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const wasConfirming = useRef(false);
  useEffect(() => {
    // The question takes focus; either answer hands it back to the act.
    if (confirming) confirmRef.current?.focus();
    else if (wasConfirming.current) resetRef.current?.focus();
    wasConfirming.current = confirming;
  }, [confirming]);

  const keep = () => setConfirming(false);

  return (
    <div
      data-price-acts=""
      className="mb-6 flex flex-wrap items-center gap-x-5 gap-y-1"
    >
      {ADDED_KINDS.map(({ kind, label }) => (
        <button
          key={kind}
          type="button"
          aria-busy={adding === kind || undefined}
          onClick={() => adding === null && onAdd(kind)}
          className={ACT}
        >
          {`Add ${label.toLowerCase()}`}
        </button>
      ))}
      {confirming ? (
        <span
          role="group"
          aria-label="Reset all to default markup"
          className="flex flex-wrap items-center gap-x-4"
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            event.stopPropagation();
            keep();
          }}
        >
          <span className="t-body-sm text-[var(--sheet-ink)]">
            Put every open line back on its default markup? Typed prices are replaced.
          </span>
          <button
            ref={confirmRef}
            type="button"
            aria-busy={resetting || undefined}
            onClick={() => {
              if (resetting) return;
              setConfirming(false);
              onResetAll();
            }}
            className={ACT}
          >
            Reset all
          </button>
          <button type="button" onClick={keep} className={cn(ACT, "text-[var(--sheet-ink-muted)]")}>
            Keep prices
          </button>
        </span>
      ) : (
        <button
          ref={resetRef}
          type="button"
          onClick={() => setConfirming(true)}
          className={ACT}
        >
          Reset all to default markup
        </button>
      )}
    </div>
  );
}
