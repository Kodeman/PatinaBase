# Buying for a job — UI/UX direction

**Recommendation:** make buying a visible reading of the existing item rows inside The Document. Every row should answer:

**What is this? What has actually happened? Where is it going? Who does what next?**

Do not add a purchasing dashboard, Kanban board or separate purchasing workspace.

This addresses the studio’s first delegation of buying, supports furniture purchasing, and keeps work inside The Document. It follows the vision’s surface hierarchy and its refusal of engagement-oriented dashboards. **[H; V:21–31,50–58,70–75]**

## Evidence and limits

- **[H]** directly supported by inspected code, screenshot or documented local observation.
- **[M]** supported by the walk but dependent on its environment or incomplete exploration.
- **[L]** hypothesis needing studio validation.
- Everything under **Proposed** is a design recommendation, not shipped behavior.
- The supplied walk was **local**, with email dry-run and a media-upload stub. It does not establish production readiness, real email delivery or working phone-photo upload. **[H; W:3–10]**
- Source inspection was against working files at HEAD `495a43b32ebada7781b8a04f2f907749258b2caa`; this was not an immutable-candidate acceptance review.

Citation aliases:

- **W** = `/Users/kody/Code/patina-merged/artifacts/purchasing-workflow-review-2026-10-22/walk/walk.md`
- **V** = `/Users/kody/Code/patina-merged/docs/vision/VISION.md`
- **D** = `/Users/kody/Code/patina-merged/docs/vision/VISION-DECISIONS.md`

---

## 1. Why the interface is unclear

### The designer thinks in commitments and physical goods; the UI exposes records

A designer’s questions are practical:

> “Have we ordered the chairs? Did the vendor confirm? Four are coming where? Who receives them? What happens to the other two?”

The current interface divides those answers among six cells inside a line unfold, while the collapsed row mostly shows an item, price and broad status. **[H; W:34–39; screenshot `03v-line-unfold-viewport-1440.png`]**

| Friction | What the interface implies | What the designer needs |
|---|---|---|
| **Buying has no recognizable entrance** | “Pieces,” “FF&E selections,” and “Purchase orders” are different places. | One obvious place to continue buying for this job. **[H; W:16–21,97–100]** |
| **Important facts require opening each line** | The overview is principally a selections list; buying happens underneath. | Destination, actual movement and next act visible before opening anything. **[H; W:34–39,97–100]** |
| **Status overstates progress** | “Released to maker” covers several operationally different situations; 4-of-6 shipped reads shipped. | Quantity-qualified facts and neutral vendor language. **[H; W:76–79,97–105]** |
| **Actions sound more capable than they are** | “Request a sample” suggests communication; “Record a quote” does not help someone trying to ask for one. | Separate “Draft request” from “Record response.” The walked quote/sample paths recorded facts rather than sending requests. **[H/M; W:29–32,102–108]** |
| **Release is a handoff without a return address** | Owner approval appears to finish the job. | “Leah approved. Your next step is review and Send.” The member’s Desk showed nothing during these handoffs. **[H; W:48–53]** |
| **Tracking looks connected but is manual** | Entering a tracking number might make the portal follow the delivery. | Explicitly distinguish a tracking link, a manual update and a connected carrier feed. **[H; W:64–74]** |
| **Receiving has competing truths** | Delivered, inspected, damaged and installed can disagree across surfaces. | Show transport, physical receipt, inspection and claims as distinct facts. **[H; W:70–74,81–94]** |
| **Destinations are paperwork, not a job plan** | Choose an address while preparing each PO. | Decide each item’s route early, including warehouse and workroom legs. **[H; W:41–46,102–108]** |
| **Phone layout preserves desktop priorities** | Buying details remain behind navigation and unfolds; the row still competes with price/status for width. | A receiving entrance, readable item names and one-handed check-in. **[H; W:85–87; screenshot `56-phone-pieces-status-390.png`]** |

