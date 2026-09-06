/**
 * The pay sheet's shape law, with no server dependencies.
 *
 * `invoice-link.ts` is `server-only` — it holds the service client and the
 * limiter. But the sheet is a client component and re-reads the same payload
 * shape from `/pay/<token>/state` every three seconds, and it was casting that
 * response instead of parsing it. One definition of a payment's shape, usable
 * from both halves, is the whole point of this file.
 *
 * Everything here is pure: no I/O, no environment, no imports.
 */

export type InvoiceLinkRail = "card" | "us_bank_account" | null;

export interface InvoiceLinkPayment {
  amount_cents: number;
  surcharge_cents: number;
  method: string | null;
  status: string | null;
  rail: InvoiceLinkRail;
  received_at: string | null;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value)
  );
}

export function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

/**
 * A key the resolver emits but whose ABSENCE is not a contract breach.
 * Requiring presence is how the withdrawn sheet broke once already: the parser
 * demanded a `name` key 00574 never emitted and every voided invoice rendered
 * the dead sheet. Wrong TYPE still dies whole; merely missing reads as null.
 */
export function optionalString(
  value: unknown,
): value is string | null | undefined {
  return value === undefined || value === null || typeof value === "string";
}

export function parsePayment(value: unknown): InvoiceLinkPayment | null {
  if (!isRecord(value)) return null;
  const { amount_cents, surcharge_cents, method, status, rail, received_at } =
    value;
  if (!isInteger(amount_cents)) return null;
  if (!isInteger(surcharge_cents)) return null;
  if (
    !nullableString(method) ||
    !nullableString(status) ||
    !nullableString(received_at)
  ) {
    return null;
  }
  if (rail !== null && rail !== "card" && rail !== "us_bank_account")
    return null;
  return { amount_cents, surcharge_cents, method, status, rail, received_at };
}
