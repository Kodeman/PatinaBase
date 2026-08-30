# W2 review — CORRECTNESS

Reviewer: W2 CORRECTNESS (independent context; wrote none of this).
Read-only: `git show` / `git diff` against explicit refs. No checkout, no worktree, no product edit, no gate executed.

Refs reviewed:

| Branch | Head | True merge-base | Lane diff read |
|---|---|---|---|
| `document-lens/w2-l2` | `b303b3675` | `690337f1a` | `690337f1a..w2-l2` |
| `document-lens/w2-l3` | `cebec4d85` | `690337f1a` | `690337f1a..w2-l3` |
| `document-lens/w2-l1` (= l2 + l3 + `c8644c499`) | `c8644c499` | `de82db0e5` | `de82db0e5..w2-l1` |
| `document-lens/w2-l4` (= l2 + `536d60552`) | `536d60552` | `de82db0e5` | `de82db0e5..w2-l4` |

Context read: `design/technical-design.md` (OD-8, OD-9, OD-14, OD-15, §2 state table, §3 observer strategy, §5 DOM/token contract, §6 test strategy, §7 C-2/C-3/C-4), `design/reconciliation.md` (D-1, D-2, D-4, RF-02, RF-03, RF-05, §10, the ladder/quiet/mobile print contracts), `design/deviations.md` (D-B1, D-B4, D-B6), `test-impact.md`.

---

