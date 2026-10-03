# House patterns for "upload a file → async extraction → human review → commit rows" (Patina)

**Bottom line**
- **Extract-then-review exists, but it runs synchronously.** `project-ffe-document-extract` does the whole job inside one request: it reads the uploaded file, calls Claude once, stages the rows, then a separate commit RPC turns reviewed rows into FF&E items.
- **Nothing calls it yet.** No portal, iOS or package code invokes it, and no review UI exists.
- **Nothing in the repo reads PowerPoint.** The cowork intake bridge's tests treat `*.pptx` as `unsupported`. The working bucket also refuses the pptx MIME type.
- **The house async pattern is different.** It is a durable outbox table, drained by pg_cron → `invoke_edge_function` (60 s pg_net window), with a `job_runs` row per run. Long or heavy compute is handed off to a container (Cloudflare Containers or Modal).
- **Pieces a photo match can reuse:**
  - a real image-embedding service (`aesthete-inference /embed/image`, nomic-vision, 768-d);
  - a product vector in the same aligned space (`products.aesthete_vector`, 0.65 image + 0.35 caption);
  - a SKU-then-embedding product matcher (`catalog-normalizer`);
  - a link unfurler (`capture-from-url`, OG/JSON-LD, with SSRF guards and a quota).

Tags: **[V]** means I verified it in code. **[I]** means I inferred it. Confidence is H, M or L.

---

## 1. `supabase/functions/project-ffe-document-extract`

### Inputs and how the file arrives
- **[V-H]** POST JSON in one of two shapes: `{projectId, assetId, schemaVersion}` or `{projectId, source:{bucket:'project-ffe-working', path}, schemaVersion}`. Exactly one of `assetId` or `source` is allowed (`lib.ts:26-28`, `88-107`). `schemaVersion` must be 1 or 2, and defaults to 1 (`lib.ts:101-102`).
- **[V-H]** The file never travels in the request. The client first PUTs it to the Supabase Storage bucket `project-ffe-working`.
  - The path must be content-addressed: `<projectId>/source-documents/<sha256>.(pdf|jpg|jpeg|png|webp)` (`lib.ts:9-10`).
  - The function downloads the object as the caller (anon key + caller JWT, so bucket RLS applies) (`index.ts:41-57`).
- **[V-H]** Accepted types: `application/pdf`, `image/jpeg`, `image/png`, `image/webp` (`lib.ts:11`).
  - The type is sniffed from magic bytes and must equal the stored Content-Type (`lib.ts:157-166`, `465-467`).
  - The bucket allows only those four MIME types, with a 50 MiB cap (`supabase/migrations/00433_ffe_safe_reader_media_compatibility.sql:11-30`). **pptx is not allowed.**
- **[V-H]** Size caps: PDF 25 MiB, image 10 MiB (`lib.ts:1-2`, `147-148`). Over-cap returns 413 (`index.ts:73`).
- **[V-H]** Integrity: the stored byte length and sha256 must match the registered manifest (`index.ts:80-82`). The path hash must equal the bytes' hash (`lib.ts:472-474`).
- **[V-H]** Registration: RPC `register_project_ffe_working_media_source` creates or reuses a `source_document` asset (`index.ts:54`).
  - Allowed `media_kind` values: `'working' | 'source_document' | 'board_reference'` (`00455_ffe_working_media_registration.sql:~39`).
  - SQLSTATE → HTTP mapping is at `lib.ts:393-401`.

### Parser and LLM
- **[V-H]** There is no local parser. The raw bytes are base64-encoded and sent as a single Claude content block: `document` for PDF, `image` otherwise (`lib.ts:150-153`).
- **[V-H]** Provider and call details (`index.ts:84-97`):
  - Endpoint: Anthropic `/v1/messages`.
  - Model: `claude-sonnet-5`, `max_tokens: 6000`.
  - Secret: `ANTHROPIC_API_KEY` (missing key returns 503 `extractor_unavailable`).
  - Output is forced through one tool, `tool_choice: {type:'tool', name:'stage_project_ffe_rows'}`, with `disable_parallel_tool_use`.
