# US-50 live walk: FF&E buying as an untrained studio member (2026-10-22)

Environment: LOCAL only (Supabase 127.0.0.1:54321/54322; designer portal on :3400 via `walk/start-server.sh`; flags `the-document-pilot`, `procurement-workspace-pilot` forced on; data mode live). I could not read `apps/designer-portal/.env.local` (denied by a settings rule), so the server was started with the local demo keys from the tracked `playwright.config.ts` and the local URL, never a prod URL. No reset; INSERT-only seed (`walk/seed.mjs`, names prefixed "US-50 Walk"; one extra line, "Dining chair (set of 6)", inserted later for the partial-shipment test). Actor: `us50-member@patina.dev` (studio `member`); owner `us50-owner@patina.dev` used only for release. Screens: `walk/screens/` (1440 full/viewport, 390 phone), compressed with `sips -Z 1600`. Servers stopped at the end (portal :3400, `supabase functions serve`).

Stand-ins and limits (stated plainly):
- po-send and procurement-draft-send need the edge runtime, which was NOT running (503). I served functions locally with `EMAIL_DEV_MODE=dry_run` (no mail leaves the machine) and stopped it afterward. A real send was therefore NOT observed.
- Media service is not part of the local stack: the first photo attempt on the phone sat on "Uploading photos…" (26/28-phone-inspection-photo-bottom). Photo upload was then completed with the same route stub the US-16 e2e specs use (`/api/media/assets` answered with a stub asset row). Treat photo capture on a real phone as UNVERIFIED. The file input has `accept=image/jpeg,png,webp,heic` and NO `capture` attribute (does not open the camera directly) [H].
- Claude-in-Chrome not used; Playwright only. `capture.spec.ts` is a consolidated replay outline, NOT re-run as one pass; the real capture was done with `x1..x34.mjs` (same selectors) step by step. It is not idempotent (creates POs).
- Not walked: carrier-status auto-update (does not exist, see step 10), vendor reply by email, invoicing the client for the buys, deposit payment, the signed-agreement authorization flow.
- Raw screens from the first full-page captures show the fixed header/footer repeated mid-page (a capture artifact of `fullPage` with fixed bars), not a UI bug.

Legend: Discoverable = yes / hesitated / lost.

## Step log

### 1. Find where buying for this job starts
- Route: `/desk` then `/doc/{projectId}` (project page "Hartwell Residence"). Screens: 00-desk-1440, 01-document-1440, 02-pieces-overview-1440, 02v-pieces-overview-viewport-1440.
- Saw: the project page is a long document with sections Client approvals, Project schedule, "FF&E selections", Project financials, closeout. No section called "Buying", "Purchasing" or "Orders". Left rail item reads "Pieces · 6 LINES" (desktop). The section head reads "FF&E selections". Three names for one thing (Pieces / FF&E selections / Edit selections). Top of page says "Everything ordered is moving. Release the next room" while nothing has been ordered.
- Clicked: rail "Pieces" -> section expands with lines "001 …APPROVED $4,800". Head acts: "Edit selections →", "Add items", "Prepare purchasing authorization", "More ⌄". Status line "Selections are ready, but purchasing authorization is held" and "A signed agreement is required before purchasing authorization. Record signed agreement" (it does not actually block the Order button, see step 4: the member could order anyway) [H, observed].
- Discoverable: HESITATED. Nothing says "this is where you buy". On a phone (390) the rail is gone; entry is "Open project contents, at Client approvals" bottom sheet, then "Pieces" (22-phone-document-390, 23-phone-contents-menu-390, 24-phone-pieces-390). Lost-risk on phone: the FF&E section is collapsed under the page with only "Edit selections →".
- Status words: "6 LINES", "APPROVED", "nothing released", "Selections are ready, but purchasing authorization is held".

