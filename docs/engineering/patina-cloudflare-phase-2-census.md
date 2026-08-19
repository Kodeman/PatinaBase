# Patina Cloudflare Phase 2 — read-only production census

Workstream B-W0. All figures below were collected read-only against Strata prod
(`bkvcixdmuyejfzcijpdg`) via Supabase MCP `execute_sql` (SELECT-only, no DDL/DML) plus
read-only `npx wrangler r2 bucket list` / `bucket info` from `infra/media-worker`'s
account context, and a single unauthenticated `GET /health` probe against the deployed
media container. Zero mutations were made anywhere. Per the Phase 1 runbook's
"Read-only production census" rules, this document contains **aggregate counts, byte
totals, age bands, and path-CLASS patterns only** — no filenames, no full object keys,
no signed URLs, no customer identities. See the leakage-check note at the bottom.

Collected 2026-08-18/19.

## 1. Prod Supabase Storage census

19 buckets exist on prod; 9 hold objects, 10 are empty.

| bucket | object_count | total_bytes | max_object_bytes | age <30d | 30–90d | 90–180d | 180d+ |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| room-scans | 916 | 424,937,293 | 54,403,072 | 616 | 300 | 0 | 0 |
| feedback-screenshots | 15 | 8,357,953 | 917,708 | 14 | 1 | 0 | 0 |
| project-documents | 7 | 8,356,298 | 7,937,303 | 5 | 2 | 0 | 0 |
| capture-media | 7 | 2,918,733 | 587,282 | 7 | 0 | 0 | 0 |
| field-media | 1 | 773,618 | 773,618 | 1 | 0 | 0 | 0 |
| proposal-mood-boards | 5 | 180,678 | 72,431 | 5 | 0 | 0 | 0 |
| studio-logos | 2 | 88,181 | 85,974 | 1 | 1 | 0 | 0 |
| project-review-media | 1 | 43,520 | 43,520 | 1 | 0 | 0 | 0 |
| project-ffe-working | 1 | 43,520 | 43,520 | 1 | 0 | 0 | 0 |
| **Total (populated)** | **955** | **445,699,794 (~425.1 MiB)** | — | 651 | 304 | 0 | 0 |

Empty buckets (0 objects each): `avatars`, `catalog-feeds`, `comms-attachments`,
`extension-releases`, `portfolio-items`, `product-images`, `proposal-assets`,
`room-hero-frames`, `room-scan-thumbnails`, `site-requests`.

No object anywhere on prod is older than 90 days — consistent with all buckets having
been created within the last ~7 months and the platform's actual usage volume still
being early-stage. There is no 180d+ band to reason about yet.

### MIME class distribution (populated buckets only)

| bucket | mime_class | object_count | total_bytes |
| --- | --- | ---: | ---: |
| room-scans | application | 150 | 300,391,903 |
| room-scans | image | 746 | 123,674,081 |
| room-scans | model | 20 | 871,309 |
| feedback-screenshots | image | 15 | 8,357,953 |
| project-documents | image | 2 | 8,182,993 |
| project-documents | application | 5 | 173,305 |
| capture-media | image | 7 | 2,918,733 |
| field-media | image | 1 | 773,618 |
| proposal-mood-boards | image | 5 | 180,678 |
| studio-logos | image | 2 | 88,181 |
| project-ffe-working | image | 1 | 43,520 |
| project-review-media | image | 1 | 43,520 |

`room-scans` is 95.3% of total object bytes and is dominated by `application/*` (scan
bundles/manifests/archives) rather than images by byte weight, even though images are
81% of its object count.

### R2 usage (`patina-raw` / `patina-processed`, media-worker account context)

Obtained via `npx wrangler r2 bucket info <bucket>` (read-only, no listing of keys):

| bucket | object_count | bucket_size |
| --- | ---: | ---: |
| patina-raw | 0 | 0 B |
| patina-processed | 1 | 10 B |
| patina-archive | 0 | 0 B |
| patina-storage | 0 | 0 B |
| patina-thumbnails | 0 | 0 B |
| patina-raw-staging | 0 | 0 B |
| patina-processed-staging | 0 | 0 B |
| patina-staging-media-artifacts-us | 0 | 0 B |
| patina-staging-media-originals-us | 0 | 0 B |

R2 is effectively unused on both prod and staging today — the single 10-byte object in
`patina-processed` reads as a smoke-test artifact, not real media. All production media
volume currently lives in Supabase Storage (`room-scans` above). This matters for
Phase 2 planning: there is no R2→Supabase reconciliation debt to carry yet, but it also
means the `media-worker`/`media-svc-worker` Container path is unproven against real
production object volume.

