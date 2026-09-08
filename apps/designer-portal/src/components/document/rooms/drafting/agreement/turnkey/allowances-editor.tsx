"use client";

/**
 * Allowances — a figure carried for a selection the homeowner has not made
 * yet, and what happens when the real number arrives.
 *
 * An allowance and its cost line are ONE NUMBER SAID TWICE: the allowance
 * names it to the homeowner, and the `category: 'allowance'` cost line puts
 * it into the contract sum. `_validate_allowances_payload` refuses a set where
 * the two disagree, so this editor writes both in the same act rather than
 * asking the designer to keep them in step by hand.
 *
 * Record only (R9).
 */

import { Button, Input, Select } from "@/components/ui/controls";
import type { DesignBuildAllowance, DesignBuildCostLine } from "@patina/types";
import {
  readAllowances,
  readPricingBasis,
  unbackedAllowanceLine,
  validateAllowances,
  withCostBasisCents,
} from "@/lib/document/design-build";
import { dollars, toCentsOrNull } from "../part-kinds";
import { payloadOf, TURNKEY_PART_KEYS, type TurnkeyContext } from "./context";
import type { TurnkeyEditorProps } from "./pricing-basis-editor";

const OVERAGE_LABELS: Record<DesignBuildAllowance["overageRule"], string> = {
  change_order: "Over: a change order",
  client_credit: "Over: billed as it lands",
};

const UNDERAGE_LABELS: Record<DesignBuildAllowance["underageRule"], string> = {
  credit: "Under: credited back",
  retain: "Under: kept by the studio",
};

