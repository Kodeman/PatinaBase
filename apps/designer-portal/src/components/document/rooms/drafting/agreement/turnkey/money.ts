/**
 * How the turnkey editors print a figure.
 *
 * Cents in, dollars out, to the cent — a design-build schedule reconciles to
 * the penny and a rounded display would make the studio's own table look
 * wrong beside the invoice it produces. This is deliberately NOT
 * `agreement-parts-body.tsx`'s whole-dollar formatter: that one is the
 * homeowner's paper, where round numbers read better; this one is the
 * worktable, where the arithmetic has to be checkable.
 */

export function turnkeyMoney(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

/** A basis-point figure as the percent a designer typed. */
export function bpsToPercent(bps: number | null): string {
  return bps === null ? "" : String(bps / 100);
}

/** A typed percent as basis points, or null for a field nobody has written.
 *  R21's rule: an empty field is not a zero. */
export function percentToBps(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
}
