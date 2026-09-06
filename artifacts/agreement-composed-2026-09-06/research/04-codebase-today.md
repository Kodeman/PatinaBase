# 04 · The Agreement in the codebase today

Evidence floor for the "Agreement, Composed" proposal. Every claim below carries a `path:line`
verified against the file on disk at head (migration ledger head `00573`). Nothing here proposes a
design; it records what exists and where the joints are.

---

## 1. The agreement's data shape

There is no `agreements` table. The Agreement is `public.proposals` wearing a commercial hat, plus
five child tables. The whole rail was grafted in one migration,
`supabase/migrations/00412_design_services_commercial_authority.sql` (3,109 lines).

### `public.proposals` — the commercial columns

| Column | Definition | Where |
|---|---|---|
| `document_kind text NOT NULL DEFAULT 'legacy'` | CHECK `IN ('legacy','design_services','furnishings_authorization','service_addendum')` | `supabase/migrations/00412_design_services_commercial_authority.sql:25`, CHECK at `:33-39` |
| — widened | + `'trade_scope'` | `supabase/migrations/00423_trade_scope_instrument.sql:94-101` |
| `commercial_state text` | CHECK `IS NULL OR IN ('draft','sent','client_signed','executed','declined','expired','superseded')` | `00412:26`, CHECK at `:40-46` |
| `superseded_at`, `superseded_reason`, `replacement_proposal_id` | shape CHECK ties all three to `commercial_state = 'superseded'` | `00412:27-30`, CHECK at `:47-57` |
| `issued_on_paper boolean NOT NULL DEFAULT false` | true only via `_issue_design_services_agreement_on_paper` | `supabase/migrations/00477_design_services_paper_issue.sql:110` |
| `paper_issued_by uuid` | the studio member who handed over the printed copy | `00477:112-113` |
| `accepted_on_paper`, `acceptance_recorded_by`, `acceptance_scan_document_id` | paper provenance | `supabase/migrations/00425_executed_on_paper.sql:103,105,108` |

Both enum CHECKs are closed vocabularies on the parent row. A fifth kind cost a full `DROP
CONSTRAINT … ADD CONSTRAINT` migration (`00423:94-101`); a sixth would cost the same.

### `public.proposal_service_terms` — the whole agreement, one row

`00412:68-84`. Primary key is `proposal_id`, so an agreement has exactly one terms row and no
parts.

| Column | Constraint | Line |
|---|---|---|
| `proposal_id uuid PRIMARY KEY` | FK → `proposals(id) ON DELETE CASCADE` | `00412:69` |
| `scope text NOT NULL DEFAULT ''` | — | `00412:70` |
| `deliverables jsonb NOT NULL DEFAULT '[]'` | CHECK `jsonb_typeof(deliverables) = 'array'` | `00412:71` |
| `exclusions jsonb NOT NULL DEFAULT '[]'` | CHECK `jsonb_typeof(exclusions) = 'array'` | `00412:72` |
| `billing_ceiling_cents integer NOT NULL` | CHECK `>= 0` | `00412:73` |
| `retainer_amount_cents integer NOT NULL DEFAULT 0` | CHECK `>= 0` | `00412:74` |
| `retainer_activation_policy text NOT NULL DEFAULT 'immediate'` | CHECK `IN ('immediate','retainer_paid')` | `00412:75-76` |
| `billing_cadence text NOT NULL DEFAULT 'monthly'` | CHECK `IN ('monthly','biweekly','milestone')` | `00412:77-78` |
| `currency text NOT NULL DEFAULT 'USD'` | CHECK `~ '^[A-Z]{3}$'` | `00412:79` |
| `terms text` | nullable free text — the only prose escape hatch | `00412:80` |
| `current_rate_version integer NOT NULL DEFAULT 1` | CHECK `> 0` | `00412:81` |
| `furnishings_deposit_percent numeric` | added later; CHECK `NULL OR 0..100` | `supabase/migrations/00422_authorized_schedule_phase1.sql:140`, CHECK `:145-146` |

`deliverables` and `exclusions` are jsonb *arrays of strings* — the only repeatable content in the
row, and they carry no per-item id, note, optionality, or price. (The raw map called these
`jsonb[]`; the column type is plain `jsonb` with an array-shape CHECK.)

### `public.proposal_service_rates` — `00412:86-96`

`id`, `proposal_id`, `version integer CHECK (> 0)`, `role_name text CHECK (btrim length > 0)`,
`hourly_rate_cents integer CHECK (>= 0)`, `sort_order integer DEFAULT 0`, `effective_at`,
`created_at`; `UNIQUE (proposal_id, version, role_name)` at `00412:95`. This is the *only*
first-class repeatable list in the agreement.

### `public.commercial_document_signatures` — `00412:98-109`

`proposal_id` FK `ON DELETE RESTRICT`; `party_role text CHECK IN ('client','studio')` (`:101`);
`signer_user_id` FK → `profiles`; `signed_name text CHECK (btrim length >= 2)` (`:103`);
`signed_ip text`; `evidence_fingerprint text CHECK (char_length = 64)` (`:105`) — a sha256 hex
digest; `signed_at`; `metadata jsonb CHECK (jsonb_typeof = 'object')` (`:107`);
`UNIQUE (proposal_id, party_role)` (`:108`). Exactly two signatures per document, ever: one client,
one studio. A turnkey studio holding a subcontractor has no third party_role to sign as.

