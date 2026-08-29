# REVIEW — `mock/final/index.html`, against SPEC.md C.8

MR, the prober. 2026-08-29. A different seat from MB: nothing under `mock/final/` that the builder owns was edited, and no claim in `FINAL.md` or in the shooter's report was inherited — every number below was measured in this run.

**The gate.** The command this mockup must pass, from the repo:

```
cd /Users/kody/Code/patina-merged/artifacts/document-lens-proposal-2026-08-28/mock/final && node review-clickthrough.mjs
```

It must print `18 PASS / 0 FAIL of 18 items`. It currently prints **`17 PASS / 1 FAIL of 18 items`**.

Probe: `mock/final/review-clickthrough.mjs` (ported from `artifacts/document-life-directions-2026-08-28/mock/final/review-clickthrough.mjs` — same shape, same `lin`/`lum`/`ratio`/`parse`/`over` WCAG helpers, same `say()`-into-`review-shots/probe-log.txt` structure).
Full log: `mock/final/review-shots/probe-log.txt` · machine-readable: `mock/final/review-results.json` · evidence PNGs: `mock/final/review-shots/`.

Run environment: headless Chromium via `@playwright/test`, viewport 1560x1000, `deviceScaleFactor: 1`, `file://` origin. At 1560 `fit()` resolves to `transform: none` on all three frames, so every pixel below is a 1:1 pixel.

---

## The eighteen

