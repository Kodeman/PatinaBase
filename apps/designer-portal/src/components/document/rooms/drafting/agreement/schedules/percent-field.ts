"use client";

/**
 * A percent the designer can type a decimal into.
 *
 * Two record-only schedules ask for one — percent of cost/spend, and cost
 * plus a markup on net — and fractional percentages are ordinary in both.
 */

import { useState, type ChangeEvent } from "react";

/** A percent as the payload holds it. Unlike money this is never rounded:
 *  12.5% is a percent somebody typed. */
export function readPercent(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export interface PercentFieldBinding {
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onBlur: () => void;
}

/**
 * A controlled `value={String(readPercent(raw))}` eats the decimal point on
 * the keystroke that types it — `Number("12.")` is `12`, the field re-renders
 * as "12", and 12.5 can never be reached at all. So the keystrokes are held
 * verbatim while the field is being typed into, the parsed number is committed
 * on every one of them, and blur drops the draft so the stored value comes
 * back in its canonical form.
 */
export function usePercentField(
  value: number | null,
  commit: (next: number | null) => void,
): PercentFieldBinding {
  const [draft, setDraft] = useState<string | null>(null);

  return {
    value: draft ?? (value === null ? "" : String(value)),
    onChange: (event) => {
      const raw = event.target.value;
      setDraft(raw);
      commit(raw.trim() === "" ? null : readPercent(raw));
    },
    onBlur: () => setDraft(null),
  };
}
