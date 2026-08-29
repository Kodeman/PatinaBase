# SPEC — the clickable mockup, `mock/final/index.html`

The mockup is the second Artifact of this program (favicon 🔭) and the deck's source of every fragment. It is not a picture of the proposal; it is the proposal running. Everything in `source/proposal.md` §3 (the lens mechanics table) and §5 (the state machine) must be operable in it, and everything the deck claims about the design must be readable off it.

The builder (MB) delivers exactly this. The prober (MR, a different context) verifies it against C.8 and reports every deviation.

---

## C.1 Shape

- **One file.** `mock/final/index.html`. No build step, no bundler, no `<link>` to anything, no import map. A reader can open it from disk.
- **Pure ASCII.** `LC_ALL=C grep -n '[^ -~\t]' mock/final/index.html` returns nothing. Ellipses are `...`, arrows are `->`, dashes are `-` or `--`, quotes are `'` and `"`, and every glyph the design wants that is not ASCII is written as an HTML entity or a CSS `content` escape.
- **Fonts as data URIs**, copied verbatim from `mock/assets/fonts/fonts-data-uri.css` — Playfair Display variable, Playfair italic variable, Inter variable, DM Mono 300/400/500. That file already carries the R126 register's faces; do not re-encode them and do not add a face.
- **One product crop**, inlined as a data URI from `mock/img/` (the 48px catalog thumb on a catalog-linked FF&E line — NG4 keeps 48px crops on those lines, so one has to be real). Every other image is drawn in CSS or is not there.
- **Zero external requests.** No `https://` in any `src`, `href`, `url()`, `@import`, `fetch` or `srcset`. The probe counts them and any non-zero is a blocker.
- **Size: <= 2 MB target, 16 MB hard cap.** The fonts are about 204 KB and the crop is the only other weight; if the file approaches 2 MB something has gone wrong and the builder says what in `FINAL.md`. The probe prints the size twice — before and after any fix pass.
- **Static-first.** The markup plus CSS alone must paint the **rest state** correctly with JavaScript disabled or failed. The whole script body is inside `try { } catch { }` so one host-side surprise cannot leave a blank stage.

---

## C.2 The critical departure — scroll-driven, not state-switched

The Life Review mockup switched between three screens with a dev bar. **This one does not.** The lens is a function of scroll position, so the mockup has to have real scroll, and the frames have to be real scroll containers.

**Three frames on one stage**, all present in the DOM at once, laid out down the page:

| id | Size | Layout inside |
|---|---|---|
| `#frame-1440` | 1440 x 900 | rail \| paper \| margin |
| `#frame-1280` | 1280 x 800 | glyph rail \| paper, margin as a sheet |
| `#frame-390` | 390 x 844 | one column, mobile bar |

Each frame is **`overflow-y: auto`** with the paper inside it. Scrolling the frame is scrolling the document, and that is the interaction the whole proposal rests on.

**Every IntersectionObserver is rooted at its frame**: `new IntersectionObserver(cb, { root: frameEl, rootMargin: '...', threshold: [...] })`. This is not a preference. A `root: null` observer inside a scaled `overflow` container reports viewport-relative geometry that has nothing to do with what the reader sees, so the density map, the reading index and the lens line would all be wrong in ways that look plausible in a screenshot. Every observer names its frame. There is one observer set per frame, constructed by the same factory with the frame passed in.

**`fit()` scales down only.** Each frame is drawn at its native width and `transform: scale(s)` with `s = Math.min(1, (available - gutter) / nativeWidth)`; never above 1, so a shoot at 1560 gets 1:1 pixels. The wrapper's height is set to `nativeHeight * s` so the scaled frame does not leave a hole. `fit()` runs on load and on `resize`, for all three frames.

---

## C.3 Data

