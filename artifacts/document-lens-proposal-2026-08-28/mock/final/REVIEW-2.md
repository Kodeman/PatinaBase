# REVIEW-2 — `mock/final/index.html` after the W4b fix pass, against SPEC.md C.8

MR2, the prober, second pass. 2026-08-29. A fresh seat: I did not build this mockup and I did not
write `REVIEW.md`. Nothing under `mock/final/` that the builder owns was edited. Every claim in
`FINAL.md` and in the builder's and shooter's report-backs was treated as a claim to test, and
every number below was measured in this run.

**The gate.** The command this mockup must pass, from the repo:

```
cd /Users/kody/Code/patina-merged/artifacts/document-lens-proposal-2026-08-28/mock/final && node review-clickthrough.mjs
```

It must print `18 PASS / 0 FAIL of 18 items`. It prints **`17 PASS / 1 FAIL of 18 items`**.

Instrument: `mock/final/review-clickthrough.mjs`, **run unchanged** — see "Probe repairs" below.
Full log: `mock/final/review-shots/probe-log.txt` · machine-readable: `mock/final/review-results.json`
· evidence PNGs: `mock/final/review-shots/`.

Second-pass claims probes, mine, not part of the C.8 instrument:
`mock/final/review2-claims.mjs` (log `review-shots/claims-log.txt`) and
`mock/final/review2-visual.mjs` (log `review-shots/claims2-log.txt`).

Run environment: headless Chromium via `@playwright/test`, viewport 1560x1000, `deviceScaleFactor: 1`,
`file://` origin. At 1560 `fit()` resolves to `transform: none` on all three frames, so every pixel
below is a 1:1 pixel. File size **`602135` bytes** (was `452976` at pass 1).

---

## Probe repairs

**None. The script ran unchanged.** No selector or hook moved under it; `review-clickthrough.mjs`
executed end to end on the first attempt, wrote `review-shots/probe-log.txt` and
`review-results.json`, and reported all eighteen items. Nothing in the instrument was edited,
so this pass and pass 1 are comparable line for line.

One thing about the *evidence* has to be said plainly, because it changes what "pass 1" means here.
Before running I copied `review-shots/` aside to compare against. Every file in that copy except
two turned out to be **byte-identical to what my own run then produced**, including
`probe-log.txt`. The builder re-ran the prober's instrument after fixing (`review-results.json`
mtime `02:56`, after `index.html` at `02:53`), overwriting pass 1's artefacts in place. So:

- The **only surviving record of pass 1** is the prose and the tables inside `REVIEW.md`. All
  regression comparisons below are made against those quoted numbers, not against files.
- My run reproduces the builder's post-fix run exactly (`probe-log.txt` identical), which is a
  useful determinism result in itself. The two files that differ are `14-navigator-last.png`
  (rendering nondeterminism) and `tab-order.txt` (one line — see R-17).
- The interim copy has been removed so it cannot be mistaken for pass-1 evidence.

---

## The eighteen

