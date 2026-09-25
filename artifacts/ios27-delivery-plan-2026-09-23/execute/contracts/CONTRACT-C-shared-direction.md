<!--
W1A-09 / T4 (SQ-215, story US-11). The contract for the offline "shared direction" record,
broader edition. Kody ruled Q1 → broader on 2026-09-24 (WAVE-NEXT-PLAN §10 "Rulings") and
confirmed the attachment list A1–A3 on 2026-09-25.
Revision 1 was written read-only against main 6bc6d093d. Revision 2 resolved the Astra
review's ten findings (workflow task w40b8u077). Revision 3 (this file) resolves the round-2
review: the two partials (#2, #8) and nine new findings (N1–N9) under rulings A–J; cited
against main 73956fa33. Document only: no app code, no migrations. NI-05 (00670), NI-06
(edge function) and W1A-10 (PatinaSchemaV2) build from it. The disposition tables are at the
end.
-->

# CONTRACT C — the shared-direction record

**Version** `sharedDirectionContract: 1` (wire tag `"shared_direction_v1"`) · **Revision 3**

## C.1 What already exists

- **The record.** `RemoteProjectApprovalReview`
  (`DecisionsAPIClient+ProjectApprovals.swift:116`) decodes one item of
  `public.get_project_decision_reviews` (latest body `00573:29-217`). It is the frozen
  approval edition. `artifactId` is the source row id, `artifactVersion` the source version,
  `artifactChecksum` is `project_approval_artifacts.artifact_hash`, and `authorityRevision`
  is the snapshot's revision.
- **Immutability of rows.** The artifact row, the authority snapshot, confirmations and
  receipts refuse `UPDATE` and `DELETE` (`00463:687-690`, triggers `:837-859`). The snapshot
  is one row per decision (`00463:105-118`, `decision_id UNIQUE`).
- **Mutability of bytes.** The rows are frozen; the storage objects they point at are not.
  Studio co-members may `UPDATE` and `DELETE` any `project-documents` object under a project
  they belong to (`00584:804-825`). The plan-print guard (`00429:513-570`) freezes
  `project_documents.storage_path`, not the object at that path. The released-media
  immutability trigger covers only `proposal-mood-boards`. §C.3.1 exists because of this.
- **Reader authority.** `app_private.project_decision_review_for_actor` (`00467:45`) admits
  the caller when `is_design_studio_comember(decision.designer_id)` holds or the caller is the
  snapshot's `decision_lead_id` (`00467:69-77`); otherwise `NULL`.
  `is_design_studio_comember` admits `p_owner = auth.uid()` before it looks at any membership
  (`00399:1174-1179`), so the decision's designer is admitted directly, whatever her studio
  standing. `public.get_project_decision_review` (`00467:101`) passes `NULL` through:
  "NULL deliberately makes nonexistent and unauthorized IDs indistinguishable" (`:99-100`).
- **Cost of the resolver.** The resolver serializes the whole project
  (`get_project_decision_reviews(v_project_id)`, `00467:80-85`) and selects one item. N calls
  for N decisions of one project are N full projections. `get_project_decision_reviews`
  raises `insufficient_privilege` for a caller who is not a reader of the project
  (`00573:53-67`); `list_my_project_decision_reviews` (`00467:134-176`) therefore gates each
  project with the reader predicate before projecting it once.
- **The client.** `fetchProjectApprovalReview` (`:382-393`) maps `null` to `nil`, so "gone",
  "never yours" and "no longer yours" look the same. `awaitsClient` (`:278-280`) is
  `needsReviewConfirmation || canRespond` and does not consult `viewerAnswers` (`:195`);
  `awaitsClientInFeed` (`:316`) does.
- **What the edition points at.** `_resolve_project_approval_artifact` (`00463:230-356`)
  accepts three source kinds:

| `artifactKind` | What `artifact_hash` is | Bytes behind it |
|---|---|---|
| `spec_book_artifact` | `spec_book_artifacts.checksum_sha256`: sha256 of the rendered PDF bytes (`spec-book-render/core.ts:234`) | One client-audience PDF in `project-documents` (`00380:210-238`) |
| `plan_issue` | `plan_issues.set_checksum`: sha256 over canonical `[{sheetNumber, revLetter, sha256}]` in sheet-number order (`00429:1464-1471`) | One file per sheet; `plan_issue_prints.sha256` (`00429:195-196`, `:237-250`) freezes each file's sha256. File = `plan_prints.project_document_id` → `project_documents.storage_path` |
| `budget_version` | `project_budget_checkpoints.snapshot_fingerprint` (`00463:316-343`) | No file. Frozen figures in `project_approval_artifacts.source_snapshot` |

Today no client downloads any of these bytes.

## C.2 The record

The cached shared direction is **one approval edition**, made of three parts:

1. **`review`**: the `get_project_decision_reviews` item, byte-for-byte as served. No new
   fields, no renames.
2. **`attachments`**: the manifest of the edition's own bytes (§C.3). Empty for a budget.
3. **`editionFigures`**: for `budget_version` only, the frozen totals from `source_snapshot`
   (`checkpointCode`, `publishedAt`, `lowTotalCents`, `targetTotalCents`, `highTotalCents`).
   `null` for the other two kinds.

**Server identity (D4):** `(decisionId, authorityRevision, artifactChecksum)`. All three come
from immutable rows. A new direction is a **new decision** (`successorDecisionId`); nothing is
edited in place, so the cache needs no revision history. Because the snapshot is 1:1 with the
decision and immutable, **`editionId = decisionId`** wherever this contract says "edition id".

**Device identity:** `(accountId, decisionId, authorityRevision, artifactChecksum)`, where
`accountId` is the Supabase user id that fetched it. Records and files are stored under the
account and are never read for another account (§C.5.2).

Beside the record the device keeps two things that are **not** part of the server identity:

- `manifestKey`: the ordered list of `(attachmentId, sha256)` from the manifest. `label`,
  `sizeBytes` and `contentType` are advisory and do not change the key.
- `availability`: `complete | incomplete(missing: [attachmentId]) | none | noSpace`, the
  state of the **verified** local file set, tracked independently of the manifest.
- `lastCommittedSeq`: the sequence number of the last authority answer committed for this
  edition (§C.5.2). Process-local ordering state, never persisted or sent to the server.

The mutable fields in `review` (`lifecycleStatus`, `outcome`, `disposition`, counts,
`sentAt`, `respondedAt`, `updatedAt`) are cached as last served, display-only offline (§C.8).

## C.3 The attachment set (confirmed by Kody, 2026-09-25)

| # | Kind | Applies to | Count | Checksum the client verifies | Size bound | Source of truth |
|---|---|---|---|---|---|---|
| A1 | `spec_book_pdf` | `spec_book_artifact` | exactly 1 | sha256 of the bytes = `artifactChecksum` | ≤ 50 MiB (`00170:10`) | `spec_book_artifacts` |
| A2 | `plan_sheet` | `plan_issue` | `sheet_count` (1..60) | sha256 of each file = `plan_issue_prints.sha256` | ≤ 50 MiB each; ≤ 200 MiB per edition | `plan_issue_prints` |
| A3 | `editionFigures` (inline JSON) | `budget_version` | 1 | none on device; values come from the immutable artifact row | < 1 KiB | `project_approval_artifacts.source_snapshot` |

**Manifest entry** (in `attachments[]`, ordered by `position`; plan sheets by
`upper(btrim(sheet_number))`, the order `set_checksum` uses, `00429:1470`):

```json
{
  "attachmentId": "<plan_issue_prints.id | spec_book_artifacts.id>",
  "kind": "plan_sheet",
  "position": 1,
  "label": "A-101 · Floor plan · rev C",
  "sha256": "<64 hex>",
  "sizeBytes": 1834221,
  "contentType": "application/pdf"
}
```

`sizeBytes` is `project_approval_edition_objects.size_bytes` once the edition copy exists
(§C.3.1), otherwise `project_documents.size_bytes`, which may be `null`. The server never
returns storage paths.

### C.3.1 Immutable edition copies (resolves finding 1)

Signed URLs must only ever point at bytes whose sha256 equals the manifest's. Because a
`project-documents` object can be overwritten or deleted-and-recreated by any studio
co-member (C.1), the signer never signs a `project-documents` path. Instead:

- **Bucket `project-approval-editions`** (00670): `public = false`, `file_size_limit =
  52428800`, `allowed_mime_types = {application/pdf, image/png, image/jpeg}`. **No
  `storage.objects` policy is created for it, for any role.** Like `project-review-media`
  (`00433`, whose bucket has no storage policy), only `service_role` can read or write it. A
  SQL test asserts that no `storage.objects` policy references the bucket. The
  `project-documents` bucket and its policies are not touched.
- **Published path:** `<decisionId>/<attachmentId>/<sha256>`. One object per attachment per
  edition. The path is a pure function of frozen rows, so the manifest binds to the object
  identity before the copy exists; `attachmentId` is in it because two distinct
  `plan_issue_prints` rows may carry the same sha256 (`00429:170-190,237-250` constrains
  print and sheet identity, not checksum uniqueness) and each needs its own recorded object.
  Staging objects live under `<decisionId>/_staging/<attemptId>` and are never signed or
  recorded.
- **Table `public.project_approval_edition_objects`** (00670): `(decision_id, attachment_id)`
  PK, `bucket`, `object_path` (`UNIQUE`, `CHECK object_path = decision_id::text || '/' ||
  attachment_id::text || '/' || sha256`), `sha256`, `size_bytes NOT NULL`, `content_type`,
  `verified_at`. Rows refuse `UPDATE` and `DELETE` with the 00463 trigger pattern. `REVOKE
  ALL` from every role. The writer is `app_private.record_project_approval_edition_object(
  p_decision_id, p_attachment_id, p_sha256, p_size_bytes, p_content_type)`, `SECURITY
  DEFINER`, which refuses a row whose `sha256` does not equal the frozen source checksum
  (`plan_issue_prints.sha256` or `spec_book_artifacts.checksum_sha256`) for that
  `(decision_id, attachment_id)` and is idempotent for an identical row.
- **Reachable recorder (N1, ruling A).** `app_private` is not an exposed PostgREST schema
  (`config.toml:13`) and `service_role` has no `USAGE` on it (`00565:140-141`), so an edge
  function cannot reach the private recorder. 00670 therefore adds
  `public.record_project_approval_edition_object(...)` with the same signature: `SECURITY
  DEFINER`, `SET search_path = public, pg_temp`, body `SELECT
  app_private.record_project_approval_edition_object(...)`; `REVOKE ALL ... FROM PUBLIC,
  anon, authenticated, service_role` then `GRANT EXECUTE ... TO service_role`, the shape
  `prepare_project_review_media_asset` uses (`00546:93-108,214-222`). **Test (NI-06):** a
  Deno test calls the public wrapper through PostgREST (`supabase.rpc`) with the service key
  against the local stack and reads the row back through
  `project_approval_attachment_objects`; a SQL test proves `authenticated` is denied on it.
- **Materialization (NI-06), staged (N4, ruling D).** The source can change between any two
  reads of it, so nothing is hashed at the source and then copied. For each attachment not
  yet recorded, one attempt with a fresh `attemptId` (UUIDv4): (1) copies the source object
  server-side to `<decisionId>/_staging/<attemptId>`; (2) streams the **staging** object
  and hashes it incrementally (`@std/crypto` `digest` over the body stream, memory bounded);
  (3) on a mismatch with the frozen checksum, deletes the staging object and answers `409
  media_integrity_failed`, nothing recorded; (4) on a match, publishes by server-side `move`
  to the final path; (5) records the row through the public wrapper with the hash verified
  at staging. Only bytes verified at staging ever reach a final path. If the final path is
  already occupied, the function hashes that object first: a match is kept (the staging copy
  is deleted) and recorded; a mismatch on an **unrecorded** path is replaced by the service
  role (remove, then move). A **recorded** object is never replaced or removed; the row is
  the proof it was verified. Every attempt deletes its own staging object on every exit, and
  a request begins by sweeping `_staging/` objects older than one hour. Materialization is
  idempotent and resumable: one request materializes as many attachments as fit its time
  budget and answers `202 {status: "materializing", ready, total, retryAfterSeconds}` until
  the set is complete (client side: §C.5.3). There is no delete path for **published**
  copies.
- **Signing reads only recorded rows.** `public.project_approval_attachment_objects(
  p_decision_id)` (service role only) returns the manifest joined to
  `project_approval_edition_objects`, with a `source` pointer only for rows not yet recorded.
  The signer signs `object_path` values from recorded rows and nothing else.

Why this rather than freezing `project-documents` objects: freezing would change bucket
policies for every Folio writer, and a moved or re-filed document would still need a rule
per path. A verified, service-role-only copy makes the guarantee local to this contract.

### C.3.2 Signing (NI-06, resolves findings 5, 6, 8)

`project-approval-attachments`, `POST {decisionId}`, `verify_jwt` on.

1. Calls `get_project_decision_edition(decisionId)` **with the caller's JWT** (so `auth.uid()`
   and `is_design_studio_comember` evaluate for the caller).
