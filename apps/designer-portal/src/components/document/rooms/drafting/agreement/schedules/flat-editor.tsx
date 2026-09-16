"use client";

/**
 * Flat fee — one money field.
 *
 * Lifted out of `part-editor.tsx` unchanged when Wave 2 gathered the schedule
 * editors here. The one delta is the sentence beneath: in Wave 1 a flat fee
 * was recorded and nothing more, so the editor said so. In Wave 2 it projects
 * into `fee_basis`/`fee_amount_cents` (R9), the header chips
 * `creates authority`, and the sentence would contradict it.
 */

import { Input } from "@/components/ui/controls";
import { dollars, readCents, toCentsOrNull } from "../part-kinds";
import type { ScheduleEditorProps } from "./index";

const LABEL =
  "font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-subtle)]";

export function FlatEditor({
  payload,
  onChange,
  readOnly,
  libraryOn = false,
}: ScheduleEditorProps) {
  return (
    <label className={LABEL}>
      Flat fee · dollars
      <Input
        className="mt-2 max-w-[220px]"
        inputMode="decimal"
        disabled={readOnly}
        value={dollars(readCents(payload.cents))}
        onChange={(event) =>
          onChange({ ...payload, cents: toCentsOrNull(event.target.value) })
        }
      />
      {!libraryOn && (
        <p className="mt-1.5 text-[11px] normal-case tracking-normal text-[var(--text-muted)]">
          Recorded on the agreement now; it starts creating billing authority in
          a later release.
        </p>
      )}
    </label>
  );
}
