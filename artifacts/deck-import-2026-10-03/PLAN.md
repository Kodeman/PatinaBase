# Bring in a Deck: PowerPoint mood board → living board → order

## Context

Kody asked for a team to study how designers build mood boards: start from a feel, iterate, pull in product, then bring that product in for ordering. He also asked for a flow that ingests a designer's existing PowerPoint board. It should extract the products and links, and photo-match pictures that carry no link.

The team was a 9-agent read-only workflow (`wf_68dc87ca-ca7`): 6 investigators, then 3 design lenses (designer experience, pipeline quality, ship slices). Full reports are in session scratchpad `team/`; they get copied to `artifacts/deck-import-2026-10-03/` at execution start.

**What the team found (verified in code):**

1. **The ordering half is broken today, before any import exists.**
   - **Promote on project boards.** `usePromoteBoardReferenceToSelection` sends no `name` (`packages/supabase/src/hooks/use-project-ffe-ga.ts:196-215`). Any pin without a product therefore becomes a $0 "Named need" with no vendor and no URL, or raises an exception (`00447:233-237`). This covers every template pin, since templates write NULL product ids (`00408:545`), and every pasted-URL pin.
   - **Send-to-schedule on proposal boards** (`apps/designer-portal/src/lib/scope/board-schedule.ts:63-79`):
     - It drops `vendor_id`/`vendor_name` and `source_url`.
     - It writes the retail price as trade.
     - It never stamps `data.proposalItemId`, so activation reconcile can't link pins to their lines.
     - It has no dedupe for pins without a product.
   - **Purchase orders** need `vendor_id`, `design_disposition='selected'` and a client price above 0 (`00449:125-133`, `00445`). Every promote caller passes `candidate`.
2. **An image pin can never become a product.** Only `product`/`capture` pins promote. Canvas URL-paste creates a `capture` pin with no product and no capture row (`url-unfurl.ts:375-399`). That skips the capture pipeline the PRD (D2) required. So the "feel → product" step has no path.
3. **Nothing in the repo reads a .pptx.** Dropping one on the canvas sends it to the image pipeline, where it fails with a generic error (`board-room-shell.tsx:1632`).
4. **Most of the pipeline parts already exist:**
   - `capture-from-url` `extract.ts`/`ssrf.ts` (OG + JSON-LD extraction)
   - `commit_proposal_capture` (00516; idempotent, needs `auth.uid()`)
   - `resolveVendor`
   - `aesthete-inference` `/embed/image` (nomic-vision 768-d; URL inputs only)
   - `products.aesthete_vector`: a *fused* 0.65 image / 0.35 caption vector, so it finds style, not the exact SKU
   - `aesthete_ask_knn` (00247; SECURITY INVOKER, layer-safe)
   - The forced-tool Claude pattern in `project-ffe-document-extract`
   - `board-promote-all-panel.tsx`
5. **Market.** No competitor imports a PPT/PDF board with its products. Studio Designer (May 2026) and Material Bank ship catalog photo match, so photo match alone is table stakes. The full deck → links → match → schedule → PO chain is not offered by anyone.
   - Open-web matching options: Bing Visual Search is retired. Google Product Search is in maintenance. Google Lens is reachable only through SerpApi, which is in litigation with Google (hearing 2026-10-13). **Google Cloud Vision Web Detection** is the only sanctioned option ($3.50 per 1k after the first 1k).
6. **Vision feature test passes.**

