# Deck Visual QA — Round 2 — "The Smart Lens"

Fresh-eyes pass over `mock/deck-qa/` renders of `presentation.html` (15 sections). All 60 required PNGs read in full (`<id>-1440-light`, `<id>-1440-dark`, `<id>-390-light`, `<id>-390-dark>` for each of `cover ask today found thesis spine header body motion mobile walkthrough build roads limits colophon`). `asread-*` variants skipped per instructions.

Cross-section pixel sampling (corner pixel at (5,5) of every one of the 60 PNGs) was used to verify the light/dark theme actually toggles per section — this caught the single biggest finding (found/today stuck dark). Targeted crops (via PIL) were used to inspect suspicious regions at native resolution beyond what the compressed thumbnail view showed.

## Summary table

| Section | 1440 light | 1440 dark | 390 light | 390 dark |
|---|---|---|---|---|
| cover | OK | OK | OK | OK |
| ask | Should | Should | OK | OK |
| today | Blocking | Blocking | Blocking | Blocking |
| found | Blocking | OK | Blocking | OK |
| thesis | OK | OK | OK | OK |
| spine | Blocking | Blocking | OK | OK |
| header | OK | OK | OK | OK |
| body | OK | OK | Should | Should |
| motion | OK | OK | OK | OK |
| mobile | OK | OK | Should | Should |
| walkthrough | OK | OK | Should | Should |
| build | OK | OK | OK | OK |
| roads | OK | OK | OK | OK |
| limits | OK | OK | OK | OK |
| colophon | OK | OK | OK | OK |

Sticky index / section eyebrow: renders correctly in all 14 content sections, both themes, both widths (spot-verified `header`, `body`, `build`, `spine`, plus direct reads of `ask`, `today`, `found`, `thesis`, `motion`, `mobile`, `walkthrough`, `roads`, `limits`, `colophon`) — small accent-colored keyword + hairline rule, e.g. `HEADER · THE LETTERHEAD AND THE LENS LINE`. `cover` alone has no eyebrow, which reads as intentional for a title slide (see Note).

Dark-theme legibility: everywhere the dark theme actually applies, contrast is good — off-white/cream text (~`#e8e3d8`-ish) on near-black (~`20,18,15`) backgrounds, throughout body copy, tables, quotes, and code spans. No legibility failures found in correctly-toggled dark renders.

## Findings

### Blocking