```
┌──────────────────────────────────────────────────────────────────────────┐
│  VERDICT — DO NOT MERGE AS IT STANDS                                     │
│                                                                          │
│  The wave's SHAPE is right: the paper order grows to six, the ladder      │
│  replaces two rail blocks, the running index becomes a subscription, and  │
│  the derivations are pure and well-tested.                               │
│                                                                          │
│  Three things stop it.                                                    │
│                                                                          │
│  1. `w2-l1` does not compile. It deletes `spine-shelved-blocks.tsx` and   │
│     `spine-running-index.tsx` and removes `DocSpineProps.shelved`, while  │
│     `page.tsx` still imports the deleted module, renders it, and passes   │
│     the removed prop — and eight test files `jest.mock()` the deleted     │
│     path non-virtually. Nothing on this branch can be gated standalone.   │
│                                                                          │
│  2. The ladder's roving tabstop is broken in two independent ways         │
│     (C-02, C-03). At 1180–1439 the arrow keys walk into `display:none`    │
│     rungs; at either tier a change in row count strands the tabstop index │
│     past the end of the list and the whole rail drops out of Tab order.   │
│     Both are keyboard-fatal and neither is covered by the new suite.      │
│                                                                          │
│  3. Two dead press targets ship: `Closing the book` on a completed        │
│     project has no root at all (C-04), and `care`'s focus destination is  │
│     a non-focusable `<section>` (C-07), so L-10's focus contract is not   │
│     met on that stop.                                                     │
│                                                                          │
│  Everything else is fixable in place. 5 high · 14 medium · 12 low · 1 info│
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Gate evidence

No gate was executed: the brief mandates read-only inspection with explicit refs, and every gate for this change requires a working tree. Each row names the exact command the change must pass, and the static evidence that predicts its result.

| Gate | Command | Status | Evidence |
|---|---|---|---|
| Type-check (designer-portal is not the strict portal, but the ladder's types cross three modules) | `pnpm --filter @patina/designer-portal type-check` | **PREDICTED RED on `w2-l1`** | `page.tsx:154` imports `@/components/document/spine-shelved-blocks`, deleted on this branch (`git show w2-l1:…/spine-shelved-blocks.tsx` → path does not exist); `page.tsx:1798` passes `shelved={shelvedSpine}`, removed from `DocSpineProps` at `doc-spine.tsx:38-48`. Two unavoidable TS2307/TS2322. |
| Build (the real designer-portal gate) | `pnpm --filter @patina/designer-portal build` | **PREDICTED RED on `w2-l1`** | same two sites; module resolution fails at bundle time. |
| Jest — the wave's own suites | `pnpm --filter @patina/designer-portal test -- lens-ladder document-index use-document-running-index care-band previous-work doc-spine rail-stock shelved-spine` | not run | These eight do not import `page.tsx` and should be green; the new fixtures are self-consistent and the capturing IO mock is correctly installed (`use-document-running-index.test.tsx:9-63`). |
| Jest — the page suites | `pnpm --filter @patina/designer-portal test -- "doc/\[id\]"` | **PREDICTED RED on `w2-l1`** | `page.test.tsx:180`, `paper-order.test.tsx:102`, `worktable.test.tsx:105`, `worktable-speccing.test.tsx:275`, `worktable-delivery.test.tsx:132`, `worktable-finalize.test.tsx:179`, `worktable-finalize-once.test.tsx:194` each call `jest.mock('@/components/document/spine-shelved-blocks', factory)` without `{ virtual: true }` on a path that no longer resolves. |
| Jest — suite/test arithmetic (the wave gate: "a wave whose suite count moves without a written reconciliation does not merge") | `pnpm --filter @patina/designer-portal test 2>&1 \| tail -5` | not run; **reconciliation not written** | W2 adds 3 suites (`spine/__tests__/lens-ladder.test.tsx`, `lib/document/__tests__/document-index.test.ts`, `lib/document/__tests__/lens-ladder-derivation.test.ts`) and removes 0 (`shelved-spine.test.tsx` survives, shortened). `test-impact.md`'s "Jest arithmetic" section records no W2 row. That row must exist before merge. |
| Lint / format | `pnpm --filter @patina/designer-portal lint` | **PREDICTED RED (format)** | `previous-work.tsx:51` is 84 columns against prettier's 80 (C-28). |
| Contrast / rail-stock tripwires | `pnpm --filter @patina/designer-portal test -- contrast rail-stock` | **PREDICTED GREEN** | `contrast.test.ts:315-325` already walks `components/document/spine/`, so `spine/lens-ladder.tsx` enters the offender scan; after the two OD-16 deletions the set is `doc-spine.tsx` + `spine/lens-ladder.tsx` + `margin-rail.tsx` = 3, landing exactly on D-B4's `>= 3` floor (`contrast.test.ts:379`). `lens-ladder.tsx` spends only `--color-charcoal`, `--color-clay-ink`, `--text-primary`, `--text-muted`; its `outline-[var(--color-clay)]` is outside `pigmentOffenders`' three text forms (`contrast.test.ts:344-346`) and is correctly not an offender. `rail-stock.test.ts:35-57` extends to the ladder by `it.each`. |
| Playwright | `pnpm --filter @patina/designer-portal test:e2e -- document/` | not run; **no e2e touched by any W2 lane** | `de82db0e5..w2-l1` and `de82db0e5..w2-l4` contain zero `e2e/` files. Per `test-impact.md` the W2 e2e rows belong to W2-L5 — expected at integration, recorded here so it is not mistaken for coverage. |

**Diff-base warning.** Diffing any lane against `7c8b33e39` (as the brief specifies) is misleading: all four lanes predate `5313b6f95` ("W1 review fixes"), and `w2-l2`/`w2-l3` predate the whole W1 merge, so such a diff renders W1's fixes as reverts of `letterhead-vitals.tsx`, `margin-note.tsx`, `margin-item.tsx`, `margin-rail.tsx`, `studio-drawer.tsx`, `globals.css` and `quiet-release-contracts.spec.ts`. Those files have **no overlap** with any lane's own commit, so the three-way merge is clean and nothing is actually lost. Every finding below is taken from the true lane diffs in the table above.

---

## Severity counts

| | Count |
|---|---|
| High | 5 |
| Medium | 14 |
| Low | 12 |
| Informational | 1 |
| **Total** | **32** |

Every finding is reported; nothing was filtered by severity or confidence.

---

## Findings

`id · severity · confidence · file:line · finding · failure scenario`

---

**C-01 · HIGH · high · `apps/designer-portal/src/app/(document)/doc/[id]/page.tsx:154, 1584-1597, 1798`**
`w2-l1` deletes `spine-shelved-blocks.tsx` and `spine-running-index.tsx` and removes `shelved` from `DocSpineProps` (`doc-spine.tsx:38-48`), but leaves `page.tsx` importing the deleted module (`:154`), constructing `shelvedSpine` from it (`:1584`), and passing `shelved={shelvedSpine}` to `<DocSpine>` (`:1798`). Seven page-level jest suites additionally `jest.mock('@/components/document/spine-shelved-blocks', factory)` without `{ virtual: true }`.
*Failure scenario:* the branch does not type-check, does not build, and collapses seven test suites at module-resolution time. The W2 integration lane owns `page.tsx`, so the rewiring is expected there — but the deletion and the rewiring must land in one commit. Merging `w2-l1` ahead of the page work leaves `main`/`integration` unbuildable, and no reviewer downstream can run a gate to discover it.

**C-02 · HIGH · high · `spine/lens-ladder.tsx:68, 108-131, 194, 200, 262, 270-271`**
The roving tabstop is a positional integer (`roving`) into a row list read live from the DOM, but nothing clamps it to the current row count, and the count changes: `printRooms` (`:76`) adds four `[data-ladder-row]` rungs when `activeKey === 'ffe'` or a room is held, and removes them otherwise. `nextRow()` renumbers every segment below Pieces as it does so.
*Failure scenario:* the reader arrows down to a room rung (index 6–9), then scrolls; `activeKey` leaves `ffe`, the rungs unmount, six rows remain (0–5), `roving` stays at 9 — so `tabIndex={index === roving ? 0 : -1}` is `-1` on **every** row and the entire ladder silently leaves the Tab order. A keyboard reader loses the rail for the rest of the session (only a focus event on a row restores it, which she can no longer reach). The milder form is off-by-four: after the rungs appear, the tabstop lands on a room instead of the stop she left it on.

**C-03 · HIGH · high · `spine/lens-ladder.tsx:76, 116-119, 130, 259-260`**
`printRooms` carries no tier condition. The rungs are rendered at **both** desktop tiers and hidden at 1180–1439 by `hidden min-[1440px]:block` (`:260`). `onKeyDown` reads rows with `querySelectorAll('[data-ladder-row]')`, which returns `display:none` elements.
*Failure scenario:* at 1280, with Pieces the reading stop, ArrowDown from the Pieces segment computes `next` = the first hidden rung, calls `setRoving(next)` and `rows[next].focus()` — which is a no-op on a `display:none` element. `document.activeElement` stays on Pieces while `tabIndex=0` moves to an invisible row: Tab now skips the ladder, and the next ArrowDown reads `from = -1` and jumps to row 1. The file's own header comment ("the rungs the narrow tier hides are simply not there to walk", `:106-107`) states the opposite of what the code does. `lens-ladder.test.tsx:224-228` asserts the DOM-present-and-hidden form, so the suite locks the defect in. Root cause is C-24: OD-14 specified a `tier` prop and the lane replaced it with a CSS class.

**C-04 · HIGH · med-high · `care-band.tsx:223-228` · `lens-ladder-derivation.ts:463-465` · `spine/lens-ladder.tsx:195`**
`CareBand` applies `indexRootAttrs` on four branches but returns `null` on two that precede them: `if (!project || project.status === 'completed') return null` (`:227`) and `if (authLoading) return null` (`:228`). Meanwhile `deriveLadderSegments` defaults `mounted` to *every declared key* when `mountedKeys` is not supplied (`:463-465`), and nothing in W2 supplies it.
*Failure scenario:* on the **care** spread — which is by definition a completed project — `paperRegionsForSection('care')` declares a `care` stop, the ladder prints it enabled, and `[data-index-region="care"]` does not exist. Pressing it: `requestRegionUnfold('care')` sets `activeKey='care'` and locks it for 700ms; `scrollToRegion` finds no root, so no scroll; `getElementById('care-region-heading')` is null, so no focus. A perfectly dead rung that also moves `aria-current` onto a phantom stop and announces it. This is precisely the failure `paperRegionsForSection`'s own comment says the table exists to prevent ("a scroll-spy target with nothing behind it"). The same hole exists for the `authLoading` frame on every spread.

**C-05 · HIGH · high · `hooks/use-document-running-index.ts:151-162`**
When `document.querySelector('[data-document-paper]')` is null at effect time, the MutationObserver observes `document.body` with `{ childList: true, subtree: true }` — and never upgrades to the paper once it arrives. The subscription is permanent for the life of the document route.
*Failure scenario:* every childList mutation anywhere in the application — a toast, a `DocSheet` opening, a portal, any re-render that replaces a text node's parent, the margin composer, the timer — schedules `queueAttach`, and one animation frame later `attach()` runs six `document.querySelector` calls plus `resolve()`, which issues up to six more `querySelector` calls and six `getBoundingClientRect()` reads (`:92-97`). That is a forced synchronous layout, once per frame, driven by unrelated UI churn, for the whole session. The debounce bounds it to one per frame; it does not bound it to relevant frames. This branch has **no test** — `use-document-running-index.test.tsx`'s `beforeEach` (`:99-103`) always creates the paper first.

**C-06 · MEDIUM · high · `hooks/use-document-running-index.ts:107, 120-135`**
`seen` (`:58`) records each key's last `isIntersecting` and is never purged when a root is unobserved. `attach()` deletes from `observing` and `attached` (`:126-128`) but leaves `seen` intact, then calls `resolve()` synchronously (`:134`) — before the IntersectionObserver has delivered a first entry for a newly-observed element.
*Failure scenario:* a region root is removed and re-added — a fold/unfold that swaps the root, a query refetch that remounts it, the Worktable pinning a different spread. On re-attach, `resolve()` runs with the stale `seen[key] === true` from before the region left, the `crossing` branch (`:87-91`) hands it the reading line, and `aria-current` plus `data-reading-index` jump to a region far off-screen until the observer's first real entry corrects it a frame or two later. The fix is one line: `seen.delete(key)` beside every `unobserve`/`attached.delete`.

**C-07 · MEDIUM · med-high · `care-band.tsx:224` vs `hooks/use-document-running-index.ts:244-247` and §2's L-10 row**
`regionHeadingId('care')` resolves to `care-region-heading` (`document-index.ts:64-68`), which W2 places on the region **root** — a `<section>` or `<div>` with no `tabIndex`. `scrollToRegion` does `(heading ?? root)?.focus?.({ preventScroll: true })`; `heading` is found (it is the root), and `.focus()` on a non-focusable element is a silent no-op.
*Failure scenario:* pressing `Closing the book` on the ladder scrolls the care band into view and leaves focus in the rail. A screen-reader user hears nothing announced at the destination, and the next Tab continues from the rail rather than the region. §2's L-10 row states the focus destination is "the target's `<h2>` via `regionHeadingId`". `record` gets this right — `RegionHead` renders `<h2 id={headingId} tabIndex={-1}>` (`region-head.tsx:128-134`) — so `care` is the one outlier. `care-band.test.tsx:242-244` asserts the id is on the root and never asserts it can take focus, so the suite cannot catch it.

**C-08 · MEDIUM · med · `ffe-section.tsx:626, 631-651, 656-666`**
The pressable room heading wraps `headingChildren` — which contains `<h3>` (`:638`) — inside a `<button>` (`:657`). `<button>`'s content model is phrasing content; `<h3>` is flow content, so this is invalid HTML, and ARIA's presentational-children rule strips the heading role from the accessibility tree.
*Failure scenario:* a screen-reader user navigating the FF&E schedule by heading (H key) loses every room heading — the primary way of moving through a 36-line, 4-room schedule. Answering the brief's question directly: there is **no nested interactive content** — `TriStateTick` is excluded because `pressable = !selecting` (`:626`) — so the counts-inside-a-button case is fine; the heading nesting is the defect. Fix: keep the `<h3>` outside and make the mark + name a button inside it, or render the press target as `<h3><button>…</button></h3>`.

**C-09 · MEDIUM · high · `lens-ladder-derivation.ts:528-543` vs `mobile-sheets.tsx:331, 581`**
`deriveLadderDoors` emits `Call sheet` whenever `input.ticket.project` is true and never consults `ticket.people.callSheetEnabled`, while the phone's sections sheet gates the same door on `useFeatureFlag('call-sheet')`.
*Failure scenario:* a studio with the call sheet off sees `Call sheet` in the rail at 1180+ and not at 390. Pressing the rail's door dispatches `document:open-call-sheet` into a surface that is not listening — a door onto nothing, on the exact organ R127 built to stop printing doors onto nothing.

**C-10 · MEDIUM · high · `mobile-sheets.tsx:511-600`**
The sheet's four doors are hand-written with inline `router.push` calls rather than rendered from `deriveLadderDoors`. Two derivations of one contract now exist. The sheet also derives its stops from `activeDoc.sections`' active key (`:481-485`) rather than from `TicketInput.paperRegions`.
*Failure scenario:* OD-8's per-spread rules (four only when `project`; `Put down the room` while held; `The client's copy` on the proposal spread) live in `lens-ladder-derivation.ts` and are re-implemented, incompletely, in JSX. The first change to door order, labels or gating updates one surface and not the other. And a pinned Worktable spread — which `TicketInput.paperRegions` exists to express — lists different stops on the phone than on the rail.