- **[V-H]** The prompt forbids inferring approval, markup or pricing. In v2, every commercial value must have `state:"unconfirmed"` (`lib.ts:168-175`).
- **[V-H]** Base64 is built in 0x6000-byte chunks to avoid overflowing `String.fromCharCode(...)` arguments. This is an edge-runtime workaround (`lib.ts:483-488`).
- Other Claude users in the repo, for reference [V]:
  - `aesthete-dna-draft`: claude-sonnet-5 and claude-haiku-4-5.
  - `_shared/field-parse.ts`: haiku-4-5.
  - `companion-message/model.ts`: claude-sonnet-4-20250514.

### Output shape
- **[V-H]** v1 row: `{pageNumber, provenance:{page, confidence}, name, quantity, roomName, category}` (`lib.ts:50-57`).
- **[V-H]** v2 row adds:
  - `maker`, `sku`, `unitPriceMinor`, `currency`, each as `{value, confidence, state:'unconfirmed'} | null`;
  - `priceBasis: 'unknown'`;
  - `provenance.sourceKind: 'pdf' | 'photo'` (`lib.ts:61-78`).
- **[V-H]** Validation rules:
  - exact key sets; max 5,000 rows;
  - formula-injection guard (`=+@-`) on text fields;
  - a photo is pinned to page 1;
  - price and currency must be both null or both present (`lib.ts:238-343`).
- **[V-H]** Response: `{batchId, status, reused, rowCount, sourceAssetId, unconfirmedCommercialRows, schemaVersion, sourceRegistration?}` (`lib.ts:79-86`, `index.ts:112-116`).

### Status and job tracking
- **[V-H]** No job, queue or polling. Everything runs inside the caller's HTTP request (`index.ts:24-117`).
- **[V-H]** Batch state lives in `project_ffe_import_batches.status` (`staged | committed | failed | abandoned`).
  - Columns include `source_kind` (originally `csv|xls|xlsx|pdf`; `photo` was added in `00660_ffe_extract_image_branch.sql:50-51`) and `file_hash`.
  - `UNIQUE(project_id, file_hash)` (`00434_ffe_privacy_domain_foundation.sql:390-403`).
- **[V-H]** Idempotency is content-addressed: the same bytes return the existing batch with `reused: true`. There is no caller-supplied key (`artifacts/ios27-delivery-plan-2026-09-23/execute/contracts/CONTRACT-A-extractor.md` §A.12).
- **[V-H]** Staged rows go in `project_ffe_import_rows`, with columns `raw_row`, `normalized_row`, `project_room_id`, `assignment_scope`, `duplicate_mode`, `validation_errors`, `committed_ffe_item_id` (`00434:405-419`). Staging uses RPC `stage_project_ffe_document_extraction`; the latest version is `00666_ffe_extract_money_review_fixes.sql:191`.

### Review UI
- **[V-H] None exists.** There is no reference to `project-ffe-document-extract`, `stage/commit_project_ffe_import` or `project_ffe_import_*` in `apps/` (designer-portal or mobile) or `packages/`, apart from `database.types.ts`.
- **[V-H]** The contract doc says the same: "deployed and unexercised… first integration will be the first real traffic" (`CONTRACT-A-extractor.md:315-317`).

### How extracted rows become FF&E items
- **[V-H]** RPC `commit_project_ffe_import(p_batch_id, p_decisions jsonb[])` (`00666:248-348`) wraps `_commit_project_ffe_import_00446_impl` (`00660:248+`).
  - Each decision is `{rowOrdinal, roomId | assignmentScope('room'|'throughout'|'unassigned'), duplicateMode('reuse'|'create'|'hold'), commercial?}`.
  - Every row needs room and duplicate decisions, or the commit raises.
- **[V-H]** Each row is placed via `place_product_in_project_v2({projectId, productId: normalized_row->>'productId', name, category, quantity, …})`. The placement idempotency key is `import:<batch>:<ordinal>`.
  - Confirmed commercial values then write to `project_ffe_items` (`vendor_name`, `unit_price_cents` or `trade_price_cents` depending on `priceBasis`, `currency`) and to `project_ffe_specs.sku` (`00666:300-346`).
- **[V-H]** Staging already accepts a `productId` per row: a row with no name but a productId is valid (`00437_ffe_service_boundaries.sql:256-260`, `277`). The extractor's tool schema does not emit `productId` (`lib.ts:12-13`).
  - **[I-H]** So a matcher step can set `normalized_row.productId` before commit, and the row becomes a catalog-linked selection.

