# Mood board in Patina today: from a feel to ordered product (code map, read-only)

Line references are file:line. **[V]** means I read it in code. **[I]** means inference. Each finding carries a confidence of H, M or L.

## Headline findings

1. **Only two pin types can link to a product: `product` and `capture`** [V, H]. An uploaded image can't be linked to a product, converted into one, matched against the catalog, or promoted. The inspector only offers "Replace image" for `image` and `room_scan` (`apps/designer-portal/src/components/mood-board/board-room-inspector.tsx:509-513`). Promote is gated to `product`/`capture` (`:469-470`, `board-promote-all-panel.tsx:55`, `board-approved-pins-panel.tsx` ~`:117`). A grep for `type: 'product'` finds no image→product path.
2. **Promoting a pin that has no `product_id` should fail with a server error** [V for each step, H for the end result].
   - The client sends no `name` (`packages/supabase/src/hooks/use-project-ffe-ga.ts:196-215`).
   - The RPC passes the request through without adding one (`supabase/migrations/00435_ffe_ga_rpc_boundaries.sql:478-484`).
   - The live `place_product_in_project_v2` wrapper raises `'manual selections and placeholders require a name'` when `productId` is null and `name` is null (`supabase/migrations/00447_ffe_final_adversarial_hardening.sql:233-237`).
   - Pins that hit this:
     - (a) URL-pasted pins, which carry `productId: null` (`apps/designer-portal/src/lib/mood-board/url-unfurl.ts:383-385`).
     - (b) Every product pin from a template, because materialize writes NULL `product_id`/`capture_id` (`supabase/migrations/00408_board_templates.sql:545-546` columns get `NULL, NULL, NULL`; the strip list is at `:221-222`).
     - (c) Captures that have no `product_id`.
   - This means "Promote all N pieces" after a template materializes (DV3, `board-promote-all-panel.tsx:65,93-115`) would likely fail for every pin. No SQL or e2e test calls `promote_board_reference_to_selection` (grep of `supabase/tests` and `e2e` returned nothing).
3. **The two URL paths behave differently** [V, H]:
   - **Pasting or dropping a URL on the canvas** (`apps/designer-portal/src/hooks/use-mood-board-url-unfurl.ts:37-40` → `capture-from-url` mode `capture`) creates a pin typed `capture` with `productId=null` and `captureId=null`. It creates no `products` row and no `proposal_captures` row. Name, vendor, price, image, source URL and description are stored only in `data` JSONB (`url-unfurl.ts:375-399`). The PRD (D2, `docs/prds/MoodBoard/00-mood-board-prd.md:337-339`) says this should go "through the existing capture pipeline".
   - **Library → Browse products → "Add from URL"** (`apps/designer-portal/src/components/portal/proposals/product-picker-modal.tsx:880-990`) creates a personal **draft product**. Behind the `capture-producer-idempotency` flag it also writes a `proposal_captures` row through `commit_proposal_capture`. That pin is linked.
   - The canvas-paste pin can't be upgraded to a linked product later.
4. **A ready-made document-to-FF&E extractor already exists, with nothing in the apps calling it** [V, H]:
   - Edge function: `supabase/functions/project-ffe-document-extract/` (Claude `claude-sonnet-5` tool-use, `index.ts:86-100`; tool `stage_project_ffe_rows`, `lib.ts:5`).
   - Accepts PDF/JPEG/PNG/WebP only (`lib.ts:11,144-152`). Staging tables: `project_ffe_import_batches`/`_rows` (`supabase/migrations/00434_ffe_privacy_domain_foundation.sql:389-418`).
   - `source_kind` was widened for `photo` in `00660` (which also adds the image branch). `00661` adds per-row designer confirmation of maker, SKU, price and currency before `commit_project_ffe_import`.
   - No file in apps, packages or services references the function or the commit RPC.
   - This is the closest precedent for "ingest a PowerPoint → extract products", but it writes FF&E rows, not board pins.