2. **Error classification.** It does **not** follow `project-review-media/index.ts:105-106`,
   which returns `404 not_found` for an RPC error or absent data. Here: an RPC error, a null
   body, a body that does not decode as a `shared_direction_v1` envelope, or an unknown
   `status` → `503 edition_unavailable`, no URLs. A decoded envelope with `status ≠ ok` →
   `404 {error: <status>}`. `ok` continues.
3. Resolves objects through `project_approval_attachment_objects`; materializes any missing
   (§C.3.1); if still incomplete, `202 materializing` with no URLs. The client's
   continuation is §C.5.3.
4. Signs with `createSignedUrls(paths, 300)`. **Exact correspondence is required:**
   `data.length === paths.length`, and for every `i`: `data[i].path === paths[i]`,
   `data[i].error === null`, `data[i].signedUrl` is a non-empty string (storage-js returns
   per-item `{error, path, signedUrl}`, `StorageFileApi.ts:796-813` in 2.116.0, and a missing
   object leaves the batch length intact). Any item failing → `503 media_unavailable` with
   **no URLs**.
5. Returns `{urls: [{attachmentId, signedUrl, sizeBytes}], expiresInSeconds: 300}`.

A URL only has to be valid when its download starts; an expired URL means one more request,
and every request re-checks authority. The function never downloads bytes on the sign path.

