# 02b — fix log for `02-document-review.md`

Subject: `artifacts/pricing-mechanics-2026-09-05/proposal.html`. Findings D1–D14, plus the orchestrator
rulings that override the reviewer's fix lines. Fix pass 1 (`01b-fix-log.md`) was read first and none of
its edits were undone. `source/proposal.md` was not edited — no finding instructed a spine change.

- **D1 · fresh vs unverified identical** — applied per ruling. Fresh keeps the page's ordinary faint ink,
  the date, and no extra word. Unverified is now scannably distinct without being dressed as a warning:
  `.age-unverified::before{content:"\25CB"}` puts a hollow circle before the word, and `.age-unverified .u`
  sets the word `unverified` with `text-decoration:underline dotted` in the same faint ink, still with no
  date. Aging keeps golden-hour ink + word, stale keeps terracotta ink + word — both unchanged. Applied at
  every place unverified appears: M4's LT-01 meta line, M5's preflight strip (`1 ○ unverified`), and §06's
  priced-on states table (the glyph added to the depicted meta line). M7 has no unverified row, so its
  price-age glyphs were left alone. M4's caption last sentence rewritten to describe the glyph: "Unverified
  keeps the same quiet ink. A hollow circle before the word and a dotted underline beneath it mark it out…"
- **D2 · unlocked rows carry no word** — applied as the reviewer's fix line says (legend once, not per row):
  M3's control row gains `Unmarked lines are unlocked` beside the rounding and floor readout.
- **D3 · mono below 12px** — applied per ruling. `.mono` and `.ref` now use `font-size:max(12px,.82em)` and
  `max(12px,.74em)`, so inline citations inside 13.5px cells and 12px traces stop dropping to 11.07/9.99/8.88px.
  Raised to 12px: `.index`, `.index .idxhead`, `.masthead-meta`, `.eyebrow`, `h4` (section and ruling caps),
  `.sim`, `th`, `.master .deplabel`, `.ruling .rec b`, `.who` bylines, `.srclist .acc`. Mockup meta lines were
  already 12px and stay 12px; a CSS comment above `.mono` records that the product's own stamp convention is
  11px (`stamp.tsx:52`) and that this document draws it at 12px anyway. Render check now reports
  **mono<12px = 0** at all six viewport×scheme combinations (was 341 of 928).
- **D4 · jargon outside deps/appendix** — applied per ruling. §01's "a grep across all 520 applied
  migrations… returns nothing" is now "the database has no column for it anywhere". §04's "where a migration
  stops being small" → "where a database change stops being small". §07's lede: "files, migrations, column
  lists" → "files, database changes, column lists". All ten `.who` bylines rewritten to "Needs a database
  change…" / "No database change" (P0 keeps "one function re-issue" as the qualifier). P2's "an atomic RPC is
  optional" → "one atomic write is optional"; P5's "already in the schema" → "already sits in the database";
  P7's body, its state table and its master-table cell say "one guarded write path" rather than "one RPC".
  §09's two migration sentences, §10's R8 recommendation and R11's "do not meet in the schema" likewise.
  §03's code-cited chapter, the master table's dependency rows and the appendix keep their terms as exempted.
- **D5 · sentences over 35 words** — applied per ruling. §01's opening sentence is now two (39 → 6/26/11
  words) and its "no price carries a date" sentence is short. §02's paraphrased feedback block and the
  principal's sentence split. §05 was already clean under a `<p>`-only count. §07 proposal bodies: P0 ×2, P2
  ×3, P3, P6, P10 split. §10: the lede, R1, R9 ×2 and R11 split. §11 has none. Post-fix count in the five
  gated sections is 0; §07 is also 0.
- **D6 · double-barreled questions** — applied per ruling. Q8 → "Would an ink change on an aging quote change
  how you enter prices?" Q9 → split into "Who besides you sees the margin table today?" and "Would they know
  whether they were allowed to?" as its own question. Q10 → "When a maker's invoice comes in at a different
  number than the signed proposal, how do you find out why?" Q5's trailing "or is the final number enough once
  it is locked?" also dropped, since it was the same fault. To keep the count at ten, the weakest question was
  dropped: the old Q3 (whether a studio default needs to vary by category from day one) — a build-scoping
  refinement of Q1 that the settings mockup already answers provisionally. Grouping is now 2/3/2/3, restated
  honestly by the `start` attributes; the lede's "three are compound and will take two" is replaced by "Each
  is a single question and each takes a sentence to answer".
- **D7 · Q9 presupposes a first hire** — applied inside D6. The question no longer assumes a first hire
  exists; it asks who sees the margin table, then whether they would know they were allowed to.