### `public.project_billing_authorities` — `00412:139-159`

`project_id`; `commercial_document_id uuid NOT NULL UNIQUE` → `project_commercial_documents`;
`source_proposal_id`; then the money snapshot, re-CHECKed with the same closed enums as the terms
row: `billing_ceiling_cents` (`:145`), `retainer_amount_cents` (`:146`),
`retainer_activation_policy … CHECK IN ('immediate','retainer_paid')` (`:147`),
`billing_cadence … CHECK IN ('monthly','biweekly','milestone')` (`:148`), `retainer_invoice_id`,
`effective_at`, `ended_at`, `status text DEFAULT 'active' CHECK IN ('active','superseded','exhausted')`
(`:152`). A partial unique index enforces exactly one active authority per project
(`00412:161-163`). Its rate snapshot is `project_billing_authority_rates` (`00412:164-176`),
`UNIQUE (billing_authority_id, version, role_name)`.

The binding row between them, `project_commercial_documents`, is at `00412:111-129` — note its own
`document_kind` CHECK omits `'legacy'` and `'trade_scope'` (`:115-117`).

RLS on the authored children is uniform: `proposal_service_terms_studio_rw` and
`proposal_service_rates_studio_rw` are `FOR ALL TO authenticated` gated on
`public.is_studio_comember(p.designer_id)` (`00412:318-325`); signatures are studio-read only
(`00412:327-329`). A client never reads these tables directly — only through
`get_client_commercial_document_bundle` (`00412:2938`, re-headed `00422:1911`).

---

## 2. The write path

**`upsert_design_services_draft(p_proposal_id, p_terms jsonb, p_rates jsonb)`** — head at
`supabase/migrations/00422_authorized_schedule_phase1.sql:1707`. It reads eleven keys off `p_terms`,
each named literally in the INSERT VALUES list at `00422:1754-1766` — `scope`, `deliverables`,
`exclusions`, `billingCeilingCents`, `retainerAmountCents`, `retainerActivationPolicy`,
`billingCadence`, `currency`, `terms`, `furnishingsDepositPercent` — plus `currentRateVersion` read
at `:1720`. Rates read five keys per element (`version`, `roleName`, `hourlyRateCents`, `sortOrder`,
`effectiveAt`) at `00422:1788-1793`. There is no passthrough column and no loop over unknown keys:
the function only ever projects named keys into named columns, so anything else the caller sends is
silently discarded. Rates are replaced wholesale (`00422:1780-1794`). Requires `status = 'draft'`
and `_can_author_proposal(designer_id)` (`:1732-1737`).

**`send_commercial_document(p_proposal_id, p_expected_fingerprint, …)`** — head at
`supabase/migrations/00423_trade_scope_instrument.sql:1546`. Refuses anything not `status = 'draft'`
(`:1585`), recomputes `_commercial_document_fingerprint` and refuses on mismatch with
`serialization_failure` (`:1592-1596`) — the optimistic-concurrency gate that makes fingerprint
coverage load-bearing. For `design_services`/`service_addendum` it requires a terms row and at least
one rate row (`00423:1608-1614`); trade scopes get a much richer set of send-time invariants
(`:1629-1660`). `draft → sent` runs through `app.proposal_send_id`.

**`sign_design_services_agreement_with_trusted_ip`** — head at
`supabase/migrations/00511_public_sd_hardening.sql:1825`. It is a thin capability wrapper: it
refuses unless `current_setting('role') = 'service_role'` (`:1841-1844`), mints
`app.commercial_signature_capability` (`:1846-1853`), and delegates to
`_sign_design_services_agreement_authorized` (`00412:767`). That implementation validates state
`IN ('sent','client_signed')` (`00412:805-809`), expiry (`:811`), presence of terms *and* rates
(`:815-820`), computes the fingerprint (`:822`), inserts the `client` signature row carrying that
fingerprint (`:841-848`), and flips `commercial_state = 'client_signed'` under
`app.commercial_document_id` (`:850-852`). It creates nothing else — no project, no authority.

**`_countersign_design_services_agreement_impl`** — current head
`supabase/migrations/00566_commercial_signature_studio_resolution.sql:304`. This is where money is
born. After resolving which studio the countersigner acts for (`00566:344-408`, the two-studio fix),
it writes the `studio` signature; for an origin agreement it inserts the
`project_commercial_documents` row with `is_origin = true` (`:702-707`) and anchors the first
schedule phase (`:713-726`), for an addendum it supersedes the prior authority (`:761-763`). If
`retainer_amount_cents > 0` it drafts and issues a retainer invoice (`:765-784`). Then the billing
authority:

```
INSERT INTO public.project_billing_authorities (
  project_id, commercial_document_id, source_proposal_id,
  billing_ceiling_cents, retainer_amount_cents, retainer_activation_policy,
  billing_cadence, retainer_invoice_id, effective_at
```

