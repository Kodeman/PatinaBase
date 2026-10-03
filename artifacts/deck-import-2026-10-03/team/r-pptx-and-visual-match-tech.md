# PPTX → Patina mood board import: research report (extraction and photo match)

Labels used throughout:
- **V** means I checked it in the repo and it is cited as `path:line`.
- **W** means it comes from web sources (listed at the end).
- **I** means it is my inference.
- Each finding also carries a confidence level: H (high), M (medium) or L (low).

---

## 0. What the repo already has

| # | Finding | Evidence | Label/Conf |
|---|---|---|---|
| R1 | No PPTX handling exists anywhere. The only mentions are test fixtures that classify `deck.pptx` as a Drive item. | `supabase/functions/_tests/cowork-intake-delta.test.ts:47`, `cowork-intake-bridge.test.ts:191` | V/H |
| R2 | None of these libraries are used: fflate, jszip, fast-xml-parser, python-pptx, yauzl. Libraries that are present: `sharp` (two package.json files), `pdf-lib`. | grep across all package.json and edge imports | V/H |
| R3 | Edge functions already import npm packages with the `npm:` specifier (`npm:pdfjs-dist@4.10.38`, `npm:@react-pdf/renderer@4.3.0`, `npm:@anthropic-ai/sdk@0.109.1`). That is the precedent for adding `npm:fflate` / `npm:fast-xml-parser`. `deno.json` has `"lock": false`. | `supabase/functions/deno.json:2` | V/H |
| R4 | **An image embedding model is already deployed.** `services/aesthete-inference` runs nomic-embed-vision-v1.5 and nomic-embed-text-v1.5 (768-d, text and image vectors in one shared space, Apache-2.0) as int8 ONNX on CPU. Endpoints: `POST /embed/image {inputs:[{id,url}]}`, batch ≤16, 8 concurrent, 429 when busy, vectors L2-normalized. | `services/aesthete-inference/README.md:3-40`, `requirements.txt` | V/H |
| R5 | The inference container is a Cloudflare Container: `standard-3`, `max_instances: 3`. | `infra/inference-worker/wrangler.jsonc:12-14` | V/H |
| R6 | The inference service already has pillow-heif (HEIC), a decompression-bomb guard (`ABSOLUTE_MAX_IMAGE_PIXELS = 32_000_000`) and an SSRF-safe fetcher. | `requirements.txt` (pillow-heif), `app/image_safety.py:10`, `app/safe_fetch.py:16` | V/H |
| R7 | **`products.aesthete_vector` is a style vector, not an identity vector.** It is computed as normalize(0.65·mean(up to 3 images) + 0.35·caption). There is an HNSW index on the catalog layer. There is **no per-image, image-only vector column** for products. `products.embedding` is a 768-d text embedding. | `supabase/functions/aesthete-embed-worker/lib.ts:231,497-504`; `supabase/migrations/00239_aesthete_space.sql:27-28,188-196` | V/H |
| R8 | The existing kNN RPCs to reuse are `aesthete_ask_knn(p_embedding vector(768), p_filters)` and the similarity functions. There is also a text search RPC. | `00247_aesthete_ask_knn.sql:32`, `00008_similarity_functions.sql:11`, `00056_search_products_text.sql` | V/H |
| R9 | Products follow the three-layer catalog (`layer`, `owner_user_id`, `studio_id`, `catalog_equivalent_id`) with RLS boundaries. Any match has to respect layer and studio scope. | `00152_three_layer_catalog.sql:36-113` | V/H |
| R10 | **`capture-from-url` already solves "deck has a link".** It parses Open Graph and JSON-LD `Product` (name, brand, price in cents, images), fetches with SSRF pinning (2 MB cap, 3 redirects) and enforces a durable per-user quota (10-minute and daily limits). | `supabase/functions/capture-from-url/extract.ts:4-9,312`; `ssrf.ts:38-40,242,910`; `quota.ts:17` | V/H |
| R11 | There is a document-to-structured-rows precedent: `project-ffe-document-extract` calls the Anthropic Messages API from an edge function with a forced tool schema, model `claude-sonnet-5`. Limits: PDF 25 MB, image 10 MB, 5,000 rows. It sniffs magic bytes. | `project-ffe-document-extract/index.ts:86-100`, `lib.ts:1-4,161` | V/H |
| R12 | Background removal is already built: a remove.bg adapter in `services/media` with a credit ledger, one fetch and no retry ("one request can consume one paid vendor credit"), plus a designer-portal capability route and hook. | `services/media/src/modules/background-removal/remove-bg.adapter.ts:12,54-70`; `apps/designer-portal/src/hooks/use-background-removal.ts` | V/H |
| R13 | `services/media/.../ai-features.service.ts` has `detectProducts` / `callVisionAPI` stubs (sharp metadata). I did not confirm they call a real vendor, so they are probably placeholders. | `ai-features.service.ts:91-105,198-205` | V/M |
| R14 | Media container: sharp/libvips, `standard-2`, max 5 instances. sharp cannot decode EMF/WMF. HEIC needs a custom libvips build. | `infra/media-worker/wrangler.jsonc:11-13`; `container/server.mjs:12` | V/H (container), I/M (format support) |
| R15 | The board bucket `proposal-mood-boards` is **public-read** and allows jpeg/png/webp/avif/gif. There is no TIFF, HEIC or SVG, so the pipeline must normalize those. | `00406_mood_board_storage_and_shares.sql:28-53` | V/H |
| R16 | Local storage `file_size_limit = "50MiB"`. A 100 MB+ deck will be rejected unless the bucket and project limits are raised. Production limits were not checked. | `supabase/config.toml:125-128` | V/H (local), I/M (prod) |
| R17 | The MoodBoard PRD defers Pinterest import because "URL-unfurl covers most of the need". PPTX import is not in the PRDs. | `docs/prds/MoodBoard/README.md:127`; `00-mood-board-prd.md:390` | V/H |
| R18 | `catalog-normalizer` (feed parsing) is the licensed path for bulk vendor data, as opposed to scraping. | `supabase/functions/catalog-normalizer/feed-parse.ts` | V/H |

