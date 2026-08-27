# 62 — Deck revision log

Every item raised in `60-deck-factcheck.md` and `61-deck-visualqa.md`, and what was done about it.
Fixes are at source — a part in `mock/deck-parts`, a fragment in `mock/fragments`, the deck head CSS,
`99-script.html`, or `build.mjs`. `presentation.html` was rebuilt with `node mock/deck-parts/build.mjs`
and re-run through `mock/deck-parts/qa-run.cjs`.

Every blocking and major item from both reports is closed. Ten of the eleven fact-check minors and
three of the four visual minors are closed; the two left open are recorded at the bottom with the
reason.

---

## Fact-check — blocking

| Item | File | What changed |
|---|---|---|
| B1 · "Purchase is the smallest" contradicts the class table (Reach 15 < Purchase 20) | `deck-parts/05-found.html` | "**Purchase** is the **second-smallest**, for the reason that there is almost no purchase surface to find fault with." |
| B2 · "Seven were raised independently by five seats or more" — nine of the twelve are | `deck-parts/05-found.html` | "Nine of the twelve are S0. **Nine were also raised** independently by five seats or more, and every one of **those nine** is a sentence the app says out loud …" |
| B3 · "Ten questions for Kody" over twelve q-cards | `deck-parts/14-questions.html`, `deck-parts/01-cover.html`, `deck-parts/DECK.md` | Heading and `data-index-title` → **Twelve questions**; the cover's day-spine line → "The judges, the verdict, twelve questions."; DECK.md part table updated. The index row now reads TWELVE QUES… |

## Fact-check — major

| Item | File | What changed |
|---|---|---|
| M1 · 155 shots "across four lanes" — the four lanes hold 145 | `deck-parts/02-ask.html` | "155 screenshots — 145 across four walk lanes (guest, signed-in client, dark mode, Dynamic Type at extra-extra-large) plus ten harness and restore frames — every frame 402 × 874 pt at 3×." |
| M2 · "Twenty-two mechanism claims" — judge-j3 §5 is 20 data rows | `deck-parts/12-compare.html` | "**Twenty** mechanism claims were re-read at `file:line` …" |
| M3 · "J1 · A → B · eight items" over a seven-`<li>` list | `deck-parts/12-compare.html` | The merged bullet split back into the judge's own #3 and #4 — "Card weight follows content — a non-empty record takes the hero footprint." and "Six-hour suppression: a record re-opened inside six hours never re-dates itself." The list is now eight for eight. |
| M4 · "the eight that touch their own work, plus T14" double-counts T14 | `deck-parts/04-panel.html` | "designers run the **seven** that touch their own work, plus T14". |
| M5 · F18 shown as sim-verified with no contested marker where the claim is first made | `deck-parts/03-today.html` | The c-24 caption now ends "The toggle's state at entry is contested; the stored figures are not." |

## Fact-check — minor

| Item | File | What changed |
|---|---|---|
| m1 · "(C14)" — the row §6b corrects | `deck-parts/03-today.html` | "no push has ever fired one (**C26, correcting C14**)". |
| m2 · D1 quote silently dropped "$3,200" | `deck-parts/11-purchase.html` | Figure restored inside the quotation marks. |
| m4 · three chip titles truncated / one id rendered three ways | `deck-parts/05-found.html`, `deck-parts/14-questions.html`, `deck-parts/06-why-return.html` | F169 → "… even when installed (no associated domains)"; F30 → "… 1 of 4 pending items, **not the money**"; F41 settled on one short form, "Three disagreeing attention counts on one screen", in both places it carries a title. |
| m5 · F57 cited with no contested marker | `deck-parts/05-found.html` | The Reach note now says F57 is contested too — the rows do expose a button role at Dynamic Type XXL, so the judges did not count it against either direction. |
| m6 · the photograph graft chipped F17 | `deck-parts/12-compare.html` | Chipped **F06** (the id judge-j2 names) with F17 kept alongside. |
| m7 · a-M2 sheet named the shipped deviation, not the manifest's | `fragments/a-M2.sheet.html` | "drawn at 118 pt, not the **manifest's 180** or the kit's shipped 150". |
| m8 · "Aspen Loft" vs the seeded "Aspen Loft Refresh" | `deck-parts/06-why-return.html` | Direction A's quoted WHAT MOVED line now uses the seeded name, as the A sheets do. |
| m9 · "six of these ten are absent outright and two more are half-present" is not derivable from the table | `deck-parts/07-why-buy.html` | Softened to "most of these ten are absent or half-present." |
| m10 · d-01 caption's "silence" half unsupported by F138 | `deck-parts/03-today.html` | F13 ("Only the date changes from one morning to the next") added beside F138. |
| m11 · "no return event beyond `app_open`" understates F190 | `deck-parts/02-ask.html` | "the app emits no **return-specific** event at all — nothing beyond an `app_open` to have counted anyway." |

---

## Visual QA — blocking

