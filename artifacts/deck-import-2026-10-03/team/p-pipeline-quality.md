# PowerPoint to mood board import: pipeline and match-quality design

## What I checked in the repo myself

- **Latest migration is `00675_arrival_anchors.sql`.** New migrations start at 00676, and the number must be re-checked at merge.
- **`aesthete_ask_knn` is SECURITY INVOKER** (`/Users/kody/Code/patina-merged/supabase/migrations/00247_aesthete_ask_knn.sql:32-50`).
  - A cron worker running as service_role would bypass RLS, so it would see other studios' personal and studio products.
  - **The import cannot call it from the worker.** It needs a service-role-only DEFINER twin that applies the 00152 visibility rules explicitly for the importing user (`00152_three_layer_catalog.sql:275-296`).
- **`commit_proposal_capture` needs `auth.uid()`** (`00516_capture_producer_idempotency.sql:513-535`).
  - Product rows can only be created when the designer commits, under their own login. The worker never creates products.
- **`/embed/image` takes URLs only** (`services/aesthete-inference/app/schemas.py:20-25`).
- **The media service document MIME allowlist has no pptx entry** (`services/media/src/modules/upload/upload.service.ts:39-48`). The cap is 100 MB.
- **`agent_tasks.assignee` only allows `kody` or `leah`**, and reads are admin-only (`00297:46`). It is the wrong home for designer-visible progress. The import uses its own outbox modelled on `aesthete_jobs`, and uses `agent_tasks` only to escalate parked jobs.
- **`apply_board_room_state` deletes any item missing from the saved state** (00411, per the dossier). If the server wrote pins into a board the designer has open, the next autosave would delete them. **The import therefore materializes pins on the client**, through the room's own save path.

## Flow (designer's view)

1. On `/boards` or in the board create picker, the designer chooses "Bring in a deck". They pick a .pptx, .ppsx or .potx file. It uploads with progress.
2. Slides arrive progressively in an **import ledger**, laid out as the slides were.
3. Each extracted piece shows its source, in words:
   - **"Linked in your deck"**: from a hyperlink, or the URL is already in the library.
   - **"Likely match"**
   - **"Possible matches"**: up to 3.
   - **"No match yet"**
4. Pieces in the strong band are preselected. Everything else needs an explicit pick.
5. The designer may press "Search the web for the N unmatched pieces". This is metered and only runs when pressed.
6. "Bring into Patina" does three things:
   - creates products for the accepted links, through capture;
   - creates a **new board** with one section per slide;
   - lands accepted pieces as `product` pins and everything else as `image` pins that keep their provenance.
7. Ordering then follows the existing chain: Promote all, then triage to `selected`, then PO.

## Stages, where each runs, and what it writes