`00566:788-797`. The snapshotted columns are exactly `billing_ceiling_cents`,
`retainer_amount_cents`, `retainer_activation_policy`, `billing_cadence` — read off
`v_terms` (the `proposal_service_terms` row) — plus the retainer invoice id and the studio
signature timestamp as `effective_at`. Rates are snapshotted immediately after, one row per
`proposal_service_rates` row (`00566:799-804`). Nothing else on the terms row becomes authority:
`scope`, `deliverables`, `exclusions`, `terms`, `currency` and `furnishings_deposit_percent` are
contract prose that no downstream guard can enforce.

**`create_service_addendum(p_project_id, p_title)`** — head `00422:1816`. It requires an executed
origin (`:1837-1848`) and an active authority (`:1850-1858`), mints a new `proposals` row of kind
`service_addendum` (`:1860-1869`), then copies the origin's terms row column-by-column —
zeroing the retainer and forcing `'immediate'` (`:1870-1878`) — and copies every rate at
`version + 1` (`:1879-1886`). This is the forward path for change: a whole new immutable edition,
never an edit.

**`record_paper_client_signature(p_proposal_id, p_signed_name, p_paper_signed_on, p_scan_document_id, p_issue_on_paper)`**
— head `supabase/migrations/00477_design_services_paper_issue.sql:361`. Also a capability wrapper:
it sets `app.commercial_signature_capability` (`:377-381`), optionally issues the document on paper
first (`:385-387` — `draft → sent` with no email and no dispatch row), then calls
`_record_paper_client_signature_impl` (`:388-390`). The ordering comment at `:382-384` records why:
the signature-insert guard re-reads the proposal and refuses a client signature against anything
but `'sent'`.

---

## 3. The guards

**`guard_commercial_authored_child()`** — current head
`supabase/migrations/00423_trade_scope_instrument.sql:440`. Its body is three lines of policy:

```
IF NOT EXISTS (SELECT 1 FROM public.proposals p
  WHERE p.id = v_proposal_id AND p.status = 'draft')
THEN RAISE EXCEPTION '% is immutable after its proposal leaves draft'
```

`00423:452-458`, `ERRCODE = 'check_violation'`. It dispatches on `TG_TABLE_NAME` over exactly three
tables — `proposal_service_terms`, `proposal_service_rates`, `trade_scope_sections` (`00423:447-451`)
— and fires `BEFORE INSERT OR UPDATE OR DELETE` on each (`00412:658-663`, `00423:467-470`). **Terms
become immutable the instant `proposals.status` stops being `'draft'`** — i.e. at send, not at
signature. There is no amend-in-place window between `sent` and `executed`, and none after.

**`guard_commercial_proposal_authority()`** — current head
`supabase/migrations/00477_design_services_paper_issue.sql:127`, governing the *parent* row. A
non-legacy insert must start as `'draft'` (`:140-147`); `document_kind` is immutable once the
proposal leaves draft or is signed (`:151-156`); a `superseded` edition is terminal against ten
named columns (`:158-175`); `commercial_state`, the three supersession columns and the two
paper-issuance stamps move only under `app.commercial_document_id` / `app.commercial_cutover_id`
with `current_user = 'postgres'` (`v_exact_authority`, `:134-139`, enforced `:207-227`), with one
carve-out for the send rail keyed on `app.proposal_send_id` (`:186-193`).

**`guard_commercial_immutable_row()`** — `00412:603-616`. Blanket refusal: `IF TG_OP IN
('UPDATE','DELETE') THEN RAISE EXCEPTION '% rows are immutable'`. Attached to
`commercial_document_signatures` (UPDATE/DELETE), `project_commercial_documents` (DELETE),
`project_billing_authority_rates`, and `furnishing_authorization_items` (`00412:620-631`).

**`_commercial_document_fingerprint(p_proposal_id)`** — current head
`supabase/migrations/00423_trade_scope_instrument.sql:1214`. The hashed object, verbatim over
`00423:1221-1275`:

- `'proposal'` → `public._proposal_review_fingerprint(p_proposal_id)` (`:1222`)
- `'documentKind'` → `p.document_kind` (`:1223`)
- `'serviceTerms'` → `to_jsonb(t) - 'created_at' - 'updated_at'` from `proposal_service_terms` (`:1224-1227`)
- `'serviceRates'` → `jsonb_agg(to_jsonb(r) - 'id' - 'created_at' ORDER BY r.version, r.sort_order, r.role_name)` (`:1228-1231`)
- `'furnishings'` → an explicitly enumerated 14-field object per `furnishing_authorization_items` row (`:1232-1246`)
- `|| CASE WHEN p.document_kind = 'trade_scope' THEN jsonb_build_object('tradeScope', …)` covering `partyId`, `partyDisplayName`, `partyCompanyName`, `partyTrade`, `clientPriceCents`, `currency`, `terms`, `sections[roomName, projectRoomId, prose, allocationCents, sortOrder]`, `draws[label, percentage, amountCents, sortOrder, gatesOnAcceptance]` (`:1247-1272`)

Then `encode(extensions.digest(convert_to(…::text,'UTF8'),'sha256'),'hex')` (`:1221`, `:1273`).

