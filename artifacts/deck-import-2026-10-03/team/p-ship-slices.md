# PowerPoint deck to board to order: ship-slice plan

The plan has six slices. Each one ships behind its own fail-closed PostHog flag and is useful even if the later slices never ship.

- **Slice 0** fixes two existing bugs on the path to ordering. The import can't reach ordering without that fix.
- **Slice 1** needs no migration and no new backend. It reads the deck in the browser and sends each image through the existing board upload.
- **Slices 2–4** add one Deno edge function each: links, own-catalog photo match, then web match.
- **Slice 5** connects pins to ordering using the existing promote, triage and PO steps. Purchase orders are never sent automatically.

I checked these points in code this session:
- `usePromoteBoardReferenceToSelection` sends no `name` (`packages/supabase/src/hooks/use-project-ffe-ga.ts:196-217`).
- `promote_board_reference_to_selection` is defined only in 00435, at lines 460-492.
- `apply_board_room_state` updates `type`, `product_id` and `capture_id` on upsert (`00411:237-246`). So an existing image pin can become a `capture` pin with the same id.
- `commit_proposal_capture(p_client_capture_id, p_payload, p_style_ids, p_proposal_id DEFAULT NULL, …)` does not need a proposal (`00516:513-520`).
- `useFeatureFlag` (`apps/designer-portal/src/hooks/use-feature-flag.ts`) stays off until PostHog answers, and honours `NEXT_PUBLIC_FLAG_OVERRIDES` for e2e runs.
- The inspector already reads `data.source_url` (`board-room-inspector.tsx:73-83`).
- The newest numbered migration is `00675_arrival_anchors.sql`, so new migrations start at 00676. There is also a stray timestamp-named file, `20260910152111_create_contact_messages.sql`. Pick the next free number when the branch cuts, following patina-parallel-work.

---

## How designers work, and where each slice fits

1. **Set the look.** Inspiration images, colour, notes. These live today as `image`, `palette` and `note` pins.
2. **Iterate and pull in product.** Today only `product` and `capture` pins can link to a product. An image pin can never become a product. Slice 3's "Looks like" action fixes that for any image pin, not just imported ones.
3. **Bring the board in for ordering.** Promote or send to the schedule, then triage, vendor and PO. This path is broken today for pins with no product (see Slice 0) and loses data along the way (see Slice 5).
4. **Bring in a PowerPoint.** No product does this today. Slice 1 creates the entry point, and slices 2–4 fill in the products.

---

## Slice 0: fix promote and send-to-schedule

**Scope**
- In `usePromoteBoardReferenceToSelection`, add `name`, plus `sourceMetadata {sourceUrl, priceCents, vendorName}`, to `p_request`. Take the values from the pin's `data`.
- Update all three callers to pass the pin: `board-room-inspector.tsx:~202`, `board-promote-all-panel.tsx:~65`, `board-approved-pins-panel.tsx:~90`.
- This stops template pins and pasted-URL pins from failing on promote with "manual selections and placeholders require a name" (`00447:233-237`).

**Files**
- `packages/supabase/src/hooks/use-project-ffe-ga.ts` and the `PromoteBoardReferenceRequest` type.
- The three panel and inspector callers above.
- No migration. Assumption to confirm: `place_product_in_project_v2` already accepts `name` and `sourceMetadata` (the dossier shows both at 00666:495 and 519-530).

**Flag:** none. This is a bug fix.

**Verification gate**
- First-ever SQL test of `promote_board_reference_to_selection` in `supabase/tests/`. Cover a pin with no product plus a name (expect a named need with that name), and a pin with a product (expect a vendor and price on the line).
- Playwright: materialize a starter template on a project board, run "Promote all", expect zero failures.

**Spike first:** whether the named need keeps `sourceMetadata` in `project_ffe_specs.routing_source`.

---

## Slice 1: "Bring in a deck" (images, explicit links, captions, one section per slide)

