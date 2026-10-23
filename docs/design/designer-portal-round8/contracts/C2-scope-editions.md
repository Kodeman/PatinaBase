# C2 — Scope editions and service arrangements

Status: proposed contract (WP-00.5b, SQ-1813). Owner: service domain (WP-03). Decision: P04. Acceptance: A03, A04, A20 (signer policy input), X03, X09, X10. Fixture: F02.
Source inspected at `0fabcadf2` (integration branch; base `ee9c450a5`). All table, column and RPC names below are **proposed** unless they carry a file:line. Migration numbers are assigned at integration and are not reserved here.

## 1. What already exists (source of truth)

| Fact | Evidence |
|---|---|
| A named phase template is idempotent per proposal. A retry with the same `p_request_id` replays the recorded effect. A different request id for the same slug becomes an alias of the first effect. A changed effect is refused with `serialization_failure`. | `supabase/migrations/00474_schedule_template_comember_visibility.sql:107-180`; receipt table `proposal_phase_template_applications` PK `(proposal_id, request_id)` at `00399_journey_authority_integrity.sql:6049-6059` |
| The proposal row lock serializes callers. Template application is refused once the proposal leaves `draft`. | `00474:98-101`, `00474:186-190` |
| A **different** template slug still appends after the current main tail. This is intended and tested. | `00474:274-278`; hook doc `packages/supabase/src/hooks/use-phase-templates.ts:72-79`; test `supabase/tests/document/proposal_phase_authority_atomicity_test.sql:1036-1038` ("a deliberate different-template request still appends") |
| A project-side template seed records `source_template_slug` / `source_template_version`. | `00474:400`, `00474:505-506` |
| Agreement parts are an ordered list per proposal, keyed `UNIQUE (proposal_id, part_key)`. Each part carries `source_template_key` and `source_part_id`. | `supabase/migrations/00575_agreement_parts.sql:193-210` |
| Parts are written only through definer RPCs. Studio writes are revoked, and clients cannot read parts directly. | `00575:233-258` |
| `upsert_agreement_parts` works on draft proposals only, and it replaces the whole set (`DELETE ... WHERE proposal_id`). | `supabase/migrations/00618_authority_rate_role_binding.sql:410`, `:461-466`, `:781` |
| All parts are hashed into the signed fingerprint. | `00575:48-49` (F-3) |
| Commercial vocabulary: `document_kind` (`design_services`, `furnishings_authorization`, `service_addendum`, later `design_build`/`trade_scope`) and `commercial_state` (`draft … executed`, `superseded` with reason/replacement). | `supabase/migrations/00412_design_services_commercial_authority.sql:24-57` |
| Signatures: one row per `(proposal_id, party_role)`, with `party_role` limited to `client` and `studio`, plus an `evidence_fingerprint`. | `00412:98-109` |
| Countersign requires the client signer to be `proposals.client_id` and the signed fingerprint to equal the current one. | `supabase/migrations/00619_countersign_rate_binding_carry.sql:356-362` |
| The project link is `project_commercial_documents`: one origin per project (`is_origin`), plus addenda that point at `source_proposal_id`. | `00412:111-135` |
| **Amendment prior art.** `create_service_addendum` clones terms and rates from the active authority's source proposal into a new draft `service_addendum`. | `00412:1326-1408` |
| Countersigning an addendum locks the project row and supersedes the active `project_billing_authorities` row. That table allows one active row per project. | `00619:505-517`; partial unique index `00412:160-162` |

**Conclusions.**
- Template idempotency, signed-content hashing and the "successor instrument supersedes the active one" pattern all exist already.
- Four things are missing:
  1. an immutable record of the agreed scope that survives later drafts;
  2. a package identity that is stable across editions (part ids and keys are not stable, because `upsert_agreement_parts` deletes and reinserts them);
  3. explicit per-package inclusion and responsibility;
  4. an edition lineage that is distinct from billing authority. Billing authority is money only, and it carries no scope or packages.

## 2. Contract

### 2.1 Lifecycle

