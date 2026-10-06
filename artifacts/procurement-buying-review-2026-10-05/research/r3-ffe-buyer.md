# R3 — How a growing studio actually buys for a job, and what "completely equipped" means

**Role:** senior FF&E buyer / procurement lead (residential studios). **Date:** 2026-10-05. **Repo state:** main @ 4207b8e2d.
**Evidence rule:** code only, no live portal walk. Paths are repo-relative. `DP/` = `apps/designer-portal/src/`.
**Confidence:** **[H]** I read the code line myself. **[M]** I read nearby code or a seed-brief claim I partly checked. **[L]** inferred or seed-brief only. "verify" = the R1/R2 memos or a walk should confirm it.
**Open rulings, not resolved here:** V1 (the margin pocket: maker trade discount vs studio markup) and pricing-mechanics R1–R11 (`artifacts/pricing-mechanics-2026-09-05/README.md:40-45`). Each one this memo touches is tagged **ruling needed**.

Skills used: concierge-order-playbook (stage checklists, freight table, damage subflow), trade-paperwork-prep (trade-account checklist), vendor-qualification-rubric (vendor facts a buyer needs on file).

---

## 1. The short version

A studio buys in eight lanes, not one. Today Patina handles one lane well: a to-the-trade catalog item from a vendor already on file, ordered on a per-vendor PO, sent by email, received and invoiced to the client at the client price. The Patina maker lane (merchant of record) is the most complete lane underneath, at least in the backend. The other six lanes have no model: workroom/COM, antiques and one-offs, retail on a card, samples and memos, freight and receiving as costs, and reimbursables. Inside the main lane, the money-losing steps are the ones with no surface:
- reconciling the acknowledgment against the PO
- choosing a real ship-to
- recording what the studio paid the vendor
- watching claim deadlines
- re-approving substitutions with the client

Several of these already have tables and RPCs that no UI calls. Score: **142 / 348 weighted (41%)** on the 48-capability checklist in §5.

---

## 2. How a growing residential studio actually buys

These are practitioner norms, not code claims. A two-to-eight-person studio running 6–15 live jobs places 40–300 line items per job across 15–60 vendors. The principal designs. The first hire (a design assistant or project coordinator) does most of the buying. That person is the "first hands" in VISION.md. The buying job is clerical, deadline-driven and unforgiving: a single missed number costs real money.

### 2.1 The eight lanes

| Lane | What it is | How it's bought | What makes it different |
|---|---|---|---|
| **1. Trade vendor, catalog item** | Upholstery, case goods and lighting from a to-the-trade showroom or manufacturer | Quote/pro-forma, then PO, then acknowledgment, deposit, balance before ship | Trade discount off list, sidemark, lead time 6–16 wks |
| **2. Patina maker (marketplace)** | Patina is merchant of record and checkout runs through Stripe | Studio checks out, Patina POs the maker | Patina owns freight, claims and the ledger. **V1 margin pocket: ruling needed** |
| **3. Workroom / COM custom** | Upholstery in customer's own material, drapery, reupholstery, custom millwork | Two linked purchases: fabric from a mill, plus labor and frame from the workroom | Yardage math, CFA/strike-off, the fabric must ship to the right workroom |
| **4. Antiques, vintage, one-offs** | Dealer, 1stDibs, auction, estate sale, flea market | Pay on the spot or by invoice, usually non-returnable | No catalog, often no vendor PO, buyer's premium, studio arranges its own shipping |
| **5. Retail on a card** | RH, CB2, Amazon, local retail, with trade discount at checkout or none | Paid on the studio card, sometimes shipped direct to the client | No PO, the receipt is the record, return windows of 30 days or less |
| **6. Samples and memos** | Fabric memos, finish chips, CFAs, loaner rugs | Free or a small fee, some must be returned by a due date | Unreturned memos get billed. They feed approvals, not the client invoice |
| **7. Services that move goods** | LTL freight, white-glove, receiving warehouse, storage, installers | Separate vendors with their own invoices | These costs are real and easy to forget to bill |
| **8. Reimbursables** | Freight, receiving, storage, printing, mileage, sample fees, permit runners | Paid by the studio and passed through at cost or cost + % | Billed only when someone remembers to record them |

### 2.2 The cycle for one line item (lane 1, the backbone)