**C-11 · MEDIUM · high · `doc-spine.tsx:70-73` + `page.tsx:1431`**
`useDocumentRunningIndex` is now called in `DocSpine` **and** still called at page level. Post-integration that is two IntersectionObservers, two MutationObservers (new in W2), two independent `activeKey` states and two independent 700ms locks over the same roots. `DocSpine` is `hidden` below 1180 but still mounted, so the second pair also runs at 390.
*Failure scenario:* `deviations.md` D-B6 accepted a duplicate observer "for one wave" on the explicit promise that "OD-16 deletes `spine-shelved-blocks.tsx` in W2 and the second observer goes with it". W2 deletes the file and reintroduces the duplication one level up, so D-B6 cannot be closed and its cost doubles (each hook now also carries a body-wide MutationObserver — see C-05). The reading line should be lifted once, at the page, and passed down as a prop the way `segments` and `doors` are.

**C-12 · MEDIUM · high · `spine/lens-ladder.tsx:81-103`**
`place()` reads `row.offsetTop` and `row.offsetHeight` — forced layout — and is bound directly to `resize` with no rAF and no throttle (`:100-103`). §5's DOM contract states `data-lens-window` is written "imperative (rAF, `transform: translateY`)".
*Failure scenario:* dragging a window edge runs a synchronous layout read plus two style writes per resize event. The transform path itself is correct (D-B1's CLS-0 requirement is met — the bracket is absolutely positioned, so height and transform changes file no `layout-shift` entry, and `motion-reduce:transition-none` is present at `:155`) — the defect is the un-throttled read, not the write. Answering the brief: the write does not thrash within its own frame, because the only read is of a *different* element and no read follows the write.

**C-13 · MEDIUM · med-high · `spine/lens-ladder.tsx:96, 98, 216-256`**
`place`'s dependency list is `[activeKey]` and the effect's is `[place, segments, printRooms]`. `headInFrame` appears in neither, yet RF-02 is implemented by *removing* the value line from the DOM (`{!yielded && …}`, `:216`), which changes the segment button's height.
*Failure scenario:* when the reading stop's own `[data-region-head]` enters the frame, its value line unmounts, the button shrinks by one 15.4px line, and the reading bracket keeps its stale height until some unrelated dependency re-runs `place` — the bracket visibly overhangs the row it is supposed to measure. RF-02 asked for "two layers per segment swapped on `data-region-head-in-frame` (no layout shift)"; a conditional unmount is not two layers. W3 wires `headInFrame`, so this lands latent.

**C-14 · MEDIUM · high · `spine/lens-ladder.tsx:195`**
A segment with `mounted: false` renders `disabled`. A disabled button cannot receive focus, so `rows[next]?.focus()` is a no-op on it — the same stranding as C-02/C-03 — and it still carries `aria-current` and `data-index-region`.
*Failure scenario:* on a spread where any declared stop has not mounted, ArrowDown onto it moves `tabIndex=0` to an unfocusable row and Tab skips the ladder. Untested: every fixture segment in `lens-ladder.test.tsx` is `mounted: true`.

**C-15 · MEDIUM · high · `previous-work.tsx:48, 56-73, 84` + `region/region-head.tsx:110-114`**
Answering the brief's question directly: **the dev-mode guard does not fire.** `region-head.tsx:110` reads `if (actions.length === 0 && !bodyId)`. At `count === 0` the actions array is `[]` but `bodyId={contentId}` is truthy (`previous-work.tsx:59`), so the `console.error` is suppressed — while the `<div id={contentId}>` it names is **not rendered** on that branch (`:84`, gated on `hasHistory`).
*Failure scenario:* the guard exists to catch exactly this shape ("a head with no acts is a caption, not a head") and is defeated by an id that points at nothing. Nothing else warns, and the empty record head ships as a caption. Fix: pass `bodyId` only when `hasHistory`, which both restores the guard and removes the dangling reference.

**C-16 · MEDIUM · high · `previous-work.tsx:56-73` + `previous-work.test.tsx:7, 12`**
The record's disclosure lost `aria-controls`. The old button carried `aria-expanded` **and** `aria-controls={contentId}`; `RegionLedgerEntry` (`region-head.tsx:35-49`) has no `aria-controls` field, and `RegionHead` emits one only on its own Fold act (`:182`), which is not rendered here (`showFold` requires `onFold`, which `PreviousWork` does not pass).
*Failure scenario:* a screen-reader user hears "Open the record, collapsed" with no way to reach what it controls. Both assertions that would have caught it were deleted rather than re-homed — `expect(document.getElementById(button.getAttribute('aria-controls')!)).toBeInTheDocument()` and the matching `toBeVisible()` after expansion. See C-19 for the full weakened-assertion audit.

**C-17 · MEDIUM · med · `lens-ladder-derivation.ts:177-178`**
`cap = (value, max) => value.length <= max ? value : value.slice(0, max).trimEnd()` — a hard character truncation with no word-boundary respect and no elision mark.
*Failure scenario:* a 31-character value (a long room count, a five-figure sum with a long undrawn label, a 3-digit overdue day count) prints a word cut in half and nothing tells the reader it was cut. Reconciliation §10's walker sentence is "No word breaks mid-word; no clipped rung". The same `cap` also governs the 40-char `countLine`, which the OD-7 announcement reads aloud.

**C-18 · MEDIUM · med · `lens-ladder-derivation.ts:133-140` vs OD-14 / reconciliation §10**
The floor formula `max(36, round(ceil(len / charsPerLine) × 15.4 + 8))` cannot reproduce OD-14's claim ("This reproduces the mockup's measured `45/45/112/60/45/29` on the specimen"): Pieces' narrow value is 30 chars at `charsPerLine = 15` → 2 lines → **39px**, not 112, and `max(36, …)` makes 29 unreachable. The formula also counts *only* the value line — the 13px name and the button's `py-1` are not in it — so `floorPx` under-reserves real content height by roughly 20px at every stop.
*Failure scenario:* the flex bases are systematically too small. Because `min-height: auto` on a column flex item floors each segment at its content, nothing clips — but the "floor" is not doing the job the design assigned it, and the reconciliation's 1280 arithmetic ("336 still fits in ~342") is computed from numbers the code does not produce. Either the formula or OD-14's claim is wrong; the lane implemented the formula and logged no deviation.

**C-19 · MEDIUM · high · `__tests__/shelved-spine.test.tsx` (−325) and `previous-work.test.tsx`**
Line-by-line audit of what died and whether it was re-homed:

| Deleted | Re-homed? |
|---|---|
| `describe('paperRegionsForSection')` — 4 cases | **YES, stronger.** `lib/document/__tests__/document-index.test.ts:44-82` covers the same four and adds the six-key order, the label/key drift guard, and the `regionHeadingId` throw path. |
| `SpineRunningIndex` — one `aria-current`, paper order, "On this paper" | **YES.** `spine/__tests__/lens-ladder.test.tsx:140-200`. The name change to `This paper` is C-4's ruling. |
| "reports the live money rung instead of the one empty tier (F09/F61)" | **YES, structurally.** The money register now reads only `ladder.owed` / `ladder.notDrawn` (`lens-ladder-derivation.ts:374-375`); `$0 moved` is no longer expressible, and `lens-ladder-derivation.test.ts:127` asserts `$17,500 OUT · $12,300 UNDRAWN`. |
| "reaches the undrawn deposit rather than reporting $0 moved (F61)" — the named Chen-residence live failure | **YES, same reason.** |
| **"pays for no money read on a spread that prints no money row"** | **NO.** `useProjectInvoices` and `usePurchaseOrders` carry no `enabled` gate, so the only possible gate is a conditional MOUNT — and the component that provided it (`spine-shelved-blocks.tsx`) is deleted. Nothing in W2 asserts that the replacement does not fire those two reads on the install and care spreads. This is the wave's one real coverage loss and it guards a live query cost. |
| "renders On this paper and nothing else — no rooms block, no shelves block" (the container button-count guard) | **NO.** Minor; nothing now asserts the rail carries only the ladder's own buttons. |

Weakened assertions in `previous-work.test.tsx`: `:12` `expect(document.getElementById(button.getAttribute('aria-controls')!)).toBeInTheDocument()` **deleted** (product regression, C-16); `:18` `…toBeVisible()` after expansion **deleted**, replaced by presence of `Brief recap`; `:26` `toBeVisible()` → `toBeInTheDocument()`. `care-band.test.tsx` adds five branch tests and covers no `return null` branch, i.e. it cannot see C-04.

---

**C-20 · LOW · high · test coverage gaps the brief asks about**
(a) A root **replaced in place** (`previous !== el` → `unobserve(previous)`, `use-document-running-index.ts:123-124`) has no test — the suite covers add-late and remove-only. (b) No unmount test asserts `mutations.disconnect()`; there is no leak assertion at all. (c) The `paper ?? document.body` fallback (C-05) is never exercised. (d) `lens-ladder.test.tsx:313-337` never tests Home/End, never changes the row count under a live `roving`, and never focuses a disabled segment — C-02, C-03 and C-14 all pass the suite. (e) `mobile-bar.test.tsx:374-505` never *presses* a ladder stop: `closeSheet` + `requestRegionUnfold` + `scrollToRegion` + the focus destination are wholly unasserted on the phone. (f) `care-band.test.tsx` covers no `return null` branch.
*Failure scenario:* each of the six defects above is invisible to `pnpm test`.

**C-21 · LOW · high · `spine/lens-ladder.tsx:193` vs `mobile-sheets.tsx:506`**
The ladder writes `aria-current={current ? 'true' : 'false'}` — the attribute is present on all six segments — while the phone writes `aria-current={current ? 'true' : undefined}`. Both are valid ARIA; they are not the same contract. §6's falsifiable sentence is "the single `aria-current`", and a Playwright `locator('[aria-current]').count()` reads 6 on the rail and 1 on the phone.

**C-22 · LOW · high · `spine/lens-ladder.tsx:221`**
`{segment.fallback ?? 'Nothing yet'}` mixes registers in one expression: `LadderFallback` is `'NOTHING YET' | 'NOT KNOWN YET'` (`lens-ladder-derivation.ts:42`) and the literal default is sentence case. CSS `uppercase` hides it visually; a `getByText` assertion will hit whichever branch produced the node. The default is also unreachable in practice — every `Register` sets `fallback` explicitly — so it is dead code carrying a second register.

**C-23 · LOW · med · `lens-ladder-derivation.ts:125, 219-225`**
`READING…` is a third value register that appears in no design document. The ladder print contract declares values, `NOTHING YET` and `NOT KNOWN YET`; `reading()` is what every stop prints on first paint until its source settles. It may well be right, but it is an undeclared string on the wave's most-read organ.

**C-24 · LOW · high · C-3 contract drift, unlogged in `deviations.md`**
Four departures from §7's declared cross-lane contract: (1) `LensLadder` has **no `tier` prop** — OD-14 specifies one, sourced from `useMediaMatch('(min-width: 1440px)')`; the lane substituted CSS classes. (2) `deriveLadderSegments(input: LadderInput)` and `deriveLadderDoors(input: LadderDoorsInput)` take a single object rather than C-3's `(rows, regions, counts)` and `(rows, input, held)`. (3) `LadderSegment` gains `narrowValue`, `floorPx`, `narrowFloorPx`. (4) `LadderDoor` gains `href`.
*Failure scenario:* (2)–(4) are additive and defensible; (1) is a real design decision — it removes a hydration hazard and honours "render once", which is good — and it is the direct cause of C-03. `deviations.md` carries no D-B row for any of them, so the wave that inherits the ladder has no record of why OD-14's `tier` is missing.

**C-25 · LOW · high · `doc-spine.tsx:87` + `doc-spine.test.tsx:80-83`**
The head reserve moves 116/100 → **126/117** on a measured basis (18px root). The change is justified in a code comment and asserted in the test, but §10 fixes 116/100 and `deviations.md` records nothing. The arc comment two blocks below (`doc-spine.tsx:~135`) still reads "two rows must fit inside a 116px head" — now false. Also note the ladder's own track budget shifts with it.

**C-26 · LOW · med · `doc-spine.tsx:87` + `spine/lens-ladder.tsx:184` (`flexShrink: 0`)**
`min-[1180px]:pb-24` → `pb-6` = 27px at this portal's 18px root, against RF-05's stated 24px. More consequentially, with `flexShrink: 0` on every segment and `min-height: auto` flooring each at its content, the rail's total content can exceed the column height on a short viewport (roughly: at 1440×900, the head 117 + `Put down` ~62 + doors block ~259 leaves ~400px of track against ~438px of segments-plus-rungs), and the `overflow-y-auto` aside then scrolls itself — the exact condition RF-05's gate forbids (`scrollHeight === clientHeight` at 1440/s0). Playwright-only; no lane covers it, since W2's e2e belongs to W2-L5.

**C-27 · LOW · high · `spine/lens-ladder.tsx:273-277` and `ffe-section.tsx:656-666` vs `job-ticket.tsx:425-434`**
Parity check requested by the brief: `data-room-chip`, `aria-pressed`, `toggleRoom` and the held `font-semibold` all match the ticket's chip. Neither new surface carries **`doc-room-lifted`**, the class the ticket uses for the held state. Three room-press surfaces, two visual grammars for "in hand". (`min-h-11` is present on both new surfaces and correctly absent from the ticket's inline chips.)

