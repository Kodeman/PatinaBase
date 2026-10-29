# C2 — Scope editions and service arrangements

Status: proposed contract (WP-00.5b, SQ-1813). Owner: service domain (WP-03). Decision: P04. Acceptance: A03, A04, A20 (signer policy input), X03, X09, X10. Fixture: F02.
Source inspected at `0fabcadf2` (integration branch; base `ee9c450a5`). All table, column and RPC names below are **proposed** unless they carry a file:line. Migration numbers are assigned at integration and are not reserved here.

**Revision 2026-10-23 (SQ-1850).** Answers the SQ-1817 frontier review (CHANGES REQUIRED at `4952624a16d1`) for findings F8 (§2.8), F10 (§2.2, §2.4, §2.6, new §2.4a), F13 (§2.3), F17 input (§2.2 responsibilities) and F20 (§2.7, §2.8). Anchors re-checked at `4952624a16d1`.

**Revision 2026-10-23 (SQ-1856).** Answers the SQ-1851 re-review at `6ac0c5acc47c`, marked inline with `SQ-1851 R#`:
- **R1 / R16** (new §2.2a): one canonical package key, `pkg.<slug>`, allocated and normalized on the server at draft time and copied unchanged into C1.
- **R10** (§2.2a retention, §2.4a): an amendment can never omit a predecessor package key. Leaving a package out of scope is an explicit `excluded` record that is kept.
- **R4 / F8** (§2.8): the C3 direct fabrication route is suspended with C4/C5/C6, and the shared gate itself re-checks the capability and the active edition.
- **R6 / F8** (§2.8): reconciliation replays every intervening executed amendment in order, so no phase is lost.
- **R7** (§2.4a, §2.7, §2.8): every new SECURITY DEFINER assignment or reconciliation mutation is bound to the recorded tenant and the target project.
- **R9 / F17** (new §2.5a): an amendment that would put an already contracted external package on the studio is held at send and at countersign until a transfer path is owned.
- **R8** (§2.2): service responsibilities are buyer-independent obligations in C6.

**Revision 2026-10-23 (SQ-1861).** Answers the SQ-1857 re-review at `55569724f9b3`, marked inline with `SQ-1857 T#`:
- **T1** (§2.7): the arrangement and reconciliation writers use `can_author_scope_proposal`, which reads the proposal's recorded studio and calls `_can_author_proposal` with the designer id, never the proposal id.
- **T2** (§2.4, §2.5a): the amendment hold covers every live external binding, contracted or not, including external lines left on a cancelled fulfilment; C5 keeps two exit acts available.
- **T3** (§2.2, §2.4a): a package part signs `servicePhaseIds`, the only writer of a phase's `package_key`, so C6 can require package-specific service bindings.
- **T4** (§2.4, §2.8, §2.12): reconciliation orders by a per-project execution sequence recorded under the job lock, not by `signed_at` or document id.
- Kept OPEN: addendum phase materialization (§3), the external transfer (§2.5a), K3–K5.

**Revision 2026-10-23 (SQ-1871).** Answers the SQ-1862 re-review at `b63705210`, marked inline with `SQ-1862 U#`:
- **U1** (§2.2, §2.4, §2.4a): the untyped `servicePhaseIds` is replaced by `serviceBindings`, typed per service slot (`design`, `installation`) and per package. Each edition records since when each studio slot has been owed, and a phase binding discharges a slot only if it was signed in that run. A design phase never discharges installation, and a slot that an amendment newly makes a studio obligation fails closed until a binding for it exists.
- **U2** (§2.2, §2.4a): an addendum draft copies its predecessor's packages with `serviceBindings` emptied. Bindings that are already signed travel through the edition lineage, not the draft payload. Cross-proposal validation is unchanged.

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
- **Template idempotency, adjudicated (SQ-1817).** A same-request replay and a same-slug alias (a new request id for a slug already applied) are idempotent. A *different* slug deliberately appends. Plan correction #4 ("already idempotent, 00474") is true at request and slug level only; it does not make two different templates on one proposal a no-op.
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
| Stale (F8) | An addendum executed while editions were deactivated. The active edition becomes `stale`; nothing is minted | Not consumable by C4, C5 or C6. Leaves only through `reconcile_scope_edition` (§2.8) |

### 2.2 Scope packages in the draft: reuse agreement parts

- A package is an agreement part with `kind = 'scope_package'`. Its payload is validated by `upsert_agreement_parts` (a new branch alongside the existing money-shape validation at `00618:560-764`):
  ```
  { "packageKey": "pkg.<slug>",            // canonical key (§2.2a); server-allocated when absent; unique per proposal; preserved across editions
    "label": "Kitchen cabinetry",
    "roomIds": ["<project_room uuid>"],    // optional; C1 owns the manifest join
    "inclusion": "included" | "excluded" | "conditional",
    "conditionText": "…",                  // required iff conditional
    "responsibilities": {                  // role slot -> party kind; C3 defines the slots and appointments
      "design": <partyKind>, "purchasing": <partyKind>, "payer": <partyKind>,
      "fabrication_contract": <partyKind>, "installation": <partyKind> },
    "serviceBindings": {                   // optional; typed per slot (§2.4a, SQ-1862 U1; replaces SQ-1857 T3's servicePhaseIds)
      "design": ["<proposal_phase uuid>"],       // this proposal's phases that perform this package's studio design
      "installation": ["<proposal_phase uuid>"] }, // this proposal's phases that perform this package's studio installation
    "overrideOf": null | "<packageKey of the arrangement default it overrides>",
    "provenance": { "arrangementKey": "...", "arrangementVersion": n } }
  // partyKind = "studio" | "client" | "gc" | "other" | "none"
  ```
- **Responsibility vocabulary (SQ-1817 F17 input).** All five slots are required on every package, each with one `partyKind`. `none` means the slot does not arise (for example, no fabrication on a design-only package). A missing slot or a value outside the vocabulary is refused by `upsert_agreement_parts`. C5 validates the *whole* combination, not `purchasing` alone, because whoever buys is not necessarily whoever owes the money (C5 §3.4). The former `acceptance_signer` slot is removed: who must accept is the signed signer policy (§2.6), not a party kind.
- **Service responsibilities do not follow the buyer (SQ-1851 R8).** `design` and `installation` name who performs a service, and they bind independently of `purchasing` and `payer`. A package bought and paid by the client with `installation = 'studio'` still carries a studio installation obligation, which C6 counts as a blocker (C6 §2.3). No reader infers a service obligation, or its absence, from who buys.
- `packageKey` lives in the payload. `part_key` and `id` do not identify a package because they rekey on every save (`00618:781`). The RPC refuses a duplicate `packageKey` within one proposal.
- An addendum draft copies its predecessor's packages and keeps their `packageKey`s. A changed package keeps its key, and its new content is the amendment. An addendum may never drop a key (§2.2a, R10).
- **What the copy carries (SQ-1862 U2).** The copy is taken when the addendum draft is created, from the frozen packages of `drafted_against_scope_edition_id` (§2.5). Every copied part keeps its key, label, rooms, inclusion, condition, responsibilities, `overrideOf` and provenance. Its `serviceBindings` is **emptied**: every predecessor phase id belongs to an earlier proposal, so copying them would fail the own-proposal check below, and they are already signed and frozen in the edition lineage (§2.4a carry-forward). In the addendum, `serviceBindings` names only the addendum's **own new** phases. Inherited bindings are never re-declared in the payload, and the composer shows them read-only from `get_project_scope_editions`.

