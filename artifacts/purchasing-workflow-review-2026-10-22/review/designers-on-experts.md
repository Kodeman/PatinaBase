# Buying for a job — joint design revision

## Our position

**We agree with the purchasing experts’ operational distinctions. We would not expose their eleven-stage workflow as eleven compulsory steps.**

Leah should see the piece, its actual position, its destination and the next person responsible. The detailed purchasing record should support that reading without becoming another system to maintain.

That fits the governing direction: one living Document, information collected where needed, no purchasing dashboard. **[H]** `/Users/kody/Code/patina-merged/docs/vision/VISION.md:48–58`

**Confidence:** [H] inspected evidence; [M] design recommendation requiring studio validation; [L] untested assumption. All proposed behavior below is **[M]**, not shipped functionality. No new live walk or production transaction was performed for this round.

## 1. Where the experts’ workflow becomes too much

| Expert requirement | Risk if translated literally | Our design response |
|---|---|---|
| Eleven operational stages | Every purchase becomes a checklist, including retail lights that never enter production. | Reveal only the relevant next act. Keep the complete history underneath. |
| Full logistics information | Designers become freight coordinators entering dock details repeatedly. | Maintain destination instructions once; reuse and confirm them on the order. Ask shipment-specific questions only when needed. |
| A checked acknowledgment | A second complete specification-entry exercise. | Show the original instruction beside the vendor response. Confirm agreement or record differences without retyping unchanged facts. |
| Production follow-up | Routine “still waiting” updates become busywork. | Show the last confirmed information and its source. Offer follow-up when due; do not require invented milestones. |
| Custody and transfer records | A warehouse-management system appears before the first purchase. | Start with named destination, reported arrival, inspection evidence and the next delivery responsibility. Structured transfers can follow demonstrated need. |
| Complete financial reconciliation | Every physical movement becomes an accounting form. | Keep payment standing visible when relevant. Recording shipment, receipt or installation must not masquerade as authorizing payment. |
| One lifecycle vocabulary | Stock, custom, dealer and sample purchases are forced through the same ritual. | Share factual wording, but allow different paths. Samples remain separate from the finished purchase. |

### We also revise our own round-one design

Our first proposal carried unnecessary complexity:

- **Remove mandatory quantity-allocation planning from the first-purchase scope.** Start with destination-specific orders. Introduce split quantities only when a real transaction requires them.
- **Remove “Add arrival estimate” as the default next act for moving goods.** Missing information is not automatically useful work. Show “Arrival estimate not provided”; suggest a follow-up only when planning depends on it.
- **Reduce the desktop overview.** Five equally prominent columns would make the Document resemble a purchasing spreadsheet.
- **Keep the long status glossary as a writing specification, not a visible pipeline.**
- **Defer scanning and connected tracking from the minimum manual journey.** Both deserve clearly labelled future specimens, not implied availability.

## 2. The revised experience: four working moments

These are moments in the story, **not tabs or required lifecycle stops**.

### A. Prepare the purchase

The designer opens a piece and chooses an intention:

- **Prepare vendor order**
- **Record purchase made elsewhere**
- **Record payment**

These are different consequences. Recording a checkout must never place the purchase again.

For a vendor order, the paper gathers the relevant specification, quantities, destination, costs and terms. It shows three separate standings:

1. Client agreement and purchasing authorization.
2. Funding and studio exposure.
3. Internal release.

Do not compress those into one reassuring “Approved.”

**One motion:** prepare and review the order in one sheet.

**Separate authority:** request internal release when required; after approval, return the paper to the buyer for the designer’s Send. Approval must not silently send it.

The local walk already demonstrated that release approval leaves the PO unsent, but the member’s return handoff was unclear. **[H]** `/Users/kody/Code/patina-merged/artifacts/purchasing-workflow-review-2026-10-22/walk/walk.md:48–53`

For purchases placed by website or phone, present the applicable release standing before commitment. Recording an already-made purchase must preserve what actually happened and expose any policy exception, rather than falsifying approval or hiding the transaction.

### B. Confirm what the vendor accepted

After sending:

> **Ordered · awaiting acknowledgment**  
> Hale · Receiving warehouse  
> **Record acknowledgment**

Where an acknowledgment is appropriate, compare it with the order. The purchaser confirms agreement or identifies discrepancies.

**One motion:** record the vendor response and check it against the paper.