**Timing (finding 8, ruling J).** Threat model: an authenticated account that has obtained a
decision UUID from elsewhere (a leaked link, a screenshot) and wants to confirm the decision
exists. Decision ids are UUIDv4 (122 random bits) and are not enumerable, so the oracle is
confirmation of an id the attacker already holds, which grants no access: every negative is
the same `not_found` body with no URLs. **Residual leakage, stated and accepted:** the
negative path is structurally shared but not constant time. `is_design_studio_comember`
short-circuits a `NULL` owner and runs the membership join for a real one
(`00399:1174-1191`), and an existing row requested in a batch has already had its project's
reader gate evaluated in §C.5 step 1. Repeated measurement could in principle separate
"exists, not yours" from "does not exist"; that separation is exactly the confirmation oracle
above, and it is accepted rather than masked. The structural rule stands: NI-06 answers
every non-`ok` before touching storage, the object resolver or the signer. Tests: the SQL
test asserts identical `not_found` bodies for a nonexistent and an existing-denied id, and
keeps a median-ratio-under-3 check over 50 runs each **as a regression guard only**; it does
not prove indistinguishability and no claim rests on it. The Deno test asserts the same
status and body for both and zero calls on the storage and signer mocks.

### C.3.3 Integrity, ceiling and admission (resolves finding 3)

- **The client verifies every file** against its manifest `sha256` before it enters the
  cache: write to a staging file under the account's staging directory, hash while streaming,
  move into place only on a match. A mismatch discards the file and marks the edition's
  fetch failed.
