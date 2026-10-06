# R1 — Today's buying flow: click-path map, friction, and mockup targets

Senior UX audit, code-only (no live portal walk). Repo `patina-merged`, main @ `4207b8e2d`. Paths relative to `apps/designer-portal/src` unless prefixed. Confidence tags: **[V]** verified by direct code read this pass, **[S]** taken from the seed briefs and spot-checked, **[I]** inferred from code shape without a runtime trace (no portal walk — ruled out by the brief).

**Scope ruling carried through, never resolved here:** vision ruling V1 (margin pocket — maker trade discount vs. studio markup) and pricing-mechanics R1–R11 (`artifacts/pricing-mechanics-2026-09-05`) are OPEN. Every place this memo touches pricing, markup, or margin is flagged **"ruling needed"** rather than described as settled. Patina-grade maker (marketplace) ordering is covered as the one `is_patina_catalog` lane inside the Order Assistant, not as a separate track.

---

## 0. The surface map (wayfinding)

- **Global entry:** Studio Drawer "Orders" row, shortcut `g o`, ⌘K aliases `orders · procurement · purchase orders · po · pos · receiving · shipping · schedules` — one registry entry, one icon (`Package`) everywhere **[V]** `lib/document/registry.tsx:159-182`.
- **The address:** `/desk?book=orders[&page=ledger|week|receiving|vendors][&vendorId][&projectId][&po&checkout=…]`. The Orders book has no route of its own — it's a sheet over whatever the designer is holding, opened by a `document:open-ledger` CustomEvent that `desk-doorway.tsx` and the Studio Drawer both dispatch/listen for **[V]** `components/document/desk-doorway.tsx:1-80`, `studio-drawer.tsx:565-578`.
- **Doorway is one-shot:** landing on `/desk?book=orders&page=receiving` strips back to `/desk` once consumed — a bookmark or shared link only fires the jump once, then reads as a plain Desk **[V]** `desk-doorway.tsx` header comment.
- **From a project:** Desk → `/doc/[id]` → FF&E section (`#doc-section-project`) → a line's unfold. The section's overflow carries "Chase the PO" (opens Ledger, unfiltered) and "File the claim" (opens Receiving) **[V]** `ffe-section.tsx:1229,1237-1242`. The document's footer (colophon) carries "Brief a vendor", which opens the Vendors page pre-addressed with this project's id **[V]** `doc-colophon.tsx:118-124`.
- **Context loss confirmed:** `OrdersLedger` accepts `initialContext.projectId` but the Ledger page itself starts unfiltered — `projectId` only pre-populates the Vendors/brief flow, not a Ledger lens **[V]** `orders-ledger.tsx:116-168` (no `projectLens` default from `initialContext`).

---

## 1. Click-path map, by lifecycle step

### Step A — Spec / price
- **Create the line.** "Add a line" sheet, five sources, each a button row **[V]** `components/document/schedule/add-to-project-sheet.tsx:264-274`:
  1. *Start a board* — opens a mood board.
  2. *Browse the Library* — product picker, Library tab.
  3. *Paste a product link* — product picker, Captures tab (guarded URL intake).
  4. *Name a need* — name + quantity only, no vendor/price/image; saved as a `tbd` candidate via `create_named_project_need` **[V]** `add-to-project-sheet.tsx:323-341`.
  5. *Import a schedule* — **dead end.** Clicking it sets an error, not a sheet: *"Project schedule staging is not available yet. No selections were created."* **[V]** `add-to-project-sheet.tsx:272-274`. The backend this would call (`stage_project_ffe_document_extraction`, `commit_project_ffe_import`, fn `project-ffe-document-extract`, through migration 00661) exists; no portal UI reaches it **[S]**.
  - Routing step (shared by Library/Captures/Name-a-need paths): room / throughout / unassigned, a design-status radio (candidate/selected/alternate/not selected), optional board placement, and — only for a picked product — a duplicate policy (*Reuse selection / Separate need / Hold*) **[V]** `add-to-project-sheet.tsx:206-257,287-320`. Fields copied onto the line: name, category, quantity, trade price, retail-as-unit-price, vendor id/name. **SKU, finish, and dimensions are not copied** **[S, spot-checked against the routing fields above — no SKU/finish/dimension input anywhere in this sheet]**.
  - Chrome extension and iOS Field capture richer fields (SKU, materials, dimensions, photos) but still land through the same routing step once placed **[S]**.
