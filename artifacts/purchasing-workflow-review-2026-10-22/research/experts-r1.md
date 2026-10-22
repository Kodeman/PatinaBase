# Purchasing experts — round 1

**Shared conclusion:** A purchaser needs to answer four questions without reconstructing the order history:

> **Have we bought it? Where is it going? Where is it now? What must happen next?**

A PO is the instruction to the vendor—not the whole purchasing workflow. Carrier delivery is a transport event—not proof that the correct goods were inspected or reached the client’s house.

**Evidence:** [H] directly supported by inspected code/documentation; [M] operational recommendation, not validated with Leah; [L] unresolved inference. This was a read-only assessment: no live portal walk, production transactions, or interviews. The purchasing-agent and warehouse-lead seats below are analytical perspectives, not interviewed practitioners.

## 1. Correct the baseline before designing more

Two parts of the supplied map need correction.

- **The current send function does not silently substitute the job site.** It checks the explicit ship-to before side effects; its comments explicitly reject the old fallback. The earlier direction describes a superseded problem. [H] [`po-send/index.ts:398–402,451–452`](/Users/kody/Code/patina-merged/supabase/functions/po-send/index.ts#L398)
- **Partial-shipment recording has a mounted Document path.** The Movement cell mounts `PoShipments`; that component offers “Record a shipment” and “Record another shipment.” Discoverability and live usability remain unverified, but it is not merely a backend feature. [H] [`movement-cell.tsx:317–323`](/Users/kody/Code/patina-merged/apps/designer-portal/src/components/document/line-unfold/movement-cell.tsx#L317), [`shipments.tsx:168–185`](/Users/kody/Code/patina-merged/apps/designer-portal/src/components/document/line-unfold/shipments.tsx#L168)

Do not repeat October 5’s missing-capability list as today’s diagnosis. The as-built record reports shipped payment recording, purchase records, acknowledgment checking, COM, receiving, claims and install/punch work. That establishes implementation history—not that Leah can find and complete those flows today. [H] [`README.md:106–130`](/Users/kody/Code/patina-merged/artifacts/procurement-buying-review-2026-10-05/README.md#L106)

**Our working diagnosis:** prioritize a clearer operational sequence and handoffs over another purchasing subsystem. [M]

## 2. The real studio workflow

This is a recommended operating model, not a verified feature comparison of Studio Designer, Programa, Houzz Pro or DesignFiles. [M]

| Stage | What the studio actually does | Evidence that lets the next person continue |
|---|---|---|
| **Specify and quote** | Confirm vendor, exact SKU/configuration, finish, dimensions, quantity, unit, lead-time basis, availability, freight and destination. Separate merchandise from freight, receiving, storage and installation costs. | Dated quote, specifications and explicit inclusions/exclusions. |
| **Approve and fund** | Obtain the client’s purchasing authorization under the studio’s agreement. Check funds received against the intended commitment. Internal approval, client approval and payment are different facts. | Approval reference, funding position, named purchaser and any owner release. |
| **Place the purchase** | Email a PO, order through a trade portal, buy from a dealer, or check out at retail. Pay the required deposit separately unless the transaction combines ordering and payment. | Exactly what was sent or bought, when, by whom, vendor confirmation number and payment evidence. |
| **Check acknowledgment** | Compare the vendor’s acknowledgment against the instruction: price, quantity, finish, dimensions, COM, destination, freight terms, deposit and promised dates. Resolve differences explicitly. | “Checked by/date,” discrepancies and the accepted correction. Receiving an acknowledgment is not checking it. |
| **Follow production** | Track the vendor’s current commitment and prerequisites: approved drawings, material receipt, CFA/strike-off approval and cleared deposit. | Last confirmed date, source, reason for change and next follow-up. |
| **Prepare for release/pickup** | Confirm readiness, actual freight, balance requirements, carrier booking and destination acceptance. A completed sofa can still be waiting for collection. | Ready date, balance disposition, pickup arrangements and receiver acceptance. |
| **Follow the shipment** | Associate the carrier/PRO/tracking number with the actual pieces and quantities on that movement. Send the receiving party an advance notice. | Shipment contents, origin, destination, ETA, BOL and appointment details. |
| **Receive and inspect** | Record the physical arrival first. Count handling units; photograph packaging and visible exceptions. Inspect the goods promptly under applicable terms. Record shortages, wrong items and damage separately. | Arrival time/location, delivery receipt, quantities, condition, photos and written exceptions. |
| **Store and consolidate** | Hold inspected goods, preserve identification, resolve exceptions and decide which pieces can travel together. Reconcile the receiver’s records with the studio’s record. | What is actually available for delivery, what is held, and why. |
| **Deliver to site and install** | Confirm site readiness, access, protection, delivery scope and appointment. Move an agreed manifest; verify arrival and placement. | Site handoff, room assignment and installation/assembly confirmation. |
| **Punch and close** | Resolve missing parts, repair, replacement, returns and credits. Reconcile outstanding costs and claims. | Named unresolved items—or a genuinely complete record. |

### The purchasing lanes must not all pretend to be POs

| Lane | Distinctive operational requirement |
|---|---|
| **Trade maker** | PO plus checked acknowledgment; deposit/balance; promised production and shipping dates. |
| **Workroom/custom + COM/COL** | Link the material purchase to the fabrication order. Workroom confirms quantity, suitability and receipt of the correct material/dye lot. Distinguish “material arrived” from “fabrication released.” |
| **Dealer/antique** | Identify the unique piece, documented condition, hold expiry, payment and pickup deadline. Dealer invoice/receipt can be the purchase evidence; do not require an acknowledgment ritual that never occurs. |
| **Retail on card** | Record actual checkout, retailer order number, receipt, destination, expected packages and return terms. A record must not cause the same purchase to be placed again. |
| **Samples/memos** | Track request, arrival, associated selection and return obligation. A sample’s arrival must not imply that the finished product was purchased. |

**Purchasing-agent seat:** preserve the vendor’s commercial facts and the agreed specification.

**Warehouse-lead seat:** preserve physical identity, custody, quantity and condition.

**Shared rule:** neither record substitutes for the other. [M]

### Consignee, destination and sidemark

For each freight leg, confirm the receiving party’s required BOL convention:

- **Consignee:** the intended receiving party at that leg’s destination—not automatically the homeowner, purchaser or freight payer.
- **Ship-to:** the actual delivery address, accepted contact and access instructions.
- **Bill-to/freight payer:** separate commercial responsibilities.
- **Sidemark:** a stable job reference, studio identifier and item/room reference where useful. Carry it through vendor acknowledgment, carton labels, receiver records and delivery manifest; never use it instead of an address.

For warehouse-bound goods, use the receiver’s accepted consignee format, often with a studio/job reference. For COM, identify the workroom and fabrication order. For site delivery, name the person who can actually accept it. Verify these conventions with each recipient. [M]

## 3. What would hurt the first purchase?

These are ranked operational risks, not claims of observed production failure.

### First-purchase priorities

| Priority | Risk and as-built evidence | Required experience |
|---|---|---|
| **1. “Ordered” before an order exists externally** | The decision log explicitly records the unresolved F25 issue: a draft PO can stamp the item `ordered`/“RELEASED TO MAKER” before send. [H] [`DECISIONS.md:11405–11409`](/Users/kody/Code/patina-merged/docs/design/the-document/DECISIONS.md#L11405) | Clearly distinguish draft, awaiting internal release, sent and externally purchased. **Surface F25 for a founder ruling; do not silently settle it.** |
| **2. Wrong destination or an unprepared recipient** | Saved locations are studio-owned; one location links to the PO, with a printed address snapshot. [H] [`00697_studio_locations.sql:43–68,117–127`](/Users/kody/Code/patina-merged/supabase/migrations/00697_studio_locations.sql#L43) | Before commitment, show “Ships to [name/address]; received by [contact].” Explicitly confirm whether this is the final site or an intermediate destination. |
| **3. Confusing recording with buying or paying** | Purchase records and vendor payment recording are documented as shipped. [H] [`README.md:106,120`](/Users/kody/Code/patina-merged/artifacts/procurement-buying-review-2026-10-05/README.md#L106) | Offer understandable intentions: **Prepare vendor order**, **Record an order placed elsewhere**, **Record payment**. Explain the consequence before each act; reuse existing capabilities where possible. |
| **4. Two shipment paths with different consequences** | Header tracking explicitly never changes status. Recording a shipment can advance the PO to shipped; status advancement can make pending balances due. [H] [`00698_po_tracking.sql:143–146`](/Users/kody/Code/patina-merged/supabase/migrations/00698_po_tracking.sql#L143), [`00704_po_cost_lines_shipments.sql:573–583`](/Users/kody/Code/patina-merged/supabase/migrations/00704_po_cost_lines_shipments.sql#L573), [`00718_phase2_review_hardening.sql:1834–1861`](/Users/kody/Code/patina-merged/supabase/migrations/00718_phase2_review_hardening.sql#L1834) | One obvious shipment action, with explicit consequences. Saving a number must not unexpectedly represent physical dispatch or alter payment expectations. |
| **5. “Delivered” without inspection—or to the wrong place** | Shipment rows offer “Mark delivered,” separately from the inspection drawer’s count/condition/photo flow. [H] [`shipments.tsx:276–319`](/Users/kody/Code/patina-merged/apps/designer-portal/src/components/document/line-unfold/shipments.tsx#L276), [`log-inspection-drawer.tsx:9–24`](/Users/kody/Code/patina-merged/apps/designer-portal/src/components/portal/procurement/log-inspection-drawer.tsx#L9) | Distinguish **arrival at a named location**, **inspection**, and **site delivery**. Arrival should expose the inspection obligation, not imply its completion. |
| **6. Losing the unshipped remainder** | The shipment model records per-line quantities, but its documented cascade advances the whole PO and linked lines when the first partial ships. [H] [`00704_po_cost_lines_shipments.sql:20–38`](/Users/kody/Code/patina-merged/supabase/migrations/00704_po_cost_lines_shipments.sql#L20) | Show actual quantities: “2 shipped; 4 still with maker.” Never interpret the PO header as proof every item travelled. |

### Important before the relevant lane’s first use

- **Acknowledgment comparison:** make the existing check discoverable immediately after send; do not rebuild it because the initial map only described acknowledgment logging. Its shipment is documented. [H] [`README.md:122`](/Users/kody/Code/patina-merged/artifacts/procurement-buying-review-2026-10-05/README.md#L122)
- **COM handoff:** demonstrate the material-to-workroom sequence with a realistic order before buying COM. Linked COM/submittal functionality is documented as shipped, but that does not prove the operating sequence is legible. [H] [`README.md:119`](/Users/kody/Code/patina-merged/artifacts/procurement-buying-review-2026-10-05/README.md#L119)
- **Receiving ownership:** agree who inspects and who enters evidence. Do not assume an external warehouse already has an authorized portal role.

### Matters primarily at scale [M]

Carrier synchronization, cross-PO consolidated delivery planning, structured custody transfers, receiver integrations and more elaborate destination allocation become increasingly valuable. They should not delay an understandable manual first-purchase path.

**Exception:** explicit destinations, partial quantities and claim responsibility matter on order one—not only at scale.

## 4. The destination model we want

**Recommendation: job destinations drawn from studio contacts/locations, plus explicit movements between them.** Reuse the studio location directory rather than create a second address book. [M]

A job should identify its relevant destinations:

- Receiver warehouse
- Job site/client home
- Workroom/upholsterer
- Studio
- Other agreed destination or pickup point

Each needs the operating facts: contact, hours, appointment requirements, dock/liftgate/access constraints, instructions and receiving responsibilities.

### Keep three concepts separate

1. **Intended route:** where this item is expected to travel.
2. **Actual movement:** which quantity moved from A to B.
3. **Custody/inspection:** who has it now, and what was verified there.

Examples:

- Fabric vendor → workroom; completed upholstery → receiver → site.
- Maker → receiver → site.
- Retailer → site.
- Antique dealer → studio pickup → receiver → site.

The fabric and finished chair are related purchases, not the same physical quantity moving unchanged through every stop.

### Per-line versus per-PO destination

The present PO has one destination; the inspected shipment and shipment-line definitions add no independent destination. [H] [`00697_studio_locations.sql:117–127`](/Users/kody/Code/patina-merged/supabase/migrations/00697_studio_locations.sql#L117), [`00704_po_cost_lines_shipments.sql:112–163`](/Users/kody/Code/patina-merged/supabase/migrations/00704_po_cost_lines_shipments.sql#L112)

**Minimum first-purchase recommendation:** separate vendor orders by destination when necessary. Make the split understandable and retain existing release controls.

**Later:** quantity allocations and explicit transfer legs can support more complex routing. Do not put two addresses into one unstructured ship-to field.

**Labelled disagreement**

- **Purchasing-agent seat:** splitting POs adds paperwork and may complicate vendor minimums or freight.
- **Warehouse-lead seat:** ambiguous routing costs more than the paperwork.
- **Shared recommendation:** start with destination-specific paper; add split-destination instructions only when a real vendor transaction demands them.

## 5. Tracking: automate observations, not acceptance

**Today:** header tracking is manual and deliberately does not advance status. The supplied carrier research does not establish a working carrier feed for studio POs. [H for the write behavior] [`00698_po_tracking.sql:143–146`](/Users/kody/Code/patina-merged/supabase/migrations/00698_po_tracking.sql#L143)

### What should become automatic [M]

For supported carriers, collect:

- Pickup/first physical scan
- Latest movement and observation time
- Carrier-estimated arrival
- Delivery exception or attempted delivery
- Carrier-reported delivery, destination detail and proof of delivery where available

Show the source and freshness. Preserve distinct meanings for **vendor promised ship date**, **carrier ETA**, and **booked delivery appointment**.

A label is not a pickup. An ETA is not an appointment. A PRO number needs its carrier identified.

### What stays human [M]

- Acknowledgment acceptance and specification changes
- Maker readiness and custom-production milestones
- Local truck, will-call and unsupported white-glove movements
- Receiver appointments and consolidated install scheduling
- Physical counts, condition, inspection and site handoff
- Claim resolution and authorization of payments

### The dangerous shortcut

> **Carrier says delivered ≠ receiver inspected ≠ delivered to site ≠ installed.**

A carrier scan should prompt reconciliation, not mark goods inspected, accepted or installed.

**Warehouse-lead objection to waiting for portal entry:** physical delivery may start contractual notice periods before anyone records receipt. Delayed data entry cannot postpone those obligations.

**Shared recommendation:** retain carrier evidence separately; flag unverified arrivals promptly and show a conservative potential deadline while the studio verifies the event. Do not invent a universal legal deadline or overwrite a verified receipt.

The existing defaults are **72 hours vendor / five days concealed-carrier**, configurable by vendor. They are product defaults—not proof of the governing terms for a particular shipment. [H] [`VISION-DECISIONS.md:408`](/Users/kody/Code/patina-merged/docs/vision/VISION-DECISIONS.md#L408)

Operationally: photograph exceptions, retain packaging and delivery documents, identify the responsible claimant and confirm notice requirements. A drafted claim is not notice sent.

**External receivers remain external recipients.** A tracking alert emailed to the warehouse is not automatically exempt “internal mail”; vendor/receiver/client communications must follow V22’s applicable designer-Send rule. [H] [`VISION-DECISIONS.md:609–615`](/Users/kody/Code/patina-merged/docs/vision/VISION-DECISIONS.md#L609)

## 6. Minimum purchaser vocabulary

**Proposed reading vocabulary—not replacement database enums.** Keep the item’s main stage short; put quantities, location, condition and the next act beside it. [M]

| Main stage | Meaning |
|---|---|
| **Not ordered** | No external commitment recorded. Explain what is missing before purchase. |
| **Awaiting acknowledgment** | Purchase instruction sent; vendor response still outstanding. Skip for applicable retail/dealer transactions. |
| **On order** | Vendor order recorded. Show production or ready-for-pickup details when relevant. |
| **In transit** | Identified quantities physically dispatched to a named destination. |
| **At receiver** | Physically there. Explicitly say **inspection pending**, **inspected**, or **issue recorded**. |
| **On site** | Physically received at the job—not merely at its warehouse. |
| **Installed** | Placement/assembly complete; punch may remain. |
| **Complete** | Required physical work and associated exceptions resolved. |

Supporting facts—not additional compulsory lifecycle steps:

- **Before commitment:** draft; awaiting owner release; client approval/funding position.
- **Fulfillment:** 2 of 6 shipped; 1 damaged; 3 still with maker.
- **Production:** awaiting COM; awaiting drawing approval; ready to ship.
- **Next act:** inspect by Thursday; book site delivery; review acknowledgment.
- **Exception:** backordered; claim open; return pending; cancelled.

Never let “Claim open” erase where the object physically is. Never force stock or retail goods through a fictional “In production” step.

## 7. Founder discussion and first walkthrough

### Preserve existing rulings

Do not reopen settled ship-to refusal, release controls or vendor-write restrictions under the guise of UX cleanup. These are recorded rulings. [H] [`VISION-DECISIONS.md:400–408`](/Users/kody/Code/patina-merged/docs/vision/VISION-DECISIONS.md#L400)

### Decisions to surface—not settle here

1. **F25:** what the item should say before its draft PO is actually sent.
2. **Custody language:** approve the distinction between receiver arrival, inspection and site delivery.
3. **Destination scope:** destination-specific orders first, or a demonstrated immediate need for quantity-split routing?
4. **Receiver participation:** studio-entered warehouse evidence initially, or a separately designed permissioned receiving workflow?
5. **Tracking:** provider trial, privacy/subprocessor implications and subscription treatment.
6. **Client visibility:** keep expanded homeowner tracking parked pending its governing decision; it is explicitly listed as a side journey. [H] [`VISION-DECISIONS.md:475–489`](/Users/kody/Code/patina-merged/docs/vision/VISION-DECISIONS.md#L475)

### The founders’ deck should follow one purchase, not tour features

Use one illustrative job containing:

- A trade sofa to the receiver
- COM fabric to a workroom
- Retail lights purchased on a card for site delivery
- An antique collected from a dealer
- A partial shipment with one damaged piece

For each, show **what Leah sees, what she does, what changes, and who acts next**—inside The Document, not a new dashboard.

The decisive first-use test is whether a studio member can complete those handoffs without Leah narrating where each control lives. That is the missing evidence this code-only assessment cannot supply.