---

## 2. Sibling upload and review functions

### `paperwork-upload`
- **[V-H]** Public endpoint with `verify_jwt=false` (`config.toml:564-565`). Authority is a 64-hex link token.
- **[V-H]** Multipart POST → storage upload to `compliance-documents/{org}/{company}/{upload_id}/{filename}` → RPC records an **unverified** document and notifies the studio, which confirms it later (`paperwork-upload/core.ts:1-33`, `355`, `360`, `434`).
- **[V-H]** Limits: PDF/JPEG/PNG, 15 MB (`core.ts:66-74`). Rate limit via RPC `paperwork_link_rate_limit_hit` (`core.ts:243`).
- **[V-H]** Logic lives in a pure, injectable `core.ts` with a thin `index.ts`; the same split is used in board-asset-cleanup and catalog-normalizer.
- **[V-H]** Its migration also enqueues `agent_tasks` (`00637_paperwork_upload_door.sql`).

### `project-review-media`
- **[V-H]** Two actions (`index.ts:38-142`):
  - `prepare`: register a working-bucket image as `board_reference` → authorize → copy the bytes into the `project-review-media` bucket at `<projectId>/prepared/<kind>/<sha>.<ext>` → re-download and verify the hash → RPC `prepare_project_review_media_asset`.
  - `resolve`: return 300 s signed URLs for an edition.
- **[V-H]** The "derivative" is a byte-identical copy, not a resize. The checksum equals the source checksum (`lib.ts:~523-530`, `prepareReviewMedia` around `lib.ts:308-384`). Width and height come from header parsing only (`lib.ts:~409-490`).
- **[V-H]** Limits: 10 MiB per source, 50 media per edition, 50 MiB total (`lib.ts:1-4`).
- **[V-H]** Called from designer-portal at `apps/designer-portal/src/lib/mood-board-assets/project-review-media.ts:22-37`.

### Mood-board upload (client side)
- **[V-H]** The browser decodes and re-encodes each image: display max edge 2400 at quality 0.9, thumbnail 400 at 0.82 (`image-preparation.ts:1-5`).
- **[V-H]** Upload targets:
  - proposal boards: bucket `proposal-mood-boards` at `{owner}/boards/{board}/{assetId}.ext` plus `-thumb`;
  - project boards: bucket `project-ffe-working`, then `prepareProjectReviewMedia` (`upload-board-assets.ts:9`, `98-163`; `components/mood-board/board-add-rail.tsx:219-297`).
- **[V-H]** If a batch fails, all of its uploads are cleaned up best-effort, and the server-side GC ledger is the backstop (`upload-board-assets.ts:88-96`, `216-232`).
- **[V-H]** A board item created from an image upload has `productId: null` and `captureId: null` (`board-add-rail.tsx:278-281`).

### Board → selection → ordering
- **[V-H]** `promote_board_reference_to_selection(board_item_id, request)` calls `place_product_in_project_v2` with `productId` taken from the request or from the item. It then writes `proposal_board_items.project_ffe_item_id` and `product_id` back onto the item (`00435_ffe_ga_rpc_boundaries.sql:460-492`).
- **[V-H]** UI: hook `usePromoteBoardReferenceToSelection` (`packages/supabase/src/hooks/use-project-ffe-ga.ts:196`). It is used by:
  - `board-promote-all-panel.tsx:44-105` (sequential bulk promote, key `promote:<itemId>`);
  - `board-room-inspector.tsx:202`;
  - `board-approved-pins-panel.tsx:90`.
- **[I-M]** After promotion, items flow into the existing purchase-order path (`create_purchase_order`, `00435:878`). I did not trace the PO path itself.

### `board-asset-cleanup`
- **[V-H]** A two-pass Storage garbage collector for `proposal-mood-boards`:
  - an object is eligible for deletion only after a 14-day grace period;
  - the scheduled run is dry-run only;
  - deletion needs both `dry_run:false` and the env var `BOARD_ASSET_CLEANUP_DESTRUCTIVE_ENABLED=true` (`README.md`, `index.ts:1-11`).
- **[V-H]** It only scans `proposal-mood-boards`. **[I-M]** Objects a deck import leaves in `project-ffe-working` would have no GC.

