# PowerPoint into Patina: designer-experience design for deck import, product extraction, photo match and ordering

## 0. Stance

The designer drops a deck she already presented. Within about a minute she has a Patina board laid out the way her slides were, and she can walk away. Behind it, Patina reads the links, the captions and the pictures and resolves pieces one at a time. When she comes back, one review sheet shows each piece and how it was found, in plain words. A keyboard pass of a few minutes confirms the pieces, and one closing action puts them on the schedule. Nothing becomes orderable until she confirms it, and nothing is sent outside the studio automatically.

Two decisions shape everything else:
1. **Slides are parsed in the browser, and the board is built through the board room's existing upload and save path.** Products are resolved on the server.
2. **Product candidates arrive as `capture` pins that carry the designer's own crop**, held as "to confirm". After confirmation they get a real `product_id` and follow the existing promote and schedule paths.

## 1. Entry points (no new pages, no new tabs)

| Where | Affordance | Wiring |
|---|---|---|
| Board room canvas | Drop a `.pptx`, `.ppsx` or `.potx` | Intercept in the `dropped` callback (`board-room-shell.tsx` ~1632). Today every file goes to `uploadFilesAsBoardItems` and fails at decode. Detect the deck by extension, zip magic and `[Content_Types].xml`, then open the deck sheet. |
| Board add rail, Uploads tab | "Bring in a deck…" link next to "Choose images" | `board-add-rail.tsx` uploads tab (~1020). V7 forbids new tab bars. |
| Board create picker | A fourth option, "From a deck", after Blank, Patina starters and Studio templates | `board-create-picker-dialog.tsx` (:112-119). The picker is hosted by `boards-builder.tsx` and `worktable/boards-strip.tsx`, which also covers the project worktable. It creates the board with the existing blank path (`useCreateProjectBoard` or `useUpsertBoard`), names it from the deck title, then continues into the deck sheet. |
| ⌘K | "Bring in a deck" (scoped to a project when ⌘K has project context) | `command-bar.tsx`. D9 as amended says capture belongs wherever the work happened. |
| Desk | **Nothing new.** The new board already shows in `RecentBoardsStrip`. | No card and no counter (V11, S4). |

## 2. The flow, moment by moment

**A. Deck sheet** (a `DocSheet` overlay, not a route)
- Shows the deck name, the slide count, and a filmstrip of slide previews composited in the browser from the extracted images at their geometry. No LibreOffice is needed.
- Two choices, with defaults set:
  - "Where it goes": this board, or a new board in a chosen project or proposal.
  - "Lay out as": "One board, a section per slide" (default). "A board per room" appears only when the board is project-owned and at least 2 slide titles match project rooms (ruling R1).
- One closing action: **"Lay it out"**. The sheet closes at once.

**B. Laying out** (in the browser; about 30–60 s for 40 slides and ~150 images [assumption])
- The board fills slide by slide.
- One quiet mono line in the room head reuses the existing `dropUploadProgress` idiom: "Laying out · slide 12 of 40". This is text, not a progress bar (V11 refuses bars).
- How each slide maps onto the board:
  - Each slide becomes one section (`MoodBoardSection {id,name}`). Its name is the slide title, or "Slide N".
  - Each slide gets its own frame on the canvas. Frames stack in reading order, single column, slide width scaled to about 1200 board units [assumption]. Every pin gets `data.section_id`. Section bounds are derived from members (`BoardSectionGeometrySnapshot`), so the slide's composition is kept.
  - Pin geometry: x and y from `a:off` × scale plus the frame origin, w and h from `a:ext`, rotation `rot/60000`, z from document order. Group transforms are composed.
