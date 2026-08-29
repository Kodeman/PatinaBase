# 29 — Panel E1 · Engineering feasibility

Seat: **E1 — Engineering feasibility (Patina engineering team).** Assess, do not design.
Program: The Document — The Smart Lens (2026-08-28). Surface: `/doc/[id]`.
All paths relative to `apps/designer-portal/` unless absolute.

Cost bands used throughout: **days** = 1–3 days, one engineer · **week** = about a week ·
**weeks** = two or more weeks, or it touches a contract other code depends on.

Shots used: every shot in the mandatory minimum set was present and verified in
`research/01-shot-ledger.md`, and all nineteen were read. `prework-s2` does not exist and
was not needed (the prework doc renders zero `[data-region-head]` elements — ledger
capture-caveat 3). No shot in the set was skipped.

---

## 1. One line

The seam variable is the load-bearing beam, and it is load-bearing precisely because it is
**binary and measured**. `job-ticket.tsx:248-259` writes a real `getBoundingClientRect()`
height, only while pinned-and-folded, and *removes* the property otherwise; four consumers
(`globals.css:1026`, `:1034`, `:1037`, `commercial/money-region.tsx:48`) read it through a
`var(…, 0px)` fallback that is only ever exercised in the two stable states. Making that
height a continuous function of scroll converts every one of those consumers from "a
constant that changes twice" into "a moving target sampled mid-flight", and the first thing
that breaks is not a test — it is `scrollToRegion`'s `scrollIntoView({block:'start'})`
(`hooks/use-document-running-index.ts:212-215`), which resolves `scroll-margin-top` once, at
the start of a smooth scroll, against a seam that is a different height when the scroll
lands. Every ticket-row door and every `On this paper` jump would land off by up to the
full 283px condensation range, differently on every run, and no test in the tree can see it
because every seam assertion lives in jsdom, which has no layout. That is the sentence the
authors need before they draw anything: **a continuous seam is not a header change, it is a
navigation change.**

---

## 2. Condensing the header

**What exists.** `job-ticket.tsx:362` — `sticky top-0 z-[4] border-y … py-2.5`. Sentinel
`doc-ticket-sentinel` at `:347` (id constant `:56`), observed at `threshold: 0` (`:218-228`)
to set `pinned`. `unfolded = fold ?? (!pinned && !seamAtRest)` (`:244`), so pin and fold
flip in the same render — the probe confirms it: 23 height samples over 400ms from the
instant `pinned` flipped, **every one exactly 64.0625px**, no interpolation, and the first
region head's document Y jumped **−283.19px** inside one 40px scroll step
(`probe/03-interactive-probe.md` §1). `SEAM_HEIGHT_VAR = '--doc-seam-height'` at `:60`;
publication `useLayoutEffect` at `:248-259`, deps `[pinned, unfolded, seam.identity,
seam.exceptions]`.

**Every consumer, and what each does when the value becomes continuous.**

| Site | file:line | Today | Under a continuous seam |
|---|---|---|---|
| Producer (constant) | `components/document/job-ticket.tsx:60` | name only | unchanged |
| Producer (write) | `components/document/job-ticket.tsx:248-259` | measured px, **removed** when `!pinned \|\| unfolded` | must publish on every frame; "removed" ceases to be a state, which is what breaks the tests below |
| Schedule glance offset | `app/globals.css:1026` | `section[aria-label='Schedule rule'] { top: var(--doc-seam-height, 0px) }` | sticky constraint re-resolves every frame; the glance **visibly drifts** against the paper while the seam condenses. Correct, but it reads as two independent things moving. This is the ticket's only `sticky top-0` sibling. |
| Region landing clearance | `app/globals.css:1034` | `[data-index-region] { scroll-margin-top: var(--doc-seam-height, 0px) }` | **breaks first** — see below |
| FF&E landing floor | `app/globals.css:1037` | `max(var(--doc-seam-height,0px), 4rem)` | same, with a 64px floor that partially masks the error and makes it width-dependent |
| Money inline clearance | `components/document/commercial/money-region.tsx:48` (applied `:231`, `:252`) | duplicate of the `[data-index-region]` rule, declared locally | same failure, in a second place, so a fix applied only in CSS leaves this one wrong |
| Test — unset by default | `components/document/__tests__/job-ticket.test.tsx:519` | asserts `''` | **red** the moment the property is always published |
| Test — set when pinned | `…job-ticket.test.tsx:524` | asserts `/px$/` | survives |
| Test — cleared again | `…job-ticket.test.tsx:529` | asserts `''` | **red**, same reason |

**What breaks first, precisely.** `scrollToRegion` (`hooks/use-document-running-index.ts:202-222`)
does a double-rAF then `root.scrollIntoView({block:'start', behavior: smooth})`. The browser
computes the target scroll offset **once**, using the element's computed `scroll-margin-top`
at call time. With a two-state seam that value is stable across the whole animation (the
seam is already pinned-and-folded, or it is not). With a continuous seam the value at call
time is whatever the seam happens to be at the reader's current offset, and by the time the
smooth scroll settles the seam is at its condensed minimum — so the region head lands under
the seam, or up to 283px below where it should. It lands differently at different fling
speeds. The ticket performs the identical act (`job-ticket.tsx:198-201`, deliberately one
copy), so both the ticket's eight row doors and the four `On this paper` entries inherit it.

The mitigation that has to be designed in from the start, not patched: **freeze the seam at
its condensed minimum for the duration of any programmatic scroll**, and let
`scroll-margin-top` read that floor rather than the live value. The 700ms jump lock
(`use-document-running-index.ts:35`, `:166-180`) is already the right hook for it — it just
has to also own the seam, which it does not today.

**Second failure, hidden until 390/1280.** The published height is *measured*, and its deps
include `seam.identity` and `seam.exceptions` (`job-ticket.tsx:258`). At 390 the seam
identity line and the exception line each wrap (`m390-rich-s1.png`: `THE JOB · PROJECT` over
`$6,200 owed you · 3 unspecified` with `UNFOLD ↓` sharing the second line), and at 1280 the
compact rail's caption already breaks mid-word. A continuous height declared as
`lerp(347, 64, p)` is therefore wrong on two of three widths and on any document whose seam
carries two exceptions instead of `Nothing overdue`
(`lib/document/ticket-derivation.ts:853`). A continuous seam must interpolate between two
**measured** endpoints — which means both forms measured (a ResizeObserver on each, or an
off-screen measurement pass) before the interpolation is legal. This is the cost that turns
"days" into "week".

**`animation-timeline: scroll()` — assessment.**

- *Target matrix.* There is **no `browserslist`** in `apps/designer-portal/package.json`, no
  `.browserslistrc`, and none at the repo root. The only browser matrix declared anywhere in
  this app is `playwright.config.ts:54-68`, which enables **chromium, firefox and webkit**,
  all three. So WebKit is in the declared matrix by the only artefact that declares one.
- *Support.* Scroll-driven animations shipped in Chromium 115 and in Firefox in the 144
  line; WebKit's support is recent (Safari 26 line) and anything older gets nothing. With no
  browserslist floor there is no way to argue a designer on an older Safari is out of scope.
  **Verify with `npx browserslist@latest "supports css-animation-timeline"` before pricing
  the no-fallback branch** — I am not treating my recollection of Safari's version as
  evidence.
- *`prefers-reduced-motion`.* A scroll timeline is position-linked, not time-linked: it moves
  only while she scrolls, which is an interaction (WCAG 2.3.3 territory). The honest contract
  is that under `reduce` the lens drops to the **two-state fold that ships today** — the code
  for it already exists and is already the reduced-motion answer for everything else in the
  file (nine `@media (prefers-reduced-motion: reduce)` blocks, `globals.css:283-1523`). That
  costs a single `animation-timeline: none` block. It is the cheapest correct reduced-motion
  form in this whole program.
- *The `@property` trap.* Animating a custom property with a scroll timeline requires
  registering it (`@property --doc-seam-height { syntax: '<length>'; … }`). A registered
  custom property **always has a computed value**, so every `var(--doc-seam-height, 0px)`
  fallback arm at `globals.css:1026`, `:1034`, `:1037` and `money-region.tsx:48` becomes dead
  code, and the comment at `money-region.tsx:47` ("nothing pinned reads 0") stops being
  enforced by the fallback and starts depending on the registration's `initial-value` being
  right. Four sites, silently.