---

## 3. Async, job and queue infrastructure

### `invoke_edge_function`
- **[V-H]** pg_net `http_post` to `/functions/v1/<fn>` with a service-role Bearer and `timeout_milliseconds := 60000` (`00258_edge_settings_vault.sql:51-84`; earlier versions `00079`, `00081`).
- **[V-H]** This 60 s window is the effective budget for cron-driven work. Workers size their batches to fit it (`aesthete-embed-worker/lib.ts:36`, `aesthete-dna-draft/lib.ts:29`, `aesthete-dna-draft/claude.ts:24`).

### `job_runs`
- **[V-H]** Columns: `{id, job_name, status running|succeeded|failed|skipped, started_at, finished_at, detail jsonb, error, cost_usd}`. Admin-only SELECT (`00300_queue_groom.sql:41-75`).
- **[V-H]** Canonical dispatch shape: `dispatch_board_asset_gc()` inserts a `running` row → `invoke_edge_function(fn, {job_run_id})` → the function finishes the row via `finish_board_asset_gc_run`. "Enqueue success is not job success" (`00410_board_asset_maintenance.sql:217-280`).
- **[V-H]** Also used by `derive-scan-photo-media`, `cowork-intake-bridge`, `catalog-normalizer` and `dispatch-scan-modal`.

### `agent_tasks` (00297)
- **[V-H]** Status flow: `queued → running → done | awaiting_review → approved/rejected`.
- **[V-H]** Mechanics:
  - claim uses `FOR UPDATE SKIP LOCKED`;
  - backoff 1m/5m/25m, parked at `max_attempts` (5);
  - `idempotency_key UNIQUE`; `review_state`, `confidence`, `artifacts` columns;
  - writes go through SECURITY DEFINER RPCs only;
  - `assignee IN ('kody','leah')`; SELECT is admin-domain (`00297_agent_tasks_queue.sql:1-80`).
- **[V-H]** Current users:
  - `scan_pipeline.ingest|verify|splat|renders|refine`, dispatched to Modal by `dispatch-scan-modal` (`index.ts:1-27`);
  - `feed_sync` / `normalize_feed` (catalog-normalizer);
  - `fulfillment_intake`, `stripe_event`, `payment_discrepancy`, `intake_error`.
- **[I-M]** It is an admin/ops queue, not designer-facing: the assignee CHECK and RLS are admin-only. A designer-facing import would track progress in its own batch table, with `agent_tasks` at most as the worker queue, as `catalog-normalizer` does.
- **[V-H]** Shared helpers: `_shared/agent-queue.ts` (`claimAgentTasks`, `enqueueAgentTask`) and `_shared/agent-queue-lease.ts` (`completeAgentTaskIfOwned`, `createLeaseOwner`). Usage is in `catalog-normalizer/index.ts:18-23`.

### `aesthete_jobs` (00241)
- **[V-H]** A per-domain outbox with `dedupe_key UNIQUE` and a claim RPC using `SKIP LOCKED`.
- **[V-H]** Drained by pg_cron every minute. A janitor requeues jobs stuck in `running` for more than 15 min (`00241_aesthete_jobs.sql:35-49`, `256-282`; `00250:83`).

### Billing-guard idiom for container-backed workers
- **[V-H]** Order: (1) cheap check that eligible rows exist; (2) probe `/healthz`; (3) claim. If the worker is down, rows are skipped without burning attempts.
- **[V-H]** Seen in `aesthete-embed-worker/index.ts:22-34`, `derive-scan-photo-media/index.ts:33-43`, `convert-room-scan-glb`, `site-request-media-maintenance`, `dispatch-scan-modal`.

### Capture enrichment (Phase 3)
- **[V-H]** Transactional outbox `capture_enrichment_outbox` plus run ledger `capture_enrichment_runs`, keyed by `(target_type, target_id, content_revision)`. AI output is a suggestion that may only prefill NULL fields (`00514_capture_enrichment_ledger.sql:1-30`; RPCs in `00515`).
- **[V-H]** The Cloudflare consumer `infra/capture-enrichment-worker/` is only an `OPERATIONS.md` skeleton, with no code (`OPERATIONS.md:1-8`).

---

## 4. Media service, R2 storage and derivatives