1. **Trade account open.** The studio has an account number with the vendor, a resale certificate on file (state-specific), payment terms (CC on file, 50/50, net-30 after credit approval) and a rep.
2. **Spec.** Exact SKU, finish code, fabric/grade or COM, dimensions, quantity and options (nailhead, welt, leg finish). Wrong finish codes are the #1 source of wrong product.
3. **Quote / pro-forma.** For anything non-trivial, the vendor quotes price, crating, freight estimate, lead time and quote validity (often 30 days; fabric reserves often 7–14 days).
4. **Client approval and funding.** The client approves the item at its client price, and usually pays a deposit or the full product cost before the studio commits its own money. Cardinal rule: **never spend the studio's money ahead of the client's.**
5. **PO.** One PO per vendor per job. The PO carries the PO number, sidemark (client last name / room / item tag), ship-to (almost always the receiving warehouse, not the house), bill-to, the line specs, quantities, unit trade price, freight terms (FOB point, prepaid/collect), requested ship date and special instructions (blind ship, call before delivery, COM arriving separately).
6. **Acknowledgment.** The vendor returns an ack with their order number. **The buyer must reconcile the ack line by line against the PO**: price, finish, fabric, qty, dimensions, freight and ship date. Most expensive mistakes are caught or missed right here. Silence on a bad ack is acceptance.
7. **Deposit, then production.** The studio pays the deposit (CC, ACH or check) and records it. The vendor confirms a production slot. Updates arrive by email.
8. **Balance before ship.** Most vendors hold goods until the balance is paid. A forgotten balance ships nothing and blows the install date.
9. **Freight.** Goods ship LTL to the receiver (or parcel if small). White-glove or the receiver's own truck does the final mile. Tracking and BOL go in the file.
10. **Receiving and inspection.** The receiver unpacks, inspects and photographs, notes damage on the BOL at delivery, and reports to the studio within a day or two. Concealed damage has short windows (§3.9).
11. **Claim, repair or replace** if damaged. If a replacement is needed, it is a new order linked to the old one, often at a new price or lead time.
12. **Storage** until install. Receivers charge monthly storage after a free period.
13. **Install day.** The receiver delivers everything on one truck, or the installer places it. The studio marks each item installed and builds a punch list.
14. **Punch and close-out.** Punch items get fixed. The client gets the final invoice (balance of product, freight, reimbursables, design fee). Care and warranty info goes in the binder. Claims close. The job P&L is reviewed.

---

## 3. What "completely equipped" means, phase by phase

### 3.1 Trade accounts and resale certificates
- **Good:** a studio-level (not personal) trade account per vendor: account #, discount tier, rep, terms, CC on file, credit limit. Plus a resale certificate per state, with an expiry, and a record of which vendors have it on file. The new hire can see this without asking the principal.
- **Patina:** `designer_vendor_accounts` exists but is keyed to the designer, not the studio (00009). No portal code reads it; only `packages/supabase/src/database.types.ts` references it **[H]**. The Vendors page shows only `default_payment_terms`, or "No terms on file" (`DP/components/document/orders-book-vendors.tsx:561-570`) **[H]**. The studio compliance document store holds paper the studio collects from others (COI, W-9, license, bond; `supabase/migrations/00623_studio_compliance_documents.sql:166-167`), not the studio's own resale certificate sent to vendors **[M]**.
- **Sales tax note (not legal advice):** a resale certificate lets the studio buy tax-free for resale. The studio then usually owes tax collection on the resale to the client in states where it has nexus. Taxability of design fees, freight and installation differs by state, and drop-shipping to another state changes sourcing. The studio's CPA decides. Software should hold the certificate and allow per-line taxability. It should not decide the law.

### 3.2 Quotes and pro-formas
- **Good:** a quote request goes out tied to the job and the lines. The returned quote (PDF plus key numbers: price, freight/crating, lead time, valid-until) attaches to the line, and the line warns when the quote is about to lapse.
- **Patina:** `vendor_quote_requests` holds free-text `scope/timeline/message` with status draft/sent/responded/closed. It has no project, no line and no returned-quote fields (`supabase/migrations/00162_designer_portal_backlog_schema.sql:31-49`) **[H]**. It is sent from the maker profile (`DP/components/document/people/profile/maker-profile.tsx:86-102`) **[H]**. No quote-received record was found **[M, verify]**. Price age and validity on studio lines: **R6 ruling needed**.

### 3.3 Specs and sidemarks
- **Good:** the PO line prints exactly what the vendor builds: SKU, finish code, fabric and grade or COM, dimensions and options. The sidemark is consistent across PO, ack, BOL and receiver tag.
- **Patina, strong here:** `po-send` reads `sku, material, finish, color_fabric, selected_dimensions` from the spec row (`supabase/functions/po-send/index.ts:250-262`) and prints COM instruction lines (`supabase/functions/po-send/lib.ts:498`) **[H]**. The sidemark is generated and persisted when blank (`po-send/index.ts:367-380`; generator `lib.ts:132-170`) **[H]**.
- **Gaps:** the seed brief says placement does not copy SKU, finish or dims onto the line, and that no designer surface edits them (intake brief §1, §3) **[L, verify]**. If true, the PDF prints those fields blank on most lines.