Two properties matter for a modular agreement. First, `serviceTerms` uses `to_jsonb(t)`, so a new
*column* on `proposal_service_terms` is automatically covered — which is why `furnishings_deposit_percent`
needed no fingerprint edit. (The raw map's "closed field list" is too strong for that branch.)
Second, the closure is at the **table** level: a new agreement-parts table would be invisible to the
hash, and the client's signature would then attest to a document that omits the parts they read.
`furnishings` and `tradeScope` each had to be hand-added when their tables arrived —
`00412:704` → `00422:251` → `00423:1214` is the record of that.

---

## 4. The Contract Room

`apps/designer-portal/src/components/document/rooms/drafting/service-agreement-drafting-room.tsx`
(694 lines). Room title `"The Contract Room · Design Agreement"` at `:268`; the counter
`` `${Math.max(0, completed)} of 7 facets written` `` at `:269`, where `completed` is literally
`7 - blockers.length` (excluding the client-link blocker) at `:192-195`.

The seven facets are JSX literals in fixed order, none addable, removable, renamable or reorderable:

| # | Heading | `index=` | `title=` |
|---|---|---|---|
| 01 | Services & deliverables | `:356` | `:357` |
| 02 | Exclusions | `:389` | `:390` |
| 03 | Role rates | `:409` | `:410` |
| 04 | Rates & ceiling | `:464` | `:465` |
| 05 | Retainer | `:543` | `:544` |
| 06 | Billing cadence | `:582` | `:583` |
| 07 | Terms | `:604` | `:605` |

Other fixed content in the same file: `DEFAULT_DELIVERABLES = ["Concept presentation","Design
documentation","Selection schedules"]` at `:30-34`; `DEFAULT_EXCLUSIONS = ["Construction
labor","Furnishings, freight, tax, and installation"]` at `:35-38`; a default scope sentence at
`:48-50`; `DEPOSIT_CHIPS = [0, 25, 50, 100] as const` at `:67` (rendered at `:485`, with an
"other" input at `:507`); the retainer activation `<Select>` at `:563` with options
`immediate`/`retainer_paid` at `:574-575`; the cadence `<Select>` at `:586` with options
`monthly`/`biweekly`/`milestone` at `:597-599`; and the one repeatable, `+ Add a role`, at `:459`.
Deliverables and exclusions are newline-split textareas (`:377`, `:399`) — the split *is* the data
model.

`apps/designer-portal/src/lib/document/commercial-documents.ts` `assessServiceAgreementReadiness`
(`:162`) hard-codes the blocker list, one `blockers.push` per facet:

| Blocker string | Line |
|---|---|
| "Only a design services agreement or addendum can use this send review." | `:180-182` |
| "Only a draft agreement can be sent." | `:185` |
| "Name the services included in this agreement." | `:188` |
| "Add at least one client deliverable." | `:191` |
| "State what is not included." | `:194` |
| "Add at least one role with an hourly rate." | `:204` |
| "Set the design authorization ceiling." (blocks when `billingCeilingCents <= 0`) | `:206-212` |
| "Set a valid retainer amount, including zero when none is due." | `:218-220` |
| "Choose when the agreement becomes active." | `:223` |
| "Set the furnishings deposit percent, including zero when none is due." | `:234-236` |
| "Choose a billing cadence." | `:244` |
| "Write the agreement terms." | `:247` |
| "Link a client with an email address." | `:250` |

Only the furnishings deposit is soft — an unset value produces a `notes` entry instead
(`:241-243`). A studio that bills flat-fee, or that wants no ceiling, cannot send: the ceiling
blocker at `:211` requires a positive number.

`commercialStatusView` (`:354`) hard-codes label, description and tone for all seven commercial
states in a single `switch` (`:369-434`), plus a paper-provenance suffix (`:437-446`).

`components/document/rooms/drafting/draft-proposal-opener.tsx:6-7` carries the ruling in a comment:
*"It creates an EMPTY draft design agreement (no template — templates are retired per R85; the
Discovery-seeded path covers the seeded case)"*. The registry names the room at
`apps/designer-portal/src/lib/document/registry.tsx:125` (key `drafting-room`) and `:127` (label
`Contract Room`); the ⌘K verb "Draft a design agreement" is at `:289`, with the blurb at `:305`.

---

## 5. The client copy

**Designer-side mirror.** `apps/designer-portal/src/components/document/commercial/service-agreement-preview.tsx`
(246 lines) renders seven `<section>` blocks in fixed order:

| Section | Line |
|---|---|
| Services | `:91-97` (heading `:92`) |
| What you will receive (conditional on non-empty deliverables) | `:99-114` (heading `:100`) |
| Not included (conditional on non-empty exclusions) | `:115-124` (heading `:116`) |
| How design time is billed (rates + ceiling) | `:125-159` (heading `:126`) |
| Retainer / Billing cadence / Furnishings deposit grid | `:160-203` |
| Agreement terms | `:204-210` (heading `:205`) |
| Agreement signatures (client + studio, hard-coded pair) | `:211-244` (`aria-label` `:212`, party tuple `:215`) |

(The raw map said six; there are seven.) The data it renders comes from an allowlisted DTO,
`ServiceAgreementPreview` (`apps/designer-portal/src/lib/document/commercial-documents.ts:257-281`)
built by `buildServiceAgreementPreview` (`:282-321`) — a field-by-field projection. Anything not
in that interface cannot reach the client copy.

