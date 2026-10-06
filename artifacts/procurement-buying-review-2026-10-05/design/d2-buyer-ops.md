# D2: Buyer operations, the layer that makes a studio completely equipped

**Role:** buyer-operations designer (former procurement lead, now product designer). **Date:** 2026-10-05. **Repo:** main @ `4207b8e2d`, main checkout only.
**Evidence rule:** code only, no live portal walk. `DP/` means `apps/designer-portal/src/`. `M/` means `supabase/migrations/`.
**Confidence:** **[H]** I read the cited line this pass. **[M]** I read nearby code, or a research memo's claim that I partly checked. **[L]** inference or practitioner norm, not code.
**Tags:** **UPDATE** extends a table, hook or surface that already exists. **OVERHAUL** adds a new model, or replaces a path that is wrong as built.
**Open rulings, never resolved here:** V1 (margin pocket) and pricing-mechanics R1–R11 (`artifacts/pricing-mechanics-2026-09-05/README.md:38-45`). Each place this memo touches one is marked **ruling needed**.

---

## 0. Summary

The PO itself is good. What a buyer does around the PO has almost no home: who the studio's account with a vendor is, what the vendor quoted, whether the ack matches, whether the CFA is approved, what the studio has paid, where the freight goes and what it cost, what went wrong and how long the studio has to claim it, and the small purchases that never get a PO. This memo proposes eleven modules. Together they let the first hire buy for a job without a side spreadsheet.

Five design rules carry the whole proposal:

1. **Copy the maker lane's nouns, scoped to the studio.** Patina already modeled most of this for itself as merchant of record: `vendor_profiles` (terms, deposit %, lead time, claims and inspection windows, freight), `fulfillment_shipments` (mode, carrier, tracking, ETA history, inspection close), and `fulfillment_exceptions` (type, clock, evidence, resolution) (`M/00350_fulfillment_core.sql:44-66,160-205`) **[H]**. The studio lane should reuse the same words and shapes, keyed to `organization_id`. It should not invent a second vocabulary.
2. **Leave the status ratchet alone and lay exceptions over it.** `project_ffe_items.status` ratchets forward from PO status (`M/00184_procurement_state_chain.sql:108-168`) **[H]**. Backorder, damage and discrepancy are overlays with a clock. They are not new status words.
3. **Internal payable tables are the truth.** Studio-recorded payments go to a studio ledger through an RPC. That RPC refuses any row that the Stripe rail owns (catalog lane).
4. **Put the act where the eye already is.** That means the line unfold, the Orders book and Desk needs. A notice that needs an act becomes a Desk need. The Post stays a quiet record (R82).
5. **Every outbound word is a draft.** Vendor, receiver and client messages are created as studio-owned rows in `awaiting_review`. A studio member clicks Send. Nothing sends on a timer.

---

## 1. Corrections to the research memos (verify before building on them)

| # | Memo claim | What the code says | Conf |
|---|---|---|---|
| C1 | The brief says procurement notifications have zero renderers. | **They do render.** The Post's "Record" page merges `useProcurementNotifications` with the inbox feed (`DP/components/document/overlays/post-sheet.tsx:86-113`). Each row maps through `procurementRecordItem` (`DP/lib/document/post-derivation.ts:279-302`), and the bell's dot reads the unread count (`studio-drawer.tsx`, `mobile-bar.tsx` import `useProcurementUnreadCount`). The real defect is that the rows **cannot be acted on**. `deposit_due`, `balance_due` and `milestone_due` are "plain notices" with no Desk need (`post-derivation.ts:252-261`), and nothing anywhere can clear them (§M5). | H |
| C2 | The notification kinds are complete. | The TS union has 5 kinds (`packages/supabase/src/hooks/use-procurement.ts:1994-1999`). The DB enum has 7, because `payment_received` and `payment_failed` were added in `M/00275_po_payment_stripe_columns.sql:71-72`. The title map falls back to `formatType` (`post-derivation.ts:280`), so these rows render with a raw kind label. | H |
| C3 | R3 says there is "no ack chase." | There is a Desk nudge. `po_unacknowledged` ("Follow up with the maker", stamp NO ACK) rises 1 day after send (`DP/lib/document/desk-derivation.ts:416,1007-1025`). What's missing is a drafted follow-up and any reconciliation. | H |
| C4 | Wire `useUpdateVendorPaymentTerms` as-is (R3 P3). | **Don't.** It updates the **global** `vendors` row (`use-procurement.ts:449-472`). Vendor UPDATE is limited to super_admin/quality_control (`M/00058_tighten_rls_policies.sql:29-41`), so it would silently match zero rows for a designer. If it did work, one studio's terms would leak to every studio. Terms must live on a studio record (§M1). | H |
| C5 | Wire `useLogPaymentPaid` as-is (R3 P3). | **Not as-is.** It does a direct `UPDATE po_payments SET state='paid'` (`use-procurement.ts:602-640`). `po_payments` is `FOR ALL` to any studio co-member (`M/00584_studio_comember_rls_sweep.sql:242-260`). That includes rows on the Stripe catalog rail (`M/00275:39-41`). A member could mark a Stripe-owned payment paid without Stripe, which inverts the "reconcile Stripe toward internal tables" rule. Payment recording needs a lane-guarded RPC (§M5). | H |
| C6 | R5 calls "a ledger is not a dashboard" V9. | It is **V11** (`docs/vision/VISION-DECISIONS.md:226`). V9 is the polish doctrine (`:144`). | H |
| C7 | R3 says the PO-change backend has no caller. | Confirmed. `start_purchase_order_change` (`M/00435_ffe_ga_rpc_boundaries.sql:849-869`, last wrapped in `M/00453`) and `purchase_order_changes` (`M/00434:430-445`) have no caller in `apps/`, `packages/` or `supabase/functions/` outside generated types. | H |

---

## 2. The modules at a glance

| # | Module | Tag | Money-critical? | Builds on |
|---|---|---|---|---|
| M1 | Studio vendor and trade-account record | OVERHAUL | yes (terms, windows) | `studio_contacts` (00417), shape of `vendor_profiles` (00350) |
| M2 | Quote capture | UPDATE | yes (price basis) | `vendor_quote_requests` (00162), bid facts (00631) |
| M3 | Ack reconciliation with discrepancy handling | OVERHAUL | **yes, #1 loss** | `log_po_acknowledgment` (00190), Desk `po_unacknowledged` |
| M4 | CFA / strike-off / submittals, plus the COM pair | OVERHAUL | yes | `custom_commission_milestones` (00403), `com_details` (00413) |
| M5 | Deposits, balances, terms, payments made | OVERHAUL (path) + UPDATE (schema) | **yes** | `po_payments` (00148/00275), crons (00189) |
| M6 | Freight, receiver and warehouse as parties and cost lines | OVERHAUL | yes | `project_parties.receiver` (00281), `fulfillment_shipments` shape |
| M7 | Exceptions: backorder, discontinued, damage windows, substitution | OVERHAUL | yes | `damage_claims` (00150), `purchase_order_changes` (00434/00435), `client_decisions` (00464/00564) |
| M8 | Procurement notifications become acts | UPDATE | indirectly | `procurement_notifications` (00151), Post, Desk needs |
| M9 | Card purchases, one-offs and reimbursables | OVERHAUL (new) | yes (3–8% leakage) | invoice ad-hoc lines (00187) |
| M10 | Samples and memos with return dates | UPDATE-small; the memo library is a side journey | low | M4, M1 |
| M11 | Outbound drafts (`awaiting_review`) | OVERHAUL (new, shared) | guards all sends | `po-send`, `sendCompliantEmail` chokepoint |