### 3.4 The PO
- **Good:** one PO per vendor per job, numbered, with a real ship-to (warehouse / site / workroom, chosen per PO), freight terms, requested ship date, and revisions that are versioned rather than silently overwritten.
- **Patina:**
  - Creation is solid: the `create_purchase_order` RPC takes payment pattern, deposit and milestones (`supabase/migrations/00186_create_purchase_order_rpc.sql:79-90`). PO lines must be active `selected` lines of that vendor (`00449_ffe_final_direct_probe_fixes.sql:125-133`). PO numbering is in `po_counters` (`00188_po_send_columns.sql:71`) **[H]**.
  - **Ship-to is the hole.** The Order Assistant shows and copies a hardcoded `"Middlewest Studio · Madison WI"` (`DP/components/portal/procurement/order-assistant/step-review.tsx:31,44,133`) **[H]**. `po-send` then fills a blank `ship_to` with the **project site address**, i.e. the client's house (`po-send/index.ts:380-384`) **[H]**. No designer input sets `ship_to` **[M]**. In residential practice, LTL freight going to the client's house is a classic expensive mistake (§6, #3).
  - **Revisions:** a full PO change model exists in the DB: `start_purchase_order_change`, with kinds `vendor_change|cancellation|credit|claim|remedy|new_scope`, prior snapshot, and rebuild if not yet sent or paid (`00435_ffe_ga_rpc_boundaries.sql:849-869`). A replacement-PO repricing guard is in `00456_ffe_replacement_po_repricing.sql:5-23`. **Nothing outside generated types calls it** **[H]**.

### 3.5 Acknowledgment reconciliation
- **Good:** the ack is attached and each line is compared: unit price, finish/fabric, qty, dims, freight, ship date. Differences are flagged and resolved, and the vendor is told in writing within 24–48 h. Also needed: a chase when no ack arrives within ~3 business days (concierge playbook stage 2).
- **Patina:** `log_po_acknowledgment(p_po_id, p_vendor_po_number, p_confirmed_eta)` records only the vendor order # and the ETA (`00190_ack_any_active_status.sql:29-32`). The inline form has exactly those two fields (`DP/components/document/po-preview.tsx:75-76,133-151`) **[H]**. There is no line comparison, no ack document and no discrepancy state **[H]**. There is no ack-chase job: the only procurement crons are payments-due and delivery-this-week (`00189_procurement_crons.sql:7-30`) **[H]**.

### 3.6 CFA / strike-off and COM
- **Good:**
  - For any COM, and for any to-the-trade fabric with dye-lot risk, request a **CFA (cutting for approval)** from the current dye lot. The designer approves it, or the client too for big-ticket pieces, before the mill cuts. Custom prints and colorways get a **strike-off**. Both are tracked as dated approvals that gate the fabric PO.
  - **COM yardage math:** take the manufacturer's yardage chart (usually stated for 54" plain fabric) and adjust:
    - **Repeat:** add yardage for a vertical repeat. Rough rule: chart yards × (1 + repeat inches ÷ 36 × a per-piece factor). Simpler shop rule: add 10–15% for a repeat up to ~14", 20–30% for large repeats. Always confirm with the workroom.
    - **Railroading:** railroaded fabric avoids seams on long sofas but changes the math.
    - **Narrow goods:** under 54" needs more yards.
    - **Overage:** add ~1 yd for flaws and cutting.
  - *Worked example:* sofa chart 14 yd plain → 27" repeat → workroom says 18 yd → order 19 yd → CFA approved → fabric PO to the mill, **ship to the upholstery vendor**, tagged "COM for [vendor] PO # / sidemark". The furniture PO says "COM arriving separately, mill PO #___". If the fabric lands at the wrong address, or untagged, it sits for weeks.
- **Patina:**
  - Zero hits for CFA/strike-off across migrations, portal and functions **[H]**.
  - COM lives only inside the configuration model: vendor COM requirements (yardage, railroading, ship-to, sidemark) and `com_details` on the configuration snapshot (`00413_configuration_com_and_decision_selection.sql:59,71`) **[H]**. Lines from the library, a link, the extension or a deck have no COM fields **[M]**.
  - No yardage calculator **[H]**.
  - Custom commissions have a "Submittal" milestone ("shop drawing, sample, or finish control") → receiving → installed (`DP/components/document/rooms/piece/custom-commission-fulfillment.tsx:33-57`; table `00403_product_configuration_foundation.sql:285`). That is the nearest thing to a CFA gate, and it applies only to custom-mode configured pieces **[M]**.
  - No fabric PO linked to a furniture or workroom PO **[H]**.

### 3.7 Deposits, balances and terms
- **Good:** each vendor PO carries its schedule (deposit % and date, balance trigger). The buyer records each payment: date, amount, method, and the last 4 digits of the card. The book shows what the studio owes this week and what is held for balance. Studio payments reconcile against client receipts per job.
- **Patina:**
  - The schedule exists: the `po_payments` deposit/balance/milestone states pending/due/paid (`00148_procurement_workspace_v1.sql:16-35,77-90`) and pattern choice in the Assistant (`order-assistant/step-details.tsx:28-30`) **[H]**.
  - A cron flips rows to `due` and notifies (`00189:7-14`) **[H]**.
  - **But nothing records "paid".** `useLogPaymentPaid` (`packages/supabase/src/hooks/use-procurement.ts:602`), `useAdvancePaymentToDue` (`:849`) and `useUpdateVendorPaymentTerms` (`:449`) have zero app callers. Only the hook index and tests reference them **[H]**. So the studio gets "balance due" notices it cannot clear.
  - Only Patina-catalog (Stripe) orders are actually payable in-app (seed brief §2.9) **[M]**.

### 3.8 Freight
- **Good:** a freight line per PO (estimate, then actual): LTL vs parcel vs white-glove, crating, liftgate, residential surcharge. Carrier, PRO/tracking # and BOL on file. Freight is billed to the client per the agreement. The concierge playbook freight table (cost / transit / liability / threshold vs room-of-choice vs full-service) is the right comparison.
- **Patina:** the studio PO lane has no freight cost, carrier or tracking field (seed brief §2.6, intake §5) **[M]**. The maker lane has all of it: `freight_charged_cents`, `freight_cost_cents`, shipment `mode IN ('parcel','ltl','white_glove')` (`00350_fulfillment_core.sql:81,134,163`) **[H]**.

### 3.9 Receiving, inspection and damage claims (time windows)
- **Practitioner norms. Verify per carrier and vendor, not legal advice:**
  - Note visible damage on the BOL **at delivery**.
  - Carriers commonly want concealed damage reported within about **5 days**.
  - Many furniture vendors want written notice within **48–72 h** or 3–5 business days, with photos of all sides plus the packaging before it is thrown away.
  - Formal carrier claims under the interstate rules have a much longer outer limit (months), but the practical window is the vendor's.
  - Receivers usually report within 24–48 h.
  - Miss the window and the studio eats the repair.
- **Patina:**
  - Receipts and partials go through `record_project_ffe_receipt_batch` (`use-procurement.ts:1391-1411`) and `receiving_inspections` with outcome clean/damaged/partial (`00150_receiving_and_damage_claims.sql:8,34-46`) **[H]**.
  - Claims go drafted → vendor_notified → resolved (`00150:13,61-75`) **[H]**.
  - **No deadline clock.** The "30-day window" on Receiving is a stats window for pass rate and Cleared (`DP/components/document/orders-book-receiving.tsx:10`) **[H]**. Claims and inspection windows exist only on `vendor_profiles` for the maker lane (`00350:57-58`) **[H]**.
  - Desktop photo upload is a placeholder ("Photos: upload via mobile"; `DP/components/portal/procurement/log-inspection-drawer.tsx:456-467`) **[H]**.
  - A receiving warehouse is not an entity. `receiver` exists only as a project party kind (`00281:53`) **[H]**.

### 3.10 Backorders, discontinuations and substitutions
- **Good:** when a vendor reports a backorder or discontinuation, the buyer:
  1. flags the line with a new date or "disc."
  2. sources two or three alternates
  3. sends the client a re-approval at the new price
  4. cancels or amends the PO with the vendor, getting the deposit back or credited
  5. places the new order

  The trail is kept, because the client will ask in month nine.
- **Patina:**
  - Pieces exist but are not chained. `design_disposition` includes `alternate/superseded` (00434, per intake brief) **[M]**, and the PO-change backend covers cancellation, credit and vendor change (`00435:858`) **[H]**. The line has `is_blocked` + reason **[M]**.
  - There is no backorder state, no client re-approval tied to an ordered line, and no UI for the change backend **[M]**.
  - Changes after the sale are **R8 ruling needed**. A price below trade on a substitute is **R5 ruling needed**.

### 3.11 Install day and punch
- **Good:** an install manifest (what is at the receiver, what's missing, what goes in which room). Each item gets marked installed. Punch items are tied to the line (touch-up, wrong leg, missing hardware), with an owner and a date.
- **Patina:**
  - `closure-derivation.ts` blocks close-out on any FF&E item not `installed` (`DP/lib/document/closure-derivation.ts:191-199`) **[H]**.
  - The seed brief says no web control sets `installed` (`ffe-schedule-builder.tsx:507`, no `stage` prop). My grep found no writer of `status: 'installed'` in portal components or hooks **[M, verify iOS Field]**. If both hold, the web cannot clear the close-out blocker.
  - Custom commissions have their own "Confirm installed" milestone in a separate table (`custom-commission-fulfillment.tsx:50-57`) **[M]**.
  - Punch exists as `coordination_kind = 'punch'` (`00213_coordination_kind_and_court.sql:37`) and as a Field-line `punch_report` (`00643_field_line_po_condition.sql:21`). A link to a specific FF&E line is unverified **[L, verify]**.

### 3.12 Client billing
- **Good:** the studio bills product at client price, on its own terms: a product deposit (often 50–100%) before it orders, then the balance plus freight before install. How much the client sees depends on the agreement:
  - **Purchase-cost-plus** (client sees net cost + X%)
  - **Retail / list** (client sees one price; the studio keeps the discount)
  - **Fixed fee** (product at net, fee separate)

  Reimbursables pass through with receipts. Tax applies per line by taxability.
- **Patina:**
  - Strong core: FF&E invoice lines (`00187_invoice_ffe_lines.sql:73-74`), "Bill N uninvoiced", and an Order Assistant check of whether the client has been invoiced and paid for those lines before the PO goes out (`order-assistant/step-coverage.tsx:4-18`) **[H]**. On commercial-origin jobs, authorization plus deposit-clear is a hard gate (`DP/lib/document/authorization-derivation.ts:355-395`) **[H]**.
  - **Client product deposit then balance on the same item** is blocked by "one live billing slot per FF&E item" (`00187:116,133`). It must be faked with ad-hoc lines **[M]**.
  - Fee basis that reaches money is hourly/flat/per_phase. `percent_of_cost`, `cost_plus` and `percent_of_spend` are recorded on the agreement but "reach the money row not at all" (`00577_agreement_fee_schedules.sql:7-13,125`) **[H]**.
  - Who sees markup is **R1 ruling needed**. The maker-lane margin pocket is **V1 ruling needed**.
  - **Tax is one rate across the whole subtotal**, design fees included (`packages/shared/src/invoice/index.ts:71-81`). "taxable" appears nowhere in migrations or the portal **[H]**.

### 3.13 Reimbursables and close-out
- **Reimbursables:** no type or table (0 hits) **[H]**. Ad-hoc invoice lines can carry them (`00187:74` kind `adhoc`) with no receipt or cost record **[M]**.
- **Close-out:** the closure derivation exists (above). Spec-book care/install notes exist (`project_ffe_specs`, 00380, per intake brief) **[M]**. There is no job P&L of purchase cost vs billed per job. `DP/hooks/use-studio-accounts.ts:20` counts committed statuses, and its depth was not verified **[L]**. Margin visibility: **R1 / V1 ruling needed**.

---

## 4. What Patina has today, at a glance (code-verified)

| Strength (keep and build on) | Evidence |
|---|---|
| Per-vendor PO creation from selected lines, with payment pattern and deposit | `00186:79-90`, `00449:125-133`, `step-details.tsx:28-30` **[H]** |
| PO PDF prints SKU/finish/fabric/dims, COM lines and sidemark | `po-send/index.ts:250-262,367-380`, `po-send/lib.ts:132-170,498` **[H]** |
| Client-funded-before-PO check (soft on residential, hard on commercial) | `step-coverage.tsx:4-18`, `authorization-derivation.ts:355-395` **[H]** |
| Receipts with partials, inspections, claim lifecycle | `00150:8-75`, `use-procurement.ts:1411` **[H]** |
| Delivery grid and conflicts, payment-due and delivery-this-week notices | seed brief §1; `00189:7-30` **[H]** |
| Full maker-lane fulfillment: shipments by mode, freight, claims windows, ledger | `00350:54-59,81,134,163`; `00352` **[H]** |
| PO change/credit/claim/remedy model with repricing guard (**no UI**) | `00435:849-869`, `00456:5-23` **[H]** |

| Hole (costs money) | Evidence |
|---|---|
| Ship-to placeholder in UI; PDF defaults to the client's house | `step-review.tsx:31`, `po-send/index.ts:380-384` **[H]** |
| Ack = vendor # + ETA only; no reconciliation, no chase | `00190:29-32`, `po-preview.tsx:133-151`, `00189` **[H]** |
| Vendor payments can't be marked paid | `use-procurement.ts:449,602,849` zero callers **[H]** |
| No production/shipped transitions from the web | `use-procurement.ts:770` zero callers **[H]** |
| No freight/crating cost or tracking on studio POs | seed brief, `00148:50-62` has no such column **[H]** |
| No claim-deadline clock; desktop photos deferred | `orders-book-receiving.tsx:10`, `log-inspection-drawer.tsx:456-467` **[H]** |
| No CFA/strike-off, no yardage math, no fabric↔workroom link | 0 grep hits; `00413:59,71` only **[H]** |
| Residential lines orderable before client approval | `authorization-derivation.ts:147,372-375` **[H]** |
| Off-catalog line with a free-text vendor can't become a PO | `00449:125-133` (vendor_id + selected required) **[H]** |
| One-rate invoice tax; one billing slot per item | `packages/shared/src/invoice/index.ts:71-81`, `00187:116` **[H]** |

---

## 5. Scored checklist (48 capabilities)

**Score:** 0 = absent · 1 = schema/backend only, placeholder, or blocked by a missing step · 2 = usable but partial · 3 = a studio could rely on it.
**Weight:** 3 = money-critical · 2 = important · 1 = convenience. "verify" = R1/R2 or a walk should confirm.

### A. Vendor and trade setup
| # | Capability | W | S | Evidence / note | Conf |
|---|---|---|---|---|---|
| A1 | Studio creates/finds a vendor with an orders email | 2 | 2 | People "maker" add sheet; global `vendors`, `orders_email` (`00188:94`), studio rolodex (00417) | M |
| A2 | Studio-level trade account per vendor (acct #, tier, rep, CC on file) | 2 | 1 | `designer_vendor_accounts` is per designer with no portal reader | H |
| A3 | Resale certificate per state, its expiry, and which vendors hold it | 2 | 0 | Compliance store holds others' COI/W-9 (`00623:166`) | M |
| A4 | Vendor terms and policies (deposit %, net, lead time, claims window, freight policy) editable | 2 | 1 | Enum only (`00148:41`); edit hook has zero callers (`use-procurement.ts:449`); full set only on maker `vendor_profiles` | H |

### B. Spec, quote and price
| # | Capability | W | S | Evidence / note | Conf |
|---|---|---|---|---|---|
| B1 | Line carries the full buy spec (SKU, finish, fabric, dims, options, qty) and the designer can edit it | 3 | 2 | Spec row + PDF print (`po-send/index.ts:261`); placement drops SKU/finish/dims, no edit surface (brief) | M, verify |
| B2 | Off-catalog line (link, extension, deck, named need) becomes orderable with a real vendor | 3 | 1 | PO needs `vendor_id` + `selected` (`00449:125-133`); named need has no vendor | H |
| B3 | One-off / antique / auction purchase (buyer's premium, non-returnable, paid now) | 2 | 0 | No model (intake §5) | M |
| B4 | RFQ tied to job and lines; returned quote recorded (price, freight, lead, valid-until, PDF) | 2 | 1 | `vendor_quote_requests` is free text and unlinked (`00162:31-49`) | H |
| B5 | Line pricing: trade, markup, client price editable post-placement, with price age | 3 | 1 | Hooks throw "RPC-only", no designer price RPC (brief). **R1/R5/R6/R8 rulings needed** | L, verify |
| B6 | Lead time on the line and an "order-by" date counted back from install | 2 | 1 | Lead time on `products` (00152) not on the line; Week grid shows conflicts | M |

### C. Client approval and funding
| # | Capability | W | S | Evidence / note | Conf |
|---|---|---|---|---|---|
| C1 | Client approval gates ordering on every job type | 3 | 2 | Hard on commercial; residential lets `specified/quoted` order (`authorization-derivation.ts:147,372-375`) | H |
| C2 | Client funds (deposit/paid) checked before the studio commits money | 3 | 2 | Coverage soft gate (`step-coverage.tsx`), commercial deposit-clear hard gate | H |

### D. Purchase order
| # | Capability | W | S | Evidence / note | Conf |
|---|---|---|---|---|---|
| D1 | One PO per vendor per job from selected lines | 3 | 3 | `00186`, Order Assistant, "Order all" (`orders-book-vendors.tsx:80-84`) | H |
| D2 | Numbered PO document with sidemark, specs and COM instructions | 3 | 3 | `po_counters` (`00188:71`), `po-send/lib.ts:132-170,498` | M (render unverified) |
| D3 | Ship-to chosen per PO (receiver / site / workroom) | 3 | 1 | Hardcoded placeholder (`step-review.tsx:31`); PDF defaults to site address (`po-send/index.ts:380-384`) | H |
| D4 | Send PO by email with a note; send recorded | 2 | 2 | `po-send`; personal message TODO and two send UIs (brief) | M |
| D5 | Vendor payment schedule per PO | 2 | 2 | `po_payments` + pattern picker; can't mark paid (see G1) | H |
| D6 | PO change, cancellation, credit and restocking with the vendor | 3 | 1 | `start_purchase_order_change` (`00435:849-869`), no caller | H |

### E. Acknowledgment and production
| # | Capability | W | S | Evidence / note | Conf |
|---|---|---|---|---|---|
| E1 | Log the ack (vendor order #, ship date) plus a chase when there is no ack in N days | 2 | 2 | `00190:29-32`, Ledger only; no chase cron (`00189`) | H |
| E2 | Ack reconciliation line by line (price/finish/qty/freight/lead) with a discrepancy flag | 3 | 0 | Nothing | H |
| E3 | Production and shipped status updates | 2 | 1 | Enum + cascade (`00148:60-61`, `00184:194`); `useUpdatePurchaseOrderStatus` zero callers | H |
| E4 | ETA change history plus a delay note to the client (drafted, never auto-sent) | 2 | 2 | Single ETA edit (`line-unfold.tsx` MovementCell), Ledger align; no history | M |

### F. Fabric, COM and workroom
| # | Capability | W | S | Evidence / note | Conf |
|---|---|---|---|---|---|
| F1 | COM/COL spec on any upholstered line (mill, pattern, width, repeat, railroad, yards) | 2 | 1 | Only on configured products (`00413:59,71`) | H |
| F2 | Yardage math helper (repeat, width, railroad, overage) | 2 | 0 | None | H |
| F3 | CFA / strike-off request and approval gating the fabric order | 3 | 1 | 0 hits; custom-commission "Submittal" only (`custom-commission-fulfillment.tsx:33-41`) | M |
| F4 | Workroom work order with a linked fabric PO shipped to the workroom | 3 | 0 | None (intake §5) | H |

### G. Money out (vendor side)
| # | Capability | W | S | Evidence / note | Conf |
|---|---|---|---|---|---|
| G1 | Record deposit/balance paid (date, amount, method, card) and clear "balance due" | 3 | 1 | Notices fire (`00189:7-14`); paid hook zero callers (`use-procurement.ts:602`) | H |
| G2 | Retail-on-card purchase (receipt, card, return-by date) | 2 | 0 | None | H |

### H. Freight and logistics
| # | Capability | W | S | Evidence / note | Conf |
|---|---|---|---|---|---|
| H1 | Freight/crating/liftgate cost (estimate → actual), carrier, tracking, BOL on studio POs | 3 | 0 | None on `purchase_orders`; maker lane has it (`00350:81,134,163`) | H |
| H2 | Receiving warehouse as a real entity (address, contact, storage terms, receiving notice) | 2 | 1 | `receiver` party kind (`00281:53`); ship-to is text | H |
| H3 | Delivery scheduling and consolidation ("same truck") | 2 | 2 | Week grid, delivery conflicts, same-truck ETA (brief) | M |

### I. Receiving and claims
| # | Capability | W | S | Evidence / note | Conf |
|---|---|---|---|---|---|
| I1 | Receipt with qty and partials against the PO | 3 | 2 | `record_project_ffe_receipt_batch`, `00150` | H |
| I2 | Photo evidence from any device | 2 | 1 | Desktop placeholder (`log-inspection-drawer.tsx:456-467`); iOS photos can't be opened on web (brief) | H |
| I3 | Claim-deadline clock (BOL notation, concealed-damage window, vendor notice) | 3 | 0 | Stats window only (`orders-book-receiving.tsx:10`) | H |
| I4 | Claim to vendor → repair / replace / credit, replacement order linked | 3 | 2 | Claim lifecycle `00150:61-75`; replacement/remedy backend only (`00456`) | H |

### J. Exceptions
| # | Capability | W | S | Evidence / note | Conf |
|---|---|---|---|---|---|
| J1 | Backorder / discontinued flagged on the line with a new date | 2 | 1 | `is_blocked` + reason only | M |
| J2 | Substitution chain: alternates → client re-approval → PO amend → new order | 3 | 1 | Dispositions + change backend, not chained. **R5/R8 rulings needed** | M |

### K. Install and close
| # | Capability | W | S | Evidence / note | Conf |
|---|---|---|---|---|---|
| K1 | Mark items installed (install manifest) | 2 | 1 | No web writer found; close-out requires it (`closure-derivation.ts:191-199`) | M, verify iOS |
| K2 | Punch items tied to FF&E lines | 2 | 1 | `punch` kind (`00213:37`), Field `punch_report` (`00643:21`); line link unverified | L, verify |
| K3 | Close-out checklist (all installed/paid/billed, claims closed) plus client care binder | 2 | 1 | Closure derivation exists but K1 blocks it; care notes in spec book | M |

### L. Client billing
| # | Capability | W | S | Evidence / note | Conf |
|---|---|---|---|---|---|
| L1 | Bill FF&E per line at client price | 3 | 3 | `00187`, "Bill N uninvoiced" | H |
| L2 | Client product deposit, then balance, on the same items | 3 | 1 | One live billing slot per item (`00187:116,133`) | M |
| L3 | Markup visibility and product fee basis (cost-plus / retail / fixed fee) reach the invoice | 3 | 1 | Cost-plus recorded but not billed (`00577:7-13`). **R1 + V1 rulings needed** | H |
| L4 | Reimbursables recorded with receipt and billed per agreement rule | 2 | 1 | Ad-hoc lines only | M |
| L5 | Per-line sales tax (product vs fee vs freight) and resale-exempt clients | 2 | 1 | One rate on the whole subtotal (`invoice/index.ts:71-81`) | H |
| L6 | Job P&L: purchase cost vs billed vs paid | 2 | 1 | Not found beyond committed-status counts. **R1/V1 rulings needed** | L, verify |

### M–N. Samples and the maker lane
| # | Capability | W | S | Evidence / note | Conf |
|---|---|---|---|---|---|
| M1 | Samples/memos requested, logged, return-by tracked | 1 | 0 | No table | H |
| N1 | Patina maker order end to end (checkout, freight by mode, claims window, exceptions, ledger) | 2 | 2 | Backend complete (`00350/00352/00364`); studio-side UI depth unverified. **V1 ruling needed** | M, verify |

### Totals
| Group | Score / max | % |
|---|---|---|
| A Vendor and trade setup | 8 / 24 | 33% |
| B Spec, quote and price | 16 / 45 | 36% |
| C Approval and funding | 12 / 18 | 67% |
| D Purchase order | 32 / 48 | 67% |
| E Ack and production | 10 / 27 | 37% |
| F Fabric / COM / workroom | 5 / 30 | 17% |
| G Money out | 3 / 15 | 20% |
| H Freight and logistics | 6 / 21 | 29% |
| I Receiving and claims | 14 / 33 | 42% |
| J Exceptions | 5 / 15 | 33% |
| K Install and close | 6 / 18 | 33% |
| L Client billing | 21 / 45 | 47% |
| M–N Samples, maker lane | 4 / 9 | 44% |
| **All** | **142 / 348** | **41%** |

That is nine capabilities at 0 and three at 3 (D1, D2, L1). The PO itself is good. Everything around it is thin.

---

## 6. The ten failure moments that cost studios the most

Dollar ranges are practitioner estimates for a mid-market residential job, not data.

| # | Moment | What happens | Typical cost | Patina today |
|---|---|---|---|---|
| 1 | **Unreconciled acknowledgment** | Wrong finish or fabric on the ack, nobody compares it, and the vendor builds it. Silence counts as acceptance. | $1.5k–8k per piece plus 8–14 wks | **Not covered** (E2=0) |
| 2 | **Ordered before the client approved or paid** | The client balks or changes their mind on a non-returnable custom piece, and the studio owns it | Full trade cost, $2k–15k | Partial: soft gate on residential (C1/C2=2) |
| 3 | **Wrong ship-to** | LTL goes to the client's house with no dock, no inspection, refused or damaged. Or COM fabric goes to the wrong workroom | $300–1.5k redelivery, lost claim rights, weeks | **Exposed**: PDF defaults to site address (D3=1) |
| 4 | **Missed claim window** | Concealed damage found at install, weeks after delivery. The vendor and carrier both decline | Repair or replace at studio cost, $500–6k | **Not covered** (I3=0) |
| 5 | **Forgotten balance** | The vendor holds finished goods for the balance, so the install date slips and installer, receiver and storage are rebooked | $400–2k plus client trust | Notices fire but can't be cleared (G1=1) |
| 6 | **COM yardage short or dye lot mismatch** | Fabric runs short and the reorder comes from a different lot, or the pattern was discontinued | $800–5k fabric plus 6–10 wks | **Not covered** (F2=0, F3=1) |
| 7 | **Freight and receiving never billed** | LTL, white-glove, crating and storage are paid by the studio and never passed through | 3–8% of product spend per job | **Not covered** (H1=0, L4=1) |
| 8 | **Silent substitution or price change** | A backorder swap or price increase goes through without client re-approval, and the client disputes the invoice | Margin on the line, sometimes the whole line | Backend only (J2=1, D6=1) |
| 9 | **Deposit lost on cancellation** | A cancelled or changed order with no written trail. The deposit is forfeited or the credit is never used | 30–50% of the line | Backend only (D6=1) |
| 10 | **Tax mistakes** | Tax charged on fees where it is exempt, or not collected on product where it is owed, or a lapsed resale certificate leads to vendors charging tax | Back tax plus penalties at audit | Exposed: one rate, no certificate store (L5=1, A3=0). **Note only; CPA rules** |

---

## 7. Proposals, run through the VISION feature test

Every row is on **The Document** (designer portal) unless noted. All serve the **studio subscription** stream as the floor. Where a row touches margin on furniture, it serves the upside stream and the open ruling is named. None optimizes for engagement. Each removes a step the studio must otherwise remember, which fits the promise "the studio won't notice Patina".

| Proposal | Surface | Studio moment | Stream | Promise | Rulings |
|---|---|---|---|---|---|
| **P1 · Ack check**: attach the ack, compare it to the PO lines, flag differences, draft a reply to the vendor (`awaiting_review`, never auto-sent) | Document: line unfold + Ledger | First hire buying while the principal designs | Subscription; protects upside | Catches the #1 loss quietly | none |
| **P2 · Ship-to that's real**: studio receiver(s) as entities, ship-to picked per PO, default from studio settings, never the client's house without a choice | Document: Order Assistant | Every PO | Subscription | Removes the placeholder | none |
| **P3 · Record what we paid**: wire `useLogPaymentPaid` and terms editing; balance-due clears when paid | Document: Ledger / Vendors | Weekly bill run | Subscription | Reconcile toward internal tables (Agent OS rule) | none |
| **P4 · Claim clock**: per-vendor claim and inspection windows (reuse the `vendor_profiles` shape) and a quiet deadline on each inspection | Document: Receiving; iOS Field for photos | Delivery day at the receiver | Subscription | One reminder, no nagging | none |
| **P5 · Change orders**: surface `start_purchase_order_change` (cancel/credit/vendor change/remedy) with client re-approval for substitutions | Document: line unfold | Backorder or damage | Both | Client agrees to one direction | **R5, R8** |
| **P6 · Freight and reimbursables lines**: cost per PO (estimate → actual) plus receipts, billed per the agreement | Document: PO + invoice composer | Month-end billing | Both | No hidden fees, from studio to client too | **R1 (visibility), V1 on maker lane** |
| **P7 · COM pair**: COM fields on any upholstered line, yardage helper, CFA approval, fabric PO linked to the furniture or workroom PO with ship-to = workroom | Document: line unfold | Specifying upholstery | Subscription | Fewer reorders | none |
| **P8 · Off-catalog lanes**: vendor-less line → pick or create vendor → orderable; card purchase and one-off purchase as lightweight records, not POs | Document: add sheet / line | Flea-market find, retail run | Subscription | Studio buys everything in one place | V1 if routed to marketplace |
| **P9 · Installed and punch**: mark installed from the line (and from Field), punch tied to the line, so close-out can clear | Document + iOS Field | Install day | Subscription | Close-out without paperwork | none |
| **P10 · Per-line tax and deposit billing**: taxable flag per line kind; client product deposit then balance on the same items | Document: invoice composer | Client billing | Subscription; upside | Pricing honesty | **R1, R7** (client wording) |

**Side journeys (log in VISION-DECISIONS, do not build now):** samples/memo tracking (M1), a full job P&L dashboard (L6, also blocked on R1/V1), and a resale-certificate vault with state-by-state rules (A3; legal-gated). The memo library is useful, but it belongs to no first-hire moment that loses money.

---

## 8. Rulings this memo touches (not resolved)
- **V1:** margin pocket on maker-lane orders vs studio markup. Affects N1, L3, L6 and P6/P8.
- **R1:** who sees margin. Affects L3, L6 and P6/P10.
- **R5:** client price below trade. Affects J2 and P5.
- **R6:** price-age thresholds. Affects B4, B5.
- **R7:** the client and dates. Affects delay notes (E4) and deposit wording (P10).
- **R8:** post-sale edits. Affects D6, J2 and P5.

## 9. What I did not verify
- The PO PDF render itself (D2).
- Whether iOS Field writes `installed` (K1).
- Whether punch rows link to FF&E lines (K2).
- The studio-side maker checkout UI depth (N1).
- The seed-brief claims about placement dropping SKU/finish/dims and the "RPC-only" pricing hooks (B1, B5).
- Studio accounts P&L depth (L6).

All of these are marked "verify" above for R1/R2 or a signed-in walk.
