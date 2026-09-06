import "server-only";

import { createServiceClient } from "@patina/supabase/server";

/* ── THE LINK, RESOLVED ──────────────────────────────────────────────────────
   `/pay/<token>` is a public, account-less address whose 64-hex token IS the
   credential. Everything the sheet renders arrives as ONE jsonb from
   `resolve_invoice_link`, called with the service client — the RPC is granted
   to authenticated + service_role and never to anon, so the browser cannot
   reach it directly.

   Three postures die into the same silence (S2): a malformed token, an unknown
   one, a revoked one, a draft or a void invoice with nothing in flight. One
   NULL, one dead sheet, no timing branch, no oracle. ─────────────────────── */

export const INVOICE_LINK_TOKEN_PATTERN = /^[0-9a-f]{64}$/;

export type InvoiceLinkStatus = "sent" | "partially_paid" | "paid";
export type InvoiceLinkRail = "card" | "us_bank_account" | null;
export type PayRail = "us_bank_account" | "card" | "check";

export interface InvoiceLinkLineItem {
  description: string | null;
  quantity: number | null;
  unit_amount_cents: number | null;
  amount_cents: number;
  kind: string | null;
}

export interface InvoiceLinkPayment {
  amount_cents: number;
  surcharge_cents: number;
  method: string | null;
  status: string | null;
  rail: InvoiceLinkRail;
  received_at: string | null;
}

export interface InvoiceLinkStudio {
  name: string | null;
  logo_url: string | null;
  website: string | null;
  source: string | null;
}

export interface InvoiceLinkInvoice {
  number: string | null;
  title: string | null;
  status: InvoiceLinkStatus;
  issue_date: string | null;
  due_date: string | null;
  paid_at: string | null;
  currency: string;
  subtotal_cents: number;
  tax_cents: number;
  tax_rate: number;
  total_cents: number;
  amount_paid_cents: number;
  balance_cents: number;
  memo: string | null;
  project_name: string | null;
  is_studio_invoice: boolean;
}

export interface InvoiceLinkPayload {
  kind: "invoice";
  invoice: InvoiceLinkInvoice;
  line_items: InvoiceLinkLineItem[];
  payments: InvoiceLinkPayment[];
  studio: InvoiceLinkStudio;
  designer_display_name: string | null;
  client_display_name: string | null;
  payment_options: {
    card_surcharge_bps: number;
    check_remit_to: string | null;
  };
  pay: {
    rails: PayRail[];
    processing: boolean;
  };
}

/** A void invoice with money still in flight — letterhead, number, one sentence. */
export interface InvoiceLinkSettling {
  kind: "settling";
  invoice: { number: string | null };
  studio: InvoiceLinkStudio;
  designer_display_name: string | null;
}

/** A closed link with nothing in flight (K5) — the invoice was withdrawn. */
export interface InvoiceLinkWithdrawn {
  kind: "withdrawn";
  invoice: { number: string | null; title: string | null };
  studio: InvoiceLinkStudio;
  designer_display_name: string | null;
  contact: { name: string | null; website: string | null } | null;
}

export type ResolvedInvoiceLink =
  | InvoiceLinkPayload
  | InvoiceLinkSettling
  | InvoiceLinkWithdrawn;

/* ── WHAT MAY NEVER BE ON THE WIRE (S14, §3.1) ───────────────────────────────
   The resolver's contract is "no uuids anywhere, and nothing about the studio's
   own bookkeeping". A payload carrying one of these keys — under any spelling,
   at any depth — is not the resolver speaking, and dies whole rather than
   rendering a sheet that leaks. Enforced twice: once in SQL, once here. ───── */
const FORBIDDEN_KEYS = new Set([
  "internal_notes",
  "email",
  "payer_email",
  "phone",
  "stripe_customer_id",
  "stripe_checkout_session_id",
  "stripe_payment_intent_id",
  "stripe_event_id",
  "void_reason",
  "voided_at",
  "ar_flagged_at",
  "ar_last_chased_at",
  "last_reminder_at",
  "reminder_count",
  "token",
  "return_nonce",
  "reference",
  "recorded_by",
  "note",
  "client_email",
  "payer_name",
]);

/** `id`, `invoice_id`, `payerId` — every identifier spelling the payload bans. */
const IDENTIFIER_KEY = /^id$|_id$|Id$/;