### 2.2a Canonical package key (SQ-1851 R1, R16, R10)

This is the **only** definition of a package key. C1 `project_packages.package_key`, `project_scope_edition_packages.package_key`, `project_ffe_items.scope_package_key`, C5 `project_external_fulfilments.package_key` and the P04–P07 examples all use it unchanged.

- **Format.** `pkg.<slug>`, matching `^pkg\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$`: lowercase ASCII letters, digits and inner hyphens, 1–63 characters after `pkg.`, never starting or ending with a hyphen. Every table above carries this CHECK. C1's former code-derived form (`k`, no dot) is withdrawn (C1 §3).
- **Allocation (draft only).** The `scope_package` branch of `upsert_agreement_parts` allocates a key on the server for a package part that arrives **without** `packageKey`. A part that arrives **with** one must already match the format exactly; the RPC never repairs a caller's key (`check_violation`, `scope_package_key_invalid`). The composer sends back the key the server allocated on every later save, which is how a draft package keeps its key while `part_key` rekeys.
- **Normalization (R16).** The allocator derives the slug from the part's `label`:
  1. `s := lower(btrim(label))`;
  2. `s := regexp_replace(s, '[^a-z0-9]+', '-', 'g')`: every run of other characters, including accented letters, `#` and spaces, becomes one hyphen;
  3. `s := btrim(s, '-')`: a leading or trailing separator is dropped, so `#K` gives `k` and `Étage` gives `tage`;
  4. `s := rtrim(left(s, 56), '-')`, which leaves room for a suffix;
  5. if `s` is empty (a label of only punctuation or non-Latin characters), `s := 'package'`;
  6. `key := 'pkg.' || s`. If the key is already used by another `scope_package` part of the same proposal, the allocator appends `-2`, `-3`, and so on, until it is unused.
  The result always matches the format. The suite covers `#K`, `Étage`, `---`, `漢字`, a 200-character label and a collision.
