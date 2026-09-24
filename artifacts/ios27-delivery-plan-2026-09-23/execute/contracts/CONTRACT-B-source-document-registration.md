<!--
W0-16 / T6 — one of two upstream contracts for the iOS 27 program (story US-8).
Companion file in this directory holds the other half.
Authored read-only against main (tip 2de2ae85d); file:line citations are exact.
Split from the ticket plan document by the orchestrator; content unaltered.
-->

# CONTRACT B — `source_document` registration

**Version** `sourceRegistrationVersion: 1`

## B.1 The problem, stated exactly

- `project-ffe-document-extract` requires `get_project_ffe_extract_upload`
  (`index.ts:29`), which resolves only an asset already registered with
  `media_kind = 'source_document'` (`00437:133`).
- The only way to create that row is
  `register_project_ffe_working_media_source` (`00455:5`), which is
  `REVOKE ALL ... FROM PUBLIC, anon, authenticated, service_role` then
  `GRANT EXECUTE ... TO service_role` (`00455:85-91`).
- `authenticated` holds **SELECT only** on `public.project_ffe_media_assets`
  (`00438:423-434`), so a client cannot insert the row directly either.
- The single edge caller, `project-review-media`, registers
  `p_media_kind: "board_reference"` (`project-review-media/lib.ts:205`).

So no `source_document` is ever created by anything in the repository, and the
camera path has no route regardless of an image branch.

## B.2 The answer

**The client registers nothing.** It calls an edge function that holds
service_role server-side and registers on its behalf — exactly the shape
`project-review-media/index.ts:41-50` already uses. The only differences are
`p_media_kind: "source_document"` and the accepted content types.

Authorization is **not** delegated. `register_project_ffe_working_media_source`
calls `_ffe_is_studio_actor(v_project.designer_id, p_actor_id)` at `00455:28`
and constrains `p_path LIKE p_project_id || '/%'` at `00455:33`. The edge
function passes `caller.data.user.id` resolved from the JWT via
`admin.auth.getUser()` — never a client-supplied actor id. **The studio-membership
check therefore runs inside the database under the caller's real identity, while
the service_role key never leaves the server.** That is the whole answer to
"without handing it service_role".

**No migration is needed for registration itself.** `00455:38` already accepts
`application/pdf, image/jpeg, image/png, image/webp`, and `00455:39` already
accepts `media_kind = 'source_document'`. The function was built for this and has
never been called with it.

## B.3 Where it lives — one call, not two

Extend `project-ffe-document-extract` to accept `source` in place of `assetId`:

```jsonc
{
  "projectId": "<uuid>",
  "source": {
    "bucket": "project-ffe-working",
    "path":   "<projectId>/source-documents/<sha256hex>.<ext>"
  },
  "schemaVersion": 2
}
```

The function registers-or-reuses the asset as a `source_document`, then proceeds
exactly as today. `assetId` remains accepted for an already-registered asset, so
the portal's PDF flow (register now, extract later) is unaffected.

Rationale: the camera's real need is one round trip. Two calls would leave a
dangling registered asset whenever the second fails. Both legs are idempotent
(§B.6) so two calls would be *safe*, but one is better, and it keeps the ACL
surface at a single function and a single `config.toml` entry.

## B.4 The upload leg is already solved

`00433:153-183` grants `authenticated` INSERT and SELECT on
`storage.objects` where `bucket_id = 'project-ffe-working'` and
`(storage.foldername(name))[1]` is a project whose designer passes
`is_studio_comember`. A mobile client already has a legal, RLS-checked PUT. The
missing piece was only ever the `project_ffe_media_assets` row.

## B.5 The trust boundary — content type must be sniffed

The client controls the `Content-Type` header on its upload, so the stored
object's metadata is client-asserted and has survived only the bucket allowlist.
`p_content_type` must therefore **not** come from the request body or from the
blob's reported type.

The function downloads the object, sniffs the magic bytes —

| Type | Prefix |
|---|---|
| `application/pdf` | `%PDF-` |
| `image/jpeg` | `FF D8 FF` |
| `image/png` | `89 50 4E 47 0D 0A 1A 0A` |
| `image/webp` | `RIFF` + `WEBP` at offset 8 |

— registers the **sniffed** type, and returns `415 unsupported_source_type` on
anything else or on a mismatch against the stored metadata. It computes
`checksumSha256` and `sizeBytes` from the downloaded bytes itself
(`sha256Hex`, `lib.ts:193`), never from the client. This mirrors
`project-review-media/index.ts:61-67`, which already downloads-then-hashes for
the same reason.

## B.6 Idempotency

**Content-addressed at every layer, no caller-supplied key.**

The path is `<projectId>/source-documents/<sha256hex>.<ext>` — iOS computes the
digest with CryptoKit before the PUT. Then:

- **Storage** — a repeated PUT of identical bytes to the same path is harmless.
- **Registration** — `ON CONFLICT (storage_bucket, storage_path) DO NOTHING`
  (`00455:58`) returns the existing asset with `reused: true`.
- **The tamper check** — if that path now holds *different* bytes,
  `00455:65-73` raises `data_exception`: "working media registration does not
  match verified stored bytes". A retry can never silently re-point an asset.
- **Extraction** — dedupes on `(project_id, file_hash)` as in §A.12.

All three layers key on the same digest, so one retry policy covers the chain.

*Alternative considered and rejected:* `<projectId>/source-documents/<clientCaptureId>.<ext>`.
It survives a device retry too, but a re-encode under the same capture id trips
the `00455:65-73` tamper check and returns a 409 the client cannot resolve.

## B.7 Response shape

