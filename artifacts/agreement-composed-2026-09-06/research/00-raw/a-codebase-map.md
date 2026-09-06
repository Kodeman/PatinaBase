# Raw lane A — codebase map of the Agreement concept (Explore agent, 2026-09-06)

Head migration at the time of the map: `00573`.

## 1. Database schema

The Agreement lives on the **`proposals` table reused as an immutable "commercial edition"** — there is no separate `agreements` table.

Core migration: `supabase/migrations/00412_design_services_commercial_authority.sql` (3,109 lines — the whole design-services rail).

Columns grafted onto `public.proposals`:
- `document_kind text` CHECK IN `('legacy','design_services','furnishings_authorization','service_addendum')` — later widened to include `trade_scope` (00423)
- `commercial_state text` CHECK IN `('draft','sent','client_signed','executed','declined','expired','superseded')`
- `superseded_at`, `superseded_reason`, `replacement_proposal_id`
- `issued_on_paper` (00477), paper-provenance columns (00425)

| Table | Shape (all columns hard-coded) |
|---|---|
| `proposal_service_terms` | PK `proposal_id`; `scope text`, `deliverables jsonb[]`, `exclusions jsonb[]`, `billing_ceiling_cents`, `retainer_amount_cents`, `retainer_activation_policy` ∈ `immediate\|retainer_paid`, `billing_cadence` ∈ `monthly\|biweekly\|milestone`, `currency`, `terms text`, `current_rate_version`, + `furnishings_deposit_percent` (added 00422:139) |
| `proposal_service_rates` | `(proposal_id, version, role_name)` unique; `hourly_rate_cents`, `sort_order`, `effective_at` |
| `commercial_document_signatures` | UNIQUE `(proposal_id, party_role)`; `party_role` ∈ `client\|studio`; `signed_name` (≥2 chars), `signed_ip`, `evidence_fingerprint` (64-char sha), `metadata jsonb` (carries `paperSignedOn`, scan doc id) |
| `project_commercial_documents` | binds an executed proposal to a project; `is_origin`, `wave_name`, `deposit_invoice_id` |
| `project_billing_authorities` + `project_billing_authority_rates` | immutable snapshot of ceiling/retainer/cadence/rates created at countersign; status `active\|superseded\|exhausted` |
| `project_budget_versions` / `_lines` / `_checkpoints` | the non-binding working budget |
| `furnishing_authorization_items` | the second "yes" |
| `trade_scope_terms` / `_sections` / `_bids` / `_draws` (00423) | the trade/sub instrument |
| `proposal_templates` (00063) | legacy, retired — `sections_config jsonb`, `is_system`, `created_by` (per-user, not per-studio) |

Legacy/adjacent proposal tables still present: `proposal_sections` (7 fixed section types: vision, concept, space_plan, selections, investment, timeline, terms), `proposal_phases`, `proposal_exclusions`, `proposal_payment_milestones`, `proposal_change_order_terms`, `proposal_scope_rooms`, `proposal_boards`, `proposal_palettes`.

Live RPC heads (the lineage drifts):
- `upsert_design_services_draft(p_proposal_id, p_terms jsonb, p_rates jsonb)` → `00422_authorized_schedule_phase1.sql`. Keys are hard-coded: it reads exactly `scope`, `deliverables`, `exclusions`, `billingCeilingCents`, `retainerAmountCents`, `retainerActivationPolicy`, `billingCadence`, `currency`, `terms`, `currentRateVersion`, `furnishingsDepositPercent`. Anything else is discarded.
- `send_commercial_document` → `00423_trade_scope_instrument.sql:1546`
- `sign_design_services_agreement` / `_with_trusted_ip` → `00511_public_sd_hardening.sql`
- `countersign_design_services_agreement` → `00475_schedule_ceremony_anchors.sql` (impl `_countersign_design_services_agreement_impl`, re-headed by `00566`)
- `create_service_addendum` → `00422`
- `record_paper_client_signature` + `_issue_design_services_agreement_on_paper` → `00477_design_services_paper_issue.sql`
- `get_client_commercial_document_bundle` → `00425_executed_on_paper.sql`
- `get_project_authority_summary`, `list_furnishings_authorizations`, `get_project_working_budget` → 00412/00423

