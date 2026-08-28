// create-checkout-session/direct-order.ts — the pure half of the direct-order
// Checkout branch (00540 / Daily Return W5).
//
// Everything here is arithmetic and shape: no Supabase client, no Stripe SDK,
// no env. That is the point — this is the code that decides what a homeowner is
// charged and what the fulfillment rail is told, and it should be provable
// without a running stack or a live Stripe key. index.ts does the I/O (loading
// the order, the config row, the buyer profile) and hands the results here.
// Mirrors the fulfillment-intake/core.ts split.
//
// Types are structural rather than Stripe's, so a test can import this module
// without reaching esm.sh.

/** The subset of a direct_orders row this module reasons about. */
export interface DirectOrderFacts {
  id: string;
  client_id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price_cents: number;
  amount_cents: number;
  designer_id: string | null;
  project_id: string | null;
}

/** `fulfillment_config` → `direct_orders.tax_shipping_enabled`, parsed. */
export interface TaxShippingConfig {
  enabled: boolean;
  shippingRateIds: string[];
}

export interface DirectOrderLineItem {
  quantity: number;
  price_data: {
    currency: string;
    unit_amount: number;
    product_data: { name: string };
    /**
     * Set only when automatic_tax is on. Stripe Tax refuses an inline price
     * with no tax behavior and no account default, so omitting it would fail
     * the session the moment the flag flips. 'exclusive' is the only honest
     * value here: the order sheet's flag-on copy says "Delivery and tax are
     * added at payment", i.e. on top of the price it just printed.
     */
    tax_behavior?: 'exclusive';
  };
}

export interface DirectOrderSessionExtras {
  additionalLineItems?: DirectOrderLineItem[];
  automaticTax?: { enabled: true };
  shippingOptions?: { shipping_rate: string }[];
}

export const TAX_SHIPPING_CONFIG_KEY = 'direct_orders.tax_shipping_enabled';

/**
 * Fails CLOSED. Anything other than an explicit `{"enabled": true}` is off,
 * because "off" is what the order sheet's "Delivery and tax are not included
 * yet" copy promises — and defaulting the other way would charge a tax the
 * client was never shown (critique M14).
 *
 * Shape: {"enabled": false} | {"enabled": true, "shipping_rate_ids": ["shr_…"]}.
 * The rate ids are Stripe dashboard rates. This branch never invents a freight
 * price of its own, so an enabled config with no rate ids adds tax and no
 * shipping options rather than guessing at a delivery charge.
 */
export function parseTaxShippingConfig(value: unknown): TaxShippingConfig {
  const off: TaxShippingConfig = { enabled: false, shippingRateIds: [] };
  if (!value || typeof value !== 'object') return off;
  const row = value as Record<string, unknown>;
  if (row.enabled !== true) return off;
  const ids = Array.isArray(row.shipping_rate_ids)
    ? row.shipping_rate_ids.filter((id): id is string => typeof id === 'string' && id.length > 0)
    : [];
  return { enabled: true, shippingRateIds: ids };
}

/** What the piece itself costs — the base the designer's commission is on. */
export function productSubtotalCents(order: DirectOrderFacts): number {
  return order.quantity * order.unit_price_cents;
}

/**
 * Freight, recovered rather than stored.
 *
 * create_direct_order (00540) folds products.shipping_flat_cents into
 * amount_cents, and both multiplicands of the piece line are snapshotted on the
 * same row — so freight is exactly the remainder and CANNOT drift from the
 * total the order sheet printed. A fourth column would have been one more thing
 * to keep in step. Orders minted before 00540 give 0 here, which is what they
 * were charged.
 */
export function directOrderFreightCents(order: DirectOrderFacts): number {
  return Math.max(0, order.amount_cents - productSubtotalCents(order));
}

/**
 * The session's optional parts: the Delivery line for folded freight, and
 * Stripe Tax / shipping rates when — and only when — the server says so.
 */