/**
 * Families rather than spellings (S-7). The exact list above catches the keys
 * §3.1 names; these catch the ones it means. `stripe_account` and
 * `stripe_status` are neither `_id`-suffixed nor listed, and the payload has no
 * legitimate key in any of these families — `payment_options`, `paid_at`,
 * `project_name` and `client_display_name` are all clear.
 */
const FORBIDDEN_KEY_FAMILY = /^stripe_|^payer_|_email$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function carriesForbiddenKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(carriesForbiddenKey);
  if (!isRecord(value)) return false;
  return Object.entries(value).some(
    ([key, entry]) =>
      FORBIDDEN_KEYS.has(key) ||
      FORBIDDEN_KEY_FAMILY.test(key) ||
      IDENTIFIER_KEY.test(key) ||
      carriesForbiddenKey(entry),
  );
}

function isInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value)
  );
}

function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function parseStudio(value: unknown): InvoiceLinkStudio | null {
  if (!isRecord(value)) return null;
  const { name, logo_url, website, source } = value;
  if (
    !nullableString(name) ||
    !nullableString(logo_url) ||
    !nullableString(website) ||
    !nullableString(source)
  ) {
    return null;
  }
  return { name, logo_url, website, source };
}

function parseLineItem(value: unknown): InvoiceLinkLineItem | null {
  if (!isRecord(value)) return null;
  const { description, quantity, unit_amount_cents, amount_cents, kind } =
    value;
  if (!isInteger(amount_cents)) return null;
  if (!nullableString(description) || !nullableString(kind)) return null;
  if (quantity !== null && typeof quantity !== "number") return null;
  if (unit_amount_cents !== null && !isInteger(unit_amount_cents)) return null;
  return {
    description,
    quantity: (quantity as number | null) ?? null,
    unit_amount_cents: (unit_amount_cents as number | null) ?? null,
    amount_cents,
    kind,
  };
}