- *JS fallback shape if unavailable.* A rAF-throttled `scroll` listener writing the variable
  on `document.documentElement` — exactly the pattern already in
  `use-document-running-index.ts:136-145`. Idiomatic here, but it is a main-thread style
  write per frame and it lags a fling by a frame or two. Feature-detect with
  `CSS.supports('animation-timeline: scroll()')` and ship both.

**Cost bands.**

| Approach | Band | Why |
|---|---|---|
| Three discrete states (full → mid → seam), still pin-driven, still a measured px per state | **days** | one more sentinel + one more observer; the var's contract is unchanged; only the e2e 8-row assertions move |
| Continuous, JS rAF only | **week** | measured-endpoint machinery, seam freeze during programmatic scroll, hysteresis band, and the three `job-ticket.test.tsx` seam assertions rewritten |
| Continuous via `animation-timeline: scroll()` + `@property` + JS fallback | **weeks** | two code paths that must agree, a registered property that kills four fallbacks, a WebKit version floor nothing in this repo declares, and a second reduced-motion path |

**The fork the authors must name:** *does the seam's height change continuously, or in three
discrete steps?* Three steps buys ~90% of the perceived effect for a quarter of the cost and
touches no navigation contract. Continuity is a navigation change.

---

## 3. Regions that yield focus

**What exists.** `region/use-region-fold.ts:121` —
`folded = forceOpen ? false : (explicit ?? latchedDefault ?? false)`. Three voices:
`forceOpen` (caller), `explicit` (localStorage `patina:doc-fold:<docId>:<region>`, `:42-46`,
read in an effect never in render, `:111-114`), `latchedDefault` (derived from region data,
latched at `:104-119` so a late query cannot yank a region shut). Seven fold keys at
`:25-40`. Folding **unmounts the body** and leaves a 44px `FoldSeam`.

**The unmount is not only a disclosure mechanism — it is the document's only render-cost
control.** `components/document/ffe-section.tsx` is 1549 lines with **no virtualization**
(`@tanstack/react-virtual` is a dependency of this app and is not imported in that file), and
the FF&E body renders one row per line with a 48px catalog crop each (`w1440-rich-s2.png`).
On the synthetic seed that is three rows. On a real 60-line, 4-room schedule it is sixty
rows plus sixty images, and today the fold is what keeps them out of the DOM. A density lens
that keeps bodies mounted at reduced ink removes that control. This is the single most
important sentence in this section and the seed cannot show it.

**IntersectionObserver thresholds.** A density observer is cheap in isolation (`days`) — one
observer per region root, `threshold: [0, 0.15, 0.85, 1]` plus a rootMargin band. Two
cautions from the code:
- The existing index observer attaches by **query with retry**, not subscription
  (`use-document-running-index.ts:120-133`, 8 retries × 250ms ≈ 2s, documented at `:14-18`).
  A region that mounts after that window is genuinely never observed. A density observer
  built on the same base inherits the same silent hole; it wants a `MutationObserver` on
  `<main>` instead.
- The four index roots are `data-index-region` on `ffe-section.tsx:1209`,
  `schedule/schedule-spine.tsx:1057`, `commercial/money-region.tsx:229`/`:250`,
  `approvals/project-approval-document.tsx:565`/`:586`. Two of the four (approvals, money)
  render the attribute on **two different elements** depending on fold state — a density
  observer must survive its target being replaced, which a bare `observe(el)` does not.

**`content-visibility: auto` + `contain-intrinsic-size`.** Nothing in `src/` uses either
today (grep: zero hits for `content-visibility`, `contain-intrinsic`, `animation-timeline`,
`scroll-timeline`, `view-timeline`). It is the direct replacement for the render-cost control
the fold currently provides, and it is broadly supported (Chromium, Firefox 125+, Safari
18+). Effects, specifically in this tree:

- *`Ctrl+F`*: `content-visibility: auto` subtrees **are** reachable by find-in-page in
  Chromium — the browser force-renders the subtree on a match. (`content-visibility: hidden`
  is not, and must not be used here.) The accessibility tree also keeps `auto` subtrees, so
  a screen reader still reads a condensed region — which is the behaviour a lens wants and
  the current unmount does not give.
- *The running-index observer*: it observes the region **root**, which stays laid out, so
  attachment is unaffected. But the root's height while skipped is `contain-intrinsic-size`,
  and the `-20% 0px -62% 0px` band (`use-document-running-index.ts:34`) computes against that
  fake height — so the reading line commits early or late until the real size arrives.
  `contain-intrinsic-size: auto <len>` (last-remembered size) fixes it after first render,
  not on first paint.
- *Scroll anchoring*: a 60-line FF&E body switching between intrinsic and real height above
  the reader is exactly the case where anchoring adjustments and c-v size changes fight. On
  the thin seed it will never reproduce.
- *The R126 hover wash — the concrete breakage.* `content-visibility: auto` implies
  `contain: layout paint`, which makes the region root a **new stacking context and a
  containing block**. `.row-wash` is `position:absolute; inset:0; z-index:-1`
  (`globals.css:327-334`), used on FF&E lines (`ffe-section.tsx:76,225,394,417,480,484`). A
  `z-index:-1` element inside a fresh stacking context paints behind that context's own
  background rather than behind the row — the ink-pool wash Kody asked for and R126 shipped
  either disappears or paints over the text. This must be re-proved in a browser before
  `content-visibility` is put anywhere near FF&E.

**React 19 concurrency — the answer is no.** A density change driven by scroll **must not**
be a `startTransition`. Transitions yield to higher-priority work and can be interrupted; a
density that lands two or more frames behind the scroll reads as the paper catching up with
the reader, which is worse than no lens. The document tree contains **zero**
`startTransition`/`useTransition` calls today (the only grep hits are an unrelated mutation
hook name in `rooms/piece/custom-commission-sheet.tsx`). The correct shape is a DOM attribute
written imperatively outside React's render — `root.dataset.density = 'reduced'` in the rAF
scroll handler, with CSS doing the rest and React re-rendering nothing. Named as a rule, that
costs nothing; discovered in week three, it costs a rewrite.

**What the third voice becomes.** The latched derived default (`latchedDefault`, `:104-119`)
is the only one of the three that was never a designer's act — it was always computed from
region data. It is therefore the only one that can safely be re-read as a **density** default
rather than a **fold** default. The recommended shape:

1. `forceOpen` stays supreme and stays a fold override — a deep link must land on a body at
   full ink.
2. `explicit` (localStorage) stays a hard fold, unchanged, and survives scroll. It is the
   designer's own act and a lens must never overrule it.
