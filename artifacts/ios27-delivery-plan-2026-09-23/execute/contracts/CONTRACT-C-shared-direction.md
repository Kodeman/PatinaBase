<!--
W1A-09 / T4 (SQ-215, story US-11). The contract for the offline "shared direction" record,
broader edition. Kody ruled Q1 → broader on 2026-09-24 (WAVE-NEXT-PLAN §10 "Rulings") and
confirmed the attachment list A1–A3 on 2026-09-25.
Revision 1 was written read-only against main 6bc6d093d. Revision 2 (this file) resolves the
Astra review's ten findings (workflow task w40b8u077) and re-cites against main 3b1dc8b08.
Document only: no app code, no migrations. NI-05 (00670), NI-06 (edge function) and W1A-10
(PatinaSchemaV2) build from it. The disposition table is at the end.
-->

# CONTRACT C — the shared-direction record

**Version** `sharedDirectionContract: 1` (wire tag `"shared_direction_v1"`) · **Revision 2**

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
- **Content-addressed path:** `<decisionId>/<sha256>`. One object per attachment per
  edition. The path is a pure function of frozen rows, so the manifest binds to the object
  identity before the copy exists.
- **Table `public.project_approval_edition_objects`** (00670): `(decision_id, attachment_id)`
  PK, `bucket`, `object_path` (`UNIQUE`, `CHECK object_path = decision_id::text || '/' ||
  sha256`), `sha256`, `size_bytes NOT NULL`, `content_type`, `verified_at`. Rows refuse
  `UPDATE` and `DELETE` with the 00463 trigger pattern. `REVOKE ALL` from every role; the
  only writer is `app_private.record_project_approval_edition_object(...)`, `SECURITY
  DEFINER`, executable by `service_role` only, which refuses a row whose `sha256` does not
  equal the frozen source checksum (`plan_issue_prints.sha256` or
  `spec_book_artifacts.checksum_sha256`) for that `(decision_id, attachment_id)`.
- **Materialization (NI-06).** For each attachment not yet recorded, the function: (1)
  streams the source object from `project-documents` with service role and hashes it
  incrementally (`@std/crypto` `digest` over the body stream, so memory stays bounded and
  the whole-set edge limits that stopped verification in revision 1 do not apply per file);
  (2) refuses on a mismatch with the frozen checksum (`409 media_integrity_failed`, nothing
  recorded); (3) copies server-side to `project-approval-editions/<decisionId>/<sha256>`
  with `upsert: false`; (4) streams the **destination** object back and hashes it, so the
  bytes recorded are the bytes at the signed path, not the source at some earlier moment;
  (5) records the row. An object that exists without a row is re-verified and recorded, never
  overwritten. Materialization is idempotent and resumable: one request materializes as many
  attachments as fit its time budget and answers `202 {status: "materializing", ready, total,
  retryAfterSeconds}` until the set is complete. There is no delete path for edition copies.
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
   (§C.3.1); if still incomplete, `202 materializing`.
4. Signs with `createSignedUrls(paths, 300)`. **Exact correspondence is required:**
   `data.length === paths.length`, and for every `i`: `data[i].path === paths[i]`,
   `data[i].error === null`, `data[i].signedUrl` is a non-empty string (storage-js returns
   per-item `{error, path, signedUrl}`, `StorageFileApi.ts:796-813` in 2.116.0, and a missing
   object leaves the batch length intact). Any item failing → `503 media_unavailable` with
   **no URLs**.
5. Returns `{urls: [{attachmentId, signedUrl, sizeBytes}], expiresInSeconds: 300}`.

A URL only has to be valid when its download starts; an expired URL means one more request,
and every request re-checks authority. The function never downloads bytes on the sign path.

**Timing (finding 8).** Threat model: an authenticated account that has obtained a decision
UUID from elsewhere (a leaked link, a screenshot) and wants to confirm the decision exists.
Random UUIDs cannot be enumerated (122 random bits), so the oracle is confirmation, not
discovery. The guarantee is **structural parity, not constant time**: nonexistent,
never-a-reader and wrong-proof requests all take the one negative path in §C.5 (one indexed
lookup, one predicate evaluation, one proof comparison), and NI-06 answers every non-`ok`
before touching storage, the object resolver or the signer. The residual difference (an
index hit versus a miss) is well under network jitter and is accepted. Tests: the SQL test
runs nonexistent-id and existing-denied-id 50× each with `clock_timestamp()` and asserts
identical `not_found` bodies and a median ratio under 3; the Deno test asserts both return
the same status and body and that the storage and signer mocks record zero calls for either.

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
  2. If it does not fit, the store evicts **whole eligible sets**, oldest `respondedAt`
     (then oldest `servedAt`) first, until it fits.
  3. **Eligibility:** an edition is protected from eviction only while `awaitsClient &&
     viewerAnswers`. Observer rows (`viewerRole = 'studio'`) are always eligible, whatever
     their state; so are responded, draft and unpublished editions.
  4. If it still does not fit, the edition stays **record-only** with `availability =
     noSpace` and nothing is downloaded or evicted. The screen says the document needs a
     connection. `noSpace` editions are retried on the next refresh cycle.
  5. On commit the reservation becomes committed bytes; on failure or cancellation the
     staging files are deleted and the reservation released. At launch, staging directories
     are cleared and reservations rebuilt from zero.
  Records are never evicted, only files.
