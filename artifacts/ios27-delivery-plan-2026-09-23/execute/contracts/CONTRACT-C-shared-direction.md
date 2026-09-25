<!--
W1A-09 / T4 (SQ-215, story US-11). The contract for the offline "shared direction" record,
broader edition. Kody ruled Q1 → broader on 2026-09-24 (WAVE-NEXT-PLAN §10 "Rulings").
Written read-only against main 6bc6d093d. Citations are file:line on that tip.
Document only: no app code, no migrations. W1A-10 (Patina schema) and NI-05 (00670) build
from this after Kody confirms the attachment list in §C.9.
-->

# CONTRACT C — the shared-direction record

**Version** `sharedDirectionContract: 1` (wire tag `"shared_direction_v1"`)

## C.1 What already exists

- **The record.** `RemoteProjectApprovalReview`
  (`DecisionsAPIClient+ProjectApprovals.swift:116`) decodes one item of
  `public.get_project_decision_reviews` (latest body `00573:29-217`). It is the frozen
  approval edition. `artifactId` is the source row id (`00573:83`), `artifactVersion` is the
  source version, `artifactChecksum` is `project_approval_artifacts.artifact_hash`, and
  `authorityRevision` is the snapshot's revision.
- **Immutability.** The artifact row, the authority snapshot, confirmations and receipts refuse
  `UPDATE` and `DELETE` (`00463:687-690`, triggers `:837-859`). The snapshot is one row per
  decision (`00463:105-118`, `decision_id UNIQUE`).
- **Reader authority.** `app_private.project_decision_review_for_actor` (`00467:45`) admits the
  caller when it is a studio co-member of `decision.designer_id` or it is the snapshot's
  `decision_lead_id` (`00467:69-77`). Otherwise it returns `NULL`.
  `public.get_project_decision_review` (`00467:101`) passes that `NULL` through, and the
  comment at `00467:99-100` says the collapse is deliberate: "NULL deliberately makes
  nonexistent and unauthorized IDs indistinguishable".
- **The client.** `fetchProjectApprovalReview` (`:382-393`) maps `null` to `nil`, so
  "gone", "never yours" and "no longer yours" look the same. The list (`:402-408`) maps to
  `[]`.
- **What the edition points at.** `_resolve_project_approval_artifact` (`00463:230-356`)
  accepts three source kinds, and each has different bytes behind it:

| `artifactKind` | What `artifact_hash` is | Bytes behind it |
|---|---|---|
| `spec_book_artifact` | `spec_book_artifacts.checksum_sha256`: the sha256 of the rendered PDF bytes (`spec-book-render/core.ts:234`) | One client-audience PDF in bucket `project-documents` (`00380:210-238`) |
| `plan_issue` | `plan_issues.set_checksum`: sha256 over canonical `[{sheetNumber, revLetter, sha256}]` in sheet-number order (`00429:1464-1471`, comment `:228-229`) | One file per sheet. `plan_issue_prints` (`00429:237-250`) freezes each sheet's `sha256` of the file bytes (`00429:195-196`). The file is `plan_prints.project_document_id` → `project_documents.storage_path` in `project-documents` |
| `budget_version` | `project_budget_checkpoints.snapshot_fingerprint` (`00463:316-343`) | No file. The frozen figures are in `project_approval_artifacts.source_snapshot` |

Today no client downloads any of these bytes. The client portal draws a title plate
(`approval-ask.tsx:391-416`) and, for a budget, reads the *live* working budget and shows it
only when its id, version and fingerprint match (`approval-ask.tsx:425-438`).

## C.2 The record

The cached shared direction is **one approval edition**, made of three parts:

1. **`review`**: the `get_project_decision_reviews` item, byte-for-byte as the server serializes
   it. This contract adds no new fields to the item and does not rename any.
2. **`attachments`**: the manifest of the edition's own bytes (§C.3). It is empty for a budget.
3. **`editionFigures`**: for `budget_version` only, the frozen totals from `source_snapshot`
   (`checkpointCode`, `publishedAt`, `lowTotalCents`, `targetTotalCents`, `highTotalCents`).
   It is `null` for the other two kinds.

**The identity D4 pins** is `(decisionId, authorityRevision, artifactChecksum)`. All three
values come from immutable rows, so for a given `decisionId` they never change. A new
direction is a **new decision**: supersede creates a successor (`successorDecisionId`), and no
revision is edited in place. The cache therefore needs no revision history. It holds whichever
editions are current (§C.6).

The mutable fields in `review` (`lifecycleStatus`, `outcome`, `disposition`, counts,
`sentAt`, `respondedAt`, `updatedAt`) are cached as they were last served. They are
display-only offline (§C.8).

