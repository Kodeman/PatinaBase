# Program decisions and bounded open questions

Append dated decisions during implementation; do not rewrite the historical Document/vision rulings. This file records the redesign program, and canonical cross-product rulings must also be appended to their existing log.

## Decisions recorded 23 October 2026

| Date / ID | Owner | Request / evidence | Chosen behavior | Alternatives rejected | Affected data, permissions, consumers, compatibility | Acceptance / review |
|---|---|---|---|---|---|---|
| 2026-10-23 / K1 | Kody | Commission WP-00.8; Agent OS separates runtime work from engineering delivery, and migration 00484 leaves `agent_writer` without table access while granting the enqueue RPC | Sidequest is the engineering control plane for repository dispatch, claims, candidates, verification, review and integration. `agent_tasks` remains the Agent OS runtime business queue; no mirrored engineering lifecycle. WP/acceptance IDs travel as Sidequest ticket metadata. | Routing repository executors through `agent_tasks` or mirroring Sidequest lifecycle there | No business-table writes or permission changes; affects all program work-package execution and audit/ownership records | US-52 WP-00; review through program integration |
| 2026-10-23 / P02 | Kody | Approved Room Proof 08; resolve filled nav/save emphasis and mockup shadows against existing visual gates | Allow filled navigation/save controls and the mockup's few shadows only within `[data-paper-renderer="round8"]`; narrowly allowlist that scope in shadow-gate and action-hierarchy tests. Legacy renderer remains zero-shadow; terminal commercial/signature actions retain explicit consequence language. | Broad test relaxation, legacy shadows, or weakening terminal-action language | Scoped renderer styles and two named gate tests; no data/permission change; legacy renderer and commercial/signature consumers remain unchanged | WP-01.3; acceptance IDs for visual/action hierarchy; integration review |
| 2026-10-23 / R8-02 applied | Kody | Approved round-eight continuous job paper supersedes current page's one-active-section behavior for this renderer | Round-8 project jobs mount all chapters with content as one continuous paper. Lead and proposal documents retain current pre-work regions; this does not alter their renderer behavior. | Applying the project-job composition to lead/proposal pre-work | Round-8 project-paper composition and index consumers only; no data/permission or migration change | WP-01.5; continuous-paper acceptance; integration review |
| 2026-10-23 / Scope | Kody | Commissioned program boundary | Deliver the whole program through release candidate; pause dependent work for K3–K5 and stop before production deploy. | Treating preparation or implementation as deploy/migration authorization | All program work; production remains separately authorized | WP-11; K3–K5 gates and ship authorization |

## Settled by the approved direction / preparation

| ID | Decision | Basis |
|---|---|---|
| R8-01 | Round eight is the experience reference; existing source is the implementation foundation | Founder “This is it” and branch-priming request, 23 Oct 2026 |
| R8-02 | One job remains a continuous paper; global resources surround the job, dense instruments unfold within its context | Repeated founder feedback and approved round-eight behavior |
| R8-03 | Full service with building team is native first; job types express service scope and responsibility, not a separate navigation hierarchy | Round-six review |
| R8-04 | Client final acceptance is required for completing the studio's service; item approval and trade acceptance cannot substitute | Founder review; round-eight integration |
| R8-05 | Keep existing production capability and canonical data/permission/history contracts; expand the specimen's simplified states | User asks to redesign the current portal and meet/exceed the specimen |
| R8-06 | Preserve the approved artifact unchanged, including earlier study links; carry its supporting history and hash manifest | Preparation decision to make a fresh branch self-contained |
| R8-07 | Preparation changes references/docs only. Agent execution is commissioned later, using agent_tasks | Current user request and Agent OS |
| R8-08 | No retired zone routes, retired document-pilot flag, replacement auth, generic documents table, second job store or parallel time system | Current source, repository architecture and existing domain rules |

## Production decisions to close in WP-00 or the affected contract slice

These are localized engineering/product decisions, not requests to reapprove the whole design. Use the existing user authorization and current source to resolve ordinary implementation details. Ask Kody only where a material product/authority choice cannot be inferred, explaining the exact conflict and presenting a concrete recommendation. Continue independent work.

