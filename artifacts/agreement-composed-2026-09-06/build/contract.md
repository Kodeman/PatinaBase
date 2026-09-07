# The Agreement, Composed — build contract (shared by every wave and lane)

This is the binding shape. Wave architects refine it into build sheets; lanes implement it; reviewers check against it. Deviations require the orchestrator's ruling, recorded in `rulings-2026-09-06.md`.

Sources: `../source/proposal.md` (spine, amended), `../review/00-orchestrator-rulings.md` (D-1…D-7), `../research/04-codebase-today.md` (citations).

## 1. Vocabulary (code-resident, un-CHECKed text — the `studio_contacts.contact_kind` pattern)

`packages/types/src/agreement.ts` (new) exports:

- `AGREEMENT_PART_KINDS = ['clause','list','phases','schedule','attachment','attestation'] as const`
- `AGREEMENT_SCHEDULE_VARIANTS = ['rate_card','ceiling','retainer','cadence','flat','per_phase','percent_of_cost','percent_of_spend','cost_plus','day_rate','package','procurement','pricing_basis','draws','allowances'] as const` (15)
- `AGREEMENT_TEMPLATE_CLASSES = ['design_services','consultation','furnishings_services','design_build'] as const`
- `AUTHORITY_VARIANTS = ['rate_card','ceiling','retainer','cadence','flat','per_phase'] as const` (R9) — plus `procurement` only for its `deposit_percent` field.
- Payload types per kind/variant (camelCase domain types, NOT DB rows): `ClausePayload {body: string}`, `ListPayload {items: {id, text, note?, optional?}[]}`, `PhasesPayload {phases: {key, label, on, feeCents?}[]}`, schedule payloads per variant (e.g. `RateCardPayload {roles: {roleName, hourlyRateCents, sortOrder}[]}`, `CeilingPayload {cents: number|null}`, `RetainerPayload {cents, creditRule: 'credited'|'non_refundable'|'replenishing', activationPolicy: 'immediate'|'retainer_paid'}`, `CadencePayload {cadence: 'monthly'|'biweekly'|'milestone'|'per_draw'}`, `FlatPayload {cents}`, `PerPhasePayload {phases: {key,label,cents}[]}`, `ProcurementPayload {depositPercent, markupBasis?, freightHandling?, termsOfSale?}`, `PricingBasisPayload`, `DrawsPayload`, `AllowancesPayload`), `AttachmentPayload {title, body, jurisdiction?, acknowledgeRequired}`, `AttestationPayload {credentialType, number, state, expiresOn, attestedAt, attestedBy}`.
- The seeded standard parts list `PATINA_STANDARD_AGREEMENT_PARTS` (nine parts, in order): services (clause) · deliverables (list) · exclusions (list) · role_rates (schedule/rate_card) · ceiling (schedule/ceiling) · deposit (schedule/procurement, deposit % only) · retainer (schedule/retainer) · cadence (schedule/cadence) · terms (clause). Default bodies = today's literals from `service-agreement-drafting-room.tsx` (`DEFAULT_DELIVERABLES`, `DEFAULT_EXCLUSIONS`, default scope sentence).

## 2. Tables (Wave 1 unless marked)

### `public.proposal_agreement_parts` (W1)
```
proposal_id uuid NOT NULL REFERENCES proposals(id) ON DELETE CASCADE
id uuid PK DEFAULT gen_random_uuid()
position integer NOT NULL
kind text NOT NULL                       -- vocabulary, no CHECK beyond non-empty
variant text NULL                        -- schedule only
part_key text NOT NULL                   -- 'patina.services' | 'studio.<slug>' | 'custom.<uuid>'
title text NOT NULL
payload jsonb NOT NULL DEFAULT '{}'::jsonb
required boolean NOT NULL DEFAULT false
client_visible boolean NOT NULL DEFAULT true
source_template_key text NULL            -- W2
source_part_id uuid NULL                 -- W2
created_at, updated_at timestamptz
UNIQUE (proposal_id, position) DEFERRABLE INITIALLY DEFERRED; UNIQUE (proposal_id, part_key)
```
- RLS: studio read/write through `public.is_studio_comember(designer_id)` of the owning proposal (same shape as `proposal_service_terms`). Client read ONLY via `get_client_commercial_document_bundle` (extended to return `parts`).
- Attached to `guard_commercial_authored_child` (`TG_TABLE_NAME` dispatch, 00423:447-461): immutable once `proposals.status <> 'draft'`.
- Folded into `_commercial_document_fingerprint` **in the same migration**: `parts` = `jsonb_agg(to_jsonb(p) - 'created_at' - 'updated_at' ORDER BY position)`.
- **Projection**: `upsert_agreement_parts(p_proposal_id, p_parts jsonb)` (new definer RPC) writes the rows AND projects money variants into `proposal_service_terms` / `proposal_service_rates` exactly as `upsert_design_services_draft` does today (grep its head body — 00422 — and reuse; do not fork the projection logic; call it). `ceiling` NULL → `billing_ceiling_cents` becomes nullable (W1 migration) and means uncapped ONLY when no rate_card part exists; 00414:911-913 time authorization treats NULL as uncapped; send/sign refusals (00423:1608-1614, 00477:306-309, 00412:815-820) relax to "ceiling required only when a rate_card part is present".
- Legacy compatibility: proposals with no parts rows render as today (the seven-facet room, flag-off path). A one-time backfill is NOT run; `materialize_standard_parts(p_proposal_id)` (RPC) seeds the nine standard parts from the existing terms row on first open under the flag.