## C.3 The attachment set (proposed; Kody confirms in §C.9)

| # | Kind | Applies to | Count | Checksum the client verifies | Size bound | Source |
|---|---|---|---|---|---|---|
| A1 | `spec_book_pdf` | `spec_book_artifact` | exactly 1 | sha256 of the bytes = `artifactChecksum` | ≤ 50 MiB (the bucket already refuses larger: `00170:10`) | `project-documents` / `spec_book_artifacts.storage_path` |
| A2 | `plan_sheet` | `plan_issue` | `sheet_count` (1..60) | sha256 of each file's bytes = `plan_issue_prints.sha256` | ≤ 50 MiB each; ≤ 200 MiB for the edition | `project-documents` / the print's `project_documents.storage_path` |
| A3 | `editionFigures` (inline JSON, not a file) | `budget_version` | 1 | none on device: the checkpoint fingerprint cannot be recomputed on the device. The values come from the immutable artifact row | < 1 KiB | `project_approval_artifacts.source_snapshot` |

**Manifest entry** (in `attachments[]`, ordered by `position`):

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

`sizeBytes` is `project_documents.size_bytes` and may be `null`. In that case the client
enforces the bound while it streams. Plan sheets are ordered by
`upper(btrim(sheet_number))`, which is the order `set_checksum` uses (`00429:1470`). The
server does not return storage paths.

**Integrity rules**

- **The client verifies every file** against its manifest `sha256` before the file enters the
  cache. It writes to a temporary file and moves it into place only on a match. On a mismatch
  the file is discarded, and the edition's attachments count as unavailable for that fetch.
- **The server asserts the set, once, in SQL.** For a `plan_issue`, 00670 recomputes the
  canonical checksum from the `plan_issue_prints` rows it serves. If the result is not
  `artifact_hash`, it serves `attachments: null`, and the SQL test proves the fixture matches.
  The device never reimplements `_plan_room_canonical_json`.
- **All or nothing per edition.** If any attachment is missing, fails its checksum, has a
  content type other than PDF, PNG or JPEG, or pushes the edition past its bound, the device
  caches none of that edition's files. The record is still cached, and the screen says the
  document needs a connection. A partial plan set that looks complete is worse than no set.
- **Device ceiling: 500 MiB** of attachment bytes across all cached editions. Past the
  ceiling, eviction removes whole editions' files, oldest `respondedAt` first. It never evicts
  an edition that `awaitsClient`. Records are never evicted, only their files.

**Not attached, and why.** These are candidates the broader ruling could have pulled in. Each
is excluded because it is not frozen evidence of this edition:

- **The room-by-room budget breakdown.** It comes from the live working budget. The client
  portal shows it only when it matches the edition, and the device cannot check that offline.
- **Discussion and comments.** They are mutable, and a comment can have an effect.
- **Mood boards, product imagery and room scans.** They are separate aggregates with their own
  authority, not part of the edition.
- **Predecessor editions.** Superseded editions are history, not direction, and history stays
  online.
- **Unrelated Folio documents.** A document the edition does not name is outside the frozen
  record.

**Signing (the fetch path).** A new edge function, `project-approval-attachments`, follows the
same pattern as `project-review-media/index.ts:100-141`:

1. It takes `POST {decisionId}` with `verify_jwt` on.
2. It calls the §C.5 RPC **with the caller's JWT**, so that `auth.uid()` and
   `is_design_studio_comember` (`00399:1164-1194`) evaluate for the caller. It continues only
   on `ok`.
3. It resolves the storage paths through a service-role-only
   `public.project_approval_attachment_objects(p_decision_id)`.
4. It signs the paths with `createSignedUrls(paths, 300)`.

It returns `{urls:[{attachmentId, signedUrl}], expiresInSeconds: 300}`, a `404
{error: <status>}` on any non-`ok` status, and `503 media_unavailable` when an object is
missing. **Signed-URL lifetime: 300 s**, the same as the precedent. A URL only has to be valid
when its download starts. If a URL expires before its download starts, the client asks again,
and each new request re-checks authority. The function does not download bytes to verify them
(a 200 MiB plan set would exceed edge memory and time limits). Verification happens on the
device, against checksums that come from immutable rows.

Attachments are signed after the 00467 predicate, **not** through the bucket's storage
policies. The bucket's reader set (primary client, active team, `client_visible`: `00170`,
`00584`) is a different set. Serving through it would widen or narrow reader authority.

## C.4 Reader authority