Patina-grade maker ordering is **one lane** in every module. When `purchase_orders.is_patina_catalog = true`, Patina is merchant of record. Stripe settles the payment, and freight, claims and exceptions run in `fulfillment_*`. The studio sees those facts read-only on the same line unfold. Every such row is marked **V1 ruling needed** wherever a number could show Patina's cut.

---

## 3. Modules in detail

### M1 · Studio vendor and trade-account record (OVERHAUL)

**Today.**
- `vendors` is global. Any authenticated user may insert, and only admins may update (`M/00058:22-41`) **[H]**.
- Default terms sit on that global row (`M/00148:40-41`). The Order Assistant reads them as "(Vendor default)" (`DP/components/portal/procurement/order-assistant/step-details.tsx:280-284`) **[H]**.
- `designer_vendor_accounts` is keyed `UNIQUE(designer_id, vendor_id)`. It holds account #, tier, rep and YTD (`M/00009_vendor_management.sql:59-77`), and nothing in the apps reads it **[H]**.
- The studio rolodex `studio_contacts` is properly scoped: `organization_id`, a soft `vendor_id` link, writable by active non-guest members (`M/00417_studio_contacts.sql:70-130`) **[H]**.
- The full buyer protocol (deposit %, lead time, claims and inspection windows, freight, change window) exists only for Patina's own vendors in `vendor_profiles` (`M/00350:44-62`) **[H]**.

**Proposal.** Add one row per (studio, vendor): `studio_vendor_accounts`. It is the studio's account with that vendor, so it outlives any one designer. The Vendors page's Terms view (`DP/components/document/orders-book-vendors.tsx`) becomes this record. The Order Assistant prefills from it. The global `vendors` row keeps only shared identity facts: name, website, Patina-catalog flag.

**Data.**
- `studio_vendor_accounts`:
  - Keys and links: `id`, `organization_id` FK, `vendor_id` FK, `studio_contact_id` FK (the company card), `UNIQUE(organization_id, vendor_id)`.
  - Account: `account_status` (reuse the enum `none|pending|active`), `account_number`, `account_opened_on`, `tier_label`, `rep_contact_id` (a person card in `studio_contacts`), `credit_limit_cents`.
  - Terms: `payment_pattern` (reuse `purchase_order_payment_pattern`), `deposit_pct`, `net_days`.
  - How the studio pays them: `payment_method_id` FK → `studio_payment_methods` (M5).
  - Ordering: `transmission` (`email|portal|phone|showroom`), `orders_email_override`, `portal_url`, `lead_time_days`, `quote_validity_days`.
  - Windows (same shape as `vendor_profiles`): `change_window_days`, `claims_window_days`, `inspection_window_days jsonb {parcel, ltl, white_glove}`, `restocking_pct`.
  - Freight: `freight_policy` text, `blind_ship` bool.
  - Resale certificate: `resale_cert_on_file_on` date, `resale_cert_state`.
  - Bookkeeping: `notes`, `archived_at`, timestamps.
- `trade_discount_pct` is **ruling needed (R1, and V1 for catalog vendors)**. Whether a first hire sees the discount is R1. Leave the column out until R1 rules, or gate its read the way R1 decides.
- Backfill: fold any `designer_vendor_accounts` rows into the designer's studio (likely zero rows; check before migrating), then park the table. Copy `vendors.default_payment_terms` into each studio row the first time that studio orders from the vendor. Don't write it back.
- RLS uses the same predicate as `studio_contacts`: active non-guest member of `organization_id`. Writes go through `upsert_studio_vendor_account` (SECURITY DEFINER, audited `updated_by`).
- Vendor pollution: before minting a new global `vendors` row, run the existing website→name resolver (SQL port in `M/00676_board_deck_imports.sql:251-301`) so studios share rows instead of minting duplicates **[H]**.

**Not in scope:** a resale-certificate vault with state-by-state rules. It is legal-gated and the CPA decides (R3 §3.1). Park it as a side journey. The `resale_cert_on_file_on` date above is the only part a buyer needs on the PO path.

**Feature test.** Surface: the Document (Orders book → Vendors → Terms; Order Assistant prefill). Moment: the first hire places her first order with a vendor Leah opened years ago. Stream: subscription floor. Promise: the studio won't notice Patina; the hire stops asking Leah for the account number. **Passes.**

---

### M2 · Quote capture (UPDATE)

**Today.** `vendor_quote_requests` holds free-text `scope / timeline / message`, with status `draft|sent|responded|closed`, no project and no line (`M/00162:32-49`) **[H]**. It is sent from the maker profile through `quote-request-send` **[H]** (route `DP/app/api/vendors/[id]/quote-request/route.ts`). No returned quote is ever recorded **[M]**. The People-room CRM already has the exact date vocabulary for a bid: asked, due, quoted, amount, valid until, selected (`M/00631_project_party_bids.sql:54-62`) **[H]**.

**Proposal.** Link a request to a job and its lines. Record what came back in a form a buyer can enter in under a minute:
- the PDF
- the quote reference
- valid-until
- per-line unit trade price and lead time
- crating and a freight estimate
- terms

The line unfold shows a quiet line: *"quoted $1,840 · good through 30 Oct · Hewn ref Q-2291"*. When the studio orders, the Order Assistant can apply the quoted price to the line.

**Data.**
- `vendor_quote_requests` + `project_id`, `ffe_item_ids uuid[]`, `due_on` (UPDATE).
- `vendor_quotes`: `id`, `organization_id`, `request_id` nullable (a quote can arrive unrequested), `vendor_id`, `project_id`, `received_on`, `quote_ref`, `valid_until`, `crating_cents`, `freight_estimate_cents`, `payment_pattern`, `deposit_pct`, `document_path`, `recorded_by`, `superseded_by`.
- `vendor_quote_lines`: `quote_id`, `ffe_item_id`, `unit_trade_cents`, `qty`, `lead_time_weeks`, `note`.
- RPC `apply_vendor_quote_to_lines(quote_id)` writes `trade_price_cents` through the existing FF&E guard. That guard blocks direct price writes, and no designer price RPC exists today (`packages/supabase/src/hooks/use-project-v2.ts:287-298,329-336` throw "RPC-only") **[H]**. **Ruling needed: R8** (may a quote reprice a line already on a sent authorization?) and **R6** (aging and stale thresholds for "quote expiring"). The client price that follows from a new trade price is **R1/R2** territory. This RPC writes trade cost only and leaves the client price alone.