- **The server asserts the set once, in SQL.** For a `plan_issue`, 00670 recomputes the
  canonical checksum from the `plan_issue_prints` rows it serves; if it is not
  `artifact_hash` it serves `attachments: null`, and the SQL test proves the fixture matches.
  The device never reimplements `_plan_room_canonical_json`.
- **All or nothing per edition.** A missing file, a checksum mismatch, a content type other
  than PDF/PNG/JPEG, or a set past its bound means the device commits none of that edition's
  files. The record stays; `availability` records what is missing.
- **Ceiling: 500 MiB** of attachment bytes across all cached editions, counting committed
  bytes **plus reserved bytes** (staging files and in-flight downloads). Admission is hard:
  1. Before an edition's first byte, the store reserves `sum(sizeBytes)` from the NI-06
     response (always non-null there). Reservations are per edition; concurrent editions
     each hold their own, and reservations plus committed bytes never exceed the ceiling.
  2. If it does not fit, the store **plans before it deletes** (N6, ruling F): it orders
     the eligible sets, oldest `respondedAt` (then oldest `servedAt`) first, and takes the
     shortest prefix whose bytes cover the shortfall. If the sum of **all** eligible sets is
     less than the shortfall there is no plan: nothing is evicted and step 4 applies. Only a
     complete plan is executed (whole sets), inside the store actor, so no other admission
     interleaves between planning and deletion.
  3. **Eligibility (N7, ruling G):** the predicate `awaitsClient && viewerAnswers` is
     authoritative. An edition is protected while it holds and eligible otherwise. Observer
     rows (`viewerRole = 'studio'`) never satisfy `viewerAnswers`, so they are always
     eligible; responded editions are eligible; a draft or unpublished edition is eligible
     **only when it does not await this viewer**. A lead's incomplete draft has
     `needsReviewConfirmation` true (`DecisionsAPIClient+ProjectApprovals.swift:249-251`),
     so `awaitsClient` holds (`:278-280`) and it is protected.
  4. Without a plan the edition stays **record-only** with `availability = noSpace` and
     nothing is downloaded or evicted. The screen says the document needs a connection.
     `noSpace` editions are retried on the next refresh cycle.
  5. On commit the reservation becomes committed bytes; on failure or cancellation the
     staging files are deleted and the reservation released. At launch, staging directories
     are cleared and reservations rebuilt from zero.
  Records are never evicted, only files.
- **Tests (W1A-10):** (a) three awaiting, `viewerAnswers` editions of 200 MiB each: the
  first two commit (400 MiB), the third is `noSpace`, no protected set is evicted, and the
  third commits after one of the first two is responded and evicted; (b) an awaiting
  observer row is evicted ahead of a responded answering row; (c) **no plan:** 400 MiB
  protected, 50 MiB eligible, 200 MiB incoming → `noSpace`, the 50 MiB set is still
  `complete`, zero files deleted; (d) **draft awaiting confirmation:** a lead's incomplete
  draft (`lifecycleStatus = draft`, `viewerAnswers`, `authorityRevision` non-null) is not
  evicted while an older responded set is.

**Not attached, and why.** Each is excluded because it is not frozen evidence of this
edition: the room-by-room budget breakdown (live working budget); discussion and comments
(mutable, and a comment can have an effect); mood boards, product imagery and room scans
(separate aggregates); predecessor editions (history stays online); unrelated Folio
documents.

## C.4 Reader authority (resolves finding 7)

Reader authority is **exactly 00467**. The new RPC does not restate the predicate; for the
`ok` path it calls the installed projection under the same gate `list_my` uses, so there is a
single owner of the rule. Attachments inherit it. No authority-policy change is made.

Three consequences of "exactly 00467", stated so nobody discovers them later:

- **A lead never loses read authority over an edition.** The snapshot is frozen. Reassigning
  the project's lead advances `project_decision_authorities.revision` but does not change
  who may read existing editions. A former homeowner keeps reading her old editions online,
  and so keeps them offline too.
- **The decision's designer never loses read authority either.** `is_design_studio_comember`
  admits `p_owner = auth.uid()` before any membership test (`00399:1174-1179`), and 00467
  applies it to `decision.designer_id`. The named designer keeps `ok` and attachment URLs
  after leaving the studio or after the studio is deactivated. Revoking that would be an
  authority-policy change, which this contract does not make.
- **Co-approvers cannot read.** `required_coapprover_id` is not in the predicate; none exist
  today (`00463:393`).

Only a **peer** co-member's authority is mutable: membership status, role, or the studio
being deactivated (`00399:1184-1191`). `revoked` is the answer for a peer who has left.

**Tests (NI-05, three separate cases):** lead after project-lead reassignment → `ok`;
designer after her own membership is deactivated and after the studio is deactivated → `ok`;
peer co-member after deactivation, with a correct proof → `revoked`.

## C.5 Revocation: the typed RPCs (resolves findings 5, 8, 9)

**New editions, not in-place changes.** `get_project_decision_review` and the 00467 resolver
stay untouched. 00670 adds two functions, `SECURITY DEFINER`, `STABLE`, granted to
`authenticated` only:

```sql
public.get_project_decision_editions(p_held jsonb) RETURNS jsonb
-- p_held: [{"decisionId": uuid, "heldAuthorityRevision": int | null,
--           "heldArtifactChecksum": text | null}, …]   (1..200 items; outside that
--           range → SQL error, which the device classes indeterminate)

public.get_project_decision_edition(
  p_decision_id uuid,
  p_held_authority_revision integer DEFAULT NULL,
  p_held_artifact_checksum text DEFAULT NULL
) RETURNS jsonb
-- a wrapper: builds a one-item p_held and returns that item's envelope
```

