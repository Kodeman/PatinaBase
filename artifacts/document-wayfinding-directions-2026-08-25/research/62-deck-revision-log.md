# Deck revision log — D4 pass over 60-deck-factcheck.md + 61-deck-visualqa.md

Source of truth for the pass: `research/60-deck-factcheck.md` (0 blockers, 2 issues) and
`research/61-deck-visualqa.md` (1 blocker, 0 other issues, 3 ruled-out non-issues).
Every item was addressed by editing `mock/deck-parts/*` and re-running
`node mock/deck-parts/build.mjs`. Nothing was rejected.

| QA item | Disposition |
|---|---|
| VisualQA **Blocker B1** — document-level horizontal scroll at 390x844 (`documentElement.scrollWidth` 405 vs `innerWidth` 390), caused by `.dk-refs span{white-space:nowrap}` on the file:line citation spans | **fixed** — `00-head.html`: added `overflow-wrap:anywhere` to `.dk-refs` and a `@media (max-width:760px)` block releasing the spans to `white-space:normal; overflow-wrap:anywhere; word-break:break-word`. Desktop keeps unbroken citations (`whiteSpace` still `nowrap` at 1440). Re-measured in Chromium at 390x844 and 1440x900, light and dark: `scrollWidth === innerWidth` in all four combinations (390/390, 1440/1440). The only remaining elements past the viewport edge are the `.dk-t-mono` table rows already contained by their `.dk-scroll` (`overflow-x:auto`) parent — the same pattern QA ruled a non-issue for `.dk-scores` — and they no longer leak to the document. |
| Factcheck **Issue 1** — SP-04 called the added clause "A six-word gloss"; the actual text `(committed, not yet paid out)` is five words (the source `shared-planks.md` miscounts it as four) | **fixed** — `06-planks.html`: "A six-word gloss added inline" -> "A five-word gloss added inline". The deck now states the true count; the source's own four-word miscount is left alone (source files are inputs, not deliverables). Zero occurrences of "six-word gloss" remain in `presentation.html`. |
| Factcheck **Issue 2** — Direction B's "T2 is answered at zero acts, by a heading rather than a filter" sat ~14 lines below the section's claims-not-measurements disclaimer, while Direction A carries its equivalent caveat adjacent to the claim | **fixed** — `08a-direction-b.html`: the sentence now reads "...by a heading rather than a filter -- B's own claim, not a measured outcome; no re-walk has been run." matching A's local phrasing at `07a-direction-a.html` ("Stated ordinally, because no re-walk has been run... These are the direction's own claims, not measured outcomes"). The section-level disclaimer is retained. |
| VisualQA non-issue — contrast script false-positive on `<code>&lt;- PUT DOWN</code>` (harness did not composite the 8.6% ink tint against paper) | no action — QA itself ruled it a harness limitation, confirmed by crop; the chip uses the same `--dk-tint-2` token as every other `.dk-obs code`. |
| VisualQA non-issue — compare-section score table "looks cut off" on mobile | no action — `.dk-scores{min-width:880px}` inside `.dk-scroll{overflow-x:auto}` is the intended contained-scroll pattern; re-measurement confirms it does not contribute to document scrollWidth. |
| VisualQA non-issue — index click to `colophon` read "not in view" at +400ms | no action — `scroll-behavior:smooth` over a ~44,000px jump; QA's own retest at +1000ms lands correctly. |

## Post-fix verification

- `node mock/deck-parts/build.mjs`: 10 fragments inlined, 20 screenshots embedded
  (1.53 MB raw), 25/25 `<section>` balanced, 35/35 `<figure>` balanced, 0 leftover
  markers, no `<!doctype>/<html>/<head>/<body>`, **box-shadow count 0**, 0 non-ASCII bytes.
- Size: **2,725,659 bytes (2.60 MB)** — well under 16 MB.
- `<title>The Wayfinding Review</title>` is still the file's first line (inside the first 8 KB).
- Chromium re-run at 390x844 and 1440x900, light and dark: 0 box-shadow/drop-shadow nodes;
  body background inverts `rgb(242,237,228)` -> `rgb(21,18,15)`; no document horizontal scroll.