export function AllowancesEditor({
  payload,
  onChange,
  readOnly,
  turnkey,
}: TurnkeyEditorProps) {
  const { allowances } = readAllowances(payload);
  const basisPayload = payloadOf(turnkey, TURNKEY_PART_KEYS.pricingBasis);
  const basis = readPricingBasis(basisPayload);
  const refusal = validateAllowances({ allowances }, basis);
  const orphanNote = unbackedAllowanceLine({ allowances }, basis);

  /**
   * Writes the allowances AND the pricing basis' allowance cost lines in one
   * act.
   *
   * Every line is rewritten IN PLACE. Order is load-bearing on the pricing
   * basis: the schedule of values gives the last row the rounding remainder
   * (`scheduleOfValues`), so a rebuild that dropped the allowance lines and
   * re-appended them would move which row absorbs the cents — a silent change
   * to the paper from typing in a field that has nothing to do with it.
   *
   * And a line this editor never wrote is never taken away. An allowance the
   * designer just removed takes its own line with it; an allowance-category
   * cost line authored on the pricing basis, with no allowance behind it,
   * stays exactly where it was and is NAMED instead — `unbackedAllowanceLine`
   * says so in readiness and below.
   *
   * W3R1-03 — AND AN ORPHAN LINE IS ADOPTED, NEVER DOUBLED. The template's
   * pricing basis arrives carrying `Tile allowance` as a `category:
   * 'allowance'` cost line, and readiness invites the designer to "Add them
   * here". Typing that name minted a NEW allowance with a NEW id, so nothing
   * claimed the orphan and an eighth line was appended beside it: the cost
   * basis went from $71,300 to $75,300 on a keystroke, and naming all three
   * took it to $81,600 and broke the GMP-to-the-cent invariant. So an
   * allowance with no line of its own takes the id of the unclaimed
   * allowance-category line that carries its name — one number, said once,
   * exactly as the paragraph above this promises.
   */
  const write = (input: DesignBuildAllowance[]) => {
    if (!turnkey) {
      onChange({ ...payload, allowances: input });
      return;
    }
    const wasAnAllowance = new Set(allowances.map((entry) => entry.id));
    const spokenFor = new Set([
      ...wasAnAllowance,
      ...input.map((entry) => entry.id),
    ]);
    // First orphan per name wins; a name that names two orphans is the
    // designer's own ambiguity and the second stays orphaned and named.
    const orphanByLabel = new Map<string, DesignBuildCostLine>();
    for (const line of basis.costLines) {
      if (line.category !== "allowance" || spokenFor.has(line.id)) continue;
      const key = line.label.trim().toLowerCase();
      if (!key || orphanByLabel.has(key)) continue;
      orphanByLabel.set(key, line);
    }
    const adoptedIds = new Set<string>();
    const next = input.map((entry) => {
      if (basis.costLines.some((line) => line.id === entry.id)) return entry;
      const orphan = orphanByLabel.get(entry.label.trim().toLowerCase());
      if (!orphan || adoptedIds.has(orphan.id)) return entry;
      adoptedIds.add(orphan.id);
      // The line's money comes with the line. An allowance the designer has
      // already priced keeps her figure — the two are one number, and hers
      // is the later word.
      return {
        ...entry,
        id: orphan.id,
        amountCents:
          entry.amountCents > 0 ? entry.amountCents : orphan.basisCents,
      };
    });

    onChange({ ...payload, allowances: next });
    const nextById = new Map(next.map((entry) => [entry.id, entry]));
    const lineFor = (allowance: DesignBuildAllowance): DesignBuildCostLine => ({
      id: allowance.id,
      label: allowance.label,
      category: "allowance",
      basisCents: allowance.amountCents,
    });
    const placed = new Set<string>();
    const costLines: DesignBuildCostLine[] = [];
    for (const line of basis.costLines) {
      if (line.category !== "allowance") {
        costLines.push(line);
        continue;
      }
      const allowance = nextById.get(line.id);
      if (allowance) {
        costLines.push(lineFor(allowance));
        placed.add(allowance.id);
        continue;
      }
      if (wasAnAllowance.has(line.id)) continue;
      costLines.push(line);
    }
    for (const allowance of next) {
      if (placed.has(allowance.id)) continue;
      // An allowance with no name is not yet a cost line. Appending one for
      // the blank row "+ Add an allowance" mints would claim an id before the
      // designer has typed the name that adopts an orphan line (W3R1-03), and
      // the eighth line would be back.
      if (!allowance.label.trim()) continue;
      costLines.push(lineFor(allowance));
    }
    turnkey.writePart(
      TURNKEY_PART_KEYS.pricingBasis,
      // The derived cost basis moves with the lines it is the sum of, or the
      // database refuses the save.
      withCostBasisCents({ ...basisPayload, costLines }),
    );
  };

  return (
    <div className="space-y-4">
      <p className="text-[11px] leading-relaxed text-[var(--text-muted)]">
        Each allowance carries its own cost line on the pricing basis. They are
        one number, written once here.
      </p>

      <div className="space-y-2">
        {allowances.map((allowance, index) => (
          <div
            key={allowance.id}
            data-allowance-id={allowance.id}
            className="grid grid-cols-[minmax(0,1fr)_130px_190px_190px_auto] items-center gap-2"
          >
            <Input
              aria-label={`Allowance ${index + 1}`}
              disabled={readOnly}
              value={allowance.label}
              onChange={(event) =>
                write(
                  allowances.map((row, rowIndex) =>
                    rowIndex === index
                      ? { ...row, label: event.target.value }
                      : row,
                  ),
                )
              }
              placeholder="Tile allowance"
            />
            <Input
              aria-label={`Allowance ${index + 1} amount`}
              inputMode="decimal"
              disabled={readOnly}
              value={dollars(
                allowance.amountCents === 0 ? null : allowance.amountCents,
              )}
              onChange={(event) =>
                write(
                  allowances.map((row, rowIndex) =>
                    rowIndex === index
                      ? {
                          ...row,
                          amountCents: toCentsOrNull(event.target.value) ?? 0,
                        }
                      : row,
                  ),
                )
              }
            />
            <Select
              aria-label={`Allowance ${index + 1} overage rule`}
              disabled={readOnly}
              value={allowance.overageRule}
              onChange={(event) =>
                write(
                  allowances.map((row, rowIndex) =>
                    rowIndex === index
                      ? {
                          ...row,
                          overageRule: event.target
                            .value as DesignBuildAllowance["overageRule"],
                        }
                      : row,
                  ),
                )
              }
            >
              {(
                Object.keys(
                  OVERAGE_LABELS,
                ) as DesignBuildAllowance["overageRule"][]
              ).map((rule) => (
                <option key={rule} value={rule}>
                  {OVERAGE_LABELS[rule]}
                </option>
              ))}
            </Select>
            <Select
              aria-label={`Allowance ${index + 1} underage rule`}
              disabled={readOnly}
              value={allowance.underageRule}
              onChange={(event) =>
                write(
                  allowances.map((row, rowIndex) =>
                    rowIndex === index
                      ? {
                          ...row,
                          underageRule: event.target
                            .value as DesignBuildAllowance["underageRule"],
                        }
                      : row,
                  ),
                )
              }
            >
              {(
                Object.keys(
                  UNDERAGE_LABELS,
                ) as DesignBuildAllowance["underageRule"][]
              ).map((rule) => (
                <option key={rule} value={rule}>
                  {UNDERAGE_LABELS[rule]}
                </option>
              ))}
            </Select>
            <Button
              variant="ghost"
              size="sm"
              disabled={readOnly}
              onClick={() =>
                write(allowances.filter((_, rowIndex) => rowIndex !== index))
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
              ...allowances,
              {
                id: `allowance-${Date.now()}-${allowances.length}`,
                label: "",
                amountCents: 0,
                overageRule: "change_order",
                underageRule: "credit",
              },
            ])
          }
        >
          + Add an allowance
        </Button>
      </div>

      {refusal && (
        <p
          role="status"
          className="text-[11.5px] leading-relaxed text-[var(--color-mocha)]"
        >
          {refusal}
        </p>
      )}

      {orphanNote && (
        <p
          role="status"
          className="text-[11.5px] leading-relaxed text-[var(--text-muted)]"
        >
          {orphanNote}
        </p>
      )}
    </div>
  );
}