| Item | File | What changed |
|---|---|---|
| B1 · `.f-chip{white-space:nowrap}` clipped whole sentences off the page | `deck-parts/00-head.html` §9 | `white-space:normal`, `align-items:flex-start`, `max-width:100%`; `.f-chip::before{margin-top:.55em}` so the severity dot sits on the first line. Chips now wrap inside their card (see `deck-qa/panel-1440-light.png`). |
| B2 · `fitFrames()` scaled the phones but not the 28px gap, pushing a frame off canvas at 390 | `deck-parts/99-script.html` §5 | The gap comes out of the space first: `s = Math.min(1, (avail − GAP·(perRow−1)) / (FRAME_W·perRow))`. Measured after: every frame group fits its column at 390 and 1440, `fitOverflow 0`, `pastVP 0`. |

## Visual QA — major

| Item | File | What changed |
|---|---|---|
| M1 · unbreakable `file:line` tokens broke the measure at 390 and starved a column at 1440 | `deck-parts/00-head.html` §3 + §11, `deck-parts/03-today.html` | `.dk-page code{overflow-wrap:anywhere;word-break:break-word}`; new `.dk-table--fixed{table-layout:fixed}` applied to the today anatomy table with explicit 16/21/21/21/21 column widths. The two cells no longer interleave. |
| M2 · light `--dk-faint` #77695A = 4.28:1, under AA, and it carries every eyebrow | `deck-parts/00-head.html` §2 | Light value only → `#6A5C4D`. Harness now samples **5.2:1** for `.hour`, `.dk-h4`, `.dk-note`, `.dk-frame-cap` in light; dark unchanged at 6.09:1. Zero samples below 4.5 in all four passes. |
| M3 · 25 tables scrolled sideways at 390 with no affordance, so A and B were never on screen together | `deck-parts/00-head.html` §11, `deck-parts/99-script.html` §5b | Below 700px every `.dk-table` restacks as definition rows: the row header, then each cell under its own column label. New §5b copies each table's own `thead` text onto its body cells as `data-l` (colspan cells and row headers skipped), and `td[data-l]::before` prints it. 374 cells labelled; **zero** horizontally scrolling tables at 390. Stacked captions forced full-width. |
| M4 · a 2-up or 3-up frame row at 390 drew the mock's 12–17px type at 4–7px | `deck-parts/00-head.html` §7, `deck-parts/99-script.html` §5 | Under 820px `.dk-frames{flex-wrap:wrap}` and the fit routine fits one frame per row. Every group at 390 now lands `--s 0.8178` instead of 0.26–0.40. |

## Visual QA — minor

| Item | File | What changed |
|---|---|---|
| m1 · 31 figures `loading="lazy"`, which a print export misses | `deck-parts/build.mjs` | Attribute dropped from `shotImg()`; `decoding="async"` kept. Every figure is a `data:` URI already inside the file. |
| m2 · the index scroller clipped its current row against the theme toggle | `deck-parts/00-head.html` §4 | `scroll-padding-inline:12px 26px` on `.dk-index-scroll`. "PURCHASE PATH" now lands whole (`deck-qa/asread-purchase-1440-dark.png`). |
| m3 · `.dk-frame-cap` overran its column by 8px at 600 | — | Closed by B2; shell parity at 600 is `ok`. |
| m4 · quirks mode when the raw file is opened locally | — | Not a deck defect. `presentation.html` correctly carries no doctype (the Artifact wrapper supplies it); the harness reports `hasDoctype:false` by design. |

---

## Left open, on purpose

- **Fact-check m3 — the cover thesis is authored, not lifted from `synthesis.md`.** The report offers
  "accept as authored-for-the-cover (it invents nothing)" as one of its two options, and that is the
  one taken: the first clause is F34's verbatim title, the second is H3's stated bar, and the chip row
  is already labelled `inferred`. The review lead's own sentence — "B is the better place to end up, A
  is the safer way to start, and their first slices share most of their plumbing" — is carried in
  `13-recommendation.html`, where the synthesis is presented. Kody's call if he wants the cover to
  quote it instead.
- **Fact-check m9's stronger form.** The sentence is softened; the checklist's verdict column is still
  prose rather than a labelled Absent / Half / Present column. Labelling it is a content change to ten
  rows, not a repair, and it would change what the table asserts.

## Verification after the rebuild

`node mock/deck-parts/build.mjs` → 15/15 sections, 31/31 figures, 0 leftover markers, 0 non-ascii,
702/702 braces, **5.98 MB** (6,265,256 bytes) of the 16 MB ceiling.

`node mock/deck-parts/qa-run.cjs`, all four passes (1440/390 × light/dark) plus the toggle pass and
the width sweep inside the doctype skeleton:

- `scrollWidth` equals the viewport at **1440** and **390**, and shell parity is `ok` at 1680, 1440,
  1200, 1024, 820, 600 and 390 — no horizontal scroll anywhere.
- 0 console errors, 0 page errors, 0 failed requests, 0 external requests. Hosts: `file://`,
  `fonts.googleapis.com`, `fonts.gstatic.com`.
- 0 elements crossing the viewport edge; 45 frames per pass, `fitOverflow 0`, `pastVP 0`.
- `<title>The Daily Return</title>` present in the first 8 KB; 15/15 index rows, sticky, `aria-current`
  following the scroll; 8 font faces; every contrast sample ≥ 4.5:1 in both themes.