Guards (the source of the rigidity):
- `guard_commercial_authored_child()` — `proposal_service_terms` / `proposal_service_rates` / `trade_scope_sections` are immutable the instant `proposals.status <> 'draft'` (raises `check_violation`)
- `guard_commercial_proposal_authority()` / `guard_commercial_immutable_row()` — state moves only under transaction-local GUCs (`app.commercial_document_id`, `app.proposal_send_id`) set by definer RPCs
- `_commercial_document_fingerprint(proposal_id)` — sha256 over a fixed field list; any new agreement part must be added here or signatures stop covering it
- RLS on all commercial tables via `public.is_studio_comember(designer_id)`; client read only through the bundle RPC

Recent fixes: `00563_proposal_signing_multi_studio.sql` and `00566_commercial_signature_studio_resolution.sql` (a designer in two studios could not get a signature recorded), `00567_scope_vocabulary_full_house_custom.sql` (adds `full_house`, `custom` + `client_discovery.project_type_custom`; enforcement only a `RAISE` inside `submit_design_request`, no CHECK).

## 2. Designer portal — the Contract Room

Route: `/drafting/[proposalId]` → `apps/designer-portal/src/app/(document)/drafting/[proposalId]/page.tsx`

`drafting-room.tsx` branches on `commercialDocumentExperience(document_kind)`:
- `legacy` → the eight-facet legacy proposal builder (Rooms · FF&E · Palette · Boards · Phases · Exclusions · Payments · Terms, `components/portal/scope-builder/*`)
- `design_services` / `service_addendum` → `ServiceAgreementDraftingRoom`

`apps/designer-portal/src/components/document/rooms/drafting/service-agreement-drafting-room.tsx` (694 lines) is the agreement builder. Title bar reads `"The Contract Room · Design Agreement"`, counter `"N of 7 facets written"`.

Seven facets hard-coded in JSX, fixed order, non-removable, non-addable:

| # | Facet | Control |
|---|---|---|
| 01 | Services & deliverables | `scope` textarea + `deliverables` newline-split textarea |
| 02 | Exclusions | newline-split textarea |
| 03 | Role rates | repeatable rows (`+ Add a role`) — the only repeatable part |
| 04 | Rates & ceiling | ceiling dollars + furnishings deposit chips `[0,25,50,100,other]` |
| 05 | Retainer | amount + `immediate \| retainer_paid` select |
| 06 | Billing cadence | `monthly \| biweekly \| milestone` select |
| 07 | Terms | one free-text textarea |

Hard-coded defaults in the same file: `DEFAULT_DELIVERABLES = ["Concept presentation","Design documentation","Selection schedules"]`, `DEFAULT_EXCLUSIONS = ["Construction labor","Furnishings, freight, tax, and installation"]`, a default scope sentence, `DEPOSIT_CHIPS = [0,25,50,100]`.

Supporting surfaces (`apps/designer-portal/src/components/document/commercial/`):
- `service-agreement-preview.tsx` — the client copy; six fixed `<section>` blocks (Services / What you will receive / Not included / How design time is billed / money grid / Agreement terms / signatures)
- `service-agreement-send-sheet.tsx` — review-and-send
- `service-agreement-instruments.tsx` — countersign act, mounted from `proposal-instruments.tsx:96`
- `record-on-paper-sheet.tsx` — paper-signature capture
- `project-services-addendum-action.tsx`, `void-supersede-act.tsx`, `authorizations-ledger.tsx`, `authorization-detail.tsx`, `project-authority-band.tsx`, `derived-budget-grid.tsx`, `money-region.tsx`, `trade/*`
- Entry: `lib/document/open-drafting-room.ts`, `components/document/rooms/drafting/draft-proposal-opener.tsx` ("Draft a design agreement" ⌘K verb; comment: "no template — templates are retired per R85")
- Registry: `lib/document/registry.tsx:125` key `drafting-room`, label "Contract Room"; `:289` verb `Draft a design agreement`
- Contract/readiness: `lib/document/commercial-documents.ts` — `assessServiceAgreementReadiness()` has a hard-coded blocker list mirroring the 7 facets; `commercialStatusView()` hard-codes the 7 status labels/descriptions
- Hooks: `hooks/use-commercial-documents.ts` (2,457 lines) — `useSaveServiceAgreement`, `useSendServiceAgreement`, `useCountersignDesignServicesAgreement`, `useCreateServiceAddendum`, `useRecordPaperClientSignature`, plus the trade/furnishings rail
- API route: `app/api/commercial/[id]/paper-notify/route.ts`
- Legacy free-text terms body (legacy proposals only): `components/document/rooms/drafting/terms-agreement-body.tsx` → `proposal_sections.body` type `terms`

