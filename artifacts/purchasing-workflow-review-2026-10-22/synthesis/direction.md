# Buying for a job
## Joint purchasing × UI/UX direction for Kody and Leah

**US-50 · 22 October 2026 · Proposal only**

Intended synthesis location: `/Users/kody/Code/patina-merged/artifacts/purchasing-workflow-review-2026-10-22/synthesis/direction.md`

**Evidence and confidence**

- **[H]** Directly supported by inspected source, a governing decision, or the documented local walk.
- **[M]** Operational or design recommendation requiring validation with Leah’s studio.
- **[L]** Unconfirmed feasibility, commercial terms, or coverage.
- All proposed behavior is **[M]** unless explicitly qualified otherwise.
- Source inspection used HEAD `495a43b32ebada7781b8a04f2f907749258b2caa`. This synthesis is not a production-readiness certification.
- The purchasing-agent, warehouse-lead, interaction-design and information-design seats are analytical perspectives, not interviewed practitioners.

Screenshots named below are under:

`/Users/kody/Code/patina-merged/artifacts/purchasing-workflow-review-2026-10-22/walk/screens/`

---

## 1. Thesis

Buying should be a clear reading of the pieces already inside The Document, with each row showing what was purchased, which quantities are moving, their destination and who acts next. Keep purchase commitment, carrier movement, physical receipt, inspection and installation distinct, while making their handoffs feel continuous. Establish an understandable manual journey first, then add sourced carrier updates without letting a delivery scan certify receipt, condition, payment or completion.

