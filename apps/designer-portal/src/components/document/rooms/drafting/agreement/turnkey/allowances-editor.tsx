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
  validateAllowances,
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

  /**
   * Writes the allowances AND the pricing basis' allowance cost lines in one
   * act. Every non-allowance cost line is left exactly where it was; the
   * allowance lines are rebuilt from this list, so removing an allowance
   * takes its line out of the contract sum too.
   */
  const write = (next: DesignBuildAllowance[]) => {
    onChange({ ...payload, allowances: next });
    if (!turnkey) return;
    const keptLines = basis.costLines.filter(
      (line) => line.category !== "allowance",
    );
    const allowanceLines: DesignBuildCostLine[] = next.map((allowance) => ({
      id: allowance.id,
      label: allowance.label,
      category: "allowance",
      basisCents: allowance.amountCents,
    }));
    turnkey.writePart(TURNKEY_PART_KEYS.pricingBasis, {
      ...basisPayload,
      costLines: [...keptLines, ...allowanceLines],
    });
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
    </div>
  );
}