## 3. Client portal — where the homeowner signs

Route: `/` (the Threshold / "the door") — `apps/client-portal/src/app/page.tsx` → `components/threshold/threshold.tsx`. `/proposals/[id]` and `/proposals/[id]/sign` are retired and folded onto `#door` (`lib/retired-routes.ts`).

- `components/threshold/door-gate.tsx` — the door leaf; renders the paper, `consentLineFor(kind)` (:579), `SignatureLine`, `signLabelFor(kind)` (:655)
- `components/threshold/instruments/signature-line.tsx` — typed name + date rule, `MIN_SIGNATURE_LENGTH = 2`
- `components/threshold/consent-copy.ts` — hard-coded per-kind consent/label/summary strings, drift-guarded against the API route by a test
- `components/threshold/door-acts.tsx` — decline / ask a question / request a change
- `components/threshold/papers-sheet.tsx`, `house-ledger.tsx`, `settlement.tsx` — reading surfaces
- Keepsake: `app/proposals/[id]/record/page.tsx` (Record of Decision)
- Also `components/commercial-document-shell.tsx`, `components/commercial/journey-stepper.tsx`, `components/proposal-document.tsx` (legacy renderer)

Signing: `POST /api/proposals/[id]/sign` (`app/api/proposals/[id]/sign/route.ts`) resolves `document_kind` from `get_client_commercial_document_bundle` (fail-closed), then dispatches:
- `design_services` / `service_addendum` → `sign_design_services_agreement_with_trusted_ip` (service-role client, edge-derived IP) — records consent only, creates nothing
- `furnishings_authorization` → `execute_furnishings_authorization_with_trusted_ip`
- `trade_scope` → `execute_trade_scope_with_trusted_ip`
- `legacy` → `410 legacy_signing_retired`

Then invokes edge function `commercial-document-notify` with transition `client_signed` / `furnishings_executed` / `trade_scope_executed` / `deposit_ready`. Data: `hooks/use-commercial-client.ts`, `lib/commercial-documents.ts`.

## 4. Edge functions

| Function | Role |
|---|---|
| `supabase/functions/proposal-send/` | Emails the agreement. `handler.ts:240-290` branches on `documentKind === 'design_services'` → subject "Your design agreement is ready", CTA "Review agreement". Claims a nonce/dispatch row created by `send_commercial_document`. No PDF. |
| `supabase/functions/commercial-document-notify/` | Transition notifications (`core.ts`, `policy.ts`, `lib.ts`). `CLIENT_TRANSITIONS` vs studio transitions; `resolveStudioSignature` for branding. |
| `supabase/functions/proposal-sign-confirmation/` | Post-signature receipt to client + notice to designer (legacy path). |
| `supabase/functions/spec-pdf/` | The only PDF renderer — spec sheets/schedules/boards. No agreement PDF exists. |
| `proposal-nudge`, `decision-reminders`, `invoice-send`, `po-send`, `trade-rfq-send`, `quote-request-send` | adjacent rails |
| `_shared/studio-identity.ts`, `branded-email.ts`, `send-email.ts`, `client-portal-links.ts` | shared |

## 5. Types & hooks

- `packages/types/src/commercial.ts` (295 lines) — `COMMERCIAL_DOCUMENT_KINDS`, `COMMERCIAL_STATES`, `DesignServiceTerms`, `DesignServiceRate`, `CommercialSignatureReceipt`, `CommercialDocumentSummary`, `DesignServicesAgreement`, `ProjectBillingAuthoritySummary`, `WorkingBudget*`, `FurnishingsAuthorization*`, `TradeScope*`, `ClientCommercialDocumentBundle`
- `packages/types/src/proposal.ts`, `scope.ts`, `scope-change.ts`, `studio-config.ts` (StaffRole / VendorSpecialty vocab), `residential-workflow.ts` (stage 03 `scope_engagement`: gate "Agreement signed and engagement confirmed", deliverables `['Proposal','Service agreement']`)
- `packages/supabase/src/hooks/use-proposals.ts` — the only hook touching `proposal_templates` (lines 600, 1485); also `use-phase-templates.ts`, `use-board-templates.ts`
- `packages/supabase/src/hooks/use-commercial-documents.ts` — query keys
- `packages/supabase/src/database.types.ts` — generated types (`proposal_templates` at :18950)
- The designer portal keeps an app-local duplicate contract (`apps/designer-portal/src/lib/document/commercial-documents.ts`) marked "Wave 1 … while the canonical workspace DTOs land". Two sources of truth for the same shapes.