This serves the studio adding its first hands, supports furniture purchasing and preserves the promise that the studio should not notice another system. **[H]** [`VISION.md:21–31,38–58`](/Users/kody/Code/patina-merged/docs/vision/VISION.md#L21)

---

## 2. Today, as walked

The local walk demonstrates substantial manual capability. Its central finding is that the interface does not reliably explain the commercial and physical sequence to an untrained studio member.

The environment used local Supabase, forced-on flags, dry-run email and a media-upload stub. It did **not** prove real vendor email delivery, real phone-photo upload or production behavior. **[H]** [`walk.md:3–10`](/Users/kody/Code/patina-merged/artifacts/purchasing-workflow-review-2026-10-22/walk/walk.md#L3)

### Nine frictions

| Friction | What happened and why it matters | Walk screenshots | Evidence |
|---|---|---|---|
| **1. Buying has no recognizable entrance.** | The rail says **Pieces**, the heading **FF&E selections**, and the act **Edit selections**. Studio-wide orders sit elsewhere. A member must discover the relationship. | `01-document-1440.png`; `02v-pieces-overview-viewport-1440.png`; `23-phone-contents-menu-390.png`; `44-orders-book-1440.png` | **[H]** [`walk.md:16–21,97–100`](/Users/kody/Code/patina-merged/artifacts/purchasing-workflow-review-2026-10-22/walk/walk.md#L16) |
| **2. Status words flatten different truths.** | **Released to maker** covers different order positions and a dealer purchase. Four of six chairs shipped reads **shipped**. A damaged receipt appears dispositioned while its claim remains open. | `40-pieces-after-antique-1440.png`; `42-pieces-overview-status-words-1440.png`; `44-orders-book-1440.png`; `49-partial-shipment-saved-1440.png` | **[H]** [`walk.md:76–79,89–100,107`](/Users/kody/Code/patina-merged/artifacts/purchasing-workflow-review-2026-10-22/walk/walk.md#L76) |
| **3. Tracking looks more connected than it is.** | Saving **Save as shipped** records a studio assertion and advances the PO. It does not subscribe to carrier updates. UPS/FedEx/USPS have link-outs; the walked Estes number did not. | `14-shipment-filled-1440.png`; `15-after-shipment-saved-1440.png`; `57-phone-movement-tracking-390.png` | **[H]** [`walk.md:64–74`](/Users/kody/Code/patina-merged/artifacts/purchasing-workflow-review-2026-10-22/walk/walk.md#L64); [`movement-tracking.tsx:24–41`](/Users/kody/Code/patina-merged/apps/designer-portal/src/components/document/line-unfold/movement-tracking.tsx#L24) |
| **4. Destinations arrive too late in the thinking.** | The paper offers receiver, studio, job site or free text. The workroom was not offered for the linked fabric purchase. Reusable place maintenance was not discovered from buying. | `06-paper-somewhere-else-1440.png`; `30b-chair-buy-cell-1440.png`; `32-fabric-paper-ship-to-workroom-1440.png`; `34-rug-paper-client-home-freetext-1440.png` | **[H]** for paper behavior; **[M]** for discoverability. [`walk.md:41–46`](/Users/kody/Code/patina-merged/artifacts/purchasing-workflow-review-2026-10-22/walk/walk.md#L41) |
| **5. Owner release has no clear return handoff.** | Owner approval correctly leaves the PO unsent. The buyer must find it again, while the member’s Desk says nothing needs attention. The final Send control was obscured in the local preview. | `50-paper-over-threshold-1440.png`; `52-owner-desk-release-need-1440.png`; `54-member-after-owner-approved-1440.png`; `55b-po-preview-send-obscured-1440.png` | **[H]** for handoff; **[M]** for layout defect. [`walk.md:48–53`](/Users/kody/Code/patina-merged/artifacts/purchasing-workflow-review-2026-10-22/walk/walk.md#L48) |
| **6. Commercial standings appear contradictory.** | The section says purchasing authorization is held, yet ordering remains possible. The funding warning and internal release calculation introduce other meanings of approval. | `02v-pieces-overview-viewport-1440.png`; `05-order-paper-sofa-1440.png`; `50-paper-over-threshold-1440.png` | **[H]** [`walk.md:19,34–39,50`](/Users/kody/Code/patina-merged/artifacts/purchasing-workflow-review-2026-10-22/walk/walk.md#L19) |
| **7. Arrival, inspection and installation disagree across instruments.** | After receipt and installation, the shipment can still offer **Mark delivered** and retain an inbound draft. The inspection drawer does not ask where receipt happened. | `16-receive-drawer-warehouse-1440.png`; `17-sofa-after-receive-1440.png`; `41-sofa-installed-1440.png` | **[H]** [`walk.md:70–74,81–83,93–95`](/Users/kody/Code/patina-merged/artifacts/purchasing-workflow-review-2026-10-22/walk/walk.md#L70) |
| **8. Receiving and claims expose competing summaries.** | A dated written-notice sentence coexists with **deadline not set**. The member does not receive the same clear claim handoff as the owner. A draft is easy to mistake for completed notification. | `27-phone-inspection-damaged-390.png`; `29-phone-after-damage-logged-390.png`; `46-orders-receiving-1440.png` | **[H]** [`walk.md:89–91`](/Users/kody/Code/patina-merged/artifacts/purchasing-workflow-review-2026-10-22/walk/walk.md#L89) |
| **9. Familiar intentions have unfamiliar doors.** | Quote and sample forms record events rather than request them. Dealer/store-buy entrances overlap. Phone receiving takes several navigation steps and truncates names. | `04-quote-open-1440.png`; `35-request-sample-form-1440.png`; `37b-add-items-menu-1440.png`; `25-phone-lamps-line-390.png`; `26-phone-inspection-drawer-390.png` | **[H/M]** [`walk.md:23–32,85–87,107–108`](/Users/kody/Code/patina-merged/artifacts/purchasing-workflow-review-2026-10-22/walk/walk.md#L23) |

### Correct the baseline before presenting it

1. **Missing ship-to is already refused.** The current send function checks explicit ship-to before side effects; it does not silently substitute the job site. **[H]** [`po-send/index.ts:398–402,451–452`](/Users/kody/Code/patina-merged/supabase/functions/po-send/index.ts#L398)

2. **Partial shipments have a mounted interface.** Movement mounts both the older header-tracking instrument and `PoShipments`. The issue is competing paths and inconsistent summaries, not an absent shipment form. **[H]** [`movement-cell.tsx:306–328`](/Users/kody/Code/patina-merged/apps/designer-portal/src/components/document/line-unfold/movement-cell.tsx#L306)

3. **Saved locations already exist.** The People editor reads and saves studio locations. The narrower gap is discovery and reuse from the buying paper, not the absence of an address directory. **[H]** [`studio-locations-editor.tsx:316–349`](/Users/kody/Code/patina-merged/apps/designer-portal/src/components/document/people/studio-locations-editor.tsx#L316)

4. **There are two tracking write behaviors.** Header tracking never moves status; `record_po_shipment` can advance a confirmed/in-production PO to shipped. Do not describe them as interchangeable. **[H]** [`00698_po_tracking.sql:143–146`](/Users/kody/Code/patina-merged/supabase/migrations/00698_po_tracking.sql#L143); [`00704_po_cost_lines_shipments.sql:575–583`](/Users/kody/Code/patina-merged/supabase/migrations/00704_po_cost_lines_shipments.sql#L575)

5. **No agreement is already a warning-only ruling.** Explain agreement, authorization, funding and internal release separately. Do not introduce a new agreement block through clearer copy. **[H]** [`VISION-DECISIONS.md:400–408`](/Users/kody/Code/patina-merged/docs/vision/VISION-DECISIONS.md#L400)

---

## 3. The proposed workflow

### A reading of the job, not eleven compulsory steps

Use **Pieces & purchasing** as the proposed common section name, subject to founder approval.

Each collapsed row has three groups:

1. **Piece:** name, quantity and unit, room, vendor.
2. **Position:** purchase standing, quantity position, location/destination, relevant date and source.
3. **Next:** leading act or named waiting state, owner and follow-up when relevant.

An exception remains visible alongside the physical facts. A claim must not replace the location with a single **Damaged** label.

The wording below is proposed reading language, not a replacement database enum. Draft wording remains subject to **F25**.

### Swimlane table

An em dash means no required act in that lane. Stages are conditional: retail purchases do not need production, and direct-to-site deliveries do not need a warehouse.

| Moment / item words | Studio designer | Vendor / maker | Carrier | Receiver warehouse | Job site / installer |
|---|---|---|---|---|---|
| **Add to job — Not ordered** | Identify exact piece, quantity/unit, room and intended destination. Choose purchasing lane. | Supply specification and availability when needed. | — | Supply receiving requirements if relevant. | Confirm intended placement and access needs. |
| **Prepare — Draft order / Purchase planned** | Record quote; review configuration, costs, terms, authorization, funding and internal release separately. | Provide quote and terms. | Freight estimate if arranged separately. | Confirm accepted consignee/address convention. | Confirm direct-delivery constraints. |
| **Internal handoff — Awaiting studio release** | Buyer requests release; owner/admin acts where required. Approval returns to buyer as **Released by Leah · not sent**. | Nothing received yet. | — | — | — |
| **Commit — Ordered · awaiting acknowledgment** | Review and Send PO, or place purchase externally and record confirmation. Record payment separately. | Accept order or issue checkout confirmation. | — | — | — |
| **Check — Acknowledgment received / checked** | Compare response with instruction. Resolve differences through existing authority. | Confirm exact specification, price, destination and commitments. | — | — | — |
| **Follow — On order / Vendor reports in production / Ready for pickup** | Follow up only when needed. Show prerequisites, last source and next owner. Review balance/freight responsibilities. | Report actual readiness and outstanding prerequisites. | Confirm pickup arrangements when applicable. | Confirm ability to accept delivery. | Confirm readiness for direct delivery. |
| **Dispatch — 4 in transit · 2 await shipment** | Record evidenced dispatch and shipment contents. Add carrier/PRO/BOL if available. Review receiver notice draft. | Confirm what left and what remains. | Transport identified goods; provide observations where supported. | Receive reviewed advance notice and arrange appointment. | Same responsibility for direct delivery. |
| **Arrival reported — Carrier reports delivered · receipt unconfirmed** | Reconcile report. Offer **Record receipt** or **Not located / investigate delivery**. | Help resolve misdelivery where needed. | Supply reported time, place and POD/signature if available. | Confirm whether the goods are physically present. | Confirm presence for direct delivery. |
| **Physical receipt — Received at warehouse/site · inspection pending** | Record actual event date, location, quantities and evidence source. Assign inspection responsibility. | — | Preserve signed delivery evidence and exceptions. | Count handling units and goods separately where needed; document visible exceptions. | Perform equivalent arrival check. |
| **Inspection — 4 received · 3 inspected good · 1 damaged** | Reconcile quantities; draft appropriate notice; name claim reviewer. | Receive designer-sent notice and respond. | Receive designer-sent carrier notice when applicable. | Inspect, photograph, retain packaging and report findings. | Inspect direct deliveries or record later discoveries. |
| **Final delivery — At warehouse / In transit to site / Received at site** | Arrange selected goods, appointment, access, manifest and holds. This is a transfer, not another purchase. | — | Local delivery may be manual. | Release agreed goods and preserve condition evidence. | Count and record site arrival/condition. |
| **Installation — Installed · punch/claim remains, if applicable** | Record installation; keep claims, credits and outstanding quantities visible. | Resolve remedies or missing parts. | — | — | Confirm placement/assembly and punch work. |

### Compact text diagram

```text
STUDIO DESIGNER
Add piece → review specification, destination and standings
          → [owner release if required] → buyer reviews and Sends
          → check acknowledgment → follow the goods
          → reconcile receipt/inspection → resolve issues → record installation
                    │
                    └─ External checkout:
                       place order outside Patina → record existing purchase
                       NOTHING is sent or ordered again

VENDOR / MAKER
Quote → accept order → confirm prerequisites/readiness → dispatch actual quantities
                                                         │
CARRIER                                                  ▼
                                      Pickup → movement → reported delivery
                                                            │
                                             ┌──────────────┴──────────────┐
RECEIVER WAREHOUSE                            ▼                             │
                                  Receive → inspect → hold/resolve         │
                                            → site delivery                │
                                                   │                       │
JOB SITE / INSTALLER                               ▼                       ▼
                                             Receive at site → install → punch

Carrier report ≠ physical receipt ≠ inspection ≠ site delivery ≠ installation.
Claims and financial obligations can remain open alongside any physical stage.
```

### The external-purchase branch

Present three understandable intentions:

- **Prepare vendor order**
- **Record purchase made elsewhere**
- **Record payment**

For a website, phone, retail or dealer purchase:

1. Review the applicable destination and authority before external commitment.
2. Complete checkout outside Patina.
3. Record vendor order number, actual date, confirmation/receipt, totals and payment evidence.
4. State **“This records an existing purchase. Nothing will be sent or ordered.”**
5. Continue with shipment, pickup or arrival as appropriate.

An already-made purchase without required approval remains historical truth. Record it and expose the exception; never imply later approval happened before checkout.

A retail confirmation can replace an acknowledgment ritual. A unique antique may need condition evidence, hold expiry and pickup arrangements rather than production milestones.

---

## 4. Destinations model

### Reuse the studio directory; identify the places relevant to this job

**Today:** locations are studio-owned. A PO links one saved location and retains its printed `ship_to` snapshot. Shipment lines identify quantities but do not establish independent destinations. **[H]** [`00697_studio_locations.sql:43–68,117–127`](/Users/kody/Code/patina-merged/supabase/migrations/00697_studio_locations.sql#L43); [`00704_po_cost_lines_shipments.sql:112–163`](/Users/kody/Code/patina-merged/supabase/migrations/00704_po_cost_lines_shipments.sql#L112)

**Proposed job destination list:**

| Place | Necessary operating information |
|---|---|
| Receiving warehouse | Accepted consignee, contact, receiving hours, appointment and dock/liftgate requirements. |
| Job site / client home | Address, authorized recipient, access, protection and appointment requirements. |
| Workroom / upholsterer | Contact, material reference, fabrication-order reference and delivery instructions. |
| Studio | Recipient, hours and practical handling limits. |
| Other vendor / pickup point | Named receiving party and specific acceptance or collection instructions. |

Private client-home reuse across jobs needs an explicit visibility decision. A studio directory is not permission to expose a client address throughout the studio unnecessarily.

### Per-line ship-to: desired intent versus current commitment

- Show **To Receiving warehouse** beside each relevant line.
- Before commitment, show the full destination and receiving party on the paper.
- Initially, keep **one destination per vendor order**.
- Different destinations require separately reviewed papers under that constraint.
- Do not introduce mandatory quantity-allocation planning for every piece.

If six chairs genuinely need four sent to the warehouse and two to site, use an explicit allocation design before implementation. Preserve the six-chair commercial total and reviewed quantities.

If the vendor already accepted one six-chair purchase, rerouting is a reviewed change to that purchase. It must not create two new purchases.

### Hops

Illustrative routes:

```text
Maker → receiving warehouse → job site

Fabric vendor → workroom
Finished chair from workroom → receiving warehouse → job site

Retailer → job site

Antique dealer → studio pickup → receiving warehouse → job site
```

These are proposed route explanations, not claims that structured transfer records exist today.

For COM, fabric and finished furniture are distinct purchases with different units and prerequisites. Use:

> Fabric goes to Hollis workroom.  
> Awaiting workroom confirmation of fabric quantity and identity.  
> Drawing approval remains outstanding.  
> Finished chair goes to Receiving warehouse.

Do not infer fabrication readiness from fabric arrival alone.

### Consignee and sidemark rules

- **Consignee:** the actual receiving party for that leg.
- **Ship-to:** the physical destination and accepted recipient.
- **Bill-to / freight payer:** separate commercial facts.
- **Sidemark:** stable studio/job reference, with item or room reference where useful.

Confirm the recipient’s required convention. Carry the reference through order paper, acknowledgment, carton labels, receiver evidence and delivery manifest.

A sidemark never substitutes for an address. Editing a saved location must not silently rewrite sent paper.

---

## 5. Tracking

### Answer to Kody’s question

**Can the studio enter tracking numbers today? Yes. Does the portal then follow those shipments automatically? No demonstrated studio-PO carrier feed exists.** The walked shipment form advances status because a person saves a shipment; later carrier progress does not arrive automatically. **[H]** [`walk.md:64–74`](/Users/kody/Code/patina-merged/artifacts/purchasing-workflow-review-2026-10-22/walk/walk.md#L64)

### Two honest lanes

| Connected observations — proposed | Manual work — retained |
|---|---|
| Supported parcel and verified LTL carrier events. | Maker readiness and custom-production prerequisites. |
| First physical scan, transit, exception and reported delivery. | Maker trucks, local delivery, white-glove services without feeds and studio pickup. |
| Carrier-estimated arrival and update timestamp. | Booked appointments, destination acceptance and freight coordination. |
| POD/signature where available. | Physical receipt, quantities, inspection, condition and custody. |
| Internal discrepancy alerts. | Claim review, external Send, payment authority and installation. |

For LTL, require a selected carrier alongside the PRO. Do not rely on ambiguous number detection.

Show three distinct dates:

- **Vendor estimated ship date**
- **Carrier estimated arrival**
- **Booked delivery appointment**

Unknown dates remain unknown. Do not make **Add arrival estimate** the default next act.

### Provider recommendation

**Recommendation: trial AfterShip first, with Ship24 as a comparison, using carriers Leah’s actual vendors use.** AfterShip has the strongest supplied evidence for national LTL coverage. Provider selection, data sharing and cost treatment require founder approval.

The following commercial information comes from the supplied carrier research, dated 22 October 2026. It was not independently re-fetched for this synthesis.

| Provider | Fit and estimated cost | Evidence / qualification |
|---|---|---|
| **AfterShip** | Best documented LTL candidate. Approximately **$70/month for 500 shipments**, with roughly **$0.12 overage**. | Carrier coverage **[H]** from [carrier directory download](https://track.aftership.com/carriers/download). Pricing **[M]** from secondary/search evidence because its pricing page was inaccessible. [Webhook-signature documentation](https://www.aftership.com/docs/tracking/webhook/webhook-signature) also needs direct confirmation. |
| **Ship24** | Comparison candidate. Supplied research found **$39–$59/month**, depending on product; price unresolved. | **[M]** overall. [Pricing](https://www.ship24.com/pricing); [webhook authentication](https://docs.ship24.com/webhooks/authentication). Target LTL carrier coverage remains to be demonstrated. |
| **EasyPost** | Low-cost parcel benchmark, approximately **$0.01–$0.03 per tracked shipment**. | Parcel pricing **[H in supplied primary-source research]**; relevant LTL support **[L]**. [Pricing](https://www.easypost.com/pricing); [webhooks](https://docs.easypost.com/docs/webhooks). |
| **Shippo** | Parcel alternative, approximately **$0.02 per track** on the cited Starter offering. | Pricing **[H in supplied research]**; LTL suitability **[L]**. [API pricing](https://goshippo.com/pricing/api). |
| **ShipEngine LTL** | Possible carrier-specific alternative; no usable small-volume price established. | **[M]** coverage; documented beta tracking/polling approach. [LTL tracking](https://www.shipengine.com/docs/ltl/tracking/). |

At approximately 20–80 tracker registrations monthly, parcel usage pricing could be under a few dollars. An LTL-capable plan may instead have a roughly $40–$70 monthly floor. These are planning estimates, not a purchasing authorization or guaranteed quote.

Trial success requires demonstrated coverage, useful freshness, exceptions, authenticated delivery of events and acceptable data terms. Do not promise broad LTL coverage from a directory listing alone.

### Delivered ≠ received

A carrier report may say:

> **Carrier reports delivered Tuesday, 2:14 pm.**  
> Receiving warehouse · signature available  
> **Record receipt** · **Not located / investigate delivery**

It must not:

- Create a clean inspection.
- Invent custody.
- Mark the item installed.
- Mark the order complete.
- Authorize or record payment.
- Overwrite a verified human receipt or studio-authored commitment date.

Store carrier observations separately from studio-authored receipt and commitment fields. Distinguish **label created**, **physically moving**, **available for pickup** and **delivered**.

A carrier delivery timestamp can signal that a contractual notice period may already be running. Delayed portal entry does not extend that period.

### Notices

Automatic notices are **internal to authorized studio members**:

- Carrier reports delivery; no receipt recorded.
- Delivery exception or conflicting destination.
- Carrier estimate now conflicts with a planning commitment.
- Inspection outstanding or notice deadline approaching.
- Connected updates unavailable or stale.

A warehouse, installer, vendor or homeowner is not automatically an internal recipient. Their messages remain drafts for the applicable designer Send under V22. **[H]** [`VISION-DECISIONS.md:609–615`](/Users/kody/Code/patina-merged/docs/vision/VISION-DECISIONS.md#L609)

Missing recipient information should produce **Add receiver contact** or an explicit manual handoff, never an apparently sendable draft addressed to nobody.

### Integration boundary

Use the existing Supabase domain and established edge-function/pg_cron patterns. New carrier ingestion must authenticate provider events, handle replay and duplicates, preserve provenance and fail closed.

Do not repurpose marketplace fulfillment merely because it contains EasyPost code. This proposal does not authorize new services, provider enrollment, production tracking registration or data disclosure.

---

## 6. Receiving on site at 390px, and claims in one motion

### Entry

Place **Receive a delivery** directly in Pieces & purchasing. It should not require opening a line and scrolling to its next act.

At 390px:

- 16px minimum side gutters.
- Full-width, wrapping item names.
- At least 44px touch targets.
- One-column fields.
- Reachable footer clear of the global drawer and safe area.
- No page-level horizontal scrolling.
- Condition and urgency understandable without color.

### One receipt instrument

1. **Identify the delivery.** Search by vendor, PO, item or tracking number. Select the actual shipment where known.
2. **Confirm location and actual event date/time.** Entry time is separate.
3. **Record the source.** Direct observation, warehouse report or another identified source.
4. **Count what arrived.** Preserve handling-unit counts separately from goods quantities when relevant.
5. **Record inspection standing.** Fully inspected, partly inspected or uninspected.
6. **Add issue evidence.** Damage, wrong item and packaging condition can overlap.
7. **Save receipt**, or **Save receipt & draft claim**.

No default clean certification. Someone signing for unopened cartons must be able to record arrival without claiming inspection.

### The partial-shipment test

Illustrative example:

> **Dining chairs ×6**  
> Shipment A expected: 4 chairs  
> Arrived at warehouse: 4 chairs  
> Inspected: 3 good · 1 damaged  
> Remaining order: 2 not yet shipped  
> **Claim draft ready · not sent**

The two unshipped chairs are not short on Shipment A.

Use **backordered** only when the vendor has reported backorder. Absence of shipment information is not evidence of backorder.

### Preserve successful work

The current receiving hook saves the receipt before subsequent claim work. The proposed continuous experience must not imply those operations already form one all-or-nothing transaction. **[H]** [`use-procurement.ts:1889–1945`](/Users/kody/Code/patina-merged/packages/supabase/src/hooks/use-procurement.ts#L1889)

If follow-up fails, say:

> **Receipt saved. Claim draft could not be created.**  
> **Retry claim draft**

If photos fail:

> **Receipt saved. Two photos were not uploaded.**  
> **Retry photos**

Retries must not duplicate the receipt.

### Claims

Keep the issue beside the affected goods and leg:

> **Received at site · 1 damaged**  
> First discovered during site unpacking  
> Earlier warehouse receipt and photos available  
> Claim reviewer: Morgan  
> **Review notice obligations**

Show separately:

- Vendor written-notice obligation.
- Carrier notice obligation.
- Actual event used to calculate each.
- Source terms or clearly identified product default.
- Recipient, reviewer and whether notice was actually sent.

The recorded defaults are 72 hours vendor and five days concealed carrier, configurable per vendor. They are not universal legal deadlines. **[H]** [`VISION-DECISIONS.md:408`](/Users/kody/Code/patina-merged/docs/vision/VISION-DECISIONS.md#L408)

Damage discovered at site must preserve earlier evidence. Do not restart the original freight clock or automatically blame the vendor. A replacement is a linked remedy, not another fulfilled unit of the original order.

Unknown cartons need an unresolved arrival/report path rather than a fabricated matched item receipt. External warehouses are not assumed to have portal accounts.

---

## 7. Disagreements resolved

These are joint recommendations for founder review, not new governing rulings.

| Call | Purchasing argument | Design argument | Joint direction and reason |
|---|---|---|---|
| **One workflow versus many records** | Preserve commercial, transport and custody distinctions. | Do not expose an eleven-step administrative checklist. | Four working moments: prepare, confirm, follow, receive/resolve. Reveal only relevant steps. |
| **Overview density** | Show quantities, destination, dates and responsibility. | Five equal columns would resemble a procurement spreadsheet. | Three groups: Piece, Position, Next. Keep money detail underneath unless immediately consequential. |
| **One next act** | Several obligations can coexist. | A clear leading act supports delegation. | One leading act plus a short outstanding-obligations sentence; detail retains owners and follow-ups. |
| **Arrival and inspection** | They are distinct evidence. | Combining them is faster for a clean delivery. | One instrument supports both combined and deferred inspection. Uninspected is explicit. |
| **Split destinations** | Ambiguous routing is unacceptable; accepted vendor orders must not be duplicated. | Mandatory allocation planning would burden ordinary buys. | Destination-specific papers initially. Introduce allocations only for demonstrated need; accepted orders use reviewed changes. |
| **Tracking automation** | Feed observations can reduce follow-up but do not establish acceptance. | Users want a number to explain what happens next. | Show source and freshness. Keep unsupported/manual lanes usable. Connected tracking follows the minimum manual journey. |
| **Missing ETA** | An invented estimate is harmful. | An obvious action can help planning. | Show **Arrival estimate not provided**. Offer a request/follow-up only when planning needs it. |
| **COM readiness** | Material arrival does not prove suitability or readiness. | The relationship must be readable without a dependency application. | Show linked purchases and remaining prerequisites. Ask for workroom confirmation rather than infer production release. |
| **Carrier says delivered** | Goods can be missing despite a delivery scan. | A receipt prompt provides continuity. | Offer both receipt and investigation. Never pressure someone to create a receipt. |
| **Completion** | Claims, credits and invoices may remain after install. | Installed is a useful physical milestone. | Show **Installed** as physical fact; retain unresolved purchasing obligations. |
| **Receiver participation** | Warehouse evidence matters. | External accounts would expand scope substantially. | Studio-entered, sourced warehouse reports first, pending founder approval. |
| **Outbound review** | Recipient and notice evidence matter. | Keep communication in the current sheet. | Consistent reviewed recipient/note/paper experience is recommended. Preserve V22; founders settle PO-review presentation. |

---

## 8. Change list

### Feature-test keys

All changes stay on **The Document**, with existing Desk/People instruments supporting it.

- **Furniture margin:** protects or supports designer-led furniture transactions.
- **Subscription:** improves delegation and dependable studio operation.
- **Promise:** information appears where needed; no duplicate system, invented facts or hidden consequences.

These are design-size estimates, not implementation estimates or approval to build.

### Existing seams to reuse

| Ref | Source and established seam |
|---|---|
| **R1** | Item section and rows: `/Users/kody/Code/patina-merged/apps/designer-portal/src/components/document/ffe-section.tsx:620,1333`; next-act authority: `/Users/kody/Code/patina-merged/apps/designer-portal/src/components/document/line-unfold/next-act.ts:57–88`. |
| **R2** | Order paper: `/Users/kody/Code/patina-merged/apps/designer-portal/src/components/portal/procurement/order-paper/index.tsx:179–220`; explicit ship-to guard: `/Users/kody/Code/patina-merged/supabase/functions/po-send/index.ts:398–402`. |
| **R3** | Location editor: `/Users/kody/Code/patina-merged/apps/designer-portal/src/components/document/people/studio-locations-editor.tsx:316–349`; location hooks/RPC bridge: `/Users/kody/Code/patina-merged/packages/supabase/src/hooks/use-studio-buying.ts:282,345`; `upsert_studio_location`, `set_purchase_order_ship_to_location`. |
| **R4** | Movement mounting: `/Users/kody/Code/patina-merged/apps/designer-portal/src/components/document/line-unfold/movement-cell.tsx:306–328`; shipment form/actions: `/Users/kody/Code/patina-merged/apps/designer-portal/src/components/document/line-unfold/shipments.tsx:138–194,257–319`; `usePoShipments`, `useRecordPoShipment`, `record_po_shipment`: `/Users/kody/Code/patina-merged/packages/supabase/src/hooks/use-buying-phase2.ts:537–609`. |
| **R5** | Receiving instrument: `/Users/kody/Code/patina-merged/apps/designer-portal/src/components/portal/procurement/log-inspection-drawer.tsx:271`; receiving commands: `/Users/kody/Code/patina-merged/packages/supabase/src/hooks/use-procurement.ts:1889–1945`; `record_project_ffe_inspection`, `record_project_ffe_receipt_batch`. |
| **R6** | Purchase recording: `/Users/kody/Code/patina-merged/apps/designer-portal/src/components/document/purchases/purchase-record-form.tsx:51–65`; `/Users/kody/Code/patina-merged/packages/supabase/src/hooks/use-buying-phase2.ts:444`; `useRecordStudioPurchase`, `record_studio_purchase`. |
| **R7** | Claim clock: `/Users/kody/Code/patina-merged/apps/designer-portal/src/components/document/line-unfold/claim-clock.tsx:32,66`; draft review: `/Users/kody/Code/patina-merged/apps/designer-portal/src/components/document/buying/draft-review.tsx:90,283`. |

**Migration notation:** `00850` onward below are **PROVISIONAL planning labels only**. The inspected migration list includes `00849_client_plate_link_check.sql`; these numbers are not reserved. Recheck the actual repository head, definitions and concurrent reservations before implementation. Prefer no migration where existing authority can support the change.

### NOW — before the first real purchase

Prioritize this small, complete manual journey. Do not make carrier procurement, scanning or a transfer application prerequisites.

| ID | Change | Surface / studio moment | Stream / promise | Size | Reuse / migration |
|---|---|---|---|---|---|
| **P-01** | Consistent buying entrance and truthful overview. Proposed **Pieces & purchasing**; expose quantity, destination and next owner; remove unsupported summary assurances. F25-dependent wording remains held. | Document / first delegated buying session. | Margin + subscription / understand the job without opening every line. | M | R1. No migration expected. |
| **P-02** | Explain agreement, authorization, funds and internal release separately. Show current aggregate release calculation without changing its authority. | Order paper / before commitment. | Margin / no reassuring but ambiguous approval. | S–M | R2; existing release controls. No migration expected. |
| **P-03** | Repair release handback and reachable Send. Buyer sees **Released by Leah · not sent** in line and Desk. Confirm local footer obstruction before changing layout. | Paper + Desk / owner-to-buyer handoff. | Margin + subscription / no lost or accidental send. | M | R1–R2, existing Desk feed. Persisted assignment only if existing ownership cannot support it; number TBD. |
| **P-04** | Reuse saved destinations from the buying paper; expose named receiving party and instructions; offer add/edit through existing location instrument. Preserve explicit selection and sent snapshots. | Paper + People sheet / selecting ship-to. | Margin / no address retyping or silent default. | M | R3. No migration expected for directory reuse; job associations are P-10. |
| **P-05** | Clear external-purchase lane. Distinguish preparing a new PO, recording an existing purchase and recording payment. State **Nothing will be sent or ordered**. Preserve policy exceptions as history. | Piece + purchase form / website, phone, retail or dealer checkout. | Margin / no duplicate commitment. | M | R6 and existing order-recording path. No migration assumed. |
| **P-06** | One understandable manual shipment instrument. Show actual shipped quantities and remainder, source and unknown ETA. Explain **Record dispatch** consequences; do not treat number entry alone as dispatch. Preserve legacy tracking records. | Movement + overview / first shipment or partial. | Margin / truthful quantities and no hidden financial consequence. | M | R1, R4. Existing RPC for evidenced dispatch; pre-pickup registration deferred to P-11. |
| **P-07** | Shipment-aware receiving minimum: expected shipment quantities, actual receipt date/location/source, explicit inspection standing and safe claim follow-up. Reconcile obsolete movement acts without inventing events. | Phone + receiving sheet / first arrival. | Margin + subscription / one physical event recorded once. | L | R4–R5. **00850 PROVISIONAL** only for missing receipt linkage/provenance or inspection-standing support after tracing current authority. |
| **P-08** | Coherent claim obligations and ownership. Separate vendor/carrier deadlines; identify defaults; preserve prior-leg evidence; keep draft versus sent explicit. Suppress contradictory summaries and missing-recipient Send paths. | Receipt + line + draft review / damage or short delivery. | Margin / act on evidence before obligations expire. | M–L | R5, R7. Prefer existing issue/claim links; **00850 PROVISIONAL** extension only if necessary, not a second claim system. |

**NOW acceptance scenarios**

- Draft/held paper is not presented as a verified external commitment, subject to F25’s ruling.
- Owner approval returns to the buyer and does not send.
- An external checkout is recorded without another order.
- Four of six intentionally shipped chairs remain four shipped and two awaiting shipment.
- Receiving those four creates no false shortage for the remaining two.
- Damage remains visible alongside location and quantity.
- Receipt success survives photo or claim-follow-up failure.
- Unknown or contradictory information is visible rather than silently reconciled.
- Missing ship-to and existing permissions/release controls still behave as authoritative.

### NEXT — after the manual journey is clear

| ID | Change | Surface / studio moment | Stream / promise | Size | Reuse / migration |
|---|---|---|---|---|---|
| **P-09** | Dealer/retail pickup and arrival continuity without a fictional maker lifecycle. | Recorded purchase / collecting or receiving an already-bought piece. | Margin / no dead end after checkout. | M | R5–R6. **00851 PROVISIONAL** if purchase-to-movement/receipt linkage is missing. |
| **P-10** | Job destination associations and optional per-line planned destination. Reuse studio places; protect private addresses and retain sent snapshots. | Document destinations sheet / setting up a job’s relevant places. | Margin + subscription / maintain instructions once. | M | R1, R3. **00852 PROVISIONAL** for job/place and planning associations. |
| **P-11** | Connected tracking trial, pre-pickup number registration and separate carrier observations. Keep PO/receipt/payment authority unchanged. | Shipment / reducing repeated carrier checking. | Subscription + margin / useful updates with honest coverage. | L | R4; Supabase edge functions and pg_cron. **00853 PROVISIONAL**; any new notice enum values require a separate earlier enum migration, number TBD. |
| **P-12** | COM dependency reading: material identity/unit, workroom confirmation and outstanding prerequisites. | Linked pieces / coordinating custom fabrication. | Margin / no false production readiness. | M | Existing COM relationship/submittal instruments, R1/R3. No migration assumed until current fields are traced. |
| **P-13** | Separate **Draft quote request** from **Record quote**; clarify sample recording and return duties. Do not create a sample library. | Quote/sample instrument / seeking information or recording a response. | Margin + subscription / verbs match consequences. | M | Existing quote/sample forms and R7 draft review. New template storage only if required; number TBD. |

### LATER — only when an actual transaction needs them

| ID | Change | Surface / studio moment | Stream / promise | Size | Reuse / migration |
|---|---|---|---|---|---|
| **P-14** | Explicit quantity allocations across destinations, preserving one commercial total and reviewed changes to accepted orders. | Order preparation / a real split-destination requirement. | Margin / no duplicated purchase quantities. | L | R1–R4. **00854 PROVISIONAL**. |
| **P-15** | Structured warehouse-to-site movements: goods/quantity selection, holds, manifest, appointment and site receipt. No warehouse inventory dashboard. | Document / repeated consolidation and install deliveries. | Margin + subscription / no reconstruction across POs. | L | R4–R5. **00855 PROVISIONAL** after deciding whether the shipment seam genuinely supports transfers. |
| **P-16** | Optional label scanning and separately permissioned external-receiver participation. Manual search/report entry remains available. | Phone receiving / demonstrated receiving volume. | Subscription / less repetitive entry without weak permissions. | L | R5 and existing media/search seams. Migration numbers TBD; receiver identity/permissions need a separate reviewed contract. |

Expanded homeowner tracking remains parked rather than included in this backlog. **[H]** [`VISION-DECISIONS.md:475–489`](/Users/kody/Code/patina-merged/docs/vision/VISION-DECISIONS.md#L475)

---

## 9. Founder rulings needed

These are US-50 discussion IDs. They do not replace existing ruling IDs.

| ID | Question and options | Recommendation |
|---|---|---|
| **F-01** | **Name and entry.** Keep Pieces/FF&E selections, adopt Pieces & purchasing, or choose another common name. | **Pieces & purchasing**, consistently in heading and contents. Keep buying inside The Document. |
| **F-02** | **Existing F25.** How should a draft PO affect the item’s recorded and displayed purchasing standing? Retain existing behavior with qualification, or distinguish draft from external commitment in shared behavior. | Recommend distinguishable draft/held/sent facts. **Do not implement or imply this is settled.** F25 remains recorded open. **[H]** [`VISION-DECISIONS.md:467`](/Users/kody/Code/patina-merged/docs/vision/VISION-DECISIONS.md#L467) |
| **F-03** | **Operational ownership.** Owner handles every handoff, assigned buyer owns continuity, or roles are configured per job. | Assigned buyer owns continuity; receiving/claim responsibilities can be named when needed. One person may hold several responsibilities. |
| **F-04** | **Warehouse evidence and inspection.** Studio enters sourced warehouse reports initially, or external receiver access is required immediately. May arrival precede inspection? | Start with sourced studio-entered reports. Permit explicit inspection pending with named responsibility; validate with Leah’s receiver. |
| **F-05** | **Destination complexity.** Do the actual first purchases need split quantities on one accepted order? | Start with one destination per paper. Bring forward P-14 only for a demonstrated transaction; never duplicate an accepted purchase to reroute it. |
| **F-06** | **Review before PO Send.** Keep current differing presentations or adopt consistent recipient, note and paper review. | Adopt consistent review in the existing sheet. This is a presentation recommendation, not a new exception to V22. |
| **F-07** | **Connected tracking.** Remain manual, trial an LTL-capable provider, or start parcel-only. | Trial AfterShip against actual carriers; compare Ship24. Approve minimum shared data, provider terms and privacy/subprocessor treatment before registration. Decide subscription treatment openly; no hidden charge. |
| **F-08** | **Client visibility.** Keep studio-only tracking or reopen expanded homeowner tracking under its governing decision. | Keep expanded tracking parked. Do not make client dates or carrier feeds part of the minimum studio release. |
| **F-09** | **Outstanding financial/date rulings.** Do R6, R7, R9 and R-DI4/5 affect these specimens or intended implementation? | Preserve them. Show sourced dates and actual amounts without inventing thresholds, client promises or off-marketplace margin rules. **[H]** [`direction.md:304–315`](/Users/kody/Code/patina-merged/artifacts/procurement-buying-review-2026-10-05/synthesis/direction.md#L304) |

### Already settled; do not re-ask as UX choices

- Missing ship-to prevents Send.
- Existing studio release authority remains enforced.
- Reading by next act stays inside The Document.
- Vendor write-in through token links is not authorized in v1.
- Studio outbound follows V22.
- No agreement is warning-only under the recorded purchasing ruling.

**[H]** [`VISION-DECISIONS.md:400–408,609–615`](/Users/kody/Code/patina-merged/docs/vision/VISION-DECISIONS.md#L400)

---

## 10. Risks and what was not examined

### Evidence limits

- No production purchase, real payment or vendor email was executed for this synthesis.
- The supplied local walk used dry-run email and a media-upload stub.
- The signed-agreement authorization flow, client invoicing and deposit payment were not walked.
- The Field native app was not examined.
- Not all item-addition flows were completed; fixture lines were seeded.
- Combined ordering of several same-vendor lines was not established by the walk. Do not claim it is absent.
- Phone camera behavior and actual media upload remain unverified.
- The obscured Send control and blank PDF preview need focused reproduction in the intended environment.
- No practitioner interview, warehouse procedure review or actual carrier trial occurred.
- Provider prices, third-party terms, coverage and data retention require confirmation.
- No broad repository test suite or production probe was run for this read-only synthesis.

Walk limits are documented at [`walk.md:3–10,27,37,52,87`](/Users/kody/Code/patina-merged/artifacts/purchasing-workflow-review-2026-10-22/walk/walk.md#L3). **[H]**

### Implementation risks to preserve

1. **Financial side effects:** shipment recording can advance status through an authority that makes pending balances due. New tracking telemetry must not use that path accidentally. **[H]** [`00704_po_cost_lines_shipments.sql:575–583`](/Users/kody/Code/patina-merged/supabase/migrations/00704_po_cost_lines_shipments.sql#L575); [`00718_phase2_review_hardening.sql:1834–1861`](/Users/kody/Code/patina-merged/supabase/migrations/00718_phase2_review_hardening.sql#L1834)

2. **Quantity identity:** partials, cancellations, corrections and replacements must not inflate shipped or fulfilled totals. COM material units must not be treated as furniture-piece counts.

3. **Privacy:** saved homes and carrier tracking can expose personal information. Provider sharing and job visibility need explicit boundaries.

4. **Claims:** product defaults are not verified contractual terms. Preserve actual event dates, earlier legs, evidence and notice history.

5. **Permissions:** sourced warehouse reports do not establish an external warehouse’s right to access or modify the portal.

6. **Retry safety:** a failed attachment or claim draft must not cause a duplicate physical receipt.

7. **Legacy data:** competing tracking paths contain real records. Consolidating the experience is not permission to delete or silently merge conflicting facts.

8. **Scope:** a readable buying journey should not become a warehouse-management, accounting or route-optimization product.

### Before Leah’s first transaction

Walk the actual intended lane with the intended studio member:

- Exact item/configuration and commercial terms.
- Deliberately selected destination and actual receiving contact.
- Applicable authorization, funding and release standing.
- External purchase evidence or reviewed PO Send.
- Named acknowledgment/follow-up owner.
- Shipment and receiving method, including unsupported-carrier handling.
- Verified notice obligations and claim reviewer.

The evidence standard is whether another studio member can continue the work without Leah reconstructing its history. It is not a high completion score or time spent in the portal.

The existing code, screenshots and walk report provide sufficient research instruments. No additional audit framework or parallel purchasing system is proposed.

---

## 11. DECK OUTLINE

### Presentation contract

**18 sheets.** One illustrative Hartwell job carries the story. Keep all invented states labelled **Proposed example** and all current screenshots labelled **Today · local walk**.

Every workflow specimen answers:

> **What Leah sees → what she does → what changes → who acts next**

Use the existing Document typography and tokens. No dashboard tiles, Kanban columns, progress rings, shadows or red/green status system. Show before and proposed states distinctly. Preserve readable screenshots, with crops identified as crops.

At 1440, retain the Document shell and a central working column. At 390, stack content with wrapping names, clear focus, 44px targets and no horizontal page scrolling.

### Sheet 1 — Buying for a job

**One message:** Another studio member should be able to continue the purchase.

**Content:** Thesis and four questions:

- Have we bought it?
- Where is it going?
- Where is it now?
- Who acts next?

**Walk screenshots:** `02v-pieces-overview-viewport-1440.png`, shown as a restrained current-state crop.

**Draw:** 1440 proposed row with three groups:

> **Channel-back sofa ×1**  
> Living room · Hale  
> **On order · acknowledgment checked**  
> To Receiving warehouse  
> **Morgan follows up Friday**

Footer: **Proposal only · nothing built or purchased.**

### Sheet 2 — What we examined

**One message:** This combines code evidence and a local walk, not production certification.

**Content:** Evidence legend, local environment, analytical team perspectives, dry-run mail and stubbed photos.

**Walk screenshots:** `00-desk-1440.png`; `28-phone-inspection-photo-bottom-390.png`.

**Draw:** No product specimen. Simple evidence/limits composition, without implying the photo stub proved media readiness.

### Sheet 3 — Why buying is hard to find

**One message:** Three names and several surfaces hide one job.

**Content:** Pieces / FF&E selections / Purchase orders; phone entry.

**Walk screenshots:** `01-document-1440.png`; `23-phone-contents-menu-390.png`; `44-orders-book-1440.png`.

**Draw:** 1440 and 390 proposed section entry:

> **Pieces & purchasing**  
> One order awaits Leah’s release.  
> **Review next acts** · **Receive a delivery** · **Destinations**

Mark naming **F-01**.

### Sheet 4 — Read the pieces, not a pipeline

**One message:** Quantity, location and responsibility belong on the collapsed row.

**Walk screenshots:** `42-pieces-overview-status-words-1440.png`; `56-phone-pieces-status-390.png`.

**Draw:** 1440 three-group row and 390 stacked equivalent:

> **Dining chairs ×6**  
> Dining room · Hale  
> **4 in transit to Receiving warehouse**  
> **2 await shipment**  
> Studio update, 22 October  
> Arrival estimate not provided  
> Morgan follows up Friday

No invented ETA or mandatory button.

### Sheet 5 — Choose what you are doing

**One message:** Preparing an order, recording checkout and recording payment have different consequences.

**Walk screenshots:** `37b-add-items-menu-1440.png`; `38-purchase-record-form-1440.png`.

**Draw:** 1440 existing-sheet treatment with three plain acts:

- **Prepare vendor order**
- **Record purchase made elsewhere**
- **Record payment**

Show short consequence copy directly below each.

### Sheet 6 — Prepare the sofa order

**One message:** Resolve destination and commercial standing before commitment.

**Walk screenshots:** `05-order-paper-sofa-1440.png`; `07-paper-bottom-actions-1440.png`.

**Draw:** 1440 bounded order sheet:

1. Vendor and included goods.
2. Ship-to, recipient and sidemark.
3. Costs/terms.
4. Agreement/authorization standing.
5. Funds/exposure.
6. Internal release.
7. Recipient/note/paper review.
8. Reachable terminal footer.

390 inset uses the same sequence and an unobscured footer. No new agreement block.

### Sheet 7 — Release returns to the buyer

**One message:** Owner approval is not vendor Send.

**Walk screenshots:** `50-paper-over-threshold-1440.png`; `52-owner-desk-release-need-1440.png`; `54-member-after-owner-approved-1440.png`; `55b-po-preview-send-obscured-1440.png`.

**Draw:** Two 1440 states:

> **Waiting for Leah’s release**  
> Nothing has been sent to Hale.

Then:

> **Released by Leah · not sent**  
> **Review & send to Hale**

Buyer name remains visible. A small handoff sequence shows buyer → owner → buyer, not automatic sending.

### Sheet 8 — Where this job receives goods

**One message:** Reuse named places and confirm the receiving party.

**Walk screenshots:** `06-paper-somewhere-else-1440.png`; `34-rug-paper-client-home-freetext-1440.png`.

**Draw:** 1440 destination sheet and 390 picker:

- Receiving warehouse
- Hartwell site
- Hollis workroom
- Studio
- **Add destination**

Selected detail includes address, recipient and instructions. Label job associations as proposed capability; no silent default.

### Sheet 9 — What the vendor actually accepted

**One message:** Acknowledgment received and acknowledgment checked are different facts.

**Walk screenshots:** `11-ack-check-1440.png`; `12-after-ack-1440.png`.

**Draw:** 1440 original instruction beside vendor response, emphasizing differences rather than re-entry.

Copy:

> **Acknowledgment checked**  
> Specification and destination agree.  
> Vendor estimated ship date: [recorded date or not provided]

Do not infer production.

### Sheet 10 — Track manually, honestly

**One message:** Tracking entry does not mean a connected carrier feed.

**Walk screenshots:** `14-shipment-filled-1440.png`; `57-phone-movement-tracking-390.png`.

**Draw:** 1440 shipment instrument and 390 summary:

> **Vendor reports dispatched 22 October**  
> Estes · PRO [example]  
> To Receiving warehouse  
> **Manual tracking**  
> Last studio update: 22 October

Separate **Record dispatch** from proposed future **Add tracking before pickup**. Show no promised carrier refresh.

### Sheet 11 — Four shipped is not six shipped

**One message:** Preserve the unshipped remainder without inventing shortage or backorder.

**Walk screenshots:** `48-partial-shipment-form-4of6-1440.png`; `49-partial-shipment-saved-1440.png`.

**Draw:** 1440 shipment detail:

- Ordered: 6 chairs.
- Shipment A: 4.
- Awaiting shipment: 2.
- Receipt against A: not yet recorded.

390 summary repeats those quantities. Secondary note: split destinations require reviewed allocations, not duplicate orders.

### Sheet 12 — Receive at the door

**One message:** Record arrival without certifying unopened goods.

**Walk screenshots:** `25-phone-lamps-line-390.png`; `26-phone-inspection-drawer-390.png`.

**Draw:** Primary 390 receiving specimen:

> **Receive a delivery**  
> Receiving at Hartwell site  
> Actual arrival date/time  
> Expected in this shipment: 4  
> Received: 4  
> Inspection: **Pending / Partial / Complete**

Full names wrap. Separate packaging condition and item issues. Footer **Save receipt**.

1440 inset reuses the same instrument, not a different receiving application.

### Sheet 13 — Damage stays with the goods

**One message:** One continuous experience records evidence and drafts notice; Send remains separate.

**Walk screenshots:** `27-phone-inspection-damaged-390.png`; `29-phone-after-damage-logged-390.png`.

**Draw:** 390 result:

> **4 received at warehouse**  
> 3 inspected good · 1 damaged  
> 2 still await shipment  
> **Claim draft ready · not sent**  
> Reviewer: Morgan  
> **Review claim**

Below, separate vendor/carrier obligations with sources. Include **Receipt saved; photo upload needs retry** as a small explicit recovery example.

### Sheet 14 — Connected tracking, when proven

**One message:** Automate carrier observations, not acceptance.

**Walk screenshots:** `20-lamps-ups-tracking-saved-1440.png`, labelled current link-out only.

**Draw:** 1440 proposed connected shipment and 390 exception state:

> **Carrier reports delivered · receipt unconfirmed**  
> Reported Tuesday, 2:14 pm  
> Last carrier update: [time]  
> **Record receipt**  
> **Not located / investigate delivery**

Side note: AfterShip-first trial; coverage, price and privacy decision pending. No functioning provider selector.

### Sheet 15 — COM is two purchases and a dependency

**One message:** Fabric arrival does not automatically release fabrication.

**Walk screenshots:** `30b-chair-buy-cell-1440.png`; `32-fabric-paper-ship-to-workroom-1440.png`; `33-chair-paper-receiver-1440.png`.

**Draw:** 1440 linked-record specimen:

> Fabric → Hollis workroom  
> Awaiting workroom quantity/identity confirmation  
> Drawing approval remains outstanding  
> Finished chair → Receiving warehouse

Keep material quantity/unit explicit. Do not depict fabric as the same goods that later become the finished-chair shipment count.

### Sheet 16 — Bought elsewhere still belongs to the job

**One message:** Record checkout once and continue to pickup or receipt.

**Walk screenshots:** `39-purchase-record-filled-1440.png`; `40-pieces-after-antique-1440.png`.

**Draw:** Two short 1440 branches:

**Retail lights**

> Purchase recorded · retailer confirmation attached  
> To Hartwell site  
> Nothing sent or ordered by this record

**Antique mirror**

> Purchased · awaiting pickup  
> Dealer condition evidence attached  
> Morgan arranges collection

390 inset shows the no-duplicate-order confirmation.

### Sheet 17 — Warehouse is not the finish

**One message:** Site delivery and installation are later physical facts.

**Walk screenshots:** `17-sofa-after-receive-1440.png`; `41-sofa-installed-1440.png`.

**Draw:** 1440 narrative handoff:

> At Receiving warehouse · inspection recorded  
> Morgan arranges site delivery  
> Received at Hartwell site  
> Installed · claim remains open, if applicable

Mark structured manifests/transfers **Later capability**. Include a compact site-damage example preserving earlier warehouse photos and original notice evidence.

### Sheet 18 — Decide the minimum clear journey

**One message:** Approve a direction and its boundaries before building.

**Walk screenshots:** None required.

**Content:**

- **NOW:** understandable manual buying, destinations, partials, receiving and claims.
- **NEXT:** pickup continuity, job places, targeted connected tracking and COM reading.
- **LATER:** quantity allocations, structured transfers and scanning.
- Founder decisions F-01–F-09, with F25 explicitly open.
- Production and practitioner-validation limits.

**Draw:** No dashboard or scoring system. Finish with one acceptance question:

> **Can another studio member continue each purchase without Leah explaining where the controls are, and without Patina claiming something nobody verified?**