- **Test (W1A-10):** three awaiting, `viewerAnswers` editions of 200 MiB each: the first two
  commit (400 MiB), the third is `noSpace`, no protected set is evicted, and the third
  commits after one of the first two is responded and evicted. A second test proves an
  awaiting observer row is evicted ahead of a responded answering row.

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
--           "heldArtifactChecksum": text | null}, …]   (1..200 items)

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
discover new editions, then `get_project_decision_editions` once with every cached id and
its held proof. No time-to-live purge applies.

Files are fetched on `ok` when `manifestKey` changed **or** `availability ≠ complete`
(`incomplete`, `none`, `noSpace`), so a first download cut off by a timeout, or an evicted
set, recovers on the next successful refresh or the next time a screen opens the edition. A
verified set is kept and served while a replacement attempt for the same edition is
incomplete; the replacement commits atomically or not at all.

### C.5.2 Generations and purge races (resolves finding 2)

All cache commits (record write, file move into place, record or file delete) go through one
serial store actor. The store holds `sessionGeneration` (bumped on every sign-in, sign-out,
account switch and account deletion) and a per-edition `editionGeneration` (bumped on every
purge and every record replacement).

- Every asynchronous task (RPC refresh, NI-06 request, download) captures
  `(accountId, sessionGeneration, editionGeneration)` when it starts. At every commit the
  store compares the captured triple with the current one and **drops the commit** if any
  part differs. A stale result **neither writes nor deletes**: a late `revoked` from an
  older generation does not purge the newer record, and a late download does not recreate
  purged files.
- A purge or wipe is the barrier: it bumps the generation(s), cancels outstanding tasks for
  that edition (or account), and only then deletes. Because the actor is serial, a commit
  either landed before the purge and is deleted by it, or arrives after and is dropped.
- Staging files are per account and per task; a dropped task deletes only its own staging.
- W1A-10 extends both wipes to bump `sessionGeneration`, cancel, then remove records and the
  account's attachment directory, and adds the store's fields (`records`, `inFlight`,
  `sessionGeneration`) to `SessionIsolationTests` (the pattern `DesignRequestStatusService`
  pins at `:467-478` and the test names at `SessionIsolationTests.swift:191-201`).

**Deterministic tests (W1A-10)**, using a fake client whose responses are held until the test
releases them:

1. **revoked-after-ok:** `ok` for edition E, download held; refresh answers `revoked`; purge
   runs; release the download → no files, no record for E.
2. **account switch:** A's download held; switch to B (wipe); release → B's store empty, A's
   directory absent, no A record under B.
3. **account deletion:** as 2, through the deletion wipe.
4. **stale revoked:** refresh for E held at generation N; E is purged and re-cached at N+1;
   release the held `revoked` → the N+1 record and files are intact.

## C.6 What is cached

Every edition whose last `ok` answer said `disposition = active` and the caller is a reader:
pending, draft-awaiting-review and responded editions. A responded `approved` edition is the
agreed direction, so it stays. `withdrawn`, `superseded` and `not_found` editions are not
cached. Observer rows (`viewerRole = 'studio'`) are cached because 00467 lets their holders
read them; they carry no act controls and get no eviction protection (§C.3.3).

## C.7 Freshness (resolves finding 10)

Each cached edition stores `servedAt` (server time from its last `ok`). The device never
computes age from its wall clock.

- **Anchor.** Every decoded envelope received in the current process updates one anchor:
  `(anchorServedAt, anchorInstant = ContinuousClock.now)` (the app already uses
  `ContinuousClock` for deadlines, e.g. `OrderHandoff.swift:217`). Estimated server now =
  `anchorServedAt + (ContinuousClock.now − anchorInstant)`; age = that minus the edition's
  `servedAt`, floored at zero.
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
no label. The stamp is per edition.

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
  an `indeterminate` answer refuses the act and purges nothing.
- **The server needs no change for this.** Confirm checks revision and hash; respond checks
  `updated_at` and `pending`.
- **The offline UI.** Act controls are not drawn as queueable offline; tapping one gives the
  existing offline-refusal copy (W1A-10).

## C.9 Build split and sizing

- **NI-05 (00670, L; was M).** `get_project_decision_editions` + wrapper (§C.5), the manifest
  serializer, the plan-set assert, bucket `project-approval-editions` with no storage
  policies, `project_approval_edition_objects` with immutability triggers,
  `app_private.record_project_approval_edition_object` and
  `public.project_approval_attachment_objects` (both service role only). SQL tests under
  `supabase/tests/decisions/`: one per answer (including wrong proof and missing proof), the
  plan-set checksum assert, the three C.4 authority cases, the query-cost test, the timing
  parity test, the no-policy assert on the bucket, and the recorder's checksum refusal.
- **NI-06 (`project-approval-attachments`, M; was S).** Sign path with exact-correspondence
  validation, error classification, the materialization path with streaming verification of
  source and destination, `202 materializing`. Deno tests: `ok`, each typed non-`ok`, RPC
  error → 503, null and malformed envelope → 503, mixed-success signing → 503 with no URLs,
  materialization mismatch → 409 with nothing recorded, resumable materialization, and the
  timing-parity assertions. Deploy owed with 00670.
- **W1A-10 (L).** The store actor with generations (§C.5.2), device identity and
  `availability` (§C.2), admission control and eviction (§C.3.3), recovery refresh (§C.5.1),
  the freshness anchor (§C.7), the RPC switch through the injected decisions client, both
  wipes extended, and the tests named in §C.3.3, §C.5 and §C.5.2. No feature flag: a
  pre-release build is not permission to destroy testers' cached data, so the migration stage
  carries existing records forward and the purge rules above are the only deletions.

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