## 2. Reference-column inventory

Every `public` schema column matching `%_url` / `%_key` / `%_path` / bare `url|key|path`
was enumerated via `information_schema.columns`, then narrowed to the subset that
actually reference stored media/documents (logical keys — `idempotency_key`,
`dedupe_key`, `phase_key`, `section_key`, `template_key`, `cache_key`, `session_key`,
`metric_key`, `option_key`, `question_key`, `field_key`, `configuration_key`,
`*_gradient_key` — are excluded as non-storage business keys). ~120 candidate columns
were found across `public`; the storage-relevant subset is below, classified by
aggregate `LIKE`-pattern counts on prod. Values were never selected into this document.

| column | non-null rows | shape breakdown |
| --- | ---: | --- |
| `room_scan_images.image_url` | 620 | public_supabase_url: 620 |
| `room_scan_images.thumbnail_url` | 620 | public_supabase_url: 620 |
| `room_scan_images.preview_url` | 513 | public_supabase_url: 513 |
| `room_scans.captured_room_json_url` | 12 | public: 8, bare_key: 4 |
| `room_scans.model_url` | 12 | public: 8, bare_key: 4 |
| `room_scans.bundle_manifest_url` | 8 | public: 5, bare_key: 3 |
| `room_scans.depth_archive_url` | 11 | public: 7, bare_key: 4 |
| `room_scans.scan_bundle_url` | 5 | public: 5 |
| `room_scans.world_map_url` | 5 | public: 1, bare_key: 4 |
| `room_scans.coverage_heatmap_url` | 6 | public: 2, bare_key: 4 |
| `room_scans.photos_manifest_url` | 2 | bare_key: 2 |
| `room_scans_v2.captured_room_json_url` | 11 | public: 7, bare_key: 4 |
| `room_scans_v2.model_url` | 11 | public: 7, bare_key: 4 |
| `room_scans_v2.depth_archive_url` | 11 | public: 7, bare_key: 4 |
| `room_scans_v2.scan_bundle_url` | 5 | public: 5 |
| `room_scans_v2.world_map_url` | 5 | public: 1, bare_key: 4 |
| `room_files.dxf_url` / `.pdf_url` / `.svg_url` | 6 each | public_supabase_url: 6 each |
| `room_files.dense_mesh_url` / `.measure_mesh_url` / `.splat_url` / `.mesh_url` (room_scans/v2) / `.thumbnail_url` (room_scans/v2) / `.hero_frame_url` (room_scans/v2) | 0 | not yet populated |
| `feedback.screenshot_path` | 15 | bare_key: 15 |
| `field_captures.primary_photo_path` | 7 | bare_key: 7 |
| `project_documents.storage_path` | 5 | bare_key: 5 |
| `project_ffe_media_assets.storage_path` | 1 | bare_key: 1 |
| `project_ffe_media_reconciliation.source_path` | 5 | bare_key: 5 |
| `project_review_media_assets.storage_path` | 1 | bare_key: 1 |
| `fulfillment_vendor_pos.pdf_r2_key` | 2 | bare_key: 2 |
| `organizations.logo_url` | 2 | public_supabase_url: 2 |
| `proposal_send_dispatches.studio_logo_url` | 9 | public_supabase_url: 9 |
| `proposal_board_items.image_url` | 17 | external_url: 16, public_supabase_url: 1 |
| `proposal_boards.cover_image_url` | 4 | public: 2, external: 1, bare_key: 1 |
| `proposal_items.image_url` / `proposal_captures.thumbnail_url` | 1 each | external_url |
| `project_boards.cover_image_url` | 1 | external_url: 1 |
| `client_decision_options.image_url` | 4 | external_url: 4 |
| `vendors.logo_url` / `.hero_image_url` | 2 / 1 | external_url |
| `products.source_url`, `match_ceremonies.portfolio_url`, `designer_prospects/applications.portfolio_url` | 10 / 6 / 0 | external by design (catalog/portfolio provenance links, not Patina-owned storage) |

No `signed_supabase_url` shape and no `r2_url` shape were found anywhere in `public`
today — nothing in the schema currently stores a signed URL or an R2 object reference
as a URL. `pdf_r2_key`/`pod_r2_key` (fulfillment) store bare R2 key strings, consistent
with their naming, not URLs.