function parsePayment(value: unknown): InvoiceLinkPayment | null {
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

function parseInvoice(value: unknown): InvoiceLinkInvoice | null {
  if (!isRecord(value)) return null;
  const {
    number,
    title,
    status,
    issue_date,
    due_date,
    paid_at,
    currency,
    subtotal_cents,
    tax_cents,
    tax_rate,
    total_cents,
    amount_paid_cents,
    balance_cents,
    memo,
    project_name,
    is_studio_invoice,
  } = value;

  if (status !== "sent" && status !== "partially_paid" && status !== "paid")
    return null;
  if (typeof currency !== "string" || currency.trim().length === 0) return null;
  if (
    !isInteger(subtotal_cents) ||
    !isInteger(tax_cents) ||
    !isInteger(total_cents) ||
    !isInteger(amount_paid_cents) ||
    !isInteger(balance_cents)
  ) {
    return null;
  }
  if (typeof tax_rate !== "number" || !Number.isFinite(tax_rate)) return null;
  if (
    !nullableString(number) ||
    !nullableString(title) ||
    !nullableString(issue_date) ||
    !nullableString(due_date) ||
    !nullableString(paid_at) ||
    !nullableString(memo) ||
    !nullableString(project_name)
  ) {
    return null;
  }
  if (typeof is_studio_invoice !== "boolean") return null;

  return {
    number,
    title,
    status,
    issue_date,
    due_date,
    paid_at,
    currency,
    subtotal_cents,
    tax_cents,
    tax_rate,
    total_cents,
    amount_paid_cents,
    balance_cents,
    memo,
    project_name,
    is_studio_invoice,
  };
}

/**
 * The discriminator is `kind`. I-4 asked for one word and 00574 pinned it: every
 * sheet emits `kind`, and `invoice_links_test.sql` asserts it ("kind is the
 * discriminator W2 reads"). `sheet` is emitted alongside as an alias carrying
 * the same value, and is not read here.
 *
 * The alias is still inspected for one purpose: a payload carrying both
 * spellings with DIFFERENT values is incoherent and dies whole rather than
 * picking a winner.
 */
function readDiscriminator(candidate: Record<string, unknown>): string | null {
  const sheet = candidate.sheet;
  const kind = candidate.kind;
  if (typeof sheet === "string" && typeof kind === "string" && sheet !== kind) {
    return null;
  }
  if (typeof kind === "string") return kind;
  return null;
}

export function parseResolvedInvoiceLink(
  value: unknown,
): ResolvedInvoiceLink | null {
  // S-8: exactly one row, or nothing. Taking `[0]` from a multi-row response
  // would drop the rest WITHOUT the forbidden-key walk ever seeing them. The
  // RPC returns one jsonb today, so this is a guard, not a branch.
  if (Array.isArray(value) && value.length !== 1) return null;
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!isRecord(candidate)) return null;
  if (carriesForbiddenKey(candidate)) return null;

  const discriminator = readDiscriminator(candidate);
  const studio = parseStudio(candidate.studio);
  if (!studio) return null;

  if (discriminator === "settling") {
    const invoice = candidate.invoice;
    if (!isRecord(invoice) || !nullableString(invoice.number)) return null;
    if (!nullableString(candidate.designer_display_name)) return null;
    return {
      kind: "settling",
      invoice: { number: invoice.number },
      studio,
      designer_display_name: candidate.designer_display_name,
    };
  }

  if (discriminator === "withdrawn") {
    const invoice = candidate.invoice;
    if (!isRecord(invoice)) return null;
    if (!nullableString(invoice.number) || !nullableString(invoice.title))
      return null;
    if (!nullableString(candidate.designer_display_name)) return null;
    const rawContact = candidate.contact;
    let contact: InvoiceLinkWithdrawn["contact"] = null;
    if (isRecord(rawContact)) {
      // 00574 emits the contact as
      // `{ designer_display_name, studio_name, website }`. There is no `name`
      // key, and reading one made every real withdrawn payload fail to parse
      // and render the dead sheet instead. The sheet wants a single name to
      // attribute the withdrawal to, so the designer's is preferred and the
      // studio's is the fallback.
      if (
        !nullableString(rawContact.designer_display_name) ||
        !nullableString(rawContact.studio_name) ||
        !nullableString(rawContact.website)
      )
        return null;
      contact = {
        name:
          rawContact.designer_display_name ?? rawContact.studio_name ?? null,
        website: rawContact.website ?? null,
      };
    } else if (rawContact !== undefined && rawContact !== null) {
      return null;
    }
    return {
      kind: "withdrawn",
      invoice: { number: invoice.number, title: invoice.title },
      studio,
      designer_display_name: candidate.designer_display_name ?? null,
      contact,
    };
  }

  if (discriminator !== "invoice") return null;

  const invoice = parseInvoice(candidate.invoice);
  if (!invoice) return null;

  const { line_items, payments, payment_options, pay } = candidate;
  if (!Array.isArray(line_items) || !Array.isArray(payments)) return null;

  const parsedLines: InvoiceLinkLineItem[] = [];
  for (const entry of line_items) {
    const parsed = parseLineItem(entry);
    if (!parsed) return null;
    parsedLines.push(parsed);
  }

  const parsedPayments: InvoiceLinkPayment[] = [];
  for (const entry of payments) {
    const parsed = parsePayment(entry);
    if (!parsed) return null;
    parsedPayments.push(parsed);
  }

  if (!isRecord(payment_options)) return null;
  // G5: the rate is ALWAYS coalesced server-side. A null here is a broken
  // contract, not a "rate unknown" state — the page has no such state.
  if (!isInteger(payment_options.card_surcharge_bps)) return null;
  if (!nullableString(payment_options.check_remit_to)) return null;

  if (!isRecord(pay)) return null;
  if (!Array.isArray(pay.rails) || typeof pay.processing !== "boolean")
    return null;
  const rails: PayRail[] = [];
  for (const rail of pay.rails) {
    if (rail !== "us_bank_account" && rail !== "card" && rail !== "check")
      return null;
    rails.push(rail);
  }

  if (!nullableString(candidate.designer_display_name)) return null;
  if (!nullableString(candidate.client_display_name)) return null;

  return {
    kind: "invoice",
    invoice,
    line_items: parsedLines,
    payments: parsedPayments,
    studio,
    designer_display_name: candidate.designer_display_name,
    client_display_name: candidate.client_display_name,
    payment_options: {
      card_surcharge_bps: payment_options.card_surcharge_bps,
      check_remit_to: payment_options.check_remit_to,
    },
    pay: { rails, processing: pay.processing },
  };
}