### `services/media` (NestJS)
- **[V-H]** Storage is S3-compatible R2 (MinIO in dev). Env: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `STORAGE_PROVIDER` (`modules/storage/oci-storage.service.ts:6`, `53-75`).
- **[V-H]** Upload API:
  - `POST v1/media/upload` returns an intent and a presigned URL with a 15-min TTL, and accepts an `idempotency-key` header;
  - `POST v1/media/upload/:sessionId/confirm` (`modules/upload/upload.controller.ts:28-73`).
- **[V-H]** The document MIME list covers pdf, xls/xlsx and doc/docx, but **not pptx**. Size caps: image 50 MB, document 100 MB, 3D 500 MB (`upload.service.ts:39-49`).
- **[V-H]** Jobs: BullMQ in-process workers are dead code. `IMAGE_PROCESS`, `IMAGE_TRANSFORM` and `METADATA_EXTRACT` go to `infra/media-worker`. Bulk ops throw `NotImplementedException` (`modules/jobs/bulk-operations.processor.ts:1-37`, `job-queue.service.ts:~77-95`).
- **[V-H]** `infra/media-worker`: a Cloudflare Queue (`media-jobs`, batch 10, 3 retries, DLQ) plus a Sharp container (standard-2, max 5 instances). Renditions are webp/avif/jpeg at 256–2048, plus metadata, blurhash and dominant colour. The Worker owns all R2 I/O (`infra/media-worker/README.md:1-30`, `wrangler.jsonc:8-30`).
- **[V-H]** Media `search` and `ai` endpoints (`similarity`, `ai/detect-products`) are **simulated**:
  - the "embedding" is a perceptual hash folded into 512 dimensions (`modules/search/media-search.service.ts:314-331`);
  - the vision API returns hard-coded tags (`ai-features.service.ts:335-354`).
  - **Do not reuse these for a photo match.**

### `infra/edge-api-worker`
- **[V-H]** A second R2 upload interface, `/v1/media/uploads` plus `/confirm` (HEAD R2, compare size and checksum, mark `stored`), currently piloted for scan originals only (`src/media-uploads.ts:1-40`; `00498`, `00499`).
- **[V-H]** Registry-keyed object keys. Every negative is 404, except a byte mismatch on confirm, which is 409.

---

## 5. Building blocks for link extraction and photo matching

### `capture-from-url`
- **[V-H]** Fetches a product page server-side and extracts `{name, brand, description, priceRetailCents, images[], sourceUrl}`. It reads OG tags first, then JSON-LD Product (`extract.ts:1-28`, `235-239`, `312`).
- **[V-H]** SSRF guards: DNS-pinned transport, 5 s timeout, 2 MB response cap, max 3 redirects (`ssrf.ts:38-41`).
- **[V-H]** Quota via `consume_board_unfurl_quota`: **10 per 10 min and 100 per day per user** (`00511_public_sd_hardening.sql:1758`, `1771`; called at `capture-from-url/index.ts:196-197`).
  - **[I-H]** A deck with more than 10 links would be throttled if each link went through this function as-is. A bulk import needs a separate quota path or batching.
- **[V-H]** Client callers: `hooks/use-mood-board-url-unfurl.ts:38-40`, `product-picker-modal.tsx:882` (`useCaptureProduct` → `packages/supabase/src/mutations/capture-product.ts:68`), and `piece-room.tsx`.

### `aesthete-inference` (Python, FastAPI, ONNX int8)
- **[V-H]** Endpoints: `POST /embed/image {inputs:[{id,url}]}` and `/embed/text`.
  - Model: nomic-embed-vision/text-v1.5, **768-d aligned space**, L2-normalized vectors.
  - Max 16 inputs per request; 8 concurrent requests, then 429 with `Retry-After`.
  - Bearer auth via `INFERENCE_TOKEN`.
  - Also provides `/convert/heic-to-jpeg` and `/convert/usdz-to-glb` (`README.md:1-50`, `app/main.py:175-392`).
- **[V-H]** It takes images **by URL**. **[I-H]** Images pulled from a pptx would need to be stored first and passed as signed URLs, as `derive-scan-photo-media` does.