Buying is spread across **three principal working surfaces**: the project Document, the studio Orders book, and Desk handoffs. Destination/vendor maintenance adds People as a fourth supporting surface. The solution is not to remove those instruments; it is to stop requiring users to assemble the job’s truth from them. **[H; W:41–53,97–100; existing location editor cited in §6]**

### Two important corrections to the supplied as-built map

1. **The walked shipment form is not the older PO-header tracking editor.** The Movement cell mounts both instruments. `PoShipments` uses `useRecordPoShipment`, which calls `record_po_shipment`; recording a shipment advances the PO. Therefore “saving tracking does not change status” is true of the header editor, not of the walked **Save as shipped** flow. **[H]**

   Sources:
   - `/Users/kody/Code/patina-merged/apps/designer-portal/src/components/document/line-unfold/movement-cell.tsx:306–328`
   - `/Users/kody/Code/patina-merged/packages/supabase/src/hooks/use-buying-phase2.ts:553–609`

2. **Saved locations exist; their discovery failed in the walk.** The People location editor can add and edit them. The narrower problem is that the order paper does not offer an inline “save this destination for the job” flow, and the walker did not find location maintenance. **[H/M]**

   Source:
   `/Users/kody/Code/patina-merged/apps/designer-portal/src/components/document/people/studio-locations-editor.tsx:316–365`

---

## 2. The proposed experience

### Keep one paper; expose its operational reading

Call the section **“Pieces & purchasing”** in both its heading and project contents. This is a proposed name for founder review.

Below it, provide a sentence-style reading control:

> **Read by room** · Change reading

“Change reading” offers **Room, Vendor, Next act**. These rearrange the same rows in place. They are not tabs, new pages or separate records. Reading by next act inside The Document is already permitted. **[H; D:400–405]**

Each collapsed row exposes:

- Item, room, vendor and ordered quantity.
- A truthful stage.
- Destination or route.
- Shipment/receipt quantities and arrival information.
- One next act, or an explicit waiting sentence.

Detailed specifications, quote comparison, payment records, correspondence and history remain in the unfold.

### Alternatives considered

- **Kanban pipeline:** easy to recognize, but poor for partial quantities, multiple legs and overlapping claims; also conflicts with the Document direction.
- **Keep today’s drawers and improve labels:** smallest visual change, but still requires opening every line to answer basic buying questions.
- **Recommended: operational rows with existing instruments underneath.** The overview becomes useful without replacing the underlying buying tools.

---

## 3. Status language and next acts

### One shared glossary, not one flattened status field

PO commitment, carrier movement, receiving and installation are different facts. Use the **same words for the same facts everywhere**, while retaining those distinctions.

| Shared wording | Meaning |
|---|---|
| **Not ordered** | No recorded purchase commitment. |
| **Draft order** | Paper exists; not sent or recorded as placed elsewhere. |
| **Awaiting studio release** | An internal approver must release it. |
| **Ready to send** | Released where required, but still unsent. |
| **Ordered · awaiting acknowledgment** | Order placed; vendor confirmation not recorded. |
| **Acknowledged** | Vendor response recorded; discrepancies shown separately. |
| **In production** | Supported by an actual recorded update, not inferred merely from acknowledgment. |
| **Partly shipped · 4 of 6** | Four pieces have shipped; two remain unshipped. |
| **In transit · 4 pieces** | Movement of the identified shipment, not the entire order. |
| **Carrier reports delivered** | A transport report; studio receipt remains unconfirmed. |
| **Partly received · 4 of 6** | Studio recorded physical receipt of four. |
| **Received at warehouse** | Receipt at a named intermediate destination. |
| **Received at site** | Receipt at the final named destination. |
| **Installed** | Installation explicitly recorded. |

Additional facts remain visible beside the stage:

- **Inspection pending**
- **1 damaged**
- **Claim draft · not sent**
- **Claim notified · awaiting vendor**
- **ETA not provided**
- **Manual update**
- **Carrier update unavailable**

A claim must not erase where the goods are. “Received at site · 1 damaged · claim draft” is more useful than replacing everything with “Damaged.”