**The Vandersteen residence, verbatim from `source/specimen.md`** (= instruments §8). Every number, name, date and dollar figure is the specimen's. No invented client, no lorem, no rounded-off money. Where the specimen does not name a thing the design needs, invent it in the specimen's register — Wisconsin and Illinois places, real-sounding makers, plain Midwest nouns — and list every such invention in `FINAL.md` §"What the mock does not claim".

The paper must be **long enough to scroll several screens** at 1440, because a lens that only has two regions proves nothing. Blocks, in mount order:

1. **Letterhead** — household, 40px Playfair project title, stage plate, 11px mono vitals, the Phases fold, the in-hand timer row (0:47).
2. **The lens line / header organ** — whatever the proposal's §4 makes of the letterhead, ticket, guide and instruments. It is one element with an open and a closed height.
3. **Client approvals** — the two red-letter exceptions, both overdue, with owners.
4. **Schedule** — install Tuesday 2026-09-15, three weeks out, and the dates rule.
5. **Pieces / FF&E** — **all four rooms with at least 16 real lines total**: Living room (14 lines: 11 ordered, 2 in transit, 1 damaged — the brass-and-oak console from Fond du Lac Ironworks), Dining room (8: 8 ordered, 6 delivered — the Sturdy Oak table and six chairs on PO-2026-0418, unacknowledged 14 days), Primary bedroom (9: 7 ordered, 2 awaiting client approval, overdue — the Hartland wool rug and walnut nightstands), Mudroom (5: 3 ordered, 2 unspecified). At least one line carries the 48px catalog crop.
6. **Money** — approved $184,500 · specified $171,240 · ordered $141,600 · invoiced $96,400 · paid $78,900 · outstanding $17,500 (Invoice 2026-114, 22 days) · deposit due not drawn $12,300 · design fee $34,000, 3 of 4 milestones.
7. **Care** — the care band as the proposal composes it.
8. **The Record** — at the foot of the paper (C10), with the settled bars above it and no unfold hint on them (R8).
9. **Colophon**.

Plus the **margin** contents at 1440 (first-touch note, file-change notes, the capture row, drafts, decision / message / money chips, composer, handoffs) and the **rail** as the proposal designs it.

---

## C.4 Tokens

`mock/final/tokens.css` is the Life Review's `tokens.css` `:root` block **verbatim** — the whole R126 register, unedited. NG4 is the floor and the mockup is where a drifted value would be invisible until the deck shipped, so this file is copied, not retyped.

On top of it, **only these four families of new custom properties**, and nothing else:

| Property | What it is |
|---|---|
| `--lens-h-open` | the lens line's open (scroll-0) reserved height |
| `--lens-h-closed` | its condensed reserved height; SC3 wants <= 64px and stable |
| `--doc-region-gap` | the one region-spacing token from brief R1 — the single answer replacing today's `mt-6/py-6`, `mb-4`, `mt-2`, `mt-5`, `mb-5` |
| `--density-ink-full`, `--density-ink-reading`, `--density-ink-condensed` | the three ink levels of M-3's density scale |

**Every new colour value carries its computed contrast ratio in a CSS comment**, against the ground it sits on — e.g. `--density-ink-condensed: #65594E; /* 5.31:1 on --doc-paper #FCFAF6 */`. `research/contrast-check.mjs` produces the numbers; a comment without a number is a defect. A new token beyond these four families needs a line in `FINAL.md` saying why the register did not already have it.

**Zero `box-shadow` and zero `drop-shadow`** anywhere except the three `--elevation-sheet` sites (margin chip, open ledger sheet, studio drawer). This is checked by computed style, not by grep.

---

## C.5 The root state contract

The probe, the shooter and the fragment cutter all read state off the DOM rather than off screenshots. Every frame root and every region publishes its state as an attribute, always, including in the rest state.