5. **Photo matching has parts but no entry point** [V, H]:
   - `services/aesthete-inference` has `POST /embed/image` (nomic-embed-vision v1.5, 768-d, aligned with the text model; `README.md`).
   - `products.aesthete_vector` is a **fused** text+image vector (`supabase/functions/aesthete-embed-worker/lib.ts:~360-445`).
   - `products.embedding` is **text-only** (`lib.ts:~317-349`).
   - `aesthete_ask_knn(p_embedding vector(768), p_filters)` does kNN over `aesthete_vector` and respects the personal/studio/catalog visibility rules through row-level security (`supabase/migrations/00247_aesthete_ask_knn.sql:32-50`).
   - Nothing embeds an arbitrary query image and runs kNN. `embed/image` is only called by the embed worker.
   - "More like this" (`board-suggestions-rail.tsx:48-62`) anchors only on `type==='product' && product_id` and uses the text `embedding` (`00271_taught_alternatives_rpcs.sql:62-76`), so an image pin can't seed it.
6. **No PowerPoint handling anywhere in the product** [V, H]. The only `.pptx` mentions are Drive-file classification tests (`supabase/functions/_tests/cowork-intake-*.test.ts`). Dropping a .pptx on the canvas sends all `dataTransfer.files` to the image upload pipeline (`BoardRoomCanvas.tsx:2243` → `board-room-shell.tsx:1635-1648`). The drop path skips `validateBoardImageFiles`, so it probably fails at image decode with a generic error [I, M].

## 1. Board creation

- **Route:** `/board/[boardId]` (`apps/designer-portal/src/app/(document)/board/[boardId]/page.tsx`) → `useBoard` → `MoodBoardRoom` (`components/mood-board/board-room-shell.tsx`). The owner is project-first, then proposal (`page.tsx:10-14`). Studio list: `/boards` → `StudioBoardsView`. [V, H]
- **Single creation picker:** `components/portal/scope-builder/board-create-picker-dialog.tsx` offers blank / Patina starters (`kind='seeded'`) / studio templates (`kind='studio'`) (`:112-119`). It is hosted by `boards-builder.tsx` and `document/worktable/boards-strip.tsx`. [V, H]
  - Blank on a project board goes through `useCreateProjectBoard` (`create_project_board`); blank on a proposal board goes through `useUpsertBoard` (`:168-185`). Audit defect D1 is fixed here. [V, H]
  - Templates go through `materialize_board_template` (`:186-205`) and redirect with `materialized=template`. Templates are stored with owner links removed recursively (`00408:205-240`). Materialized items get NULL product/capture/palette ids (`00408:520-560`). [V, H]
  - The seeded starters contain 8 image, 8 note, 1 palette and 8 product items in total (`00409_seed_board_templates.sql`). Those product pins are unlinked visuals. [V, H]
- **There is no "start from a feel" input** (style quiz, keywords or Aesthete DNA used to seed a board) in the creation picker [V by absence in picker, M]. The Aesthete quiz and taste tables exist (`00242`/`00243`) but nothing connects them to boards [I, M].

## 2. Data model

- **`proposal_boards`** (`00179:28-41`), used for both owner kinds:
  - Added later: `project_id` (`00272:38`); `sections` jsonb and `status` (`00264`, `00407:21`); `project_room_id` (`00434:274-276`); `cover_review_media_asset_id` (`00449`).
  - Constraint: exactly one owner axis (`00434:280-284`). [V, H]
- **`proposal_board_items`** (`00179:51-70`):
  - `type ∈ {product, capture, image, palette, note, room_scan}`.
  - Geometry: x, y, width, height, z_index, rotation, locked.
  - Links: `product_id` → `products` (ON DELETE SET NULL), `capture_id` → `proposal_captures`, `palette_id` → `proposal_palettes`.
  - Content: `image_url`, `content`, `data` jsonb.
  - Added later: `project_ffe_item_id` → `project_ffe_items` (ON DELETE RESTRICT) (`00434:277-278`); `review_media_asset_id` (`00449:37-39`). [V, H]
- **Client type:** `packages/types/src/mood-board.ts:19,37-80`. Known `data` keys: section_id, image_url, thumbnail_url, working_* paths, review_media_*, original_image_url, **source_url, name, vendor_name, price_cents, lead_time_weeks**, room_type, swatches. Other keys are allowed (`extends Record<string, unknown>`). [V, H]
- **Saving:** `apply_board_room_state` sends the whole board state. It deletes missing ids, upserts the rest, and validates type and geometry. `data` is capped at 256KB per item (`00411:110-260`). The live wrapper chain is `00457` → `00546`. The 00411 upsert body doesn't write `project_ffe_item_id`; only placement/promote RPCs set it (`00435:485-489`, `00666:540-550`). [V, H for 00411; M that later impls keep this]
- **Legacy snapshot:** `project_boards.items` jsonb, written at proposal activation, has no item ids (`00179:78-101`, `supabase/CLAUDE.md`). [V, H]

