"use client";

/**
 * Day rate — a rate, and the minimum number of days it is charged in.
 *
 * Record only (R9): nothing here projects into terms or authority in Wave 2.
 */

import { Input } from "@/components/ui/controls";
import { dollars, readCents, toCentsOrNull } from "../part-kinds";
import type { ScheduleEditorProps } from "./index";

const LABEL =
  "font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-aged-oak)]";

export function DayRateEditor({
  payload,
  onChange,
  readOnly,
}: ScheduleEditorProps) {
  const minimumDays = readCents(payload.minimumDays);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className={LABEL}>
        Day rate · dollars
        <Input
          className="mt-2"
          inputMode="decimal"
          disabled={readOnly}
          value={dollars(readCents(payload.dayRateCents))}
          onChange={(event) =>
            onChange({
              ...payload,
              dayRateCents: toCentsOrNull(event.target.value),
            })
          }
        />
      </label>
      <label className={LABEL}>
        Minimum days
        <Input
          className="mt-2"
          inputMode="numeric"
          disabled={readOnly}
          value={minimumDays === null ? "" : String(minimumDays)}
          onChange={(event) => {
            if (event.target.value.trim() === "") {
              onChange({ ...payload, minimumDays: null });
              return;
            }
            const parsed = Number(event.target.value);
            onChange({
              ...payload,
              minimumDays: Number.isFinite(parsed)
                ? Math.max(0, Math.round(parsed))
                : null,
            });
          }}
        />
      </label>
    </div>
  );
}