```jsonc
{
  "sourceRegistration": {
    "assetId": "<uuid>",
    "mediaKind": "source_document",
    "contentType": "image/jpeg",
    "checksumSha256": "<64 hex>",
    "sizeBytes": 2418123,
    "reused": false,
    "sourceRegistrationVersion": 1
  },
  "batchId": "<uuid>", "status": "staged", "reused": false,
  "rowCount": 30, "sourceAssetId": "<uuid>",
  "schemaVersion": 2, "unconfirmedCommercialRows": 12
}
```

`parseRegisteredSource` (`project-review-media/lib.ts:209-240`) is the exact
validator shape to copy — it re-checks every returned field against what was
sent, and `mediaKind !== "board_reference"` becomes
`mediaKind !== "source_document"`.

## B.8 Error codes for the registration leg

| Code | HTTP | Raised by |
|---|---|---|
| `invalid_source_path` | 422 | Path fails `00455:33-35` (not `<projectId>/…`, contains `://`, `?`, `..` or `\`). |
| `source_not_authorized` | 403 | `00455:28-31` raised `insufficient_privilege` (42501) — caller is not a studio co-member. |
| `source_unavailable` | 404 | Object absent from storage. |
| `unsupported_source_type` | 415 | Sniff failed or disagreed with stored metadata. |
| `source_too_large` | 413 | Over the branch cap (§A.3). |
| `source_registration_conflict` | 409 | `00455:71-72` `data_exception` — path already registers different bytes or a different kind. |
| `source_item_mismatch` | 409 | `00455:48-49` `integrity_constraint_violation` — only reachable if `p_ffe_item_id` is ever passed; this contract always passes `NULL`. |

## B.9 Migration reservation — coordination result

**Checked, not assumed:**

- `main` (tip `2de2ae85d`) holds `00658_resume_middle_west_enrollments.sql` and
  `00659_pilot_terms_acceptance.sql`. The tip **is** 00659, as the plan's
  correction §10.5 says.
- `build/studio-hook-2026-09-22`'s tree stops at `00657_retire_funnel_views.sql`
   — 00658 and 00659 reached `main` ahead of that branch's tip, so the branch
  holds no number this work needs.
- `git log --all --diff-filter=A -- 'supabase/migrations/0066*' 'supabase/migrations/0067*'`
  returns **nothing**. No number at or above 00660 is occupied on any ref.

**Reserved band for T6: 00660–00664.**

| № | Slug | Contents |
|---|---|---|
| 00660 | `ffe_extract_image_branch` | Widen `get_project_ffe_extract_upload`'s `content_type` filter (`00437:134`) to the four accepted types; add `'photo'` to `project_ffe_import_batches.source_kind` (`00434:393`); derive `source_kind` from the upload's content type instead of the `'pdf'` literal (`00437:218`) and fix the reuse guard (`00437:202`). |
| 00661 | `ffe_extract_commercial_confirmation` | `normalized_row.commercial`; the `unconfirmed_commercial_value` validation error; the per-row `commercial` decision in `commit_project_ffe_import` (`00439:541-556`); the envelope-walking fix for the formula-like scan (§A.7). **Blocked on the currency-column ruling, §A.13.3.** |
| 00662 | `device_push_tokens_bundle` | The G2 bundle/app column, backfilled to `cloud.patina.app`. |
| 00663 | *(reserved)* | The revert migration the plan requires be written **before** 00662 — there is no flag to hide behind. |
| 00664 | *(reserved)* | Spare, per discipline rule 2 — re-check `list_migrations` immediately before every land. |

**Edit to land in `docs/engineering/migration-number-reservations.md`**, per that
file's discipline rule 4 ("this file is the single source of truth for band
ownership") and rule 5 ("land the edit before or with the migration"):

> ## 00660–00664 — T6, Document & Delivery Contracts (iOS 27 program)
>
> Reserved 2026-09-23 by W0-16. Verified free at reservation time: `main` tip is
> 00659; `build/studio-hook-2026-09-22` holds nothing above 00657; and
> `git log --all` occupies no number at or above 00660.
>
> 00660 `ffe_extract_image_branch` — the extractor's non-PDF branch. Widens
> `get_project_ffe_extract_upload`'s `content_type` filter (00437), adds `'photo'`
> to `project_ffe_import_batches.source_kind` (00434) and derives `source_kind`
> from the upload rather than the `'pdf'` literal.
>
> 00661 `ffe_extract_commercial_confirmation` — ruling D7's maker/SKU/price/
> currency, staged as unconfirmed envelopes that the existing
> `validation_errors` commit gate refuses until a per-row designer decision
> supplies the value. Blocked on where a confirmed non-USD currency persists —
> `project_ffe_items` has no currency column.
>
> 00662 `device_push_tokens_bundle` — the per-token bundle column `apns-send`
> needs to address Patina Field. 00663 holds its revert, written first.
> 00664 spare.
>
> Registration itself needs **no** migration: 00455 already accepts
> `media_kind = 'source_document'` and all four content types.

## B.10 Stated explicitly — what I could not determine

1. **Whether Field's camera writes to `project-ffe-working` at all today.**
   A repo-wide search finds that bucket only in the designer portal's mood-board
   code. The Field-side upload leg is unwritten, not merely unwired.
2. **Whether `project-ffe-working`'s 50 MiB object cap is the right ceiling for a
   burst of tag photos.** No quota exists per project or per actor — unlike the
   upload-intent interface, which grew a 24-pending cap in 00501 after a security
   review found exactly that gap. A camera path invites the same finding.
3. **Retention.** Nothing in 00433/00437/00455 expires a registered
   `source_document` or its bytes. A tag photo is a business record with an
   indefinite life by default.