| Test | Answer |
|---|---|
| Surface | The Document (#1) |
| Studio moment | Adding first hands without learning a new system |
| Stream | Furniture margin (first dollar) |
| Promise | "Won't notice Patina" |

   Framing: present it as **Capture (#4), not the Engine**. Main risk: **"launching to an empty room"**. The catalog is probably small (hundreds to low thousands of products), so links and the studio's own library carry v1, and photo match is supporting.

## The designer flow (end state)

1. **Bring in.** Entry points:
   - drop a `.pptx`/`.ppsx`/`.potx` on the board canvas
   - "Bring in a deck…" in the add-rail Uploads tab
   - "From a deck" as a 4th option in the board create picker
   - ⌘K "Bring in a deck"

   No new pages and no new tabs (V7). `.ppt`/`.key` get "Re-save as .pptx".
2. **Lay it out** (in the browser, ~1 min). A `DocSheet` shows a slide filmstrip, a target (this board or a new board) and one action, "Lay it out".
   - Each slide becomes a **board section** named from its title, with pins at the slide's geometry.
   - Pins are placed by role:
     - product-role picture → `capture` pin in the *to confirm* state, holding her cropped image
     - inspiration picture → `image` pin with `provenance: imported_deck`
     - free text → `note` pin
     - logos and layout/master images → dropped
   - The room head shows a mono line, "Laying out · slide 12 of 40". No bars.
3. **Finding pieces** (server side; continues after the tab closes). The room head shows "Finding pieces · 23 of 38". Pins update in place with a mono caption, e.g. "likely · Cove sofa, Four Hands". No pills, no percentages.
4. **Review ledger** (wide `DocSheet` drawer, grouped by slide).
   - Front matter: "38 pieces · 21 by link · 9 by look · 3 named on the slide · 5 not found yet".
   - Each row: her crop, what Patina found, *how* it was found ("From the link on the slide" / "Named on the slide" / "Likely, by look" / "Possible, by look" / "Not found yet").
   - Actions: **Keep · Swap · Paste a link · Keep as reference**. Keyboard: j/k/Enter/s/l/r/u.
   - The only bulk action is "Keep every piece found by its link", and only where the page photo agrees with the deck photo. Look matches are kept one row at a time.
5. **Onward to ordering**, at the foot of the ledger: "Put 30 pieces on the schedule".
   - These are her selections, so they go in as `selected` (R-DI2).
   - The deck owner kind decides the path: the generalized promote-all loop for a project, a bulk send-to-schedule for a proposal.
   - Then the existing per-vendor OrderAssistant. `po-send` is never sent automatically.
6. **Find this piece.** The same resolver is available as an inspector action on **any** image pin, deck or not. This closes the general "iterate and pull in product" gap.

## Architecture (decisions where the lenses disagreed)

- **Parse in the browser for v1.** Not in an edge function, which is limited to 256 MB and 2 s CPU.
  - Lazy-loaded `fflate` (filtered unzip, zip-bomb caps) plus native `DOMParser`.
  - SheetJS lazy-load is the precedent.
  - The deck is **not uploaded or stored**, which avoids PII in speaker notes.
  - Only the cropped images travel, through the existing `uploadFilesAsBoardItems` / `upload-board-assets.ts` / `prepareProjectReviewMedia` path, so buckets, GC and review media are unchanged.
  - Fallback if the size spike fails: a `/deck/parse` route on the existing `aesthete-inference` container (python-pptx + lxml, XXE off).
- **The client materializes all pins; the server never inserts pins.** `apply_board_room_state` deletes any item missing from a whole-state save (00411). Server resolutions come back as pin *patches* that the client applies through the room's command path, so they can be undone.
- **Parser rules:**
  - Slide order from `sldIdLst`, never from file names.
  - Walk only the slide `spTree`; ignore layout and master.
  - Images from `p:pic`, picture-filled `p:sp`, table-cell fills, and a single `mc:AlternateContent` branch.
  - `srcRect` crop applied **before** upload.
  - Group affine transforms composed.
  - SVG uses its PNG fallback.
  - `r:link` http(s) only. EMF/WMF are listed as "couldn't read" in v1.
  - Links come from picture/shape `hlinkClick`, text runs, ≥50% overlay shapes, and bare URLs in text and notes.
  - Licence/attribution hosts and `ppaction://` are denied.
  - Auto alt text ("…automatically generated") is flagged and weighted low.
- **Caption association.** A deterministic scorer runs first: link on picture > shared group > caption above/below > grid/Hungarian assignment. Slides with a low margin go to Claude (forced tool, picks element **IDs**, never coordinates), following the `project-ffe-document-extract` pattern.
- **Resolution tiers** (edge function `board-deck-import-resolve`). Every result is held unconfirmed until Keep (V10 precedent).

| Tier | Source | How | Band |
|---|---|---|---|
| T0a | URL already in a visible product's `source_url` | normalized URL match | strong |
| T0b | link on the slide | `extractProduct` + `fetchHtml` lifted to `_shared/product-page/`. og:image ↔ deck crop check | strong / likely |
| T0c | caption SKU + vendor | `products.vendor_sku` match | strong |
| T1 | words | caption → `search_products_text`/FTS, SKU first | likely / possible |
| T2 | look | crop → signed URL → `/embed/image` → kNN | likely needs top1 ≥ τ and a margin over top2. Fused-vector hits are capped at **possible** until `product_image_vectors` lands |
| T4 | web (opt-in, R-DI1) | Vision Web Detection → retailer-domain filter (`RETAILER_MAP` + `vendors.website`) → T0b extract | likely / possible, never preselected |

- **Studio isolation for kNN.** `aesthete_ask_knn` is INVOKER, but the cron continuation runs as service_role. Add a service-role-only DEFINER twin, `board_deck_import_match_knn(import_id, vec, limit)`. It applies the 00152 visibility rules for `import.created_by` and gets a pgTAP **parity test** against `aesthete_ask_knn` under that user's JWT. Never use the 00008 DEFINER RPCs.
- **Keep** runs `commit_proposal_capture` as the designer (uuidv5 `client_capture_id`, so it is idempotent). This also closes the D2 gap. The vendor comes from `resolveVendor`. Keep returns the pin patch: `product_id`, `capture_id`, name/vendor/price/source_url. The deck crop stays as the image, and the maker photo goes in `data.product_image_url`.
- **Data model.** Migration numbers are minted per patina-db-migrations / patina-parallel-work, starting at 00676 (the next free number when the branch is cut).
  - `board_deck_imports`: board_id, created_by, file_name, file_sha256, slide_count, options, status, `UNIQUE(board_id, file_sha256)`. Re-dropping the same deck resumes it.
  - `board_deck_import_items`: element_key, board_item_id, slide, role, extracted jsonb, state, found_by, candidates jsonb (≤5), chosen_product_id, attempts/lease columns.
  - RLS: read for co-members who can manage the board; all writes go through SECURITY DEFINER RPCs: register, attach_pins, claim (SKIP LOCKED), record_resolution, keep/swap/reference/unkeep.
  - A separate per-import and per-studio link quota. The paste quota of 10 per 10 minutes stays as it is.
  - pg_cron `dispatch_board_deck_import_resolve()` → `job_runs` + `invoke_edge_function`, shaped like `dispatch_board_asset_gc`. It does not use `agent_tasks`, whose assignees are admin only.
  - Pin provenance lives in `data.deck_import` / `data.provenance`, so the board schema doesn't change.
- **Later: exact matching.** `product_image_vectors` (product_id, image_hash, vector(768), phash, model_version, source, studio_id; HNSW). It is filled by `aesthete-embed-worker/lib.ts:161-245`, which already computes these vectors and then throws them away. Designer-confirmed crops are stored with `source='designer_confirmed'`, scoped to the studio. That is taught signal: the next deck from the same studio gets an exact hit.

## Delivery: waves (each behind a fail-closed PostHog flag, each useful alone)

Execution runs through the Sidequest board, using the **user-story** skill: story, tickets, executor waves, and an adversarial review for each wave. No inline execution.

| Wave | Contents | Flag |
|---|---|---|
| **0 · Spikes** (read-only, parallel) | (a) Prod check: is the inference worker healthy? `aesthete_vector` counts by layer, and catalog size (patina-prod-ops, read-only SQL + `/healthz`). (b) 3–5 real decks, **supplied by Kody** (Leah's last PPT board plus 2–4 more), kept **outside the repo** (e.g. `~/patina-deck-samples/`) because of client PII: where do the links live? Synthetic fixtures are generated from what these show. (c) Hit rate of `extractProduct` on the harvested links, by retailer. (d) Browser memory and time on a 100 MB deck. | — |
| **1 · Ordering chain fixes** (also fixes today's boards) | Promote sends `name` + `sourceMetadata` (source_url, price, vendor). `buildSendToScheduleArgs` carries vendor id/name and source_url (in `custom_fields`), stamps `data.proposalItemId`, and dedupes. A selection-vs-options choice on bulk promote. First SQL test of `promote_board_reference_to_selection`. | none (bug fix) |
| **2 · Lay it out** | Browser parser (`apps/designer-portal/src/lib/deck-import/`: parse-pptx, associate, classify-role, layout). Deck sheet with the 4 entry points. `uploadFilesAsBoardItems` refactored to take per-file point/size/data. Drop-intercept fix. Migration: imports and items tables + register/attach RPCs. | `board-deck-import` |
| **3 · Links and words** | `board-deck-import-resolve` (core.ts/index.ts split, like `paperwork-upload`). `_shared/product-page/` lift with a re-export shim. T0/T1 tiers, quota, cron dispatch, review ledger with Keep/Swap/Paste/Reference, Keep through capture, and "Put N pieces on the schedule" for both owner kinds. | same |
| **4a · Found by look + "Find this piece"** | T2 via the DEFINER kNN twin + pgTAP parity. Health-probe billing guard. Inspector "Find this piece" for any image pin. Calibration on a labelled set of ~300 crops to set the τ thresholds (stored in `artifacts/`). | `board-photo-match` (also hidden if the visible vector count is below a minimum) |
| **4b · Search the web** (in v1 per Kody; runs alongside 4a) | `board-web-match` edge fn: crop sent as base64 to Vision Web Detection → `pagesWithMatchingImages` filtered to retailer/vendor domains → T0b extract, accepted only if the page has JSON-LD `Product`. Migration: per-studio monthly cap ledger (`consume_board_web_match_budget`), with the cost recorded per call. Ledger shows "Search the web for this piece" per row, plus "for the N not found yet" (designer-pressed, metered, never automatic). Full match → likely; partial → possible; never preselected. SerpApi/Lens, Pinterest and Amazon scrapers are excluded. **Kody action:** create the Google Cloud project, enable the Vision API, set the `GOOGLE_VISION_API_KEY` secret on Strata, and decide the per-studio cap (proposed 500/month). Without the key the function returns 503 and the UI is hidden. | `board-web-match` + key present |
| **5 · Precision** | `product_image_vectors`, embed-worker keep + backfill, the designer-confirmed taught signal, T1 exact pHash. | `board-photo-match` |

Waves 2 and 3 depend on wave 1, so they run in sequence. 4a and 4b can run in parallel once wave 3 lands.

Deferred (logged in VISION-DECISIONS, not built): splitting collage images (Grounding DINO / OWLv2), LibreOffice for EMF and `.ppt`, PDF decks via pdfjs.

## Rulings

These are assumed as defaults now and get written into `VISION-DECISIONS.md` as V13 sub-items. They must not be resolved in code.

| Ruling | Question | Default |
|---|---|---|
| R-DI1 | Web match (paid Vision API, per-studio cap) | **RULED 2026-10-03: in v1** (wave 4b), opt-in per piece, capped per studio |
| R-DI2 | Disposition when bulk-promoting deck pieces | **RULED 2026-10-03:** her choice on the sheet, defaulting to `selected` |
| R-DI3 | Deck imagery on client shares (PP-4) | allowed with an `imported_deck` caption. Once matched, the share shows the maker photo |
| R-DI4 | Price basis | a price read from the deck or page is **retail / sell side**; trade stays empty until confirmed |
| R-DI5 | V1 margin on off-marketplace products ordered this way | still open; flagged, not blocking |
| R-DI6 | Keep the source deck? | **no** |
| R-DI7 | Can look matches be bulk-kept? | **no** |

Copy: no "AI", "smart", "auto-match", "curated" or "%". Don't use "Where Time Adds Value" until V5 is ruled.

## Verification (gate per wave; patina-verification)

- **Parser:** golden fixture decks in `lib/deck-import/__fixtures__`:
  - PowerPoint native, Keynote export (2× slide size), Google Slides export, Canva export
  - grouped/rotated/flipped shapes, negative crops, overlay link shapes, picture-filled shapes, SVG fallback, `r:link`-only pictures, zip bomb
  - Jest asserts slide order, geometry within ±1 unit, and image↔caption↔link pairs.
- **SQL tests** (`supabase/tests`):
  - RLS isolation across studios
  - kNN twin parity vs `aesthete_ask_knn`
  - Keep run twice creates one product
  - re-registering the same sha resumes
  - Keep → promote gives an FF&E line with product, vendor and price that is eligible for `create_purchase_order`
- **Deno tests:** resolver core with fetch, inference and Claude injected; quota; health-probe skip; lease expiry; 429 backoff.
- **Playwright e2e:** drop a fixture deck on a project board → sections named after slides → keep link rows → "Put N pieces on the schedule" → the OrderAssistant is enabled on those lines → PO is created as a draft and **not sent**. Also assert that promote is disabled on *to-confirm* pins.
- **Gates:**
  - designer-portal `pnpm --filter designer-portal type-check && test && build`
  - `pnpm supabase:reset` + SQL suite (coordinate the shared local DB lock)
  - `deno test` for new functions
  - a copy grep for banned words
- **Pilot:** Leah's real deck. Measure minutes from drop to a laid-out board, the share found by link/words/look, and the swap rate.

## Critical files

- `apps/designer-portal/src/components/mood-board/` — `board-room-shell.tsx`, `board-add-rail.tsx`, `board-promote-all-panel.tsx`, `board-room-inspector.tsx`
- `apps/designer-portal/src/components/portal/scope-builder/board-create-picker-dialog.tsx`
- `apps/designer-portal/src/lib/scope/board-schedule.ts`
- `apps/designer-portal/src/lib/mood-board-assets/`
- `packages/supabase/src/hooks/use-project-ffe-ga.ts`
- `packages/supabase/src/hooks/use-proposals.ts`
- `supabase/functions/capture-from-url/{extract,ssrf}.ts`
- `supabase/functions/_shared/aesthete.ts`
- `supabase/functions/aesthete-embed-worker/lib.ts`
- `supabase/functions/project-ffe-document-extract/` (pattern)
- `supabase/migrations/00247`, `00152`, `00435`, `00516`, `00411`