| Stage | Where it lives | Rule |
|---|---|---|
| Draft arrangement | Existing proposal with `proposal_phases` and `proposal_agreement_parts` | Mutable only while `proposals.status = 'draft'` (existing rule) |
| Presented arrangement | The same proposal with `commercial_state = 'sent'` | Existing send path. The fingerprint hashes the parts, including the scope packages |
| **Agreed effective edition** | New `project_scope_editions` row, minted in the same transaction that sets `commercial_state = 'executed'` | Immutable. Exactly one `active` edition per project |
| Amended / superseded | Successor edition minted when a `service_addendum` is executed. The predecessor becomes `superseded` | Never rewritten in place. Its packages and policy stay readable |

### 2.2 Scope packages in the draft: reuse agreement parts

- A package is an agreement part with `kind = 'scope_package'`. Its payload is validated by `upsert_agreement_parts` (a new branch alongside the existing money-shape validation at `00618:560-764`):
  ```
  { "packageKey": "pkg.<slug>",            // stable identity, unique per proposal, preserved across editions
    "label": "Kitchen cabinetry",
    "roomIds": ["<project_room uuid>"],    // optional; C1 owns the manifest join
    "inclusion": "included" | "excluded" | "conditional",
    "conditionText": "…",                  // required iff conditional
    "responsibilities": {                  // role slot -> party kind; C3 defines the slots and appointments
      "design": "studio", "purchasing": "studio" | "client" | "gc" | "other",
      "payer": "...", "fabrication_contract": "...", "installation": "...",
      "acceptance_signer": "client" },
    "overrideOf": null | "<packageKey of the arrangement default it overrides>",
    "provenance": { "arrangementKey": "...", "arrangementVersion": n } }
  ```
- `packageKey` lives in the payload. `part_key` and `id` do not identify a package because they rekey on every save (`00618:781`). The RPC refuses a duplicate `packageKey` within one proposal.
- An addendum draft copies its predecessor's packages and keeps their `packageKey`s. A changed package keeps its key, and its new content is the amendment.
- Responsibility values name **party kinds**, not people. A person's appointment, authority and access belong to C3. A role chosen in a draft never appoints anyone, grants access or rewrites an agreed appointment (A04).
- Because all parts are hashed (`00575:48-49`), the client signs the exact package set. No second hash is invented.

### 2.3 Service arrangement presets

- An arrangement is a named, versioned composition of:
  - one phase template slug (the existing `phase_templates`);
  - a set of standard parts, including default `scope_package` parts.
- Proposed RPC: `apply_service_arrangement(p_proposal_id uuid, p_arrangement_key text, p_request_id uuid) → jsonb`.

  **Response:**
  ```
  { "proposalId", "arrangementKey", "arrangementVersion",
    "phaseIds": [...], "partKeys": [...], "replayed": bool }
  ```

  **Behaviour:**
  - It locks the proposal `FOR UPDATE` first, which is the same first lock as `00474:98-101`.
  - It then calls the existing `apply_phase_template` body. This reuses its receipt, alias and drift rules unchanged.
  - It then materializes the arrangement's parts through the existing `upsert_agreement_parts` validation.
  - It writes one receipt row to the proposed `proposal_service_arrangement_applications`, keyed `(proposal_id, request_id)` and holding `arrangement_key`, `arrangement_version`, `effect_hash`.
- **Idempotency:**
  - Same request id: replay.
  - Same arrangement and a new request id: alias. This mirrors `00474:142-183`.
  - A *different* arrangement on a proposal that already has one: refused with `check_violation` / `arrangement_already_applied`.
- This deliberately differs from bare `apply_phase_template`, where a second slug appends (`00474:274-277`). Two arrangements on one proposal are the duplicate-phase case A04 forbids. Changing the arrangement requires discarding the draft parts and phases first, through the existing `discard_agreement_parts` hook (`packages/supabase/src/hooks/use-agreement-parts.ts:237-247`) and phase deletion. The existing slug-level behaviour is unchanged for current callers.
- Per-room or per-package overrides are ordinary part edits. They carry `overrideOf` and keep `provenance`, so a reader can tell a preset default from a designer override.

