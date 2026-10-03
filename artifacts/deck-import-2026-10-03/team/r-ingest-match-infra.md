# Inventory: reusable capabilities for a PPTX → products → links → photo-match pipeline

Legend: **V** = verified in code. **I** = inferred. Confidence: H / M / L.

## 0. Bottom line

- **Nothing in the repo opens a .pptx today.** A search for `pptx|powerpoint|jszip|officeparser|presentationml|soffice|libreoffice|gotenberg` in apps/packages/services/supabase/infra found only a test fixture filename (`supabase/functions/_tests/cowork-intake-bridge.test.ts:191`, `'pitch.pptx'`) and CSV formula-injection comments. Unzipping the deck, reading slides, and pulling images and hyperlinks out of it is net-new work. (V, H)
- **Most of the parts after that already exist:**
  - URL → product scraping (`capture-from-url`)
  - writing a captured product idempotently (`commit_proposal_capture`)
  - turning a domain into a vendor (`resolveVendor`)
  - an image-embedding endpoint (nomic-embed-vision-v1.5, 768-d)
  - product vectors that are mostly image-derived (`aesthete_vector`), with a kNN RPC over them
  - promoting a board pin into a project FF&E selection and the ordering path (`promote_board_reference_to_selection`)
  - an LLM tool-use document extractor with a staging/review pattern (`project-ffe-document-extract`)
- **Production is the main risk.** The consolidated PRD says the inference worker is not deployed, so product vectors would be empty in prod. The infra README says it is deployed. These two docs contradict each other (details in §5.1).

---

## 1. `supabase/functions/capture-from-url` (URL → product)

