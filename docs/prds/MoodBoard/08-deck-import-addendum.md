# Bring in a Deck — addendum (US-15)

Status: approved execution contract, 2026-10-03 (`VISION-DECISIONS.md` V13).

This addendum covers the PowerPoint/Keynote/Google-Slides mood-board import. It does not
restate the MoodBoard phase PRDs; it is the handoff for the new deck-import scope that sits on
top of them.

## The flow

1. **Bring in.** Entry points: drop a `.pptx`/`.ppsx`/`.potx` on the board canvas, "Bring in a
   deck…" in the add-rail Uploads tab, "From a deck" in the board create picker, ⌘K "Bring in a
   deck". No new pages, no new tabs. `.ppt`/`.key` get "Re-save as .pptx".
2. **Lay it out** (browser, ~1 min). A `DocSheet` shows a slide filmstrip, a target board, and
   one action, "Lay it out." Each slide becomes a board section named from its title; pins are
   placed at the slide's geometry. Product-role pictures become `capture` pins in the *to
   confirm* state; inspiration pictures become `image` pins tagged `imported_deck`; free text
   becomes `note` pins; logos and layout/master art are dropped. The room head shows "Laying out
   · slide 12 of 40." No bars.
3. **Finding pieces** (server side, continues after the tab closes). The room head shows
   "Finding pieces · 23 of 38." Pins update in place with a mono caption.
4. **Review ledger** (wide `DocSheet` drawer, grouped by slide). Front matter: "38 pieces · 21
   by link · 9 by look · 3 named on the slide · 5 not found yet." Actions per row: Keep, Swap,
   Paste a link, Keep as reference (keyboard j/k/Enter/s/l/r/u). The only bulk action is "Keep
   every piece found by its link," and only where the page photo agrees with the deck photo.
   Look matches are kept one row at a time (R-DI7).
5. **Onward to ordering.** "Put N pieces on the schedule" — these are her selections, so they go
   in as `selected` by default (R-DI2). The deck owner kind decides the path: the generalized
   promote-all loop for a project, a bulk send-to-schedule for a proposal. Then the existing
   per-vendor OrderAssistant; `po-send` is never sent automatically.
6. **Find this piece.** The same resolver is available as an inspector action on any image pin,
   deck or not — this closes the general "iterate and pull in product" gap.

## Resolution tiers

Every result is held unconfirmed until Keep (V10 precedent). Edge function
`board-deck-import-resolve`.

| Tier | Source | How | Band |
|---|---|---|---|
| T0a | URL already in a visible product's `source_url` | normalized URL match | strong |
| T0b | link on the slide | `extractProduct` + `fetchHtml` (`_shared/product-page/`); og:image ↔ deck crop check | strong / likely |
| T0c | caption SKU + vendor | `products.vendor_sku` match | strong |
| T1 | words | caption → `search_products_text`/FTS, SKU first | likely / possible |
| T2 | look | crop → signed URL → `/embed/image` → kNN | likely needs top1 ≥ τ and a margin over top2; fused-vector hits capped at possible until `product_image_vectors` lands |
| T4 | web (opt-in, R-DI1) | Vision Web Detection → retailer-domain filter → T0b extract | likely / possible, never preselected |

## Copy lexicon

From the US-15 execution contract.

**Use:** "Bring in a deck", "Lay it out", "Laying out · slide N of M", "Finding pieces", "From
the link on the slide", "Named on the slide", "Likely, by look", "Possible, by look", "Found on
the web", "Not found yet", "Keep", "Swap", "Paste a link", "Keep as reference", "Put N pieces on
the schedule", "These are her selections" / "These are options", "Search the web for this
piece", "Find this piece".

**Banned** (do not use outside this list): "AI", "smart", "auto-match", "curated", "powered by",
"%", match scores shown as numbers, badges, pills, status dots, progress bars, spinners.

## Rejected alternatives

- **Server/container parse for v1 — rejected.** Parsing the deck server-side (edge function or
  the `aesthete-inference` container) would mean uploading and storing the whole deck, which
  risks PII in speaker notes and adds an extra network hop before any pin exists. Browser parse
  (lazy `fflate` + `DOMParser`) keeps the deck off the server entirely — only the cropped images
  travel, through the existing upload path. Kept as a **fallback**: if a deck is large enough to
  spike browser memory or time, it falls back to a `/deck/parse` route on `aesthete-inference`
  (python-pptx + lxml, XXE off).
- **`agent_tasks` queue for resolver dispatch — rejected.** `agent_tasks`' assignees are
  admin-only (per the Agent OS rules), so it cannot carry per-studio, per-import resolver work.
  Dispatch instead goes through pg_cron (`dispatch_board_deck_import_resolve()` →
  `invoke_edge_function`), the same shape as `dispatch_board_asset_gc`.
- **Server-side pin insert — rejected.** `apply_board_room_state` deletes any item missing from a
  whole-state save, so a server-side insert racing a client save would vanish. The client
  materializes all pins; server resolutions come back as pin *patches* that the client applies
  through the room's command path, so they stay undoable and survive whole-state saves.
- **SerpApi / Lens scrapers for web match — rejected.** SerpApi is in litigation with Google
  (hearing 2026-10-13), and no official Google Lens API exists. Google Cloud Vision Web Detection
  is the only sanctioned open-web match option and is what wave 4b uses, opt-in and capped per
  studio (R-DI1).

## Links

- Plan: `artifacts/deck-import-2026-10-03/PLAN.md`
- Team dossier: `artifacts/deck-import-2026-10-03/team/r-product-vision-designers.md`
- Vision ruling: `docs/vision/VISION-DECISIONS.md` V13