### 2.4 Minting the agreed edition

- **Proposed table `project_scope_editions`. Each row stores:**
  - `id`, `project_id`, and `edition_number`, which is unique per project and starts at 1;
  - `kind`: `baseline` or `amendment`;
  - `commercial_document_id`, which is UNIQUE and references `project_commercial_documents`;
  - `source_proposal_id`;
  - `predecessor_edition_id`, which is null only for the baseline;
  - `agreement_fingerprint`, equal to the client signature's `evidence_fingerprint`;
  - `effective_at`, equal to the studio signature's `signed_at`;
  - `content`, a frozen jsonb of the packages, phase ids and signer policy (§2.6), with `content_hash`;
  - `status`: `active` or `superseded`;
  - `superseded_at` and `superseded_by_edition_id`;
  - `created_at`.
- **Constraints.** A partial unique index allows one `active` row per project; this mirrors `00412:160-162`. An immutability trigger allows only the `status`, `superseded_at` and `superseded_by_edition_id` transition, and only under a capability setting. This is the same pattern as `app.project_completion_id` (`00399:62-71`).
- **Proposed child table `project_scope_edition_packages`.** Each row stores `(edition_id, package_key)` as the primary key, the frozen inclusion, the responsibilities and the provenance, so that C5 and C6 can join by key without parsing jsonb.
- **Where it is minted:** inside `_countersign_design_services_agreement_impl` (current head `00619:33`), on both branches:
  - the origin branch, after the commercial document insert;
  - the addendum branch, immediately after the authority supersession at `00619:515`.
- The studio wrapper `countersign_design_services_agreement` (`00475:931`) calls the impl at `00475:950`. A paper client signature (`record_paper_client_signature`, 00462/00477) still reaches execution through that countersign.
- Before relying on a single graft, the implementer must grep for every writer that sets `commercial_state = 'executed'` on `design_services`, `service_addendum` and `design_build` and confirm that none bypasses the impl. This was not proven exhaustively here.
- `design_build` follows the same branch as `design_services`.

### 2.5 Lock order and concurrency with acceptance