- **Freezing.** At mint the key is copied into `project_scope_edition_packages.package_key` (§2.4). The client signed it, because it sits inside the hashed part payload (`00575:48-49`).
- **Into C1.** A C1 `project_packages` row receives the key only by copying it from the job's `active` edition (`create_project_package` with `p_package_key`, or `bind_project_package_key`, C1 §3). C1 never allocates or normalizes. One edition key resolves to at most one C1 row, including archived rows.
- **Retention across amendments (R10).** An addendum draft's `scope_package` set must contain every `packageKey` of the edition it was drafted against (`proposals.drafted_against_scope_edition_id`, §2.5). Taking a package out of scope is an edit to `inclusion = 'excluded'`, which keeps the key and is itself the preserved exclusion record. `upsert_agreement_parts` refuses an addendum draft that omits a predecessor key (`check_violation`, `scope_package_key_dropped`), and the mint (§2.4) and reconciliation (§2.8) refuse the same omission (`scope_edition_package_dropped`). So no agreed key ever disappears from a later edition, and C6 still fails closed on any key it cannot find (C6 §2.3).
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
- This deliberately differs from bare `apply_phase_template`, where a second slug appends (`00474:274-277`). Two arrangements on one proposal are the duplicate-phase case A04 forbids. The existing slug-level behaviour is unchanged for current callers.
- **Changing the arrangement needs a fresh draft proposal (SQ-1817 F13).** There is no same-proposal switch. The earlier text promised one after `discard_agreement_parts` plus phase deletion, and that cannot work:
  - `discard_agreement_parts` deletes only `proposal_agreement_parts` (`00575:3367`). The arrangement receipt and the template slug receipt survive.
  - So A → discard → B is still refused with `arrangement_already_applied`.
  - And A → discard → A fails the slug receipt's drift check, because the recorded phases are gone or changed (`00474:151-169`, `serialization_failure`).
  - The studio therefore starts a new draft proposal through the existing proposal creation path and applies the other arrangement there. The abandoned draft keeps its receipts as history and leaves through the existing proposal lifecycle (for example `declined`, `00412:43`). No receipt is deleted or reset, and no reset-generation operation is added.
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
  - `content`, a frozen jsonb of the packages, phase bindings and signer policy (§2.4a, §2.6), with `content_hash`. The child tables below are the canonical join surface; `content` is the hashed record of the same facts;
  - `status`: `active`, `stale` or `superseded` (`stale` is F8, §2.8);
  - `superseded_at` and `superseded_by_edition_id`;
  - `stale_at`, `stale_reason`, `stale_commercial_document_id`, `stale_execution_seq` (§2.8; the last is the stale document's recorded execution sequence, SQ-1857 T4);
  - `created_at`.
- **Constraints.** A partial unique index allows one `active` row per project; this mirrors `00412:160-162`. An immutability trigger allows only these transitions, and only under a capability setting: `active → superseded`, `active → stale`, `stale → superseded` (by reconciliation, §2.8). This is the same pattern as `app.project_completion_id` (`00399:62-71`).
- **Proposed child table `project_scope_edition_packages`.** Each row stores `(edition_id, package_key)` as the primary key, the frozen inclusion, the five responsibilities and the provenance, so that C5 and C6 can join by key without parsing jsonb. It also stores `design_owed_since int NULL` and `installation_owed_since int NULL` (SQ-1862 U1, §2.4a): the edition number from which that slot has continuously been an included studio obligation, or NULL when it is not one in this edition.
- **Proposed child tables `project_scope_edition_phases` and `project_scope_edition_signers`.** These are defined in §2.4a and §2.6.
- **Where it is minted:** inside `_countersign_design_services_agreement_impl` (current head `00619:33`), on both branches:
  - the origin branch, after the commercial document insert;
  - the addendum branch, immediately after the authority supersession at `00619:515`.
- **Refusals at mint (SQ-1851 R10, R9).** Before inserting, the mint refuses an amendment whose signed packages omit a key of the predecessor edition (`scope_edition_package_dropped`, §2.2a) and an amendment that would strand a live external binding (`scope_amendment_external_transfer_unowned` or `scope_amendment_external_binding_live`, §2.5a, SQ-1857 T2). Both refuse the countersign transaction, so no half-executed state is left.
- The studio wrapper `countersign_design_services_agreement` (`00475:931`) calls the impl at `00475:950`. A paper client signature (`record_paper_client_signature`, 00462/00477) still reaches execution through that countersign.
- Before relying on a single graft, the implementer must grep for every writer that sets `commercial_state = 'executed'` on `design_services`, `service_addendum` and `design_build` and confirm that none bypasses the impl. This was not proven exhaustively here.
- `design_build` follows the same branch as `design_services`.

### 2.4a Canonical phase, package and obligation bindings (SQ-1817 F10)

C4 and C6 must derive exact-scope acceptance and completion from joins, not from an implementer's interpretation. These are the joins.

**Phases.** Proposal phase ids are not project phase ids: activation copies each `proposal_phases` row into a new `project_phases` row and records `project_phases.source_proposal_phase_id` (`00331_ceremony_complete.sql:738-769`; latest copy `00763_pieces_activation_room_scope.sql:283-284`).
- `project_scope_edition_phases(edition_id, source_proposal_phase_id, project_phase_id NULL, package_key NULL, service_slot NULL, bound_in_edition int NULL)`, primary key `(edition_id, source_proposal_phase_id)`. `service_slot` is `design` or `installation`. A CHECK requires `package_key`, `service_slot` and `bound_in_edition` to be all NULL or all set (SQ-1862 U1).
- **Origin mint.** The origin branch activates the project inside the same countersign transaction (`00619:425`), so at mint every proposal phase already has its project phase. The mint resolves `project_phase_id` through `source_proposal_phase_id` and refuses (`check_violation`, `scope_edition_phase_unbound`) if any is missing.
- **Amendment mint (carry-forward).** The successor copies every predecessor phase row unchanged, then adds one row per addendum proposal phase. The addendum branch of countersign does not materialize project phases today (no `project_phases` write in `00619`). An added row therefore has `project_phase_id = NULL` until a phase writer binds it. C6 counts an agreed phase with no bound project phase as a blocker (`agreed_phase_unbound`). It fails closed and is never skipped.
- **Phase → package binding (Revision 2026-10-23, SQ-1857 T3).** `package_key` on a phase row was nullable with no writer, so C6 could only ask whether *some* phase existed. It now has one signed source: the `serviceBindings` of a `scope_package` part (§2.2).
- **Typed per service slot (Revision 2026-10-23, SQ-1862 U1).** The T3 binding was one untyped phase→package link. C6 accepted it as design coverage and also as installation coverage. So a completed design phase of K discharged an installation obligation that a later amendment added to K, with no installation work bound at all. Now each binding names the slot it performs, and a slot that becomes owed later needs a binding signed for it from then on.
  - **Draft validation** runs in `upsert_agreement_parts`, again at send and again at mint:
    - every id in `serviceBindings.design` and `serviceBindings.installation` is a `proposal_phases` row of the *same* proposal. An addendum names only its own new phases (§2.2, U2). An unknown, deleted or foreign id refuses (`scope_package_phase_unknown`). This cross-proposal check is unchanged; it is not relaxed for copied packages;
    - no id appears twice anywhere in the proposal's bindings, whether in two parts or in both slots of one part (`scope_package_phase_shared`). A phase therefore performs at most one slot of one package, which matches the scalar columns. A combined "design and install" phase binds to one slot; the other slot needs its own phase or, for installation, its member lines or fulfilments (C6 §2.3);
    - a slot may list phases only when that part has `inclusion = 'included'` and that slot's responsibility is `studio` (`scope_package_binding_slot_not_owed`). A binding is a promise to perform an owed studio service, so nothing binds to a slot owed by someone else, or to an excluded or conditional package.
  - **Mint.** Each edition phase row added from this document gets `package_key`, `service_slot` = the part and slot that list its source phase, and `bound_in_edition` = the new edition's `edition_number`. All three are NULL when no part lists the phase. Carried-forward rows keep all three unchanged, so an amendment cannot rebind or retype a predecessor phase.
  - **Owed-since (U1).** For each package K of the new edition N and each slot S in (`design`, `installation`), the mint sets `S_owed_since`:
    - NULL when K is not `included` in N, or S is not `studio` in N;
    - otherwise the predecessor edition's `S_owed_since` for K, when the predecessor also had K `included` with S = `studio`;
    - otherwise N. The slot became owed in this edition: newly added, newly included, or newly made a studio service.
    The origin mint has no predecessor, so every owed slot gets N. Reconciliation (§2.8) applies the same rule edition by edition, in `execution_seq` order. Owed-since is part of the frozen `content` and `content_hash`.
  - **What discharges a slot.** A phase row discharges slot S of K in edition E only when `package_key = K`, `service_slot = S` and `bound_in_edition >= E.S_owed_since`. A design binding never discharges installation, and installation never discharges design. A binding signed before the slot's current run began never counts. A predecessor's binding still counts while the slot stays owed without a break, because `owed_since` is carried.
  - The binding is inside the hashed part payload (`00575:48-49`), so the client signs which phases deliver which service of which package. `serviceBindings` is a new optional payload key, and an absent or empty object is stored as absent. A proposal without it, including an addendum part copied with emptied bindings (§2.2, U2), fingerprints exactly as today.
  - **Consumer.** C6 §2.3 requires, for each included package with a studio `design` or `installation` responsibility, at least one binding that discharges that slot. Otherwise it blocks with `studio_design_unbound` / `studio_installation_unbound`. A phase with a NULL `package_key` still counts under the agreed-phase blocker, but it discharges no package's studio service.
  - A package part that omits `serviceBindings` is valid in the draft. If its package is included with an owed studio slot and nothing discharges it, C6 blocks it as unbound until an amendment binds a phase to that slot (or, for installation, a line or fulfilment exists). That is fail-closed, not a draft refusal. The composer should warn before send. Baseline editions (§2.11) record no packages, so this adds no blocker to them.
- Carry-forward is cumulative. This contract defines no way to drop an agreed phase from the obligation set; that is a WP-03 question (§3). Deleting a `project_phases` row does not remove the obligation: the binding then points at a missing row, which C6 also counts as `agreed_phase_unbound`.

**Packages.** The package identity shared by C1, C3, C5 and C6 is `(project_id, package_key)`, with the key format of §2.2a (SQ-1851 R1).
- Editions hold per-edition package *content* keyed by `package_key` (the table above).
- C1's `project_packages` row (UUID) carries the same `package_key`, copied from the active edition, never derived (C1 §3). The key is set at most once, immutable, and unique per project *including archived rows*, so a frozen key never re-binds to a later package. Until the WP-05 migration lands, the C5 fabrication route has no package to resolve and stays refused (C3 §3.2).
- C3's shared gate `public.assert_fabrication_instruction_authority` takes the C5 fulfilment id and resolves `(project_id, package_key)` to the C1 UUID itself, under its own lock order (C3 §3.2, SQ-1851 R3). A C1 package with a NULL `package_key` is not in agreed scope, so no C3, C5 or C6 rule treats it as included.

**FF&E membership.** A new nullable `project_ffe_items.scope_package_key text` with the §2.2a CHECK, written only by a definer RPC `assign_ffe_items_to_scope_package(p_project_id, p_item_ids uuid[], p_package_key, p_client_request_id)`.
- **Authority (SQ-1851 R7).** The RPC is SECURITY DEFINER, so table RLS does not protect it. Before any read of item rows it requires `can_compose_project_plan(p_project_id)`, C1's recorded-tenant predicate (C1 §3): an active non-guest member of `projects.studio_id`, narrowed by the designer leg, or on a studio-less job the designer of record only. It never uses person co-membership alone (SQ-1852). Otherwise `insufficient_privilege` (42501). If the C1 migration has not landed, the C2 migration creates that predicate with C1's exact body, and C1 later reuses it.
- **Lock order.** `_ffe_lock_job_labels(p_project_id)` (`00808:85-97`), then the active edition row FOR SHARE, then the item rows FOR UPDATE in id order.
- **Same project (SQ-1851 R7).** After the item locks, every id in `p_item_ids` must be a row with `project_id = p_project_id`. One foreign, missing or duplicate id refuses the whole call (`scope_assignment_item_off_project`), and nothing is written.
- The RPC refuses a key absent from the active edition (`package_key_not_in_edition`).
- **External lines (SQ-1851 R8).** The RPC refuses a line with an `external_fulfilment_id` (`scope_assignment_external_line`). C5's conversion sets such a line's `scope_package_key` to its fulfilment's `package_key` in the same transaction (C5 §3.2), so an external line's membership is the fulfilment's package, never a second choice.
- C6 counts a live studio line (no `external_fulfilment_id`, no `trade_scope_document_id`) with a NULL key as a blocker (`ffe_unassigned_to_package`). Membership is never inferred from room, label or category.
- Package keys survive amendments (§2.2a retention), so membership carries forward without a rewrite.

### 2.5 Lock order and concurrency with acceptance

- Lock order. Project → proposal → document, then the edition. Countersign, reconcile and `create_service_addendum` take them in this order; no writer takes a project row after a proposal it can share with them:
  1. `projects` (FOR UPDATE; countersign locks it first, `00885:173`, whenever the document already exists. A lead with no document yet locks its proposal first, but its project has no executed document for reconcile to hold);
  2. `proposals` (FOR UPDATE, `00885:251`);
  3. `project_commercial_documents` (FOR UPDATE, `00885:264`);
  4. the active `project_scope_editions` row (FOR UPDATE);
  5. the insert of the execution-order row (§2.8, SQ-1857 T4; on every execution, minting or not), then of the new edition and its packages.
- **Stale amendment:**
  - Each addendum records the edition it was drafted against. This is the new column `proposals.drafted_against_scope_edition_id`, set by `create_service_addendum`. That RPC takes `projects` FOR KEY SHARE before it reads the billing source or inserts the addendum proposal, whose `parent_proposal_id` FK locks the source proposal (RC7-fix3), so it too goes project → proposal → document.
  - At execution, if that id differs from the active edition, execution is refused with `PT409` / `scope_edition_stale`.
  - Today two addenda drafted in parallel would both execute, and the later one would silently supersede the earlier. Under C2 the studio re-bases instead.
  - This refusal applies only while the edition capability is active (§2.8). With the capability inactive, the money rail behaves exactly as it does today, but the edition is still invalidated (§2.8, F8).
- **Acceptance race (C4):**
  - A service-acceptance request freezes `scope_edition_id` and `content_hash`.
  - When an amendment executes, it marks every open request against the predecessor edition `superseded`. This happens in the same transaction, after the edition lock (step 4), and C4 states the matching lock order.
  - A response that arrives after the supersession commits is refused, because the response RPC locks the request and re-checks the edition's status.

### 2.5a Amendments that would move external work onto the studio (SQ-1851 R9, F17)

**The gap.** C5 freezes a fulfilment when a later edition makes the studio its buyer, payer or contracting party (C5 §3.4). The revision promised that the studio would then "move the obligation to an existing commerce rail". No such move exists: C5 forbids reverse conversion after any `contract_reported` event (C5 §3.2), and existing commerce refuses an external line (C5 §3.3). The fulfilment would stay frozen with no permitted exit.

**The rule: hold the amendment.** This contract defines no transfer. An amendment that needs one is refused until a separately owned transfer contract exists.
- **Incompatible package.** A package of the amendment's signed parts is *incompatible* when its new responsibilities fail C5's external-only rule (C5 §3.4: `purchasing`, `payer` or `fabrication_contract` becomes `studio`, or `payer` becomes `none`), evaluated by C5's one helper body applied to the amendment's frozen package content.
- **Live external binding (Revision 2026-10-23, SQ-1857 T2).** The previous test counted only non-`cancelled` fulfilments **with** a `contract_reported` event, and said the studio would reverse-convert and cancel first, but no server check enforced that prerequisite. A live uncontracted fulfilment F with an external line L therefore passed a payer→studio amendment; once that edition was active, C5 §3.4 refused every later mutation of F, including reversal and cancellation, so F and L had no permitted exit. The test now covers every live binding, contracted or not. For an incompatible package with key K, the project has a *live external binding* when any of these exists:
  1. a C5 fulfilment with `package_key = K` whose status is not `cancelled`, whatever events it has;
  2. a `project_ffe_items` row that is not removed or superseded and whose `external_fulfilment_id` names any fulfilment with `package_key = K`, **including a `cancelled` one**. A cancellation label never hides a retained external line;
  3. a `cancelled` fulfilment with `package_key = K` that has a `contract_reported` event and whose `cancelled` event is not `verified` (C5 §3.1 evidence level). A reported cancellation of a contracted package is not proof that the external commitment ended.
  A `cancelled` fulfilment with no live line and no contract, or with a contract whose cancellation is verified, is not a binding.
- **Where it is refused.** With `scope_editions` active, the addendum's send path and the countersign graft (§2.4, after the step-4 lock) both refuse an amendment with any incompatible package that has a live external binding. The code tells the studio which exit applies:
  - `scope_amendment_external_transfer_unowned` when the binding is contracted (case 1 or 3 with a `contract_reported` event): there is no exit until a transfer contract is owned (below);
  - `scope_amendment_external_binding_live` otherwise: the studio must first reverse-convert every external line of the package into ordinary pricing (C5 §3.2) and record `cancelled` on each fulfilment, and only then send or execute the amendment.
  Both are `check_violation`. Send is checked so the client is never asked to sign an amendment the studio cannot execute. Countersign is checked again under the step-4 edition lock because C5 creation, conversion and events take the active edition FOR SHARE (C5 §3.5 step 3), so a binding created between send and countersign is seen. Nothing is reclassified silently.
- **While editions are inactive.** The money rail is unchanged (§2.8), so such an addendum can execute. Its edition goes `stale` as usual, and reconciliation (§2.8 step 3) applies the same binding test and refuses with the same codes. The project then stays without an active edition, so C4, C5 and C6 stay refused. For an uncontracted binding the hold ends once the studio reverse-converts and cancels; that is possible because, once the capability is back on, C5's two *exit acts* (reverse conversion into pricing and a `cancelled` event on an uncontracted fulfilment) need no active edition and skip the external-only re-check (C5 §3.4, revised for T2). For a contracted binding it lasts until a transfer contract is owned. That is the intended fail-closed hold.
- **OPEN, not designed here.** The audited transfer of a contracted external package into studio commerce belongs to a later WP-06/WP-08 contract under its own frontier review.

### 2.6 Signer policy carried by the edition (input to C4 / P07)

**Signed input (SQ-1817 F10).** The earlier text said the policy was "agreed" but gave the draft no place to hold it and named no writer. Now:
- The draft carries the policy as one agreement part with `kind = 'acceptance_signer_policy'` (at most one per proposal), written by the existing `upsert_agreement_parts` under its draft-only rule. Its payload:
  ```
  { "policyRevision": 1,
    "signers": [ { "slot": "client.primary", "required": true,
                   "profileId": "<uuid>" | null, "householdPersonId": "<uuid>" | null } ] }
  ```
- Because every part is hashed into the signed fingerprint (`00575:48-49`), the client signs the exact policy. No second signature path is invented.
- Draft validation: unique `slot`; exactly one of `profileId` / `householdPersonId`; no person in two slots; each reference must be the proposal's client or a member of that client's household (`00632_client_households.sql:99`). A part that fails is refused, not stored.
- An addendum draft copies its predecessor's policy part; a change to it is part of what the amendment signs.

**Frozen record.** At mint the part becomes `content.signerPolicy` and rows in `project_scope_edition_signers(edition_id, slot, required, profile_id, household_person_id, policy_revision)`, primary key `(edition_id, slot)`. C4 copies signers from these rows, not from jsonb.
- The edition records who must accept. C4 records who did.
- An edition minted without the part (a proposal with no `acceptance_signer_policy`, or the §2.11 legacy baseline) has **no** policy. Its `signerPolicy` is `null` and it has zero signer rows. That is not an empty set of obligations: C4 refuses to create a request against it (C4 §2.2, F9).
- Changing a signer after agreement is an audited policy change (C4 §2.5). It does not rewrite the edition.

### 2.7 RLS and grants

- New tables: `ENABLE ROW LEVEL SECURITY`; `REVOKE ALL FROM PUBLIC, anon, authenticated`. Studio reads only through `get_project_scope_editions(p_project_id)` (SECURITY DEFINER), gated by the same studio predicate the parts table uses (`is_studio_comember(designer_id)` plus the tenant leg; see `00632` header).
- Clients see a curated projection inside the existing client bundle: package labels, inclusion and responsibility party kinds. They never see bids, costs or internal notes (C7).
- No direct write grant. Editions are written only by the countersign graft and the reconciliation RPC (§2.8). Once activated (§2.8), `apply_service_arrangement` checks `can_author_scope_proposal` on the proposal row it locked (below).
- **Proposal authority, tenant first (Revision 2026-10-23, SQ-1857 T1).** The previous text called `_can_author_proposal(p_proposal_id)`. That is the wrong argument: the only definition, `00387_project_proposal_authority_boundaries.sql:533-559`, takes the proposal *owner's* profile id, and its one cited caller passes `v_proposal.designer_id` (`00474:103`). Passing the proposal UUID would deny every valid call. Fixing the argument alone is not enough either: the helper is true for a member of *any* active design studio the designer also belongs to, so with designer D in studios A and B, a B-only member would pass it for A's draft (the SQ-1852 mechanism). Every C2 definer mutation that authorizes against a proposal therefore uses one predicate that reads the studio from the proposal's **record**, evaluated on the row the RPC has already locked FOR UPDATE:
  ```sql
  CREATE FUNCTION public.can_author_scope_proposal(p_proposal_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT auth.uid() IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.proposals pr
       WHERE pr.id = p_proposal_id
         AND CASE
               WHEN pr.studio_id IS NOT NULL THEN
                 public.is_active_studio_member(pr.studio_id)
                 AND public._can_author_proposal(pr.designer_id)
               ELSE pr.designer_id = (SELECT auth.uid())
             END);
  $$;
  REVOKE ALL ON FUNCTION public.can_author_scope_proposal(uuid) FROM PUBLIC, anon, authenticated;
  ```
  - `proposals.studio_id` is the database-written studio stamp of `00813_us37_inherited_pricing_paths.sql:145`/`:503` (R189). The predicate never derives a studio from the caller.
  - `_can_author_proposal` is always called with `pr.designer_id`, exactly as `00474:103`. It is kept only as an extra narrowing (the designer leg, as in C1 §3); it never widens access.
  - **Studio-less proposal** (`studio_id IS NULL`): only the designer of record passes. A co-member from any of the designer's studios is refused, as for a studio-less job in C1 §3.
  - It is an internal helper: no `authenticated` grant; the mutations call it from their definer bodies.
  - Scope: this corrects the new C2 writers only. It does not repair the inherited `_can_author_proposal` callers (SQ-1852 program).
- **Every new definer mutation names its authority (SQ-1851 R7).** Table RLS and the read RPC's predicate do not protect a SECURITY DEFINER write. So:

  | Mutation | Authority checked in its own body, before any read of target rows | Target binding |
  |---|---|---|
  | `apply_service_arrangement` | `can_author_scope_proposal(p_proposal_id)` (T1, above), evaluated after `SELECT … FROM proposals WHERE id = p_proposal_id FOR UPDATE` | the proposal row it locked |
  | `assign_ffe_items_to_scope_package` | `can_compose_project_plan(p_project_id)` (recorded tenant, C1 §3) | every item's `project_id = p_project_id` (§2.4a) |
  | `reconcile_scope_edition` | `can_compose_project_plan(p_project_id)` **and** `can_author_scope_proposal` on the source proposal of every document it replays | every replayed document's `project_commercial_documents.project_id = p_project_id`; its source proposal's project is the same job; and a replayed source proposal whose `studio_id` is non-NULL must equal `projects.studio_id` (`scope_reconcile_tenant_mismatch`, 42501) (§2.8) |

  The recorded tenant is `projects.studio_id` for a job (00624:335-365, the 00813:157-182 stamped-project pattern) and `proposals.studio_id` for a proposal (00813, T1). No mutation derives a studio from the caller or relies on person co-membership alone (00556:51-75; SQ-1852). A failure raises 42501 and writes nothing.

### 2.8 Activation and deactivation

- The migration ships the tables, the read RPC and the countersign graft. The graft is guarded by a server setting row (proposed `public.server_capabilities(key='scope_editions', enabled boolean)`, readable by definer functions only). Nothing is minted while it is disabled.
- **Inactive means non-callable (SQ-1817 F20).** The stack's default privileges give `anon` and `authenticated` EXECUTE on every new function (`00654_client_letter_phone_status.sql:209-214`). So every new mutation RPC here (`apply_service_arrangement`, `assign_ffe_items_to_scope_package`, `reconcile_scope_edition`) ships with `REVOKE ALL ON FUNCTION … FROM PUBLIC, anon, authenticated`; revoking `authenticated` alone is not enough. Internal helpers keep the same revoke permanently. Activation is a separate reviewed migration that grants the mutations to `authenticated` and flips the setting. An `auth.uid()` guard inside the body does not replace the revoke.

**Deactivation (SQ-1817 F8).** The earlier text cleared the setting and left C4, C5 and C6 running against editions that could no longer be superseded. Example: E1 is active, then addendum E2's terms execute while the setting is off. E1 stays `active`, its pending acceptance stays answerable, and C6 can complete against obsolete E1. The corrected rule has three parts.

1. **Dependents are suspended atomically.** One deactivation migration clears the setting *and* revokes every C4, C5 and C6 mutation grant in the same transaction. Each of those mutation RPCs also re-checks `scope_editions` at entry and refuses with `object_not_in_prerequisite_state` / `scope_editions_inactive`. A grant restored on its own therefore still cannot consume an edition.
   - **The C3 direct route is a dependent too (SQ-1851 R4).** `record_fabrication_instruction` (C3 §3.2) writes a C5 instruction event, so the deactivation migration revokes it with the C5 mutations. More importantly, the shared gate `public.assert_fabrication_instruction_authority` itself refuses `scope_editions_inactive` and refuses a job without an `active` edition. Every instruction route goes through that gate, so neither a restored grant nor a route added later can instruct fabrication against a paused or stale edition.
2. **Invalidation never switches off.** Only *minting* and the stale-addendum *refusal* stop. When the countersign impl executes a `service_addendum` (or any document on the addendum branch) for a project that has an `active` edition, the graft still runs in the same transaction, after the step-4 lock (§2.5). It mints nothing. It moves the active edition to `stale` (`stale_reason = 'amended_while_inactive'`, `stale_commercial_document_id` = the executed document, `stale_execution_seq` = that document's sequence below). It also marks every open C4 request against that edition `superseded` (`superseded_reason = 'scope_edition_stale'`). The money rail is unchanged.

   **Recorded execution order (Revision 2026-10-23, SQ-1857 T4).** The previous replay ordered documents by the studio signature's `signed_at`, then document id. That is not execution order. `commercial_document_signatures.signed_at` defaults to transaction-start `now()` (`00412_design_services_commercial_authority.sql:106`), and the countersign impl inserts the studio signature (`00619_countersign_rate_binding_carry.sql:401-407`) *before* it takes the project serialization lock (`00619:489-492`, `:505-507`). So a transaction that started earlier can execute later, and two executions can carry the same timestamp; a document UUID is not ordered at all. Moving the insert after the lock would not help, because `now()` is still transaction start. The order is therefore recorded, not derived:
   - **Proposed append-only `project_commercial_execution_order(project_id, execution_seq bigint, commercial_document_id, predecessor_document_id NULL, recorded_at)`**, primary key `(project_id, execution_seq)`, `UNIQUE (commercial_document_id)`, `CHECK (execution_seq >= 1)`. RLS on, `REVOKE ALL FROM PUBLIC, anon, authenticated`, no write grant, an immutability trigger refusing UPDATE and DELETE. Written only by the countersign graft.
   - **Assignment.** The graft writes one row for **every** document the impl executes on either branch, whatever the capability setting and whether or not the project has an edition, because a later reconciliation can need any of them (an addendum executed while the edition is already `stale` must still be ordered). It assigns `execution_seq = COALESCE(max(execution_seq), 0) + 1` for the project and `predecessor_document_id` = the document holding the previous maximum, **while holding `projects` FOR UPDATE** (step 1 of §2.5; on the addendum branch the lock at `00619:505-507`; on the origin branch the `FOR SHARE` at `00619:428-431` becomes FOR UPDATE unconditionally, not only while editions are active). The row lock serializes every assignment for the job, so the sequence is gap-free, has no ties, and follows the order in which executions take the job lock, which is the order their serialized effects (authority supersession, edition invalidation, this row) apply. The primary key is a backstop: a writer that skipped the lock fails rather than duplicating a number. The countersign retry branch (`00619:367`) writes nothing.
   - **Every writer.** The §2.4 grep for writers that set `commercial_state = 'executed'` now has a second purpose: each one must write this row under the same lock, or be shown to route through the impl. A document executed without a row makes reconciliation refuse (below), never guess.
   - **Backfill.** The migration inserts one row per already-executed document, per project, numbered in `executed_at`, then document id, order, with `legacy_order = true` (a boolean column, false for every graft-written row). That historical order is trusted for nothing: it only gives every executed document a row, so the missing-row refusal below has no false positives. Reconciliation never replays a legacy row, because the stale transition, and so `stale_execution_seq`, happens only through the graft after the migration.
3. **Reactivation requires explicit reconciliation.** Re-enabling the setting does not revive anything. A project whose latest edition is `stale` has no `active` edition, so C4, C5 and C6 refuse on it, and readers show "Scope changed while editions were paused — reconcile". The studio runs `reconcile_scope_edition(p_project_id, p_commercial_document_id, p_client_request_id)`.

   **Revision 2026-10-23 (SQ-1851 R6): replay every intervening amendment.** The earlier text minted one edition from the latest executed document alone. Phases come only from each addendum's own proposal phases, carried forward edition by edition (§2.4a), and `create_service_addendum` copies terms and rates, not phases (latest body `00816:358-449`). So with A2 adding P2 and A3 adding P3 while paused, a mint from A3 alone had no edition holding P2, and P2 was lost. Now:
   - **Preconditions.** The setting is on. The caller passes the §2.7 authority checks (R7, T1). The named document is the **latest** executed document for `p_project_id` by recorded `execution_seq` (the row with the project's maximum sequence, read under the `projects` lock below), and its `project_id` is that job. If that latest row is not an addendum-branch document, or `p_commercial_document_id` is not it, the call refuses (`scope_reconcile_not_latest`).
   - **The replay set (SQ-1857 T4).** Every row of `project_commercial_execution_order` for the project with `execution_seq` from the stale edition's `stale_execution_seq` through the latest sequence inclusive, in ascending `execution_seq`. Timestamps and document ids play no part in membership or order. The set must be contiguous: walking it, each row's `predecessor_document_id` must be the previous row's document, and the first row's document must equal `stale_commercial_document_id`; any gap or mismatch refuses (`scope_reconcile_order_broken`), as does any executed document of the project that has no order row at all (a writer the §2.4 grep missed). Each document must belong to `p_project_id`, and the caller must pass `can_author_scope_proposal` on each source proposal (T1). A document that fails either check refuses the whole call.
   - **Lock order.** Project → proposals → documents (`00870:81-125`): `projects` FOR UPDATE, then every source proposal FOR UPDATE in id order, then the documents FOR UPDATE in id order, then the latest edition (which must be the stale one) FOR UPDATE. Each `_mint_scope_edition` call then re-takes `projects`, the proposal and the document, which it already holds. This is the same order as countersign and `create_service_addendum` (§2.5). The document and proposal set comes from an unlocked snapshot of the order rows and executed documents (`_scope_reconciliation_snapshot`), taken before the `projects` lock. On a new request the RPC re-reads that snapshot after locking `projects` and again after locking the documents, and refuses with `serialization_failure` (`scope_reconcile_order_moved`) if it changed. The latest sequence and the replay set are read after those locks, so a countersign cannot add a row between the read and the mint. PostgREST retries the 40001 itself; each further attempt needs another concurrent commit, so the retry is bounded.
   - **Minting.** One `amendment` edition per document, in `execution_seq` order, in the one transaction. The final edition's package and signer-policy content therefore comes from the document with the highest sequence, never from a document that merely carries a later timestamp. Each edition's predecessor is the previous one (the first one's is the stale edition), and each applies the ordinary amendment mint: carry forward every predecessor phase row, add the document's own proposal phases, freeze its signed packages and signer policy. Each edition gets `content.reconciled = true`. Every edition except the last is moved `active → superseded` by its successor in the same transaction, so the partial unique index sees one `active` row at a time. The stale edition moves `stale → superseded` once the first replayed edition exists.
   - **Checks per document.** The R10 retention check (§2.2a) and the R9 stranding check (§2.5a) run for every replayed document. One failure refuses the whole reconciliation, and nothing is minted.
   - **Idempotency.** `p_client_request_id` replays the first effect. The response lists every minted edition id in order.
   - **Result.** The last edition carries the cumulative phase bindings of every intervening amendment: P2 and P3 in the example above.
   The activation migration's review lists every project with a `stale` edition. It never reconciles them automatically.

- Revoking `apply_service_arrangement` stops new compositions.
- Already-minted editions (active, stale or superseded) and the read RPC stay available, so history is never hidden.

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
- Optional: a `baseline` edition may be minted for an executed origin document only when both signature rows exist and the client signature's fingerprint equals `_commercial_document_fingerprint(proposal)`. Such an edition is minted with `content.packagesRecorded = false` and `content.signerPolicy = null`. A null policy means "no agreed signers recorded", so C4 cannot create a request against it (F9); only the K4 `designer_declared` path, if Kody allows it, can supply signers.
- Projects with only external agreement evidence (`00835:1-13`) or legacy documents get **no** edition. Readers show "No agreed scope edition recorded", not an empty agreed scope.
- How C4 treats legacy projects is a K4 item (see P04-P07-proposals).

### 2.12 Required tests (migration slice)

- Arrangement idempotency:
  - replay;
  - alias;
  - a different arrangement refused;
  - existing slug-level appends unchanged, re-running `proposal_phase_authority_atomicity_test.sql`.
- **F13:** apply A, discard parts, apply B on the same proposal: refused `arrangement_already_applied`. Apply B on a fresh draft proposal: succeeds, and the abandoned draft's receipts are unchanged.
- An edition is minted once per executed document. The countersign retry (`commercial_state = 'executed'` branch, `00619:367`) mints nothing new.
- An addendum supersedes its predecessor. A stale addendum is refused while the capability is active and allowed while it is inactive.
- **F8 (rollback):** with the setting off, executing an addendum moves the active edition to `stale` and supersedes its open C4 request in the same transaction. A C4 response, C5 mutation and C6 completion against that project are then refused, both with grants revoked and with a grant restored alone (`scope_editions_inactive`). After the setting is back on and before reconciliation, they are still refused (no active edition). After `reconcile_scope_edition`, a fresh request is required.
- **F10 bindings:** the origin mint binds every proposal phase to its project phase through `source_proposal_phase_id`. An addendum phase is carried with `project_phase_id = NULL`. A malformed `acceptance_signer_policy` part (duplicate slot, two references, a person outside the client household) is refused at upsert. The policy part changes the fingerprint.
- **F20:** `has_function_privilege` is false for `anon`, `authenticated` and `PUBLIC` on every mutation RPC before activation.
- Immutability: a direct UPDATE or DELETE of an edition or its packages, phases or signers fails.
- Populated legacy rows: there is no edition, and the readers return the absent state.
- Actor matrix: a comember, a second studio sharing the designer (tenant leg), the client and anon.
- **SQ-1851 R1/R16 (keys):** the allocator turns `#K` into `pkg.k`, `Étage` into `pkg.tage`, `---` and `漢字` into `pkg.package`, a 200-character label into a valid ≤67-character key, and a second "Kitchen" into `pkg.kitchen-2`. A caller key that fails the format is refused, not repaired. The signed key reaches C1 unchanged (C1 §3 tests).
- **SQ-1851 R10 (retention):** an addendum draft that omits a predecessor key is refused at upsert, at mint and at reconciliation. Setting the package to `excluded` is accepted, and the key stays in the successor edition.
- **SQ-1851 R6 (replay):** with editions off, execute A2 (adds P2), then A3 (adds P3). Turn editions on and reconcile with A3. Two editions are minted in order; the active one binds P1, P2 and P3, and the intermediate one is `superseded`. Reconciling with A2 while A3 exists is refused (not the latest). A replayed document from another project is refused, and nothing is minted.
- **SQ-1851 R7 (definer authority):** a B-only co-member of the designer, a guest and the job client are refused by `assign_ffe_items_to_scope_package` and `reconcile_scope_edition`. An A member assigning one item of another job among several valid ids is refused (`scope_assignment_item_off_project`), and no item changes. An external line is refused (`scope_assignment_external_line`).
- **SQ-1851 R9 (hold):** a fulfilment with `contract_reported` on `pkg.kitchen-cabinetry`; an addendum that makes the studio its payer is refused at send and at countersign (`scope_amendment_external_transfer_unowned`). With no contract reported, reverse-convert and cancel first, then the addendum executes. With editions off, the addendum executes and goes `stale`, and reconciliation refuses.
- **SQ-1851 R4:** with editions off, `record_fabrication_instruction` and the C5 instruction route both refuse `scope_editions_inactive`, including with a grant restored alone.
- **SQ-1857 T3 / SQ-1862 U1 (typed phase → package binding):**
  - The following are refused at upsert, send and mint: a part listing a phase of another proposal or an unknown id (`scope_package_phase_unknown`); a phase listed by a second part, or in both slots of one part (`scope_package_phase_shared`); a phase listed under a slot whose responsibility is not `studio`, or under a package that is not `included` (`scope_package_binding_slot_not_owed`).
  - The mint sets `package_key`, `service_slot` and `bound_in_edition` on exactly the listed phases' edition rows and NULL on the rest. Carried-forward rows keep all three.
  - Adding `serviceBindings` changes the fingerprint. A proposal without it, or with an empty object, fingerprints as before.
  - **Owed-since:** E1 has `pkg.kitchen` with `design='studio'` and `installation='gc'`, so `design_owed_since = 1` and `installation_owed_since` is NULL. Amendment A2 changes only installation to `studio`. E2 has `design_owed_since = 1` (carried) and `installation_owed_since = 2`. A3 sets installation back to `gc`, and A4 sets it to `studio` again: E4 has `installation_owed_since = 4`. A3 setting `pkg.kitchen` to `conditional` resets both slots the same way.
  - C6 §2.11 covers the consumer, including the K-design-then-amended-install case.
- **SQ-1862 U2 (addendum copy):**
  - E1's `pkg.kitchen` part binds origin phase P under `serviceBindings.design`. `create_service_addendum` drafts A2, and A2's copied `pkg.kitchen` part has the same key and content with `serviceBindings` absent. The studio changes one unrelated term (a rate, or `pkg.lighting`'s label).
  - Upsert, send and countersign of A2 all succeed. E2 carries P's edition row unchanged (`package_key = 'pkg.kitchen'`, `service_slot = 'design'`, `bound_in_edition = 1`), and P still discharges `pkg.kitchen`'s design in C6.
  - A2's part edited to re-list P is refused (`scope_package_phase_unknown`), so cross-proposal validation is unchanged.
  - A2 listing its own new phase Q under `installation`, after setting installation to `studio`, is accepted. E2 binds Q with `bound_in_edition = 2`.
- **SQ-1857 T1 (proposal authority):** with designer D active in studios A and B and a draft proposal stamped `studio_id = A`: an A member passes `apply_service_arrangement`; a B-only member is refused (42501) although `_can_author_proposal(D)` is true for them; a guest of A is refused. On a studio-less draft only D passes; an A or B co-member is refused. A valid call is not refused for passing the proposal id where the owner id belongs (regression for the wrong argument). `reconcile_scope_edition` refuses a replayed source proposal stamped to a studio other than `projects.studio_id` (`scope_reconcile_tenant_mismatch`), and refuses a B-only caller even when `can_compose_project_plan` would pass for the job's own members. `has_function_privilege('authenticated', 'can_author_scope_proposal(uuid)', 'EXECUTE')` is false.
- **SQ-1857 T2 (live bindings):** package `pkg.chairs` with buyer = client, payer = client; an amendment makes payer = studio.
  - An uncontracted, non-cancelled fulfilment F with external line L: send and countersign refuse `scope_amendment_external_binding_live`.
  - Record `cancelled` on F while L is still external: refused `fulfilment_cancel_lines_live` (C5). Reverse-convert L, cancel F, then the amendment sends and executes.
  - F `cancelled` but L still names F (fixture): the amendment is refused; a cancellation label does not hide L.
  - A contracted F, cancelled by a `reported` event only: refused `scope_amendment_external_transfer_unowned`; after the cancellation is `verified` and no line names F, accepted.
  - With editions off the amendment executes and goes `stale`; after reactivation, reconciliation refuses with the same code; the C5 exit acts (reverse conversion, cancel) succeed with no active edition; reconciliation then succeeds. Every other C5 mutation still refuses on that job until reconciliation.
  - A fulfilment created between send and countersign is seen by the countersign check.
- **SQ-1857 T4 (execution order):** all with editions off, then on.
  - *Reversed transaction starts:* session 1 runs `BEGIN; SELECT now();`, which fixes its transaction-start time t1. Session 2 then begins at t2 > t1, countersigns A3 and commits. Session 1 then countersigns A2 and commits. A2's `signed_at` (t1) is earlier than A3's (t2), but `execution_seq(A3) < execution_seq(A2)`. Reconciliation must name A2 (A3 is refused `scope_reconcile_not_latest`); editions are minted A3 then A2, and the active edition's packages and signer policy are A2's. The stale edition's `stale_commercial_document_id` is A3, the first document to execute.
  - *Ties:* two addenda whose studio signatures carry identical `signed_at` (fixture-set under `session_replication_role = replica`) and whose document UUIDs sort opposite to their sequence: order and latest follow the sequence only.
  - *Broken order:* deleting or forging an order row is refused by the trigger; a fixture document executed with no order row makes reconciliation refuse `scope_reconcile_order_broken`, and nothing is minted.
  - *Moved set:* a countersign that commits after reconciliation read its set but before its `projects` lock makes reconciliation refuse `scope_reconcile_order_moved`; a retry succeeds.
  - The sequence is gap-free and starts at 1 for a new job's origin; the countersign retry branch adds no row; legacy backfill rows carry `legacy_order = true` and are never replayed.

## 3. Out of scope / open

- `scope_change_requests` (00395) remain operational change records and are counted by `close_project` (`00399:7381-7400`). They do not mint editions. Whether an applied scope change must also yield an addendum is a WP-03 product question; it was not decided here.
- Dropping an agreed phase from the obligation set (§2.4a) and materializing addendum phases as project phases are WP-03 questions. Until they are answered, both fail closed in C6. (Still OPEN after SQ-1851. The R6 replay keeps every agreed phase binding; it does not decide materialization.)
- The audited transfer of a contracted external package into studio commerce (§2.5a). OPEN; until it is owned, the amendment is held.
- Appointments, authority limits and access for the role slots belong to C3. The package manifest that joins rooms, prints and configurations belongs to C1. C2 supplies `(scope_edition_id, package_key)` as the join key both can reference.
