# Domain contracts and evidence boundaries

These contracts are the implementation guardrails. “Observed” below means inspected source at `ee9c450a5`; it does not prove deployment. “Unproven” means an integrated contract was not established by this audit, not that no related table exists. Before migration work, search all later definitions and inspect the local deployed function shape.

## Reuse and extension map

| Domain | Observed foundation | Required mapping / gap |
|---|---|---|
| Service configuration | `phase_templates`, proposal agreement parts/service terms, project phases, `get_project_workflow`; hooks `use-phase-templates`, `use-agreement-parts`, `use-project-workflow` | Presets compose existing concepts, including the existing gated service/design-build agreement composer and its licensing/jurisdiction constraints. `apply_phase_template` appends phases; agreement replacement can rekey parts. Stable scope-edition identity, amendments and responsibility inheritance need a contract |
| FF&E and item decisions | Selection/placement/configuration identities, `project_review_editions`, `project_review_items`, content hashes, `get_project_ffe_readiness`; hooks `use-project-ffe-ga`, `use-project-v2` | Preserve feedback versus price authorization versus formal artifact approval. Selection content changes cannot inherit old effective decisions |
| Approval evidence | `project_approval_artifacts`, authority snapshots, confirmations/receipts and supersession; `use-project-approvals.ts` | Current `project_artifact_v1` kinds are plan issue, spec book and budget version. Current hook models one decision lead and `requiredCoapproverId: null`. Joint final service acceptance is new contract work |
| Purchasing/receiving | POs, acknowledgement/payment/ETA, `po_spec_snapshots`, release gates, inspections, install manifests/punch; `use-procurement`, `use-buying-phase2` | Current receipt linkage requires a PO or qualifying studio purchase. Studio store/find/expense purchases are studio-paid/member-reimbursed records with their own billing rules; they are not proof of a GC-owned lane. Client/GC buying cannot become a studio payable or a fabricated studio order |
| Drawings | `plan_sheets`, immutable `plan_prints`, print batches, `plan_issues`, issue-print rows and transmittals; `use-plan-room.ts` | Current sheet can advance while exact issue remains fixed. A compound room/build package across asset kinds is additional composition work |
| Custom cabinetry | Custom briefs/revisions/configuration hashes, quote requests and milestones; `use-product-configurations.ts`, `packages/types/src/product-configuration.ts` | `record_custom_commission_milestone` currently requires an issued revision/configuration and locked FF&E snapshot on a PO. GC-bought cabinetry without a studio PO cannot reuse that rail unchanged |
| People/Field | `project_parties`, roster, coordination courts/kinds, `project_party_authority`, `site_requests`, contextual handoffs; `use-coordination`, `use-project-contextual-handoffs` | Saved contact, account, appointment, responsibility, authority and access/consent differ. Fabrication authority is not explicit in the inspected grant enum; “selections” must not be assumed sufficient |
| Correspondence | Threads/messages, coordination threads, `project_notes`, `outbound_drafts`; `use-comms`, `use-project-notes`; outbound delivery-truth migrations | A universal typed subject across line/print/order/package is unproven. Preserve private annotations versus drafts versus received messages versus activity. Unknown provider outcome does not permit blind resend |
| Money/time | Existing commercial documents, budgets, authority, invoices/receipts, project time and rate/claim machinery | Use server-rated amounts and existing draft claim/release rules; no client-side recreation of pricing. Mockup amounts are fixtures only |
| Completion | Trade substantial completion/acceptance, `deriveCloseoutReadiness`, `close_project`, client-edition freeze | Inspected `close_project` requires installation and invoice/payment gates. Scoped service completion for design-only/client-buy needs a deliberate compatibility contract; do not bypass it in the UI |

## Seven contracts to settle before dependent implementation

### C1 — Identity and package composition

Keep the canonical engagement resolver and stable project/room/selection/placement/configuration/print/issue IDs. Define the smallest package identity and content manifest that joins them. A manifest freezes IDs, revisions and content hashes; it does not copy entire domains into another generic document table. K-201 in the demo avoids an identity collision with living-room A-201; production uniqueness follows project/sheet identity, not hardcoded titles.

### C2 — Scope edition and service arrangement

Define draft proposal → presented arrangement → agreed effective edition → amended/superseded edition. These are conceptual requirements, not prescribed enum names. Record included services, exclusions, pricing/fee basis, responsibilities, effective date, signer authority and agreement lineage. A preset is a starting composition; applying it twice cannot append duplicate phases. Per-room/package overrides identify their provenance. Changing a proposed role never rewrites an agreed appointment or historical evidence.

### C3 — Responsibility, authority and access

Represent designer, buyer, payer, maker-contracting party, field verifier, fabrication authorizer, receiver, installer and acceptance signer independently. Define any delegation, limit, expiry and revocation. A supplier directory entry or dropdown choice creates neither a contract nor access. Existing monetary grants do not automatically confer fabrication instruction. Preserve authorship of Sam's field verification after assigning another verifier.

### C4 — Exact decisions and acceptance

Every effective response identifies the scope/content edition, request, actor, authority snapshot and timestamp, plus idempotency/concurrency evidence. Define single/joint signatory policy, required versus optional signers, signer replacement, partial/conditional acceptance, return/rejection, withdrawal and supersession. Approval is not an electronic signature unless the appropriate signature mechanism is invoked. Reuse existing immutable evidence where compatible. The current `parseProjectApprovalReview` throws on an unknown artifact kind, and list hooks parse every returned review: adding a service kind to a shared list can break an older reader’s entire inbox. Default to a separate service-acceptance record/RPC/projection. Extending an existing artifact kind requires a versioned projection that never returns unsupported rows to old callers, plus an old-reader test. Never pass a service record as a budget artifact. Existing `requiredReviewCount` / `completedReviewCount` are prior art to inspect, not automatically required/completed signer counts.

