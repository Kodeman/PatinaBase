# C4 — Evidence and client service acceptance

Status: proposed contract (WP-00.5b, SQ-1813). Owner: closeout domain (WP-10A backend). The client-consumer stream (WP-10C) owns the portal, iOS and offline presentation. Decisions: P07 (signers), K4, K5. Acceptance: A20, A22, X02, X03, X08, X09, X10. Fixture: F04.
Source inspected at `0fabcadf2`. Names without a file:line are **proposed**.

**Revision 2026-10-23 (SQ-1850).** Answers the SQ-1817 frontier review at `4952624a16d1` for findings F9 (§2.2, §2.4), F10 (§2.1, §2.2: signers come from the signed edition policy, C2 §2.6), F11 (§2.1 paper intakes, §2.2), F12 (§2.1 lifecycle, new §2.2a guard matrix, §2.5), plus the F8 suspension and F20 revoke rules that C2 §2.8 sets for every dependent. K4 and K5 stay **OPEN**.

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
- `evidence_manifest_hash`, the C1 manifest of what the client reviews, such as the spec book or care pack;
- `request_number` (per project), with `predecessor_request_id`;
- `lifecycle`: `draft`, `sent`, `withdrawn`, `superseded` or `closed`. `withdrawn`, `superseded` and `closed` are **terminal**: no RPC moves a request out of them (F12);
- `aggregate_outcome`: `pending`, `accepted`, `accepted_with_conditions` or `returned`. Only the server derivation in §2.4 writes it. The moment it becomes non-`pending`, the same statement sets `lifecycle = 'closed'` and `closed_reason` to the outcome. An outcome is therefore never re-derived after it is reached;
- `closed_reason`, `closed_at`;
- `signer_policy_revision`;
- `outbound_draft_id` (`outbound_drafts`);
- `sent_at`, set by the after-send hook only;
- `superseded_reason`, `created_by`, `created_at`.

**`service_acceptance_signers`.** Each row stores:
- `id`, `request_id`, `slot`;
- `required boolean`;
- `profile_id`, the authenticated identity that may respond. It may be null for a contact without an account;
- `household_person_id` (a `studio_contacts` card);
- `source`: `edition_policy` (copied from `project_scope_edition_signers`, C2 §2.6, never from jsonb) or `designer_declared`, the latter for legacy projects only and subject to K4;
- `policy_slot`, the edition signer slot it fills (NULL only for `designer_declared`);
- `status`: `active` or `replaced`;
- `replaced_by_signer_id`, `replacement_reason`, `replaced_by`, `replaced_at`.

**`service_acceptance_responses`.** Append-only. Each row stores:
- `id`, `request_id`, `signer_id`;
- `response`: `accept`, `accept_with_conditions` or `return`;
- `conditions` (jsonb list; required and non-empty for the conditional response, empty otherwise) and `return_reason` (required iff `return`). Each condition is `{conditionId, text}`; the server assigns `conditionId` (uuid) on insert, so C6 can resolve conditions by id;
- `method`: `portal_authenticated`, `ios_authenticated` or `paper_intake`;
- `responder_profile_id`, which is `auth.uid()` and is null only for `paper_intake`;
- `paper_intake_id`;
- `scope_content_hash` and `evidence_manifest_hash` as presented to the responder, which must equal the request's values;
- `signer_policy_revision`;
- `client_request_id`;
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
- `reviewed_by` and `reviewed_at`;
- `review_note`.

**Review is not disposition (F11).** `confirmed` attests only that the stored document, as hashed, shows this signer's signature *and* the transcribed disposition, conditions and request binding. `rejected` means it does not (illegible, wrong version, wrong signer, mistranscribed). The reviewer cannot edit the disposition or conditions; a correction means rejecting and recording a new intake.

Only a `confirmed` intake creates a response with `method = 'paper_intake'`. The response copies the intake's disposition, conditions, return reason and presented binding. It keeps `recorded_by` and `reviewed_by` visible, and `responder_profile_id` stays NULL. An intake still `pending_review` when its request becomes terminal moves to `lapsed` in the same transaction.

Whether paper intake counts at all is K5 (**OPEN**). The fields above are the safe shape for either answer: if K5 forbids paper, the record RPC stays revoked and no intake exists.

### 2.2 RPCs (request → response)