| # | Item | Verdict | Observed |
|---|---|---|---|
| 1 | External requests = 0 | **PASS** | `0` non-`file:`/`data:`/`about:` requests over the whole load. `[]` |
| 2 | Page errors = 0 | **PASS** | `pageerror=0 []` · `console.error=0 []` · `unhandledrejection=0 []`. Also `0` page errors in the `reducedMotion: 'reduce'` context, and `consoleErrors: []` / `pageErrors: []` in `host-sim.mjs`. `0` page errors across both of my own claims probes. |
| 3 | `__mockReady` under `file://` AND `host-sim.mjs` | **PASS** | `file://`: `__mockReady=true`, `__mockError=null`. `host-sim.mjs`: `"mockReady": true`, `"mockError": null`, `"lensSettledExposed": true`, `execResult {"reExecuted": 1, "errors": []}`, `consoleErrors: []`, `pageErrors: []`, `externalRequests: []`. `review-shots/host-sim-out.txt`. **The host-sim is now repointed at this mockup** — it asserts `"stageExists": true`, `"frameCount": 3`, `"regionCount": 6`, `"exactlyOneFull": true`, `"firstFull": "approvals"`, `"firstRegionHeadYInFrame": 320`, `"ffeRows": 36`, `"catalogCrops": 5`, `"staticPaintOK": true`. Pass 1's R-04 is genuinely fixed. See R-09 for the one thing the probe's own print still fumbles. |
| 4 | box-shadow census / drop-shadow | **PASS** | `29` elements out of `3079` carry a non-`none` `box-shadow`, in **3** distinct site classes: `button.margin-chip.doc-elevated x21`, `div.lens-sheet-panel.doc-elevated x6`, `div.drawer.doc-elevated x2`. Every one computes to exactly `rgba(44, 41, 38, 0.08) 0px 1px 2px 0px`. Off-token values `0 []`. Stray site classes `[]`. `filter: drop-shadow` (elements and `::before`/`::after`) = `0 []`. The shooter's `["button.margin-chip.doc-elevated (x7)","div.drawer.doc-elevated (x2)","div.lens-sheet-panel.doc-elevated (x1)"]` is a **one-frame** count, not a whole-file one — see R-13. |
| 5 | Non-ASCII = 0 | **PASS** | `0` non-ASCII bytes. Independently confirmed from the shell: `LC_ALL=C grep -c '[^ -~\t]' index.html` returns `0`. File size `602135` bytes — under the 2 MB target by a wide margin. |
| 6 | Dev-bar states reachable and reversible | **PASS** | All six non-Rest buttons meet their C.6 contract and all six are fully reversible — every C.5 attribute on all three frames returns byte-identical to the rest reference (which includes `"motion":"normal"`). `Condensed scrollTop=400 lensOpen=false`; `Region in focus ffe density=full readingIndex=ffe`; `1280 wrap top=0 inView=true`; `390 wrap top=90 inView=true`; `Reduced motion data-motion=reduced --motion-scale=0`; `Slow motion 4x data-motion=slow --motion-scale=4`. `aria-pressed` live and single-valued at every step, and **the motion buttons no longer steal the frame state** — pressing `Reduced motion` at rest now reports `aria-pressed[rest=true,...,reduced=true]` (pass 1: `rest=false`). Pass 1's R-06 is fixed. The fifth C.5 state has no button: `[data-pen]` focus on `input#spec-mudroom-3-1440.spec-input` gives `data-lens-state=editing`; blur returns `condensed`. See R-08, R-11. |
| 7 | Condensation reaches steady state at `--motion-scale: 4` | **PASS** | `--motion-scale=4` confirmed on the stage. Coarse sweep, extent `4381px`, 21 samples down + 21 up: **`0`** flip-backs `[]`. All six density-map boundaries located by bisection — `[562, 976, 3067, 3505, 3943, 3993]` — and each swept 20 steps across a 48px window: all six `stable, one change`; unstable boundaries `0 []`. Region paths down: `approvals full->reading@657`, `schedule reading->full@657 full->reading@1095`, `ffe reading->full@1095 full->reading@4162`, `money condensed->reading@3067 reading->full@4162`, `care condensed->reading@3505`, `record condensed->reading@3943`. |
| 8 | CLS = 0, both registers | **PASS** | `PerformanceObserver({type:'layout-shift'})`, 30-step scripted scroll 0 -> foot on `#frame-1440`. Normal register: `CLS=0`, `0` shift entries `[]`. Reduced register (media query context): `CLS=0`, `0` entries `[]`. Extent at the start of the sweep `4381px`, at the end `5106px` — see R-16. |
| 9 | Nothing moves under the pointer | **PASS** | First density threshold bisected at `scrollTop=562`. Pointer parked on `div.sched-row` at `(349,546)`, frame scrolled `562-3 -> 562+3`: element under the pointer after = `div.sched-row`, **same node = true**; the parked row displaced `6px`, of which the scroll accounts for `6px` — **excess `0px`**. `review-shots/09-pointer.png` |
| 10 | Reduced-motion parity | **PASS** | Visible-text word diff, animated vs media-query reduced, over 5 dev-bar states x 3 frames: **`0`** words present in only one register `[]`. Animated vs dev-bar toggle: **`0` `[]`**. Duration census 1s after entering each state, `3047` elements: media query `rest:0 condensed:0 ffe:0 w1280:0 w390:0`; toggle `rest:0 condensed:0 ffe:0 w1280:0 w390:0`, with `data-motion=reduced` and `--motion-scale="0"` verified at every sample. `document.getAnimations()` running = `0` in both. `review-shots/10-reduced-mq.png` |
| 11 | Keyboard order survives condensation | **PASS** | Real `Tab` presses from `#frame-1440`, at frame scroll 0 / 400 / 1200. `54` stops inside the frame at each offset; DOM order preserved = `true` at all three; **`0`** focused elements obscured by the pinned lens line; **`0`** stops without a focus ring — every stop reports `outline: solid 2px rgb(124, 94, 48)`. The band occupies `x=[249,1159]`, the rail's focusables `x=[17,184]`. |
| 12 | Nothing escapes the frame at 390 | **FAIL** | `#frame-390` itself passes: `scrollWidth/clientWidth = 388/388`. **`26`** descendants report `scrollWidth > clientWidth` (pass 1: `31`); **`21`** of them have a visible child hanging past their own edge (pass 1: `25`), in every case `span.da-pool` overhanging `5px` — `div.paper-measure 337>332`, `div#sentinel-390.lens-sentinel 337>332`, `div.letterhead 337>332`, `p.vitals 337>332`, `span.vital-act 55>50`, `button.act.is-quiet 55>50`, `button.act.is-lead 125>120`, ... The remaining `5` are new this pass: `p.rh-quiet 56>1`, `59>1`, `71>1`, `66>1`, `56>1`, all `overflow-x=hidden clipped=true`, `(no visible child past the edge -- padding/clip artefact)`. Pass 1's three `.sched-rule i` `2px` overhangs are gone. **`0`** elements paint past the frame edge, so SC10 holds. Same census at 1440 = `62` (pass 1: `64`), at 1280 = `57` (pass 1: `59`). `document 1560/1560`. See R-01, R-07. `review-shots/12-390.png` |
| 13 | Composite contrast >= 4.5:1 per lens state | **PASS** | Rendered colours, background composited up the ancestor chain, every visible text run inside `#frame-1440`. rest (scroll 0): `132` runs, min `5.32`, `0` below floor. condensed (scroll 400): `120` runs, min `5.32`, `0`. region in focus (FF&E `full`): `116` runs, min `5.32`, `0`. reading (scroll 1200): `119` runs, min `5.32`, `0`. The minimum in every state is `span.da-label "← PUT DOWN"`. The three `--density-ink-*` steps carry their computed ratios in `tokens.css`: `--density-ink-full: #4E4339; /* 9.22:1 on --doc-paper #FCFAF6 */`, `--density-ink-reading: #5A4E43; /* 7.73:1 ... */`, `--density-ink-condensed: #65594E; /* 6.51:1 ... */`. |
| 14 | The navigator lands where it says | **PASS** | All six rail targets clicked in turn, sampled after the 700ms jump lock: `approvals headTop=64`, `schedule 73`, `ffe 73`, `money 73`, `care 73`, `record 73` — every head under the band (`bandBottom=57`, `underBand=true`), and `data-reading-index` on both `#rail-1440` and `#frame-1440` equals the clicked region in all six cases. `review-shots/14-navigator-last.png` |
| 15 | 1280 shows the margin as a sheet | **PASS** | No margin column at 1280 (`marginColumnPresent=false`); opener `button.margin-tab` reading `MARGIN · 7 · 1 OVERDUE`. Opened: `data-open=true`, `aria-hidden=false`, `role=dialog`, `aria-modal=true`, `aria-label="The margin"`, `360x700`, `7` chips, shadow exactly `rgba(44, 41, 38, 0.08) 0px 1px 2px 0px`, focus landed on `button.act.is-lead "CAPTURE A NOTE"` (the sheet's first act, not DOM-first). `Escape`: `data-open=false`, `aria-hidden=true`, panel not visible, focus returned to `button.margin-tab`. `review-shots/15-1280-margin-sheet.png` |
| 16 | SC1-SC4, SC11-SC12 printed at 0 / 400 / 1200 | **PASS** (as an item — one SC number inside it still misses) | Printed in full below. |
| 17 | Fonts loaded, no fallback rendering | **PASS** | `document.fonts.check("400 16px ...")`: Playfair Display `true`, Inter `true`, DM Mono `true`; Playfair italic `true`. Faces: `Playfair Display normal 400 900 -> loaded`, `Playfair Display italic 400 900 -> loaded`, `Inter normal 100 900 -> loaded`, `DM Mono normal 400 -> loaded`, `DM Mono normal 500 -> loaded`, `DM Mono normal 300 -> unloaded` (R-12). Real-vs-fallback widths differ on all three: playfair `1009.42` vs `1021.38`, inter `1083.13` vs `1019.94`, dmmono `1228.81` vs `1229`. Painted: letterhead 40px = `Playfair Display`, region head 24px = `Playfair Display`, band mono = `DM Mono`. |
| 18 | Full tab-through with accessible names | **PASS** | `118` tab stops across the whole page, in DOM order; `0` unnamed `[]`; `0` positive `tabindex` `[]`. Full list: `review-shots/tab-order.txt`. First stops: `"Rest"`, `"Condensed"`, `"Region in focus"`, `"1280"`, `"390"`, `"Reduced motion"`, `"Slow motion 4x"`, `div#frame-1440.frame "The document at 1440 by 900"`, `"← PUT DOWN"`, `"Vandersteen PROCUREMENT & ORDERS 4 OF 6"`, `"Client approvals — 2 AWAITING and 1 OVERDUE 6D"` ... Last stop `117. button.mb-item "SECTIONS Money"` — see R-17. |

---

## Item 16 in full — the SC numbers

Measured at 1440, `#frame-1440`, `transform: none`, `clientHeight = 898px`.

| Offset | `data-lens-state` | `data-lens-open` | `--lens-height` | band box | header stack bottom | first region head y | rail ink | density map | reading index (frame / rail) |
|---|---|---|---|---|---|---|---|---|---|
| **0** | `rest` | `true` | `319px` | `56px` | `282px` | **`320px`** | `343/840 = 40.8%` (18 runs); span `775/840 = 92.2%` | `approvals:full schedule:reading ffe:reading money:condensed care:condensed record:condensed` | `approvals` / `approvals` |
| **400** | `condensed` | `false` | `56px` | `56px` | **`57px`** | `-80px` | `374/840 = 44.6%` (18 runs); span `92.2%` | `approvals:full schedule:reading ffe:reading money:condensed care:condensed record:condensed` | `approvals` / `approvals` |
| **1200** | `condensed` | `false` | `56px` | `56px` | `57px` | `-880px` | `374/840 = 44.6%` (18 runs); span `92.2%` | `approvals:reading schedule:reading ffe:full money:condensed care:condensed record:condensed` | `ffe` / `ffe` |

- **SC1** — first region head y at rest = **`320px`**. Threshold `<= 405px`. **PASS**, by 85px. Unchanged from pass 1. (Today, per `research/12-layout-measurements.md`: 700-790px.)
- **SC2** — condensed header band, bottom edge in frame coordinates at scroll 400 = **`57px`**. Threshold `<= 108px`. **PASS**, by 51px. Unchanged.
- **SC3** — `--lens-height` at 0 / 400 / 1200 = **`319px` / `56px` / `56px`**. Condensed `56px <= 64px`, identical at 400 and 1200, no drift. **PASS**. Unchanged. `--lens-h-open: 319px` and `--lens-h-closed: 56px` in `tokens.css` match what the DOM publishes.
- **SC4** — rail utilisation at scroll 0 = **`40.8%`** merged-ink (`343px` in 18 runs over an `840px` rail; pass 1: `35.0%`, 294px, 15 runs) and **`92.2%`** first-to-last-ink span (pass 1: `91.4%`). Threshold `>= 70%`. **The strict reading still misses by 29.2 points.** RF-05's ruling was to do both — let the ladder take the height *and* report both readings. `.ladder` is now `flex: 1 1 auto` (it was a declared `height:443px`), and `FINAL.md` §SC4 does report both. The number moved 5.8 points and stopped. See R-02.
- **SC11** — exactly one region at `full` at all three offsets: **`true`**. The second clause ("no region with zero readable text") I tested separately, because the instrument only asserts the first: at scroll 0 every condensed region shows exactly `3` visible text runs on bare paper — `money`: `"Money" / "$17,500 out · $12,300 not drawn" / "DRAW AN INVOICE"`; `care`: `"Closing the book" / "0 of 6 closed out" / "START THE CLOSE"`; `record`: `"The record" / "12 complete" / "OPEN THE RECORD"`. **Clause holds.** Note that the `.rh-quiet` programmatic line is *not* what carries it — it is a 1x1px `overflow:hidden` box (R-07).
- **SC12** — `data-reading-index` on `#rail-1440` equals the `full` region at all three offsets and is never null: **`true`**. Mirrored on `#frame-1440`. At 390 there is still no `#rail-390`; the value is now published on `.mobile-bar` as well as the frame root, and it tracks (`@0 approvals`, `@1800 ffe`). See R-10.

Attribute inventory, all three frames, one sample:

```
frame-1440: state=condensed frame data-reading-index=ffe | rail=aside#rail-1440.spine data-reading-index=ffe | lens=div#lens-1440.lens-band.lens-line open=false --lens-height=56px  | regions=6 full=[ffe]        scroll=5279/898 overflow-y=auto transform=none
frame-1280: state=rest      frame data-reading-index=approvals | rail=aside#rail-1280.spine data-reading-index=approvals | lens=div#lens-1280.lens-band.lens-line open=true  --lens-height=319px | regions=6 full=[approvals] scroll=2403/798 overflow-y=auto transform=none
frame-390:  state=mobile    frame data-reading-index=approvals | rail=(NO #rail-390) data-reading-index=null | lens=div#lens-390.lens-band.lens-line open=true --lens-height=364px | regions=6 full=[approvals] scroll=3276/842 overflow-y=auto transform=none
```

---

## The builder's list, re-tested on its merits

Every id the builder reported is re-tested here, including — especially — the one it dropped.

| Claim | Builder said | MR2 verdict | Evidence |
|---|---|---|---|
| R-01 (SC4 35%) | fixed | **PARTLY.** `.ladder` is now `flex: 1 1 auto`; SC4 moved `35.0% -> 40.8%`. Still `29.2` points under the `>= 70%` threshold, and `FINAL.md` says so plainly. Re-raised as **R-02** below. | `probe-log.txt` item 16 |
| R-02 (`.da-pool` bleeds 5px) | accepted and narrowed | **STILL FAILS item 12**, narrowed: `31 -> 26` descendants, `25 -> 21` with a hanging child. `0` paint past the frame edge, so SC10 holds. Re-raised as **R-01**. | item 12 |
| R-03 (no `#rail-390`) | fixed | **FIXED IN SUBSTANCE.** `.mobile-bar` now carries `data-reading-index`, live: `@0 approvals`, `@1800 ffe`, matching the frame root and the `full` region. `#rail-390` still does not exist, so the instrument's C.5 inventory still prints `rail=(NO #rail-390) data-reading-index=null`. **R-10**. | `claims-log.txt` |
| R-04 (host-sim probed the Life Review) | fixed | **FIXED.** `host-sim-out.txt` now asserts `stageExists`, `frameCount: 3`, `regionCount: 6`, `exactlyOneFull: true`, `firstRegionHeadYInFrame: 320`, `ffeRows: 36`, `catalogCrops: 5`, `staticPaintOK: true`. No `#screen-desk` / `#frame` left. | `host-sim-out.txt` |
| R-05 (Rest clears the motion register) | **DROPPED** | **CONFIRMED PRESENT, and the drop is defensible.** Measured: press `Reduced motion` -> `data-motion=reduced`; press `Rest` -> `normal`. Press `Slow motion 4x` -> `slow`; press `Condensed` -> `slow` (survives); press `Rest` -> `normal`. The drop reason holds: item 6's rest reference contract includes `"motion":"normal"`, so honouring R-05 would make item 6 fail. Re-raised at **low** as **R-08**, because the consequence is real even if the fix is wrong. | `claims-log.txt` |
| R-06 (motion buttons steal `lastGo`) | fixed | **FIXED.** `Reduced motion` at rest now reports `aria-pressed[rest=true,condensed=false,ffe=false,w1280=false,w390=false,reduced=true,slow=false]`. | item 6 |
| R-07 (bracket shrinks over a read) | fixed | **FIXED.** Bracket `67px` after Rest and `67px` after a full 30-step 0-to-foot read and return. The paper still grows `5279 -> 6004` (`+725px`, `+13.7%`); CLS stays `0`. **R-16** records the growth, not the bracket. | `claims-log.txt` |
| R-08 (3 site classes, 29 elements) | accepted and narrowed | **CONFIRMED.** `29` elements, `3` classes, `0` off-token, `0` drop-shadow; `FINAL.md` §6 carries both numbers. **R-13** repeats it only so the deck does not say "three" as an element count. | item 4 |
| R-09 (DM Mono 300 unused) | accepted and narrowed | **CONFIRMED.** `DM Mono normal 300 -> unloaded`; `FINAL.md` §6 accounts for `203,852` font bytes and names the unused face. **R-12**. | item 17 |
| R-10 (top rail segment prints nothing) | fixed | **FIXED.** `0` fully blank segments at scroll 0. The yielded segment prints `CLIENT APPROVALS` in `--text-muted` (`#4E4339`, `rgb(78, 67, 57)`), mono 11px, `opacity: 1` only under `[data-region-head-in-frame="true"]`. `review-shots/c-rail-s0.png`, `c-1440-rest.png`. | `claims2-log.txt` |
| R-11 (no dev-bar route to `editing`) | accepted and narrowed | **CONFIRMED.** `7` buttons: `rest, condensed, ffe, w1280, w390, reduced, slow`. `editing` reachable only by focusing `input#spec-mudroom-3-1440.spec-input`. **R-11** below. | `claims-log.txt` |
| RF-01 (placeholder crops) | fixed | **PARTLY.** `5` real `48x48` catalog crops now render per frame, `5` distinct JPEGs, `15` across the three frames, `0` external requests. But `31` of `36` thumbs per frame still render the grey diagonal (`.thumb.is-unlinked`), including the entire Living-room screenful — the exact state `lens-s2-1440` cuts. **R-03**, **R-04**, **R-05**, **R-15**. | `c-1440-ffe.png`, `c-crops.png` |
| RF-02 (yielded segment prints nothing) | fixed | **FIXED.** Segment names print. Rail head at s0: `<span class="rail-name" data-letterhead-in-frame="true">Vandersteen</span>` prints, the stage phrase `PROCUREMENT & ORDERS` and `4 OF 6` yield — exactly the ruling. | `c-1440-rest.png` |
| RF-03 (`BESIDE <stop>` grouping) | fixed | **MOSTLY FIXED.** The margin now prints `p.margin-head "BESIDE PIECES 3"` and `p.margin-head "THE WHOLE JOB 4"` over `3` and `4` chips; no `NOTHING ... YET` line renders at any offset, and nothing wraps or collides. The one clause I could not confirm is "the current stop's group first" — **R-06**. | `c-margin-s0.png`, `claims2-log.txt` |
| RF-04 (mobile bar names the wrong stop) | fixed | **FIXED.** At 390 scroll 0 the bar's visible leaves are `span.mb-eyebrow "IN THIS DOCUMENT"`, `span.mb-value "The Vandersteen residence"`, `span.mb-eyebrow "SECTIONS"`, `span "Client approvals"`, `span.mb-eyebrow "MARGIN"`, `span.mb-value "7 · 1 overdue"` — the slot names the `full` stop, and it reads `data-reading-index`. | `claims2-log.txt`, `c-390-s0.png` |
| RF-05 (SC4: both readings) | fixed | **PARTLY.** Both readings are reported in `FINAL.md`; the ladder does take the height; the number still misses. **R-02**. | item 16 |

---

## Findings — this pass, R-01 upward

Every finding, unfiltered, including low. No severity floor. The orchestrator filters; I do not.

### R-01 — `.act .da-pool` still bleeds 5px, so 26 descendants overflow at 390 and item 12 still FAILs
**Severity: medium · Confidence: 0.95 · Violates: C.8 item 12 (literal)**
Observed: `26` descendants of `#frame-390` report `scrollWidth > clientWidth`; `21` have a visible
child hanging past their own edge, in every case `span.da-pool` overhanging `5px` — `div.paper-measure 337>332`,
`div#sentinel-390.lens-sentinel 337>332`, `div.letterhead 337>332`, `p.vitals 337>332`,
`span.vital-act 55>50`, `button.act.is-quiet 55>50`, `button.act.is-lead 125>120`,
`span.colophon-acts 262>257`. `#frame-390` itself is `388/388`; **`0`** elements paint past the frame
edge, so SC10 ("nothing escapes its frame") holds cleanly at all three widths (`1440: 62/0`,
`1280: 57/0`, `390: 26/0`). The builder narrowed it (`31 -> 26`, `25 -> 21`) without removing it,
which is the one item that keeps the gate red.
Change: one line — either `.act { overflow-x: clip; }` (which also clips the `-4px`/`-7.5px` label
rules and changes the wash's look), or amend C.8 item 12 to assert what SC10 already says: nothing
paints past the **frame** edge. `review-shots/12-390.png`.

### R-02 — SC4 rail utilisation is 40.8%, still 29.2 points under the 70% threshold
**Severity: high · Confidence: 0.95 · Violates: SC4 (printed by C.8 item 16)**
Observed: at scroll 0 the rail's visible text runs merge to `343px` of an `840px` rail = **`40.8%`**
in `18` runs (pass 1: `294px`, `35.0%`, `15` runs). At 400/1200: `374/840 = 44.6%`. First-to-last-ink
span `775/840 = 92.2%`. `.ladder` is now `flex: 1 1 auto; min-height: 0` and the segments print
their names, which bought `5.8` points; the segments are still `display: block` stacked from the top
of the flex column rather than distributed across it, so the growth went to trailing whitespace, not
to ink. `FINAL.md` §7 states plainly that the merged-ink reading "does not meet the 70% threshold and
will not". That is an honest amendment, and RF-05 said not to fabricate ink to meet a number — but
the deck and the proposal still carry SC4 as `>= 70%`, so the criterion and the artefact disagree
in writing.
Change: restate SC4 in `source/brief.md` §A.3 and `source/proposal.md` as the first-to-last-ink span
with the `92.2%` number, and record the merged-ink `40.8%` beside it — or distribute the segments
(`justify-content: space-between` on `.ladder`) and re-measure. `review-shots/16-sc-0.png`.

### R-03 — 31 of 36 FF&E thumbs per frame are still the grey diagonal, including the whole Living-room screenful
**Severity: high · Confidence: 0.9 · Violates: RF-01's ruling; relates to NG4 (48px crops on catalog-linked lines)**
Observed: `.thumb` census across the document = `108` thumbs, `36` per frame, of which `5` per frame
(`15` total, `5` distinct JPEGs) render a real `48x48` crop; the other `31` per frame carry
`class="thumb is-unlinked"` and render the grey box with a diagonal. All five real crops sit in the
**Dining room** block (`Heirloom oak dining table`, `Side chairs, set of six`, `Pendant, hand-blown glass`,
`Dining rug, flatweave`) and the Living room's `Ceramic vessel, large`. The Living-room screenful —
`Brass-and-oak console`, `Sectional sofa, 112 in`, `Reading chair`, `Live-edge coffee table`,
`Wool area rug, 10 x 14`, `Floor lamp, pair`, `Table lamp, walnut base`, `Linen drapery, four panels`,
`Drapery hardware, brass` — is nine consecutive grey diagonals, and that is the exact frame the deck's
`lens-s2-1440` fragment cuts (`Region in focus`). RF-01's observed symptom, "every FF&E line shows a
grey box with a diagonal", is unchanged in the state the deck will show. RF-01 also said "keep the
placeholder glyph only for lines the specimen marks unspecified"; the specimen marks `2` lines
unspecified (Mudroom) and `31` carry the glyph.
Change: reuse the five crops on the Living room's five most catalog-plausible lines so the
region-in-focus frame reads as a catalog, or drop `.is-unlinked` to a neutral rule instead of a
"no image" glyph so absent art does not read as broken art. `review-shots/c-1440-ffe.png`.

### R-04 — the same dining-room photograph renders on two lines three rows apart
**Severity: medium · Confidence: 0.85 · Relates to: RF-01 ("map by best fit")**
Observed: `crop-heirloom-thumb` is on `Heirloom oak dining table` and `crop-heirloom-oak-dining-table`
is on `Dining rug, flatweave` — the two source files (`mock/img/heirloom-thumb.jpg`,
`mock/img/heirloom-oak-dining-table.jpg`) are the same interior scene at two crops, so the same
picture appears twice inside one eight-line room block, at `48x48`, three rows apart. In
`review-shots/c-crops.png` the two thumbs are visually indistinguishable.
Change: put one of the two on a line in another room (the Living room's `Wool area rug, 10 x 14` takes
the rug crop naturally), or keep only one and leave the other line unlinked.

### R-05 — the crop content is off-register for the Vandersteen specimen
**Severity: low · Confidence: 0.6 · Relates to: NG4 / the specimen's register**
Observed: `mock/img/heirloom-oak-dining-table.jpg` (and its `heirloom-thumb.jpg` crop) is a modern
green-velvet dining scene with brass legs and a monstera; the specimen is Midwest oak, wool and
brass — `Sturdy Oak Woodworks, Dodgeville WI`, `Oconomowoc Rug Merchants`, `HARTLAND WOOL RUG 9 X 12`.
At `48x48` the mismatch is small, but the deck may enlarge one.
Change: none required by the SPEC; if the deck crops one up, pick `live-edge-coffee-table.jpg`
(a plain wooden chair) or `pendant-lamp.jpg`, which do sit in the register.

### R-06 — the margin's group order is fixed, not current-stop-first
**Severity: low · Confidence: 0.6 · Relates to: RF-03 ("the current stop's group first")**
Observed: at `data-reading-index=approvals`, `ffe` and `money` alike, the group heads print in the
same order: `["p.margin-head :: \"BESIDE PIECES 3\"", "p.margin-head :: \"THE WHOLE JOB 4\""]`. At
`ffe` that is correct by accident. There is no stop in this specimen whose group is second — the two
anchors are `BESIDE PIECES` (the `ffe` stop) and `THE WHOLE JOB` (not a stop) — so the reordering
clause is **not demonstrable in this data**, which is why the confidence is 0.6 rather than 0.9. The
rest of RF-03 is clean: no `NOTHING ... YET` line renders at any offset, and nothing wraps or collides.
Change: either add a third anchor in the specimen's register (a `BESIDE MONEY` note) so the clause can
be seen and tested, or drop the "current stop's group first" clause from the ruling and say the
margin's order is the paper's order.

### R-07 — `.rh-quiet` is a 1x1px clipped box and adds 5 new entries to item 12's census
**Severity: low · Confidence: 0.95 · Violates: C.8 item 12 · NEW THIS PASS**
Observed: in every `data-density="condensed"` region, `p.rh-quiet` computes to `width 1px`,
`height 1px`, `overflow-x: hidden`, `display: block`, with `scrollWidth` `56`/`59`/`66`/`71` — the
visually-hidden pattern. Five such entries now appear in the 390 overflow census
(`p.rh-quiet 56>1 (+55)`, `59>1`, `71>1`, `66>1`, `56>1`) that were not in pass 1's `31`. They are
flagged `clipped=true`, `(no visible child past the edge -- padding/clip artefact)`, so nothing is
visible — but they are real `scrollWidth > clientWidth` rows against item 12's literal wording, and
they replaced the three `.sched-rule i` `2px` rows that the fix pass removed. Its text —
`"NOT YET ON THE PAPER · PRESS MONEY ON THE INDEX TO OPEN"` — is programmatic only and is **not**
what satisfies SC11's "no region with zero readable text"; the head, count line and leader act do.
Change: give `.rh-quiet` the standard clip-path visually-hidden recipe
(`clip-path: inset(50%); white-space: nowrap; width: 1px`) so it stops reporting an overflow, or fold
it into item 12's exemption alongside the `da-pool` decision.

### R-08 — pressing Rest still clears `data-motion="reduced"` and `"slow"`
**Severity: low · Confidence: 1.0 · Relates to: C.6 · re-test of pass-1 R-05, which the builder dropped**
Observed, measured this pass: `Reduced motion -> data-motion="reduced"`; `Rest -> "normal"`.
`Slow motion 4x -> "slow"`; `Condensed -> "slow"` (survives); `Rest -> "normal"`. The builder's drop
reason holds — item 6's rest reference contract includes `"motion":"normal"`, so a Rest that left the
motion register alone would fail C.8 item 6 as written, and C.6 says Rest returns "with nothing left
over". The consequence R-05 named is nevertheless real: **the reduced register cannot be shown at the
rest state from the dev bar**. It does not block the deck — C.9's `reduced-1440` fragment is
"the reduced-motion register at the **condensed** state", and reduced survives Condensed.
Change: none. If a future pass wants a reduced *rest* frame, split the rest contract's `motion` key
out of item 6's reference rather than changing `goRest()`.

### R-09 — the instrument's own host-sim error regexes print `?` instead of the arrays
**Severity: low · Confidence: 1.0 · Instrument defect, not a mockup defect**
Observed: item 3 prints `host-sim mockReady=true {"pageErrors":"?","consoleErrors":"?"}`. The cause is
in `review-clickthrough.mjs`: `hostOut.match(/pageErrors:\s*(\[[\s\S]*?\n\])/)` requires a
**multi-line** array, and `host-sim.mjs` prints `pageErrors: []` and `consoleErrors: []` on one line
each, so both captures miss. The values themselves are clean — I read them straight out of
`review-shots/host-sim-out.txt`: `consoleErrors: []`, `pageErrors: []`, `externalRequests: []`. The
item's assertion is on `hostReady === true` only, so the verdict is unaffected. I did **not** repair
this: the brief allows repairing only a selector or hook that moved under the script, and this one
never worked — it prints `?` in pass 1's log too. Fixing it would change what the item reports
between passes.
Change: for a third pass, relax to `/pageErrors:\s*(\[[\s\S]*?\])/`.

### R-10 — `#rail-390` still does not exist, so C.5's "rail root" has no address at 390
**Severity: low · Confidence: 0.9 · Relates to: C.5 (`data-reading-index` "on the rail root")**
Observed: the C.5 inventory still prints `frame-390: rail=(NO #rail-390) data-reading-index=null`.
In substance the fix landed — `.mobile-bar` carries a live `data-reading-index` (`@0 approvals`,
`@1800 ffe`), matching `#frame-390` and the `full` region — so SC12 is satisfiable at every width.
What did not change is C.5's own wording, which still names an element that has no 390 counterpart,
and any consumer that reads `#rail-<key>` gets `null` there.
Change: one line in SPEC C.5 — "at 390 the rail root is `.mobile-bar`" — so the contract has one
address at every width.

### R-11 — `data-lens-state="editing"` still has no route from the dev bar
**Severity: low · Confidence: 0.9 · Relates to: C.5 (five state values) / C.6 (seven buttons)**
Observed: `7` buttons: `rest "Rest"`, `condensed "Condensed"`, `ffe "Region in focus"`, `w1280 "1280"`,
`w390 "390"`, `reduced "Reduced motion"`, `slow "Slow motion 4x"`. `editing` is reachable only by
focusing `input#spec-mudroom-3-1440.spec-input`, which `FINAL.md` now names. The state machine works;
the deck has no dev-bar route to a pen-down frame.
Change: none needed for correctness; if the deck wants the pen-down frame, have `shoot-final.mjs`
focus that id by name.

### R-12 — the DM Mono 300 face is still inlined and never rasterised
**Severity: low · Confidence: 0.9 · Relates to: C.1**
Observed: `document.fonts` reports `DM Mono normal 300 -> unloaded`; nothing requests weight 300.
C.1 says to copy `mock/assets/fonts/fonts-data-uri.css` verbatim and not to add a face, so this is
compliant, and `FINAL.md` §6 now accounts for it inside `203,852` font bytes of a `602,135`-byte file.
Change: none. Recorded so the byte count is explained rather than discovered.

### R-13 — the shadow census is 3 site classes and 29 elements; the shooter reported a one-frame count
**Severity: low · Confidence: 1.0 · Relates to: NG2 / C.4 / C.8 item 4**
Observed: `button.margin-chip.doc-elevated x21`, `div.lens-sheet-panel.doc-elevated x6`,
`div.drawer.doc-elevated x2` = `29` elements over `3079`, all exactly
`rgba(44, 41, 38, 0.08) 0px 1px 2px 0px`; off-token `0`, drop-shadow `0`. The shooter's report
(`x7 / x2 / x1`) counts one frame, and the mockup carries the paper three times. NG2's "three sites"
reads as three kinds of surface and the mockup honours that.
Change: the deck's shadow claim quotes both numbers — 3 site classes, 29 elements across three frames
— never "three" as an element count. `FINAL.md` §6 already does.

### R-14 — none of C.9's twelve deck fragments exist, so `mock/deck-parts/build.mjs` cannot build
**Severity: medium · Confidence: 1.0 · Violates: C.9 (outside C.8, reported because it blocks the deck)**
Observed: `mock/fragments/` contains one file, `_smoke.html` (`754` bytes, `2026-08-28 22:01`) — older
than `mock/final/index.html` (`2026-08-29 02:53`). None of `lens-s0-1440`, `lens-s1-1440`,
`lens-s2-1440`, `today-s0-1440`, `today-s1-1440`, `spine-before-360`, `spine-after-360`,
`header-before-720`, `header-after-720`, `motion-grammar-1080`, `lens-390`, `reduced-1440` is on disk.
C.9's staleness check will fail the deck build on the one file that is there.
Change: run `shoot-final.mjs` after the fix pass settles, and only then build the deck. Note that R-03
means `lens-s2-1440` would currently cut nine grey diagonals.

### R-15 — SPEC C.1 says "one product crop"; five are inlined
**Severity: low · Confidence: 1.0 · Amends: C.1 (authorised by RF-01) — recorded, not priced**
Observed: `5` `data:image/jpeg` URIs in `index.html`; file size `452976 -> 602135` bytes
(`+149,159`, still far under the 2 MB target and the 16 MB cap). SPEC C.1 reads "**One product crop**,
inlined as a data URI from `mock/img/` ... Every other image is drawn in CSS or is not there." The
orchestrator's RF-01 ruled for five. Per canon latitude this is an amendment to be labelled, not
penalised.
Change: amend C.1's wording to "up to five product crops" so the SPEC and the artefact agree, and
name RF-01 as the amending ruling.

### R-16 — the paper still grows 725px under the reader over one read
**Severity: low · Confidence: 0.9 · Relates to: C.8 item 8**
Observed: `#frame-1440` `scrollHeight` is `5279` immediately after Rest and `6004` after one 30-step
0-to-foot read and return (`+725px`, `+13.7%`); the item-8 sweep prints `extent=4381px` at the start
and `extent=5106px` in its summary. CLS is `0` in both registers because every commit happens well
below the frame's bottom edge, exactly as designed. The reading bracket is no longer affected —
`67px` before and `67px` after (pass-1 R-07 fixed) — but the scroll extent under the reader's thumb
still changes by an eighth over a single read.
Change: none required; `FINAL.md` should say the extent settles after one read, so a reader who
notices the scrollbar shrink is not seeing a bug.

### R-17 — the tab-order artefact is not reproducible: stop 117 differs between runs
**Severity: low · Confidence: 0.9 · Relates to: C.8 item 18**
Observed: `review-shots/tab-order.txt` differs from the builder's run in exactly one line —
`117. button.mb-item "SECTIONS Client approvals"` there, `117. button.mb-item "SECTIONS Money"` here.
The cause is legitimate behaviour: the tab sweep scrolls `#frame-390` as it goes, and the mobile
bar's slot follows `data-reading-index` (which is RF-04 working). The consequence is that the tab
sweep's own artefact is scroll-order dependent, so a future diff of `tab-order.txt` will show a
change that is not a change. Item 18 asserts `0` unnamed, which is stable.
Change: have item 18 reset each frame's `scrollTop` to 0 before the sweep, or record the name with
the index elided.

---

## Regressions

**No item that passed in `REVIEW.md` fails now.** Pass 1: `17 PASS / 1 FAIL`. Pass 2:
`17 PASS / 1 FAIL`. The failing item is the same one, item 12, and it is narrower than it was.

Two things moved inside passing items and are recorded so they are not discovered later:

1. **Item 12's census composition changed.** Pass 1: `31` overflowing descendants — `24` caused by
   `span.da-pool` at `5px` and `3` by `.sched-rule i` at `2px`. Pass 2: `26` — `21` by `span.da-pool`
   at `5px`, `0` by `.sched-rule i` (removed), and **`5` new `p.rh-quiet 56..71 > 1` rows that did not
   exist in pass 1**. The net is an improvement and the item's verdict is unchanged, but a new class
   of offender entered the census during a fix pass. **R-07.**
2. **Item 3's printed evidence degraded to `?`.** Pass 1's `REVIEW.md` quotes
   `consoleErrors: []`, `pageErrors: []`, `externalRequests: []` for host-sim; pass 2's item-3 line
   prints `{"pageErrors":"?","consoleErrors":"?"}`. This is **not** a mockup regression — the
   underlying `host-sim-out.txt` still reports `consoleErrors: []` and `pageErrors: []`, and I read
   them there. It is the instrument's regex meeting a single-line array, and it prints `?` in pass 1's
   log too; pass 1's reviewer quoted the file rather than the line. **R-09.**

Four counts drifted without changing a verdict, all in the improving direction or explained:
`box-shadow` scan `3091 -> 3079` elements (`29` shadowed, unchanged); contrast census
`129 -> 132` runs at rest (min `5.32` unchanged); rail merged-ink `294px/15 runs -> 343px/18 runs`;
navigator `approvals headTop 65 -> 64`. Item 7's boundaries, item 9's threshold, item 11's `54` stops,
item 14's six landings, item 15's sheet contract, items 1/2/5/8/10/17/18 are all identical to pass 1.

---

## What in C.8 I could not test, and why

Nothing in C.8 was skipped: all eighteen items ran and all eighteen are reported above with an
observed value. Six limits on the evidence, stated so they are not mistaken for coverage.

1. **Pass-1 evidence files no longer exist.** The builder re-ran the prober's instrument after
   fixing, overwriting `review-shots/` and `review-results.json` in place, so every regression
   comparison above is against the prose in `REVIEW.md` rather than against a pass-1 artefact. Where
   `REVIEW.md` gave a number I could compare; where it summarised, I could not.
2. **Item 11, DOM-order assertion.** Order is checked against a `data-tabprobe` index stamped on the
   frame's focusables *before* the sweep. Tabbing scrolls the frame, so a region can commit mid-sweep
   and a newly-mounted focusable carries no index and is skipped by the comparison. All `54` stops at
   each of the three offsets were indexed in this run, so nothing was skipped in fact — but the
   assertion would not catch a newly mounted element inserted out of order.
3. **Item 9, "the same element".** The item's literal wording cannot be satisfied by any scroll large
   enough to be interesting. It is made decidable by bisecting the exact `scrollTop` at which the
   density map changes (`562`) and crossing it with a `6px` scroll. A threshold crossed by a larger
   fling is not covered.
4. **Item 13, "every lens state".** The census covers `#frame-1440` in four states and every visible
   text run in each. It does not census `#frame-1280` or `#frame-390`, and it samples after
   `__lensSettled()` plus 400ms, so transient mid-transition colours are not covered.
5. **Item 4, "the whole mockup".** A computed-style sweep of all `3079` elements present in the DOM,
   including closed sheets. It cannot see a shadow that only exists on a state class no code path in
   this run applied; every dev-bar state and every sheet was entered, but a state reachable only by an
   untaken route would be missed.
6. **RF-03's reordering clause is not testable in this specimen.** Only two margin anchors exist
   (`BESIDE PIECES`, `THE WHOLE JOB`) and only one of them is a stop, so "the current stop's group
   first" can never be observed doing anything. R-06 carries confidence 0.6 for that reason, not
   because the measurement is soft.

One verdict rests on a reading, and I flag it rather than hide it, as pass 1 did: **item 12** is FAIL
on the SPEC's literal words ("`scrollWidth <= clientWidth` on `#frame-390` and on every descendant").
On SC10's words ("nothing escapes its frame") it passes cleanly — `0` elements paint past the frame
edge at `1440`, `1280` or `390`. R-01 gives both routes; the fix pass narrowed the census without
choosing one.

---

## Two checks outside the eighteen, recorded because C.10 makes them signable

- **SC5 / C.10 "No hover-only affordance anywhere (an automatic return in the rubric)":** a sweep of
  every CSS rule in the document for a `:hover` selector that sets `display`, `visibility`, `opacity`
  or `content` without a `:focus` twin returns **`0`**.
- **C.10 "Static markup + CSS paint the rest state with JS disabled":** loaded with
  `javaScriptEnabled: false`, `#frame-1440` exists, `6` regions are present with their `data-density`
  attributes published (`approvals=full schedule=condensed ffe=condensed money=condensed care=condensed record=condensed`),
  `data-lens-state="rest"`, `data-lens-open="true"`, first region head y = `320px`,
  `typeof window.__mockReady === "undefined"`. `review-shots/c-nojs.png`.
- **C.4 tokens:** `tokens.css`'s `:root` contains the Life Review's `:root` **line for line with
  nothing missing** (`0` lines dropped), plus exactly the four families C.4 names —
  `--lens-h-open: 319px`, `--lens-h-closed: 56px`, `--doc-region-gap: 24px`, and
  `--density-ink-full: #4E4339; /* 9.22:1 on --doc-paper #FCFAF6 */`,
  `--density-ink-reading: #5A4E43; /* 7.73:1 on --doc-paper #FCFAF6 */`,
  `--density-ink-condensed: #65594E; /* 6.51:1 on --doc-paper #FCFAF6 */`. No new token beyond those,
  and every new colour carries its computed ratio.

---

## Evidence

`mock/final/review-shots/` — `probe-log.txt` (the full instrument log), `review-results.json`,
`host-sim-out.txt`, `tab-order.txt`, `09-pointer.png`, `10-reduced-mq.png`, `12-390.png`,
`14-navigator-last.png`, `15-1280-margin-sheet.png`, `16-sc-0.png`, `16-sc-400.png`, `16-sc-1200.png`,
and this pass's claims evidence: `claims-log.txt`, `claims2-log.txt`, `c-rail-s0.png`,
`c-margin-s0.png`, `c-390-s0.png`, `c-390-bar.png`, `c-1280.png`, `c-1440-rest.png`,
`c-1440-ffe.png`, `c-crops.png`, `c-nojs.png`.