### `public.studio_agreement_parts` (W2) and `public.agreement_templates` (W2)
Modeled on `board_templates` (00408): `kind text CHECK IN ('seeded','studio')`, `studio_id uuid NULL REFERENCES organizations(id)`, owner-shape CHECK (`kind='seeded' AND studio_id IS NULL` or `kind='studio' AND studio_id IS NOT NULL`), `template_key text UNIQUE` namespaced `patina.*` | `studio.*` (CHECK on prefix by kind), immutable seeded rows guarded by the maintenance GUC used in 00408.
- `agreement_templates(id, kind, studio_id, template_key, class text, title, parts jsonb /* ordered [{part_key|inline, required, client_visible}] */, consent_key text NULL, created_by, created_at, updated_at)`
- `studio_agreement_parts(id, studio_id NOT NULL, kind, variant, part_key, title, payload jsonb, required_default, client_visible_default, created_by, created_at, updated_at)`
- `studio_agreement_defaults` (W1, P3): `studio_id PK`, `rate_card jsonb`, `deposit_percent`, `cadence`, `retainer_credit_rule`, `default_exclusions jsonb`, `updated_by`, `updated_at` — RLS/grants exactly as `studio_billing_settings` (00428): read `is_active_studio_member`, write `is_org_admin_or_owner`.
- RLS: read = `public.is_active_org_member(studio_id)` for studio rows + seeded rows to every authenticated (mirror `board_templates_select` 00408:135-141); write = `is_org_admin_or_owner(studio_id, auth.uid())` (R3).
- RPCs: `save_agreement_part`, `save_agreement_as_template(p_proposal_id, p_title)` (snapshot + strip owner refs, per `save_board_as_template`), `materialize_agreement_template(p_proposal_id, p_template_key)`.
- Seeded templates (W2 seed migration, `patina.design_services` = the nine standard parts; `patina.consultation`; `patina.furnishings_services`; `patina.design_build` (W3 — not selectable until the attestation exists).

### Wave 2 additions to terms/authority (P5, D-2)
- `proposal_service_terms`: `+ retainer_credit_rule text CHECK IN ('credited','non_refundable','replenishing') DEFAULT 'credited'`, `+ fee_basis text NULL CHECK IN ('hourly','flat','per_phase')`, `+ fee_amount_cents integer NULL`, `+ fee_schedule jsonb NULL`.
- `project_billing_authorities`: the same four columns, snapshotted by `_countersign_design_services_agreement_impl` (head 00566 — graft, never retype).
- `billing_cadence` CHECK widened with `per_draw` in W3 only.
- Consent sentence: `compose_agreement_consent(p_proposal_id) RETURNS text` (SQL, from money parts present) — stored on `commercial_document_signatures.metadata.consentSentence` at sign; `consent-copy.ts` becomes a composer with the same inputs and the drift test pins the composer.
- Execution snapshot (R12): `agreement_execution_snapshots(proposal_id PK, html text, part_set jsonb, document_hash text, created_at)` written at countersign; client reads via the bundle.

### Wave 3 (P9–P14)
- `document_kind` CHECK widened with `'design_build'` on `proposals` (00423:94-101) and `project_commercial_documents` (00412:115-117); sign route dispatch (`route.ts:273`), `proposal-send` ternaries (`handler.ts:240-259`), `commercial-document-notify` `SERVICES_KINDS` (`policy.ts:69`), consent composer, drift test — all learn the kind.
- `studio_trade_agreements` (P14): `id, project_id, studio_id, contact_id → studio_contacts, scope text, price_cents, schedule jsonb, retainage_bps, pay_when_paid boolean, insurance_certificate_required boolean, lien_waiver_policy text, flow_down_clause_key text, state text CHECK IN ('draft','sent','signed','void'), token-signed` + `studio_trade_agreement_signatures(agreement_id, party ('studio'|'sub'), signed_name, signed_ip, fingerprint, signed_at)` + `studio_trade_agreement_tokens` (shape of `trade_rfq_tokens` 00424).
- `studio_license_attestations(studio_id PK, credential_type, number, state, expires_on, attested_by, attested_at)` — write `is_org_admin_or_owner`; `patina.design_build` selectable only when a row exists with `expires_on > now()`.
- `agreement_jurisdiction_notices(state PK, kind, title, body, enabled boolean DEFAULT false)` seeded WI/MN/IL/CA/NY/MA, enabled only by super_admin (R11).
- Draws issue invoices through the studio-invoice rail (00571) — `issue_agreement_draw_invoice`.

## 3. Designer portal homes
- Room: `apps/designer-portal/src/components/document/rooms/drafting/service-agreement-drafting-room.tsx` gains a flag branch: flag-off = existing JSX unchanged; flag-on = `AgreementComposer` (new folder `components/document/rooms/drafting/agreement/`: `parts-rail.tsx`, `part-editor.tsx` (per kind/variant editors), `add-part-sheet.tsx` (W2 picker), `readiness.ts`).
- Readiness: `lib/document/commercial-documents.ts` `assessServiceAgreementReadiness` gains `assessAgreementReadiness(parts, terms)` — derived from `required` + typed validity + the R4 floor; the old function remains for flag-off.
- DTOs: collapse the app-local `ServiceAgreementTerms` onto `packages/types/src/commercial.ts` (P0) — one source of truth before parts land.
- Hooks: `packages/supabase/src/hooks/use-agreement-parts.ts` (query keys under the existing `use-commercial-documents.ts` family); `use-agreement-library.ts` (W2); `use-studio-agreement-defaults.ts` (W1).
- Account → Studio: `components/document/account/account-studio-page.tsx` gains an "Agreement defaults" card (W1) beside Billing, and a Library card (W2) — do not restyle Billing.
- Preview: `components/document/commercial/service-agreement-preview.tsx` renders parts in order when parts exist (shared renderer `packages/…` or app-local `agreement-renderer.tsx` reused by the client shell).
- Flags: declared where `worktable` / `studio-invoice` are (recon reports the registry path); fail-closed; `NEXT_PUBLIC_FLAG_OVERRIDES=agreement-parts:true` for local dev.

## 4. Client portal homes
- `apps/client-portal/src/components/commercial-document-shell.tsx` `DesignServicesBody` renders parts in order when the bundle carries `parts` (attachments as separate leaves with an "I received this" acknowledgment that is recorded in signature metadata); otherwise today's body.
- `components/threshold/consent-copy.ts`: composer; `__tests__/consent-copy.test.ts` pins the composer's inputs→outputs.
- Sign route `app/api/proposals/[id]/sign/route.ts`: passes the composed consent sentence and attachment acknowledgments into `sign_design_services_agreement_with_trusted_ip` (new optional jsonb arg, defaulted, so the old signature still resolves).

## 5. Edge functions
- W1–W2: none change kind dispatch. `proposal-send` email body may list part titles (optional, W2). Any `_shared/*` edit ⇒ redeploy every importer.
- W3: `proposal-send`, `commercial-document-notify` learn `design_build`; new `trade-agreement-send` (token email to the sub, reusing `trade-rfq-send` shape).

## 6. Gates (patina-verification; recon confirms exact commands)
- SQL: `pnpm supabase:reset` clean + `supabase/tests/**` relevant suites incl. `public_sd_hardening_contract_test.sql` (re-pin function-body hashes when a pinned function is redefined — 00563/00566 precedent).
- Types: `pnpm db:generate` + `git diff --exit-code packages/supabase/src/database.types.ts`.
- designer-portal: `tsc --noEmit` + full jest on a clean checkout; client-portal: jest + e2e `--workers=1`; admin-portal: build (unsandboxed).
- Deno: `_shared` + touched function tests.
- Flag-off byte-identity: a jest snapshot of the seven-facet room and the client body with the flag off, unchanged from main.

## 7. Migration numbering
Recon 2026-09-06: main head `4c0b7b17b`, migration head `00574_invoice_links.sql` (invoice-standalone shipped), no branch ahead of it. **Wave 1 mints `00575`**; later waves mint from the tip at branch time; every integration re-checks the tip before merge. Strata's applied head must be confirmed unsandboxed (`supabase migration list --linked`) before any `db push`. Flags are bare strings at call sites via `useFeatureFlag('…')` (`apps/<portal>/src/hooks/use-feature-flag.ts`, fail-closed, `NEXT_PUBLIC_FLAG_OVERRIDES` for local/e2e).
