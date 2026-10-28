# C4 — Evidence and client service acceptance

Status: proposed contract (WP-00.5b, SQ-1813). Owner: closeout domain (WP-10A backend). The client-consumer stream (WP-10C) owns the portal, iOS and offline presentation. Decisions: P07 (signers), K4, K5. Acceptance: A20, A22, X02, X03, X08, X09, X10. Fixture: F04.
Source inspected at `0fabcadf2`. Names without a file:line are **proposed**.

**Revision 2026-10-23 (SQ-1850).** Answers the SQ-1817 frontier review at `4952624a16d1` for findings F9 (§2.2, §2.4), F10 (§2.1, §2.2: signers come from the signed edition policy, C2 §2.6), F11 (§2.1 paper intakes, §2.2), F12 (§2.1 lifecycle, new §2.2a guard matrix, §2.5), plus the F8 suspension and F20 revoke rules that C2 §2.8 sets for every dependent. K4 and K5 stay **OPEN**.

**Revision 2026-10-23 (SQ-1856).** Answers the SQ-1851 re-review at `6ac0c5acc`:
- **R11** (§2.2, §2.5): a replacement validates the whole post-replacement active signer set atomically, with the create-time rules. One profile holds at most one active slot, so a response always resolves to exactly one slot.
- **R12** (§2.1, §2.2, §2.5): `signer_policy_revision` starts at 1 and every replacement increments it. `respond_service_acceptance` takes the revision the responder saw and refuses a stale one.
- **R15** (§2.2a): every C4 mutation checks its `client_request_id` receipt before any lifecycle check. An exact replay returns the first effect, even on a terminal request, and never reopens it.
- **R19** (§2.1, §2.2): the request binds one validated C1 evidence manifest by id, with purpose `service_acceptance`, instead of a hash with no source.

**Revision 2026-10-23 (SQ-1861).** Answers the SQ-1857 re-review at `55569724f9b3`:
- **T5** (§2.1, §2.2, §2.12): a replacement lapses every pending paper intake on the request, and confirmation re-checks signer activity, the current revision, the hashes and the absence of a response under the request lock. Conditional on K5; K5 stays **OPEN**.
- **T6** (§2.1, §2.2, §2.2a, §2.12): `withdraw_service_acceptance_request` takes `p_client_request_id`, and the request row carries its receipt and hash.

**Revision 2026-10-27 (SQ-2217).** Answers the SQ-2215 frontier review of the 00886 candidate: the paper content binding is a hash of the stored bytes, stamped by the service path, never object metadata (F1; §2.1, §2.2); client reads keep each response's method (F2; §2.2); the review decision vocabulary is `confirmed`/`rejected` (F4; §2.2); and the activation plan names its one storage-policy predicate exception and the stamp's `service_role` grant (F5; §2.8).

## 1. Why this cannot be a new approval kind

| Fact | Evidence |
|---|---|
| The web contract is `project_artifact_v1`, with kinds `plan_issue`, `spec_book_artifact` and `budget_version` | `packages/supabase/src/hooks/use-project-approvals.ts:12-17` |
| The parser **throws** on an unknown `artifactKind`, lifecycle status or disposition | `use-project-approvals.ts:337-345` |
| The list hook maps every row through that parser. One unknown row therefore fails the whole inbox | `use-project-approvals.ts:452` |
| The web authority type fixes `requiredCoapproverId: null` | `use-project-approvals.ts:120-128`, `:544`, `:596` |
| The schema reserves one coapprover: `project_decision_authorities.required_coapprover_id` | `supabase/migrations/00463_project_approval_authority_evidence.sql:87-103` |
| Confirmations allow roles `lead` or `coapprover` only, are `UNIQUE (decision_id, approver_role)`, and `review_method = 'portal_clickthrough'` | `00463:160-175` |
| So the artifact rail admits **at most two** approvers | `00463:160-175` |
| `_create_project_approval_decision_checked` **refuses** any non-null coapprover, and requires the decision lead to be `projects.client_id` | `supabase/migrations/00569_approval_why_viewer_role_and_receipt.sql:336`, `:552-563` |
| `viewerRole` is derived as `lead` (frozen decision lead), `studio`, or otherwise `household` | `00569:1131-1144` |
| Client portal: a null, absent or unknown role keeps the lead's acts | `apps/client-portal/src/components/threshold/approval-ask.tsx:1370-1381` |
| Patina iOS: an unknown role reads as "hers". The role is default-include | `apps/mobile/Patina/Patina/Core/Network/DecisionsAPIClient+ProjectApprovals.swift:189-195` |
| Agreement signatures allow one client row per proposal | `supabase/migrations/00412_design_services_commercial_authority.sql:98-109` |
| The signer must equal `proposals.client_id` | `supabase/migrations/00619_countersign_rate_binding_carry.sql:356-362` |
| Households are `studio_contacts` person cards, not authenticated profiles | `supabase/migrations/00632_client_households.sql:86-100` |

**Conclusion.**
- Joint service acceptance does not fit either the approval artifact rail or the commercial signature rail.
- Adding a kind would break older web inboxes, and an unknown role would make older native and web clients offer acts to observers.
- Service acceptance therefore gets its own record, RPCs and projection. It is never returned by `get_project_decision_reviews` or `get_project_decision_editions`.