**Do not infer:** acknowledgment received does not mean acknowledgment checked; acknowledgment checked does not prove production started.

For retail and dealer purchases, use the actual confirmation or receipt. Skip a fictional acknowledgment ceremony.

### C. Follow the goods

A collapsed row answers the physical questions:

> **Dining chairs ×6**  
> Hale · Dining room  
> **4 in transit to Receiving warehouse · 2 await shipment**  
> Studio update, 22 October · Arrival estimate not provided

A meaningful action or waiting sentence follows. Do not manufacture a button for every row.

**One motion:** record an actual shipment with its contents, carrier, tracking/PRO number and available dates.

**Different act:** add a tracking number before pickup. That should not assert dispatch.

This distinction needs genuine behavioral work, not just new labels. The inspected shipment function advances the PO through the existing status command; that command can make pending balances due. **[H]**

- `/Users/kody/Code/patina-merged/supabase/migrations/00704_po_cost_lines_shipments.sql:575–583`
- `/Users/kody/Code/patina-merged/supabase/migrations/00718_phase2_review_hardening.sql:1834–1861`

A future carrier feed may supply observations. It must not turn those observations into acceptance, inspection, installation or payment authorization.

### D. Receive, then resolve

The phone entrance becomes **Receive a delivery**.

The receiver confirms:

- Which shipment or purchase arrived.
- Where and when it physically arrived.
- Quantities received.
- What was inspected and what remains uninspected.
- Damage, wrong items or actual shortages.
- Supporting notes, delivery documents and photos where available.

**One motion when appropriate:** record arrival and inspection together.

**Separate when necessary:** save arrival with inspection pending, a responsible person and the applicable urgency. Do not force someone at the door to certify unopened goods.

For four intentionally shipped chairs out of six ordered:

> **4 received at warehouse**  
> 3 inspected good · 1 damaged  
> 2 still await shipment  
> **Review claim draft**

The unshipped two are not automatically a receiving shortage.

**One continuous experience:** receipt → issue evidence → claim draft.

**Separate consequential action:** review and Send the claim.

The current receiving hook saves the receipt before subsequent claim work. The design must preserve that successful receipt if follow-up fails, rather than suggesting the entire operation was rolled back. **[H]** `/Users/kody/Code/patina-merged/packages/supabase/src/hooks/use-procurement.ts:1902–1945`

## 3. What may be inferred

**Infer summaries from evidence; never infer the evidence itself.**

| Safe derivation | Required limit |
|---|---|
| Shipment and receipt totals | Use matching item quantities and units; expose discrepancies rather than silently reconciling them. |
| “2 await shipment” | Derive from valid recorded allocations, accounting for cancellations and corrections. |
| Suggested destination | Use the selected job destination or explicit COM relationship; require confirmation before commitment. |
| A draft receiver notice | Populate from the shipment and selected recipient; designer reviews and Sends. |
| Suggested next act | Derive from recorded prerequisites, ownership and exceptions. |
| “No buying action needed” | Only when no applicable outstanding quantity, inspection, claim or other obligation remains. |

**Never infer:**

- Clean condition because delivery was reported.
- Production because an acknowledgment arrived.
- Final site delivery because a warehouse received goods.
- Inspection date from data-entry time.
- Agreement, funding, release or payment authorization from another status.
- A contractual deadline from a universal default.
- Completion merely because installation was recorded.

## 4. What belongs to the receiver

**The designer owns commercial intent. The receiving party establishes physical facts. The studio reconciles the two.**

| Person | Responsibility |
|---|---|
| Buyer | Correct item, vendor commitment, destination, purchase evidence and vendor discrepancies. |
| Receiver or onsite recipient | Physical arrival, counts, visible exceptions, documents, inspection evidence and custody. |
| Studio receiving coordinator | Obtain external receiver evidence, record its source and reconcile missing or conflicting information. |
| Named claim reviewer | Check obligations, review and Send notice, pursue resolution. |
| Delivery/installation coordinator | Site readiness, appointment, delivery scope and unresolved punch work. |

One person may hold several responsibilities. Do not require the studio to configure five roles before buying a lamp.

An external warehouse is **not assumed to have portal access**. Initially, a studio member can record its report:

> **Warehouse reports 4 received**  
> Received 28 October · Entered by Morgan, 29 October  
> Inspection report pending

That preserves provenance without making the designer pretend to have inspected the goods.