**Client-portal render.** The homeowner does *not* see the designer's component. A third,
independently hard-coded structure lives at
`apps/client-portal/src/components/commercial-document-shell.tsx`: kind labels at `:26-27`, the
branch to `DesignServicesBody` at `:159-161`, and the body itself at `:179-262` with its own
sections — Services (`:195`), Deliverables (`:202`), "Rates & design authorization" (`:211`),
Retainer / Billing cadence grid (`:230-249`), Terms (`:251`), exclusions (`:258`). Note the heading
wording diverges from the designer mirror ("Deliverables" vs "What you will receive") — two renders
of one document that must be kept in step by hand.

**The door.** `apps/client-portal/src/components/threshold/door-gate.tsx` renders the consent
checkbox with `consentLineFor(kind)` at `:579` and the act label with `signLabelFor(kind)` at
`:655`. Both live in `apps/client-portal/src/components/threshold/consent-copy.ts`:
`consentLineFor` `:26-37` (furnishings `:28`, trade scope `:31`, the two design-services kinds
`:34`, fallback `:36`); `signLabelFor` `:40-44`; `summaryLineFor` `:52-60` (the design-services
sentence — "the services, signed role rates, design authorization ceiling, retainer, and terms" —
at `:59`); `SIGNATURE_NOTICE` `:63`; `KIND_LABEL` `:68-73`; refusals `:82-90`. The header (`:3-18`)
says these strings were byte-copied from the retired signing route and may not be reworded.

The drift guard is `apps/client-portal/src/components/threshold/__tests__/consent-copy.test.ts`,
which reads the live route off disk — `const SIGN_ROUTE = readFileSync(join(SRC,
'app/api/proposals/[id]/sign/route.ts'), 'utf8')` at `:27` — and pins every branch
(`:57-95`) and every refusal token (`:29-41`). Any new agreement kind, or any reworded consent,
breaks this test by design.

**The signing route.** `apps/client-portal/src/app/api/proposals/[id]/sign/route.ts` resolves
`document_kind` fail-closed from `get_client_commercial_document_bundle` (`:62-74`) and dispatches:
`furnishings_authorization` → `execute_furnishings_authorization_with_trusted_ip` (`:124-131`);
`trade_scope` → `execute_trade_scope_with_trusted_ip` (`:178-187`); design services / addendum →
`sign_design_services_agreement_with_trusted_ip` (`:235-243`); `legacy` → `410
legacy_signing_retired` (`:269-271`); anything else → `404 not_found` (`:273`). Notifications fire
via `notifyCommercialTransition` with `'client_signed'` (`:253`), `'furnishings_executed'`,
`'trade_scope_executed'` (`:206`) or `'deposit_ready'` (the union is declared at `:14`).

---

## 6. Email and notification