### Product vectors
- **[V-H]** Columns:
  - `products.embedding` (vector 768, text);
  - `products.aesthete_vector` (vector 768, fused = `normalize(0.65·mean(≤3 product images) + 0.35·caption)`) (`aesthete-embed-worker/index.ts:7-13`, `lib.ts:497-504`; `00239_aesthete_space.sql:27-28`).
- **[V-H]** The HNSW/ivfflat index on `aesthete_vector` is **partial**, covering the published catalog layer only; exact scan is the stated fallback at ≤50k products (`00239:20`, `188-196`).
- **[V-H]** Existing similarity RPCs: `find_similar_products`, `search_products_semantic` and others (`00008_similarity_functions.sql:10-160`); `get_aesthete_matches` (`00244:778`).
- **[I-M]** No stored vector is image-only. A photo query would be compared against a fused vector, which also carries the caption. A dedicated image-only vector column would likely improve exact-match precision.

### `catalog-normalizer`
- **[V-H]** Closest existing "match extracted rows to products" logic:
  - exact `vendor_sku` match first;
  - otherwise embedding cosine > 0.92 → `update` with a field diff;
  - otherwise `create`;
  - row confidence = min of field confidences;
  - status `awaiting_review`, with an admin commit route (`core.ts:24-30`, `276-281`; `00306_catalog_normalizer_staging.sql:15-46`).
- **[V-H]** Inputs are CSV or JSON only (`feed-parse.ts:7-20`). It runs nightly via cron, claims `agent_tasks`, and skips gracefully if inference is unconfigured (`index.ts:1-23`).

### Library spreadsheet import (designer-portal)
- **[V-H]** SheetJS `xlsx@^0.18.5` is lazy-loaded in the browser (`apps/designer-portal/package.json:83`; `components/document/rooms/library/import-sheet.tsx:100-102`).
- **[V-H]** Flow: client parse → column mapping → `POST /api/catalog/import`, max 5,000 rows. Products land as `status:'draft'`, `layer:'personal'`, and the teaching trigger fires (`import-parse.ts:1-60`; `app/api/catalog/import/route.ts:7-10`, `30`, `100-116`).
- **[V-H]** Formula-sigil sanitizing at `import-parse.ts:~57-60`.

---

## 6. zip / OOXML / pptx / docx / xlsx parsing in the repo

Search excluded `node_modules` and build outputs.

- **[V-H]** No jszip, fflate, unzipper, yauzl, mammoth, officeparser, python-pptx or openpyxl anywhere.
- **[V-H]** `xlsx` (SheetJS) is used only in designer-portal: library import and billing export (`lib/document/studio-billing-export-download.ts:355-366`). **[I-M]** SheetJS has its own zip reader, but it only handles spreadsheets, not pptx.
- **[V-H]** Python `zipfile` appears only in `services/scan-pipeline` install guards and tests.
- **[V-H]** `pdfjs-dist` and `pdf-lib` are used in designer-portal (`lib/plans/pdf.ts:4`, `40-48`, `117`, `162`) and in `spec-book-render` and `_shared/spec-pdf` tests.
- **[V-H]** pptx is explicitly rejected in the cowork intake path (`supabase/functions/_tests/cowork-intake-delta.test.ts:46-49`; `cowork-intake-bridge.test.ts:188-191`).
- **[I-H]** Deno has `DecompressionStream`, which handles raw deflate, so a pptx could be unzipped in an edge function with fflate via esm.sh. The project has no precedent for this. Heavier work (rendering slides to images, EMF/WMF conversion) fits the container lane better: `aesthete-inference` (Python, already with pillow and pillow-heif) or Modal (`services/scan-pipeline`).

---

## 7. Edge-function limits the codebase works around