- How each element becomes a pin:
  - **Product-role picture:** a `capture` pin. `imageUrl` is the designer's cropped image (the `srcRect` crop is applied before upload). `data.name` comes from the caption or a designer-written alt text, never PowerPoint's auto alt text. `data.deck_import = {import_id, item_id, slide, state:'to_confirm'}`.
  - **Lifestyle or inspiration picture:** an `image` pin with `data.provenance='imported_deck'`.
  - **Free text** (concept paragraphs, not consumed as a caption): a `note` pin.
  - **Ignored:** logos and layout/master images, slide backgrounds (by default), media, and EMF/WMF in v1, which is reported in the ledger as "1 picture we couldn't read".
- Images go through the existing `uploadFilesAsBoardItems` and `upload-board-assets.ts` path, so the owner-kind bucket, browser resize, project review-media prepare, batch cleanup and GC all apply unchanged.
- The pins are saved through the client's normal `apply_board_room_state`. **The server never inserts pins**, because whole-state saves would delete or clobber server-side inserts.

**C. Finding pieces** (server side, keeps running after the tab closes)
- The room-head line changes to "Finding pieces · 23 of 38 placed".
- When finished: **"38 pieces from the deck · 8 to confirm — Review"**.
- Canvas pins update in place:
  - A to-confirm pin keeps the deck crop and gets a mono caption under its label: "likely · Cove sofa, Four Hands" or "not found yet".
  - No dots, pills, badges or percentages (PP rulings).

**D. Review** (the deck ledger, a wide `DocSheet` drawer; D9: review lives in a drawer ledger, never a page)

Front matter uses `LedgerFrontMatter`, which is permitted because the total sits above its rows:
"38 pieces · 21 by link · 9 by look · 3 named on the slide · 5 not found yet".

Rows are grouped by slide (slide title as the group head, with a small slide preview). Each row has four columns:

| Deck crop | What Patina found | How | Acts |
|---|---|---|---|
| Her picture | Maker photo, name, maker, price, source host | "From the link on the slide" · "Named on the slide" · "Likely, by look" · "Possible, by look" · "Not found yet" | **Keep** · **Swap** · **Paste a link** · **Keep as reference** |

- **Swap** opens the next two or three candidates inline, plus "Search the library", which opens `ProductPickerModal` prefilled with the extracted caption text.
- **Paste a link** runs the capture pipeline for that row.
- **Keep as reference** turns the pin into an `image` pin with no product.
- The state column is a 1px-bordered text cell, allowed under HT-40.
- Keyboard: `j`/`k` to move, `Enter` to keep, `s` to swap, `l` to paste a link, `r` to keep as reference, `u` to undo.
- **The only bulk act is "Keep every piece found by its link"**, and only for link rows whose page photo agrees with the deck photo. Look matches are kept one row at a time (R3).
- The same Keep, Swap and Reference controls also appear in the canvas inspector for a selected to-confirm pin. The ledger and the canvas are two views of one state.
- Undo: "Unkeep" restores the deck crop and clears `product_id`. It is blocked once the piece is on the schedule, with the reason "Already on the schedule".

**E. Onward to schedule and ordering** (closing action at the foot of the ledger)
- **Project board:** "Put 30 pieces on the schedule" (shown with the count).
  - This is the `BoardPromoteAllPanel` loop, generalised: sequential calls, failures reported together, idempotency key `promote:{itemId}`, run over confirmed import pins.
  - Each call to `promote_board_reference_to_selection` passes `productId`, `name` and the room. Room comes from the slide-title → project-room mapping, editable per section.
  - A one-line choice before the action: "These are her selections" or "These are options". This maps to `selected` or `candidate` (R2). `selected`, together with the vendor from the confirmed product, is what `create_purchase_order` requires.
  - After that, ordering is the existing per-vendor OrderAssistant from `line-unfold.tsx`. Nothing is sent automatically; `po-send` stays a designer act.
- **Proposal board:** "Send 30 pieces to the schedule". This is a new bulk wrapper over `buildSendToScheduleArgs` and `useAddProposalItem`, and it requires the vendor and dedupe fixes in §6.

## 3. Resolution tiers (server)

These run per `board_deck_import_items` row, from strongest evidence to weakest. Every result is a **reading** held unconfirmed until she keeps it (the V10 precedent and `project-ffe-document-extract` `lib.ts:174`).