`supabase/functions/proposal-send/handler.ts` branches on the dispatch's `documentKind` (declared
`:47-52`): `isServices` at `:240-241`, `isFurnishings` `:242`, `isTradeScope` `:243`. From those
booleans it derives the document label (`:244-250`), the subject (`:251-252`), the body paragraph
(`:253-259` — the design-services one names "role-based rates, retainer policy, billing cadence,
ceiling, and terms"), the eyebrow (`:265-271`), the heading `'Your design agreement is ready'`
(`:275`) and the CTA `'Review agreement'` (`:290`). Adding an agreement variant means editing five
parallel ternaries in one function.

`supabase/functions/commercial-document-notify/policy.ts` fixes who may cause which transition and
which kinds accept it: `STUDIO_TRANSITIONS` (`:53-59`), `CLIENT_TRANSITIONS` (`:61-67`),
`SERVICES_KINDS = {design_services, service_addendum}` (`:69`), `SERVICES_TRANSITIONS =
{client_signed, executed, budget_published}` (`:71-75`), `FURNISHINGS_ONLY_TRANSITIONS` (`:77-80`),
`TRADE_SCOPE_ONLY_TRANSITIONS` (`:82-87`), `EVENT_SCOPED_TRANSITIONS` (`:93-96`); enforcement at
`actorCanNotify` (`:98-104`) and `documentKindCanNotify` (`:107-124`), with per-transition evidence
checks from `:193`.

**No agreement PDF exists.** `supabase/functions/spec-pdf/index.ts` is the only renderer, and its
contract (`:15-22`) accepts `kind: 'item' | 'document' | 'board' | 'board-composition'` — a
single-item specification sheet, a whole-project specification schedule, a board tile grid, or a
persisted board composition. Nothing in it references `design_services`, and
`proposal-send/handler.ts` attaches no file. A signed agreement exists only as HTML in two portals
plus a 64-character digest.

---

## 7. Duplicated DTOs

`packages/types/src/commercial.ts` (295 lines) declares the canonical shapes:
`COMMERCIAL_DOCUMENT_KINDS` (`:9-15`), `COMMERCIAL_STATES` (`:19-27`), `RetainerActivationPolicy`
and `BillingCadence` (`:31-32`), `DesignServiceTerms` (`:41-55`), `DesignServiceRate` (`:56-62`).

`apps/designer-portal/src/lib/document/commercial-documents.ts` re-declares all of them:
`COMMERCIAL_DOCUMENT_KINDS` (`:19`), `COMMERCIAL_STATES` (`:31`), `RetainerActivationPolicy` and
`BillingCadence` (`:32-33`), `ServiceAgreementTerms` (`:49-70`), `ServiceRate` (`:71-79`). The file
header states the intent at `:1-8`: *"Wave 1 intentionally keeps this adapter beside the designer UI
while the canonical workspace DTOs land on the integration branch."*

They have already drifted. The app-local `ServiceAgreementTerms` carries
`furnishingsDepositPercent: number | null` (`:69`, with a 6-line R8 comment at `:63-68`) and
`updatedAt: string | null` (`:62`); the canonical `DesignServiceTerms` has no deposit field at all
and types `updatedAt: string` non-null (`packages/types/src/commercial.ts:53`). The client portal
maintains a *third* mapping of the same rows in
`apps/client-portal/src/lib/commercial-documents.ts:516-530`.

---

## 8. Reusable building blocks

**`board_templates`** — `supabase/migrations/00408_board_templates.sql:18-50`. The closest existing
model for a studio template layer, and the one worth copying.
- `kind text NOT NULL CHECK (kind IN ('seeded','studio'))` — `:23`; `studio_id uuid REFERENCES
  organizations ON DELETE CASCADE` — `:24`; `template_key text NOT NULL UNIQUE` — `:20`.
- Owner-shape CHECK `board_templates_owner_shape` (`:37-49`): `kind='seeded'` requires
  `studio_id IS NULL`, `created_by IS NULL`, `template_key LIKE 'patina.%'`; `kind='studio'` requires
  `studio_id IS NOT NULL` and `template_key LIKE 'studio.%'`.
- Patina starters immutable except under a maintenance GUC
  (`app.allow_patina_template_mutation`, `:80-86`); studio rows protected against
  key/owner/geometry/content rewrites at `:88-100`.
- RLS `board_templates_select` (`:129-144`): seeded readable by all; studio readable when
  `public.is_active_org_member(studio.id)` on an active `design_studio` (`:135-141`). Update/delete
  at `:148`, `:175`.
- `save_board_as_template(p_board_id, p_studio_id, p_name, p_description)` — `:265-270` (snapshot,
  owner refs stripped); `materialize_board_template(p_template_id, p_proposal_id, p_project_id,
  p_name, p_scope_room_id)` — `:397-403`. Grants `:587-597`.

**`phase_templates`** — `supabase/migrations/00135_proposal_phase_templates.sql:43-54`. Blueprint
array in `phases JSONB NOT NULL` (`:50`), `is_system BOOLEAN DEFAULT true` (`:48`),
`designer_id UUID NULL REFERENCES profiles(id)` (`:49`). It is **designer-scoped, not
studio-scoped**: RLS reads `is_system OR designer_id = auth.uid()` (`:70-74`) and writes require
`designer_id = auth.uid() AND NOT is_system` (`:77-98`). Two designers in one studio cannot see each
other's phase templates. `apply_phase_template(UUID, TEXT)` at `:479`, granted at `:585`.

**`proposal_templates`** — `supabase/migrations/00063_proposal_system_v2.sql:12-22`:
`sections_config JSONB DEFAULT '[]'` (`:16`), `is_system BOOLEAN DEFAULT false` (`:18`),
`created_by UUID REFERENCES profiles(id)` (`:19`). RLS is **per-user**, not per-studio: read system
rows (`:25-26`), read own (`:28-29`), manage own (`:31-32`). Retired by R85, but the table and its
seeds (`:143`) still exist, and two call sites survive in
`packages/supabase/src/hooks/use-proposals.ts:600` (materialize `sections_config` into
`proposal_sections` on create) and `:1485` (the `['proposal-templates']` list query).

**`studio_billing_settings`** — `supabase/migrations/00428_invoice_payment_method_surcharge.sql:42-51`:
`studio_id uuid PRIMARY KEY REFERENCES organizations`, `card_surcharge_bps integer NOT NULL DEFAULT
300 CHECK (0..300)` (`:45-47`), `check_remit_to text` (`:48`). RLS uses the two helpers a
studio-defaults table should reuse verbatim: `public.is_active_studio_member(studio_id)` for select
(`:65-68`), `public.is_org_admin_or_owner(studio_id)` for insert (`:71-74`) and update (`:77-81`).
UI home: `apps/designer-portal/src/components/document/account/account-studio-page.tsx` — Billing
card `:809-885` (heading `:811`), state `:202`, seeded `:206-208`, `handleSaveBilling` `:324`,
save-on-dirty predicate `:475-480` driving the disabled button `:880-882`.

**`client_visibility_tier`** — `supabase/migrations/00141_proposal_client_visibility_tier.sql:15`
adds it to `proposals`, CHECK `IN ('full','milestone','curated')` at `:27-28`, defaulting to
`'milestone'` when a project is created (`:115`). An existing per-document dial for how much the
client sees.

**Un-CHECKed vocabulary pattern.** `supabase/migrations/00417_studio_contacts.sql:87` declares
`contact_kind text NOT NULL` with *no* CHECK; the comment at `:130-135` states the doctrine: *"Free
TEXT, no CHECK — the vocab is code-resident in packages/types/src/studio-config.ts (ContactKind) …
so it grows without a migration."* Same for `specialties text[]` (`:98`, comment `:137`). The
code-resident vocabularies: `packages/types/src/studio-config.ts` `StaffRole` (`:14`),
`ALL_STAFF_ROLES` (`:26`), `VendorSpecialty` (`:76`), `ALL_VENDOR_SPECIALTIES` (`:99`),
`ContactScope` (`:157`), `ReachState` (`:169`). Contrast `project_parties.party_kind`, which *is*
CHECKed — `('gc','vendor','client_rep','other')` at
`supabase/migrations/00212_project_parties.sql:30-31`, widened to eleven values at
`supabase/migrations/00419_project_roster_wiring.sql:44-49`: a migration per new party type.

**The trade/sub instrument** — `supabase/migrations/00423_trade_scope_instrument.sql`:
`trade_scope_terms` (`:144`) with `progress_state text CHECK IN
('none','engaged','in_progress','substantially_complete','accepted')` (`:153-155`) and an
acceptance-shape CHECK at `:170-177`; `trade_scope_sections` (`:192`); `trade_scope_bids` (`:213`,
studio-only); and `trade_scope_draws` (`:256-273`) — `label text NOT NULL` (`:259`),
`percentage numeric CHECK (NULL OR 0..100)` (`:263-265`, display only), `amount_cents integer NOT
NULL CHECK (> 0)` (`:266`), `sort_order` (`:267`), `gates_on_acceptance boolean DEFAULT false`
(`:268`), `invoice_id` (`:269`), plus `UNIQUE (proposal_id, sort_order)` (`:279-280`). The
acceptance gate is enforced at send: Σ`amount_cents` must equal
`trade_scope_terms.client_price_cents` (`:1653-1656`), exactly one draw may gate on acceptance and it
must be last (`00423:1648-1650` gathers the counts; table comment at `:281`). This is the only place
in the codebase where a studio holds a *named third party* under a client-facing instrument.

**RLS helpers at head.** `public.is_studio_comember(uuid)` —
`supabase/migrations/00556_admin_studio_management.sql:51-76` (SECURITY DEFINER, STABLE, granted to
`authenticated, service_role` at `:79`). `public.is_active_studio_member(uuid)` —
`supabase/migrations/00417_studio_contacts.sql:40-55`, granted at `:58`.
`public.is_org_admin_or_owner(_organization_id, _user_id DEFAULT auth.uid())` —
`supabase/migrations/00484_public_rpc_authorization_contract.sql:604-624`.
`public.is_active_org_member(uuid)` — `supabase/migrations/00556_admin_studio_management.sql:86`.

---

## 9. Rulings on record

**R85** — `docs/design/the-document/DECISIONS.md:2680` (body `:2682`): *"The Terms facet gains the
**free-text agreement body** (the old TermsSection is still client-rendered — the designer must be
able to author it). **Proposal templates are retired** — the seeded-from-Discovery path covers the
job."* Closes PRO-01/03/07.

**The carve-out** — `docs/design/the-document/DECISIONS.md:9019-9022`: *"Two entries are spared …
and **design-services agreements and their addenda**, whose authoring is
`ServiceAgreementDraftingRoom` and was never part of this decomposition."* The Contract Room was
explicitly held out of the Drafting Room's dissolution.

**PRO-01** — `docs/design/the-document/the-document-needs-ruling-2026-07.md:43`: *"Are proposal
templates (useProposalTemplates) and an ad-hoc 'new proposal without a lead/discovery walk'
intentionally retired, or do they need a Document home?"* Answered by R85.

**PRO-07** — same file `:45`: *"Is the free-text proposal terms/agreement body (old TermsSection,
still client-rendered) intentionally retired in favor of change-order terms only, or does it need a
Drafting Room home?"* Answered by R85.

