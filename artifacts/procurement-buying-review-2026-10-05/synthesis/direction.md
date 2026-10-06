# Direction: a studio that can buy anything for a job

**Role:** design director, synthesis. **Date:** 2026-10-05. **Repo:** main @ `4207b8e2d`, main checkout only.
**Inputs:** briefing `current-state-buying-flow.md`, `current-state-intake.md`; research R1–R5; design D1 (interaction), D2 (buyer operations), D3 (phasing and feasibility).
**Evidence rule:** code only. No live portal walk and no Leah interview. `DP/` = `apps/designer-portal/src/`. `M/` = `supabase/migrations/`. `F/` = `supabase/functions/`.
**Confidence:**
- **[H]**: I read the line myself during synthesis, or two memos read it independently and agree.
- **[M]**: one memo read it, and I checked code near it.
- **[L]**: practitioner norm or inference.

**Held open, never resolved here:**
- **V1**, the margin pocket.
- Pricing-mechanics **R1–R11** (`artifacts/pricing-mechanics-2026-09-05/README.md:40-45`).
- **R-DI4 / R-DI5** from the deck import.

The new questions this review raises are numbered **R-PB1–R-PB9** in §9.

The specimens built from this direction are contracted in `../specimens/SPEC.md`.

---

## 1. Thesis

Patina's purchase order is good. Everything around it is thin, and each thin spot costs a growing studio money.

