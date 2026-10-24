# Buying, round two — US-54 founders' deck

Rebuild from the repository root:

```
node artifacts/purchasing-meeting-recommendations-2026-10-24/deck/build.mjs
```

then open `artifacts/purchasing-meeting-recommendations-2026-10-24/deck/index.html` in a browser.

- **Source:** `src/index.html` (hand-authored; authored page source). Content comes from `synthesis/deck-outline.md` and `synthesis/recommendations.md`.
- **Builder:** `build.mjs` inlines every `{{IMG:name.jpg}}` from `img/` as a data URI. It fails on a missing image, an unresolved `{{…}}` placeholder, a JPEG set above 5 MB, or output at or above 16 MB, and warns about JPEGs in `img/` that no sheet uses. Only Google Fonts stays external.
- **Shape:** 20 sheets — the outline's 19, plus sheet 05, the clickable proposal walk (14 frames in four acts). Move between sheets with Left/Right (or PageUp/PageDown) or the arrow buttons; the counter tracks the sheet in view. Each recommendation sheet has "See it in the walk" buttons that open the matching frame.
- **The walk (sheet 05):** plain HTML/CSS/vanilla JS, labelled "Proposal — not built". Click the act outlined in clay to move on, or use Back / Next frame / Start again and the act buttons. Frames 1, 8, 12 and 13 carry a 1440/390 width toggle and reflow at 390 through a container query. The walk is drawn on The Document's own tokens and stays light in dark mode; the deck chrome follows `prefers-color-scheme`.
- **Evidence:** 21 JPEGs in `img/`, converted from `artifacts/purchasing-workflow-review-2026-10-22/walk/screens/*.png` with `sips -s format jpeg -s formatOptions 70 -Z 1440`. All are local-walk evidence (Oct 22–23, a seeded test data), not production. Ship-to screens 32–34 predate US-51's job Destinations.
- **Figures:** only the meeting's own (Sierra bed $3,449.00 → $3,679.20, white glove $299.00, card charge $3,978.20, the client's check $23,123.19). Everything else reads `$—` or is marked "example". The client's name, street and zip never appear.
- Design-only. Nothing here is built, and nothing in it decides rulings Q-01 to Q-07.

Fix round SQ-1912: street/zip rows are painted out of evidence JPEGs, and dev badges covered (any residual badge is not product). The minimal NOW scope is copy/single-control only; follow-ons are NOW-next. External-order review (Q-07) and payment-to-Actual linkage are proposed new work. The $3,748.00 comparison is reconstructed after restoring white glove to $299.00. Mockup destination and unallocated-variance branches preserve the choices made.
