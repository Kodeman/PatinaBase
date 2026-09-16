"use client";

/**
 * Pricing basis — how a turnkey agreement is priced, and the cost behind it.
 *
 * Four bases only (research 02 §2 rows 1, 2, 4, 5): fixed, cost-plus,
 * cost-plus with a guaranteed maximum, and time and materials with a
 * not-to-exceed. Unit price and cost-plus-fixed-fee are deliberately out of
 * this wave.
 *
 * Record only (R9): none of this projects into `proposal_service_terms` or
 * into billing authority. The only authority a design-build agreement writes
 * is its `per_draw` cadence.
 *
 * Under an OPEN book the schedule of values is derived here — the trades at
 * cost, the fee as its own line. Under a CLOSED book it is written here
 * instead (R43): the studio's own division of the work, summing to the
 * contract sum. It lives on this payload rather than in a part of its own, so
 * there is still one authored total per contract.
 */

import { Button, Input, Select } from "@/components/ui/controls";
import {
  PRICING_BASIS_KINDS,
  type DesignBuildCostLine,
  type DesignBuildScheduleOfValuesLine,
  type PricingBasisKind,
} from "@patina/types";
import {
  contractSumCents,
  contractSumLabel,
  costBasisCents,
  feeCents,
  PRICING_BASIS_LABELS,
  readPricingBasis,
  readSubDisclosure,
  readSubMarkupBps,
  seedScheduleOfValues,
  validatePricingBasis,
  withCostBasisCents,
} from "@/lib/document/design-build";
import { dollars, toCentsOrNull } from "../part-kinds";
import { payloadOf, TURNKEY_PART_KEYS, type TurnkeyContext } from "./context";
import { bpsToPercent, percentToBps, turnkeyMoney } from "./money";
import { ScheduleOfValues } from "./schedule-of-values";

const LABEL =
  "font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-subtle)]";

export const SOV_AUTHORING_NOTE =
  "Your own division of the work — a room, a phase, or one line for the whole of it. It comes to the contract sum, and it is not the cost lines above.";

const CATEGORY_LABELS: Record<DesignBuildCostLine["category"], string> = {
  sub: "Trade",
  general_conditions: "General conditions",
  allowance: "Allowance",
};

/** Which amount field this basis asks for. `cost_plus` asks for none — its
 *  total is the cost basis plus the fee and it is an estimate, not a cap. */
type SumField = "fixedCents" | "gmpCents" | "nteCents" | null;

const SUM_FIELD: Record<PricingBasisKind, SumField> = {
  fixed: "fixedCents",
  cost_plus: null,
  cost_plus_gmp: "gmpCents",
  tm_nte: "nteCents",
};

export interface TurnkeyEditorProps {
  payload: Record<string, unknown>;
  onChange: (payload: Record<string, unknown>) => void;
  readOnly: boolean;
  turnkey?: TurnkeyContext;
}

