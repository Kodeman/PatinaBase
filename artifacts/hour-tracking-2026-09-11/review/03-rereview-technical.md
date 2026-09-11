# Review 03 — technical + design, round 2 (adversarial re-review)

**Target:** `artifacts/hour-tracking-2026-09-11/deck/src/index.html` (1,529 lines, 131 KB)
**Baseline:** round 1 = `review/01-technical.md`; fixes claimed in `review/02-fix-log.md`
**Date:** 11 September 2026 · **Stance:** adversarial, no severity filter
**Verdict:** `clean = false` — **0 blockers · 5 majors · 10 minors · 6 notes**

Six of round 1's twenty-three findings are fully discharged and verified
(TD-3, TD-4's paging case, TD-5, TD-11, TD-12, TD-18). **TD-1 is not fixed —
it is relocated**, and the relocation created a second, larger defect. **TD-2's
fix introduced a new keyboard regression.** **TD-4 is half-fixed**: the counter
is right when you page, still wrong when you read.

---

## §0 · Method

- Static read of all 1,529 lines; CSS token audit; WCAG 2.1 contrast computed
  from token hex values (sRGB relative luminance, `(L1+.05)/(L2+.05)`).
- **Render check ran.** Playwright `@playwright/test@1.58.2` resolved from
  `apps/designer-portal` via `createRequire`. Chromium refused to launch inside
  the command sandbox (`mach_port_rendezvous_mac.cc:155 … Permission denied
  (1100)`) — the same failure round 1 recorded; re-run with the sandbox
  disabled for those commands only.
- Page content wrapped in the Artifact publish shell
  (`<!doctype html><html><head><meta charset><meta viewport><reset></head><body style="margin:0">`)
  at `review/shots/_r2wrapped.html`.
- Scripts (re-runnable with `cd apps/designer-portal && node <script>`, sandbox off):
  `review/shots/r2-check.cjs` · `r2-probe2.cjs` · `r2-probe3.cjs` · `r2-shots.cjs`.
  Data: `review/shots/r2-report.json` · `r2-report2.json` · `r2-clip.json`.
  Screenshots: `review/shots/r3-*.png` (40 files; instant-scroll, authoritative)
  and `r2-*.png`. **Ignore `r2-1440-*-sheet3/6/14.png` — those deep links were
  taken before the smooth scroll landed; the `r3-*` set is the correct one.**
- Widths measured: 390, 768, 1024, 1200, **1201**, 1280, 1440, 1600, 1920 —
  light and dark, `prefers-color-scheme` emulated, plus `reducedMotion: reduce`
  and both `data-theme` overrides.
- Citations spot-checked this round: 9, all exact (see §4).

### The brief's 390 assertion — ran, passed, proves nothing

`document.documentElement.scrollWidth <= window.innerWidth` is **true at 390 in
both palettes** (and at every other width measured). It is true *by
construction*: `body { overflow-x: hidden }` (`index.html:99`) clips horizontal
overflow rather than reporting it. I re-ran round 1's stronger painted-box
probe: **0 boxes cross the 390 viewport edge** once `clip-path`-hidden ancestors
are excluded; `scrollWidth === 390`; all **848** `tbody td` and every `tfoot td`
carry `data-label`; `#idx` is `display:none`. **The 390 layout is genuinely
sound and better than the laptop layout.**

Note for any future gate: *both* probes are blind to the real defect in this
deck. The clipping in **R2-1** happens *inside* `.scroller`, where the hidden
cells still sit within the viewport box. The standing gate for a house deck
must be `scroller.scrollWidth - scroller.clientWidth === 0` per table, not a
document-level width assertion.

---

## §1 · Artifact-rule conformance — the blocker checklist

| Rule | Result | Evidence |
|---|---|---|
| No `<!doctype>` / `<html>` / `<head>` / `<body>` tags | **PASS** | grep: 0 hits |
| `<title>` first, `<style>` at top | **PASS** | `:1`, `:5-289` |
| Light tokens on bare `:root` | **PASS** | `:14-53` — every token dark redefines is defined here first |
| Dark under `@media (prefers-color-scheme: dark)` guarded `:root:not([data-theme="light"])` | **PASS** | `:55-73` |
| Dark also under `:root[data-theme="dark"]` | **PASS** | `:75-91`, after the media block; equal specificity, later wins |
| No colour defined only inside a media block | **PASS** | all 15 dark tokens have a bare-`:root` definition |
| `body` explicit background + side padding | **PASS** | `:96-98`; measured 16px @390, 48px @1200, 57.6px @1440, 64px @1600 |
| Every table inside `overflow-x:auto` | **PASS** | 15 tables, 15 `.scroller` wrappers, 1:1 |
| Nothing wider than the 390 viewport | **PASS** | painted-box probe, both palettes, 0 unclipped |
| External assets only `fonts.googleapis.com` (+ `fonts.gstatic.com` files) | **PASS** | `:2-4` only; no other absolute URL in the file |
| No `<a download>` | **PASS** | grep: 0 |
| No per-second motion | **PASS** | 0 `@keyframes`, 0 `animation:`, 0 `transition:`, 0 `transform:` |
| `prefers-reduced-motion` honoured | **PASS** | `:279-285`; measured `scroll-behavior: auto` under `reducedMotion: reduce`; JS checks `matchMedia` before smooth-scrolling (`:1497`) |
| Keyboard navigation works | **FAIL** | **R2-3**, **R2-4** — see below |
| House-sheet §A families with fallbacks | **PASS** | `:49-51` byte-identical to `SPEC.md:118-120`; the `<link>` at `:4` is `SPEC.md:112-114` verbatim. Computed: Playfair Display → Georgia → Times; Inter → -apple-system → system-ui; DM Mono → SF Mono → Fira Code → ui-monospace |
| Body-text contrast ≥ 4.5:1 both palettes | **PASS** | **13.53:1** light · **12.89:1** dark |

Also clean: no `box-shadow`, no `text-overflow: ellipsis`, no inline `style=`
attribute, no hex literal outside the token block, no `<th>` in any `<tbody>`,
one `h1` / fifteen `h2` / one `h3` with no skipped level, a `forced-colors`
block (`:286-292`), and zero console or page errors in any of the sixteen
render cases.

### Contrast, computed from the token values

| Ink | on `--paper` light | on `--paper` dark |
|---|---|---|
| `--ink` (body, 14–16px) | **13.53:1** ✓ | **12.89:1** ✓ |
| `--ink-muted` | 8.99:1 ✓ | 9.64:1 ✓ |
| `--ink-subtle` | 7.54:1 ✓ | 8.18:1 ✓ |
| `--ink-faint` (11–12px meta, `.id`, `.src`, `.ann .k`, `.verdicts .k`, `td::before`) | 6.35:1 ✓ | 6.87:1 ✓ |
| `--oak` — **no longer used as text** | 4.20:1 (1px rule + underline only; needs 3:1) ✓ | 5.33:1 ✓ |
| `--clay-ink` (focus ring) | 5.61:1 ✓ | 8.03:1 ✓ |
| `--terracotta-ink` (`.defect`) | 5.28:1 ✓ | 7.34:1 ✓ |
| `--sage-ink` (`.holds`) | 5.27:1 ✓ | 7.80:1 ✓ |
| `#idx` subtle-on-paper-doc | 7.73:1 ✓ | 8.61:1 ✓ |
| `--hairline` (1px structure) | 1.20:1 — see R2-18 | 1.50:1 |
| `--hairline-strong` (blended) | 1.30:1 — see R2-18 | 1.93:1 |

**TD-5 discharged.** Computed DOM values confirm `td.id`, `td.src`, `.ann .k`
and `.verdicts .k` all resolve to `rgb(101,89,78)` = `--ink-faint` in light and
`rgb(184,174,162)` in dark.

---

## §2 · Round-1 findings — what actually landed

| Round 1 | Claimed | Verified round 2 | Now |
|---|---|---|---|
| TD-1 clipping | fixed (breakpoint 860→1200) | **NO.** 3 tables clip 48px at 1440/1600/1920; 110px at 1280; **13 of 15** clip at 1201 | **R2-1** major |
| TD-2 scroller unreachable | fixed | Partly — reachable, but 15 dead stops added and paging killed | **R2-4** major |
| TD-3 ↑↓/PgUp swallowed | fixed | **YES** — ArrowDown moves 40px; only ←→/j/k intercepted (`:1513-1521`) | closed |
| TD-4 wrong counter | fixed | Half — correct for 12/12 arrow presses; **wrong at 5 of 9 mid-slide positions** | **R2-3** major |
| TD-5 `--oak` as text | fixed | **YES** — all four rules moved to `--ink-faint` | closed |
| TD-6 "One passes outright" | fixed | **YES** — heading "Two", table has 2 `m-full` (`:341`, `:353`) | closed |
| TD-7 tfoot data rows (sheet 05) | fixed | Fixed there; **same pattern survives on sheets 06, 09, 10** | **R2-7** minor |
| TD-8 "Twenty-three removals" | fixed | Restated, not resolved — the 19/4 split is not derivable | **R2-8** minor |
| TD-9 "Three days" | fixed | **YES** — "Three to five days" (`:1412`) | closed |
| TD-10 `#idx` overlay | fixed (hidden <700px) | Partly — still an opaque plate over text at 1440 and 760 | **R2-6** minor |
| TD-11 `PROJECT_TIME_ENTRIES` | fixed | **YES** — `.no-caps` on the `<code>` (`:128`, `:316`) | closed |
| TD-12 `color-scheme` | fixed | **YES** — measured both override directions correct | closed |
| TD-13 unnamed tables | fixed | **YES** — 15/15 `aria-labelledby`, all 17 ids resolve | closed |
| TD-14 shortcuts hidden from AT | fixed | **YES** — `.visually-hidden` legend at `:292` | closed |
| TD-15/16 house-sheet deviations | recorded | Recorded, but the list is **incomplete** | **R2-10** minor |
| TD-17 Inter 600 unused | left | Still unused — and the inverse now bites | **R2-13a** minor |
| TD-18 skip link | fixed | **YES** — `clip-path` technique, `tabindex="-1"` on `#sheet-2`, focus lands there | closed |
| TD-19 unused tokens | recorded | Unchanged, plus a new dead rule | **R2-17** note |
| TD-20 citation paths | fixed | **YES** — colophon "Paths" row (`:1450`) | closed |
| TD-21 390 block-card cost | accepted | Accepted — but now inflicted on 1024 and 1180 too | **R2-2** major |
| TD-22 HT-30 as "consent" | deferred | Unchanged | **R2-19** note |
| TD-23 `scrollWidth` unfalsifiable | deferred (wrong file) | Unchanged | **R2-21** note |

---

## §3 · Findings

| ID | Severity | Confidence | Location | Finding | Fix |
|---|---|---|---|---|---|
| **R2-1** | **major** | high | `index.html:206-207, 137-139, 210` | **Truncation persists at every width ≥ 1200px — and the deck truncates text, which its own house sheet forbids.** The main column caps at **1092px** (`.inner` `max-width:1240px` less the 124px gutter and 24px gap), but `.wide` is `min-width:1020px` and `.widest` is `min-width:1140px`, so `.widest` can *never* fit at any viewport width. Measured (`r2-clip.json`): 1440/1600/**1920** → sheets 03, 10, 14 each clip **48px**; 1280 → **110px**; **1201 → thirteen of fifteen tables clip** (183px on the three `.widest`, 63px on the ten `.wide`). Text is lost, not padding: at 1440, six sheet-03 footnote citations lose 10–32px mid-citation; sheet 10's `none · head+20 reserved` loses 48px; sheet 14's `CR extend · MOB gate · VET instrument` loses 48px. Visible in `r3-1440-dark-sheet10.png` — the Migrations column reads **`none · head+20 re`** and **`head+21…+2`**, cut at the edge. `SPEC.md:162`: *"Truncation: none. `text-overflow: ellipsis` must not appear. Wrap."* The deck avoids `ellipsis` and truncates by overflow clip instead. The colophon (`:1447`) justifies keeping the 1240px measure because *"narrowing would worsen sheet-table clipping"* — the clipping it was accepted to prevent is still happening at every width. | Delete `min-width` from `.wide` and `.widest` and let the cells wrap (they already do), or cap `.widest` at 1092 / `.wide` at 1020 and set the block-card breakpoint from those numbers. Moving the breakpoint cannot fix `.widest`; only shrinking the table can. |
| **R2-2** | **major** | high | `index.html:210` + `r3-1024-light-sheet03.png` | **Raising the collapse breakpoint 860→1200 destroys the matrix sheets across the whole 861–1200 band.** At 1024 — a standard projector and half-screen width — sheet 03 renders as **17 stacked six-line cards** over ~4,500px of scroll, one 11px dial per line, with 794px of horizontal main width unused. Three capabilities fit per screen instead of seventeen; the across-surface comparison the sheet exists to make cannot be made. The band covers 1024 and 1180, the two commonest presentation widths after 1440. The round-1 fix traded *a clipped matrix* for *no matrix*, and (per R2-1) did not stop the clipping anyway. | Fix R2-1 by shrinking the tables, then return the breakpoint to ~820–860px where the block card is genuinely the right form. |
| **R2-3** | **major** | high | `index.html:1477-1484, 1495-1502` | **The sheet counter still lies past the midpoint of any tall sheet, and `ArrowRight` skips a sheet.** `nearest()` returns the slide with the smallest `\|getBoundingClientRect().top\|`, so once you are past a slide's midpoint the *next* slide's top is nearer. Measured (`r2-report2.json`, instant scroll): at 50 / 70 / 90% into sheet 14 the pill reads **15** while sheet 14 fills the viewport; at 70 / 90% into sheet 12 it reads **13**. Wrong at 5 of 9 sampled positions. Worse, `go(delta)` is built on the same function: from **80% into sheet 14, ArrowRight lands on sheet 16** — skipping sheet 15, the decision sheet, the one Kody is meant to act on. From 45% it lands on 15 without having reached the bottom of 14. Sheets 12 and 14 are 2,021px and 3,326px tall at 1440, so this is the normal reading position, not an edge case. | One predicate, used by both: the current slide is the **last** slide whose `top <= innerHeight * 0.33` (equivalently, the slide whose box contains viewport y = 0). Paging then means "the slide after the one I am in". |
| **R2-4** | **major** | high | `index.html:1521-1524` vs `:1512`, `:216` | **The TD-2 fix inserts 15 dead keyboard stops with a false accessible name and silently kills paging.** Every `.scroller` gets `tabindex="0"` and `aria-label="Table, scrolls horizontally"` unconditionally. Measured: at 1440 only **3 of 15** can scroll; at ≤1200 **none** can — yet all 15 stay in the tab order claiming to scroll. From a fresh load the **second Tab press lands on a non-scrollable scroller** (`r2-report2.json` `tabSequence`). And because the keydown handler early-returns on any `.scroller` target, arrow keys then do nothing at all — measured `pagingBlockedInScroller` = **0px moved**. So the one navigation the deck documents (`:292`, `:1465`) dies on the first Tab press with no feedback of any kind. No `role` is set either, so per accname the `aria-label` on a generic `div` is not reliably exposed. WCAG 2.4.3 (focus order), 4.1.2 (name/role/value). | Add `tabindex="0"`, `role="region"` and the label **only** where `scrollWidth > clientWidth`, re-evaluated on `resize`; narrow the handler exemption to "this scroller can actually scroll in this key's direction", falling through to paging otherwise. Fixing R2-1 removes most of the need. |
| **R2-5** | **major** | med | `index.html:309`, `:1347` vs `:1419-1422` | **"Four gate the first line of code" is contradicted by the deck's own gates table.** Both the cover and sheet 14 assert HT-1, HT-4, HT-10, HT-37 "gate the first line of code". Sheet 15's Gates column says otherwise: HT-1 → "The first line of SQL in W1"; HT-4 → "**W7**, and the cause behind W1's backfill"; HT-10 → "**W2's head+12**"; HT-37 → "**W2's band**". Three of the four gate later waves. The single sentence that frames the whole ask misstates itself, on a sheet whose entire method is arguing from its own evidence. | "Four must be ruled before the plan can be sequenced — HT-1 gates W1's first line; HT-10 and HT-37 gate W2; HT-4 gates W7 and W1's backfill." |
| **R2-6** | minor | high | `index.html:186-197` | **`#idx` is an opaque plate over live body text at every width ≥ 700px.** `position: fixed`, `background: var(--paper-doc)` (opaque), `pointer-events: none`, `aria-hidden="true"`. Measured at 1440 it covers a painted text run at **3 of 6** sampled scroll positions — "MOB §3 adopted; VET / LEAH say 2 from th…", "studio_member_rates, in the People Room…", "turbo build --filter=@patina/supabase…" — and at 760px at 2 of 6. Visible in `r3-1440-dark-sheet10.png` (over the W6 gate cell) and `r3-1024-light-sheet03.png`. The round-1 fix (hide < 700px, slide bottom padding 104→140px) addresses slide *ends*; the reader spends their time mid-slide, and `pointer-events: none` means the plate cannot be moved or dismissed. | Move the readout into the left gutter, which is empty below the chapter label and already prints the sheet number on every sheet — or delete it; the gutter makes it redundant. |
| **R2-7** | minor | high | `index.html:824-835`, `:1083-1092`, `:1178-1187` | **`tfoot` still carries non-summary rows on three sheets.** TD-7 was fixed on sheet 05 only. Sheet 06's `tfoot` is a fifth comparison row ("What the database already permits a `member`"); sheet 09's is a legend; sheet 10's is a migration-numbering note. Screen readers announce all three as the table footer. Only sheet 10's reads as a genuine footer. | Move sheet 06's row into `<tbody>` with a `--hairline-strong` rule above it; render sheet 09's legend as a `.legend` block beneath the scroller, matching sheet 02's own treatment (`:388-392`). |
| **R2-8** | minor | med | `index.html:1268` + rows 12, 13, 20, 21, 22, 23 | **"Nineteen deletions, four rulings/corrections" is still not derivable from the table.** The fix log names #12, #20, #22, #23 as the four. But #13's disposition is "Reopen BIL-08 as rate-display drift, not absence; edit both copies" — a correction; #21 is "Stale line citations … The draft is an input, not a record" — also a correction; and #23 is conditional ("verify the pointer exists before fixing it"). A reader who counts gets at most 17 deletions. This is TD-8 restated at a different number. | Add a `Disposition` column (`delete` / `correct` / `rule` / `dropped`) and let the heading count that column — or drop the split from the heading entirely. |
| **R2-9** | minor | med | `index.html:1350` + 40 rows | **Sheet 14's "For / against" column mixes four incompatible cell types under one header.** Vote counts ("9 · 0"), counts with a gloss ("4 · 1 (LEAH keeps tier 3)"), seat lists ("CR narrow; FS flags the cost", "FS decisive; draft says DEFINER", "CR extend · MOB gate · VET instrument"), and bare words ("unanimous", "FS blocker"). Kody must rule 40 questions off this column; it is neither scannable nor comparable. It is also the column R2-1's clip eats first — the three longest cells are exactly the ones cut. | Split into numeric `For` / `Against` plus a `Note` column, or rename the header "Panel" and stop implying a tally. |
| **R2-10** | minor | high | `index.html:1447` vs `:134`, `:232-235`, `SPEC.md:159` | **The recorded house-sheet deviation list is incomplete.** The colophon names three deviations (1240px measure, off-module block gaps, `.t-head` beyond running heads) and claims that is the set. Two that round 1 named are missing: `.m { width:11px; height:11px; border-radius: 50% }` where `SPEC.md:159` permits 50% for *"the 7px mark dot only"*, and `.slide { padding-block: 56px 140px }`, both off the 24/48/72/12 module (`SPEC.md:157`). | Add both lines to the colophon, or normalise the dial to 7px and the padding to 48/72. |
| **R2-11** | minor | med | `index.html:707-709` vs `00412:2672` | **Money hole #4's citation omits the line the claim depends on.** Sheet 05 argues the unbilled view "silently understates" because of "an INNER JOIN on `profiles`", citing `00412:2683-2685`. The join alone cannot drop a row: `project_time_entries.user_id` is `NOT NULL REFERENCES public.profiles(id)` (`00177:18`), so a matching profile always exists. The claim holds only because the view is declared `WITH (security_invoker = true)` at **`00412:2672`**, so the caller's `profiles` RLS applies — and that RLS is narrow (`profiles_select_self` / `_counterparty` / `_admin`, `00555:700-733`). That line is cited nowhere in the deck, and the stated cause ("who is not an org member") names the wrong mechanism. | Cite `00412:2672` beside the join and restate the cause: "the caller cannot see that author's `profiles` row under `profiles` RLS". |
| **R2-12** | minor | med | `index.html:1281` vs `00177:89` | **Deletion row #9 cites the column's uses, not the column.** The row is "The `profiles.default_hourly_rate_cents` **column**", cited `00177:111,118`; those two lines are the *view's* references to it. The column is created at `00177:89` — `ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS default_hourly_rate_cents integer`. A wave whose act is `DROP COLUMN` needs the definition line. | Cite `00177:89` for the column; keep `:111,118` for the view legs (which row #3 already removes). |
| **R2-13** | minor | med | `index.html:597`, `:821` vs `00316:237-240` | **The guest / co-member claims cite a policy body that does not contain them.** Sheet 03's annotation says `time_entries_studio_read` "grants every **active non-guest** co-member SELECT"; sheet 06's guest row says a guest is "**excluded** from `time_entries_studio_read`". Both cite `00316:237-240`. The policy at those lines is `USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_time_entries.project_id AND is_studio_comember(p.designer_id)))` — no role test, no active test. Those live inside `is_studio_comember`, defined at `00315:29` and **redefined at `00556:51`**, neither of which the deck cites. The claim may well be true; the cited evidence does not establish it, and the helper moved after 00316. | Cite `00556:51` (the live definition) alongside `00316:237-240` wherever the non-guest/active property is asserted. |
| **R2-13a** | minor | med | `index.html:4` + 14 `<strong>` + 11 `<em>` | **The deck uses two faces it does not load, and loads one it never uses.** Computed: all 14 `<strong>` resolve to `font-weight: 700`; the request (`:4`) loads Inter 400/500/600 and DM Mono 400/500 — **no 700 in either**, so every `<strong>` is a synthesised faux-bold (the first one is faux-bold **DM Mono**, inside a `.t-head` cell). All 11 `<em>` resolve to `font-style: italic` in **Inter**, whose request has no `ital` axis — synthesised oblique. Meanwhile Inter 600 is requested and used by zero rules (round 1's TD-17). `SPEC.md` §A3's scale tops out at weight 500. | `strong { font-weight: 500 }` and replace `<em>` with `--ink` + `.t-head`-style emphasis, or add `700` and the `ital` axis to the request (which departs from the §A2 verbatim block — record it if so). |
| **R2-14** | minor | med | measured: 0 `@media print` rules | **No print stylesheet on a business deck that will be PDF'd.** `.slide { min-height: 100dvh; display: flex; align-items: center }` (`:131-135`) and the fixed `#idx` mean a browser print produces slides broken mid-table with a pill stamped on every page. A one-reader business deck is the artefact most likely to be exported and mailed. | One block: `@media print { #idx{display:none} .slide{min-height:0; display:block; break-after:page; border:0} }` plus forcing the ≤1200px block-card rules **off** so tables print as tables. |
| **R2-15** | minor | low | `index.html:131` | `min-height: 100dvh` has no `vh` fallback. Safari < 15.4 and Firefox < 101 drop the declaration entirely; slides then collapse to content height and the per-sheet rhythm is lost (content stays readable, nothing is hidden). | Precede it with `min-height: 100vh;`. |
| **R2-16** | note | high | `index.html:213` vs `:216` | **`.scroller` at ≤1200px does not get the `overflow-x: visible` it declares.** The base rule sets `overflow-y: hidden`; per CSS Overflow, a `visible` value on one axis computes to `auto` when the other axis is not `visible`. Measured `overflowX: "auto"` at 1024 and 390. No defect today (nothing overflows in block-card mode), but the declared intent is not achieved and any future overflowing child — a focus ring, a wide `<code>` — is clipped silently. | Set `overflow: visible` on both axes inside the media block, or drop `overflow-y: hidden` from the base rule (nothing needs it). |
| **R2-17** | note | high | `index.html:123` | `.oak { color: var(--oak) }` is declared and used **zero** times in the markup. `--oak` is 4.20:1 on light paper — below AA for text — so an author reaching for the class would silently reintroduce TD-5. | Delete the rule. `--oak` should survive only on `.gutter .rule` (`:152`) and the link underline (`:270`), both non-text at 3:1. |
| **R2-18** | note | med | `index.html:26, 29, 222-223` · `SPEC.md:160` | Hairlines are **1.20:1** (`--hairline`) and **1.30:1** (`--hairline-strong`, blended) on light paper. Below 1200px these rules are the *only* structure separating records — sheet 03 becomes 17 cards divided by a 1.30:1 line. WCAG 1.4.11 exempts decorative separators, so this is not a failure, and both values are the house sheet's own (`SPEC.md:160`). On a projector or a dimmed screen the 17 cards will read as one column. Recorded, not demanded. | If R2-2 is fixed, this stops mattering. Otherwise give the block-card `tr` `border-top: 1px solid var(--ink-faint)` at ≤1200px only. |
| **R2-19** | note | med | `index.html:309`, `:1411` vs `synthesis.md:301-304` | **HT-30 is still grouped as a "consent ruling".** The cover and the decision sheet call HT-30 (the strengthened §6 no-dashboard test), HT-35 (auto-start disclosure and opt-out) and HT-36 (aggregate-by-default) the three rulings that "decide whether the first hire trusts the clock". HT-30 governs vision conformance, not consent; HT-10 (who may read whose hours) or HT-12 is the better third. Round 1 raised this as TD-22; the fixer deferred it to the orchestrator and it is unchanged. Re-raised so it is ruled rather than inherited. | Orchestrator's call: amend the synthesis and the deck together, or accept the grouping explicitly. |
| **R2-20** | note | med | `index.html:313-318` vs `:1381` | **The cover's four count tiles are, by the deck's own proposed rule, a dashboard.** HT-30's recommendation reads: *"a total is permitted as the front matter of the rows that produced it; a total with no rows beneath it is a dashboard."* Sheet 11's count row (`:1204-1209`) passes — the two paths and the stage table follow it. The cover's four figures (9 / 218 / 1 / 30–50) have nothing beneath them but a rule. Cosmetic, and a deck is not the product — but Kody is being asked to adopt a rule the deck breaks on page one. | Either put the four counts under the verdict list they summarise, or drop `.counts` from the cover and let the verdicts carry the numbers inline. |
| **R2-21** | note | high | `index.html:99` | `body { overflow-x: hidden }` makes the brief's `scrollWidth <= innerWidth` assertion unfalsifiable, as round 1 recorded (TD-23, skipped because it targeted a review script). Ran anyway: **true at all nine widths in both palettes**. Replaced with a painted-box probe: 0 unclipped overflow at 390. **Both probes are blind to R2-1**, whose clipped cells sit inside the viewport box. | Standing gate for house decks: assert `scrollWidth - clientWidth === 0` for **every** `.scroller`, in addition to the element-box probe. Implemented in `review/shots/r2-probe3.cjs`. |

---

## §4 · Citation integrity — nine spot-checks, nine exact

| Deck citation | Resolves to | ✓ |
|---|---|---|
| `00021:22` (`member_role` enum) | `CREATE TYPE member_role AS ENUM ('owner','admin','member','guest');` | ✓ |
| `00021:136` (the column is `role`) | `role member_role NOT NULL,` | ✓ |
| `00316:237-240` (`time_entries_studio_read`) | policy created at `:237`, `USING` at `:239-240` | ✓ (but see R2-13) |
| `00484:604-623` (`is_org_admin_or_owner`) | `CREATE OR REPLACE FUNCTION public.is_org_admin_or_owner(_organization_id uuid, …)` at `:604-605` | ✓ |
| `00484:626-644` (`is_project_team_member` has no role filter) | function body checks `project_team_members` membership only — **no role test**, as the deck claims | ✓ |
| `00412:2677,2680` (both `change_order_terms` rate legs) | `NULLIF((p.change_order_terms->>'hourly_rate_cents')::int, 0)` at both | ✓ |
| `00412:2683-2685` (the join) | `FROM project_time_entries te` / `JOIN projects p` / `JOIN profiles pr` | ✓ (incomplete — R2-11) |
| `use-time-tracking.ts:320` / `:467` | `billable: input.billable ?? true` / `if (input.billable !== undefined) row.billable = input.billable;` — the deck's "sets only when provided, no default" is exact | ✓ |
| `hours-ledger.tsx:683-700` / `:184` | the billing-state pill markup / `.eq('billing_state', 'pending_authorization')` | ✓ |

Combined with round 1's four, **13 of 13 spot-checked citations resolve
exactly.** Citation *accuracy* is not a problem in this deck; citation
*completeness* is (R2-11, R2-12, R2-13).

---

## §5 · What is good, and must survive round 3

1. **The 390 layout is the best thing in the file.** 848 labelled cells, zero
   overflow, a complete block-card fallback, the index hidden. Do not touch it
   while fixing R2-1/R2-2.
2. **Contrast is now clean at every text size in both palettes** — 6.35:1 is
   the floor, on 11px meta. `--oak` is off the ink list entirely.
3. **Theme handling is exactly right**, verified in both override directions:
   OS dark + `data-theme="light"` → light paper, `color-scheme: light`; OS light
   + `data-theme="dark"` → dark paper, `color-scheme: dark`.
4. **No motion at all**, plus a correct reduced-motion block and a `matchMedia`
   guard, plus a `forced-colors` block for the dials.
5. **Every arithmetic claim now checks out**: 6 requirement rows / 2 full marks;
   17 capabilities; one genuinely empty column (admin); 8 waves banding to
   30–50 and two paths to 15–25; 11 risks; 40 HT rows; 16 sheets. Only R2-8's
   19/4 split still fails.
6. **Keyboard paging itself is correct when used from a slide top** — 12 of 12
   ArrowRight presses landed on the right sheet with the right label.

---

## §6 · Fix order

1. **R2-1** — drop `min-width` from `.wide`/`.widest`. One change; it also
   dissolves **R2-2**, most of **R2-4**, and half of **R2-9**'s symptom.
2. **R2-3** — one position predicate, shared by the counter and `go()`.
3. **R2-4** — conditional `tabindex`/`role`; conditional handler exemption.
4. **R2-5** — one sentence, twice (cover and sheet 14).
5. **R2-6** — move the readout to the gutter or delete it.
6. **R2-7, R2-8, R2-9** — three table-semantics corrections.
7. **R2-11, R2-12, R2-13** — three citations completed.
8. Everything else is a minor or a record.

`clean = false`.