The batch is the implementation; the wrapper exists for NI-06 and the pre-act check (§C.8).

```json
{
  "contract": "shared_direction_v1",
  "servedAt": "<server now(), ISO-8601>",
  "editions": [
    {
      "decisionId": "…",
      "status": "ok | revoked | not_found | unauthorized",
      "review": { … } | null,
      "attachments": [ … ] | null,
      "editionFigures": { … } | null
    }
  ]
}
```

The wrapper returns one edition object with `contract` and `servedAt` copied onto it.
`review`, `attachments` and `editionFigures` are non-null only on `ok`.

**Evaluation.** `auth.uid() IS NULL` → every item `unauthorized`. Otherwise:

1. **Projection once per project.** Collect the distinct `project_id`s of the requested
   decisions that exist with `approval_contract = 'project_artifact_v1'`; keep those where
   the caller passes the reader predicate exactly as `list_my` states it (`00467:150-165`);
   call `get_project_decision_reviews(project_id)` **once** per kept project and index the
   items by `decisionId`. A decision whose item is present → `ok`.
2. **The one negative path**, for every other requested id, identical whether or not the
   row exists: one `LEFT JOIN` lookup of decision, snapshot and artifact by id; the reader
   predicate on the (possibly `NULL`) designer; then the proof comparison
   `p_held_artifact_checksum IS NOT DISTINCT FROM artifact.artifact_hash AND
   p_held_authority_revision IS NOT DISTINCT FROM snapshot.authority_revision` with a
   non-null held pair. Row exists, caller is not a reader now, proof matches → `revoked`.
   Anything else → `not_found`.

| Answer | Meaning |
|---|---|
| `unauthorized` | No authenticated subject. Never "never had authority". |
| `not_found` | Nonexistent, never a reader, or a missing or wrong proof: one answer, one path. |
| `revoked` | A caller who proves possession and is no longer a reader. Derived from current standing plus proof; no new state. |

Answering `revoked` tells the caller only that a decision it has already read still exists.
The residual risk: someone holding both the spec PDF (whose sha256 is the checksum) and the
decision UUID learns that the decision exists, and nothing else. Accepted. `revoked` is
**not** derivable from the snapshot's `authority_revision` moving; the snapshot cannot move.

**Query-cost test (NI-05):** five cached editions in one project plus two in another; with
`SET LOCAL track_functions = 'all'`, `pg_stat_xact_user_functions.calls` for
`get_project_decision_reviews` rises by exactly 2 across one batch call.

**Error-classification tests (NI-05 and W1A-10):** a SQL error, a schema-cache miss
(PostgREST `PGRST202`), an HTTP 404 for a missing function, a null body, malformed JSON, an
unknown `contract` tag and an unknown `status` each leave the cache intact and produce no
telemetry purge event.

### What the device does with each answer

Only a **decoded `shared_direction_v1` envelope** may drive a purge. Every other outcome is
`indeterminate`. NI-06's answers never purge anything; a non-2xx from NI-06 marks this
fetch's attachments unavailable and schedules an RPC refresh.

| Answer | Device action |
|---|---|
| `ok` + `disposition = active` | Replace the record; stamp `servedAt`; fetch files if `manifestKey` changed **or** `availability ≠ complete` (§C.5.1) |
| `ok` + `superseded` | Read `successorDecisionId` through the RPC; cache it on `ok`; purge this edition |
| `ok` + `withdrawn` | Purge this edition. Online screens still show it with the existing withdrawn copy |
| `revoked` | Purge (record + files). Telemetry `shared_direction_revoked` |
| `not_found` | Purge. A legitimately cached edition always proves possession, so the cache is corrupt or foreign |
| `unauthorized`, `indeterminate` (transport, 5xx, timeout, decode failure, missing function) | **Never purge.** Serve the cache read-only with its stamp; route to re-authentication where relevant |

Apart from typed answers, the only purges are the two existing wipes,
`LocalStoreReset.wipeUserScopedData` on account switch or deletion (`LocalStoreReset.swift:24`).

### C.5.1 Refresh and recovery (resolves finding 4)

On foreground or reconnection the device calls `list_my_project_decision_reviews` to
discover new editions, then `get_project_decision_editions` for every cached id with its
held proof, **chunked (N5, ruling E):** cached ids are grouped by the record's `projectId`
(`DecisionsAPIClient+ProjectApprovals.swift:118`), whole projects are packed into batches of
at most 200 items (a project with more than 200 editions splits across batches and is
projected once per batch), and an empty list makes no call. Chunks run sequentially; each
chunk's answers commit through §C.5.2 as they arrive, so a failed chunk leaves the others'
outcomes standing and is retried on the next refresh. No time-to-live purge applies.
**Test (W1A-10):** 201 cached editions across two projects with a `revoked` answer in the
last chunk: exactly two RPC calls, the revoked edition purged, every other record intact;
an empty cache makes zero calls.

Files are fetched on `ok` when `manifestKey` changed **or** `availability ≠ complete`
(`incomplete`, `none`, `noSpace`), so a first download cut off by a timeout, or an evicted
set, recovers on the next successful refresh or the next time a screen opens the edition. A
verified set is kept and served while a replacement attempt for the same edition is
incomplete; the replacement commits atomically or not at all.