**User flow**
- Entry points:
  - the uploads tab ("Bring in a deck"),
  - the board create picker ("Start from a deck"),
  - dropping a `.pptx` on the canvas.
- The browser reads the deck. A preview ledger shows "38 pictures · 21 with a link · 4 slides skipped", and the designer confirms.
- Pins are created as `image` pins, one section per slide, laid out by the slide's geometry.
- Pins with a link show "Source link" in the inspector right away, with no extra code.

**Where it runs, and why the browser**
- The deck is parsed in the browser. Supabase edge functions are limited to about 256 MB of memory and 2 s of CPU per request, which can't parse a 100 MB deck.
- The designer portal already lazy-loads SheetJS for spreadsheet import, so lazy-loading a parser is an existing pattern.
- New dependency: `fflate` only. Browsers already have a native `DOMParser` for the XML.
- This adds no backend logic, so the "Deno for backend" constraint is not affected.

**New files** (pure functions, unit-tested against fixture decks)

`apps/designer-portal/src/lib/mood-board-import/pptx/`:
- `read-package.ts`: unzip, keeping only the needed entries. Zip-bomb caps on entry count, total uncompressed size and compression ratio.
- `slide-order.ts`: slide order from `presentation.xml` `sldIdLst` and the rels, never from file names. Slide size from `sldSz`.
- `walk-slide.ts`:
  - Pictures (`p:pic`), picture-filled shapes (`a:blipFill` on `p:sp`), group transforms, crop (`srcRect`), rotation.
  - For `mc:AlternateContent`, read only the Choice branch.
  - Never read layout or master images.
- `links.ts`:
  - Links on pictures and shapes, links on text runs, overlay shapes linked by bounding-box overlap of at least 50%, bare URLs in text and notes.
  - Drop `ppaction://` links and non-http(s) targets.
  - Mark Microsoft-attribution and licence links as non-product.
- `captions.ts`: attach text above or below a picture, and grouping, using the A4 heuristics 1–4 only. Pricing text is parsed with a port of `parsePriceToCents`.
- `to-board-items.ts`: turn the manifest into `EditableMoodBoardItem[]` and `MoodBoardSection[]`.

`apps/designer-portal/src/components/mood-board/board-deck-import-dialog.tsx`: the preview ledger and confirm step.

**Reuse**
- `uploadFilesAsBoardItems` (`board-add-rail.tsx:218`). Refactor it to accept per-file `point`, `size` and `data` overrides. Today it lays files out in a row.
- Crops are applied in a canvas before upload, so `image-preparation.ts` never sees the uncropped room photo.
- Project boards keep the existing `prepareProjectReviewMedia` step, one image at a time.
- `board-room-shell.tsx:1632` `dropped`: send `.pptx` (zip magic bytes plus `[Content_Types].xml`) to the dialog before the image pipeline. This also fixes today's generic error on a dropped deck.

**Data, with no migration** (`data` accepts any keys, up to 256 KB per item)
- `data.source_url`: the primary picture link.
- `data.name`: the caption's first line, if any.
- `data.price_cents`: only if a price was clearly parsed.
- `data.image_provenance = 'imported_deck'`: for honest captioning under PP-4.
- `data.deck_import = {deck_sha256, deck_name, slide_index, slide_title, element_ref, links:[{url, origin}], caption_text, alt_text (flag PowerPoint's auto-generated text), srcRect}`.
- Re-import guard: if the board already has pins with this `deck_sha256`, warn before importing again.

**Skipped, and reported in the ledger:**
- EMF/WMF/TIFF images
- linked-only images (`r:link`)
- video
- `.ppt`, with the message "Re-save as .pptx"

**Flag:** `board-deck-import`, fail-closed. While loading or off, the entry points are hidden, and a dropped `.pptx` gets a plain "not supported" note instead of a broken upload.

**Verification gate**
- Fixture decks from PowerPoint, Keynote export and Google Slides export, all with grouped, cropped, linked and picture-filled shapes. Unit tests assert manifest counts and geometry.
- Playwright: import into a proposal board and into a project board. Pins persist after reload. Source link opens. Undo removes the batch.
- Measure tab memory on a 100 MB deck.