## 3. Add rail: what each tab creates

From `components/mood-board/board-add-rail.tsx`. The default tab is `library`, and the last-used tab is stored in localStorage per user (`:707,748-768`).

| Tab | Creates | Product link | Evidence |
|---|---|---|---|
| `project` (project boards only) | `product` pin from an existing FF&E selection | `productId` + `projectFfeItemId` | `:93-115,916-948` [V,H] |
| `library` | Opens `ProductPickerModal` (scope `library`, `configureStep={false}`). On a **project** board it calls `place_product_in_project_v2` (disposition `candidate`, idempotency key `board-place:`); on a **proposal** board it adds a local pin only | `productId`, optional `captureId`; `data` = name, price_cents, vendor_name, image_url | `:190-217,780-832,1140-1148` [V,H] |
| `captures` | Studio inbox of `proposal_captures` (`status:'inbox'`), searchable. On a project board with `product_id` it places the product; otherwise a loose `capture` pin | `productId=capture.product_id`, `captureId`; `data` = raw_payload + source_url | `:158-188,961-1018` [V,H] |
| `uploads` | Lists `image` pins already on this board for re-use. "Choose images" uploads (resized in the browser; project boards use the `project-ffe-working` bucket and prepare review media) | **none**; `data` has no `name`, so the label falls back to "Upload N" | `:219-298,1020-1082` [V,H] |
| `palettes` (proposal boards only; project boards see a wall note) | `palette` pin with swatches | `paletteId` | `:378-511` [V,H] |
| `scans` | `room_scan` pin from ready RoomPlan scans (proposal: the client's scans; project: the project's scans) | none | `:513-601,1095-1115` [V,H] |
| `feedback` | Not an add tab. Filters pins by latest verdict, with a guest badge | n/a | `:603-683` [V,H] |
| Footer | `BoardSuggestionsRail` ("more like this") + "+ Note" | suggestions add `product` pins | `:1126-1138` [V,H] |

- **There is no "text" tab and no colour/material tab on project boards.** Text is a `note` from "+ Note". Colour is the proposal-only palette tab. [V, H]
- **URL is not a tab.** It comes in through canvas paste (`board-room-controller.tsx:1208-1249`) or drop (`board-room-shell.tsx:1698-1710`), using placeholder → resolved `capture` pin, or → a `note` on failure (`url-unfurl.ts:349-430`). Unfurling uses a durable per-user quota with no retries (`use-mood-board-url-unfurl.ts:30-33`). [V, H]
  - The extractor reads only Open Graph and JSON-LD `Product` metadata (`supabase/functions/capture-from-url/extract.ts:6-8,132-145,235-239`). [V, H]
  - A dragged browser **image** arrives as `text/uri-list`, gets sent to the product-page unfurler, and probably falls back to a note (`not_html`) [I, M].
- **Clipboard image paste** goes to `uploadFilesAsBoardItems` and becomes an `image` pin (`board-room-shell.tsx:1713-1724`). [V, H]
- **Dragging a capture onto a project board** places it with `productId: lead.productId ?? null` and `itemType:'fixed'` (`board-room-shell.tsx:1659-1690`). If the capture has no product, this hits the same name-required error as headline finding 2 [I, H].

## 4. Where a loose reference becomes a linked product

The link points are:

1. **Adding it already linked:** library pick, capture with a product, "In project" tab, suggestion.
2. **Project board, per pin:** the inspector's "Promote to project selection" (`board-room-inspector.tsx:469-497`) → `promote_board_reference_to_selection` (`00435:460-492`) → `place_product_in_project_v2`. The pin then gets `project_ffe_item_id = selectionId` and `product_id = COALESCE(product_id, result.productId)` (`00435:486-489`). [V, H]
3. **Project board, bulk:**
   - `BoardPromoteAllPanel`: right after a template materializes, or whenever ≥2 promotable pins exist. Runs one pin at a time; the idempotency key is `promote:{itemId}` (`board-promote-all-panel.tsx:65-115`). [V, H]
   - `BoardApprovedPinsPanel`: client- or guest-approved pins → the same mutation (`board-approved-pins-panel.tsx:60-140`). [V, H]
   - Both are mounted at `board-room-shell.tsx:1280-1297`. [V, H]
