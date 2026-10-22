# Carrier-tracking analysis for Patina (US-50): can a tracking number update an order's status?

**Short answer:** Yes for parcel, and yes for most national LTL carriers if we pick the right aggregator. EasyPost and Shippo are poor fits for LTL. None of it exists yet for studio POs. The only tracking code in the repo serves a different table, and its webhook is unreachable and unsigned today. Maker trucks, white-glove deliveries and pickups stay manual. A carrier's "delivered" must never set Patina's `delivered_on` or PO status.

Confidence tags: [H] read in code or a primary source, [M] secondary or partly confirmed, [L] inferred or unconfirmed. All web sources were accessed 2026-10-22.

---

## 1. What exists in the code

### Studio PO tracking is data entry only

- `purchase_orders` has `carrier`, `tracking_number`, `bol_document_path` and `shipped_on`, written by `set_purchase_order_tracking` (`supabase/migrations/00698_po_tracking.sql:44-47,76-133`). [H]
- `po_shipments` has `mode` (`parcel|ltl|white_glove|studio_pickup`), free-text `carrier`, `tracking`, `delivered_on`, `current_eta`, `eta_history` and `inspection_closes_at` (`00704_po_cost_lines_shipments.sql:112-139`). [H]
- `record_po_shipment` accepts these keys and moves the PO to `shipped` (`00704:374-375, ~573-585`). [H]
- `delivered_on` is a designer-entered date. It sets `inspection_closes_at = delivered_on + claims window` (`00704:548-556`). [H]
- `advance_purchase_order_status` refuses `delivered`: "delivered is recorded by receiving" (`00698:244`). [H]
- Moving a PO to shipped can flip pending balance payments to due through the 00184 cascade (`00698:248-250`). [H]
- The portal form has free-text `carrier` and `tracking` inputs (`apps/designer-portal/src/components/document/line-unfold/shipments.tsx:406-424`). [H]
- The only "tracking" display is a link-out for UPS, FedEx and USPS names (`movement-tracking.tsx:33-42`). Any other carrier, including every LTL carrier, gets plain text with no link. [H]

So today the designer types a number and nothing ever updates it.

### The EasyPost code serves a different table and is not wired for us

**Wrong table.** The NestJS `Shipment` model keys on `orderId` in the `svc_orders` customer-order domain (`services/orders/prisma/schema.prisma:272-297`). Studio POs live in Supabase `public.purchase_orders` and `po_shipments`. The webhook's `findShipmentByTrackingNumber` does `findFirst({ where: { trackingNumber } })` with no carrier filter (`fulfillment.service.ts:456-460`), so it could never reach a studio PO. [H]

**Adapter.** `ICarrier.getTracking(trackingNumber, carrier?)` (`carriers/carrier.interface.ts`, `ICarrier` block) is implemented by `EasyPostCarrier.getTracking` (`easypost.carrier.ts:171-187`). That call is `Tracker.create`, a billable create each time, not a read. `CarrierFactory` throws in production if no key is set (`carrier.factory.ts:84-87`). [H]

**Webhook reachability.**
- The handler is `POST /webhooks/carriers/easypost` with `@RequirePermissions(ORDER_PERMISSIONS.ADMIN_ALL)` (`webhooks.controller.ts:35-36`).
- It takes `@CurrentUser()` and uses `user!.sub` as the DB subject (`:47,63,120`).
- The app registers global `HybridAuthGuard` and `PermissionsGuard` (`services/orders/src/app.module.ts:90-99`).
- EasyPost cannot send a Supabase JWT carrying `order.admin.all`, so as built it cannot deliver. I did not find a public bypass decorator. [M-H]

**Signature.** It is not verified. The check is a commented-out TODO and `validateEasyPostSignature` returns `true` (`:51-55,153-165`). The guide's own checklist item "Test webhook signature validation" is unchecked (`CARRIER_INTEGRATION_GUIDE.md:444`; setup at `:316-323`). [H]

**Status map.** It folds `available_for_pickup` into `out_for_delivery` (`webhooks.controller.ts:104-115`). That is wrong for us, because a pickup point is not a delivery. [H]

**Deployment.** `EASYPOST_API_KEY` and `EASYPOST_WEBHOOK_SECRET` are optional env vars, and `EASYPOST_MODE` defaults to `"test"` (`infra/orders-worker/src/index.ts:10-13,58`). I cannot tell from the repo whether production has real values. [L]