**Vendor self-entry** (a tokened response form, like the trade RFQ rail in `supabase/functions/trade-rfq-send/index.ts:1-40`) would let a vendor write a price into the studio's record. That goes beyond V10, which allows compliance paperwork only (`VISION-DECISIONS.md:278-296`). **VISION-level ruling needed.** Version 1 is studio-entered.

**Feature test.** Surface: Document line unfold, Vendors page. Moment: a workroom or antique piece whose price isn't fixed. Stream: subscription; protects margin. Promise: a record, not a second marketplace (R4 §2.4). **Passes.**

---

### M3 · Ack reconciliation with discrepancy handling (OVERHAUL)

**Today.**
- `log_po_acknowledgment(p_po_id, p_vendor_po_number, p_confirmed_eta)` records two values and stamps `acknowledged_at` (`M/00190_ack_any_active_status.sql:29-32`) **[H]**.
- The form appears in the Ledger and on the resend paper only, not in the line unfold (R1 §E) **[H via R1]**.
- A Desk nudge exists after 1 day (C3).
- Nothing compares the ack to the PO. Silence on a bad ack counts as acceptance (R3 §3.5), and R3 ranks it as the costliest failure (R3 §6 #1) **[L, practitioner norm]**.

**Proposal.** An ack is a document, received once or several times. Each one is checked line by line against the PO. The check is **deterministic and studio-entered**: the form pre-fills every PO value, and the buyer edits only what differs. Version 1 has no extraction. Each differing field becomes an ack line marked `mismatch`. Any mismatch:
- sets the PO's ack state to `discrepancy`
- opens an `ack_discrepancy` exception (M7)
- creates a drafted reply to the vendor (M11), for example: *"Your ack lists finish 'Walnut 04'; our PO specifies 'Walnut 07 Smoke'. Please confirm 07 Smoke before production."*

The buyer resolves each line in one of three ways:
- **accept the vendor's value.** This writes through to the line via RPC, and a price change triggers **R8 ruling needed** if the line is authorized.
- **dispute.** The draft is sent and the exception stays open.
- **corrected by vendor.** A new ack arrives.

A clean ack closes the nudge.

Placement:
- `LogAckInline` moves into the line unfold.
- The Ledger keeps its band.
- The PO stamp reads *"Acknowledged · 1 difference"* in terracotta until it is resolved.

Production is never blocked. The PO can still move to production. The R9 posture is warn, never block (`artifacts/pricing-mechanics-2026-09-05/source/proposal.md:146`).

**Data.**
- `po_acknowledgments`: `id`, `purchase_order_id`, `received_on`, `received_via` (`email|portal|phone|pdf`), `vendor_order_ref`, `document_path`, `ack_ship_date`, `ack_freight_cents`, `ack_deposit_requested_cents`, `recorded_by`, `supersedes_ack_id`.
- `po_ack_lines`: `ack_id`, `ffe_item_id`, `field` (`unit_price|qty|sku|finish|fabric|dimensions|ship_date|freight|other`), `po_value text`, `ack_value text`, `verdict` (`match|mismatch|accepted|disputed|vendor_corrected`), `resolved_by`, `resolved_at`, `note`.
- `purchase_orders` + `ack_state` (`none|clean|discrepancy|resolved`), derived by trigger from the latest ack. `acknowledged_at` stays as it is.
- RPCs: `log_po_acknowledgment_v2(po_id, ack jsonb, lines jsonb)`, which keeps the v1 signature working; `resolve_ack_line(line_id, verdict, note)`.
- PO values come from the same spec fields `po-send` prints (`supabase/functions/po-send/index.ts:250-262`) **[H via R3]**. The check therefore compares like with like.

**Later:** ack PDF extraction modeled on `project-ffe-document-extract`. If a Designer-Taught Intelligence step proposes values, the Agent OS rule applies: agents write only via `enqueue_agent_task`. `agent_tasks` is readable only in the admin domain (`M/00297_agent_tasks_queue.sql:203-206`), and `review_agent_task` is service_role only (`:607`) **[H]**. A studio member therefore **cannot** review an agent's draft today. **Agent OS ruling needed:** how a studio member reviews an agent-proposed draft. Until that is ruled, extraction stays out.

**Feature test.** Surface: Document line unfold and Ledger. Moment: the first hire buying while Leah designs. Stream: subscription; protects upside. Promise: catches the #1 loss quietly, with one need and no nagging. **Passes.**

---

### M4 · CFA / strike-off / submittals, plus the COM pair (OVERHAUL)

**Today.**
- Zero hits for CFA or strike-off **[H via R3; consistent with my grep]**.
- The nearest gate is `custom_commission_milestones.milestone_type IN ('submittal','receiving','installed')`, which applies only to configured custom pieces (`M/00403_product_configuration_foundation.sql:285-299`) **[H]**.
- COM facts exist only on configurations: `com_details {fabricName, mill, pattern, yardage, railroaded, shipTo, sidemark, secondLeadTimeWeeks}` (`M/00413:45-71`) **[H via R2]**.
- No fabric PO links to a workroom or furniture PO **[H via R3]**.

**Proposal.**
- **Submittals.** A dated approval attached to a line, and optionally to the fabric PO that depends on it. Kinds: CFA, strike-off, shop drawing, finish sample, seat sample. Each has a requested date, a received date, a dye lot, a decision (approve / reject / revise), and the member who decided. A fabric **reserve expiry** shows as the only clock (practitioner norm: 7–14 days, R3 §2.2 **[L]**). For a big-ticket piece the studio can ask the client too, through the existing `client_decisions` rail rather than a new one (M7 explains that rail).
- **The gate.** "Send to vendor" on the fabric PO warns when its CFA isn't approved: *"CFA from Kravet not yet approved — send anyway?"* It warns and never blocks (R9 posture).
- **The COM pair.** COM fields on any upholstered line, using the configuration's `com_details` shape so both paths print alike. A yardage helper turns chart yards, width, repeat and railroading into yards to order, plus overage. The workroom confirms the result; the helper is arithmetic, not a decision. The fabric PO points at the PO it supplies, and its ship-to is the workroom's location (M6). `po-send` prints *"COM arriving separately — mill PO #___"* on the furniture PO. The COM instruction lines already exist (`po-send/lib.ts:498`) **[H via R3]**.

**Data.**
- `po_submittals`: `id`, `organization_id`, `project_id`, `ffe_item_id`, `purchase_order_id` nullable, `kind`, `requested_on`, `received_on`, `dye_lot`, `reserve_expires_on`, `decision` (`pending|approved|rejected|revise`), `decided_by`, `decided_at`, `client_decision_id` nullable, `media_ids`, `note`.
- `project_ffe_specs` + `com_spec jsonb`, the same keys as `com_details`. That table's spec columns are already granted to `authenticated` (`M/00435:984-985`), so this is an additive column with the same grant (UPDATE).
- `purchase_orders` + `supplies_purchase_order_id` (fabric PO → the PO it feeds).
- Generalize, don't fork: when a configured custom piece already has a `submittal` milestone, the line unfold reads it rather than asking twice.

**Feature test.** Surface: Document line unfold. Moment: specifying upholstery or drapery. Stream: subscription. Promise: fewer reorders and no fabric lost at the wrong workroom. **Passes.** The COM fabric's margin treatment is **ruling needed (V1 if routed through the marketplace; R1 for markup visibility)**. Is it marked up like goods or passed through at cost? Not decided here.

---

### M5 · Deposits, balances, terms and recording payments made (OVERHAUL of the path, UPDATE of the schema)

**Today.**
- The schedule exists: `po_payments` (deposit/balance/milestone, `pending|due|paid`, `paid_date` required when paid) (`M/00148:16-35,77-95`) **[H]**.
- The Order Assistant writes it at creation (R1 §C step 3) **[H via R1]**.
- A daily cron flips rows to due and notifies (`M/00189_procurement_crons.sql:7-19`) **[H]**.
- When a deposit is paid, the balance flips to due (`M/00184:333-374`) **[H]**.
- The Stripe rail stamps catalog rows paid (`supabase/functions/stripe-webhook/index.ts:932-1100`) **[H]**.
- **Nothing records a non-catalog payment.** `useLogPaymentPaid` has zero app callers (only `index.ts` and tests) **[H]**, and wiring it as-is is unsafe (C5).
- So the studio gets "Balance due — Hewn Woodworks" in the Post (C1) and can never clear it.

**Proposal.**
1. **Record what we paid** in one inline act on three surfaces: the Ledger row's payment band, the line unfold's Purchase-order cell, and a new Desk need. The act captures date, amount, method, reference, and which studio card. The receipt is optional. Partial payments are allowed.
2. **The record is append-only.** A mistake is voided with a reason, never edited or deleted.
3. **Schedule state is derived.** A `po_payments` row is `paid` when its records sum to its amount. The existing deposit→balance trigger keeps working because it fires on `state='paid'`.
4. **Lane guard.** The RPC refuses any row whose PO is `is_patina_catalog` or that has a Stripe session or intent id. Those settle only through Stripe, and the studio sees them read-only. This makes the internal table the truth for the studio lane, with Stripe reconciled toward it on the catalog lane.
5. **Close the back door.** Revoke direct UPDATE of `state`, `paid_date` and `amount_cents` on `po_payments` from `authenticated`. Writes go through RPCs: `record_vendor_payment`, `void_vendor_payment`, `update_po_payment_schedule`. The schedule RPC is allowed until the first payment is recorded; after that, changes go through M7's change order.
6. **Bill run.** The Ledger's existing `payment · due` lens (`DP/components/document/orders-ledger.tsx:156-233`) **[H]** is the weekly bill run. One front-matter line sits over its rows: *"Due by Friday · $11,420 across 4 orders"*. V11 permits that: a total over the rows that produced it (`VISION-DECISIONS.md:226-236`). No tile, no chart, no red/green.
7. **Fronting.** Each payment record shows, quietly, whether the client has paid for those lines, reusing `get_ffe_invoice_coverage` from the coverage step (`DP/components/portal/procurement/order-assistant/step-coverage.tsx:4-18`) **[H via R3]**. *"Paid Hewn $4,200 · client deposit not yet received"* is a fact, not a block.

**Data.**
- `studio_payment_methods`: `id`, `organization_id`, `label` ("Amex · Leah", "Chase ops"), `kind` (`card|ach|check|wire|cash|other`), `last4` (never a full number), `holder_member_id`, `archived_at`. It is also used by M9.
- `vendor_payments`: `id`, `organization_id`, `purchase_order_id`, `po_payment_id` nullable (unscheduled payments are allowed, for example a restocking fee), `paid_on`, `amount_cents`, `currency_code`, `method`, `payment_method_id`, `reference` (check #, confirmation), `receipt_document_path`, `recorded_by`, `voided_at`, `void_reason`, `created_at`. RLS: read for studio co-members; insert and void only via RPC.
- `po_payments`: state becomes trigger-maintained from `vendor_payments`; keep the column for existing readers.
- Notification addressee: `po-payments-due` inserts for `po.designer_id` only (`M/00189:86-87`) **[H]**, and the studio-owner read policy is inert (`M/00151` policy comment) **[H]**. See M8.

**Ruling needed:**
- **V1**: nothing on this ledger shows or implies Patina's cut. It is studio money only, as in `pricing-mechanics/source/proposal.md:18`.
- **R1**: whether the payment band shows margin. Proposed: it shows trade cost only, which is what the vendor is paid.
- **New, studio-practice ruling**: whether payments above an amount need an owner or admin to record them. R5 §3 shows no internal spend approval exists. If one is added, it must name the System B seat (`organization_members.role`), not System A's unreachable `studio_owner` (R5 §3.1). Not decided here.

**Feature test.** Surface: Document (Ledger, line unfold, Desk). Moment: the weekly bill run, and the deposit the hire pays before the client's invoice is due. Stream: subscription; it is the precondition for honest margin. Promise: internal payable truth, no second system. **Passes.** This is the first thing to build.

---

### M6 · Freight, receiver and warehouse as first-class parties and cost lines (OVERHAUL)

**Today.**
- Ship-to is a hardcoded `"Middlewest Studio · Madison WI"` in the Assistant (`DP/components/portal/procurement/order-assistant/step-review.tsx:30-31,44`) **[H]**.
- `po-send` fills a blank `ship_to` with the **project site address**, which is the client's house, and saves it (`supabase/functions/po-send/index.ts:367-390`) **[H]**.
- `purchase_orders.ship_to` is free text (`M/00188_po_send_columns.sql:35-38`) **[H]**.
- `receiver` exists only as a login-less `project_parties.party_kind` (`M/00281_field_parties.sql:48-53`) **[H]**.
- The studio's own address exists as `organizations.address jsonb` (`M/00021_user_management_foundation.sql:112`) **[H]**.
- The studio PO has `total_cents` only, with no freight, crating, carrier or tracking (`M/00148:50-65`) **[H]**. The maker lane has all of it (`M/00350:116-180`) **[H]**.

**Proposal.**
1. **Locations.** A studio keeps a short list of places goods go: its receiving warehouse (one marked default), its studio, workrooms, storage, and a job site when it's the right call. Each location hangs off a company card in the rolodex, so the receiver is a real party with a phone, hours, dock, and storage terms.
2. **Ship-to per PO.** The Assistant's Review step offers a chooser defaulting to the studio's default receiver. The placeholder goes away. `po-send` **stops** defaulting to the client's house. If no location is chosen, the send preview says *"No ship-to chosen — this PO will print without one"* and asks the buyer to choose. It warns rather than blocks, but it never fills in the house silently.
3. **Freight terms.** Each PO records FOB point, prepaid or collect, and requested ship date.
4. **Cost lines.** Freight, crating, liftgate, residential surcharge, white-glove, receiving, storage, handling and restocking are recorded per PO as an estimate, then an actual. A cost line may be payable to a **different** party than the vendor (the carrier, the receiver). Its payments go through M5 against that payee. Each cost line carries `billable_to_client`, and once billed, the invoice line it went out on.
5. **Shipments.** Mode, carrier, PRO or tracking, BOL document, shipped and delivered dates, and ETA history, in the same shape as `fulfillment_shipments`. Recording "shipped" advances the PO to `shipped`. That fills today's gap, where `useUpdatePurchaseOrderStatus` has zero callers (`use-procurement.ts:770`) **[H]**, through an RPC rather than that raw update. Delivered sets `inspection_closes_at` for M7.
6. **Receiver notice.** When a PO ships, a drafted inbound notice to the receiver lists PO #, sidemark, pieces, carrier and ETA. It goes through M11 and is never auto-sent.

**Data.**
- `studio_locations`: `id`, `organization_id`, `kind` (`receiver|studio|workroom|storage|site`), `studio_contact_id`, `label`, `address jsonb`, `receiving_hours`, `has_dock`, `needs_liftgate`, `storage_free_days`, `storage_rate_cents_month`, `receiving_fee_cents_piece`, `instructions`, `is_default_receiver`, `archived_at`.
- `purchase_orders`:
  - + `ship_to_location_id`. Keep `ship_to` text as the printed snapshot.
  - + `freight_terms` (`prepaid|collect|prepaid_add|fob_origin|fob_destination`).
  - + `requested_ship_on`.
- `po_cost_lines`: `id`, `purchase_order_id`, `kind`, `payee_vendor_id` or `payee_contact_id`, `estimate_cents`, `actual_cents`, `billable_to_client`, `billing_rule`, `invoice_line_id`, `note`.
  - `billing_rule` (at cost vs cost + %) is **ruling needed (R1** for visibility of the add-on; the studio's agreement decides the practice**)**. Proposed: the default is "at cost", and the column exists so the rule can be set per agreement later.
- `po_shipments`: `id`, `purchase_order_id`, `mode` (`parcel|ltl|white_glove|studio_pickup`), `carrier`, `tracking`, `bol_document_path`, `shipped_on`, `delivered_on`, `current_eta`, `eta_history jsonb`, `inspection_closes_at`.
- `po_shipment_lines`: `shipment_id`, `ffe_item_id`, `qty`. This handles partial shipments.
- The Week (`DP/components/document/orders-book-week.tsx`) reads `po_shipments.current_eta` when present, falling back to `confirmed_eta`.

**Maker lane:** `fulfillment_shipments` already carries all of this. The line unfold renders it read-only. Any freight figure that would reveal Patina's freight margin (`freight_charged_cents` vs `freight_cost_cents`, `M/00350:81,134`) is **V1 ruling needed** before it is shown to a studio.

**Feature test.** Surface: Document (Assistant, line unfold, Week). Moment: every PO, and delivery day. Stream: subscription, plus the upside stream when freight is billed through. Promise: no hidden fees, from studio to client too. **Passes.** The ship-to fix ships in the first wave.

---

### M7 · Exceptions: backorder, discontinued, damage claim windows, substitution with client re-approval (OVERHAUL)

**Today.**
- Damage claims: `drafted → vendor_notified → resolved` on an inspection (`M/00150_receiving_and_damage_claims.sql:13,61-75`) **[H]**. They can be acted on from the line unfold and from Receiving (R1 §G).
- No clock. Receiving's "30-day window" is a stats window (R3 §3.9) **[H via R3]**.
- Backorder or discontinued is only `is_blocked` + reason **[M]**.
- PO changes (cancel, credit, vendor change, remedy, claim, new scope) exist in the DB with a snapshot and a rebuild rule, but nothing calls them (C7).
- Client decisions with options, receipts and supersede lineage exist and power client approvals (`M/00464_project_approval_lifecycle.sql:1-60`, `M/00564_client_signoff_approval.sql:1-40`) **[M]**. Alternates exist as `design_disposition = 'alternate'` (`M/00434`) **[M via R2]**.

**Proposal.** One exception overlay per problem, shaped like `fulfillment_exceptions` (`M/00350:187-205`). Each exception has a type, a subject (line / PO / shipment / inspection), a status, and a **clock** with a plain-words basis. Version 1 types:

| Type | Opens when | Clock | Resolution paths | Reuses |
|---|---|---|---|---|
| `concealed_damage` / `damage` | inspection outcome `damaged` | `inspection_closes_at` = delivered + the vendor account's inspection window for that mode (fallback: studio default). Basis printed: *"Hewn wants written notice within 3 days of delivery."* | repair, replace (new linked PO), credit, accept | `damage_claims` (+ `exception_id`), M6 shipments |
| `short_ship` / `wrong_item` | inspection `partial`, or the buyer flags it | vendor notice window | reship, credit, accept | `record_project_ffe_receipt_batch` |
| `ack_discrepancy` | M3 mismatch | studio default 2 business days to answer the vendor | accept, dispute, vendor corrected | M3 |
| `delay` | ETA moved later than the requested ship or install date | none (informational) | accept and draft client note | M6 `eta_history` |
| `backorder` | vendor reports a new date beyond tolerance | the order-by date for install, if a schedule exists | wait, substitute, cancel | M6 |
| `discontinued` | vendor reports it | none | substitute, cancel with refund or credit | `start_purchase_order_change` |
| `price_change` | M2 or M3 shows a higher price after authorization | none | accept (**R8**), substitute, cancel | M3 |

Clock values are practitioner norms, not law. Vendors commonly want 48–72 h, and carriers about 5 days for concealed damage (R3 §3.9) **[L]**. The studio sets its own per vendor in M1. The clock is a date printed beside the exception, not a countdown.

**Substitution with client re-approval.** This is the one chain that crosses to the client.
1. The buyer picks alternates. They become `alternate` lines.
2. Patina composes a `client_decisions` row with options: the original (marked unavailable) and each alternate at its client price. It travels the existing selection rail. Composing it is a draft (M11); the studio releases it.
3. When the client chooses, `start_purchase_order_change` runs (kind `vendor_change` or `cancellation`, plus `credit` when a deposit was paid). It rebuilds when the PO is unsent and unpaid; otherwise it records an immutable follow-up (`M/00435:861-869`). The replacement PO uses the repricing guard in `M/00456_ffe_replacement_po_repricing.sql`.
4. The old deposit becomes a credit or refund, recorded in M5 as a negative `vendor_payments` row (`kind refund|credit`), never as an edit.

Rulings needed:
- **R5** (an alternate priced below trade)
- **R8** (a change after a signed authorization means a change order)
- **R7** (what the client sees about dates in the note)

**Data.**
- `procurement_exceptions`:
  - Subject and kind: `id`, `organization_id`, `project_id`, `type`, `ffe_item_id`, `purchase_order_id`, `shipment_id`, `inspection_id`, `damage_claim_id`.
  - Lifecycle: `status` (`open|awaiting_vendor|awaiting_client|resolved`), `opened_at`, `opened_by`.
  - Clock: `clock_due_at`, `clock_basis text`.
  - Evidence and outcome: `evidence_media_ids`, `resolution_path`, `po_change_id` → `purchase_order_changes`, `client_decision_id` → `client_decisions`, `replacement_purchase_order_id`, `resolved_at`, `note`.
- `damage_claims` + `exception_id`. The table keeps its state machine and gains the clock through the exception.
- RPCs: `open_procurement_exception`, `resolve_procurement_exception`, `request_substitution_approval(item_id, alternate_ids[])`. The last one composes the decision draft; `start_purchase_order_change` is reused as-is.
- Photos: desktop upload stays as built today (R1 §G). Making iOS photos openable on the web is a dependency for claim evidence (`orders-book-receiving.tsx:33-49` names the media route) **[H via R1]**.

**Maker lane:** `fulfillment_exceptions` is Patina's own and stays that way. The studio sees a read-only line, *"Damage · Patina is handling it with the maker"*. Any financial outcome there is **V1 ruling needed** before it is shown.

**Feature test.** Surface: Document line unfold, Receiving, Desk. Moment: delivery day, and the backorder call. Stream: subscription; protects upside. Promise: the client agrees to one direction (substitutions re-approved), and the studio gets one dated need. **Passes.**

---

### M8 · Procurement notifications become acts (UPDATE)

**Today.** The rows render in the Post's Record (C1). Only `damage_claim_drafted` maps to a Desk need (`post-derivation.ts:256-261`). The TS union is stale (C2). Rows go only to `po.designer_id` (`M/00189:86-87`). The studio-owner read policy is inert by its own comment (`M/00151`, "INERT because the predicate joins through projects.designer_id") **[H]**.

**Proposal.** Keep the Post a quiet record. Every procurement notice whose subject has an act becomes a Desk need, and the Post shows it as the existing cross-reference (R82). The rule: **a notice may exist only if an act exists for it, and the act lives on the Desk or the line.** No counts: the bell keeps its dot (D8), and needs carry dates, never numbers of unread items.

| Notice kind (enum) | Desk need (new `NeedKind`) | Act label | Clears when |
|---|---|---|---|
| `deposit_due`, `balance_due`, `milestone_due` (exists) | `payment_due` | "Record payment" | M5 record covers the row |
| `payment_received`, `payment_failed` (exists, catalog) | none / `payment_failed` → "Pay again" | (catalog Pay-now) | Stripe settles |
| `delivery_this_week` (exists) | none (plain notice; the Week holds it) | — | — |
| `damage_claim_drafted` (exists) | `damage_claim` (exists) | (exists) | (exists) |
| new `claim_window_closing` | `claim_window` | "Notify the vendor" | claim notified or exception resolved |
| new `ack_discrepancy` | `ack_discrepancy` | "Answer the vendor" | all ack lines resolved |
| new `quote_expiring` | `quote_expiring` (**R6 ruling** sets thresholds) | "Reconfirm the price" | new quote or ordered |
| new `cfa_reserve_expiring` | `cfa_pending` | "Approve the CFA" | decision recorded |
| new `memo_return_due` | `memo_return` | "Mark returned" | returned_on set |
| new `backorder_reported` | `exception_open` | "Choose a path" | exception resolved |

**Data.**
- `ALTER TYPE procurement_notification_kind ADD VALUE` ×6.
- Fix the TS union and the title map.
- Add `procurement_notifications.organization_id` and a subject column for the new kinds (`subject_exception_id`, `subject_submittal_id`, `subject_sample_id`).
- Addressee: the PO's creator **and** the project lead, deduped. Studio-wide visibility comes from the Desk, which already derives per project, not from fanning notices out to everyone.
- Replace the inert studio-owner policy with an `is_studio_comember` read policy, the 00584 sweep pattern.
- Crons (pg_cron, run history in `job_runs`): `procurement-clocks-daily` scans exception clocks, quote validity, CFA reserves and memo returns. It inserts deduped rows, using the `NOT EXISTS` idiom from `M/00189`. It stays pure SQL and calls no edge function.

**Feature test.** Surface: Desk and Post. Moment: Monday morning. Stream: subscription. Promise: **never optimize the studio surface for engagement.** Every notice has an act and every act clears. No streaks, counts or badges (V11). **Passes, on that condition.**

---

### M9 · Card purchases, one-offs and reimbursables (OVERHAUL, new)

**Today.**
- No card, reimbursable or one-off model (`grep` of `M/`: zero hits for `reimburs`, `card_last4`, `warehouse`; the "memo" hits are invoice memo text) **[H]**.
- A flea-market piece needs a made-up global vendor row to get a PO, because `purchase_orders.vendor_id` is `NOT NULL` (`M/00148:54`) and PO lines must match it (`M/00435:894`) **[H via R2]**.
- Reimbursables can only be typed in as ad-hoc invoice lines with no cost record (`M/00187` kind `adhoc`) **[M via R3]**.

**Proposal.** A **purchase** is a lighter record than a PO. Use it for anything bought on the spot or on a card:
- retail on the studio card
- an antique or auction piece (buyer's premium, non-returnable)
- a one-off from someone who is not a vendor
- a studio-paid expense to pass through: courier, permit runner, printing, mileage, sample fees

The payee is just a name. Linking it to a rolodex card or vendor is optional, so there is **no forced vendor record**. The receipt is a photo; iOS Field can capture it later as a door into the same record (V11 companion ruling: Field is the Document off-desk). If the purchase is a line item, recording it moves that line to `ordered` through an RPC, which honors the FF&E guard, and the line unfold shows *"Bought on Amex · Leah · 3 Oct · returnable until 2 Nov"*. A return-by date raises a Desk need 3 days before it lapses, only if the item is not yet received or installed. A member's personal card creates a "reimburse Maya $86" record. Patina records it; it does not pay people.

**Billing.** The invoice composer gets *"Bill N unbilled purchases"* beside today's *"Bill N uninvoiced"* (`ffe-section.tsx:1238-1252`, R1 §I) **[H via R1]**. Each billed purchase links its receipt and stamps `invoice_line_id`, so nothing is billed twice. Which rule applies is the agreement's call, not this module's. Rulings needed:
- **R1** (whether the client sees cost + % as a markup)
- **L5 tax** (taxability per line; CPA decides; note only)

**Data.**
- `studio_purchases`:
  - Subject: `id`, `organization_id`, `project_id` nullable (studio overhead allowed), `ffe_item_id` nullable, `kind` (`card_retail|one_off|antique_auction|expense|sample_fee`).
  - Payee and when: `payee_name`, `vendor_id` nullable, `studio_contact_id` nullable, `purchased_on`.
  - Money: `amount_cents`, `tax_cents`, `buyer_premium_cents`, `shipping_cents`, `currency_code`.
  - Who paid: `payment_method_id` → `studio_payment_methods`, `paid_by_member_id`, `reimburse_member` bool.
  - Receipt and return: `receipt_document_path`, `returnable`, `return_by`, `returned_on`.
  - Billing: `billable_to_client`, `billing_rule`, `invoice_line_id`.
  - Lifecycle: `status` (`recorded|billed|returned|void`), `recorded_by`, `void_reason`.
- RPCs: `record_studio_purchase` (when `ffe_item_id` is set, it advances the line to `ordered` under the guard and sets `vendor_name` from `payee_name`) and `void_studio_purchase`.
- A purchase never creates `po_payments`. It is already paid when recorded; that is the point of it.

**Feature test.** Surface: Document line unfold, add-a-line, invoice composer. Moment: the flea-market find and the retail run. Stream: subscription, plus upside through billed pass-throughs. Promise: the studio buys everything in one place, and nothing paid goes unbilled. **Passes.**

---

### M10 · Samples and memos with return dates (UPDATE-small; library parked)

**Today.** No table **[H via R2/R3]**.

**Proposal.** Record a memo or sample request, optionally against a line or vendor, with a **return-by** date. Raise one Desk need before the vendor bills for an unreturned memo. CFAs are not here; they are M4 submittals, because they gate an order. A loaner rug is a sample with a return-by date.

**Data.** `sample_requests`: `id`, `organization_id`, `project_id` nullable, `ffe_item_id` nullable, `vendor_id`/`studio_contact_id`, `kind` (`memo|finish_chip|loaner|other`), `description`, `requested_on`, `received_on`, `return_by`, `returned_on`, `return_tracking`, `fee_cents`, `billable_to_client`, `status`.

**Feature test.** Surface: Document line unfold and Vendors page. Moment: narrowing a fabric before sign-off. Stream: subscription floor. Promise: one quiet return-by need. **The record and the return-by need pass.** A browsable **memo library**, sample-box ordering à la Material Bank (R4 §2.7) and a sample shelf inventory **do not pass**: they map to no money-losing first-hire moment. Log them in `VISION-DECISIONS.md` as a side journey and park them.

---

### M11 · Outbound drafts in `awaiting_review` (OVERHAUL, shared by M3/M6/M7/M10)

**Today.** Studio-to-vendor sends exist only as explicit clicks: `po-send` (`PoPreview`'s "Send to vendor" or "mark as sent", R1 §D), `quote-request-send`, `trade-rfq-send` (the latter uses the `sendCompliantEmail` chokepoint, `trade-rfq-send/index.ts:1-40`) **[H]**. There is no studio-side draft store. The Agent OS queue is Patina-internal and not reviewable by a studio (§M3) **[H]**.

**Proposal.** One studio-scoped table of drafts. The system composes rows **deterministically**, from SQL templates in a pg_cron job or an RPC. They land `awaiting_review`. The Desk need or the line unfold shows the draft with the recipient visible. A studio member edits it if wanted, then clicks Send. One send function (`procurement-draft-send`) re-checks co-membership as the caller and sends through `sendCompliantEmail`. Version 1 draft kinds:
- ack discrepancy reply
- ack chase (only when the buyer asks)
- receiver inbound notice
- vendor claim notice
- client delay note (**R7 ruling** on wording)
- client substitution note
- memo return note

**Data.** `procurement_drafts`: `id`, `organization_id`, `project_id`, `kind`, subject ids (`purchase_order_id`, `exception_id`, `shipment_id`, `sample_id`), `to_contact_id`, `to_email` snapshot, `subject`, `body`, `status` (`awaiting_review|sent|discarded`), `composed_by` (`system` or member id), `sent_by`, `sent_at`, `message_id`. RLS: studio co-members read and edit; status moves only through the send and discard RPCs.

**Rule check:**
- No automated external sends: met, because nothing leaves without a member's click.
- Agents write only via `enqueue_agent_task`: met in version 1, because there is no agent in the loop.
- Studio review of agent output: **Agent OS ruling needed** before any Designer-Taught Intelligence composes drafts (§M3).

**Feature test.** Infrastructure behind M3, M6, M7 and M10; it passes on theirs.

---

## 4. Data model, all in one place

**New tables (13).** All are additive, all have RLS on, and all are scoped by `organization_id` with the `is_studio_comember` / studio-member predicate. Writes go through SECURITY DEFINER RPCs where money or line status moves.

| Table | Module | Key relationships |
|---|---|---|
| `studio_vendor_accounts` | M1 | org × vendor, → `studio_contacts`, → `studio_payment_methods` |
| `studio_payment_methods` | M5/M9 | org; `last4` only |
| `studio_locations` | M6 | org, → `studio_contacts` |
| `vendor_quotes`, `vendor_quote_lines` | M2 | → `vendor_quote_requests`, → `project_ffe_items` |
| `po_acknowledgments`, `po_ack_lines` | M3 | → `purchase_orders`, → `project_ffe_items` |
| `po_submittals` | M4 | → item, → fabric PO, → `client_decisions` |
| `vendor_payments` | M5 | → `po_payments` (nullable), → `purchase_orders`; append-only |
| `po_cost_lines` | M6 | → PO, payee vendor/contact, → invoice line |
| `po_shipments`, `po_shipment_lines` | M6 | → PO, → items |
| `procurement_exceptions` | M7 | → item / PO / shipment / inspection / claim / `purchase_order_changes` / `client_decisions` |
| `studio_purchases` | M9 | → item (nullable), → payment method, → invoice line |
| `sample_requests` | M10 | → item / vendor (nullable) |
| `procurement_drafts` | M11 | → subjects; status via RPC |

**Altered (UPDATE).**
- `purchase_orders`: + `ship_to_location_id`, `freight_terms`, `requested_ship_on`, `ack_state`, `supplies_purchase_order_id`.
- `vendor_quote_requests`: + `project_id`, `ffe_item_ids`, `due_on`.
- `po_payments`: state maintained from `vendor_payments`; revoke direct writes to `state` / `paid_date` / `amount_cents`.
- `project_ffe_specs`: + `com_spec jsonb`.
- `damage_claims`: + `exception_id`.
- `procurement_notifications`: + `organization_id` and new subject columns; the kind enum gains 6 values.
- The inert studio-owner policy is replaced.

**RPCs:**
- vendor accounts and quotes: `upsert_studio_vendor_account`, `record_vendor_quote`, `apply_vendor_quote_to_lines`
- acks: `log_po_acknowledgment_v2`, `resolve_ack_line`
- submittals: `record_submittal`, `decide_submittal`
- payments: `record_vendor_payment`, `void_vendor_payment`, `update_po_payment_schedule`
- PO logistics: `set_po_ship_to`, `upsert_po_cost_line`, `record_po_shipment` (advances PO status)
- exceptions: `open_procurement_exception`, `resolve_procurement_exception`, `request_substitution_approval`
- purchases and samples: `record_studio_purchase`, `void_studio_purchase`, `record_sample_request`, `mark_sample_returned`
- drafts: `discard_procurement_draft`

Plus one edge function, `procurement-draft-send`.

**Crons:** extend `po-payments-due-daily` (M5) and add `procurement-clocks-daily` (M8). Both are pure SQL and log to `job_runs`.

**Generated types and hooks:** each table gets a module in `@patina/supabase`. Domain types go in `@patina/types` (camelCase, hand-authored), never redefined in the portal.

---

## 5. Sequencing (ordered by money at risk per unit of build)

| Wave | Ships | Why first | Size |
|---|---|---|---|
| **A** | M5 record payment (RPC, lane guard, revoke direct writes, Desk `payment_due`); M6 part 1 (`studio_locations`, ship-to chooser, `po-send` stops defaulting to the client house); M1 (the account record and Assistant prefill); M8 kind-union fix | Clears notices nobody can clear today, and removes Middlewest's address from every other studio's paperwork | M |
| **B** | M3 ack reconciliation; M7 (exceptions, claim clock, damage linkage); M11 drafts table and send fn; M8 new needs and cron | The #1 and #4 failure moments (R3 §6) | L |
| **C** | M6 part 2 (cost lines, shipments, receiver notice, status advance); M9 purchases and reimbursables; M2 quotes | Freight and pass-through leakage; off-catalog buying | L |
| **D** | M4 submittals and the COM pair; M7 substitution chain (after R5/R8 rule); M10 sample return-by | Depends on rulings and the client-decision composition | M |

Each wave must pass the gates named in the `patina-verification` skill for what it touches: the SQL tests for each RPC, `pnpm --filter designer-portal type-check` and the tests, and the admin-portal build if shared types change. Turbo silently skips workspaces without a script, so name the filter explicitly.

---

## 6. Feature test roll-up

| Module | Surface | Studio moment | Stream | Promise | Verdict |
|---|---|---|---|---|---|
| M1 | Document: Vendors · Assistant | First hire, first order with an old vendor | Floor | Won't notice Patina | Build |
| M2 | Document: line · Vendors | Unfixed-price piece | Floor; protects upside | Record, not marketplace | Build (C) |
| M3 | Document: line · Ledger | Hire buying while Leah designs | Floor; protects upside | One quiet need | Build (B) |
| M4 | Document: line | Specifying upholstery | Floor | Fewer reorders | Build (D) |
| M5 | Document: Ledger · line · Desk | Weekly bill run | Floor; precondition for upside | Internal payable truth | **Build first** |
| M6 | Document: Assistant · line · Week | Every PO; delivery day | Floor + upside | No hidden fees | Build (A/C) |
| M7 | Document: line · Receiving · Desk | Delivery day; backorder call | Floor; protects upside | One agreed direction | Build (B/D) |
| M8 | Desk · Post | Monday morning | Floor | No engagement optimization | Build (A/B) |
| M9 | Document: line · composer | Flea market; retail run | Floor + upside | Buy everything in one place | Build (C) |
| M10 | Document: line · Vendors | Narrowing a fabric | Floor | One quiet need | Return-by only; **library parked** |
| M11 | (infrastructure) | — | — | No automated external sends | Build (B) |

**Refused by rule, so don't propose them:**
- a vendor reliability score or ranking
- a studio spend dashboard
- an "on-time %" per vendor
- a per-member orders count

All four fail V11 (`VISION-DECISIONS.md:226-236`). The one permitted total is front matter over its own rows (M5 bill run).

---

## 7. Rulings this memo touches (not resolved)

| Ruling | Where | Question left open |
|---|---|---|
| **V1** margin pocket | M5, M6, M7, M9 maker lane; M4 COM | Nothing studio-facing may show Patina's cut (maker freight margin, fulfillment financial outcomes, catalog discount) until V1 rules |
| **R1** who sees margin | M1 `trade_discount_pct`; M5 payment band; M6 cost-line billing rule; M9 billing rule | Whether a first hire sees the discount, or cost + % |
| **R5** client price below trade | M7 substitution | An alternate cheaper than trade |
| **R6** price-age thresholds | M2, M8 `quote_expiring` | Days before a quote reads "aging" or "stale" |
| **R7** the client and dates | M7, M11 client notes | What a delay or substitution note may say about dates |
| **R8** post-sale edits | M2 apply quote; M3 accept a vendor price; M7 substitution | Editing an authorized line means void-and-supersede or a change order |
| **R9** the floor (posture) | M3, M4, M6 | This memo holds "warn, never block" everywhere; if R9 rules otherwise, revisit the gates |
| **V10** extension (VISION) | M2, M3 | A vendor writing a quote or ack through a tokened link goes beyond compliance paperwork |
| **Agent OS** studio review | M3, M11 | How a studio member reviews an agent-proposed draft (`agent_tasks` is admin-only today) |
| **New · studio practice** | M5 | Whether recording or committing spend above an amount needs an owner/admin (System B seat) |
| **R-DI4** (deck price basis) | M2 | Deck-imported lines carry no trade price until confirmed; a quote is the natural place to confirm it |
| **Tax** (CPA, not a product ruling) | M9, M6 | Per-line taxability of freight, reimbursables and fees; Patina holds facts and does not decide law |

---

## 8. What I did not verify

- Whether any `designer_vendor_accounts` or `vendor_quote_requests` rows exist in Strata (data, not code), which affects backfill size.
- The full `create_purchase_order` live body after `00449`, beyond `00186:165-168` setting `designer_id`. The claim that notices reach only the PO creator rests on `00189:86-87` **[M]**.
- iOS Field's receiving writes and whether it sets `installed`. That stays R3's open item; M6's shipment RPC covers `shipped` only.
- The `client_decisions` composition path for a studio-initiated selection (M7 step 2). I read the migration headers (`00464`, `00564`) but not the full `apply_client_decision` body **[M]**.
- How invoice ad-hoc lines carry a source link for M9 billing (`00187`) **[M via R3]**.
- Practitioner windows (claims 48–72 h, carrier ~5 days, fabric reserve 7–14 days) are norms, not code, and need checking per vendor and carrier **[L]**.
