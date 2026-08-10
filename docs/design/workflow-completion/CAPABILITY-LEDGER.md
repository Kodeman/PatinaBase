# Workflow Completion Capability Ledger

**Status:** Wave 1 implementation authority  
**Repository census:** `e7fd3244`, 2026-08-10  
**Purpose:** Prevent the older workflow gap package from causing implemented Patina systems to be rebuilt or bypassed.

## Disposition vocabulary

- **Keep** — authoritative system already exists.
- **Deepen** — use the existing owner and add missing workflow semantics or evidence.
- **Consolidate** — retain multiple operational owners behind one project read contract.
- **Add** — no durable product owner currently exists.
- **Retire** — compatibility surface remains but must not receive new workflow work.

## Stage ledger

| Stage | Existing authority | Disposition | Wave-1 target |
|---|---|---|---|
| 01 Inquiry & Qualification | Waitlist CRM qualification, activities, tasks, ownership, dispositions | Deepen | Connect designer-facing Brief to structured consent, service-area/capacity evidence, household authority, response SLA, and referral/decline outcomes. |
| 02 Discovery & Programming | `client_discovery`, five required essentials, Room Scan links, proposal seeding | Deepen | Treat Discovery as a versioned professional program with decision process, constraints, missing evidence, and explicit service recommendation. |
| 03 Scope & Engagement | Design-services commercial state machine, signatures, payment/activation guards | Deepen | Bind proposals and agreements to one immutable studio service-package version and the project's commercial responsibility profile. |
| 04 Kickoff & Existing Conditions | Projects, rosters, Room Files, scan geometry, source/verification-stamped measurements | Deepen | Make the verified-condition record, owner-furnished facts, jurisdiction checkpoint, RACI, baseline, and risks visible as a stage gate. |
| 05 Concept / Schematic | Mood boards, proposal boards, configuration, decisions | Consolidate | Use one project-selection identity, private working boards, immutable review editions, and concept gate evidence. |
| 06 Design Development | Product configurations, samples/spec fields, quotes, decisions, FF&E lines | Deepen | Separate studio disposition, client verdict, derived readiness, formal authorization, and logistics; add stale commercial-fact controls. |
| 07 Documentation / Authorization | Spec Books, immutable revisions/artifacts, Plan Room issues/prints/transmittals, FFE authority | Consolidate | Present document purpose, issue audience, approval dependencies, budget baseline, and authority without creating a generic document store. |
| 08 Bidding, Permitting & Procurement | Trade RFQ/scopes, `purchase_orders`, receiving/claims, `fulfillment_*`, ledger and transmission | Consolidate | Bind exactly one procurement rail per project and expose one item-level lifecycle/read contract while preserving both ledgers. |
| 09 Contract Administration | Trade scopes/RFQ, coordination items, scope changes, Site Binder/Field request loop, Plan Room | Deepen | Add contracted authority, jurisdiction, submittal/observation/change semantics, attributed site readiness, and safe professional language. |
| 10 Delivery, Installation & Styling | Shipments, receiving, claims, Field capture, installed FF&E status | Add/deepen | Add install sessions, manifest, access/readiness, placement, condition, crew, punch-versus-claim ownership, and client walkthrough evidence. |
| 11 Closeout & Post-Occupancy | Guarded `close_project`, operational census, portfolio snapshot, review request, spec care/warranty notes | Add/deepen | Add typed closeout obligations, closeout book, warranties/service cases, care calendar, consent, post-occupancy evaluation, and retained follow-up. |

## Cross-cutting owners

| Capability | Existing owner | Rule |
|---|---|---|
| Project lifecycle | `project_phases` plus guarded transition RPCs | Extend; never create a parallel workflow status table. |
| Consequential decisions | `client_decisions`, revisions, responses, audit events | Extend for authority and client language; comments and notifications remain non-authoritative. |
| Artifacts | Proposal editions, Spec Books, Plan Room, commercial documents | Reference immutable editions; never create a catch-all `documents` table. |
| Team and visibility | Studio contacts, project roster/parties, team memberships, RLS | Add explicit authority assignments without treating directory roles as approval rights. |
| Communications | Comms threads/messages, email/SMS/push infrastructure | Add stage/artifact/handoff context; human confirmation remains mandatory. |
| Studio procurement | `purchase_orders`, receiving, claims, project FF&E | Keep as the studio-managed rail. |
| Patina MOR | `fulfillment_*`, double-entry ledger, transmission, shipment and exception systems | Keep as the Patina rail; enable only where legal/configuration prerequisites pass. |
| Agent assistance | `agent_tasks`, audited queue RPCs, Mission Control | Agents enqueue reviewable work only and never mutate workflow authority directly. |

## Canonical stage keys and tracks

| Order | Key | Default track |
|---:|---|---|
| 1 | `inquiry_qualification` | core |
| 2 | `discovery_programming` | core |
| 3 | `scope_engagement` | core |
| 4 | `kickoff_existing_conditions` | core |
| 5 | `concept_schematic` | core |
| 6 | `design_development` | core |
| 7 | `documentation_authorization` | core |
| 8 | `bidding_permitting_procurement` | FF&E and optional construction |
| 9 | `contract_administration` | FF&E and optional construction |
| 10 | `delivery_installation` | FF&E |
| 11 | `closeout_post_occupancy` | core |

Studio phase names remain configurable. Canonical keys establish analytics, guidance, and gate meaning; a deterministic backfill may assign them, while ambiguous legacy phases remain unclassified until a studio reviews them.

## Hard invariants

1. A stage gate is derived from authoritative records; a presentation checkbox cannot make work complete.
2. Unpublished boards, selections, media, and working commercial facts are not client-readable.
3. Every consequential decision addresses one immutable artifact edition and an authorized approver set.
4. Overdue is a condition, never approval or phase advancement.
5. A design preference, review verdict, and purchasing authorization are separate acts.
6. Each project uses one procurement rail; underlying ledgers remain the financial truth.
7. Client authorization and actual production release retain separate timestamps.
8. Patina never implies professional, construction, certification, or commercial responsibility not assigned by contract and jurisdiction.
9. External communication and money movement require a human confirmation.
10. Project closeout cannot erase unresolved workflow, financial, installation, or acceptance obligations.

## Build order

1. Workflow stage/track provenance and read contract.
2. Document stage guidance and existing-project classification.
3. Party authority, approval editions, and contextual handoffs.
4. Planning and existing-condition gates.
5. Project-native design review and authorization continuity.
6. Commercial-rail projection and procurement exceptions.
7. Field administration and site readiness.
8. Installation, closeout, warranty, care, and post-occupancy.
