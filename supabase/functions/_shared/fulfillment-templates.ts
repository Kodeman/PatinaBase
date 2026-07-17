// _shared/fulfillment-templates.ts — THE single source of client-note copy
// for Back of House (S4, spec §6). Every transition template — and the
// send-time subject/push-copy re-derivation in fulfillment-notify/core.ts —
// goes through this module. Nothing else may hand-roll client-note text.
//
// ⚠ Normative constraint (spec §6): "rendered with order data, NEVER exposing
// vendor decomposition." ClientSafeOrderProjection is the enforcement
// mechanism, not just documentation of intent — it has no field a vendor
// name, PO number, or cost figure could be assigned to. A caller cannot leak
// what the type cannot carry. Anything vendor/PO/cost-bearing (which S3's PO
// composer and the Workbench DTOs do carry) must be redacted to this shape
// BEFORE it reaches draftClientNote() — that redaction happens in the admin
// API route (apps/admin-portal/.../notifications/draft/route.ts), which has
// the vendor-bearing data and is responsible for stripping it. This module
// never queries the database and never sees anything wider than this type.
//
// S3's PO composer & transmission log ships a plain-body ack-drafted note in
// S0/S3 scope as a placeholder; this module is what it should be replaced to
// call once S4 lands (S3 leaves a comment pointing here, per the S4 brief).

import {
  escapeHtml,
  heading,
  kicker,
  muted,
  paragraph,
  renderBrandedShell,
} from "./branded-email.ts";

// ── The five transitions (spec §6) ──────────────────────────────────────────
export type ClientNotificationTransition =
  | "confirmed"
  | "in_production"
  | "shipped"
  | "delivered"
  | "eta_change";

export const CLIENT_NOTIFICATION_TRANSITIONS: readonly ClientNotificationTransition[] = [
  "confirmed",
  "in_production",
  "shipped",
  "delivered",
  "eta_change",
];

export type ShippingMode = "parcel" | "ltl" | "white_glove";

export interface ClientSafeOrderItem {
  /** Item/product name — client-safe (this is what the client bought, not
   *  what Patina paid for it or who supplies it). */
  name: string;
  qty: number;
}

/**
 * The ONLY input client-note templates may read. See the file header — this
 * type's shape IS the leak guard. Every field is safe to put in front of the
 * client verbatim.
 */
export interface ClientSafeOrderProjection {
  orderNumber: number;
  clientName: string;
  items: ClientSafeOrderItem[];
  /** ISO date (yyyy-mm-dd) or full timestamp; null when no estimate exists yet. */
  eta: string | null;
  /** eta_change only — the estimate being superseded. */
  previousEta?: string | null;
  /** shipped only — drives the freight inspection-guidance paragraph for ltl/white_glove. */
  shippingMode?: ShippingMode | null;
  /** eta_change only — pre-approved, vendor-free copy explaining the delay in
   *  plain terms (e.g. "a component is back-ordered"). Never raw exception
   *  evidence/notes, which may name a vendor. */
  exceptionNote?: string | null;
}

export interface RenderedClientNote {
  templateKey: string;
  transition: ClientNotificationTransition;
  subject: string;
  html: string;
  text: string;
  pushTitle: string;
  pushBody: string;
}

// ── Deterministic template-key + subject/push-copy (transition + order
// number only — no items/eta needed) so fulfillment-notify's send() leg can
// re-derive the exact same subject/push copy from a persisted notification
// row (which stores transition + order_id, not the full draft-time
// projection) without duplicating copy logic outside this file. ───────────
export function templateKeyFor(transition: ClientNotificationTransition): string {
  return `client_note.${transition}.v1`;
}

export function subjectForTransition(
  transition: ClientNotificationTransition,
  orderNumber: number,
): string {
  switch (transition) {
    case "confirmed":
      return `Your order #${orderNumber} is confirmed`;
    case "in_production":
      return `Your order #${orderNumber} is in production`;
    case "shipped":
      return `Your order #${orderNumber} has shipped`;
    case "delivered":
      return `Your order #${orderNumber} has arrived`;
    case "eta_change":
      return `An update on your order #${orderNumber}`;
  }
}

export function pushCopyForTransition(
  transition: ClientNotificationTransition,
  orderNumber: number,
): { title: string; body: string } {
  switch (transition) {
    case "confirmed":
      return { title: `Order #${orderNumber} confirmed`, body: "We've got it — moving into production now." };
    case "in_production":
      return { title: `Order #${orderNumber} in production`, body: "Your order is being made." };
    case "shipped":
      return { title: `Order #${orderNumber} shipped`, body: "Your order is on its way." };
    case "delivered":
      return { title: `Order #${orderNumber} delivered`, body: "Your order has arrived. Let us know how it looks." };
    case "eta_change":
      return { title: `Order #${orderNumber} update`, body: "We have an update on your order's timeline." };
  }
}