**Spike first**
- Get 5 real decks, starting with Leah's ("show me your last PPT board"). Count where product links actually live: on the picture, on an overlay shape, in captions, on a shopping-list slide, or in notes.
- Measure browser memory and time on the largest deck.
- Check the project-board review-media path with 50+ images. `MAX_REVIEW_MEDIA = 50` applies per edition (`project-review-media/lib.ts:1,126`), so confirm it does not block board views or shares over 50.

---

## Slice 2: from a link to a product (linked capture pin)

**Flow**
- The designer chooses "Find products for linked pictures" on a section, or after import. A review ledger lists each link with the name, vendor and price read from the page.
- "Accept" does three things:
  - creates a personal draft product and a `proposal_captures` row through `commit_proposal_capture`, with `client_capture_id` = uuidv5(deck_sha + element_ref) so it is idempotent;
  - resolves the vendor with `resolveVendor()` (`packages/supabase/src/lib/vendors.ts`);
  - converts the pin in place to `type:'capture'`, with `productId`, `captureId` and the deck image kept as `original_image_url`.
- Every value stays unconfirmed until the designer accepts it (the V10 precedent).

**Backend**
- Add `mode:'deck'` to `supabase/functions/capture-from-url/index.ts`. It takes `{urls[≤8]}`, runs at most 4 fetches at once, reuses `fetchHtml` and `extractProduct` unchanged, and returns per-URL results.
- If a cross-function import is unwanted, move `extract.ts` and `ssrf.ts` into `_shared/product-page/`.
- Migration `00676_deck_link_quota.sql`: a separate quota RPC, `consume_deck_link_quota`, of about 200 per day per user, with its own usage table. This keeps today's limit of 10 per 10 minutes for pasted URLs.
- Dedupe first: if the normalized URL equals the `source_url` of a product the caller can already see, link that product and skip the fetch.

**Client**
- New `use-deck-link-resolution.ts`. Reuses `useCommitProposalCapture` (`packages/supabase/src/hooks/use-proposal-captures.ts`) and `buildResolvedMoodBoardUrlItem` (`url-unfurl.ts:372`) for the data shape.
- This also lets a pasted-URL pin be upgraded to a linked product later, using the same code.

**Flag:** `board-deck-link-resolve`, fail-closed. Server-side kill switch: env var `DECK_LINK_RESOLVE_ENABLED`, following the `BOARD_ASSET_CLEANUP_DESTRUCTIVE_ENABLED` precedent.

**Verification gate**
- Deno tests for `mode:'deck'`: SSRF on each URL, quota denial, mixed success and failure.
- SQL test that the quota RPC counts separately from the paste quota.
- Playwright: accept 3 links, and confirm the pins carry `product_id` and `capture_id` and Slice 0's promote gives a line with a vendor.

**Spike first:** run `extractProduct` over the links harvested in the Slice 1 spike to get the hit rate by retailer (RH, Wayfair, CB2, Arhaus, trade makers). Bot-protected and JavaScript-rendered pages are expected to fail. Also check edge CPU time per 8-URL call.

---

## Slice 3: "Looks like" for any image pin (own catalog: personal, studio and Patina layers)

**Flow**
- Inspector action "Find pieces like this" on `image` pins (imported or not), and a bulk version in the import ledger.
- Shows up to 3–5 candidates: "From your library", "Likely match" or "Possible match", in words, with no percentages or pills.
- Confirming a candidate converts the pin to `type:'product'` with the deck image kept as `original_image_url`.
- This also covers the "feel → product" step in the main journey.