---

## Revision 3 — answers (D6, 2026-08-25)

Kody ruled the ten questions of §11, plus two framing questions, in a ruling interview.
The deck now prints the answers beside the questions, in the "Seven questions, seven
answers" form set by `artifacts/document-flow-directions-2026-08-15/presentation.html`.

| Edit | File |
|---|---|
| **New section** — `#answers`, eyebrow "Ten questions, ten answers", h2 "Ruled 2026·08·25". A lede, the two framing rulings (sequence: one program, A then B, never concurrent; the ticket gate: sticky-seam redraw reviewed by Kody himself), ten `.dk-q` blocks each headed by its §11 number and short title and closed with a mono `Ruled:` stamp in place of §11's `We ask:`, then the provenance note. Uses only existing `.dk-*` classes — no CSS added. | **created** `mock/deck-parts/11b-answers.html` |
| `"11b-answers.html"` inserted in `PARTS` immediately after `"11-questions.html"` | `mock/deck-parts/build.mjs` |
| One italic `.dk-note` under the h2: "Ratified 2026·08·25 as one sequenced program — A, then B behind `job-ticket`. See the answers in §12." Nothing else touched. | `mock/deck-parts/10-recommendation.html` |
| File-ledger row added before the `mock/` row: `source/rulings-2026-08-25.md` — "The ten answers and two framing rulings, with the DECISIONS entry id." | `mock/deck-parts/12-colophon.html` |
| Revision-3 QA runner (scroll re-check, generated-index dump, one section screenshot) | **created** `mock/deck-parts/qa-answers.cjs` |

**Cross-reference note.** The brief's italic line quoted "§11"; the answers land at §12 once
the section is inserted, so the line was written as **§12**. The recommendation's other
cross-reference — "see the data question in §11" — still points at Questions and is correct
unchanged.

**Numbering.** Both indexes are generated at load by `99-script.html` from
`main > section[data-index-title]` order — the cover's "Contents" `<ol id="dk-inline-index">`
is empty in source and filled by the same loop as the spine, so **no static list needed
editing**. Verified in Chromium: spine and cover contents are identical and now read
`… 11 · Questions for the team · 12 · Ten answers · 13 · Colophon`. The section's
`data-eyebrow` picks up its number the same way and renders "12 · TEN QUESTIONS, TEN ANSWERS".

**Ledger id.** The placeholder was replaced with `R124` (DECISIONS entry appended 2026-08-25) and the deck rebuilt (2,736,031 bytes).

### Post-edit verification

- `node mock/deck-parts/build.mjs`: 10 fragments, 20 screenshots (1.53 MB raw),
  **26/26 `<section>` balanced**, **35/35 `<figure>` balanced**, **0 leftovers**,
  no `<!doctype>/<html>/<head>/<body>`, **box-shadow 0**, 0 non-ASCII bytes, exit 0.
- Size **2,736,033 bytes (2.61 MB)** — under 16 MB. `<title>The Wayfinding Review</title>`
  is still the first line, inside the first 8 KB.
- `mock/deck-parts/qa-shell.html` regenerated from the rebuilt `presentation.html` with the
  same minimal `<!doctype html><html><head>…</head><body>` wrapper as the earlier QA.
- Chromium, `qa-answers.cjs`, four combinations — 1440×900 and 390×844, light and dark:
  `documentElement.scrollWidth === window.innerWidth` in all four (1440/1440, 390/390),
  **no horizontal scroll**; zero elements inside `#answers` overflowing their section box at
  any of the four; 0 box-shadow nodes inside `#answers`; 0 console errors, 0 page errors.
- Computed fonts inside `#answers`: eyebrow DM Mono 10px, h2 Playfair Display 42px,
  `.dk-q h4` Playfair Display 21px, `.dk-ask` DM Mono 11px, body Inter — the deck's register.
- Screenshot `mock/deck-qa/sec-answers-desktop-light.png` (1440, light) read back: renders
  clean, ten blocks on their hairlines, no overflow, no clipping. Index dump kept at
  `mock/deck-qa/answers-index.json`.
