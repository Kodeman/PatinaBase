# Backend & Notification Backbone Behind Client Approvals and Proposal Signatures

_Discovery doc for the UX team. Read-only research against `/Users/kody/Code/patina-merged` main checkout, migrations and edge functions read directly. Every claim below is cited `file:line`; SQL guard messages and email copy are quoted verbatim._

---

## 1. Schema — current shape

### 1.1 `proposals`

Base table `supabase/migrations/00014_portal_business_features.sql:119-165`, extended by many later migrations.

| Column | Type | Meaning | Added in |
|---|---|---|---|
| id | uuid PK | — | 00014:120 |
| project_id | uuid FK projects | set once activated | 00014:123 |
| designer_id | uuid FK profiles NOT NULL | owner | 00014:124 |
| client_id | uuid FK profiles | recipient | 00014:125 |
| title, description, cover_image | text | content | 00014:128-130 |
| subtotal, discount_amount, discount_percent, tax_rate, tax_amount, total_amount | int/decimal (cents) | pricing | 00014:133-138 |
| deposit_percent, payment_terms, payment_notes | | payment terms | 00014:141-143 |
| valid_until | timestamptz | functions as "expires_at" — **no column literally named `expires_at` exists on `proposals`**; only `document_shares.expires_at` (00266/00390) is separately named | 00014:146 |
| status | text NOT NULL DEFAULT 'draft' | free text, **no CHECK constraint anywhere** (confirmed — no `proposals_status_check` exists in the migration tree). Observed vocabulary: `'draft','sent','viewed','accepted','declined','expired','revised'` (00014:148; corroborated by 00390:1392,1455,1476 using `IN ('draft','sent','viewed','accepted','declined','expired')`, and 00176/00384 referencing `'revised'`) | 00014:148 |
| version, parent_proposal_id | | revision chain | 00014:149-150 |
| sent_at, viewed_at, accepted_at, declined_at, decline_reason | timestamptz/text | lifecycle tracking | 00014:153-158 |
| created_at, updated_at | | — | 00014:161-162 |
| template_id, revision_summary, client_feedback, personal_message, cc_email, signed_at, signed_by_name, signed_ip | | send/sign metadata | 00063_proposal_system_v2.sql:39-46 |
| project_address | text | site address carried onto the proposal | 00136_proposal_project_site_address.sql:13-14 |
| client_visibility_tier | text DEFAULT 'milestone', CHECK IN `('full','milestone','curated')` | how much of the project the client sees post-activation | 00141_proposal_client_visibility_tier.sql:14-29 |
| last_nudged_at, nudge_count | timestamptz / int DEFAULT 0 | reminder tracking | 00231_proposal_nudge.sql:13-15 |
| proposal_send_dispatch_id | uuid | FK to the send-outbox row (§1.1.1) | 00388_proposal_send_dispatch_guard.sql:16-17 |

There is no `expires_at` column, and no `event_type` CHECK anywhere on `proposal_engagement` (see §1.3) — both are worth flagging as UX-relevant gaps in the data model itself (a UX team asking "when does this proposal expire" should be pointed at `valid_until`, and any request for a controlled telemetry vocabulary needs a new constraint, not just documentation).

#### 1.1.1 `proposal_send_dispatches` (the send outbox)

`00388_proposal_send_dispatch_guard.sql:19-56` — an immutable outbox row created per send attempt: `state` CHECK IN `('pending','in_flight','delivered','suppressed','failed','ambiguous','unconfirmed')`; `claimed_from_state` CHECK IN `('pending','failed','ambiguous')`; `provider_idempotency_key`, `email_log_id`, `in_app_log_id` (both UNIQUE); a full immutable render snapshot (`recipient_email`, `designer_name`, `studio_name`/`logo`, `client_portal_path`, etc.) so the edge function never re-derives content from mutable rows after the fact — the record of what the client was actually shown is frozen at send time.

### 1.2 `proposal_items` / `proposal_sections` / `proposal_phases`

**`proposal_items`** — `00014_portal_business_features.sql:237-269`: `product_id`, `name`, `description`, `image_url`, `room`, `category`, `quantity`, `unit_price`, `markup_percent`, `unit_sell_price`, `line_total` (int cents), `vendor_id`, `vendor_name`, `lead_time_weeks`, `notes`, `internal_notes`, `position`. `line_total` renamed to `line_total_cents` by `00142_proposal_items_line_total_rename.sql:14`. Extended for fixed/allowance/TBD pricing types at `00066_proposal_project_flow_v2.sql:178-190` (adds `item_type`, `scope_room_id`).

**`proposal_sections`** — `00063_proposal_system_v2.sql:57-77`: `proposal_id`, `type` (free text: vision/concept/space_plan/selections/investment/timeline/terms), `title`, `body`, `metadata` jsonb, `sort_order`.

**`proposal_phases`** — `00066_proposal_project_flow_v2.sql:52-63` — the table the phase-gate system (00133-00135) hangs off: `name`, `phase_key`, `duration_weeks`, `fee_cents`, `revision_limit`, `gate_condition` (legacy free text), `deliverables` jsonb (legacy), `sort_order`.

### 1.3 Phase deliverables & gates (00133-00135)

**Deliverables** — `proposal_phase_deliverables` (`00133_proposal_phase_deliverables.sql:18-27`): `phase_id` FK proposal_phases, `label`, `description`, `is_required` bool DEFAULT true, `completed_at`, `completed_by`, `sort_order`. Replaces the legacy JSONB `proposal_phases.deliverables` column with first-class sortable rows; the legacy column is left read-only (00133:2-14).

**Gates** — `proposal_phase_gates` (`00134_proposal_phase_gates.sql:19-31`): `phase_id` FK, `gate_kind` CHECK IN `('client_signature','deliverables_complete','payment_received','designer_override','prior_phase_signed')`, `payload` jsonb, `satisfied_at`, `satisfied_by`, `override_reason`, `sort_order`. A one-time backfill converts any non-empty legacy `gate_condition` text into a `deliverables_complete` gate row carrying `payload.legacy_text` (00134:76-96), idempotent via `NOT EXISTS`.

**Templates** — `proposal_phase_templates` (00135) supplies reusable gate/deliverable presets designers apply when building phases; exact column list not fully confirmed in this pass.

### 1.4 `proposal_engagement`

Created `00063_proposal_system_v2.sql:97-113`: `proposal_id`, `viewer_id`, `event_type` text NOT NULL, `section_type`, `duration_seconds`, `metadata` jsonb, `created_at`.

**`event_type` has no CHECK constraint** — confirmed explicitly in code comments at `00210_sign_proposal_as_decision.sql:23` ("proposal_engagement.event_type is free TEXT (no CHECK)") and in `00399_journey_authority_integrity.sql` (comment above `_can_record_proposal_engagement`, ~line 6972: "Restore only the intended telemetry vocabulary through a narrow definer predicate").

Observed vocabulary, reconstructed from all inserts/reads:

| event_type | Who writes it | Notes |
|---|---|---|
| `opened` | Client view | Rolled into `document_state.proposal_open_count` / `proposal_last_opened_at` (00230:241-244) |
| `section_viewed` | Client view | Client-authenticated telemetry |
| `downloaded` | Client view | Client-authenticated telemetry |
| `signed` | `sign_proposal` only | metadata `{via:'sign_proposal', signed_by_name, signed_ip}` (00400:167-174) |
| `signed_offline` | `record_offline_signature` only | metadata `{via:'record_offline_signature', signed_by_name, recorded_by, ...}` (00254:179) |