| Limit / workaround | Evidence | Status |
|---|---|---|
| 60 s pg_net window for cron → edge calls; batches sized to fit | `00258:78`; `aesthete-embed-worker/lib.ts:36`; `aesthete-dna-draft/lib.ts:29,910`; `00241:49` | [V-H] |
| Stuck-`running` janitor (15 min) for killed workers | `00250:83` | [V-H] |
| Modal's 150 s web cap; spawn POST bounded at 10 s; heavy work async on Modal | `dispatch-scan-modal/lib.ts:425`, `index.ts:~66-70` | [V-H] |
| Containers bill wall-clock, so cron workers check for work before waking the container | `aesthete-embed-worker/index.ts:22-34`; `derive-scan-photo-media/index.ts:38-43` | [V-H] |
| Inference batch ≤16; 429 backpressure | `aesthete-inference/README.md` | [V-H] |
| Base64 chunking to avoid call-stack blowup | `project-ffe-document-extract/lib.ts:483-488` | [V-H] |
| Image cap 10 MiB, sized so base64 (~13.3 MiB) fits under the Anthropic request ceiling | `CONTRACT-A-extractor.md:52-56` | [V-H] (doc) |
| 25 MiB PDF base64 → ~33 MiB, which likely exceeds Anthropic's ~32 MB request limit. Claude PDF input also has a page cap (~100). `max_tokens` 6000 flagged as unverified for v2 | `lib.ts:1`; `CONTRACT-A-extractor.md:313-314` | [I-M], not verified against current API docs |
| Synchronous extractor inside a browser request; a long PDF could exceed the platform's per-request limit. No `EdgeRuntime.waitUntil` is used anywhere | grep found 0 `waitUntil` hits | [V-H] absence; [I-M] risk |
| Whole-file `arrayBuffer()` in memory (edge memory ~256 MB) | `index.ts:50,78` | [V-H] code; [I-M] limit |
| SSRF fetch caps: 5 s / 2 MB / 3 redirects | `capture-from-url/ssrf.ts:38-41` | [V-H] |

---

## 8. Inferred implications for a PowerPoint → mood-board import

These are suggestions drawn from the patterns above, not existing code.

1. **Storage** [I-H]
   - Option A: widen `project-ffe-working` to the pptx MIME type `application/vnd.openxmlformats-officedocument.presentationml.presentation`. That needs a migration on `00433`, `00455`'s content-type CHECK, and `sniffSourceContentType` (zip magic `PK\x03\x04` plus a `[Content_Types].xml` check).
   - Option B: use a new bucket with its own RLS.
   - Either way, keep the content-addressed `<projectId>/source-documents/<sha>.pptx` path, so idempotency comes free from `UNIQUE(project_id, file_hash)`.
2. **Async** [I-H] Unlike the PDF extractor, a deck import must be async: unzip, then N slides, M images, K links, embeddings and LLM calls. Use the house shape:
   - a batch table (like `project_ffe_import_batches`) as the designer-visible status;
   - an outbox or `agent_tasks` row;
   - a pg_cron drain via `invoke_edge_function` with a `job_runs` row per run;
   - each step sized for 60 s, or handed to a container.
3. **Deterministic first pass** [I-H]
   - Read `ppt/slides/slideN.xml` for text runs and `a:hlinkClick` relationships.
   - Read `ppt/slides/_rels/*.rels` for external hyperlink targets and `ppt/media/*` for images.
   - This runs in Deno with fflate, which is new to the repo. Then optionally run Claude over each slide (text plus rendered image) using the existing forced-tool, validated-schema pattern.
4. **Links** [I-H] Reuse `extract.ts` and `ssrf.ts` from `capture-from-url`. The per-user quota (10/10 min) blocks bulk use, so this needs a server-side batch path with its own budget.
5. **Photo match** [I-H]
   - Embed the extracted images with `/embed/image` (the URL must be signed).
   - Run kNN against `products.aesthete_vector`, or add an image-only vector.
   - Gate with a threshold like catalog-normalizer's (0.92 is its text threshold; an image threshold needs calibrating).
   - Write candidates with confidence to the staged rows (`normalized_row.productId` plus alternates) for human review.
   - Do not use the media service's `/similarity` endpoint (fake).
6. **Commit** [I-H]
   - Either `commit_project_ffe_import`, which puts items straight onto the project FF&E list,
   - or create `proposal_board_items` with `product_id` set, then reuse `promote_board_reference_to_selection` for the board → selection → PO path.
   - An unmatched item can land as a personal-layer draft product, like `/api/catalog/import` or `captureProduct`.
7. **Review UI** [V-H] Nothing exists to copy for the import itself. The nearest are `board-promote-all-panel.tsx`, which does sequential per-item promotion with failure reporting, and the library `import-sheet.tsx` mapping UI.
8. **GC** [I-M] Add `project-ffe-working` (or the new bucket) deck and image objects to a cleanup ledger. `board-asset-cleanup` currently covers only `proposal-mood-boards`.