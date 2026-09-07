"use client";

/**
 * Cost plus — a markup on net, and the line that discloses it.
 *
 * Record only (R9): the markup is written on the agreement and read by the
 * client; nothing here projects into terms or authority in Wave 2.
 */

import { Input, Textarea } from "@/components/ui/controls";
import { readPercent, usePercentField } from "./percent-field";
import type { ScheduleEditorProps } from "./index";

const LABEL =
  "font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-aged-oak)]";

export function CostPlusEditor({
  payload,
  onChange,
  readOnly,
}: ScheduleEditorProps) {
  const markupField = usePercentField(
    readPercent(payload.markupPercent),
    (next) => onChange({ ...payload, markupPercent: next }),
  );

  return (
    <div className="space-y-4">
      <label className={LABEL}>
        Markup on net · percent
        <Input
          className="mt-2 max-w-[140px]"
          inputMode="decimal"
          disabled={readOnly}
          placeholder="%"
          {...markupField}
        />
      </label>
      <label className={LABEL}>
        Disclosure
        <Textarea
          className="mt-2 min-h-24 normal-case tracking-normal"
          disabled={readOnly}
          value={
            typeof payload.disclosure === "string" ? payload.disclosure : ""
          }
          onChange={(event) =>
            onChange({
              ...payload,
              disclosure:
                event.target.value.trim() === ""
                  ? undefined
                  : event.target.value,
            })
          }
          placeholder="How the net cost is established, and what the markup covers."
        />
      </label>
    </div>
  );
}