**Reuse verdict.** Reuse only the ideas: the status vocabulary (`easypost.carrier.ts:337-`) and the test-number list. Do not reuse the module. The project rule is no new NestJS services (CLAUDE.md), and the data is in Supabase. Build a Supabase edge function plus pg_cron instead.

The precedent is `resend-webhook`, which has `verify_jwt = false` (`supabase/config.toml:333-335`), fails closed when its secret is missing, checks a replay window, does a timing-safe compare, and does HMAC with `crypto.subtle` (`functions/resend-webhook/index.ts:107-160`). Cron plus `invoke_edge_function` with `job_runs` history is established (`00302_daily_briefs.sql:70-83`). [H]

---

## 2. How FF&E ships, and whether a number alone can follow it

| Mode | Can an aggregator follow it from the number? |
|---|---|
| **Parcel (UPS, FedEx, USPS)** | Yes. All aggregators do it and carrier auto-detection works from the number format. [H] |
| **National LTL with PRO (Estes, R+L, Saia, XPO, ABF, SEFL, TForce, FedEx Freight, ODFL)** | Partly. AfterShip's carrier list shows these as `global`, meaning no connection or credentials, except ODFL which is `nice_to_connect`. [H] ShipEngine lists tracking for ABF, Averitt, Estes, FedEx Freight, ODFL, Saia, Southeastern, TForce and UPS Freight; R+L and XPO have five feature checks, tracking unclear. [M] |
| **Maker's own truck, regional or white-glove carrier** | No number and no API. Manual. [M] |
| **Receiving warehouse / white-glove delivery** | No standard feed. Manual. [L] |
| **Ocean container (imports)** | Terminal49 tracks by master BOL or container number plus the shipping-line SCAC. Its free plan covers 10 active containers, and API access is limited on free. [M] Defer; not a first-purchase need. |

**LTL caveats that shape the design.**
- Scans start only after the carrier physically picks up the freight (ODFL page; ShipEngine docs), so a tracker created at entry will return "not found" for hours or days. [H]
- LTL scans between terminals are sparse. [H]
- PRO numbers are mostly 9 digits across carriers, and Estes is 10 (secondary sources). Auto-detect is therefore unreliable for PROs. The designer must pick the carrier when the mode is `ltl`. [M]

### Provider comparison