| # | Stage | Runs in | Input → output |
|---|---|---|---|
| S0 | create / confirm | New edge fn `deck-import` (user JWT) | Validates the owner (project or proposal) and studio membership. Creates the `board_import_jobs` row. Gets a media-service upload intent (R2, private, pptx MIME added). On confirm, checks size and sha256 via the media confirm call, sets status `queued`, and enqueues `parse`. It then pokes the worker once through `invoke_edge_function` so the designer doesn't wait up to a minute for cron. |
| S1 | parse | **aesthete-inference container**, new route `POST /deck/parse` (new module `app/deck.py`, using python-pptx, lxml and stdlib zipfile) | Takes a presigned R2 GET of the deck. Returns manifest JSON (see the parsing rules below). The worker stores the manifest in R2 and writes the slide, asset and placement rows. |
| S2 | derive | Container, `POST /deck/derive` | For each unique (media sha, srcRect) it writes three files to presigned R2 PUT URLs supplied by the worker: a display webp (≤2400 px edge, alpha kept), a 400 px thumbnail, and an embed copy (alpha flattened onto neutral grey, whitespace trimmed). It returns a 64-bit pHash per crop, plus `has_alpha` and border uniformity. |
| S3 | classify + associate | Edge worker `deck-import-worker`: deterministic first, Claude only on slides with low margin | Assigns each asset a role: `product`, `lifestyle`, `swatch`, `logo`, `decoration` or `background`. Binds text, links and fields to images. Extracts `{vendor, name, sku, price_minor, dims}` as **unconfirmed** values. |
| S4 | link resolve | Edge worker | Reads each unique normalized URL once per job. Uses `fetchHtml` and `extractProduct`, lifted into `_shared/product-page/` with a re-export shim left in `capture-from-url/`. Checks the URL against existing products first. Records `look_score`. |
| S5 | embed | Container `/embed/image` and `/embed/text` | Embeds the crops (presigned R2 GET, 600 s, batches of 16, backs off on 429), the page og:images for the look-check, and the attribute query text. |
| S6 | match T0–T3 | Edge worker plus DEFINER kNN RPCs | Writes `board_import_candidates` with source, raw score, band and evidence. |
| S7 | web visual T4 | Edge worker, only when the designer presses the button | Sends crops as base64 to Google Cloud Vision Web Detection. Retailer pages that come back go through S4 again. |
| S8 | decide | `deck-import` (user JWT) plus RPC `record_board_import_decisions` | Stores an append-only decision per asset. |
| S9 | commit products | RPC `commit_board_import_products(job, decisions)` (user JWT, DEFINER wrapper looping over `commit_proposal_capture`) | One capture per accepted URL. `client_capture_id` is a uuid v5 of `(job, url_hash)`, so retries create nothing twice. Vendor comes from domain lookup (the same logic as `resolveVendor`). Accepted catalog candidates need no new row. |
| S10 | materialize board | **Client**, in the designer portal | Creates the board (`create_project_board` or `useUpsertBoard`). Downloads the kept crops (presigned) and pushes them through the existing `upload-board-assets.ts` and `prepareProjectReviewMedia` path. Builds sections and pins from the geometry, saves through the existing room save, then calls `mark_board_import_committed(job, board_id, item_map)`. Asset ids are uuid v5 of `(job, asset)`, so a retry reuses them. |

**Queue.** The outbox is `board_import_steps`, modelled on `aesthete_jobs`:
- `dedupe_key UNIQUE = job:stage:shard`; claimed with `SKIP LOCKED` and a lease.
- Retries back off 1m / 5m / 25m, parking after 5 attempts. A janitor requeues `running` rows after 15 min.
- pg_cron runs every minute. It inserts a `job_runs` row, then calls `invoke_edge_function('deck-import-worker', {job_run_id})`.
- Each shard is sized to fit the 60 s pg_net window: one slide range for S3, ≤16 images for S5, ≤8 URLs for S4.
- The worker checks eligible rows, then probes `/healthz`, then claims (the billing guard, as in `aesthete-embed-worker/index.ts:22-34`). If inference is down, rows are skipped without using up attempts.
- A parked job gets an `agent_tasks` row (`task_type='board_import_parked'`, assignee `kody`). The job itself becomes `failed` and shows the designer a plain-language reason.

## Parsing rules (S1, in the container)

- **Slide order** comes from `presentation.xml` `p:sldIdLst`, never from file names. Slide size comes from `p:sldSz`.
- **Only slide `spTree` is walked.** Layout and master images are ignored. Placeholder geometry is inherited from the layout, then the master.
- **Images are found in four places:** `p:pic`, `p:sp` with `a:blipFill`, table-cell fills, and the slide `p:bg` (role `background`). For `mc:AlternateContent`, only the Choice branch is read.
  - For SVG, the PNG fallback blip is used.
  - `.wdp` parts are ignored.
  - Linked images (`r:link`) are fetched only if the target is http(s), through the existing `safe_fetch`. `file://` targets are skipped and logged.
  - EMF/WMF: the embedded DIB is extracted if one is present. Otherwise the asset gets `role='unsupported'`, `reason='format'`. LibreOffice is not used in v1.
