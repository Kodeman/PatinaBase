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
]);

/** `id`, `invoice_id`, `payerId` — every identifier spelling the payload bans. */
const IDENTIFIER_KEY = /^id$|_id$|Id$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function carriesForbiddenKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(carriesForbiddenKey);
  if (!isRecord(value)) return false;
  return Object.entries(value).some(
    ([key, entry]) =>
      FORBIDDEN_KEYS.has(key) ||
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
 * The discriminator is read from `sheet` or `kind`: §3.1 spells the payable and
 * settling sheets with `sheet`, K5 spells the withdrawn one with `kind`. Both
 * are accepted so the page does not depend on which word the migration lands.
 */
function readDiscriminator(candidate: Record<string, unknown>): string | null {
  const sheet = candidate.sheet;
  if (typeof sheet === "string") return sheet;
  const kind = candidate.kind;
  if (typeof kind === "string") return kind;
  return null;
}

export function parseResolvedInvoiceLink(
  value: unknown,
): ResolvedInvoiceLink | null {
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
      if (
        !nullableString(rawContact.name) ||
        !nullableString(rawContact.website)
      )
        return null;
      contact = {
        name: rawContact.name ?? null,
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
    const { data, error } = await admin.rpc(
      // W1-TYPES: cast removed at integration — W1 regenerates database.types.ts
      // with resolve_invoice_link; until then the generated Database has no
      // such function name and the overload cannot be satisfied.
      "resolve_invoice_link" as never,
      {
        p_token: token,
        p_record_view: options?.recordView ?? true,
      } as never,
    );
    if (error) return null;
    return parseResolvedInvoiceLink(data as unknown);
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

function reportMissingLimiter(): void {
  if (process.env.NODE_ENV !== "production") return;
  console.error(
    JSON.stringify({
      level: "error",
      portal: "client",
      event: "pay_link_ratelimit_missing",
      binding: PAY_LINK_RATELIMIT_BINDING,
    }),
  );
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

/**
 * True when this request may proceed. Over-limit renders the dead sheet, never
 * a "too many attempts" sentence: that would be an oracle telling a guesser
 * that guessing is worth continuing.
 */
export async function payLinkRequestAllowed(
  headers: Headers,
): Promise<boolean> {
  const limiter = await resolveLimiter();
  if (!limiter) {
    reportMissingLimiter();
    return true;
  }
  try {
    const { success } = await limiter.limit({
      key: headers.get("cf-connecting-ip") ?? "unknown",
    });
    return success;
  } catch {
    reportMissingLimiter();
    return true;
  }
}