Client-authenticated INSERTs are restricted by the definer predicate `public._can_record_proposal_engagement` to exactly `('opened','section_viewed','downloaded')` (00399:6986) via the `proposal_engagement_client_telemetry_insert` RLS policy (00399:7000-7008), replacing the original open "Clients can record engagement" policy from 00063:128-135. Both `signed`/`signed_offline` rows are additionally write-protected: `00399:6931-6933` blocks any UPDATE that touches an event_type in `('signed','signed_offline')`, reserving those rows to the canonical signing RPCs.

**Observation**: `document_state` (§1.6) only rolls up `event_type = 'opened'` counts/timestamps — `section_viewed`, `downloaded`, and the two signature events are recorded but never surfaced in the read model designers/UX would build against.

### 1.5 `client_decisions` and Stage-2 "project approvals"

Created `00062_client_management_v2.sql:68-86`: `designer_client_id`, `project_id`, `title`, `context`, `due_date`, `linked_phase`, `status` text NOT NULL DEFAULT 'pending' **CHECK IN `('draft','pending','responded','expired')`** (00062:80-81) — never widened by any later migration. Stage-2 "project approvals" reuse these same four states rather than adding new ones.

Extended by `00064_decision_workflow_v2.sql`:
- `decision_type` DEFAULT 'product', CHECK IN `('material','product','layout','budget','approval')` (00064:15-16), widened to `('material','color','product','layout','substitution','budget','approval')` by `00084_project_management_mvp.sql:102-103`.
- `blocking_status` CHECK IN `('blocks_procurement','blocks_phase','non_blocking')` (00064:18-20).
- `designer_id`, `linked_proposal_id` FK proposals (00064:23-28).
- `sent_at`, `responded_at`, `viewed_at`, `reminder_sent_at` (00064:31-34).
- `selected_by` (00064:38-39).

`client_consent_method`: added by `00117_decision_client_consent.sql:6-10` as `TEXT NULL CHECK (client_consent_method IS NULL OR client_consent_method IN ('electronic_signature','click_through'))`, companion columns `client_signature`, `client_consented_at` (00117:8-9). The CHECK is dropped and replaced by `00254_record_offline_signature.sql:37-43` to add `'paper'`. **Final vocabulary: `NULL | 'electronic_signature' | 'click_through' | 'paper'`.**

`answer`, `answered_at`, `answered_by` added by `00213_coordination_kind_and_court.sql:42-44` (coordination-item reuse of the decision table). `room_id` FK project_rooms added by `00172_decision_room_product_linkage.sql:18-19`.

#### Stage-2 evidence columns (actually introduced in 00463, not spread across the range originally assumed)

`00463_project_approval_authority_evidence.sql:21-23` adds to `client_decisions`: `approval_contract text` (CHECK `IS NULL OR = 'project_artifact_v1'`, 00463:25-27) and `predecessor_decision_id uuid` (self-FK for supersession chains). A row with `approval_contract = 'project_artifact_v1'` is a **Stage-2 project approval**; a row with it NULL is a legacy client decision — they share one table and one status vocabulary.

Companion tables, all created in 00463 and RLS-enabled at 00463:895-899:

| Table | Key columns | Purpose |
|---|---|---|
| `project_decision_authorities` | project_id PK, decision_lead_id, required_coapprover_id (nullable, must differ from lead), revision, assigned_by/at | Live "who can approve this project" assignment |
| `project_decision_authority_snapshots` | decision_id UNIQUE, project_id, decision_lead_id, required_coapprover_id, authority_revision | Frozen copy of the authority at the moment a Stage-2 decision was created — later checks compare against this snapshot, not the live table |
| `project_approval_artifacts` | decision_id UNIQUE, source_kind CHECK IN `('plan_issue','spec_book_artifact','budget_version')`, source_id, source_version, artifact_hash CHECK `~ '^[0-9a-f]{64}$'`, artifact_title, question, context, due_at, phase_id, cost_cents_delta, schedule_days_delta, lead_time_days_delta, source_snapshot jsonb | Immutable, hash-pinned snapshot of exactly what's being approved and its cost/schedule/lead-time impact |
| `project_decision_review_confirmations` | decision_id, project_id, authority_revision, approver_id, approver_role CHECK IN `('lead','coapprover')`, artifact_hash, review_method CHECK `= 'portal_clickthrough'`, UNIQUE(decision_id, approver_id), UNIQUE(decision_id, approver_role) | Each required reviewer's click-through confirmation, bound to the exact artifact hash |
| `project_approval_action_receipts` | decision_id, action_kind CHECK IN `('created','review_confirmed','published','responded','withdrawn','superseded')`, idempotency_key, request_hash, actor_id, result jsonb, successor_decision_id (required iff action_kind='superseded') | Idempotent audit receipt for every Stage-2 mutation |

`client_decision_options` also gains `approval_outcome text`, `cost_cents_delta`, `schedule_days_delta`, `lead_time_days_delta` (00463:56-60) — the three canonical outcome rows (`approved` / `changes_requested` / `needs_discussion`) a Stage-2 decision must carry.

**Important framing for the UX team**: there is no separate `project_approvals` table. "Project approvals" are `client_decisions` rows flagged `approval_contract = 'project_artifact_v1'`, with a cluster of evidence/authority tables bolted on. Anything the UX team wants to change about approval *presentation* (the client-facing card, the outcome choices, the evidence shown) is reading these same tables the ordinary decision-card UI reads, filtered by `approval_contract`.

### 1.6 `document_state` view — proposal/approval arms

Base view `00191_document_state_view.sql`, "Shape B: pre-signing proposal chains" (00191:85-141): one row per **chain** (`chain_root_id = coalesce(parent_proposal_id, id)`), picking the highest-version, most-recent proposal in `status IN ('draft','sent','viewed','accepted','declined','expired')` with `project_id IS NULL` (not yet activated) — `'revised'`/superseded siblings and post-activation `'accepted'` rows fall out of shape B by construction (00191:87-90). Columns surfaced: `proposal_id`, `proposal_status`, `proposal_sent_at`, `proposal_viewed_at`, `active_section` (`'direction'` while draft else `'proposal'`, 00191:101-102), `overdue_decision_count`/`earliest_overdue_due` rolled up from `client_decisions` where `linked_proposal_id IN (pr.id, chain_root_id)` (00191:129-141).

`00211_document_state_proposal_touched.sql` (v7) adds `proposal_updated_at = greatest(proposals.updated_at, max(proposal_items.updated_at), max(proposal_sections.updated_at))` on shape B only (00211:9-14, 223-230) — lets the Desk detect "designer touched this proposal since it was sent" even for edits that don't bump `proposals.updated_at` directly.

`00230_document_state_proposal_opens.sql` (v9) adds `proposal_open_count` and `proposal_last_opened_at`, computed as `count(*)`/`max(created_at)` over `proposal_engagement WHERE event_type = 'opened'` for that proposal, non-null on shape B only (00230:241-244) — the only engagement rollup `document_state` exposes.

**Gap** (confirmed by absence): `document_state` has no arm for Stage-2 `project_approvals`/`client_decisions` beyond the generic `overdue_decision_count` rollup that predates 00463/00464. Pending review confirmations, artifact-hash state, and withdrawn/superseded chains are not surfaced in this read model.