Reader authority is **exactly 00467**: a studio co-member of the decision's designer, or the
snapshot's `decision_lead_id`. The new RPC does not restate that predicate. For the `ok` path
it **calls** `app_private.project_decision_review_for_actor(p_decision_id, auth.uid())`, so
there is a single owner of the rule. Attachments inherit the same rule (§C.3).

Two consequences of "exactly 00467", stated so nobody discovers them later:

- **A lead never loses read authority over an edition.** The snapshot is frozen
  (`00463:687-690`). Reassigning the project's lead advances
  `project_decision_authorities.revision`, but it does not change who may read existing
  editions. A former homeowner keeps reading her old editions online, and so keeps them
  offline too. `revoked` reaches a lead only through account-level wipes, never through this
  RPC.
- **Co-approvers cannot read.** `required_coapprover_id` is not in the predicate. None exist
  today, because the authority guard forces it to `NULL` (`00463:393`).

Only a co-member's authority is mutable: membership status, role, the designer leaving, or
the studio being deactivated (`00399:1184-1191`). In practice, `revoked` is the answer for
someone who has left the studio.

## C.5 Revocation: the typed RPC

**This is a new edition, not an in-place change.** 00670 adds
`public.get_project_decision_edition(p_decision_id uuid, p_held_authority_revision integer
DEFAULT NULL, p_held_artifact_checksum text DEFAULT NULL) RETURNS jsonb`. It is
`SECURITY DEFINER`, `STABLE`, and granted to `authenticated` only.
`get_project_decision_review` (whose callers include `use-project-approvals.ts`) and the
00467 resolver stay untouched.

```json
{
  "contract": "shared_direction_v1",
  "status": "ok | revoked | not_found | unauthorized",
  "servedAt": "<server now(), ISO-8601>",
  "review": { … } | null,
  "attachments": [ … ] | null,
  "editionFigures": { … } | null
}
```

`review`, `attachments` and `editionFigures` are non-null only on `ok`.

**Server conditions, evaluated in this order**

| # | Condition | Status |
|---|---|---|
| 1 | `auth.uid()` is `NULL` | `unauthorized` |
| 2 | No `client_decisions` row with that id and `approval_contract = 'project_artifact_v1'` | `not_found` |
| 3 | The 00467 resolver returns an item for `(p_decision_id, auth.uid())` | `ok` |
| 4 | Not a reader now, **and** the caller proves it held this edition: `p_held_artifact_checksum = artifact.artifact_hash` and `p_held_authority_revision = snapshot.authority_revision` | `revoked` |
| 5 | Anything else (a reader it never was, or a proof that is missing or wrong) | `not_found` |

**`unauthorized` does not mean "never had authority".** NI-05's sketch used that meaning, but
answering it would give any signed-in account a way to test whether a decision id exists. That
is the exact oracle `00467:99-100` closes. A caller who never read the edition gets
`not_found` (row 5), the same answer as a nonexistent id (row 2). `unauthorized` is only "no
authenticated subject". The client treats a gateway `401` or an expired JWT the same way.

**Does `revoked` need new state? No.** It is derived from the caller's current standing plus a
proof of possession the caller supplies. The proof is the immutable checksum and revision it
cached. Answering `revoked` tells the caller only that a decision it has already read still
exists.

The residual risk: someone holding both the spec PDF (whose sha256 is the checksum) and the
decision UUID could learn that the decision exists, and would learn nothing else. That is
accepted.

`revoked` is **not** derivable from "the snapshot's `authority_revision` moving", which is the
premise in WAVE-NEXT-PLAN W1A-09/NI-05. The snapshot row cannot move (C.1). The project-level
revision that does move does not change 00467 authority (C.4).

**What the device does with each status**

| Status | Device action |
|---|---|
| `ok` + `disposition = active` | Replace the cached record, fetch attachments if their manifest changed, stamp `lastFetchedAt = servedAt` |
| `ok` + `superseded` | Read `successorDecisionId` through this RPC. Cache the successor on `ok`. Purge this edition entirely |
| `ok` + `withdrawn` | Purge this edition entirely. Online screens still show it with the existing withdrawn copy |
| `revoked` | Purge the edition (record + files). Telemetry `shared_direction_revoked` |
| `not_found` | Purge the edition. A legitimately cached edition always proves possession, so this means the cache is corrupt or foreign |
| `unauthorized`, transport failure, 5xx, timeout | **Never purge.** Keep serving the cache read-only with its stale stamp, and route to re-authentication where relevant |

A purge fires only on a typed answer, never on the absence of one. This is the safeguard
against data loss. Apart from the typed answers, the only purges are the two existing wipes:
`LocalStoreReset.wipeUserScopedData` on an account switch or deletion (`LocalStoreReset.swift:24`).
W1A-10 must extend both wipes to the cached records and the attachment directory, and must add
both to `SessionIsolationTests`.