| Tier | Evidence | Action | Ledger wording |
|---|---|---|---|
| Link | Hyperlink on the picture; an overlay shape with ≥50% bbox overlap; a caption link; a URL in the notes. Licence/attribution URLs are skipped. | 1) Normalise the URL and dedupe against visible `products.source_url`. 2) Otherwise `extractProduct` plus `fetchHtml` imported from `capture-from-url/extract.ts` and `ssrf.ts`, under a new per-import and per-studio quota rather than `consume_board_unfurl_quota`. 3) Sanity check: embed the page's og:image against the deck crop. A disagreement downgrades the row to "possible". | From the link on the slide |
| Words | Caption or legend parsed for maker, name, SKU, price and dimensions (port `textToFields` and reuse `parsePriceToCents`) | `search_products_text` and FTS over layers visible to the caller; SKU match first | Named on the slide |
| Look | Product-role crop | Signed URL → `/embed/image` → `aesthete_ask_knn(vec,{category,limit:5})`. This is SECURITY INVOKER and layer-safe; never use the 00008 DEFINER RPCs. Thresholds for likely/possible come from calibration (§8). Skipped quietly if the inference health probe fails. | Likely, by look / Possible, by look |
| Web | **Not in v1** (R5). Later: designer opt-in per row, Vision Web Detection → retailer page → the same capture extract | — | — |
| None | — | The pin keeps the extracted text and the "Search the library" and "Paste a link" acts | Not found yet |

**Text association** (which caption or link belongs to which picture):
- A deterministic scorer runs in the browser while the manifest is built. Signals: link on the picture, overlay overlap, shared innermost group, caption below or above with x-overlap, grid assignment.
- Slides where the best and second-best pairings are close are sent by the resolver to Claude with a forced tool, the same pattern as `project-ffe-document-extract`. Claude gets the element JSON plus the crops and returns pairs by element ID.

**On Keep (confirm)**, the RPC does three things:
1. Creates the product through the capture pipeline, `commit_proposal_capture`, as a personal draft with the vendor resolved. This also closes the PRD D2 gap where URL pins bypass capture. Existing products are reused.
2. Sets the pin's `product_id` and `capture_id`, and `data.name`, `vendor_name`, `price_cents` and `source_url`.
3. Keeps the deck crop as `imageUrl` and stores the maker photo as `data.product_image_url`. The inspector offers "Use maker photo".

It returns the patch, and the client applies it at once (the same pattern as `onPromoted`), so the next whole-state save can't overwrite it.

## 4. Architecture and data model

**Browser:** `apps/designer-portal/src/lib/deck-import/`, all pure TypeScript and unit-tested:
- `parse-pptx.ts`:
  - fflate per-entry inflate, with caps on entry count, total bytes and compression ratio.
  - Slide order from `sldIdLst` and its rels.
  - Images from `p:pic`, picture-filled shapes and table cell fills; one branch of `mc:AlternateContent`.
  - `srcRect` crop, group affine transforms, placeholder inheritance, `hlinkClick`, `descr`, notes and tables.
  - The SVG's PNG fallback is used.
- `associate.ts`: the scorer.
- `classify-role.ts`: alpha channel, uniform border, area below 2% of the slide = icon.
- `layout.ts`: slide → section frames → pin geometry.
- `deck-import-sheet.tsx` and `deck-import-ledger.tsx` in `components/mood-board/`.

**Migration `00676_board_deck_imports.sql`** (number to be confirmed with the patina-db-migrations skill when it is minted):
- **`board_deck_imports`**:
  - `id`, `board_id` → `proposal_boards` ON DELETE CASCADE, `created_by`, `file_name`, `file_sha256`, `slide_count`, `options jsonb`.
  - `status ∈ {laying_out, resolving, ready, failed, abandoned}`, `created_at`, `finished_at`.
  - `UNIQUE(board_id, file_sha256)`: re-dropping the same deck resumes the import.