| Attribute | On | Values |
|---|---|---|
| `data-lens-state` | each frame root | `rest` · `reading` · `editing` · `condensed` · `mobile` |
| `data-region` | each region root | `approvals` · `schedule` · `ffe` · `money` · `care` · `record` (and any the proposal adds) |
| `data-density` | each region root | `full` · `reading` · `condensed` |
| `data-reading-index` | the rail root | the `data-region` value of the region currently at `full`; **never null** while the paper is in view (SC12) |
| `data-lens-open` | the lens line | `true` · `false` |
| `--lens-height` | the lens line, as a custom property | its current reserved height in px, so the probe can sample SC3 without measuring |
| `data-motion` | the stage root | `normal` · `slow` · `reduced` |

Exactly **one** region per frame carries `data-density="full"` at any moment (SC11). If the proposal's state machine allows zero — between regions, at the foot — say so here and the probe checks for that case by name instead.

---

## C.6 The dev bar

Buttons carry `data-go` and a live `aria-pressed`. Delegated click handling, one listener. The bar is chrome around the stage, never inside a frame, and never appears in a fragment.

| Button | What it does |
|---|---|
| **Rest** | every frame scrolled to 0, lens open |
| **Condensed** | `#frame-1440` scrolled to 400 — the condensed state, reached the way a designer reaches it |
| **Region in focus** | `#frame-1440` scrolled so FF&E is `full` |
| **1280** | scrolls the stage to `#frame-1280` |
| **390** | scrolls the stage to `#frame-390` |
| **Reduced motion** | sets `data-motion="reduced"` on the stage root |
| **Slow motion 4x** | sets `data-motion="slow"`, which sets `--motion-scale: 4` |

Two rules that are easy to get wrong and both are probe items:

- **Reduced motion uses the same selector list as the media query.** One rule block, one selector list, reached by `@media (prefers-reduced-motion: reduce) { ... }` **and** by `[data-motion="reduced"] { ... }` — written once with both selectors, or written once and the toggle setting the media-query-equivalent state. Never two rulesets that can drift apart. The prober diffs the media-query result against the toggle result and any difference is a blocker.
- **Every duration is written `calc(<base> * var(--motion-scale, 1))`** — e.g. `transition-duration: calc(260ms * var(--motion-scale, 1))`. A hard-coded duration cannot be slowed, and a mechanic that cannot be watched at 4x cannot be shown to settle (SC/probe item 7).

Every dev-bar state must be **reversible** — pressing Rest from any state returns to the rest state with nothing left over (probe item 6).

---

## C.7 The script

One IIFE inside `try { } catch { }`, in `mock/final/index.html`, in this order. Delegated listeners only — one `click`, one `keydown`, one `pointermove` on `document`; never a listener per row, because sixteen FF&E lines times three frames is a listener census nobody can reason about.

1. **`fit()`** — scale-down-only sizing for all three frames; on load and on `resize`.
2. **`lens(frame)`** — the lens line for one frame. A sentinel element above the sticky element drives the open/closed transition (never a `scroll` handler reading `scrollTop`), and the sentinel's height **reserves the open height** so the transition costs zero layout shift. Publishes `data-lens-open` and `--lens-height`.
3. **`focus(frame)`** — the density engine. **Two IntersectionObserver bands** implementing hysteresis: one band promotes a region to `full`, a different and narrower band demotes it. Guarantees exactly one `full` per frame. Exposes **`settle()`** — a synchronous function that forces the settled state for the frame's current scroll position, so probes and future tests never wait on a velocity gate.
4. **`spine(frame)`** — the rail. **Subscribes to `focus`**; it does **not** construct a second observer, because two observers with two bands is how the reading index and the density map come to disagree. Owns the **700ms jump lock**: after a rail target is clicked, the index holds the clicked region and ignores observer callbacks until the smooth scroll settles.
5. **`motion()`** — reads `prefers-reduced-motion`, wires the `data-motion` attribute, owns `--motion-scale`.
6. **`devbar()`** — delegated, `aria-pressed` maintained on every button on every state change.
7. **`ink()`** — stamps ink **once** on the state change that first brings them into view and never again (R16/R31). A stamp inside a closed disclosure waits for its opening. `ink()` only ever *adds* the inked class; nothing removes it.
8. **`pointAt()`** — writes `--ink-x` / `--ink-y` on `pointermove` for the ink-pool wash, on the act and on the row under it. One listener on `document`.
9. **`sheet()`** — the ledger overlay: a dialog with a focus trap, `Escape` to close, focus returned to the opener, and a defined landing element that is the sheet's first *act*, not whatever happens to be first in DOM order.
10. **`window.__mockReady = true`** at the end of a successful init, and **`window.__lensSettled()`** returning a promise that resolves once every frame's density engine has settled — the deterministic hook the shooter and the prober wait on instead of sleeping.