3. `latchedDefault` becomes the region's **initial density**, not its initial fold.
4. Scroll position becomes a **fourth, lowest, non-persisting** voice that may only move a
   region between `full` and `reduced` — **never to `folded`**, because folding by scroll
   deletes a fact the designer never chose to hide, and because it would need to write
   `writeExplicit` to be remembered, which would then outlive the session under a state she
   never chose (`:129`'s existing "leave no record" reasoning generalises exactly).

That widens the hook's return from `{folded, toggle, setFolded}` (`:90-94`) to add `density`,
across all seven keys, and rewrites `region/__tests__/use-region-fold.test.tsx:38-60`
additively.

**Cost bands.**

| Approach | Band |
|---|---|
| Density as a data attribute + CSS, bodies stay mounted, `use-region-fold` gains a fourth non-persisting voice | **week** (days for the mechanism; a week because "reduced ink" has to be specified per region — FF&E rows, approvals list, money rungs and schedule ledger are four different bodies) |
| `content-visibility: auto` + `contain-intrinsic-size` as the render-cost replacement | **week** (days to apply; a week to prove the wash, the index band and scroll anchoring against a real 60-line schedule) |
| Density via IntersectionObserver thresholds | **days**, +**days** to replace the query-with-retry attach with a MutationObserver |
| Density as a React transition | not costed — this is the wrong tool; see above |

---

## 4. The running index everywhere

**Indexing all seven spreads.** Four separate costs, in ascending order of nastiness:

1. *The type.* `DocumentIndexKey` is exactly four members (`lib/document/document-index.ts:17`),
   `PROJECT_PAPER_ORDER` is one array (`:36-57`) from which the keys, the labels and
   `regionHeadingId` are all derived (`:85-102`), and `regionHeadingId` **throws** on an
   undeclared key (`:93-102`). Widening the union means replacing one array with a
   per-section order table. `days`.
2. *`paperRegionsForSection`.* `:76-82` returns `[]` for brief/discovery/direction/proposal.
   Changing it is one line — and turns `__tests__/shelved-spine.test.tsx:155-197` red on the
   test that asserts precisely that. `days`.
3. *The DOM does not exist.* This is the real cost. The prework document renders **zero
   `[data-region-head]` and zero `[data-index-region]` elements of any kind** — confirmed by
   direct DOM query in two independent passes (`research/12-layout-measurements.md`
   caveat 2; `research/01-shot-ledger.md` capture-caveat 3, which is why `prework-s2` has no
   PNG). The proposal spread's content — `PROPOSAL · WITH THE CLIENT` / `Sent Aug 27 · not
   opened yet`, `SCOPE & ENGAGEMENT · CORE · STAGE 03`, `Proposal · v1`, the send-wall table
   `SENT / OPENED / READING / MOST READ` (`w1440-prework-s0.png`, `w1440-prework-s1.png`) —
   is rendered inline in `app/(document)/doc/[id]/page.tsx` with a plain head at `:2006`
   (`mb-1.5 mt-5 flex items-baseline justify-between`), not through `RegionHead`. Indexing
   the pre-work spreads means **wrapping four spreads' bodies in real regions inside
   `page.tsx`** — which is page.tsx surgery, and page.tsx surgery is where the 1500-character
   regex lives (§5). `weeks`.
4. *The data behind each row.* `spine-shelved-blocks.tsx:69-105` derives every index value
   from `useDocumentRunningIndex(indexKeys, projectId)` (`:81`), `useProjectFFEItems(projectId)`
   (`:83-86`) and the money ladder (`:58-67`) — **all project-scoped**. A proposal document has
   no project. What exists to hang a value on: `proposal_items` (the row source
   `e2e/document/quiet-responsive-shell.spec.ts` seeds in its `beforeAll`), the send-wall
   state already printed on the paper, and the stage line. What does **not** exist as a
   spine-reachable count: anything at all for `brief` and `discovery`.

   **The fork:** *may an index row print with no value?* If yes — the row is a label and a
   reading line, nothing else — this is `week` (wrap the regions, widen the table, no new
   queries). If every row must carry a count the way `3 pieces · 0 rooms` and `$6,200 owed`
   do today, it is `weeks` and it needs new queries for two spreads that have no numeric
   content to count.

**Bringing the index to 1180–1439.** The block is gated `hidden min-[1440px]:block`
(`doc-spine.tsx:141`), and the rail there is 56px, of which `px-1.5` leaves a **~44px content
box**. The index prints a `text-[13px]` label and an 11px mono value
(`spine-running-index.tsx:97-114`); neither fits. The evidence that 44px is already too
narrow is on screen: `w1280-spine-glyph-rail.png` shows the active caption broken mid-word as
`Project / ACTIV / E` and the compact timer as `In / hand / 21m` — `break-words` at 44px.
Branches:

| Branch | Band | What it costs |
|---|---|---|
| (a) Widen the compact rail to ~96–120px | **weeks** | `e2e/document/quiet-responsive-shell.spec.ts:224-228` pins 55–57px; `e2e/document/quiet-release-contracts.spec.ts:108-118` pins the same by `boundingBox()` with bounds `[0,56]`, and `:150-158` pins paper `[200,1208]` / margin `[1208,1440]` at 1440; `shelves/shelf-panel.test.tsx:145` pins `min-[1440px]:left-[200px]` to the 200px spine. It also moves the paper's x-origin at 1280, which is the widest-blast-radius change in this whole review. |
| (b) Keep 56px, print a position-only reading line — a 2px clay rule with four tick stops, no text | **days** | one component; labels return on **press** via the sheet the mobile spine already builds (`mobile/mobile-sheets.tsx:441+`), so it never becomes a hover-only affordance (an automatic return in this program's rubric). |
| (c) Move the index's gate from 1440 down to 1280 as-is | **week** | `doc-spine.test.tsx:43-46` asserts the wrapper is exactly `hidden` + `min-[1440px]:block`; and at 44px the text does not fit, so this branch only works together with (a). |

---

## 5. The tests

One row per named file: **break / rewrite / delete**, the reason, the band.

| File | Verdict | Reason | Band |
|---|---|---|---|
| `e2e/document/quiet-responsive-shell.spec.ts` | **rewrite** | `[data-ticket-row]` is asserted to be exactly **8** at 1440 (`:173-176`), 1280 and 390 (`:183-185`), and the compact spine is pinned to 55–57px (`:224-228`). Any intermediate header state that shows fewer than eight rows, and any rail widening, is red. Rewrite as "the rows this state promises", not a constant. | week |
| `components/document/__tests__/job-ticket.test.tsx` | **rewrite** | `:519` and `:529` assert `--doc-seam-height` is the empty string; `:524` asserts `/px$/`. A seam that is always published (continuous, or `0px` at rest, or `@property`-registered) turns two of the three red with zero behavioural change. `:259` `sticky`, `:262` `data-pinned`, `:517` `z-[4]` and `:533-541` (no shadow) all survive. | days |
| `__tests__/responsive-document-shell.test.tsx` | **rewrite** | The largest single concentration: `:187-189` pins the literal regime string `'sheet-below-1180-compact-to-1439-full-from-1440'`; `:191-195` pins the spine class list; `:317`/`:319` pin `data-margin-mode='rail'` with `min-[1440px]:sticky` / `col-start-3`; `:655-687` pins 8 rows + `data-unfolded='true'` at 1440. A lens that adds a state makes the regime string a lie, and that string is a contract other tests read. | week |
| `__tests__/shelved-spine.test.tsx` | **rewrite** | `:155-197` asserts `paperRegionsForSection` returns `[]` for brief/discovery/direction/proposal — the exact behaviour §4 changes — and `:217-236` pins the spine to one block ("On this paper and nothing else"). | days if the index stays project-only; **week** if it goes to seven spreads |
| `components/document/doc-spine.test.tsx` | **rewrite** | `:43-46` asserts the shelved-blocks wrapper carries exactly `hidden` and `min-[1440px]:block`. That single assertion is what blocks the index at 1280. `:25-28` pins `Put down`'s and the caption's 1180 gating. | days |
| `region/__tests__/use-region-fold.test.tsx` | **rewrite (additive)** | `:38-60` pins the default-fold derivation, the `patina:doc-fold:<docId>:<region>` key shape and `events.regionFolded` on toggle. Adding a fourth, non-persisting density voice leaves every existing assertion true and needs new cases for "scroll never writes storage". | days |
| `region/__tests__/fold-seam.test.tsx` | **keep — breaks only on one design choice** | `:36-45` forbids an `opacity-0`/`translate-y` flash gated on a hydration flag. A CSS-keyframe or scroll-timeline condense does not trip it. A JS `mounted`-flag-gated condense does. | days if tripped |
| `region/__tests__/region-head.test.tsx` | **keep** | `:110-120` pins the head's `grid-cols-1` / `min-[1180px]:grid-cols-[1fr_auto]` and the ledger's `justify-start` / `min-[1180px]:justify-end`; `:128-158` pins the action-region contract unconditionally. A density lens that changes ink weight and body height only leaves this true. It breaks only if the **head itself** condenses its two columns into one. | days if tripped |
| `lib/document/__tests__/stage2-approval-cutover-contract.test.ts:19` | **delete and replace** | The trap. See below. | days |

### The trap, measured

```js
expect(page).toMatch(
  /data-active-section[\s\S]{0,1500}?<SectionStageLineMount/,
);
```

`page` is the **raw source text** of `app/(document)/doc/[id]/page.tsx`, read with
`fs.readFileSync` at `:10`. Measured against the file as it stands today:

- `data-active-section` occurs at source offsets **46889, 82274, 83240**.
- `<SectionStageLineMount` occurs once, at **83402**.
- The real JSX attribute is the one at **82274** (`page.tsx:1942`) → the mount at
  `page.tsx:1964` is **1128 characters** away. Against the 1500 cap that is **372 characters
  of headroom**, not the ~600 the anatomy estimated.
- But the regex is satisfied today by a *nearer* occurrence: the comment block at
  `page.tsx:1960-1963` contains the literal string `data-active-section>` at offset **83240**,
  only **162 characters** from the mount. **The test currently passes on a comment, not on the
  structure it claims to pin.** Reword that comment — a perfectly innocent editorial change —
  and the passing margin silently collapses from 1338 characters to 372.

**What happens if anything is inserted between those two points.** Anything at all counts,
because the unit is source characters, not DOM: a `<Suspense>` boundary, a lens-state
provider, a density wrapper, a `useLensDensity()` call above the return, two more drag
handlers on the wrapper `<div>` (`:1945-1958`), or one more explanatory comment. Cross 1500
and the test goes red **with zero behavioural change and no rendered difference**, and the
diff that turns it red will look like it touched nothing relevant. A lens redesign that
recomposes the header stack around the active section is very likely to trip it, and likely
to trip it on a PR whose author has no idea this file exists.

Verdict: **delete the character-count regex** and replace it with the assertion it actually
means — render the page and assert `SectionStageLineMount` is the first element child of
`[data-active-section]`. The three companion assertions in the same `it` (`:15-17` the
`MobileMarginChips` → `ProjectApprovalDocumentMount` order, `:21-23` the `indexOf` ordering,
`:24` `'project?.client_id ?? null'`, `:25-27` the 300-char `clientProfileId` guard) are all
order-and-content assertions that survive.

### Gates that must stay green regardless

**`lib/document/__tests__/shadow-gate.test.ts`.** Exactly one `box-shadow` declaration in
`globals.css`, spent only by `.doc-elevated` (`:80-95`); **any** new shadow anywhere under
`src/` fails except one frozen legacy declaration (`:97-105`); no `drop-shadow()` (`:107-122`);
`--elevation-sheet` declared once (`:124-127`); `.doc-elevated` on at most **three** TSX files
under `components/document/**` (`:129-136`), currently spent on `studio-drawer.tsx:289`,
`margin-item.tsx:46`, `overlays/doc-sheet.tsx:371`. Engineering consequence a lens author
must know before drawing: **a condensing seam floating over the paper has zero shadow budget.**
Its separation from the paper beneath must be a rule weight (`--rule-hair` / `--rule-mid` /
`--rule-strong`, `globals.css:130-132`) or the paper-vs-rail-stock value step. This is NG2 and
it is mechanically enforced at the CSS level, not merely stated.

**`lib/document/__tests__/contrast.test.ts`.** `--doc-rail-stock` pinned to `#E8E3DB`
(`:297-303`); charcoal / muted / clay-ink ≥ 4.5:1 on the rail (`:305-311`); named rail ink
pairs ≥ AA (`:343-365`); rail vs paper/desk separation > 1.1 (`:367-374`). Two things a lens
author needs from this file:

- It **hard-codes the five filenames it scans** (`:313-341`): `spine-running-index.tsx`,
  `spine-shelved-blocks.tsx`, `spine-timer.tsx`, `doc-spine.tsx`, `margin-rail.tsx`. Renaming,
  splitting or extracting any of them drops it from the scan **silently** — a green test that
  has stopped testing.
- It gates the **rail**, not the paper. Reduced ink on paper is ungated. For the record, the
  muted ramp's lightest step is safe: **`#65594E` on paper `#FCFAF6` computes to 6.5:1**, with
  roughly one more lightening step of headroom before 4.5:1. So a density lens does **not**
  need a new grey — the R126 register already contains a legal reduced-ink step. It does need
  a gate, because nothing currently stops a later step from crossing the floor.

---

## 6. The three riskiest things any lens could ask for

**Rank 1 — a continuously-changing `--doc-seam-height`.**
Lands in `components/document/job-ticket.tsx:248-259` and detonates in
`hooks/use-document-running-index.ts:202-222`. Band: **week** (JS) / **weeks** (scroll
timeline + fallback).
*The observation that proves it real in week one:* click the ticket's `Money` row, then the
`On this paper` → `Money` entry, twice each at different scroll speeds. The region head lands
at a **different** final offset each time — sometimes under the seam, sometimes ~100–280px
below the seam. Every unit test stays green, because every seam assertion is jsdom and jsdom
has no layout.

**Rank 2 — region bodies that stay mounted at reduced ink.**
Lands in `components/document/ffe-section.tsx:1204-1210` (1549 lines, no virtualization) and
`region/use-region-fold.ts:121`. Band: **week** with `content-visibility: auto`, **weeks** if
the answer turns out to be virtualization.
*The observation that proves it real in week one:* seed one project with a 60-line, 4-room
FF&E schedule with catalog crops, open it at 1440, and fling from `s0` to `s3` with all four
regions mounted. The running index's rAF `resolve()` (`use-document-running-index.ts:136-145`)
starts running two or three scroll events behind and the reading line visibly trails the
reader. The synthetic seed — 3 FF&E lines, 0 rooms — will never show this, so it has to be
seeded deliberately in week one or it arrives in production. Second observation, same week:
apply `content-visibility: auto` to the FF&E root and hover a line — if the R126 ink-pool
wash (`globals.css:327-342`, `z-index:-1`) vanishes or paints over the text, the containment
stacking context is real and that branch is dead.

**Rank 3 — recomposing `page.tsx` around the active section.**
Lands in `lib/document/__tests__/stage2-approval-cutover-contract.test.ts:19`. Band: **days**
to fix — but it is the *highest-probability* risk of the three, and it fails loudly at an
unpredictable moment.
*The observation that proves it real in week one:* the first PR that inserts a lens provider,
a density wrapper or a `<Suspense>` inside `[data-active-section]` turns exactly one test red
while every render test passes, and the reviewer cannot see why from the diff. Fix it *before*
the lens work starts, not when it bites.

---

## 7. Findings

```json
[
  { "id": "E1-01", "lens": "E1", "persona": null, "task_ids": ["T4","T9"],
    "key": "doc|all|seam|continuous-seam-breaks-region-landings",
    "surface": "/doc/[id]", "width": "all", "scroll_state": "seam", "flag": "both",
    "title": "Continuous seam height breaks every region landing",
    "observation": "`[data-index-region] { scroll-margin-top: var(--doc-seam-height, 0px) }` (globals.css:1034). scrollIntoView resolves scroll-margin once at call time; a seam that keeps changing during the smooth scroll lands the head off by up to 283px.",
    "why_it_blocks": "orientation", "frame_cost_estimate": 283,
    "evidence": { "shots": ["w1440-ticket-seam.png"], "refs": ["apps/designer-portal/src/hooks/use-document-running-index.ts:212", "apps/designer-portal/src/app/globals.css:1034", "apps/designer-portal/src/components/document/job-ticket.tsx:248"] },
    "severity": "blocker", "confidence": 0.85, "already_ruled": "R99",
    "suggested_fix": "Freeze the seam at its condensed floor for the duration of any programmatic scroll; extend the 700ms jump lock to own it.",
    "hesitation_seconds_estimate": 20 },

  { "id": "E1-02", "lens": "E1", "persona": null, "task_ids": ["T3","T4"],
    "key": "doc|all|seam|ticket-collapse-is-283px-single-frame-jump",
    "surface": "/doc/[id]", "width": "all", "scroll_state": "seam", "flag": "both",
    "title": "Ticket collapse jumps 283px in one frame, uncounted",
    "observation": "23 height samples over 400ms from the pin flip read exactly 64.0625px every time; the first region head's Y moved -283.19px inside one 40px scroll step. Ticket unfolded 347.25px, seam 64.06px. No CSS transition on either path.",
    "why_it_blocks": "motion", "frame_cost_estimate": 283,
    "evidence": { "shots": ["w1440-ticket-unfolded.png","w1440-ticket-seam.png"], "refs": ["apps/designer-portal/src/components/document/job-ticket.tsx:244"] },
    "severity": "high", "confidence": 0.95, "already_ruled": "R99",
    "suggested_fix": "Any lens must own this jump explicitly — either interpolate it or accept it as a deliberate, announced snap.",
    "hesitation_seconds_estimate": 8 },

  { "id": "E1-03", "lens": "E1", "persona": null, "task_ids": ["T4","T9"],
    "key": "doc|all|seam|registering-seam-property-kills-four-fallbacks",
    "surface": "/doc/[id]", "width": "all", "scroll_state": "seam", "flag": "both",
    "title": "Registering the seam var kills four var() fallbacks",
    "observation": "`animation-timeline: scroll()` on a custom property requires @property registration. A registered property always computes, so `var(--doc-seam-height, 0px)` at globals.css:1026, :1034, :1037 and money-region.tsx:48 loses its fallback arm.",
    "why_it_blocks": "information-loss", "frame_cost_estimate": 64,
    "evidence": { "shots": [], "refs": ["apps/designer-portal/src/app/globals.css:1026", "apps/designer-portal/src/components/document/commercial/money-region.tsx:48", "apps/designer-portal/src/components/document/job-ticket.tsx:60"] },
    "severity": "high", "confidence": 0.9, "already_ruled": "",
    "suggested_fix": "If the seam is registered, delete every var() fallback arm and pin the correctness on the registration's initial-value instead.",
    "hesitation_seconds_estimate": 0 },

  { "id": "E1-04", "lens": "E1", "persona": null, "task_ids": ["T10"],
    "key": "doc|1440|seam|schedule-glance-drifts-with-continuous-seam",
    "surface": "/doc/[id]", "width": "1440", "scroll_state": "seam", "flag": "both",
    "title": "Schedule glance drifts continuously under a moving seam",
    "observation": "`[data-document-shell] section[aria-label='Schedule rule'] { top: var(--doc-seam-height, 0px) }` — the ticket's only sticky top-0 sibling. A continuous seam re-resolves its sticky constraint every frame, so the glance slides against the paper independently.",
    "why_it_blocks": "motion", "frame_cost_estimate": 64,
    "evidence": { "shots": ["w1440-rich-s1.png"], "refs": ["apps/designer-portal/src/app/globals.css:1026", "apps/designer-portal/src/components/document/schedule/schedule-rule-region.tsx:199"] },
    "severity": "medium", "confidence": 0.8, "already_ruled": "R99",
    "suggested_fix": "Bind the glance to the seam's condensed floor, not its live height, so only one thing moves.",
    "hesitation_seconds_estimate": 4 },

  { "id": "E1-05", "lens": "E1", "persona": null, "task_ids": ["T4","T9"],
    "key": "doc|all|seam|seam-tests-are-jsdom-and-cannot-see-layout",
    "surface": "/doc/[id]", "width": "all", "scroll_state": "seam", "flag": "both",
    "title": "Every seam assertion is jsdom; landings are untested",
    "observation": "job-ticket.test.tsx:519/:524/:529 assert the property string only ('' / /px$/ / ''). jsdom has no layout, so a mis-landing after a seam change is invisible to the whole unit suite; no e2e asserts a landed region head's y.",
    "why_it_blocks": "orientation", "frame_cost_estimate": 283,
    "evidence": { "shots": [], "refs": ["apps/designer-portal/src/components/document/__tests__/job-ticket.test.tsx:519", "apps/designer-portal/src/hooks/use-document-running-index.ts:202"] },
    "severity": "high", "confidence": 0.9, "already_ruled": "",
    "suggested_fix": "Add one Playwright assertion: after a Money-row click, the money head's top sits within 4px of the seam's bottom.",
    "hesitation_seconds_estimate": 0 },

  { "id": "E1-06", "lens": "E1", "persona": null, "task_ids": ["T3","T4"],
    "key": "doc|all|all|no-browserslist-so-scroll-timeline-needs-fallback",
    "surface": "/doc/[id]", "width": "all", "scroll_state": "all", "flag": "both",
    "title": "No browserslist; only Playwright declares a browser matrix",
    "observation": "No `browserslist` key in apps/designer-portal/package.json, no .browserslistrc, none at the repo root. The only declared matrix is playwright.config.ts:54-68 — chromium, firefox AND webkit, all enabled. So WebKit is in scope by the only artefact that says anything.",
    "why_it_blocks": "information-loss", "frame_cost_estimate": 283,
    "evidence": { "shots": [], "refs": ["apps/designer-portal/playwright.config.ts:54", "apps/designer-portal/package.json:1"] },
    "severity": "high", "confidence": 0.95, "already_ruled": "",
    "suggested_fix": "Ship any scroll-timeline behind CSS.supports() with the rAF path as the default, and add a real browserslist before pricing the no-fallback branch.",
    "hesitation_seconds_estimate": 0 },

  { "id": "E1-07", "lens": "E1", "persona": null, "task_ids": ["T4","T8"],
    "key": "doc|1440|mid|fold-is-the-only-render-cost-control",
    "surface": "/doc/[id]", "width": "1440", "scroll_state": "mid", "flag": "both",
    "title": "The fold is the only render-cost control; FF&E is unvirtualized",
    "observation": "ffe-section.tsx is 1549 lines with no useVirtualizer and no react-virtual import, rendering one row plus a 48px crop per line ('Møbler Lounge Chair — Bouclé · x2', 'Oak Drum Side Table', 'Custom Walnut Sectional — 3 pc'). Unmounting on fold is what keeps 60 rows out of the DOM.",
    "why_it_blocks": "clutter", "frame_cost_estimate": 700,
    "evidence": { "shots": ["w1440-rich-s2.png"], "refs": ["apps/designer-portal/src/components/document/ffe-section.tsx:1204", "apps/designer-portal/src/components/document/region/use-region-fold.ts:121"] },
    "severity": "high", "confidence": 0.8, "already_ruled": "",
    "suggested_fix": "Replace the unmount's render-cost role with content-visibility: auto before removing it; the seed's 3 lines will never show the cost.",
    "hesitation_seconds_estimate": 0 },

  { "id": "E1-08", "lens": "E1", "persona": null, "task_ids": ["T4"],
    "key": "doc|1440|mid|content-visibility-containment-breaks-hover-wash",
    "surface": "/doc/[id]", "width": "1440", "scroll_state": "mid", "flag": "both",
    "title": "content-visibility containment may kill the R126 hover wash",
    "observation": "`content-visibility: auto` implies `contain: layout paint`, creating a stacking context. `.row-wash` is `position:absolute; inset:0; z-index:-1` (globals.css:327-334) on FF&E lines. A z-index:-1 child of a fresh stacking context paints behind that context's own ground, not behind the row.",
    "why_it_blocks": "motion", "frame_cost_estimate": 88,
    "evidence": { "shots": ["w1440-rich-s2.png"], "refs": ["apps/designer-portal/src/app/globals.css:327", "apps/designer-portal/src/components/document/ffe-section.tsx:225"] },
    "severity": "high", "confidence": 0.7, "already_ruled": "R126",
    "suggested_fix": "Prove the wash in a browser under content-visibility before adopting it on FF&E; otherwise confine c-v to approvals and money.",
    "hesitation_seconds_estimate": 0 },

  { "id": "E1-09", "lens": "E1", "persona": null, "task_ids": ["T4","T9"],
    "key": "doc|all|mid|index-attaches-by-query-retry-not-subscription",
    "surface": "/doc/[id]", "width": "all", "scroll_state": "mid", "flag": "both",
    "title": "The index attaches by 2s query-retry, not subscription",
    "observation": "ATTACH_RETRY_MS 250 x ATTACH_RETRIES 8 (use-document-running-index.ts:37-38) — about 2s. attach() re-queries and re-schedules only while attached.size < ordered.length; a region root that mounts after the window is never observed at all.",
    "why_it_blocks": "orientation", "frame_cost_estimate": 200,
    "evidence": { "shots": ["w1440-spine-full.png"], "refs": ["apps/designer-portal/src/hooks/use-document-running-index.ts:120", "apps/designer-portal/src/hooks/use-document-running-index.ts:37"] },
    "severity": "medium", "confidence": 0.85, "already_ruled": "",
    "suggested_fix": "Any density observer should use a MutationObserver on <main> rather than inheriting this retry window.",
    "hesitation_seconds_estimate": 6 },

  { "id": "E1-10", "lens": "E1", "persona": null, "task_ids": ["T7","T12"],
    "key": "doc|1440|top|prework-spreads-have-no-region-dom-to-index",
    "surface": "/doc/[id]", "width": "1440", "scroll_state": "top", "flag": "both",
    "title": "Pre-work spreads have no region DOM to index at all",
    "observation": "The proposal doc renders zero [data-region-head] and zero [data-index-region] elements — confirmed twice by direct DOM query. Its content ('PROPOSAL · WITH THE CLIENT', 'Sent Aug 27 · not opened yet', 'SCOPE & ENGAGEMENT · CORE · STAGE 03') is inline in page.tsx, head at :2006.",
    "why_it_blocks": "orientation", "frame_cost_estimate": 657,
    "evidence": { "shots": ["w1440-prework-s0.png","w1440-prework-s1.png"], "refs": ["apps/designer-portal/src/lib/document/document-index.ts:81", "apps/designer-portal/src/app/(document)/doc/[id]/page.tsx:2006"] },
    "severity": "high", "confidence": 0.95, "already_ruled": "",
    "suggested_fix": "Indexing pre-work means first wrapping four spreads' bodies in real regions inside page.tsx — structure, not a data change.",
    "hesitation_seconds_estimate": 30 },

  { "id": "E1-11", "lens": "E1", "persona": null, "task_ids": ["T4","T5","T6"],
    "key": "doc|1280|all|56px-rail-already-breaks-words-mid-word",
    "surface": "/doc/[id]", "width": "1280", "scroll_state": "all", "flag": "both",
    "title": "The 56px rail already breaks words; no room for the index",
    "observation": "The compact rail prints the active caption as 'Project / ACTIV / E' and the timer as 'In / hand / 21m' — break-words at a ~44px content box (56px minus px-1.5). The index's 13px label plus 11px mono value cannot fit there.",
    "why_it_blocks": "crowding", "frame_cost_estimate": 296,
    "evidence": { "shots": ["w1280-spine-glyph-rail.png","w1280-rich-s0.png"], "refs": ["apps/designer-portal/src/components/document/doc-spine.tsx:44", "apps/designer-portal/src/components/document/spine-running-index.tsx:97"] },
    "severity": "high", "confidence": 0.9, "already_ruled": "",
    "suggested_fix": "At 1280 print a position-only reading line with tick stops and return the labels on press, not on hover.",
    "hesitation_seconds_estimate": 12 },

  { "id": "E1-12", "lens": "E1", "persona": null, "task_ids": ["T4","T11"],
    "key": "doc|1280|all|two-e2e-files-pin-the-rail-to-the-pixel",
    "surface": "/doc/[id]", "width": "1280", "scroll_state": "all", "flag": "both",
    "title": "Two e2e files pin the rail width to the pixel",
    "observation": "quiet-responsive-shell.spec.ts:224-228 asserts the spine boundingBox width is 55-57px; quiet-release-contracts.spec.ts:108-118 asserts the same with bounds [0,56], and :150-158 pins paper [200,1208] / margin [1208,1440] at 1440. shelf-panel.test.tsx:145 pins min-[1440px]:left-[200px].",
    "why_it_blocks": "orientation", "frame_cost_estimate": 296,
    "evidence": { "shots": ["w1280-spine-glyph-rail.png"], "refs": ["apps/designer-portal/e2e/document/quiet-responsive-shell.spec.ts:224", "apps/designer-portal/e2e/document/quiet-release-contracts.spec.ts:108", "apps/designer-portal/src/components/document/shelves/shelf-panel.test.tsx:145"] },
    "severity": "medium", "confidence": 0.9, "already_ruled": "",
    "suggested_fix": "Treat any rail widening as a weeks-band change touching two pixel-bound e2e specs and the shelf panel's left offset.",
    "hesitation_seconds_estimate": 0 },

  { "id": "E1-13", "lens": "E1", "persona": null, "task_ids": ["T3","T4"],
    "key": "doc|all|all|1500-char-regex-passes-on-a-comment",
    "surface": "/doc/[id]", "width": "all", "scroll_state": "all", "flag": "both",
    "title": "The 1500-char regex currently passes on a comment",
    "observation": "Measured: the real `data-active-section` attribute (page.tsx:1942) is 1128 chars from `<SectionStageLineMount` (:1964) — 372 chars of headroom, not 600. A comment at :1962 containing the literal 'data-active-section>' matches at 162 chars, so the test passes on prose.",
    "why_it_blocks": "information-loss", "frame_cost_estimate": 810,
    "evidence": { "shots": [], "refs": ["apps/designer-portal/src/lib/document/__tests__/stage2-approval-cutover-contract.test.ts:19", "apps/designer-portal/src/app/(document)/doc/[id]/page.tsx:1942", "apps/designer-portal/src/app/(document)/doc/[id]/page.tsx:1962"] },
    "severity": "high", "confidence": 0.95, "already_ruled": "",
    "suggested_fix": "Delete the character-count regex; assert in the DOM that SectionStageLineMount is the first element child of [data-active-section].",
    "hesitation_seconds_estimate": 0 },

  { "id": "E1-14", "lens": "E1", "persona": null, "task_ids": ["T3","T4"],
    "key": "doc|all|seam|condensing-seam-has-zero-shadow-budget",
    "surface": "/doc/[id]", "width": "all", "scroll_state": "seam", "flag": "both",
    "title": "A condensing seam gets zero shadow budget",
    "observation": "shadow-gate.test.ts allows one box-shadow in globals.css spent only by .doc-elevated (:80-95), fails on any new shadow under src/ (:97-105), and caps .doc-elevated at three TSX files (:129-136) — already spent on studio-drawer, margin-item and doc-sheet.",
    "why_it_blocks": "crowding", "frame_cost_estimate": 64,
    "evidence": { "shots": ["w1440-ticket-seam.png"], "refs": ["apps/designer-portal/src/lib/document/__tests__/shadow-gate.test.ts:129", "apps/designer-portal/src/app/globals.css:294"] },
    "severity": "medium", "confidence": 0.95, "already_ruled": "D4",
    "suggested_fix": "Separate the pinned seam from the paper with a rule weight or the paper/rail-stock value step, never depth.",
    "hesitation_seconds_estimate": 0 },

  { "id": "E1-15", "lens": "E1", "persona": null, "task_ids": ["T4","T11"],
    "key": "doc|1440|all|contrast-gate-hardcodes-five-spine-filenames",
    "surface": "/doc/[id]", "width": "1440", "scroll_state": "all", "flag": "both",
    "title": "Contrast gate hard-codes five spine filenames",
    "observation": "contrast.test.ts:313-341 scans exactly spine-running-index.tsx, spine-shelved-blocks.tsx, spine-timer.tsx, doc-spine.tsx and margin-rail.tsx. Renaming, splitting or extracting any of them drops it from the scan with no failure — the test stays green and stops testing.",
    "why_it_blocks": "information-loss", "frame_cost_estimate": 200,
    "evidence": { "shots": ["w1440-spine-full.png"], "refs": ["apps/designer-portal/src/lib/document/__tests__/contrast.test.ts:313"] },
    "severity": "medium", "confidence": 0.9, "already_ruled": "",
    "suggested_fix": "Make the scan a glob over components/document/spine-*.tsx plus margin-rail.tsx before any spine refactor lands.",
    "hesitation_seconds_estimate": 0 },

  { "id": "E1-16", "lens": "E1", "persona": null, "task_ids": ["T4","T9"],
    "key": "doc|1440|mid|no-contrast-gate-covers-reduced-ink-on-paper",
    "surface": "/doc/[id]", "width": "1440", "scroll_state": "mid", "flag": "both",
    "title": "No contrast gate covers reduced ink on paper",
    "observation": "contrast.test.ts gates the rail stock #E8E3DB and rail inks (:297-311) but nothing on paper #FCFAF6. Computed for the record: the muted ramp's lightest step #65594E on paper is 6.5:1, roughly one lightening step above the 4.5:1 floor.",
    "why_it_blocks": "information-loss", "frame_cost_estimate": 700,
    "evidence": { "shots": ["w1440-rich-s2.png"], "refs": ["apps/designer-portal/src/lib/document/__tests__/contrast.test.ts:305"] },
    "severity": "medium", "confidence": 0.85, "already_ruled": "R126",
    "suggested_fix": "Extend contrast.test.ts to gate every condensed-density ink pair against #FCFAF6 at 4.5:1 before shipping reduced ink.",
    "hesitation_seconds_estimate": 0 },

  { "id": "E1-17", "lens": "E1", "persona": null, "task_ids": ["T4","T8"],
    "key": "doc|all|mid|density-must-not-be-a-react-transition",
    "surface": "/doc/[id]", "width": "all", "scroll_state": "mid", "flag": "both",
    "title": "Density must not be a React transition",
    "observation": "The whole document tree contains zero startTransition/useTransition calls (only an unrelated mutation-hook name in rooms/piece/custom-commission-sheet.tsx). A transition yields and can be interrupted; a density lagging scroll by frames reads as the paper catching up.",
    "why_it_blocks": "motion", "frame_cost_estimate": 283,
    "evidence": { "shots": [], "refs": ["apps/designer-portal/src/components/document/region/use-region-fold.ts:90", "apps/designer-portal/src/hooks/use-document-running-index.ts:136"] },
    "severity": "medium", "confidence": 0.8, "already_ruled": "",
    "suggested_fix": "Write density as a DOM data-attribute imperatively in the rAF scroll handler; let CSS carry it and React re-render nothing.",
    "hesitation_seconds_estimate": 0 },

  { "id": "E1-18", "lens": "E1", "persona": null, "task_ids": ["T4","T10"],
    "key": "doc|all|mid|fold-voices-have-no-slot-for-a-position-voice",
    "surface": "/doc/[id]", "width": "all", "scroll_state": "mid", "flag": "both",
    "title": "The three fold voices have no non-persisting slot",
    "observation": "`folded = forceOpen ? false : (explicit ?? latchedDefault ?? false)` (use-region-fold.ts:121). Every path that changes folded either writes localStorage (setFolded, :129-135) or is a caller prop. A scroll-driven fold would therefore persist a state the designer never chose.",
    "why_it_blocks": "information-loss", "frame_cost_estimate": 470,
    "evidence": { "shots": ["w1440-fold-seam-folded.png"], "refs": ["apps/designer-portal/src/components/document/region/use-region-fold.ts:121", "apps/designer-portal/src/components/document/region/use-region-fold.ts:129"] },
    "severity": "high", "confidence": 0.9, "already_ruled": "",
    "suggested_fix": "Add a fourth, lowest, non-persisting voice that may only move full<->reduced and never to folded.",
    "hesitation_seconds_estimate": 0 },

  { "id": "E1-19", "lens": "E1", "persona": null, "task_ids": ["T1","T9"],
    "key": "doc|1280|all|studio-drawer-labels-collide-at-1280",
    "surface": "/doc/[id]", "width": "1280", "scroll_state": "all", "flag": "both",
    "title": "Studio drawer labels overlap each other at 1280",
    "observation": "At 1280 the drawer strip prints 'Find anything' and 'IN HAND TODAY' overlapping in the same glyph run; at 1440 they are separate. The strip is always present at every scroll state, so the collision is permanent chrome, not a scroll artefact.",
    "why_it_blocks": "crowding", "frame_cost_estimate": 60,
    "evidence": { "shots": ["w1280-rich-s0.png","w1280-rich-s1.png"], "refs": ["apps/designer-portal/src/components/document/studio-drawer.tsx:289"] },
    "severity": "medium", "confidence": 0.8, "already_ruled": "D8",
    "suggested_fix": "Drop or truncate one drawer zone below 1440 rather than letting two labels share the same run.",
    "hesitation_seconds_estimate": 5 },

  { "id": "E1-20", "lens": "E1", "persona": null, "task_ids": ["T1","T11"],
    "key": "doc|390|all|desk-doorway-avatar-covers-the-bar-label",
    "surface": "/doc/[id]", "width": "390", "scroll_state": "all", "flag": "both",
    "title": "The desk-doorway coin covers the mobile bar's left label",
    "observation": "At 390 the round avatar sits over the bar's left zone so 'IN THIS DOCUMENT' reads as 'TN THIS / DOCUMENT'. Same overlay covers the 'PATINA' wordmark at 1440/1280 ('N | INA'). Frame cost normalised to the 844 frame: the bar is 76.9px tall.",
    "why_it_blocks": "crowding", "frame_cost_estimate": 77,
    "evidence": { "shots": ["m390-mobile-bar.png","m390-rich-s0.png"], "refs": ["apps/designer-portal/src/app/(document)/layout.tsx:108", "apps/designer-portal/src/components/document/mobile/mobile-bar.tsx:216"] },
    "severity": "medium", "confidence": 0.6, "already_ruled": "D3",
    "suggested_fix": "Give the doorway coin its own reserved gutter in the bar's left zone instead of stacking it over the label.",
    "hesitation_seconds_estimate": 6 },

  { "id": "E1-21", "lens": "E1", "persona": null, "task_ids": ["T3","T5"],
    "key": "doc|all|seam|reader-fold-is-destroyed-on-every-pin-change",
    "surface": "/doc/[id]", "width": "all", "scroll_state": "seam", "flag": "both",
    "title": "The reader's Unfold is destroyed on every pin change",
    "observation": "`setFold(null)` runs in the effect keyed on [pinned] (job-ticket.tsx:236). A designer who presses 'UNFOLD ↓' while pinned loses that choice the moment she scrolls back above the sentinel; the ticket re-derives from `!pinned && !seamAtRest`.",
    "why_it_blocks": "motion", "frame_cost_estimate": 283,
    "evidence": { "shots": ["w1440-ticket-seam.png"], "refs": ["apps/designer-portal/src/components/document/job-ticket.tsx:235", "apps/designer-portal/src/components/document/job-ticket.tsx:244"] },
    "severity": "medium", "confidence": 0.9, "already_ruled": "",
    "suggested_fix": "A lens that condenses on scroll must decide whether her explicit expand outranks position; today it does not.",
    "hesitation_seconds_estimate": 15 },

  { "id": "E1-22", "lens": "E1", "persona": null, "task_ids": ["T4","T9"],
    "key": "doc|all|mid|folding-a-region-drops-focus-to-body",
    "surface": "/doc/[id]", "width": "all", "scroll_state": "mid", "flag": "both",
    "title": "Folding a region drops focus to body with no redirect",
    "observation": "Measured: focus started on 'Sync from the schedule' inside #money-region-body; after Fold the body is null and document.activeElement is <body>. Unfolding is disciplined (focus lands on <h2 id='money-region-heading'>); folding has no equivalent.",
    "why_it_blocks": "orientation", "frame_cost_estimate": 470,
    "evidence": { "shots": ["w1440-fold-seam-folded.png"], "refs": ["apps/designer-portal/src/components/document/region/fold-seam.tsx:41", "apps/designer-portal/src/components/document/region/use-region-fold.ts:121"] },
    "severity": "high", "confidence": 0.9, "already_ruled": "",
    "suggested_fix": "Park focus on the fold seam when a body unmounts; a scroll-driven density must never move focus at all.",
    "hesitation_seconds_estimate": 25 },

  { "id": "E1-23", "lens": "E1", "persona": null, "task_ids": ["T4","T10"],
    "key": "doc|1440|mid|cls-already-needs-improvement-before-any-lens",
    "surface": "/doc/[id]", "width": "1440", "scroll_state": "mid", "flag": "both",
    "title": "CLS is already 0.13 before any lens motion is added",
    "observation": "Normal motion CLS total 0.1286 (20 entries); reduced motion 0.1318 (8 entries). One shift of 0.1189 dominates both, at ~3.3-3.6s, attributed to the Schedule 'needs attention' banner and 'No active phase ha[s started]' arriving from a query.",
    "why_it_blocks": "motion", "frame_cost_estimate": 240,
    "evidence": { "shots": ["w1440-rich-s1.png"], "refs": ["apps/designer-portal/src/components/document/schedule/schedule-rule-region.tsx:181"] },
    "severity": "medium", "confidence": 0.85, "already_ruled": "",
    "suggested_fix": "Reserve the Schedule banner's height before the query resolves; a lens inherits this shift and will be blamed for it.",
    "hesitation_seconds_estimate": 3 },

  { "id": "E1-24", "lens": "E1", "persona": null, "task_ids": ["T7","T12"],
    "key": "doc|1440|top|condense-a-region-has-no-subject-on-four-spreads",
    "surface": "/doc/[id]", "width": "1440", "scroll_state": "top", "flag": "both",
    "title": "Condensing a region has no subject on four of seven spreads",
    "observation": "paperRegionsForSection returns [] for brief, discovery, direction and proposal (document-index.ts:81), and those spreads render no region roots. Prework rail ink is 13.9% at 1440 with a 657px longest empty run; the frame budget reads 6.7 / 79.9 / 2.8.",
    "why_it_blocks": "orientation", "frame_cost_estimate": 700,
    "evidence": { "shots": ["w1440-prework-s0.png"], "refs": ["apps/designer-portal/src/lib/document/document-index.ts:76", "apps/designer-portal/src/components/document/__tests__/shelved-spine.test.tsx:155"] },
    "severity": "high", "confidence": 0.9, "already_ruled": "",
    "suggested_fix": "Price the pre-work spreads as new structure, and name whether an index row may print with no value behind it.",
    "hesitation_seconds_estimate": 40 },

  { "id": "E1-25", "lens": "E1", "persona": null, "task_ids": ["T3"],
    "key": "doc|390|seam|seam-height-is-content-dependent-not-a-constant",
    "surface": "/doc/[id]", "width": "390", "scroll_state": "seam", "flag": "both",
    "title": "Seam height is content-dependent, not a constant",
    "observation": "The publish effect's deps are [pinned, unfolded, seam.identity, seam.exceptions] (job-ticket.tsx:258). At 390 the seam prints 'THE JOB · PROJECT' over '$6,200 owed you · 3 unspecified' with 'UNFOLD ↓' sharing the second line; a two-exception seam is taller again. Frame normalised to 844.",
    "why_it_blocks": "information-loss", "frame_cost_estimate": 64,
    "evidence": { "shots": ["m390-rich-s1.png"], "refs": ["apps/designer-portal/src/components/document/job-ticket.tsx:248", "apps/designer-portal/src/lib/document/ticket-derivation.ts:826"] },
    "severity": "high", "confidence": 0.85, "already_ruled": "",
    "suggested_fix": "Interpolate between two measured endpoints via ResizeObserver, never between two hard-coded pixel values.",
    "hesitation_seconds_estimate": 0 },

  { "id": "E1-26", "lens": "E1", "persona": null, "task_ids": ["T3","T4"],
    "key": "doc|all|seam|reduced-motion-hook-has-no-document-consumer",
    "surface": "/doc/[id]", "width": "all", "scroll_state": "seam", "flag": "both",
    "title": "The reduced-motion hook starts false and has no document consumer",
    "observation": "hooks/useReducedMotion.ts starts state false (:4) and corrects in an effect (:7-10). No file under components/document imports it — the Document's motion policy is CSS media queries only (9 reduce blocks plus one no-preference gate in globals.css).",
    "why_it_blocks": "motion", "frame_cost_estimate": 283,
    "evidence": { "shots": ["w1440-rich-s1-reduced.png"], "refs": ["apps/designer-portal/src/hooks/useReducedMotion.ts:4", "apps/designer-portal/src/app/globals.css:429"] },
    "severity": "medium", "confidence": 0.85, "already_ruled": "R15",
    "suggested_fix": "Keep the lens's reduced-motion contract in CSS; any JS gate inherits one render of wrong answer on first paint.",
    "hesitation_seconds_estimate": 0 },

  { "id": "E1-27", "lens": "E1", "persona": null, "task_ids": ["T3","T5","T6"],
    "key": "doc|all|seam|e2e-pins-ticket-rows-to-exactly-eight",
    "surface": "/doc/[id]", "width": "all", "scroll_state": "seam", "flag": "both",
    "title": "E2E pins the ticket to exactly eight rows at three widths",
    "observation": "quiet-responsive-shell.spec.ts asserts toHaveCount(8) at 1440 (:173-176) and at 1280 and 390 (:183-196); responsive-document-shell.test.tsx:655-687 asserts 8 rows plus data-unfolded='true' at 1440. Any intermediate header density showing fewer rows is a red e2e.",
    "why_it_blocks": "information-loss", "frame_cost_estimate": 287,
    "evidence": { "shots": ["w1440-ticket-unfolded.png"], "refs": ["apps/designer-portal/e2e/document/quiet-responsive-shell.spec.ts:173", "apps/designer-portal/src/components/document/__tests__/responsive-document-shell.test.tsx:655"] },
    "severity": "medium", "confidence": 0.9, "already_ruled": "",
    "suggested_fix": "Rewrite the count assertions as 'the rows this state promises', keyed off a data attribute the lens publishes.",
    "hesitation_seconds_estimate": 0 },

  { "id": "E1-28", "lens": "E1", "persona": null, "task_ids": ["T4","T9"],
    "key": "doc|all|mid|jump-lock-and-condensation-are-uncoupled",
    "surface": "/doc/[id]", "width": "all", "scroll_state": "mid", "flag": "both",
    "title": "The 700ms jump lock does not own the seam's height",
    "observation": "JUMP_LOCK_MS 700 (use-document-running-index.ts:35) holds the reading line through a smooth scroll but says nothing about the seam. Measured: four index clicks show zero flicker on the line — the lock works, and it is the only place a lens could freeze the seam.",
    "why_it_blocks": "orientation", "frame_cost_estimate": 283,
    "evidence": { "shots": ["w1440-spine-running-index-mid.png"], "refs": ["apps/designer-portal/src/hooks/use-document-running-index.ts:35", "apps/designer-portal/src/hooks/use-document-running-index.ts:166"] },
    "severity": "high", "confidence": 0.85, "already_ruled": "",
    "suggested_fix": "Extend the jump lock to pin the seam at its condensed floor for its whole duration, so landings are computed once.",
    "hesitation_seconds_estimate": 0 }
]
```

---

## 8. What stays true

Five things already work and a lens must not break them.

1. **The seam variable has exactly one writer.** `job-ticket.tsx:248-259` is the only site
   that sets `--doc-seam-height`; three CSS readers and one inline-style reader consume it.
   That single-writer discipline is why the pinned glance and every region landing agree
   today. Whatever the lens does, it must keep one writer.

2. **`scrollToRegion` is one copy, used by two callers.** `use-document-running-index.ts:202-222`
   is exported precisely so the ticket's row doors and the running index cannot drift
   (`job-ticket.tsx:198-201`). Confirmed behaviourally: four index clicks, zero flicker, the
   line snapping straight to the target and holding through the full 700ms lock. Do not
   grow a second landing path.

3. **The latch in `use-region-fold`.** `latchedDefault` (`:104-119`) exists so a query that
   resolves after first paint cannot yank a region shut under the designer's hand. That
   hazard does not go away under a lens — it gets worse, because a density default derived
   from data will arrive late too. Keep the latch.

4. **Unfolding lands focus on the region heading.** `focusRegionHeading` /
   `scrollToRegion`'s `heading.focus({preventScroll:true})` is verified working: after
   unfolding Money, focus is exactly on `<h2 id="money-region-heading">`. That is the one
   fully correct focus behaviour in the disclosure system and the model for everything else.

5. **The two shipped gates are real gates.** `shadow-gate.test.ts` catches shadows at the CSS
   level, which the D4 ESLint rules never covered, and `contrast.test.ts` pins the rail stock
   and its inks. Their coverage has holes (E1-15, E1-16), but they are the only mechanical
   enforcement of NG2 and NG4 in the tree. Extend them; never route around them.

6. **The margin sheet at 1280 costs no reflow.** Measured: the first region head's Y is
   1005.3125px before and after opening the sheet, bit-for-bit, and Escape returns focus to
   the trigger. Overlay-not-column is the correct pattern at that tier and a lens should
   reuse it rather than reinvent it.
