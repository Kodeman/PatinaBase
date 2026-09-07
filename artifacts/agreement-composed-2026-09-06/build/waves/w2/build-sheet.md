# Wave 2 build sheet — The Agreement, Composed

**Wave 2 = P4 The Library · P5 Fee schedules · P6 The client's copy from parts (+ execution snapshot, R12) · P7 Addenda from parts · P8 Change history on parts.**

Binding sources, in precedence order: `build/contract.md` → `build/rulings-2026-09-06.md` → `source/proposal.md` §5 §6 §7 §10 §11 §12 → `research/04-codebase-today.md`. Anything this sheet says that contradicts the contract is a mistake in this sheet; raise it to the orchestrator rather than choosing.

**Wave 1 is assumed shipped exactly as `contract.md` states.** Before a line of W2 code, each lane runs its W1 pre-flight (§2). A missing W1 object is a **blocking report to the orchestrator**, never something a W2 lane quietly builds.

Flag: **`agreement-library`**, fail-closed. W1's **`agreement-parts`** must also be on for any W2 UI to appear — every W2 gate is `agreementParts && agreementLibrary`. Local dev: `NEXT_PUBLIC_FLAG_OVERRIDES=agreement-parts:true,agreement-library:true`. There is no flag registry file in this repo — a flag is a string literal at its `useFeatureFlag('…')` gate plus a PostHog flag Kody creates (verified against `/flags` with a real-browser UA **before** enabling). Do not invent a registry.

---

## 1. Scope and non-goals

### In scope

| # | Proposal | What lands in W2 |
|---|---|---|
| P4 | The Library | `agreement_templates` + `studio_agreement_parts` tables, RLS, grants, three RPCs, three seeded Patina templates, the Account → Studio Library card (M4), the Add-a-part picker (M2), the template picker, Save-as-template. |
| P5 | Fee schedules | Four new columns on `proposal_service_terms` **and** `project_billing_authorities`; the countersign graft that snapshots them; typed editors for the seven W2 schedule variants; R9's authority/record-only split enforced in the projection. |
| P6 | The client's copy from parts | `compose_agreement_consent` (SQL) + `composeConsentLine` (TS) with a pinned drift test; attachment leaves with a recorded acknowledgment; `agreement_execution_snapshots` written at countersign and read by the keepsake (R12). |
| P7 | Addenda from parts | An addendum composed as a part set carrying a `why`; money parts re-project into the new authority. |
| P8 | Change history on parts | `agreement_part_events`; a history strip under the open part in the room. |

### Non-goals — do not build, do not scaffold, do not "prepare for"

