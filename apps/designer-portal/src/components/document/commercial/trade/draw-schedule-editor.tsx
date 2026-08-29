'use client';

/**
 * DrawScheduleEditor — how the client pays for the work, said as percentages
 * and stated as money.
 *
 * Two rows are pinned, because every trade scope has them: a deposit that
 * falls due on signature, and a final draw that falls due on acceptance. The
 * final draw is the one that gates on acceptance — exactly one, always last —
 * which is what `issue_trade_draw_invoice` enforces when the money is actually
 * asked for. Anything between them is the studio's to name.
 *
 * Percentages are what the studio types; cents are what the client owes. The
 * last row takes the remainder so the schedule sums to the client price to the
 * penny, which is the rule the send checks before the scope can go out.
 */

import { useEffect, useRef, useState } from 'react';
import {
  computeDrawAmounts,
  drawScheduleGatesArePinned,
  money,
  pinDrawScheduleGates,
  validateDrawSchedule,
  type TradeDrawDraft,
} from '@/lib/document/project-commerce';
import { DocumentAction } from '../../document-action';

export const DEPOSIT_LABEL = 'Deposit · on signature';
export const FINAL_LABEL = 'Final · on acceptance';

/** The house schedule a fresh scope arrives with: half down, half on acceptance. */
export function defaultDrawSchedule(): TradeDrawDraft[] {
  return [
    { label: DEPOSIT_LABEL, percentage: 50, gatesOnAcceptance: false },
    { label: FINAL_LABEL, percentage: 50, gatesOnAcceptance: true },
  ];
}

const CELL_INPUT =
  'min-h-11 w-full border-0 border-b border-[var(--color-pearl)] bg-transparent py-1 text-[12px] text-[var(--color-charcoal)] outline-none focus:border-[var(--color-clay)]';

export function DrawScheduleEditor({
  clientPriceCents,
  draws,
  onChange,
  disabled = false,
}: {
  clientPriceCents: number;
  draws: readonly TradeDrawDraft[];
  onChange: (next: TradeDrawDraft[]) => void;
  disabled?: boolean;
}) {
  const amounts = computeDrawAmounts(clientPriceCents, draws);
  const problem = validateDrawSchedule(clientPriceCents, draws);
  const percentTotal = draws.reduce(
    (sum, draw) => sum + (draw.percentage ?? 0),
    0,
  );

  // The deposit never gates on acceptance and exactly one draw does — the
  // last one — because that is what `issue_trade_draw_invoice` enforces when
  // the money is actually billed. A hydrated schedule (an older save, a
  // direct-table edit) could arrive already violating that, with nothing in
  // the table below to show it. Re-pin on load and on every reorder, and say
  // so once when a real repair happened.
  const [justRepaired, setJustRepaired] = useState(false);
  const lastRepairedKey = useRef<string | null>(null);
  useEffect(() => {
    if (draws.length < 2 || drawScheduleGatesArePinned(draws)) return;
    const key = JSON.stringify(draws.map((draw) => [draw.id, draw.label, draw.gatesOnAcceptance]));
    if (lastRepairedKey.current === key) return;
    lastRepairedKey.current = key;
    setJustRepaired(true);
    onChange(pinDrawScheduleGates(draws));
    // onChange intentionally excluded: re-running when only the caller's
    // function identity changes (not the draws it handed us) would refire
    // this repair on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draws]);

  const update = (index: number, patch: Partial<TradeDrawDraft>) => {
    onChange(
      draws.map((draw, position) =>
        position === index ? { ...draw, ...patch } : draw,
      ),
    );
  };

  const addMiddle = () => {
    const next = [...draws];
    const insertAt = Math.max(1, next.length - 1);
    next.splice(insertAt, 0, {
      label: 'Progress draw',
      percentage: 0,
      gatesOnAcceptance: false,
    });
    onChange(pinDrawScheduleGates(next));
  };

  const removeAt = (index: number) => {
    onChange(pinDrawScheduleGates(draws.filter((_, position) => position !== index)));
  };

  return (
    <section aria-label="Draw schedule">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--color-aged-oak)]">
          Draws
        </p>
        <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
          What the client pays, and when
        </span>
      </div>

      <table className="mt-2 w-full">
        <thead>
          <tr className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
            <th scope="col" className="py-1 text-left font-normal">
              Draw
            </th>
            <th scope="col" className="w-20 py-1 text-right font-normal">
              Percent
            </th>
            <th scope="col" className="w-28 py-1 text-right font-normal">
              Amount
            </th>
            <th scope="col" className="w-16 py-1 text-right font-normal">
              <span className="sr-only">Remove</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {draws.map((draw, index) => {
            const pinned = index === 0 || index === draws.length - 1;
            return (
              <tr
                key={`${draw.id ?? 'draft'}-${index}`}
                className="border-b border-[var(--color-pearl)]"
              >
                <td className="py-1.5 pr-3 text-[12px] text-[var(--color-charcoal)]">
                  {pinned ? (
                    draw.label
                  ) : (
                    <input
                      value={draw.label}
                      disabled={disabled}
                      aria-label={`Draw ${index + 1} name`}
                      onChange={(event) =>
                        update(index, { label: event.target.value })
                      }
                      className={CELL_INPUT}
                    />
                  )}
                </td>
                <td className="py-1.5 pr-3 text-right">
                  <input
                    inputMode="decimal"
                    value={draw.percentage ?? ''}
                    disabled={disabled}
                    aria-label={`${draw.label} percent`}
                    onChange={(event) => {
                      const raw = event.target.value.replace(/[^0-9.]/g, '');
                      const parsed = Number(raw);
                      update(index, {
                        percentage:
                          raw === '' || !Number.isFinite(parsed) ? null : parsed,
                      });
                    }}
                    className={`${CELL_INPUT} text-right font-mono`}
                  />
                </td>
                <td className="whitespace-nowrap py-1.5 pr-3 text-right font-heading text-[12.5px] font-medium text-[var(--color-charcoal)]">
                  {money(amounts[index] ?? 0)}
                  {draw.gatesOnAcceptance && (
                    <span
                      data-testid="draw-gates-on-acceptance"
                      className="ml-2 font-mono text-[11px] font-normal uppercase tracking-[0.06em] text-[var(--color-clay-ink)]"
                    >
                      On acceptance
                    </span>
                  )}
                </td>
                <td className="py-1.5 text-right">
                  {!pinned && !disabled && (
                    <DocumentAction
                      actionKey="remove-trade-draw"
                      surfaceKey="trade-scope"
                      regionKey="draw-schedule"
                      variant="tertiary"
                      onClick={() => removeAt(index)}
                    >
                      Remove
                    </DocumentAction>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="mt-1 flex items-baseline justify-between gap-3">
        <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
          {Math.round(percentTotal * 100) / 100}% of {money(clientPriceCents)}
        </span>
        {!disabled && (
          <DocumentAction
            actionKey="add-trade-draw"
            surfaceKey="trade-scope"
            regionKey="draw-schedule"
            variant="tertiary"
            onClick={addMiddle}
          >
            Add a draw
          </DocumentAction>
        )}
      </div>

      {justRepaired && (
        <p
          role="status"
          data-testid="draw-schedule-repaired-notice"
          className="mt-1 text-[11px] text-[var(--color-aged-oak)]"
        >
          The final draw is the one that falls due on acceptance — repinned it here.
        </p>
      )}

      {problem && (
        <p role="status" className="mt-1 text-[11px] text-[var(--color-terracotta-ink)]">
          {problem}
        </p>
      )}
    </section>
  );
}