**Backend:** new edge function `supabase/functions/board-photo-match/` (`index.ts` and `lib.ts`)
1. Authenticate the caller and load the pins through an RLS client.
2. Get the image URL:
   - proposal bucket: public URL;
   - project working bucket: a signed URL valid for 10 minutes, minted after the board access check (the portfolio path's precedent, `aesthete-embed-worker/lib.ts:184-197`).
3. Check `/healthz` first (the billing-guard pattern), then `createInferenceClient().embedImage` (`_shared/aesthete.ts:204,272`) in batches of up to 16, backing off on HTTP 429.
4. Call `aesthete_ask_knn(vec, {limit})` with the caller's JWT. It runs with the caller's rights, so studio isolation holds (`00247`, which grants it to authenticated users).
   - Never use the 00008 security-definer RPCs.
5. Return candidates. The client writes `data.look_match = {model_version, ran_at, candidates[], state}` through the normal board-command path, so it is undoable.
   - The server never writes the pin, because full-board saves would overwrite it.

**Optional 3b (after measuring precision):** migration `00677_product_image_vectors.sql` adds a `product_image_vectors` table (product_id, image_url, vector(768), HNSW). The embed worker would store the per-image vectors it computes today and then throws away (`aesthete-embed-worker/lib.ts:161-245`). This improves exact-SKU matching over the fused style vector.

**Flag**
- `board-photo-match`, fail-closed.
- Also hidden when the caller's visible product set with vectors is below a minimum (`count where aesthete_vector is not null`, via an RPC). This avoids launching to an empty room.

**Verification gate**
- Deno tests with a mocked inference client: RLS scoping, signed URL only after the access check, 429 backoff.
- An evaluation set of about 300 deck crops matched to the correct product, with recall at 1 and 5 measured on the fused vector before choosing the "likely" and "possible" cut-offs. Thresholds are placeholders until then.

**Spike first, and the riskiest unknown of the whole program:** is the inference worker deployed and are `products.aesthete_vector` values populated in prod? The infra README says deployed; the consolidated PRD says not. Run a read-only prod SQL count by layer plus a `/healthz` check (patina-prod-ops). If the answer is no, Slice 3 is blocked on deploying the worker and backfilling vectors.

---

## Slice 4: web visual match (opt-in, metered, per pin)

**Flow**
- "Search the web for this piece" appears only after Slice 3 finds no candidate.
- Google Cloud Vision Web Detection returns `pagesWithMatchingImages`. Keep only retailer and vendor domains: `RETAILER_MAP` ported from `apps/extension/src/lib/extraction/retailer.ts`, plus the `vendors.website` domains.
- The kept pages go to Slice 2's `mode:'deck'` resolver. A result is accepted only if the page has JSON-LD `Product` data.
- A full image match is pre-selected; a partial match is shown as "possible". Nothing is ever applied automatically.

**Backend and migration**
- Edge function `supabase/functions/board-web-match/`.
- Migration `00678_board_web_match_usage.sql`: a per-studio monthly cap ledger.

**Flags**
- PostHog `board-web-match`, fail-closed.
- `GOOGLE_VISION_API_KEY` must be set; without it the function returns 503 and the UI is hidden.

**Excluded:**
- SerpApi / Google Lens, because of the open Google v. SerpApi case (hearing 2026-10-13).
- Bing Visual Search, which has been retired.
- Pinterest and Amazon scrapers.

**Verification gate**
- Deno tests with fixture responses for domain filtering, cap enforcement and the missing-key path.
- A manual run on 20 crops with a cost log.

**Spike first:** check the result quality of `pagesWithMatchingImages` on boutique and trade pieces. Lookalikes are expected.

---

## Slice 5: bring board pins in for ordering

**Project boards**
- Add an "Ready to order" fold, next to the promote-all panel, for promoted pins.
- For each line it shows what is missing, using `get_project_ffe_readiness` (`00445`): vendor, client price, disposition, selection, image.
- The designer moves lines to `selected` in bulk through `triage_project_ffe_items` (`00435:494`). This is never automatic.
- Each vendor group links to the existing OrderAssistant (`components/portal/procurement/order-assistant/`).
- `po-send` stays a manual designer action, so no external send happens automatically.
- Also: copy the pin image into `project_ffe_specs.selected_media` when promoting, if the spec-book `image` rule applies. Assumption: this needs either an RPC change or the existing media-attach path; confirm in the Slice 5 spike.

**Proposal boards**
- Fix `buildSendToScheduleArgs` (`apps/designer-portal/src/lib/scope/board-schedule.ts`) and `useAddProposalItem` to carry:
  - `vendorName` and `vendorId`;
  - `source_url` into `custom_fields`;
  - price per the ruling below.
- Write a `data.proposalItemId` back onto the pin. That stops duplicate lines from link-only pins, and lets `_reconcile_activated_ffe_placements` (`00435:903-916`) link pins to their lines after activation.

**Flag:** `board-order-handoff`, fail-closed.

**Verification gate**
- Playwright end to end: fixture deck → import → resolve 1 link → match 1 photo → promote → triage → PO created as a draft and not sent.
- Assert that `create_purchase_order` accepts the lines.
- SQL test for the proposal-item backlink.

**Spike first:** whether lines activated through the legacy proposal path ever become `selected`, and whether activation fills `selected_media` (both unconfirmed in the dossier).

---

## Rulings needed from Kody

1. **Paid web match (Slice 4).** Approve a Google Cloud Vision account and key: first 1k calls a month free, then $3.50 per 1k. Also set the per-studio monthly cap, and decide who pays.
2. **Retailer terms.** The bulk link resolver fetches only URLs the designer supplied, on demand (as capture-from-url does today), and never crawls. Confirm that is acceptable.
3. **Imported imagery (V9 / PP-4).** Should imported deck images, often stock or Pinterest, show on client share pages and in public `proposal-mood-boards` URLs? Default proposal: show them, labelled with `image_provenance`. The alternative is to switch to the vendor's own image once matched.
4. **Price basis.** Is a price taken from a deck or web page retail (sell side only) or trade? Today `unit_price` and `unit_sell_price` are both set to retail, so markup is 0.
5. **V1 margin pocket** for retail and trade products ordered this way, which decides the revenue from the ordering step.
6. **Copy.** Proposed: "Bring in a deck", "Looks like", "Likely / possible match", "From your library". Never "AI". Don't use "Where Time Adds Value" until V5 is ruled. The import ledger appears only above the rows it counts (V11).
7. **Feature-test gap.** Photo match must be presented as Capture (differentiator #4), not the Engine. The size of Patina's own catalog decides whether Slice 3 is useful beyond the designer's own library.
8. **Inference worker deployment.** If Slice 3's spike finds it isn't running, ship and backfill it first. That is a Cloudflare Containers cost decision.

## Main risks
- **Fused vectors match style, not the exact product.** Expect "close candidates" rather than exact matches until 3b.
- **Collage slides.** Slice 1 does no detection, so a collage stays one pin. Detection with Grounding DINO or OWLv2 is a later, paid-or-hosted decision.
- **Full-board saves.** The client sends the whole board on every save, so all match and link results must be written through the client's command path, never by the server.
- **Storage cleanup.** Deck-imported objects in `project-ffe-working` aren't covered by `board-asset-cleanup`, which only scans `proposal-mood-boards`. Add them to the cleanup ledger in Slice 1 or 2.
- **Browser parsing of 100 MB+ decks.** If the Slice 1 spike fails here, the fallback is a `/deck/parse` route on the existing `aesthete-inference` container, using python-pptx and lxml with entities disabled. Edge functions stay as orchestration only.

### Critical Files for Implementation
- /Users/kody/Code/patina-merged/apps/designer-portal/src/components/mood-board/board-add-rail.tsx
- /Users/kody/Code/patina-merged/apps/designer-portal/src/components/mood-board/board-room-shell.tsx
- /Users/kody/Code/patina-merged/packages/supabase/src/hooks/use-project-ffe-ga.ts
- /Users/kody/Code/patina-merged/supabase/functions/capture-from-url/index.ts
- /Users/kody/Code/patina-merged/supabase/functions/_shared/aesthete.ts