**Dealer/store-buy branch:** use **Purchased**, **Awaiting pickup**, **In transit**, **Received**. Do not invent an acknowledgment or call a dealer purchase “released to maker.”

### Next-act rules

“Always says what to do” must not become “always invents a task.”

| Situation | Visible next line |
|---|---|
| Destination missing | **Choose destination** |
| Quote needed | **Draft quote request**; secondary **Record a quote** |
| Draft is ready | **Review order** |
| Internal release pending | **Waiting for Leah’s release** · View request |
| Release approved | **Review & send to Hale** |
| Ordered, acknowledgment absent | **Record acknowledgment** |
| Vendor discrepancy | **Review acknowledgment difference** |
| Four of six shipped | **Receive 4 arriving pieces** when appropriate; also “2 await shipment” |
| Moving, nothing due | **Waiting for carrier update** · Last checked … |
| Arrival reported | **Confirm receipt at warehouse** |
| Damage recorded | **Review & send claim** · Due … |
| Bought from dealer | **Arrange pickup** or **Record arrival**, according to the recorded facts |
| Ready at warehouse for site move | **Arrange site delivery** |
| Fully received at site | **Record installation** |
| Installed, no outstanding issue | **No buying action needed** |

Priority is: time-sensitive exception → missing prerequisite → available action → named waiting state. The row must not recommend installation while hiding a claim or outstanding quantity.

---

## 4. Specimens to draw at 1440 and 390

All proposed examples below are illustrative fixture states, not claims about the studio’s production purchases.

### A. Job buying overview

**Before**

Use `02v-pieces-overview-viewport-1440.png` and `56-phone-pieces-status-390.png`. Today’s row does not expose destination or shipment quantities; phone names become extremely narrow beside price and status. **[H; W:97–100; inspected screenshots]**

**Proposed — 1440**

Keep the existing Document shell. Within its central column:

1. Heading **Pieces & purchasing**.
2. One factual sentence:  
   **“2 lines need your action. 1 claim draft is due Sunday.”**
3. Plain acts: **Review next acts**, **Receive a delivery**, **Destinations**.
4. Reading control.
5. Five aligned row columns, approximately 900px total:

   **Piece** 220 · **Stage** 150 · **Destination** 140 · **Arrival / quantities** 180 · **Next** 210.

Example:

> Dining chairs ×6 · Hale  
> **Partly shipped** | Receiving warehouse | **4 in transit · 2 unshipped** · ETA not provided | **Add arrival estimate**

Each summary count refers to the rows immediately beneath it. No tiles, progress ring, lifecycle bar or engagement metrics.

**Proposed — 390**

Use 16px gutters and stacked rows:

> **Dining chairs ×6**  
> Dining room · Hale  
> **Partly shipped · 4 of 6**  
> To Receiving warehouse  
> 4 in transit · 2 await shipment  
> Arrival estimate not provided  
> **Add arrival estimate**

Item names wrap across the available width. Price moves into detail/the financial reading. The first visible section actions include **Receive a delivery**; no unfold is required to find it.

**Reuse:** FFE section/rows, line unfold, existing next-act derivation. See §6.

---

### B. Prepare, release and place an order

**Before**

Use `05-order-paper-sofa-1440.png`, `50-paper-over-threshold-1440.png`, `55b-po-preview-send-obscured-1440.png`. The current handoff requires member → owner → member; a send control was obscured in the walked preview. The obscuring is **[M]**, not a proven production defect. **[H/M; W:34–39,48–58]**

**Proposed — 1440**

Open the existing order paper in one bounded sheet. Order:

1. Vendor and included lines.
2. Destination, sidemark and requested dates.
3. Costs, freight and terms.
4. Separate standing sentences:
   - Client agreement/authorization standing.
   - Client funds collected and studio exposure.
   - Internal release standing.
5. Reviewed recipient, note and order-document preview.
6. An always-reachable footer containing the exact terminal act.

Release copy:

> **Leah’s release is needed.**  
> This paper is $3,600. The studio’s current release calculation includes other Hale orders and totals $6,800.  
> **Request studio release**  
> Nothing will be sent to Hale.

After approval:

> **Released by Leah. Not sent.**  
> **Review & send to Hale**

For externally placed orders, retain an explicit **Record order placed by phone or vendor website** path. Recording must not send a duplicate email or bypass existing release authority.

**Proposed — 390**

Same order and words, one column. Sticky sheet footer has one primary act and a secondary **Save draft**. Reserve space for the footer and safe area; the global studio drawer must not cover it.

The assigned buyer sees the return handoff on Desk and on the line.

**Reuse:** order paper, release slot, PO preview and draft review. Preserve current gates; change their explanation, not their authority.

---

### C. Job destinations and per-line routing

**Before**

Use `06-paper-somewhere-else-1440.png`, `32-fabric-paper-ship-to-workroom-1440.png`, `34-rug-paper-client-home-freetext-1440.png`. Ship-to is per PO; the walked job-site and free-text destinations were address text rather than reusable selected location IDs. **[H; W:41–46]**

**Proposed — 1440**

**Destinations** opens an in-document sheet:

- **Receiving warehouse** — address, contact, receiving hours, instructions.
- **Hartwell job site** — address, site contact, delivery restrictions.
- **Hollis workroom** — address, contact, COM reference/instructions.
- **Add destination**.

Every line shows its planned destination before ordering. Allow quantity allocations when one line must go to different places.

**Important boundary:** per-line routing does not mean printing contradictory addresses on one PO. Preparing orders groups allocations by vendor and destination into explicitly reviewed papers. Different destinations produce separate papers under the present one-destination-per-PO constraint.

COM route:

> Fabric → Hollis workroom  
> Finished chair → Receiving warehouse → Hartwell site  
> **Chair production awaits fabric receipt at Hollis.**

The warehouse-to-site movement is a later transfer, not another purchase.

**Proposed — 390**

Destination is a full-width row field. Tapping it opens a searchable named-place list with an **Add destination** act. Show the selected address and contact before confirming.

Do not silently select the default receiver. Do not modify sent address snapshots when a saved place changes; use the existing change process.

**Reuse:** location editor and ship-to selector. Job associations, line/quantity routing and later transfer legs are **new capability**, not merely picker styling.

---

### D. Tracking that explains its own reliability

**Before**

Use `14-shipment-filled-1440.png`, `49-partial-shipment-saved-1440.png`, `57-phone-movement-tracking-390.png`. Tracking entry works manually; UPS/FedEx/USPS have link-outs. There is no demonstrated connected carrier feed for these studio POs. **[H; W:64–79]**

**Proposed — 1440**

One **Shipment** instrument replaces competing “Mark shipped” versus “Edit tracking” concepts.

Fields:

- Pieces and quantities in this shipment.
- Carrier and tracking/PRO number.
- Shipped date, destination and BOL.
- ETA or **Not yet provided**.

Adding a number alone must not assert physical shipment. Show **Tracking added · awaiting carrier pickup** until movement is evidenced or recorded.

Connected example:

> **In transit · 4 chairs**  
> XPO · PRO …  
> To Receiving warehouse  
> Carrier estimate: 28 October  
> Updated from carrier today, 10:42  
> **Open tracking**

Unsupported example:

> **Manual tracking**  
> Automatic updates are unavailable for this carrier.  
> Last studio update: 22 October  
> **Record an update**

**Proposed — 390**

Stack the same facts. Always expose quantity, destination, source and freshness; tracking detail expands beneath them.

A carrier delivery event changes the movement fact to **Carrier reports delivered** and offers **Confirm receipt**. It never marks goods inspected, clean or installed.

**Feasibility boundary:** self-updating tracking requires new integration work and demonstrated carrier coverage. Parcel, LTL, white-glove and pickup must not be presented as uniformly supported. Until then, the interface must remain honestly manual.

---

### E. Receive on a phone

**Before**

