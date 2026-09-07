"use client";

/**
 * Fee by phase — rows of {key, label, cents}, and what they come to.
 *
 * Lifted out of `part-editor.tsx` when Wave 2 gathered the schedule editors
 * here. Wave 2 adds two things, both behind the Library flag: the phases can
 * be reordered (the agreement reads in the order the work happens), and the
 * rows carry a running total, because `fee_amount_cents` is the sum of them
 * and a designer should read the figure the client will.
 *
 * Wave 1's "recorded now, authority later" sentence goes when the flag is on,
 * for the reason `flat-editor.tsx` says: in Wave 2 it projects.
 */

import { Button, Input } from "@/components/ui/controls";
import { dollars, readPhases, toCents } from "../part-kinds";
import type { ScheduleEditorProps } from "./index";

const LABEL =
  "font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-aged-oak)]";

const money = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export function PerPhaseEditor({
  payload,
  onChange,
  readOnly,
  libraryOn = false,
}: ScheduleEditorProps) {
  const phases = readPhases(payload);
  const write = (next: typeof phases) => onChange({ ...payload, phases: next });

  const move = (from: number, to: number) => {
    if (to < 0 || to >= phases.length) return;
    const next = [...phases];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    write(next);
  };

  const total = phases.reduce((sum, phase) => sum + phase.cents, 0);

  return (
    <div className="space-y-2">
      {phases.map((phase, index) => (
        <div
          key={phase.key}
          className={
            libraryOn
              ? "grid grid-cols-[minmax(0,1fr)_140px_auto_auto] gap-3"
              : "grid grid-cols-[minmax(0,1fr)_140px_auto] gap-3"
          }
        >
          <Input
            aria-label={`Phase ${index + 1}`}
            disabled={readOnly}
            value={phase.label}
            onChange={(event) =>
              write(
                phases.map((row, rowIndex) =>
                  rowIndex === index
                    ? { ...row, label: event.target.value }
                    : row,
                ),
              )
            }
            placeholder="Concept development"
          />
          <Input
            aria-label={`Phase ${index + 1} fee`}
            inputMode="decimal"
            disabled={readOnly}
            value={dollars(phase.cents)}
            onChange={(event) =>
              write(
                phases.map((row, rowIndex) =>
                  rowIndex === index
                    ? { ...row, cents: toCents(event.target.value) }
                    : row,
                ),
              )
            }
            placeholder="$"
          />
          {libraryOn && (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Move phase ${index + 1} up`}
                disabled={readOnly || index === 0}
                onClick={() => move(index, index - 1)}
              >
                ↑
              </Button>
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Move phase ${index + 1} down`}
                disabled={readOnly || index === phases.length - 1}
                onClick={() => move(index, index + 1)}
              >
                ↓
              </Button>
            </div>
          )}
          <Button
            variant="ghost"
            size="sm"
            disabled={readOnly}
            onClick={() =>
              write(phases.filter((_, rowIndex) => rowIndex !== index))
            }
          >
            Remove
          </Button>
        </div>
      ))}
      <Button
        variant="ghost"
        size="sm"
        disabled={readOnly}
        onClick={() =>
          write([
            ...phases,
            {
              key: `phase-${Date.now()}-${phases.length}`,
              label: "",
              cents: 0,
            },
          ])
        }
      >
        + Add a phase
      </Button>
      {libraryOn ? (
        phases.length > 0 && (
          <p className={LABEL}>
            <span className="normal-case tracking-normal text-[var(--color-charcoal)]">
              {phases.length} {phases.length === 1 ? "phase" : "phases"} ·{" "}
              {money(total)}
            </span>
          </p>
        )
      ) : (
        // DR5 — the same sentence FlatEditor carries, for the same reason: a
        // per-phase fee is recorded on the agreement now and creates no
        // billing authority until a later release. The rail chips it
        // accordingly.
        <p className="text-[11px] normal-case tracking-normal text-[var(--text-muted)]">
          Recorded on the agreement now; it starts creating billing authority in
          a later release.
        </p>
      )}
    </div>
  );
}