**Finding — dead bucket reference:** `apps/designer-portal/src/components/vendors/vendor-form.tsx`
uploads to and reads from a `vendor-logos` Supabase Storage bucket
(`.storage.from('vendor-logos')`, lines 139/152), but no `vendor-logos` bucket exists in
`storage.buckets` on prod (`studio-logos` exists instead, created 2026-07-15, and is what
is actually populated). Any designer using that upload path today gets a storage error;
this is a real, live bug independent of Phase 2, uncovered as a side effect of the
census's "vendor-logos coverage" check called for by the runbook.

### `room_scans` vs `room_scans_v2` vs `room_files` shape split

Every populated `room_scans`/`room_scans_v2` URL column shows the same ~64%
public-Supabase-URL / ~36% bare-key split (e.g. `model_url`: 8 public / 4 bare of 12).
That is not row-level noise — it is two different write paths (an older bare-key writer
and a newer URL-materializing writer) that were never backfilled against each other.
`room_files` (the newer Rendered Room v2 kernel — W1 IFC/SVG/PDF/DXF export target) is
100% `public_supabase_url` and 0% bare-key, i.e. clean. This is the single largest
contract-shape inconsistency the census surfaced.

## 3. `svc_media` shape preflight

Exact prod `svc_media` relation + column spelling, via `information_schema.columns`
(prod, read-only):

| table | columns (ordinal order, verbatim casing) |
| --- | --- |
| `MediaAsset` | id, kind, productId, variantId, role, rawKey, processed, status, width, height, format, sizeBytes, mimeType, phash, palette, blurhash, lqipKey, license, qcIssues, qcScore, scanStatus, scanResult, isPublic, permissions, viewCount, downloadCount, tags, sortOrder, uploadedBy, createdAt, updatedAt, project_id |
| `AssetRendition` | id, assetId, key, width, height, format, sizeBytes, purpose, transform, createdAt |
| `ThreeDAsset` | id, assetId, glbKey, usdzKey, triCount, nodeCount, materialCount, textureCount, widthM, heightM, depthM, volumeM3, lods, materials, textures, arReady, arChecks, snapshots, qcIssues, drawCalls, perfBudget, createdAt, updatedAt |
| `ProcessJob` | id, assetId, type, state, priority, attempts, maxRetries, error, errorCode, queuedAt, startedAt, finishedAt, meta, result, workerId |
| `UploadSession` | id, assetId, filename, fileSize, mimeType, kind, parUrl, targetKey, expiresAt, status, uploadedAt, userId, productId, variantId, role, idempotencyKey, createdAt, updatedAt |
| `LicenseRecord` | id, assetIds, licenseType, sourceVendor, sourceVendorId, attribution, usageScope, territory, expiresAt, proofDocKey, alertsSent, createdBy, createdAt, updatedAt |
| `outbox_events` | id, type, payload, headers, published, createdAt, lastError, publishedAt, retryCount |

**Confirmed divergence.** `services/media/prisma/schema.prisma` declares `@@map("media_assets")`
with every field carrying an explicit snake_case `@map` (`rawKey → raw_key`,
`createdAt → created_at`, `sizeBytes → size_bytes`, etc.) and expects table names
`media_assets`, `asset_renditions`, `three_d_assets`, `process_jobs`. Prod instead has
PascalCase table names (`MediaAsset`, `AssetRendition`, `ThreeDAsset`, `ProcessJob`,
`UploadSession`, `LicenseRecord`) with camelCase columns matching the Prisma *model*
field names literally, as if the `@map` directives were never applied when the schema
was created on prod — i.e. prod was shaped by an earlier/different schema revision than
what's in the repo today. `outbox_events` is the one table that already matches its
mapped snake_case name, which is itself a data point: the divergence is not uniform
across the schema, it's per-table. This is the same shape referenced in memory's
"PROD svc_* schemas are Prisma-shaped" finding and is exactly what the fixed-00482
casing-resolution pattern (`2d6e9063`) and 00493 (svc-shape-resolving function bodies)
were built to work around at the SQL-function boundary — Prisma Client itself has not
been reconciled against this shape.

### Media container health probe

`services/media/src/public-health.ts` registers `GET /health` as the only genuinely
unauthenticated route on the service (`app.getHttpAdapter().get('/health', ...)` outside
Nest's guard chain). Every other controller (`AssetsController`, `SearchController`,
`JobsController`, `UploadController`, `MediaController`) carries `@UseGuards(JwtAuthGuard)`
plus a permission decorator; `SystemController`'s `/version` additionally requires
`MEDIA_ADMIN_PERMISSION`. So `/health` was the only safe unauthenticated read probe.