- Anything W3: `design_build` kind, `pricing_basis` / `draws` / `allowances` **editors or projections** (the *vocabulary strings* already exist from W1's `packages/types/src/agreement.ts`; W2 renders them as `record only (R9)` and nothing more), `studio_trade_agreements`, `studio_license_attestations`, `agreement_jurisdiction_notices`, lien waivers, sign-and-pay, the `patina.design_build` seeded template.
- Widening `billing_cadence` with `per_draw` (W3 only).
- Reopening `commercial_document_signatures`' two-party constraint.
- A PDF of any kind (R12: frozen HTML, no PDF).
- Any new call to `app_private.issue_invoice_for_actor` (see the hardening trap in §3.4).
- Editing a studio template's *composition* in place — W2 gives rename + delete + re-save. A composition editor is out of scope; say so in the UI copy, do not add a fourth RPC.
- Permission tiers inside the room (R14: not now).
- Restyling the Billing card in `account-studio-page.tsx`.
- Backfilling existing proposals into parts. W1's `materialize_standard_parts` seeds on first open under the flag; W2 does not run a backfill.

### Rulings depended on

| Ruling | What W2 must do with it |
|---|---|
| **R1** | R85 does not bind agreement templates. The Library ships, **and the DECISIONS entry in §3.5 lands in the same merge.** |
| **R2** | Template scope is the studio. There is no per-user template, no `created_by`-scoped RLS. "Mine" is a client-side filter on `created_by` in the Library card, nothing more. |
| **R3** | Read = every active member (`is_active_studio_member` / `is_active_org_member`); write = owners and admins (`is_org_admin_or_owner`). This is a **deliberate divergence** from `board_templates`, whose UPDATE/DELETE policies use `is_active_org_member`. Name the divergence in the migration banner. |
| **R7** | Names in every string a designer reads: **Agreement · Part · Library · Template · Addendum**. Never "clause library", "contract builder", "block", "snippet", "section". |
| **R8** | Client copy is in the designer's order; per-part `client_visible` decides presence. `client_visibility_tier` is untouched. |
| **R9** | Authority in W2: `rate_card`, `ceiling`, `retainer`, `cadence`, `flat`, `per_phase`, plus `procurement`'s `depositPercent` field only. Everything else is **record only** — no terms projection, no authority column, no consent fragment, and a visible `record only (R9)` chip. |
| **R12** | The client keeps a frozen HTML snapshot written at execution. No PDF, no client-side render stored, no re-render on read. |

---

## 2. Lanes

Three lanes, **no overlapping files**. A lane that needs a change in another lane's pathspec raises it; it does not reach across.

### Lane ownership (pathspecs)

**`backend`** — everything server-side and everything under `packages/`.

```
supabase/migrations/NNNNN_agreement_library.sql            (new)
supabase/migrations/NNNNN+1_agreement_fee_schedules.sql    (new)
supabase/seed/00-legacy-grants.sql                         (REGENERATED, never hand-edited)
supabase/tests/commercial/agreement_library_test.sql       (new)
supabase/tests/commercial/agreement_fee_schedules_test.sql (new)
supabase/tests/edge_api/public_sd_hardening_contract_test.sql   (re-pin: 2 rows, §3.4)
supabase/functions/proposal-send/handler.ts                (optional, §10)
packages/types/src/agreement.ts                            (extend W1's file)
packages/types/src/index.ts                                (barrel, if new exports)
packages/supabase/src/database.types.ts                    (REGENERATED)
packages/supabase/src/hooks/use-agreement-library.ts       (new)
packages/supabase/src/hooks/use-agreement-part-events.ts   (new)
packages/supabase/src/hooks/index.ts                       (barrel)
```

**`designer`** — `apps/designer-portal/src/**` only.

```
apps/designer-portal/src/components/document/rooms/drafting/agreement/add-part-sheet.tsx        (W1 file, extended)
apps/designer-portal/src/components/document/rooms/drafting/agreement/parts-rail.tsx            (W1 file, footer acts only)
apps/designer-portal/src/components/document/rooms/drafting/agreement/part-editor.tsx           (W1 file, variant dispatch only)
apps/designer-portal/src/components/document/rooms/drafting/agreement/template-picker-sheet.tsx (new)
apps/designer-portal/src/components/document/rooms/drafting/agreement/save-as-template-action.tsx (new)
apps/designer-portal/src/components/document/rooms/drafting/agreement/part-history-strip.tsx    (new)
apps/designer-portal/src/components/document/rooms/drafting/agreement/schedules/*.tsx           (new folder)
apps/designer-portal/src/components/document/account/agreement-library-card.tsx                 (new)
apps/designer-portal/src/components/document/account/account-studio-page.tsx                    (ONE insertion, §4.4)
apps/designer-portal/src/components/document/commercial/addendum-from-parts-sheet.tsx           (new)
apps/designer-portal/src/components/document/commercial/project-services-addendum-action.tsx    (opens the sheet)
apps/designer-portal/src/lib/analytics/document-events.ts                                       (new event names)
apps/designer-portal/src/components/**/__tests__/*                                              (new jest specs)
```

**`client`** — `apps/client-portal/src/**` and `apps/client-portal/tests/**` only.

```
apps/client-portal/src/components/threshold/consent-copy.ts            (ADD ONLY — every existing export stays byte-identical)
apps/client-portal/src/components/threshold/__tests__/consent-copy.test.ts  (ADD blocks; touch no existing block)
apps/client-portal/src/components/threshold/door-gate.tsx
apps/client-portal/src/components/commercial-document-shell.tsx        (attachment leaves on top of W1's parts render)
apps/client-portal/src/app/api/proposals/[id]/sign/route.ts
apps/client-portal/src/app/proposals/[id]/record/page.tsx
apps/client-portal/src/components/record/record-sheet.tsx
apps/client-portal/src/lib/commercial-documents.ts                     (bundle DTO: parts, executionSnapshot)
apps/client-portal/tests/threshold.spec.ts                             (e2e touchpoint)
```

### W1 pre-flight (each lane, before writing anything)

```bash
# backend
grep -rn "proposal_agreement_parts" /Users/kody/Code/patina-merged/supabase/migrations/*.sql | head
grep -rln "CREATE OR REPLACE FUNCTION[^(]*upsert_agreement_parts" /Users/kody/Code/patina-merged/supabase/migrations/*.sql | sort | tail -1
grep -rln "CREATE OR REPLACE FUNCTION[^(]*materialize_standard_parts" /Users/kody/Code/patina-merged/supabase/migrations/*.sql | sort | tail -1
grep -rln "CREATE OR REPLACE FUNCTION[^(]*get_client_commercial_document_bundle" /Users/kody/Code/patina-merged/supabase/migrations/*.sql | sort | tail -1
ls /Users/kody/Code/patina-merged/packages/types/src/agreement.ts
# designer
ls /Users/kody/Code/patina-merged/apps/designer-portal/src/components/document/rooms/drafting/agreement/
# client
grep -n "parts" /Users/kody/Code/patina-merged/apps/client-portal/src/components/commercial-document-shell.tsx
```

If the client pre-flight finds **no** parts branch in `DesignServicesBody`, W1 did not ship contract §4's client render. **Stop and report.** The client lane's W2 job is to extend that render (attachment leaves, acknowledgment, snapshot), not to author it.

### Cross-lane interfaces (frozen here — code against these before backend merges)

**RPCs** (all `SECURITY DEFINER`, `SET search_path = public, extensions, pg_temp`, `REVOKE … FROM PUBLIC, anon`, `GRANT EXECUTE … TO authenticated` unless noted):

```sql
public.save_agreement_part(p_studio_id uuid, p_part jsonb)
  RETURNS public.studio_agreement_parts
  -- p_part: {partKey?, kind, variant?, title, payload, requiredDefault?, clientVisibleDefault?}
  -- upsert on (studio_id, part_key); mints 'studio.'||uuid when partKey is absent

public.save_agreement_as_template(p_proposal_id uuid, p_title text)
  RETURNS public.agreement_templates
  -- snapshots proposal_agreement_parts into a new kind='studio' row, key 'studio.'||uuid,
  -- owner refs stripped, class taken from the proposal's document_kind

public.materialize_agreement_template(p_proposal_id uuid, p_template_key text)
  RETURNS integer   -- number of parts written; replaces the draft's part set wholesale

public.compose_agreement_consent(p_proposal_id uuid)
  RETURNS text      -- STABLE; the composed consent sentence, or the legacy literal when no money parts

public.upsert_agreement_parts(p_proposal_id uuid, p_parts jsonb, p_why text DEFAULT NULL)
  RETURNS integer   -- W1's RPC, re-declared with the trailing why (§3.4)

public.sign_design_services_agreement_with_trusted_ip(
  p_proposal_id uuid, p_signed_name text, p_client_id uuid,
  p_signed_ip text DEFAULT NULL, p_consent jsonb DEFAULT NULL)
  RETURNS jsonb     -- service_role only; p_consent = {consentSentence, attachmentsAcknowledged: string[]}
```

**Hooks** (`@patina/supabase`, `main → ./src/…` so edits are live, no rebuild):

```ts
useAgreementTemplates(studioId)          // ['agreement-templates', studioId]
useStudioAgreementParts(studioId)        // ['studio-agreement-parts', studioId]
useSaveAgreementPart()
useSaveAgreementAsTemplate()
useMaterializeAgreementTemplate()
useRenameAgreementTemplate()             // table UPDATE (title) under RLS
useDeleteAgreementTemplate()
useDeleteStudioAgreementPart()
useAgreementPartEvents(proposalId)       // ['agreement-part-events', proposalId]
```

**Bundle additions** (`get_client_commercial_document_bundle`, consumed by the client lane):

```jsonc
{
  "parts": [ /* W1 */ ],
  "consentSentence": "…",                 // compose_agreement_consent at read time
  "executionSnapshot": {                  // null until countersign
    "html": "…", "documentHash": "<64 hex>", "createdAt": "…"
  }
}
```

**Sequencing.** Backend merges first. Designer and client build against the frozen signatures above and integrate on backend's merge. No lane blocks on another for *authoring*.

---

## 3. Migration outlines

### 3.0 Numbering

Head on `main` today is **`00574_invoice_links.sql`**. W1 is expected to consume `00575` (parts + guard + fingerprint) and `00576` (studio agreement defaults). W2 is therefore **provisionally `00577_agreement_library.sql` and `00578_agreement_fee_schedules.sql`**.

Numbers are provisional until merge. At branch time and again at **every** integration:

```bash
ls /Users/kody/Code/patina-merged/supabase/migrations/*.sql | sort | tail -3
```

If a number collides, **bump the undeployed side** — rename the file *and* the internal banner number and lineage. Never renumber something already applied to Strata.

### 3.1 Banner shape (both files)

```sql
-- ═══════════════════════════════════════════════════════════════════════════
-- 00577 — The Agreement Library: studio parts, studio and seeded templates
--
-- Modeled on 00408 board_templates: kind seeded|studio, an owner-shape CHECK,
-- patina.* / studio.* key namespaces, seeded rows immutable except under
-- app.allow_patina_template_mutation, INSERT is RPC-only.
--
-- DELIBERATE DIVERGENCE FROM 00408: write policies use
-- public.is_org_admin_or_owner(studio_id, auth.uid()) rather than
-- is_active_org_member — R3 says owners and admins edit the Library and every
-- active member composes from it.
--
-- Reverses nothing in 00063 proposal_templates (per-user, retired by R85).
-- A studio Library is a different object — DECISIONS R138, same merge (R1).
-- ═══════════════════════════════════════════════════════════════════════════
```

### 3.2 `NNNNN_agreement_library.sql`

**Two different `kind` columns. Do not conflate them.** `agreement_templates.kind ∈ {'seeded','studio'}` is *ownership*. `studio_agreement_parts.kind` is the *part kind* from `AGREEMENT_PART_KINDS` and carries **no CHECK** (00417:87 code-resident-vocabulary doctrine).

**Objects**

```sql
CREATE TABLE IF NOT EXISTS public.agreement_templates (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  template_key text NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('seeded','studio')),
  studio_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  class text NOT NULL CHECK (length(btrim(class)) > 0),   -- code-resident vocabulary, no value CHECK
  title text NOT NULL CHECK (length(btrim(title)) > 0),
  parts jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(parts) = 'array'),
  consent_key text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agreement_templates_owner_shape CHECK (
    (kind = 'seeded' AND studio_id IS NULL AND created_by IS NULL
       AND template_key LIKE 'patina.%')
    OR (kind = 'studio' AND studio_id IS NOT NULL
       AND template_key LIKE 'studio.%')
  )
);

CREATE TABLE IF NOT EXISTS public.studio_agreement_parts (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  studio_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (length(btrim(kind)) > 0),     -- part kind, code-resident
  variant text,                                            -- schedule only, code-resident
  part_key text NOT NULL CHECK (part_key LIKE 'studio.%'),
  title text NOT NULL CHECK (length(btrim(title)) > 0),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  required_default boolean NOT NULL DEFAULT false,
  client_visible_default boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (studio_id, part_key)
);
```

Indexes: `(studio_id, updated_at DESC) WHERE studio_id IS NOT NULL` on templates; `(template_key) WHERE kind='seeded'`; `(studio_id, kind, title)` on parts. `set_updated_at_*` trigger on both, `public.update_updated_at_column()`, exactly as 00408:60-64.

**Immutability guard** — `public.guard_agreement_template_immutability()`, a direct transposition of `guard_board_template_immutability` (00408:71-121):

- Seeded rows refuse UPDATE/DELETE unless `current_setting('app.allow_patina_template_mutation', true) = 'on'` — **reuse that exact GUC name**, it is the repo's maintenance switch.
- Studio rows freeze `template_key`, `kind`, `studio_id`, `class`, `parts`, `created_at`, and `created_by` (except the `NOT NULL → NULL` account-deletion path 00408 allows). `title` and `consent_key` remain editable — that is the rename affordance.
- `REVOKE ALL ON FUNCTION … FROM PUBLIC, anon, authenticated, service_role;`
- Trigger `a_guard_agreement_template_immutability_trg BEFORE UPDATE OR DELETE`.
- A second, simpler guard on `studio_agreement_parts` is **not** needed — all writes go through `save_agreement_part`; the table grants no INSERT/UPDATE to `authenticated`.

**RLS** (both tables `ENABLE ROW LEVEL SECURITY`, all policies `TO authenticated`):

| Table | Policy | Predicate |
|---|---|---|
| `agreement_templates` | `agreement_templates_select` | `kind='seeded' OR (kind='studio' AND EXISTS (SELECT 1 FROM organizations s WHERE s.id = studio_id AND s.type='design_studio' AND s.status='active' AND public.is_active_org_member(s.id)))` — mirror 00408:129-144 |
| `agreement_templates` | `agreement_templates_studio_update` | `kind='studio' AND public.is_org_admin_or_owner(studio_id, auth.uid())`, same in `WITH CHECK` |
| `agreement_templates` | `agreement_templates_studio_delete` | same predicate |
| `studio_agreement_parts` | `studio_agreement_parts_select` | `public.is_active_studio_member(studio_id)` |
| `studio_agreement_parts` | `studio_agreement_parts_delete` | `public.is_org_admin_or_owner(studio_id, auth.uid())` |

No INSERT policy on either table. No UPDATE policy on `studio_agreement_parts`.

**Grants** (post-flip rule — grant explicitly, revoke explicitly):

```sql
REVOKE ALL ON TABLE public.agreement_templates    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.studio_agreement_parts FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE (title, consent_key), DELETE ON public.agreement_templates    TO authenticated;
GRANT SELECT, DELETE                                ON public.studio_agreement_parts TO authenticated;
GRANT ALL ON TABLE public.agreement_templates    TO service_role;
GRANT ALL ON TABLE public.studio_agreement_parts TO service_role;
```

**Sanitizer** — `public.sanitize_agreement_part_payload(p_value jsonb) RETURNS jsonb`, `IMMUTABLE`, `SET search_path = public, pg_temp`, recursive object/array walk exactly as `sanitize_board_template_json` (00408:199-257), stripping these keys at every depth:

```
id, proposal_id, project_id, client_id, designer_id, studio_id, organization_id,
created_by, owner_user_id, user_id, invoice_id, part_id, source_part_id,
source_template_key, created_at, updated_at
```

`REVOKE ALL ON FUNCTION … FROM PUBLIC, anon, authenticated, service_role;` (definer bodies call it as owner).

**RPC bodies (outline)**

`save_agreement_part(p_studio_id uuid, p_part jsonb)`
1. `auth.uid() IS NULL` → `insufficient_privilege`.
2. `NOT public.is_org_admin_or_owner(p_studio_id, auth.uid())` → `insufficient_privilege`, message `'only a studio owner or admin may edit the Library'` (R3).
3. Validate: `kind` non-empty; `title` non-empty; `payload` is an object; when `kind='schedule'`, `variant` non-empty.
4. `v_key := COALESCE(NULLIF(btrim(p_part->>'partKey'),''), 'studio.' || extensions.gen_random_uuid()::text)`; reject a key not `LIKE 'studio.%'` with `check_violation`.
5. `INSERT … ON CONFLICT (studio_id, part_key) DO UPDATE SET kind, variant, title, payload, required_default, client_visible_default, updated_at = now()`, `payload = public.sanitize_agreement_part_payload(p_part->'payload')`. `RETURNING *`.

`save_agreement_as_template(p_proposal_id uuid, p_title text)`
1. `auth.uid() IS NULL` or blank title → refuse.
2. Load the proposal; require `public.is_studio_comember(proposal.designer_id)`. (Read access; the *save* target studio is resolved next.)
3. Resolve the one active `design_studio` org in which **both** `auth.uid()` and `proposal.designer_id` are active non-guest members — the two-membership join at 00408:315-341, transposed. Ambiguity (0 or >1) → `insufficient_privilege`, `'template studio is not an authorized design workspace'`.
4. `NOT public.is_org_admin_or_owner(v_studio_id, auth.uid())` → refuse (R3).
5. Snapshot: `jsonb_agg(jsonb_build_object('partKey', part_key, 'kind', kind, 'variant', variant, 'title', title, 'payload', public.sanitize_agreement_part_payload(payload), 'required', required, 'clientVisible', client_visible) ORDER BY position)` from `proposal_agreement_parts`. Empty set → `check_violation`, `'this agreement has no parts to save'`.
6. `class := proposal.document_kind` (`service_addendum` saves as `class = 'design_services'`).
7. INSERT `kind='studio'`, `template_key = 'studio.'||gen_random_uuid()`, `created_by = auth.uid()`. `RETURNING *`.

`materialize_agreement_template(p_proposal_id uuid, p_template_key text)`
1. `auth.uid() IS NULL` → refuse.
2. Proposal must be `status='draft'` **and** `public._can_author_proposal(designer_id)` — R6: parts are composable only in draft.
3. Load the template by key with the same visibility predicate as `agreement_templates_select` (seeded, or studio with active membership). Not found → `insufficient_privilege`, `'template not found or not accessible'`.
4. Resolve each entry of `template.parts` in order:
   - entry has `partKey LIKE 'studio.%'` → look up `studio_agreement_parts` for the acting studio; missing → skip the entry and continue (a deleted Library part must not brick a template).
   - otherwise → use the inline body carried in the entry (this is how the seeded templates work).
   - `required` / `clientVisible` on the entry override the part's defaults when present.
5. `DELETE FROM proposal_agreement_parts WHERE proposal_id = p_proposal_id;` then insert the resolved set with `position` 1..n, `source_template_key = p_template_key`, `source_part_id` = the `studio_agreement_parts.id` when resolved from a row and NULL when inline. **Owner refs are stripped again** through `sanitize_agreement_part_payload` on the way in.
6. `PERFORM public.upsert_agreement_parts(p_proposal_id, <the same set as jsonb>, 'Materialized from ' || template.title);` — do **not** re-implement the terms projection. W1's RPC owns it, and this is how the change history gets its event.
7. `RETURN` the count.

**Seeded templates.** Three `INSERT … ON CONFLICT (template_key) DO NOTHING` rows, `kind='seeded'`, `studio_id NULL`, `created_by NULL`:

| `template_key` | `class` | `title` | `parts` (in order) |
|---|---|---|---|
| `patina.design_services` | `design_services` | Design services (Patina standard) | services (clause) · deliverables (list) · exclusions (list) · role_rates (schedule/rate_card) · ceiling (schedule/ceiling) · deposit (schedule/procurement, `depositPercent` only) · retainer (schedule/retainer) · cadence (schedule/cadence) · terms (clause) |
| `patina.consultation` | `consultation` | Consultation / hourly | services · role_rates · ceiling (`required:false`) · terms · termination (clause) |
| `patina.furnishings_services` | `furnishings_services` | Furnishings only | services · deliverables · procurement terms (schedule/procurement) · deposit · change orders (clause) · terms of sale (clause) · termination (clause) |

`patina.design_build` is **not** seeded in W2.

Inline part bodies for `patina.design_services` use today's literals, byte-for-byte from `service-agreement-drafting-room.tsx`:

- services scope: `"Interior design services, including concept development, design documentation, and selections."` (`:48-50`)
- deliverables: `["Concept presentation","Design documentation","Selection schedules"]` (`:30-34`)
- exclusions: `["Construction labor","Furnishings, freight, tax, and installation"]` (`:35-38`)
- deposit payload: `{"depositPercent": 50}` (`emptyTerms` default)
- cadence payload: `{"cadence": "monthly"}`
- retainer payload: `{"cents": 0, "creditRule": "credited", "activationPolicy": "immediate"}`
- ceiling payload: `{"cents": null}`
- terms clause body: `""`

Each seeded row's `part_key` uses the `patina.*` namespace (`patina.services`, `patina.deliverables`, …) matching W1's `PATINA_STANDARD_AGREEMENT_PARTS`. Read that constant and reproduce its keys exactly — a mismatch makes `materialize_standard_parts` and `materialize_agreement_template` produce different key sets for the same nine parts.

### 3.3 `NNNNN+1_agreement_fee_schedules.sql`

**Columns** (idempotent `ADD COLUMN IF NOT EXISTS` + `DROP CONSTRAINT IF EXISTS` / `ADD CONSTRAINT`):

On **`public.proposal_service_terms`**:
```sql
retainer_credit_rule text NOT NULL DEFAULT 'credited'
  CHECK (retainer_credit_rule IN ('credited','non_refundable','replenishing'))
fee_basis text  CHECK (fee_basis IS NULL OR fee_basis IN ('hourly','flat','per_phase'))
fee_amount_cents integer CHECK (fee_amount_cents IS NULL OR fee_amount_cents >= 0)
fee_schedule jsonb CHECK (fee_schedule IS NULL OR jsonb_typeof(fee_schedule) = 'array')
```
On **`public.project_billing_authorities`**: the same four, `retainer_credit_rule NOT NULL DEFAULT 'credited'`.

**No fingerprint edit is needed for these four.** `_commercial_document_fingerprint` hashes `serviceTerms` as `to_jsonb(t)` (00423:1224-1227), so a new *column* on the terms row is covered automatically — the same reason `furnishings_deposit_percent` needed none (04 §3). Say so in the banner. (A new *table* would be a different story; W1 already folded `parts` in.)

**Do not widen `billing_cadence`.** `per_draw` is W3.

**`public.agreement_part_events`**

```sql
CREATE TABLE IF NOT EXISTS public.agreement_part_events (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  part_id uuid,                     -- NULL after the part is removed
  part_key text NOT NULL,
  action text NOT NULL CHECK (action IN ('added','edited','removed','reordered','renamed','materialized')),
  actor uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_name text CHECK (actor_name IS NULL OR char_length(btrim(actor_name)) BETWEEN 1 AND 120),
  why text CHECK (why IS NULL OR char_length(btrim(why)) BETWEEN 1 AND 200),
  before jsonb,
  after  jsonb,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_agreement_part_events_proposal
  ON public.agreement_part_events(proposal_id, at DESC);
```

`before` and `after` are unreserved keywords in Postgres and legal as bare column names — the brief names them; do not rename them.

- RLS: `ENABLE`; one policy `agreement_part_events_studio_read FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.proposals p WHERE p.id = proposal_id AND public.is_studio_comember(p.designer_id)))`. **No write policy** — rows are written only by definer RPCs. History is studio-only; it never reaches the bundle (R8: the client reads the agreement, not the studio's revision log).
- Attach `public.guard_commercial_immutable_row()` (00412:603-616) `BEFORE UPDATE OR DELETE` — an event is append-only. Do **not** attach `guard_commercial_authored_child`; events are written after draft too (an addendum's why).
- Grants: `REVOKE ALL … FROM PUBLIC, anon, authenticated;` `GRANT SELECT … TO authenticated;` `GRANT ALL … TO service_role;`
- `why_author_name` resolution when the caller supplies a `why` but no name: **copy 00569:432-452 verbatim** — first whitespace-separated token of `profiles.full_name` (whitespace collapsed), else `display_name`, then `NULLIF(btrim(left(…,120)),'')`. A name too long is truncated, never raised on. `actor_name` is NULL whenever `why` is NULL.

**`public.agreement_execution_snapshots`** (R12)

```sql
CREATE TABLE IF NOT EXISTS public.agreement_execution_snapshots (
  proposal_id uuid PRIMARY KEY REFERENCES public.proposals(id) ON DELETE CASCADE,
  html text NOT NULL,
  part_set jsonb NOT NULL CHECK (jsonb_typeof(part_set) = 'array'),
  document_hash text NOT NULL CHECK (char_length(document_hash) = 64),
  created_at timestamptz NOT NULL DEFAULT now()
);
```
- RLS `ENABLE`; `FOR SELECT TO authenticated USING (EXISTS (… is_studio_comember(p.designer_id)))`. The **client never selects it directly** — the bundle projects it (the bundle is `SECURITY DEFINER`, so its RLS is bypassed there by design, exactly as the bundle already reads `commercial_document_signatures`).
- `guard_commercial_immutable_row()` `BEFORE UPDATE OR DELETE`.
- Grants: `REVOKE ALL … FROM PUBLIC, anon, authenticated; GRANT SELECT … TO authenticated; GRANT ALL … TO service_role;`
- Renderer: `public._render_agreement_snapshot_html(p_proposal_id uuid) RETURNS text`, `STABLE`, definer, `REVOKE ALL FROM PUBLIC, anon, authenticated, service_role`. Server-side HTML from the **client-visible** parts in `position` order — an `<h2>` per part title and a body per kind (`clause` → `<p>` with newlines as `<br>`; `list` → `<ul><li>`; `phases` → `<ul>`; `schedule` → a `<table>` per variant; `attachment` → an `<article class="leaf">`; `attestation` → a definition list). Escape every interpolated string (`replace` chain for `& < > "`). Money as `to_char(cents/100.0, 'FM999,999,990.00')`. No CSS, no scripts — the keepsake styles it.
- Write site: inside the countersign graft, after `v_fingerprint` is computed and after the authority insert:
  ```sql
  INSERT INTO public.agreement_execution_snapshots (proposal_id, html, part_set, document_hash)
  VALUES (p_proposal_id, public._render_agreement_snapshot_html(p_proposal_id),
          COALESCE((SELECT jsonb_agg(to_jsonb(pp) - 'created_at' - 'updated_at' ORDER BY pp.position)
                    FROM public.proposal_agreement_parts pp WHERE pp.proposal_id = p_proposal_id), '[]'::jsonb),
          v_fingerprint)
  ON CONFLICT (proposal_id) DO NOTHING;
  ```
  `DO NOTHING` because countersign is retry-safe. A proposal with **no** parts rows (legacy path) writes no snapshot — guard the INSERT on `EXISTS (SELECT 1 FROM proposal_agreement_parts …)`.

**`public.compose_agreement_consent(p_proposal_id uuid) RETURNS text`** — `STABLE`, definer, pinned search_path, `REVOKE … FROM PUBLIC, anon`, `GRANT EXECUTE … TO authenticated, service_role`. Body implements the fragment table in §5 in the **canonical variant order** (`rate_card, ceiling, flat, per_phase, retainer, procurement`) over **client-visible** schedule parts only. Zero fragments, or no parts rows at all → return the legacy literal verbatim:

> `I agree to these design-services terms and understand my signature alone does not authorize work until the studio countersigns.`

### 3.4 Function grafts — the exact rules

**Every redefinition starts from the grep winner, not from memory:**

```bash
grep -rln "CREATE OR REPLACE FUNCTION[^(]*<name>" /Users/kody/Code/patina-merged/supabase/migrations/*.sql | sort | tail -1
```

| Function | Head today | W2 delta |
|---|---|---|
| `_countersign_design_services_agreement_impl(uuid,text,jsonb)` | `00566` | Add the four columns to the `project_billing_authorities` INSERT; write the execution snapshot. **Nothing else moves.** |
| `upsert_agreement_parts(uuid,jsonb)` | W1's migration (grep) | Re-declare as `(uuid, jsonb, text DEFAULT NULL)`; append `agreement_part_events` rows; project `flat`/`per_phase`/`retainer_credit_rule`. |
| `get_client_commercial_document_bundle(uuid)` | W1's migration (grep — W1 re-headed 00425) | Add `consentSentence` and `executionSnapshot` keys. |
| `sign_design_services_agreement_with_trusted_ip(uuid,text,uuid,text)` | `00511` | Widen with `p_consent jsonb DEFAULT NULL`; pass through. |
| `_sign_design_services_agreement_authorized(uuid,text,uuid,text)` | `00412` | Widen with `p_consent jsonb DEFAULT NULL`; merge it into the signature `metadata`. |

**Overload hazard.** Adding a defaulted argument to a plpgsql function **creates a new overload; the old one survives** and PostgREST then has two candidates. For each widened function, `DROP FUNCTION IF EXISTS public.<name>(<old arg types>);` **before** the `CREATE OR REPLACE` of the wider one. A 4-argument call still resolves against the 5-argument function via the default, which is what contract §4 means by "the old signature still resolves". Re-issue the REVOKE/GRANT pair after the drop — a DROP takes the ACL with it.

Which to drop:
```sql
DROP FUNCTION IF EXISTS public.sign_design_services_agreement_with_trusted_ip(uuid, text, uuid, text);
DROP FUNCTION IF EXISTS public._sign_design_services_agreement_authorized(uuid, text, uuid, text);
DROP FUNCTION IF EXISTS public.upsert_agreement_parts(uuid, jsonb);
```

**THE HARDENING TRAP — `supabase/tests/edge_api/public_sd_hardening_contract_test.sql` will fail unless you edit it in the same change.** Two manifests pin identity + arguments + result type + `proconfig` + a **sha256 of `prosrc`** + the exact ACL:

1. `_00511_expected_public` (`:1763` asserts exactly **17** rows) pins
   `'public.sign_design_services_agreement_with_trusted_ip(uuid,text,uuid,text)'`
   with arguments `'p_proposal_id uuid, p_signed_name text, p_client_id uuid, p_signed_ip text DEFAULT NULL::text'`
   and body hash `6c615ca417d594865e1f0772ee862c312e7a398d037c141366c8a1b97fd6f17d` (`:1739-1745`).
   **Update that row in place** — new signature string, new arguments string, new hash. The count stays 17.
2. `_00511_expected_dependency` (`:2186` asserts exactly **9** rows) pins
   `'public._countersign_design_services_agreement_impl(uuid,text,jsonb)'` with body hash
   `430d3a45b0f3a3cc35b85160e244c045c2500e91dd952297eb8ef44ea854a770` (`:2467-2477`).
   **Re-pin the hash**, keeping the signature/arguments/config identical (the graft changes only the body). Add a comment above it in the 00566 house style: what the wave changed and what the previous hash was. The count stays 9.

Recompute a hash after `pnpm supabase:reset`:
```bash
psql "$SUPABASE_DB_URL" -tA -c "SELECT encode(extensions.digest(convert_to(prosrc,'UTF8'),'sha256'),'hex') FROM pg_proc WHERE oid = to_regprocedure('public.sign_design_services_agreement_with_trusted_ip(uuid,text,uuid,text,jsonb)');"
psql "$SUPABASE_DB_URL" -tA -c "SELECT encode(extensions.digest(convert_to(prosrc,'UTF8'),'sha256'),'hex') FROM pg_proc WHERE oid = to_regprocedure('public._countersign_design_services_agreement_impl(uuid,text,jsonb)');"
```
Also update the bare signature literal at `:2332`, in the `sign/accept siblings` assertion, to the widened `_sign_design_services_agreement_authorized(uuid,text,uuid,text,jsonb)` — `to_regprocedure` on a stale signature returns NULL and the assertion silently stops covering the function instead of failing.

**Three invariants the countersign graft must not break** (all in the same test file):

- The string `'commercialDocumentId'` must still appear in the body, and the whitespace-normalized fragment `app_private.issue_invoice_for_actor( v_retainer_invoice_id, current_date, v_actor )` must survive **verbatim** (`:2304-2320`). Do not reformat that call.
- **No W2 function may call `app_private.issue_invoice_for_actor`.** `:2250-2278` is an exhaustive `EXCEPT ALL` over every routine in the database that references it; a new caller fails with *"the private invoice core global caller universe drifted"*. Draw invoicing is W3.
- The `authority_lock_order_contract` block checks where the first `FOR SHARE;` / `FOR UPDATE;` sits relative to the role-catalog read. Confine the graft to the authority INSERT and the snapshot INSERT, both of which are after every lock.

**`upsert_agreement_parts` delta** (W1's projection body, grafted, then extended):

- Signature `(p_proposal_id uuid, p_parts jsonb, p_why text DEFAULT NULL)`.
- Keep W1's draft/authorship guard, keep W1's call into the `upsert_design_services_draft` projection (00422 head) — **do not fork the projection**.
- New projection, R9 and R5:
  - exactly one of a `flat` or a `per_phase` client-visible schedule part may exist → otherwise `check_violation`, `'an agreement carries one fee basis'`.
  - `flat` → `fee_basis='flat'`, `fee_amount_cents = (payload->>'cents')::integer`, `fee_schedule = NULL`.
  - `per_phase` → `fee_basis='per_phase'`, `fee_amount_cents = sum((phase->>'cents')::integer)`, `fee_schedule = payload->'phases'`.
  - neither, and a `rate_card` part exists → `fee_basis='hourly'`, the other two NULL.
  - neither, and no `rate_card` → all three NULL.
  - `retainer` → `retainer_credit_rule = payload->>'creditRule'` (default `'credited'`).
  - `percent_of_cost`, `percent_of_spend`, `cost_plus`, `day_rate`, `package`, `pricing_basis`, `draws`, `allowances` → **write nothing** to terms. `procurement` → `furnishings_deposit_percent` only, as W1 already does.
- Event log: diff the incoming set against the current rows by `part_key`; emit one `agreement_part_events` row per `added` / `removed` / `edited` (payload or title changed) / `reordered` (position changed, nothing else) with `before`/`after` = the part object minus timestamps, `actor = auth.uid()`, `why = NULLIF(btrim(p_why),'')`, `actor_name` per the 00569 rule. A no-op save emits nothing.

**`create_service_addendum` is NOT redefined in W2.** P7 composes the addendum's part set *after* the RPC returns: the designer lane calls `create_service_addendum(projectId, title)` (unchanged, 00422 head), then `materialize_agreement_template` or `upsert_agreement_parts(newProposalId, parts, why)`. The origin's part set is copied by a new small definer RPC:

```sql
public.copy_agreement_parts_from_authority(p_proposal_id uuid, p_why text)
  RETURNS integer
```
— requires the target proposal be `document_kind='service_addendum'`, `status='draft'`, authored by the caller's studio; reads the active authority's `source_proposal_id` (as `create_service_addendum` does at 00422:1850-1858); copies its `proposal_agreement_parts` verbatim into the addendum with new ids and the same order; then `PERFORM public.upsert_agreement_parts(p_proposal_id, <copied set>, p_why)` so the projection and the event log both run. Same grant shape as the others.

### 3.5 DECISIONS entry (lands in the Wave 2 merge — R1)

Append to `docs/design/the-document/DECISIONS.md`. Mint the id from the file's own tail footer at merge (`*Entries add: R137 · last id = R137*` today, so **R138** unless a peer branch took it first). Append-only — do not rewrite anything above it.

```markdown
### R138 · R85 does not bind the Agreement Library — 2026-09-06

**Asked in `artifacts/agreement-composed-2026-09-06/`, ruled by Kody as recommended (R1).** R85 (`DECISIONS.md:2680`) retired *proposal templates* because the Discovery-seeded path covers the seeded case. The table it retired, `proposal_templates` (`00063_proposal_system_v2.sql:12-22`), is **per-user**: its RLS reads own-or-system rows (`:31-32`), so two designers in one studio never saw each other's. The Agreement Library is a different object — **studio-scoped, namespaced, seeded by Patina, and it feeds the same Discovery-seeded draft rather than replacing it.** R85 stands for proposals; it does not bind agreements.

What that buys, and its fence. `agreement_templates` and `studio_agreement_parts` take the `board_templates` shape (`00408:18-50`): `kind` seeded|studio, an owner-shape CHECK, `patina.*` / `studio.*` key namespaces, seeded rows immutable except under `app.allow_patina_template_mutation`, and INSERT that is RPC-only so no authenticated caller can forge an unsanitized part. One deliberate divergence: write policies use `is_org_admin_or_owner`, not `is_active_org_member` — **owners and admins edit the Library, every active member composes from it** (R3). Scope is the studio and never the person; "mine" is a filter, not a scope (R2). The words are **Agreement · Part · Library · Template · Addendum** — "clause library" and "contract builder" stay out of the studio's face (R7).

Nothing here reopens `proposal_templates`. Its two surviving call sites in `packages/supabase/src/hooks/use-proposals.ts` (`:600`, `:1485`) are untouched, and no path materializes a proposal template into an agreement.

*Entries add: R138 · last id = R138*
```

---

## 4. Designer portal design

### 4.1 Component tree

```
rooms/drafting/service-agreement-drafting-room.tsx        [W1 — flag branch, UNTOUCHED in W2]
└─ agreement/
   ├─ parts-rail.tsx                    [W1] footer gains: "+ Add a part" · "Start from a template…" · "Save as template…"
   ├─ part-editor.tsx                   [W1] dispatches kind → editor; schedule → schedules/index.ts
   ├─ part-history-strip.tsx            [W2 new] P8
   ├─ add-part-sheet.tsx                [W1 stub → W2 Library picker, M2]
   ├─ template-picker-sheet.tsx         [W2 new] materialize into a draft
   ├─ save-as-template-action.tsx       [W2 new]
   └─ schedules/                        [W2 new]
      ├─ index.ts                       variant → editor map + AUTHORITY_VARIANTS membership
      ├─ authority-chip.tsx             "creates authority" | "record only (R9)"
      ├─ flat-editor.tsx                one money field
      ├─ per-phase-editor.tsx           rows {key,label,cents}, add/remove/reorder, live total
      ├─ percent-editor.tsx             percent_of_cost AND percent_of_spend (one editor, a basis toggle)
      ├─ cost-plus-editor.tsx           markup % on net + a disclosure line
      ├─ day-rate-editor.tsx            rate + minimum days
      ├─ package-editor.tsx             name + price + what it includes
      └─ procurement-editor.tsx         deposit % (chips 0/25/50/100/other, reusing the room's DEPOSIT_CHIPS
                                        shape) + markup basis + freight handling + terms of sale
```

`rate_card`, `ceiling`, `retainer`, `cadence` editors are W1's. W2 adds the `creditRule` chips (`Credited · Non-refundable · Replenishing`) to the retainer editor — that is the only W1 editor W2 touches, and it is inside `part-editor.tsx`/W1's retainer editor, which the designer lane owns.

### 4.2 "record only (R9)" — how it is shown

`schedules/index.ts` exports `AUTHORITY_VARIANTS` (imported from `@patina/types`, never re-declared). `authority-chip.tsx` renders a mono uppercase micro-label in the part editor's header, matching the room's existing `LABEL` class (`font-mono text-[11px] font-semibold uppercase tracking-[0.08em]`):

- variant ∈ `AUTHORITY_VARIANTS` → `creates authority`, ink `--color-charcoal`.
- `procurement` → `creates authority · deposit only` (its other fields are prose).
- anything else → `record only (R9)`, ink `--color-aged-oak`, with one line of help beneath the editor: **"This is recorded on the agreement. It does not create billing authority yet."** No tooltip, no info icon, no link.

The same chip appears on the part's row in `parts-rail.tsx` (chip only, no help line) and on the picker card in `add-part-sheet.tsx`.

Readiness (`agreement/readiness.ts`, W1's file): a record-only part is never a blocker on money grounds; it blocks only if it is `required` and its typed payload is empty.

### 4.3 The picker (M2) and the template picker

`add-part-sheet.tsx` — a 720px sheet, header **From your Library**, two columns:

- **Parts**: `useStudioAgreementParts(studioId)` grouped by kind, each row = kind glyph · title · a `studio` or `Patina` chip · the authority chip for schedules. Clicking appends the part at the end of the rail (position = max+1) via `upsert_agreement_parts`. A part already on the agreement (same `part_key`) is shown disabled with "already on this agreement".
- **Blank**: `Clause · List · Schedule ▾ · Attachment`. The `Schedule ▾` menu lists the 15 variants from `AGREEMENT_SCHEDULE_VARIANTS`, each carrying its authority chip. A blank part gets `part_key = 'custom.' + crypto.randomUUID()`.

Footer: **Add to this agreement**.

`template-picker-sheet.tsx` — reached from the rail footer's "Start from a template…". Lists `useAgreementTemplates(studioId)` filtered to `class` matching the proposal's `document_kind`, seeded rows first, each with a `Patina`/`studio` chip and its part titles as a one-line preview. Confirming calls `useMaterializeAgreementTemplate` and shows a **destructive confirmation first**: *"This replaces the parts on this agreement. Nothing else on the draft changes."* — because `materialize_agreement_template` replaces the set wholesale.

`save-as-template-action.tsx` — rail footer, visible only when the proposal is `status='draft'` **and** the signed-in member is an owner or admin (`useOrganizations` membership role, the same `canManage` predicate `account-studio-page.tsx` uses at `:210`). Prompts for a title, calls `useSaveAgreementAsTemplate`, then a quiet confirmation: *"Saved to your Library."* On the RPC's `insufficient_privilege`: *"Only a studio owner or admin can save a template."*

### 4.4 Account → Studio → Agreement Library (M4)

New file `account/agreement-library-card.tsx`, mounted by **one** insertion in `account-studio-page.tsx` immediately **after** the Billing block (which closes around `:900`) and before whatever follows it. The insertion is exactly:

```tsx
{agreementLibraryEnabled && <AgreementLibraryCard studioId={studio.id} canManage={canManage} />}
```

with `const { value: agreementLibraryEnabled } = useFeatureFlag('agreement-library');` added beside the existing flag reads. **Nothing in the Billing block changes** — not a class, not a string.

The card mirrors Billing's shell (`mb-6 border-t border-[var(--color-pearl)] pt-5`, `h3` with the page's `LABEL` class, a `HELP` paragraph) and holds three strips:

1. **TEMPLATES** — list with `Patina`/`studio` chips; per studio row `Rename · Delete`. Seeded rows carry no acts. Below the list, when `!canManage`: *"Owners and admins edit the Library. Every member composes from it."*
2. **PARTS** — grouped by kind with counts (`Clauses 9 · Lists 3 · Schedules 5 · Attachments 1`), each row `Rename · Delete` for owners/admins.
3. **DEFAULTS** — W1's `studio_agreement_defaults` strip, read-only here if W1 already put it on this page; otherwise omit. **Do not build a second defaults editor.**

Analytics: `studioEvents`-style calls added to `lib/analytics/document-events.ts` (`agreement_template_saved`, `agreement_template_materialized`, `agreement_part_saved`, `agreement_part_removed`, `agreement_addendum_composed`), fired from the page/sheet, never inline in a leaf component.

### 4.5 The `why` line on addenda (P7, reusing 00569)

`project-services-addendum-action.tsx` stops navigating straight to the drafting room. It opens `commercial/addendum-from-parts-sheet.tsx`:

- Title field (defaulted to `"Design services addendum"`).
- **A single one-line `why`** — the 00569 pattern, and worded from it: label **"Why this addendum"**, placeholder *"Added the study to the scope"*, `maxLength={200}`, optional. Directly beneath, in the muted mono micro-label: `— {givenName}` where `givenName` is the first token of the signed-in profile's `full_name`, so the designer sees the attribution they are about to freeze. Copy for the help line: **"One line, kept with the addendum. Your client reads it beside the change."**
- On confirm, in order: `create_service_addendum(projectId, title)` → `copy_agreement_parts_from_authority(newProposalId, why)` → `router.push('/drafting/' + newProposalId)`.
- The existing standing line — *"The current authority stays active until the addendum is countersigned."* — stays verbatim.

`part-history-strip.tsx` (P8) renders under the open part in the room: `useAgreementPartEvents(proposalId)` filtered to that `part_key`, newest first, at most five with a "show all" disclosure. One row = `{action} · {actor_name ?? 'A teammate'} · {relative day}` and, when present, the `why` on its own line in the body ink. A part with no events renders nothing at all — no empty state.

### 4.6 Gate placement

Every W2 surface sits behind `agreementParts && agreementLibrary`, both read with `useFeatureFlag`, **fail-closed**: never render while `isLoading`; hidden slots use `{enabled && …}` (the hook's `value` defaults false). Flag off ⇒ the room renders exactly as W1 left it, byte-for-byte.

---

## 5. Client portal design

### 5.1 The consent composer

`consent-copy.ts` gains **one** export. Every existing export — `consentLineFor`, `signLabelFor`, `summaryLineFor`, `SIGNATURE_NOTICE`, `KIND_LABEL`, `refusalSentence`, `REFUSAL_TOKENS` — stays byte-identical. The file header's "nothing here may be reworded" rule still binds them.

```ts
export interface ConsentPart {
  kind: string;
  variant: string | null;
  clientVisible: boolean;
  payload: Record<string, unknown>;
}

/**
 * The composed consent. Zero money parts — or no parts at all — returns
 * consentLineFor(kind) verbatim, so the flag-off and legacy paths are
 * byte-identical to what the door has always shown.
 */
export function composeConsentLine(
  kind: CommercialDocumentKind,
  parts: readonly ConsentPart[] | null | undefined,
): string;
```

**Rules, identical in the SQL composer:**

1. Only `kind === 'schedule'` parts with `clientVisible === true` contribute.
2. Fragments are emitted in a **canonical variant order that is independent of the designer's part order**: `rate_card`, `ceiling`, `flat`, `per_phase`, `retainer`, `procurement`. (Determinism across two implementations is the whole point; never iterate in `position` order here.)
3. `cadence` contributes nothing — it is a billing mechanic, not an authorization, and today's `summaryLineFor` already omits it.
4. Every other variant contributes nothing in W2 (R9, record-only).
5. Assemble: `'I agree to ' + oxford(['these design-services terms', ...fragments]) + ', and understand my signature alone does not authorize work until the studio countersigns.'`
   `oxford`: 1 item → `A`; 2 → `A and B`; 3+ → `A, B, and C`.
6. **Zero fragments → return `consentLineFor(kind)` unchanged** (note the legacy literal has no comma before "and understand"; the composed form does — that is correct and intended).
7. `kind` outside `design_services | service_addendum` → `consentLineFor(kind)` unchanged. W2 composes for services only.

**Fragment table**

| Variant | Condition | Fragment |
|---|---|---|
| `rate_card` | part present, ≥1 role | `the signed role rates` |
| `ceiling` | present and `payload.cents > 0` | `the design authorization ceiling` |
| `ceiling` | present and `cents` null/0 | *(none — an unset ceiling is not consented to)* |
| `flat` | present | `the flat design fee` |
| `per_phase` | present, ≥1 phase | `the per-phase fee schedule` |
| `retainer` | `cents > 0`, `creditRule='credited'` | `the retainer credited against fees` |
| `retainer` | `cents > 0`, `creditRule='non_refundable'` | `the retainer, which is not refundable` |
| `retainer` | `cents > 0`, `creditRule='replenishing'` | `the replenishing retainer` |
| `retainer` | `cents = 0` | *(none)* |
| `procurement` | `depositPercent > 0` | `the furnishings deposit` |

**Sentence table — the nine standard parts and the fee variants**

| Part set | Sentence |
|---|---|
| No parts / flag off | `I agree to these design-services terms and understand my signature alone does not authorize work until the studio countersigns.` |
| **Nine standard parts** (rate_card + ceiling $24,000 + retainer $5,000 credited + cadence + deposit 50%) | `I agree to these design-services terms, the signed role rates, the design authorization ceiling, the retainer credited against fees, and the furnishings deposit, and understand my signature alone does not authorize work until the studio countersigns.` |
| **`patina.consultation`** (rate_card + ceiling) | `I agree to these design-services terms, the signed role rates, and the design authorization ceiling, and understand my signature alone does not authorize work until the studio countersigns.` |
| **flat** only | `I agree to these design-services terms and the flat design fee, and understand my signature alone does not authorize work until the studio countersigns.` |
| **per_phase** + non-refundable retainer | `I agree to these design-services terms, the per-phase fee schedule, and the retainer, which is not refundable, and understand my signature alone does not authorize work until the studio countersigns.` |
| **`patina.furnishings_services`** (procurement deposit only) | `I agree to these design-services terms and the furnishings deposit, and understand my signature alone does not authorize work until the studio countersigns.` |
| **flat + cost_plus + day_rate** (two record-only) | `I agree to these design-services terms and the flat design fee, and understand my signature alone does not authorize work until the studio countersigns.` |
| **rate_card + ceiling, all parts `clientVisible:false` except terms** | the legacy literal (rule 6) |

### 5.2 Drift test cases

Add **one new `describe` block** to `__tests__/consent-copy.test.ts`. Touch no existing block — the route-on-disk guard and every pinned branch must keep passing unchanged.

1. Empty parts array → exactly `consentLineFor('design_services')`.
2. `null`/`undefined` parts → exactly `consentLineFor('design_services')`.
3. The nine standard parts → the sentence in the table, asserted with `toBe`, not `toContain`.
4. Consultation set → `toBe`.
5. Flat only → `toBe`.
6. Per-phase + non-refundable retainer → `toBe`.
7. Furnishings/procurement only → `toBe`.
8. Record-only variants present (`percent_of_cost`, `cost_plus`, `day_rate`, `package`, `pricing_basis`, `draws`, `allowances`) alongside `flat` → identical to case 5 (record-only contributes nothing).
9. `clientVisible: false` on every money part → the legacy literal.
10. Fragment order is canonical: feed the same parts in reversed array order and assert the output equals case 3.
11. `cadence` alone → the legacy literal.
12. Kind `furnishings_authorization` with money parts → `consentLineFor('furnishings_authorization')` unchanged (W2 composes for services only).

**SQL/TS parity is asserted on the SQL side** (§6), by calling `compose_agreement_consent` on the same fixtures and comparing against these literals reproduced verbatim in the SQL test.

### 5.3 The door, attachments, and the sign route

`door-gate.tsx`:
- `consentLineFor(kind)` at `:579` becomes `composeConsentLine(kind, bundle.parts)`. **Nothing else in the gate changes** — the checkbox, the `SignatureLine`, the hint ladder, the error ink, the `HoldAction` are all as-is.
- Above the consent checkbox, when the bundle carries `attachment` parts with `payload.acknowledgeRequired`, one checkbox per attachment: **"I received {title}."** Each is required. `ready` becomes `ready && everyAcknowledgmentTicked`. The hint's not-ready branch gains: *"Tick each attachment you received, type your full name, and tick the line to sign."*
- On submit, POST body gains `attachmentsAcknowledged: string[]` (the acknowledged `part_key`s).

`app/api/proposals/[id]/sign/route.ts` — in the design-services branch only, pass a fifth argument:

```ts
p_consent: {
  consentSentence: commercialBundle?.consentSentence ?? null,
  attachmentsAcknowledged: acknowledgedKeys,
}
```

Read the sentence **from the bundle**, never from the browser — the client must not be able to choose what it consented to. `acknowledgedKeys` is validated server-side against the bundle's attachment parts; an unknown key → `400 invalid_name`? No: add no new token. Silently drop unknown keys and require that every `acknowledgeRequired` attachment appears; a shortfall → `409 not_signable`, an existing token the door already speaks. **Do not add a refusal token** — `REFUSAL_TOKENS` is pinned by the drift test against the route source on disk, and a new token means touching both.

`_sign_design_services_agreement_authorized` merges the payload into the signature row's `metadata` at insert:
`jsonb_build_object('via','sign_design_services_agreement','consentSentence', …, 'attachmentsAcknowledged', …)`.
Signature rows are immutable (`guard_commercial_immutable_row`, 00412:620-631) — this must happen at INSERT or not at all. The idempotent-retry branch (which compares `signer_user_id`/`signed_name`/`evidence_fingerprint`) is **not** extended to compare consent; a retry keeps the first row.

`commercial-document-shell.tsx` — W1 renders the parts in order. W2 adds only: an `attachment` part renders **outside** the main `<div className="mt-8 space-y-8">`, as its own leaf below the body, with its own rule and an `ATTACHMENT {A,B,C…}` mono eyebrow — attachments are leaves, not paragraphs (M5).

### 5.4 The keepsake reads the snapshot (R12)

`app/proposals/[id]/record/page.tsx` already exists — it is the keepsake, and `retired-routes.ts` deliberately leaves it standing. W2:

- When `bundle.executionSnapshot` is present, `RecordSheet` renders the frozen `html` inside a `<div>` (the snapshot is server-composed and already escaped) below the signature block, under a mono eyebrow **"The agreement as executed"**, followed by `checksumMark(documentHash)` — the existing helper in `lib/record-of-decision.ts`.
- The consent sentence shown on the record comes from the **signature metadata**, not from `compose_agreement_consent` — the record must print what she actually ticked, not what the parts would say today.
- No snapshot (a pre-W2 execution, or an agreement with no parts) → the page renders exactly as it does now. No empty state, no "snapshot pending".
- No PDF, no print stylesheet work, no download affordance (R12).

---

## 6. Tests

### SQL — `supabase/tests/commercial/agreement_library_test.sql`

Plain `psql` with `\set ON_ERROR_STOP on` and `ASSERT`, in the shape of `supabase/tests/commercial/design_services_authority_test.sql`. Fixtures: two studios, an owner, an admin, a plain active member, a non-member, one draft `design_services` proposal per studio.

1. **Seeded rows are immutable.** `UPDATE public.agreement_templates SET title='x' WHERE kind='seeded'` raises `insufficient_privilege`; `DELETE` likewise; the same UPDATE **succeeds** inside `SET LOCAL app.allow_patina_template_mutation = 'on'`.
2. **Owner-shape CHECK holds.** Inserting `kind='seeded'` with a `studio_id`, or `kind='studio'` with a `patina.*` key, raises `check_violation`.
3. **Studio write requires admin/owner.** As the plain member: `save_agreement_part` raises `insufficient_privilege`; `save_agreement_as_template` raises `insufficient_privilege`; `DELETE FROM agreement_templates` affects 0 rows (RLS). As the admin: all three succeed. As the owner: all three succeed.
4. **Every active member composes.** As the plain member, `SELECT` over both tables returns the studio's rows and every seeded row; `materialize_agreement_template` on their own draft **succeeds** (composing is not editing — R3).
5. **Cross-studio isolation.** Studio B's member sees zero of studio A's templates and parts; `materialize_agreement_template` with studio A's key raises `insufficient_privilege`.
6. **Materialize strips owner refs.** Seed a proposal part whose payload carries `{"proposalId":…, "studioId":…, "createdBy":…, "note":"keep me"}`, `save_agreement_as_template`, then `materialize_agreement_template` into a *different* draft: assert the resulting payload has none of those keys at any depth and still has `note = 'keep me'`. Assert the same for a nested object and an array element.
7. **Materialize replaces wholesale** and sets `source_template_key`; `source_part_id` is non-null for parts resolved from `studio_agreement_parts` and null for inline seeded bodies.
8. **A deleted Library part does not brick a template.** Save a template referencing a studio part, delete the part, materialize: the remaining entries land and the RPC does not raise.
9. **Materialize refuses a non-draft proposal** (`send` the proposal first) with the draft guard's error.
10. **The three seeded templates exist** with keys `patina.design_services` (nine parts, in the contract's order), `patina.consultation`, `patina.furnishings_services`, and `patina.design_build` **does not** exist.

### SQL — `supabase/tests/commercial/agreement_fee_schedules_test.sql`

1. **Consent sentence for four part sets** — `compose_agreement_consent` returns, byte-for-byte, the literals in §5.1's table for: (a) the nine standard parts, (b) consultation, (c) flat only, (d) per-phase + non-refundable retainer. Reproduce the literals verbatim in the test; a mismatch with `consent-copy.ts` is the drift this test exists to catch.
2. **Zero money parts** → the legacy literal, character for character.
3. **Record-only variants project nothing.** After `upsert_agreement_parts` with `cost_plus`, `percent_of_spend`, `day_rate`, `package`, `pricing_basis`, `draws`, `allowances` parts: `fee_basis`, `fee_amount_cents`, `fee_schedule` are all NULL and the consent sentence is unchanged.
4. **One fee basis.** A part set carrying both `flat` and `per_phase` raises `check_violation` with `'an agreement carries one fee basis'`.
5. **Projection.** `flat` $8,000 → `fee_basis='flat'`, `fee_amount_cents=800000`, `fee_schedule IS NULL`. `per_phase` [3500,4500,3000] → `fee_basis='per_phase'`, `fee_amount_cents=1100000`, `fee_schedule` is the three-element array. `retainer` with `creditRule='replenishing'` → `retainer_credit_rule='replenishing'`.
6. **Countersign snapshots the new columns.** Run the full rail (draft → parts → send → client sign → countersign) on a per-phase agreement and assert `project_billing_authorities` carries `fee_basis='per_phase'`, `fee_amount_cents`, the `fee_schedule` array, and `retainer_credit_rule`, all equal to the terms row.
7. **Snapshot hash equals the fingerprint at execution.** `agreement_execution_snapshots.document_hash = (SELECT evidence_fingerprint FROM commercial_document_signatures WHERE proposal_id=… AND party_role='studio')`, and `= _commercial_document_fingerprint(proposal_id)`. Assert `html` is non-empty, contains each client-visible part's title, and contains **no** `client_visible=false` part's title.
8. **The snapshot is immutable and one-per-proposal.** `UPDATE`/`DELETE` raise; a second countersign attempt (the retry path) leaves one row with the original `created_at`.
9. **Part events.** Two saves — add a part with `why='Added the study to the scope'`, then edit its payload with no why — produce an `added` row carrying the why and the actor's given name, and an `edited` row with `why IS NULL` and `actor_name IS NULL`. A no-op save writes nothing. `UPDATE`/`DELETE` on the event row raise.
10. **Events are studio-only.** As the client user, `SELECT` over `agreement_part_events` returns zero rows; the client bundle JSON has no key mentioning events.
11. **The bundle carries the snapshot and the sentence** after execution, and `executionSnapshot IS NULL` before it.
12. **Attachment acknowledgment lands in metadata.** Sign with `p_consent`; assert `commercial_document_signatures.metadata->>'consentSentence'` equals `compose_agreement_consent(...)` at signing time and `metadata->'attachmentsAcknowledged'` is the expected array.

### Existing SQL suites that must still pass

```
supabase/tests/commercial/design_services_authority_test.sql
supabase/tests/commercial/design_services_gap_hardening_test.sql
supabase/tests/commercial/multi_studio_signature_test.sql
supabase/tests/commercial/authorized_schedule_test.sql
supabase/tests/schedule/ceremony_hardening_test.sql
supabase/tests/edge_api/public_sd_hardening_contract_test.sql   (with §3.4's two re-pins)
```

### Jest — designer portal

`apps/designer-portal/src/components/document/rooms/drafting/agreement/__tests__/`

- `add-part-sheet.test.tsx` — the picker lists studio parts with a `studio` chip and seeded with `Patina`; a part already on the agreement is disabled; `Schedule ▾` lists 15 variants; each carries the right authority chip; choosing a blank clause calls the save mutation with a `custom.` key.
- `save-as-template-action.test.tsx` — hidden for a plain member; visible for an admin; a blank title is refused client-side; a successful save shows "Saved to your Library."; `insufficient_privilege` renders the owner/admin sentence.
- `template-picker-sheet.test.tsx` — confirmation copy appears before materializing; confirming calls the mutation with the chosen `template_key`.
- `schedules/authority-chip.test.tsx` — `record only (R9)` for each of the eight record-only variants; `creates authority` for the six; `creates authority · deposit only` for `procurement`.
- `part-history-strip.test.tsx` — renders nothing with zero events; renders the `why` line and the attribution; caps at five with a disclosure.

Mocks: `jest.mock('@patina/supabase', …)` is safe — `@patina/supabase` is absent from `apps/designer-portal/tsconfig.json` `paths`, so ordinary workspace resolution applies (the pattern `decisions-panel.test.tsx` already proves). If a spec's import graph reaches `@portabletext/react`, mock the leaf (`{ PortableText: () => null, toPlainText: () => '' }`) or the relative importer — do not touch `transformIgnorePatterns`.

**Flag-off byte-identity** (contract §6): a snapshot spec asserting the seven-facet room renders unchanged from `main` with both flags off. W1 owns that snapshot; W2 must **re-run it, not regenerate it**. A changed snapshot is a bug, not a snapshot to update.

### Jest — client portal

Coverage floor is enforced (70/60/70/70) — **every new file ships with its spec in the same change**.

- `__tests__/consent-copy.test.ts` — the twelve cases in §5.2.
- `__tests__/door-gate.test.tsx` (or the existing door spec) — acknowledgment checkboxes appear only for `acknowledgeRequired` attachments; `HoldAction` stays disabled until all are ticked; the POST body carries `attachmentsAcknowledged`.
- A record-page spec — the snapshot section renders when `executionSnapshot` is present and is absent when it is null.

### e2e touchpoint

`apps/client-portal/tests/threshold.spec.ts` (chromium-only config, `testDir ./tests`), one added test: a seeded per-phase agreement's door shows the composed consent sentence, the acknowledgment gate blocks the hold action until ticked, and after signing the DB carries the metadata. Assert the DB write with `expect.poll`, never after `networkidle`. No `page.waitForTimeout` — grep the diff for it before calling the spec done; nothing lints it.

---

## 7. Gates (exact commands, from `/Users/kody/Code/patina-merged`)

```bash
# ── Database ────────────────────────────────────────────────────────────────
export SUPABASE_DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
python3 scripts/generate-legacy-grants.py          # BOTH migrations add grants — mandatory
pnpm supabase:reset                                 # must apply clean, seeds included
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/commercial/agreement_library_test.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/commercial/agreement_fee_schedules_test.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/commercial/design_services_authority_test.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/commercial/design_services_gap_hardening_test.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/commercial/multi_studio_signature_test.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/commercial/authorized_schedule_test.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/schedule/ceremony_hardening_test.sql
./scripts/run-public-acl-psql.sh local supabase/tests/edge_api/public_sd_hardening_contract_test.sql

# ── Generated types ─────────────────────────────────────────────────────────
pnpm db:generate
git diff --exit-code packages/supabase/src/database.types.ts     # expect: no output

# ── Packages (@patina/types is DIST-resolved — rebuild or portals serve stale) ─
pnpm turbo build --filter=@patina/types
pnpm --filter @patina/types type-check
pnpm --filter @patina/supabase type-check
pnpm --filter @patina/supabase test

# ── Portals ─────────────────────────────────────────────────────────────────
pnpm --filter @patina/designer-portal type-check     # THE gate — build does not type-check
pnpm --filter @patina/designer-portal test           # FULL jest on a clean checkout = the merge gate
pnpm --filter @patina/designer-portal lint           # the only working ESLint config in the repo
pnpm --filter @patina/client-portal type-check
pnpm --filter @patina/client-portal test             # coverage floor 70/60/70/70
pnpm --filter @patina/client-portal test:e2e -- tests/threshold.spec.ts --workers=1
pnpm --filter @patina/admin-portal build             # strictest gate; required for any packages/ change

# ── Deno (only if proposal-send/handler.ts is touched) ──────────────────────
deno test --allow-all --config supabase/functions/deno.json supabase/functions/proposal-send/
rm -f deno.lock                                      # if one appears at the repo root
```

Designer QA runs with `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live` — the default `auto` silently serves mock data on any thrown call and will make a broken RLS path look green.

Root `pnpm test` / `pnpm type-check` are **not** substitutes: turbo silently skips workspaces lacking the script.

---

## 8. Review criteria

An adversarial reviewer (separate context; never the implementer) checks:

1. **Numbering** — both migration numbers exceed the tip at merge; the banner number matches the filename; no already-applied file was renumbered.
2. **Grafts** — every redefined function's body came from the `grep … | sort | tail -1` winner, verbatim, with only the named delta on top. Banner lineage lists every prior body. Specifically: does `_countersign_design_services_agreement_impl` still contain `'commercialDocumentId'` and the untouched `app_private.issue_invoice_for_actor( v_retainer_invoice_id, current_date, v_actor )` fragment?
3. **The hardening manifests** — both re-pinned rows updated in place with a comment naming the previous hash; counts still 17 and 9; `:2332`'s signature literal updated; the test actually run via `run-public-acl-psql.sh`, not skipped.
4. **Overloads** — `\df public.sign_design_services_agreement_with_trusted_ip` and `\df public.upsert_agreement_parts` each return exactly one row. A stale 4-arg overload is a shipped ambiguity.
5. **No new `issue_invoice_for_actor` caller** anywhere in the diff.
6. **RLS + grants in the same migration as each new table**; definer functions pin `search_path`; every sensitive function `REVOKE`s from `PUBLIC, anon` (not `PUBLIC` alone); extension functions schema-qualified (`extensions.gen_random_uuid`, `extensions.digest`) — a bare call passes locally and 42883s on Strata.
7. **`generate-legacy-grants.py` re-run** and the regenerated seed committed; the reset replays clean afterwards.
8. **R9 is enforced in the projection, not only in the UI** — a hand-crafted `cost_plus` part written through the RPC must leave `fee_basis` NULL. A reviewer should try it.
9. **R3 is enforced in RLS/RPC, not only in the UI** — a plain member's `save_agreement_part` must raise, with the button hidden as a courtesy on top.
10. **Owner refs really are stripped** — nested and array-element cases, not just top level.
11. **Consent parity** — the SQL literal in `agreement_fee_schedules_test.sql` and the TS literal in `consent-copy.test.ts` are the same string. Diff them by eye.
12. **The legacy consent literal is byte-identical** in the zero-fragment path, and every pre-existing block of `consent-copy.test.ts` is untouched.
13. **Flag-off byte-identity** — the W1 room snapshot re-ran green and was not regenerated; the client body with flags off is unchanged.
14. **Naming (R7)** — grep the diff for `clause library`, `contract builder`, `snippet`, `block`, `section` in any designer-facing string.
15. **No W3 leakage** — no `design_build`, no `per_draw`, no draw/attestation/jurisdiction table, no seeded `patina.design_build`.
16. **Fail-closed gates** — no W2 component renders while `isLoading`; every gate reads both flags; all hooks sit above every early return.
17. **Query keys** — one canonical key per entity; every mutation invalidates its list key and the cross-domain keys it touches (`['agreement-parts', proposalId]`, the commercial bundle, `['agreement-part-events', proposalId]`).
18. **Evidence in the report** — real command output, not paraphrase; an explicit list of what was not verified.

---

## 9. Walk script (14 steps)

Designer as an **owner or admin** of a two-studio account (the 00566 resolution path is the one that breaks); client as a separate signed-in homeowner. Both flags on for the walker; `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live`.

1. Open an existing executed-shape draft agreement in the Contract Room. The parts rail shows the nine standard parts in order, each with its kind glyph and, on the schedules, an authority chip.
2. Rail footer → **Save as template…** → title *"Full-service residential"* → save. Confirmation reads "Saved to your Library."
3. Account → Studio. The **Agreement Library** card sits below Billing, unchanged Billing above it. TEMPLATES lists *Design services (Patina standard)* `Patina` and *Full-service residential* `studio`. PARTS shows counts by kind.
4. Create a new lead and take it to a draft design agreement (the Discovery-seeded path — unchanged).
5. In the new draft's rail footer → **Start from a template…** → *Full-service residential* → confirm the replace warning → the nine parts land in order, each stamped as materialized.
6. Open **Role rates**, then the ceiling. Remove the `rate_card` part and add a **Per-phase fee** part from the picker's `Schedule ▾`. Enter three phases. The chip reads `creates authority`; the running total shows. Readiness stops asking for a ceiling (no rate card present — R4).
7. Add a **Cost-plus on purchases** part. Its chip reads `record only (R9)` and the help line says it does not create billing authority yet. Readiness does not block on it.
8. Send the agreement. The rail freezes (R6) — add/remove/reorder are gone; the send email names the document as a design services agreement.
9. As the client, open the door. The body shows the parts in the designer's order; the attachment (if the template carries one) sits below the paper as its own leaf with an **I received this** line.
10. The consent line under the checkbox reads the **composed** sentence — it names the per-phase fee schedule, not the role rates. Tick the acknowledgment, type the full name, press and hold to sign.
11. Countersign as the studio (from the two-studio account — this is the 00566 path).
12. In SQL: `SELECT fee_basis, fee_amount_cents, fee_schedule, retainer_credit_rule FROM project_billing_authorities WHERE source_proposal_id = …` → `fee_basis = 'per_phase'`, the amount and the array present.
13. As the client, open `/proposals/<id>/record`. The keepsake shows **The agreement as executed** with the frozen HTML, the checksum mark, and the consent sentence she actually ticked. In SQL, `agreement_execution_snapshots.document_hash` equals the studio signature's `evidence_fingerprint`.
14. As the designer, from the project's billing authority → **Create services addendum** → the sheet asks for a title and a one-line **why** (*"Added the study to the scope"*) with the attribution shown → confirm. The addendum opens in the room carrying the origin's part set; the ceiling part's history strip shows the change, its author, and the why.

Record every step; a failure at any step is a blocking finding, not a note.

---

## 10. Deploy set

Nothing ships without the full chain, in this order, from the **main checkout** (never a worktree — the env-inlining outage).

**1 · Migrations (Strata).**
```bash
supabase db push          # NNNNN_agreement_library.sql, NNNNN+1_agreement_fee_schedules.sql
```
⚠ Strata is deliberately behind on some numbers (00555/00557 and others are pending by design — never a plain unreviewed `db push` without checking `supabase migration list --linked` first). Confirm the applied tip, then probe the objects directly:
```bash
supabase db query --linked "select to_regclass('public.agreement_templates'), to_regclass('public.studio_agreement_parts'), to_regclass('public.agreement_part_events'), to_regclass('public.agreement_execution_snapshots');"
supabase db query --linked "select template_key from public.agreement_templates where kind='seeded' order by 1;"
supabase db query --linked "select pg_get_function_arguments(oid) from pg_proc where oid = to_regprocedure('public.sign_design_services_agreement_with_trusted_ip(uuid,text,uuid,text,jsonb)');"
```
The migrations ledger can lie; the object probe cannot.

**2 · Edge functions.** W2 changes **none by default**. `proposal-send/handler.ts` is touched only if the email lists part titles (optional per contract §5). If it is:
```bash
supabase functions deploy proposal-send
```
No `_shared/*` edit is planned. **If a lane ends up editing one anyway**, enumerate and redeploy every importer — a shared module is bundled per function, so an un-redeployed importer keeps the old copy:
```bash
grep -rl "_shared/<file>" supabase/functions --include=index.ts
```

**3 · Services.** None. No NestJS service is touched.

**4 · Portals.**
```bash
./infra/deploy-portal.sh designer-portal
./infra/deploy-portal.sh client-portal
```
Both — `packages/types` and `packages/supabase` changed, and the script's dist rebuild is the whole reason to use it. Never `opennextjs-cloudflare build` directly.

**5 · Verify.**
```bash
npx wrangler deployments list        # oldest-first — read the BOTTOM row
```
Then grep a served chunk for a new string (the `record only (R9)` label, say) and run a behavior probe. `/api/version` returns static fallbacks on the live Workers path and proves nothing.

**6 · Flag.** Kody creates PostHog flag **`agreement-library`**. Before enabling: verify it against `/flags` with a **real-browser UA** — a misconfigured flag matched everyone on 2026-09-04. The instant fail-closed lever is `NEXT_PUBLIC_FLAG_OVERRIDES=agreement-library:false`. The feature is dark until the flag exists; that is the intended state at deploy time.

**Rollback.** Flag off is the first lever: it reverts every studio surface; a composed agreement already sent keeps its parts for the homeowner (W2R2-03, R39). The Worker rollback ids from `wrangler deployments list` are the second. The migrations are additive (new tables, new nullable columns, widened function signatures) and are **not** rolled back — the four terms columns are nullable and the grafted countersign writes them only when parts exist, so an agreement composed before W2 executes exactly as it did.