Use `26-phone-inspection-drawer-390.png` and `27-phone-inspection-damaged-390.png`. The existing flow records quantities and conditions, but the entrance says “Log inspection,” names truncate, and photos were not proven against the real media service. **[H/M; W:81–87; inspected screenshot]**

**Proposed — 390**

Entrance: **Receive a delivery**.

1. Identify by PO, vendor, item or tracking number. Offer **Scan label** as an optional future shortcut, with manual search always available.
2. Confirm **Receiving at Hartwell site**.
3. Show the expected shipment, not blindly the entire PO.
4. Present full-name line rows:
   - Expected in this shipment: 4.
   - Arrived today: editable.
   - Good / Damaged / Wrong item / Uninspected quantities.
   - Packaging/BOL note.
   - **Take photo** and **Choose photos**.
5. Footer: **Save receipt**, or **Save receipt & draft claim**.

For chairs with four intentionally shipped and two still at the vendor, receiving those four must not automatically create a shortage claim for the other two.

Confirmation:

> **4 chairs received at warehouse.**  
> 3 inspected good · 1 damaged  
> 2 chairs still await shipment  
> **Claim draft ready · not sent**  
> **Review claim**

If photos fail, state exactly what saved and what did not. Do not make an at-door receiver repeat a successful receipt to retry an attachment or failed claim draft. Offline saving is not promised by this proposal.

**Proposed — 1440**

Use the same receipt instrument in a wider sheet: item/counts on the left; condition, photos and BOL evidence on the right. Keep the same vocabulary.

**Reuse:** inspection drawer, receiving hook and claim instruments. The current hook records receipt before subsequent claim work; “one motion” in the design must not pretend the whole operation is already atomic. **[H]**

Source:
`/Users/kody/Code/patina-merged/packages/supabase/src/hooks/use-procurement.ts:1889–1945`

---

### F. Claim and completion

**Before**

The walk showed a dated claim-clock sentence alongside “deadline not set,” and an installed item retaining movement/inbound-notice actions. **[H; W:70–74,89–94]**

**Proposed — both widths**

Keep the claim with the affected item:

> **Received at site · 1 damaged**  
> Written notice to vendor due Sun 25 October  
> Based on delivery recorded 22 October · studio’s vendor default  
> Carrier notice deadline: …  
> **Review & send claim**

Show vendor and carrier obligations separately, each with its source. One issue may legitimately have multiple obligations; the UI should not show contradictory duplicate summaries.

Receiving at a warehouse does not complete final delivery. Installation does not erase an unresolved claim. Obsolete inbound drafts are clearly marked for discard rather than remaining presented as current work.

At 390, show deadline and next act before the correspondence/evidence detail. At 1440, evidence and correspondence can sit side by side.

---

## 5. Labelled disagreements between the two design seats

### 1. What belongs above the rows?

- **Interaction seat:** lead with the most urgent act.
- **Information seat:** lead with the whole job’s buying position.
- **Recommendation:** one factual sentence, then one leading act; all supporting rows remain directly below. No detached summary dashboard.

### 2. Should every line have a button?

- **Interaction seat:** a consistent button position improves discovery.
- **Information seat:** a button on every waiting line manufactures work.
- **Recommendation:** reserve a consistent **Next** location, but permit a named waiting sentence. Actions appear only when meaningful.

### 3. One stage or several statuses?

- **Interaction seat:** one stage is easier to scan.
- **Information seat:** one stage hides partial shipments, inspection and claims.
- **Recommendation:** one lead stage, followed by explicit quantity/location facts and an exception line. Open shipment detail only when needed.

---

## 6. Existing components to reuse

These are starting seams, not claims that the proposed experience already exists.