| RPC | Caller | Request | Response / effect |
|---|---|---|---|
| `create_service_acceptance_request` | Studio author | `p_project_id, p_scope_edition_id, p_client_request_id` | `{requestId, lifecycle:'draft', outboundDraftId, signers:[…], signerPolicyRevision}`. Creates the request, copies signers from `project_scope_edition_signers` (C2 §2.6), and creates an `outbound_drafts` row with kind `service_acceptance_request` and status `awaiting_review` (V22). Nothing is sent. Refusals are listed below (F9) |
| Designer Send | Studio | Existing outbound send path | Delivery is recorded by the existing delivery truth (`00785`). The after-send hook for this kind sets `requests.sent_at` and `lifecycle='sent'` once (`after_send_done_at` semantics, `00785:14-17`). An attempt or an unknown outcome never marks the request sent |
| `respond_service_acceptance` | An authenticated signer | `p_request_id, p_response, p_conditions, p_return_reason, p_scope_content_hash, p_evidence_manifest_hash, p_client_request_id` | `{responseId, aggregateOutcome, pendingRequiredSigners:n, replayed}` |
| `record_service_acceptance_paper_intake` | Studio member | `p_request_id, p_signer_id, p_storage_object_id, p_paper_signed_on, p_signed_name, p_disposition, p_conditions, p_return_reason, p_presented_request_number, p_presented_scope_content_hash, p_presented_evidence_manifest_hash, p_presented_signer_policy_revision, p_client_request_id` | `{intakeId, reviewState:'pending_review', documentSha256}`. The server hashes the stored object. It has no effect on the outcome (F11) |
| `review_service_acceptance_paper_intake` | Studio owner or admin, **not** the recorder | `p_intake_id, p_decision ('confirmed'/'rejected'), p_expected_document_sha256, p_note, p_client_request_id` | Refused if the stored bytes no longer hash to the intake's `document_sha256` or to the expected value. On `confirmed`, inserts the response from the intake's recorded disposition and re-derives the outcome |
| `replace_service_acceptance_signer` | Studio owner or admin | `p_request_id, p_signer_id, p_new_profile_id/person_id, p_reason, p_client_request_id` | Marks the old signer replaced and adds the new one. Allowed only before any outcome is reached (§2.2a, F12). If the policy came from the edition, see §2.5 |
| `withdraw_service_acceptance_request` | Studio | `p_request_id, p_reason` | `lifecycle='withdrawn'`, only from `draft` or `sent`. Responses stay readable as history |
| `get_project_service_acceptance` | Studio read | `p_project_id` | Requests, signers, responses, intakes and the derived outcome |
| `get_my_service_acceptance_requests` | Client read | none | Only requests where the caller is an **active** signer or the project's client. Each row carries a `viewerRole` of `signer_required`, `signer_optional` or `observer`. This is a new vocabulary on a new projection, so no old parser sees it |

**`create_service_acceptance_request` refuses (SQ-1817 F9)** when the signer set would be missing, empty, duplicated or unbound. An empty set must never accept vacuously:
- the edition is not `active`, or `scope_editions` is inactive (C2 §2.8);
- the edition has no signer policy (`signerPolicy = null`, including the C2 §2.11 legacy baseline), unless a K4-permitted `designer_declared` list is supplied. That list passes the same checks below (`check_violation`, `signer_policy_missing`);
- the policy has zero `required` signers. Optional-only is refused (`signer_policy_no_required_signer`);
- two slots name the same profile or the same household person (`signer_policy_duplicate`);
- a signer has neither `profile_id` nor `household_person_id`, or names a person who is not the project's client or a member of that client's household (`signer_policy_unbound`);
- a required signer has no `profile_id` and paper intake is not permitted (K5 OPEN). Such a signer could never respond (`signer_policy_unreachable`).

**`respond_service_acceptance` refuses when:**
- the caller is not the `profile_id` of an `active` signer on the request (`insufficient_privilege`);
- the request is not `sent` (this includes every terminal lifecycle, §2.2a);
- the edition is no longer `active`, or `scope_editions` is inactive;
- the presented hashes differ (`serialization_failure`, `stale_scope`);
- the signer has already responded with a different payload.

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

### 2.9 Audit

- Every row carries its actor and time.
- Responses carry the presented hashes and the policy revision.
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
- An observer, a foreign household, a GC and a second studio are denied.
- Paper intake by the recorder cannot be self-reviewed.
- **F9 empty sets:** create is refused for a null-policy legacy baseline edition, an optional-only policy, a zero-signer policy, a duplicate person and an unbound reference. No request row exists after each refusal. The derivation over a request with zero active required signers returns `pending`.
- **F11 paper:** a conditional paper intake creates an `accept_with_conditions` response carrying the transcribed conditions; a returned paper intake creates a `return` response. A presented hash that differs is refused. A reviewer cannot change the disposition. A stored object whose bytes changed after intake cannot be confirmed.
- **F12 terminal:** return → replace the returning signer is refused (`request_not_open`). The same holds after acceptance and after withdrawal or supersession. A pending intake lapses when its request closes, and cannot then be reviewed. Return → successor request → accept works, and the first request stays `closed/returned`.
- A V22 delivery failure or unknown outcome leaves the request `draft` and unsent.
- A direct call while inactive is denied; `has_function_privilege` is false for `PUBLIC`, `anon` and `authenticated` (F20). With `scope_editions` inactive, every mutation refuses even if its grant was restored (F8).
- Old-list exclusion (X08).

## 3. Rulings needed

- **K4:** the signer policy, as recommended in `P04-P07-proposals.md` §P07.
- **K5:** the consent and paper methods, as recommended in `P04-P07-proposals.md` §K5.

Activation (§2.8) is blocked until both are recorded. Schema and read work may proceed.