### 2. Add items to the job / buying list
- Route: same page. Screens: 37-add-room-selection-menu-1440, 37b-add-items-menu-1440.
- "Add room selection" at the foot of a room opens "ADD A LINE" (name, how many, rough $, "This piece takes COM") and lands as a candidate [H]. "Add items" (head) opens "ADD TO THE JOB": From the Library, Paste a link, From a photo (off), From a vendor's quote, Import a schedule, Bring in a deck, A custom piece ("Made by a workroom, with or without the client's fabric"), A find, A store buy, Name a need, Bought it already.
- Discoverable: HESITATED. Two different "add" doors with different power; "A find", "A store buy" and "Bought it already" overlap (the last holds Store buy / Find / Expense / Sample fee).
- Seed note: the 6 lines were INSERTed (the add flows were opened, not all executed).

### 3. Request a quote
- Route: line unfold, Quote cell. Screens: 03v-line-unfold-viewport-1440, 04-quote-open-1440.
- Saw: Quote cell reads "No quote recorded" with "Record a quote…". The form: "RECORD A QUOTE · maker", per-line unit trade, lead time, quote ref, good-through date, crating, freight estimate, terms, "The quote (PDF)", "Record the quote". It RECORDS a quote the maker already sent; nothing drafts a request-for-quote to the maker (GAP: no outbound RFQ) [H].
- Discoverable: yes (to find), but the verb "Record" vs the user's intent "Request" is wrong. Also "From a vendor's quote" in Add items is the import door.

### 4. Create the PO(s)
- Route: line unfold, NEXT "Order" (or Order cell). Screens: 03-line-unfold-sofa-1440, 05-order-paper-sofa-1440, 07-paper-bottom-actions-1440.
- Saw: opening a line shows six cells: The buy, Quote, Order ("Not yet ordered"), Movement ("Approved"), Receiving ("—"), Money out ("Nothing owed until it is ordered"), and one NEXT act "Order". Button "Order" opens "THE ORDER PAPER · vendor": sidemark (defaulted "U5W-US50WALK"), requested ship, SHIP TO, bill to, freight, line items, "+ Freight, crating, receiving…", total, terms (Vendor default), deposit date, note, then terminal act "Send to {vendor} · $3,200" (disabled with "choose where this ships" until a ship-to is picked), "Save, don't send", "Released by phone or portal — mark as sent", "Bill the client first →".
- One PO per vendor per order action; the PO is built from the line you opened (no multi-select across lines found on the head in this walk; the register has "Select multiple" for payments). Two lines from the same vendor were NOT combinable in this walk (I opened lines one by one) [M].
- A warning line: "The client hasn't paid for 1 of these yet — sending fronts $3,200 of studio funds until they do." The Order button was enabled despite the head saying purchasing authorization is held [H].
- Discoverable: yes (NEXT act is clear and good). The paper is long; the terminal act sits at the bottom below 800px of scroll at 1440x900 (07-paper-bottom-actions-1440).

### 5. Choose ship-to for each (multiple destinations)
- Screens: 05, 06-paper-somewhere-else-1440, 19-lamps-paper-jobsite-1440, 32-fabric-paper-ship-to-workroom-1440, 34-rug-paper-client-home-freetext-1440.
- Options per PO: default receiver ("US-50 Walk Receiving Warehouse · Default receiver", from `studio_locations`), "The studio" (org address), "The job site" (project `site_address`), "Somewhere else" (single free-text line "Receiver, street, city, state, zip"). Nothing preselected.
- Findings (DB checked): receiver choice saved `ship_to_location_id`; job site saved as TEXT address only (location id null); free text saved as text only. So: (a) ship-to is per PO, not per line [H]; (b) a vendor/workroom/client-home destination cannot be saved as a named place from this screen: it is retyped every time (no "Add a destination here") [H]; (c) the COM fabric: the chair's COM panel states a "SHIP TO US-50 Walk Hollis Workroom" and the fabric line says "COM fabric for the chair, shipped to Hollis Workroom", yet the fabric's order paper does NOT offer the workroom address; I had to type it under "Somewhere else", and only then a hint appeared "COM fabric ships to the workroom: …" (30-chair-com-unfold, 31-fabric-line, 32) [H]; (d) client home is not an option (typed free text, 34).
- Where destinations are managed: not found from the buying screens. Studio locations seeded by SQL; I did not find an in-portal place to add a receiver (not searched exhaustively: [M]).
- Discoverable: yes for the 3 presets; LOST for "ship the fabric to the workroom and the finished chair to the warehouse" as a linked flow.