The strict unknown-kind parser is a shared web contract; native currently decodes `artifactKind` as a string, so do not claim every installed app throws on that field. Native consent/role semantics still require compatibility proof. Current trade-scope paper acceptance is useful prior art and remains distinct from whole-service acceptance.

The closeout domain owns the acceptance contract; the client-consumer stream owns authenticated client-portal/iOS responses and offline evidence intake. Requests use V22: draft first, designer Send. A delivered request, a client response, and evidence of a paper consent are distinct acts. Record the scope/signers/consent-method policy under P06/P07 before enabling the new acceptance mutations.

### C5 — External fabrication and fulfillment

**One accountable owner:** the build-domain owner owns C5 for both externally bought furnishings and GC cabinetry; commerce consumes that contract. WP-00 first inventories existing external/store purchases, qualifying studio purchases and their accounting/receiving rules. Choose reuse versus extension from that evidence; do not let two teams invent separate external-fulfillment models or treat a studio-paid store purchase as a client purchase.

A GC-held cabinet contract remains outside the studio furnishing subtotal and payable ledger. Define quote, contract, issued package, fabrication instruction, receipt and install evidence without inventing a studio PO. Name who can record each fact and distinguish reported from verified evidence. Permit separately authorized unaffected work during a partial hold. The same agreed external-fulfillment contract supports client buying where relevant; it must not bypass studio-funded procurement gates.

The gap starts before the milestone: `place_product_configuration_in_project` creates a priced `project_ffe_items` line after its approval checks. That line can flow into commercial and closeout derivations. Placement alone is not release or a charge, but a live positively priced operational row participates in those readers; a purchase’s `billableToClient: false` does not exempt a linked FF&E row from installed/paid closeout. Decide whether an external cabinet package should have an FF&E representation at all. If it does, record responsibility explicitly and prove its treatment in furnishing subtotal, studio invoices/payables, readiness, release, installed/paid gates and service/project closeout. Do not rely on a label or a hidden subtotal row to remove a financial obligation.

### C6 — Studio service completion versus project closure

Client acceptance of the included studio service is mandatory. Determine which obligations/commercial conditions block that service and how excluded external work is represented. Existing open punch items may be informational; do not turn every trade punch item into a studio blocker. Preferred decomposition to evaluate: a distinct accepted/completed studio-service record linked to the ongoing project, with `close_project` retaining its existing contract until a specific scoped-closure decision is made. Preserve client-edition freeze and the controlled closing-draft exception. A service-acceptance transition must not write `projects.status`, `closure_checklist` or `portfolio_snapshot`. Current closeout guards permit completed → archived and reserve closure evidence to `close_project`; closing also freezes the client edition. Any future scoped change to that project-closure contract is separate, explicit migration work. No automatic acceptance from silence, a walkthrough, delivery or a trade sign-off.

### C7 — Audience, delivery and consistency

Use explicit studio/private, client, maker, GC and supplier projections; a note's type and recipient must agree across all entry points. Client exports/requests cannot contain trade cost, markup, competing bids, private notes or unshared Field captures. Raw transmittal tokens stay out of caches and durable UI state. Respect V22: studio outbound is draft-first with designer Send. Preserve attempts, provider delivery and after-send completion as separate states. Business transitions are server-authorized and atomic; idempotent retry, optimistic concurrency and existing cross-domain invalidation are required.

## Boundary matrix to prove

| Actor | May see / act, subject to actual grants | Must not gain implicitly |
|---|---|---|
| Studio owner/admin/member | Existing studio and job visibility, delegated editing and applicable commercial views | Access to a different studio merely because the lead belongs to both |
| Job client / required signer | Curated shared edition and own decision/signature/acceptance request | Unsent papers, raw operational tables, private Field content, markup or another household's job |
| GC / appointed trade | Exact shared scope/issue, assigned returns and specifically granted acts | Whole-job visibility, designer margin, fabrication authority from roster membership |
| Maker / supplier | Relevant issue, quantity/specification, question and contracted responsibility | Competing bids, private client thread or automatic substitution permission |
| Receiver / installer | Relevant orders/manifests, receipt/inspection/site evidence | Selection changes or procurement/fabrication release |
| Agent runtime | Broad authorized reads, task-enqueued writes per Agent OS | Direct business-table mutation, server credentials in client code or automated external sends |

RLS/handler enforcement must back every visual boundary. A hidden control is not authorization. Unknown/unavailable authority reads fail closed for consequential acts, with a useful explanation and retry path.

## Source anchors for contract work

- `packages/supabase/src/hooks/use-project-approvals.ts` — artifact and single-lead authority shapes.
- `supabase/migrations/00569_approval_why_viewer_role_and_receipt.sql` — later approval authority checks.
- `supabase/migrations/00429_plan_room_foundation.sql` — print/issue immutability.
- `supabase/migrations/00403_product_configuration_foundation.sql` — canonical custom milestone prerequisites.
- `supabase/migrations/00862_receiving_review_repairs.sql` — receipt linkage constraints.
- `supabase/migrations/00785_outbound_delivery_truth.sql` — send/delivery outcomes.
- `supabase/migrations/00399_journey_authority_integrity.sql` — inspected close-project gates; search later replacements at kickoff.
- `supabase/migrations/00853_client_edition_closing_draft.sql` — controlled post-close edition work.
- `apps/designer-portal/src/hooks/use-commercial-documents.ts` — portal-local commercial owner; do not relocate it casually into shared hooks.

Generated DB types describe shapes, not deployment status or complete business semantics. New migration numbers are assigned at implementation/integration time, never reserved by this plan.