| Instrument | Existing source |
|---|---|
| Job section and item rows | `/Users/kody/Code/patina-merged/apps/designer-portal/src/components/document/ffe-section.tsx:620,1333` |
| Line unfold and next-act placement | `/Users/kody/Code/patina-merged/apps/designer-portal/src/components/document/line-unfold.tsx:172,276,325` |
| Next-act derivation | `/Users/kody/Code/patina-merged/apps/designer-portal/src/components/document/line-unfold/next-act.ts:57` — extend beyond current PO-status-led choices; do not duplicate its rules in the overview. |
| Order paper | `/Users/kody/Code/patina-merged/apps/designer-portal/src/components/portal/procurement/order-paper/index.tsx:179–217` |
| Named destinations | `/Users/kody/Code/patina-merged/apps/designer-portal/src/components/document/people/studio-locations-editor.tsx:316` |
| Ship-to choice and save | `/Users/kody/Code/patina-merged/apps/designer-portal/src/components/portal/procurement/order-assistant/ship-to-choice.tsx:126–185` |
| Shipment quantities, dates and tracking | `/Users/kody/Code/patina-merged/apps/designer-portal/src/components/document/line-unfold/shipments.tsx:141–204` |
| Shipment data and mutation | `/Users/kody/Code/patina-merged/packages/supabase/src/hooks/use-buying-phase2.ts:537–609` |
| Receiving instrument | `/Users/kody/Code/patina-merged/apps/designer-portal/src/components/portal/procurement/log-inspection-drawer.tsx:271` |
| Claim clock | `/Users/kody/Code/patina-merged/apps/designer-portal/src/components/document/line-unfold/claim-clock.tsx:32,66` |
| Correspondence review | `/Users/kody/Code/patina-merged/apps/designer-portal/src/components/document/buying/draft-review.tsx:90,283` |
| Dealer/store purchase recording | `/Users/kody/Code/patina-merged/apps/designer-portal/src/components/document/purchases/purchase-record-form.tsx:51` |

For all specimens: use the existing Document typography and tokens, no shadows or red/green status system, visible keyboard focus, 44px touch targets, wrapping names, and no page-level horizontal scrolling. Keep status text understandable without color.

---

## 7. Founder decisions and boundaries

### Already settled — do not reopen through a mockup

- Reading by next act stays inside The Document.
- Missing ship-to prevents sending.
- Internal release authority remains enforced.
- Studio outbound waits for a designer’s Send.
- Vendor write-in through token links is not authorized in v1.
- Financial and authorization edits retain their existing controls. **[H; D:391–405,609–629]**

The missing agreement warning and purchasing-authorization standing must be explained separately from internal release. Their apparent contradiction is not permission to invent a new purchasing stop or remove an existing one.

### Decisions to put before Kody and Leah

1. **Naming:** adopt “Pieces & purchasing,” or another single recognizable name?
2. **Operational ownership:** who is the default buyer, receipt recorder and claim reviewer, and how is responsibility handed back after release?
3. **Destination practice:** who maintains shared places, and how should private client-home destinations be reused across jobs?
4. **Tracking scope:** which actual carriers and receiving services must the first connected release support? Show unsupported carriers honestly.
5. **Receiving practice:** may arrival be recorded before inspection, and who then owns the inspection deadline?
6. **External review:** adopt one consistent reviewed recipient/note/paper experience before PO Send, without representing it as a newly settled V22 interpretation.

Keep open pricing/date/margin rulings open, including R6/R7/R9 and R-DI4/5 where applicable. Do not promise client-facing delivery dates or resolve financial policy in these specimens. **[H; D:417; prior direction `/Users/kody/Code/patina-merged/artifacts/procurement-buying-review-2026-10-05/synthesis/direction.md:304–317`]**

## Bottom line for the presentation

**Today:** the studio can manually record buying, shipment information and receiving, but the overview and handoffs do not reliably explain the work. Tracking numbers do not establish automatic carrier monitoring. **[H; W:48–100]**

**Proposed:** keep The Document, expose truthful operational rows, make destinations visible before ordering, distinguish carrier delivery from studio receipt, and carry each handoff to a named next person.

Show connected tracking, routing allocations, transfer legs and scanning as **proposed capabilities**, never as existing features. The existing components are sufficient starting instruments; the missing work is their shared operational truth and discoverability, not another workspace.