### 6. Release / hold
- Screens: 50-paper-over-threshold-1440, 51-member-held-for-release-1440, 52-owner-desk-release-need-1440, 52b-owner-after-approve-click-1440, 53-owner-after-approve-release-1440, 54-member-after-owner-approved-1440, 55-member-paper-after-release-1440, 55b-po-preview-send-obscured-1440.
- The 6th line (Hale chairs, $3,600) is under the $5,000 line alone, but the paper says "With your other open orders to Hale on this job, this comes to $6,800 — over the studio's release line ($5,000). An owner or admin releases it before it goes". The terminal act became "Hold for release · $3,600" [H]. Aggregation across the vendor's open orders is surprising to a first-time user.
- Member pressed Hold (PO row: draft, sent_at null). The OWNER's Desk (MINE) shows "Approve the release of the order to Hale · $3,600" -> one-click dialog "Approve this order's release". The MEMBER's Desk (MINE) said "Nothing needs you today" the whole time, even with a held order, a drafted claim and an unsent inbound notice [H] (21-phone-desk-390, 43-desk-1440 vs 52).
- After owner approves, the PO did NOT send (DB: released_by set, sent_at null, no PO number yet, number shown as the sidemark "U5W-US50WALK"). The member must open the line, see NEXT "Send to vendor", open "This is what Hale receives" preview, and press Send. That preview's dark PDF pane showed blank (possibly local PDF rendering) and the Send button sat under the bottom studio drawer at 1440x900 so a real click was intercepted (55b); I pressed it via DOM dispatch. Treat as a probable layout defect [M]. Three hops: member holds, owner approves, member sends.
- Discoverable: hesitated (the member is not told what happens next or when it is released).

### 7. Send (draft-first)
- Screens: 08-paper-ready-to-send-1440, 09-paper-after-send-1440, 10-sofa-line-after-send-1440.
- Pressing "Send to {vendor} · $X" emailed the vendor immediately (po-send, dry-run here) with no preview of the email body in that dialog; the confirmation reads "Sent to orders+us50@hale.test · 22 October". "Save, don't send" exists. The designer pressing Send satisfies V22's "designer Send", but there is no view-the-email-before-send inside the paper (a separate "This is what the vendor receives" preview exists only on the second-hop send in step 6). [M: whether V22 requires a draft body review for POs is a founder ruling, not decided here.]
- Status words after send: Order cell "PO-0001 · sent to vendor 22 October · awaiting acknowledgment · fifty fifty"; line chip "RELEASED TO MAKER".

### 8. Log the acknowledgment
- Screens: 10, 11-ack-check-1440, 12-after-ack-1440.
- NEXT turns into the ack check: vendor order number, confirmed ETA, a table PO vs acknowledged value with "agrees", "Everything agrees — log it". After: "Acknowledged · everything agreed"; NEXT becomes "Mark in production". Clear and good. Discoverable: yes.

### 9. Enter carrier + tracking
- Screens: 13-record-shipment-form-1440, 14-shipment-filled-1440, 15-after-shipment-saved-1440, 20-lamps-ups-tracking-saved-1440, 57-phone-movement-tracking-390.
- Path: Movement cell -> "Record a shipment" (available as soon as acknowledged; you do not have to press Mark in production). Form: Mode (not set / parcel / LTL / white glove / studio pickup), Carrier, Tracking, Shipped date, Arrives, pieces shipped "of N", "Attach the bill of lading", "Save as shipped". There is also "Add/Edit tracking" on the PO header path in earlier specs; on the live line it is "Edit tracking" in the Movement cell.
- Observed: UPS tracking becomes a link to `ups.com/track?tracknum=…` (57); the Estes LTL number rendered as plain text (no link). Link logic only knows UPS, FedEx, USPS (`apps/designer-portal/src/components/document/line-unfold/movement-tracking.tsx:24-31`) [H].
- Discoverable: yes (hesitated slightly between "Record a shipment", "Edit tracking", and "Mark shipped").