```
GET https://patina-media-svc-worker.kody-be3.workers.dev/health
→ 200 {"status":"ok","service":"media","timestamp":"2026-08-19T03:26:37.505Z","uptime":6.66691634}

GET https://patina-media-svc-worker.kody-be3.workers.dev/v1/media/stats/overview
→ 403 (guard active, no data returned — confirms routing is live, not a stale/404 deploy)
```

**The deployed prod media container answers, and is enforcing auth on every
data-bearing route.** `uptime: 6.7s` at request time indicates a very recent
cold start/restart (Container scale-to-zero or a recent deploy), not a hung process —
worth noting for B-W3b's outage-risk window since it shows the container currently
comes back cleanly from cold starts, but says nothing about behavior once the
schema-shape reconciliation changes what Prisma Client expects at query time. The
standing freeze (no prod media-service deploy until the `svc_media` shape reconciliation
lands) remains warranted: a deploy that ships a Prisma Client generated against the
mapped snake_case schema would immediately break every query against the
PascalCase/camelCase prod tables above.

## 4. Backfill priority ranking

Ordered by (bytes × contract-violation × client-change cost), highest first:

1. **Room scan / Room File domain** (`room_scans`, `room_scans_v2`, `room_scan_images`,
   `room_files`, bucket `room-scans`). 425 MiB / 955 objects = 95.3% of all census'd
   storage bytes; the dual bare-key/public-URL split documented above is a live,
   uncorrected contract violation on almost every URL column; and it has the highest
   client-change cost of anything in the census — it's read by the iOS Capture scan
   pipeline, the designer portal Room View (three.js Orbit), and is the active write
   target of Rendered Room v2 W1/W2 (IFC/SVG/PDF/DXF/splat export). Any backfill here
   touches code that's mid-flight on another program.
2. **`svc_media` schema-shape reconciliation** (MediaAsset/AssetRendition/ThreeDAsset/
   ProcessJob/UploadSession/LicenseRecord). Near-zero live bytes today (R2 is
   essentially empty), but the contract violation is total — Prisma Client's compiled
   query shapes do not match prod's actual column/table casing at all — and the
   client-change cost is maximal: it is the standing deploy freeze for the only
   Cloudflare-Container-hosted retained service in this program, and any future prod
   deploy is currently unsafe until this is resolved. Ranks second despite near-zero
   bytes because the violation and cost terms dominate the product.
3. **Small ancillary buckets** (`feedback-screenshots`, `project-documents`,
   `capture-media`, `field-media`, `proposal-mood-boards`, `studio-logos`,
   `project-review-media`, `project-ffe-working` — 20.6 MiB combined, 39 objects).
   Reference columns here (`storage_path`, `screenshot_path`, `primary_photo_path`) are
   uniformly bare-key with no shape drift, and none of these paths are under active
   multi-program construction right now — lowest urgency of the populated buckets.
4. **`vendor-logos` dead bucket reference** (0 bytes — the bucket doesn't exist). Not a
   backfill target by the bytes formula, but flagged because it's a live correctness
   bug (designer-portal upload silently fails) that a Phase 2 pass through vendor
   media should just fix in passing rather than backfill around.
5. **External/business URL columns** (`vendors.logo_url`/`.hero_image_url`,
   `products.source_url`, `match_ceremonies.portfolio_url`, `client_decision_options.image_url`,
   `proposal_board_items.image_url` majority, `proposal_items/captures.*_url`). These are
   intentionally external references (catalog provenance, applicant portfolio links,
   client-branding photos) — not Patina-owned storage, no backfill applies, lowest
   priority by design rather than by neglect.

## Leakage check

Before committing, this document was grepped for URL-looking and object-key-looking
strings (`http`, `://`, `supabase.co/storage`, `.jpg`, `.jpeg`, `.png`, `.heic`, `.pdf`,
`.usdz`, UUID-shaped path segments, `token=`) to confirm no filename, full object key,
signed URL, or identity leaked into this file. Only the aggregate class labels
(`bare_key`, `public_supabase_url`, `signed_supabase_url`, `r2_url`, `external_url`),
bucket/table/column names, and the two literal domain hostnames already public in the
runbook (`patina-media-svc-worker.kody-be3.workers.dev`, both from the task brief) and
the health-probe JSON (containing no customer data) appear.