| Provider | LTL by PRO | Push vs poll | Auto-detect | Price at small volume | Confidence |
|---|---|---|---|---|---|
| **AfterShip** | Best evidence: Estes, R+L, Saia, XPO, ABF, SEFL, TForce, FedEx Freight, Averitt, Dayton, Pitt Ohio, Reddaway, Central Transport all `global`; ODFL `nice_to_connect`. [H, [carrier CSV](https://track.aftership.com/carriers/download)] | Webhook with `aftership-hmac-sha256` (base64 HMAC of the raw body), up to 14 retries. [M, [docs via search](https://www.aftership.com/docs/tracking/webhook/webhook-signature)] | Yes, `slug` optional. [M] | API and webhooks start on Premium: $70/mo for 500 shipments, $0.12 overage. [M, secondary; its pricing page returned 403] | Coverage H, price M |
| **Ship24** | Estes page confirmed. [M] ODFL, Saia and R+L not confirmed. | Webhook with a plain `Authorization: Bearer` shared secret, no HMAC or timestamp. [H, [docs](https://docs.ship24.com/webhooks/authentication)] | Yes. [M] | Pricing page fetched shows $59/mo for 1,000 on the All-in-One Pro tab, API and webhook included from Pro. Search snippets quoted $39/mo for the standalone Tracking API tab. I could not reconcile the two. Overage $0.05. [H/M, [pricing](https://www.ship24.com/pricing)] | M |
| **EasyPost Trackers** | No LTL carrier found on its carrier page; the list was truncated behind "Load More". [L] | Webhook, HMAC in `X-Hmac-Signature`. [H, [docs](https://docs.easypost.com/docs/webhooks)] | Yes, but the docs recommend passing the carrier because ambiguity is common. [H] | Page says $0.01-$0.03 per shipment. [H, [pricing](https://www.easypost.com/pricing)] Standalone $0.03 for USPS and $0.02 otherwise is from secondary sources. [M] | Parcel H, LTL L |
| **Shippo** | Not confirmed. [L] | Webhook; register it first. [M] | Not confirmed. | $0.02 per track on Starter, no free tracking quota. [H, [pricing](https://goshippo.com/pricing/api)] | Parcel M, LTL L |
| **17TRACK** | An ODFL page exists and says a public ODFL API is "not confirmed". [H, [page](https://www.17track.net/en/carriers/old-dominion-freight-line)] Other LTL not confirmed. | Webhook; v2.2 broke integrations in June 2025. [M] | Yes. [M] | 12-month prepaid quota, from $119 for 5,000 registrations, unused quota lost. [M] | L-M |
| **ShipEngine / ShipStation LTL** | PRO-based, 4-5 checks per carrier. [M] | Polling only; no LTL webhook documented. Path is `/v-beta/`. [H, [docs](https://www.shipengine.com/docs/ltl/tracking/)] | No; carrier code required. | Not found. | M |
| **project44** | Yes by PRO, but needs account groups and OAuth, and the LTL API is marked Legacy. [H, [docs](https://developers.project44.com/api-reference/api-docs/ltl:-tracking)] | Webhook. | No. | Enterprise contract; no public price found. | Fit L |
| **Direct carrier APIs** | R+L needs an API key; Saia needs a developer key plus a Saia customer account. [M, [R+L](https://technology.rlcarriers.com/api-documentation/shipment-tracking/), [Saia](https://api.saia.com/customer-api/public/api-docs/index)] | Poll. | n/a | Free, but one integration per carrier. | Too much work |

**USPS tracking (2026 access change).** From 2026-04-01, USPS gives free Tracking API and webhook access to shippers printing their own labels under a Mailer ID, and to platforms authorized by the shipper. "Service Providers and Others" pay a monthly fee under a signed agreement (primary: [usps.com](https://www.usps.com/business/api-access.htm)). A studio tracking a maker's USPS label sits in the gray zone, so aggregator USPS coverage may degrade or cost more. [L] Secondary sources cite $599/mo as the entry fee. Treat that as unconfirmed. UPS Track Alert and the FedEx tracking webhook exist, but I could not confirm their pricing. [L]

**Not read or not confirmed:**
- No aggregator's terms of service were read.
- AfterShip's pricing and docs pages returned 403, so those figures are from search snippets.
- EasyPost's and Shippo's LTL support is unconfirmed.
- I could not confirm which aggregators cover Holland and New Penn.

---

## 3. Recommendation: enter a number and the status updates itself

### Automatic and manual lanes

- **Automatic:** parcel (UPS, FedEx, USPS, DHL), and `mode=ltl` for the national LTL carriers an aggregator proves it can follow.
- **Manual:** the maker's own truck, white-glove and receiving-warehouse deliveries, `studio_pickup`, and ocean imports in v1. These keep the current flow: designer-entered `current_eta` with a reason, plus an explicit "arrived" tap.

### Design

**1. Write path.** After `record_po_shipment` saves a number, an edge function registers a tracker with the aggregator. For `mode=ltl` the designer picks the carrier from a pick-list of about 12 carriers plus "their truck". For parcel, auto-detect is used.

**2. Inbound.** A new edge function, for example `carrier-tracking-webhook`, mirrors `resend-webhook`. It has `verify_jwt=false`, fails closed without its secret, enforces a replay window, and uses a timing-safe compare. If the chosen vendor offers only a bearer secret, such as Ship24, say so, because it is weaker than HMAC.

**3. Fallback polling.** A pg_cron job runs `invoke_edge_function` every few hours over open shipments and writes `job_runs`. Webhooks are not guaranteed delivery.

**4. Not-found handling.** Treat "not found yet" before pickup as pending, not as an error, with a grace window (say 5 days) before a quiet internal flag.

**5. Storage.** Add separate carrier-fact columns or an events table on `po_shipments`: `carrier_status`, `carrier_status_detail`, `carrier_eta`, `carrier_delivered_at`, `last_event_at`. **Do not write `delivered_on`, `current_eta`/`eta_history` or PO `status`.** Those stay designer-authored.

### Status mapping (carrier fact to what the studio sees)

| Carrier says | Patina shows (internal, grey) | Writes anything? |
|---|---|---|
| label created / pre-transit | "Label made, not yet scanned" | No |
| in transit / transferred | "On the way" | No |
| out for delivery | "Out for delivery today" | No |
| delivered | "Carrier says delivered, [time], [where], signed by [x]" plus a prompt "Receive it?" | No. Pre-fills the receive form's date; the designer confirms. |
| exception, delay, held, damaged, refused | "Delivery trouble: [detail]" | No |
| return to sender | "Returning to vendor" | No |
| available for pickup | "Waiting at a pickup point" | No |

Two facts drive this:
- The carrier's delivered scan is the real start of the concealed-damage clock, but Patina's clock starts from `delivered_on` (`00704:124-125, 548-556`). Letting a carrier write it would open and close claim windows with no human present.
- Moving a PO to shipped can make balances due (`00698:248-250`). Entering a number already advances it, so a carrier scan adds nothing there.

### Exceptions and who is told

- **Delivered but not received:** a daily cron flags a shipment where `carrier_delivered_at` is more than N hours old and `delivered_on` is empty, with "Carrier delivered Tuesday 2:14 pm. No receipt recorded. The claim window may already be running." The notice goes to the designer and receiver. It is an internal notice, so it is allowed under the draft-first rule (CLAUDE.md, V22).
- **Delay:** if `carrier_eta` is later than `current_eta`, show it and send an internal notice. Any message to the vendor or client is a draft in `awaiting_review`, sent by the designer. Nothing goes out automatically.
- **Address mismatch:** if the carrier's destination city or ZIP differs from the PO's `ship_to_location_id` (00697), show a warning. [L, untested]
- **New notice kinds** need an enum-add migration in its own file, as in `00699_*.sql:14-28`.

### Cost at 20-60 shipments a month

Assume 1 to 1.3 trackers per shipment (partial shipments add trackers), so about 20 to 80 trackers a month.

| Option | Approx. monthly cost |
|---|---|
| EasyPost or Shippo per-tracker | About $0.40 to $2.40. Parcel only unless LTL is confirmed. |
| Ship24 | About $39 to $59 flat. |
| AfterShip Premium | About $70 flat. |
| 17TRACK | About $119 a year prepaid. LTL coverage unproven. |

At Leah-studio volume the aggregator is a rounding error against a single freight bill. The decision is LTL coverage, not price.

**Suggested first step:** run a time-boxed trial of AfterShip and Ship24 with the first real PROs from Leah's purchases, and judge by hit rate. Do not commit to a provider on paper evidence. AfterShip has the best documented LTL coverage but the highest floor price.

---

## Founder rulings needed

1. **Provider.** Parcel-cheap (EasyPost or Shippo) versus LTL-capable (AfterShip or Ship24), and whether a two-week trial decides it.
2. **Cost absorption.** Does Patina absorb roughly $40 to $70 a month, pass it through, or is it part of the studio subscription? Pricing is on one public page with no hidden fees (CLAUDE.md), so this is a pricing-page question.
3. **Client visibility.** Should the homeowner see carrier status? Client-facing order tracking is a parked side journey governed by V8 (`docs/vision/VISION-DECISIONS.md:487`). Surface it; do not decide it.
4. **Third-party data flow.** Tracking data carries consignee names and addresses. Sending homeowner delivery details to an aggregator is a new subprocessor, so it needs a privacy-page decision.
5. **Automatic delivered.** Confirm that carrier "delivered" only prompts and never records receipt.
6. **LTL carrier pick-list.** Which carriers does Leah's vendor base actually use?

Files cited, all absolute under `/Users/kody/Code/patina-merged/`:
- `services/orders/src/modules/fulfillment/webhooks.controller.ts`
- `services/orders/src/modules/fulfillment/carriers/easypost.carrier.ts`
- `services/orders/src/modules/fulfillment/carriers/carrier.factory.ts`
- `services/orders/src/app.module.ts`
- `services/orders/prisma/schema.prisma`
- `services/orders/CARRIER_INTEGRATION_GUIDE.md`
- `infra/orders-worker/src/index.ts`
- `supabase/migrations/00698_po_tracking.sql`
- `supabase/migrations/00704_po_cost_lines_shipments.sql`
- `supabase/migrations/00699_*.sql`
- `supabase/migrations/00302_daily_briefs.sql`
- `supabase/functions/resend-webhook/index.ts`
- `supabase/config.toml`
- `apps/designer-portal/src/components/document/line-unfold/shipments.tsx`
- `apps/designer-portal/src/components/document/line-unfold/movement-tracking.tsx`
