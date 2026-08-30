# W4 · fix log

**Lane** `document-lens/w4-fix`, worktree `.codex/worktrees/agent-lens-w4-fix`.
**Base** `a13acb16c` — the reviewed HEAD (`origin/document-lens/w4` was behind at
`b239064e0`; local `document-lens/w4` carried the `w4-l4` follow-up merge and the fling
census, both of which the two reviews and the item list depend on, so the lane is based on
the tip the reviewers actually read).
**Sources** `w4-review-correctness.md` (W4-C1…C10 + 13 minors + 10 nits), `w4-review-fidelity.md`
(F1…F6), `design/reconciliation.md` **W4-R1**, `design/technical-design.md` §3/§5/OD-4/OD-12/OD-14/C-8,
`design/deviations.md`, `proposal.md` §3 L-4/L-5, and the coordinator's items 12–16 from the
integration lane's re-run.

The lane did not write Wave 4 and did not review it.

---

## Commits

| sha | subject |
|---|---|
| `c04d7c773` | W4-C1/C2/C4/C8/C18/C19/C21 — the lens CSS and its instruments read the PAPER |
| `34a7a4a0e` | W4-C5/C6/C10/C11/C12/C13/C14/C20/C22 — the lens hook holds its own invariants |
| `b2dd43341` | W4-R1 / F1–F3, W4-C9/C15/C16/C17/C23 — a quiet stop prints its head, and only its head |
| `d4b7d0570` | W4-C9 — spec-book-leaf drives the real density store too |
| `5e79b47c7` | items 12–14/16 — content-visibility is the CLS, and boundingBox is not the box |
| `1a47c1b3a` | item 15 — the sections door stops churning under the reader's thumb |
| `f76ba828a` | F6 — name both owners of `data-density`, and the case where each is absent |

`git diff --stat a13acb16c..HEAD` → **41 files, +1708 / −465**.

---

## Per id