- **`board_deck_import_items`**:
  - Identity and placement: `id`, `import_id`, `element_key` (slide part + shape id; `UNIQUE(import_id, element_key)`), `board_item_id` → `proposal_board_items` ON DELETE SET NULL, `slide_index`, `slide_title`.
  - Content: `role ∈ {product, reference}`, `extracted jsonb` (caption, alt, links[], maker/price/sku/dimensions text).
  - Resolution: `state ∈ {pending, found, not_found, kept, reference, removed}`, `found_by ∈ {link, words, look}`, `candidates jsonb` (≤5: product_id or an extracted snapshot, score, source_url).
  - Bookkeeping: `chosen_product_id`, `attempts`, `next_attempt_at`, `lease_owner`, `lease_until`, `kept_by`, `kept_at`.
  - Candidates live here, not in pin `data`, because of the 256KB cap.
- **RLS:** SELECT for studio co-members who can manage the board (reuse the `can_manage_board_item_feedback`-style helper). No direct writes.
- **SECURITY DEFINER RPCs:**
  - `register_board_deck_import(board_id, sha, manifest)`
  - `attach_board_deck_import_pins(import_id, [{element_key, board_item_id}])`
  - `claim_board_deck_import_items(n)` (`FOR UPDATE SKIP LOCKED`, service role)
  - `record_board_deck_import_resolution(...)`
  - `keep_board_deck_import_item(item_id, product_id | extracted_snapshot)` (calls the capture commit, updates the pin under `app.board_state_rpc`, returns a pin patch)
  - `swap_` and `reference_` variants
  - `unkeep_board_deck_import_item`
- **pg_cron:** each minute, `dispatch_board_deck_import_resolve()` writes a `job_runs` row and calls `invoke_edge_function`. This follows the `dispatch_board_asset_gc` shape. It does **not** use `agent_tasks`, which is admin-assignee only.
- **Quota table:** `consume_deck_import_link_quota(import_id)`, for example ≤300 links per import and ≤1500 per studio per day [assumption].

**Edge function `board-deck-import-resolve`** (Deno, split into `core.ts` and `index.ts` like `paperwork-upload`):
- Two callers:
  - The client, with JWT and `{importId}`, once layout ends, so the first matches show within seconds.
  - Cron, with service role and `{job_run_id}`, to finish.
- Sized to the 60 s pg_net window.
- Billing guard: check eligible rows, then probe `/healthz` for the look tier, then claim.
- Calls Claude only for slides where the association is ambiguous.

**No new NestJS service and no new container in v1.**
- `aesthete-inference` is used only through its existing `/embed/image` and `/embed/text`.
- Phase C may add `/convert/emf` there, plus a server-side parse for PDF and legacy `.ppt`.
- The source deck is **not stored** by default: PII in notes, and nothing needs it once the manifest and crops exist (R7). If a ruling wants it kept, store it in R2 through the media service upload intent, which means adding the pptx MIME to `upload.service.ts`.

## 5. Reuse map

| Need | Reuse |
|---|---|
| Pin upload and media | `apps/designer-portal/src/lib/mood-board-assets/upload-board-assets.ts`, `project-review-media.ts`, `board-add-rail.tsx` `uploadFilesAsBoardItems` |
| Board save | `apply_board_room_state` (00411 chain), `board-room-controller.tsx` |
| Sections | `MoodBoardSection` and `data.section_id` (`packages/types/src/mood-board.ts:21,38`), `board-room-sections-menu.tsx` |
| URL → product | `supabase/functions/capture-from-url/extract.ts`, `ssrf.ts`; `commit_proposal_capture` (00516); `packages/supabase/src/lib/vendors.ts` `resolveVendor` |
| Photo match | `supabase/functions/_shared/aesthete.ts` (`embedImage`, `toPgVector`); `aesthete_ask_knn` (00247) |
| Signed URLs for inference | the pattern in `aesthete-embed-worker/lib.ts:184-197` |
| LLM adjudication | the forced-tool and validation pattern in `supabase/functions/project-ffe-document-extract/lib.ts` and `index.ts` |
| Cron and job runs | `invoke_edge_function` (00258), the `job_runs` dispatch in 00410 |
| Bulk promote | `board-promote-all-panel.tsx`, `usePromoteBoardReferenceToSelection` |
| Proposal path | `lib/scope/board-schedule.ts`, `useAddProposalItem` |
| Sheets and ledger | `components/document/overlays/doc-sheet.tsx`, `ledger-front-matter.tsx` |
| Library search fallback | `components/portal/proposals/product-picker-modal.tsx` |
| Price parsing | `parsePriceToCents` (extract.ts:111); port `apps/extension/src/lib/text-to-fields.ts` and `RETAILER_MAP` |