### C.5.2 Generations and purge races (resolves finding 2)

All cache commits (record write, file move into place, record or file delete) go through one
serial store actor. Two mechanisms order them and they answer different questions.

**Generations gate liveness.** The store holds `sessionGeneration` (bumped on every sign-in,
sign-out, account switch and account deletion) and a per-edition `editionGeneration`, bumped
**only on a purge** of that edition (so a re-cache after a purge starts a new one). An
ordinary record replacement does **not** bump it; revision 2 did, and that let an older `ok`
discard a newer `revoked` (round-2 finding N2). Every asynchronous task (RPC chunk, pre-act
read, NI-06 request, continuation loop, download) captures `(accountId, sessionGeneration,
editionGeneration)` when it starts; at every commit the store compares the captured triple
with the current one and **drops the commit** if any part differs. A stale result neither
writes nor deletes: a late download does not recreate purged files.

**Sequence numbers order authority (ruling B).** Authority answers (`ok`, `revoked`,
`not_found`, `unauthorized`, whether from a refresh chunk or the pre-act read in §C.8) are
additionally ordered per edition:

- **Single flight, coalesced.** At most one authority request covers edition E at a time. A
  refresh requested while one is in flight sets a dirty flag, and exactly one follow-up
  request runs when the in-flight one finishes or passes its deadline (the shape
  `DesignRequestStatusService.swift:466-481` uses). A request past its deadline releases the
  slot; its late answer is still ordered by its sequence, never by arrival.
- **Sequence at start.** When a request starts it takes `seq = ++authoritySeq[E]` for each
  edition it covers; a chunk takes one number per edition it contains.
- **Commit rule.** An answer for E commits only if `seq > lastCommittedSeq[E]`, and then
  sets `lastCommittedSeq[E] = seq`. An older `ok` can therefore never override a newer
  `revoked`, whichever arrives first: if the newer `revoked` lands first it purges and the
  old `ok` fails both the sequence and the generation check; if the older `ok` lands first
  it commits its record without bumping the generation, and the newer `revoked` still
  commits and purges. Both counters are per account and **process-local**: no request
  survives a process, so both start at 0 on launch, and a purge resets `lastCommittedSeq[E]`.
- Generations still gate everything: a sequence-valid answer from before a purge or a
  session change is dropped.

**Barrier.** A purge or wipe bumps the generation(s), cancels outstanding tasks for that
edition (or account), and only then deletes. Because the actor is serial, a commit either
landed before the purge and is deleted by it, or arrives after and is dropped. Staging files
are per account and per task; a dropped task deletes only its own staging. W1A-10 extends
both wipes to bump `sessionGeneration`, cancel, then remove records and the account's
attachment directory, and adds the store's fields (`records`, `inFlight`, `authoritySeq`,
`sessionGeneration`) to `SessionIsolationTests` (`SessionIsolationTests.swift:191-201`).

**Deterministic tests (W1A-10)**, using a fake client whose responses are held until the test
releases them:

1. **revoked-after-ok:** `ok` for edition E, download held; refresh answers `revoked`; purge
   runs; release the download → no files, no record for E.
2. **account switch:** A's download held; switch to B (wipe); release → B's store empty, A's
   directory absent, no A record under B.
3. **account deletion:** as 2, through the deletion wipe.
4. **stale revoked:** refresh for E held at generation N; E is purged and re-cached at N+1;
   release the held `revoked` → the N+1 record and files are intact.
5. **held old ok, new revoked (ruling B):** request 1 (seq 1) for E is held past its
   deadline; request 2 (seq 2) answers `revoked` and E is purged; release request 1's `ok` →
   E stays absent, no file and no record recreated. Variant: release the `ok` **before**
   request 2 answers → the `ok` commits, then the `revoked` purges; E is absent either way.
6. **coalescing:** three refresh requests for E while one is in flight → exactly two RPC
   calls in total.

### C.5.3 Materialization continuation (N8, ruling H)

W1A-10 owns the client side of `202 materializing`. When an attachment request for edition E
answers 202, the store runs one **generation-bound continuation loop** for E:

- It waits `retryAfterSeconds` (clamped to 1…30 s; absent → 5 s) and asks NI-06 again. The
  loop captures `(accountId, sessionGeneration, editionGeneration)` at start and stops
  without effect if any part has moved (§C.5.2). It is cancelled outright when E is purged,
  when the account is wiped, or when the screen that opened E is left; a loop started by a
  background refresh is bound to no screen and stops only at the cap.
- **Cap:** 6 requests per loop. At the cap E stays record-only with `availability`
  unchanged (`none` or `incomplete`), nothing is purged, and §C.5.1 retries on the next
  refresh or screen open. A 200 with URLs ends the loop and starts the download; a non-2xx
  ends it per §C.5 (attachments unavailable, RPC refresh scheduled).
- `ready/total` may drive a progress line and is never persisted.

**Test (W1A-10):** under a test clock, a fake NI-06 answers 202 three times with
`retryAfterSeconds = 1`, then 200 with URLs → files commit after exactly four requests; a second run answers 202 seven
times → six requests, `availability = none`, nothing purged; a third run purges E after the
first 202 → the loop stops, no further request.

## C.6 What is cached