---

## 2. RPCs & triggers

### 2.1 `send_proposal`

- **Signature (latest):** `public.send_proposal(p_proposal_id uuid, p_expected_updated_at timestamptz, p_expected_total_amount integer, p_expected_schedule_fingerprint text, p_personal_message text DEFAULT NULL, p_cc_email text DEFAULT NULL, p_valid_until timestamptz DEFAULT NULL) RETURNS proposals` — `supabase/migrations/00414_design_services_rail_completion.sql:273-368`. Lineage: 00176 → 00384 → 00388 → 00390 → 00414 (older overloads dropped along the way, e.g. `00384_send_proposal_payment_schedule_guard.sql:19-28`).
- **Security:** `SECURITY DEFINER`, `search_path = public, pg_temp`. Requires `auth.uid() IS NOT NULL` (00414:293-295) and `public._can_author_proposal(v_designer_id)` ownership check (00414:305-308).
- **Guards (verbatim):**
  - `'send_proposal requires an authenticated studio author'` — 00414:294
  - `'send_proposal: proposal % not found or access denied'` — 00414:307
  - `'commercial documents send through send_commercial_document'` (non-legacy `document_kind`) — 00414:312
  - `'project-bound furnishing drafts are internal authoring vehicles; send their wave'` — 00414:325
  - Delegated into `_commit_proposal_send`: `'proposal changed after send review; refresh and review again'` — 00384:133,169; `'proposal total must be greater than zero before sending'` — 00384:140; `'proposal payment schedule is required before sending'` — 00384:180; `'proposal payment milestone labels cannot be blank'` — 00384:189; `'proposal payment percentages must all be greater than zero'` — 00384:198; `'proposal payment percentages must total 100'` — 00384:203; `'proposal payment milestones must each resolve to a positive amount'` — 00384:229; `'proposal payment amounts must reconcile to proposal total'` — 00384:241.
  - CC email checks in the 00388 wrapper: `'proposal CC email is invalid'` — 00388:239; `'proposal client must have an email before sending'` — 00388:283.
- **Side effects:** row-locks the proposal plus every `proposal_phase_deliverables`/`proposal_phase_gates`/`proposal_schedule_milestones` leaf (00414:335-353); reconciles milestone `amount_cents` to the total and stamps `status='sent', sent_at=now()` (00384:236-241); supersedes sibling versions in the same revision chain to `status='revised'` (00384:252-259); resolves studio identity and **inserts one row into `proposal_send_dispatches`** — an immutable per-send outbox nonce carrying the frozen recipient/subject/render snapshot, a Resend idempotency key (`'proposal-send/' || dispatch_id`), and two deterministic UUIDv5 ids (`email_log_id`, `in_app_log_id`) for the eventual `notification_log` rows (00388:299-345). It links `proposals.proposal_send_dispatch_id` exactly once via a GUC-gated trigger (00388:180-188, `guard_proposal_send_dispatch_link`). It does **not** write to `proposal_engagement` and does **not** call the edge function directly — the dispatch is claimed asynchronously (§2.9).

### 2.2 `sign_proposal`

- **Signature (latest, client entry point):** `public.sign_proposal(p_proposal_id uuid, p_signed_name text) RETURNS jsonb` — `00400_proposal_signature_authority.sql:408-427`. Two compatibility overloads, `(uuid,text,text)` and `(uuid,text,text,boolean)`, delegate to the same core (00400:511-556); a service-role bridge `sign_proposal_with_trusted_ip(uuid,text,uuid,text)` lets the production API route pass a Cloudflare-derived IP (00400:445-500). All four call one private core, `_sign_proposal_authorized_00400(p_proposal_id, p_signed_name, p_client_id, p_trusted_signed_ip DEFAULT NULL)` (00400:30-45).
- **Security:** All `SECURITY DEFINER`. Public `sign_proposal(uuid,text)` requires `auth.uid()` and passes it as `p_client_id` (00400:412-415) — the caller cannot assert someone else's identity. `sign_proposal_with_trusted_ip` requires `auth.role() = 'service_role'` (00400:459-461) and only then impersonates `p_client_id` via a transaction-local JWT-claims override, restored in an `EXCEPTION WHEN OTHERS` block (00400:466-491). The `(uuid,text,text,boolean)` overload additionally requires `p_auto_activate = true` — `'proposal activation is mandatory after signature'` (00400:540-541).
- **Guards in `_sign_proposal_authorized_00400`:**
  - `'sign_proposal requires an authenticated client'` — 00400:66
  - `'a signature name of at least 2 characters is required'` — 00400:70
  - `'proposal % not found'` — 00400:82
  - `'proposal % may only be signed by its client'` — 00400:86
  - `'proposal % has no exact designer↔client relationship'` — 00400:96
  - `'accepted proposal % has incomplete signature evidence'` — 00400:107
  - `'proposal % is not in a signable status (%)'` (must be `sent`/`viewed`, or the accepted-retry branch above) — 00400:112
  - `'proposal % has expired'` (`valid_until < now()`) — 00400:117
  - `'proposal approval evidence conflicts with proposal identity'` — cross-checks the freshly-written `client_decisions` row and the `proposal_engagement` `'signed'`/`'signed_offline'` receipt against the proposal's own signature columns — 00400:249
  - `'proposal % has a conflicting project link'` / `'...multiple project links'` / `'...conflicting detached project'` — reciprocity checks on `projects.proposal_id` — 00400:264,280,300
  - `'proposal % failed canonical project reciprocity'` / `'...failed canonical project provenance'` — 00400:329,353
- **Side effects:** on a genuinely new signature, inserts one `client_decisions` row (`decision_type='approval'`, `client_consent_method='electronic_signature'`, `status='responded'`) with `ON CONFLICT (linked_proposal_id) WHERE decision_type='approval' ... DO NOTHING` for idempotency (00400:136-153); updates `proposals` to `status='accepted', signed_at=now(), signed_by_name, signed_ip, accepted_at=now()` (00400:159-167); inserts a `proposal_engagement` row with `event_type='signed'`, `metadata.via='sign_proposal'` (00400:180-187); if the proposal has no `project_id` yet, calls `_activate_proposal_as_project_authorized(p_proposal_id, current_date)` (00400:319-321) — activation is **mandatory and server-owned**; the client never supplies a start date.

### 2.3 `nudge_proposal`

- **Signature:** `public.nudge_proposal(p_proposal_id uuid) RETURNS timestamptz` — `00399_journey_authority_integrity.sql:884-935`.
- **Security:** `SECURITY DEFINER`; requires `auth.uid()` and `_can_author_proposal(v_proposal.designer_id)` — the designer (or an active studio peer), never the client.
- **Guards:** `'nudge_proposal requires an authenticated user'` — :895; `'proposal % not found or access denied'` — :906; `'nudge_proposal: proposal % is "%" — only sent/viewed proposals can be nudged'` — :911; `'nudge_proposal: proposal % was nudged on % — wait before nudging again'` (cooldown: `last_nudged_at > now() - interval '3 days'`) — :918.
- **Side effects:** `UPDATE proposals SET last_nudged_at = now(), nudge_count = nudge_count + 1` (:922-926). **No row is written to `proposal_engagement`, no dispatch table is touched, and no notification is enqueued here** — `nudge_proposal` is purely a timestamp/counter stamp; the edge function (§3.1) is called separately by the portal hook after this RPC returns. (Companion `request_proposal_change(uuid,text)` in the same file, :945-1002, is the client-side counterpart: requires the exact client, proposal in `sent`/`viewed`, writes `client_feedback` and inserts a `proposal_engagement` row with `event_type='change_requested'` — a fifth engagement event type beyond those listed in §1.4.)