- **Geometry:**
  - Group transforms are composed with a full affine transform (off / ext / chOff / chExt, rot, flip).
  - srcRect crop is applied, including negative padding.
  - Output is in slide-normalized units (0–1), so the board can scale it.
- **Links:** `a:hlinkClick` on pictures, on shapes and on text runs, plus regex over bare URLs in text and notes.
  - Dropped: `ppaction://`, hover links, and a denylist of licence and attribution hosts (creativecommons, unsplash, pexels, Bing image attribution, and so on).
  - A link shape that overlaps an image by ≥50% of its area is attached to that image.
- **Other text sources:**
  - Alt text: `descr` and `title`. Text ending in "Description automatically generated" is flagged `alt_auto` and weighted low.
  - Notes are found through the slide rel, not the file number.
  - Tables are parsed as rows.
- **Hostile-input limits:** ≤5,000 zip entries, ≤1 GB total uncompressed, ≤100× compression ratio per entry, XXE disabled, 32 MP image guard (the existing `image_safety.py`), and rel targets normalized inside the package.
- **Concurrency:** deck routes have their own semaphore (depth 1) and a 90 s timeout, so a large deck can't starve `/embed/*`. The worker is singleton-routed with `max_instances: 3`.

## Matching (S6/S7)

All scores come from one model version (`nomic-v1.5-onnx-int8-r1`). Candidates whose vectors came from a different `model_version` are excluded.

| Tier | Source value | Evidence | Band rule (thresholds are placeholders until calibrated) |
|---|---|---|---|
| T0a | `link_existing` | The normalized URL (lowercase host, `www.` and utm/ref params stripped) equals the `source_url` of a product the importer can see | **strong** |
| T0b | `link` | A link resolved to a page with JSON-LD `Product` or OG product price | Link on the picture itself: **strong** if look ≥ τ_look (≈0.80); **likely** otherwise, with the note "the page photo looks different". Link bound only by proximity or text: **likely** if look ≥ τ_look, otherwise **possible**. Non-product page: no candidate, kept as `data.import.links`. |
| T0c | `sku` | Extracted SKU plus vendor exactly match `products.vendor_sku` and the vendor | **strong** |
| T1 | `exact_image` | pHash Hamming ≤6, or image-only cosine ≥ τ_exact (≈0.95), against `product_image_vectors` | **strong** |
| T2 | `catalog_image` | kNN over image-only vectors, falling back to `aesthete_vector` for products with no image rows yet | **likely** needs all three: top1 ≥ τ_likely (≈0.85), a margin over top2 of ≥0.03, and no category conflict. Otherwise **possible** (top 3). |
| T3 | `attribute_text` | Claude Haiku attributes (category, materials, colours, query string) → `/embed/text` (query) for cross-modal kNN. Blended by reciprocal-rank fusion (RRF) with `aesthete_search` full-text search and vendor-name text match. Reranked by image cosine. | **possible** only; can become **likely** only if a T2 candidate agrees |
| T4 | `web_visual` | Vision Web Detection `pagesWithMatchingImages` filtered to retailer domains (`RETAILER_MAP` plus `vendors.website`), then through S4 | full match + Product JSON-LD + look ≥ τ_look → **likely**; partial → **possible**; visually-similar → not shown |
| T5 | — | None | Stays an `image` pin. Has a "Find this piece" action later. |

**Commit rules:**
- **Nothing reaches FF&E or ordering without a designer action.**
- Only **strong** candidates are preselected in the ledger. Likely and possible are never preselected.
- Bands are shown as words and ordering, never as percentages or badges.
- Within one asset, candidates are collapsed through `merged_into_id` and `catalog_equivalent_id`. The designer's own library is ranked first (personal +0.15, studio +0.10, as in `find_taught_alternatives`). That boost changes order only, never the band.

**Only these roles are matched:** `product`, and crops of `lifestyle` images. Logos, swatches, decoration and backgrounds are not matched. Swatches land as image pins tagged `swatch`.

