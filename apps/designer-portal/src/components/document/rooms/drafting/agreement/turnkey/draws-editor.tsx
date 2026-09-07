"use client";

/**
 * Draws — when the homeowner pays, and what the studio holds back.
 *
 * Percentages are what the studio types; every other column is derived. The
 * arithmetic lives in `lib/document/design-build.ts`, which re-implements the
 * trade instrument's "last row takes the remainder" rule rather than importing
 * it — a trade scope's draws are a different object, and coupling the two
 * would make one wave's fix the other wave's bug.
 *
 * Two rows are pinned rather than authored:
 *   · the FIRST draw is the deposit, and it never carries retainage —
 *     nothing has been built yet to hold money against;
 *   · the LAST row is the retainage release, and it exists exactly when
 *     retainage was withheld. It is not editable, it is not a percentage of
 *     anything, and it gives back precisely what was held.
 *
 * Record only (R9). The one authority a design-build agreement writes is its
 * `per_draw` cadence.
 */

import { Button, Input } from "@/components/ui/controls";
import type { DesignBuildDraw } from "@patina/types";
import {
  contractSumCents,
  drawTable,
  MAX_RETAINAGE_BPS,
  readDraws,
  readPricingBasis,
  RETAINAGE_RELEASE_KEY,
  totalPaidCents,
  validateDrawSet,
} from "@/lib/document/design-build";
import { payloadOf, TURNKEY_PART_KEYS, type TurnkeyContext } from "./context";
import { bpsToPercent, percentToBps, turnkeyMoney } from "./money";
import type { TurnkeyEditorProps } from "./pricing-basis-editor";

const LABEL =
  "font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-aged-oak)]";
const CELL = "font-mono text-[11px] text-[var(--color-charcoal)]";

/**
 * A key no other row in this schedule carries.
 *
 * Draw keys are the identity the draw ledger and every invoice are stamped
 * with (I-3 takes `p_draw_key`), so they are minted once, when the row is
 * created, and left alone thereafter — renaming a draw must not orphan its
 * invoice. Which is exactly why they cannot be minted from the array's
 * LENGTH: remove a middle draw from [deposit, draw_2, draw_3] and the next
 * one added is `draw_3` again, `validateDrawSet` refuses with "Two draws
 * share a key. Rename one." and — the key being frozen — there is nothing in
 * this editor that could rename it. So the mint reads the keys actually in
 * use, `retainage_release` included (it is the pinned final row's key), and
 * counts past every one of them.
 */
function mintDrawKey(
  others: readonly DesignBuildDraw[],
  position: number,
  label = "",
): string {
  // The first row is the deposit and its key is `deposit` — validateDrawSet
  // says so, and the ledger and the P13 offer both read it by that name.
  if (position === 0) return "deposit";
  const taken = new Set<string>([RETAINAGE_RELEASE_KEY, "deposit"]);
  for (const draw of others) {
    const key = draw.key.trim();
    if (key) taken.add(key);
  }
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (slug && !taken.has(slug)) return slug;
  const base = slug || "draw";
  let ordinal = position + 1;
  while (taken.has(`${base}_${ordinal}`)) ordinal += 1;
  return `${base}_${ordinal}`;
}