**C-28 · LOW · high · `previous-work.tsx:51`**
`    <section data-index-region="record" className="mb-5 mt-4" aria-label="The record">` is 84 columns against prettier's 80. A format check fails; the repo has previously needed a `style(document): prettier fix` commit for exactly this.

**C-29 · LOW · med · `mobile-sheets.tsx:186-195`**
`SHEET_ARIA_LABEL.spine = 'Sections of this document'` now names a sheet that no longer prints the document's sections — it prints the open spread's regions and its doors. Reconciliation names the kind `Sections`. (The `SHEET_ARIA_LABEL` map itself is correct and type-safe: its key union matches `SHEET_RETURN_FALLBACKS` and therefore `Sheet`'s `kind`, so no kind can silently get `undefined`.)

**C-30 · LOW · med · `mobile-sheets.tsx:508-510` vs `:162-183` and `use-document-running-index.ts:237-248`**
Answering the brief: **the sheet does close first, and focus does land on the heading — but only by rAF depth.** `closeSheet()` runs before `scrollToRegion`, so the scroll is visible; `restoreSheetFocus` then focuses the sheet's return target inside **one** rAF (`:167`), while `scrollToRegion` focuses the region heading inside **two** (`:237-238`). The heading wins because it is scheduled a frame later.
*Failure scenario:* nothing states or tests this ordering. One extra `requestAnimationFrame` on either path — a React 19 scheduling change, a `startTransition`, a future guard in `restoreSheetFocus` — silently returns focus to the mobile bar after the scroll, and the reader lands on the region with focus on the bar behind her.

**C-31 · LOW · high · `doc-spine.tsx:74`**
`useDocumentRunningIndex(segments.map(s => s.key), projectId ?? '')`. A missing `projectId` produces a well-formed but wrong heading id for the keys that interpolate it (`ffe-region-heading-`), so `getElementById` returns null and focus falls back to the non-focusable root. `regionHeadingId`'s throw — C-2's stated guard — cannot fire, because the key is valid and only its argument is empty. (Answering the brief's other question: **the throw is not reachable in production today.** `PROJECT_PAPER_ORDER` covers all six members of `DocumentIndexKey`, and `document-index.test.ts:94-98` proves the throw only via a cast. It becomes reachable in Wave 5, when OD-2 widens the union with the pre-work keys — which is the guard doing its job.)

**C-32 · INFO · high · branch hygiene**
All four lanes are behind `document-lens/integration@7c8b33e39` by `5313b6f95` ("W1 review fixes"); `w2-l2` and `w2-l3` are thirteen commits behind, branched at `690337f1a`, before the W1 merge. `5313b6f95` touches `letterhead-vitals.{tsx,test.tsx}`, `margin-note.{tsx,test.tsx}`, `margin-item.tsx`, `margin-rail.tsx`, `studio-drawer.{tsx,test.tsx}`, `globals.css` and `quiet-release-contracts.spec.ts` — **no overlap** with any lane's own commit, so the three-way merge is clean and nothing is lost. Recorded because a diff taken against `7c8b33e39` renders those fixes as reverts, which will mislead the next reader. `w2-l4` also modifies `spine-shelved-blocks.tsx` (+5) inside the shared `b303b3675` ancestor while `w2-l1` deletes the file; since that ancestor is common to both, the delete resolves cleanly.

---

## Expected at integration (not findings)

The W2 integration lane is concurrently wiring these; their absence on the lane branches is by design and is **not** counted above:

- `page.tsx` — replacing `DocSpineShelvedBlocks`/`shelved` with `segments`/`doors`/`projectId`/`onToggleRoom`, and supplying `LadderApprovalsFacts`, `LadderCareFacts`, `LadderRecordFacts`, `damagedOn`, `heldRoomId`, `mountedKeys`, `routes`, `onOpenLeaf`, `onOpenCallSheet`, `onReleaseRoom`. **Note:** no lane and no contract row names who computes the three facts objects or `mountedKeys` — C-04 is unfixable without `mountedKeys`, so that assignment needs to be explicit.
- `<CareBand indexRoot />` on the project mount only. Today neither call site passes it (`page.tsx:2157`, `:2181`), so the `care` root is never emitted; `care-band.tsx`'s own comment names `page.tsx:2134`, which is not where either mount now stands. `indexRoot` defaulting to `false` is the **only** guard against two roots claiming one key and a duplicate `id` — there is no runtime dev warning.
- The stage phrase's L-6 yield, `Boards`, the fifth door, presence.
- `headInFrame` — the ladder accepts it and defaults to `null`; W3 wires the observer (see C-13, which lands latent until then).
- `MobileActiveDoc.readingIndex` (A-08), consumed at `mobile-sheets.tsx:504`.
- All W2 e2e (`quiet-responsive-shell.spec.ts:165` and the rail-budget cells) — W2-L5's.

---

## Fixes required before ship

1. **C-01** — land the `page.tsx` rewiring in the same commit as the OD-16 deletions, and convert or remove the seven `jest.mock('@/components/document/spine-shelved-blocks', …)` call sites. Nothing merges until `pnpm --filter @patina/designer-portal build` and the full jest run are green, with the suite/test arithmetic written into `test-impact.md`.
2. **C-02** — clamp the roving index: derive it from the focused row rather than storing a bare integer, or clamp to `rows.length - 1` on every render and on every row-count change.
3. **C-03** — do not render the rungs at the narrow tier. Either restore OD-14's `tier` prop, or gate `printRooms` on a media match, or exclude non-rendered rows from the arrow walk (`rows.filter(r => r.offsetParent !== null)`), and correct the header comment. Update `lens-ladder.test.tsx:224-228`, which currently asserts the defective form.
4. **C-04** — assign an owner for `mountedKeys`, and either emit the `care` root on the completed/loading branches or exclude `care` from `paperRegionsForSection('care')` until it has one. A declared stop with no root must not render as an enabled press target.
5. **C-05** — re-resolve the paper and re-target the MutationObserver once it exists (or scope the fallback to `document.body` only until the first attach succeeds, then swap). Add a test for the branch.
6. **C-06** — `seen.delete(key)` on every `unobserve` / `attached.delete`.
7. **C-07** — put `care-region-heading` on the care band's `<h2>` (with `tabIndex={-1}`), not on the region root, matching `record`. Add a focus-destination assertion to `care-band.test.tsx`.
8. **C-08** — take the `<h3>` out of the `<button>`.
9. **C-15 / C-16** — pass `bodyId` only when `hasHistory` (restores the dev guard and removes the dangling id) and restore `aria-controls` on the record's disclosure, with the two deleted assertions.
10. **C-09** — read `ticket.people.callSheetEnabled` in `deriveLadderDoors`, so the rail and the phone gate the same door the same way.
11. **C-19** — re-home the money-read cost guard: assert that the install and care spreads fire neither `useProjectInvoices` nor `usePurchaseOrders`.

## Should fix

- **C-10** — render the phone's doors from `deriveLadderDoors`; key its stops off `paperRegions`, not the active section.
- **C-11** — lift the reading line to the page and pass `activeKey`/`onJump` into `DocSpine`; close D-B6.
- **C-12** — throttle `place` through the existing rAF.
- **C-13** — add `headInFrame` to `place`'s dependencies, and implement RF-02 as two layers rather than a conditional unmount.
- **C-14** — skip disabled rows in the arrow walk.
- **C-17** — trim `cap` at a word boundary, or declare an elision mark.
- **C-18** — reconcile the floor formula with OD-14's measured targets, in writing, and include the name line in the reserve.
- **C-20** — add the six missing tests: root-replaced-in-place, unmount/disconnect, the body fallback, Home/End + a row-count change under a live roving + a disabled segment, and a sections-sheet stop press asserting close → unfold → scroll → focus.
- **C-21** — one `aria-current` convention across the rail and the phone.
- **C-23 / C-22** — declare `READING…` in the print contract or drop it; remove the unreachable `'Nothing yet'` default.
- **C-24 / C-25** — write the four C-3 departures and the 126/117 head reserve into `deviations.md`, and fix the now-false 116px arc comment.
- **C-26** — verify the RF-05 self-scroll gate at 1440×900 in W2-L5's e2e; consider allowing the segments to shrink.
- **C-27** — apply `doc-room-lifted` to the ladder rung and the FF&E heading.
- **C-28** — run prettier.
- **C-29** — rename the sheet's accessible label to match what it prints.
- **C-30** — make the sheet-close → scroll-to-region focus ordering explicit rather than rAF-depth-implicit, and test it.
- **C-31** — make a missing `projectId` a visible failure rather than a wrong id.

---

## Verified clean

Recorded so the next reviewer does not re-open them.

- **Hydration.** No `matchMedia` or width read in any render path across the W2 files. `useIsomorphicLayoutEffect` (`lens-ladder.tsx:38-39`) is resolved at module scope — constant per environment, so no hook-order hazard. Every imperative write (`data-lens-window`, `hidden`, `transform`, `data-index-region`) happens after mount or is in the JSX itself, so SSR and first CSR markup agree. `mobile-sheets.tsx`'s `matchMedia` is inside an effect. No `useSyncExternalStore` fakes introduced.
- **The L-10 jump lock cannot get stuck.** `lockRef` is cleared by a `setTimeout(JUMP_LOCK_MS)` set on every unfold request (`use-document-running-index.ts:200-204`), and the timer is cleared on unmount (`:182-187`). It is time-based, not completion-based, so an instant reduced-motion scroll (`scrollToRegion:242`, `behavior: 'auto'`) simply holds a correct value for 700ms. `use-document-running-index.test.tsx:236-268` proves both halves. The converse — a smooth scroll longer than 700ms letting the line walk — is the unchanged, declared behaviour of `JUMP_LOCK_MS`.
- **`regionHeadingId`'s throw is not reachable in production today** (see C-31 for the full answer).
- **Contrast.** `rail-stock.test.ts` correctly extended to `spine/lens-ladder.tsx`; `contrast.test.ts`'s `resolveRailFiles()` already walks the `spine/` subdirectory, so the ladder is in the offender scan; the post-deletion file set lands exactly on D-B4's `>= 3` floor; the ladder spends only rail-allowed inks, and its `outline-[var(--color-clay)]` is correctly outside `pigmentOffenders`' three text forms.
- **`data-reading-index`** is `activeKey ?? undefined` (`lens-ladder.tsx:143`) — never the string `"null"`, per §5.
- **RF-02's value/name swap** yields the value and keeps the name, and is asserted (`lens-ladder.test.tsx:180-195`). The mechanism is wrong (C-13); the contract's substance is met.
- **Both tiers render the same DOM** for the two Pieces value strings (`lens-ladder.tsx:236-255`) — one render, CSS chooses. The per-tier floors ride as inline custom properties with a `min-[1440px]` variant (`:177-186`), which is the correct "render once" form. The room rungs are the one place this rule produces a defect (C-03), and only because they are focusable.
- **No nested interactive content** in the FF&E room-heading button (`pressable = !selecting` excludes `TriStateTick`); the counts-inside-a-button case is fine. The `<h3>` nesting is C-08.
- **`min-h-11`** present on the ladder rungs, the ladder doors, and the sheet rows.
- **Arrow wrap and Home/End are implemented correctly** (`lens-ladder.tsx:108-131`) — the modulo wraps in both directions and Home/End clamp to the ends. Both are untested (C-20d), and the roving-index bugs are orthogonal to the arithmetic.
- **The focus-visible ring** is present on every ladder row, rung and door.
- **The MutationObserver's own lifecycle** — `disconnect()` on cleanup (`:176`), one rAF of debounce with a `attachQueued` guard (`:141-149`), idempotent `observe`, and correct `unobserve` of a swapped-or-removed root (`:123-128`). The three defects around it are the body fallback (C-05), the stale `seen` (C-06), and the missing tests (C-20a-c) — the shape is right.