The PO itself works: one PO per vendor per job, a numbered PDF with a sidemark, and a check that the client has paid before the studio commits its own money. Around it, several things go wrong:
- The order screen shows one hardcoded address ("Middlewest Studio · Madison WI", Leah's own studio) for every studio and defaults to the client's house.
- The PDF prints a blank SKU, finish and dims on unconfigured lines (configured lines print from the configuration snapshot).
- The first hire can build a PO but likely cannot send it.
- The studio cannot record what it paid a vendor.
- Nothing compares the vendor's acknowledgment against the order.
- Nothing starts a claim clock.
- Nothing marks a piece installed, so close-out can never clear.
- Six of the eight ways studios actually buy have no model: workroom/COM, antiques and finds, retail on a card, samples, freight and receiving as costs, and reimbursables.

The direction is one buying spine per job, kept inside The Document. The spine is the Project section's existing rows, with two new readings, "by maker" and "by next act", plus a line unfold that holds every buying act where the designer is already looking.

Every source lands on one line card. One readiness rule says, in words, what a line still needs. The PO becomes an order paper that is edited in place and sent once.

Money out, acknowledgment checks, receiving with a dated claim window, and the lanes that never get a PO (finds and store buys) become plain records. They copy the nouns Patina already built for its own maker lane.

We fix the broken seams first (Phase 0, eleven bug fixes, no flags). Then we wire the tables and RPCs that already exist without a UI (Phase 1). New models come last (Phase 2), and the ones that sit on V1, R1, R5 or R8 wait for those rulings.

The studio should not notice Patina while doing any of this:
- every total is front matter over its own rows
- every outbound message is a draft a person sends
- no screen is shaped to pull anyone back in

---

## 2. Where the designers disagreed, and the call

| # | Question | D1 | D2 | D3 | **Call** | Why |
|---|---|---|---|---|---|---|
| 1 | How to record vendor payments | Wire `useLogPaymentPaid` | Don't wire it as-is. Use an append-only `vendor_payments` table behind a lane-guarded RPC, and revoke direct writes | Add columns to `po_payments` plus an RPC, then revoke | **D2's model, D3's sequencing.** Ship `vendor_payments` (append-only, partials, voids) and `record_vendor_payment`. The RPC refuses Stripe-rail rows. Revoke direct writes on `po_payments`. Never wire the raw hook. | The raw hook does a direct `UPDATE po_payments` (`packages/supabase/src/hooks/use-procurement.ts:602-640`) on a table that is `FOR ALL` to co-members (`M/00584:242-260`). That would let a member mark a Stripe-owned row paid, which inverts the Agent OS rule. Partials and voids are everyday facts, and D1's own UI needs partials. **[H]** |
| 2 | How to advance a PO to production or shipped | Wire `useUpdatePurchaseOrderStatus` | Advance through a `record_po_shipment` RPC | New `advance_purchase_order_status` RPC | **D3 in Phase 0; D2's shipment RPC in Phase 2.** | `purchase_orders` has been RPC-only since 00447. Writes are revoked and a guard trigger raises (`M/00447:15-36`, read this pass **[H]**). The raw hook would fail. |
| 3 | Does the ETA edit work today? | Treated as working | — | Probably broken: the hook writes an RPC-only table | **Assume broken until the S0 probe proves otherwise.** Fix with `set_purchase_order_eta`. | `useUpdatePurchaseOrderETA` does `.from('purchase_orders').update(...)` (`use-procurement.ts:663-708`, read **[H]**). I found no later grant that restores UPDATE. Runtime is unverified. |
| 4 | Lanes without a PO (finds, store buys) | A separate *purchase record* | A separate `studio_purchases` table | `purchase_orders.kind`, plus relaxing `vendor_id NOT NULL` | **D1/D2: a separate purchase record.** A work order is an ordinary vendor PO to the workroom, linked to its fabric PO. It gets no new `kind`. | Relaxing `vendor_id` would touch every reader of `purchase_orders` (Ledger, Week, Receiving, `po-send`, QBO, crons). D3 rates it XL and high risk itself. A purchase is already paid and has nothing to send or acknowledge, so it shouldn't wear a PO's lifecycle. A line's "kind" is derived, not stored (§7 C-21). |
| 5 | Where goods ship | Receivers as People cards; ship-to picker | `studio_locations` (receiver, studio, workroom, storage, site) hanging off rolodex company cards | Phase 0 text field defaulting from `organizations.address`; receivers in Phase 2 | **Phase 0:** an explicit three-way choice with nothing preselected: studio address on file, the job site, or type one. `po-send` stops filling in the house. **Phase 1:** `studio_locations` (D2's shape), with a default receiver. | A silent default to the studio's office is still a silent default. D1 is right that the buyer must choose. Receivers move up to Phase 1 because the claim clock, the receiving notice and the per-line check-in all hang off them. |
| 6 | `po-send` with no ship-to | Terminal act `aria-disabled` "choose where this ships" | Warn, never block | Refuse send; preview still renders | **Phase 0: warn on send with no ship-to; preview renders. Refuse-send ships only if R-PB3 rules for it.** | A PO without a destination isn't a valid PO. R9 (open) is drafted as "warn, never block" for money floors; a missing fact is a different question. |
| 7 | The ack check | Pre-filled compare sheet, three columns | `po_acknowledgments` + `po_ack_lines`, discrepancy exception, drafted reply | Ack chase in P1; reconciliation in P2 | **Phase 0:** mount `LogAckInline` on the line. **Phase 2:** D1's sheet on D2's tables. A Desk nudge already rises a day after send (`DP/lib/document/desk-derivation.ts:416`, D2 C3), so a new "chase" notice is not needed. The drafted follow-up rides the drafts table. | Avoids building a second chase over the one that exists. |
| 8 | Owner releases a junior's order | D1-12 "Held for release", off by default | New studio-practice ruling | B2, Phase 2 after rulings | **Design it in full and show it in the specimens. Build it only after R-PB2.** It is off by default and uses System B seats (owner/admin), never System A's `studio_owner`. | It is the exact VISION trigger moment (R5 §0), so the mockups must show it. It is also the first in-studio spend gate, and that is Kody's call. |
| 9 | One readiness rule | `orderReadiness()` returns reasons | — | One predicate that mirrors the DB; B1 ruling | **Merge them.** One pure derivation mirrors the DB refusal set (`selected` + vendor + client price > 0 + not blocked + the commercial gate). It returns D1's reasons in words. The client-yes step on jobs with no agreement stays warn-only until **R-PB1**. | Today the UI has three different tests and the DB has a fourth (D3 §2.6). Nothing writes `approved` on a job with no agreement behind it: activation writes `specified` (`M/00331:665,703`), and only executing a furnishings authorization writes `approved` (`M/00425:723`, `M/00475:1123`, `M/00511`, latest `M/00578`). So "Order all" can never fire on such a job (`DP/components/document/orders-book-vendors.tsx:80-84`). **[M-H]** |
| 10 | Terms per vendor | — | `studio_vendor_accounts`; don't wire `useUpdateVendorPaymentTerms` | 00696 `studio_vendor_accounts` | **Agree (Phase 1).** | The hook writes the global `vendors` row, which only admins may update (`M/00058:29-41`). |
| 11 | "Read by next act" | A reading inside the Project section | — | — | **Ship "read by maker" in Phase 1. "Read by next act" waits on R-PB5.** | It may re-open what the R21 dissolve closed (By Status). |
| 12 | Margin on buying screens | In and out never share a row; the paired view stays in the Financial lens | Trade cost only | Trade cost only | **Every buying screen shows trade cost (what the vendor is paid).** Margin appears only in an owner-only block, exactly as today. That block carries an R1 and V1 note in the annotation layer. | R1 is open. V1 is open, so no Patina cut is shown until it is ruled. The owner-ness behind the gate is itself broken (R-PB6). |

---

## 3. The buyer's checklist (R3's 48 capabilities, corrected)

**have** means a studio could rely on it. **partial** means usable with real gaps. **missing** means absent, or backend only.

Corrections from R1, R2, D2 and D3 are marked ⟲.

| # | Capability | Status | Evidence | Conf |
|---|---|---|---|---|
| A1 | Find or create a vendor with an orders email | partial | People "maker" sheet; global `vendors`; any authenticated user can insert (`M/00058:22-43`) | M |
| A2 | Studio-level trade account per vendor | missing | `designer_vendor_accounts` is per designer, and no portal code reads it (`M/00009:59-77`) | H |
| A3 | Resale certificate per state | missing | The compliance store holds other parties' paper (`M/00623:166`) | M |
| A4 | Vendor terms editable | missing ⟲ | R3 scored 1. The edit hook targets the global row, and RLS refuses a designer (`use-procurement.ts:449-472`, `M/00058:29-41`) | H |
| B1 | Full buy spec on the line, editable | partial ⟲ | The Spec Book edits SKU/finish/dims (`use-spec-books.ts:334-373`, R2's correction). The unfold doesn't show them. Placement leaves the spec row empty (`M/00380:565-570`) | H |
| B2 | Off-catalog line becomes orderable | missing | `purchase_orders.vendor_id NOT NULL` (`M/00148:54`); a line must match the vendor (`M/00435:894`); there is no designer RPC to attach a vendor (`use-project-v2.ts:287-336`) | H |
| B3 | One-off / antique purchase | missing | No model | H |
| B4 | RFQ tied to a job, with the returned quote recorded | missing | `vendor_quote_requests` is free text (`M/00162:31-49`); `project_id` was added at `M/00403:373`, but there is no line link and no returned-quote record | H |
| B5 | Trade / client price editable after placement | missing | Hooks throw "RPC-only"; there is no designer price RPC. **R1/R5/R6/R8** | H |
| B6 | Lead time on the line and an order-by date | missing | Lead time is spent once, into `eta_date`, at activation (`M/00140:189-190`) | H |
| C1 | Client approval gates ordering | partial | Hard on commercial jobs. On jobs with no agreement, `ORDERABLE` includes `specified` (`DP/components/document/line-unfold.tsx:75`, read **[H]**) and nothing writes `approved` | H |
| C2 | Client funds checked before commit | partial | Soft coverage step (`step-coverage.tsx:158-254`); hard deposit-clear on commercial | H |
| D1 | One PO per vendor per job | have | `create_purchase_order`, the Order Assistant. ⟲ "Order all" is dead on jobs with no agreement (C1) | H |
| D2 | PO document with sidemark, specs, COM lines | partial ⟲ | R3 scored 3. `po-send` reads SKU/finish/dims only from the always-empty spec row and never falls back to the product (`F/po-send/index.ts:250-262`) | H |
| D3 | Ship-to chosen per PO | missing | Hardcoded `"Middlewest Studio · Madison WI"` (`DP/components/portal/procurement/order-assistant/step-review.tsx:31`, read **[H]**). `po-send` fills a blank ship-to with the project site address, then saves it (`F/po-send/index.ts:382-393`, read **[H]**) | H |
| D4 | Send by email with a note | partial ⟲ | Two send UIs; the note field is a TODO (`po-send-actions.tsx:26`). **A co-member gets 404:** `po.designer_id !== caller.id` (`F/po-send/index.ts:236`, read **[H]**), while `create_purchase_order` stamps the project owner (`M/00449:131-136`) | H code / runtime unverified |
| D5 | Vendor payment schedule per PO | partial | `po_payments` plus the pattern picker; it can't be marked paid | H |
| D6 | PO change / cancel / credit | missing | `start_purchase_order_change` (`M/00435:849-869`) has no caller | H |
| E1 | Log ack plus a chase | partial ⟲ | Logged only in the Ledger (vendor # + ETA, `M/00190:29-32`). A Desk nudge `po_unacknowledged` exists after 1 day (`desk-derivation.ts:416`, D2 C3) | H |
| E2 | Ack reconciled line by line | missing | Nothing | H |
| E3 | Production / shipped updates | missing ⟲ | Zero callers, and the hook would fail on an RPC-only table (`M/00447:15-36`) | H |
| E4 | ETA change with history | partial ⟲ | A single ETA cell. Its write path fails for everyone, owner included: a direct UPDATE on an RPC-only table (`use-procurement.ts:663-708` vs `M/00447:15-36`) | M |
| F1 | COM spec on any upholstered line | missing | Configuration only (`M/00413:45-71`) | H |
| F2 | Yardage helper | missing | None | H |
| F3 | CFA / strike-off gate | missing | 0 hits; the custom-commission "Submittal" only | H |
| F4 | Work order with a linked fabric PO | missing | None | H |
| G1 | Record a deposit or balance paid | missing | No caller, and the hook is unsafe as written (§2 #1) | H |
| G2 | Retail on a card | missing | None | H |
| H1 | Freight / crating cost and tracking on studio POs | missing | `purchase_orders` has `total_cents` only (`M/00148:50-65`); the maker lane has all of it (`M/00350:81,134,163`) | H |
| H2 | Receiver as an entity | missing | Exists only as a login-less party kind (`M/00281:48-53`) | H |
| H3 | Delivery scheduling, "same truck" | partial | The Week grid, conflicts, Align ETA (the Align write shares E4's risk) | M |
| I1 | Receipt with quantities and partials | partial | `record_project_ffe_receipt_batch`, `M/00150` | H |
| I2 | Photos from any device | missing | Desktop placeholder (`log-inspection-drawer.tsx:456-467`); iOS photos can't be opened because `getDownloadUrl` returns the raw key (`services/media/src/modules/media/media.service.ts:197`) | H |
| I3 | Claim-deadline clock | missing | The "30-day window" is a stats window (`orders-book-receiving.tsx:10`) | H |
| I4 | Claim → repair / replace / credit | partial | Claim lifecycle exists (`M/00150:61-75`); replacement exists in the backend only (`M/00456`) | H |
| J1 | Backorder flagged with a new date | missing | Only `is_blocked` + reason | M |
| J2 | Substitution chain with client re-approval | missing | Pieces exist, not chained. **R5/R8** | M |
| K1 | Mark installed | missing ⟲ | No RPC writes `installed` anywhere, so iOS can't either (D3 S4). Close-out requires it (`closure-derivation.ts:191-199`) | H |
| K2 | Punch tied to a line | missing | The `punch` kind exists; the line link is unverified | L |
| K3 | Close-out checklist | missing | Blocked by K1 | M |
| L1 | Bill FF&E per line at client price | have | `M/00187`, "Bill N uninvoiced" | H |
| L2 | Client deposit, then balance, on the same items | missing | One live billing slot per item (`M/00187:116,133`) | M |
| L3 | Markup visibility / fee basis reaches the invoice | missing | Cost-plus is recorded but never billed (`M/00577:7-13`). **R1, V1** | H |
| L4 | Reimbursables with receipts | missing | Ad-hoc invoice lines only | M |
| L5 | Per-line sales tax | missing | One rate on the whole subtotal (`packages/shared/src/invoice/index.ts:71-81`). CPA matter | H |
| L6 | Job P&L | missing | Not found. **R1/V1**, and V11 refuses the dashboard form | L |
| M1 | Samples and memos with return-by | missing | No table | H |
| N1 | Patina maker order end to end | partial | Backend complete (`M/00350/00352`); studio UI depth unverified. **V1** | M |

**Tally:** 2 have · 13 partial · 33 missing.

R3's weighted score was 142/348. After the D2 correction (3 → 2 at weight 3) it is **139/348 (40%)**. The other corrections confirm R3's low scores rather than lowering them.

---

## 4. Top friction today, ranked by how often a studio hits it

| # | Friction | Where | Conf |
|---|---|---|---|
| 1 | **The studio can't record what it paid a vendor.** "Balance due" notices land in the Post and can never clear (D2 C1). | `use-procurement.ts:602` (zero callers); `M/00189:7-19` | H |
| 2 | **Wrong ship-to.** One hardcoded address ("Middlewest Studio · Madison WI", Leah's own studio) appears in the UI and the copied manifest for every studio. The PDF silently defaults to the client's house, where LTL freight goes with no dock and no inspection. | `step-review.tsx:31,44`; `F/po-send/index.ts:382-393` | H |
| 3 | **The first hire can't send the PO she made.** The send returns 404 to anyone but the project owner. | `F/po-send/index.ts:236`; `M/00449:131-136`; same check in `F/quote-request-send/index.ts:131` | H code |
| 4 | **Order before approval on jobs with no agreement, and "Order all" never fires.** | `line-unfold.tsx:75`; `orders-book-vendors.tsx:80-84`; `M/00331:665,703`; `M/00578` | H/M-H |
| 5 | **The PDF goes out with a blank SKU, finish and dims** on unconfigured lines unless someone typed them into the Spec Book. Configured lines print from their snapshot. | `F/po-send/index.ts:250-262`; `M/00380:565-570` | H |
| 6 | **Status never moves, and the ETA write fails for everyone, owner included.** | `use-procurement.ts:663-708,770`; `M/00447:15-36` | H code |
| 7 | **No acknowledgment check.** Only the vendor # and ETA are recorded, and silence on a bad ack counts as acceptance. | `M/00190:29-32`; `po-preview.tsx:133-151` | H |
| 8 | **Nothing marks a piece installed**, so close-out can never clear. | `closure-derivation.ts:191-199` | H |
| 9 | **Off-catalog lines can't be ordered.** They have no vendor and no trade price, and retail is written as trade. | `M/00148:54`; `M/00435:203,234,894`; `use-project-v2.ts:287-336` | H |
| 10 | **Receiving is blind on the desk.** There are no photos and no claim clock. | `log-inspection-drawer.tsx:456-467`; `media.service.ts:197`; `orders-book-receiving.tsx:10` | H |
| 11 | **"Import a schedule" is a labelled dead end**, even though the backend exists. | `add-to-project-sheet.tsx:272-274`; `stage_project_ffe_document_extraction` … `M/00666` | H |
| 12 | **Field capture drops SKU, finish and trade cost** when it mints the product. | `M/00530:666-674` | H |
| 13 | **"Chase the PO" loses the project.** | `orders-ledger.tsx:158` | H |
| 14 | **Two send UIs, one orphaned popover, and a TODO note field.** | `order-assistant/index.tsx:1057`; `po-send-actions.tsx:26,326` | H |
| 15 | **Margin can't be delegated.** The lens checks a role that no invite or ownership transfer grants. | `packages/supabase/src/hooks/use-permissions.ts:429`; `F/workspace-member-invite/index.ts:342-382`; `M/00484:463-538` | H |

---

## 5. Competitor patterns (R4)

**Take:**
- Vendor-record defaults cascade onto each PO: terms, ship-via, account, FOB (Studio Designer **[H]**). This becomes C-12 (studio vendor accounts) and the order paper's prefill.
- A dated ack lifecycle on every order touchpoint, not in one preview (Studio Designer **[H]**). This becomes the unfold's Order cell.
- Grouped orderable units approved as a whole or in parts (Mydoma **[H]**). We extend it to the harder case nobody models: fabric vendor ≠ workroom (C-24).
- Two reconciled ledgers, money in and money out, never merged (Design Manager / Studio Designer **[L]**). This matches the Agent OS payable rule and becomes C-11.
- Order tracking scoped to the project it was opened from (DesignFiles **[M]**). This is the S8 project lens.

**Skip:**
- Push nudges when a client acts (Houzz Pro Selections). That is engagement on the studio surface.
- Fees hidden in images, and per-seat pricing that taxes the first hire. These break "one public page", and seat pricing is an R-mechanics matter.
- Commission-ranked "neutral" search (DesignerInc, unconfirmed **[L]**). It breaks Designer-Taught Intelligence and sits on V1.
- Ordering that leaves the platform after approval (the fragmentation pattern).

**Open ground (nobody does it):**
- the COM two-vendor chain
- phone receiving with claims inside the design platform
- buying one thing from someone who isn't a vendor
- reimbursables and card buys as first-class lines

Patina's schema already leads on receiving (`M/00150`, the receiver party). The gap is the UI.

---

## 6. The studio moment (R5)

The moment is **the day Leah is no longer the only person who can commit the studio's money**.

Today that moment is decided by default, not by design:
- Any active non-guest member can create a PO (`is_studio_comember`, `M/00556`).
- She probably can't send it (friction #3).
- She will never see margin, because the Financial lens checks `studio_owner`, which nothing grants to a second person.
- No internal step asks Leah to look before money moves.

The design answers each part:
- **The hire buys:** the spine, the line card, and the order paper.
- **The hire can finish:** S7, so a co-member can send.
- **Leah can delegate without a new system:** "Held for release", R-PB2, off by default, System B seats.
- **Who sees margin:** stays R1 and R-PB6. No buying screen shows margin.

Receiving can be done by a login-less receiver party at the dock. The Field app and the portal at 390 both carry the per-line check-in.

---

## 7. The change list

**Tags:** **UPDATE** grows existing UI or data. **OVERHAUL** is a new model, or replaces a component's shape.
**Stream:** **Floor** = studio subscription. **Upside** = furniture margin.
**Size:** S ≤ 1 wk · M 1–3 wks · L 3–6 wks · XL 6+ wks, one engineer, tests included.

### Phase 0 — broken seams (bug fixes, no flags)

| ID | Change | Tag | Surface | Moment | Stream | Promise | Size |
|---|---|---|---|---|---|---|---|
| C-00 | Local probe signed in as a non-owner member: confirm the ETA write (S1) and the co-member send (S7) fail | — | — | — | — | — | XS |
| C-01 | `set_purchase_order_eta` RPC; repoint `useUpdatePurchaseOrderETA` with the same signature. Never stamps an ack (R16) | UPDATE | Line unfold, Ledger | "It ships Friday" | Floor | Status matches reality | S |
| C-02 | Ship-to. The Order Assistant asks for an explicit choice (studio address on file / the job site / type one) with nothing preselected. Remove `SHIP_TO_PLACEHOLDER`. `set_purchase_order_ship_to` RPC. `po-send` stops defaulting to the site and warns when there is no ship-to; the preview still renders. Refusing the send waits on **R-PB3** | UPDATE | Order Assistant, `po-send` | Every PO | Floor | No hidden placeholder | M |
| C-03 | `advance_purchase_order_status` (confirmed → in production → shipped). Two quiet acts in the Movement cell. The 00184 cascade and the balance flip start firing | UPDATE | Movement cell | Order underway | Floor | Truth on the line | S–M |
| C-04 | `record_project_ffe_installed` (only from `delivered`), plus a "Mark installed" act and a multi-select | UPDATE | Line unfold, FF&E section | Install day | Floor | Close-out clears | S |
| C-05 | `set_project_ffe_line_commercials`: **vendor and trade cost only**, on lines not yet on a PO. Rewire the two throwing hooks. Client price stays out (**R1/R5/R8**) | UPDATE | Line unfold | An off-catalog buy | Floor | Buy anything | M |
| C-06 | `po-send` resolves spec fields spec → product, mirroring `resolveSpecValue` | UPDATE | Vendor PDF | PO goes out | Floor | The right finish gets built | S |
| C-07 | Co-member send in `po-send` and `quote-request-send` (keep the 404 idiom). Also widen `assign_po_number`, which is owner-scoped (`M/00188:127-136`) and is called as the sender, so removing the `:236` check alone still fails. Needs a separate-context security review | UPDATE | Send | First hands | Floor | The hire can finish the job | M |
| C-08 | Orders book keeps `projectId` as a lens on Ledger, Week and Receiving, with an "all projects" link | UPDATE | Orders book | Chasing from a project | Floor | No hunting | S |
| C-09 | One send UI: `PoPreview` on the Created step, delete `PoSendActions`/`PoSendPopover`, add the note-to-vendor field | UPDATE | Assistant, unfold, Ledger | Every send | Floor | One way to do it | S |
| C-10 | `LogAckInline` in the unfold's PO cell | UPDATE | Line unfold | The vendor phoned | Floor | Act where you look | XS |
| C-11a | One readiness derivation that mirrors the DB and returns reasons in words. "Order all" uses it. Jobs with no agreement warn only (**R-PB1**) | UPDATE | Unfold, Vendors | Ready to order | Floor | The UI never offers a refused act | S–M |

**Phase 0 data:**
- Migrations: **00690** `purchase_order_header_rpcs.sql` (C-01, C-02, C-03, and the optional `can_send_purchase_order` helper for C-07), **00691** `ffe_mark_installed.sql` (C-04), **00692** `ffe_line_commercials.sql` (C-05).
- Edge functions: `po-send`, `quote-request-send`.
- The next free number, **00690**, was verified on main: the latest is `00689_board_cover_inner_guard_content_match.sql`. Numbers are provisional; reserve them at dispatch (patina-parallel-work).
- **Gate:** `pnpm --filter designer-portal type-check && pnpm --filter designer-portal test`; `supabase db reset` with new SQL tests per RPC; Deno tests for `po-send`; a signed-in local walk as a non-owner member: create → send → advance → receive → install.

### Phase 1 — updates (existing models, missing UI, or a table or column short)

| ID | Change | Tag | Surface | Moment | Stream | Promise | Size | Flag |
|---|---|---|---|---|---|---|---|---|
| C-11 | **Record what we paid.** Append-only `vendor_payments` + `studio_payment_methods` (last-4 only). `record_vendor_payment` / `void_vendor_payment`, lane-guarded against Stripe rows. `po_payments.state` becomes trigger-derived, and direct writes are revoked. Ledger Money band, unfold Money cell, Desk `payment_due` need. "Due to makers this week" front matter over its rows | OVERHAUL (path) + UPDATE | Ledger, unfold, Desk | Weekly bill run | Floor; precondition for Upside | Internal payables are the truth | M | `buying-payments-made` |
| C-12 | **Studio vendor accounts.** One row per studio and vendor: account #, rep, terms, deposit %, claims and inspection windows, orders-email override, portal URL, resale-cert date. It prefills the Assistant, and `po-send` uses its email. `trade_discount_pct` is held out until **R1** | OVERHAUL | Vendors → Terms, People | Hire's first order with an old vendor | Floor | The studio's own data, no asking Leah | M–L | `studio-vendor-accounts` |
| C-13 | **Studio receivers / locations.** `studio_locations` (receiver, studio, workroom, storage, site), hanging off rolodex company cards, with one default receiver. `purchase_orders.ship_to_location_id`; the text stays as the printed snapshot. The C-02 picker lists receivers first | OVERHAUL | Order Assistant, People | Every PO | Floor | Goods go where they can be inspected | M | `studio-receivers` |
| C-14 | **Unfold, six cells.** The buy · Quote · Order · Movement · Money out · Receiving, with one next act chosen by readiness | UPDATE | Line unfold | One piece, one question | Floor | No trip to the Ledger | M | rides C-11/C-15 |
| C-15 | **Read by maker.** A lens on the Project section: vendor → PO groups, trade column, PO foot sentence, a "No maker yet" group. Front matter over rows | UPDATE | Project section | The hire takes over buying | Floor | No side spreadsheet | M | `document-buying-readings` |
| C-16 | **Add to the job + the line card.** Ten rows under three heads. "The line, as it will be bought" pre-fills from the source, with an inline new maker (**R-PB4**), readiness words, and a client price only from a read retail price (**R-DI4/R5/R8**). Schedule import and vendor-quote staging wire to the existing backend through the deck-import review grammar | UPDATE | Add sheet | A piece arrives by any road | Floor | One place for anything | M–L | `buying-line-card`, `ffe-schedule-import` |
| C-17 | **Carry fields at intake.** Field-capture mint keeps SKU/finish/materials/colors/dims/trade (**00693**). The spec row is seeded from the product, with `field_provenance='product_master'` (**00694**) | UPDATE | Field → line, Spec Book | Field find | Floor | Nothing retyped | M | — (data fix) |
| C-18 | **Tracking on POs:** carrier, PRO/tracking, BOL, shipped date, ETA reason history | UPDATE | Movement cell, Week | "Where's the sofa" | Floor | Truth | S–M | `buying-tracking` |
| C-19 | **Receiving that sees.** Sign media URLs (fix `media.service.ts:197`, container deploy). Desktop photo input. Per-line count, condition, "noted on the BOL". Photo strip on claims | UPDATE | Receiving, portal 390 | Delivery day | Floor | A record, never a feed | M | `receiving-web-photos` |
| C-20 | **Claim clock.** Delivered + the vendor account's window gives one dated sentence on the row. Golden-ink when it passes. One Desk need the day before | UPDATE | Receiving, Desk | Delivery day | Floor | One dated sentence instead of a missed window | S–M | `buying-claim-clock` |
| C-21 | **Change orders UI** over `start_purchase_order_change`. Cancel and claim kinds ship first; price-bearing kinds wait for **R8** | UPDATE | Unfold, order paper | Backorder, cancel | Both | The client agrees to one direction | M | `buying-change-orders` |
| C-22 | **Notices become acts.** Fix the TS kind union (5 vs 7). Every procurement notice with an act becomes a Desk need that clears when the act is done. Replace the inert studio-owner policy. `procurement-clocks-daily` cron in pure SQL | UPDATE | Desk, Post | Monday morning | Floor | Never optimized for engagement | S–M | rides each feature |

**Phase 1 data:**
- Migrations, provisional numbers: **00693** field-capture mint carry · **00694** spec seed · **00695** `vendor_payments` + `studio_payment_methods` + revoke · **00696** `studio_vendor_accounts` · **00697** `studio_locations` + `ship_to_location_id` · **00698** PO tracking columns + RPC · **00699** notification kind enum adds (an enum split of its own) · **00700** notification writers, the clocks cron, and inspection per-line condition / BOL flag.
- Services: media container deploy for C-19.
- **Gate:** per-RPC SQL tests, especially the Stripe-row refusal in 00695; designer-portal type-check and test; the admin-portal build if `@patina/types` changes; Deno tests for touched functions; a signed-in local walk as a member.
- Flags fail closed and are verified in PostHog before enabling.

### Phase 2 — overhauls (new models)

| ID | Change | Tag | Surface | Moment | Stream | Promise | Size | Flag | Waits on |
|---|---|---|---|---|---|---|---|---|---|
| C-23 | **The order paper** replaces the four-step Order Assistant. It is the PO itself, editable in place: sidemark, requested ship date, ship-to picker, bill-to, freight terms, lines, riders, terms, a note to the vendor. One terminal act with the amount inside its label; one consequence sentence. The Patina-maker lane becomes `Order from Patina · $X` and goes to Stripe. A queue for "Order all" | OVERHAUL | Sheet over the job / Orders book | Committing studio money | Floor; protects Upside | The paper sent is the paper confirmed | L | `buying-order-paper` | — (V1 on the maker lane) |
| C-24 | **The custom piece.** A frame-and-fabric pair: parent line `parent_ffe_item_id`, COM spec on any line (`project_ffe_specs.com_spec`), a yardage helper that shows its arithmetic (the workroom's number wins), and `purchase_orders.supplies_purchase_order_id` (fabric PO → workroom PO, ship-to = the workroom). Submittals: CFA, strike-off, shop drawing, with dye lot and reserve expiry | OVERHAUL | Sheet, unfold | Specifying COM | Floor | Fewer reorders | XL | `buying-com-pair` | **V1/R1** on COM fabric markup |
| C-25 | **Purchase records** (`studio_purchases`): a store buy, a find, an expense. A payee name with no forced vendor, card last-4, tax as its own figure, receipt, return-by, buyer's premium. Recording moves the line to `ordered`. "Bill N unbilled purchases" | OVERHAUL | Add sheet, unfold, 390, composer | Flea market, retail run | Floor + Upside | Everything bought in one place | L | `buying-purchases` | **R-PB7** billing default |
| C-26 | **Riders and shipments.** `po_cost_lines` (freight, crating, liftgate, receiving, storage, payee may differ, estimate → actual, `billable_to_client`, `invoice_line_id`). `po_shipments` + lines (partials). Drafted receiving notice | OVERHAUL | Order paper, spine, composer | Month-end billing | Both | No hidden fees, studio to client too | L | `buying-freight` | **R1, R-PB7** |
| C-27 | **The acknowledgment check.** `po_acknowledgments` + `po_ack_lines`. Pre-filled WE ORDERED / THEY CONFIRMED (with QUOTED when a quote exists); words "agrees / differs"; the signed delta in money. `ack_state` on the PO. Drafted reply | OVERHAUL | Sheet, unfold, Ledger | The ack lands in the inbox | Floor; protects Upside | Catches the #1 loss quietly | L | `buying-ack-check` | **R8** for an accepted price change |
| C-28 | **Outbound drafts** (`procurement_drafts`, `awaiting_review`, one send fn through `sendCompliantEmail`), shared by C-26/C-27/C-30 | OVERHAUL | Desk, unfold | Every outbound word | — | No automated external sends | M | rides | Agent OS ruling before any agent composes |
| C-29 | **Quotes:** `vendor_quotes` + lines; requests linked to the job and lines; `apply_vendor_quote_to_lines` writes trade only | OVERHAUL | Unfold Quote cell, Vendors | Unfixed-price piece | Floor | A record, not a marketplace | M–L | `buying-quotes` | **R6, R8**; vendor self-entry is **R-PB8** |
| C-30 | **Exceptions overlay** (`procurement_exceptions`: damage, short, ack discrepancy, delay, backorder, discontinued, price change, each with a clock and basis) and the substitution chain (alternates → client decision → PO change → credit) | OVERHAUL | Unfold, Receiving, Desk | Backorder call, damage | Both | One agreed direction | L | `buying-exceptions`, `buying-substitutions` | **R5, R7, R8** |
| C-31 | **Client deposit, then balance**, plus riders and purchases in the composer. One billing slot per line and stage (`M/00187`) | OVERHAUL | Accounts | Fund before spending | Both | No hidden fees | M | `buying-client-deposits` | **R1, R7**; tax is a CPA matter |
| C-32 | **Held for release.** A studio setting, "Orders over $X wait for an owner or admin", off by default, using System B seats. The order paper's terminal becomes "Hold for release". A "Held for release" Ledger group and a Desk need for owners and admins. Release or send back with a note | OVERHAUL (new state) | Order paper, Ledger, Desk, 390 | Delegating money | Floor | Delegate without a new system | M | `studio-release-threshold` | **R-PB2, R-PB6** |
| C-33 | **Read by next act** (grouped by readiness reason or lifecycle step; empty groups are silent) | UPDATE | Project section | "What is each piece waiting on" | Floor | No side spreadsheet | S | `document-buying-readings` | **R-PB5** |
| C-34 | Install manifest + punch tied to a line; spec snapshot and revisions at send | OVERHAUL | Install section, PO | Install day, vendor change | Floor | Close-out without paperwork | M+M | — | R8 (revisions) |
| C-35 | Samples: return-by only (`sample_requests`, one Desk need). **The memo library is parked** | UPDATE-small | Unfold, Vendors | Narrowing a fabric | Floor | One quiet need | S | — | — |

Phase 2 migrations start at **00701** and get numbered at dispatch. Each table is additive, has RLS on, is scoped by `organization_id` with the `is_studio_comember` predicate, and takes money or status writes through SECURITY DEFINER RPCs. Every changed `@patina/types` triggers the admin-portal build gate.

---

## 8. The phased roadmap

```
Phase 0 · seams (~8–10 eng-weeks; sum of item sizes)     00690 00691 00692 · po-send · quote-request-send · ~9 portal files · no flags
  C-00 probe → C-01 ETA · C-02 ship-to · C-03 status · C-07 co-member send   (first week: these unblock everything)
             → C-04 installed · C-05 vendor/trade · C-06 PDF specs · C-08..C-11a

Phase 1 · updates (~12–16 eng-weeks; sum of item sizes)  00693–00700 · media container · flags per surface
  C-11 paid ─┐
  C-12 accts ┼→ C-20 claim clock     C-13 receivers → (C-19 photos, C-20)
  C-14 unfold · C-15 read by maker · C-16 line card + import · C-17 carry · C-18 tracking · C-21 changes · C-22 notices

Phase 2 · overhauls (5–7 months if all built)   00701+
  C-23 order paper → C-26 riders/shipments → C-24 custom piece + CFA
  C-27 ack check + C-28 drafts → C-29 quotes → C-30 exceptions/substitution (after R5/R8)
  C-25 purchase records · C-31 client deposits (after R1/R7) · C-32 held for release (after R-PB2/R-PB6)
  C-33 next act (after R-PB5) · C-34 install manifest · C-35 sample return-by
```

**Order within Phase 2:**
- The order paper (C-23) comes first, because riders, the COM link and "held for release" all render on it.
- Purchase records (C-25) are independent and can run in parallel.
- The board→order seam from the deck import is mostly closed (US-15 fixes SQ-384…387 are on main, D3 §3). The residue is lines with no trade cost, or with retail written as trade (`M/00435:203,234`). C-05 and C-11a make that residue visible as "needs a trade cost". The COALESCE flips to NULL only after Kody confirms **R-DI4**.

---

## 9. Rulings needed (none resolved here)

### Existing

| Ruling | Who | Touches |
|---|---|---|
| **V1 · margin pocket** | Kody | The maker lane beside studio lanes (C-23, C-14 money cell reads "Paid at checkout" only); COM through the maker lane (C-24); maker freight and fulfillment outcomes (never shown); the owner margin block's maker line |
| **R1 · who sees margin** | Leah practice / Kody default | Owner-only margin block; `trade_discount_pct` (C-12); rider and purchase billing (C-25, C-26, C-31); in/out on one row (never) |
| **R5 · client price below trade** | Kody | Substitutes (C-30); client price on the line card (C-16) |
| **R6 · price-age thresholds** | Leah | Quote valid-until (C-29). Until it rules, show dates only, with no age glyph |
| **R7 · the client and dates** | Leah, counsel | Delay notes (C-18, C-30); deposit wording (C-31) |
| **R8 · post-sale edits** | Kody | Accepting an ack price change (C-27); applying a quote to an authorized line (C-29); price-bearing change kinds (C-21); revisions (C-34) |
| **R9 · the floor (posture)** | Leah | This direction assumes R9's draft posture, "warn, never block", for money, pending Leah's ruling. Missing facts (no vendor, no ship-to) do block |
| **R-DI4 / R-DI5** | Kody | Trade stays empty on imported or clipped lines; V1 on off-marketplace pieces |
| **V10 extension** | Kody | Any vendor writing a quote or ack through a tokened link |
| **Agent OS · studio review of agent drafts** | Kody | No Designer-Taught Intelligence composes drafts until a studio member can review agent output (`agent_tasks` is admin-only, `M/00297:203-206`) |

### New

| ID | Question | Proposed default (not decided) | Who |
|---|---|---|---|
| **R-PB1** | Does an order on a job with no agreement require the client's yes? Options: (a) warn only, (b) require an approval record, (c) require a paid client invoice | (a), with a consequence sentence | Leah practice / Kody gate |
| **R-PB2** | Does Patina offer an in-studio release threshold? Per order or per vendor? Do admins release? | Offer it, off by default, per order, owners and admins release | Kody, Leah on practice |
| **R-PB3** | `po-send` with no ship-to: refuse, or default to the site with a visible line? | Refuse send; preview renders | Kody |
| **R-PB4** | Is a studio's new maker a studio card over a shared global `vendors` row (resolver first)? | Yes: resolve website → name, then card | Data lead / Kody |
| **R-PB5** | Does "read by next act" re-open the By Status view the R21 dissolve closed? | Allowed as a reading inside the Document | Kody |
| **R-PB6** | Which owner-ness gates margin and release: System A `studio_owner` (no one can grant it) or the System B seat? | System B seat, with a provisioning fix for System A | Kody |
| **R-PB7** | Billing default for riders, store buys, finds and reimbursables: product at client price, or pass-through at cost? | At cost, shown as its own line, until R1 rules | Leah practice / Kody |
| **R-PB8** | May a vendor write a quote or ack into the studio's record through a tokened link? | No, in v1 (studio-entered) | Kody (VISION) |
| **R-PB9** | Claim-window defaults when a vendor account has none (practitioner norms: vendor 72 h, carrier 5 days concealed) | 72 h vendor default, set per vendor | Leah |

---

## 10. Side journeys (log in `VISION-DECISIONS.md`, don't build)

- A memo and sample library or sample-box ordering. Return-by is kept (C-35).
- A job P&L screen. It is a dashboard unless it is front matter over rows, and it is blocked on R1/V1.
- Vendor reliability scores, on-time %, per-member order counts, a studio spend tile. All are refused by V11 (`VISION-DECISIONS.md:226-241`).
- A resale-certificate vault with state rules. Legal-gated; only the on-file date is kept.
- Client-facing order tracking beyond what the client page already mirrors. V8 governs that.

---

## 11. Risks, and what we did not examine

**Not examined:**
- **No live portal walk** (by ruling). Three findings are code-certain but runtime-unverified: the ETA write (C-01), the co-member send (C-07), and whether the mock fallback masks either one. C-00 exists for this.
- **No Leah interview.** Every practitioner number (claim windows, quote validity, fabric reserve, yardage overage, 40–300 lines per job) is a norm from R3, not her studio's practice. The fixture's prices and terms are invented.
- Not verified:
  - the PO PDF render itself
  - whether punch rows link to FF&E lines
  - the client mirror's read path for spec values (a risk for C-17's seed)
  - the full `apply_client_decision` body (C-30)
  - the `00424`/`00631` RFQ rails as a host for C-29
  - live Strata row counts for backfills (`designer_vendor_accounts`, `vendor_quote_requests`)
  - the studio-side depth of the maker checkout
- R4's competitor facts are secondary sources. Several are **[L]**.

**Risks:**
- **Engagement drift.** C-20, C-22 and C-32 add Desk needs. Each one must be one-shot, dated, and cleared by its act, with no counts or badges (V11).
- **Money tables.** Revoking direct writes on `po_payments` (C-11) must land after the RPC, and the Stripe-row refusal is the key test.
- **Vendor-facing paper changes** (C-02, C-06, C-12 email override). Old POs must still re-send.
- **Security review in a separate context:** C-07 (auth) and C-19 (signed-URL scope across studios).
- **Scope.** Phase 2 is 5–7 months if every overhaul ships. The order paper, purchase records and the ack check carry most of the value. The COM pair is the open ground but has thin data at first ("an empty room", VISION.md:76).
- **R21 regression.** C-33 must not bring back a route.
