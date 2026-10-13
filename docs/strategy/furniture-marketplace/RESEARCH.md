# From workshop to room

An internal strategy exploration for Patina, October 13, 2026.

Open [the standalone HTML presentation](index.html) directly in a browser. It includes embedded fonts and illustrations; the presentation itself works offline. External evidence links require internet access, and repository-document links require this repository layout. No server or package installation is needed.

- Arrow keys / Page Up / Page Down navigate; Home / End jump to the first / last slide.
- **N** opens presenter notes; **O** opens the slide overview; Escape closes either.
- Slide 6 compares five routes; slide 7 demonstrates public/trade presentation and finish selection.
- Slide 17 explores illustrative contribution economics.
- Slide 23 records a decision locally and exports a plain-text copy. Local browser storage is best effort; export is the reliable handoff.
- Print / PDF prints every slide. Interactive controls print their currently selected values; presenter notes remain in the HTML.

## Decision thesis

**Working hypothesis:** Patina can make furniture easier to specify, approve and order, then grow maker distribution from those useful relationships. Start with the shared specification and an optional light showroom; test whether makers want software, demand, or coordination before committing to all three.

This is an exploration of a possible strategy change requested by Kody. It does not amend the current studio-first vision, promise a launch, claim that a marketplace is live, or approve pricing. Every fictional product, maker, room, economic input and pilot threshold is labeled as illustrative or proposed.

## Team contributions

Three research agents independently examined current commerce competitors, alternative business strategies, and Patina’s repository foundations. The deck synthesizes these into five routes:

1. Maker-owned storefronts.
2. A shared specification and connected trade desk.
3. Designer-mediated distribution.
4. Distributed showrooms and sales rooms.
5. A made-to-order capacity exchange.

The private commissioning exchange is an adjacent variant of the fifth route: match a structured project brief to a small set of qualified workshops. It deserves its own experiment before being combined with repeatable catalog commerce.

## Source-to-claim map

Official vendor sources checked October 13, 2026. Capabilities below are source facts; implications are hypotheses, not proof that competitors lack specific features.