Receiver communications remain external communications. The applicable designer-Send rule still applies. **[H]** `/Users/kody/Code/patina-merged/docs/vision/VISION-DECISIONS.md:609–615`

## 5. Multiple destinations without a route-planning application

We accept the purchasing experts’ simpler first step:

**One destination per vendor order; separate reviewed papers where destinations differ.**

Use a small job destination list drawn from the existing studio directory. Saved-location infrastructure already exists; a second address book is unnecessary. **[H]** `/Users/kody/Code/patina-merged/apps/designer-portal/src/components/document/people/studio-locations-editor.tsx:316–330`

Show recipient instructions progressively:

- On the row: **To Receiving warehouse**.
- Before sending: name, address, receiving contact and relevant restrictions.
- In expanded detail: hours, appointment requirements and operating instructions.

For COM, show the relationship plainly:

> Fabric goes to Hollis workroom.  
> Chair production awaits confirmed fabric receipt.  
> Finished chair goes to Receiving warehouse.

Material and finished furniture remain distinct purchases.

Warehouse-to-site delivery is a later physical movement, not another purchase. Until a structured transfer capability exists, show the reported location and next responsibility honestly; do not draw an apparently functioning transfer system into the first-release specimen.

## 6. The calm overview

Keep the proposed **Pieces & purchasing** name for founder review.

Each row has three visual groups:

1. **Piece** — name, quantity, room and vendor.
2. **Position** — actual quantities, named location/destination, relevant date and source.
3. **Next** — an action, a named waiting state or an unresolved exception.

Financial detail stays available in the unfold rather than competing with physical fulfillment in every row.

At 390px, those groups stack. Names wrap. **Receive a delivery** is discoverable without opening an individual line.

Above the rows, one factual sentence is enough:

> **One order awaits Leah’s release. One claim draft needs review.**

No readiness score, progress ring or compulsory lifecycle strip.

## 7. What we explicitly agree to

Both design seats agree with the purchasing experts on these non-negotiables:

- Draft paper is distinguishable from an external purchase commitment.
- Every order has an explicit destination and an understood receiving party.
- Partial shipments and receipts retain their quantities and remainder.
- Carrier delivery, physical receipt, inspection, site delivery and installation remain distinct.
- A claim stays visible alongside the goods’ location.
- Claim obligations use actual event dates, source terms and named responsibility.
- Tracking shows source, freshness and unsupported coverage honestly.
- Dealer, retail, custom and sample paths do not pretend to be identical.
- Existing permission, financial and release controls remain authoritative.
- External drafts wait for the applicable designer Send.
- The understandable manual path comes before elaborate automation.

### Labelled disagreements

**Interaction designer:** combine clean arrival and inspection to make receiving fast.  
**Information designer:** separate evidence must remain legible when inspection happens later.  
**Agreement:** one instrument supports both; “Uninspected” is explicit, never defaulted to good.

**Interaction designer:** show one decisive next act.  
**Information designer:** an inspection deadline and an open claim can coexist.  
**Agreement:** one leading act plus a short outstanding-obligations sentence. Nothing important disappears merely because another task ranks first.

## 8. Founder rulings and presentation changes

**F25 remains open.** The decision log records the draft-PO/“RELEASED TO MAKER” problem as not yet ruled. Our proposed wording must be labelled as a recommendation, not a settled change. **[H]** `/Users/kody/Code/patina-merged/docs/design/the-document/DECISIONS.md:11405–11407`

Also ask Kody and Leah to decide:

- Who receives the handoff after release, arrival and damage?
- Is studio-entered warehouse evidence sufficient initially?
- Do the first actual purchases require split-quantity destinations?
- Which real carriers justify connected tracking first?
- How should receipt-before-inspection responsibility work?

For the founders’ HTML presentation, follow one trade purchase from preparation to warehouse receipt and site handoff. Use short branches for COM, retail/dealer buying and partial damage. Every specimen should show:

**What Leah sees → what she does → what changes → who acts next.**

Show manual tracking first. Put connected tracking and structured transfers in clearly labelled future-capability panels.

The supplied walk used local dry-run email and a media stub. It does not prove production sending or real phone-photo upload. **[H]** `/Users/kody/Code/patina-merged/artifacts/purchasing-workflow-review-2026-10-22/walk/walk.md:3–9`

**The proposed experience succeeds when a studio member can continue the purchase without Leah explaining where the controls are—and without the interface claiming something happened that nobody verified.**