## 6. Docs

| Path | One line |
|---|---|
| `docs/vision/VISION.md` | Nothing on agreements (only "Pledge contract counterparty" as open item V4). |
| `docs/design/the-document/design-services-before-ffe-review.html` | 16-slide design review "Two Yeses, One Document" — the design intent for the whole agreement rail. |
| `docs/design/the-document/DECISIONS.md` (~10k lines) | The ruling ledger. R85 (line 2682): ad-hoc draft, Folio on proposals, free-text terms, "Proposal templates are retired — the seeded-from-Discovery path covers the job". R86: portal copy is canonical. Lines 8210, 8646-8733, 9020-9021, 9182, 9336 cover countersign, paper issuance, which authoring room owns design-services agreements. |
| `docs/design/the-document/the-document-needs-ruling-2026-07.md` | PRO-01 — are proposal templates intentionally retired? PRO-07 — is the free-text terms body retired? (Both answered by R85.) |
| `docs/design/the-document/portal-vs-desk-feature-gap-matrix-v2.md` / `.html` / `.rows.json` | Feature parity matrix, template rows included. |
| `docs/design/the-client-page/path-b-the-threshold.html`, `path-a-the-attendance.html`, `README.md` | The door/signing UI target. |
| `docs/superpowers/specs/2026-09-04-the-client-page-design.md` | Technical blueprint for the Threshold; verified-patterns table is the best current map of client-side RLS/RPC idioms. |
| `docs/superpowers/plans/2026-09-04-the-client-page.md`, `-completion.md`, `2026-09-04-client-portal-retirement.md` | Delivery plans. |
| `docs/design/studio-rosters/README.md` + two Call Sheet decks | Studio staffing + rolodex program (built, flag `call-sheet`, not yet on prod). |
| `docs/design/the-document/CODEBASE-MAP.md`, `the-document-IMPLEMENTATION-INDEX.md` | Navigation. |
| `docs/design/authorized-schedule/the-authorized-schedule-proposal.html` | The schedule/ceremony rail 00422/00475 came from. |
| `docs/specs/Redesign/patina-proposal-system-design.html` | Older proposal-system spec. |
| `docs/design/the-document/patina-proposal-authoring-prototype.html` | Authoring prototype. |

Design intent ("Two Yeses, One Document"): the old single proposal carried three promises at once. Yes #1 = client + studio execute a Design Services agreement (rates, ceiling, retainer, services); the countersign atomically creates one project + one billing authority. Between the yeses, hours accrue against a non-binding working budget. Yes #2 = named furnishings authorization waves. Three money truths must never blur: design authorization (contractual ceiling), working budget (planning only), furnishings authorized (purchase authority). The review's own mock names the offer facets as Services · Deliverables · Exclusions · Rates & ceiling · Retainer · Terms — the shipped 7-facet room is that list, with "Role rates" split out.

## 7. Reusable building blocks for a studio template system

1. `board_templates` (`00408_board_templates.sql`) — the closest model. `kind ∈ ('seeded','studio')`, `studio_id → organizations`, `template_key` namespaced `patina.*` vs `studio.*`, an owner-shape CHECK, immutable Patina starters guarded by a maintenance GUC, RLS to "every active non-guest member of that exact active `design_studio`", plus `save_board_as_template()` (snapshot + strip owner refs) and `materialize_board_template()`.
2. `phase_templates` (`00135_proposal_phase_templates.sql`) — `is_system` + `designer_id`-scoped, `phases jsonb` blueprint array, `apply_phase_template()` RPC. UI: `components/portal/scope-builder/phase-template-picker.tsx`, hook `use-phase-templates.ts`. Designer-scoped, not studio-scoped.
3. `proposal_templates` (00063) — `sections_config jsonb`, `is_system`, per-user RLS. Retired by R85 but the table and two hook call sites still exist.
4. Studio-level settings surface: `studio_billing_settings` (00428 — `card_surcharge_bps`, `check_remit_to`, RLS via `is_active_studio_member` / `is_org_admin_or_owner`), `studio_invoice_counters` (00318), `studio_contacts` (00417), `resolve_studio_identity()` + logos (00320), `organization_members.staff_role/job_title` (00416). UI home: `apps/designer-portal/src/components/document/account/account-studio-page.tsx` — has a "Billing" card with save-on-dirty.
5. Studio membership helpers: `is_studio_comember(uuid)` (head `00556`), `is_active_studio_member`, `is_org_admin_or_owner`, `app_private.is_project_studio_member` (00565 pattern).
6. `client_visibility_tier` (00141) — an existing per-document "how much the client sees" dial.
7. Jsonb-array-of-parts precedent inside the agreement: `deliverables`/`exclusions` are `jsonb` arrays with a `jsonb_typeof = 'array'` CHECK.
8. Free-text vocabulary escape hatch precedent: `studio_contacts.contact_kind` and `project_parties.trade` are un-CHECKed TEXT with the vocabulary code-resident in `packages/types/src/studio-config.ts` — "the rolodex's kinds grow without a migration."