export function PricingBasisEditor({
  payload,
  onChange,
  readOnly,
  turnkey,
}: TurnkeyEditorProps) {
  const basis = readPricingBasis(payload);
  const cost = costBasisCents(basis);
  const fee = feeCents(basis);
  const sum = contractSumCents(basis);
  const refusal = validatePricingBasis(basis);
  const markupBps = readSubMarkupBps(payload);
  // The mode the sub-disclosure clause elected, so the derived table below
  // shows what the homeowner will actually read. The clause is where it is
  // chosen; the pricing basis is where it is stored (one per contract).
  const mode = readSubDisclosure(
    payloadOf(turnkey, TURNKEY_PART_KEYS.subDisclosure),
  ).mode;

  // Every write recomputes the derived cost basis: the database refuses a
  // payload whose `costBasisCents` is not exactly the sum of the lines
  // beneath it, and derives a cost-plus contract sum from that same key.
  const write = (next: Record<string, unknown>) =>
    onChange(withCostBasisCents({ ...payload, ...next }));

  const writeLines = (lines: DesignBuildCostLine[]) =>
    write({ costLines: lines });

  const writeScheduleOfValues = (lines: DesignBuildScheduleOfValuesLine[]) =>
    write({ scheduleOfValues: lines });

  const sumField: SumField = basis.basis ? SUM_FIELD[basis.basis] : null;
  const sumLabel = contractSumLabel(basis.basis);
  const carriesFee = basis.basis !== null && basis.basis !== "fixed";

  return (
    <div className="space-y-5">
      <div>
        <p className={LABEL}>How this agreement is priced</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {PRICING_BASIS_KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              disabled={readOnly}
              aria-pressed={basis.basis === kind}
              onClick={() =>
                write(
                  // A fixed price carries no fee percentage; moving to it
                  // clears one rather than leaving a number that no longer
                  // means anything.
                  kind === "fixed"
                    ? { basis: kind, feeBps: null }
                    : { basis: kind },
                )
              }
              className={`rounded-[3px] border px-3 py-1.5 text-[12px] transition-colors ${
                basis.basis === kind
                  ? "border-[var(--color-clay)] bg-[var(--color-clay)] text-white"
                  : "border-[var(--doc-ink-border)] text-[var(--color-charcoal)] hover:border-[var(--color-clay)]"
              }`}
            >
              {PRICING_BASIS_LABELS[kind]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {carriesFee && (
          <label className={LABEL}>
            Fee · percent
            <Input
              className="mt-2"
              inputMode="decimal"
              aria-label="Fee percent"
              disabled={readOnly}
              value={bpsToPercent(basis.feeBps)}
              onChange={(event) =>
                write({ feeBps: percentToBps(event.target.value) })
              }
              placeholder="18"
            />
          </label>
        )}
        <label className={LABEL}>
          Markup on the trades · percent
          <Input
            className="mt-2"
            inputMode="decimal"
            aria-label="Markup on the trades percent"
            disabled={readOnly}
            value={bpsToPercent(markupBps)}
            onChange={(event) =>
              write({ subMarkupBps: percentToBps(event.target.value) })
            }
            placeholder="0"
          />
        </label>
        {sumField && (
          <label className={LABEL}>
            {sumLabel} · dollars
            <Input
              className="mt-2"
              inputMode="decimal"
              aria-label={`${sumLabel} dollars`}
              disabled={readOnly}
              value={dollars(basis[sumField])}
              onChange={(event) =>
                write({ [sumField]: toCentsOrNull(event.target.value) })
              }
            />
          </label>
        )}
      </div>

      <div>
        <p className={LABEL}>Cost lines</p>
        <div className="mt-2 space-y-2">
          {basis.costLines.map((line, index) => (
            <div
              key={line.id}
              className="grid grid-cols-[minmax(0,1fr)_150px_130px_auto] items-center gap-2"
            >
              <Input
                aria-label={`Cost line ${index + 1}`}
                disabled={readOnly}
                value={line.label}
                onChange={(event) =>
                  writeLines(
                    basis.costLines.map((row, rowIndex) =>
                      rowIndex === index
                        ? { ...row, label: event.target.value }
                        : row,
                    ),
                  )
                }
                placeholder="Cabinetry & millwork"
              />
              <Select
                aria-label={`Cost line ${index + 1} category`}
                disabled={readOnly}
                value={line.category}
                onChange={(event) =>
                  writeLines(
                    basis.costLines.map((row, rowIndex) =>
                      rowIndex === index
                        ? {
                            ...row,
                            category: event.target
                              .value as DesignBuildCostLine["category"],
                          }
                        : row,
                    ),
                  )
                }
              >
                {(
                  Object.keys(
                    CATEGORY_LABELS,
                  ) as DesignBuildCostLine["category"][]
                ).map((category) => (
                  <option key={category} value={category}>
                    {CATEGORY_LABELS[category]}
                  </option>
                ))}
              </Select>
              <Input
                aria-label={`Cost line ${index + 1} amount`}
                inputMode="decimal"
                disabled={readOnly}
                value={dollars(line.basisCents === 0 ? null : line.basisCents)}
                onChange={(event) =>
                  writeLines(
                    basis.costLines.map((row, rowIndex) =>
                      rowIndex === index
                        ? {
                            ...row,
                            basisCents: toCentsOrNull(event.target.value) ?? 0,
                          }
                        : row,
                    ),
                  )
                }
                placeholder="$ at cost"
              />
              <Button
                variant="ghost"
                size="sm"
                disabled={readOnly}
                onClick={() =>
                  writeLines(
                    basis.costLines.filter((_, rowIndex) => rowIndex !== index),
                  )
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
              writeLines([
                ...basis.costLines,
                {
                  id: `line-${Date.now()}-${basis.costLines.length}`,
                  label: "",
                  category: "sub",
                  basisCents: 0,
                },
              ])
            }
          >
            + Add a cost line
          </Button>
        </div>
      </div>

      {/* The three header chips M6 draws, derived and never typed. */}
      <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-[var(--doc-ink-border)] pt-3">
        <span data-chip="cost-basis" className={LABEL}>
          Cost basis {turnkeyMoney(cost)}
        </span>
        {carriesFee && (
          <span data-chip="fee" className={LABEL}>
            Fee {basis.feeBps === null ? "—" : `${basis.feeBps / 100}%`} ·{" "}
            {turnkeyMoney(fee)}
          </span>
        )}
        <span data-chip="contract-sum" className={LABEL}>
          {sumLabel} {sum === null ? "—" : turnkeyMoney(sum)}
        </span>
      </div>

      {/* R43 — under a closed book the client reads the studio's own lines,
          never a pro-rating of the cost lines above. Authored here so the one
          total on the paper stays the contract sum. */}
      {mode === "closed_book" && (
        <div>
          <p className={LABEL}>Schedule of values · what your client reads</p>
          <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-muted)]">
            {SOV_AUTHORING_NOTE}
          </p>
          <div className="mt-2 space-y-2">
            {basis.scheduleOfValues.map((line, index) => (
              <div
                key={line.id}
                className="grid grid-cols-[minmax(0,1fr)_130px_auto] items-center gap-2"
              >
                <Input
                  aria-label={`Schedule of values line ${index + 1}`}
                  disabled={readOnly}
                  value={line.label}
                  onChange={(event) =>
                    writeScheduleOfValues(
                      basis.scheduleOfValues.map((row, rowIndex) =>
                        rowIndex === index
                          ? { ...row, label: event.target.value }
                          : row,
                      ),
                    )
                  }
                  placeholder="Kitchen"
                />
                <Input
                  aria-label={`Schedule of values line ${index + 1} amount`}
                  inputMode="decimal"
                  disabled={readOnly}
                  value={dollars(line.cents === 0 ? null : line.cents)}
                  onChange={(event) =>
                    writeScheduleOfValues(
                      basis.scheduleOfValues.map((row, rowIndex) =>
                        rowIndex === index
                          ? {
                              ...row,
                              cents: toCentsOrNull(event.target.value) ?? 0,
                            }
                          : row,
                      ),
                    )
                  }
                  placeholder="$ to your client"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={readOnly}
                  onClick={() =>
                    writeScheduleOfValues(
                      basis.scheduleOfValues.filter(
                        (_, rowIndex) => rowIndex !== index,
                      ),
                    )
                  }
                >
                  Remove
                </Button>
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={readOnly}
                onClick={() =>
                  writeScheduleOfValues([
                    ...basis.scheduleOfValues,
                    {
                      id: `sov-${Date.now()}-${basis.scheduleOfValues.length}`,
                      label: "",
                      cents: 0,
                    },
                  ])
                }
              >
                + Add a line
              </Button>
              {basis.scheduleOfValues.length === 0 && sum !== null && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={readOnly}
                  onClick={() =>
                    writeScheduleOfValues(seedScheduleOfValues(basis))
                  }
                >
                  Start with one line
                </Button>
              )}
            </div>
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-4 border-t border-[var(--doc-ink-border)] pt-2">
            <span className={LABEL}>Your client&rsquo;s total</span>
            <strong
              data-chip="sov-total"
              className="font-mono text-[11px] font-medium text-[var(--color-charcoal)]"
            >
              {turnkeyMoney(
                basis.scheduleOfValues.reduce(
                  (running, line) => running + line.cents,
                  0,
                ),
              )}
            </strong>
          </div>
        </div>
      )}

      {refusal && (
        <p
          role="status"
          className="text-[11.5px] leading-relaxed text-[var(--color-mocha)]"
        >
          {refusal}
        </p>
      )}

      <ScheduleOfValues basis={basis} mode={mode} />
    </div>
  );
}