**PRJ-04/05/06** — `:36`, `:37`, `:38`. Open: where scope-change requests live, whether they need
fee/timeline impact grammar and a send act, and what the Document act for reviewing/applying one is.
`:38` records that today *"the R14 escalation produces a draft that only /portal can advance."*
These are the nearest thing to an "amend the agreement" ruling, and they are unresolved.

**Capability ledger** — `docs/design/workflow-completion/CAPABILITY-LEDGER.md:21`, stage 03 Scope &
Engagement, Wave-1 target: *"Bind proposals and agreements to one immutable studio service-package
version and the project's commercial responsibility profile."* A studio-level package version is
already the recorded intent.

---

## 10. The rigidity ledger

| # | Rigidity | Best citation | What a modular system must change |
|---|---|---|---|
| 1 | Seven fixed facets, JSX literals in fixed order | `apps/designer-portal/src/components/document/rooms/drafting/service-agreement-drafting-room.tsx:356-605` | The room must render from data (an ordered part list), not from a hand-written section sequence. |
| 2 | Fixed columns, not parts — one wide PK-per-proposal row | `supabase/migrations/00412_design_services_commercial_authority.sql:68-84` | A part needs its own row with a kind, an order, and a payload; the terms row survives only for the typed money the guards enforce. |
| 3 | Hard-coded readiness, thirteen literal blockers | `apps/designer-portal/src/lib/document/commercial-documents.ts:180-250` | Readiness must be derived from each part's own required-ness, not from a fixed list; the ceiling blocker (`:211`) must become conditional. |
| 4 | Fixed enums — cadence, activation policy, kind, state | `00412:75-78`; `00412:33-46`; `00423:94-101` | Either widen the CHECKs per new commercial shape, or adopt the un-CHECKed code-resident pattern (`00417:87`) for anything that is vocabulary rather than money. |
| 5 | Freeze at draft exit, not at signature | `supabase/migrations/00423_trade_scope_instrument.sql:440-461` | Decide whether parts freeze at `sent` (today) or at `client_signed`; an addendum/supersede path is currently the only edit. |
| 6 | No template layer — templates retired by ruling | `apps/designer-portal/src/components/document/rooms/drafting/draft-proposal-opener.tsx:6-7`; `DECISIONS.md:2682` | R85 must be revisited or scoped; a studio template is a different object from the per-user `proposal_templates` R85 killed. |
| 7 | No studio-level agreement defaults | `supabase/migrations/00428_invoice_payment_method_surcharge.sql:42-51` (holds only card fee + remit-to) | A studio-scoped defaults/templates table on the `board_templates` shape (`00408:18-49`), reusing `is_active_studio_member` / `is_org_admin_or_owner`. |
| 8 | Rates are the only repeatable; deliverables/exclusions are newline-split strings | `service-agreement-drafting-room.tsx:459` vs `:377`, `:399` | Every list part needs identity and order, so an item can carry a note, an option flag, or a price. |
| 9 | Fixed client render — three independent hard-coded structures | `apps/client-portal/src/components/commercial-document-shell.tsx:179-262`; `service-agreement-preview.tsx:91-244`; `consent-copy.ts:26-60` | One part list must drive all three surfaces, or the drift guard (`__tests__/consent-copy.test.ts:27`) becomes unmaintainable. |
| 10 | No agreement PDF | `supabase/functions/spec-pdf/index.ts:15-22` (item/document/board/board-composition only) | A variable-shape agreement makes "what did they actually sign" harder, not easier, without a rendered artifact. |
| 11 | Duplicated DTOs, already drifted | `packages/types/src/commercial.ts:41-55` vs `apps/designer-portal/src/lib/document/commercial-documents.ts:1-8, 49-70` | Collapse to one contract before adding a part model, or the drift multiplies by the number of part kinds. |
| 12 | Closed fingerprint — table-level, not column-level | `supabase/migrations/00423_trade_scope_instrument.sql:1214-1275` | A new parts table must be folded into the hash in the same migration that creates it, or signed evidence silently stops covering what the client read. |