4. **Proposal board:** "Send to the schedule" (`board-schedule-inspector-action.tsx`) → `useAddProposalItem`. It maps name (fallback `'Board pick'`), price_cents as the sell price, image, room and an auto doc_code. It **tolerates a null productId** and only checks for duplicates when a product exists (`lib/scope/board-schedule.ts:43-83`). This is the one path where an unlinked capture or template pin can reach a line item. [V, H]

**Fields the link carries.** `place_product_in_project_v2` impl (`00666_ffe_extract_money_review_fixes.sql:351-567`): [V, H]

- **On the FF&E item:** `project_id`, `project_room_id`, `product_id`, `name` (product name, then request `name`, then `'Named need'`), `ffe_category`, `quantity`, trade, unit and line prices (from the product: `price_trade`/`price_retail`), `vendor_id`, `vendor_name`, `added_via` (default `'project-add'`), `selection_thread_id`, `design_disposition` (the board always sends `candidate`), `assignment_scope`.
- **On `project_ffe_specs.routing_source`:** `sourceMetadata` + `captureId` (`:519-530`).
- **Not passed by the board:** the pin's `data.source_url`, `data.price_cents`, `data.vendor_name` and `data.image_url`. Unfurl provenance is lost on promotion. [V, H]

**Path to ordering** [V, H]:

- `create_purchase_order` requires every line to have `vendor_id = p_vendor_id`, `design_disposition='selected'` and `removed_at IS NULL` (`00450_ffe_po_compat_and_media_dedupe.sql:38-44`).
- Board placements arrive as `candidate`, so a separate triage step (`triage_project_ffe_items`, `00435:494-519`) to `selected`, plus a resolved vendor, is needed before a PO.
- A name-only placeholder has no vendor and can't be ordered until a product fills it.

## 5. Iteration layers

- **Direction layer** (`00550_board_item_directions.sql`): `board_item_directions` (body, resolved, resolved_at/by). Studio co-members only, via `can_manage_board_item_feedback`; no anon or client grants. Resolve and reopen go through SECURITY DEFINER RPCs. **CASCADE on pin delete; undo creates a new row, so the thread is lost** (ruled, `:30-42`). UI: `board-item-direction-panel.tsx`, an indicator on pins (`board-room-shell.tsx:166-180,417-423,1114-1116`). [V, H]
- **Background removal:** inspector action on image, capture and product pins. Disabled on project boards (`board-room-inspector.tsx:437-440`). Hidden when the capability isn't configured (`board-image-inspector-actions.tsx:95-97`). AC3.27 says it is intentionally disabled in prod. [V, H]
- **Inspector edits:** width, rotation, height reset, note text, section, z-order, lock, directions, open product, replace image, source link. There is **no editing of a pin's name, vendor, price or source URL**. **Multi-select has align, distribute, section and lock, but no promote or link action** (`board-room-inspector.tsx:313-513`). [V, H]
- **Price drift helper:** `computeBoardDrift` exists, but only for pins with `product_id` (`lib/scope/board-schedule.ts:85-115`). [V, H]

## 6. Share and guest verdicts

- **Share:** `create_board_share`/`resolve_board_share` work for both owner kinds (`00548`). Mint and resolve still require `board_media_projection_is_allowed`, so **a project board whose pins point at private working media can't be shared** (`00548:10-15`). The dialog is wired (`board-room-shell.tsx:1475-1480`), with an "Allow reactions" opt-in (`board-share-dialog.tsx:103,246`). [V, H] Whether uploaded images block sharing in practice depends on review-media preparation (`board-add-rail.tsx:245-256`) [I, M].
- **Guest reactions** (`00549`):
  - Opt-in is fixed when the link is minted.
  - `submit_board_share_reaction` accepts only `approved`/`rejected` (no comment verdict), with at most 280 characters of note and a 200-row cap (`:768-800`).
  - Rows land in `item_feedback` with `guest_share_id`.
  - Client UI: `apps/client-portal/src/app/share/[token]/board-reactions.tsx`.
  - Approved pins feed `BoardApprovedPinsPanel`. [V, H]