- Lock order. It extends the existing order and never inverts it:
  1. `proposals` (FOR UPDATE, existing);
  2. `projects` (FOR UPDATE; the existing addendum lock is at `00619:505-510`, and the origin path's `FOR SHARE` at `00619:428-431` must become FOR UPDATE while editions are active);
  3. `project_commercial_documents`;
  4. the active `project_scope_editions` row (FOR UPDATE);
  5. the insert of the new edition and its packages.
- **Stale amendment:**
  - Each addendum records the edition it was drafted against. This is the new column `proposals.drafted_against_scope_edition_id`, set by `create_service_addendum`.
  - At execution, if that id differs from the active edition, execution is refused with `serialization_failure` / `scope_edition_stale`.
  - Today two addenda drafted in parallel would both execute, and the later one would silently supersede the earlier. Under C2 the studio re-bases instead.
  - This refusal applies only while the edition capability is active (§2.8). With the capability inactive, the money rail behaves exactly as it does today.
- **Acceptance race (C4):**
  - A service-acceptance request freezes `scope_edition_id` and `content_hash`.
  - When an amendment executes, it marks every open request against the predecessor edition `superseded`. This happens in the same transaction, after the edition lock (step 4), and C4 states the matching lock order.
  - A response that arrives after the supersession commits is refused, because the response RPC locks the request and re-checks the edition's status.

### 2.6 Signer policy carried by the edition (input to C4 / P07)

- `content.signerPolicy` holds the agreed required and optional acceptance signers as party references: an authenticated profile id, or a `client_households.member_person_ids` contact (`supabase/migrations/00632_client_households.sql:99`).
- It also holds `policyRevision`.
- The edition records who must accept. C4 records who did.
- Changing a signer after agreement is an audited policy change (C4 §2.5). It does not rewrite the edition.

### 2.7 RLS and grants

- New tables: `ENABLE ROW LEVEL SECURITY`; `REVOKE ALL FROM PUBLIC, anon, authenticated`. Studio reads only through `get_project_scope_editions(p_project_id)` (SECURITY DEFINER), gated by the same studio predicate the parts table uses (`is_studio_comember(designer_id)` plus the tenant leg; see `00632` header).
- Clients see a curated projection inside the existing client bundle: package labels, inclusion and responsibility party kinds. They never see bids, costs or internal notes (C7).
- No direct write grant. Editions are written only by the countersign graft. `apply_service_arrangement` is granted to `authenticated` and checks `_can_author_proposal`, exactly as `00474:103`.

### 2.8 Activation and deactivation

- The migration ships the tables, the read RPC and the countersign graft. The graft is guarded by a server setting row (proposed `public.server_capabilities(key='scope_editions', enabled boolean)`, readable by definer functions only). Nothing is minted while it is disabled.
- `apply_service_arrangement` ships with `EXECUTE` revoked from `authenticated`. Activation is a separate reviewed migration that grants it and flips the setting.
- **Deactivation:**
  - Clearing the setting stops new mints and the stale-addendum refusal.
  - Revoking `apply_service_arrangement` stops new compositions.
  - Already-minted editions and the read RPC stay available, so history is never hidden.

### 2.9 Audit

- The edition row is the audit of agreement: actor = the studio countersigner, recorded through the signature rows; fingerprint; effective time.
- Arrangement application writes a receipt row (`created_by`, `created_at`).
- Supersession records the successor id and time.

### 2.10 Old-reader compatibility

| Consumer | Effect |
|---|---|
| Designer portal (`use-agreement-parts`, composer) | A new part kind appears in the parts list. `mapAgreementPart` (`use-agreement-parts.ts:74`) must pass an unknown kind through as prose. This needs a test before activation |
| Client portal | The bundle gains an optional `scopePackages` key. Absent or empty means today's rendering. The fingerprint does not change for proposals without `scope_package` parts (conditional key, `00575:29-36` F-1) |
| iOS Patina / Field | No reader of agreement parts was found in the inspected surfaces. No change |
| Money rail | `proposal_service_terms` projection unchanged. `scope_package` parts are not money shapes and are ignored by the projection (`00575` N-1) |

### 2.11 Backfill rule

- No package, inclusion, responsibility or signer is inferred for existing agreements.
- Optional: a `baseline` edition may be minted for an executed origin document only when both signature rows exist and the client signature's fingerprint equals `_commercial_document_fingerprint(proposal)`. Such an edition is minted with `content.packagesRecorded = false` and `content.signerPolicy = null`.
- Projects with only external agreement evidence (`00835:1-13`) or legacy documents get **no** edition. Readers show "No agreed scope edition recorded", not an empty agreed scope.
- How C4 treats legacy projects is a K4 item (see P04-P07-proposals).

### 2.12 Required tests (migration slice)

- Arrangement idempotency:
  - replay;
  - alias;
  - a different arrangement refused;
  - existing slug-level appends unchanged, re-running `proposal_phase_authority_atomicity_test.sql`.
- An edition is minted once per executed document. The countersign retry (`commercial_state = 'executed'` branch, `00619:367`) mints nothing new.
- An addendum supersedes its predecessor. A stale addendum is refused while the capability is active and allowed while it is inactive.
- Immutability: a direct UPDATE or DELETE of an edition or its packages fails.
- Populated legacy rows: there is no edition, and the readers return the absent state.
- Actor matrix: a comember, a second studio sharing the designer (tenant leg), the client and anon.

## 3. Out of scope / open

- `scope_change_requests` (00395) remain operational change records and are counted by `close_project` (`00399:7381-7400`). They do not mint editions. Whether an applied scope change must also yield an addendum is a WP-03 product question; it was not decided here.
- Appointments, authority limits and access for the role slots belong to C3. The package manifest that joins rooms, prints and configurations belongs to C1. C2 supplies `(scope_edition_id, package_key)` as the join key both can reference.
