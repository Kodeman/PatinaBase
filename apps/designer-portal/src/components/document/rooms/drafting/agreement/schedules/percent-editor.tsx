"use client";

/**
 * Percent of cost · percent of spend — one editor, a basis toggle.
 *
 * Two variants share this editor because they are one arrangement read two
 * ways: a percentage, and what it is a percentage of. The part's variant is
 * what the agreement is filed under; `payload.basis` is what the sentence on
 * the client's copy says.
 *
 * Record only (R9): nothing here projects into terms or authority in Wave 2.
 */

import { Input } from "@/components/ui/controls";
import { readPercent, usePercentField } from "./percent-field";
import type { ScheduleEditorProps } from "./index";

const LABEL =
  "font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-subtle)]";

const BASES = [
  { value: "cost", label: "Of cost" },
  { value: "spend", label: "Of spend" },
] as const;

export function PercentEditor({
  payload,
  onChange,
  readOnly,
}: ScheduleEditorProps) {
  const percentField = usePercentField(readPercent(payload.percent), (next) =>
    onChange({ ...payload, percent: next }),
  );
  const basis = payload.basis === "spend" ? "spend" : "cost";

  return (
    <div className="space-y-4">
      <label className={LABEL}>
        Percent
        <Input
          className="mt-2 max-w-[140px]"
          inputMode="decimal"
          disabled={readOnly}
          aria-label="Percent"
          placeholder="%"
          {...percentField}
        />
      </label>
      <div className={LABEL}>
        Basis
        <div className="mt-2 flex flex-wrap gap-2 normal-case tracking-normal">
          {BASES.map((option) => (
            <button
              key={option.value}
              type="button"
              disabled={readOnly}
              aria-pressed={basis === option.value}
              onClick={() => onChange({ ...payload, basis: option.value })}
              className={`rounded-[3px] border px-3 py-1.5 text-[12px] transition-colors ${
                basis === option.value
                  ? "border-[var(--color-clay)] bg-[var(--color-clay)] text-white"
                  : "border-[var(--doc-ink-border)] text-[var(--color-charcoal)] hover:border-[var(--color-clay)]"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