export function DrawsEditor({
  payload,
  onChange,
  readOnly,
  turnkey,
}: TurnkeyEditorProps) {
  const draws = readDraws(payload);
  const basis = readPricingBasis(
    payloadOf(turnkey, TURNKEY_PART_KEYS.pricingBasis),
  );
  const sum = contractSumCents(basis);
  const refusal = validateDrawSet(sum, draws);
  const rows = sum === null ? [] : drawTable(sum, draws);

  const writeDraws = (next: DesignBuildDraw[]) =>
    onChange({
      ...payload,
      draws: next.map((draw, index) => ({ ...draw, sortOrder: index })),
    });

  const editDraw = (index: number, patch: Partial<DesignBuildDraw>) =>
    writeDraws(
      draws.draws.map((draw, drawIndex) =>
        drawIndex === index ? { ...draw, ...patch } : draw,
      ),
    );

  return (
    <div className="space-y-4">
      <label className={LABEL}>
        Retainage · percent
        <Input
          className="mt-2 max-w-[140px]"
          inputMode="decimal"
          aria-label="Retainage percent"
          disabled={readOnly}
          value={bpsToPercent(draws.retainageBps)}
          onChange={(event) =>
            onChange({
              ...payload,
              retainageBps: percentToBps(event.target.value) ?? 0,
            })
          }
          placeholder="5"
        />
      </label>
      <p className="text-[11px] leading-relaxed text-[var(--text-muted)]">
        Retainage is withheld from each draw and returned on the final row. It
        is never billed on top. Up to {MAX_RETAINAGE_BPS / 100}%.
      </p>

      <div className="space-y-2">
        <div className="grid grid-cols-[minmax(0,1fr)_78px_110px_110px_110px_auto] gap-2">
          <span className={LABEL}>Draw</span>
          <span className={LABEL}>%</span>
          <span className={LABEL}>Gross</span>
          <span className={LABEL}>Held</span>
          <span className={LABEL}>Net paid</span>
          <span className="sr-only">Acts</span>
        </div>

        {draws.draws.map((draw, index) => {
          const row = rows[index];
          const isDeposit = index === 0;
          return (
            <div
              key={draw.key || index}
              data-draw-key={draw.key}
              className="grid grid-cols-[minmax(0,1fr)_78px_110px_110px_110px_auto] items-center gap-2"
            >
              <Input
                aria-label={`Draw ${index + 1}`}
                disabled={readOnly}
                value={draw.label}
                onChange={(event) =>
                  editDraw(index, {
                    label: event.target.value,
                    // The key is minted from the FIRST label and then frozen:
                    // a draw that has already been billed must keep the key
                    // its invoice was stamped with.
                    ...(draw.key
                      ? {}
                      : {
                          key: mintDrawKey(
                            draws.draws.filter(
                              (_, drawIndex) => drawIndex !== index,
                            ),
                            index,
                            event.target.value,
                          ),
                        }),
                  })
                }
                placeholder="Rough-in"
              />
              <Input
                aria-label={`Draw ${index + 1} percent`}
                inputMode="decimal"
                disabled={readOnly}
                value={draw.pct === 0 ? "" : String(draw.pct)}
                onChange={(event) =>
                  editDraw(index, { pct: Number(event.target.value) || 0 })
                }
              />
              <span className={CELL} data-cell="gross">
                {row ? turnkeyMoney(row.grossCents) : "—"}
              </span>
              <span className={CELL} data-cell="retainage">
                {row ? turnkeyMoney(row.retainageCents) : "—"}
              </span>
              <span className={CELL} data-cell="net">
                {row ? turnkeyMoney(row.netCents) : "—"}
              </span>
              <label className="flex items-center gap-1.5 text-[11px] text-[var(--color-charcoal)]">
                <input
                  type="checkbox"
                  aria-label={`Retainage applies to draw ${index + 1}`}
                  disabled={readOnly || isDeposit}
                  checked={draw.retainageApplies}
                  onChange={(event) =>
                    editDraw(index, { retainageApplies: event.target.checked })
                  }
                />
                Hold
              </label>
              <Button
                variant="ghost"
                size="sm"
                disabled={readOnly}
                className="col-start-6"
                onClick={() =>
                  writeDraws(
                    draws.draws.filter((_, drawIndex) => drawIndex !== index),
                  )
                }
              >
                Remove
              </Button>
            </div>
          );
        })}

        {/* The pinned release row. Derived, uneditable, and absent when
            nothing was withheld. */}
        {rows.some((row) => row.isRetainageRelease) && (
          <div
            data-draw-key="retainage_release"
            className="grid grid-cols-[minmax(0,1fr)_78px_110px_110px_110px_auto] items-center gap-2 border-t border-[var(--doc-ink-border)] pt-2"
          >
            <span className="text-[12px] italic text-[var(--color-mocha)]">
              {rows[rows.length - 1].label}
            </span>
            <span className={CELL}>—</span>
            <span className={CELL}>
              {turnkeyMoney(rows[rows.length - 1].grossCents)}
            </span>
            <span className={CELL}>—</span>
            <span className={CELL} data-cell="net">
              {turnkeyMoney(rows[rows.length - 1].netCents)}
            </span>
            <span />
          </div>
        )}

        <Button
          variant="ghost"
          size="sm"
          disabled={readOnly}
          onClick={() =>
            writeDraws([
              ...draws.draws,
              {
                key: mintDrawKey(draws.draws, draws.draws.length),
                label: "",
                sortOrder: draws.draws.length,
                pct: 0,
                retainageApplies: draws.draws.length > 0,
              },
            ])
          }
        >
          + Add a draw
        </Button>
      </div>

      {rows.length > 0 && (
        <div className="flex items-baseline justify-between gap-4 border-t border-[var(--doc-ink-border)] pt-2">
          <span className={LABEL}>Paid across the schedule</span>
          <strong className="font-mono text-[12px] font-medium text-[var(--color-charcoal)]">
            {turnkeyMoney(totalPaidCents(rows))}
          </strong>
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
    </div>
  );
}