**Host-sim rationale — do not skip this.** The Artifact host inserts this file into a live page's body **after** load, so `DOMContentLoaded` and `window.onload` have already fired and a naive `DOMContentLoaded` listener never runs: the page publishes, opens, and is dead. Therefore init is a named function with a readyState guard:

```
function __mockInit() { try { /* everything above */ } catch (e) { /* rest state stays painted */ } }
if (document.readyState !== 'loading') { __mockInit(); }
else { document.addEventListener('DOMContentLoaded', __mockInit); }
```

`mock/final/host-sim.mjs` reproduces the host's insertion-after-load and must report `__mockReady === true` with zero page errors **before** the Artifact is published. This is a publish gate, not a nicety.

---

## C.8 The probe list — `mock/final/review-clickthrough.mjs`

Written and run by MR, who did not build the mockup. Every item prints PASS or FAIL with the observed value; **no item is skipped and no failure is filtered**. Results go to `mock/final/REVIEW.md` (and `REVIEW-2.md` after the fix pass).

1. **External requests = 0.** Network census over the whole load.
2. **Page errors = 0.** Console errors and unhandled rejections, both.
3. **`__mockReady` is true** under `file://` **and** under `host-sim.mjs`.
4. **Computed `box-shadow` census** = exactly the three `--elevation-sheet` sites, value `rgba(44, 41, 38, 0.08) 0px 1px 2px 0px`; every other element `none`. Computed style, not source grep; `filter: drop-shadow` counted separately and must be 0.
5. **Non-ASCII = 0** (`LC_ALL=C`).
6. **Every dev-bar state reachable and reversible** — enter each, assert its contract, press Rest, assert the rest state is byte-equivalent in the attributes of C.5.
7. **Condensation reaches steady state.** A 20-step slow scroll through each density threshold; assert no region's `data-density` changes more than once per step direction — no oscillation at any boundary, at `--motion-scale: 4`.
8. **CLS = 0** over a scripted scroll from 0 to the foot at 1440, via `PerformanceObserver` on `layout-shift`, in both the normal and the reduced register.
9. **Nothing moves under the pointer.** Park the pointer on an FF&E line, scroll one threshold, assert the element under those coordinates is the same element.
10. **Reduced-motion parity.** Diff the visible text of every frame in the animated register against the reduced register, at each dev-bar state; **any word present in only one register fails**. Plus: 0 elements report a non-zero animation or transition duration 1s after entering any state, checked via the media query **and** via the dev-bar toggle.
11. **Keyboard order survives condensation.** Tab through at 1440 at scroll 0, 400 and 1200; assert DOM order is preserved and **no focused element is obscured by the pinned lens line** (2.4.11).
12. **Nothing escapes the frame at 390.** `scrollWidth <= clientWidth` on `#frame-390` and on every descendant that could overflow.
13. **Composite contrast >= 4.5:1** per lens state, sampling actual rendered colours including any density-reduced text.
14. **The navigator lands where it says.** Click each rail target in turn; assert the named region head is at the top of the frame, under the lens line, and that `data-reading-index` matches the clicked region after the 700ms jump lock.
15. **1280 shows the margin as a sheet** — not as a column, not missing; opened and closed, with focus behaviour.
16. **SC1–SC4 and SC11–SC12 numbers printed** at scroll 0, 400 and 1200: first region head y, condensed band height, `--lens-height`, rail utilisation, the density map, the reading index.
17. **Fonts loaded** — all three families report as loaded via `document.fonts.check`, and no fallback face is rendering.
18. **Full tab-through with accessible names** — every focusable element in order, its accessible name printed; an unnamed focusable is a defect.