type ServiceClient = ReturnType<typeof createServiceClient>;

export async function resolveInvoiceLink(
  token: string,
  options?: { recordView?: boolean; client?: ServiceClient },
): Promise<ResolvedInvoiceLink | null> {
  if (!INVOICE_LINK_TOKEN_PATTERN.test(token)) return null;

  try {
    const admin = options?.client ?? createServiceClient();
    const { data, error } = await admin.rpc("resolve_invoice_link", {
      p_token: token,
      p_record_view: options?.recordView ?? true,
    });
    if (error) return null;
    return parseResolvedInvoiceLink(data);
  } catch {
    return null;
  }
}

/* ── THE LIMITER (S3, S4) ────────────────────────────────────────────────────
   30 requests a minute per `cf-connecting-ip`, on the page and on both of its
   routes — `state` was otherwise a cheaper, uncounted oracle than the page.

   The binding is read with the SYNCHRONOUS `getCloudflareContext()`, never the
   async accessor: outside a deployed Worker the async one falls through to
   wrangler's `getPlatformProxy()`, boots Miniflare, and hands back a stub —
   the reason `lib/data/service-binding.ts` gives at length.

   Absent binding: open in development, LOUD in production. A typo'd binding
   name must not silently disable the only brute-force control behind a green
   deploy. There is no server-side PostHog client in this portal, so the
   production report is the structured error line the Worker's observability
   captures. ─────────────────────────────────────────────────────────────── */

export const PAY_LINK_RATELIMIT_BINDING = "PAY_LINK_RATELIMIT";

interface RateLimiterBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

/**
 * S-6: once per isolate, not once per request. A typo'd binding name would
 * otherwise write one error line per page view, per `state` poll (every 3s
 * during a return) and per `checkout` — turning the loud signal S4 asked for
 * into log flooding, which is the same thing as silence.
 */
let limiterAbsenceReported = false;

function reportMissingLimiter(): void {
  if (process.env.NODE_ENV !== "production") return;
  if (limiterAbsenceReported) return;
  limiterAbsenceReported = true;
  console.error(
    JSON.stringify({
      level: "error",
      portal: "client",
      event: "pay_link_ratelimit_missing",
      binding: PAY_LINK_RATELIMIT_BINDING,
    }),
  );
}

/**
 * @internal Test seam — the latch above is module state, and a suite that
 * asserts the log line must be able to re-arm it.
 */
export function resetLimiterAbsenceReport(): void {
  limiterAbsenceReported = false;
}

async function resolveLimiter(): Promise<RateLimiterBinding | null> {
  try {
    const { getCloudflareContext } =
      await import("@opennextjs/cloudflare/cloudflare-context");
    const { env } = getCloudflareContext();
    const binding = (env as Record<string, unknown>)[
      PAY_LINK_RATELIMIT_BINDING
    ] as RateLimiterBinding | undefined;
    if (binding && typeof binding.limit === "function") return binding;
  } catch {
    // Not inside a deployed Worker — the sync accessor threw.
  }
  return null;
}

export interface PayLinkRateLimitOutcome {
  /**
   * Whether this request may proceed. Over-limit renders the dead sheet, never
   * a "too many attempts" sentence: that would be an oracle telling a guesser
   * that guessing is worth continuing.
   */
  allowed: boolean;
  /**
   * The binding could not be reached at all. In development that is ordinary
   * (there is no Worker); in production it means the only brute-force control
   * is off, which is what S4 asked to be told about loudly. The page carries
   * this to the browser so the PostHog half of S4 can actually fire — there is
   * no server-side PostHog client in this portal.
   */
  limiterMissing: boolean;
}

export async function payLinkRequestAllowed(
  headers: Headers,
): Promise<PayLinkRateLimitOutcome> {
  const limiter = await resolveLimiter();
  if (!limiter) {
    reportMissingLimiter();
    return { allowed: true, limiterMissing: true };
  }
  try {
    const { success } = await limiter.limit({
      key: headers.get("cf-connecting-ip") ?? "unknown",
    });
    return { allowed: success, limiterMissing: false };
  } catch {
    reportMissingLimiter();
    return { allowed: true, limiterMissing: true };
  }
}