Every edition whose last `ok` answer said `disposition = active` and the caller is a reader:
pending, draft-awaiting-review and responded editions. A responded `approved` edition is the
agreed direction, so it stays. `withdrawn`, `superseded` and `not_found` editions are not
cached. Observer rows (`viewerRole = 'studio'`) are cached because 00467 lets their holders
read them; they carry no act controls and get no eviction protection (§C.3.3).

## C.7 Freshness (resolves finding 10)

Each cached edition stores `servedAt` (server time from its last `ok`). The device never
computes age from its wall clock.

- **Anchor, monotonic (N9, ruling I).** The process holds one anchor
  `(anchorServedAt, anchorInstant = ContinuousClock.now)` (the app already uses
  `ContinuousClock` for deadlines, e.g. `OrderHandoff.swift:217`). Estimated server now =
  `anchorServedAt + (ContinuousClock.now − anchorInstant)`. A decoded envelope **replaces
  the anchor only when its `servedAt` is later than the current estimated server now**; a
  delayed older envelope is ignored for anchoring (its edition answers still commit under
  §C.5.2). The estimate never moves backward. Age = estimate minus the edition's `servedAt`,
  floored at zero.
- **No anchor yet** (cold launch before any server contact, or after any envelope fails to
  decode) → the label is the **absolute** `servedAt` rendered in the device's zone
  ("Updated 24 Sep, 3:12 PM"), never a relative one. `ContinuousClock` instants are not
  persisted; an anchor lives only in its process.
- **Clock change** does not affect a relative label, because the label never reads the wall
  clock. The absolute label depends on the zone, not on the clock's offset.

The guarantee is: a relative label is server-anchored and monotonic-elapsed; an absolute
label is a server timestamp. The revision-1 claim that "clock skew cannot flatter
freshness" is withdrawn as stated; what holds is that a skewed device clock never enters the
calculation. Screens drawing from a response received in the current foreground session show
no label. The stamp is per edition. **Test (W1A-10):** an envelope served 12:05 for edition F
arrives, then a delayed envelope served 12:00 for edition E: the anchor stays at 12:05, E's
age reads five minutes, F's zero, and no label moves backward.

## C.8 "No offline approvals" at the API boundary

- **No deferred writes.** No decision-rail write is persisted for replay:
  `confirm_project_decision_review` (`00463:1467`), `respond_project_approval` (`00464:811`)
  and any discussion post with effect. No outbox entry; an idempotency key is minted only at
  the moment of an online send.
- **An online check before every act.** Immediately before the write the client calls
  `get_project_decision_edition` with the held proof and proceeds only on `ok` with the item
  still `active` and the same `authorityRevision` and `artifactChecksum` the reader was shown.
  The write's CAS values (`authorityRevision`, `artifactHash`, `expectedUpdatedAt`) come from
  **that** read, never the cache. A non-`ok` answer refuses the act and is handled per §C.5;
  an `indeterminate` answer refuses the act and purges nothing. The read is an authority
  answer and takes a sequence number like any other (§C.5.2).
- **The server needs no change for this.** Confirm checks revision and hash; respond checks
  `updated_at` and `pending`.
- **The offline UI.** Act controls are not drawn as queueable offline; tapping one gives the
  existing offline-refusal copy (W1A-10).

## C.9 Build split and sizing

- **NI-05 (00670, L).** `get_project_decision_editions` (1..200) + wrapper (§C.5), the
  manifest serializer, the plan-set assert, bucket `project-approval-editions` with no
  storage policies, `project_approval_edition_objects` with the three-segment path `CHECK`
  and immutability triggers, `app_private.record_project_approval_edition_object` **and its
  `public` service-role-only wrapper** (§C.3.1, N1), and
  `public.project_approval_attachment_objects` (service role only). SQL tests under
  `supabase/tests/decisions/`: one per answer (including wrong proof and missing proof), a
  201-item batch → error, the plan-set checksum assert, the three C.4 authority cases, the
  query-cost test, the timing regression guard (§C.3.2), the no-policy assert on the bucket,
  the recorder's checksum refusal and idempotent re-record, two attachments sharing one
  checksum recorded as two rows at two paths (N3), and `authenticated` denied on the public
  wrapper.
- **NI-06 (`project-approval-attachments`, M).** Sign path with exact-correspondence
  validation, error classification, staged materialization (§C.3.1: copy to `_staging`,
  verify there, `move` to the final path, replace an unrecorded mismatching final object and
  never a recorded one, sweep stale staging), recording through the public wrapper, `202
  materializing`. Deno tests: `ok`, each typed non-`ok`, RPC error → 503, null and malformed
  envelope → 503, mixed-success signing → 503 with no URLs, staging mismatch → 409 with
  nothing recorded and no final object, **poisoned destination** (N4: source mutated between
  an earlier hash and copy leaves a wrong unrecorded object at the final path; source
  restored; the retry publishes the verified bytes and records them; a recorded object in
  the same position is left alone), same-checksum pair → two objects and two rows (N3),
  resumable materialization, edge-to-PostgREST registration through the public wrapper (N1),
  and the zero-storage-calls parity assertion. Deploy owed with 00670.
- **W1A-10 (L).** The store actor with generations **and per-edition authority sequencing,
  single-flight with coalescing** (§C.5.2, ruling B), device identity, `availability` and
  `lastCommittedSeq` (§C.2), plan-then-evict admission and the authoritative eligibility
  predicate (§C.3.3, N6/N7), chunked refresh by project (§C.5.1, N5), the 202 continuation
  loop (§C.5.3, N8), the monotonic freshness anchor (§C.7, N9), the RPC switch through the
  injected decisions client, both wipes extended, and the tests named in §C.3.3, §C.5,
  §C.5.1, §C.5.2, §C.5.3 and §C.7. No feature flag: a pre-release build is not permission to
  destroy testers' cached data, so the migration stage carries existing records forward
  and the purge rules above are the only deletions.