**Prior art reused by pattern, not by row:**
- **Immutable attested evidence:** `00835_external_signed_agreements.sql:5-30`.
- **Outbound draft / V22.** The drafts table is `supabase/migrations/00775_outbound_drafts.sql:7-40`, and its status vocabulary includes `awaiting_review` and `superseded` (`:40`). `supabase/migrations/00785_outbound_delivery_truth.sql:1-19` separates three things:
  - an attempt;
  - delivery, set only by a provider acceptance;
  - after-send completion.
- **Paper provenance helper:** `_assert_paper_provenance` (used at `supabase/migrations/00475_schedule_ceremony_anchors.sql:1861`).
- **Pattern *not* reused.** `record_paper_trade_acceptance` stamps `accepted_by` with the client while the studio is the actor (`00475:1827-1829`, `:1850`, `:1889`, `:1893`). For whole-service acceptance under K5, a studio recording is never stored as the client's response.

## 2. Contract

### 2.1 Records (proposed)

**`service_acceptance_requests`.** Each row stores:
- `id`, `project_id`;
- `scope_edition_id` (C2) and `scope_content_hash`, frozen from the edition;
- `evidence_manifest_id` (FK to C1 `evidence_manifests`, `ON DELETE RESTRICT`) and `evidence_manifest_hash`, copied from that row at create. This is the C1 manifest of what the client reviews, such as the spec book or care pack. **SQ-1851 R19:** the earlier text froze a hash without naming the manifest it came from; with several manifests on a project, which evidence was accepted was undefined. Now the manifest is an explicit, validated create argument (§2.2), and the hash is never caller input;
- `request_number` (per project), with `predecessor_request_id`;
- `lifecycle`: `draft`, `sent`, `withdrawn`, `superseded` or `closed`. `withdrawn`, `superseded` and `closed` are **terminal**: no RPC moves a request out of them (F12);
- `aggregate_outcome`: `pending`, `accepted`, `accepted_with_conditions` or `returned`. Only the server derivation in §2.4 writes it. The moment it becomes non-`pending`, the same statement sets `lifecycle = 'closed'` and `closed_reason` to the outcome. An outcome is therefore never re-derived after it is reached;
- `closed_reason`, `closed_at`;
- `signer_policy_revision` (integer, `>= 1`). It is 1 at create and is incremented by exactly 1, in the same statement, by every `replace_service_acceptance_signer` (SQ-1851 R12). No other writer changes it;
- `outbound_draft_id` (`outbound_drafts`);
- `sent_at`, set by the after-send hook only;
- `superseded_reason`, `created_by`, `created_at`;
- **withdrawal receipt (SQ-1857 T6):** `withdrawn_by` (`REFERENCES profiles ON DELETE RESTRICT`), `withdrawn_at`, `withdraw_reason`, `withdraw_client_request_id` and `withdraw_request_hash` (the server's sha256 of `_plan_room_canonical_json({requestId, reason})`). All five are NULL until withdrawal and are set together, once, in the statement that sets `lifecycle = 'withdrawn'`. A request is withdrawn at most once, so the request row itself is the one receipt; no separate receipt table is needed.

**`service_acceptance_signers`.** Each row stores:
- `id`, `request_id`, `slot`;
- `required boolean`;
- `profile_id`, the authenticated identity that may respond. It may be null for a contact without an account;
- `household_person_id` (a `studio_contacts` card);
- `source`: `edition_policy` (copied from `project_scope_edition_signers`, C2 §2.6, never from jsonb) or `designer_declared`, the latter for legacy projects only and subject to K4;
- `policy_slot`, the edition signer slot it fills (NULL only for `designer_declared`);
- `status`: `active` or `replaced`;
- partial unique indexes `(request_id, profile_id) WHERE status = 'active' AND profile_id IS NOT NULL` and `(request_id, household_person_id) WHERE status = 'active' AND household_person_id IS NOT NULL`. One person holds at most one active slot on a request (SQ-1851 R11);
- `replaced_by_signer_id`, `replacement_reason`, `replaced_by`, `replaced_at`.

**`service_acceptance_responses`.** Append-only. Each row stores:
- `id`, `request_id`, `signer_id`;
- `response`: `accept`, `accept_with_conditions` or `return`;
- `conditions` (jsonb list; required and non-empty for the conditional response, empty otherwise) and `return_reason` (required iff `return`). Each condition is `{conditionId, text}`; the server assigns `conditionId` (uuid) on insert, so C6 can resolve conditions by id;
- `method`: `portal_authenticated`, `ios_authenticated` or `paper_intake`;
- `responder_profile_id`, which is `auth.uid()` and is null only for `paper_intake`;
- `paper_intake_id`;
- `scope_content_hash` and `evidence_manifest_hash` as presented to the responder, which must equal the request's values;
- `signer_policy_revision`, the revision the responder was shown, which must equal the request's current value (SQ-1851 R12);
- `client_request_id` and `request_hash`, the server's sha256 of the canonical payload (signer, response, conditions text, return reason, both presented hashes, presented revision);
- `responded_at`.

It also has these keys:
- `UNIQUE (request_id, signer_id)`. One effective response per signer per request. A changed mind needs a new request (§2.5).
- `UNIQUE (request_id, client_request_id)`.

**`service_acceptance_paper_intakes`.** Each row stores:
- `id`, `request_id`, `signer_id`;
- `storage_object_id`, immutable, in a private bucket as in `00835`, and `document_sha256`, the server-computed hash of the stored bytes (exact content binding, F11);
- `paper_signed_on`, `signed_name`;
- **the disposition the paper records (F11):** `disposition` (`accept`, `accept_with_conditions` or `return`), `conditions` (same shape and rules as a response) and `return_reason`. The recorder transcribes these from the paper. They are the signer's choice as written, not a studio judgment;
- **the presented binding (F11):** `presented_request_number`, `presented_scope_content_hash`, `presented_evidence_manifest_hash` and `presented_signer_policy_revision`. The printed request carries its request number and both hashes (short form plus full form in a machine-readable code). The recorder transcribes them, and the RPC refuses any value that differs from the request (`serialization_failure`, `stale_scope`);
- `recorded_by` (a studio member) and `recorded_at`;
- `review_state`: `pending_review`, `confirmed`, `rejected` or `lapsed`;
- `lapsed_reason` (SQ-1857 T5): `request_terminal` or `signer_policy_revised`, set only with `lapsed`;
- `reviewed_by` and `reviewed_at`;
- `review_note`.

**Review is not disposition (F11).** `confirmed` attests only that the stored document, as hashed, shows this signer's signature *and* the transcribed disposition, conditions and request binding. `rejected` means it does not (illegible, wrong version, wrong signer, mistranscribed). The reviewer cannot edit the disposition or conditions; a correction means rejecting and recording a new intake.

Only a `confirmed` intake creates a response with `method = 'paper_intake'`. The response copies the intake's disposition, conditions, return reason and presented binding. It keeps `recorded_by` and `reviewed_by` visible, and `responder_profile_id` stays NULL. An intake still `pending_review` when its request becomes terminal moves to `lapsed` (`lapsed_reason = 'request_terminal'`) in the same transaction.

**Paper consent is bound to the revision it was given under (Revision 2026-10-23, SQ-1857 T5).** The previous text checked the presented revision only when the intake was *recorded*. Review checked the bytes and the lifecycle only, and a replacement increments the revision without touching pending intakes. So: A's intake recorded at revision 1, B replaced (revision 2), then A's intake confirmed, created a response carrying revision 1 against a revision-2 request, contradicting the response rule above and the authenticated path (§2.2). Both seams are now closed; either one alone would prevent the case, and both are kept so that neither depends on the other being implemented first:
- **Lapse on replacement.** `replace_service_acceptance_signer`, in the same transaction and under the same locks as its increment, moves every `pending_review` intake on the request to `lapsed` with `lapsed_reason = 'signer_policy_revised'`. That includes intakes for signers other than the one replaced, because they too presented the old revision. The paper documents stay stored and readable; a signer whose paper lapsed signs a fresh printed request carrying the new revision.
- **Re-check at confirmation.** `review_service_acceptance_paper_intake` with `confirmed`, after taking the §2.3 locks (request FOR UPDATE, then the signer rows) and before inserting the response, refuses unless all of these hold at that moment: the intake's signer is still `active` (`signer_not_active`); `presented_signer_policy_revision` equals the request's current revision (`serialization_failure`, `stale_signer_policy`); both presented hashes and the request number still equal the request's (`stale_scope`); the edition is still `active` and `scope_editions` is on; and no response exists for that signer on the request (`already_responded`). A `rejected` decision needs none of these and never creates a response.
- **No carry-over.** Earlier paper consent is **not** preserved across a replacement. If a later ruling wants it preserved, that is a new exception with its own evidence-time rule and a reviewed contract change; this contract does not provide one.
- This is conditional on K5 permitting paper at all. It decides nothing about K5: if paper is forbidden, the intake RPCs stay revoked and these rules never run.

**How the content hash is bound (Revision 2026-10-27, SQ-2217; answers SQ-2215 F1).** Postgres cannot read the stored bytes, and storage metadata (eTag, size, version) is not a content hash. So the hash is computed outside the database and stamped onto the intake:
- **Record.** `record_service_acceptance_paper_intake` requires the object to be in the private paper bucket with a non-null storage `version` and an eTag, and records both on the intake (`storage_object_version`, `storage_object_etag`). It leaves `document_sha256` NULL. Its receipt carries `documentSha256: null` until the intake is stamped.
- **Stamp.** `stamp_service_acceptance_paper_hash(p_intake_id, p_document_sha256, p_object_version, p_object_etag)` is `service_role` only. It is revoked from `PUBLIC`, `anon` and `authenticated`, refuses any signed-in caller, and refuses while `scope_editions` is inactive. It refuses an intake that is not `pending_review` (`request_not_open`), a hash that is not 64 lowercase hex (`paper_document_hash_invalid`), and an object whose presented or current version or eTag differs from the recorded identity (`paper_document_changed`). Once stamped, the hash never moves: the same value replays, a different one raises `paper_document_hash_conflict`, and `document_stamped_at` records when it was bound.
- **Review.** `confirmed` refuses an unstamped intake (`paper_document_unstamped`), an expected hash that differs from the stamped one, and an object whose current version or eTag differs from the stamped identity (`paper_document_changed`). `rejected` may proceed unstamped, with the expected hash then NULL. A confirmed intake always carries a hash (table check).
- **Who hashes.** A byte-hashing edge function, owned by WP-10C, reads the stored PDF with the service role, hashes it and calls the stamp. Until it ships, recorded paper stays `pending_review` and cannot be confirmed.

Whether paper intake counts at all is K5 (**OPEN**). The fields above are the safe shape for either answer: if K5 forbids paper, the record RPC stays revoked and no intake exists.

### 2.2 RPCs (request → response)

| RPC | Caller | Request | Response / effect |
|---|---|---|---|
| `create_service_acceptance_request` | Studio author | `p_project_id, p_scope_edition_id, p_evidence_manifest_id, p_client_request_id` | `{requestId, lifecycle:'draft', outboundDraftId, signers:[…], signerPolicyRevision}`. Creates the request, copies signers from `project_scope_edition_signers` (C2 §2.6), and creates an `outbound_drafts` row with kind `service_acceptance_request` and status `awaiting_review` (V22). Nothing is sent. Refusals are listed below (F9) |
| Designer Send | Studio | Existing outbound send path | Delivery is recorded by the existing delivery truth (`00785`). The after-send hook for this kind sets `requests.sent_at` and `lifecycle='sent'` once (`after_send_done_at` semantics, `00785:14-17`). An attempt or an unknown outcome never marks the request sent |
| `respond_service_acceptance` | An authenticated signer | `p_request_id, p_response, p_conditions, p_return_reason, p_scope_content_hash, p_evidence_manifest_hash, p_signer_policy_revision, p_client_request_id` | `{responseId, aggregateOutcome, pendingRequiredSigners:n, signerPolicyRevision, replayed}`. The signer is the caller's single active slot (R11) |
| `record_service_acceptance_paper_intake` | Studio member | `p_request_id, p_signer_id, p_storage_object_id, p_paper_signed_on, p_signed_name, p_disposition, p_conditions, p_return_reason, p_presented_request_number, p_presented_scope_content_hash, p_presented_evidence_manifest_hash, p_presented_signer_policy_revision, p_client_request_id` | `{intakeId, reviewState:'pending_review', documentSha256:null}`. Records the object's storage version and eTag; the hash stays NULL until stamped (Revision 2026-10-27, SQ-2217, §2.1). It has no effect on the outcome (F11) |
| `stamp_service_acceptance_paper_hash` | `service_role` only (the WP-10C byte-hashing function) | `p_intake_id, p_document_sha256, p_object_version, p_object_etag` | `{intakeId, documentSha256, reviewState:'pending_review', replayed}`. Binds the hash of the stored bytes once; refusals in §2.1 (SQ-2217) |
| `review_service_acceptance_paper_intake` | Studio owner or admin, **not** the recorder | `p_intake_id, p_decision ('confirmed'/'rejected'; the older `'confirm'` is refused), p_expected_document_sha256, p_note, p_client_request_id` | `confirmed` is refused while the intake is unstamped (`paper_document_unstamped`), and either decision is refused if the expected value differs from the stamped hash; `confirmed` is also refused if the object's current version or eTag differs from the stamped identity (`paper_document_changed`). `rejected` needs a note and may proceed unstamped (SQ-2217). On `confirmed`, first re-checks signer activity, the current revision and hashes, and that no response exists, under the request and signer locks (§2.1, SQ-1857 T5); then inserts the response from the intake's recorded disposition and re-derives the outcome |
| `replace_service_acceptance_signer` | Studio owner or admin | `p_request_id, p_signer_id, p_new_profile_id/person_id, p_expected_signer_policy_revision, p_reason, p_client_request_id` | `{signerId, signerPolicyRevision, lapsedIntakeIds, replayed}`. Marks the old signer replaced, adds the new one, increments the revision and lapses every `pending_review` intake on the request (SQ-1857 T5). Allowed only before any outcome is reached (§2.2a, F12). Validation is below (R11). If the policy came from the edition, see §2.5 |
| `withdraw_service_acceptance_request` | Studio | `p_request_id, p_reason, p_client_request_id` | `{requestId, lifecycle:'withdrawn', withdrawnAt, replayed}`. `lifecycle='withdrawn'`, only from `draft` or `sent`. Responses stay readable as history. Receipt below (SQ-1857 T6) |
| `get_project_service_acceptance` | Studio read | `p_project_id` | Requests, signers, responses, intakes and the derived outcome |
| `get_my_service_acceptance_requests` | Client read | none | Only requests where the caller is an **active** signer or the project's client. Each row carries a `viewerRole` of `signer_required`, `signer_optional` or `observer`. This is a new vocabulary on a new projection, so no old parser sees it. Each active signer's response keeps its `method`, so a confirmed paper response reads `paper_intake`, distinct from an authenticated click-through; it withholds the response id, the paper object, its hash and who recorded or reviewed it (Revision 2026-10-27, SQ-2217) |

**`create_service_acceptance_request` refuses (SQ-1817 F9)** when the signer set would be missing, empty, duplicated or unbound. An empty set must never accept vacuously:
- the edition is not `active`, or `scope_editions` is inactive (C2 §2.8);
- the edition has no signer policy (`signerPolicy = null`, including the C2 §2.11 legacy baseline), unless a K4-permitted `designer_declared` list is supplied. That list passes the same checks below (`check_violation`, `signer_policy_missing`);
- the policy has zero `required` signers. Optional-only is refused (`signer_policy_no_required_signer`);
- two slots name the same profile or the same household person (`signer_policy_duplicate`);
- a signer has neither `profile_id` nor `household_person_id`, or names a person who is not the project's client or a member of that client's household (`signer_policy_unbound`);
- a required signer has no `profile_id` and paper intake is not permitted (K5 OPEN). Such a signer could never respond (`signer_policy_unreachable`).
- **evidence manifest (SQ-1851 R19):** `p_evidence_manifest_id` is required. The RPC reads the C1 row FOR SHARE and refuses unless `project_id = p_project_id` and `purpose = 'service_acceptance'` (`evidence_manifest_invalid`). It copies the row's `manifest_hash`; a manifest row is immutable (C1 §4), so the frozen hash and the id cannot diverge. A replay with the same `client_request_id` and a different manifest raises `idempotency_key_reused`.

**`replace_service_acceptance_signer` validates the whole result (SQ-1851 R11).** The earlier text applied the create rules only at create, so replacing B with A, who already held another slot, gave A two active slots, and `respond_service_acceptance` had no slot selector. Now, under the request lock and the signer locks (§2.3), the RPC computes the post-replacement active set (every active signer except `p_signer_id`, plus the new one) and refuses unless every create rule above holds for that set:
- the new person is not already an active signer on the request, by profile or by household person (`signer_policy_duplicate`). The partial unique indexes (§2.1) back this;
- the new signer is bound to the project's client household (`signer_policy_unbound`);
- if the slot is required, the new signer is reachable (`signer_policy_unreachable`);
- the set still has at least one required signer (`signer_policy_no_required_signer`). The slot keeps its `required` flag, so this holds by construction, and is still checked;
- `p_expected_signer_policy_revision` equals the current revision (`serialization_failure`, `stale_signer_policy`), so two concurrent replacements cannot both apply.
A refusal leaves the request, its signers and its revision unchanged.

**`respond_service_acceptance` refuses when:**
- the caller is not the `profile_id` of an `active` signer on the request (`insufficient_privilege`);
- the request is not `sent` (this includes every terminal lifecycle, §2.2a);
- the edition is no longer `active`, or `scope_editions` is inactive;
- the presented hashes differ (`serialization_failure`, `stale_scope`);
- `p_signer_policy_revision` differs from the request's current revision (`serialization_failure`, `stale_signer_policy`, SQ-1851 R12). A page loaded before a replacement cannot be stamped as having seen the new policy;
- the signer has already responded on this request under a different `client_request_id` (`unique_violation`, `already_responded`).

### 2.2a Lifecycle guards (SQ-1817 F12)

The earlier text called `returned` terminal only in the aggregate prose, while replacement re-derived the outcome without the returned response. So "return → replace the returning signer → the replacement accepts" resurrected the same request instead of requiring the successor. Terminality is now a lifecycle fact, checked by every mutation under the request's FOR UPDATE lock:

| Act | Allowed lifecycle | Refusal otherwise |
|---|---|---|
| Designer Send (after-send hook) | `draft` | hook is a no-op; never reopens |
| `respond_service_acceptance` | `sent` | `object_not_in_prerequisite_state`, `request_not_open` |
| `record_service_acceptance_paper_intake` | `sent` | same |
| `review_service_acceptance_paper_intake` | `sent`, intake `pending_review` | same; a `lapsed` intake cannot be reviewed |
| `replace_service_acceptance_signer` | `draft` or `sent` | same |
| `withdraw_service_acceptance_request` | `draft` or `sent` | same |
| C2 supersession | `draft` or `sent` | `closed` requests are left as they are |

- **Receipt replay comes first (SQ-1851 R15).** Every C4 mutation, after taking the request lock and before the lifecycle check above, looks up its `client_request_id` on that request (responses, intakes, reviews, replacements, withdrawals, and create by `(project_id, client_request_id)`):
  - Same caller and same server-computed `request_hash`: it returns the recorded effect with `replayed: true` and writes nothing. This holds on a terminal request, so the signer whose acceptance closed the request gets their answer back on a retry instead of `request_not_open`. A replay never reopens, re-derives or re-closes anything.
  - Different caller or different hash: `idempotency_key_reused`.
  - No receipt: the lifecycle check and the rest of the RPC run as written.
  - **Withdrawal (SQ-1857 T6).** The earlier text promised this replay for withdrawals, but the RPC had no key to replay by. `withdraw_service_acceptance_request` now takes `p_client_request_id`, and its receipt is the request row's withdrawal columns (§2.1). If `withdraw_client_request_id = p_client_request_id`: same caller (`withdrawn_by = auth.uid()`) and same hash returns `{requestId, lifecycle:'withdrawn', withdrawnAt, replayed:true}` and writes nothing; otherwise `idempotency_key_reused`. A different key on an already withdrawn (or otherwise terminal) request finds no receipt and falls through to the lifecycle check, which refuses `request_not_open`.
- `closed` is reached only through §2.4, when the outcome leaves `pending`.
- A replacement can therefore never act on a `returned`, accepted, withdrawn or superseded request.
- A replacement on an open request re-derives the outcome from the active signers. Because the replacement inherits the slot's `required` flag (§2.4) and has not yet responded, the outcome stays `pending`.

### 2.3 Lock order

1. `projects` (FOR SHARE, for a response; FOR UPDATE, for create, withdraw, replace and supersede).
2. The `project_scope_editions` active row (FOR SHARE). This matches C2 §2.5, which locks the edition *before* superseding open requests.
3. `service_acceptance_requests` (FOR UPDATE).
4. `service_acceptance_signers` (FOR UPDATE, ordered by id).
5. Insert into responses or intakes.

The C2 amendment path takes `projects` FOR UPDATE, then the edition, then the open requests. That is the same order, so there is no deadlock inversion.

The four C4 tables are C6 *contributing* tables (C6 §2.5, F7): a write to any of them takes the shared service-obligation lock through its row trigger. Every C4 mutation takes locks 1–4 above before its first such write, so it never holds the shared lock while waiting on a row that `complete_studio_service` holds.

### 2.4 Server-derived aggregate (no client-supplied "complete")

`_derive_service_acceptance_outcome(request_id)` runs inside every mutating RPC after the lock:

| Outcome | Condition |
|---|---|
| `returned` | Any active required signer returned |
| `accepted` | Every active required signer has `accept` |
| `accepted_with_conditions` | Every active required signer has `accept` or `accept_with_conditions`, and at least one is conditional |
| `pending` | Otherwise |

- **Zero required signers never accepts (F9).** The `accepted` and `accepted_with_conditions` rows apply only when there is at least one active required signer. If the active required set is ever empty, the derivation returns `pending` and raises `signer_policy_no_required_signer` on the mutating call. Create-time validation (§2.2) makes this unreachable; the derivation still fails closed instead of reading "all of none".
- A replacement keeps the slot required: the new signer inherits `required` from the slot it replaces, so replacement cannot empty the required set.
- Optional signers never change the outcome.
- Replaced signers' responses remain evidence but do not count.
- The column is written only by this function, under a capability setting, following the `app.project_completion_id` guard pattern (`supabase/migrations/00399_journey_authority_integrity.sql:62-71`).
- There is no RPC parameter that sets an outcome.
- Silence, an opened link, delivery, a walkthrough and a trade acceptance never create a response (A22).

### 2.5 Replacement, return and supersession

**Signer replacement:**
- Replacement is an audited policy change. It never deletes or edits a response.
- It is allowed only on a `draft` or `sent` request (§2.2a). A signer whose response already closed the request (a return, or the last acceptance) cannot be replaced on that request: the request is terminal, and the remedy is a successor request (F12).
- If the replaced signer had already responded on a still-open request (an `accept` while others are pending), the outcome is re-derived without that response.
- It validates the full post-replacement signer set and increments `signer_policy_revision` (§2.2, SQ-1851 R11, R12). Every response recorded after it must present the new revision.
- If the request's policy came from the agreed edition, the replacement also records the C3 delegation or revocation evidence. Whether a replacement needs an amendment edition is part of the K4 ruling.

**Return:**
- `returned` is terminal for that request: the outcome closes it (`lifecycle = 'closed'`, `closed_reason = 'returned'`), and §2.2a refuses every later act on it.
- The designer resolves the issues, then creates a successor request (`predecessor_request_id`). Earlier responses stay readable (A10, A20).

**Supersession:**
- C2 executes a new edition inside its transaction and marks every open request against the old edition `superseded` (`superseded_reason='scope_edition_superseded'`).
- A material scope change therefore always needs new evidence.
- `superseded` is also set when a successor request replaces a pending one.

**Withdrawal:** designer-initiated. History is preserved.

### 2.6 Consent method (K5)

- `portal_authenticated` and `ios_authenticated` are an authenticated click-through acceptance of an exact scope and evidence hash. They are **not** called an electronic signature in UI, data or export.
- `client_consent_method = 'electronic_signature'` exists in older decision vocabulary (`supabase/migrations/00254_record_offline_signature.sql:40-43`). It is not reused for service acceptance unless Kody approves a real signature mechanism.
- `paper_intake` counts only after an independent studio review (`reviewed_by <> recorded_by`), and only with the disposition, conditions and exact request binding recorded on the intake (§2.1, F11).
- Whether paper intake counts at all is K5 (**OPEN**). Safe default until it is ruled: the intake RPCs stay revoked, and a required signer without a profile makes request creation fail (`signer_policy_unreachable`, §2.2).

### 2.7 RLS and grants

- **RLS and tables:** all four tables have RLS enabled. `REVOKE ALL FROM PUBLIC, anon, authenticated`. Nothing grants direct SELECT. Reads go through the two definer read RPCs.
- **Studio read predicate:** `is_studio_comember(designer_id)` plus the tenant leg (`00632` header).
- **Client read predicate:** the caller is an active signer `profile_id`, or `projects.client_id`. Another household's job, a revoked signer, a GC, a maker and anon all get nothing (X02).
- **Storage:** the bucket is private, following `00835`'s bucket and policy boundary. The client sees only their own request's evidence manifest, never paper scans of other signers unless the request is shared to them as part of the evidence.

### 2.8 Activation and deactivation (deny-by-default)

- **Shipped inactive.** The migration ships the tables, read RPCs and mutation RPCs, with `REVOKE ALL ON FUNCTION … FROM PUBLIC, anon, authenticated` on every mutation and internal helper (the stack default grants `anon` and `authenticated`, `00654:209-214`; F20). The outbound kind is registered, but `create_service_acceptance_request` cannot run. Each mutation also refuses while `scope_editions` is inactive (C2 §2.8, F8).
- **Activation:**
  - **Requires** recorded K3, K4 and K5 rulings.
  - Is a separate reviewed migration that grants the mutations to `authenticated`.
  - Is followed by WP-10C consumer sign-off.
- **Deactivation:**
  - Revoke the mutation grants.
  - Read RPCs stay granted, so recorded evidence remains visible on every surface.
  - Open requests remain `sent` and cannot be answered. The consumer shows "responses are paused", never an error that looks like data loss.

**Activation grant plan (appended 2026-10-27, SQ-2202 / WP-10A; 00886 shipped inactive).** This is a plan, not a migration. Nothing below runs until a separate, reviewed activation migration is approved.

- **Preconditions:**
  - K3, K4 and K5 are recorded (DECISIONS.md, 2026-10-27).
  - WP-10C ships the renderer and registry entry for the outbound kind `service_acceptance_request` in `supabase/functions/_shared/outbound-kinds`. Until then a created request can never be sent.
  - WP-10C ships the client-portal and iOS consumers, whose sign-off follows activation (above).
  - 00886 has no C6 interlock. WP-10B adds the contributing-table trigger on the four C4 tables (§2.3), and the activation review records whether activation waits for it.
  - `scope_editions` stays the runtime pause switch. Every mutation re-checks it at entry.
- **The activation migration grants exactly these six functions to `authenticated`, with signatures as in 00886:**

```sql
-- GRANT EXECUTE ON FUNCTION public.create_service_acceptance_request(uuid,uuid,uuid,text) TO authenticated;
-- GRANT EXECUTE ON FUNCTION public.respond_service_acceptance(uuid,text,jsonb,text,text,text,integer,text,text) TO authenticated;
-- GRANT EXECUTE ON FUNCTION public.record_service_acceptance_paper_intake(uuid,uuid,uuid,date,text,text,jsonb,text,integer,text,text,integer,text) TO authenticated;
-- GRANT EXECUTE ON FUNCTION public.review_service_acceptance_paper_intake(uuid,text,text,text,text) TO authenticated;
-- GRANT EXECUTE ON FUNCTION public.replace_service_acceptance_signer(uuid,uuid,uuid,uuid,integer,text,text) TO authenticated;
-- GRANT EXECUTE ON FUNCTION public.withdraw_service_acceptance_request(uuid,text,text) TO authenticated;
```

- **It grants the paper content stamp to `service_role` only (Revision 2026-10-27, SQ-2217).** Its one caller is the WP-10C byte-hashing edge function (§2.1):

```sql
-- GRANT EXECUTE ON FUNCTION public.stamp_service_acceptance_paper_hash(uuid,text,text,text) TO service_role;
```

- **It never grants:**
  - anything to `PUBLIC` or `anon`;
  - anything to `service_role` except the stamp above, and never the stamp to `authenticated`;
  - any table privilege on the four C4 tables (reads stay the two definer RPCs);
  - any internal helper, guard or trigger function (`_service_acceptance_*`, including `_service_acceptance_paper_object_unchanged`, `_lock_service_acceptance_request`, `_derive_service_acceptance_outcome`, `_supersede_service_acceptance_request(s)`, `_lapse_service_acceptance_intakes`, `_validate_service_acceptance_signers`, `_guard_*service_acceptance*`).
- **The one predicate exception (Revision 2026-10-27, SQ-2217; answers SQ-2215 F5).** `_can_access_service_acceptance_paper_object(text)` is already granted to `authenticated` by 00886, because the paper bucket's storage policies call it in the caller's role. It is a read-only boolean predicate (`STABLE`, no writes) and the only helper any API role can execute. The activation migration does not change it and grants no other helper.
- **Storage:** the paper bucket's policies already exist in 00886. They let a studio composer upload a PDF under `<projectId>/<objectId>.pdf`. Recording it as evidence still needs the activated intake RPC.
- **In the same change:** regenerate `supabase/seed/00-legacy-grants.sql`. `database.types.ts` does not change, because grants are not typed.
- **Gate:** a SQL suite asserting `has_function_privilege` is true for `authenticated` on the six functions and false for `anon` and `service_role`; true for `service_role` on the stamp and false for `anon` and `authenticated`; true for `authenticated` on `_can_access_service_acceptance_paper_object(text)` and false for `anon` and `service_role`. Every other helper stays false for all three, and `PUBLIC` holds no EXECUTE. The 00886 oracle (`supabase/tests/round8/service_acceptance_*`) still passes.
- **Deactivation** is the inverse: `REVOKE EXECUTE … FROM authenticated` on the same six functions and `REVOKE EXECUTE … FROM service_role` on the stamp. Reads and the storage predicate stay granted.

### 2.9 Audit

- Every row carries its actor and time.
- Responses carry the presented hashes, the presented policy revision and the request hash.
- Requests carry the evidence manifest id and its hash.
- Intakes carry the recorder and the reviewer.
- Replacements carry their reason and actor.
- Nothing is updated in place except lifecycle and the derived outcome, under the capability.

### 2.10 Old-reader compatibility

| Consumer | Behaviour |
|---|---|
| Designer portal | `use-project-approvals` is unchanged. A new hook (`use-service-acceptance`) reads the new projection |
| Client portal | `approval-ask.tsx` and `active-project.ts` are unchanged and never receive service rows. The new surface reads `get_my_service_acceptance_requests` |
| Patina iOS (old installs) | They call only the existing approval and edition RPCs, so they never see service rows. That is safe but blind. They show no request, and the email or SMS from V22 links to the web portal |
| Patina iOS (new) | Decodes the new projection with an explicit `viewerRole` enum. An unknown value is **observer** (fail-closed) for this projection only. This deliberately differs from `:189-195`, and the asymmetry is documented in the Swift type |
| Field (Capture) | Does not read or write acceptance |
| Mixed-record test (X08) | A project carrying old artifact approvals plus new service requests. The old list RPC returns only artifact kinds, and the new list returns only service rows |

### 2.11 Backfill rule

- None.
- No historic approval, signature, trade acceptance (`trade_scope_terms.accepted_*`), walkthrough or `closure_checklist` item is converted into a service response or request.
- Legacy projects without a C2 edition cannot create a request until the K4 ruling on `designer_declared` signer policy is recorded.

### 2.12 Required tests

- One of two required signers accepted and the other pending: `pending`.
- Both accepted: `accepted`.
- One returned: `returned`.
- Replacement after one response.
- A superseded edition mid-request. A concurrent response and supersession: one wins, and the loser gets `stale_scope`.
- Duplicate submit with the same and with a different `client_request_id`.
- **Replacement revalidation (SQ-1851 R11):** signers A (slot 1, accepted) and B (slot 2, pending). Replacing B with A is refused (`signer_policy_duplicate`), and A still holds one active slot. Replacing B with a person outside the household is refused (`signer_policy_unbound`). Replacing a required profile signer with a profile-less person is refused (`signer_policy_unreachable`) while K5 forbids paper. After each refusal the revision is unchanged.
- **Policy revision (SQ-1851 R12):** the request starts at revision 1. A replacement makes it 2. A response presenting 1 is refused (`stale_signer_policy`); presenting 2 succeeds and stores 2. Two concurrent replacements presenting revision 1: one wins, the other gets `stale_signer_policy`.
- **Terminal replay (SQ-1851 R15):** the last required acceptance closes the request. Re-sending the same response with the same `client_request_id` returns the first `responseId` with `replayed: true` and the request stays `closed`. The same key with a different payload raises `idempotency_key_reused`. A new key from the same signer gets `request_not_open`. The same pattern holds for withdraw and paper review.
- **Manifest binding (SQ-1851 R19):** create refuses a manifest from another project and a manifest with purpose `fabrication_instruction` (`evidence_manifest_invalid`). With two `service_acceptance` manifests on the project, the request stores exactly the one named, and its hash equals that row's.
- An observer, a foreign household, a GC and a second studio are denied.
- Paper intake by the recorder cannot be self-reviewed.
- **F9 empty sets:** create is refused for a null-policy legacy baseline edition, an optional-only policy, a zero-signer policy, a duplicate person and an unbound reference. No request row exists after each refusal. The derivation over a request with zero active required signers returns `pending`.
- **F11 paper:** a conditional paper intake creates an `accept_with_conditions` response carrying the transcribed conditions; a returned paper intake creates a `return` response. A presented hash that differs is refused. A reviewer cannot change the disposition. A stored object whose bytes changed after intake cannot be confirmed.
- **F12 terminal:** return → replace the returning signer is refused (`request_not_open`). The same holds after acceptance and after withdrawal or supersession. A pending intake lapses when its request closes, and cannot then be reviewed. Return → successor request → accept works, and the first request stays `closed/returned`.
- **Paper across a revision (SQ-1857 T5; runs only if K5 permits paper):** record signer A's intake at revision 1, then replace signer B (revision 2). A's intake is `lapsed` with `signer_policy_revised`, and `lapsedIntakeIds` lists it; reviewing it is refused (`request_not_open` for a lapsed intake). Backstop with the lapse disabled by a fixture (intake forced back to `pending_review` under `session_replication_role = replica`): confirmation is refused `stale_signer_policy`, and no response row exists. Also refused at confirmation: an intake whose signer was replaced (`signer_not_active`), an intake for a signer who has since responded authenticated (`already_responded`), and an intake after the edition was superseded. A fresh intake presenting revision 2 confirms, and the response stores 2. A replacement and a confirmation racing in two sessions, both orders: either the replacement commits first and confirmation refuses, or the confirmation commits first with revision 1 and the replacement then re-derives the outcome without the replaced signer; never a response stamped 1 on a revision-2 request.
- **Withdrawal receipt (SQ-1857 T6):** withdraw with key K1: `lifecycle = 'withdrawn'` and the five withdrawal columns are set. Retry with K1, the same caller and reason: `replayed: true`, the same `withdrawnAt`, and no write (the row's `xmin` is unchanged). K1 with a different reason, or K1 from a different studio member: `idempotency_key_reused`. A new key K2 on the withdrawn request: `request_not_open`. Withdraw without a key: refused by the signature (no default).
- A V22 delivery failure or unknown outcome leaves the request `draft` and unsent.
- A direct call while inactive is denied; `has_function_privilege` is false for `PUBLIC`, `anon` and `authenticated` (F20). With `scope_editions` inactive, every mutation refuses even if its grant was restored (F8).
- Old-list exclusion (X08).

## 3. Rulings needed

- **K4:** the signer policy, as recommended in `P04-P07-proposals.md` §P07.
- **K5:** the consent and paper methods, as recommended in `P04-P07-proposals.md` §K5.

Activation (§2.8) is blocked until both are recorded. Schema and read work may proceed.