// ── Body helpers ─────────────────────────────────────────────────────────
function firstName(clientName: string): string {
  const trimmed = clientName.trim();
  const first = trimmed.split(/\s+/)[0];
  return first || trimmed || "there";
}

/** yyyy-mm-dd or a full ISO timestamp -> "July 24, 2026". Falls back to the
 *  raw string if it doesn't parse (never throws on a client-safe render). */
function formatEta(eta: string): string {
  const d = new Date(eta);
  if (Number.isNaN(d.getTime())) return eta;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

function formatItemList(items: ClientSafeOrderItem[]): string {
  if (items.length === 0) return "your order";
  const names = items.map((i) =>
    i.qty > 1 ? `${escapeHtml(i.name)} (×${i.qty})` : escapeHtml(i.name)
  );
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

function plainItemList(items: ClientSafeOrderItem[]): string {
  if (items.length === 0) return "your order";
  const names = items.map((i) => (i.qty > 1 ? `${i.name} (x${i.qty})` : i.name));
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

const AUTOMATED_FOOTER = muted(
  "This is an automated update from Patina Orders. Reply to this email if you have a question.",
);

/** The freight-inspection-guidance paragraph (spec §6) — appears on the
 *  shipped template ONLY when shippingMode is ltl or white_glove, never for
 *  parcel. No vendor/carrier name — general guidance only. */
const FREIGHT_INSPECTION_PARAGRAPH = paragraph(
  "Because this shipment is traveling by freight carrier, please inspect every item closely " +
    "before signing for delivery. Note any visible damage directly on the delivery receipt " +
    "before the driver leaves — this is what protects your ability to file a claim if anything " +
    "arrived damaged. If you can't fully inspect at the door, write “subject to inspection” " +
    "next to your signature.",
);

function shellFor(eyebrow: string, body: string, preview: string, orderNumber: number): string {
  return renderBrandedShell({
    title: `Order #${orderNumber}`,
    eyebrow,
    preview,
    body,
  });
}

// ── The five renderers ──────────────────────────────────────────────────

function renderConfirmed(p: ClientSafeOrderProjection): RenderedClientNote {
  const subject = subjectForTransition("confirmed", p.orderNumber);
  const itemsHtml = formatItemList(p.items);
  const body =
    kicker("Order confirmed") +
    heading(`We've got it, ${escapeHtml(firstName(p.clientName))}.`) +
    paragraph(`Your order #${p.orderNumber} — ${itemsHtml} — is confirmed and moving into production.`) +
    (p.eta
      ? paragraph(
        `Current estimate: <strong>${escapeHtml(formatEta(p.eta))}</strong>. We'll follow up the moment that firms up or changes.`,
      )
      : paragraph("We'll follow up with a production estimate shortly.")) +
    AUTOMATED_FOOTER;
  const push = pushCopyForTransition("confirmed", p.orderNumber);
  return {
    templateKey: templateKeyFor("confirmed"),
    transition: "confirmed",
    subject,
    html: shellFor("Order confirmed", body, subject, p.orderNumber),
    text: `Your order #${p.orderNumber} (${plainItemList(p.items)}) is confirmed.` +
      (p.eta ? ` Estimated: ${formatEta(p.eta)}.` : ""),
    pushTitle: push.title,
    pushBody: push.body,
  };
}

function renderInProduction(p: ClientSafeOrderProjection): RenderedClientNote {
  const subject = subjectForTransition("in_production", p.orderNumber);
  const itemsHtml = formatItemList(p.items);
  const body =
    kicker("In production") +
    heading(`Underway, ${escapeHtml(firstName(p.clientName))}.`) +
    paragraph(`${itemsHtml} — order #${p.orderNumber} — is now in production.`) +
    (p.eta
      ? paragraph(`Estimated ship date: <strong>${escapeHtml(formatEta(p.eta))}</strong>.`)
      : paragraph("We'll share a ship estimate as soon as it's confirmed.")) +
    AUTOMATED_FOOTER;
  const push = pushCopyForTransition("in_production", p.orderNumber);
  return {
    templateKey: templateKeyFor("in_production"),
    transition: "in_production",
    subject,
    html: shellFor("In production", body, subject, p.orderNumber),
    text: `Order #${p.orderNumber} (${plainItemList(p.items)}) is in production.` +
      (p.eta ? ` Estimated ship date: ${formatEta(p.eta)}.` : ""),
    pushTitle: push.title,
    pushBody: push.body,
  };
}

function renderShipped(p: ClientSafeOrderProjection): RenderedClientNote {
  const subject = subjectForTransition("shipped", p.orderNumber);
  const itemsHtml = formatItemList(p.items);
  const isFreight = p.shippingMode === "ltl" || p.shippingMode === "white_glove";
  const body =
    kicker("Shipped") +
    heading(`On its way, ${escapeHtml(firstName(p.clientName))}.`) +
    paragraph(`${itemsHtml} shipped from our workshop network.`) +
    (p.eta
      ? paragraph(`Estimated arrival: <strong>${escapeHtml(formatEta(p.eta))}</strong>.`)
      : "") +
    (isFreight ? FREIGHT_INSPECTION_PARAGRAPH : "") +
    AUTOMATED_FOOTER;
  const push = pushCopyForTransition("shipped", p.orderNumber);
  return {
    templateKey: templateKeyFor("shipped"),
    transition: "shipped",
    subject,
    html: shellFor("Shipped", body, subject, p.orderNumber),
    text: `${plainItemList(p.items)} (order #${p.orderNumber}) has shipped.` +
      (p.eta ? ` Estimated arrival ${formatEta(p.eta)}.` : "") +
      (isFreight ? " Please inspect closely before signing for delivery." : ""),
    pushTitle: push.title,
    pushBody: p.eta ? `Estimated arrival ${formatEta(p.eta)}.` : push.body,
  };
}

function renderDelivered(p: ClientSafeOrderProjection): RenderedClientNote {
  const subject = subjectForTransition("delivered", p.orderNumber);
  const itemsHtml = formatItemList(p.items);
  const body =
    kicker("Delivered") +
    heading(`It's there, ${escapeHtml(firstName(p.clientName))}.`) +
    paragraph(`${itemsHtml} — order #${p.orderNumber} — has been delivered.`) +
    paragraph(
      "Please take a look when you have a moment. If anything arrived damaged or isn't quite right, " +
        "reply to this email within a few days so we can make it right.",
    ) +
    AUTOMATED_FOOTER;
  const push = pushCopyForTransition("delivered", p.orderNumber);
  return {
    templateKey: templateKeyFor("delivered"),
    transition: "delivered",
    subject,
    html: shellFor("Delivered", body, subject, p.orderNumber),
    text: `${plainItemList(p.items)} (order #${p.orderNumber}) has been delivered. Reply if anything needs attention.`,
    pushTitle: push.title,
    pushBody: push.body,
  };
}

function renderEtaChange(p: ClientSafeOrderProjection): RenderedClientNote {
  const subject = subjectForTransition("eta_change", p.orderNumber);
  const itemsHtml = formatItemList(p.items);
  const etaLine = p.eta
    ? p.previousEta
      ? paragraph(
        `The estimate for order #${p.orderNumber} has moved from <strong>${escapeHtml(formatEta(p.previousEta))}</strong> to <strong>${escapeHtml(formatEta(p.eta))}</strong>.`,
      )
      : paragraph(`New estimate for order #${p.orderNumber}: <strong>${escapeHtml(formatEta(p.eta))}</strong>.`)
    : paragraph(`We don't have a new estimate yet for order #${p.orderNumber} — we'll follow up as soon as we do.`);
  const body =
    kicker("Order update") +
    heading(`A quick update, ${escapeHtml(firstName(p.clientName))}.`) +
    paragraph(`We wanted to flag a change on ${itemsHtml}.`) +
    etaLine +
    (p.exceptionNote ? paragraph(escapeHtml(p.exceptionNote)) : "") +
    AUTOMATED_FOOTER;
  const push = pushCopyForTransition("eta_change", p.orderNumber);
  return {
    templateKey: templateKeyFor("eta_change"),
    transition: "eta_change",
    subject,
    html: shellFor("Order update", body, subject, p.orderNumber),
    text: `Update on order #${p.orderNumber} (${plainItemList(p.items)}).` +
      (p.eta ? ` New estimate: ${formatEta(p.eta)}.` : "") +
      (p.exceptionNote ? ` ${p.exceptionNote}` : ""),
    pushTitle: push.title,
    pushBody: push.body,
  };
}

const RENDERERS: Record<
  ClientNotificationTransition,
  (p: ClientSafeOrderProjection) => RenderedClientNote
> = {
  confirmed: renderConfirmed,
  in_production: renderInProduction,
  shipped: renderShipped,
  delivered: renderDelivered,
  eta_change: renderEtaChange,
};

/** The single entry point every caller uses to render a client note. */
export function renderClientNoteTemplate(
  transition: ClientNotificationTransition,
  projection: ClientSafeOrderProjection,
): RenderedClientNote {
  const renderer = RENDERERS[transition];
  if (!renderer) {
    throw new Error(`fulfillment-templates: unknown transition '${transition}'`);
  }
  return renderer(projection);
}
