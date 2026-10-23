# Room Proof 08 → production designer portal

Kody approved round eight with “This is it” and requested a branch prepared for subsequent agent development teams. The objective is a complete production designer portal that matches the approved experience and exceeds the mockup in operational correctness, accessibility, resilience and real-job depth.

This preparation branch contains **reference artifacts and implementation documentation only**. No production feature is declared implemented by this package. No database, deployment or external-send authorization is implied by preparing it.

## What teams are building

A studio working surface with Library, People, Studio books and Correspondence around it. Opening a job gives the designer one continuous paper with a quiet contents margin. Room imagery and design evidence carry visual weight on the left; project flow, responsibility and the next act sit on the right. Dense operational instruments unfold at the relevant point and return to that place.

Full service with a building team is the native starting point. The job also supports a cabinetry-focused commission, furnishings with mixed buying, and design-only/client implementation through explicit scope and appointments. Scans, drawings, renderings, item decisions, FF&E, purchasing, maker/site returns, money, final client acceptance and care belong to the same job record.

“Exceed” means real persisted records, truthful permissions, complete exception handling, accessibility, larger room schedules and safe concurrent work. It does not mean adding another navigation system, speculative AI features, a new CRM or a replacement accounting engine.

## Read in this order

| Document | Purpose |
|---|---|
| [Founder direction](FOUNDER-DIRECTION.md) | Accepted intent, feedback lineage and source precedence |
| [Design contract](DESIGN-CONTRACT.md) | Composition, tokens, density, behavior and responsive rules |
| [Codebase map](CODEBASE-MAP.md) | Current routes, reusable seams and capability preservation |
| [Domain contracts](DOMAIN-CONTRACTS.md) | Authority, immutable evidence, data ownership and new-model gaps |
| [Decisions and questions](DECISIONS.md) | Settled program choices versus decisions needed before dependent work |
| [Delivery plan](DELIVERY-PLAN.md) | Work packages, dependencies, owners and integration sequence |
| [Agent handoff](AGENT-HANDOFF.md) | Branch/worktree protocol, brief template and exact ownership boundaries |
| [Acceptance catalog](ACCEPTANCE.md) | Observable journeys and definition of done |
| [Verification](VERIFICATION.md) | Commands, live-data proof, baseline debt and evidence artifacts |
| [Rollout](ROLLOUT.md) | Additive migration, pilot, rollback and eventual release gates |
| [Source register](SOURCE-REGISTER.md) | Authoritative evidence and current-source caveats |
| [Preparation record](PREPARATION-RECORD.md) | Actual checks, independent review and disposition; no implementation claims |

## Approved reference

- [Presentation](../../../artifacts/room-proof-round8-2026-10-23/index.html)
- [Studio mockup](../../../artifacts/room-proof-round8-2026-10-23/studio.html)
- [Continuous job paper](../../../artifacts/room-proof-round8-2026-10-23/job.html)
- [Screenshots](../../../artifacts/room-proof-round8-2026-10-23/VERIFICATION.md)
- [Prior independent critique and responses](../../../artifacts/room-proof-round8-2026-10-23/COLLABORATION.md)

The artifact was originally committed as `e8f92b772b702303e560583bd57ab785a1974b73` on `design/room-proof-round8-2026-10-23`, and carried into this branch as `4b911a3a6`. It is a reference, not a production module. Its fictional clients, rates, agreements, images, approval scenarios and local-storage behavior are not production defaults.

To serve the reference from a fresh checkout, run `python3 -m http.server 4178 --bind 127.0.0.1 --directory artifacts` and open `/room-proof-round8-2026-10-23/index.html`. If 4178 is already serving the existing review, use that server or choose another port. Do not start the application stack just to read the reference.

## Ready for teams, not permission to skip discovery

Begin with WP-00: record the live baseline, reconcile current schema/API contracts and lock the production visual mapping. Then develop small vertical slices against real local data. A prototype label is not evidence that a production API exists; a source function is not proof that its migration is deployed. Unknowns are localized to the work packages they affect. Unrelated shell, room and resource work can proceed once its own contracts pass.

Kody is the product/design decision owner. The integration lead owns sequencing and shared seams; domain owners own their state transitions. Independent review must use the other provider, per the repository instructions. Final release requires the acceptance evidence and a separate production request.
