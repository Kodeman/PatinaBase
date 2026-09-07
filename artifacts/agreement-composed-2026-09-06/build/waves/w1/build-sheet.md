# Wave 1 build sheet — “The Agreement, Composed”

**Program** `artifacts/agreement-composed-2026-09-06/` · **Wave** 1 (P0 · P1 · P2 · P3) · **Flag** `agreement-parts` (fail-closed)
**Binding inputs** `build/contract.md` · `build/rulings-2026-09-06.md` · `source/proposal.md` §4 §5 §6 §7 §10 §11 · `research/04-codebase-today.md`
**Migration head at authoring** `supabase/migrations/00574_invoice_links.sql` → W1 mints **`00575_agreement_parts.sql`** (re-check the tip at branch time and at every integration; renumber the undeployed side only).

Everything below is executable as written. Where a line quotes repo text it is verbatim at head; `path:line` citations are the authority, not this sheet's paraphrase.

---

## 0 · Findings that change the contract (read first)

Three things the recon and the contract did not resolve. All three are load-bearing; two are production hazards. They are folded into the design below and must be confirmed at review.

| # | Finding | Evidence | Resolution adopted in this sheet |
|---|---|---|---|
| **F-1** | **A signed-but-not-countersigned agreement would become permanently un-countersignable** if the fingerprint object gains a `parts` key unconditionally. `_countersign_design_services_agreement_impl` recomputes `_commercial_document_fingerprint` and refuses when the stored client signature disagrees (`00566:628-631`, again at `:658`); `guard_commercial_signature_insert` does the same on insert (`00566:196-197`). Every proposal in `client_signed` at apply time is affected, parts or no parts. | `00566:628-631`, `00566:196-197`, `00412:835-838` | The `parts` key is **conditional**, exactly mirroring the existing `tradeScope` conditional at `00423:1247`: it is added only when the proposal has ≥1 parts row. A document with no parts hashes **byte-identically to today**, so nothing in flight breaks and flag-off byte-identity extends to the evidence layer. |
| **F-2** | `project_billing_authorities.billing_ceiling_cents` is **also `NOT NULL`** (`00412:145`). Contract §2 names only the terms column. A NULL ceiling reaching countersign would raise `23502`. Two downstream readers also mis-handle NULL: `get_project_authority_summary` computes `greatest(ceiling - accrued, 0)` (`00422:2467`) which returns **0**, not "uncapped" (Postgres `greatest` skips NULLs); and the addendum promotion loop's `v_authorized_cents + … <= v_terms.billing_ceiling_cents` (`00566:841-842`, same shape at `00414:911-913`, `00475:891`, `00511:4595`) evaluates NULL → false → **nothing is ever authorized**. | `00412:145`, `00422:2449 :2467`, `00566:841-842` | W1 drops `NOT NULL` on **both** columns and makes all three readers NULL-safe. The `CHECK (… >= 0)` stays as-is on both (a CHECK is satisfied by NULL). |
| **F-3** | Contract §2 hashes **all** parts (`jsonb_agg(to_jsonb(p) …)`); proposal §4 says "every **client-visible** part is hashed". | `contract.md:39` vs `proposal.md:§4` | **Contract wins — all parts are hashed.** Hashing more is strictly stronger, the send guard freezes all parts anyway, and a studio-only part is still part of the instrument. The bundle projection to the client is separately filtered on `client_visible` (R8). Also: the contract's snippet aliases the parts table `p`, which collides with the outer `proposals p` in `_commercial_document_fingerprint` — the alias must be `ap`. |

A fourth, smaller one: `upsert_design_services_draft` **refuses an empty rates array** (`00422:1722-1728`, `jsonb_array_length(p_rates) = 0`). A flat-fee agreement with the `role_rates` part removed has no rates, so `upsert_agreement_parts` cannot simply call it. Resolution: extract the projection into a private helper both callers use (§3.7) rather than relaxing a guard that flag-off callers still rely on.

---

## 1 · Scope and non-goals

### What Wave 1 ships

| Proposal | Name | Ships in W1 |
|---|---|---|
| **P0** | Fix the floor | DTO collapse onto `packages/types/src/commercial.ts`; the ceiling blocker becomes conditional; "Not yet set" never renders on a sendable document; one part renderer per surface (two implementations, one spec — §4.6, §5.2). |
| **P1** | Parts on today's agreement | `proposal_agreement_parts` + guard dispatch + fingerprint fold, one migration; the room renders from the part list; add / remove / reorder / rename while draft; the nine standard parts materialize from today's terms row; `proposal_service_terms` becomes the projection of the money parts. |
| **P2** | Readiness from composition | `assessAgreementReadiness(parts, terms, …)` — per-part `required` + the R4 class floor. |
| **P3** | Studio agreement defaults | `studio_agreement_defaults` + the Account → Studio "Agreement defaults" card; `materialize_standard_parts` seeds from it. |

### Explicit non-goals for W1