### 10. Does status change automatically?
- Observed exactly: saving the shipment form sets PO status `shipped` and the line chip to shipped, immediately. That is entered by the studio, not by a carrier. PO header `carrier` and `tracking_number` stayed EMPTY; the data lives in `po_shipments` (carrier, tracking, mode, shipped_on, current_eta, delivered_on). After saving, the Movement cell reads "shipped — no scheduled arrival".
- No carrier API or webhook anywhere: grep of `supabase/functions`, `supabase/migrations`, `apps/designer-portal/src`, `packages` for easypost, aftership, 17track, shippo, ship24, tracking webhook returned nothing [H]. So: the portal never learns of "out for delivery" or "delivered" on its own; a tracking number is a link-out only.
- Delivery: the Movement cell keeps "Mark delivered" (manual). When I logged the sofa inspection the PO and line became "delivered", yet the shipment row stayed `delivered_on` null and the Movement cell still offered "Mark delivered" and a drafted inbound notice (17-sofa-after-receive, 41-sofa-installed) [H]. For the damaged lamps the PO and line stayed "shipped" (DB) while the Pieces chip read "DAMAGED" and the register read "RECEIVED / INSPECT · Received and dispositioned" (42, 44).
- Inbound notice to the receiver: after a shipment is saved to the warehouse, a draft "Inbound notice to the receiver" is created but shows "To no address on file" (warehouse location has no contact email) and the Desk (owner) shows "Inbound notice to the receiver drafted · Review and send". For a job-site delivery no notice is drafted at all (nobody tells the site contact) [H for observation].

### 11. Partial shipment
- Screens: 48-partial-shipment-form-4of6-1440, 49-partial-shipment-saved-1440.
- Chairs ×6: form "pieces shipped … of 6"; saved 4. Result: PO and line show `shipped` (no "partially shipped" word); the Movement cell lists "Shipped 22 October · LTL · XPO … ×4" and offers "Record another shipment" and "Mark delivered"; NEXT jumped to "Log inspection" even though 2 pieces have not shipped [H].
- Discoverable: yes, but status words hide the 4-of-6 truth.

### 12. Receive at the warehouse
- Screens: 16-receive-drawer-warehouse-1440, 17-sofa-after-receive-1440.
- NEXT "Log inspection" opens the drawer: Outcome (Clean / Damaged / Partial), per-line count and condition (Good / Damaged / Short / Wrong item), notes, "Add photos", "Log inspection". The word is "inspection", not "receive"; the drawer asks nothing about where it was received and ignores the Movement "Mark delivered" button (two parallel concepts: delivered vs inspected). After Clean: Receiving "1 of 1 inspected", NEXT "INSTALLED ON [date] Mark installed". Discoverable: hesitated on vocabulary.

### 13. Receive on site on a phone (390x844)
- Screens: 22-phone-document-390, 23-phone-contents-menu-390, 24-phone-pieces-390, 25-phone-lamps-line-390, 26-phone-inspection-drawer-390, 27-phone-inspection-damaged-390, 28-phone-inspection-photo-*-390, 57-phone-movement-tracking-390.
- Works at 390: no horizontal overflow (scrollWidth 390), drawer is full-height, outcome cards and line cards fit; line name truncates ("US-50 Walk Table lamp (p…"). Getting to the line takes: Open project contents -> Pieces -> tap line -> scroll to NEXT. The desk/home on phone has no "deliveries today" shortcut (Desk said "Nothing needs you today" 21). Banner chip reads "NOT SENT · INBOUND" (the unsent inbound notice) which means nothing to someone at the door. Photo capture limits above. Discoverable: hesitated (takes 4 taps; the Field app, not the portal, is likely the intended phone tool; not walked).