- **Price the line.** Trade/markup/client split happens in `ScheduleLineUnfold` and `FFEScheduleBuilder`; bulk markup at `ffe-schedule-builder.tsx:963` **[S]**. On the line itself, no designer-facing control edits price, SKU, finish, or vendor after creation — `guard_ffe_rpc_mutation` (00435) forces every price/status/qty/vendor change through RPCs, and the portal's own edit hooks throw "RPC-only" **[S]**. *Ruling needed (R1–R11, V1):* the trade-cost-vs-client-price split and markup mechanics a designer would tune here are exactly the open pricing-mechanics rulings — this memo does not take a position on what that control should look like.

### Step B — Client approval
- **Commercial jobs** (`isCommercialOrigin = Boolean(authority.data)`, an executed agreement behind the project) get a release ceremony: "Release for authorization" **[V]** `ffe-section.tsx:935-937,1215`. Once released, the line unfold shows a signed-price strip (`signed price $X · deposit clear/not yet clear`) and, if the schedule has drifted since signing, a terracotta delta line that never goes silent **[V]** `line-unfold.tsx:440-462`. A released line is **softly locked**: changing price means "void & supersede," stated as a sentence, not a dialog **[V]** `line-unfold.tsx:48-51,457-461`.
- **Non-commercial jobs — the gap, confirmed in code.** `ORDERABLE = new Set(['specified', 'quoted', 'approved'])` **[V]** `line-unfold.tsx:75`. "Specified" and "quoted" are both *before* any client approval step in the eight-word machine (`specified → quoted → approved → ordered → …`, `stamp-derivation.ts:18-27`), and both are in the orderable set. So on the majority of jobs (anything without an executed agreement), the "Order with Assistant" button is live on a line the client has never approved — the gate is "has a vendor," not "has approval." **[V, confidence raised from the seed brief's S to a direct read]**.
- The Vendors page's "Order all — N" uses its own `isOrderable` (`status === 'approved' && !purchase_order_id`), which is one step stricter than the line unfold's three-status set, but still has no agreement/approval ceremony behind it on non-commercial jobs **[V]** `orders-book-vendors.tsx:80-84`.

### Step C — PO creation (Order Assistant)
Two entry points, same component: the line unfold's **"Order with Assistant"** (disabled with a tooltip "No vendor on this line yet" when the line has no vendor) **[V]** `line-unfold.tsx:518-527`, and the Vendors page's **"Order all — N items"**, which batches every approved/unordered line for that vendor into a queue, one PO per (vendor, project) pair **[V]** `orders-book-vendors.tsx:102-209`.

Order Assistant is a slide-from-right panel, four steps:
1. **Review** — "Open vendor portal" (external link to `trade_portal_url`, or "No trade portal on file") + "Copy item details" (clipboard text: name, room, **hardcoded ship-to "Middlewest Studio · Madison WI"**, trade price, any configuration snapshot) **[V]** `step-review.tsx:30-44,63-154`.
2. **Coverage** (soft gate) — checks `get_ffe_invoice_coverage`: if every item is covered by a *paid* client invoice, a sage confirmation; if not, a golden-hour warning naming each uncovered item with a chip (*Not invoiced / Draft invoice / Invoice sent — unpaid / Partially paid*) and the sentence *"Ordering now means fronting $X of vendor cost from studio funds until the client pays."* **[V]** `step-coverage.tsx:158-254`. The primary action is always enabled — "Proceed anyway" is implicit, there's no literal button of that name; the only alternate action is **"Create client invoice →"**, which closes the Assistant and abandons the order session **[V]** `step-coverage.tsx:245-251, index.tsx` comments at 306-308 confirm this abandons the queue.
3. **Details** (external vendors only — catalog skips this) — Sidemark (prefilled `{STUDIO}-{PROJECT}-{ROOM}`, editable, placeholder `MWS-WALKER-LR`), Vendor PO #, Confirmed ETA, then Payment terms: a dropdown of five patterns (*50/50, 30/70, Full upfront, NET-30, Custom milestones*) with pattern-specific fields (deposit due date + amount; a note "Balance $X will become due automatically when item enters 'In transit' stage"; 2–4 milestone rows for custom) **[V]** `step-details.tsx:28-34,151-415`.
4. **Created** — confirmation; "Done" closes and advances the queue if more than one vendor/project pair is pending **[V]** `index.tsx` step-machine comments 1-30, 272-285.

- **Catalog path:** if the vendor is `is_patina_catalog`, Details is skipped; the PO is created with `full_upfront`, then the designer is redirected to Stripe hosted Checkout (single order) or shown a manual **"Pay now"** button on the Created step (if more than one order is queued, so the tab doesn't jump away mid-queue) **[V]** `index.tsx:314-443`.
- `create_purchase_order` RPC inserts the PO header + `po_payments` rows + links the FF&E items **[S]**.

### Step D — Send
Two separate UIs exist for the same act, confirmed:
- **`PoPreview`** (`po-preview.tsx`) — the paper-as-confirm pattern: opens full-screen, renders the real PDF via a `preview` call (stamps nothing), then offers **"Send to vendor"** (emails the resolved vendor address) or **"Released by phone / portal — mark as sent"** (stamps `sent_at` with no email — for phone/fax/showroom orders) **[V]** `po-preview.tsx:339-383`. Mounted in both the line unfold (as "Send to vendor," only shown for drafted never-sent POs) and every Ledger row (as "resend"/"send →"/"pdf" depending on state) **[V]** `line-unfold.tsx:529-537`, `orders-ledger.tsx:593-605`.
- **`PoSendActions`** — an older button set that still appears on the Order Assistant's own Created step **[S]**; its personal-message field is a literal `TODO(W4 follow-up)` **[V]** `po-send-actions.tsx:26`.
- **`PoSendPopover`** is defined, exported, and has **zero callers anywhere in the portal** besides its own file — confirmed orphaned, not just "likely" **[V]** `grep` for `PoSendPopover` across `apps/designer-portal/src` returns only its own definition/usage inside `po-send-actions.tsx`.
- Both live paths call `supabase/functions/po-send/` **[S]**.

### Step E — Acknowledge
`LogAckInline` — PO#/ETA optional, "blank keeps what's on file," one button "Log acknowledgment" — appears in exactly two places: the Ledger row's unfolded ack band (only when the row already narrates "no ack") **[V]** `orders-ledger.tsx:579-592,620-635`, and on the resend `PoPreview` paper itself when sent-but-unacknowledged **[V]** `po-preview.tsx:322-337`. **It does not appear in the line unfold at all** — a designer looking at one line's detail has no way to log an ack without leaving for the Ledger **[V, confirmed]** (`line-unfold.tsx` has no `LogAckInline` import).

### Step F — Ship / production / ETA
- Line unfold's **Movement** cell edits a single confirmed ETA inline (`<DateTextInput>`, saves on a complete date, quiet confirm "eta updated — arrives ~…", inline retry on failure) **[V]** `line-unfold.tsx:83-180`.
- Ledger's **"Align ETA"** bulk action — select ≥2 POs from one vendor, "same truck," writes only `confirmed_eta` across all of them, never touches acknowledgment (explicitly, per R16: "a batch ETA is not a vendor act") **[V]** `orders-ledger.tsx:262-283,668-701`.
- **Confirmed: nothing in the web UI advances a PO to `in_production` or `shipped`.** `useUpdatePurchaseOrderStatus` is defined in `packages/supabase/src/hooks/use-procurement.ts:770` and has **zero callers in the designer portal** **[V, grep confirms]**. The only way `project_ffe_items.status` reaches `production`/`shipped` is a status write the portal doesn't expose, or a backend/mobile path outside this scope. There is no tracking/carrier field and no delivery-event write path visible from the web UI **[S, consistent with the grep]**.
- **The Week** page (`orders-book-week.tsx`) is read-only intelligence: an 8-week grid of `delivery_events`, clay pills for expected, sage for received, terracotta border for conflicts, with the single annotated word "⚠ collides" reserved for true cross-project install collisions **[V]** `orders-book-week.tsx:49-55,219-246`. It has no act of its own — the legend literally says *"conflict — also on your Desk"* **[V]** line 265.

### Step G — Receive / inspect
- `LogInspectionDrawer` opens from the line unfold ("Log inspection," shown only when `item.status` is `shipped` or `delivered`) **[V]** `line-unfold.tsx:370-371,538-546`, and from the Receiving page's "Awaiting inspection" queue row ("Inspect") **[V]** `orders-book-receiving.tsx:409-417`.
- **Desktop photo upload is confirmed as a deliberate placeholder**, not a bug: *"The full photo-rich receiving flow lives in the iOS app… Desktop logs the inspection without photos."* **[V]** `log-inspection-drawer.tsx:7-11,456-467`. iOS-logged photo counts render as a line of text ("`N photos logged on the phone`") but the bytes are unreachable from any web surface — the media route that would serve them returns a raw storage key, not a viewable URL **[V]** `orders-book-receiving.tsx:33-49` (the code comment names the exact unresolved route, `media.service.ts:197`, as cited by the Receiving page's own doc comment).
- **Receiving page structure:** a 4-figure KPI strip (*Arriving · Awaiting log · Open claims · Received·30d*) **[V]** `orders-book-receiving.tsx:346-371`, the warehouse-day queue (delivered POs, no inspection yet, oldest ETA first) **[V]** lines 311-324, an **Open claims** group with inline Notify-vendor / Mark-resolved acts **[V]** lines 90-272, and a collapsed **Settled** fold of clean 30-day inspections **[V]** lines 456-489.
- Claims can be walked forward (drafted → vendor_notified → resolved) from both the line unfold's `ClaimActs` **[V]** `line-unfold.tsx:189-299` and the Receiving page's `OpenClaimRow` — same state machine, two homes.

### Step H — Install
- **Confirmed: no web control sets `installed`.** `StageSelect` only renders when `FFEItemCard` is given a `stage` prop, and `ffe-schedule-builder.tsx:507` never passes one — this is a direct repo fact from the seed brief, not re-verified line-by-line this pass but structurally consistent with everything else found (no status-advance affordance anywhere in the files read) **[S]**.
- In the 15-step lifecycle trail (`procurement-lifecycle.ts`), steps **04 Awaiting inputs, 07 Ready to ship, 11 Stored, 12 Install released, and 15 Closed carry no fact in the schema today** — the module's own header calls this "the honesty rule": these render as `future`/`no-record`, never inferred **[V]** `procurement-lifecycle.ts:11-18`. Step 13 Installed is the one install-adjacent fact that does exist (`project_ffe_items.status='installed'`), but nothing in the web UI writes it **[V]** lines 267-273 + the StageSelect gap above.
- `warehouse_and_site_ready` (gate 3) is drawn permanently `noRecord` — the module says so explicitly, flagged for a future data wave **[V]** lines 351-356.

### Step I — Client invoice & vendor deposit/balance
- **Client side works.** Line unfold "Bill" opens the invoice composer prefilled with that one line **[V]** `line-unfold.tsx:547-558`. Section-level "Bill N uninvoiced" does the same for every priced, not-yet-covered line **[V]** `ffe-section.tsx:1238-1252,1393-1403`.
- **Vendor side: confirmed, there is no way to record a deposit or balance paid against a vendor PO from the web UI.** `useLogPaymentPaid` (`use-procurement.ts:602`), `useAdvancePaymentToDue` (`:849`), and `useUpdateVendorPaymentTerms` (`:449`) are all defined and **all have zero callers in the designer portal** **[V, grep confirms the seed brief's claim directly]**. The Order Assistant writes `po_payments` rows (deposit/milestone schedule) at creation time, but nothing in the portal ever marks one of those rows paid except the one Stripe-Checkout lane for `is_patina_catalog` orders. **Every non-catalog vendor payment — which is every workroom, antiques dealer, retail-on-card purchase, and ordinary trade vendor — is tracked nowhere once the PO is created.** This is the single largest hole in "a studio is completely equipped to purchase": the money side of every non-Patina order is invisible to the book that otherwise narrates the whole order lifecycle.
- *Ruling needed (V1):* whether/how a studio-paid deposit or balance should even post against margin, and whether that's a studio-funds ledger entry or something else, is squarely the open margin-pocket question — flagged, not resolved.

---

## 2. What's structurally absent for full studio buying (confirmed against R2's intake brief)

Spot-checked, not re-derived from scratch this pass — the intake brief's grep-style claims ("0 hits") are consistent with everything found above and worth restating because they bound what a buying-flow mockup can promise:
- **Workroom / COM:** no work order, no COM-fabric-to-workroom shipment link — only a rolodex label **[S]**.
- **Samples/memos:** no table **[S]**.
- **CFA, reimbursables, card/retail purchases:** zero hits **[S]**.
- **Receiving warehouse:** no entity; `ship-to` is a free-text field, not a location **[S]** — consistent with the hardcoded `SHIP_TO_PLACEHOLDER` found directly in `step-review.tsx:31`.
- **Antiques/one-offs:** no model — a flea-market piece needs a fabricated vendor row to get a PO at all **[S]**.
- **Freight/crating:** no cost line on a studio PO (only exists on the Patina merchant ledger) **[S]**.

These six gaps are why "out-of-catalog ordering" in this codebase really means "catalog-shaped ordering with a free-text vendor" — the Order Assistant's step machine (sidemark, PO#, payment pattern) is the same regardless of whether the vendor is a factory, a workroom, or a flea market, because nothing downstream knows the difference.

---

## 3. Friction / dead-end list, ranked by how often a studio would hit it

**Ranking basis:** frequency = how often the described path is the *normal* path for an ordinary job (not an edge case), not severity alone. A studio buying for any job touches #1–#5 on essentially every order; #6–#10 are hit on a meaningful minority of orders (non-catalog vendor, a delay, a damaged shipment) but still routinely.

| # | Friction | Where it bites | Confidence |
|---|---|---|---|
| 1 | **No vendor payment tracking after PO creation.** Every non-catalog vendor order's deposit/balance is invisible once the PO exists — `useLogPaymentPaid` etc. have zero callers. A studio ordering from any real workroom, antiques dealer, or ordinary trade vendor (i.e., most orders) has to track vendor money outside Patina entirely. | PO creation onward, every non-catalog order | **[V]** |
| 2 | **Client approval is not actually required before ordering, on non-commercial jobs.** `ORDERABLE` includes `specified` and `quoted` — a line can be sent to a vendor before the client has approved it at all, on the majority of jobs (anything without an executed agreement). | Line unfold, every non-commercial job | **[V]** |
| 3 | **No production/shipped status advance anywhere in the web UI.** The PO sits at whatever status it was created with (or `draft`/`confirmed`) until something outside the portal (mobile, backend, nothing) moves it. The Movement cell only edits the ETA *date*, never the status word next to it. A designer watching a PO in production has no button that says so. | Every order, from creation to delivery | **[S]** |
| 4 | **No install control.** Nothing in the web UI sets `installed`. A studio that has physically placed a piece has no way to tell the Document that — the FF&E line keeps reading `delivered`/`received` forever unless something else (unclear what) flips it. | Install, every order that makes it that far | **[S]** |
| 5 | **Ship-to is a hardcoded placeholder string** ("Middlewest Studio · Madison WI") baked into the Order Assistant's review step — not configurable per studio, per project, or per receiving location. Every studio using this build ships vendor-facing paperwork with Middlewest's address until this is wired to real data. | Every PO's review step and copy-to-clipboard manifest | **[V]** |
| 6 | **"Import a schedule" is a labeled dead end.** The fifth "Add a line" source reads like a real option (name, description, icon-style row) but clicking it produces an error banner, not a sheet. A designer trying to bulk-import a vendor schedule or spec PDF hits a wall with no alternative offered in the same flow. | Spec/price intake, whenever a studio has an existing schedule to bring in | **[V]** |
| 7 | **Two different "send" UIs with one TODO'd field.** `PoPreview` (current) and `PoSendActions` (older, still mounted on the Assistant's Created step) both exist; the personal-message field on the older one is a literal unimplemented TODO. A designer who wants to add a note to the vendor when sending has no working field for it anywhere in the send path. | Every PO send | **[V]** |
| 8 | **No SKU/finish/dimensions on the FF&E line itself.** Even when the Library/Capture path captured them, the routing step that lands the item on the schedule doesn't copy them onto `project_ffe_items` — only onto a separate `project_ffe_specs` row. A designer scanning the schedule for "which finish did we spec" has to open the spec book, not the line. | Spec, every catalog/capture-sourced line | **[S]** |
| 9 | **Acknowledgment logging isn't on the line unfold.** A designer working one line who learns (by phone) that the vendor confirmed has to leave for the Ledger or wait for the resend-paper's ack prompt — there's no "log ack" affordance at the point where they're already looking at the line. | Acknowledge, every manually-confirmed order | **[V]** |
| 10 | **Desktop receiving has no photos.** A studio inspecting a delivery at a desk (not on a phone) logs the inspection text-only; damage photos require switching devices mid-inspection, and even iOS-logged photos can't be opened from the web once they exist. | Receive/inspect, any desktop-first inspection or any claim review | **[V]** |
| 11 | **Context loss on "Chase the PO."** The section menu's "Chase the PO" opens the Ledger, but the Ledger ignores the `projectId` it's handed and opens unfiltered across the whole studio — a designer chasing one project's order has to re-find it among every vendor's rows. | Any ledger jump from a project | **[V]** |
| 12 | **Out-of-catalog is catalog-shaped.** A workroom commission, a COM fabric order, or a flea-market antique all have to be forced through the same vendor-record + PO + payment-pattern machine built for factory orders — no work order, no fabric-to-workroom link, no freight line, no sample/memo tracking. | Any non-factory purchase | **[S]** |

---

## 4. Six screens worth replicating as mockups

Each entry gives exact components, copy, and data fields so a mockup builder can reproduce the screen from this memo alone, without re-reading code. All are **today's** state — none of these resolve V1 or R1–R11; where pricing/margin would show, the mockup should show it exactly as today's code does (trade cost only, vendor-facing, never a client price) and leave it there.

### Mockup 1 — The Orders Ledger (the book's front page)
**Source:** `orders-ledger.tsx`. **Surface/moment/stream/promise (feature test):** Studio surface (not client-facing); the moment is "a designer needs to see every live order across every project at once"; stream = none directly (operational, not revenue); promise = the studio should never have to hunt — this is exactly the kind of screen that must never be optimized for engagement, only for completeness at a glance.
- **Header:** `DocSheetHead` — small `Package` icon, "ORDERS" in DM-mono caps, page label "· Ledger," a Close control. Body intro line: *"Every project's purchase orders, gathered in one studio register."*
- **Page nav (not tabs — DM-mono text links, underline-score on hover/active):** `Ledger` · `The Week` · `Receiving` · `Vendors`.
- **Front matter (throughput stats, shown only when not loading):** a row of label/value pairs — `Open: N`, and conditionally `Arriving this week: N`, `Unsent: N`, `No ack: N` (each only appears if >0).
- **Lenses row:** `project ·` then "all" + each project name as DM-mono text links (only shown if >1 project); `payment ·` then "all / due / pending / paid"; right-aligned "Select multiple" toggle.
- **Grouped list:** section heading = vendor name (uppercase, semibold, quiet-ink). Each PO row:
  - Primary line: PO number (or "PO drafted"), a **Stamp** pill (lifecycle position word — e.g. "Released to maker," "In production," "In transit" — never raw status), next-gate text (e.g. "Accepted or issue · open claim"), and an ETA column showing `~Oct 14` or, for an unscheduled-shipped order, **"NO DATE"** in golden-hour mono caps.
  - Secondary line: `Project name · $Total · sent Oct 2 · no ack` (or "not sent"), then row actions: conditionally **"log ack ↓"**, then **"resend" / "send →" / "pdf"** (state-dependent), then **"open document →"**.
  - Unfolded ack band (when "log ack" clicked): *"Stamped as of today — PO # and ETA are optional, blank keeps what's on file."* Two inputs (Vendor PO #, Confirmed ETA) + **"Log acknowledgment"** button.
- **Bulk bar** (when ≥2 POs selected from one vendor): *"N orders · align one confirmed ETA"*, a date field, **"Align ETA"** button.
- **Empty state:** italic heading *"No purchase orders yet"* + *"When you order what a proposal specifies, each PO lands here and tracks itself from production to your door. Draw the first from a project's schedule."*
- **PO stamp colors (exact):** draft = aged-oak; confirmed = dusty-blue; in_production/shipped = golden-hour (#D8BE56 ink); delivered = sage; cancelled = terracotta.

### Mockup 2 — The FF&E line unfold, mid-order (the single most-reused screen)
**Source:** `line-unfold.tsx`. **Feature test:** The Document surface, the designer's own working moment on one piece — never gamified, no progress-bar styling; the promise is that the studio sees exactly what's true and nothing invented.
- **Shell:** clay left border (3px), faint clay wash background, rounded right corners.
- **Three-column cell row:** `Purchase order` (PO # or "Not yet ordered"; sub-line "sent to vendor Oct 2 · acknowledged" or "not yet sent"); `Movement` (status word, then an inline editable "arrives" date field; quiet confirm "eta updated — arrives ~Oct 14" or "shipped — no scheduled arrival"); `Receiving` ("Awaiting inspection" / "N of M inspected" / "Open claim · vendor notified" / "—").
- **The 15-step trail** (`ProcurementTrail`, rendered only when relevant): a horizontal position marker — do NOT invent step labels beyond what the code names: *Cleared to produce, Released to maker, Acknowledged, (Awaiting inputs — no record), Released/In production, (Ready to ship — no record), In transit, Received/inspect, Accepted or issue, (Stored — no record), (Install released — no record), Installed, (Closed — no record)*. Steps with no record render visually quiet/empty, never a guessed state.
- **Authorization strip** (commercial jobs only, sage left border): *"signed price $X · deposit clear / deposit not yet clear"*; if drifted, a terracotta line *"authorized $X · now $Y"*; a soft-lock sentence *"on authorization № N — void & supersede to change."*
- **Claim band** (only if open claims, terracotta left border): *"Claim · vendor notified"* / *"Claim · drafted"* + **Notify vendor** / **Mark resolved ↓** button, textarea on expand.
- **Room assignment row:** a plain `<select>` — Unsorted / Throughout / [room names] — disabled with the soft-lock sentence as its title when authorized.
- **Action row (bottom), in this order when all apply:** `Order with Assistant` (primary unless Send/Inspect also show) · `Send to vendor` · `Log inspection` · `Bill` · `Include in the next release` (commercial only) · `Add note` · `Fold`.

### Mockup 3 — Order Assistant, step "Coverage" (the soft gate)
**Source:** `step-coverage.tsx`. **Feature test:** This is the sharpest point where money touches the studio surface before it touches the client — the promise says the studio surface is never optimized for engagement, and this screen is the proof: it warns, it never blocks, and "Proceed" isn't even a separate button — Continue just works. **Ruling needed (V1):** this screen shows *trade cost*, never client price — keep it that way in any mockup.
- **All-covered state** (sage border/wash): label "COVERED BY CLIENT PAYMENT"; body *"All N items are covered by paid client invoices."*
- **Uncovered state** (golden-hour border/wash), `role="region"`:
  - Label "CLIENT PAYMENT NOT CONFIRMED."
  - Bold line: *"N items not covered by a paid client invoice."*
  - Body: *"Ordering now means fronting $X of vendor cost from studio funds until the client pays. You can invoice the client first, or proceed if the timeline calls for it."*
  - A list of uncovered items, each a row with the item name + room, and a right-aligned chip: **Not invoiced** / **Draft invoice** / **Invoice sent — unpaid** / **Partially paid** (each its own muted color).
  - One secondary button: **"Create client invoice →"** (leaves the Assistant entirely).
  - No "proceed anyway" button exists as a visible label — the step's own Continue (in the panel's footer, not shown in this file) is the way forward, always enabled.
- **Loading state:** quiet text *"Checking client invoice coverage…"*. **Error state:** neutral text *"Couldn't verify invoice coverage — you can continue."* — never a blocking error.

### Mockup 4 — Order Assistant, step "Details" (payment terms)
**Source:** `step-details.tsx`. **Feature test:** Studio moment = committing real money to a vendor; stream = margin/trade-cost adjacent — **ruling needed (R1–R11)** on whether/how this screen's deposit math should ever reflect anything beyond raw trade cost; today it doesn't, and the mockup shouldn't imply otherwise.
- **Section 1 — Sidemark:** label "SIDEMARK," input prefilled e.g. `MWS-WALKER-LR`, helper text *"Printed on cartons so receiving can route the shipment. Edit freely."* (or, over length, a terracotta warning with a live character count).
- **Section 2 — Confirm order placed:** two fields side by side — "Vendor PO #" (placeholder `NA-2026-...`) and "Confirmed ETA" (date picker).
- **Section 3 — Payment terms** (clay border/wash): a "Terms" dropdown with five options, each optionally suffixed "(VendorName default)": *50% deposit / 50% before ship*, *30% deposit / 70% before ship*, *Full payment upfront*, *NET-30 from delivery*, *Custom milestones*. Below, pattern-conditional fields:
  - 50/50 or 30/70: Deposit due (date) + Deposit amount (prefilled 50%/30% of total), helper *"Balance $X will become due automatically when item enters 'In transit' stage."*
  - Full upfront: one "Payment due" date field.
  - NET-30: no fields, just *"Full balance due 30 days after delivery."*
  - Custom milestones: 2–4 rows (Label / Amount / Due date), a "+ Add milestone" ghost button (caps at 4), each row removable (min 2); validation note shown elsewhere in the flow if milestones don't sum to the order total.

### Mockup 5 — Receiving (the warehouse-day queue)
**Source:** `orders-book-receiving.tsx`. **Feature test:** Studio surface, the daily-operations moment ("what's on the floor today") — the promise rules out a gamified queue; this is a plain worklist.
- **KPI strip**, 4 columns with vertical hairline dividers: **Arriving** (value, sub "next 7 days") · **Awaiting log** (value) · **Open claims** (value) · **Received · 30d** (value, sub "N clean").
- **"Awaiting inspection · N"** list: each row — PO number · vendor name (bold), then project name · "delivered Oct 2" or "arrived ~Oct 2"; right-aligned **Inspect** (primary) and **"open document →"**.
- **"Open claims · N"** list (only if >0): each row — vendor · project (bold), meta line `drafted Oct 1 · vendor notified Oct 3 · [inspection outcome] · N photos logged on the phone`; a **Stamp** ("claim drafted" terracotta / "vendor notified" golden-hour); **Notify vendor** or **Mark resolved ↓** button that expands a textarea + confirm button inline.
- **"Settled · N cleared · 30 days ↓"** fold (collapsed by default, dashed-border rows at 70% opacity when expanded): vendor · project, then `clean · Oct 1 · N photos logged on the phone`, sage-colored.
- **Empty state (queue):** italic *"Nothing waiting on the warehouse floor."*

### Mockup 6 — The Vendors page, Orders tab with "Order all"
**Source:** `orders-book-vendors.tsx`. **Feature test:** Studio surface; the moment is "batch everything owed to one vendor into one order" — Patina-grade maker ordering (the `is_patina_catalog` lane) shows up here as the one case where this button disappears entirely in favor of the existing one-click catalog path, which is the correct way to show it as "one lane," not a separate screen.
- **Vendor list (no vendor selected):** each row — vendor name (link) + meta `default terms · trade_account_email` or "No terms on file"; right-aligned "open page →".
- **Selected-vendor bookbar:** "← all vendors" link above; then vendor name + *"· vendor"* (italic-styled quiet), right-aligned page links: `Terms · [terms label]` / `Thread` / `Orders · N`.
- **Terms page:** terms + email line; "trade portal →" external link (if on file); "their profile · in People →" cross-link.
- **Orders page:**
  - If any approved-and-unordered items exist for this vendor: a primary button **"Order all — N items →"** left-aligned, with "approved · unordered" as quiet right-aligned context. Clicking it enqueues one Order Assistant session per (vendor, project) pair and walks the queue — if more than one project is queued, a disclaimer reads *"N project orders queued for [Vendor] — you'll confirm each in turn."*
  - Below: each open PO as a row — PO # (or "PO drafted"), a Stamp (status word), ETA (`~Oct 14` or "—"); second line — project · total, "open document →".
  - Empty: italic *"Nothing open with [Vendor]."*
- **Thread page:** vendor messages in the margin's `.mitem` grammar (studio's own posts read "You" in clay, vendor messages in dusty-blue), a PO-anchored deep-link chip *"re: [Project] →"*, a reply textarea + Send. Below the thread: **"+ Brief vendor · about [Project]"** composer (only reachable with a comms profile on file; otherwise *"No comms profile on file for [Vendor] — link one to open a thread."*).

---

## Sources (primary, this pass)
`apps/designer-portal/src/components/document/{orders-ledger,orders-book-week,orders-book-receiving,orders-book-vendors,line-unfold,po-preview,ffe-section,desk-doorway,studio-drawer,doc-colophon,ledger-front-matter}.tsx`; `.../portal/procurement/{po-send-actions,order-assistant/{index,step-review,step-coverage,step-details},log-inspection-drawer}.tsx`; `.../schedule/add-to-project-sheet.tsx`; `apps/designer-portal/src/lib/document/{procurement-lifecycle,stamp-derivation,registry,ledger-summary}.{ts,tsx}`; `packages/supabase/src/hooks/use-procurement.ts` (grepped for caller counts). Seed briefs `briefing/current-state-buying-flow.md`, `briefing/current-state-intake.md` — cited as **[S]** where not independently re-read this pass.