| Not in W1 | Wave | Note |
|---|---|---|
| `studio_agreement_parts`, `agreement_templates`, save-as-template, the Library page (M4 template/parts panels), the Add-a-part **Library** picker (M2's left column) | W2 (P4) | W1's `+ Add a part` offers **blank kinds only**. `Save as template…` is **not rendered**. |
| The 15 schedule variants beyond the seven W1 uses; `flat` / `per_phase` projecting into authority; `retainer_credit_rule` / `fee_basis` / `fee_amount_cents` / `fee_schedule` on `proposal_service_terms` and `project_billing_authorities` | W2 (P5, D-2) | W1 stores `retainer_credit_rule` on **`studio_agreement_defaults` only** (contract §2 places it there in W1); nothing projects it yet. Say so in the card's help text. |
| Client copy composed **from** parts as the consent sentence; `compose_agreement_consent`; execution HTML snapshot; attachment acknowledgment recorded in signature metadata | W2 (P6, R12) | W1's client body renders parts, but the consent sentence and the sign route are **untouched** (§5.4). |
| Addenda from parts, per-part change history | W2 (P7, P8) | `create_service_addendum` (head `00422:1816`) is **not** redefined in W1 — an addendum minted in W1 carries no parts and renders on the legacy path. |
| `attachment` and `attestation` **editors**; the design-build class; jurisdiction notices; subs | W3 | The two kinds are in the W1 vocabulary and the renderers **must handle them** (§4.2, §5.3), but neither is addable from the W1 rail. |
| `client_visibility_tier` changes | never | R8 — unchanged. |
| Reopening the two-party signature constraint; writing business tables outside definer RPCs | never | Program rule. |

### Rulings W1 depends on

| Ruling | Text | Where it lands in W1 |
|---|---|---|
| **R1** | A studio Library is a different object from the retired per-user `proposal_templates`; R85 is reversed for agreements. | W1 builds no Library, but it establishes the part model the Library will materialize into (`source_template_key` / `source_part_id` columns ship **nullable and unused**). The DECISIONS entry is owed at the **W2** merge, not W1. |
| **R4** | The floor: parties, signature block, one typed money part for a class that bills; **a ceiling part is required whenever a rate card is present**. Everything else removable, Exclusions included. | Enforced twice: in `assessAgreementReadiness` (§4.4) and, as the DB floor, inside `upsert_agreement_parts` (§3.7). |
| **R5** | Prose never carries money — only `schedule` variants project into terms/authority. | The projection map (§3.7) is keyed on `part_key` and only ever writes the columns that key owns. `clause`/`list` parts project prose columns (`scope`, `deliverables`, `exclusions`, `terms`) and **never** a `*_cents`, a cadence, or an activation policy. |
| **R6** | Parts freeze at send (today's guard). Unsend = supersede. | `guard_commercial_authored_child` dispatch gains the parts table (§3.4). |
| R7 (naming) | Agreement · Part · Library · Template · Addendum. | Copy rule for every string the designer sees. Never "clause library" / "contract builder". |
| R8 (client copy) | Designer's order; per-part `client_visible`; `client_visibility_tier` unchanged. | The bundle filters on `client_visible` (§3.10). |

---

## 2 · Lanes

Three worktrees, **no overlapping pathspecs**. Per `patina-parallel-work`: one worktree each, retired at task end; never `git add -A`; stage explicit pathspecs.

### 2.0 · T0 handshake (before the lanes fork)

`packages/types` is **dist-resolved** (`packages/types/package.json` `"main": "./dist/index.js"`) — the designer and client portals serve compiled output, so every lane that consumes a new type must have the dist built. To avoid three lanes racing one file:

1. The **backend** lane's *first* commit is types-only: `packages/types/src/agreement.ts` (new), the `packages/types/src/commercial.ts` edits from §4.6, and the `packages/types/src/index.ts` export line. It lands on the integration branch immediately.
2. The designer and client lanes branch from that commit. Until it lands they code against the frozen contract text in §2.4 — it is normative; backend may not deviate from it without an orchestrator ruling.
3. Every lane runs `pnpm turbo build --filter=@patina/types` after pulling that commit and before its first `type-check`.

Integration order at merge: **backend → designer → client**.

### 2.1 · Lane `backend`

Migration, RPCs, SQL tests, generated types, `@patina/types`, `@patina/supabase` hooks.

| Pathspec | Create / modify |
|---|---|
| `supabase/migrations/00575_agreement_parts.sql` | create |
| `supabase/seed/00-legacy-grants.sql` | modify — **generated**, `python3 scripts/generate-legacy-grants.py`, never hand-edited |
| `supabase/tests/commercial/agreement_parts_test.sql` | create |
| `supabase/tests/commercial/agreement_parts_projection_test.sql` | create |
| `supabase/tests/edge_api/public_sd_hardening_contract_test.sql` | modify — re-pin one `body_sha256` (§3.13) |
| `packages/types/src/agreement.ts` | create |
| `packages/types/src/commercial.ts` | modify (§4.6) |
| `packages/types/src/index.ts` | modify — one `export * from "./agreement";` line |
| `packages/supabase/src/database.types.ts` | modify — **generated**, `pnpm db:generate`, never hand-edited |
| `packages/supabase/src/hooks/use-agreement-parts.ts` | create |
| `packages/supabase/src/hooks/use-studio-agreement-defaults.ts` | create |
| `packages/supabase/src/hooks/index.ts` | modify — two export blocks |
| `packages/supabase/src/hooks/__tests__/use-agreement-parts.test.ts` | create |
| `packages/supabase/src/hooks/__tests__/use-studio-agreement-defaults.test.ts` | create |

**May not touch**: anything under `apps/`.

### 2.2 · Lane `designer`

| Pathspec | Create / modify |
|---|---|
| `apps/designer-portal/src/components/document/rooms/drafting/service-agreement-drafting-room.tsx` | modify — flag branch only (§4.3); the existing JSX is not reformatted, reindented, or reordered |
| `apps/designer-portal/src/components/document/rooms/drafting/agreement/agreement-composer.tsx` | create |
| `…/agreement/parts-rail.tsx` | create |
| `…/agreement/part-editor.tsx` | create |
| `…/agreement/add-part-menu.tsx` | create |
| `…/agreement/part-kinds.ts` | create |
| `…/agreement/readiness.ts` | create |
| `…/agreement/__tests__/readiness.test.ts` | create |
| `…/agreement/__tests__/agreement-composer.test.tsx` | create |
| `…/agreement/__tests__/parts-rail.test.tsx` | create |
| `apps/designer-portal/src/components/document/commercial/agreement-parts-body.tsx` | create — the designer-side part renderer |
| `apps/designer-portal/src/components/document/commercial/service-agreement-preview.tsx` | modify — optional `parts` prop (§4.5) |
| `apps/designer-portal/src/lib/document/commercial-documents.ts` | modify — P0 collapse (§4.6) + conditional ceiling blocker |
| `apps/designer-portal/src/hooks/use-commercial-documents.ts` | modify — bundle gains `parts`; new `useSaveAgreementParts`, `useMaterializeStandardParts` |
| `apps/designer-portal/src/components/document/account/account-studio-page.tsx` | modify — new "Agreement defaults" card **after** the Billing block; Billing itself untouched (§4.7) |
| `apps/designer-portal/src/components/document/rooms/drafting/service-agreement-drafting-room.test.tsx` | modify — add the flag-off snapshot case |
| `apps/designer-portal/src/components/document/account/__tests__/agreement-defaults-card.test.tsx` | create (create the `__tests__` dir if absent) |
| `apps/designer-portal/playwright.config.ts` | modify — add `agreement-parts:true` to `webServer.env.NEXT_PUBLIC_FLAG_OVERRIDES` |
| `apps/designer-portal/e2e/agreement/agreement-parts.spec.ts` | create |

**May not touch**: `packages/**`, `supabase/**`, `apps/client-portal/**`.
⚠ `playwright.config.ts` has tripped the secret scanner before (`feedback_playwright_config_secret_scan_trap.md`) — add only the flag string, nothing that looks like a key.

### 2.3 · Lane `client`

| Pathspec | Create / modify |
|---|---|
| `apps/client-portal/src/lib/commercial-documents.ts` | modify — bundle adapter learns `parts`; absorb the `@patina/types` widening fallout (§4.6) |
| `apps/client-portal/src/components/commercial-document-shell.tsx` | modify — `DesignServicesBody` branch (§5.2) |
| `apps/client-portal/src/components/agreement-parts-body.tsx` | create — the client-side part renderer |
| `apps/client-portal/src/lib/commercial-documents.test.ts` | modify — parts adapter cases |
| `apps/client-portal/src/components/__tests__/commercial-document-shell.test.tsx` | create or modify — flag-off (no-parts) snapshot + parts render |
| `apps/client-portal/tests/threshold.spec.ts` | modify — one assertion (§6.5) |
| `apps/client-portal/src/app/api/proposals/[id]/sign/route.ts` | **NOT modified in W1** — listed here so the lane owns the decision and records it (§5.4) |

**May not touch**: `packages/**`, `supabase/**`, `apps/designer-portal/**`.

### 2.4 · The cross-lane interface (frozen; code against this before backend merges)

**RPC signatures** (all `SECURITY DEFINER`, `SET search_path TO 'public'` — `'public','extensions'` where `digest` is reached):

```
public.upsert_agreement_parts(p_proposal_id uuid, p_parts jsonb) RETURNS jsonb
  -- GRANT EXECUTE TO authenticated
  -- returns { proposalId, documentKind, commercialState, partCount, documentFingerprint }

public.materialize_standard_parts(p_proposal_id uuid) RETURNS jsonb
  -- GRANT EXECUTE TO authenticated
  -- returns { proposalId, materialized boolean, partCount, parts jsonb[] }
  -- idempotent: returns materialized=false and the existing set when parts already exist
```

**Table shape read directly by the designer portal under RLS** (`proposal_agreement_parts`) — snake_case rows, mapped at the hook boundary:

```
id uuid · proposal_id uuid · position integer · kind text · variant text|null
part_key text · title text · payload jsonb · required boolean · client_visible boolean
source_template_key text|null · source_part_id uuid|null · created_at · updated_at
```

**Bundle addition** (client portal reads through `get_client_commercial_document_bundle`) — a new top-level `parts` key, always present, `[]` when the document has none:

```jsonc
"parts": [
  { "id": "…", "position": 1, "kind": "clause", "variant": null,
    "partKey": "patina.services", "title": "Services",
    "payload": { "body": "…" }, "required": true }
]
```
Only `client_visible = true` rows appear. `source_template_key` / `source_part_id` never cross this edge.

**Domain types** — `packages/types/src/agreement.ts`, normative text:

```ts
export const AGREEMENT_PART_KINDS = [
  'clause', 'list', 'phases', 'schedule', 'attachment', 'attestation',
] as const;
export type AgreementPartKind = (typeof AGREEMENT_PART_KINDS)[number];

export const AGREEMENT_SCHEDULE_VARIANTS = [
  'rate_card', 'ceiling', 'retainer', 'cadence', 'flat', 'per_phase',
  'percent_of_cost', 'percent_of_spend', 'cost_plus', 'day_rate', 'package',
  'procurement', 'pricing_basis', 'draws', 'allowances',
] as const;
export type AgreementScheduleVariant = (typeof AGREEMENT_SCHEDULE_VARIANTS)[number];

export const AGREEMENT_TEMPLATE_CLASSES = [
  'design_services', 'consultation', 'furnishings_services', 'design_build',
] as const;
export type AgreementTemplateClass = (typeof AGREEMENT_TEMPLATE_CLASSES)[number];

/** R9 — the variants that create billing authority in Wave 2. Declared in W1
 *  so the composer can chip a part `creates authority` vs `record only`;
 *  nothing in W1 reads it for a projection. `procurement` is on this list only
 *  for its depositPercent field. */
export const AUTHORITY_VARIANTS = [
  'rate_card', 'ceiling', 'retainer', 'cadence', 'flat', 'per_phase',
] as const;

export interface ClausePayload { body: string }
export interface ListItem { id: string; text: string; note?: string; optional?: boolean }
export interface ListPayload { items: ListItem[] }
export interface PhasesPayload { phases: { key: string; label: string; on: boolean; feeCents?: number }[] }
export interface RateCardPayload { roles: { roleName: string; hourlyRateCents: number; sortOrder: number }[] }
export interface CeilingPayload { cents: number | null }
export interface RetainerPayload {
  cents: number;
  creditRule: 'credited' | 'non_refundable' | 'replenishing';
  activationPolicy: 'immediate' | 'retainer_paid';
}
export interface CadencePayload { cadence: 'monthly' | 'biweekly' | 'milestone' | 'per_draw' }
export interface FlatPayload { cents: number }
export interface PerPhasePayload { phases: { key: string; label: string; cents: number }[] }
export interface ProcurementPayload {
  depositPercent: number | null;
  markupBasis?: string; freightHandling?: string; termsOfSale?: string;
}
export interface PricingBasisPayload { basis: string; scheduleOfValues?: { label: string; cents: number }[] }
export interface DrawsPayload { draws: { label: string; percentage: number | null; cents: number }[]; retainageBps?: number }
export interface AllowancesPayload { allowances: { label: string; cents: number }[]; overageRule?: string }
export interface AttachmentPayload { title: string; body: string; jurisdiction?: string; acknowledgeRequired: boolean }
export interface AttestationPayload {
  credentialType: string; number: string; state: string;
  expiresOn: string; attestedAt: string; attestedBy: string;
}

export interface AgreementPart {
  id: string;
  proposalId: string;
  position: number;
  kind: AgreementPartKind;
  variant: AgreementScheduleVariant | null;
  partKey: string;
  title: string;
  payload: Record<string, unknown>;
  required: boolean;
  clientVisible: boolean;
  sourceTemplateKey: string | null;
  sourcePartId: string | null;
  updatedAt: string | null;
}

/** The nine standard parts, in order. `defaultTitle` is the studio-facing
 *  title; the payload defaults come from today's literals in
 *  service-agreement-drafting-room.tsx (:30-38, :48-50). */
export const PATINA_STANDARD_AGREEMENT_PARTS = [
  { partKey: 'patina.services',    kind: 'clause',   variant: null,          defaultTitle: 'Services',           required: true  },
  { partKey: 'patina.deliverables',kind: 'list',     variant: null,          defaultTitle: 'Deliverables',       required: false },
  { partKey: 'patina.exclusions',  kind: 'list',     variant: null,          defaultTitle: 'Exclusions',         required: false },
  { partKey: 'patina.role_rates',  kind: 'schedule', variant: 'rate_card',   defaultTitle: 'Role rates',         required: false },
  { partKey: 'patina.ceiling',     kind: 'schedule', variant: 'ceiling',     defaultTitle: 'Ceiling',            required: false },
  { partKey: 'patina.deposit',     kind: 'schedule', variant: 'procurement', defaultTitle: 'Furnishings deposit',required: false },
  { partKey: 'patina.retainer',    kind: 'schedule', variant: 'retainer',    defaultTitle: 'Retainer',           required: false },
  { partKey: 'patina.cadence',     kind: 'schedule', variant: 'cadence',     defaultTitle: 'Billing cadence',    required: false },
  { partKey: 'patina.terms',       kind: 'clause',   variant: null,          defaultTitle: 'Terms',              required: true  },
] as const;

export interface StudioAgreementDefaults {
  studioId: string;
  rateCard: { roleName: string; hourlyRateCents: number; sortOrder: number }[];
  depositPercent: number | null;
  cadence: 'monthly' | 'biweekly' | 'milestone';
  retainerCreditRule: 'credited' | 'non_refundable' | 'replenishing';
  defaultExclusions: string[];
  updatedBy: string | null;
  updatedAt: string | null;
}
```

`required: true` on services and terms only — R4's floor is "one typed money part for a class that bills" plus parties and the signature block, and Exclusions is explicitly removable.

**Hook names** (from `@patina/supabase`, `main → ./src/…`, live-edit, no rebuild):

| Hook | Query key | Notes |
|---|---|---|
| `useAgreementParts(proposalId)` | `['agreement-parts', proposalId]` | direct table read under RLS, `.order('position')` |
| `useSaveAgreementParts()` | — | `rpc('upsert_agreement_parts')`; invalidates `['agreement-parts', proposalId]`, `commercialKeys.document(proposalId)`, `['proposal', proposalId]` |
| `useMaterializeStandardParts()` | — | `rpc('materialize_standard_parts')`; same invalidation set |
| `useStudioAgreementDefaults(studioId)` | `['studio-agreement-defaults', studioId]` | shaped exactly like `useStudioBillingSettings` (`packages/supabase/src/hooks/use-studio-billing.ts:44-58`), including the "absent row reads as defaults" behavior |
| `useUpdateStudioAgreementDefaults()` | — | upsert on `studio_id`; invalidates its own key |

---

## 3 · Migration outline — `supabase/migrations/00575_agreement_parts.sql`

One file. Idempotent throughout. Every `SECURITY DEFINER` pins `search_path`. Every extension function schema-qualified (`extensions.digest`, `extensions.gen_random_uuid`) — the prod push session's search_path lacks `extensions` (the 00282 incident).

### 3.1 · Banner

```sql
-- ═══════════════════════════════════════════════════════════════════════════
-- 00575 — The Agreement, composed: parts on today's agreement
--
-- Wave 1 of "The Agreement, Composed". An agreement stops being seven fixed
-- facets on one wide row and becomes an ORDERED LIST OF PARTS that projects
-- into the terms row the guards already enforce. Nothing about the money rail
-- changes shape: proposal_service_terms is still the projection countersign
-- snapshots (00566:788-797), and only typed schedule variants ever write it
-- (R5). Prose is prose.
--
-- Lineage of every function redefined here (grep|sort|tail-1 winners at
-- authoring; re-verify before writing a line):
--   guard_commercial_authored_child            00412:604 → 00423:440
--   _commercial_document_fingerprint           00412:704 → 00422:251 → 00423:1214
--   upsert_design_services_draft               00412 → 00422:1707
--   send_commercial_document                   00412 → 00423:1546
--   _sign_design_services_agreement_authorized 00412:767
--   _issue_design_services_agreement_on_paper  00477:110
--   _countersign_design_services_agreement_impl 00475:? → 00511:? → 00566:304
--   get_project_authority_summary              00422:2381
--   get_client_commercial_document_bundle      00412:2938 → 00414 → 00422:1911
--                                               → 00423 → 00425:1214
--
-- Reconciles:
--   (F-1) The fingerprint's `parts` key is CONDITIONAL on the proposal having
--         parts, exactly as `tradeScope` is conditional at 00423:1247. An
--         unconditional key would change the hash of EVERY existing proposal,
--         and _countersign_design_services_agreement_impl refuses when the
--         stored client signature disagrees (00566:628-631) — every document
--         sitting in 'client_signed' at apply time would become permanently
--         un-countersignable. A document with no parts hashes byte-for-byte
--         what it hashed before this file.
--   (F-2) billing_ceiling_cents drops NOT NULL on BOTH proposal_service_terms
--         (00412:73) and project_billing_authorities (00412:145). NULL means
--         uncapped, and it is legal ONLY when no rate_card part is present.
--         Three readers are made NULL-safe: the addendum promotion loop
--         (00566:841-842), the exhaustion test and the remaining-headroom
--         arithmetic (00422:2449, :2467).
-- ═══════════════════════════════════════════════════════════════════════════
```

### 3.2 · `public.proposal_agreement_parts`

```sql
CREATE TABLE IF NOT EXISTS public.proposal_agreement_parts (
  id                  uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  proposal_id         uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  position            integer NOT NULL CHECK (position > 0),
  kind                text NOT NULL CHECK (char_length(btrim(kind)) > 0),
  variant             text NULL CHECK (variant IS NULL OR char_length(btrim(variant)) > 0),
  part_key            text NOT NULL CHECK (char_length(btrim(part_key)) > 0),
  title               text NOT NULL CHECK (char_length(btrim(title)) > 0),
  payload             jsonb NOT NULL DEFAULT '{}'::jsonb
                        CHECK (jsonb_typeof(payload) = 'object'),
  required            boolean NOT NULL DEFAULT false,
  client_visible      boolean NOT NULL DEFAULT true,
  source_template_key text NULL,
  source_part_id      uuid NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uniq_agreement_part_key UNIQUE (proposal_id, part_key)
);
```

`kind` and `variant` carry **no CHECK beyond non-empty** — the un-CHECKed code-resident vocabulary pattern from `studio_contacts.contact_kind` (`00417:87`, doctrine at `:130-135`). Copy that comment's shape onto both columns, naming `packages/types/src/agreement.ts` as the vocabulary's home.

`position` uniqueness is deferrable so a reorder can renumber inside one statement:

```sql
ALTER TABLE public.proposal_agreement_parts
  DROP CONSTRAINT IF EXISTS uniq_agreement_part_position;
ALTER TABLE public.proposal_agreement_parts
  ADD CONSTRAINT uniq_agreement_part_position
  UNIQUE (proposal_id, position) DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX IF NOT EXISTS idx_agreement_parts_proposal_position
  ON public.proposal_agreement_parts (proposal_id, position);

DROP TRIGGER IF EXISTS set_proposal_agreement_parts_updated_at
  ON public.proposal_agreement_parts;
CREATE TRIGGER set_proposal_agreement_parts_updated_at
  BEFORE UPDATE ON public.proposal_agreement_parts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
```

`source_part_id` is left **without a FK** — its target (`studio_agreement_parts`) does not exist until W2. W2 adds the constraint. Comment the column so the reviewer does not read it as an oversight.

### 3.3 · RLS and grants for the parts table

Mirror `proposal_service_terms_studio_rw` (`00412:318-321`) exactly:

```sql
ALTER TABLE public.proposal_agreement_parts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS proposal_agreement_parts_studio_rw ON public.proposal_agreement_parts;
CREATE POLICY proposal_agreement_parts_studio_rw ON public.proposal_agreement_parts
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.proposals p
                 WHERE p.id = proposal_id AND public.is_studio_comember(p.designer_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.proposals p
                      WHERE p.id = proposal_id AND public.is_studio_comember(p.designer_id)));

REVOKE ALL ON TABLE public.proposal_agreement_parts FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.proposal_agreement_parts TO authenticated;
GRANT ALL ON TABLE public.proposal_agreement_parts TO service_role;
```

There is **no client policy**. A client reads parts only through `get_client_commercial_document_bundle` (§3.10) — the same discipline the terms/rates tables keep (`00412:332-335`). `public.is_studio_comember(uuid)` head is `00556:51-76`, granted at `:79`.

### 3.4 · Guard dispatch — the exact branch to extend

`guard_commercial_authored_child` head is `00423:440`. Copy that body **verbatim** and add exactly one `WHEN` arm to the `TG_TABLE_NAME` `CASE`. Today's arms, verbatim (`00423:447-451`):

```sql
  v_proposal_id uuid := CASE TG_TABLE_NAME
    WHEN 'proposal_service_terms' THEN COALESCE(NEW.proposal_id, OLD.proposal_id)
    WHEN 'proposal_service_rates' THEN COALESCE(NEW.proposal_id, OLD.proposal_id)
    WHEN 'trade_scope_sections' THEN COALESCE(NEW.proposal_id, OLD.proposal_id)
  END;
```

becomes

```sql
  v_proposal_id uuid := CASE TG_TABLE_NAME
    WHEN 'proposal_service_terms' THEN COALESCE(NEW.proposal_id, OLD.proposal_id)
    WHEN 'proposal_service_rates' THEN COALESCE(NEW.proposal_id, OLD.proposal_id)
    WHEN 'trade_scope_sections' THEN COALESCE(NEW.proposal_id, OLD.proposal_id)
    WHEN 'proposal_agreement_parts' THEN COALESCE(NEW.proposal_id, OLD.proposal_id)
  END;
```

Nothing else in the function changes: the draft test (`00423:452-458`), the `check_violation` errcode, the `RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END` tail, `SECURITY INVOKER`, `SET search_path = public, pg_temp`, and the `REVOKE ALL … FROM PUBLIC, anon, authenticated, service_role`. Then bind it:

```sql
DROP TRIGGER IF EXISTS guard_proposal_agreement_parts_authored ON public.proposal_agreement_parts;
CREATE TRIGGER guard_proposal_agreement_parts_authored
BEFORE INSERT OR UPDATE OR DELETE ON public.proposal_agreement_parts
FOR EACH ROW EXECUTE FUNCTION public.guard_commercial_authored_child();
```

This is R6: parts freeze at **send**, not at signature, exactly like the terms row.

### 3.5 · Fingerprint fold — the exact aggregation

`_commercial_document_fingerprint` head is `00423:1214`. Copy verbatim; the delta is a second conditional block appended to the existing `|| CASE WHEN p.document_kind = 'trade_scope' … END` chain. The outer alias is `p` (`FROM public.proposals p`), so the parts alias **must** be `ap`:

```sql
  ) || CASE WHEN p.document_kind = 'trade_scope' THEN jsonb_build_object(
    'tradeScope', jsonb_build_object( … unchanged … )
  ) ELSE '{}'::jsonb END
    -- 00575: parts join the hash the moment a document HAS parts, and not one
    -- moment sooner. Conditional, not unconditional: an unconditional key
    -- changes the digest of every legacy document, and countersign refuses
    -- when the stored client signature's evidence_fingerprint disagrees
    -- (00566:628-631). A parts-less document must hash exactly what it hashed
    -- before this migration, or every in-flight client_signed agreement dies.
    -- ALL parts are hashed, not only client-visible ones: the send guard
    -- freezes the whole set, and a studio-only part is still part of the
    -- instrument the two parties are bound by.
    || CASE WHEN EXISTS (
         SELECT 1 FROM public.proposal_agreement_parts ap WHERE ap.proposal_id = p.id
       ) THEN jsonb_build_object(
    'parts', (
      SELECT jsonb_agg(to_jsonb(ap) - 'created_at' - 'updated_at'
                       ORDER BY ap.position, ap.id)
      FROM public.proposal_agreement_parts ap WHERE ap.proposal_id = p.id
    )
  ) ELSE '{}'::jsonb END)::text, 'UTF8'), 'sha256'), 'hex')
```

`to_jsonb(ap)` (minus the timestamps) means a **new column on this table is automatically covered** — the same property `serviceTerms` has (`00423:1224-1227`), and the reason `furnishings_deposit_percent` needed no fingerprint edit. Keep `id` in the hashed object: a part's identity is part of the document's identity, and parts are never re-keyed after send.

Preserve `LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions, pg_temp` and the `REVOKE ALL … FROM PUBLIC, anon, authenticated, service_role` tail.

### 3.6 · Ceiling nullability, and the three refusals that relax

```sql
ALTER TABLE public.proposal_service_terms
  ALTER COLUMN billing_ceiling_cents DROP NOT NULL;
ALTER TABLE public.project_billing_authorities
  ALTER COLUMN billing_ceiling_cents DROP NOT NULL;
```

Both keep their existing `CHECK (billing_ceiling_cents >= 0)` (`00412:73`, `00412:145`) — a CHECK is satisfied by NULL, so nothing needs dropping.

One helper carries the relaxation to all three refusal sites, so the predicate exists once:

```sql
-- TRUE when this proposal still owes a role rate before it can be sent or
-- signed: either it has no parts at all (every document authored before
-- 00575, and every flag-off document — the legacy contract, unchanged), or it
-- has a rate_card part and therefore bills time (R4).
CREATE OR REPLACE FUNCTION public._agreement_requires_rate_card(p_proposal_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT NOT EXISTS (
           SELECT 1 FROM public.proposal_agreement_parts ap
           WHERE ap.proposal_id = p_proposal_id
         )
      OR EXISTS (
           SELECT 1 FROM public.proposal_agreement_parts ap
           WHERE ap.proposal_id = p_proposal_id
             AND ap.kind = 'schedule' AND ap.variant = 'rate_card'
         );
$$;
REVOKE ALL ON FUNCTION public._agreement_requires_rate_card(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
```

| # | Site (head) | Current text | Relaxed to |
|---|---|---|---|
| **A** | `send_commercial_document`, `00423:1608-1614` | `IF v_proposal.document_kind IN ('design_services', 'service_addendum') AND (`<br>`  NOT EXISTS (SELECT 1 FROM public.proposal_service_terms t WHERE t.proposal_id = p_proposal_id)`<br>`  OR NOT EXISTS (SELECT 1 FROM public.proposal_service_rates r WHERE r.proposal_id = p_proposal_id)`<br>`) THEN RAISE EXCEPTION 'design-services send requires terms and role rates'` | `IF v_proposal.document_kind IN ('design_services','service_addendum') AND (`<br>`  NOT EXISTS (… proposal_service_terms …)`<br>`  OR (public._agreement_requires_rate_card(p_proposal_id)`<br>`      AND NOT EXISTS (… proposal_service_rates …))`<br>`) THEN RAISE EXCEPTION 'design-services send requires terms, and role rates whenever a rate card is present'` |
| **B** | `_sign_design_services_agreement_authorized`, `00412:815-820` | `IF NOT EXISTS (SELECT 1 FROM public.proposal_service_terms t WHERE t.proposal_id = p_proposal_id)`<br>`   OR NOT EXISTS (SELECT 1 FROM public.proposal_service_rates r WHERE r.proposal_id = p_proposal_id)`<br>`THEN RAISE EXCEPTION 'design services agreement requires terms and at least one role rate'` | same predicate shape as A; message → `'design services agreement requires terms, and at least one role rate whenever a rate card is present'` |
| **C** | `_issue_design_services_agreement_on_paper`, `00477:306-311` | identical text to B | identical relaxation to B |

Redefine each function from its head body **verbatim** with only that predicate swapped. Site B lives inside `_sign_design_services_agreement_authorized` (`00412:767`), which is **not** in the pinned-hash contract test — but its caller `sign_design_services_agreement_with_trusted_ip` (head `00511:1825`) **is**, and must **not** be touched, so its pin survives untouched.

**NULL-safe readers** (F-2), three edits, each grafted onto the named head body:

| Function (head) | Line | Current | Becomes |
|---|---|---|---|
| `_countersign_design_services_agreement_impl` (`00566:304`) | `00566:841-842` | `IF v_authorized_cents + v_pending_entry.rated_amount_cents`<br>`   <= v_terms.billing_ceiling_cents THEN` | `IF v_terms.billing_ceiling_cents IS NULL`<br>`   OR v_authorized_cents + v_pending_entry.rated_amount_cents`<br>`      <= v_terms.billing_ceiling_cents THEN` |
| `get_project_authority_summary` (`00422:2381`) | `00422:2449` | `WHEN v_authority.status = 'exhausted'`<br>`  OR v_accrued >= v_authority.billing_ceiling_cents THEN 'exhausted'` | `WHEN v_authority.status = 'exhausted'`<br>`  OR (v_authority.billing_ceiling_cents IS NOT NULL`<br>`      AND v_accrued >= v_authority.billing_ceiling_cents) THEN 'exhausted'` |
| same | `00422:2467` | `'remainingCents', greatest(v_authority.billing_ceiling_cents - v_accrued, 0),` | `'remainingCents', CASE WHEN v_authority.billing_ceiling_cents IS NULL THEN NULL`<br>`  ELSE greatest(v_authority.billing_ceiling_cents - v_accrued, 0) END,` |

`'ceilingCents'` / `'authorizedCents'` (`00422:2462-2463`) already pass the column through and become `null` naturally — no edit, but note it: **every TypeScript reader of `ProjectBillingAuthority.ceilingCents` / `remainingCents` must accept `number | null`** (designer lane, §4.6).

The three older bodies at `00414:911-913`, `00475:891` and `00511:4595` are **superseded** by `00566:841-842` and are not touched — redefining a superseded body is exactly the 00199-reverts-00185 failure mode.

### 3.7 · The projection: one implementation, two callers

`upsert_design_services_draft` (head `00422:1707`) **refuses an empty rates array** at `00422:1722-1728`. A flat-fee agreement has none. Rather than weaken that guard for the flag-off path, extract its projection block:

```sql
-- 00575: the projection, lifted verbatim out of upsert_design_services_draft
-- (00422:1747-1794) so parts and the seven-facet room write the terms row
-- through ONE body. No behavior of that block changes here except that
-- billingCeilingCents may now arrive as JSON null and land as SQL NULL —
-- which the seven-facet room never sends (its hook always writes an integer,
-- use-commercial-documents.ts:385), so the flag-off path is unmoved.
CREATE OR REPLACE FUNCTION public._project_agreement_terms(
  p_proposal_id uuid,
  p_terms jsonb,
  p_rates jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_rate jsonb;
  v_current_version integer := COALESCE((p_terms->>'currentRateVersion')::integer, 1);
BEGIN
  INSERT INTO public.proposal_service_terms (
    proposal_id, scope, deliverables, exclusions, billing_ceiling_cents,
    retainer_amount_cents, retainer_activation_policy, billing_cadence,
    currency, terms, current_rate_version, furnishings_deposit_percent
  ) VALUES (
    p_proposal_id,
    COALESCE(p_terms->>'scope', ''),
    COALESCE(p_terms->'deliverables', '[]'::jsonb),
    COALESCE(p_terms->'exclusions', '[]'::jsonb),
    -- The ONE delta from 00422:1756: `COALESCE(…, 0)` became a NULL-preserving
    -- read, so a removed ceiling part is uncapped rather than zero-capped.
    (NULLIF(p_terms->>'billingCeilingCents', ''))::integer,
    COALESCE((p_terms->>'retainerAmountCents')::integer, 0),
    COALESCE(NULLIF(p_terms->>'retainerActivationPolicy', ''), 'immediate'),
    COALESCE(NULLIF(p_terms->>'billingCadence', ''), 'monthly'),
    upper(COALESCE(NULLIF(p_terms->>'currency', ''), 'USD')),
    NULLIF(p_terms->>'terms', ''),
    v_current_version,
    NULLIF(p_terms->>'furnishingsDepositPercent', '')::numeric
  ) ON CONFLICT (proposal_id) DO UPDATE SET
    scope = EXCLUDED.scope,
    deliverables = EXCLUDED.deliverables,
    exclusions = EXCLUDED.exclusions,
    billing_ceiling_cents = EXCLUDED.billing_ceiling_cents,
    retainer_amount_cents = EXCLUDED.retainer_amount_cents,
    retainer_activation_policy = EXCLUDED.retainer_activation_policy,
    billing_cadence = EXCLUDED.billing_cadence,
    currency = EXCLUDED.currency,
    terms = EXCLUDED.terms,
    current_rate_version = EXCLUDED.current_rate_version,
    furnishings_deposit_percent = EXCLUDED.furnishings_deposit_percent,
    updated_at = now();

  DELETE FROM public.proposal_service_rates WHERE proposal_id = p_proposal_id;
  FOR v_rate IN SELECT value FROM jsonb_array_elements(COALESCE(p_rates, '[]'::jsonb))
  LOOP
    INSERT INTO public.proposal_service_rates (
      proposal_id, version, role_name, hourly_rate_cents, sort_order, effective_at
    ) VALUES (
      p_proposal_id,
      COALESCE((v_rate->>'version')::integer, v_current_version),
      btrim(v_rate->>'roleName'),
      (v_rate->>'hourlyRateCents')::integer,
      COALESCE((v_rate->>'sortOrder')::integer, 0),
      COALESCE((v_rate->>'effectiveAt')::timestamptz, now())
    );
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public._project_agreement_terms(uuid, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
```

**`upsert_design_services_draft` is then redefined from its `00422:1707` head body, verbatim**, with `00422:1747-1794` replaced by `PERFORM public._project_agreement_terms(p_proposal_id, p_terms, p_rates);`. Every refusal (`:1722-1737`), the kind widen (`:1741-1746`), both `set_config` calls, the return object (`:1797-1805`), the `EXCEPTION WHEN OTHERS` restore, the `REVOKE`/`GRANT` pair — all unchanged. Because the room's hook always sends `billingCeilingCents: Math.round(terms.billingCeilingCents)` (`use-commercial-documents.ts:385`), the flag-off path writes the same integer it wrote before.

**`upsert_agreement_parts(p_proposal_id uuid, p_parts jsonb)`** — body outline:

1. Refuse unless `auth.uid()` is present and `jsonb_typeof(p_parts) = 'array'` — `check_violation`.
2. `SELECT * INTO v_proposal FROM public.proposals WHERE id = p_proposal_id FOR UPDATE;` refuse unless found **and** `status = 'draft'` **and** `public._can_author_proposal(v_proposal.designer_id)` — `insufficient_privilege`. Refuse unless `document_kind IN ('legacy','design_services','service_addendum')` — `check_violation`. (Same three refusals as `00422:1729-1740`, same errcodes.)
3. Save `app.commercial_document_id`; set it to the proposal id; run the same `UPDATE public.proposals SET document_kind = CASE WHEN document_kind = 'legacy' THEN 'design_services' ELSE document_kind END, commercial_state = 'draft', updated_at = now()` as `00422:1742-1746`.
4. `SET CONSTRAINTS uniq_agreement_part_position DEFERRED;` then `DELETE FROM public.proposal_agreement_parts WHERE proposal_id = p_proposal_id;` then insert from `jsonb_array_elements(p_parts) WITH ORDINALITY AS e(part, ord)`, taking `position = e.ord`, `kind = part->>'kind'`, `variant = NULLIF(part->>'variant','')`, `part_key = part->>'partKey'`, `title = btrim(part->>'title')`, `payload = COALESCE(part->'payload','{}'::jsonb)`, `required = COALESCE((part->>'required')::boolean,false)`, `client_visible = COALESCE((part->>'clientVisible')::boolean,true)`, `source_template_key = NULLIF(part->>'sourceTemplateKey','')`, `source_part_id = NULLIF(part->>'sourcePartId','')::uuid`. Replacement is wholesale — the same discipline `proposal_service_rates` uses (`00422:1780`), so a removed part is **absent**, not blank.
5. **The R4 DB floor.** After the insert:
   ```
   IF EXISTS (rate_card part with jsonb_array_length(payload->'roles') > 0)
      AND NOT EXISTS (ceiling part whose payload->>'cents' IS NOT NULL)
   THEN RAISE EXCEPTION 'an agreement that bills time needs a ceiling'
        USING ERRCODE = 'check_violation';
   END IF;
   ```
6. **AMENDED BY RULING R20 (2026-09-06).** Derive the FOUR PROSE slots by `part_key` and the FIVE MONEY figures by **kind + variant**, under whatever key the composition gave them, and refuse a second part of any money shape.

   > *The original instruction read "derive the projection **by `part_key`**, not by variant — `UNIQUE (proposal_id, part_key)` guarantees at most one of each, and a custom or duplicate schedule part must never silently rewrite the money row (R5)". It is superseded because the composer mints a fresh `custom.<uuid>` key for **every** part a designer adds from the rail (`part-kinds.ts` `createBlankPart`), so a key-derived money projection renders a rate card, a ceiling, a retainer, a cadence or a deposit on the page the client signs and writes NONE of it to `proposal_service_terms` — the row countersign snapshots into the billing authority. R5 is preserved by the SHAPE requirement instead: a clause keyed `patina.ceiling` is prose however many cents it names, and the "never silently choose" half is preserved by a new refusal — `an agreement carries only one <ceiling|rate card|retainer|billing cadence|furnishings deposit>` — declared here as part of §2.4's interface. The prose slots keep their keys because two clauses cannot both be "the scope" (ruling R19). Recorded in `rulings-2026-09-06.md` under "Wave 1 integration rulings".*

   | Slot | Read by | kind / variant | Reads | Writes on the terms row | Absent ⇒ |
   |---|---|---|---|---|---|
   | `patina.services` | **key** | clause | `payload->>'body'` | `scope` | `''` |
   | `patina.deliverables` | **key** | list | `payload->'items'` → `jsonb_agg(item->>'text')` | `deliverables` | `'[]'` |
   | `patina.exclusions` | **key** | list | same | `exclusions` | `'[]'` |
   | `patina.terms` | **key** | clause | `payload->>'body'` | `terms` | `NULL` |
   | any key | **shape** | schedule/`rate_card` | `payload->'roles'` | the `p_rates` array (`roleName`, `hourlyRateCents`, `sortOrder`, `effectiveAt` — B-9) | `'[]'` → zero rate rows |
   | any key | **shape** | schedule/`ceiling` | `payload->>'cents'` | `billing_ceiling_cents` | **`NULL` = uncapped** |
   | any key | **shape** | schedule/`retainer` | `payload->>'cents'`, `payload->>'activationPolicy'` | `retainer_amount_cents`, `retainer_activation_policy` | `0`, `'immediate'` |
   | any key | **shape** | schedule/`cadence` | `payload->>'cadence'` | `billing_cadence` | `'monthly'` |
   | any key | **shape** | schedule/`procurement` | `payload->>'depositPercent'` | `furnishings_deposit_percent` | `NULL` |
   | anything else | — | any | — | **nothing** | — |

   `currency` and `currentRateVersion` are carried through from the existing terms row (or `'USD'` / `1` when there is none). `payload->>'creditRule'` on the retainer part is **read and discarded** in W1 — the column arrives in W2 (D-2). Comment that so it does not read as a dropped field.
7. `PERFORM public._project_agreement_terms(p_proposal_id, v_terms, v_rates);`
8. Restore `app.commercial_document_id`; return `jsonb_build_object('proposalId', …, 'documentKind', …, 'commercialState','draft', 'partCount', jsonb_array_length(p_parts), 'documentFingerprint', public._commercial_document_fingerprint(p_proposal_id))`.
9. `EXCEPTION WHEN OTHERS THEN PERFORM set_config('app.commercial_document_id', COALESCE(v_previous_commercial, ''), true); RAISE;` — the same restore tail as `00422:1806-1808`.
10. `REVOKE ALL … FROM PUBLIC, anon, service_role; GRANT EXECUTE … TO authenticated;`

**`materialize_standard_parts(p_proposal_id uuid)`** — body outline:

1. Same author/draft refusals as steps 1–2 above.
2. If any parts row already exists → `RETURN jsonb_build_object('materialized', false, 'partCount', <n>, 'parts', <set>)`. Idempotent: two tabs opening the room do not double-seed.
3. Read the existing `proposal_service_terms` row and `proposal_service_rates` at `current_rate_version` (may be absent for a brand-new draft).
4. Read `public.studio_agreement_defaults` for the proposal's studio, resolved as `(SELECT studio_id FROM public.projects WHERE id = v_proposal.project_id)` falling back to the designer's active studio via the same resolution `_countersign_design_services_agreement_impl` uses (`00566:344-408`) — **read-only**, and a missing row is not an error.
5. Insert the nine parts at positions 1..9 in `PATINA_STANDARD_AGREEMENT_PARTS` order, payloads resolved terms-row-first, then studio defaults, then the literals below. The literals must match `service-agreement-drafting-room.tsx` **exactly** or a materialized draft silently differs from an unmaterialized one:
   - `patina.services` body → the terms row's `scope`, else `'Interior design services, including concept development, design documentation, and selections.'` (`:48-50`)
   - `patina.deliverables` items → the terms row's `deliverables`, else `["Concept presentation","Design documentation","Selection schedules"]` (`:30-34`)
   - `patina.exclusions` items → the terms row's `exclusions`, else the studio default `default_exclusions`, else `["Construction labor","Furnishings, freight, tax, and installation"]` (`:35-38`)
   - `patina.role_rates` roles → the rate rows, else the studio default `rate_card`, else `[]`
   - `patina.ceiling` cents → the terms row's `billing_ceiling_cents` (may be `0` on an untouched draft — carry `0` through, do **not** invent a value)
   - `patina.deposit` depositPercent → terms row, else studio default, else `50` (matching `emptyTerms`'s `furnishingsDepositPercent: 50`)
   - `patina.retainer` → terms row's amount + activation policy; `creditRule` from the studio default, else `'credited'`
   - `patina.cadence` → terms row, else studio default, else `'monthly'`
   - `patina.terms` body → terms row's `terms`, else `''`
   `required` is `true` for `patina.services` and `patina.terms` only; `client_visible` is `true` for all nine.
6. **Does not re-project.** The terms row it read is already the projection; writing it back would be a no-op that touches `updated_at` and shifts the room's remount key.
7. Same grants as `upsert_agreement_parts`.

### 3.8 · `public.studio_agreement_defaults`

Shape, RLS and grants copied from `studio_billing_settings` (`00428:42-90`) with no deviation in the policy predicates:

```sql
CREATE TABLE IF NOT EXISTS public.studio_agreement_defaults (
  studio_id            uuid PRIMARY KEY
                         REFERENCES public.organizations(id) ON DELETE CASCADE,
  rate_card            jsonb NOT NULL DEFAULT '[]'::jsonb
                         CHECK (jsonb_typeof(rate_card) = 'array'),
  deposit_percent      numeric NULL
                         CHECK (deposit_percent IS NULL
                                OR (deposit_percent >= 0 AND deposit_percent <= 100)),
  cadence              text NOT NULL DEFAULT 'monthly'
                         CHECK (cadence IN ('monthly','biweekly','milestone')),
  retainer_credit_rule text NOT NULL DEFAULT 'credited'
                         CHECK (retainer_credit_rule IN ('credited','non_refundable','replenishing')),
  default_exclusions   jsonb NOT NULL DEFAULT '[]'::jsonb
                         CHECK (jsonb_typeof(default_exclusions) = 'array'),
  updated_by           uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS set_studio_agreement_defaults_updated_at
  ON public.studio_agreement_defaults;
CREATE TRIGGER set_studio_agreement_defaults_updated_at
  BEFORE UPDATE ON public.studio_agreement_defaults
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.studio_agreement_defaults ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS studio_agreement_defaults_member_select ON public.studio_agreement_defaults;
CREATE POLICY studio_agreement_defaults_member_select
  ON public.studio_agreement_defaults FOR SELECT TO authenticated
  USING (public.is_active_studio_member(studio_id));

DROP POLICY IF EXISTS studio_agreement_defaults_admin_insert ON public.studio_agreement_defaults;
CREATE POLICY studio_agreement_defaults_admin_insert
  ON public.studio_agreement_defaults FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin_or_owner(studio_id));

DROP POLICY IF EXISTS studio_agreement_defaults_admin_update ON public.studio_agreement_defaults;
CREATE POLICY studio_agreement_defaults_admin_update
  ON public.studio_agreement_defaults FOR UPDATE TO authenticated
  USING (public.is_org_admin_or_owner(studio_id))
  WITH CHECK (public.is_org_admin_or_owner(studio_id));

REVOKE ALL ON TABLE public.studio_agreement_defaults FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.studio_agreement_defaults TO authenticated;
GRANT ALL ON TABLE public.studio_agreement_defaults TO service_role;
```

No DELETE policy — the row dies with the org, exactly as 00428 comments. `is_active_studio_member` head `00417:40-55` (granted `:58`); `is_org_admin_or_owner` head `00484:604-624`.

### 3.9 · `COMMENT ON` (required, not decorative)

- `proposal_agreement_parts` — what a part is, that the vocabulary is code-resident in `packages/types/src/agreement.ts`, that it freezes at send, and that its client edge is the bundle RPC.
- `proposal_agreement_parts.kind` / `.variant` — the `00417:130-135` doctrine sentence.
- `proposal_agreement_parts.source_part_id` — "no FK until W2 creates `studio_agreement_parts`".
- `proposal_service_terms.billing_ceiling_cents` — "NULL means uncapped; legal only when the agreement carries no rate_card part (`_agreement_requires_rate_card`)".
- `project_billing_authorities.billing_ceiling_cents` — the same sentence.
- `studio_agreement_defaults` — "Per-studio agreement defaults. One row per organization; absence means the Patina standard."
- `studio_agreement_defaults.retainer_credit_rule` — "stored in W1, projected in W2 (D-2); nothing reads it yet."

### 3.10 · `get_client_commercial_document_bundle` extension

Head is **`00425:1214`** — not `00422:1911` as the recon narrative reads; `grep -rln "CREATE OR REPLACE FUNCTION[^(]*get_client_commercial_document_bundle" supabase/migrations/*.sql | sort | tail -1` returns `00425`. Copy that body verbatim and add one key to the main `jsonb_build_object` (alongside `'rates'`, before `'signatures'`):

```sql
    'parts', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', ap.id, 'position', ap.position,
      'kind', ap.kind, 'variant', ap.variant,
      'partKey', ap.part_key, 'title', ap.title,
      'payload', ap.payload, 'required', ap.required
    ) ORDER BY ap.position, ap.id)
      FROM public.proposal_agreement_parts ap
      WHERE ap.proposal_id = p_proposal_id AND ap.client_visible), '[]'::jsonb),
```

Enumerated keys, not `to_jsonb` — this is the client edge, and the same discipline the signature projection keeps at `00425:1313-1338` (raw metadata never crosses it). `source_template_key`, `source_part_id`, `client_visible` and the timestamps stay behind. Key present and `[]` on every document, so the client adapter never branches on absence.

The `'legacy'` early-return at `00425:1255-1272` is untouched — a retired document has no parts.

### 3.11 · Grants regeneration

This migration adds GRANT/REVOKE, so: `python3 scripts/generate-legacy-grants.py`, commit the regenerated `supabase/seed/00-legacy-grants.sql`. Never hand-edit it.

### 3.12 · Types regeneration

Public-schema change ⇒ `pnpm db:generate` then `git diff --exit-code packages/supabase/src/database.types.ts` must be **clean after** the regen is committed. Two new tables plus two nullability flips will appear.

### 3.13 · The pinned-hash contract test to re-pin

`supabase/tests/edge_api/public_sd_hardening_contract_test.sql`.

The pinned universe is two temp tables: `_00511_expected_public` (`:1596`) and `_00511_expected_dependency` (`:1855`). Of everything W1 redefines, **exactly one entry is pinned**:

| Signature | Table / line | Action |
|---|---|---|
| `public._countersign_design_services_agreement_impl(uuid,text,jsonb)` | `_00511_expected_dependency`, `:1894`; current `body_sha256` `430d3a45b0f3a3cc35b85160e244c045c2500e91dd952297eb8ef44ea854a770` | **Re-pin `body_sha256`.** Nothing else moves: same signature, same `arguments` string, same `result_type`, same `proconfig`, still `SECURITY DEFINER`, no new lock (the edit is one `IS NULL` disjunct inside an existing `IF`), so the ACL contract (`:2223-2232`), the caller contract (`:2248-2270`) and the authority-lock-order contract (`:2465-2475`) all still hold unchanged. Add a lineage comment above the entry in the 00566 precedent's style, naming 00575 and the previous hash. |

Not pinned, therefore no re-pin needed (confirmed by `grep -oE "'(public\|app_private)\.[a-z_0-9]+\(" ` over `:1596-2140`): `send_commercial_document`, `_commercial_document_fingerprint`, `guard_commercial_authored_child`, `upsert_design_services_draft`, `_sign_design_services_agreement_authorized`, `_issue_design_services_agreement_on_paper`, `get_project_authority_summary`, `get_client_commercial_document_bundle`. `sign_design_services_agreement_with_trusted_ip` **is** pinned (`_00511_expected_public`) and is **not** redefined — verify at review that no edit reached it.

Obtain the new hash the way 00566 did — apply locally, then:
```sql
SELECT encode(extensions.digest(convert_to(prosrc,'UTF8'),'sha256'),'hex')
FROM pg_proc WHERE oid = to_regprocedure(
  'public._countersign_design_services_agreement_impl(uuid,text,jsonb)');
```

---

## 4 · Designer portal design

### 4.1 · Component tree

```
components/document/rooms/drafting/
  service-agreement-drafting-room.tsx        (modified — flag branch only)
  agreement/
    agreement-composer.tsx                   AgreementComposer
      ├── <header>                           title · client picker · Preview · Save  (copied from the
      │                                       existing room's header, :281-345, verbatim strings)
      ├── <PartsRail parts … />              left column
      │     └── PartRow ×N                   drag handle · kind glyph · title · required dot
      │           └── PartRowMenu            Remove · Rename · Move up · Move down
      │     └── AddPartMenu                  "+ Add a part" → Clause · List · Schedule ▸ (7 W1 variants)
      ├── <PartEditor part … />              centre — dispatch on kind, then variant
      │     ├── ClauseEditor                 one <Textarea>
      │     ├── ListEditor                   ordered rows: text · note · "optional" toggle · remove · add
      │     ├── RateCardEditor               role rows (lifted from the room's :409-462 facet, incl. "+ Add a role")
      │     ├── CeilingEditor                amount · "No ceiling — this agreement does not bill time" checkbox
      │     ├── RetainerEditor               amount · credit-rule chips · activation <Select> (:563-576)
      │     ├── CadenceEditor                <Select> monthly | biweekly | milestone (:586-599)
      │     ├── DepositEditor                DEPOSIT_CHIPS [0,25,50,100] + other (:485, :507)
      │     └── UnsupportedPartCard          any other kind/variant — read-only, "This part opens in a later release"
      └── <ReadinessPanel readiness … />     right column — "N of M parts need attention", required only
    parts-rail.tsx · part-editor.tsx · add-part-menu.tsx · part-kinds.ts · readiness.ts
components/document/commercial/
  agreement-parts-body.tsx                   (new) the designer-side part renderer
  service-agreement-preview.tsx              (modified) optional `parts` prop
```

**Reorder**: `@dnd-kit/core` `^6.3.1` + `@dnd-kit/sortable` `^10.0.0` are already designer-portal dependencies (`apps/designer-portal/package.json:27-29`) and are on the Jest `transformIgnorePatterns` allow-list. Use `SortableContext` with `verticalListSortingStrategy` **and** dnd-kit's `KeyboardSensor` — that gives the drag handle M1 draws plus a keyboard path with no extra code. The overflow menu's `Move up` / `Move down` are kept as the non-pointer, non-keyboard-sensor fallback and are what the jest tests drive (dnd-kit drag is not reliably testable in jsdom; the e2e spec covers the pointer path).

**Persistence**: reorder / rename / add / remove mutate local state and set `dirty`; **one** `useSaveAgreementParts` call writes the whole ordered array — the RPC replaces wholesale, so there is no per-row write and no partial state. The Save button reuses the room's exact `{dirty ? "Save agreement" : "Saved"}` labels.

Right rail keeps the live client preview (`ServiceAgreementPreview`, now fed `parts`) exactly as the seven-facet room does at `:617-630`.

### 4.2 · Kinds the W1 UI must survive

| Kind / variant | Add menu offers it | Editor | Renderer (preview + client) |
|---|---|---|---|
| `clause` | yes | ClauseEditor | heading + `whitespace-pre-wrap` body |
| `list` | yes | ListEditor | heading + `— item` rows; `note` as a muted second line; `optional` items get an "(optional)" suffix |
| `schedule` / `rate_card` `ceiling` `retainer` `cadence` `procurement` | yes (5) | per-variant | per §4.5 |
| `schedule` / `flat` `per_phase` | yes (2, record-only chip) | FlatEditor, PerPhaseEditor (amount / phase rows) | amount line(s); **no projection in W1** |
| `schedule` / the other 8 variants | **no** | UnsupportedPartCard | "recorded" line with the title only |
| `phases` | no | UnsupportedPartCard | title only |
| `attachment` | **no** | UnsupportedPartCard | **must render as a separate leaf** — a rule, not a section: own `<hr>`, own eyebrow `ATTACHMENT · {title}`, body below (§5.3). W1 produces none, the renderer handles it. |
| `attestation` | **no** | UnsupportedPartCard | **never rendered to the client** — `client_visible` defaults false when the row is written in W3; the renderer skips the kind defensively |

`UnsupportedPartCard` never shows raw JSON. It shows the part's title, its kind/variant as a mono chip, and one sentence. An unknown kind must never throw.

### 4.3 · The flag branch inside the existing room

In `ServiceAgreementDraftingRoom` (`service-agreement-drafting-room.tsx:74`), **above every early return** (a conditional return reorders hooks and breaks hydration):

```tsx
const bundle = useCommercialDocument(proposalId);
const { value: partsOn, isLoading: flagLoading } = useFeatureFlag("agreement-parts");

if (bundle.isLoading || flagLoading) {
  return <AgreementGate message="Opening the design agreement…" />;
}
```

The loading branch reuses the **existing** component and the **existing** message string verbatim — the only observable delta for a flag-off user is that the same gate may hold one extra frame. Then, after the existing error branch:

```tsx
if (partsOn) {
  return <AgreementComposer key={…} proposal={proposal} document={bundle.data.document} … />;
}
return <ServiceAgreementEditor … />;   // the existing call, byte-identical
```

Fail-closed: `useFeatureFlag` defaults `{ value: false, isLoading: true }`, so the composer can never flash to a non-pilot user. Local dev: `NEXT_PUBLIC_FLAG_OVERRIDES=agreement-parts:true` (inlined at dev-server start — restart required).

`AgreementComposer` calls `useMaterializeStandardParts` **once**, on mount, when `parts.length === 0 && document.state === 'draft'`. Guard it with a ref so React 18 StrictMode's double-effect does not fire twice; the RPC is idempotent anyway (§3.7 step 2).

### 4.4 · `assessAgreementReadiness` — the R4 floor

`apps/designer-portal/src/components/document/rooms/drafting/agreement/readiness.ts`:

```ts
export function assessAgreementReadiness(input: {
  document: CommercialDocument;
  parts: AgreementPart[];
  recipientEmail: string | null | undefined;
}): AgreementReadiness   // { ready, blockers: {partId|null, message}[], notes: string[] }
```

`ServiceAgreementReadiness`'s existing `{ready, blockers: string[], notes: string[]}` stays for flag-off. The parts version returns blockers carrying an optional `partId` so the rail can dot the offending row.

| # | Rule | Blocker string | Source |
|---|---|---|---|
| R-1 | `document.kind` is `design_services` or `service_addendum` | `Only a design services agreement or addendum can use this send review.` | unchanged from `:180-182` |
| R-2 | `document.state === 'draft'` | `Only a draft agreement can be sent.` | unchanged from `:185` |
| R-3 | a client with an email is linked | `Link a client with an email address.` | unchanged from `:250`; excluded from the "N parts need attention" count exactly as today (`:192-195`) |
| R-4 | **every part with `required: true` is non-empty for its kind** — clause: `payload.body.trim()`; list: ≥1 item with non-blank `text`; schedule: its variant's typed validity below | `Write {title}.` / `Add at least one item to {title}.` / `Complete {title}.` | R4 "required is per part" |
| R-5 | **class floor** — at least one part whose `variant` is in `AUTHORITY_VARIANTS` **and** whose typed value is set | `This agreement names no fee. Add a rate card, a flat fee, or a per-phase fee.` | R4 "one typed money part for a class that bills" |
| R-6 | **a `rate_card` part with ≥1 valid role ⇒ a `ceiling` part with `cents !== null && cents > 0`** | `An agreement that bills hourly needs a ceiling. Add a Ceiling part, or remove the role rates.` | R4, and the DB floor at §3.7 step 5 |
| R-7 | a `rate_card` part present ⇒ ≥1 role with a non-blank name and `hourlyRateCents > 0` | `Add at least one role with an hourly rate.` | replaces `:204`, now conditional |
| R-8 | a `retainer` part present ⇒ `Number.isFinite(cents) && cents >= 0` and an activation policy chosen | `Set a valid retainer amount, including zero when none is due.` / `Choose when the agreement becomes active.` | replaces `:218-223`, now conditional |
| R-9 | a `cadence` part present ⇒ a cadence chosen | `Choose a billing cadence.` | replaces `:244`, now conditional |
| R-10 | a `procurement`/deposit part present with a value ⇒ `0 ≤ depositPercent ≤ 100`; present with `null` ⇒ **note**, never a blocker | `Set the furnishings deposit percent, including zero when none is due.` / note `No furnishings deposit set — authorizations will default to 50%.` | preserves the soft behavior at `:234-243` |
| R-11 | **no duplicate `partKey`** | `Two parts share the key {key}. Rename one.` | the DB `UNIQUE (proposal_id, part_key)` would 23505 at save; catch it first |
| R-12 | every part has a non-blank `title` | `Name this part.` | table CHECK |

**Not blockers any more** (this is P0's "the ceiling blocker becomes conditional"): deliverables and exclusions. Both parts are removable (R4 names Exclusions explicitly). A present-but-empty `patina.deliverables` part that is `required: false` produces **nothing** — not a blocker, not a note. The counter reads `` `${needAttention} of ${parts.length} parts need attention` `` (M1's wording), not "N of 7 facets".

**"Not yet set" never renders on a sendable document** (P0): today the preview prints `Not yet set` for a zero ceiling / zero retainer (`service-agreement-preview.tsx:59-67`, mirrored in the client body). Under parts, an unset ceiling is an **absent part**, which renders nothing at all. The `Not yet set` italic branch survives only for the flag-off path and for the one case that can still reach it — a `ceiling` part present with `cents === null` on a **draft** preview, where the readiness panel is already blocking the send if a rate card exists. Assert this in the preview test.

### 4.5 · Preview rendering from parts

`service-agreement-preview.tsx` gains `parts?: AgreementPart[]`. When `parts && parts.length > 0`:

- **Keep** the header block (`:71-88`) and the signature block (`:211-244`) — the Core. Unchanged.
- **Replace** the seven fixed `<section>`s with `<AgreementPartsBody parts={parts} currency={terms.currency} />`, which maps `parts` in `position` order.
- **Skip** parts with `clientVisible === false`.

`agreement-parts-body.tsx` render spec — the same table the client lane implements (§5.2), so the two surfaces cannot drift by accident:

| kind / variant | Eyebrow / heading | Body |
|---|---|---|
| `clause` | part `title` | `whitespace-pre-wrap` paragraph of `payload.body` |
| `list` | part `title` | `— {text}` rows; `note` on a muted second line; `optional: true` appends ` (optional)` |
| `schedule`/`rate_card` | part `title` | role rows `{roleName}` / `{money(hourlyRateCents)} / hr`, `sortOrder` order |
| `schedule`/`ceiling` | part `title` | one figure; when `cents === null`, the sentence `No ceiling — professional time is billed as it is worked.` |
| `schedule`/`retainer` | part `title` | figure + the existing activation sentences (`:238-241` of the client shell, verbatim) |
| `schedule`/`cadence` | part `title` | capitalized cadence + `Additional work requires written authorization before it can be invoiced.` (verbatim from the client shell) |
| `schedule`/`procurement` | part `title` | `{depositPercent}% deposit` line; other fields when present |
| `schedule`/`flat`, `per_phase` | part `title` | figure, or per-phase rows |
| `attachment` | its **own leaf** — `<hr>` + mono eyebrow `ATTACHMENT · {title}` | body, then, when `acknowledgeRequired`, the line `I received this` (W1 renders it; nothing records it — that is W2/P6) |
| `attestation` | — | not rendered |
| unknown | part `title` | one muted line, never raw JSON |

The trailing "This agreement authorizes design services only…" notice (`commercial-document-shell.tsx:262`, and its designer twin) stays **outside** the parts body, unconditional.

### 4.6 · P0 — the DTO collapse

**Delete from `apps/designer-portal/src/lib/document/commercial-documents.ts`** (all currently redeclared at `:11-33`, `:49-79`):

| Symbol | Line today | Replacement |
|---|---|---|
| `COMMERCIAL_DOCUMENT_KINDS` (value) | `:11-16` | `export { COMMERCIAL_DOCUMENT_KINDS } from "@patina/types";` |
| `CommercialDocumentKind` | `:18` | `export type { CommercialDocumentKind } from "@patina/types";` |
| `COMMERCIAL_STATES` (value) | `:20-28` | `export { COMMERCIAL_STATES } from "@patina/types";` |
| `CommercialState` | `:30` | `export type { CommercialState } from "@patina/types";` |
| `RetainerActivationPolicy` | `:31` | re-export |
| `BillingCadence` | `:32` | re-export |
| `ServiceAgreementTerms` (interface) | `:48-70` | `export type ServiceAgreementTerms = DesignServiceTerms;` — an alias, never a second declaration |
| `ServiceRate` (interface) | `:71-79` | `export type ServiceRate = DesignServiceRate;` |

**Move into `packages/types/src/commercial.ts`** (backend lane) — `DesignServiceTerms` absorbs the two drifted fields plus the W1 nullability, `DesignServiceRate` absorbs the nullable timestamp:

```ts
export interface DesignServiceTerms {
  proposalId: string;
  scope: string;
  deliverables: string[];
  exclusions: string[];
  /** NULL = uncapped. Legal only when the agreement carries no rate_card
   *  part (00575 `_agreement_requires_rate_card`); the seven-facet room
   *  never writes null. */
  billingCeilingCents: number | null;
  retainerAmountCents: number;
  retainerActivationPolicy: RetainerActivationPolicy;
  billingCadence: BillingCadence;
  currency: string;
  terms: string;
  currentRateVersion: number;
  updatedAt: string | null;
  /** R8 — carry the 6-line comment from
   *  apps/designer-portal/src/lib/document/commercial-documents.ts:63-68
   *  here verbatim; it is the reason this field is nullable. */
  furnishingsDepositPercent: number | null;
}

export interface DesignServiceRate {
  id: string; proposalId: string; version: number;
  roleName: string; hourlyRateCents: number;
  effectiveAt: string | null;
}
```

`ProjectBillingAuthority.ceilingCents` and `.remainingCents` widen to `number | null` (F-2). Grep every reader and make it explicit — `ceilingCents ?? null` rendered as "No ceiling", never as `$0`.

**Behavior-preservation checks the implementer must run and pin** (widening `COMMERCIAL_DOCUMENT_KINDS` adds `'trade_scope'`, which the designer app's list omitted):

1. `asCommercialDocumentKind` (`:451-457`) is the only runtime consumer of the array. It previously coerced `'trade_scope'` → `'legacy'`; it now returns `'trade_scope'`.
2. `commercialDocumentExperience` (`:140-155`) routes `'trade_scope'` through its `default:` to `'legacy'` — the same answer as before. **Add a jest case pinning `commercialDocumentExperience('trade_scope') === 'legacy'`.**
3. `grep -rn "\.kind ===\|switch (.*kind)\|documentKind ===" apps/designer-portal/src` and confirm no other branch changes answer for a `trade_scope` document. Report the list in the lane's report-back.

**Client portal** (`client` lane) owns `apps/client-portal/src/lib/commercial-documents.ts:48-51` (`CommercialRate = Pick<DesignServiceRate, …>`, now `effectiveAt: string | null`) and its local `DesignServicesTerms` (`billingCeilingCents: number | null`).

`@patina/types` is dist-resolved — after the T0 commit lands, `pnpm turbo build --filter=@patina/types`, then `pnpm --filter @patina/admin-portal build` (the repo's strictest gate; a shared-package type break passes the designer build and fails admin's).

### 4.7 · The Account → Studio "Agreement defaults" card

Home: `apps/designer-portal/src/components/document/account/account-studio-page.tsx`, a new `<div className="mb-6 border-t border-[var(--color-pearl)] pt-5">` block placed **immediately after** the Billing block (`:809-885` today). **Do not restyle, reorder, or re-indent Billing** — contract §3.

Copy the Billing card's four mechanics, cited so the implementer can diff them:

| Mechanic | Billing's line | Agreement defaults' equivalent |
|---|---|---|
| local form state | `const [billing, setBilling] = useState({…})` — `:202` | `const [agreementDefaults, setAgreementDefaults] = useState({ rateCard: [], depositPercent: '', cadence: 'monthly', retainerCreditRule: 'credited', defaultExclusions: '' })` |
| seed effect keyed on the settings row's own id | `:204-211`, dep array `[billingSettings?.studio_id]` | same shape, dep `[agreementDefaults Query.data?.studioId]`; the comment about "don't clobber an in-progress edit on a background refetch" carries over |
| save handler that re-seeds from what was **persisted** | `handleSaveBilling` `:324-346` | `handleSaveAgreementDefaults`; re-seed from the mutation's returned row (Billing's own comment at `:333-339` explains why) |
| dirty predicate driving the disabled button | `billingDirty` `:475-480`, consumed at `:880-882` | `agreementDefaultsDirty`, same comparison-against-the-query-row shape |
| action group | `DocumentActionGroup surfaceKey="account" regionKey="studio-billing"` `:871-890` | `regionKey="studio-agreement-defaults"`, `actionKey="save-studio-agreement-defaults"`, label `Save agreement defaults` |
| permission gate | `canManage` (`:214-215`, `owner`/`admin`) | same `canManage` — R3. Non-managers see the read-only `<dl>` treatment the Identity block uses. |

Fields (M4's DEFAULTS strip): **Rate card** (role rows: name + hourly rate + add/remove, the same control shape as the room's role rates), **Furnishings deposit %** (`DEPOSIT_CHIPS` + other), **Billing cadence** (`<Select>`, three options), **Retainer credit rule** (chips `Credited · Non-refundable · Replenishing`, with help text: "Stored now; it starts appearing on new agreements in a later release."), **Default exclusions** (newline-split `<textarea>`, split-on-save into the jsonb array — the same split the room uses at `:399`).

Card help copy (R7 vocabulary): *"What a new agreement starts from. Every member composes from these; owners and admins change them."*

---

## 5 · Client portal design

Per `patina-portal-features`: the client portal is one page, no new routes, no nav. W1 adds **no route and no flag** — the client surface changes only in that `DesignServicesBody` learns a branch.

### 5.1 · Bundle consumption

`apps/client-portal/src/lib/commercial-documents.ts` — the adapter that builds `CommercialDocumentBundle` (`:181-188`, mapper at `:495-560`) gains:

```ts
export interface CommercialAgreementPart {
  id: string; position: number;
  kind: string; variant: string | null;
  partKey: string; title: string;
  payload: Record<string, unknown>;
  required: boolean;
}
// on CommercialDocumentBundle:
parts: CommercialAgreementPart[];
```

Adapted with the file's existing defensive helpers (`record`, `first`, `text`, `number`) — never a raw cast. Absent, non-array, or malformed ⇒ `[]`. Rows missing `id`/`kind`/`title` are dropped, exactly as the signature adapter drops incomplete rows (`:539-542`). Sort by `position` client-side as a belt (the RPC already orders).

### 5.2 · `DesignServicesBody` branch

`apps/client-portal/src/components/commercial-document-shell.tsx:179`:

```tsx
function DesignServicesBody({ bundle }: { bundle: CommercialDocumentBundle }) {
  const terms = bundle.serviceTerms;
  if (!terms) return null;
  if (bundle.parts.length > 0) {
    return <AgreementPartsBody parts={bundle.parts} currency={terms.currency} />;
  }
  // …today's body, unchanged from :183 to :262…
}
```

`bundle.parts.length === 0` is the only path any document can take today and any flag-off document can take tomorrow, so the existing body is reached byte-identically. Nothing above the branch moves. `SignatureLedger` (`:169`) and the footer (`:171-174`) stay outside the branch and are shared by both.

`apps/client-portal/src/components/agreement-parts-body.tsx` implements the **same spec table as §4.5**, in the client register (`type-section-head`, `type-body`, `type-body-small`, `type-meta`, `type-data-large`, `money()` from the shell's own helper). It also carries the closing "This agreement authorizes design services only…" notice (`:262`) so that sentence appears exactly once on either path.

### 5.3 · Attachments — the leaf the renderer must handle

W1 produces **no** `attachment` parts (the rail cannot add them, `materialize_standard_parts` seeds none). The renderer implements the kind anyway, because a W2 template will emit one and because a half-implemented leaf is how the two surfaces drift:

- Rendered **after** every non-attachment part, in `position` order among themselves.
- Its own rule (`<hr className="…border-t…">`), its own mono eyebrow `ATTACHMENT {letter} · {title}` (letter = A, B, … by order), body below.
- `acknowledgeRequired: true` renders the static line `I received this` — **display only in W1**. It is not a control, it is not sent, and nothing is recorded. W2/P6 turns it into a real acknowledgment stored in signature metadata.
- `attestation` parts are never rendered.

### 5.4 · The sign route — explicitly unchanged in W1

`apps/client-portal/src/app/api/proposals/[id]/sign/route.ts` is **not modified**. Concretely:

- The design-services branch still calls `sign_design_services_agreement_with_trusted_ip` with the same four arguments (`route.ts:229-243`). No new jsonb argument, no consent sentence, no attachment acknowledgments — **the composed consent is Wave 2 (P6, D-4)**.
- `consent-copy.ts` is untouched, so `__tests__/consent-copy.test.ts` — which reads the live route off disk at `:27` and pins every branch and refusal token — keeps passing without an edit. Any W1 change here would break it by design.
- `sign_design_services_agreement_with_trusted_ip` keeps its pinned body hash (§3.13).
- The refusal that *does* relax lives one level down, in `_sign_design_services_agreement_authorized` (`00412:815-820`), which the route never names.

Record this in the client lane's report-back as a deliberate non-change, not an omission.

---

## 6 · Tests

### 6.1 · SQL — `supabase/tests/commercial/agreement_parts_test.sql`

Plain psql, `ON_ERROR_STOP=1`, one `BEGIN … ROLLBACK`, `pg_temp.assume_user()` helper copied from `design_services_authority_test.sql:12-19`. Fixture: one studio, two co-members, one outsider, one client, one draft `design_services` proposal.

| # | Assertion | Expect |
|---|---|---|
| 1 | `materialize_standard_parts` on a draft with a terms row → 9 rows, positions 1..9, `part_key`s in `PATINA_STANDARD_AGREEMENT_PARTS` order | 9 |
| 2 | `materialize_standard_parts` called twice → still 9 rows, second call returns `materialized = false` | idempotent |
| 3 | **Fingerprint conditionality (F-1)**: capture `_commercial_document_fingerprint` before any part exists; delete all parts; recompute → **identical to the pre-migration-shape digest** (assert equal to the captured value) | equal |
| 4 | **Fingerprint coverage**: with parts present, capture; `UPDATE` one part's `payload`; recompute | different |
| 5 | Same, for `title`, for `position` (swap two), for `client_visible`, for adding a part, for deleting a part | different, 5× |
| 6 | Fingerprint is **stable** across a `created_at`/`updated_at` touch alone | equal |
| 7 | **Guard freezes parts at send**: `send_commercial_document` the draft, then `INSERT` / `UPDATE` / `DELETE` a part | 3× `check_violation`, message `proposal_agreement_parts is immutable after its proposal leaves draft` |
| 8 | Same three ops **while draft** | all succeed |
| 9 | **NULL ceiling accepted only without a rate_card**: `upsert_agreement_parts` with a rate_card part carrying a role and **no** ceiling part | `check_violation`, `an agreement that bills time needs a ceiling` |
| 10 | `upsert_agreement_parts` with **no** rate_card part and no ceiling part → `proposal_service_terms.billing_ceiling_cents IS NULL` | NULL |
| 11 | That proposal sends successfully (refusal A relaxed) | no exception |
| 12 | A proposal with **zero** parts rows and zero rate rows still **refuses** to send (legacy contract preserved) | `check_violation` |
| 13 | **RLS co-member**: as the second studio member, `SELECT` and `UPDATE` a part | both succeed |
| 14 | **RLS non-member**: as the outsider, `SELECT` → 0 rows; `INSERT` → `42501`; `UPDATE`/`DELETE` → 0 rows affected | leak-free |
| 15 | **RLS client**: as the client user, `SELECT` from `proposal_agreement_parts` → 0 rows | 0 |
| 16 | As the client, `get_client_commercial_document_bundle` on the sent doc → `parts` is an array of the `client_visible` rows only; a `client_visible = false` part is absent; `sourceTemplateKey` key absent | filtered |
| 17 | `studio_agreement_defaults`: member reads; admin/owner writes; a plain member's `UPDATE` affects 0 rows; an outsider reads 0 rows | 4 asserts |
| 18 | **Countersign with a NULL ceiling** (F-2): sign + countersign a no-rate-card agreement → `project_billing_authorities` row exists with `billing_ceiling_cents IS NULL`, `status = 'active'` | no `23502` |
| 19 | `get_project_authority_summary` on that authority → `state` is not `'exhausted'`, `remainingCents` is `null`, `ceilingCents` is `null` | NULL-safe |
| 20 | **Countersign still works for a document client-signed before parts existed** — sign, then materialize is impossible (not draft), countersign | succeeds; the F-1 regression test |

### 6.2 · SQL — `supabase/tests/commercial/agreement_parts_projection_test.sql`

**Projection parity — the one that proves the projection was not forked.**

| # | Assertion |
|---|---|
| 1 | Build proposal **A**: call `upsert_design_services_draft` with a fully-populated `p_terms`/`p_rates` (scope, 3 deliverables, 2 exclusions, ceiling 2 400 000, retainer 500 000 / `retainer_paid`, cadence `biweekly`, deposit 50, terms prose, 3 roles). |
| 2 | Build proposal **B** (same studio/client shape): call `upsert_agreement_parts` with the nine standard parts encoding **the same values**. |
| 3 | `ASSERT (SELECT to_jsonb(t) - 'proposal_id' - 'created_at' - 'updated_at' FROM proposal_service_terms t WHERE proposal_id = A) = (same for B)` |
| 4 | `ASSERT (SELECT jsonb_agg(to_jsonb(r) - 'id' - 'proposal_id' - 'created_at' - 'effective_at' ORDER BY version, sort_order, role_name) FROM proposal_service_rates r WHERE proposal_id = A) = (same for B)` |
| 5 | Re-run `upsert_agreement_parts` on B with one part removed (`patina.exclusions`) → `exclusions` is `'[]'::jsonb`, **not** the previous value (a removed part is absent, not sticky) |
| 6 | **AMENDED BY R20.** Re-run with a **custom-keyed** part of a money SHAPE (`schedule`/`ceiling`, `part_key = 'custom.<uuid>'`, a `cents` payload) → the terms row **takes it**: money reads kind + variant under any key. *(Original: "the terms row is unchanged (R5: only the nine standard keys project)".)* R5 is proved by its companion instead: a **clause** keyed `patina.ceiling` naming cents writes nothing. |
| 7 | **AMENDED BY R20.** Re-run with a **second** `schedule`/`ceiling` part under a custom key → the save is REFUSED with `an agreement carries only one ceiling` (check_violation), so the money row is never choosing between two ceilings. *(Original: "still no projection from it; the `patina.ceiling` value stands".)* The Add menu no longer offers the duplicate and readiness reports one that arrives by any other road (R18). |

### 6.3 · Jest — designer

`…/agreement/__tests__/readiness.test.ts` — one case per row:

| Case | Parts | Expect |
|---|---|---|
| happy nine | all nine, populated | `ready: true`, `blockers: []` |
| exclusions removed | eight, no `patina.exclusions` | `ready: true` |
| deliverables removed | eight, no `patina.deliverables` | `ready: true` |
| required clause blank | `patina.terms` with `body: '   '` | blocker `Write Terms.`, `partId` set |
| required list empty | a `required` list with `items: []` | blocker `Add at least one item to …` |
| no money part at all | services + terms only | R-5 blocker |
| rate card, no ceiling | role_rates populated, no ceiling part | R-6 blocker |
| rate card, ceiling `cents: null` | both present | R-6 blocker |
| rate card, ceiling `cents: 0` | both present | R-6 blocker |
| ceiling only, no rate card | ceiling `cents: 2_400_000` | `ready: true` — the uncapped-flat case |
| flat fee only | `schedule`/`flat`, `cents: 1_100_000` | `ready: true` (R-5 satisfied by an `AUTHORITY_VARIANTS` member) |
| rate card with a blank role name | one role, `roleName: ''` | R-7 blocker |
| retainer `cents: -1` | | R-8 blocker |
| retainer present, no activation policy | | R-8 blocker |
| deposit `null` | | **note**, not blocker |
| deposit `150` | | R-10 blocker |
| duplicate `partKey` | two `patina.ceiling` | R-11 blocker |
| blank title | | R-12 blocker |
| no client email | otherwise ready | R-3 blocker, and it is **excluded** from the attention count |
| state `sent` | | R-2 blocker |

`…/agreement/__tests__/agreement-composer.test.tsx` — materialize fires once on an empty draft (StrictMode double-mount does not double-call); add/remove/rename/move-up/move-down mutate the list and set dirty; Save calls `useSaveAgreementParts` once with the full ordered array; an unknown kind renders `UnsupportedPartCard` and does not throw.

`…/agreement/__tests__/parts-rail.test.tsx` — order after `Move up` on row 3; `Remove` on a `required` part is offered but the readiness panel then blocks (removal is allowed; readiness is what refuses).

**Flag-off snapshot**, in the existing `service-agreement-drafting-room.test.tsx`: add a case mocking `@/hooks/use-feature-flag` → `{ value: false, isLoading: false }` and assert the rendered tree matches a committed snapshot generated **on `main` before any W1 edit**. Generate it first, commit it, then edit the room — a snapshot written after the change proves nothing. (`@/hooks/use-feature-flag` is a relative-resolving `@/` alias that **is** mirrored in `jest.config.js` `moduleNameMapper`, so `jest.mock` fires; the Trap-1 gap is `@patina/help-system` only.)

`…/account/__tests__/agreement-defaults-card.test.tsx` — seeds from the query row; dirty predicate flips on each field; Save disabled when clean; non-manager sees the read-only shape and no Save.

### 6.4 · Jest — client

`apps/client-portal/src/lib/commercial-documents.test.ts` — `parts` absent → `[]`; non-array → `[]`; a row missing `title` is dropped; ordering by `position`.

`apps/client-portal/src/components/__tests__/commercial-document-shell.test.tsx` — **flag-off snapshot**: a bundle with `parts: []` renders a tree matching a snapshot generated on `main` before the edit. Plus: a bundle with nine parts renders them in order; an `attachment` part renders as a leaf with its own eyebrow; an `attestation` part renders nothing; an unknown kind renders the muted line.

⚠ `client-portal` enforces a coverage floor (lines 70 / branches 60 / functions 70 / statements 70). `agreement-parts-body.tsx` is a new file with many branches — it must ship with the tests above in the same change or the whole suite fails.

### 6.5 · Jest — `@patina/supabase` (vitest)

`use-agreement-parts.test.ts` — the query orders by `position`; `useSaveAgreementParts` calls `rpc('upsert_agreement_parts')` with `{p_proposal_id, p_parts}` and invalidates all three keys. `use-studio-agreement-defaults.test.ts` — an absent row resolves to the defaults object, mirroring `use-invoices.test.ts`'s style.

### 6.6 · E2E

**Designer** — `apps/designer-portal/e2e/agreement/agreement-parts.spec.ts`, chromium-pinned (`test.skip(({browserName}) => browserName !== 'chromium', 'single seeded designer; the three browser projects race the same proposal row')`). Add `agreement-parts:true` to `playwright.config.ts` `webServer.env.NEXT_PUBLIC_FLAG_OVERRIDES` (that pinned value beats `.env.local` and only reaches the server Playwright starts — a reused dev server without it serves the flag off). Steps: open a draft Contract Room → assert nine rail rows → remove Exclusions → assert eight → add a Clause → rename it → move it up → Save → `expect.poll(() => queryDb(count parts))` via `e2e/helpers/supabase-admin.ts` returns 9. No `page.waitForTimeout` (nothing lints it — grep before calling the spec done).

**Client** — `apps/client-portal/tests/threshold.spec.ts` gains one assertion on an agreement whose bundle carries parts: the part titles appear in `position` order. Chromium-only config; `--workers=1`.

---

## 7 · Gates

Run the **narrowest** command first and read its output, not its exit code. Root `pnpm test` / `type-check` silently skip workspaces without the script.

### Lane `backend`

```bash
export SUPABASE_DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"

pnpm supabase:reset                                   # full replay + the 15 seeded SQL paths
python3 /Users/kody/Code/patina-merged/scripts/generate-legacy-grants.py
pnpm supabase:reset                                   # again, with the regenerated ACL seed

psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/commercial/agreement_parts_test.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/commercial/agreement_parts_projection_test.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/commercial/design_services_authority_test.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/commercial/design_services_gap_hardening_test.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/commercial/multi_studio_signature_test.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/commercial/authorized_schedule_test.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/commercial/executed_on_paper_test.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/commercial/design_services_paper_issue_test.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/commercial/trade_scope_test.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/schedule/ceremony_hardening_test.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/edge_api/public_sd_hardening_contract_test.sql

pnpm db:generate
git diff --exit-code packages/supabase/src/database.types.ts   # must be clean AFTER the regen is staged

pnpm --filter @patina/types type-check
pnpm turbo build --filter=@patina/types                        # dist-resolved — required
pnpm --filter @patina/supabase type-check
pnpm --filter @patina/supabase test
```

`trade_scope_test.sql` and `executed_on_paper_test.sql` are in the list because the fingerprint and the bundle are shared with those rails — the conditional `parts` key must leave both untouched.

### Lane `designer`

```bash
pnpm turbo build --filter=@patina/types                        # after pulling the T0 commit
pnpm --filter @patina/designer-portal type-check               # THE gate — build does not check types
pnpm --filter @patina/designer-portal lint                     # the one working ESLint config in the repo
pnpm --filter @patina/designer-portal test -- src/components/document/rooms/drafting/agreement
pnpm --filter @patina/designer-portal test -- src/components/document/rooms/drafting/service-agreement-drafting-room.test.tsx
pnpm --filter @patina/designer-portal test -- src/components/document/account
# THE merge gate (memory lesson, Field Companion W3+W4): full jest on a CLEAN checkout
git -C <fresh-clone> ... && pnpm --dir <fresh-clone> --filter @patina/designer-portal test
NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live pnpm dev:minimal    # QA with the mock fallback OFF
pnpm --filter @patina/designer-portal test:e2e -- e2e/agreement/agreement-parts.spec.ts --project=chromium
```

### Lane `client`

```bash
pnpm turbo build --filter=@patina/types
pnpm --filter @patina/client-portal type-check                 # THE gate — build does not check types
pnpm --filter @patina/client-portal test                       # coverage floor 70/60/70/70 is enforced
pnpm --filter @patina/client-portal test -- src/components/threshold/__tests__/consent-copy.test.ts
pnpm --filter @patina/client-portal test:e2e -- tests/threshold.spec.ts --workers=1
```

### Integration (after all three merge, before deploy)

```bash
pnpm turbo build --filter=@patina/types
pnpm --filter @patina/admin-portal build      # the repo's STRICTEST gate; catches @patina/types breaks
pnpm --filter @patina/designer-portal type-check
pnpm --filter @patina/client-portal type-check
pnpm --filter @patina/manufacturer-portal type-check
pnpm --filter @patina/designer-portal test    # full, clean checkout
pnpm --filter @patina/client-portal test
pnpm supabase:reset && <the 11 psql suites above>
git diff --exit-code packages/supabase/src/database.types.ts
git diff --exit-code supabase/seed/00-legacy-grants.sql
```

Do **not** report `pnpm lint` as clean for any package but designer-portal — no other ESLint config in the repo resolves under ESLint 9.

---

## 8 · Review criteria (adversarial reviewer, separate context)

Report **every** finding with confidence and severity. Do not filter by severity.

| # | Attack | What to actually do | Pass looks like |
|---|---|---|---|
| **A. Fingerprint conditionality (F-1)** | Prove a parts-less document's digest is unchanged by 00575 | On a stack at `00574`, capture `_commercial_document_fingerprint` for a seeded design-services proposal. Apply 00575. Recompute. | Byte-identical. If it moved, every `client_signed` document in prod is bricked. |
| **B. Fingerprint coverage** | Find a mutation to a part that the hash misses | Mutate every column of `proposal_agreement_parts` in turn — `position`, `kind`, `variant`, `part_key`, `title`, `payload` (nested keys too), `required`, `client_visible`, `source_template_key`, `source_part_id` — recomputing after each | Every one moves the digest except `created_at`/`updated_at`. `to_jsonb(ap)` should make this automatic; verify, don't assume. |
| **C. Client-visibility mismatch** | Confirm the hash covers non-client-visible parts and the bundle does not | Flip one part to `client_visible = false`; assert the digest changes AND the bundle omits it | Both. F-3 is deliberate; if the implementer hashed only client-visible parts, that is a deviation to report. |
| **D. Guard bypass by direct insert** | As an authenticated studio co-member, `INSERT`/`UPDATE`/`DELETE` straight into `proposal_agreement_parts` (no RPC) on a `sent`, a `client_signed`, and an `executed` proposal | Raw SQL through PostgREST/psql as the member's JWT, not through the RPC | `check_violation` all nine times. The trigger is `BEFORE INSERT OR UPDATE OR DELETE FOR EACH ROW` — confirm the binding exists in `pg_trigger`, not just in the migration text. |
| **E. Guard bypass by cascade** | Delete the proposal; delete the terms row | `ON DELETE CASCADE` from `proposals` should take the parts with it; the guard is `BEFORE DELETE`, so a cascade could raise | Deleting a **draft** proposal cascades cleanly. Deleting a non-draft proposal is already blocked upstream — confirm which error you get and that it is not a new one. |
| **F. RLS leak to a non-member** | As an outsider JWT: `SELECT`, `INSERT`, `UPDATE`, `DELETE` on `proposal_agreement_parts`; as a **client** JWT: the same | Also try the outsider calling `upsert_agreement_parts` and `materialize_standard_parts` directly | 0 rows / `42501` / `insufficient_privilege`. No part title, payload, or key ever reaches a non-member. |
| **G. RLS on studio defaults** | A plain (non-admin) active member `UPDATE`s and `INSERT`s `studio_agreement_defaults` | | 0 rows / `42501`. R3. |
| **H. Projection drift** | Prove the parts path and the seven-facet path write the same row | Run `agreement_parts_projection_test.sql`. Then read `_project_agreement_terms` next to `00422:1747-1794` line by line and confirm the **only** difference is the ceiling's NULL-preserving read | Any other divergence is a fork of the projection and a contract violation. |
| **I. Projection over-reach (R5)** | Make a `clause` or `list` part carry `cents`, `cadence`, `depositPercent` in its payload; make a `custom.*` schedule part carry a ceiling | Save, then read the terms row | Terms row unmoved. Prose never becomes money. |
| **J. Flag-off byte-identity — designer** | `git stash` the W1 branch, generate the room snapshot on `main`, unstash, regenerate | Also: diff the rendered HTML of the flag-off room between `main` and the branch, and confirm the composer's chunk is not in the flag-off served bundle | Identical tree. Confirm the snapshot was generated on `main` first — a snapshot written after the edit proves nothing. |
| **K. Flag-off byte-identity — client** | Same, for `DesignServicesBody` with `parts: []` | | Identical. |
| **L. Readiness false-green** | Try to reach `ready: true` on a document that cannot legally send | Combinations: rate card + ceiling `null`; rate card + ceiling `0`; zero money parts; a `required` clause of whitespace; a duplicate `partKey`; a part whose `title` is spaces; deposit `150`; `document.state = 'sent'` | All blocked. Then push the same payload past the UI straight to `upsert_agreement_parts` and `send_commercial_document` and confirm the **DB** refuses too — readiness is UI, `_agreement_requires_rate_card` and the R4 floor are the real gate. |
| **M. Readiness false-red** | A legitimately flat-fee agreement (no rate card, no ceiling, one `flat` part) | | `ready: true`, sends, signs, countersigns, authority row has `billing_ceiling_cents IS NULL`. |
| **N. NULL ceiling downstream (F-2)** | With a NULL-ceiling authority: run `get_project_authority_summary`; log billable time and run the addendum promotion path; look at every UI that renders `ceilingCents` / `remainingCents` | | Never `'exhausted'`; `remainingCents` is `null` not `0`; the promotion loop authorizes; no UI prints `$0` where it means "uncapped". |
| **O. Pinned-hash honesty** | Confirm `_countersign_design_services_agreement_impl`'s re-pin is a **re-pin, not a loosening** | Read the diff to `public_sd_hardening_contract_test.sql`: only `body_sha256` changed. `arguments`, `result_type`, `final_config`, `security_definer` unchanged; the ACL, caller and lock-order contracts untouched. Confirm `sign_design_services_agreement_with_trusted_ip`'s entry is **not** touched. | Exactly one hex string moved. |
| **P. Head-body grafting** | For each of the eight redefined functions, run `grep -rln "CREATE OR REPLACE FUNCTION[^(]*<name>" supabase/migrations/*.sql \| sort \| tail -1` and diff the new body against that file's body | Especially `_countersign_design_services_agreement_impl` — the 00475/00511 bodies are superseded traps | Every delta is the one named in §3. A silently reverted 00566 studio-resolution fix is the 00199-reverts-00185 failure mode. |
| **Q. Idempotency** | `pnpm supabase:reset` twice; then apply 00575 twice against an already-migrated DB | | Clean both times. |
| **R. Grants** | `git diff supabase/seed/00-legacy-grants.sql` is present and generated, not hand-edited; every new definer function has `REVOKE … FROM PUBLIC, anon` (not `PUBLIC` alone) and an explicit `GRANT` | | All present. |
| **S. DTO collapse behavior** | Grep every `.kind ===` / `switch (kind)` / `documentKind ===` in designer-portal and reason about `'trade_scope'` now that the array widened | | No branch changes answer. The pinned `commercialDocumentExperience('trade_scope') === 'legacy'` test exists. |
| **T. Unknown-kind resilience** | Insert a part with `kind = 'wormhole'`, `variant = 'quantum'`, `payload = {}` (as service_role, bypassing the UI) and open both surfaces | | Neither throws. No raw JSON on screen. |
| **U'. Edge NULL-ceiling** | Fire a `client_signed` / `executed` notification for a NULL-ceiling agreement and read the rendered email | The ceiling figure is **omitted**, never `$0`. `money()` at `commercial-document-notify/core.ts:54-55` should already do this — confirm against a real render, and run `deno test --allow-all --config supabase/functions/deno.json supabase/functions/commercial-document-notify/core.test.ts`. |
| **U. Wave leakage** | Confirm no `save_agreement_part`, `save_agreement_as_template`, `materialize_agreement_template`, `studio_agreement_parts`, `agreement_templates`, `compose_agreement_consent`, or `agreement_execution_snapshots` appears anywhere in the W1 diff | | None. W2/W3 stay in W2/W3. |
| **V. Vocabulary (R7)** | Grep the diff for studio-facing strings | | No "clause library", no "contract builder", no "facet" in composer copy. |

---

## 9 · Walk script — local, flag on

Prereqs: `docker compose up -d`; `pnpm supabase:start`; `pnpm supabase:reset`; **check `apps/designer-portal/.env.local`'s `NEXT_PUBLIC_SUPABASE_URL` points at `127.0.0.1`, not Strata** (it has pointed at prod before); `NEXT_PUBLIC_FLAG_OVERRIDES=agreement-parts:true` and `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live` exported; `pnpm dev:minimal`. Two browser profiles (designer, client) — one clone, one seeded account per walker.

| # | Step | Do | Expected evidence |
|---|---|---|---|
| 1 | Create a lead → agreement | Designer portal → create a lead with a client that has an email; run it to a design agreement draft | `SELECT id, document_kind, commercial_state, status FROM proposals WHERE id = :p` → `design_services` / `draft` / `draft` |
| 2 | Open the Contract Room | Navigate to `/drafting/:proposalId` | Composer renders (not the seven facets). Rail shows **nine** rows: Services · Deliverables · Exclusions · Role rates · Ceiling · Furnishings deposit · Retainer · Billing cadence · Terms. Right rail reads `N of 9 parts need attention`. |
| 3 | Materialize landed | — | `SELECT position, part_key, kind, variant, required, client_visible FROM proposal_agreement_parts WHERE proposal_id = :p ORDER BY position` → 9 rows, positions 1..9, keys in §2.4 order, `required` true on `patina.services` and `patina.terms` only |
| 4 | Terms row untouched by materialize | — | `SELECT updated_at FROM proposal_service_terms WHERE proposal_id = :p` equals the value captured before step 2 |
| 5 | Remove Exclusions | Rail row "Exclusions" → `⋯` → `Remove` → Save | Rail shows 8. `SELECT count(*) … ` → 8; no `patina.exclusions` row. `SELECT exclusions FROM proposal_service_terms WHERE proposal_id = :p` → `[]` (absent, not the old value) |
| 6 | Add a role | Rail → "Role rates" → `+ Add a role` → `Principal designer` / `225.00` → Save | `SELECT role_name, hourly_rate_cents, sort_order FROM proposal_service_rates WHERE proposal_id = :p ORDER BY sort_order` → the role at 22500. Readiness now demands a ceiling (R-6) if the ceiling part is blank. |
| 7 | Fill the ceiling and the required prose | Ceiling → `24,000`; Services and Terms bodies non-blank | Readiness panel reads `0 of 8 parts need attention`; the send action enables. `SELECT billing_ceiling_cents FROM proposal_service_terms …` → `2400000` |
| 8 | Preview the client copy | Header → `Preview client copy` | Parts render **in rail order**; no `Not yet set` anywhere; the removed Exclusions section is **absent**, not an empty heading |
| 9 | Send | `Review & send` → confirm | `SELECT status, commercial_state, sent_at FROM proposals WHERE id = :p` → `sent` / `sent` / non-null. Then `UPDATE proposal_agreement_parts SET title='x' WHERE proposal_id=:p` in psql → `check_violation: proposal_agreement_parts is immutable after its proposal leaves draft` |
| 10 | Sign as the client | Client-portal profile → open the document → the body shows the same eight parts in the same order → sign | `SELECT party_role, signed_name, evidence_fingerprint FROM commercial_document_signatures WHERE proposal_id = :p` → one `client` row with a 64-char digest. `SELECT public._commercial_document_fingerprint(:p)` equals that digest. |
| 11 | Countersign | Designer portal → countersign | `SELECT commercial_state FROM proposals WHERE id = :p` → `executed`. No `check_violation` about a fingerprint conflict (this is the F-1 regression walked by hand). |
| 12 | Authority created with the right ceiling | — | `SELECT billing_ceiling_cents, retainer_amount_cents, retainer_activation_policy, billing_cadence, status FROM project_billing_authorities WHERE source_proposal_id = :p` → `2400000` / the retainer part's cents / its policy / the cadence part's value / `active`. Then repeat steps 1–11 for a **flat-fee** agreement (remove `patina.role_rates` and `patina.ceiling`, add a `flat` part) and assert the authority row has `billing_ceiling_cents IS NULL` and `get_project_authority_summary` returns `state <> 'exhausted'`, `remainingCents = null`. |

**Flag-off leg** (must be walked too): restart dev with `NEXT_PUBLIC_FLAG_OVERRIDES=agreement-parts:false`, open a **different** draft, and confirm the seven-facet room renders with the `N of 7 facets written` counter and sends exactly as on `main`.

---

## 10 · Deploy set

Chain, in order, from the **main checkout** (never a worktree — the env-inlining outage):

| # | Unit | Command | Note |
|---|---|---|---|
| 1 | Migration | `supabase db push` (linked, Strata `bkvcixdmuyejfzcijpdg`) | Applies **00575 only** if the tip is clean. ⚠ Memory records that several earlier migrations are **deliberately pending** on Strata; confirm the ledger before pushing and, if the tip is not contiguous, apply 00575 selectively rather than a plain `db push`. |
| 2 | Edge functions | **none — verified, not assumed** | `grep -rln "proposal_service_terms\|proposal_agreement_parts\|_commercial_document_fingerprint\|get_client_commercial_document_bundle" supabase/functions/` returns **exactly one** hit: `commercial-document-notify/index.ts:363`, which selects `billing_ceiling_cents, retainer_amount_cents` and passes them at `:408-409` as `ceilingCents ?? null`. Its formatter is **already NULL-safe** — `money(cents?: number \| null)` returns `null` when `cents == null` (`commercial-document-notify/core.ts:54-55`), and `CommercialEmailInput.ceilingCents` is already typed `number \| null` (`core.ts:34`). So a NULL ceiling omits the figure from the email rather than printing `$0`. **No redeploy required, and no `_shared/*` file is touched by W1** (that is the condition that would force redeploying every importer). `proposal-send/handler.ts` and `commercial-document-notify/policy.ts` branch on `documentKind`, which W1 does not widen. Re-run the grep before deploying and report its output verbatim; a **second** hit means this row is stale. |
| 3 | Services | **none** | No `svc_*` schema or NestJS change. |
| 4 | Designer portal | `./infra/deploy-portal.sh designer-portal` | Never a raw `opennextjs-cloudflare build`. The script rebuilds workspace dists first — required here because `@patina/types` changed and is dist-resolved. |
| 5 | Client portal | `./infra/deploy-portal.sh client-portal` | Same reason. |
| 6 | Admin portal | **only if** its build is affected | `@patina/types` changed, so run `pnpm --filter @patina/admin-portal build` before deciding; deploy only if a shipped behavior moved. |

### Probes after deploy

| # | Probe | Expect |
|---|---|---|
| 1 | `wrangler deployments list` for each portal — read the **bottom** row (oldest-first) | The new version id. Record it and the previous id as the rollback target. |
| 2 | Grep the served chunks for a W1 string, e.g. `curl -s https://app.patina.cloud/… \| grep -o 'agreement-parts'` | Present. The deploy-placeholder incident is why this step exists. **Do not** use `/api/version` — it returns static fallback defaults on the Workers path. |
| 3 | DB object probe, not the ledger | `supabase db query --linked "SELECT to_regclass('public.proposal_agreement_parts'), to_regclass('public.studio_agreement_defaults'), to_regprocedure('public.upsert_agreement_parts(uuid,jsonb)'), to_regprocedure('public.materialize_standard_parts(uuid)')"` → four non-null |
| 4 | Nullability probe | `SELECT is_nullable FROM information_schema.columns WHERE table_name IN ('proposal_service_terms','project_billing_authorities') AND column_name = 'billing_ceiling_cents'` → `YES`, `YES` |
| 5 | Trigger probe | `SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.proposal_agreement_parts'::regclass AND NOT tgisinternal` → includes `guard_proposal_agreement_parts_authored` |
| 6 | **F-1 in prod** | Pick a prod proposal with **no** parts and a stored client signature: `SELECT s.evidence_fingerprint = public._commercial_document_fingerprint(s.proposal_id) FROM commercial_document_signatures s WHERE s.party_role='client' AND NOT EXISTS (SELECT 1 FROM proposal_agreement_parts ap WHERE ap.proposal_id = s.proposal_id) LIMIT 20` → **all true** |
| 7 | Flag-off behavior probe | Signed-in prod walk of the seven-facet Contract Room with the flag off — the counter still reads `of 7 facets written`, a send still works |
| 8 | Flag creation | ⚠ **Owed to Kody**: create the PostHog flag `agreement-parts`. Verify it against `/flags` **with a real-browser UA before enabling** — the `threshold` flag matched everyone on 2026-09-04. The feature is dark until then; `NEXT_PUBLIC_FLAG_OVERRIDES=agreement-parts:false` is the instant fail-closed lever. |

Rollback: portals to the recorded previous Worker version. The migration is **not** rolled back — it is additive and byte-identical for parts-less documents (F-1), so flipping the flag off is a complete functional rollback.