### 14. Damage + claim
- Screens: 27, 29-phone-after-damage-logged-390, 42-pieces-overview-status-words-1440, 46-orders-receiving-1440.
- Damaged + "Noted on the BOL" + photo -> claim "CLAIM · DRAFTED · Notify vendor", clock sentence "Brightwell wants written notice by Sun 25 October (72 hours from delivery, the studio default)", then "Damage claim deadline not set. Track claim" and "Something's wrong…" (an exception flow). Two different "claim" objects (draft claim vs tracked exception) appear on the same line and say conflicting things ("deadline Sun 25 Oct" and "deadline not set") [H]. The owner's Desk gets "has an open damage claim · Review the claim"; the member's does not. Order register: PO-0002 "RECEIVED / INSPECT · Received and dispositioned" while a claim is open; throughput header "0 OPEN" with 5 open POs. Receiving tab: "OPEN CLAIMS 1", "RECEIVED · LAST 30 DAYS 2 · 50% CLEAN", "INBOUND DELIVERIES 0" (no ETAs were ever entered, nothing asked for one).

### 15. Deliver / install
- Screens: 41-sofa-installed-1440.
- After clean inspection NEXT "Mark installed" (date). Result chip "INSTALLED". Movement cell then still showed "Mark delivered" and the inbound-notice draft. Discoverable: yes.

### 16. The job's overall buying status at a glance
- Screens: 42-pieces-overview-status-words-1440, 56-phone-pieces-status-390, 44/45/46/47 (Purchase orders sheet).
- Pieces head: "A damage claim is open. · 6 released · 1 open damage claim" and per-line chips: INSTALLED, DAMAGED, RELEASED TO MAKER ×4. "Released to maker" is used for EVERY ordered line regardless of acknowledged / in production / shipped / ETA, and it is also shown for the antique bought from a dealer (the recorded buy) and the sample-adjacent rug (`apps/designer-portal/src/components/portal/ffe/stages.ts:45`) [H]. The page header still says "Everything ordered is moving." (01). Project financials: "$9,900 undisbursed" in the rail. A 15-step lifecycle strip (… INSTALLED, PUNCH / SERVICE, CLOSED) appears in an unfold (29).
- Studio-wide: Desk -> STUDIO ADMINISTRATION -> "Purchase orders SHEET" opens the Order register (tabs ORDER REGISTER, WEEKLY ORDERS, RECEIVING, VENDOR ACCOUNTS). Rows show vendor, PO no., stage word, "SENT 22 OCTOBER · ACK / NO ACK", "Resend", "LOG ACK ↓", "open document →". No carrier/tracking number/ETA column on a row; Weekly orders: "Nothing on the calendar — no dated deliveries or installs in the next 8 weeks" because no arrival dates were entered (45). There is no single "buying for this job" board that shows ordered / acked / shipped / received per line with ship-to and tracking.

## Scenario items

- Sofa (LTL to warehouse, steps 4-12, 15): worked end to end by hand. Tracking is manual; Estes gets no link.
- Lamps (UPS, job site, steps 5-14): job site ship-to works (text only). UPS link works. Phone receiving works except photos (env). Damage claim created.
- Custom chair + COM fabric: two POs (fabric to mill, chair to workroom). The system knows the fabric ships to the workroom but the fabric paper does not offer it (step 5c). Fabric paper also warned "CFA from Maren Mills not yet approved — send anyway?" (32). No way to see on one screen that the chair cannot start until the fabric lands (chair PO-0004 shows RELEASED TO MAKER).
- Antique (dealer find): Add items -> "Bought it already" -> Find: What, Where, Link to a maker, When, Paid, Tax, Shipping, Paid with ("My own card — reimburse me"), Receipt, Returns, For, Line, "Bill the client, at cost". Recorded as a purchase (studio_purchases one_off $950). The line moved to "ordered" and shows "RELEASED TO MAKER" with the dealer as the maker; there is no pickup/arrival/destination step (39-purchase-record-filled, 40, 42) [H].
- Rug to client home: no client-home destination; typed free text (34). PO sent. Sample on the rug: "Request a sample" -> kind (Memo / Finish chip / Loaner / Sample), description, requested, return by, fee, billable; recorded as "Memo from … · requested  Mark returned" (35, 36). It records a sample the studio asked for; nothing is sent to the vendor to request it [M].