- **D8 · dangling "F150"** — left: already fixed by fix pass 1 (E31 wrote the finding out in words and removed
  the identifier). `grep -c 'F150' proposal.html` → 0. No further edit needed.
- **D9 · "173 citations"** — left: already fixed by fix pass 1 (E14 dropped the count; the sentence reads
  "These are the load-bearing ones"). No count claim remains to reconcile.
- **D10 · 35%/26% stated as flat fact** — confirmed and softened per ruling. The body already derives it in
  line from fix pass 1 ("35% on cost is 25.9% on price — 0.35 ÷ 1.35, derived here rather than cited"), so
  there is no attribution to hedge. The superlative is gone: "the single most important thing for a tool to
  keep straight" → "the distinction a tool must keep straight".
- **D11 · tariff range 3.5%–9%** — applied, taking the reviewer's first option (cite what is actually named).
  §04 now reads "tariff surcharges of 3.5% to 8% across the named cases"; the appendix strength row reads
  "mid-cycle surcharges of 3.5–8%". The "aggregated trade coverage, not re-verifiable at a single URL"
  qualifier from fix pass 1 stays.
- **D12 · mobile nav above the masthead** — applied, taking the reviewer's second option (source order below
  1100px) rather than a `<details>` disclosure, which cannot be opened by default at desktop widths with CSS
  alone. `<header class="masthead">` moved out of `<main>` to be a direct child of `.shell`, ahead of
  `nav.index`; at ≥1100px the grid places the nav in column 1 spanning both rows and the masthead and main in
  column 2, so the sticky sidebar is unchanged. Below 1100px a phone reader now meets the title first.
  Verified in `review/crops/390-light-top.png`.
- **D13 · M1 Proposed panel-cap missing a width** — applied: "M1 · Proposed · the same footer line · 1180px".
- **D14 · "bespoke"** — left: already fixed by fix pass 1 (E32 changed "bespoke path" to "custom-commission
  path"), so no occurrence remained to replace with "one-off". Banned-word grep → 0.

**Counts:** 14 findings — 11 applied (D1, D2, D3, D4, D5, D6, D7, D10, D11, D12, D13), 3 left because fix
pass 1 had already resolved them (D8, D9, D14). D6 and D11 were applied with a stated choice inside the
ruling's latitude.

---

## Gate output

```
== 1. check-math ==
math ok
== 2. banned content ==
grep -c '<img'                                  : 0
grep -ciw 'AI'                                  : 0
grep -ciwE 'bespoke|curated|luxury|elevated|disrupt': 0
== 3. render check (node review/render-check.mjs) ==

=== PART A RESULTS ===

scheme | viewport | overflowPx | monoTotal | mono<12px | contrastFails | navMissing | sectionsNotInNav | boxShadow!=none | radius>3px
light | 390x844 | 0 | 985 | 0 | 0 | 0 | 0 | 0 | 0
light | 1280x900 | 0 | 985 | 0 | 0 | 0 | 0 | 0 | 0
light | 1440x900 | 0 | 985 | 0 | 0 | 0 | 0 | 0 | 0
dark | 390x844 | 0 | 985 | 0 | 0 | 0 | 0 | 0 | 0
dark | 1280x900 | 0 | 985 | 0 | 0 | 0 | 0 | 0 | 0
dark | 1440x900 | 0 | 985 | 0 | 0 | 0 | 0 | 0 | 0

Full JSON written to review/render-check-results.json
Panel screenshots: 14 panels captured at 1280-light
== 4. jargon scan ==
JARGON TOTAL (outside §03, dependency rows, appendix): 0
== 5. sentence scan (01,02,05,10,11) ==
SENTENCES >35 words: 0
== 6. structural ==
div.ruling: 11
master P rows: 11
defects F1-F5: 5
nav anchors: 12 ids: 12 unresolved: []
questions: 10
size bytes:   168721
```

Notes on running the gate. `review/render-check.mjs` cannot resolve `@playwright/test` from the artifacts
folder (no `node_modules` above it), so it was copied to `apps/designer-portal/` and run from there — the
script's paths are absolute, so all output still landed in `review/`. The copy was deleted afterwards. The
headless chromium launch still needs the bash sandbox disabled (`bootstrap_check_in … Permission denied`),
exactly as the reviewer reported. Two stale panel screenshots from the previous run
(`01-m1-proposed-the-same-footer-line.png`, `11-m7-proposed-the-client-s-document-620px.png`) were removed
after their captions changed; `review/shots/panels/` holds 14 files, one per panel.