1. **found — 1440-light, y: whole page** — Requesting the light theme renders the same near-black background as the dark theme. Pixel-sampled corner = `(20,23,26)`; every other section's light corner = `(236,230,219)`; found's own dark corner = `(12,14,17)` — light and dark are nearly indistinguishable (a ~8-value RGB difference), whereas everywhere else light vs. dark is a full palette swap. Text remains legible (white-on-near-black) but the section never reaches the deck's cream light register. Confidence 0.85.
2. **found — 390-light, y: whole page** — Same theme failure as #1, confirmed at mobile width (corner `(20,23,26)`). Confidence 0.85.
3. **today — 1440-light, y: whole page** — Same theme failure as #1 (corner `(20,23,26)` vs. expected `(236,230,219)`). Confidence 0.85.
4. **today — 390-light, y: whole page** — Same theme failure at mobile width. Confidence 0.85.
5. **today — 1440-light & 1440-dark, y≈550–2900 ("FOUR STATES, 1440PX" row and the "1180–1439 folds the rail" row)** — The evidence-photo frames (4 frames in the top row, 2 more below labeled `W1280-RICH-S0`/`S1`) are tall fixed-height boxes in which the actual captured screenshot occupies only a thin band in the vertical middle (roughly 15–25% of the frame's height); the rest is solid black dead space above and below. Same in both light and dark renders since the frame itself is black regardless of theme. Could be a deliberate "position within a taller scrolled page" annotation (copy nearby talks about content "below the fold"), but visually it reads as broken/empty imagery — matches the rubric's explicit "figure that is enormous... or black" blocking category. Confidence 0.7.
6. **today — 390-light & 390-dark, same region reflowed** — Identical black-frame-with-thin-content-band problem confirmed at mobile width via crop (`strip_390_fourstates.png`). Confidence 0.7.
7. **spine — 1440-light & 1440-dark, y≈1580–2350 ("WHAT THE RAIL ACTUALLY LOOKS LIKE NOW" dark band, third figure `W1440-PREWORK-S0`)** — Same pattern as #5: the labeled screenshot sits in a small strip near the bottom of a much taller black rectangle, with a large empty black region above it. (The first two figure columns in the same row are narrow rail crops flanked by black bars left/right — that one reads as an intentional "isolate this 56–64px rail against the full viewport width" device, not a defect; only the third column's disproportionate black area is flagged here.) Confidence 0.65.

### Should

8. **ask — 1440-light & 1440-dark, y: whole page (full-width column at x≈600–1440)** — All body copy is confined to a ~580px-wide left column; roughly 60% of the 1440 viewport (the entire right two-thirds) is bare page background for the full length of the section, with no figure, pull-quote, or diagram to fill it. Reads as unbalanced/empty at desktop width compared to every other section, which uses the full width for tables or screenshots at some point. Confidence 0.55.
9. **body — 390-light & 390-dark, y≈2600–2880** — The embedded rich-UI screenshot (deal/proposal detail table) is reproduced at native small scale; its internal multi-column text is well under a legible size at 390px width. Presented as "at a glance" evidence rather than reading copy, so likely an accepted trade-off, but flagging since text is not actually readable without zooming. Confidence 0.55.
10. **walkthrough — 390-light & 390-dark, y≈1150–1500 and again near the section's last figure ("Pieces at full")** — The two "1440×900 frame, cropped to the deck column" comparison screenshots are fixed-width raster images scaled down into the 390 column; their internal multi-column layout (rail / paper / margin) compresses to illegible micro-text. Confidence 0.6.
11. **mobile — 390-light & 390-dark, y≈4700–4780** — A solid black rectangle roughly 60–90px tall sits directly above the "390, TODAY" screenshot card with no visible content, icon, or label. Could be an intentional blank toolbar/status-bar mock or a rendering gap; ambiguous from the image alone. Confidence 0.4.

### Note

12. **cover — all 4 views** — No sticky index/section eyebrow renders on the cover slide, unlike all 14 other sections. Reads as an intentional title-slide treatment (title, subhead, date/commit metadata, disclaimer — no section chrome) rather than a defect. Confidence 0.7.
13. **mobile — 1440 & 390, "IN THIS DOCUMENT" bottom bar** — The document-name cell truncates to "The Vanderste…" with an ellipsis at both widths. This is a screenshot of the live product's own mobile bar being used as evidence (caption explicitly frames it as "the live app today, in the dark band where evidence belongs"), so this is the product's truncation being documented, not a deck-rendering defect. Included for completeness only. Confidence 0.5.
14. **spine — 1440, "WHAT THE RAIL ACTUALLY LOOKS LIKE NOW," first two figure columns** — Narrow rail screenshots flanked by black bars left/right. Visually similar in kind to the flagged black-frame issue (#7) but here the proportions look deliberate (isolating a genuinely narrow 56–64px rail against the full frame width, with the caption describing exactly that). Not counted as a defect. Confidence 0.5.
15. **today section copy is internally aware of some of the above** — The findings table inside `found` (F01 "First region head lands a full frame below the fold," etc.) appears to be describing, in prose, some of the same near-empty-viewport conditions visualized by the black-frame figures in `today`/`spine`. If those figures are meant to be literal illustrations of those findings, they may be working as intended rather than broken — noted for the deck author's judgment call, not re-scored as a separate defect. Confidence 0.3.

## Method notes

- Background-theme check: sampled pixel (5,5) of all 60 PNGs — 58/60 show the expected two-value light/dark swap (`(236,230,219)` vs `(20,18,15)`); the 4 exceptions are `today`/`found` at both widths in "light," which is finding #1–4 above.
- Black-frame check: cropped and inspected native-resolution regions in `today`, `spine`, `header`, `body`, `mobile` where full-bleed dark bands or screenshot figures appeared in the compressed overview; confirmed the black-void pattern is isolated to `today` and one figure in `spine`, not systemic to every screenshot component (the `header`, `body`, `mobile`, and `walkthrough` screenshot components fill their frames properly).
- Table reflow check: spot-checked wide tables (`found`, `thesis`, `motion`, `build`) at 390px — all gracefully collapse to stacked label/value cards, no sliver-collapse or horizontal overflow found anywhere.