**Dedupe:**
- One asset per (media sha, crop). Also across crops when pHash Hamming ≤4.
- Each asset keeps all its placements, so one decision applies to every slide it appears on. The designer can split them.
- Each URL is unfurled once per job.
- `board_import_url_cache`, keyed by url_hash with a 7-day TTL, holds the extracted page data. It holds **no product ids**, so it can be shared safely across jobs.

## Data model

Migrations 00676–00679 (numbers to re-check at merge). All writes go through SECURITY DEFINER RPCs or the service-role worker. Reads are limited to active co-members of `studio_id`.

- **`board_import_jobs`**: id, studio_id, created_by, target (`project_id` or `proposal_id`, exactly one), board_id (set at commit), r2_key, file_sha256, file_bytes, file_name, source_format, slide_count, status, stage_counts jsonb, error_code, web_search_requested_at/by, cost_micros, model_versions jsonb, threshold_version.
  - Status values: `uploading | queued | parsing | matching | ready | committing | committed | failed | abandoned`.
  - **UNIQUE(studio_id, file_sha256, project_id, proposal_id)**: re-uploading the same deck returns the existing job (the content-addressed precedent from `00434:390-403`).
- **`board_import_slides`**: job_id, ordinal, title, notes_text, aspect, section_label.
- **`board_import_assets`**: id, job_id, asset_key (= media sha + crop hash), r2 keys (display, thumb, embed), w, h, has_alpha, phash bigint, role, role_source, query_vector vector(768), attributes jsonb, model_version. UNIQUE(job_id, asset_key).
- **`board_import_placements`**: id, job_id, slide_id, asset_id, bbox (normalized), rotation, z, group_path, alt_text, alt_auto, caption_text, extracted jsonb, association_source (`deterministic | llm`), association_margin.
- **`board_import_urls`**: job_id, url_normalized, url_hash, status (`ok | not_product | blocked | failed | skipped_cap`), extracted jsonb, page_image_url, look_score, existing_product_id. UNIQUE(job_id, url_hash).
- **`board_import_candidates`**: asset_id, source, product_id or url_id, raw_score, band, rank, evidence jsonb, threshold_version, model_version. UNIQUE(asset_id, source, target).
  - Read through a SECURITY INVOKER view joined to `products`, so a co-member never sees another user's personal-layer products.
- **`board_import_decisions`** (append-only): job_id, asset_id, decision (`accepted | rejected | kept_as_image`), candidate_id, product_id, rank_chosen, decided_by, idempotency_key UNIQUE.
- **`board_import_steps`**: the outbox described above.
- **`product_image_vectors`**: product_id, image_hash, vector vector(768), phash, model_version, source (`product_image | designer_confirmed`), studio_id (NULL means anyone who can see the product), created_by.
  - Indexes: HNSW (cosine), plus a btree on phash.
  - Filled by extending `aesthete-embed-worker/lib.ts` (~161-245). It already computes per-image vectors and then discards them; it would keep them. The backfill re-enqueues `embed_fused` for products that have no rows yet.
- **RPCs:**
  - `board_import_match_knn(p_job_id, p_vector, p_limit)`: DEFINER, service_role only. Applies the 00152 rules for `job.created_by` (catalog; or personal with owner = created_by; or studio where created_by is an active member). Same envelope as `aesthete_ask_knn`.
  - `consume_board_import_budget(studio, kind, n)`
  - `record_board_import_decisions`
  - `commit_board_import_products`
  - `mark_board_import_committed`
- **Pin provenance** needs no board schema change (`data` allows any keys, 256 KB cap):
  - `data.import = {jobId, slide, placementId, assetId, source, band, caption, links[], extracted(unconfirmed)}`
  - `data.source_url`, `data.original_image_url`
  - `data.provenance = 'imported_deck'` (needed for PP-4 honest-imagery captions).

## Limits and cost controls

- **Deck file:**
  - ≤100 MB (the media document cap) and ≤200 slides.
  - `.ppt` and `.key` are rejected with "Re-save as .pptx". PDF is out of scope for v1.
  - The file is sniffed for zip magic plus `[Content_Types].xml` with the presentationml type.
