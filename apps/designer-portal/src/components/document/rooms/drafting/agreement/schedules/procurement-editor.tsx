"use client";

/**
 * Furnishings deposit — and, in Wave 2, the three trade terms that stand
 * beside it.
 *
 * The deposit chips are Wave 1's, lifted here unchanged. Wave 2 adds markup
 * basis, freight handling, and terms of sale: prose fields on a schedule part,
 * which is why this variant chips `creates authority · deposit only` (R9). The
 * percent projects into `furnishings_deposit_percent`; the three sentences are
 * recorded and read, and move no money (R5).
 */

import { Input, Textarea } from "@/components/ui/controls";
import { DEPOSIT_CHIPS, readCents } from "../part-kinds";
import type { ScheduleEditorProps } from "./index";

const LABEL =
  "font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-aged-oak)]";

const readText = (value: unknown): string =>
  typeof value === "string" ? value : "";

export function ProcurementEditor({
  payload,
  onChange,
  readOnly,
  libraryOn = false,
}: ScheduleEditorProps) {
  const percent = readCents(payload.depositPercent);
  const isChip =
    percent !== null && (DEPOSIT_CHIPS as readonly number[]).includes(percent);

  const writeText = (key: string, value: string) =>
    onChange({ ...payload, [key]: value.trim() === "" ? undefined : value });

  // Flag off, this component is the Wave 1 deposit field and nothing else —
  // same element, same classes, no wrapper. The trade terms are the only
  // Wave 2 addition, and they bring the container with them.
  const deposit = (
    <div className={LABEL}>
      Furnishings deposit · on each authorization
      <div className="mt-2 flex flex-wrap items-center gap-2 normal-case tracking-normal">
        {DEPOSIT_CHIPS.map((chip) => (
          <button
            key={chip}
            type="button"
            disabled={readOnly}
            aria-pressed={percent === chip}
            onClick={() => onChange({ ...payload, depositPercent: chip })}
            className={`rounded-[3px] border px-3 py-1.5 text-[12px] transition-colors ${
              percent === chip
                ? "border-[var(--color-clay)] bg-[var(--color-clay)] text-white"
                : "border-[var(--doc-ink-border)] text-[var(--color-charcoal)] hover:border-[var(--color-clay)]"
            }`}
          >
            {chip}%
          </button>
        ))}
        <label className="flex items-center gap-1.5 text-[12px] text-[var(--color-charcoal)]">
          <span>Other</span>
          <Input
            className="w-20"
            inputMode="numeric"
            disabled={readOnly}
            aria-label="Other furnishings deposit percent"
            value={percent === null || isChip ? "" : String(percent)}
            onChange={(event) => {
              if (event.target.value.trim() === "") {
                onChange({ ...payload, depositPercent: null });
                return;
              }
              const parsed = Number(event.target.value);
              onChange({
                ...payload,
                depositPercent: Number.isFinite(parsed)
                  ? Math.min(100, Math.max(0, Math.round(parsed)))
                  : null,
              });
            }}
            placeholder="Unset · defaults to 50%"
          />
        </label>
      </div>
      {percent === null && (
        <p className="mt-1.5 text-[11px] normal-case tracking-normal text-[var(--text-muted)]">
          No furnishings deposit set — authorizations will default to 50%.
        </p>
      )}
    </div>
  );

  if (!libraryOn) return deposit;

  return (
    <div className="space-y-4">
      {deposit}
      <label className={LABEL}>
        Markup basis
        <Input
          className="mt-2"
          disabled={readOnly}
          value={readText(payload.markupBasis)}
          onChange={(event) => writeText("markupBasis", event.target.value)}
          placeholder="Designer net plus 25%"
        />
      </label>
      <label className={LABEL}>
        Freight and handling
        <Input
          className="mt-2"
          disabled={readOnly}
          value={readText(payload.freightHandling)}
          onChange={(event) => writeText("freightHandling", event.target.value)}
          placeholder="Billed at cost, with receiving and delivery"
        />
      </label>
      <label className={LABEL}>
        Terms of sale
        <Textarea
          className="mt-2 min-h-24 normal-case tracking-normal"
          disabled={readOnly}
          value={readText(payload.termsOfSale)}
          onChange={(event) => writeText("termsOfSale", event.target.value)}
          placeholder="What the client is agreeing to when furnishings are ordered."
        />
      </label>
    </div>
  );
}