export function directOrderSessionExtras(args: {
  order: DirectOrderFacts;
  currency: string;
  taxShipping: TaxShippingConfig;
}): DirectOrderSessionExtras {
  const extras: DirectOrderSessionExtras = {};
  const freight = directOrderFreightCents(args.order);

  if (freight > 0) {
    // A separate line, not a fatter piece price: a buyer should see what she is
    // paying for. Quantity 1 — freight is per delivery, not per unit.
    extras.additionalLineItems = [
      {
        quantity: 1,
        price_data: {
          currency: args.currency,
          unit_amount: freight,
          product_data: { name: 'Delivery' },
          ...(args.taxShipping.enabled ? { tax_behavior: 'exclusive' as const } : {}),
        },
      },
    ];
  }

  if (args.taxShipping.enabled) {
    extras.automaticTax = { enabled: true };
    if (args.taxShipping.shippingRateIds.length > 0) {
      extras.shippingOptions = args.taxShipping.shippingRateIds.map((id) => ({
        shipping_rate: id,
      }));
    }
  }

  return extras;
}

/**
 * The PaymentIntent metadata, in the shape fulfillment-intake/core.ts
 * `normalizeIntakePayload` reads (it reads pi.metadata and nothing else).
 *
 * DELIBERATELY ABSENT — `ship_to`: the address is collected inside the Checkout
 * session, after this runs. normalizeIntakePayload falls back to the
 * PaymentIntent's own copy of it.
 *
 * THE TOTALS HERE ARE PROVISIONAL, and the settle overrides them. They are
 * still written because a BOH-shaped PI is expected to carry them and because
 * they are the right answer whenever the flag is off. What they cannot be is
 * authoritative: with automatic_tax or a shipping rate on the session, Stripe
 * adds to the total AFTER this metadata is stamped, and the three components
 * would no longer sum to `pi.amount`. That is not a rounding nuisance:
 * `fulfillment_orders` carries `chk_fulfillment_captured_identity` (00360:428)
 * — `captured = subtotal + freight + tax` — with a T1 ledger entry of the same
 * shape behind it (00352:178-186), so an unbalanced split is refused at the
 * INSERT and aborts the whole intake, and the client's "where is it" never
 * appears. So stripe-webhook computes the real split from the settled session
 * and passes it on the fulfillment_intake task (see directOrderIntakeTotals).
 *
 * DELIBERATELY ABSENT — the commission rate. `fulfillment_intake_order` stores
 * this whole sub-object as `fulfillment_orders.designer_attribution` (00353:87),
 * and 00540's new client policy lets the buyer read her own order row — so a
 * rate in here is a rate she reads. Direction B §5 discloses THAT a commission
 * exists and that it does not change her price, never its size. Ops reads the
 * snapshot off `direct_orders` as service_role.
 *
 * Stripe caps metadata at 50 keys and 500 characters per value; `lines` is one
 * JSON object for one product, well inside both.
 */
export function buildDirectOrderIntakeMetadata(args: {
  order: DirectOrderFacts;
  clientName: string | null;
  clientEmail: string | null;
  designerClientId: string | null;
}): Record<string, string> {
  const { order } = args;
  const md: Record<string, string> = {
    payable_type: 'direct_order',
    direct_order_id: order.id,
    client_profile_id: order.client_id,
    client_name: args.clientName ?? 'Unknown Client',
    lines: JSON.stringify([
      {
        product_id: order.product_id,
        item_name: order.product_name,
        qty: order.quantity,
        unit_price_cents: order.unit_price_cents,
      },
    ]),
    product_subtotal_cents: String(productSubtotalCents(order)),
    freight_charged_cents: String(directOrderFreightCents(order)),
    tax_cents: '0',
  };

  if (args.clientEmail) md.client_email = args.clientEmail;

  if (order.designer_id) {
    md.designer_profile_id = order.designer_id;
    // Records HOW the order was attributed, not only to whom — and no
    // commercial term, because this lands on a row the buyer can read.
    md.designer_attribution = JSON.stringify({
      source: 'direct_order',
      direct_order_id: order.id,
      project_id: order.project_id,
    });
  }

  if (args.designerClientId) md.designer_client_id = args.designerClientId;

  return md;
}