---

## Confirmed: the attachment list (Kody, 2026-09-25)

The offline shared direction is the approval edition plus exactly A1 (the spec-book PDF, ≤ 50
MiB), A2 (the issued plan sheets, 1..60, ≤ 50 MiB each, ≤ 200 MiB per set, all or nothing) and
A3 (the budget edition's frozen totals, inline). Device ceiling 500 MiB. Signed URLs last
300 s. Purges happen on `revoked`, `not_found`, `withdrawn` or `superseded`, and on the two
account wipes. A lost connection, a session lapse or an undecodable answer never purges.
Kody also accepted the two wording corrections: `unauthorized` means "no session", and
`revoked` is proven by possession, not derived from `authority_revision`.

---

## Revision 2: review disposition

| # | Finding (Astra, w40b8u077) | Resolved in |
|---|---|---|
| 1 | Signed `project-documents` paths can serve replacement bytes | §C.1 "Mutability of bytes"; §C.3.1 service-role-only bucket, content-addressed verified copies, signer reads recorded rows only; NI-05/NI-06 scope in §C.9 |
| 2 | Purge/wipe not protected against late completions | §C.2 device identity with `accountId`; §C.5.2 serial store, generations, barrier, four deterministic tests |
| 3 | 500 MiB ceiling and unconditional awaiting protection cannot both hold | §C.3.3 reservation before commit, whole-set eviction, `noSpace` record-only, staging counted, protection only for `awaitsClient && viewerAnswers`, three-set test |
| 4 | Unchanged manifest blocks recovery of failed or evicted sets | §C.2 `manifestKey` + `availability`; §C.5.1 fetch on change **or** incomplete, keep verified set during replacement |
| 5 | Precedent collapses backend failures into `not_found` | §C.3.2 step 2 overrides `project-review-media/index.ts:105-106`; §C.5 `indeterminate` class, only a decoded envelope purges, NI-06 never purges; named tests |
| 6 | Batch signing checks only top-level error and length | §C.3.2 step 4 exact correspondence, per-item path/error/URL, 503 with no URLs, mixed-success test |
| 7 | Direct designer keeps authority after leaving | §C.1 and §C.4 document the `p_owner = auth.uid()` exception; three separate authority tests; no policy change |
| 8 | Equal statuses do not prove timing indistinguishability | §C.3.2 "Timing" threat model, structural parity; §C.5 one negative path; SQL and Deno parity tests |
| 9 | Per-edition refresh serializes the whole project each time | §C.5 `get_project_decision_editions(p_held jsonb)` pinned, projection once per project, wrapper for single reads, query-cost test |
| 10 | Server timestamp alone does not stop clock skew flattering age | §C.7 server anchor + `ContinuousClock` elapsed, absolute-time fallback, skew claim withdrawn |

## Revision 3: round-2 review disposition

| # | Finding (round 2) | Ruling | Resolved in |
|---|---|---|---|
| 2 (partial) | Record replacement bumped `editionGeneration`, so an older `ok` could discard a newer `revoked` | B | §C.5.2: generation bumps only on purge; per-edition `authoritySeq` / `lastCommittedSeq`, single flight with coalescing; tests 5–6 |
| 8 (partial) | Negative path not timing-uniform (owner short-circuit, step-1 gate); median ratio proves nothing | J | §C.3.2 "Timing": residual leakage stated and accepted; UUIDv4 not enumerable; confirmation-only threat; no storage work on a negative; ratio kept as a regression guard only |
| N1 | Private recorder unreachable through PostgREST | A | §C.3.1 "Reachable recorder": `public.record_project_approval_edition_object`, service_role only, per 00546; edge-to-PostgREST registration test |
| N2 | Older `ok` invalidates a newer `revoked` | B | As #2 above |
| N3 | Two attachments with equal bytes collide on `UNIQUE object_path` | C | §C.3.1 path `<decisionId>/<attachmentId>/<sha256>`, `CHECK` updated; same-checksum tests in NI-05 and NI-06 |
| N4 | Source overwrite between hash and copy poisons the final path permanently | D | §C.3.1 staged materialization: verify at `_staging/<attemptId>`, then `move`; unrecorded mismatch replaceable, recorded never; poisoned-destination test |
| N5 | Refresh impossible past 200 cached editions | E | §C.5.1 chunks of ≤ 200 grouped by `projectId`, empty list makes no call; 201-edition test with the revocation in the last chunk |
| N6 | Eviction deletes before learning admission fails | F | §C.3.3 step 2 plans the shortest sufficient prefix first; no plan → nothing evicted, `noSpace`; test (c) |
| N7 | Draft awaiting the viewer both protected and eligible | G | §C.3.3 step 3 predicate authoritative; drafts eligible only when not awaiting this viewer; test (d) |
| N8 | No client continuation for `202 materializing` | H | §C.5.3 generation-bound loop: `retryAfterSeconds`, cancel on purge/navigation, cap 6 → record-only; multi-202 test |
| N9 | Delayed envelope moves the freshness anchor backward | I | §C.7 anchor replaced only by a `servedAt` later than the current estimate; two-edition out-of-order test |