| ID / owner | Concrete recommendation to evaluate | Evidence / dependency |
|---|---|---|
| P01 — foundation/integration | Map round-eight stocks/ink/type into a scoped document theme; retain existing semantic text-safe colors and reduced-motion behavior, respect the current deferred dark-mode policy, and compute sizes against the 18px production root | globals.css, Tailwind, house-sheet SPEC; before shared style changes |
| P02 — foundation + Kody if materially different | Preserve approved visual emphasis while keeping terminal-action consequences legible. Resolve round-eight filled navigation/save actions and its few shadows against existing fill/shadow gates through a scoped decision, never by disabling tests broadly | app CLAUDE.md, shadow-gate tests, R126/R139–142/I153 and the later R203 Next-plate exception; before affected component gate changes |
| P03 — integration | Keep registry-driven global resources and DocSheet ownership. Global nav belongs on the studio; job keeps a return and contents. Dense sheet views are lenses, not new job pages | D1/D8 and round-eight structure; before shell parallelism |
| P04 — service domain | Presets compose existing phases/agreement parts with stable scope-edition provenance; per-package overrides are explicit; identical/repeated application is idempotent | C2; before WP-03 migrations |
| P05 — build domain, commerce consulted | Own one C5 external-fulfillment contract after inventorying existing store/external purchases. Decide whether GC cabinets enter FF&E and how all totals/readiness/closure readers distinguish external responsibility. Never fake a PO | C2/C3/C5; before external-buying mutations in WP-06 and WP-08 |
| P06 — closeout domain + Kody | Prefer separate studio-service acceptance/completion linked to project closure until the inclusion policy is settled. Define which studio obligations block and which external/punch items are informational | C4/C6, current close_project/closure derivation; before WP-10A mutation contract and WP-10B completion |
| P07 — approval domain + Kody | Required signers come from an explicit agreed service-acceptance policy/edition; support the two-signatory case, replacement and supersession. Include authenticated client responses, V22 requests and the permitted paper-consent path. Do not hardcode the mock household | C4; existing single-lead approval contract is insufficient |
| P08 — coordination/domain | Reuse current party authority/consent and add only necessary explicit fabrication authority and typed contextual references; define allowed client sharing and token handling | C3/C7; before new recipient/instruction mutations |
| P09 — quality/integration | Support current browser expectations; audit historical skips before fixing the final matrix. Establish representative desktop/mobile performance profiles and attainable measured budgets | Existing Playwright projects/browser list, bundle budgets, X05–X07 |
| P10 — integration/ops | Use a new scoped renderer flag if needed (candidate `designer-paper-round8`), with existing Document fallback and shared data. Record resolution/loading behavior, DNT/consent/cohort behavior, code splitting and measured bundle effect, switch latency and redeploy-dependent overrides | ROLLOUT.md; before pilot wiring; no flag or rollout created in preparation |
| P11 — selections + quality | Agree the large-job performance profile, then choose virtualization, pagination or bounded incremental rendering from evidence. Preserve stable focus, continuous-paper geometry, browser find, print/spec-book export and screen-reader semantics | Before WP-04 stress implementation; 500/2,000 lines are test profiles, not a prescribed virtualization architecture |
| P12 — integration | Keep this as the program integration branch. A named integration lead syncs main at each working-day start and before migration/contract merges; release slices merge to main after compatibility/gates pass, with UI behind the renderer flag and consequential RPCs separately inert/server-gated until authorized activation | Branch-to-main procedure in AGENT-HANDOFF and ROLLOUT; no main merge or deployment authorized by preparation |

## Targeted product rulings for service acceptance

Before WP-10A enables new acceptance mutations for WP-10C/10B, the domain lead prepares a concrete proposed policy with sample full-service and design-only cases. Record Kody’s ruling for any material choice not already resolved by the approved direction; cite existing approval where it suffices. This gates only those dependent mutations, not unrelated development.

- **Signers:** recommend the named required signers in the agreed scope edition, all required responses before completion; decide optional signers, substitution/delegation and joint-party exceptions.
- **Completion:** recommend included studio obligations as blockers, with excluded external work visible but separate; decide treatment of conditional acceptance, open included defects and commercial balances.
- **Consent:** recommend explicit authenticated acceptance with exact scope/evidence; distinguish click-through from electronic signature. Decide permitted paper/offline evidence, who records it and what proof/review is required. Existing consent method names are prior art, not automatic approval of a new path.

## Decision record format

Record date, decision ID, owner, request/evidence, chosen behavior, alternatives materially rejected, affected data/permissions/consumers, migration compatibility, acceptance IDs and review. Mark unresolved facts separately from decisions. Avoid turning old source observations or a proposed target into a claimed production guarantee.