**Refresh.** When the app comes to the foreground or regains a connection, it:

1. Calls `list_my_project_decision_reviews` to discover new editions.
2. Calls `get_project_decision_edition` with the held proof for every cached id.

No time-to-live purge applies. An offline device keeps its last authorized editions until a
typed answer or a wipe removes them.

## C.6 What is cached

Every edition is cached whose last `ok` answer said `disposition = active` and the caller is a
reader. That covers pending, draft-awaiting-review and responded editions. A responded
`approved` edition is the agreed direction, so it stays. Editions that are `withdrawn`,
`superseded` or `not_found` are not cached. Observer rows (`viewerRole = 'studio'`) are cached
too, because 00467 lets their holders read them, but they carry no act controls in any state.

## C.7 Freshness

Each cached edition stores `lastFetchedAt`, which is the `servedAt` of its last `ok` answer.
It is server time, so device clock skew cannot flatter it. Any screen that draws from the cache
shows "Updated <relative time>". A screen drawing from a response received in the current
foreground session does not. The stamp is per edition, not per app.

## C.8 "No offline approvals" at the API boundary

- **No deferred writes.** No write on the decision rail is ever persisted for later replay.
  That covers `confirm_project_decision_review` (`00463:1467`), `respond_project_approval`
  (`00464:811`), and any other decision-rail write, including a discussion post with effect.
  There is no outbox entry for any of them. An idempotency key is minted only at the moment of
  an online send.
- **An online check before every act.** Immediately before the write, the client calls
  `get_project_decision_edition` with the held proof. It proceeds only on `ok`, and only when
  the item is still `active` with the same `authorityRevision` and `artifactChecksum` the
  reader was shown. The write's compare-and-swap (CAS) values (`authorityRevision`,
  `artifactHash`, `expectedUpdatedAt`) come from **that** read, never from the cache. If the
  check is not `ok`, the act is refused, and each typed answer is handled as in §C.5.
- **The server needs no change for this.** The existing compare-and-swap checks already refuse
  stale state: confirm checks the authority revision and hash, and respond checks `updated_at`
  and `pending`. The server cannot tell a queued act from a live one, so the guarantee is the
  client rule plus those checks. A server-side read-freshness token would need new state, and
  this contract does not ask for one.
- **The offline UI.** Offline, the act controls are not drawn as queueable. Tapping one gives
  the existing offline-refusal copy (W1A-10 owns the wiring).

## C.9 Build split and sizing

- **NI-05 (00670, M).** Covers `get_project_decision_edition`, the manifest serializer, the
  plan-set assert, and `project_approval_attachment_objects` (service role only). It adds SQL
  tests under `supabase/tests/decisions/`, one per status row in §C.5 (including row 5 with a
  wrong proof), plus the plan-set checksum assert.
- **The edge function `project-approval-attachments`** is new and is not named by any filed
  ticket. **Recommend filing it as NI-06 (S)**, with a Deno test for the four responses.
  A deploy of `supabase functions deploy project-approval-attachments` is owed with 00670.
- **W1A-10.** Adds the record, attachment metadata and files per §C.2-C.7, calls the new RPC
  through the injected decisions client, and extends both wipes.

---

## Kody confirms: the attachment list

The offline shared direction is the approval edition plus exactly these attachments:

1. **A1: the spec-book PDF.** One file, 50 MiB or less, verified against the edition's own
   checksum.
2. **A2: the issued plan sheets.** One file per sheet: 1 to 60 sheets, 50 MiB or less each,
   and 200 MiB or less per set. Each file is verified against its frozen sha256. The set is
   cached all or nothing.
3. **A3: the budget edition's frozen totals.** An inline JSON object, not a file. The live
   room-by-room breakdown is not included.

Nothing else attaches: no comments, boards, imagery, scans or predecessor editions. Signed URLs
last 300 s. Purges happen on `revoked`, `not_found`, `withdrawn` or `superseded`, and on the
existing account wipes. A lost connection or session never purges.

**Recommended answer: confirm as listed.** Two alternatives Kody could choose instead:

- **(a) Drop A2** if plan sets for Leah's projects routinely exceed the 200 MiB bound. The
  sizes have not been measured, and a read-only query on Strata would settle it.
- **(b) Raise the device ceiling** from 500 MiB.

Confirming also accepts the two corrections to the plan's wording. First, `unauthorized` means
"no session", and "never had authority" returns `not_found` (§C.5). Second, `revoked` is proven
by possession and is not derived from `authority_revision` (§C.4-C.5).