---

## A. PPTX extraction

### A1. Runtime choice: the parse cannot live in an edge function

- **Supabase Edge limits:** 256 MB memory, **2 s CPU per request**, 150 s idle timeout, wall clock 150 s (free) or 400 s (paid), 20 MB bundle. There is no documented request-body limit. Exceeding memory or CPU returns 546. (W/H)
- A 100 MB deck plus decompressed XML plus image transcoding will exceed 256 MB / 2 s of CPU. Edge functions are only suitable for orchestration: create a job, mint a signed upload URL, update status. (I/H)
- **Recommendation:** add a Python `deck-ingest` Cloudflare Container, either a sibling of aesthete-inference or a new route in it.
  - It reuses the Pillow, pillow-heif, safe_fetch and image_safety patterns (R6).
  - It reads the zip from disk with random access (Python `zipfile` reads the central directory, so only the needed entries are inflated).
  - LibreOffice is heavy (~0.5–1 GB image), so it should be a separate optional container. Only it can render slides and convert EMF/WMF and `.ppt`. (I/H)
- Upload must use Supabase resumable (TUS) upload into a new private bucket with a per-bucket limit of at least 250 MB. Do **not** put source decks in the public board bucket (R15). (I/M)

### A2. Library matrix

| Runtime | Unzip | XML | Notes | Conf |
|---|---|---|---|---|
| Deno edge | `npm:fflate` `unzipSync(buf,{filter})` skips inflating unwanted entries but needs the **whole archive in memory**. Streaming `Unzip` has no filter option and no backpressure. fflate 0.8.3 has a ZIP64 sentinel bug that can try to allocate ~4 GiB. | `npm:fast-xml-parser` with `preserveOrder:true` (z-order matters) | Only workable for small decks (<~20 MB) as a fast-path preview. | W/H facts, I/M fit |
| Node (services/*) | `yauzl` (random access, streaming); `jszip` loads everything into memory | `fast-xml-parser` / `sax` | sharp is present but has no EMF/WMF. | I/M |
| Python (container) | stdlib `zipfile` (random access) | `lxml` with `resolve_entities=False, no_network=True` (XXE guard), or `defusedxml` | **python-pptx (MIT)**. `Picture.image` raises "no embedded image" on `r:link`-only pictures. Group child coordinates are in group space. Rotation and flip are not composed. Read the raw XML for those cases. | W/H |

### A3. OOXML structure checklist (all I/H unless marked otherwise; standard ECMA-376 knowledge)

1. **Slide order** comes from `ppt/presentation.xml` → `p:sldIdLst` → `r:id` → `ppt/_rels/presentation.xml.rels`. **Do not sort by `slideN.xml` filename**, because reordering does not rename files. Slide size is `p:sldSz cx/cy` in EMU (914400/in, 12700/pt).
2. **Walk only `slideN.xml` `p:cSld/p:spTree`.** Never walk slideLayout or slideMaster images, since that is where logos, brand bars and templated backgrounds live. A layout image becomes part of a slide only through inheritance, and should be ignored.
   - Exception: a **placeholder** (`p:nvPr/p:ph type/idx`) with no `a:xfrm` on the slide inherits its position from the matching layout placeholder, then the master. Resolve that position for geometry. (I/H)
3. **Slide background:** `p:cSld/p:bg/p:bgPr/a:blipFill`. Treat it as a "background/room" image, not a product, unless the user promotes it. Layout/master `p:bg` should be ignored.
4. **Images can appear in four places:**
   - (a) `p:pic/p:blipFill/a:blip@r:embed`.
   - (b) **Picture-filled shapes** `p:sp/p:spPr/a:blipFill`. Designers commonly use rounded or circle frames, and naive `p:pic`-only parsers miss these.
   - (c) Table cell fills `a:tcPr/a:blipFill`.
   - (d) `mc:AlternateContent` → `mc:Choice`/`mc:Fallback`. Pick one branch so the same image is not counted twice.
5. **Rels:** `ppt/slides/_rels/slideN.xml.rels`. The target is `../media/imageN.ext`. **Linked image** = `a:blip@r:link` with rel `TargetMode="External"`. It may have **no embed at all**, and the target is often a local path on the author's machine (`file:///C:/...`), which cannot be fetched. Fetch only http(s) targets, through SSRF guards. (W/H)
6. **SVG:** `a:blip@r:embed` is a **PNG fallback**. The SVG is in `a:blip/a:extLst/a:ext uri="{96DAC541-7B7A-43D3-8B79-37D633B846F1}"/asvg:svgBlip@r:embed`. Use the PNG for matching. (I/H)
7. **HD Photo / artistic effects:** `a14:imgProps/a14:imgLayer@r:embed` can point at a `.wdp` (JPEG-XR) original. Ignore it and use the main blip. (I/M)
8. **Crop:** `a:blipFill/a:srcRect l t r b` in 1/1000 of a percent (100000 = 100%). **Negative values mean padding.** Apply the crop before embedding or matching, because the uncropped media often shows the whole room photo. "Compress pictures → delete cropped areas" may already have applied it. `a:stretch/a:fillRect` and `a:tile` also exist. (I/H)
9. **Groups:** `p:grpSp/p:grpSpPr/a:xfrm` with `off/ext/chOff/chExt`. Child to parent: `x' = off.x + (x − chOff.x)·ext.cx/chExt.cx`, composed from the innermost group outward. Handle `rot` (60000ths of a degree) and `flipH/flipV` with a full affine transform. (W/H)
   - **Group membership is itself a strong image↔text association signal.** (I/H)
10. **Hyperlinks:**
    - On a picture or shape: `p:nvPicPr/p:cNvPr/a:hlinkClick@r:id` (also `p:nvSpPr/p:cNvPr`).
    - On text runs: `a:r/a:rPr/a:hlinkClick@r:id`.
    - The rel type is `.../relationships/hyperlink` with `TargetMode="External"`.
    - Skip `action="ppaction://..."` (slide jumps), and `a:hlinkHover`.
    - **Common designer pattern:** a transparent rectangle with a link laid over the image. Associate it by bbox overlap.
    - Also regex bare URLs typed as plain text and URLs in notes. (I/H)
11. **Alt text:** `p:cNvPr@descr` and `@title`.
    - PowerPoint's auto alt text ends with "…Description automatically generated". Detect it and treat it as weak (LLM-generated) evidence, not a designer label.
    - `@name` ("Picture 12") is noise. (I/M)
12. **Notes:** slide rels type `notesSlide` → `ppt/notesSlides/notesSlideN.xml`. Take the body placeholder text, which often holds sources, links and prices. The relationship is via rel, not the file number. (I/H)
13. **Tables** (`p:graphicFrame/a:graphic/a:graphicData/a:tbl`) often carry FF&E schedules (item / vendor / price / link). Parse them as rows. **OLE embeds** (`p:oleObj` → `ppt/embeddings/*.xlsx`) can hold whole spec sheets. (I/M)
14. **Formats seen in `ppt/media`:**

| Format | Handling | Conf |
|---|---|---|
| png, jpeg | Pillow | |
| gif | first frame | |
| tiff | Pillow | |
| heic/heif | pillow-heif, already present (R6) | V |
| emf/wmf | LibreOffice/ImageMagick+libwmf. Many EMFs just wrap a bitmap (`EMR_STRETCHDIBITS`), so extracting it is cheaper. | I/M |
| svg | prefer the PNG fallback; otherwise resvg/cairosvg | |
| wdp | ignore | |

    Video and audio should be ignored. Normalize everything to webp/png, because the board bucket MIME allowlist is limited (R15).
15. **Duplicate media:** one `ppt/media/imageN` part can be referenced by many slides. Dedupe by part path, then sha256, then perceptual hash (the same product pasted from two sources). Keep a list of every occurrence (slide, bbox, links) per unique image. (I/H)
16. **Hostile input:**
    - Zip bombs: cap the number of entries, total uncompressed bytes and the per-entry ratio.
    - XXE: disable entities and DTDs.
    - Image bombs: use the existing 32 MP guard.
    - Path traversal in rel targets: resolve and normalize inside the package. (I/H)
17. **Source quirks:**

| Source | Quirks | Label/Conf |
|---|---|---|
| Legacy `.ppt` (CFB binary) | convert with `soffice --headless --convert-to pptx`, or reject with "re-save as .pptx" | I/H |
| Keynote export | slide size is 2× PowerPoint (26.67"×15"); vector PDFs are rasterized to PNG, sometimes downscaled; some exports come out as `.ppsx` (same OOXML, so accept it); charts are flattened | W/M |
| Google Slides export | alt text is kept; crops and layered images may come out wrong; images are re-encoded; standard hyperlinks usually survive | W/M |
| `.key` files | ask the user to export, or accept a PDF export | I/H |
| PDF fallback | route to the existing Claude-PDF path (R11, 25 MB cap) | V/H |

18. **Size and latency** (I/M): a 100 MB deck in the container takes ~5–20 s to unzip and parse. LibreOffice rendering ~1–2 s/slide. The job must be async, with progress reported through Realtime or polling.

### A4. Associating text (vendor, price, SKU, URL, dimensions) with images

**Element model.** After A3 transforms, every element on a slide has an absolute bbox in EMU, a z-order and a group path. Candidate signals, roughly strongest first (I/H for the approach, I/M for the weights):

1. Hyperlink on the picture itself, or a linked shape whose bbox overlaps the picture by ≥ 50%.
2. Same innermost `p:grpSp`.
3. Text box directly **below or above** the image, with x-range overlap ≥ 50% of the narrower box and a vertical gap < 0.5× image height. Captions to the side need y-overlap instead.
4. Text overlaid on the image (contained bbox).
5. Grid alignment: column and row clustering when N images and N captions share a layout, solved with Hungarian assignment on a cost of distance plus misalignment penalties.
6. Table row whose cell has an image fill, or row order matching left-to-right / top-to-bottom image order.
7. Notes text that names items in reading order (weak).

**Field parsing:**
- Price: `$1,234(.00)`, "MSRP", "Trade"; reuse `parsePriceToCents` from `capture-from-url/extract.ts:111` (V).
- SKU / model: alphanumeric with dashes, "Item #", "SKU", "Model".
- Dimensions: `W x D x H`, `"`, `in`, `cm`.
- Vendor: match against the vendors/brands tables first, then the hyperlink domain (e.g. `rh.com` → RH).

**Adjudication:**
- The deterministic scorer emits candidate pairs with a margin.
- Low-margin slides go to a vision LLM: a rendered slide PNG plus an element JSON with IDs. Have the model return `[{image_id, text_ids[], link_id?, confidence}]` under a strict schema. This mirrors R11's tool-schema pattern. (I/H)
- Claude's spatial and coordinate output is "approximate" per its docs, so give it IDs to choose from rather than asking it to produce bboxes. (W/H)

**Image role classification** (needed before matching):
- Roles: product cutout, product-on-white, lifestyle/room shot, material swatch, logo/icon, decorative.
- Cheap signals: alpha channel, border-pixel uniformity (white background), aspect ratio, area < ~2% of the slide (icon).
- Ambiguous cases go to the LLM. Only product, cutout and lifestyle-crop images enter photo match. (I/M)

---

## B. Photo match

### B1. Options

| Option | What it returns | Cost | Limits / latency | ToS / licensing | Label/Conf |
|---|---|---|---|---|---|
| **Own-catalog kNN, nomic-vision (already deployed)** | Nearest products in Patina's catalog, RLS-scoped | ~$0 marginal (existing container) | 16 per batch, 8 concurrent, 3 instances (R4/R5). CPU int8 latency: use `make bench` | Apache-2.0 | V/H |
| — caveat | `aesthete_vector` is fused style (R7). Querying it with an image vector finds "similar vibe", **not the same SKU**. Exact matching needs a new `product_images(image_vector vector(768))` with one row per image, plus an HNSW index. | | | | V/H fact, I/H implication |
| Better instance-match backbones | DINOv2 is strong on shape and geometry (CAD-like matching: rank 2.21 vs CLIP 18.24). **SigLIP2 often beats DINOv2 on e-commerce benchmarks** (LookBench: SigLIP2-B/16 46.1 vs DINOv2-L 29.6). Plain CLIP is the weakest baseline. One forum report (unverified): CLIP+DINOv2 ensemble +40%, background removal +15%. | CPU ONNX in the same container | | SigLIP2 Apache-2.0; DINOv2 Apache-2.0; **DINOv3 uses a custom license, review it** | W/M benchmarks, I/M licenses |
| **Google Cloud Vision Web Detection** | `webEntities`, `bestGuessLabels`, `fullMatchingImages`, `partialMatchingImages`, `pagesWithMatchingImages`, `visuallySimilarImages` (default 10 results) | first 1k/month free, then **$3.50/1k** up to 5M | Sync request ~1–2 s (I/M). Default quota needs checking in the console (I/L) | Official licensed API. Online requests are not persisted by Google. I found no published caching restriction (not proven absent). Returned URLs point at third-party copyrighted images. | W/H price, W/M ToS |
| **Google Lens through SerpApi** (`engine=google_lens`, `type=products / exact_matches / visual_matches`) | The best product results (titles, prices, sources) | Free 250/month (50/hr); $25/1k (200/hr); $75/5k; $150/15k; $275/30k (~0.9¢ each) | Needs a **public image URL** (use a short-TTL signed URL). ~2–5 s (I/M) | **Legal risk:** Google v. SerpApi (N.D. Cal. 4:25-cv-10826). DMCA claims largely dismissed July 2026; amended complaint; dismissal hearing **2026-10-13**. Google ToS forbids automated queries. SerpApi says service is unaffected. | W/H |
| Bing Visual Search | — | — | **Retired 2025-08-11 (HTTP 410)**. The replacement, "Grounding with Bing", returns LLM output, not visual matches. | — | W/H |
| Google Vision **Product Search** | Searches only *your own* product set | — | Maintenance mode. Its recommended successor, Vertex AI Vision / Warehouse, **reached EOL 2026-09-30**. No advantage over pgvector. | — | W/H |
| Pinterest Lens | No official image-search API (text search only, beta). Apify scrapers ~$5/1k violate ToS. | | | ToS risk | W/H |
| Amazon | Rekognition has no product kNN (face collections only). PA-API is text-only. DIY with Titan multimodal embeddings is possible. | | | | W/M |
| Cloudflare Workers AI | **No image embedding models** (BGE, Qwen3, EmbeddingGemma, PLaMo are text-only). Vision LLMs such as llama-3.2-11b-vision can caption. Replicate reportedly acquired by Cloudflare in 2025. | | | | W/M |
| **Vision-LLM attributes → text query** | Structured `{category, subcategory, materials[], colors[], finish, style, era, distinctive_features[], visible_text/logo, brand_guess, query_string}` | Claude image tokens = ⌈w/28⌉·⌈h/28⌉. 1000×1000 = 1,296 tokens. Sonnet 5.5 $2/$10 per MTok → ~$0.003 input + ~$0.003 output per image ≈ **$5–7/1k**. Haiku 4.5 $1/$5 ≈ $2–3/1k. **Batch API −50%.** | Up to 600 images per request (1M-context models), 8000 px max, 10 MB each. **More than 20 images in a request → ≤2000 px.** Supports JPEG/PNG/GIF/WebP only. | Anthropic does not train on uploaded images | W/H |
| — how to use the output | Feed `query_string` into nomic **text** query embeddings (same space as image vectors, R4) for cross-modal kNN, plus `search_products_text` lexical search (R8). It can also seed a web text search. | | | | I/H |

### B2. Pre-processing

| Step | Options | Cost / latency | License | Label/Conf |
|---|---|---|---|---|
| Collage → multiple products | **Grounding DINO** (text-prompted: "sofa. chair. lamp. rug. table. mirror. art. pillow.") | Replicate ~$0.0015/run, ~2 s, L40S | Apache-2.0 | W/H |
| | **OWLv2**: also does **image-conditioned** query (use a catalog crop as the query) | owl-sam ~$0.001/run, ~1 s (small community model) | Apache-2.0 | W/M |
| | Grounded-SAM | ~$0.0025/run, ~3 s | | W/M |
| | **YOLO (Ultralytics)** | | **AGPL-3.0, risky for SaaS.** Prefer RT-DETR or D-FINE (Apache) | I/M |
| | Claude bboxes | cheap first pass | Approximate; refine with a detector | W/H |
| | Caveat | Zero-shot detectors find generic "chair/sofa" well; fine-grained styles less so (fashion study). | | W/M |
| Segmentation / cutout | SAM 2 box-prompted (cheap self-hosted; Replicate auto-mask ~$0.016–0.021, ~22 s) | | SAM 2 Apache-2.0 | W/M |
| Background removal | **remove.bg is already integrated** (R12; paid credits, so use it only for user-promoted pins, not bulk matching) | | | V/H |
| | BiRefNet | | MIT | I/M |
| | rembg / u2net | | MIT | I/M |
| | **BRIA RMBG-2.0** | | **CC BY-NC (non-commercial), avoid** | I/M |
| Embedding hygiene | Composite cutouts onto a neutral background before embedding; apply crop (A3.8); trim whitespace; embed both the full image and the cutout and keep the max. | | | I/M |
| Storage | Transparent PNG/WebP is allowed in the board bucket (R15). Keep the original, a cutout derivative and a provenance JSON. | | | V/H |

### B3. Recommended tiered strategy

The thresholds below are **placeholders until calibrated**. nomic cosine scales are model-specific, so build a labelled set of ~300 deck crops matched to products and measure R@1/R@5 per tier. (I/H for the method, I/L for the numbers.)

| Tier | Trigger | Action | Auto-apply? |
|---|---|---|---|
| T0 Direct link | URL found on the image, an overlay shape, the caption or notes | Dedupe against the catalog by normalized URL and SKU first. Otherwise run the `capture-from-url` extraction logic (R10) under the existing quota. | Yes, if JSON-LD `Product` was parsed and the page's og:image pHash/cosine matches the deck image (sanity check against wrong links). |
| T1 Exact duplicate | pHash Hamming ≤ ~6, or image-vector cosine ≥ ~0.95 against `product_images` | Link the existing product | Yes, with a "matched" badge |
| T2 Catalog kNN | top-1 cosine ≥ ~0.85 **and** margin top1−top2 ≥ ~0.03 | Suggest top 3 (same studio/catalog layer first) | No, designer confirms |
| T3 Attribute + cross-modal | T2 miss | LLM attributes → text-embed + lexical → re-rank with an image-vector rerank | No, shown as suggestions |
| T4 Web | T2/T3 miss and the designer opts in (cost-gated, per-studio monthly cap) | Vision Web Detection: `pagesWithMatchingImages` filtered to retailer/vendor domains, fetched via capture-from-url, accepted when JSON-LD Product is present. `fullMatching` = high, `partial` = medium, `visuallySimilar` = "alternatives" only. SerpApi Lens only behind a flag, given the litigation. | Never auto. Full-match plus Product JSON-LD can be pre-selected. |
| T5 Unresolved | — | Keep the image as an inspiration pin with the extracted text; allow a "find similar" action later | — |

**Ordering gate:** nothing becomes orderable without a confirmed product with a vendor and price. The import creates board pins first, and promotion to the FF&E/order flow is an explicit step. (I/H)

### B4. ToS, licensing and risk

1. **Retailer scraping.**
   - Fetching one designer-supplied URL on demand is lower risk, and is what capture-from-url already does (V).
   - Bulk crawling retailer sites to build a catalog breaks most retailer ToS. The licensed path is vendor feeds through catalog-normalizer (R18).
   - hiQ v. LinkedIn narrows CFAA exposure for public data but not contract or ToS claims. (I/M)
2. **Image copyright.** Deck images are often lifted from retailer sites.
   - Showing them inside a private board is low risk.
   - **The public `proposal-mood-boards` bucket (R15) and share links republish them.** Consider keeping the source image private and serving the vendor's own og:image (or the catalog image) once matched. (I/M)
3. **Google:** Vision Web Detection is a contracted API (safe). Google Lens via SerpApi carries live litigation risk (W/H). Pinterest and Amazon scrapers violate ToS.
4. **Model licenses:**
   - Apache: nomic, SigLIP2, DINOv2, Grounding DINO, OWLv2, SAM 2.
   - Flag: DINOv3 (custom), Ultralytics YOLO (AGPL), RMBG-2.0 (non-commercial). (I/M)
5. **PII:** decks may include client names and addresses in notes. Keep the parsed manifest in a private bucket and set retention. (I/M)

### B5. Throughput, rate limits and latency

- **Inference:** 16 images/request × 8 concurrent × up to 3 instances. A 300-image deck is about 19 requests, which is fine. Callers must back off on 429 (R4). (V/H)
- **Claude:** for 300 images at ~1,300 tokens each, batch per slide (≤20 images to avoid the 2000 px cap), or use the Batch API for non-interactive imports. (W/H)
- **SerpApi:** the Starter tier allows 200/hour, so one large deck could exhaust it. Vision has a much larger quota. (W/H, I/M)
- **End to end (I/M):** a 50-slide deck with ~150 images takes ~1–3 minutes through T0–T3 if async with progressive results. T4 adds ~1–2 s per image, parallelized.

---

## C. Suggested pipeline (I/H)

1. **`deck-import-create`** (edge function): auth, create an `import_jobs` row, return a TUS signed upload URL for a private `deck-imports` bucket (≥250 MB; R16), accept `.pptx/.ppsx/.potx` (sniff zip magic + `[Content_Types].xml`), optionally `.ppt` and `.pdf`.
2. **`deck-ingest` container** (Python, lxml + python-pptx + Pillow + pillow-heif + zipfile; optional LibreOffice sidecar):
   - Parse A3 into `manifest.json` (slides → elements {id, kind, bbox_emu, group_path, z, text, links, alt, role_guess}, notes, tables).
   - Extract, dedupe and normalize media.
   - Render slide PNGs.
3. **Associate:** run the A4 scorer, then send low-margin slides to Claude with a strict schema. Output: `candidate_items[]`.
4. **Resolve:** T0–T5 per item. Embeddings go through the existing `/embed/image` and `/embed/text`. Add a `product_images.image_vector` column with HNSW (follow patina-db-migrations).
5. **Review UI** (designer portal):
   - Per-slide view: original slide thumbnail next to extracted pins.
   - Per item: accept the match, swap to suggestion 2/3, "search the web" (metered), or keep as inspiration.
   - Bulk "accept all high-confidence".
6. **Commit:** each slide becomes a board section or room, keeping relative layout from the bboxes. Confirmed products are linked, and promotion to project FF&E or order is a separate action.

---

## D. Open items not verified

- Production Supabase storage and bucket size limits (only local config was checked: R16).
- The board item/pin schema and the composition API used by the GA mood board room. I did not read it, so the mapping in C6 is unverified.
- Whether `ai-features.service.ts` vision calls hit a real vendor (R13).
- nomic-vision int8 latency and its R@k for furniture instance matching. Needs `make bench` and a labelled evaluation.
- Google Vision default request quota, and current Service Specific Terms on caching results.

## Sources
- [Supabase Edge Function limits](https://supabase.com/docs/guides/functions/limits)
- [Google Cloud Vision pricing](https://cloud.google.com/vision/pricing)
- [Vision Web Detection docs](https://docs.cloud.google.com/vision/docs/detecting-web)
- [Vision data usage FAQ](https://docs.cloud.google.com/vision/docs/data-usage)
- [Vision Product Search docs (maintenance mode)](https://cloud.google.com/vision/product-search/docs)
- [Vision deprecations](https://docs.cloud.google.com/vision/docs/deprecations)
- [SerpApi pricing](https://serpapi.com/pricing)
- [SerpApi Google Lens](https://serpapi.com/google-lens-image-sources-api)
- [Google v. SerpApi docket](https://www.courtlistener.com/docket/72059948/google-llc-v-serpapi-llc/)
- [Google suit dismissed (Computerworld)](https://www.computerworld.com/article/4200873/googles-anti-search-scraping-lawsuit-dismissed.html)
- [Google amends complaint](https://www.androidheadlines.com/2026/07/google-amends-lawsuit-serpapi-ai-scraping-search-results.html)
- [Bing Search APIs retirement](https://learn.microsoft.com/en-us/lifecycle/announcements/bing-search-api-retirement)
- [Cloudflare AI Search supported models](https://developers.cloudflare.com/ai-search/configuration/models/supported-models/)
- [Workers AI changelog](https://developers.cloudflare.com/workers-ai/changelog/)
- [Apify Pinterest Lens](https://apify.com/dev00/pinterest-lens-apify/api)
- [Pinterest API search (community)](https://community.pinterest.biz/t/does-pinterest-api-allow-search/28879)
- [Replicate grounding-dino](https://replicate.com/adirik/grounding-dino)
- [Replicate owl-sam](https://replicate.com/c-barron/owl-sam)
- [Replicate grounded_sam](https://replicate.com/schananas/grounded_sam)
- [Replicate sam-2](https://replicate.com/meta/sam-2)
- [Replicate pricing](https://replicate.com/pricing)
- [E-commerce image embedding benchmark](https://arxiv.org/pdf/2504.07567)
- [LookBench](https://arxiv.org/pdf/2601.14706)
- [Visual Product Search Benchmark](https://arxiv.org/pdf/2603.17186)
- [DINOv3](https://arxiv.org/pdf/2508.10104)
- [OSCAR CAD retrieval](https://arxiv.org/pdf/2601.07333)
- [Furniture search discussion](https://github.com/orgs/community/discussions/166577)
- [Claude Vision docs](https://platform.claude.com/docs/en/build-with-claude/vision)
- [python-pptx group shape](https://python-pptx.readthedocs.io/en/latest/dev/analysis/shp-group-shape.html)
- [python-pptx hyperlink](https://python-pptx.readthedocs.io/en/latest/dev/analysis/shp-hyperlink.html)
- [python-pptx "no embedded image" issue](https://github.com/scanny/python-pptx/issues/929)
- [docling linked-image issue](https://github.com/docling-project/docling/issues/2075)
- [pptx-swift r:link PR](https://github.com/PsychQuant/pptx-swift/pull/6)
- [fflate](https://github.com/101arrowz/fflate)
- [fflate ZIP64 bug #298](https://github.com/101arrowz/fflate/issues/298)
- [Keynote→pptx PDF→PNG](https://discussions.apple.com/thread/250204382)
- [Keynote slide size](https://learn.microsoft.com/en-us/answers/questions/4972854/some-slides-change-in-size-when-exporting-keynote)
- [Keynote .ppsx](https://discussions.apple.com/thread/8524312)
- [Google Slides export (UMich)](https://teamdynamix.umich.edu/TDClient/30/Portal/KB/PrintArticle?ID=13645)
- [PowerPoint↔Google Slides compatibility](https://slidemodel.com/fix-compatibility-powerpoint-google-slides/)
- [Adobe thread on Drive-downloaded pptx](https://community.adobe.com/questions-567/images-will-not-publish-if-pptx-is-downloaded-from-google-drive-web-interface-215996)