## Gaps where the UI has no way to do the step
1. Ask a vendor for a quote (record only).
2. Auto-update order status from tracking (no carrier integration; link-out only for UPS/FedEx/USPS).
3. Ship different lines of one PO to different destinations (ship-to is per PO).
4. Save a named destination (workroom, client home, vendor site) from the order paper; job-site and free text are not reusable.
5. Notify the job-site contact or any receiver without an email on file; inbound notice drafts to "no address on file".
6. A "partially shipped" status; shipment-level delivered state that agrees with the PO.
7. Record pickup/arrival of an antique or dealer buy.
8. A per-job board of every line's order, acknowledgment, shipment, ETA, ship-to, receipt.
9. Camera capture on phone (file input only); photo upload could not be verified locally.
10. Real email send was not verified (dry-run).

## TOP FRICTIONS (ranked)
1. Status words lie or flatten. Every ordered line reads "RELEASED TO MAKER" (also for a dealer buy), 4-of-6 shipped reads "shipped", a damaged delivery reads "RECEIVED / INSPECT · Received and dispositioned", the project header says "Everything ordered is moving" before anything is ordered. Screens: 01-document-1440, 42-pieces-overview-status-words-1440, 40-pieces-after-antique-1440, 44-orders-book-1440, 49-partial-shipment-saved-1440. Code: `apps/designer-portal/src/components/portal/ffe/stages.ts:45`.
2. Tracking number is bookkeeping only. Entering carrier + number by hand flips the PO to shipped; nothing updates after that; only UPS/FedEx/USPS get a link; no ETA means Weekly orders and Inbound deliveries are empty. Screens: 14-shipment-filled-1440, 15-after-shipment-saved-1440, 20-lamps-ups-tracking-saved-1440, 45-orders-weekly-1440, 46-orders-receiving-1440. Code: `.../line-unfold/movement-tracking.tsx:24-31`.
3. Multiple destinations are single-use and per PO. Receiver / studio / job site / one free-text box; no saved workroom, vendor or client-home; the COM fabric knows it goes to the workroom but its paper does not offer it. Screens: 05-order-paper-sofa-1440, 06-paper-somewhere-else-1440, 30b-chair-buy-cell-1440, 32-fabric-paper-ship-to-workroom-1440, 34-rug-paper-client-home-freetext-1440.
4. The buying route has no name and is spread over three surfaces: "Pieces" (rail), "FF&E selections" (section), "Purchase orders SHEET" (Desk > Studio administration). The phone hides it behind "Open project contents". Screens: 01-document-1440, 02v-pieces-overview-viewport-1440, 43-desk-1440, 44-orders-book-1440, 23-phone-contents-menu-390.
5. The member is not told what is waiting. Held order, drafted claim, unsent inbound notice all route to the owner's Desk; the member's Desk says "Nothing needs you today". After owner approval the PO still does not send: member must find the line and press Send (whose button is hidden under the drawer at 1440x900). Screens: 43-desk-1440, 52-owner-desk-release-need-1440, 53-owner-after-approve-release-1440, 54-member-after-owner-approved-1440, 55b-po-preview-send-obscured-1440.
6. Delivered / inspected / installed are parallel manual states that disagree: shipment keeps "Mark delivered" after the PO is delivered; two claim objects on one line with conflicting deadlines ("by Sun 25 October" vs "deadline not set"); an inbound notice to nobody persists after install. Screens: 17-sofa-after-receive-1440, 41-sofa-installed-1440, 29-phone-after-damage-logged-390.
7. The release gate is invisible until it bites: a $3,600 order is held because it aggregates with a sibling $3,200 order; the head says purchasing authorization is held yet Order works. Screens: 50-paper-over-threshold-1440, 02v-pieces-overview-viewport-1440.
8. Vocabulary: "Record a quote" (asks nothing of the vendor), "Log inspection" (is the receive), "Bought it already" vs "A find" vs "A store buy", "Request a sample" (records). Screens: 04-quote-open-1440, 16-receive-drawer-warehouse-1440, 37b-add-items-menu-1440, 35-request-sample-form-1440.
9. Phone receiving is possible but long (4 taps to the line, truncated names, no "today's deliveries"), the banner chip "NOT SENT · INBOUND" is unreadable to someone at the door, and the camera is not invoked directly. Screens: 21-phone-desk-390, 25-phone-lamps-line-390, 26-phone-inspection-drawer-390, 28-phone-inspection-photo-bottom-390.