| # | Item | Verdict | Observed |
|---|---|---|---|
| 1 | External requests = 0 | **PASS** | `0` non-`file:`/`data:`/`about:` requests over the whole load. `[]` |
| 2 | Page errors = 0 | **PASS** | `pageerror=0` · `console.error=0` · `unhandledrejection=0`. Also `0` page errors in the `reducedMotion: 'reduce'` context and `0` in `host-sim.mjs`. |
| 3 | `__mockReady` under `file://` AND `host-sim.mjs` | **PASS** | `file://`: `__mockReady=true`, `__mockError=null`. `host-sim.mjs`: `"mockReady": true`, `"errors": []`, `consoleErrors: []`, `pageErrors: []`, `externalRequests: []`. See `review-shots/host-sim-out.txt`. |
| 4 | box-shadow census / drop-shadow | **PASS** | `29` elements out of `3091` carry a non-`none` `box-shadow`, in **3** distinct site classes: `button.margin-chip.doc-elevated x21`, `div.lens-sheet-panel.doc-elevated x6`, `div.drawer.doc-elevated x2`. Every one of the 29 computes to exactly `rgba(44, 41, 38, 0.08) 0px 1px 2px 0px`. Off-token values `0`. Stray site classes `[]`. `filter: drop-shadow` (elements and `::before`/`::after`) = `0`. |
| 5 | Non-ASCII = 0 | **PASS** | `0` non-ASCII bytes (byte scan of the file, tab/LF/CR excepted — the `LC_ALL=C` equivalent). File size `452976` bytes. |
| 6 | Dev-bar states reachable and reversible | **PASS** | All six non-Rest buttons meet their C.6 contract and all six are fully reversible — every C.5 attribute on all three frames returns byte-identical to the rest reference. `Condensed` `scrollTop=400 lensOpen=false`; `Region in focus` `ffe density=full readingIndex=ffe`; `1280` `wrap top=0 inView=true`; `390` `wrap top=90 inView=true`; `Reduced motion` `data-motion=reduced --motion-scale=0`; `Slow motion 4x` `data-motion=slow --motion-scale=4`. `aria-pressed` live and single-valued at every step. The fifth C.5 state has no button: `[data-pen]` focus on `input#spec-mudroom-3-1440.spec-input` gives `data-lens-state=editing`; blur returns it to the scroll-derived state. See R-05, R-06. |
| 7 | Condensation reaches steady state at `--motion-scale: 4` | **PASS** | `--motion-scale=4` confirmed on the stage. Coarse sweep, extent `4381px`, 21 samples down + 21 up: **0** flip-backs. Every density-map boundary was then located by bisection — `[562, 976, 3067, 3505, 3943, 3993]` — and each swept 20 steps across a 48px window: all six report `stable, one change`. Region paths down: `approvals full->reading@657`, `schedule reading->full@657 full->reading@1095`, `ffe reading->full@1095 full->reading@4162`, `money condensed->reading@3067 reading->full@4162`, `care condensed->reading@3505`, `record condensed->reading@3943`. |
| 8 | CLS = 0, both registers | **PASS** | `PerformanceObserver({type:'layout-shift'})`, 30-step scripted scroll 0 -> foot on `#frame-1440`. Normal register: `CLS=0`, `0` shift entries. Reduced register (media query context): `CLS=0`, `0` shift entries. See R-07 for what the zero costs. |
| 9 | Nothing moves under the pointer | **PASS** | The first density threshold was located by bisection at `scrollTop=562`. Pointer parked on `div.sched-row` at `(349,546)`, frame scrolled `562-3 -> 562+3` across the threshold: element under the pointer after = `div.sched-row`, **same node = true**; the parked row displaced `6px`, of which the scroll itself accounts for `6px` — **excess 0px**. `review-shots/09-pointer.png` |
| 10 | Reduced-motion parity | **PASS** | Visible-text word diff, animated vs media-query reduced, over 5 dev-bar states x 3 frames: **0** words present in only one register. Animated vs dev-bar toggle: **0**. Duration census 1s after entering each state: media query `rest:0 condensed:0 ffe:0 w1280:0 w390:0` of `3059` elements; toggle `rest:0 condensed:0 ffe:0 w1280:0 w390:0` (`data-motion=reduced` verified at each sample). `document.getAnimations()` running = `0` in both. `review-shots/10-reduced-mq.png` |
| 11 | Keyboard order survives condensation | **PASS** | Real `Tab` presses from `#frame-1440`, at frame scroll 0 / 400 / 1200. `54` stops inside the frame at each offset; DOM order preserved = `true` at all three; **0** focused elements obscured by the pinned lens line (two-axis intersection with `#lens-1440`, excluding the band's own descendants); **0** stops without a focus ring — every stop reports `outline: solid 2px rgb(124, 94, 48)`. The band occupies `x=[249,1159]` and the rail's focusables sit at `x=[17,184]`, so they never intersect. |
| 12 | Nothing escapes the frame at 390 | **FAIL** | `#frame-390` itself passes: `scrollWidth/clientWidth = 388/388`. **31** descendants report `scrollWidth > clientWidth`; **25** of them have a visible child hanging past their own edge, and in 24 of those the child is `span.da-pool` overhanging by `5px` (`div.paper-measure 337>332`, `div#sentinel-390.lens-sentinel 337>332`, `div.letterhead 337>332`, `p.vitals 337>332`, `span.vital-act 55>50`, `button.act.is-quiet 55>50`, `button.act.is-lead 125>120`, ...); 3 are `i` overhanging `2px` in `div.sched-rule 334>332`. **0** elements paint past the frame edge, so SC10 ("nothing escapes its frame") holds. Same census at 1440 = `64`, at 1280 = `59` — this is register-wide, not a 390 regression. See R-02. `review-shots/12-390.png` |
| 13 | Composite contrast >= 4.5:1 per lens state | **PASS** | Rendered colours, effective background composited up the ancestor chain, every visible text run inside `#frame-1440`. rest (scroll 0): `129` runs, min `5.32`, `0` below floor. condensed (scroll 400): `120` runs, min `5.32`, `0`. region in focus (FF&E `full`): `115` runs, min `5.32`, `0`. reading (scroll 1200): `119` runs, min `5.32`, `0`. The minimum in every state is `span.da-label "← PUT DOWN"`. Density-reduced text is included in the census — `--density-ink-condensed #65594E` runs measure well above the floor. |
| 14 | The navigator lands where it says | **PASS** | All six rail targets clicked in turn, sampled after the 700ms jump lock: `approvals headTop=65`, `schedule 73`, `ffe 73`, `money 73`, `care 73`, `record 73` — every head under the band (`bandBottom=57`, `underBand=true`), and `data-reading-index` on both `#rail-1440` and `#frame-1440` equals the clicked region in all six cases. `review-shots/14-navigator-last.png` |
| 15 | 1280 shows the margin as a sheet | **PASS** | No margin column is rendered at 1280 (`marginColumnPresent=false`); the opener is `button.margin-tab` reading `MARGIN · 7 · 1 OVERDUE`. Opened: `data-open=true`, `aria-hidden=false`, `role=dialog`, `aria-modal=true`, `aria-label="The margin"`, `360x700`, `7` chips, shadow exactly `rgba(44, 41, 38, 0.08) 0px 1px 2px 0px`, focus landed on `button.act.is-lead "CAPTURE A NOTE"` (the sheet's first act, not DOM-first). `Escape`: `data-open=false`, `aria-hidden=true`, panel not visible, focus returned to `button.margin-tab`. `review-shots/15-1280-margin-sheet.png` |
| 16 | SC1-SC4, SC11-SC12 printed at 0 / 400 / 1200 | **PASS** (as an item — two SC numbers inside it miss) | Printed in full below. |
| 17 | Fonts loaded, no fallback rendering | **PASS** | `document.fonts.check("400 16px ...")`: Playfair Display `true`, Inter `true`, DM Mono `true`; Playfair italic `true`. Faces: `Playfair Display normal 400 900 -> loaded`, `Playfair Display italic 400 900 -> loaded`, `Inter normal 100 900 -> loaded`, `DM Mono normal 400 -> loaded`, `DM Mono normal 500 -> loaded`, `DM Mono normal 300 -> unloaded` (nothing asks for 300 — see R-09). Real-vs-fallback probe widths differ on all three: playfair `1009.42` vs `1021.38`, inter `1083.13` vs `1019.94`, dmmono `1228.81` vs `1229.00`. Painted: letterhead 40px = `Playfair Display`, region head 24px = `Playfair Display`, band mono = `DM Mono`. |
| 18 | Full tab-through with accessible names | **PASS** | `118` tab stops captured across the whole page, in DOM order; `0` unnamed; `0` elements with a positive `tabindex`. Full list: `review-shots/tab-order.txt`. First stops: `"Rest"`, `"Condensed"`, `"Region in focus"`, `"1280"`, `"390"`, `"Reduced motion"`, `"Slow motion 4x"`, `div#frame-1440.frame "The document at 1440 by 900"`, `"← PUT DOWN"`, `"Vandersteen PROCUREMENT & ORDERS 4 OF 6"`, `"Client approvals — 2 AWAITING and 1 OVERDUE 6D"` ... |

---

## Item 16 in full — the SC numbers

Measured at 1440, `#frame-1440`, `transform: none`, `clientHeight = 898px`.

| Offset | `data-lens-state` | `data-lens-open` | `--lens-height` | band box | header stack bottom | first region head y | rail ink | density map | reading index (frame / rail) |
|---|---|---|---|---|---|---|---|---|---|
| **0** | `rest` | `true` | `319px` | `56px` | `282px` | **`320px`** | `294/840 = 35.0%` (15 runs); span `768/840 = 91.4%` | `approvals:full schedule:reading ffe:reading money:condensed care:condensed record:condensed` | `approvals` / `approvals` |
| **400** | `condensed` | `false` | `56px` | `56px` | **`57px`** | `-80px` | `374/840 = 44.6%` (18 runs); span `91.4%` | `approvals:full schedule:reading ffe:reading money:condensed care:condensed record:condensed` | `approvals` / `approvals` |
| **1200** | `condensed` | `false` | `56px` | `56px` | `57px` | `-880px` | `374/840 = 44.6%` (18 runs); span `91.4%` | `approvals:reading schedule:reading ffe:full money:condensed care:condensed record:condensed` | `ffe` / `ffe` |

- **SC1** — first region head y at rest = **320px**. Threshold `<= 405px`. **PASS**, by 85px. (Today, per `research/12-layout-measurements.md`: 700-790px.)
- **SC2** — condensed header band, bottom edge in frame coordinates at scroll 400 = **57px**. Threshold `<= 108px`. **PASS**, by 51px.
- **SC3** — `--lens-height` at 0 / 400 / 1200 = **`319px` / `56px` / `56px`**. Condensed value `56px <= 64px` and identical at 400 and 1200, no drift. **PASS**.
- **SC4** — rail utilisation at scroll 0 = **35.0%** on the strict reading (`inkPx` = merged height of the rail's visible text runs, `294px` in 15 runs, over a `840px` rail) and **91.4%** on the generous reading (first inked pixel to last, `768/840`). Threshold `>= 70%`. **The strict reading misses by half.** See R-01.
- **SC11** — exactly one region at `full` at all three offsets: **true**. No region has zero readable text at any offset (the condensed regions keep head, count line and leader act on bare paper; `.rh-quiet` carries the programmatic line).
- **SC12** — `data-reading-index` on `#rail-1440` equals the `full` region at all three offsets and is never null: **true**. It is also mirrored on `#frame-1440`. At 390 there is no rail element — see R-03.

Attribute inventory, all three frames, one sample:

```
frame-1440: state=condensed idx=ffe | rail=aside#rail-1440.spine idx=ffe | lens=div#lens-1440.lens-band.lens-line open=false --lens-height=56px  | regions=6 full=[ffe]        scroll=5279/898 overflow-y=auto transform=none
frame-1280: state=rest      idx=approvals | rail=aside#rail-1280.spine idx=approvals | lens=div#lens-1280 open=true  --lens-height=319px | regions=6 full=[approvals] scroll=2403/798 overflow-y=auto transform=none
frame-390:  state=mobile    idx=approvals | rail=(NO #rail-390) idx=null              | lens=div#lens-390  open=true  --lens-height=364px | regions=6 full=[approvals] scroll=3276/842 overflow-y=auto transform=none
```

---

## Findings

Every finding, unfiltered, including low. The orchestrator filters; I do not.

### R-01 — SC4 rail utilisation is 35.0%, half the 70% threshold
**Severity: high · Confidence: 0.9 · Violates: SC4 (printed by C.8 item 16)**
Observed: at scroll 0 the rail's visible text runs merge to `294px` of a `840px` rail = **35.0%**, in 15 runs. At 400/1200 it improves to `374/840 = 44.6%`. First-to-last-ink span is `768/840 = 91.4%`, so the rail is used end to end — it is the *gaps between* the runs that are empty, most of them above and around the ladder (`.ladder` is laid out at a declared `height:443px` inside an `840px` rail) and between the ladder and `FILED WITH THIS JOB`. `review-shots/16-sc-0.png`.
Change: either let `.ladder` take the rail's full available height so the six segments distribute across it, or restate SC4 in `source/proposal.md` and `FINAL.md` as the first-to-last-ink span with the 91.4% number and say plainly that the merged-ink reading is 35%.

### R-02 — `.act .da-pool` bleeds 5px past its act, so 31 descendants overflow at 390 (64 at 1440)
**Severity: medium · Confidence: 0.95 · Violates: C.8 item 12 (literal)**
Observed: `.act .da-pool { position: absolute; inset: 2px -5px 5px; ... }` — the ink pool is inset `-5px` left and right, so it hangs 5px past every act. That propagates `scrollWidth > clientWidth` up every ancestor with `overflow: visible`: `div.paper-measure 337>332`, `div#sentinel-390.lens-sentinel 337>332`, `div.letterhead 337>332`, `p.vitals 337>332`, `button.act.is-lead 125>120`, and 20 more at 390; 64 at 1440 and 59 at 1280. Separately `.sched-rule i` overhangs `2px` (`div.sched-rule 334>332`). Nothing paints past the frame edge (`0` offenders; `#frame-390` is `388/388`), so SC10 is unaffected and nothing is visible to a reader.
Change: one line — either clip the bleed at the act (`.act { overflow-x: clip; }`, which also clips the `-4px`/`-7.5px` label rules and changes the wash's look), or amend C.8 item 12 to test only elements that paint past the **frame** edge, which is what SC10 already says and what the design intends.

### R-03 — no `#rail-390`, so `data-reading-index` has no rail root at 390
**Severity: medium · Confidence: 0.95 · Violates: C.5 (`data-reading-index` "on the rail root")**
Observed: the inventory reports `frame-390: rail=(NO #rail-390) data-reading-index=null`. The value is published on `#frame-390` (`approvals`) and on `#frame-1440`/`#frame-1280` as well as their rails, so SC12 is satisfiable everywhere; but the element C.5 names does not exist at the mobile width and a consumer reading `#rail-<key>` gets `null` there.
Change: put `data-reading-index` on `.mobile-bar` in `#frame-390` (or name the frame root as the 390 rail root in C.5) so the contract has one address at every width.

### R-04 — `host-sim.mjs` still interrogates the Life Review's DOM
**Severity: medium · Confidence: 1.0 · Violates: C.7 ("this is a publish gate, not a nicety")**
Observed: `host-sim-out.txt` reports `"deskExists": false`, `"frameExists": false`, `"deskIsOn": null`, `"frameRect": null`, `"frameTransform": null`, `"frameComputedBg": null` — every id it probes (`#screen-desk`, `#frame`) belongs to `artifacts/document-life-directions-2026-08-28`, not to this mockup. It does prove the things item 3 needs: `"mockReady": true`, `"errors": []`, `consoleErrors: []`, `pageErrors: []`, `externalRequests: []`, `reExecuted: 1`. But its static-paint evidence — the whole point of the pre-script screenshot — is unasserted, so the gate cannot fail on a blank rest state.
Change: repoint its selectors at `#stage` / `#frame-1440` / `#lens-1440` and assert the pre-script state (regions present, `data-density` attributes on the markup, first head y) rather than the desk's.

### R-05 — pressing **Rest** silently clears the reduced and slow motion registers
**Severity: medium · Confidence: 1.0 · Violates: C.6 (Rest's contract is "every frame scrolled to 0, lens open")**
Observed: `goRest()` opens with `lastGo = 'rest'; setMotion(baseMotion());`. `baseMotion()` returns `'reduced'` only when the media query matches, so on a normal machine pressing Rest from `data-motion="reduced"` or `"slow"` returns the stage to `"normal"`. Consequence for the deck: the reduced register cannot be shown at the rest state from the dev bar at all, and the probe has to re-assert the toggle after every state change (item 10's toggle census does exactly that). Reduced *does* survive Condensed / Region-in-focus / 1280 / 390, which makes the exception easy to miss.
Change: delete `setMotion(baseMotion());` from `goRest()` and leave the motion register to its own two buttons.

### R-06 — the motion buttons steal `lastGo`, so the bar reports no frame state
**Severity: low · Confidence: 0.95 · Violates: C.6 ("`aria-pressed` maintained on every button on every state change")**
Observed: `devbar(go)` assigns `lastGo = go;` before the `reduced`/`slow` branches. Pressing **Reduced motion** at rest yields `aria-pressed[rest=false, condensed=false, ffe=false, w1280=false, w390=false, reduced=true, slow=false]` — the frames have not moved, yet no frame-state button is pressed, so a screen-reader user is told the document is in none of the five frame states.
Change: move `lastGo = go;` inside the frame-state branches only.

### R-07 — the paper grows 725px under the reader as regions commit; the reading window shrinks with it
**Severity: low · Confidence: 0.85 · Relates to: C.8 item 8 / the "zero layout shift" claim**
Observed: `#frame-1440` scroll extent is `4381px` immediately after Rest and `5106px` after one 0-to-foot read (`scrollHeight` `5279 -> 6004`, `+13.7%`), because `.region[data-density="condensed"] > .region-body` releases its declared `112px`/`68px` reserve when the region commits. CLS is `0` in both registers because every commit happens at least 240px below the frame's bottom edge, exactly as designed. But `window_()` sizes the reading bracket as `track * (clientHeight / scrollHeight)`, so the bracket shrinks from roughly `75px` to `66px` over a single read of the same document.
Change: either compute the bracket from the fully-committed height once (`F.el.scrollHeight` after a forced `mountAhead()` sweep at init), or say in `FINAL.md` that the bracket rescales as the paper lengthens.

### R-08 — "three sites" is three site *classes*, not three elements: 29 elements carry the shadow
**Severity: low · Confidence: 1.0 · Relates to: NG2 / C.4 / C.8 item 4**
Observed: `button.margin-chip.doc-elevated x21`, `div.lens-sheet-panel.doc-elevated x6`, `div.drawer.doc-elevated x2` = 29 elements, all computing exactly `rgba(44, 41, 38, 0.08) 0px 1px 2px 0px`; `0` off-token values; `0` `drop-shadow`. Per frame that is 7 margin chips, 1-3 sheet panels and 0-1 drawers. NG2's "three sites" reads as three kinds of surface and the mockup honours that; the shooter's report of `x7` chips was a one-frame count, not a whole-file one, and the deck should not repeat "three" as an element count.
Change: state in `FINAL.md` §NG2 that the census is 3 site classes / 29 elements, and give both numbers in the deck's shadow claim.

### R-09 — the DM Mono 300 face is inlined but never used
**Severity: low · Confidence: 0.9 · Relates to: C.1 (fonts copied verbatim) / C.1 size budget**
Observed: `document.fonts` reports `DM Mono normal 300 -> unloaded`; nothing in the mockup requests weight 300, so the face is carried as base64 and never rasterised. C.1 says to copy `mock/assets/fonts/fonts-data-uri.css` verbatim and not to add a face, so this is compliant — but it is roughly a sixth of the six inlined faces, in a `452976`-byte file, for nothing.
Change: none required by the SPEC; note it in `FINAL.md`'s size accounting so the number is explained rather than discovered.

### R-10 — at rest the top rail segment prints nothing, which is what the rail-after fragment will show
**Severity: low · Confidence: 0.8 · Relates to: L-3 / SC4 / C.9 `spine-after-360`**
Observed: `review-shots/16-sc-0.png` — at scroll 0 the `approvals` segment's value is blank (`data-region-head-in-frame="true"`, L-3's designed yield: "a segment prints nothing while its own head is in frame"), so the ladder opens with an empty run and the first printed value is `INSTALL SEP 15 · 3 WEEKS`. This is behaving as specified, and it is also the single largest contributor to SC4's 35.0% at scroll 0 (44.6% once the head leaves).
Change: cut `spine-after-360` at an offset where every segment prints — or accept the blank and say in the deck that the yielded segment is the reader's own position.

### R-11 — `data-lens-state="editing"` has no route from the dev bar
**Severity: low · Confidence: 0.9 · Relates to: C.5 (five state values) / C.6**
Observed: focusing `input#spec-mudroom-3-1440.spec-input` publishes `data-lens-state=editing` correctly, and blur returns the scroll-derived state — the state machine works. But C.6 lists seven buttons and none of them reaches it, so the fifth of the five C.5 values is only reachable by knowing which of the 118 tab stops is a `[data-pen]` field, and the deck has no way to cut a fragment of it.
Change: none needed for correctness; if the deck wants the pen-down frame, either add an eighth dev-bar button or have `shoot-final.mjs` focus a `[data-pen]` field by id.

---

## What in C.8 I could not test, and why

Nothing in C.8 was skipped: all eighteen items ran and all eighteen are reported above with an observed value. Four limits on the evidence, stated so they are not mistaken for coverage:

1. **Item 11, DOM-order assertion.** Order is checked against a `data-tabprobe` index stamped on the frame's focusables *before* the sweep. Tabbing itself scrolls the frame, so regions can commit mid-sweep and any newly-mounted focusable carries no index and is skipped by the comparison. In this run all `54` stops at each of the three offsets were indexed, so nothing was skipped in fact — but the assertion would not catch a *newly mounted* element inserted out of order.
2. **Item 9, "the same element".** The item's literal wording cannot be satisfied by any scroll large enough to be interesting, since scrolling moves content under a stationary pointer by definition. I made it decidable by bisecting for the exact `scrollTop` at which the density map changes (`562`) and crossing it with a `6px` scroll: the same node stays under the pointer, and the displacement is `6px` with `0px` excess. A threshold crossed by a larger fling is not covered by this measurement.
3. **Item 13, "every lens state".** The census covers `#frame-1440` in four states (rest, condensed, region-in-focus, reading at 1200) and every visible text run in each. It does not census `#frame-1280` or `#frame-390`, and it does not sample transient colours mid-transition — it samples after `__lensSettled()` plus 400ms.
4. **Item 4, "the whole mockup".** The census is a computed-style sweep of all `3091` elements present in the DOM, including the closed sheets and their panels (hidden elements still compute a `box-shadow`). It cannot see a shadow that only exists on a state class no code path in this run applied; every dev-bar state and every sheet was entered during the run, but a state reachable only by a route the probe did not take would be missed.

One item's verdict rests on a reading, and I flag it rather than hide it: **item 12** is marked FAIL on the SPEC's literal words ("`scrollWidth <= clientWidth` on `#frame-390` and on every descendant"). On SC10's words ("nothing escapes its frame") it passes cleanly — `0` elements paint past the frame edge at any of the three widths. R-02 gives the builder both routes.

## Findings from the orchestrator's own read (Fable, 2026-08-29) — answer these with R-01…R-11

### RF-01 — Product crops are placeholder boxes, not the R126 48px crops
**Severity: high · Confidence: 0.95 · Violates: NG4 (the R126 register includes 48px product crops on catalog-linked lines)**
Observed: `shots/region-in-focus.png` — every FF&E line shows a grey box with a diagonal (a "no image" glyph). `mock/img/` holds five JPEG crops (already inlined as `--crop-*` data URIs by the deck build; inline them the same way here). Change: put the five real crops on at least five catalog-linked lines across the four rooms (brass-and-oak console, sectional, reading chair, rug, floor lamp — map by best fit); keep the placeholder glyph only for lines the specimen marks unspecified. Zero external requests still.

### RF-02 — A yielded rail segment prints nothing, so the reading bracket sits on blank rail
**Severity: high · Confidence: 0.9 · Relates to: L-3, R-10, F13 ("below the fold the paper stops naming the job")**
Observed: `shots/rest.png` — at s0 the approvals segment is blank under the bracket; the rail's first printed word is `INSTALL SEP 15`. A map that does not name the place you are standing is F13 in a new coat. Ruling: when a segment yields its VALUE (its head is in frame), it still prints its NAME — the region name in mono 11px `--text-muted` (e.g. `CLIENT APPROVALS`), never the value. The name is a position signal, not a fact, so SP-08 is not broken. Apply the same rule to the rail head at s0 (L-6): the arc stays and the name line prints the household in `--text-muted` while the letterhead is in frame; only the stage phrase yields. Update FINAL.md's mechanics rows L-3 and L-6 accordingly.

### RF-03 — The margin's "BESIDE <stop>" grouping shows the wrong stop's items
**Severity: medium · Confidence: 0.85**
Observed: `shots/rest.png`/`condensed.png` — the head reads `BESIDE · APPROVALS · 0` with `NOTHING BESIDE THIS STOP YET`, and immediately below it three cards labelled `TIME · BESIDE PIECES` are listed under that head, so the empty statement and the cards contradict each other; `YET` also wraps onto its own line and collides with the first card. Change: the margin prints one group per anchor that has items (`BESIDE PIECES · 3`, `THE WHOLE JOB · 4`), the current stop's group first; the empty-state line appears only when the current stop's group is the ONLY group and it is empty; fix the wrap (the line must fit the column at 11px mono or shorten to `NOTHING HERE YET`).

### RF-04 — The mobile bar's SECTIONS slot names the wrong stop at s0
**Severity: low · Confidence: 0.8**
Observed: `shots/390.png` — at scroll 0 the bar reads `SECTIONS · Pieces` while Client approvals is the full stop. Change: the slot prints the current full stop's name (`data-reading-index`), and it must read the same source the rail would (there is no `#rail-390`; publish `data-reading-index` on the 390 frame root instead — this also answers R-03).

### RF-05 — SC4: let the ladder take the rail's available height, and report both readings
**Severity: medium · Confidence: 0.8 · Relates to: R-01**
Ruling on R-01: do both. `.ladder` distributes its segments across the height between the rail head block and `FILED WITH THIS JOB` (extents stay data-derived, the floor stays 24px), and FINAL.md reports SC4 as merged-ink AND first-to-last-ink span, stating plainly which one meets the 70% threshold. Do not fabricate ink to meet a number — whitespace between segments is part of "peaceful".