## 8. Subcontractors / trades / vendors under a studio

- `trade_scope_terms` / `_sections` / `_bids` / `_draws` (`00423_trade_scope_instrument.sql`) — a full sub/trade contract instrument: snapshotted party, lump-sum client price, prose sections per room, studio-only bid ledger (never client-visible), draw schedule with acceptance gate. Progress ratchet `none → engaged → in_progress → substantially_complete → accepted`. RPCs `create_trade_scope`, `set_trade_scope_party`, `select_trade_bid`, `execute_trade_scope`, `accept_trade_scope`, `issue_trade_draw_invoice`, `void_trade_scope`.
- `project_parties` (`00212_project_parties.sql`) — `party_kind ∈ ('gc','vendor','client_rep','other')`, widened in 00419 to architect/photographer/stager/client; soft links to `vendors` and `profiles`; `show_to_client`; view `v_project_roster`.
- `studio_contacts` (`00417`) — the studio-level rolodex: `entity_kind person|company`, self-FK `company_id`, free-text `contact_kind`, `specialties text[]`.
- `people_directory` (`00420`) with a `scope` discriminator (`mine` / `studio`) and a client read path; `00478` adds `has_sent_proposal`.
- RFQ rail: `trade_rfq_requests` / `trade_rfq_tokens` (`00424_trade_rfq_rail.sql`), edge fn `trade-rfq-send`.
- Vendors: `vendors` (00001), `saved_vendors` (00009), `vendor_trade_programs`, `pipeline_vendors` (00076).
- Portal: `components/document/commercial/trade/*` (bid ledger, draw schedule editor, party field, work order sheet), `components/document/roster/`, `apps/client-portal/src/app/api/trade-scopes/[id]/accept/route.ts`.

## 9. What is rigid today

1. Seven fixed facets, in code. Sections are JSX literals in `service-agreement-drafting-room.tsx`. No add, remove, rename, or reorder.
2. Fixed columns, not parts. `proposal_service_terms` is one wide row. Adding an agreement part is a migration + a new key in `upsert_design_services_draft` + a new field in three type definitions + a new block in the preview + a new fingerprint input.
3. The readiness gate is hard-coded. `assessServiceAgreementReadiness()` enumerates the exact seven blockers; a studio that doesn't want a retainer or a ceiling still has to satisfy them (ceiling > 0 is a hard blocker).
4. Fixed enums. `billing_cadence` is exactly `monthly|biweekly|milestone`; `retainer_activation_policy` is exactly `immediate|retainer_paid`; `document_kind` and `commercial_state` are CHECK-constrained. Flat-fee, percentage-of-cost, and per-phase-fee agreements have no representation.
5. Immutability at draft exit. `guard_commercial_authored_child` freezes terms and rates the moment `status <> 'draft'`. Forward paths are `create_service_addendum` or supersede — no amend-in-place.
6. No template layer at all for agreements — templates were explicitly retired (R85), so the seeded defaults are three deliverables and two exclusions hard-coded in one component. Nothing is studio-scoped, nothing is saveable, nothing carries across clients.
7. No studio-level agreement defaults. `studio_billing_settings` holds card fee and remit-to only.
8. Rates are the only repeatable list. Deliverables and exclusions are newline-split textareas serialized to jsonb — no per-item ordering, notes, optionality, or price.
9. Client copy is a fixed six-section render. `service-agreement-preview.tsx` and the client-portal consent strings (`consent-copy.ts`, drift-guarded by tests) hard-code the wording per `document_kind`.
10. No agreement PDF.
11. Duplicated contract layer (`packages/types/src/commercial.ts` and `apps/designer-portal/src/lib/document/commercial-documents.ts`).
12. Fingerprint coupling. `_commercial_document_fingerprint` hashes a closed field list; template-driven variable parts must be folded into it or signed evidence silently stops covering the parts the client actually read.