| id | sha | what shipped | evidence |
|---|---|---|---|
| **W4-C1** | `c04d7c773` | Both `[data-index-region]` rules scoped `[data-document-paper]` — the OD-12 reserve AND the pre-existing scroll-margin landing rule, which leaked the same way. New gate `src/lib/document/__tests__/lens-css-scope.test.ts` (5 cases) greps `globals.css`. | Every ladder stop now computes **`min-block-size: 0px`** (browser census at 1440; the rule no longer matches the rail at all), six stop rows at **39.9px** each. The gate was proven non-vacuous by reverting the scope: 2 of its cases go red and name `globals.css:1104`. |
| **W4-C2 / W4-C4** | `c04d7c773` | Four unscoped queries paper-scoped: `lens-density.spec.ts` ×3 (two density reads + the `offsetTop` instrument) and `helpers/lens.ts`'s landing-density read; `blankPaperCensus`'s `closest()` walk now requires the paper too. | `grep` finds no unscoped `[data-index-region=` left; the three density reads now return real values (they were structurally `null` before), and the density crossing test — which "could never pass" — passes in both engines. |
| **W4-C5** | `34a7a4a0e` | (a) `EDITABLE_SELECTOR` is text entry only, written as exclusions so an `input` with a novel/invalid `type` still counts; `plaintext-only` added. (b) `freeze(false)` queues a frame when already settled. | 6 new `use-lens-state` cases (checkbox/radio/select/submit never enter `editing`; `freeze` never called for a checkbox; number + plaintext-only do). The case asserting the defect ("Unfreezing commits nothing by itself") is replaced by two: thaw-at-rest commits on the next frame, thaw-mid-scroll leaves it to the armed settle. |
| **W4-C6** | `34a7a4a0e` | The MutationObserver stays on `document.body` for the hook's life; the paper retarget is gone. | New case "re-discovers when the paper element itself is replaced" — removes the paper, mounts a new one under the shell with a root above the frame, asserts `data-density="full"` + `data-passed`. Red against the retargeting version. |
| **W4-C7** | `b2dd43341` | `schedule-spine.tsx` and `previous-work.tsx` put the body id on the quiet wrapper, as approvals/money/FF&E already do (chosen over omitting `aria-controls`: it is the form the four correct organs use, and omission would have diverged six bodies into two shapes). | A new case in each suite walks **every** `[aria-controls]` in the quiet render and resolves it with `getElementById`. |
| **W4-C8** | `c04d7c773`, then `5e79b47c7` | First: a dedicated `--doc-passed-reserve` (112px on `:root`, shadowed by nothing) replacing `var(--doc-quiet-reserve, 112px)`, whose fallback was unreachable. Then the whole block was **deleted** — see item 12. | The 68-vs-112 finding is recorded in **D-B33**; `--doc-passed-reserve` stays declared and unspent, and the gate asserts it. |
| **W4-C9** | `b2dd43341`, `d4b7d0570` | All **15** suites stopped mocking `useLensDensityStore` away. `use-lens-density.ts` exports `__setDensityForTest(density)`, read by `densityFor` alone; the suites drive the real two-slot hook. | 15 files, 0 remaining `jest.mock('@/hooks/use-lens-density'…)`. Post-render calls are wrapped in `act()` (the store's `notify()` is a real React state update — one suite surfaced the warning immediately). |
| **W4-C10** | `34a7a4a0e` | A key leaves `promotedKeys` (with a `notify`) when its last connected root leaves the paper; the `promotedKeys.has(key)` promotion arm is dropped, leaving `withinLookahead`. | Two new cases: a key is forgotten when the paper is emptied and a fresh root 4000px down stays quiet; a root React re-creates *where its predecessor was* is still promoted (the legitimate half of D-B16). |
| **Minors** | | | |
| W4-C11 | `34a7a4a0e` | `forceFullThrough` returns when the target is not in `ordered` instead of flushing the whole paper. | — |
| W4-C12 | `34a7a4a0e` | `releaseWaiting(reason?)`; teardown **rejects** with a named error rather than resolving `true`. | — |
| W4-C13 | `34a7a4a0e` | `clearStore()` notifies every key it clears. | — |
| W4-C14 | `34a7a4a0e` | `markPassed()` returns early when `!enabled` — D-B17's measurement made literal. | — |
| W4-C15 | `b2dd43341` | Moot: `data-region-count-line` is gone from all six under W4-R1. | `grep` finds none in `src/` or `e2e/`. |
| W4-C16 | `b2dd43341` | Every quiet root prints head + status + sr-only (the status line's `Nothing yet` fallback guarantees text); `previous-work` states `full` at count 0. | The zero-count case now asserts `data-density="full"`. |
| W4-C17 | `b2dd43341` | Care's three whole-paragraph branches `forceOpen`, mirroring D-B27. **The reviewer's `!indexRoot` arm was dropped**: a non-index mount spreads no attributes at all, so it has no untruthful density — and including it took away her own fold on the second `CareBand` mount (a suite caught it). | `care-band.test.tsx` green including the manual-fold round-trip. |
| W4-C18 | `c04d7c773` | `settle()`'s silent third tier deleted; `assertLensBuild()` **waits** for `window.__lensSettled` and fails with D-B28.5's message on timeout. Waits rather than reads once — a caller that settles before hydration is not a broken build (found immediately by a probe). | — |
| W4-C19 | `c04d7c773` | The deep-landed case asserts invariant (ii). | Green in both engines. |
| W4-C20 | `34a7a4a0e` | `jump` deleted from `useDocumentRunningIndex` and from its interface. Its three cases were repointed at `requestRegionUnfold`, which is the half of the press this hook actually owns (it arms the reading line's lock); the first case was rewritten to say so. | 13/13 in that suite. |
| W4-C21 | `c04d7c773` | A headless quiet root classifies as `content`. | Fling census `blank=0` in both engines. |
| W4-C22 | `34a7a4a0e` | The late-shell test builds `shell > main[data-document-paper]` and appends the SHELL to the body. | — |
| W4-C23 | `b2dd43341` | The 40-char cap drops whole `·` segments; a single over-long segment is kept whole. Lives once, in `lens-quiet-status.ts`. | Two dedicated cases. |
| **Nits** | | | |
| empty `data-index-region` | `34a7a4a0e` | A root with an empty key is skipped, not stored under `''`. | — |
| `queueFrame` on empty callbacks | `34a7a4a0e` | Only queues when an entry was actually added. | — |
| `plaintext-only` | `34a7a4a0e` | Matched, and tested. | — |
| sheets never enter `editing` | — | **No change**, logged as **D-B36**. It follows D-B19's wording exactly; the paper does not move under a fixed overlay, so the risk is a region promoting *behind* an open sheet — real, but not what D-B19 measured, and a ruling rather than a fix. | |
| OD-4 narrower selector | — | Moot: the rule is deleted (D-B33). | |
| `mobile-sheets` optional chain | `34a7a4a0e` | `onJumpRegion` is now **required** on `MobileActiveDoc`, so a press cannot be a silent no-op. | |
| `resolvePaper`'s `paperRef` arms | `34a7a4a0e` | Covered — a parameterised case for `matches` / `querySelector` / `closest`. | |
| money's redundant `usePurchaseOrders` | `b2dd43341` | Deleted with the PO count that was its only reader. | |
| `use-lens-state:82` one-commit `rest` at 390 | — | **No change.** Imperative, pre-paint, no hydration risk; the reviewer says so. Changing it would mean reading `matchMedia` in a ref callback, which is a layout read in a paint-critical path for one frame of an attribute nothing renders from. | |
| `page.tsx` `flushSync` + `closeSheet` ordering | — | **No change.** The order comes out right and the reviewer confirms it; making it explicit means sequencing the sheet's focus-restore against the region's, which is a behaviour change no ruling asks for. | |
| **Fidelity** | | | |
| F1/F2/F3 | `b2dd43341` | See "W4-R1" below. | |
| F4 | — | Folded into **D-B33** (the block it described is deleted; the 68-vs-112 measurement is kept there). | |
| F5 | — | §5's DOM table gains `data-sections-door` and a note that **no other attribute joins from Wave 4** — `data-region-count-line` went with the paragraph. `test-impact.md` never carried the attribute, so nothing was removed there. | |
| F6 | `f76ba828a` | **Both owners kept**, with the case where each is absent named in §5's table and in the two region comments that overstated it. | |

---

## W4-R1 — what a quiet stop prints (F1/F2/F3)

The six invented `<p data-region-count-line>` uppercase paragraphs are deleted. The count line
**is** `RegionHead`'s status line: the head takes the ratified per-region string through its
existing `status` prop while quiet and keeps today's sentence at full.

`src/lib/document/lens-quiet-status.ts` (new, 191 lines, 20 unit cases) owns the six shapes, the
missing-fact rule (a segment with no fact drops **with its separator**; no fact at all prints
`Nothing yet`, or `Not known yet` where unknowable), the 40-char whole-segment cap (W4-C23), and
`quietStateSentence`. It sits beside `lens-ladder-derivation.ts` rather than inside it because the
rail prints a *different register of the same facts* at a different tier — OD-14 keeps the weekday
(`Install Tue Sep 15`), W4-R1's paper form drops it (`Install Sep 19 · 3 weeks out`). Two
printings, two contracts, one set of facts, which the callers supply.

**F3** — `RegionHead` gains `actsAtQuiet: 'all' | 'leader'`. At quiet only entry 0 renders. The
overflow entries are **not rendered** rather than rendered inert (`aria-hidden` + untabbable, which
W4-R1's text suggests): `DocumentActionGroup`'s one-leader guard and `action-visibility.spec.ts`
both COUNT `[data-action-key]` nodes, so an inert copy would still be one of them, and absence is
strictly stronger than hiding. The Fold toggle is **not** one of these — it is the region's own
disclosure control, rendered by the head rather than passed in `actions`, and it carries the
`aria-controls` W4-C7 requires to keep naming a mounted body.

### Two places the lane read W4-R1 and had to choose

1. **The approvals sr-only line.** W4-R1's *rule* is fixed — "`<the status line's FIRST segment> ·
   not yet on the paper · press <Name> on the index to open`" — and five of the six table rows
   follow it exactly. The approvals row shows `3 awaiting · …` where the status line's first
   segment is `3 awaiting the client`. The lane followed the **rule** (one implementation for all
   six) and ships `3 awaiting the client · not yet on the paper · press Client approvals on the
   index to open`. If the lead meant the table cell literally, it is a two-word change in
   `quietStateSentence`'s caller. **Flagged for ruling.**
2. **The approvals counts are disjoint.** `page.tsx` passes the rail `awaiting = unsettled −
   overdue`, and W4-R1's example (`3 awaiting the client · 2 overdue`) matches that. The region's
   own `openCount` includes the overdue ones, so the quiet status subtracts. Same numbers as the
   rail, by construction.

---

## Items 12–16 (the integration lane's re-run)

### Item 12 · CLS 0.942 → the paper is 0

`content-visibility: auto` on `[data-passed]` is **99.9 % of it.** One declaration removed, nothing
else changed, chromium 1440×900, the 30-step settled scroll from the settled+quiet s0:

| | CLS (scroll) |
|---|---|
| with the block | **0.8657658230921531** |
| with only `content-visibility: auto` removed | **0.0009864163706168553** |
| with `data-passed` deferred 2 frames past the promotion, block intact | **0.8657658230921531** — *identical, to the digit* |

The two shifts the log named are the property **toggling**, not a missing reserve:

- **step 9** — a folded region's `FoldSeam` subtree (`button.fold-settle`, the pointer-events
  overlay, the `h-3` rule) collapsing its `section.mt-[var(--doc-region-gap)]` from **219.73px →
  40.94px** and back, 0.078 each way. Not "a quiet reserve on the section root": the section is not
  a `[data-index-region]` and its 40.94px is below any 68px floor. The children go to zero rects,
  which is what a skipped subtree reports.
- **step 24** — four `li#ffe-selection-…` rows zeroing and returning inside `section#project-ffe`,
  **0.3534 + 0.3554**. Not rows arriving from a query: they are present, skipped, and present
  again.

`contain-intrinsic-size: auto <length>` was already the remembering form, so the deferral
experiment (give the engine a real last-remembered size before it may ever skip) was the honest
test of "reserve its height" — and it moved nothing.

**Taken: OD-4's own pre-agreed failure move** — "DELETE this block and log the finding in
`deviations.md` as an 'OD-4 fallback candidate' — never a CSS change that tries to keep both."
Logged **D-B33**, with the whole measurement kept in `globals.css` where the block stood.
`--doc-passed-reserve` stays declared and unspent. `lens-css-scope.test.ts` fails if any
`content-visibility` declaration returns. **The find-in-page gate passes either way** — it was
never what failed, and OD-4's benefit was never demonstrated on this paper.

**The 0.000986 that remained is all chrome** — five rail `div[--seg-floor]` segments resizing and
two `min-h-[27px]` room rungs swapping by 28.5px as the reading index crosses a stop (which is
OD-14 working), plus the band's line-2 `p` moving 7.7px *inside* a band whose height is the
declared 56px constant. `lens-cls.spec.ts` now classifies each entry by its sources and sums the
two separately: **the paper is gated at exactly 0 and measures 0 in both motion modes**; the
chrome's number is printed every run. **That scoping is a ruling, not an engineering call —
logged D-B34 and flagged for the design lead**: putting the chrome inside the 0 means OD-14's
per-stop rungs must reserve their space, which is a print change the mockup governs.

### Item 13 · the region-top invariants

`lens-density:163` (`ffe`/`money` `offsetTop`) **passes in both engines.** The forward-walk
invariant at `:184` needed its baseline taken at the **quiet** s0, not the merely-settled one: a
late 11px arrives above the first region between the first settle and the next step (measured 315 →
326 with the letterhead at 192.06px and the band at 56px unchanged at both) — a data arrival, which
is exactly what D-B29's own quiet origin exists to exclude.

Two further instrument defects surfaced once W4-C2/C4 made these reads real:

- the crossing test's **bisection** scrolls back up and re-reads a root its own probe already
  promoted; the lens never demotes, so the instrument destroyed the state it measured (it returned
  `[{y:0,full},{y:40,full},{y:80,full}]` on a target the same test had just asserted was quiet at
  s0). Replaced by a single **forward walk** at the reader's own 40px pace, stopping three steps
  past the crossing.
- its **target selection** used distance alone. `data-density` is the FOLD's answer and the lens is
  only its fourth voice, so a region its own data opens (D-B27's FF&E postures) prints `full`
  however far down it sits. The candidate must be beyond the lookahead **and** quiet.

### Item 14 · the band at 1280, and Item 16 · the C-02 act

**Nothing in the CSS.** Probed directly in **chromium and webkit**, at 1440/1280/390:

| | band | line-2 act |
|---|---|---|
| `getBoundingClientRect().height` | **56** | **44** |
| `offsetHeight` | **56** | **44** |
| computed `height` | `56px` | `44px` (`min-height: 44px`) |
| token / transform | `--doc-band-height: 56px`, `box-sizing: border-box` | `transform: none`, `zoom: 1` |
| `locator.boundingBox()` as reported | 55.7204 @1280 (and 55.985 then 56 on two consecutive 1440 runs of an unchanged box) | 43.9895 webkit / 43.6648 chromium |

`boundingBox()` reads compositor quads, and for a `position: sticky` element — the band, and the
act inside it — those carry the compositor's fractional sticky offset. The assertions measure the
**layout** box now (`layoutHeight()`), so `toBe(56)` and `>= 44` hold as written. **No engine
allowance and no `44.5px` floor** were taken: the box was already exactly right, and either would
have hidden a real regression later. The composited figure is still printed beside the layout one.
Logged **D-B35**.

### Item 15 · the sections door

Two halves. The bar's third line (`At <stop>`) was **mounted and unmounted** as the reading index
arrived and changed — A-01 had already ruled the form ("pre-printed and swapped by `visibility`")
and it was not built that way; it is now, `invisible` + `aria-hidden` while there is no stop, inside
the 72px reserve OD-11 sized for three lines. And the spec reached the door by its accessible
**name**, which OD-11/A-01 deliberately makes volatile (`Open sections, at Money`), so the locator
raced the scroll: chromium resolved it then reported it detached, webkit never found it. The door
carries `data-sections-door` and the spec uses it. Both engines green, and with them the six cases
the abort had been hiding.

---

## Gates

```
type-check   0 errors
lint         2 errors — piece-room-save-gate.test.tsx:159, use-commercial-documents.test.ts:930
             (both pre-existing, do-not-touch); 199 warnings, all pre-existing
shadow-gate  PASS   contrast PASS   lens-css-scope PASS (5 cases, new)
```

### Jest reconciliation

| | suites | tests | failing |
|---|---|---|---|
| base `a13acb16c` (`--json`) | 468 | 5481 | 0 |
| `document-lens/w4-fix` | **470** | **5522** | **0** |
| delta | **+2** | **+41** | — |

The +2 suites are `lens-css-scope.test.ts` (5) and `lens-quiet-status.test.ts` (20). The remaining
+16 are the new cases in `use-lens-density.test.tsx` (+3 net), `use-lens-state.test.tsx` (+7),
`previous-work.test.tsx` (+1), `schedule-region-head.test.tsx` (+1), and the four rewritten
count-line cases that became status-line cases (net 0), plus the retired/repointed `jump` cases.

### E2E · `:3010`, this lane's own server (`:3000` never touched)

**chromium — 60 passed, 0 failed, 0 not-run.** `lens-density` · `lens-fling` · `lens-cls` ·
`lens-a11y` · `lens-contrast` · `lens-reduced-motion` · `lens-rail-budget` · `lens-band-height` ·
`quiet-responsive-shell` · `desk-walkthrough`.

**webkit — 31 passed, 0 failed** (2 skipped by the suite's own guards). `lens-density` ·
`lens-fling` · `lens-band-height` · `quiet-responsive-shell`.

**No fixmes were added. The OD-4 webkit find-in-page gate PASSES.**

Numbers printed:

- **fling census** — chromium `46 frames: content=46 blank=0 pre-region=0 post-region=0`;
  webkit `25 frames: content=25 blank=0 pre-region=0 post-region=0`. Landing frame `full`.
- **D-B29 CLS** — scroll (paper) **0** and **0** (no-preference / reduced motion); chrome
  **0.000986** / **0.001001**; initial load 0.0505–0.0620 (buffered, navigation → quiet).
- **D-B28 census** — `readiness fan-out observed before quiet: 0 requests (0 Supabase-origin
  requests total)`. Two non-Supabase image requests during the scroll, reported and not asserted.
- **the rail at 1440 (W4-C1's proof)** — every ladder stop computes **`min-block-size: 0px`**; the
  six stop rows are **39.9px** each; segments `40 / 40 / 40 / 173 (the current reading stop, with
  its rungs) / 40 / 40`; track **372.08px**, ladder **586.54px**. With the leak each stop carried a
  68px floor (≥408px of stops alone). Rail label census: long paper **13 distinct labels (6 stops,
  3 doors), ceiling 13**; pre-work **3, ceiling 4**.
- **band / act** — 56px in all eighteen cells, both engines; line-2 act `46.5625×44px (layout) ·
  44px (composited)`.
- **OD-4 webkit find-in-page** — **PASS**, both engines.

### Two webkit failures that were dev-server artefacts, not defects

Worth recording because they cost real time. `lens-density:163` (`money` offsetTop 7735 → 7711) and
`quiet-responsive-shell:204` (`[data-sections-door]` not found) both failed reproducibly on a dev
server that had absorbed ~40 recompiles, and both passed on a freshly booted one — the door failure
being the tell: the attribute had just been added, and the run that immediately followed the change
passed. A third, `page.goto … interrupted by another navigation`, is the cold-compile race and went
away after warming `/doc/…d4`, `…d5`, `…d6` with `curl`. **Restart the dev server before trusting a
webkit failure in this program**, and warm the three doc routes first.

---

## Left for a ruling

1. **D-B34** — is D-B29's "CLS 0" the paper's, or the whole page's? The lane scoped it to the paper
   and prints the chrome. If the lead wants the chrome inside the 0, OD-14's per-stop rungs must
   reserve their space.
2. **W4-R1's approvals sr-only cell** vs its own stated rule (see above) — a two-word change either
   way.
3. **D-B33** — the OD-4 fallback candidate is now open: `content-visibility` is off the paper, and
   whatever replaces it must not shift on the relevance crossing.
4. **D-B36** — a `DocSheet` field never freezes the lens. Logged, not changed.