## 7. Waived ACs that matter for this flow

From `docs/prds/MoodBoard/06-acceptance-evidence.md`: [V, H]

- AC3.12 (`:185`): URL placeholder resolves against a real site — waived.
- AC3.14 (`:187`): extension capture dragged to a board keeps `capture_id` — waived.
- AC3.15 (`:188`): cutout round-trip — waived.
- AC3.20 (`:193`): large-upload sizing — waived.
- AC1.22 (`:127`): cross-board paste FK stripping — waived.
- AC2.9 (`:152`): client verdict DB row — waived.
- AC3.27 (`:200`): URL-unfurl analytics still open.
- AC3.23/3.24 (`:196-197`) **passed** with links stripped by design. Nothing tests promoting a stripped pin afterwards.
- Totals: 27 waived, 2 in progress (`:21-22`).

## 8. Other gaps and frictions

- `suggestionRows` sets every item's `created_at` to the epoch (`board-add-rail.tsx:355`), so "last-added" in the suggestions rail is really "highest z-index" [V, H; low impact].
- The palette tab doesn't exist on project boards (`:466-478`), and the audit says project boards are where new work goes [V, H].
- Uploaded images keep no filename, source or caption metadata (`board-add-rail.tsx:285-295`) [V, H]. A PowerPoint import that becomes plain uploads would lose slide text and links unless they go into `data` [I, H].
- `data` can hold any keys, up to 256KB per item (`00411:173-174`). Storing slide-import provenance (deck id, slide #, extracted link, match candidates) needs no schema change [V, H]. A real link to a product still needs `product_id` or `project_ffe_item_id` [V, H].
- The FF&E extractor's `source_kind` list is csv/xls/xlsx/pdf plus photo (`00434:392`, widened in `00660`). Adding `pptx` would need a migration plus a converter (PPTX → images/text or PDF) [I, H].
- The Captures tab reads the whole studio inbox, not just this board's owner (`board-add-rail.tsx:715`) [V, M].
- No realtime presence; saves are optimistic and send the whole board state [V, M from `00411`; presence absence I, M].

## Relevant paths

- `/Users/kody/Code/patina-merged/apps/designer-portal/src/components/mood-board/{board-add-rail,board-room-shell,board-room-inspector,board-promote-all-panel,board-approved-pins-panel,board-schedule-inspector-action,board-image-inspector-actions,board-item-direction-panel,board-share-dialog}.tsx`
- `/Users/kody/Code/patina-merged/apps/designer-portal/src/components/portal/scope-builder/{board-room-controller,board-create-picker-dialog,board-suggestions-rail}.tsx`
- `/Users/kody/Code/patina-merged/apps/designer-portal/src/components/portal/proposals/product-picker-modal.tsx`
- `/Users/kody/Code/patina-merged/apps/designer-portal/src/lib/mood-board/url-unfurl.ts`, `/Users/kody/Code/patina-merged/apps/designer-portal/src/hooks/use-mood-board-url-unfurl.ts`, `/Users/kody/Code/patina-merged/apps/designer-portal/src/lib/scope/board-schedule.ts`
- `/Users/kody/Code/patina-merged/packages/types/src/mood-board.ts`, `/Users/kody/Code/patina-merged/packages/supabase/src/hooks/use-project-ffe-ga.ts`
- `/Users/kody/Code/patina-merged/packages/patina-design-system/src/components/BoardRoomCanvas/BoardRoomCanvas.tsx`
- `/Users/kody/Code/patina-merged/supabase/migrations/{00179,00408,00411,00434,00435,00447,00450,00548,00549,00550,00660,00661,00666,00247,00239,00271}_*.sql`
- `/Users/kody/Code/patina-merged/supabase/functions/{capture-from-url,project-ffe-document-extract,aesthete-embed-worker}/`
- `/Users/kody/Code/patina-merged/services/aesthete-inference/README.md`
- `/Users/kody/Code/patina-merged/docs/prds/MoodBoard/06-acceptance-evidence.md`, `/Users/kody/Code/patina-merged/artifacts/mood-board-ux-audit-2026-08-31/synthesis.md`