- **Per job:**
  - ≤400 unique assets matched and ≤150 unique URLs. Anything past a cap is marked `skipped_cap` and shown as such.
  - Claude calls: ≤1 adjudication per low-margin slide (`claude-sonnet-5`, forced tool, elements by ID; it is never asked for bboxes) and attribute extraction batched ≤20 crops per call (`claude-haiku-4-5`).
  - A hard per-job ceiling of about $1, with spend logged in `cost_micros` and `job_runs.cost_usd`.
- **Per studio:** web visual lookups capped (proposed 500 per month at about $3.50 per 1k) and imports capped (proposed 20 per day). Both go through `consume_board_import_budget`. The per-user unfurl quota is left as it is.
- **Fetch politeness:** ≤2 concurrent requests per host and about 1 request per second per host. The existing limits stay (5 s, 2 MB, 3 redirects).
- **Retention:** source deck and manifest kept 30 days after commit or abandonment; crops not chosen are deleted with them. Proposed: a sweep added to the existing GC pattern, run as a dry run first.

## Feedback as taught signal

1. **Exact recall.** An accepted crop (from any tier except `link_existing`) is embedded and stored in `product_image_vectors` with `source='designer_confirmed'` and `studio_id` set. The same image in the studio's next deck then hits T1 directly. The row stays visible only to that studio.
2. **Suppression.** A rejected (asset pHash, product) pair is excluded on re-runs for that studio.
3. **Calibration.** A weekly offline report (not automatic) measures precision per tier and band, using accepted vs rejected decisions and how often rank 2 or 3 was chosen. Thresholds sit in a versioned config row (`threshold_version` stamped on every candidate). Changing a threshold is a reviewed data change. No model training.
4. **Strongest signal.** "Accepted, then promoted, then ordered" is joined later through `project_ffe_item_id` and counts most in the report.

## Prerequisites in the ordering chain (otherwise import feeds a broken promote path)

- **P1.** `usePromoteBoardReferenceToSelection` must send `name`, `vendorName`, `sourceUrl` and `priceCents` from pin `data` (`packages/supabase/src/hooks/use-project-ffe-ga.ts:196-215`). Without it, a pin with no product fails or becomes "Named need".
- **P2.** `buildSendToScheduleArgs` must carry `vendor_id` and `vendor_name`, and stamp `data.proposalItemId` (`apps/designer-portal/src/lib/scope/board-schedule.ts`).
- **P3.** Import guarantees every `product` pin has a `product_id`. Unresolved pieces stay `image` pins, which cannot be promoted.
- **P4 (phase 2).** A "Find this piece" action in the inspector for any image pin. It runs the same pipeline as a single-asset job (`source_format='pin'`), so the board and the import share one matcher, not two.

## Risks

- **Prod inference may be dark.** The docs conflict, and `product_image_vectors` will start empty. Before launch, confirm `/healthz` in prod, then run the backfill. Until then T1 and T2 degrade, and the ledger says "Photo match is unavailable right now".
- **Small catalog, so a low T2 hit rate.** Expect most value from links (T0) plus the designer's own library. T4 carries the long tail but has cost and ToS exposure. SerpApi Lens is excluded because of the ongoing Google v. SerpApi litigation.
- **The kNN twin must stay in step with the 00152 RLS policies.** It needs a pgTAP parity test (below).
- **The fused `aesthete_vector` fallback gives "similar feel", not the same SKU.** Fallback hits are capped at **possible**.
- **Collages.** No detector in v1. A multi-product image is matched as one scene and capped at **possible**. Grounding DINO or OWLv2 is phase 2.
- **Copyright of retailer images in shares.** The public `proposal-mood-boards` bucket and share links republish deck images. See ruling 4.
- **Container contention.** Deck parsing shares the singleton inference worker with embedding (the separate semaphore mitigates this).
- **Client-side materialize** moves about 45 MB through the browser for a 150-image deck. It is resumable thanks to deterministic asset ids.