## 6. Fixes the import depends on (P0, which also fix today's board)

1. **Promoting an unlinked pin fails.** `usePromoteBoardReferenceToSelection` (`use-project-ffe-ga.ts:196-215`) sends no `productId` or `name`.
   - Extend the request to carry `productId`, `name` and `sourceMetadata` (source_url, price snapshot). The RPC already honours `p_request->>'productId'` (00435:478).
   - In the UI, disable promote and send-to-schedule on pins with `data.deck_import.state='to_confirm'`, with the reason "Confirm the piece first".
2. **Dropping a `.pptx` on the canvas goes to the image pipeline.** Route it to the deck sheet (§1).
3. **`buildSendToScheduleArgs` drops vendor and source, and has no dedupe for null products.**
   - Add `vendorId` and `vendorName` from the product.
   - Stamp `data.proposalItemId` back onto the pin (this also repairs activation reconcile).
   - Dedupe on `data.deck_import.item_id`.
4. **Inference may not be live in prod.** Confirm that the inference worker and the embed cron are running in prod (the dossier's docs conflict). Until they are, the look tier ships behind a flag and the import still delivers layout, links and named pieces.

## 7. Phasing

- **A. "Deck → living board"**, behind flag `board-deck-import`:
  - browser parse and layout
  - manifest RPCs
  - link and words tiers
  - ledger, Keep/Swap/Reference
  - bulk to schedule on both owner kinds
  - the P0 fixes
- **B. "Found by look"**:
  - the look tier with calibrated thresholds
  - the same resolver exposed as **"Find this piece"** in the inspector for *any* image pin (uploads, pasted images). This answers "iterate and pull in product" beyond decks.
- **C. Precision and breadth**:
  - an image-only product vector: `product_images(product_id, image_url, image_vector vector(768))` with HNSW, filled by the embed worker, which already computes and then discards these vectors
  - PDF decks via pdfjs (already in designer-portal): page images plus link annotations
  - EMF conversion in the container
  - an optional web tier (if R5 allows it)

## 8. Verification

1. **Parser golden fixtures** in `lib/deck-import/__fixtures__`, about 8 small decks:
   - PowerPoint native: hyperlinked pictures, transparent overlay links, caption grids, groups with rotation and flip, cropped and negative-crop pictures, SVG with PNG fallback, an `r:link`-only picture
   - Exports from Google Slides, Keynote (2× slide size) and Canva
   - Unit tests assert slide order, geometry within ±1 unit, crops, and image↔caption↔link pairs.
2. **SQL tests** (`supabase/tests`):
   - RLS isolation across studios
   - Keep requires a board manager
   - Re-registering the same sha resumes the import
   - Keep followed by promote produces an FF&E line with `product_id`, `vendor_id` and price
   - A first test for `promote_board_reference_to_selection`, which has none today
3. **Edge function Deno tests:** `core.ts` with fetch, inference and Claude injected; quota; health-probe skip; lease expiry and retry.
4. **Playwright e2e:** drop a fixture deck on a project board → sections named after slides → ledger shows link rows → keep all link rows → "Put N pieces on the schedule" as selections → the OrderAssistant button is enabled on those lines (vendor present, `selected`). Also assert that promote is disabled on to-confirm pins.
5. **Calibration:** a labelled set of about 300 deck crops matched to products. Measure R@1 and R@5 for each tier, set the likely/possible cut-offs, and record them under `artifacts/`. Thresholds are placeholders until then.
6. **Designer pilot:**
   - Leah's last real PowerPoint board, plus 3–5 studios asked "show me your last PPT board".
   - Measure minutes from drop to a living board, minutes in the ledger, the share of pieces found by link, words and look, and swap rate as a proxy for false matches.
   - Success bar [assumption]: layout under 2 min; at least 60% of linked pieces found without touching them.
7. **Copy gate:** grep the new strings for "AI", "smart", "auto", "match %" and "curated", and run a patina-brand-voice review.

## 9. Lexicon

- Use: "Bring in a deck", "Lay it out", "Laying out · slide N of M", "Finding pieces", "From the link on the slide", "Named on the slide", "Likely, by look", "Possible, by look", "Not found yet", "Keep", "Swap", "Keep as reference", "Put N pieces on the schedule", "These are her selections / options".
- Never use: AI, smart import, auto-match, confidence %, powered by, curated, or a match score as a number.

## 10. Risks

- **Empty room.** A thin catalog weakens the look tier. Links and captions carry v1, and every unresolved piece still lands on the board with its text and a path to the library or capture.
- **The fused `aesthete_vector` returns similar-looking pieces, not the exact SKU.** Wording reflects this ("possible"), look rows can't be bulk-kept, and phase C adds an image-only vector.
- **Whole-state save races.** The server never inserts pins and only patches them through RPCs whose patches the client applies at once. Concurrent editors were already a known gap (no presence).
- **Tab closed during layout.** The manifest is registered first. The file can't be re-read, so re-dropping the same deck (same sha) resumes by `element_key`. Resolution itself does not need the tab.
- **Very large decks in browser memory.** Inflate per entry and cap at about 300MB [assumption]. Legacy `.ppt` and `.key` get "Re-save as .pptx".
- **Image copyright and PP-4.** Proposal boards use the public bucket. Deck inspiration pins are tagged `imported_deck` and kept out of shares until a ruling (R4). Confirmed products share the maker photo.
- **Unfurl quota.** Bulk imports get their own per-import and per-studio budget. Per-host politeness: serial fetches per domain [assumption].
- **Claude cost.** Only slides with ambiguous pairings are sent; about $0.005 per image [dossier estimate].

## 11. Open questions needing a ruling (next vision id V13)

1. **R1:** Default layout: one board with a section per slide, or a board per matched room?
2. **R2:** Does pushing to the schedule from a deck default to `selected` (orderable) or `candidate`?
3. **R3:** Can look matches ever be bulk-kept?
4. **R4:** Can deck imagery (possibly stock or Pinterest) appear on client shares? (PP-4 honest imagery.)
5. **R5:** Is web matching (Vision Web Detection) in scope, metered per studio?
6. **R6:** Is a price read from a slide or page retail (sell side), with trade left to be filled in?
7. **R7:** Should the source deck be kept at all? (Default: no.)
8. **R8:** V1 margin on off-marketplace products ordered through the schedule.
9. **R9:** Storage split. Board crops stay in the existing Supabase board buckets, which the board room already uses; this conflicts with the stated "R2 via media service" rule.

### Critical Files for Implementation
- /Users/kody/Code/patina-merged/apps/designer-portal/src/components/mood-board/board-room-shell.tsx
- /Users/kody/Code/patina-merged/apps/designer-portal/src/components/mood-board/board-add-rail.tsx
- /Users/kody/Code/patina-merged/apps/designer-portal/src/components/mood-board/board-promote-all-panel.tsx
- /Users/kody/Code/patina-merged/packages/supabase/src/hooks/use-project-ffe-ga.ts
- /Users/kody/Code/patina-merged/supabase/functions/capture-from-url/extract.ts