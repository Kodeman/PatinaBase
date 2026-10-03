# PowerPoint mood-board import: product framing report

## 0. Bottom line

- **Fit with the vision (high confidence).** The import passes the feature test. It is Capture (differentiator #4) feeding The Document (surface #1), and it leads to the first real dollar (furniture margin).
- **Not in the docs (verified).** No PRD, audit, or ruling mentions importing a PowerPoint, Keynote or slide deck. Every piece it would sit on top of already shipped: URL unfurl, capture, bulk promote, send-to-schedule, image embeddings, and a document-extraction precedent.
- **No competitor does this (medium-high confidence, absence of evidence).** None of Programa, Houzz Pro, Mydoma, Studio Designer, DesignFiles, Gather, Mattoboard or Material Bank imports an existing PowerPoint or PDF board as a board. Their imports are image upload, a web clipper, Pinterest, or (Programa) InDesign.
- **Main risk for photo match (high confidence).** Matching against the web has no clean API in 2026: Bing Visual Search is retired, Google Product Search is in maintenance mode, and Google Lens has no official API. Matching against Patina's own catalog is buildable now, but only as good as the catalog is deep. That is the "launching to an empty room" risk.

---

## 1. Feature test against the vision (VISION.md §8, `docs/vision/VISION.md:93`)

| Test | Answer | Evidence | Confidence |
|---|---|---|---|
| Surface (§1) | **The Document (#1).** The import lands as a board in the project, and its products land in the FF&E schedule/selection. | `VISION.md:21` (Document is "Patina for the next twelve months") | High |
| Studio moment (§2) | **Onboarding a studio "the moment it adds its first hands"**, when "the thing she cannot afford is a new system to learn." Bringing in work she already has removes the cost of rebuilding it. It also lets a junior hand a principal's PPT board to procurement. | `VISION.md:29-31` | High (inference from the text) |
| Revenue stream (§3) | **Upside, margin on furniture.** Products from the import become schedule lines and then purchase orders. It is also a migration wedge for the subscription. | `VISION.md:43` ("first real dollar") | High |
| Promise (§4) | Studio: "you won't notice Patina" (it collects without rebuilding). Both sides: "Your data exports," which is the mirror of a data import. | `VISION.md:50,54` | Medium (inference) |
| Differentiator (§5) | **#4 Capture**: "Any product into the library in under ten seconds." This is Capture done in bulk. Photo match leans on **#5 The Engine**, which is "not the wedge," so it should be framed as Capture, not as the Engine. | `VISION.md:61-62` | High |
| Side-journey risk (§6) | "Scope creep and side journeys" and "**Launching to an empty room**." If photo match runs against a thin catalog, it shows the empty room. | `VISION.md:75-76` | High |

### Open rulings this touches

- **V1, margin pocket (High).** The products a designer imports are mostly retail or trade brands that are not Patina-grade makers (West Elm, RH, Four Hands and so on). Whether Patina earns margin on an off-marketplace product ordered through the schedule depends on V1: carved from the maker's trade discount, or a slice of the studio's markup. Without a ruling, the "flows into ordering" half of the import has no defined revenue. See `VISION-DECISIONS.md:29-33`.
- **V2, studio price (Low).** The import could be a selling point for a paid tier. It does not block the build.
- **V3, consumer cohort (Low).** Not touched. The import is a studio-only feature, which fits the studio-first direction.
- **V4, V5, V6 (None/Low).** Not touched. One drift item for V5: the brand-voice skill states "Where Time Adds Value" as canon (`.claude/skills/patina-brand-voice/SKILL.md:11`), while V5 still asks whether it is canon (`VISION-DECISIONS.md:53-57`). Do not use it in import copy until V5 rules.
- **V9, PP-4 "honest imagery" (High).** The source order is: installed photo → studio's own board → maker photo → drawn silhouette. **Never stock**, and generated images are fenced (`VISION-DECISIONS.md:174-190`). PPT boards routinely contain Pinterest and stock inspiration photos and renders (inference). Imported images need a provenance tag (`imported_deck`, `inspiration` vs `product`) so client pages can caption them honestly. Renders need the "Concept · not installed" label.
- **V10 (Medium).** The precedent that "writes land unverified until a studio member confirms" (`VISION-DECISIONS.md:280-290`). The same pattern fits extracted products: unconfirmed until the designer accepts them.
- **V11 (Medium).** A ledger is not a dashboard. An import report ("38 found · 12 matched · 6 unresolved") is only allowed as front matter over the rows it counts (`VISION-DECISIONS.md:257-261`). No progress bars, no green/red status (`:236-239`).
- **Next V id is V13** (last is V12, `VISION-DECISIONS.md:337`).

### Words and brand rules

- **Never "AI"** (`VISION.md:70`). The skill also bans leading with "algorithm," "engine mechanics," "ML," "powered by" and "AI-powered" (`SKILL.md:23-24,37`).
  - Use: "Designer-Taught Intelligence," "photo match," "found by look," "likely match." "Capture" is already house vocabulary.
  - Avoid: "AI match," "smart import," "curated" (overused, `SKILL.md:37`), "elevated" as filler.
- **No badges, status dots, pills, ✓ glyphs, spinners or green fills; no shadows** (`VISION-DECISIONS.md:202-206`). This rules out "match confidence %" pills (inference). Show confidence in words or by order instead ("likely" vs "possible").
- **Every value unconfirmed until the designer confirms.** The house precedent is `supabase/functions/project-ffe-document-extract/lib.ts:174`: "Every commercial value you return is an unconfirmed reading a designer must confirm … never compute, convert or infer [price]."
- Mood-board PRD non-goal N6: no generative image editing (`docs/prds/MoodBoard/03-phase-3-the-reach.md:334`). Photo match is retrieval, not generation, so it is allowed. Keep it that way.

---

## 2. What the PRDs and audit say about import, unfurl, Pinterest and bulk promote

| Finding | Evidence | Status | Confidence |
|---|---|---|---|
| Phase 3's framing is "what leaves the room and what comes into it." Its "New sources" are paste-a-URL and Chrome-extension captures in the rail. **No file or deck import.** | `03-phase-3-the-reach.md:11,18-19` | Verified | High |
| URL unfurl spec: ⌘V or drop a URL → placeholder pin → `capture-from-url` → pin with `data.source_url`. On failure it becomes an editable note carrying the URL, "never a silent no-op." | `03:182-202` (R3.3.1–R3.3.5) | Verified | High |
| **Unfurl rate limit: 10 per user per 10 minutes, 100 per user per day.** A 40-link deck would hit the first limit immediately. A bulk import needs its own quota or a batch exemption. | `docs/prds/MoodBoard/05-implementation-addendum.md:42`; `supabase/functions/capture-from-url/quota.ts` | Verified | High |
| Pinterest is explicitly **not** integrated (N5, O2). The generic URL path "covers most of the need." | `03:204-206`; `00-mood-board-prd.md:363,390`; `README.md:127` | Verified | High |
| O3, board-to-spec auto-generation ("cut sheet or shoppable list from the board"), is called "the strategic direction." `buildSendToScheduleArgs` is "the existing half of it." | `00-mood-board-prd.md:188-189,391` | Verified | High |
| The audit's D9 found unfurl "inert": the SOURCE URL field stored text and fetched nothing. "Designers' top sourcing gesture." | `artifacts/mood-board-ux-audit-2026-08-31/synthesis.md:21`; `prod-test/report-followup.md:20`; panel `marisol-solo-designer.md:37`, `devon-studio-designer.md:30` | Verified | High |
| W3b fixed D9 ("unfurl was a never-wired field, pipeline itself fine") and added DV3 bulk "promote all." Merged in PR #41 (`a7246d9cb`). | `build/PROGRAM.md:23,36,38`; `git log` | Verified | High |
| DV3: materializing a template strips owner links, so N boards meant N manual promotions. The fix is `board-promote-all-panel.tsx`, which promotes every unlinked product or capture pin in one pass, **not gated on client approval**. This is the right pattern for "promote all imported products." | `apps/designer-portal/src/components/mood-board/board-promote-all-panel.tsx:14-27` | Verified | High |
| Persona voice: "If the pieces on my board carried real price and vendor data end-to-end … that's the whole reason I wouldn't just screenshot a vendor page into Canva." | `panel/marisol-solo-designer.md:54` | Verified | High |
| "The procurement wiring itself (product pins carry price/vendor, send-to-schedule) is real and is the actual differentiator." | `panel/devon-studio-designer.md:41` | Verified | High |
| The audit recommends Path B (client loop) first and Path C (sourcing) for "studio-seat growth." The import belongs to Path C. | `synthesis.md:39-48` | Verified | High |
| In-repo ethnography: "Proposals / approvals: Static PDFs/PowerPoints, email chains…" and sourcing via "Screenshots, 'a random Google Doc,' … spreadsheets." Studios run "4–8 disconnected tools." | `artifacts/studio-hook-2026-09-22/research/07-studio-ethnography.md:49,51,58` | Verified | High |
| The gap analysis tags Studio Designer's board as "PowerPoint-based." | `docs/product/designer-portal-workflow-gap-analysis.html:695` | Verified | Medium |

---

## 3. Infrastructure the import would sit on (verified in code)

| Building block | Where | Relevance | Confidence |
|---|---|---|---|
| **No PPTX parsing exists.** The only `.pptx` mentions are a test fixture filename. | `supabase/functions/_tests/cowork-intake-bridge.test.ts:191` | Greenfield | High |
| **Document-extraction precedent.** Uploads to `<project>/source-documents/<sha256>.(pdf\|jpg\|png\|webp)`. The source is read as the caller under storage RLS. Calls `claude-sonnet-5`. Returns rows with `provenance.page`, `confidence` and `state:"unconfirmed"`. **PPTX is not an accepted type.** | `supabase/functions/project-ffe-document-extract/index.ts:84-90`; `lib.ts:10-11,20,145-152,174` | Closest pattern to copy, including the unconfirmed-state rule | High |
| **URL capture.** Server-side fetch behind SSRF guards. Extraction order: Open Graph → JSON-LD Product (`offers.price`, `brand`) → `<title>` fallback. Returns `ExtractedProduct` for a personal-layer draft. Has `mode:'refresh'`. | `supabase/functions/capture-from-url/index.ts:1-19`; `extract.ts:4-10,111,150-216` | Handles every hyperlink found in the deck | High |
| **Pin vocabulary.** Six types: `product`, `capture`, `image`, `palette`, `note`, `room_scan`, plus section bands. | `03:65-67` | Maps onto slides: slide → section, cutout → image pin, matched product → product/capture pin, legend text → note | High |
| **Send-to-schedule.** Pin → `proposal_item`: name, image, `unit_sell_price = priceCents ?? 0`, product id and room carry through, auto doc code. Twin guard on product+room. | `apps/designer-portal/src/lib/scope/board-schedule.ts:45-82` | The "flow into ordering" step already exists | High |
| **Price drift.** `computeBoardDrift`, the "price moved" population. | `board-schedule.ts:93` | Imported prices go stale; drift covers linked products | High |
| **Image embeddings.** `aesthete-inference` (FastAPI). `POST /embed/image {inputs:[{id,url}]}`, batch ≤16, **URL inputs only**, token-auth, no DB access. Model is nomic-embed-vision-v1.5 int8 ONNX, 768-d, in the same space as nomic text. | `services/aesthete-inference/app/main.py:4-11,204`; `models/manifest.json` | Engine for matching against Patina's catalog | High |
| **Product vectors.** `products.aesthete_vector` vector(768) is **fused: 0.65·mean(image embeddings) + 0.35·caption**. HNSW cosine index. No image-only product vector exists. | `supabase/functions/aesthete-embed-worker/lib.ts:20-21,497`; `supabase/migrations/00239_aesthete_space.sql:27-28,196-201` | Querying with a pure image embedding against a fused vector is approximate. An image-only column may be needed for true photo match. | High on the fact; Medium on the quality impact (inference) |
| **Layer-safe kNN.** `aesthete_ask_knn(p_embedding, p_filters)` is SECURITY INVOKER, so products RLS applies (personal + studio + catalog; other studios' shelves stay invisible). It says the **00008 DEFINER similarity RPCs "are NOT layer-safe; … must never use them."** | `supabase/migrations/00247_aesthete_ask_knn.sql:10-20,32` | Photo match must use the 00247 path, never `find_similar_products` | High |
| **Background removal** is specced behind a media-service endpoint with a vendor and budget caps. It is "intentionally disabled" in prod. | `03:208-252`; `06-acceptance-evidence.md:200` | PPT cutouts often already have transparent backgrounds. For collaged photos, isolating each product before matching may need this. | Medium |
| **Bucket.** `proposal-mood-boards` is public-read; upload path `${ownerId}/boards/${boardId}/${uuid}.${ext}`; orphan sweep. | `03:39,267-287` | Imported media lands here. The sweep must count import references. | High |
| Board → client → approved → procurement panel. | `components/mood-board/board-approved-pins-panel.tsx` | Downstream of the import | High |

---

## 4. External research: how designers build boards today

### Tools and layouts

| Finding | Source | Confidence |
|---|---|---|
| Boards are built in **Canva, PowerPoint, Google Slides and InDesign**. Templates sold for all of them, often "Canva, PowerPoint, and Google Slides" in one kit, 16:9. Keynote rarely appears. | Etsy and Gumroad template listings; QC Design School | High |
| Common deck structure: brief → vision → **mood boards → concept boards** → key elements → layout → feedback → next steps. Kits include "grid concepts, collage styles, color palettes, specifications, samples, and floor plans." | Etsy listing 4492150867 and others | Medium-high |
| **Links are kept by hand.** Templates include a separate "**Shopping List with links**" page. Canva kits sell turning "your design concept into a clickable shopping list." | Gumroad and Etsy listings | High (the pattern); Medium (how common) |
| A practitioner on Julie Blanner's blog: "we take the photos out and use them in PowerPoint to create decks of the entire house **with links to the original source** so we can easily track changes." | julieblanner.com comment | Medium (one voice) |
| Studio Designer presents with "a **branded PowerPoint template**." Its customers produce PPT boards. | DesignFiles comparison blog (vendor) | Medium |
| Where product links usually live in a deck: **(a) hyperlinked images, (b) a text legend or caption with vendor name, (c) a shopping-list slide, (d) speaker notes.** | Inferred from the template evidence above. No survey found. | Medium |

Canva, Keynote and Google Slides all export to PPTX, so a PPTX importer would cover them all. I did not verify this.

### Pain, with sources (most of it vendor-sourced)

- **Rebuilding.** "rebuild the board from scratch when the client says the palette is too warm … Repeat **two to four times per project**." No source is cited for the number. (Planify, vendor)
- **Disconnection.** Boards live "in a tool that has **no connection to the FF&E schedule**, the budget, or the approval record"; "When the mood board and the FF&E schedule live in separate tools, this connection exists **only in the designer's head**." (Planify)
- **Versions.** Exported Canva files become "static"; "mood board v3 alongside the two previous versions"; "**Neither tool produces a record of what the client approved.**" (Planify)
- **Copy-paste breaks provenance.** Canva lets you "copy and paste images from the web," which is exactly how the link back to the product is lost. (Spaces by Dee and similar)
- **In-repo ethnography** (VERIFIED Capterra): sourcing via screenshots, a random Google Doc, emailing yourself a product code; 4–8 disconnected tools. `07-studio-ethnography.md:49,58`
- **Gap in the evidence:** Reddit cannot be reached from this environment (here and in the earlier ethnography, `07-studio-ethnography.md:105`). First-person pain about PowerPoint boards is thin. **Recommend 3–5 designer interviews, starting with Leah, asking "show me your last PPT board."**

### Competitors: import and visual search

| Product | Import into board | Clipper / URL | Visual search | Board → order | Confidence |
|---|---|---|---|---|---|
| **Programa** | Pinterest library, computer, any website, "import from InDesign" (search snippet; not confirmed on the blog page) | Web Clipper; "Instant Product Import" fills specs from a URL | None found | Separate Specs and Procurement modules; the blog does not describe pinboard → spec flow | Medium |
| **Houzz Pro** | Upload, by-URL image, Houzz ideabooks, product library | Chrome Clipper (≤5 images per clip; "Autofill with AI"); "AutoMate" URL import in Selection Boards | Not in Pro. Consumer Houzz has Visual Match (2016) and app Visual Search | Selections → proposals | High |
| **DesignFiles** | "Instant Uploads": drag, drop or paste images, no item details | Product Clipper; 2M+ vendor catalog | None found | Approvals → quotes, invoices, POs (per PRD research) | Medium-high |
| **Mydoma** (Studio Designer since July 2024) | Image upload only; boards called "very basic" (Capterra) | — | None found | — | Medium |
| **Studio Designer Catalog** (4 May 2026) | Design Boards from the catalog; **no PPT/PDF import** | Studio Capture | **Yes: "upload an image to find products that match a piece you already love"** across 500k+ SKUs from 250+ trade brands | "convert it into a project item in one click … no re-entry" | High |
| **Material Bank** | Upload images; Pinterest import (needs connected account); 2MB per file (NYSID guide) | — | **SmartMatch: matches for any board item, "whether from the catalog or an uploaded image"** | Sample ordering; Excel finish schedule | Medium (post is about two years old) |
| **Mattoboard** | Upload web images and photos; Mattoshift | — | None found | Material Sheet with supplier links | Medium |
| **Gather** | — | Chrome Clipper into visual boards | None found | FF&E spec system | Medium |
| **Morpholio Board** | — | Clipper saves the link back automatically | — | Automatic sourcing lists and cut sheets with live links (Pro tier); **exports** 16:9 PowerPoint slides | Medium-high |
| **Miro** (generic) | **Imports MS Office and PDF files, can extract pages** | — | — | — | High |

**No design-industry tool advertises importing an existing PPTX or PDF board into a board with its products.** The workaround everywhere is to export slides as images and upload them flat, which loses links and prices (DesignFiles, Mydoma, Studio Designer search results). Confidence is medium-high: it rests on absence across docs and marketing.

Studio Designer (May 2026) and Material Bank already ship "upload an image, find matching products" against their own catalogs. Photo match is becoming expected in the category, not a differentiator. **What is unclaimed is the whole sequence: deck → extracted links → photo match → schedule → PO.** Inference, medium-high.

### Options for matching against the open web (high confidence)

- **Bing Visual Search: retired.** All Bing Search APIs were shut down 11 Aug 2025 and old calls return 410.
- **Google Vision Product Search: maintenance mode.** Its suggested replacement (Vertex AI Vision Warehouse) reached end of life 30 Sep 2026. Product Search also only searches a catalog *you upload*, not the web.
- **Google Cloud Vision Web Detection: live.** Returns full, partial and similar matching images plus page URLs. This is the closest sanctioned Lens-like option.
- **No official Google Lens API.** SerpApi and Apify Lens scrapers exist, with ToS and fragility risk.
- **TinEye and Lenso** have paid APIs. Exact-image match suits stock and inspiration photos less than product shots (inference).
- Designers themselves use Google Lens, Pinterest Lens and Amazon StyleSnap. Known weakness: custom and boutique pieces return lookalikes. Tip: **crop to the single piece first** (Coohom, April 2026).

The cropping tip matters for the design. Each product cutout in a PPT is already a separate, cropped image, which should make matching much easier than matching a room photo (inference, medium-high).

---

## 5. Deck format facts (OOXML spec knowledge, not checked against a sample file; medium-high confidence)

**Where the content sits**
- A `.pptx` is a ZIP file.
  - Images: `ppt/media/*`
  - Slides: `ppt/slides/slideN.xml`, with relationships in `ppt/slides/_rels/slideN.xml.rels`
  - Notes: `ppt/notesSlides/`
  - Slide size: `p:sldSz` in `ppt/presentation.xml`
- **Picture hyperlinks:** `p:pic/p:nvPicPr/p:cNvPr/a:hlinkClick r:id`, resolving to a rel with `TargetMode="External"`.
- **Text hyperlinks:** `a:rPr/a:hlinkClick`.
- **Alt text:** `p:cNvPr@descr`.
- **Geometry:** `a:off`/`a:ext` in EMU (914,400 per inch); crop in `a:srcRect`; rotation `@rot` in 60,000ths of a degree; groups `p:grpSp` with child offsets that must be composed.
  - Together these map almost directly onto pin geometry (x, y, w, h, rotation, z from document order).

**Edge cases**
- Images can be linked (`r:link`, external, may be dead) rather than embedded.
- Images can be EMF/WMF or SVG (`asvg` extension).
- Images can sit in slide backgrounds or layouts/masters.
- Pasted screenshots often bundle many products into one image, which needs cropping before matching.
- PowerPoint's online-image insert adds an attribution caption with a link. That link is a licence URL, not a product URL, and must not be treated as a product link (medium).

**Where to run it (inference)**
- Decks of 50–200MB with hi-res images likely exceed edge-function memory and time limits. Better hosts: the media service (NestJS, R2) or `aesthete-inference` (Python, where python-pptx is available), queued through the existing job pattern.

---

## 6. Suggested flow for the next phase (inference only, for the planner to test)

1. **Upload** the deck. Store the source deck. A job extracts per slide: images with geometry and crop, hyperlinks (image and text), text frames (captions, legends, vendor names, prices), speaker notes, slide titles (likely room names).
2. **Rebuild the board.** One section per slide (or one board per slide, as a choice), placed by geometry. Original imagery is kept and tagged `imported_deck`.
3. **Resolve, with confidence decreasing at each step:**
   - (a) A hyperlinked image goes to `capture-from-url`. Bulk quota is needed (`05:42`).
   - (b) A caption or legend URL or "Vendor – Name – $price" text gets bound to the nearest image, using the extract-function pattern (LLM, unconfirmed state).
   - (c) If still unmatched, embed the image and query the studio's own and catalog products through `aesthete_ask_knn` (layer-safe).
   - (d) Optionally, match against the web via Cloud Vision Web Detection and feed the resulting candidate URLs back into `capture-from-url`.
4. **Review sheet** (a ledger, per V11). Rows: imported image → proposed product, with source and "likely/possible" wording. The designer confirms. Unresolved items stay as image pins, so nothing silently disappears (R3.3.1 idiom).
5. **Promote and order.** Use the existing bulk-promote panel (DV3) and `buildSendToScheduleArgs` to create schedule lines, then the existing PO path.

### Open questions for rulings

- Does the import create a board, a schedule, or both?
- Does an imported price count as retail (sell side, per `board-schedule.ts:57-58`) or trade?
- V1 margin on off-marketplace products.
- Is matching against the open web in scope, given N5's spirit and the API landscape?
- Should imported inspiration (stock or Pinterest) ever show on client pages (PP-4)?

---

## Sources

- [Etsy: Interior design mood board presentation (Canva/PPT/Slides)](https://www.etsy.com/listing/4492150867/interior-design-mood-board-presentation)
- [QC Design School mood board guide](https://www.qcdesignschool.com/blog/2025/08/interior-design-mood-board-ideas-and-step-by-step-guide)
- [Planify: Mood board software for interior designers](https://planify.design/blog/mood-board-software-interior-designers/)
- [Julie Blanner: How to make a mood board](https://julieblanner.com/design-your-room/)
- [Spaces by Dee: mood board tools](https://www.spacesbydee.com/the-best-interior-design-mood-board-software-tools/)
- [Programa: Role of mood boards](https://programa.design/blog/the-indispensable-role-of-mood-boards-in-interior-design)
- [Programa features](https://programa.design/features)
- [Houzz Pro mood board](https://pro.houzz.com/for-pros/feature-mood-board)
- [Houzz Pro Clipper help](https://pro.houzz.com/pro-help/r/using-the-clipper-tool-with-houzz-pro)
- [Houzz Visual Match](https://blog.houzz.com/houzz-introduces-visual-match-making-it-even/)
- [DesignFiles moodboard editor](https://join.designfiles.co/features/moodboard-editor/)
- [DesignFiles: Mydoma vs Studio Designer](https://blog.designfiles.co/mydoma-vs-studio-designer/)
- [Mydoma Capterra reviews](https://www.capterra.com/p/155585/Mydoma-Studio/reviews/)
- [Studio Designer Catalog (May 2026)](https://www.studiodesigner.com/blog/introducing-catalog-the-sourcing-experience-interior-designers-have-been-waiting-for/)
- [Material Bank Boards / SmartMatch](https://blog.materialbank.com/inside-the-redesigned-material-bank-boards/)
- [Mattoboard Material Sheets](https://blog.mattoboard.com/blogs/introducing-mattoboards-material-sheets)
- [Gather](https://gatherit.co/)
- [Morpholio Board](https://www.morpholioapps.com/board/)
- [Coohom: apps to identify furniture from a picture](https://www.coohom.com/article/best-apps-to-identify-furniture-from-a-picture-compared)
- [LOOMLAN visual search](https://loomlan.com/pages/visual-search)
- [Spacely AI furniture finder](https://www.spacely.ai/tools/ai-furniture-finder)
- [Google Vision Product Search docs (maintenance mode)](https://docs.cloud.google.com/vision/product-search/docs)
- [Google Vision Web Detection](https://docs.cloud.google.com/vision/docs/detecting-web)
- [Apify: no official Google Lens API](https://apify.com/api/google-lens-api)
- [Bing Search API retirement](https://www.webpronews.com/microsoft-to-sunset-bing-search-apis-by-august-11-2025-pushing-developers-toward-azure-ai-integration/)
- [Miro: uploading files to boards](https://help.miro.com/hc/en-us/articles/360017731013-Uploading-files-to-boards)