## Open questions needing a ruling

1. **Storage split.** The constraint says R2 via the media service, but board media lives in Supabase buckets today. Proposal: R2 for the deck and working crops; final pin images copied into the existing board buckets so share, review-media and GC keep working unchanged.
2. **Web visual tier.** Is a call to Google Vision on the designer's press acceptable under "no automated external sends", and what is the monthly cap?
3. **Import target.** A new board only in v1 (recommended), or also merging into an open board?
4. **Imagery once matched.** Should a matched pin show the deck crop or the maker's image? PP-4 and copyright apply.
5. **Price basis.** Is the scraped price retail, landing in the sell price with trade left empty until confirmed? V1 margin on off-marketplace products is still open.
6. **Who reviews.** Importer only, or co-members too (they would see fewer candidates because of personal-layer scoping)?
7. **Retention** of the source deck and notes, which may contain client PII.
8. **LibreOffice sidecar** (slide previews, EMF): phase 2 or never?
9. **Calibration data.** Will Leah supply about 3–5 real decks for the labelled set?

## Verification

- **Python (pytest)** on fixture decks generated by a python-pptx script. Covers:
  - reordered `sldIdLst`, nested and rotated groups, srcRect crop including negative values, picture-filled shapes, table-cell fills;
  - linked `r:link` images, the SVG fallback, auto alt text, the overlay link shape, notes and table links;
  - zip bomb, XXE and path-traversal rejection, ≥32 MP rejection.
- **Deno tests:** association scorer (grid and caption layouts), URL normalizer and denylist, band function, budget accounting, step idempotency (re-running a shard produces no duplicate rows), and 429 backoff without burning attempts.
- **pgTAP:**
  - `board_import_match_knn` returns exactly the rows that `aesthete_ask_knn` returns under the importing user's JWT, across personal, studio, catalog and foreign-studio fixtures;
  - RLS on all import tables, including that co-members can't see another user's personal candidates;
  - append-only decisions;
  - `commit_board_import_products` run twice produces one product per URL.
- **Match-quality harness** (offline script) over about 300 labelled crops: precision and recall per tier and band. Proposed launch gate (needs a ruling): strong ≥0.98 precision, likely ≥0.85. Any threshold change bumps `threshold_version`.
- **Playwright e2e:** upload a fixture deck, ledger shows slides, accept a strong match and a possible match, commit. Then check:
  - the board has one section per slide, with correct pin types and `product_id`;
  - Promote all, then triage to `selected`, gives an FF&E line with vendor and price that is eligible for `create_purchase_order`.
- **Prod readiness:** inference `/healthz`, backfill counts for `product_image_vectors`, a cron `job_runs` row reaching `succeeded`, and a cost row per job.

### Critical Files for Implementation
- /Users/kody/Code/patina-merged/services/aesthete-inference/app/main.py (new `/deck/parse` and `/deck/derive` routes; reuse `safe_fetch.py` and `image_safety.py`)
- /Users/kody/Code/patina-merged/supabase/functions/aesthete-embed-worker/lib.ts (keep per-image vectors in `product_image_vectors`; billing-guard pattern)
- /Users/kody/Code/patina-merged/supabase/functions/capture-from-url/extract.ts and /Users/kody/Code/patina-merged/supabase/functions/capture-from-url/ssrf.ts (lift into `_shared/product-page/` for the link-resolve stage)
- /Users/kody/Code/patina-merged/supabase/migrations/00247_aesthete_ask_knn.sql and /Users/kody/Code/patina-merged/supabase/migrations/00152_three_layer_catalog.sql (model for the DEFINER kNN twin and its parity test)
- /Users/kody/Code/patina-merged/supabase/migrations/00516_capture_producer_idempotency.sql, /Users/kody/Code/patina-merged/packages/supabase/src/hooks/use-project-ffe-ga.ts, and /Users/kody/Code/patina-merged/apps/designer-portal/src/lib/mood-board-assets/ (commit products as the user, fix the promote payload, client-side materialize)