---

## C.9 Deck fragments — cut from the live mockup

`mock/final/shoot-final.mjs` drives the running mockup to named scroll offsets and writes the **DOM subtree** — not a screenshot — into `mock/fragments/*.html`. Each fragment is wrapped in a container with a literal `width:Npx;height:Npx` and carries a `<figcaption>`; contains **no `<img src="img/...">`**; and shows **0 computed `box-shadow`** unless it legitimately contains one of the three token sites.

Twelve fragments, by name:

| Fragment | What it shows |
|---|---|
| `lens-s0-1440` | the proposed document at scroll 0, lens open |
| `lens-s1-1440` | the seam/condensed state, scrolled |
| `lens-s2-1440` | FF&E at `full`, neighbours yielded |
| `today-s0-1440` | today's document at scroll 0, drawn from `mock/kit.css` as-is |
| `today-s1-1440` | today's ticket seam, drawn from the kit as-is |
| `spine-before-360` | the rail as it is — 360px tall crop |
| `spine-after-360` | the rail as the proposal makes it |
| `header-before-720` | the header stack as it is — 720px tall crop, the frame-budget picture |
| `header-after-720` | the header organ as the proposal makes it |
| `motion-grammar-1080` | the grammar table rendered as the deck shows it |
| `lens-390` | the mobile form |
| `reduced-1440` | the reduced-motion register at the condensed state |

**Staleness check:** `mock/deck-parts/build.mjs` fails the build if any fragment file is **older than `mock/final/index.html`**. A fragment cut before the last mockup fix is a deck that shows a design that no longer exists, and that failure mode is silent without this check.

---

## C.10 Non-negotiables — the checklist MB signs off in `FINAL.md`

- [ ] One file; no build; opens from disk.
- [ ] Pure ASCII (`LC_ALL=C grep` clean).
- [ ] Zero external requests; fonts and the one crop are data URIs.
- [ ] <= 2 MB target, 16 MB hard cap; size printed.
- [ ] Static markup + CSS paint the rest state with JS disabled.
- [ ] Three frames, each `overflow-y: auto`, each with its **own** observers rooted at itself.
- [ ] `fit()` scales down only, never up.
- [ ] Vandersteen data verbatim; >= 16 real FF&E lines across all four rooms; every invention listed in `FINAL.md`.
- [ ] `tokens.css` `:root` copied verbatim from the Life Review; only the four new property families added; every new colour carries its computed ratio in a comment.
- [ ] `box-shadow` on exactly the three `--elevation-sheet` sites, by computed style; `drop-shadow` nowhere.
- [ ] The full C.5 attribute contract published in every state, including at rest.
- [ ] Dev bar: seven buttons, `aria-pressed` live, every state reversible.
- [ ] Reduced motion shares one selector list with the media query; no duplicated ruleset.
- [ ] Every duration written `calc(<base> * var(--motion-scale, 1))`.
- [ ] Density: exactly one `full` region per frame; `data-reading-index` never null while the paper is in view.
- [ ] Hysteresis: two bands, not one; no oscillation at 4x.
- [ ] Zero layout shift on condense — the sentinel reserves the open height.
- [ ] `settle()` and `window.__lensSettled()` exposed; `window.__mockReady` set.
- [ ] `__mockInit()` + `readyState` guard; whole body in `try`/`catch`; `host-sim.mjs` reports ready with zero errors.
- [ ] Delegated listeners only.
- [ ] No hover-only affordance anywhere (an automatic return in the rubric).
- [ ] Every move present in the mockup appears in the proposal's §3 grammar table; nothing animates that is not listed.