---

## Constraints a new design must respect

1. **The fingerprint must cover every part the client reads.** It is table-scoped
   (`00423:1224-1246`), and `send_commercial_document` refuses on mismatch (`00423:1592-1596`), so a
   parts table added without a fingerprint edit produces signatures that attest to less than the
   document shows.
2. **Only typed money may create billing authority.** `project_billing_authorities` snapshots
   exactly four terms columns (`00566:788-797`), each re-CHECKed against the same closed enums
   (`00412:145-152`). Free-form parts can be contract prose; they cannot silently become a ceiling,
   a cadence, or an activation rule.
3. **Immutability semantics are set at send, not at signature.** `guard_commercial_authored_child`
   keys on `proposals.status = 'draft'` (`00423:452-455`). Any new child table must attach to that
   guard (its `TG_TABLE_NAME` dispatch, `00423:447-451`) or be deliberately excluded, and the choice
   must be explicit.
4. **Lifecycle columns move only under transaction-local GUCs.** `commercial_state`,
   `issued_on_paper` and the supersession trio require `current_user = 'postgres'` plus
   `app.commercial_document_id` / `app.proposal_send_id` (`00477:134-139`, `:207-227`). New RPCs
   must set and restore those, not bypass them.
5. **Reuse the existing RLS helper names.** `public.is_studio_comember(uuid)` (`00556:51`) for
   proposal-owned children, `public.is_active_studio_member(uuid)` (`00417:40`) for studio-owned
   rows, `public.is_org_admin_or_owner(uuid, uuid)` (`00484:604`) for who may change studio
   defaults, `public.is_active_org_member(uuid)` (`00556:86`) where `board_templates` uses it.
6. **A studio template must be studio-scoped, not designer-scoped.** `phase_templates`
   (`00135:49, :70-74`) and `proposal_templates` (`00063:19, :31-32`) are both per-user; only
   `board_templates` (`00408:24, :37-49, :129-144`) gets the ownership shape and namespacing right.
7. **The signature table admits exactly two parties.** `party_role CHECK IN ('client','studio')`
   with `UNIQUE (proposal_id, party_role)` (`00412:101, :108`). A turnkey studio holding a
   subcontractor either uses the separate `trade_scope` instrument (`00423:144`) or needs this
   constraint reopened deliberately.
8. **Consent copy is pinned by a disk-reading drift test.** `consent-copy.ts:26-60` and
   `__tests__/consent-copy.test.ts:27` must both learn any new kind or reworded consent in the same
   change, and the sign route's branch order (`sign/route.ts:124, 178, 235, 269`) is what the test
   reads.