| Source | Supported capability | Implication to test |
|---|---|---|
| [Shopify blended B2B checklist](https://help.shopify.com/en/manual/b2b/getting-started/blended-store-checklist) | B2B and D2C in one store; company locations, pricing, payment terms and draft-order review | Coexist with an existing commerce system; differentiate through project specification and approved configurations |
| [Shopify product media](https://help.shopify.com/en/manual/products/product-media) | Images, video and 3D product media; compatible themes matter | A 3D viewer alone is not distinctive |
| [Faire Direct](https://www.faire.com/support/articles/360032132391?section=0) | Wholesale site, invoices and in-person ordering; qualifying Direct-originated relationships have different commission treatment, with processing fees still applicable | Separate merchant-sourced relationships from marketplace acquisition |
| [Faire Shopify integration](https://www.faire.com/support/articles/360054245292) | Catalog import and inventory, pricing and order synchronization | Makers may prefer connected channels over replacing their store |
| [1stDibs trade program](https://www.1stdibs.com/trade/apply/?allowUniversalLink=no&source=potential_trade_googlebrand) | Trade pricing, sourcing support, protections and firm tools for eligible designers | Access to designers alone is not a sufficient positioning claim |
| [Material Bank workflow](https://help.materialbank.com/en/articles/14489450-how-material-bank-works) | Material discovery, specifications, project organization and samples | Useful design work can create commercially relevant intent |
| [Material Bank brand metrics](https://help.materialbank.com/en/articles/11322184-dashboard-metrics) | Leads, sampled projects, units and project-related breakdowns | Test which consented project signals furniture makers actually act on |
| [JOOR virtual showrooms](https://www.joor.com/virtual-showroom) | Branded showrooms, public/private views, shoppable lookbooks, saved assortments and integrations; positioned for fashion | A furniture sales room should carry the selection into project quotation |
| [RepSpark platform](https://www.repspark.com/) | Branded wholesale selling, assortments, inventory and integrations | Treat reps and showrooms as potential partners |
| [RepSpark microsite invitations](https://support.repspark.com/inviting-users-to-microsites) | Invite buyers into branded microsites | Buyer-specific access is already an established pattern |

No market-size estimate, competitor outcome statistic, Patina traction figure or claimed time saving is used. Vendor documentation is not independent evidence of performance or adoption.

## Patina evidence and limits

Paths are relative to the repository root. Existence of code is not a claim of live integrated functionality or production readiness.

| Evidence | What it supports |
|---|---|
| `docs/vision/VISION.md` | Current studio-first vision and designer-led marketplace context |
| `docs/vision/VISION-DECISIONS.md`, V14 | Patina's current maker-lane margin comes from the maker trade discount while studio markup remains intact |
| `marketing/canon/voice.md` | Midwest, concrete, plain-spoken voice; maker expansion would move beyond current audience rules |
| `marketing/canon/claims.md`, C24 | App and marketplace are documented as pre-launch; do not claim adoption beyond verified evidence |
| `apps/manufacturer-portal/src/app/onboarding/page.tsx` | Explicit “Onboarding flow coming soon” placeholder |
| `packages/supabase/src/hooks/use-layer-products.ts` | Layered product library implementation |
| `packages/catalog-ui/src/product-detail/maker-story.tsx` | Maker story presentation |
| `apps/designer-portal/src/components/document/rooms/piece/piece-room.tsx` | Piece context within designer work |
| `packages/supabase/src/hooks/use-nominate-vendor.ts` | Designer-led supplier nomination |
| `packages/supabase/src/hooks/use-proposals.ts` | Proposal foundations |
| `packages/supabase/src/hooks/use-procurement.ts` | Procurement workflow foundations |
| `supabase/functions/_shared/invoice-checkout-core.ts` | Existing invoice/checkout domain logic, not a complete merchant commerce product |
| `apps/mobile/Patina/Patina/Features/ARPlacement/Services/ARPlacementManager.swift` | Potential room-placement foundation; fit accuracy and marketplace availability unverified |
| `apps/mobile/Capture/Capture/Features/SiteScan/RoomPlanScanSession.swift` | Room capture implementation; not a promise of exact furniture fit |

Proposed rather than shipped: maker custom domains, self-service storefront onboarding, public marketplace discovery, universal catalog syndication, external channel synchronization, rep/territory management, manufacturing capacity promises, merchant analytics and guaranteed exportability.

## Strategic routes and falsification

| Route | Customer | Revenue hypothesis | Principal risk | Cheapest useful test |
|---|---|---|---|---|
| Storefront | Independent workshop | Setup + subscription | Hands-on content work becomes an agency | Assisted collections followed by a genuine paid continuation offer |
| Specification layer | Trade-ready maker / small manufacturer | Software contract; reconcile current trade margin | Integration burden and data quality | Carry actual quotes and compare clarification loops with recent orders |
| Designer network | Makers seeking suitable demand | Attributed new-demand fee | Cold start, channel conflict, unreliable supply | Match a small category-specific cohort and track repeat requests through fulfillment |
| Distributed showroom | Makers, reps, existing showrooms | Subscription / agreed partner services | Physical operations and territory disputes | One collection at an existing event; no lease |
| Capacity exchange | Workshops with controlled customization | Coordination fee on accepted work | Delays, scope changes and disputes | A manual board and confirmed requests before taking money |

## Further concepts for discussion

- **A capacity passport:** what a workshop can build, material constraints, minimum runs and maker-confirmed production windows.
- **A portable commission card:** a product family plus feasible variants, approvals, sample state and quotation history.
- **A furniture library:** where a real piece or material sample can be seen locally, with appointments attributed to the right rep or studio.
- **A care record:** materials, finish, warranty contact and repair history linked to the delivered piece, with explicit permission rules.
- **Room context:** explore a piece in a captured room after validating geometry, asset quality and accuracy limits. Do not treat a visual placement as a fit guarantee.
- **Maker-assisted publishing:** turn an existing line sheet into a draft collection, with maker confirmation of every commercial fact before publishing.

These ideas are options for subsequent experiments, not additional MVP scope.

## Proposed pilot and economics

Start with a narrow Midwest furniture category, repeatable collections, controlled customization, and active designer projects. The exact geography and category remain to validate. Proposed learning thresholds in the deck are small decision rules, not statistically representative evidence:

- Five assisted collections; seek three paid continuations.
- Ten qualified requests; seek seven requiring no missing-field follow-up, while logging all Patina cleanup time.
- Five suitable introductions; seek two second project requests. Define the observation window before starting; track actual receipt and fulfilled repeat orders beyond the initial ninety days.

Monthly contribution in the interactive example is:

`software revenue + net attributed merchandise volume × retained fee − support hours × hourly cost − other variable costs`

Defaults are fictional: $150 subscription, $10,000 net attributed volume, 3% retained fee, six support hours at $45, and $60 of other variable costs. That yields $450 revenue, $330 variable cost, and $120 contribution before acquisition, setup, fixed costs, reserves and working capital. Net volume excludes refunds, tax and freight. The fee assumes payment processing is passed through at cost; otherwise absorbed processing must be included in variable costs. This is not a forecast, profitability claim or approved commercial offer. Fee options must be reconciled with V14 rather than silently stacked.

## Interview prompts

1. Walk through the last order where a finish, dimension or lead time changed. What records did each party use?
2. Which information is missing when a quote request arrives? Who fills it in, and how long does that take?
3. What does the current website do well enough that you would refuse to replace it?
4. Who owns the customer relationship across maker, studio, rep and showroom? How is that agreed today?
5. Would you pay for better handling of current relationships without any promise of new traffic?
6. Which product family can be configured reliably, and which work must remain a conversation?
7. Who resolves freight damage, delays, cancellation, refunds and warranty questions?
8. What result would make you continue paying after the pilot?

## Before a live pilot

Assign product, maker-operations and engineering owners; choose the commercial role and support routing; verify permissions and relevant workflows with live test data; agree publishing rights and channel attribution; reconcile fee proposals with the adopted trade-margin policy. The deck itself changes no production systems and makes no external offers.