### 2.4 `record_offline_signature`

- **Signature:** `public.record_offline_signature(p_proposal_id uuid, p_signed_name text, p_auto_activate boolean DEFAULT true, p_start_date date DEFAULT current_date) RETURNS uuid` — `00399_journey_authority_integrity.sql:7172-7309`.
- **Security:** `SECURITY DEFINER`; requires `auth.uid()` and `_can_author_proposal(v_proposal.designer_id)` — this is a **studio-side** paper-signature recording act, not a client act.
- **Guards:** `'record_offline_signature requires an authenticated user'` — :7193; `'a signature name of at least 2 characters is required'` — :7197; `'proposal % not found'` — :7205; `'proposal % may only be recorded by its design studio'` — :7209; short-circuits to `RETURN v_proposal.project_id` if already `accepted` (:7212-7214); `'proposal % is not in a recordable status (%)'` (must be `sent`/`viewed`/`expired`) — :7217; `'proposal % has no exact designer↔client relationship'` — :7228; `'proposal approval relationship conflicts with proposal identity'` — :7247.
- **Side effects:** inserts `client_decisions` with `client_consent_method='paper'` (:7237-7245); updates `proposals` to `status='accepted', signed_ip=NULL` (:7255-7263); inserts `proposal_engagement` with `event_type='signed_offline'`, `metadata={via:'record_offline_signature', recorded_by: auth.uid()}` (:7269-7279); auto-activates via `_activate_proposal_as_project_authorized` unless `p_auto_activate=false` (:7288-7292).

### 2.5 `activate_proposal_as_project`

- **Signature (latest):** `public.activate_proposal_as_project(p_proposal_id uuid, p_start_date date DEFAULT CURRENT_DATE) RETURNS uuid` — `00435_ffe_ga_rpc_boundaries.sql:918-932`. Thin wrapper over private helper `_activate_proposal_as_project_authorized` (latest body `00398_delete_project_phase_atomic_rpc.sql:1670-1738`) → `_activate_proposal_as_project_impl`.
- **Security:** `SECURITY DEFINER`. Guards: `'activate_proposal_as_project requires an authenticated studio author'`; `'activate_proposal_as_project: proposal % not found or access denied'`; `'commercial documents activate only through their dedicated execution RPC'`; `'superseded proposal % cannot be activated'` — all at 00435:922-925.
- **Side effects:** sets `app.ffe_mutation_rpc`/`app.board_state_rpc` GUCs so RPC-only triggers permit the reconciliation writes about to happen (00435:926); calls `_activate_proposal_as_project_authorized`, which sets `app.proposal_activation_id`, calls `_activate_proposal_as_project_impl` (creates the `projects` row and copies rooms/phases/team/budget from the proposal), asserts a phase batch token was established (`'activate_proposal_as_project: phase batch authority was not established'` — 00398:1706), validates final phase topology (00398:1710); finally reconciles FF&E placements onto the new project (00435:927). This is the same private bridge `sign_proposal` and `record_offline_signature` both call when no reciprocal project exists yet — "activation" is one shared code path regardless of which signature route triggered it.

### 2.6 `clone_proposal`

- **Signature (latest):** `clone_proposal(p_source_id uuid, p_mode text DEFAULT 'revision', p_revision_summary text DEFAULT NULL) RETURNS uuid` — `00327_document_state_arrival_linkage.sql:619-902`.
- **Security:** `SECURITY INVOKER` — relies entirely on RLS to scope which source proposal the caller can read (:646-648, "RLS-filtered read: returns nothing unless the caller can see the proposal").
- **Guards:** `'clone_proposal: invalid mode %, expected revision|duplicate'` — :642; `'clone_proposal: proposal % not found or access denied'` — :649.
- **Side effects:** inserts a new `proposals` row with `status='draft'` and every sent/viewed/accepted/declined/signed timestamp/name/IP column explicitly reset to `NULL` (:684-691); `project_id` is always `NULL` on the clone (:668); in `'revision'` mode, `version = source.version + 1`, `parent_proposal_id = root_id`, carries `client_feedback` forward; in `'duplicate'` mode, `version=1`, no parent, title gets a `' (Copy)'` suffix, feedback dropped. Remaps rooms/phases/palettes/boards via old→new id maps. No engagement/notification rows are written — cloning is silent.

### 2.7 Approval state machine (00464)

`client_decisions.status` transitions are enforced by trigger `guard_decision_status_transition()` (`00465_project_approval_notification_traceability.sql:533-568`, superseding an earlier 00399 version) — a **BEFORE UPDATE** trigger, not RLS:

| From | To | Allowed actor / RPC |
|---|---|---|
| `draft` | `pending` | `publish_client_decision(uuid)` — legacy or Stage-2 branch of the same function (00464:857-1090) |
| `pending` | `responded` | `respond_project_approval` → `_respond_project_approval_checked` (Stage-2, frozen household lead only, 00464:496-810); legacy client response path elsewhere |
| `pending` | `expired` | `expire_client_decision` / `expire_due_client_decisions` (legacy only — both explicitly reject `approval_contract='project_artifact_v1'`, 00464:2079-2081, raising `'Stage-2 project approvals require checked withdraw/supersede'`) |
| `responded` | `pending` | `extend_and_reopen_client_decision` / `reopen_client_decision` (legacy only — both raise `'Stage-2 project approvals cannot use generic reopen'` / `'...extend/reopen'`, 00464:1906,1969; `'proposal approval decisions are terminal'` also blocks reopening a signed proposal's linked `client_decisions` row, 00464:1918,1985) |
| `expired` | `pending` | same reopen/extend path |
| `draft` (Stage-2 only) | `expired` | one exact escape hatch: `current_user='postgres' AND app.project_approval_withdraw_decision_id = OLD.id` — only `withdraw_project_approval_decision` on an unpublished Stage-2 draft (00465:544-551) |

Every other transition raises `'Invalid decision status transition: % -> % (decision %)'` (00465:558-560).

**Stage-2 lifecycle**, layered on the same table via `approval_contract='project_artifact_v1'`:

1. `create_project_approval_decision` (public wrapper, 00463:1439-1457) → `_create_project_approval_decision_checked` (00463:1106-1372): studio actor only, requires an explicit `project_decision_authorities` row where `decision_lead_id = project.client_id` and **no** `required_coapprover_id` set (`'project has no valid explicit household approval authority'`, 00463:1288) — co-approval is not reachable through the public entry point yet. Freezes an authority snapshot, resolves and hashes an immutable artifact, and inserts exactly 3 canonical outcome options. Row starts `status='draft'`.
2. `confirm_project_decision_review` (00463:1467-1664): each frozen reviewer (lead, and coapprover if one exists) clicks through; requires `authorityRevision` + `artifactHash` to match the frozen snapshot exactly. Does not change `status`.
3. `publish_client_decision` (Stage-2 branch, 00464:857-1005): requires status `draft` and every required reviewer to have a matching confirmation row (`'every frozen required reviewer must confirm before publish'`, 00464:958). Moves `draft → pending`, stamps `sent_at`, calls `_enqueue_decision_notification(decision_id, 'decision_required')`.
4. `respond_project_approval` (00464:811-843) → `_respond_project_approval_checked` (00464:496-810): **only** `auth.uid() = snapshot.decision_lead_id` may respond (`'only the frozen household decision lead may respond'`, 00464:588) — the coapprover reviews but never answers through this RPC. Requires optimistic-concurrency `p_expected_updated_at` match, requires `published` + all review confirmations to still exist. On `outcome='approved'`, unblocks any `project_ffe_items` rows `blocked_by_decision_id` = this decision (00464:770-777). Enqueues `_enqueue_decision_notification(decision_id, 'decision_resolved')`.
5. `withdraw_project_approval_decision` (00464:1091-1250): studio-only, only from `pending`, only on a leaf with no successor (`'only a current Stage-2 leaf may be withdrawn'`) → `status='expired'`, `disposition='withdrawn'`.
6. `supersede_project_approval_decision` (00464:1251-1439): studio-only; only `pending`/`responded` may be superseded (`'only pending or responded Stage-2 decisions may be superseded'`); requires a genuinely new artifact hash (`'supersession requires a genuinely new immutable artifact'`); creates a successor `client_decisions` row via `_create_project_approval_decision_checked(..., p_predecessor_decision_id)`.

Whether a decision **still blocks phase advancement** is decided by `_client_decision_blocks_phase(decision)` (00464:22-225), called from `advance_project_phase` when moving a phase to `in_progress` (00464:2635-2655, `'advance_project_phase: % unresolved phase blocker(s)'`). It is **fail-closed**: any missing/incoherent evidence row, any count other than exactly one coherent `responded`/`withdrawn`/`superseded` receipt, or any unhandled exception (except `serialization_failure`/`deadlock_detected`, re-raised for retry) returns `true` (still blocking) — 00464:220-225. A `draft` or `pending` Stage-2 row **always** blocks (00464:206-208) — an unpublished/un-reviewed approval keeps the phase gated shut with no designer override.

### 2.8 Notification traceability & requeue (00465/00466)

Two independent notification/receipt mechanisms exist side by side:

**Proposal-send outbox** (`proposal_send_dispatches`, §1.1.1/§2.1) — an immutable one-row-per-send record: `state` moves `pending → in_flight → {delivered | suppressed | failed | ambiguous | unconfirmed}` via `claim_proposal_send_dispatch` (service-role only, atomic lease-based claim with a 15-60s lease and a 3-attempt/23-hour retry ceiling, 00388:511-700), `persist_proposal_send_request` (write-once exact Resend request bytes, 00388:696-776), and `begin_proposal_send_provider_attempt`/`complete_proposal_send_dispatch`/`suppress_proposal_send_dispatch`/`release_proposal_send_dispatch`. `_sync_proposal_send_email_log` (00388:402-462) mirrors dispatch state into `notification_log` (`type='proposal_sent', channel='email', template_id='proposal-sent'`, subject `'Proposal ready for your review'`). A failed proposal-send is directly detectable from `proposal_send_dispatches.state IN ('failed','ambiguous','unconfirmed')` plus `last_error`.

**Decision notifications** (`decision_notifications`, in-app only, 00173 + 00465/00466) — a minimal table, explicitly documented in `00173_decision_notifications.sql:8-20` as a stop-gap: *"the decision-reminders edge function (00092) talks straight to Resend, bypassing the notification center... v1 here is in-app only... Wave-2 Territory T2 (Notifications & Delivery) is expected to fan these rows out to email/push"* — **that fan-out is not present as of 00466**. Columns: `id, user_id, decision_id, kind ENUM('decision_required','decision_overdue','decision_resolved'), read_at, created_at, updated_at`, unique on `(decision_id, kind)`.

- `_enqueue_decision_notification(p_decision_id, p_kind)` (final body `00466_project_approval_notification_requeue.sql:10-107`) resolves the recipient by aggregate type: Stage-2 → `project_decision_authority_snapshots.decision_lead_id`; legacy → `designer_clients.client_id`. Guards: `'% requires a pending decision'` for `decision_required`/`decision_overdue`; `'decision_overdue requires an overdue pending decision'`; `'decision_resolved requires a responded decision'` (recipient becomes the **designer**, not the client); `'decision % has no notification recipient'`.
- 00466 adds **asymmetric requeue semantics**: `v_rearm_existing := auth.role() = 'service_role'`. A `service_role` call (the scheduled cron/edge worker) re-arms an existing `(decision_id, kind)` row — clearing `read_at` and restamping `created_at`/`updated_at` — while an authenticated studio republish leaves the recipient's read state untouched (00466:96-104).
- `stamp_client_decision_reminder(uuid)` (authenticated, studio-only, 00465:133-260): guards `'only pending decisions may be reminded'` and a 1-hour cooldown (`'a reminder was sent less than one hour ago'`); inserts one `notification_log` row (`type='decision_reminder', channel='in_app'`) and stamps `client_decisions.reminder_sent_at`.
- `stamp_project_approval_reminder_delivery(p_decision_id, p_decision_lead_id)` (00465:266-369) is the **service-role-only** counterpart the scheduled edge worker calls after actually delivering a reminder externally: rejects unless `auth.role()='service_role' AND auth.uid() IS NULL` (`'Stage-2 reminder delivery stamp is service-role only'`); requires `p_decision_lead_id` to exactly match the frozen authority snapshot (`'reminder delivery recipient does not match frozen Stage-2 evidence'`); stamps `reminder_sent_at` only if still `NULL`. Documented as recording delivery, not performing it.

**Gap confirmed here**: unlike the proposal-send outbox's full claim/retry/terminal-state machine, a failed or undelivered *decision* notification is not separately tracked — `decision_notifications`/`notification_log` rows are written optimistically at enqueue/stamp time with no provider delivery confirmation loop.

---

## 3. Notification channels

### 3.1 Email

All proposal/decision email goes through Resend. `packages/email` does not hold templates for this flow — templates are inline HTML string builders in `supabase/functions/_shared/branded-email.ts` (`renderBrandedShell`, `heading`, `paragraph`, `ctaButton`, `muted`, `callout`, `spacer`, `escapeHtml`), consumed by each edge function.

**`proposal-send`** (`supabase/functions/proposal-send/handler.ts:219-301`, `renderProposalEmail`)
- Trigger: designer-portal "Send proposal" action via a dispatch-claim pipeline (`loadExactInstance` → `claimDispatch` → `prepareRequest` → `sendPrepared`) — an idempotent, multi-attempt, ambiguous-safe delivery state machine (`ProposalDeliveryState`: pending/in_flight/delivered/suppressed/failed/ambiguous/unconfirmed; `handler.ts:18-25`).
- Recipient: `dispatch.recipientEmail` (the client), optional `ccEmail`.
- Subject (verbatim, `handler.ts:249-250`): `` `${dispatch.senderName} sent you a ${documentLabel}: "${dispatch.proposalTitle}"` `` — `documentLabel` is one of `proposal`, `design services agreement`, `furnishings authorization`, `trade scope` depending on `documentKind`.
- Body copy per document kind (`handler.ts:251-257`):
  - default: `` `${designerName} has prepared a design proposal for you: <strong>${proposalTitle}</strong>.` ``
  - `design_services`/`service_addendum`: `"Review the professional services, role-based rates, retainer policy, billing cadence, ceiling, and terms. Furnishings and permission to purchase are not included."`
  - `furnishings_authorization`: `"Review the named furnishings wave. Only its listed items, quantities, and client prices become purchasing authority after signature and execution."`
  - `trade_scope`: `` `Review the named trade scope — its scope of work, draw schedule, and price. Signing authorizes only the work and draws described inside.` ``
  - Plus optional `personalMessage` (designer's own note, HTML-escaped), an `Investment: $X` line if `totalAmount` is set, and `Please review by <date>.` if `validUntil` is set.
- CTA button text: "Review proposal" / "Review agreement" / "Review authorization" / "Review trade scope" (`handler.ts:284-292`).
- Link shape: `${clientPortalUrl}${dispatch.clientPortalPath}` (`handler.ts:224-226`) — a plain client-portal path, not a signed/magic-token URL; fallback plain-text link included below the button (`handler.ts:296`).
- Delivery path: NOT a direct Resend call — routed through a `ProposalSendGateway` abstraction backed by `proposal_send_dispatches` (§1.1.1) with replay-suppression checks (`checkReplaySuppression`, `handler.ts:409-417`) before hitting the provider. `syncEmailLog`/`syncInAppLog` (`handler.ts:333-334`) reconcile `notification_log` and the in-app bell row after every terminal state.
- Tracking: relies on the shared `notification_log` + Resend webhook (§3.1.4); `proposal_send_dispatches.deliveryState` is the source of truth for send-attempt status specifically.

**`proposal-sign-confirmation`** (`supabase/functions/proposal-sign-confirmation/index.ts`)
- Trigger: called from the client-portal sign API route immediately after signing, and again from a designer "Send Confirmation" button (file header comment, lines 1-8).
- Sends TWO emails per invocation:
  - **Client receipt** (lines 120-154): subject `` `Signed: "${proposal.title}"` ``; body heading "Thanks for signing"; `` `Thanks for signing "${title}". Your designer is now activating your project.` ``; an `Investment:` line; `Signed: <date> by <signer>` line; CTA "View proposal" → `${CLIENT_PORTAL_URL}/proposals/${proposal.id}` (line 121).
  - **Designer notice** (lines 156-189): same subject; body heading "Your proposal was signed"; `` `${signerName} just signed "${title}".` ``; CTA "Activate project" → `${DESIGNER_PORTAL_URL}/doc/${proposal.id}` (line 157).
- Delivery path: both go through `sendCompliantEmail` (`_shared/send-email.ts`) — the "compliant" chokepoint — with explicit `notificationType: 'proposal_signed'`, `category: 'transactional'`, `templateId`, and an `idempotencyKey` per recipient (lines 142-153, 177-188). This is the only one of the three proposal functions using the compliant helper directly, rather than a custom dispatch-claim wrapper or a raw fetch.

**`proposal-nudge`** (`supabase/functions/proposal-nudge/index.ts`)
- Trigger: designer-portal `useNudgeProposal` hook, after the `nudge_proposal()` RPC stamps `last_nudged_at` (file header, lines 1-9). The function does not mutate proposal state itself.
- Guards: 422 `not_nudgeable` unless `status IN ('sent','viewed')` (lines 109-112); 422 `no_recipient` if the client has no email (lines 115-118).
- **Cadence gate** (lines 120-173): if the client's `notification_preferences.reminder_cadence = 'daily_digest'`, no email is sent — instead an `in_app`/`notification_log` row (`type: 'proposal_nudge'`) is written for the `notification-digest` cron to batch, deduplicated against existing unread rows for the same `deep_link`.
- Email path (immediate cadence): subject is co-brand-aware (lines 192-196) — `` `A reminder from ${senderName} about your proposal: "${title}"` `` if a studio identity resolves, else the generic `` `A gentle reminder about your proposal: "${title}"` ``. Body heading "A gentle reminder"; `` `Just a gentle nudge — ${designerName}'s proposal <strong>${title}</strong> is still waiting for you whenever you have a moment to review it.` ``; optional `It's open for your review through <date>.` line; CTA "Review proposal" → `${CLIENT_PORTAL_URL}/proposals/${proposal.id}`.
- Delivery path: **calls Resend directly** (`fetch('https://api.resend.com/emails', …)`, lines 228-235) — the only one of the three that bypasses `sendCompliantEmail` entirely, so it gets none of that helper's suppression/rate-cap/unsubscribe-header handling.

**Project-approval / decision notifications** — there is no dedicated `project-approval-send` edge function; approvals reuse the existing `client_decisions` machinery:
- `_shared/decision-notify.ts` renders and sends three kinds: `decision_required`, `decision_overdue`, `decision_resolved` (types, lines 30-34), gated by `notification_preferences` (email/in-app toggles, quiet hours, `reminder_cadence`) and deduplicated via `notification_log` lookups (lines 178-260).
- Copy (verbatim, `decision-notify.ts:300-350`):
  - `decision_resolved` (designer-facing, never co-branded): subject `` `Resolved: "${title}"` ``; `` `Your client has responded to the decision <strong>${title}</strong>.` ``; `"Open your Patina dashboard to review their selection."`
  - `decision_overdue`: subject `` `Overdue: "${title}" still needs your decision` ``; `` `The decision <strong>${title}</strong> has passed its due date and is still waiting on you.` ``; `"Open your Patina dashboard to review the options and pick one."`
  - `decision_required`: due-date-relative body (e.g. "It's due in approximately N hours").
  - All three optionally append an **artifact citation** block (lines 260-278) when `decision.artifact` is set: `` `Approval artifact: <strong>${title}</strong> (${kind}, version ${version}).` `` plus `SHA-256 checksum: <mono>${checksum}</mono>` — this is how a Stage-2 project-approval decision cites the frozen plan/spec/budget version it's asking the client to approve.
- Recipient resolution for Stage-2 (`approval_contract = 'project_artifact_v1'`) decisions is deliberately different: `00465_project_approval_notification_traceability.sql:36-51` resolves the recipient from `project_decision_authority_snapshots.decision_lead_id` (the frozen authority at decision-creation time), not the mutable `designer_clients` relationship — guarded with `RAISE EXCEPTION 'Stage-2 notification requires coherent frozen authority and artifact'`.
- Delivery: `sendCompliantEmail`, `category: "operational"` (decision-notify.ts:1-20).
- Crons (§3.5): `decision-reminders-daily` fires `decision_required`/overdue-adjacent reminders; `expire-decisions-daily` was re-pointed from a raw SQL `UPDATE` to `invoke_edge_function('expire-decisions')` so `decision_overdue` notifications fire before expiry (`00174_decision_resolved_email_and_overdue_cron.sql:100-105`, comment line 19). `decision-resolved-notify` is invoked directly (not cron) when a decision transitions to `responded` (comment, `00174`:58-77).

**Tracking**: `supabase/functions/resend-webhook/index.ts` is the single tracking sink for ALL Resend-sent email (proposals, decisions, everything). It verifies Svix HMAC signatures (lines 51-96), looks up `notification_log` by `provider_id = event.data.email_id` (lines 113-126), and on `email.delivered`/opened/clicked/bounced/complained events updates `notification_log.status` and fires a PostHog event carrying `campaign_id`/`sequence_id`/`step_index` from `metadata` when present (lines 140+). `notification_log` (`00041_notification_log.sql:15-59`) has `status` enum (`queued, sending, delivered, opened, clicked, bounced, failed, suppressed`), `channel` enum (`email, push, in_app, sms`), `provider_id`, `template_id`, `metadata` jsonb, `opened_at`/`clicked_at`, `error`, `retry_count`.

### 3.2 SMS

Proposals and approvals do **not** use SMS today. The SMS rail (`_shared/sms.ts`, header comment lines 1-19) is scoped entirely to **Field Coordination** — `sendPartySms()` is consumed by `sms-dispatch`, `sms-inbound`, and `field-daily` for trade/party assignment, invites, and delivery-confirmation digests, resolving consent off `project_parties` (opt-in table), rendering `email_templates` rows via `{{var}}` interpolation, and honoring an 8am–8pm quiet-hours window plus a `SMS_DEV_MODE` dry-run/redirect knob. `decision-reminders/index.ts` and `notification-dispatch/index.ts` also import SMS-adjacent code but for other notification types, not proposal/approval sends — no proposal-send, proposal-nudge, or decision-notify code path references `sms.ts` or Twilio.

### 3.3 Push

Push exists and IS wired to both proposals and decisions, via APNs. `device_push_tokens` (`00335_device_push_tokens.sql:23-46`) stores one row per registered iOS device token, keyed by `user_id`, with an `environment` column driving `api.push` vs `api.sandbox.push` host selection in `apns-send` (comment, lines 34-43). The dispatcher is `supabase/functions/apns-send/index.ts` + `core.ts`. It's invoked by `notify_client_attention()` (§3.4) as a best-effort, non-blocking call (`00534_client_attention_notifications.sql:196-213`) — failure never blocks the underlying send. `apns-send` stamps the queued `notification_log` push row `delivered` or `failed` (comment at `00534`:20-21, citing `apns-send/index.ts:217-238`).

### 3.4 In-app

`notification_log` is the single table for in-app rows too (`channel = 'in_app'`). The load-bearing writer for proposals/decisions/invoices is `notify_client_attention(p_user_id, p_entity_type, p_entity_id, p_title, p_body, p_metadata)` (`00534_client_attention_notifications.sql:150-222`), `SECURITY DEFINER`, `service_role`-only. Per call it writes **two** rows: `channel='in_app', status='delivered'` (the bell — never handed to `apns-send`, so a push failure can't remove it) and `channel='push', status='queued'` (the envelope `apns-send` consumes). It de-duplicates the in-app row on `(user_id, entity_type, entity_id)` while `opened_at IS NULL`, folding repeat nudges into one row instead of stacking (lines 175-198). Metadata contract consumed by both the iOS bell (`NotificationsAPIClient.swift:135-145`) and the client-portal inbox: `title`, `body` **and** `message` (both keys, since two prior writers only wrote one or the other — comment lines 28-33), `entity_type ∈ {proposal, invoice, decision}`, `entity_id`, `deep_link`/`url` → `/proposals|/invoices|/decisions/<id>`.

Two triggers feed it: `sync_proposal_send_in_app_log` (redefined at `00534`, lineage from `00388`) writes the bell row when a proposal send dispatch completes; `notify_client_decision_raised()` fires `AFTER INSERT OR UPDATE OF status ON client_decisions`, gated to `status = 'pending' AND court = 'client'` with a resolvable `designer_clients.client_id`, wrapped in `EXCEPTION WHEN OTHERS THEN RAISE WARNING` so a notification failure never rolls back the decision itself (comment, lines 90-115). The `AFTER UPDATE OF status` leg matters because the real send path is `draft → pending` via `publish_client_decision` / the project-approval publish RPC, not an INSERT.

**Documented open gap** (comment lines 120-133, "SEAM, NOT A DEFECT IN THIS FILE"): the current iOS bell filter is `channel IN (in_app, push) AND status IN (queued,…,clicked)`, which means the push envelope is visible alongside the in-app row in every non-failed state — a client on the current build reads each attention **twice**. The fix (narrowing the client query to `channel = in_app` only) is tracked as a separate integration task, not yet landed in this file.

No realtime/broadcast channel subscription was found in `apps/client-portal` keyed to proposals or approvals (only a decisions-page test referencing "mounts realtime" generically) — in-app delivery for this flow is poll/fetch of `notification_log`, not a Supabase Realtime broadcast channel.

### 3.5 Cron

| Job | Schedule | Invokes | Purpose |
|---|---|---|---|
| `expire-proposals-daily` | `0 3 * * *` | raw SQL `UPDATE public.proposals SET status='expired' WHERE status IN ('sent','viewed') AND valid_until < NOW()` | Auto-expires stale proposals (`00098_proposal_cron.sql:13-23`) |
| `decision-reminders-daily` | `0 9 * * *` | `invoke_edge_function('decision-reminders')` | Fires `decision_required`-family reminder emails/in-app (`00092_decision_cron.sql:15-20`) |
| `expire-decisions-daily` | `0 2 * * *` | `invoke_edge_function('expire-decisions')` (re-pointed from raw SQL at `00174`) | Expires overdue pending decisions and fires `decision_overdue` before expiry |
| `notification-digest-daily` | `0 15 * * *` | `invoke_edge_function('notification-digest')` | Batches `daily_digest`-cadence users' deferred in-app rows (including deferred proposal nudges) into one summary email (`00278_client_reminder_cadence.sql:77-82`) |

`job_runs` (`00300_queue_groom.sql:41-64`) is a generic run-log table for scheduled/background jobs — `job_name`, `started_at`, indexed on `(job_name, started_at DESC)`, RLS-gated to admin `SELECT`. It's used broadly across Agent OS and other crons, but `expire-proposals-daily`, `decision-reminders-daily`, and `expire-decisions-daily` do not appear to write into it — they predate the `job_runs` pattern. **Observation**: there's no visible admin run-history for whether the proposal-expiry or decision-reminder crons actually ran on a given day, unlike newer Agent OS jobs.

---

## 4. Analytics (PostHog)

All events go through `track()` in `apps/client-portal/src/lib/analytics/events.ts:4-18`, a no-op-when-disabled wrapper around `posthog.capture()` gated by `isAnalyticsEnabled()`.

| Event name | file:line | Key properties | Trigger |
|---|---|---|---|
| `proposal_viewed_by_client` | events.ts:203, called from `components/proposal-document.tsx:134` | `proposal_id`, `platform: 'client'` | Client opens a proposal document |
| `proposal_section_viewed` | events.ts:205-210, called from `proposal-document.tsx:163` | `proposal_id`, `section_type`, `duration_seconds`, `platform` | Client dwells on a proposal section |
| `proposal_signed` | events.ts:212-216, called from `app/proposals/[id]/sign/page.tsx:148` | `proposal_id`, `signed_by_name`, `platform` | Client completes the e-signature action |
| `client_decision_approve` | events.ts:31-35, called from `components/decision-card-client.tsx:268,290` | `decision_id`, `option_id`, `requires_consent` | Client approves an option on a decision card (`requiresConsent`/`optionId` are new fields with zero prior call sites per code comment at events.ts:28) |
| `client_decision_reject` | events.ts:37-38 | `decision_id` | Defined but **dead code** — comment explicitly says "Intentionally unwired — no reject UI exists on the client decision card" |
| `client_making_gate_followed` | events.ts:125-132, called from `components/making/the-making.tsx:263,440` | `project_id`, `proposal_id`, `kind` (`design_services`\|`furnishings_authorization`\|`service_addendum`\|`trade_scope`\|`trade_acceptance`) | Client acts on a "gate" in The Making surface — includes a `furnishings_authorization` kind, i.e. an approval-adjacent act tied to a `proposal_id` |
| `client_making_surface_viewed` | events.ts:112-120 | `project_id`, `gate_count`, `toll_count`, `tracking_count` | The Making surface renders for a project (`gate_count` reflects pending approval/gate items) |
| `client_making_action_shown` / `client_making_action_selected` | events.ts:145-158 | `surface_key`, `region_key`, `action_key`, `variant`, `presentation` | Generic scored-action impression/click instrumentation, not proposal-specific but can fire on proposal-adjacent surfaces |

No dedicated PostHog events exist for: a proposal being nudged/reminded, a proposal expiring, or a designer-portal-side "sent"/"resent" action — those were not found in either portal via grep.

---

## 5. Feature flags

Checked via `useFeatureFlag(` in `apps/client-portal/src/hooks/use-feature-flag.ts` and `apps/designer-portal/src/hooks/use-feature-flag.ts` (both wrap `posthog.isFeatureEnabled`).

| Flag name | file:line(s) | What it gates |
|---|---|---|
| `single-pane` | `components/making/single-pane-solo-redirect.tsx:29`, `components/making/project-surface-switch.tsx:45` (client-portal) | The consolidated client "single pane" project surface vs. legacy multi-tab view — this is the surface The Making / proposal viewing sits inside |
| `worktable` | `apps/designer-portal/src/app/(document)/doc/[id]/page.tsx:878` | A designer-portal document surface (present in code, worth noting against project memory suggesting this flag was never created) |
| `studio-workspaces` | `desk/page.tsx:77`, `account/account-sheet.tsx:105` | Studio workspace UI |
| `call-sheet` | 10+ sites across `document/roster/*`, `command-bar.tsx`, `letterhead-instruments.tsx`, etc. | Call Sheet roster feature |
| `onboarding-teammate-persona` | `desk/page.tsx:85`, `auth/accept-invite/page.tsx:70`, `account/studio-invite-modal.tsx:101`, `help/desk-walkthrough.tsx:325` | Teammate-persona onboarding path |
| `arrival-arc` | `triage-bar.tsx:85`, `open-requests-strip.tsx:242`, `ceremony/ceremony-surface.tsx:63` | Arrival Arc feature |
| `room-file` | `room-file/room-file-view.tsx:63`, `rooms/room-view/room-view.tsx:151` | Room File capture feature |
| `room-view-refined-path` | `rooms/room-view/room-view.tsx:181` | Refined Room View path |
| `capture-producer-idempotency` | `portal/proposals/product-picker-modal.tsx:883` | Idempotent commit behavior for the proposal-capture producer flow (only proposal-namespaced flag found) |

**No flags named `proposal`, `approval`, `signature`, or `decision` exist in either portal's code** — proposal viewing, signing, and decision-approval flows are unflagged (always-on), aside from the `capture-producer-idempotency` guard on the capture-to-line-item commit path. Any new client-approval UX work would need its own flag introduced from scratch; there is no existing kill-switch to reuse.

---

## 6. Observations — what's missing for a richer client experience

Each item below was confirmed by search, not inferred:

1. **No per-item or partial approval on a proposal.** `proposals.status` and `client_decisions.status` are both whole-object state machines (accept/decline the whole proposal; approve/changes-requested/needs-discussion the whole Stage-2 artifact). No column or RPC found that tracks per-`proposal_item` approval state — `proposal_items` has no status-like column (§1.2).
2. **No client comment thread scoped to a proposal.** `proposals.client_feedback` (00063:39-46) is a single free-text field, not a threaded structure. `client_decisions` has an `answer` field (00213:42-44) but that is a decision selection, not open conversation. No `proposal_comments`/`decision_comments` table was found in this pass.
3. **No client-visible read receipt.** `proposal_engagement` records `opened`/`section_viewed` for the designer's benefit (rolled into `document_state.proposal_open_count`, §1.6), but nothing in the client-portal UI or schema exposes "your designer viewed this" back to the client — the traffic is one-directional (client → designer telemetry only).
4. **`document_state` doesn't surface Stage-2 approval state.** Confirmed gap in §1.6 — a UX surface built against `document_state` (the read model several designer-portal surfaces already use) would need new columns to show pending review confirmations, artifact-hash mismatches, or withdrawn/superseded chains; that data currently lives only in the 00463/00464 tables directly.
5. **No push channel dedicated to proposals distinct from the generic attention pipeline.** Push is wired (§3.3) but only as the generic `notify_client_attention()` envelope shared by proposals, invoices, and decisions alike — there's no proposal-specific push copy, and the in-app/push double-count bug (§3.4) is an open, documented seam.
6. **No client-controlled reminder cadence beyond immediate vs. daily-digest.** `notification_preferences.reminder_cadence` (referenced in `proposal-nudge/index.ts:120-173` and `decision-notify.ts`) only supports two settings; there's no evidence of a client-facing UI to change it, and no per-proposal snooze/mute confirmed by search.
7. **`proposal-nudge` bypasses the compliant-email chokepoint.** Unlike `proposal-sign-confirmation`, `proposal-nudge` calls Resend directly (§3.1) rather than through `sendCompliantEmail` — it does not get that helper's suppression-list/rate-cap/unsubscribe-header handling, which is a notification-integrity gap more than a UX one, but affects deliverability the UX team should know about.
8. **No SMS or in-app-only "quick approve" path.** SMS exists but is entirely scoped to Field Coordination (§3.2) — there's no SMS-based nudge or approve-by-reply for proposals or decisions, unlike the trade/party workflows.
9. **No visible cron run-history for proposal expiry / decision reminders.** `job_runs` exists as a pattern but the three oldest proposal/decision crons don't write to it (§3.5) — an admin or UX surface asking "did today's expiry job actually run" has no data source for these three jobs specifically.
10. **`client_decision_reject` PostHog event is defined but dead** (§4) — there is no reject UI on the client decision card today, confirmed by an explicit code comment, which corroborates gap #1 (no partial/negative-per-item action) at the analytics layer too.
11. **No delivery-confirmation loop for decision/approval notifications.** The proposal-send path has a full claim/retry/terminal-state machine (`proposal_send_dispatches`, §2.8) that can positively distinguish `delivered` from `failed`/`ambiguous`. The decision/approval notification path (`decision_notifications`) has no equivalent — rows are written optimistically at enqueue time with no provider callback confirming the client ever received the `decision_required`/`decision_resolved` email. A UX surface that wants to show "your client has been notified" with any confidence can trust that claim for proposal sends but not for approval reminders.
12. **Stage-2 approvals have no designer override once gating a phase.** `_client_decision_blocks_phase` is fail-closed by design (§2.7) — a `draft` or `pending` Stage-2 approval always blocks phase advancement, and any evidence-row anomaly defaults to "still blocking." There is no RPC found that lets a designer force past a stuck Stage-2 approval other than withdrawing or superseding the decision itself — worth surfacing to UX as an intentional (not missing) hard stop, in case the client experience needs to explain why a phase is frozen.
13. **`nudge_proposal` enforces a fixed 3-day cooldown with no client-facing override.** `last_nudged_at > now() - interval '3 days'` (§2.3) is hardcoded — there's no per-proposal or per-client cadence control on the designer side beyond that fixed window, consistent with gap #6's finding that client-side cadence control is limited to the two-value `reminder_cadence` setting.