| Finding | Evidence | V/I | Conf |
|---|---|---|---|
| Modes: `capture` (fetch the given url) and `refresh` (re-fetch a product's stored `source_url`, gated on the 00152 visibility rules, not-found and not-owned both return 404) | `index.ts:8-13, 117-136, 168-191` | V | H |
| Auth: gateway JWT check plus an in-code `auth.getUser` on the caller | `index.ts:57-66, 158-159` | V | H |
| Per-user quota RPC `consume_board_unfurl_quota`: 10 per 10 minutes and 100 per day | `index.ts:196-213`; `supabase/migrations/00511_public_sd_hardening.sql:1761-1775` (also defined in 00410) | V | H |
| SSRF guard: up to 3 redirects, each hop re-validated; 5 s timeout; 2 MB cap; only `text/html` accepted | `ssrf.ts:38-40, 906-987, 936` | V | H |
| Extractor is pure regex (no DOM). Order: Open Graph (`og:title/image/description`, `product:price:amount`, `product:brand`) → JSON-LD `@type Product` (including `@graph`, `offers.price/lowPrice/priceSpecification`, `image[]`) → `<title>`/meta fallback. Price is converted to cents (US format). Images are made absolute and deduped. | `extract.ts:1-17, 111-122, 198-221, 233-241, 312-335` | V | H |
| Output shape `ExtractedProduct {name, brand, description, priceRetailCents, images[], sourceUrl}` mirrors `@patina/utils` | `extract.ts:22-29` | V | H |
| **No vendor-specific scrapers.** It is generic OG/JSON-LD only. It returns no vendor id, SKU, dimensions or materials. | `extract.ts` whole file | V | H |
| Will fail or return thin results on JS-rendered or bot-protected sites (no headless browser) | `ssrf.ts` uses a raw fetch with a fixed UA (`:41`, `:931`) | I | M |
| Current callers: the mood-board paste/drop unfurl (`apps/designer-portal/src/hooks/use-mood-board-url-unfurl.ts:37-41`), `product-picker-modal.tsx`, `piece-room.tsx` | grep | V | H |

**Reuse:** call it as-is for each hyperlink found in a slide. The quota will block bulk decks: a 40-link deck exceeds the 10-per-10-minute limit. A batch import needs a service-side path that bypasses or raises the quota (I, H). `extractProduct()` is pure and could be imported by a new function (V, H).

## 2. Chrome extension clipping (`apps/extension`)

| Finding | Evidence | V/I | Conf |
|---|---|---|---|
| Plasmo MV3. Extraction is DOM-bound and runs in the page via `document.querySelectorAll` (price, images, materials, dimensions, color-finish, metadata, manufacturer, retailer, vendor) | `apps/extension/CLAUDE.md`; `src/lib/extraction/index.ts:28-63, 266, 332`; `vendor.ts:945` | V | H |
| `RETAILER_MAP`: about 60 retailer domains mapped to names (RH, CB2, West Elm, Arhaus, Wayfair…) | `src/lib/extraction/retailer.ts:10-…` | V | H |
| Pure text parsers are reusable outside the DOM: `textToFields()` (price, WxHxD, labeled dimensions, materials from free text) | `src/lib/text-to-fields.ts:1-20` | V | H |
| Duplicate detection is client-side Sørensen–Dice on the name (×0.7) plus a vendor bonus (+0.2) plus price proximity | `src/lib/product-similarity.ts:1-40`; `vendor-similarity.ts` | V | H |
| Context menus "Capture this image" (`srcUrl`) and "Capture selection as product" | `src/background.ts:110-136` | V | H |
| Save path goes through `commit_proposal_capture` (see §6) | 00516 comment `:…COMMENT ON FUNCTION` | V | H |

**Reuse:** `textToFields` and the price/dimension/material string parsers apply to slide text boxes, but they live in the extension package and are not Deno-importable today, so they must be lifted into a shared package or ported (I, M). The DOM extractors cannot be used server-side (V, H). `RETAILER_MAP` is useful for hyperlink domain → retailer name (V, H).

## 3. `supabase/functions/catalog-normalizer` (vendor feed ingest)

| Finding | Evidence | V/I | Conf |
|---|---|---|---|
| Nightly pg_cron job. It claims `normalize_feed` agent_tasks, downloads a CSV/JSON feed from the `catalog-feeds` bucket, and hashes each row so re-runs are idempotent | `index.ts:1-14, 28-29`; `core.ts:7-37, 205-225`; `feed-parse.ts:15-140` | V | H |
| Deterministic normalizing of currency, dimensions, material/finish vocabulary, freight class and lead time. Images come from a `image/images/image url` column split on `|` or `,` | `normalize-row.ts:62-253, 246, 284-301` | V | H |
| Category classification: the row's **text** embedding is compared by argmax cosine against a 15-leaf taxonomy whose labels are embedded once per batch | `normalize-row.ts:336-379`; `core.ts:185` | V | H |
| Dedupe: exact `vendor_sku` match first, otherwise text-embedding cosine > 0.92 against the vendor's existing products. These vectors are computed in memory, not read from `products.embedding`. | `core.ts:24-28, 236-243` | V | H |
| Confidence gate: auto-commit at ≥ 0.9, otherwise `review_queued` plus a `catalog_review` agent_task; one `catalog_commit` task per batch | `core.ts:29-37` | V | H |
| Staging tables are in 00306 and 00307 (cron). The admin portal has `api/admin/catalog/feed-batches` and `commit-batch` routes. | grep | V | H |
| Admin-only. Scoped to a vendor and the catalog layer, not to a designer or board. | `index.ts:6-9`; routes in admin-portal | V/I | M |

**Reuse:** the batch → staged items → confidence → review queue → commit pattern, `classifyCategory`, `cosineSimilarity`, `buildFieldDiff`, and the parse/normalize functions can be copied directly (V, H). It never embeds or matches images (V, H).

## 4. Three-layer catalog and product/vendor tables

| Finding | Evidence | V/I | Conf |
|---|---|---|---|
| `products.layer ∈ {personal, studio, catalog}`, enforced by RLS. Personal requires `owner_user_id`. Studio requires `vendor_contact`, `lead_time_weeks`, `payment_terms`, `category` and `usage_notes`. Catalog requires `patina_managed`. | `00152_three_layer_catalog.sql:36-106` | V | H |
| Linking columns: `catalog_equivalent_id`, `merged_into_id`, `promoted_from_id`, `deleted_at`, `style_tags`, `material_tags` | `00152:36-57, 112` | V | H |
| `products.images TEXT[]`; `products.source_url` (from 00001) | `00001_initial_schema.sql:38`; used in `capture-from-url/index.ts:176` | V | H |
| Vendor lookup index `idx_vendors_website_lower` is non-unique; `vendors.nomination_status` | `00152:150-191` | V | H |
| `resolveVendor()`: website ilike-by-domain → name → create a stub vendor | `packages/supabase/src/lib/vendors.ts:4-140` | V | H |
| `captureProduct()` mutation inserts into `products` and `project_products` | `packages/supabase/src/mutations/capture-product.ts:68-122` | V | H |
| A new pipeline should write products as **personal** (or studio) drafts. The 00152 header trigger defaults legacy inserts to catalog. | `00152:150-160` | V/I | M |

## 5. Aesthete embeddings: which model, which tables, what is embedded

### 5.1 Model and service

| Finding | Evidence | V/I | Conf |
|---|---|---|---|
| **Model is nomic-embed-text-v1.5 plus nomic-embed-vision-v1.5, 768-d, in the same aligned space, int8 ONNX on CPU.** It is not CLIP and not SigLIP (though vision preprocessing uses a CLIPImageProcessor config). | `services/aesthete-inference/README.md:3-5, 61-91`; `models/vision/*`, `models/text/*` | V | H |
| `model_version = nomic-v1.5-onnx-int8-r1`; pinned HF revisions are recorded | `README.md:69-78` | V | H |
| Vision pooling: CLS token → L2. Text: mean-pool → layer_norm → L2. Task prefixes (`search_document:` / `search_query:`) are applied by the worker. | `README.md:47-59, 81-88` | V | H |
| Endpoints: `POST /embed/text`, `POST /embed/image`, `POST /fit/taste`, `POST /fit/taste/backtest`, `POST /convert/usdz-to-glb`, `POST /convert/heic`, `GET /healthz` | `app/main.py:162-392` | V | H |
| **`/embed/image` takes URLs only** (`ImageInput.url: str`). No bytes or base64 input. Fetches go through an SSRF-safe fetcher that rejects private IPs. Limits: 15 MB per image, 64 MB per batch, 4 concurrent fetches, at most 16 inputs per request, 8 concurrent requests (the 9th gets 429). | `app/schemas.py:20-25`; `app/safe_fetch.py:53-98`; `README.md:38-45, 150-160` | V | H |
| Latency: about 66 ms per image on an M-series Mac; planning figure 200–350 ms per image on a 2-vCPU container | `README.md:162-176` | V | H |
| Deployment: Cloudflare Worker plus Container (`standard-3`, `max_instances: 3`, singleton routing) | `infra/inference-worker/wrangler.jsonc:8-15`; `infra/inference-worker/README.md:1-15` | V | H |
| **The two docs conflict on prod status.** The infra README says "Deployed". The consolidated PRD says "worker not deployed, so pipeline is dark" and that `aesthete-ask` is not deployed either. | `infra/inference-worker/README.md:4-5` vs `docs/prds/consolidated/05-aesthete-engine.md:12, 16, 46` | V (docs only; prod not checked) | M |
| Shared Deno client: `createInferenceClient`, `embedText`, `embedImage`, `fuseVectors`, `l2Normalize`, `meanVector`, `toPgVector`, `chunk`, `INFERENCE_MAX_BATCH = 16` | `supabase/functions/_shared/aesthete.ts:123-348` | V | H |

### 5.2 Vector columns

| Column | Content | Producer | Evidence | V/I | Conf |
|---|---|---|---|---|---|
| `products.embedding vector(768)` | **text only**: `name ‖ description ‖ materials`, kind=document | `aesthete-embed-worker` embed_text | `00007:14`; `aesthete-embed-worker/lib.ts:13-17, 80-87, ~350 (.update embedding)` | V | H |
| `products.aesthete_vector vector(768)` | **fused**: `normalize(0.65·mean(≤3 image vecs) + 0.35·style-caption vec)`. Products with no images fall back to caption only. Partial image failures fuse whatever images succeeded. | embed_fused | `lib.ts:18-23, 231, 238-264`; `00239_aesthete_space.sql:12-28, 67, 153-161` | V | H |
| `designer_portfolio_items.embedding` | **pure image** vector | portfolio_embed | `lib.ts:24-31, ~372-395`; 00249 | V | H |
| `styles.embedding vector(768)` | style text (legacy) | — | `00007:15` | V | M |
| **No pure-image column exists for products.** | — | — | grep of all `vector(` migrations | V | H |

- `products.style_caption`, `aesthete_vector_at` and `aesthete_model_version` are stored alongside the fused vector (`00239:153-161`). V, H.
- The 00007 header still says "Ollama nomic-embed-text". The column is now written by aesthete-inference nomic v1.5 (the PRD at `05-aesthete-engine.md:62` agrees). Any older vectors from Ollama are a different model; the inference README warns that byte-identical vectors must not be assumed. (I, M)

### 5.3 Are product images embedded today?

- **Yes, in code.** Trigger `trg_products_enqueue_aesthete_jobs` fires `AFTER INSERT OR UPDATE OF images, description` on products in **every layer**, enqueuing embed_text, embed_fused and dna_draft (`00241_aesthete_jobs.sql:175-198`). Only the one-time backfill is limited to catalog + published (`00241:236-241`). V, H.
- Up to the first 3 URLs in `products.images` are embedded (`lib.ts:154, 231`). V, H.
- **In prod: probably not**, per the PRD's "pipeline is dark" (`05-aesthete-engine.md:12`). I, M.

### 5.4 Similarity RPCs (latest definition per function)

| RPC | Column | Scope / notes | Evidence | V/I | Conf |
|---|---|---|---|---|---|
| `find_similar_products(vector(768), threshold 0.7, count, exclude)` | `embedding` (text) | SECURITY DEFINER, ignores layer. Its latest definition is still 00008 (no later redefinition found) | `00008:11-45` | V | H |
| `find_products_similar_to(product_id, count)` | `embedding` | Redefined in 00484: catalog + published only, at most 50 rows, requires `auth.uid()` | `00484:826-860` | V | H |
| `search_products_semantic(text, vector, count)` | `embedding` | hybrid 0.7 semantic + 0.3 `ts_rank` | `00008:~90-150` | V | H |
| **`aesthete_ask_knn(p_embedding vector(768), p_filters jsonb)`** | **`aesthete_vector`** | SECURITY INVOKER, so RLS applies across all 3 layers. Excludes deleted and merged products. Filters: `category`, `layer`, `limit` (≤ 200). Returns `(product_id, cosine rank, 'vector')` | `00247:32-59` | V | H |
| `find_taught_alternatives(product_id, n)` | `embedding` (text), cosine > 0.2 | Feeds the board **Suggestions rail** | `00271:39-82`; `docs/prds/MoodBoard/04-technical-foundations.md:43` | V | H |
| `aesthete_search` (FTS seam) | — | 00244 | grep | V | M |

- Indexes: `idx_products_aesthete_hnsw` (HNSW, m=16, ef_construction=64), **partial on `layer='catalog' AND status='published'`**, with an ivfflat fallback (`00239:188-203`). Personal and studio layers get exact scans. `idx_products_embedding` is ivfflat with lists=100 (`00007:21-22`). V, H.
- `aesthete-ask` embeds the query **text** (kind=query) with a 1.5 s budget, then RRF-blends `aesthete_ask_knn` with FTS (`supabase/functions/aesthete-ask/index.ts:1-30`). V, H.

### 5.5 Feasibility of photo matching with what exists

- **An image vector can be queried directly against `aesthete_vector`.** Text and vision towers share one space, and `aesthete_vector` is about 65% image-derived. Calling `/embed/image` on a cropped slide image and passing the result to `aesthete_ask_knn(vec, {category, limit})` works without any new SQL. (I based on V parts, M)
- Precision for "find this exact SKU" will be weaker than with a pure-image index:
  - the 35% caption share pulls results toward the right style but the wrong SKU
  - nomic-vision at 224px center-crop does semantic retrieval, not instance matching

  Expect a "close candidates" list rather than exact SKU hits. A pure-image product column such as `products.image_vector` (mean of image vectors, image-only) would be the low-cost improvement: the embed-worker already computes those image vectors and then discards them after fusing (`lib.ts:161-245`). (I, M-H)
- Inputs must be URLs. Images pulled from a PPTX must first be uploaded to a bucket and passed as signed URLs. The portfolio path already does this (`lib.ts:184-197`, `PORTFOLIO_SIGNED_URL_TTL_SEC=600`). (V, H)
- Nothing detects or crops multiple products inside one slide image (see §7). Collage slides would embed as a single scene. (V/I, H)

## 6. Mood board → selection → ordering seams

| Finding | Evidence | V/I | Conf |
|---|---|---|---|
| `proposal_board_items.type ∈ {product, capture, image, palette, note, room_scan}`; `product_id`/`capture_id`/`palette_id` FKs; `image_url`; `data` JSONB snapshot `{name, price_cents, vendor_name, image_url, section_id, source_url, original_image_url}` | `00179_proposal_boards.sql:51-65`; `04-technical-foundations.md:100-125` | V | H |
| Boards are owned by a proposal or a project (exactly one, `chk_proposal_boards_owner`); `sections` JSONB | `04-technical-foundations.md:89-99` | V | H |
| Board image uploads go to the public-read `proposal-mood-boards` bucket | `04-technical-foundations.md:164`; `board-add-rail.tsx:219-283` (`uploadFilesAsBoardItems`) | V | H |
| `captureToBoardItem()` turns a capture into a board pin | `board-add-rail.tsx:158-185` | V | H |
| **`promote_board_reference_to_selection(p_board_item_id, p_request jsonb)`** accepts a `productId` override and calls `place_product_in_project_v2`, which sets `project_ffe_item_id` and back-fills `product_id`. This lets a matched image pin become an orderable FF&E line. | `00435_ffe_ga_rpc_boundaries.sql:460-490` | V | H |
| Bulk "promote all" panel | `apps/designer-portal/src/components/mood-board/board-promote-all-panel.tsx:1-45` | V | H |
| `commit_proposal_capture(p_client_capture_id, p_payload, p_style_ids, p_proposal_id, p_scope_room_id, p_ffe_category_slug)` does an idempotent insert of the products, product_styles and proposal_captures rows, plus the capture_enrichment enqueue | `00516_capture_producer_idempotency.sql:1-40, 539-652` | V | H |
| Background removal (remove.bg) is available for board images and produces cutouts | `services/media/src/modules/background-removal/remove-bg.adapter.ts:12`; `board-image-inspector-actions.tsx` | V | H |

## 7. Existing reverse-image / visual-search code

| Finding | Evidence | V/I | Conf |
|---|---|---|---|
| Media service `POST /search/similarity` exists, but the "embedding" is a **perceptual hash folded into 512 dimensions**, compared by in-memory cosine across every `mediaAsset` row via Prisma. It covers media assets, not products. | `services/media/src/modules/search/media-search.service.ts:5, 33-58, 316-336, 344-360`; `search.controller.ts:49-58` | V | H |
| `POST /search/ai/detect-products/:assetId` is a **stub** with hard-coded sofa/cushion boxes; `callVisionAPI` is also simulated | `ai-features.service.ts:200-240, 337-372` | V | H |
| `SearchModule` is registered in the media app | `services/media/src/app.module.ts:10, 53` | V | H |
| Designer-portal similar-products route uses `find_products_similar_to` (text vectors) | `apps/designer-portal/src/app/api/search/search/similar/route.ts`; PRD `05:70` | V | M |
| **No real reverse-image or product-photo search exists anywhere.** | grep | V | H |

Do not reuse the media-service similarity code: it is pHash-based, scans every row with no index, and works on media assets rather than products (I, H).

## 8. Document / LLM extraction that can be adapted

| Finding | Evidence | V/I | Conf |
|---|---|---|---|
| `project-ffe-document-extract` sends a PDF (≤ 25 MB) or image (≤ 10 MB) to `claude-sonnet-5` with a forced tool `stage_project_ffe_rows` that returns rows with maker, SKU, unit price and quantity, plus provenance (page, sourceKind, confidence) and per-field `state:"unconfirmed"`. Results are staged through the `stage_project_ffe_document_extraction` RPC (designer confirms). Includes sha256 integrity checks and studio-RLS reads. | `supabase/functions/project-ffe-document-extract/lib.ts:1-20, 144-189, 301-360`; `index.ts:75-117` | V | H |
| Content types are limited to `application/pdf`, jpeg, png and webp; magic-byte sniffing; path regex requires `.pdf/.jpg/.png/.webp` | `lib.ts:10-11, 157-165` | V | H |
| **No PPTX → PDF conversion exists.** A deck could reuse this extractor if converted to PDF, or if its slides are rasterized to images. | grep (no soffice etc.) | V/I | H |
| `capture_enrichment_runs` ledger and outbox (00514/00515/00664) plus `CaptureEnrichmentMessageV1`. The planned Workers AI chain (moondream for image facts, caption and OCR) is documented, but `infra/capture-enrichment-worker/` contains only OPERATIONS.md, no code. | `00514:1-60`; `packages/types/src/capture-enrichment.ts`; `infra/capture-enrichment-worker/OPERATIONS.md:1-8`; `docs/engineering/patina-cloudflare-plan.md:181-189` | V | H |
| The plan says Workers AI does **not** write embeddings; nomic stays canonical | `patina-cloudflare-plan.md:189` | V | H |
| `aesthete-dna-draft` uses Claude Haiku, escalating to Sonnet, to write `product_dna_drafts` | PRD `05:62` | V (doc) | M |

## 9. Catalog size

- Local seeds: `supabase/seed/products.sql` has 12 rows. `seed/catalog/first-flight-catalog.sql` has 6 rows (fixture profile, generated by `scripts/first-flight/build-catalog.py`). `seed/vendors.sql` has about 122 vendor tuples. The release manifest `artifacts/ios-testflight-polish-2026-09-01/build/waves/w0/catalog-manifest.csv` contains only a header. (V, H)
- Prod catalog size cannot be determined from the repo. The design plans for "≤ 50k products exact-scan acceptable" (`00239:192`) and a "5k-product backfill ≈ 1.5–2 h" (`aesthete-inference/README.md:173`). So the catalog is likely small, in the hundreds to low thousands, which makes the photo-match hit rate against the Patina catalog low for arbitrary retailer products. Matching against the designer's personal and studio layers plus a URL-scrape fallback matters more. (I, M)

## 10. Reuse as-is vs. missing

**Reusable as-is (V, H unless noted)**
- `extractProduct()` and `fetchHtml()` SSRF guard (capture-from-url)
- `commit_proposal_capture` for idempotent product creation
- `resolveVendor()`
- `RETAILER_MAP`
- the `_shared/aesthete.ts` inference client
- `/embed/image` and `/embed/text`
- `aesthete_ask_knn` (photo vector → candidates, RLS-scoped, category filter)
- `find_taught_alternatives` (text alternates)
- the board item schema, including the `data.source_url` and `original_image_url` keys
- `uploadFilesAsBoardItems`
- `promote_board_reference_to_selection` with a `productId` override
- `place_product_in_project_v2`
- the catalog-normalizer staging → confidence → review → commit pattern and its helpers
- the `project-ffe-document-extract` Claude tool-use pattern (requires PDF or image input)
- the agent_tasks queue and lease helpers
- the remove.bg cutout

**Missing (V that it is absent, H)**
1. PPTX parsing: unzip, read `ppt/slides/slideN.xml` and `_rels` for hyperlinks (`a:hlinkClick` r:ids → rels Target) and `ppt/media/*`, then map pictures to slides with their position and size.
2. An upload path for extracted images to a bucket plus signed URLs for `/embed/image`, which takes URLs only.
3. A batch, service-side capture-from-url without the per-user quota of 10 per 10 minutes and 100 per day.
4. A pure-image product vector (or an image-only kNN). Today only the fused `aesthete_vector` exists.
5. Cropping or detecting multiple products in a collage slide. The media `detect-products` endpoint is a stub.
6. An import staging table, a review UI, and placement of imported items onto a board with layout derived from slide geometry.
7. An external reverse-image search fallback (for example a shopping/lens API) for products not in the Patina catalog.
8. Confirmation that the inference worker and embed cron are running in prod.

**Risks (I, M)**
- Product vectors may be empty in prod (§5.1 conflict).
- The fused vector's 35% caption share reduces SKU-level precision.
- The HNSW index covers catalog/published only, so personal and studio kNN use exact scans (fine at small scale).
- int8 batch-composition drift (cosine ≈ 0.9966) means exact-match thresholds near 1.0 would be fragile (`README.md:92-97`).