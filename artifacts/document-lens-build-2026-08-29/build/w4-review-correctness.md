# W4 · correctness review (adversarial)

**Branch** `document-lens/w4` @ `a13acb16c` (worktree `.codex/worktrees/agent-lens-w4-int`).
**Scope** `git diff 0a03b4af9..HEAD` — 46 files, +5042/−130.
**Reviewer** did not write this code. Read-only pass; nothing built, no server touched.

**VERDICT: do-not-ship. Gating: W4-C1, W4-C2, W4-C3, W4-C4, W4-C5, W4-C6, W4-C7, W4-C8.**

Already-ruled items (W3-R7 budgets, W5-R1's 390 chips, OD-4's webkit fallback, the readiness
fan-out) are excluded from the findings below; where the code contradicts a ruling it is called
out as such.

---

## Blockers

### W4-C1 · the OD-12 reserve rule leaks onto the rail ladder — blocker, confidence **high**

`apps/designer-portal/src/app/globals.css:1118-1120`

```css
[data-document-shell] [data-index-region] {
  min-block-size: var(--doc-quiet-reserve, 68px);
}
```

`data-index-region` is **not** a paper-only attribute. `spine/lens-ladder.tsx:393` (the mounted
stop `<button>`) and `:416` (the unmounted stop `<div role="text">`) both carry
`data-index-region={segment.key}` — C-4 says they must — and `DocSpine` is rendered **inside**
`[data-document-shell]` (`page.tsx:2204` shell → `:2224` `<DocSpine>` → `:2258` `<main
data-document-paper>`). The rail is not a descendant of any element that sets
`--doc-quiet-reserve`, so the fallback applies: **every ladder stop gets a 68px minimum height at
both desktop tiers.**

Failure scenario: OD-14 derives each segment's floor as `max(36, lines × 15.4 + 8)` and reproduces
the mockup's measured `45/45/112/60/45/29`. With a 68px floor forced on the button inside each
`[data-ladder-segment]` (which carries `flexShrink: 0` and `flex-basis: var(--seg-floor)`), the six
stops can no longer sit under 408px of track; the specimen's 336px track is blown out and the
`FILED WITH THIS JOB` block and the doors are pushed down or out of the 1440 rail. Nothing in the
wave measures it: `lens-rail-budget.spec.ts` counts **labels**, not heights, and the rail-height
cases in `quiet-responsive-shell.spec.ts` did not run in the only recorded run (serial abort).

The density hook itself is correctly scoped (`use-lens-density.ts:347` uses
`paper.querySelectorAll`), and `blankPaperCensus` scopes to `[data-document-paper]
[data-index-region]` — so the CSS is the one place the collision was missed.

**Smallest fix:** `[data-document-paper] [data-index-region] { min-block-size: … }`. Apply the same
scope to the `@supports` block at `:1140-1143` for consistency (it is inert on the rail today only
because `data-passed` is never written there).

---

### W4-C2 · three e2e assertions read `data-density` off the **rail**, not the paper — blocker, confidence **high**

Same root cause as W4-C1, on the test side. Four unscoped `document.querySelector(
'[data-index-region="<key>"]')` calls resolve to the **ladder segment**, because `DocSpine`
precedes `<main>` in document order:

| site | what it reads | consequence |
|---|---|---|
| `e2e/document/lens-density.spec.ts:238` (`densityAt`) | ladder button | always `null` → `expect(hiDensity).toBe('full')` at `:251-255` **can never pass** |
| `e2e/document/lens-density.spec.ts:308` | ladder button | always `null` → `expect(density).toBe('full')` at `:312-315` **can never pass** |
| `e2e/helpers/lens.ts:475` (`blankPaperCensus` landing density) | ladder button | always `null` → `lens-fling.spec.ts:95-98` `expect(census.landing.density).toBe('full')` **can never pass** — D-B31's gate is dead |
| `e2e/document/lens-density.spec.ts:191` | ladder button's `offsetTop` | see W4-C4 |

All three cases were "did not run" in `e2e-run-w4.log` (serial abort behind the settle deadlock),
so nothing has ever exercised them. Note that `quiet-responsive-shell.spec.ts:395` already carries
the comment *"Scoped to the paper: the ladder's own row carries the same"* — the collision was
known in one lane and not carried into the others.

**Smallest fix:** prefix all four selectors with `[data-document-paper] `.

---

### W4-C3 · the wave has no e2e evidence against its own HEAD — blocker, confidence **high**

`e2e-run-w4.log` was produced at **20:05** against `document-lens/w4 @ 8545739eb`
(`e2e-baseline.md:948`). The settle fix (`b239064e0`) landed at **20:18** and the fling census +
W3-R7 budgets (`678ac82c4`) at **20:22**; the reviewed HEAD is `a13acb16c` at **20:23**. The only
run on record is therefore of pre-fix code, and it recorded **13 failures / 67 not-run**, every one
of them the D-B32 deadlock.

The consequence is not bookkeeping. The three D-B32 jest cases
(`use-lens-density.test.tsx:487/512/536`) drive `jest.advanceTimersByTime`, which the baseline
itself says is exactly the instrument that *missed* the original deadlock ("the unit suite — which
drives its own fake timers — never saw it", `e2e-baseline.md:990`). Nothing browser-side has
confirmed that a real `window.scrollTo` now settles. Under W4-C2 at least three lens cases will
still be red when it is run.

**Smallest fix:** re-run `e2e/document` (chromium + webkit) against a server booted from
`a13acb16c` per technical-design §6 (`npx turbo run dev --env-mode=loose`), after W4-C1/C2.

---

### W4-C4 · the "no root above the frame moves" test measures the rail — blocker, confidence **high**

`e2e/document/lens-density.spec.ts:174-208`

`anchorKey` comes from `regionRects()` (correctly paper-scoped) but `anchorOffsetTop` is read at
`:190-193` with an **unscoped** selector, so the offsetTop compared across the 11-step walk is the
**rail ladder button's**, which is `sticky`/`position: static` inside the spine and does not move
whatever the paper does. The assertion at `:199-203` is therefore true by construction: the test
cannot fail for the reason it exists. It is one of the two instruments standing behind H5 ("a
region above the frame growing from its reserve is the layout shift the design forbids").

**Smallest fix:** same as W4-C2 — `[data-document-paper] [data-index-region="…"]`.

---

## Major

### W4-C5 · `freeze` has no thaw commit, and any focused `<input>` — checkbox included — freezes the lens — major, confidence **high**

`hooks/use-lens-density.ts:426-428` · `hooks/use-lens-state.ts:39-40, 109-113`

Two halves of one defect.

**(a) `EDITABLE_SELECTOR` is `"input, textarea, select, [contenteditable=''],
[contenteditable='true']"`.** That is D-B19's literal wording, but on this paper it matches every
checkbox, radio, `<select>` and non-text input in the document — the approvals checklist, the care
band's closure ticks, the FF&E line controls. Focus **persists** on a checkbox after a click, so a
reader who ticks one box and then scrolls is in `editing` for the rest of the session unless
something else takes focus.

**(b) `freezeRef.current = (next) => { frozen = next; }` and nothing else.** While frozen,
`commitPending()` returns at `:227` on every rAF, so crossings buffer and nothing promotes. On
`freeze(false)` there is no commit and no queued frame: `settled` is already `true` at rest, the
settle timer is not running, so **the only thing that can drain the buffer is a subsequent scroll
frame**. D-B19 says "on `freeze(false)` one `commitPending()` runs at the next settle" — at rest
there is no next settle.

Combined failure scenario: reader ticks a checklist box on the approvals region, then flings down
the paper. `editing` holds for the whole gesture, so every crossing buffers and **no region below
promotes at all** — the fling census's `blank` class, at every frame past the last already-full
root. Un-focusing without scrolling leaves the buffered regions quiet indefinitely.

`use-lens-density.test.tsx:454-472` *asserts* half (b) as intended behaviour ("Unfreezing commits
nothing by itself"), so the suite locks the defect in. `use-lens-state.test.tsx` has no case for a
checkbox or a `<select>`; `:110` tests a `contenteditable` and a `<button>` only.

**Smallest fix:** (a) narrow the selector to text-entry inputs —
`input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([type=reset]), textarea, [contenteditable=''], [contenteditable='true']`
(drop `select` too — a `<select>` is a choice, not a field being typed into); (b) in
`freezeRef.current`, when `next === false` and `settled`, call `commitPending()` (or `queueFrame()`)
so the buffer lands on the thaw.

---

### W4-C6 · the MutationObserver retarget is one-way; a replaced paper kills discovery — major, confidence **medium**

`hooks/use-lens-density.ts:333-337, 401-405`

On the first layout effect the page is still in its loading tree, so `resolvePaper()` returns
`null` and `mutationTarget = document.body` (`:403`). When the real tree mounts, `discover()`
re-points the observer at the paper and **disconnects the body watch** (`:333-337`). From that
moment the only mutations that queue a re-discovery are ones **inside** the paper subtree.

Failure scenario: `resolutionState` flips back to `loading` (a refetch, a section change that
re-suspends, an error→retry) and React unmounts `<main data-document-paper>`. The replacement is a
new element; the mutation that created it lands on the shell, which is no longer observed. The old
observer sits on a detached node that will never change again. `discover()` never runs, `ordered`
still holds detached roots, and the lens is dead for the rest of the page's life — every region
below the frame stays quiet forever, and `markPassed`/`commitPending` write to nodes not in the
document.

There is no test for this: `use-lens-density.test.tsx:562-580` ("carries the settled state … when
the shell arrives late") appends the **shell inside the paper**, which is the inverse of the real
nesting, so it exercises the paper-targeted branch rather than the body-targeted one.

**Smallest fix:** observe `document.body` (or the shell) permanently in addition to — or instead of
— the paper; the rAF-debounced `queueDiscover` already absorbs the extra churn.

---

### W4-C7 · dangling `aria-controls` in two quiet bodies — major, confidence **high**

- `components/document/schedule/schedule-spine.tsx:1148-1165` — `RegionHead` is given
  `bodyId={scheduleBodyId}` at `:1147`, which `region-head.tsx:203` renders as
  `aria-controls={bodyId}` on the Fold button. The quiet branch replaces `<div
  id={scheduleBodyId}>` with a bare fragment, so **while the schedule is quiet the fold button's
  `aria-controls` names an id that is not on the page.**
- `components/document/previous-work.tsx:93, 106, 136` — `bodyId={hasHistory ? contentId :
  undefined}` and the `toggle-record` action's `'aria-controls': contentId`. The quiet branch
  (`quiet = density === 'quiet' && hasHistory`, `:65`) drops `<div id={contentId}>`. Same defect,
  and the file's own comment at `:90-93` states the rule it then breaks: *"naming an id that is not
  on the page both defeats the guard and points `aria-controls` at nothing."* The record is the last
  stop on the paper, so this is the state on every load until the reader reaches the foot.

Failure scenario: axe `aria-valid-attr-value`; a screen reader announces a controlled region that
cannot be reached. `lens-a11y.spec.ts` checks keyboard reachability, ring visibility and DOM order
only — no ARIA-reference validation anywhere in the wave, so nothing catches it.

The other four bodies are correct: approvals (`:641`), money (`:299`) and FF&E (`:1393`) all keep
their `id` on the quiet wrapper; care's `BODY_ID` is only referenced by `FoldSeam`, which
deliberately emits no `aria-controls` (`fold-seam.tsx:63`).

**Smallest fix:** put the id on the quiet wrapper in both files, exactly as approvals/money/FF&E do
(`<div id={scheduleBodyId}> … </div>`, `<div id={contentId}> … </div>`).

---

### W4-C8 · `contain-intrinsic-size` spends 68px, not the 112px its comment claims — major, confidence **medium**

`apps/designer-portal/src/app/globals.css:1140-1143`

```css
contain-intrinsic-size: auto var(--doc-quiet-reserve, 112px);
```

The comment above it says the fallback "favours the LARGER reserve (112px, not the 68px floor
above)". It does not: **all six bodies set `--doc-quiet-reserve` on the region root itself**
(`care-band.tsx:264`, `previous-work.tsx:75`, `project-approval-document.tsx:60`,
`money-region.tsx:53`, `schedule-spine.tsx:1117`, `ffe-section.tsx:1274`), so the `112px` fallback
is unreachable and the property resolves to `var(--doc-quiet-reserve-min)` = **68px** for five of
six regions (FF&E-with-exceptions is the only 112px case).

Failure scenario: `contain-intrinsic-size: auto <length>` spends `<length>` only while the engine
has **no remembered size** for the element. A `[data-passed]` region is by definition `full` and can
be thousands of pixels tall. On a fresh load with a restored scroll offset — the exact D-B16
"discovered above the frame" case the wave added `withinLookahead` promotion for — a passed region
is promoted and marked passed in the same commit, before the engine has laid out its contents; it
then reserves 68px for a 3,000px body. `scrollHeight` collapses, the restored offset lands
somewhere else, and the shift is precisely what D-B29's `toBe(0)` gate exists to forbid. Chromium
only (webkit ships `content-visibility`, so both engines).

Note this also puts the rule at odds with OD-4's literal contract (`[data-document-paper]
[data-passed] { … contain-intrinsic-size: auto; }` — bare `auto`, no length).

**Smallest fix:** `contain-intrinsic-size: auto;` (let the engine own the estimate, as OD-4 wrote),
or a named length that is not the quiet reserve.

---

### W4-C9 · the region suites' density mock is not a hook, so a hook-order bug is undetectable there — major, confidence **high**

Fifteen suites mock the module as
`jest.mock('@/hooks/use-lens-density', () => ({ useLensDensityStore: () => mockLensDensity }))`
(e.g. `care-band.test.tsx:34`, `approvals-region-head.test.tsx:24`, `money-region.test.tsx:16`,
`ffe-region-head.test.tsx:15`, `schedule-region-head.test.tsx:74`, `previous-work.test.tsx:9`).

The real `useLensDensityStore` consumes **two** hook slots (`useCallback` + `useSyncExternalStore`,
`use-lens-density.ts:120-130`). The mock consumes **zero**. So if any body ever calls it after an
early return or inside a branch, every one of these suites still passes and React's own
hook-order invariant is never exercised — the class of bug C-8 explicitly asks to be guarded
against ("hook-order safety in every branch, esp. `care-band.tsx`'s five branches").

I verified placement by hand and all six are currently safe: `care-band.tsx:226` sits above the
first early return at `:268` (and `indexRootAttrs` at `:258` is spread into all five branches, so
`data-density` prints in each); `previous-work.tsx:60`, `project-approval-document.tsx:543`,
`money-region.tsx:170`, `ffe-section.tsx:1078`, `schedule-spine.tsx:846` are all above their
components' returns. The finding is that **nothing keeps them there**.

**Smallest fix:** make the mock a real hook — `useLensDensityStore: (r) => { React.useCallback(()
=> {}, [r]); return mockLensDensity; }` — or mock only the store's internals and let the real
hook run. One shared helper, imported by the fifteen suites.

---

### W4-C10 · `promotedKeys` is never purged on key removal — major, confidence **medium**

`hooks/use-lens-density.ts:352-359, 373`

`discover()` purges `observed`, `committed`, `passed` and `pending` for disconnected roots, but
`promotedKeys` — the module-level store — is only ever cleared wholesale on hook teardown
(`clearStore()`, `:111-113`). `:373` then short-circuits on `promotedKeys.has(key)` and promotes
any newly-discovered root under a previously-promoted key **regardless of its position**.

D-B16 admits one narrow case for this ("one React re-created under a key the lens promoted
before"). The shipped check is much broader:

- Failure scenario A — a section switch. `paperRegionsForSection` gives a different region set per
  section. After the reader has walked section *project* to the foot (all six promoted), switching
  to *install* mounts fresh roots under the same keys; every one is promoted at discovery, so a
  region 3,000px below the frame renders `full` at first paint. That is exactly the render cost
  D-B15(b) was written to remove.
- Failure scenario B — client-side `/doc/A` → `/doc/B`. If Next reuses the page instance (no
  unmount, no `clearStore`), doc B inherits doc A's promoted key set wholesale.

**Smallest fix:** in the disconnected-root loop at `:352-359`, also
`promotedKeys.delete(observed.get(root)!)` when no other connected root claims that key; and drop
the `promotedKeys.has(key)` arm at `:373`, leaving `withinLookahead(root)` (which already answers
the legitimate re-creation case, since a re-created root is where its predecessor was).

---

## Minor

### W4-C11 · `forceFullThrough` promotes the **whole paper** when the target is not mounted — minor, confidence high

`use-lens-density.ts:419-424` — the loop breaks on `observed.get(root) === key`. A stop the spread
declares but does not mount (`lens-ladder.tsx:405-418` renders exactly that case as a
non-pressable `<div>`, so the ladder can't reach it) or one whose query has not settled is not in
`ordered`, so the loop runs to the end and `flushSync`es **every** region on the paper. The sections
sheet (`mobile-sheets.tsx:507-516`) has no mounted-check at all and will happily press an unmounted
key. One synchronous full-paper render inside a click handler.
**Fix:** `const stop = ordered.findIndex(r => observed.get(r) === key); if (stop < 0) return;` then
promote `ordered.slice(0, stop + 1)`.

### W4-C12 · `__lensSettled` resolves `true` on unmount — minor, confidence high

`use-lens-density.ts:444` calls `releaseWaiting()` in the teardown, resolving every pending waiter
with `true` even though the document never settled. An e2e wait that straddles a navigation reports
a settle that did not happen. Untested.
**Fix:** reject with a named error, or leave the promise pending and let the spec time out.

### W4-C13 · `clearStore()` mutates the store without notifying — minor, confidence medium

`use-lens-density.ts:109-113, 449`. Under StrictMode's dev double-invoke the cleanup clears
`promotedKeys` while subscriber bodies are still mounted and no `notify()` follows, so
`useSyncExternalStore`'s snapshot changes silently. It self-heals on the re-mount's `discover()`,
but the invariant "every store mutation notifies" is broken.
**Fix:** iterate `listeners.keys()` and notify, or clear via `promote`'s own path.

### W4-C14 · `data-passed` **is** written with `enabled: false`, contradicting D-B17 — minor, confidence high

`use-lens-density.ts:380` — `discover()` calls `markPassed()` unconditionally, so with the lens off
a root discovered above the frame gains `data-passed` and, through the `@supports` block, gets
`content-visibility: auto`. D-B17's measurement says "`data-passed` is not written". The
`enabled: false` test (`use-lens-density.test.tsx:340-352`) does not assert it either way.
**Fix:** guard `markPassed()` on `enabled`, or amend D-B17.

### W4-C15 · `data-region-count-line` is on three of six quiet bodies — minor, confidence high

Present: `care-band.tsx:432`, `previous-work.tsx:117`, `schedule-spine.tsx:1155`. Absent:
`project-approval-document.tsx:643`, `money-region.tsx:300`, `ffe-section.tsx:1394` (bare `<p
className="mt-1 font-mono …">`). No spec selects the attribute today, so nothing is red — but the
attribute is now a half-contract, and `lens-contrast.spec.ts:124` reaches count lines through
`[data-region-head] p`, which is a different element again.
**Fix:** add `data-region-count-line` to the three that lack it (or drop it from all six).

### W4-C16 · a quiet root can print no count line at all — minor, confidence high

`project-approval-document.tsx:644` (`countLine &&`), `money-region.tsx:301` (`countLine &&`),
`schedule-spine.tsx:1153` (`scheduleCountLine &&`), and `previous-work.tsx:65` (`quiet` is false at
`count === 0`, yet `data-density` still renders `"quiet"` at `:73`). OD-13 says "every `quiet` root
prints head + count line + one leader (never zero text)". Three of these print head + `sr-only`
leader only; the fourth states a density it does not print.
**Fix:** either print the head's own status line as the fallback count line, or accept and amend
OD-13. For `previous-work.tsx`, render `data-density="full"` when `!hasHistory`.

### W4-C17 · `care-band`'s four non-`RegionHead` branches state `quiet` while printing full content — minor, confidence medium

`care-band.tsx:258-266` spreads `indexRootAttrs` (with `data-density={density}`) into the
`completed` (`:273`), non-owner (`:301`), `closed` (`:322`) and `fold.folded` (`:339`) branches. The
first three print a complete paragraph and no `RegionHead`; with `explicit === null` their density
is `quiet`. This is the same untruthful-attribute problem D-B27 ruled `forceOpen` for on FF&E's
install/care postures, unfixed here. It also mis-feeds `blankPaperCensus`: at
`helpers/lens.ts:397-401` a quiet root with no `[data-region-head]` falls back to
`ownRoot.getBoundingClientRect().top`, so **every** frame whose centre lands inside it classifies as
`blank`.
**Fix:** `forceOpen: !indexRoot || project?.status === 'completed' || closed || !isProjectOwner`
on the care fold, mirroring D-B27.

### W4-C18 · only `lens-cls.spec.ts` asserts `__lensSettled` exists — minor, confidence high

D-B28(5) requires "the W4 specs assert `typeof window.__lensSettled === 'function'` up front so an
unbuilt server fails loudly". Only `lens-cls.spec.ts:91-95` does. `lens-density`, `lens-a11y`,
`lens-fling`, `lens-reduced-motion`, `lens-band-height` and `quiet-responsive-shell` all route
through `helpers/lens.ts settle()`, whose **tier 3** (`:87`) silently returns after two frames when
neither publisher exists. A server serving W3 code, or a W4 build where the hook throws on mount,
demotes every one of those specs to a two-frame wait and they go green measuring nothing.
**Fix:** move the assertion into `settle()` (or a shared `assertLensBuild(page)` called in each
spec's `beforeAll`), and delete tier 3 now that the attribute is unconditional.

### W4-C19 · the deep-landed case drops invariant (ii) — minor, confidence high

`lens-density.spec.ts:128-151` asserts (i) and (iii) but not `passedNotFull`, which D-B16 names as
part of the set asserted "at 0 / 400 / 1200 **and on a deep-landed load**". The deep landing is the
one scenario where a passed-but-quiet root is actually reachable.
**Fix:** copy the four lines from `:108-112`.

### W4-C20 · `useDocumentRunningIndex().jump` is now a dead pre-D-B18 press path — minor, confidence high

`hooks/use-document-running-index.ts:260-270` still exports `jump` doing
`requestRegionUnfold` → `scrollToRegion` with no `forceFullThrough`. `page.tsx` stopped
destructuring it (`:1565-1568`) and grep finds no other consumer, so it is dead — but it is a
loaded footgun sitting one autocomplete away from re-introducing D-B18's landing-on-a-quiet-root
bug, and D-B18's own gate sentence ("every `scrollToRegion(` hit is the page handler or the hook's
definition") is technically satisfied by it while its intent is not.
**Fix:** delete `jump` from the hook's return, or make it take the lens API.

### W4-C21 · `blankPaperCensus` mis-classifies a quiet root with no `[data-region-head]` — minor, confidence medium

`helpers/lens.ts:397-401`: when `querySelector('[data-region-head]')` returns null the fallback is
the root's own `top`, so `cy <= headBottom` is false for any point inside the root and the frame is
counted `blank`. Roots without a `RegionHead` exist today (care's four branches — W4-C17 — and
FF&E's install/selecting head at `ffe-section.tsx:1280`), and Wave 5's pre-work spreads will add
more. The D-B31 gate is `blank ≤ 1`, so two such frames fail the wave for a reason that is not a
lookahead miss.
**Fix:** treat a headless quiet root as `content` (there is no printed head to be below), or read
`[data-region-count-line]` as the secondary anchor once W4-C15 lands.

### W4-C22 · the "shell arrives late" test inverts the real nesting — minor, confidence high

`use-lens-density.test.tsx:562-580` appends the shell **into** the paper. In production the shell is
the paper's ancestor, and the code path that matters is `mutationTarget = document.body` (`:403`) →
retarget (`:333-337`). The test never reaches it, so the fix for the second D-B32 finding
("`data-lens-settled` is absent at rest", `e2e-baseline.md:1000-1006`) is asserted against a shape
that cannot occur.
**Fix:** build `shell > main[data-document-paper]`, mount the hook with neither present, then append
the shell to `document.body`.

### W4-C23 · schedule's count line truncates mid-token — minor, confidence high

`schedule-spine.tsx:876-878`: `line.slice(0, LENS_COUNT_MAX_CHARS).trimEnd()` can cut inside a word
or leave a trailing `·`. OD-3 caps the length; nothing says where to cut.
**Fix:** drop the last whole `·`-separated part instead of slicing.

---

## Nits

- `use-lens-density.ts:220-223` — a root whose `data-index-region` is empty is stored under `''` and
  `notify('')` fires on it. Harmless today (`document-index.ts` never emits an empty key) but the
  store is keyed on untrusted DOM.
- `use-lens-density.ts:325` — `queueFrame()` runs on every intersection callback even when no entry
  was intersecting.
- `use-lens-state.ts:82` vs `:125-128` — the ref callback writes `data-lens-state` before the effect
  has read `matchMedia`, so the shell carries `rest` for one commit at 390 before flipping to
  `mobile`. Imperative, so no hydration risk.
- `use-lens-state.ts:40` — `[contenteditable='plaintext-only']` is not matched.
- `use-lens-state.ts:57` — `isEditable` requires `closest('[data-document-paper]')`, so the standing
  sheet's and every `DocSheet`'s inputs (portalled to `document.body`) never enter `editing`. That
  follows D-B19's wording; worth a line in the deviations ledger since a sheet's field is exactly
  the "must not move under the hand" case.
- `money-region.tsx:119-121` — the `usePurchaseOrders({ projectId })` cache claim **checks out**
  (`use-money-ladder.ts:50` uses the identical filter shape, and `use-procurement.ts:211` keys on
  `['purchase-orders', filters]`), so it is not a second fetch. It is still redundant: the ladder
  already holds the rows and could expose the count.
- `globals.css:1140` — `[data-index-region][data-passed]` is narrower than OD-4's stated
  `[data-document-paper] [data-passed]`. The narrower form is better; OD-4's text should say so.
- `mobile-sheets.tsx:508-516` — `activeDoc?.onJumpRegion?.(…)` makes a press a **no-op** when the
  handler is absent, where the old code at least scrolled. `page.tsx:1731` always supplies it, so
  the optional chain is only a silent-failure surface.
- `use-lens-density.ts` — `resolvePaper()`'s `paperRef` branches (`:191-196`) are never exercised:
  every jest case calls `useLensDensity(undefined, …)`.
- `page.tsx:1579-1585` + `mobile-sheets.tsx:509` — `flushSync` inside the sheet's handler also
  flushes the pending `closeSheet()` state, unmounting the sheet and running its focus-restore
  synchronously before `scrollToRegion` queues its own focus. Order comes out right (the region
  wins, two rAFs later) but it is incidental, not designed.

---

## What I checked and found correct

- The D-B32 settle machine (`use-lens-density.ts:266-310`) reads correctly against the ruling: a
  fast frame stamps `lastFastAt` **and** arms the timer on the same frame; `onSettleTimer` re-arms
  for the remainder; a slow frame arriving while `settled` writes nothing and arms nothing. The
  three jest cases at `:487`, `:512`, `:536` cover exactly the three consequences D-B32 names.
- `data-lens-settled` presence from the first commit — `:411` plus the late-shell recovery at
  `:344-345`.
- IO lifecycle: one observer for all roots (`:390-396`), `unobserve` on promote (`:218`),
  `disconnect` + `removeEventListener` + `clearTimeout` on unmount (`:438-450`).
- SSR: `useSyncExternalStore`'s server snapshot is `() => null` (`:128`), the layout-effect first
  pass promotes before paint, and no body reads the DOM — D-B15(c) as specified, with no hydration
  mismatch (`data-density` is React-owned on all six roots and `data-lens-state`/`data-lens-settled`
  are never server-rendered).
- React vs imperative `data-density`: same element in all six bodies, and the store snapshot is read
  at render time, so the two cannot disagree. `promote()`'s `setAttribute` is only an
  earlier-than-React paint.
- `RegionHead` identity across quiet→full: the head is rendered outside the density ternary in all
  six; four suites assert it explicitly.
- The D-B27 FF&E `forceOpen` (`ffe-section.tsx:1084`) matches the ruling and preserves `ffeFolded`'s
  existing behaviour.
- `onCloseoutReady` (`care-band.tsx:222-224`) unchanged.
- The reduce block's selectors (`globals.css:315-322`) are D-B21's four, verbatim, transitions and
  animations only, sited after the `.doc-breath` block.
- `--doc-quiet-reserve-min/-exc` declared once (`globals.css:223-224`); only FF&E passes
  `exceptions` to a `RegionHead`, so the five `-min` hard-codes are correct.
- `MobileActiveDoc.onJumpRegion` carries no stale closure: `jumpToRegion` is stable
  (`lens` is `useMemo([])`, `runningIndexProjectId` is `row.project_id`) and the publish key changes
  in the same commit the row lands.
- The W3-R7 budget numbers in `lens-band-height.spec.ts:195/196/214` (205 / 265 / 435) match the
  ruling, with both engines' figures named in the comments as required.
- `press order` is one handler (`page.tsx:1579-1585`), with the sections sheet routed through it
  (D-B18's W4-int addendum) and no remaining `scrollToRegion(` caller outside the page and the
  hook's own definition — see W4-C20 for the one dead exception.

---

## Gate

`do-not-ship` until **W4-C1** (rail CSS leak), **W4-C2/C4** (unscoped e2e selectors),
**W4-C5** (freeze), **W4-C6** (mutation retarget), **W4-C7** (aria-controls), **W4-C8**
(`contain-intrinsic-size`) are fixed and **W4-C3** (a chromium + webkit `e2e/document` run against
the fixed HEAD) is on record. W4-C9 and W4-C10 should land in the same pass — both are cheap and
both are load-bearing for the wave's own claims.

---

# Sign-off

**Target** `document-lens/w4-fix` @ `f76ba828a` (7 commits over `document-lens/w4@a13acb16c`).
**Read** `git diff a13acb16c..f76ba828a` (41 files, +1708/−465), `build/w4-fix-log.md`, the four new
deviations, `technical-design.md` §5/OD-4. Read-only; no git, no servers, `:3000` untouched.

**SIGNED — no gating ids.**

Every one of the eight gating ids is closed with a falsifier I could locate and read, and C3's
missing evidence is closed by a real run against this branch (chromium 60 passed / 0 failed / 0
not-run; webkit 31 / 0, 2 self-skipped). Thirteen new findings below, all minor or nit; the one
worth the design lead's attention is **W4-N-02** (D-B34's chrome predicate is a denylist, not the
allowlist its own ruling describes), and it rides the D-B34 ruling the lane has already flagged.

## Disposition

| id | ruling | where |
|---|---|---|
| **W4-C1** rail CSS leak | **CLOSED** | `globals.css:1122` + `:1073` both re-scoped `[data-document-paper]`; the pre-existing `scroll-margin-top` rule leaked identically and went with it. Falsifier `lib/document/__tests__/lens-css-scope.test.ts` (5 cases) — see the non-vacuity note below. Browser proof: every ladder stop computes `min-block-size: 0px`, six stop rows at 39.9px, track 372.08px. |
| **W4-C2** unscoped e2e density reads | **CLOSED** | `lens-density.spec.ts:271`, `:341`; `helpers/lens.ts:505` — all three paper-scoped, and `blankPaperCensus`'s `closest()` walk gained a paper requirement at `helpers/lens.ts:415-417` (a case I had not named — the sticky rail can overlap the frame centre). `grep` finds no unscoped `[data-index-region=` left in `e2e/`. |
| **W4-C3** no e2e against HEAD | **CLOSED** | chromium 60/0/0 over the nine lens specs + `desk-walkthrough`; webkit 31/0. Numbers printed in the log: fling census `blank=0` (46 frames chromium, 25 webkit), CLS paper 0/0, D-B28 census 0 Supabase requests, band 56px in all eighteen cells both engines, OD-4 find-in-page PASS. No fixmes added. |
| **W4-C4** rail `offsetTop` instrument | **CLOSED** | `lens-density.spec.ts:208-215` paper-scoped, and the baseline moved to the **quiet** s0 (`:189-198`) — the right fix for a real second defect (an 11px data arrival between the first settle and the first step), not a widening. |
| **W4-C5** editing freeze | **CLOSED** | (a) `use-lens-state.ts:39-56` — exclusion form, so an `input` with a novel/invalid `type` still counts; `select` dropped; `plaintext-only` added. (b) `use-lens-density.ts:497-508` — `freeze(false)` while already settled queues a frame. The reasoning that an unsettled document always has its timer armed is correct (`runScrollFrame` arms on the same frame it unsettles), and the freeze-then-settle-then-thaw path lands on the `settled` arm. The test that asserted the defect is replaced by two. |
| **W4-C6** MutationObserver retarget | **CLOSED** | `use-lens-density.ts:461-474` — body for the hook's life, retarget deleted, `mutationTarget` gone. Falsifier: "re-discovers when the paper element itself is replaced". See **W4-N-11** for the cost this buys. |
| **W4-C7** dangling `aria-controls` | **CLOSED** | `schedule-spine.tsx:1158` and `previous-work.tsx:121` put the body id on the quiet wrapper. Chose the form the four correct organs already use rather than dropping `aria-controls` — right call. Falsifier walks **every** `[aria-controls]` in the quiet render and resolves it. |
| **W4-C8** `contain-intrinsic-size` 68 vs 112 | **CLOSED** (superseded) | The finding was taken (`--doc-passed-reserve` on `:root`), then the whole block was deleted under D-B33. The measurement survives in `globals.css:1129-1156` and the token stays declared and gated. |
| **W4-C9** density mock | **CLOSED** | 0 remaining `jest.mock('@/hooks/use-lens-density'…)` across all 15 suites; `__setDensityForTest` (`use-lens-density.ts:107-133`) is read by `densityFor` alone, so the real two-slot hook runs everywhere and a conditional call now throws where a suite sees it. Every suite seeds in a top-level `beforeEach`, so no intra-file leak (see W4-N-13). |
| **W4-C10** `promotedKeys` purge | **CLOSED** | `use-lens-density.ts:391-407` purges with a `notify` when a key's last connected root leaves, and the bare `promotedKeys.has(key)` promotion arm is gone — position is the whole test. Two falsifiers, including the legitimate D-B16 half (a root re-created *where its predecessor was* is still promoted). Note the purge is keyed on `stillClaimed`, so a paper replaced under the same six keys keeps them — correct, because the scroll position survives with them. |
| **W4-C11** whole-paper flush | **CLOSED** | `use-lens-density.ts:494-496` — `findIndex`, early return, `slice(0, stop+1)`. |
| **W4-C12** `__lensSettled` resolves on unmount | **CLOSED** | `use-lens-density.ts:240-247`, `:528-530` — teardown rejects with a named error; `settle()` still resolves. See W4-N-09. |
| **W4-C13** silent `clearStore` | **CLOSED** | `use-lens-density.ts:135-145` notifies every key it clears. |
| **W4-C14** `data-passed` with the lens off | **CLOSED** | `use-lens-density.ts:275-281` early-returns. D-B17's measurement made literal. |
| **W4-C15** `data-region-count-line` on 3 of 6 | **CLOSED** (moot) | The attribute is gone from all six product bodies under W4-R1. It survives in seven **test** files as negative assertions ("prints no count line") — which is the right place for it, not a contradiction of the log's "grep finds none in `src/`". |
| **W4-C16** quiet root with no text | **CLOSED** | The head's own status line is now the count line and `statusLine`'s `Nothing yet` / `Not known yet` fallback guarantees text (`lens-quiet-status.ts:37-47`); `previous-work.tsx:78` states `full` at count 0. |
| **W4-C17** care's untruthful `quiet` | **CLOSED, my `!indexRoot` arm DISPUTED — the lane is right and I withdraw it.** `care-band.tsx:233-251` forces open the three whole-paragraph branches. The `!indexRoot` arm I proposed was wrong twice over: with `indexRoot` false the component spreads `{}`, so there is no `data-density` to be untruthful, and `forceOpen` would have made the second `CareBand` mount refuse the designer's own fold (`folded=false`, `setFolded(true)` a no-op) — which their suite caught. The folded branch is correctly excluded (a `FoldSeam` is a legitimate quiet form, and an explicit fold is `full` anyway). |
| **W4-C18** silent third settle tier | **CLOSED** | `helpers/lens.ts:42-69` `assertLensBuild()`, tier 3 deleted. Waiting rather than reading once is the right refinement — the publisher installs in a layout effect. |
| **W4-C19** deep-landed (ii) | **CLOSED** | `lens-density.spec.ts:144-152`. |
| **W4-C20** dead `jump` | **CLOSED** | Removed from `use-document-running-index.ts` and its interface; the three cases repointed at `requestRegionUnfold`, which is the half that hook actually owns. |
| **W4-C21** headless quiet root reads blank | **CLOSED** | `helpers/lens.ts:426-432`. Now defensive rather than load-bearing: after C17 and D-B27 every root either has a `RegionHead` or is `forceOpen`, so no headless *quiet* root should exist. Honest either way. |
| **W4-C22** inverted late-shell test | **CLOSED** | Builds `shell > main[data-document-paper]` and appends the shell to `document.body`. |
| **W4-C23** mid-token truncation | **CLOSED** | `lens-quiet-status.ts:37-47` drops whole `·` segments; a single over-long segment is kept whole ("a truncated fact is a wrong fact"). Two dedicated cases. |

### The four no-change minors — all ACCEPTED

1. **Sheets never enter `editing` (D-B36)** — accept as a ruling. It is D-B19's wording, the paper
   cannot move under a fixed overlay, and the residual (a region promoting *behind* an open sheet)
   is bounded: promotion only ever happens at or below the lookahead line, i.e. below the frame, so
   nothing the reader can see through or around the sheet moves. Worth one line in D-B36 saying so,
   because that is the reason the risk is acceptable rather than merely unmeasured.
2. **OD-4's narrower selector** — moot, the rule is deleted. Accept.
3. **One-commit `rest` at 390** — accept. My own finding said imperative, pre-paint, no hydration
   risk; a `matchMedia` read in a ref callback to save one frame of an attribute nothing renders
   from is the worse trade.
4. **`flushSync` / `closeSheet` ordering** — accept. I confirmed the order comes out right;
   sequencing the two focus restores is a behaviour change no ruling asks for.

## The specific checks

**C1's gate is non-vacuous.** `lens-css-scope.test.ts` has four real teeth and one guard: case 1
splits each selector on `,` and fails any **arm** that mentions `[data-index-region]` without
`[data-document-paper]` ahead of it (`:54-72`); case 2 asserts `guarded.length >= 2`, so deleting
the rules cannot make case 1 pass by having nothing to check (`:74-81`); case 3 is a direct regex
ban on a shell-scoped arm (`:83-87`); cases 4–5 hold D-B33 and the reserve token. Comments are
blanked-not-removed so line numbers survive, and the selector regex reads the blanked text — which
matters, because the documentary comment that replaced the deleted block *quotes*
`[data-document-paper] [data-index-region][data-passed]` and `content-visibility: auto` in prose,
and both cases would false-positive without it. The lane's own falsifier (revert the scope → 2
cases red naming `globals.css:1104`) is the right proof. One gap: **W4-N-10**.

**C2/C4's paper-scoped queries** — verified all four sites plus the census `closest()` walk. The
**forward-walk** replacement for the bisection is a genuine improvement, not a weakening: the
lens never demotes, so a bisection that scrolls back up re-reads a root its own probe already
promoted — the instrument was destroying its own state, and their measurement
(`[{y:0,full},{y:40,full},{y:80,full}]` on a target the same test had just called quiet) proves it.
The candidate filter gaining `&& r.density !== 'full'` is also right: `data-density` is the fold's
answer and the lens is its fourth voice, so a `forceOpen` region is `full` at s0 however far down
it sits. The walk still asserts exactly one transition and no `full → quiet`, and now also asserts
`sawFull` with the full readings printed — it cannot pass vacuously.

**C5's selector and drain** — both verified above. The exclusion form is the right shape (`type` is
ASCII-case-insensitive for selector matching on `input`, so a `TYPE="Checkbox"` is still caught),
and `date`/`time`/`search` remaining in scope is correct: those are typed into.

**C6's body-level MO** — correct, and strictly containing. Cost noted as W4-N-11.

**C9's `__setDensityForTest`** — it genuinely closes the finding: the store is real, the hook is
real, both slots are consumed, and a conditional call would now throw. One shipped-path cost: a
module-level mutable global with a one-line branch in `densityFor`. Documented and acceptable.
Note it sets *every* region at once (the `region` argument is ignored on the test path), which is
fine for these suites but cannot express "approvals full, money quiet".

**C10's purge + notify** — verified. The disconnected-root loop is the right hook (a replaced paper
leaves its roots detached, so `isConnected` is false and the purge runs).

### D-B33 — is the `content-visibility` diagnosis sound? **Yes.**

The ablation is single-variable and clean: 0.8658 → 0.000986 with one declaration removed and
nothing else changed. The counter-hypothesis was tested and falsified to sixteen digits (deferring
`data-passed` two frames — so the engine has a real last-remembered size before it may ever skip —
returned `0.8657658230921531` *both* runs). And the mechanism explains the evidence exactly:
`contain-intrinsic-size` governs the **contained element's own box**, but a `layout-shift` entry
records **descendants** moving, and a skipped subtree reports zero rects for all of them. That is
precisely the named signature — a `FoldSeam` subtree 219.73 → 40.94 and four `li#ffe-selection-…`
rows zeroing and returning. **No value of `contain-intrinsic-size` could have fixed it**, so
"never a CSS change that tries to keep both" was the correct read of OD-4, and deleting the block
is OD-4's own pre-agreed failure move. Taking it is right.

**Does anything else depend on `content-visibility`?** Two things, and neither breaks:

- **Find-in-page.** OD-4's whole reason for `contain-intrinsic-size` over `display: none` was that
  find-in-page must still reach a passed region. With nothing skipping, it trivially does — the
  gate passes and is now near-vacuous (see **W4-N-04**). Nothing is lost; the sentence it proved
  is void with the rule.
- **Render cost / memory on the long paper.** The block was the only thing reclaiming work
  *behind* the reader. With it gone, L-4/F53's budget rests entirely on quiet-until-promoted
  *ahead* of her, and the paper carries its full DOM live once walked. That is the pre-R127 status
  quo — every region was always full before this wave — so it is not a regression, but it does
  make L-4 one-directional, and D-B33 should say so where it says the candidate is open.

The one thing the deletion leaves behind is **`data-passed` with no reader at all** — see
**W4-N-03**.

### D-B34 — is the CLS split honest? **Half of it is exemplary; the predicate is too wide.**

Honest, and I want it on the record: an entry with **zero sources**, an entry with a **null source
node**, and an entry **mixing** paper and chrome sources all count as **paper** and are gated
(`lens-cls.spec.ts:155-160`). Every ambiguous case falls on the strict side. The paper's gate stays
`toBe(0)` with no tolerance, and both numbers are printed every run.

But `isChrome` is `node.closest('[data-lens-band]') || !node.closest('[data-document-paper]')`.
The second arm exempts **everything outside the paper**, not the rail and the band that D-B34's
text, the variable name and the log line all describe: the mobile bar, every `DocSheet`, the
command bar, overlays, toasts, and anything portalled to `document.body`. Today's exposure is nil
(the spec runs chromium at 1440, where the bar is `display: none` and no sheet opens during the
scroll), which is why this is not gating — but the gate now says "the paper is 0" while the
instrument means "everything I could not prove is paper is excused". The band arm is the one
substantive in-paper exemption and it is justified — a shift *inside* a 56px sticky constant moves
no paper — though note it now leans on the band-height gate to stay true. **Ruling wanted with
D-B34:** make it an allowlist (`[data-document-spine]`, `[data-lens-band]`,
`nav[aria-label="Document bar"]`) and count everything else as paper. Recorded as **W4-N-02**.

### D-B35 — is the layout box the right measure? **Yes.**

`boundingBox()` goes through CDP `DOM.getBoxModel`, which returns compositor quads; a
`position: sticky` element's quads carry the compositor's fractional sticky offset and device-pixel
snapping. The tell is in their own evidence: **55.985 then 56 on two consecutive runs of an
unchanged box** — non-determinism across identical runs is an instrument artefact, where a layout
defect would be stable. Against that, `getBoundingClientRect().height`, `offsetHeight` and the
computed `height` all read exactly 56 and 44 in both engines at all three widths. The contract is
about the declared box, so measuring the layout box is measuring the right thing. Refusing an
engine allowance and a `44.5px` floor was the correct discipline — either would have hidden a
future regression behind a number that was already right — and printing the composited figure
beside it keeps the artefact visible. For C-02 specifically the tap-target claim is also carried by
the `elementFromPoint` hit test 2px inside each edge, which is the stronger falsifier and survives.
One site was missed: **W4-N-05**.

### Item 15 — the bar's third line and `data-sections-door`

`mobile-bar.tsx:251-268` pre-prints the line and swaps it with `invisible` + `aria-hidden`, inside
the existing 72px reserve — A-01's ruled form, and it removes a mount/unmount of the door's subtree
on every crossing. `At {stopLabel ?? ' '}` keeps the box occupied. It also composes correctly
with D-B21's instrument: `visibleWordSet` excludes `visibility: hidden`, so the placeholder never
enters the compared set at either motion register. `data-sections-door` on the button and the
spec locating by it (`quiet-responsive-shell.spec.ts:242`) is right — OD-11/A-01 deliberately makes
the accessible name volatile, so a name-based locator was racing the thing it measures.

## New findings

| id | severity · confidence | file:line | what |
|---|---|---|---|
| **W4-N-01** | minor · high | `schedule-spine.tsx:82, :137` | `railDay()` and the `LENS_COUNT_MAX_CHARS` import are dead — `lens-quiet-status.ts` owns both now. **Fix:** delete both. |
| **W4-N-02** | minor · high | `lens-cls.spec.ts:155-160` | D-B34's `isChrome` is a denylist (`!closest('[data-document-paper]')`), so it exempts the bar, sheets, overlays and portals as well as the rail and band its own text names. Zero exposure at 1440/chromium today. **Fix:** allowlist the three chrome roots. Rides the D-B34 ruling. |
| **W4-N-03** | minor · high | `use-lens-density.ts:275-289` | `data-passed` now has **no reader anywhere** — the deleted `@supports` block was the only one. `markPassed()` still costs a `getBoundingClientRect()` per un-passed root on every scroll frame and every discovery. Keeping the write as the OD-4 candidate's hook is defensible; D-B33 should record that it is currently unconsumed. |
| **W4-N-04** | minor · medium | `quiet-responsive-shell.spec.ts:410-425` | The OD-4 case's whole comment block still describes the deleted rule and an "EXPECTED RED until W4-L1/L2/L3". The test can no longer fail for a `content-visibility` reason; it is now a `data-passed`-is-written guard. **Fix:** relabel it as the D-B33 regression guard. |
| **W4-N-05** | minor · high | `quiet-responsive-shell.spec.ts:235` | Still `expect.poll(() => band.boundingBox()?.height).toBe(56)` — the exact composited-quad instrument D-B35 replaced everywhere else. `expect.poll` hides it by retrying until a frame reports 56, which is a flake rather than a fix. **Fix:** `layoutHeight()`. |
| **W4-N-06** | minor · high | `previous-work.tsx:76, :106-116` | Pressing **Open the record** while the region is quiet sets `aria-expanded="true"` and flips the label to `Fold ↑`, but `quiet = density === 'quiet' && hasHistory` ignores `open`, so the wrapper still renders only the sr-only sentence. A disclosure that says expanded and shows nothing. Narrow reachability (the lens frozen by `editing`, or focus landing before a settle) but real. **Fix:** `const quiet = density === 'quiet' && hasHistory && !open;`. |
| **W4-N-07** | nit · high | `care-band.tsx:241` vs `:293` | `bandIsProjectOwner` and `isProjectOwner` are two spellings of one predicate; only the second survives into the render. **Fix:** compute once above the hook and use it in both places. |
| **W4-N-08** | nit · high | `helpers/lens.ts:56-68` | `try { waitForFunction } catch { expect(false, msg).toBe(true) }` discards the timeout's own stack. **Fix:** `.catch(() => { throw new Error(msg) })` or assert on the awaited boolean. |
| **W4-N-09** | nit · medium | `use-lens-density.ts:528-530` | The C12 rejection is correct, but a navigation mid-`__lensSettled()` now emits an unhandled promise rejection in the page console. No spec asserts a clean console today, so it is latent. |
| **W4-N-10** | nit · high | `lens-css-scope.test.ts:23` | The gate reads only `globals.css`. A `[data-index-region]` rule in any other stylesheet or CSS module escapes it. **Fix:** glob the app's CSS. |
| **W4-N-11** | nit · medium | `use-lens-density.ts:474` | Correct for C6, but the watch is now `document.body {subtree: true}` for the hook's life, so any DOM mutation anywhere (sheets, toasts, command bar) queues a `discover()` — two `getBoundingClientRect()` per root (`withinLookahead` + `markPassed`). rAF-debounced to one per frame, so bounded, but during a continuous animation elsewhere it is a sustained forced reflow that used to be paper-scoped. |
| **W4-N-12** | nit · medium | `globals.css:1073` | Re-scoping the landing rule shell → paper also removes `scroll-margin-top: 72px` from the rail's ladder stops, which the roving tabstop focuses. Almost certainly right (the rail is not a scroll target) but it is a behaviour change riding a scoping fix, with no test either way. |
| **W4-N-13** | nit · low | `care-band.test.tsx:63`, `previous-work.test.tsx:15` | Seed `__setDensityForTest` in a `beforeEach` but never reset in an `afterEach`; harmless (per-file module registry, and the `beforeEach` re-seeds) but 13 of 15 suites do reset, and the asymmetry invites a copy-paste that leaks. |

Also noted, not findings: `scheduleQuietStatus`'s `now = new Date()` default is captured inside a
`useMemo` keyed on the phase data, so "N days out" will not tick over midnight on a page left open
— cosmetic, and the same shape the rest of the document uses. And `lens-css-scope.test.ts:98-103`
is a gate that *requires* a dead token (`--doc-passed-reserve`) to stay declared; intentional as a
breadcrumb for the OD-4 candidate, worth a comment if the candidate is ever closed out.

## Open for the design lead (unchanged by this pass)

D-B34's scope (and W4-N-02 with it), W4-R1's approvals sr-only cell, D-B33's now-open OD-4
candidate, and D-B36. None of them gate the wave.

**SIGNED — no gating ids.**

---

# Sign-off fix-3

**Target** `document-lens/w4-fix3` @ `7500ca445` (3 commits over `document-lens/integration@99cc6d135`).
**Read** `git diff 99cc6d135..7500ca445` (12 files, +808/−22), D-B46, D-B47, the D-B18 addendum.
Read-only; no git, no servers.

**NOT SIGNED — W4F3-01.**

One gating finding, in the resolution gate's own fallback. Everything else is minor or nit, and
the machine's core — the three conditions, the cascade, the re-check, the press exemption — is
sound and correctly reasoned. Two of the coordinator's sharpest questions come back clean: the
inline pulse **does** let the paper resolve, and `transformsStill` does **not** wait on `doc-breath`.

## The one that gates

### W4F3-01 · the 3000ms deadline resolves a paper that does not exist yet — major · high

`use-lens-density.ts:378-383, 650`

`sampleResolution` is careful: `height > 0`, `!loading`, `fetchingRef.current === 0`, three stable
frames — a paper with no height is explicitly refused ("A paper with no height yet is not a paper
that has settled at zero"). **`markResolved` has none of those guards**, and both escape hatches
call it directly:

- `resolveDeadline = setTimeout(markResolved, LENS_RESOLVE_MAX_MS)` is armed at **effect time**,
  which is page mount — above the early returns, before `[data-document-paper]` exists at all.
- `sampledFrames >= MAX_RESOLVE_FRAMES` calls it the same way.

Two failure scenarios, both the D-B46 defect through the fallback door:

1. **No paper at t=3000** (a slow document-state query, a retry, a cold dev compile). `ordered` is
   empty so the cascade promotes nothing — but `resolved` latches `true` forever. Every root the
   `MutationObserver` finds afterwards then takes `discover()`'s `resolved && withinLookahead(root)`
   arm (`:593`) and is promoted **against the skeleton it mounts into** — exactly the reading D-B46
   forbids, and one direction means it never comes back.
2. **A 400px skeleton at t=3000** (the case the deadline is written for: "a query retrying, a
   poller"). The cascade runs `withinLookahead` against a 400px paper, so every root is inside
   `innerHeight + 240` and all six promote — verbatim the lead's measured defect (`record` full
   9,033px down).

The deadline's stated intent, "against whatever is laid out", is right; the code does it when
*nothing* is laid out. And the exposure is worst under a cold dev compile, which is where the
lane's own cold-load e2e case runs — so a green run there is partly a timing accident, and the
case is flaky in the direction that hides this.

**Smallest fix:** start the 3000ms clock at the first sampled frame where `paper.scrollHeight > 0`
rather than at mount (one line in `sampleResolution`, plus arming the timer there instead of at
`:650`). Equivalently: `markResolved` re-arms for another `LENS_RESOLVE_MAX_MS` if
`resolvePaper()?.scrollHeight` is falsy. Either keeps "the lens can never hang quiet" while
refusing to measure a paper that is not there.

## The specific checks

**The three conditions.** `fetchingRef.current === 0 && !loading && height > 0 && height ===
lastHeight`, counted to `LENS_RESOLVE_STABLE_FRAMES = 3`. Correct, and the added `!loading`
condition is the right call: the lane's reasoning that the readiness queries are *dependent*, so
`isFetching` returns to 0 in the lull between waves while the paper is still a skeleton, matches
D-B28's own probe (0 readiness requests before the scroll, 63 at steps 17–25). The fetch count
alone genuinely is not enough.

**`useIsFetching` fed by ref — stale?** No. `fetchingRef.current = fetching` is assigned on every
render and the rAF reads `.current` at call time, so the sampler always sees the last **rendered**
count; when the count does not change there is nothing to be stale about. Taking the client from
`useContext(QueryClientContext)` with a module-level standby rather than letting `useIsFetching`
throw without a provider is the right defensive shape for a hook that attaches unconditionally.
Two costs, both noted below: **W4F3-06** (an unfiltered `useIsFetching` re-renders the whole
document page on any query anywhere) and **W4F3-16** (this suite mocks the module away, so the
no-provider path it argues for is proven only by the other suites).

**The `.animate-pulse` / `aria-busy` query per rAF — cost.** Bounded: the sampler stops at
`markResolved`, so at most `MAX_RESOLVE_FRAMES` = 188 `querySelector` walks inside a ≤3s window,
never per-frame for the life of the page. Acceptable.

**Does W5-R3's inline pulse ever let the paper resolve? — YES.** I checked every
`.animate-pulse` and `aria-busy` that can stand inside `[data-document-paper]`, and **every one is
mounted behind a loading flag**: `schedule-spine.tsx:1150` (`loading &&`), `ffe-section.tsx:1300`
(`isLoading &&`), `:1387` (`!readinessQuery.isError && readinessQuery.isLoading &&`), `:1390`
(`isLoading &&`), `project-approval-document.tsx:927` (`approvalsQuery.isLoading ||
authorityQuery.isLoading`), `account-band.tsx:228`, `authorizations-ledger.tsx:168` (`isLoading
&&`), `project-mood-boards.tsx:241` (`if (isLoading)`), `phase-advance-control.tsx:307` (`if
(actions == null)`), `section-stage-line-mount.tsx:85` (its loading branch), and
`document-action.tsx:172/201` (`loading ?` / `loading || undefined`). "Prints at quiet AND full"
means it rides the head's status line at **either density** — not that it prints unconditionally.
`SectionLoadingLine` itself carries `role="status" aria-live="polite"` and **no `aria-busy`**, so
it is matched by the `.animate-pulse` arm alone, which is exactly what the gate wants. The paper
resolves. One consequence worth stating: `document-action.tsx`'s pulse fires on any **mutation**,
so an act pressed during the load defers resolution to the 3000ms deadline — narrow, and the
deadline is the right answer. The coupling itself is the concern: **W4F3-03**.

**`flushSync` inside a rAF callback — legal.** React's guard fires for render and lifecycle
(commit) phases; a `requestAnimationFrame` callback and a `setTimeout` callback are neither, so
neither caller of `markResolved` can trip it. The cascade is right for the reason stated: the
paper's geometry is a function of the pass's own decisions, and only a flush makes each promoted
body's height exist before the next root is measured. **N is bounded** by the `break` on the first
uncommitted root outside the lookahead, and the `continue` on `committed` correctly lets a
press-promoted root be skipped without stopping the walk — 2–3 in practice on the seeded paper.
Two interactions:

- **`freeze`** — the cascade promotes directly and does **not** consult `frozen`; only the trailing
  `commitPending()` does. Resolution can now land up to 3s after mount, which is long enough for a
  reader to be in a field. **W4F3-05**; bounded, because promotion only happens at or below the
  lookahead line, so nothing above the frame moves.
- **`forceFullThrough`** — correctly ungated by `resolved` (D-B46 (2) as ruled), and my W4-C11
  early return still stands, so a press for an unmounted key is a no-op rather than a whole-paper
  flush.
- **unmount mid-cascade** — `stopped` is checked once at the top and not re-checked in the loop.
  **W4F3-18**, nit.

**`commitPending`'s re-check.** The mechanism is right and the reasoning is exactly correct: an IO
entry is queued at the end of the frame that computed it, so an entry measured against a skeleton
can land against a 10,636px paper. Re-measuring at the moment of the write is the only honest test.
And the two tests are the **same line** — `withinLookahead` is `top <= innerHeight + 240`, which is
the observer's own `rootMargin` bottom edge — so a root that fails the re-check has genuinely left
the observation box and the IO will fire for it again when she reaches it. The comment's claim
holds. It has **no falsifier**: **W4F3-02**.

**`markPassed` / settle unchanged** — confirmed, no hunks. One consequence: `markPassed` runs
before resolution, so a reader scrolling during the load can produce a root that is `data-passed`
**and** `quiet`, which D-B16 invariant (ii) and §5's contract both forbid. No consumer reads
`data-passed` today (my W4-N-03) and `settle()` now waits for resolution, so no spec samples in
that window — but the contract is false there. **W4F3-09**.

**`data-lens-resolved` written once** — `writeResolved` guards on `hasAttribute`, `discover()`
re-writes it when the shell is replaced, the teardown removes it. Correct. It is imperative only
and never React-rendered, so there is **no SSR or hydration exposure** — same for
`--doc-mobile-bar-height`, which is written to `document.documentElement.style` inside an effect.
The one gap is that `resolved` is one-way and never re-armed when the paper element itself is
replaced: **W4F3-04**.

**`LENS_RESOLVE_*` constants** — `3` frames and `3000` ms match D-B46, are documented at the
declaration, and `MAX_RESOLVE_FRAMES = ceil(3000/16) = 188` is correctly described as
never-binding in a browser (a throttled background tab makes the timer win) and existing for
suites that stub rAF synchronously.

**The bar's ResizeObserver (D-B47).** Correct on every axis I checked. SSR: effect-only. Unmount:
`clear()` on both return paths and in the observer teardown. 1440: `min-[1180px]:hidden` gives a
zero box, so `publish()` clears and the desktop inset is untouched — and RO still fires when the
element regains a box on a narrow resize, so 1440 → 390 republishes. The `if (offer) return null`
early return sits **after** the effect, so hook order holds, and the `!barRef.current` branch
covers the render where the bar is not laid out. `Math.max(72, Math.round(height))` matches the
ruling, and the CSS reads the property from `html` in both places (`.document-route-shell`
inherits it; `html:has(…)` reads it on itself). Three nits: **W4F3-13** (RO watches the content box
while the published value is the border box, so a padding-only change such as a safe-area shift on
rotation republishes nothing), **W4F3-14** (two bars would fight over one `html` property),
**W4F3-17** (no e2e exercises the resize republish).

**`onPromoteThrough` and the line-jump order.** `mobile-sheets.tsx:748-758` runs **promote →
`scrollIntoView` on the line → `openMarginItem`**, which is the stated order, and the promotion is
`flushSync`ed so `getElementById('ffe-selection-…')` resolves on the next statement. Calling
`flushSync` from a React event handler is legal, and the sheet deliberately is not closed first
(D-B30's own reasoning). `forceFullThrough('ffe')` finds `ffe` in `ordered` because the region root
always mounts, quiet or not, so the W4-C11 early return does not bite. One nit: **W4F3-10**, the
field is optional.

**`settle()`'s animation wait.** Bounded by construction — `timeout: 1_500` with a `.catch(() =>
{})`, so it can never fail a wait, only stop shortening one. `animate-pulse` is excluded twice
over: Tailwind's pulse is `infinite`, caught by the `timing.iterations === Infinity` arm before the
name regex is reached. **It does not wait on `doc-breath`** — `globals.css:297` is
`doc-breath 3s ease-in-out infinite`, so the same arm excludes it, and `doc-breath` animates
`opacity` only and never scales a rect. What it does wait on is `doc-raise`
(`page.tsx:2211`, 270ms, `scale(0.986) → 1`), which is the animation that produced the 55.985
reading D-B35 diagnosed — the right target, and a genuinely better fix than the layout-box read
alone. Also waits out finite CSS **transitions** (no `animationName`, so they fall to `playState`),
which is correct. One nit on cost: **W4F3-15**.

**The restated `:203` instrument — is it H5-honest? Mostly.** The reasoning is right: the old
"every root's offsetTop unchanged" held *only because* the lens had already promoted everything off
a skeleton, so it was passing on the strength of the defect. Splitting it into "full-at-origin must
not move at all" (exact) and "quiet-at-origin may only be pushed down" is the honest restatement,
and it is H5's actual sentence — opening a region grows it downward from its own top, so no root at
or above the frame moves. The gap is that `>=` is unbounded and says nothing about *when* the
quiet root moved; the case that used to cover that (`no root above the frame top ever moves`)
anchors on `rects[0]` alone, so four of six roots now have no per-root guard. **W4F3-08**.

**The cold-load case.** `localStorage.clear()` on `/desk` **does** clear the
`patina:doc-fold:<docId>:<region>` keys — same origin, and `use-region-fold.ts` reads them from
`window.localStorage` — so no explicit fold can stand in for a density the lens is deciding. It is
broader than it needs to be (**W4F3-12**), and a full `page.goto` genuinely does give an empty
in-memory query cache, so "cold by construction" is true. The map is asserted by key with the
measured tops printed in the failure message, which is the right shape. The **warm** case is the
weak one: it is a second full navigation, so the QueryClient is empty there too — it warms the
HTTP/RSC caches, not the query cache, which is what D-B46's warm paragraph is about.
**W4F3-07**.

**Fake timers vs the real-timer defect class.** The suite drives `advanceTimersByTime` for both the
rAF sampler and the deadline, so it proves the state machine but not that a real browser reaches
three stable frames — the same blind spot that hid D-B32 (`e2e-baseline.md:990`: "the unit suite —
which drives its own fake timers — never saw it"). The two cold-load e2e cases are the only
real-timer proof of D-B46 and must stay; W4F3-01 is the reason to distrust the current green on
them. Two fixture notes: `flush()`'s default moved 32 → 96ms globally (**W4F3-11**), and
`CapturingIntersectionObserver.fire` now moves its target to the line (**W4F3-02**).

## Findings

| id | severity · confidence | file:line | what |
|---|---|---|---|
| **W4F3-01** | **major · high** | `use-lens-density.ts:378-383, :650` | The 3000ms deadline and `MAX_RESOLVE_FRAMES` call `markResolved` with none of `sampleResolution`'s guards, so the lens can resolve with no paper (latching `resolved` so every later root promotes off its skeleton) or against a 400px one (promoting all six). D-B46 through the fallback door. **Fix:** start the deadline at the first frame where `paper.scrollHeight > 0`, or re-arm when it is falsy. |
| **W4F3-02** | minor · high | `use-lens-density.ts:332-347`; `use-lens-density.test.tsx:61-68` | `commitPending`'s `withinLookahead` re-check — the mechanism that stops a stale entry promoting `money` at 7,691 — has no falsifier, because `fire()` now moves every target to the line so no fired entry can fail it. **Fix:** one case that fires an entry, moves the root past the line, resolves, and asserts it stays quiet and is still observed. |
| **W4F3-03** | minor · high | `use-lens-density.ts:97` | Resolution is coupled to the Tailwind utility `.animate-pulse`. Every current pulse is a real loading register, but nothing owns that: a decorative pulse added to the paper later silently pushes every load to the 3000ms deadline, with no gate to catch it. **Fix:** a `data-loading-register` attribute on `SectionLoadingLine` and the skeletons, and gate on that (keep `aria-busy`). |
| **W4F3-04** | minor · medium | `use-lens-density.ts:282` | `resolved` is one-way and never re-armed. If the paper element is replaced (the W4-C6 loading round-trip), `discover()` promotes roots measured against the new skeleton. **Fix:** re-arm the gate when `resolvePaper()` returns a different element. |
| **W4F3-05** | minor · high | `use-lens-density.ts:394-405` | The resolution cascade promotes without consulting `frozen`; only the trailing `commitPending()` respects the freeze. Resolution can land up to 3s after mount, inside an editing session. Bounded (nothing above the frame moves). **Fix:** skip the cascade while frozen and run it on thaw, or state the exemption in D-B46. |
| **W4F3-06** | minor · medium | `use-lens-density.ts:252` | `useIsFetching(undefined, …)` is unfiltered, so `DocumentPageBody` now re-renders whenever the fetch count changes for **any** query in the client — including off-paper ones — for the life of the page, and ~120 times during the readiness fan-out. The scroll path is unaffected (D-B28 proves 0 requests there). **Fix:** filter to the document's own keys, or subscribe to the cache inside the effect instead of rendering on it. |
| **W4F3-07** | minor · high | `lens-density.spec.ts:606-633` | "A warm second navigation" is a full `page.goto`, so the QueryClient is empty and `isFetching` is not already 0 at first commit — it does not test D-B46's warm claim. **Fix:** reach the doc by a client-side navigation from `/desk` so the cache survives. |
| **W4F3-08** | minor · medium | `lens-density.spec.ts:203-228` | The relaxation is H5-honest, but `>=` is unbounded and the companion case ("no root above the frame top ever moves") anchors on the first root only, so four of six roots now have no per-root guard against moving while at or above the frame top. **Fix:** assert monotonic `offsetTop` per step for every root whose top is ≤ 0. |
| **W4F3-09** | minor · medium | `use-lens-density.ts:273-289` | `markPassed` runs before resolution, so a reader scrolling during the load produces roots that are `data-passed` **and** `quiet` — false against D-B16 (ii) and §5. No consumer and no spec samples there (`settle()` now waits for resolution). **Fix:** gate `markPassed` on `resolved`, or record the window in D-B46. |
| **W4F3-10** | nit · high | `mobile-shell.tsx:74` | `onPromoteThrough?` is optional, reintroducing the silent-no-op shape that `onJumpRegion` — the field directly above — was made **required** to remove in fix-2. `page.tsx:1793` is the only publisher and always supplies it. |
| **W4F3-11** | nit · medium | `use-lens-density.test.tsx:141-145` | `flush()`'s default moved 32 → 96ms for every pre-existing case. `it('resolves __lensSettled at the settle…')` asserts *not yet settled* after a bare `flush()`, which now leaves 24ms under `LENS_SETTLE_MS`; a bump to either silently flips it. **Fix:** pass the interval explicitly in the settle cases. |
| **W4F3-12** | nit · high | `lens-density.spec.ts:551-558` | `localStorage.clear()` to clear six `patina:doc-fold:` keys also takes anything else the origin stores. It fails loudly rather than silently if a session ever moves there, but the surgical form is a prefix-filtered `removeItem` loop. |
| **W4F3-13** | nit · low | `mobile-bar.tsx:230-236` | The `ResizeObserver` watches the default content box while `publish()` reads `getBoundingClientRect()` (border box), so a padding-only change — `env(safe-area-inset-bottom)` on rotation — changes the published truth without triggering a republish. **Fix:** `observe(bar, { box: 'border-box' })`. |
| **W4F3-14** | nit · low | `mobile-bar.tsx:203-236` | Two `MobileBar` mounts would both write the one `html` property, and the first unmount would clear the survivor's value. Single-mount today (`(document)/layout.tsx`). |
| **W4F3-15** | nit · low | `helpers/lens.ts:43-70` | `transformsStill` runs `getAnimations({ subtree: true })` over the whole shell on **every** `settle()`, i.e. every step of the 30-step CLS walk and the ~250-step density walk. Usually true on the first poll; still a new per-step cost on the longest specs. |
| **W4F3-16** | nit · low | `use-lens-density.test.tsx:19-27` | The suite mocks `@tanstack/react-query` wholesale, so the no-provider fallback the hook's comment justifies at length is never exercised here. The real coverage is the region and page suites that render without a provider. |
| **W4F3-17** | nit · low | `quiet-responsive-shell.spec.ts:503-571` | Neither D-B47 case resizes within one page, so the RO's republish/clear on a 390 ↔ 1440 transition — where a stale `--doc-mobile-bar-height` would persist — is unproven in the browser. |
| **W4F3-18** | nit · low | `use-lens-density.ts:394-405` | `stopped` is checked once at the top of `markResolved` and not re-checked inside the `flushSync` loop; a teardown committed by one of those flushes would leave later `promote()` calls writing to detached nodes and re-dirtying `promotedKeys` after `clearStore()`. |

**NOT SIGNED — W4F3-01.**

---

# Sign-off fix-3 pass 2

**Target** `document-lens/w4-fix3` @ `a364817e3` (one commit over `7500ca445`).
**Read** `git diff 7500ca445..a364817e3` (12 files, +602/−104). Read-only; no git, no servers.

**SIGNED — no gating ids.**

W4F3-01 is closed with a falsifier that fails against the old code, and six of the other eight are
closed with real ones. Two remain open (W4F3-05, W4F3-08) and eight new findings follow, all minor
or nit. The one I would take before merge is **P2-01**: `aria-busy="true"` now sits on the same
element as `role="status"`, which defeats the sr-only announcement that is `SectionLoadingLine`'s
stated reason for existing.

## Disposition

| id | ruling | falsifier / where |
|---|---|---|
| **W4F3-01** deadline resolves with no paper | **CLOSED** | Two mechanisms, both right. `sampleResolution:474-491` arms the clock on the first frame that finds a paper and clears it (plus `stableFrames`/`lastHeight`) if the paper goes away; `markResolved:413-419` bails without latching when `resolvePaper()` is null, releasing its own clock and leaving the sampler running. Falsifier: *"starts the deadline when the paper arrives, not when the hook mounts (W4F3-01)"* — mounts with no paper and `fetching = 1` (closing the stable route), flushes **5000ms** and asserts NOT resolved, then appends the paper and asserts resolution ~3000ms *later*, with the cascade opening the root at 120 and not the one at 4000. That case fails on `7500ca445`. |
| **W4F3-02** re-check had no falsifier | **CLOSED** | *"returns a stale crossing to waiting — position is measured at the write"*: fires the entry, then moves the root to 6000, then scrolls and flushes; asserts still `quiet`, still observed, `getDensity` null. Genuinely exercises the re-check that the pass-1 fixture change had made unfalsifiable. |
| **W4F3-03** class-only coupling | **CLOSED**, ratchet weak (**P2-02**) | `aria-busy="true"` added to both `SectionLoadingLine` forms (`:36`, `:55`), `project-mood-boards.tsx:244`, `recent-boards-strip.tsx:25`; `LOADING_SELECTOR` exported so register and gate are one declaration. Falsifiers: two *"declares itself to the lens"* cases asserting **both** `LOADING_SELECTOR` and `[aria-busy="true"]` independently, plus *"goes silent the moment its data lands"*. |
| **W4F3-04** `resolved` never re-armed | **CLOSED** | `discover():612-628` compares `resolvedPaper` to the current paper and, on a replacement, clears `resolved`/`deadlineFor`/`stableFrames`/`lastHeight`, removes the attribute and re-arms the sampler. Falsifier: the paper-replacement case now asserts `not.toHaveAttribute('data-lens-resolved')` after the old paper leaves and `toHaveAttribute(…)` after the replacement resolves. I checked the stale-timer path: `markResolved` always clears `resolveDeadline`, and the re-arm only runs while `resolved === true`, so no old clock can fire against a new paper. |
| **W4F3-05** cascade ignores `frozen` | **OPEN** | `markResolved:443-451` gained `if (stopped) return;` — which is **W4F3-18**, not this. `frozen` appears nowhere in the cascade; only the trailing `commitPending()` respects it. The code comment at `:443` cites "W4F3-05" for the `stopped` guard, which is a mislabel (**P2-06**). Blast radius is still bounded — promotion happens at or below the lookahead line, so nothing above the frame moves — so it stays minor. **Fix:** `if (frozen) { /* leave the cascade to the thaw */ } ` around the loop, or state the exemption in D-B46. |
| **W4F3-06** `useIsFetching` re-renders the page | **CLOSED** | `useIsFetching` is gone; `use-lens-density.ts:240-247` reads `client.isFetching()` into a ref from `client.getQueryCache().subscribe(read)`. **No render, correct with multiple clients** (it reads the client in its own context; the standby reads 0 forever), and **unsubscribed on unmount** — `subscribe` returns the unsubscribe and it is returned from the effect, which also re-subscribes when `client` changes. `read()` is called once eagerly so the ref is seeded, and this `useLayoutEffect` is declared **before** the density effect, so the seed lands before the first `discover()`/sampler arm. No key coupling is needed and none is used: `isFetching()` unfiltered is the same semantics `useIsFetching()` had, and the `!loading` register condition is what compensates for the dependent-query lull. |
| **W4F3-07** "warm" case was not warm | **CLOSED** | `lens-density.spec.ts:631-658` now leaves by `a[aria-label="Put down document"]` and comes back by the desk's own link, both dispatched with `element.click()` so Next's `Link` handler runs and the navigation is client-side — the QueryClient survives, which is the whole claim. The `.click()` dodge around Playwright actionability is explained and correct (a synthetic click still reaches React's delegated root listener). See **P2-04** for the skips. |
| **W4F3-08** no per-root guard above the frame | **OPEN** | Untouched. The round-trip case still allows any downward move for a quiet-at-origin root, and the forward-walk case still anchors on `rects[0]` alone. Instrument coverage, not product. |
| **W4F3-09** `data-passed` on a quiet root | **CLOSED** | `markPassed:380-390` gained `if (!committed.has(root)) continue;` — so `passed ⊆ committed ⊆ full` **by construction**, which is stronger than gating on `resolved` and makes D-B16(ii) unfalsifiable-in-the-right-direction. `markResolved` calls `markPassed()` after `commitPending()` so a deep landing still gets its marks with no scroll, crossing or mutation to sweep them. Falsifier: the `data-passed` case now promotes the root first and asserts `full` before the pass, and the replacement case asserts the mark lands a frame after the promotion. |
| W4F3-10 …18 (nits) | **18 CLOSED** (the `stopped` guard), **10–17 carried** | W4F3-10 in fact **widened**: `onJumpToLine`/`onJumpToRoom` are optional too, and the room row's previous unconditional `scrollIntoView` is now a silent no-op if the field is absent. 11 (`flush(ms = 96)`), 12 (`localStorage.clear()`), 13–17 untouched. |

## The three judgement calls

### (a) `scrollHeight > 0` → "a paper exists" — **sound, and the defect is closed**

The substitution is correct, and for the stated reason. jsdom returns `0` for every `scrollHeight`,
so a literal `height > 0` arming condition would never start the clock and the lens would never
resolve in `page.test`/`worktable-finalize` — a gate that silently disables itself in the suites
that render the paper is worse than the defect. Splitting the two jobs is the right shape:
**existence arms the clock, stability carries the meaning.**

And the meaning is genuinely still carried. `held` is now `fetching === 0 && !loading && height ===
lastHeight`; the height half no longer requires a positive number, but a real paper cannot sit at
`scrollHeight === 0` and be honest — `<main data-document-paper>` carries `pt-8 pb-32` (`page.tsx:2262`),
so it measures ≥160px the moment it is laid out, and it is never `display:none` (the one rule that
could have made it boxless, `content-visibility`, was deleted under D-B33). A browser paper at 0 is
a paper that is not laid out yet, and that state comes with queries in flight and registers
printing — the other two conditions, exactly as the lane argues. **P2-08** records the theoretical.

The two scenarios, checked:

- **No paper at t=3000 → no latch.** There is no such moment: the clock cannot be armed before a
  paper exists, so t=3000 is measured from the paper's own arrival. If the paper is removed after
  arming, the sampler clears the timer and resets the counters, and `markResolved` refuses to latch
  if it fires in the gap. **Closed**, and the jest case proves it by flushing 5000ms with no paper
  and asserting the attribute is still absent.
- **A 400px skeleton at t=3000 → the cascade measures the current paper.** Yes — `markResolved`
  re-resolves the paper and the cascade's `withinLookahead(root)` reads `getBoundingClientRect()`
  live, root by root. It will still promote everything inside the lookahead of a genuinely short
  paper, but **that is D-B46 as ruled** ("at `LENS_RESOLVE_MAX_MS` after mount against whatever is
  laid out, stated, so the lens never hangs quiet"), not a residual defect. My pass-1 finding
  conflated it with the latch; only the latch was the bug. Moving the clock's origin from mount to
  first-paper also materially shrinks this case: the 3,000ms is now three seconds of *paper* time
  rather than three seconds that may have been spent compiling or waiting on the first query.

### (b) The frame ceiling as a recursion-depth cap — **sound, not a test-shaped product change**

Three things make it defensible, and the second is the one that matters:

1. **It is not a clock.** It never calls `markResolved`; it only stops scheduling. The 3,000ms
   timer is the sole deadline, which is what the previous `sampledFrames >= MAX_RESOLVE_FRAMES`
   arm violated — that one *did* resolve, and resolving on a frame count is wrong in a throttled
   background tab where 188 frames is three minutes. This is strictly better than what it replaced.
2. **It is provably inert in a browser.** `syncDepth` is incremented only across the
   `requestAnimationFrame` call and decremented in a `finally`, so with an async rAF it is 0→1→0
   inside one statement and every real callback enters at depth 0. I checked all three entry
   points (the effect's initial call, the rAF chain, `discover()`'s re-arm) — none nests.
3. **The thing it prevents is a crash, not a test failure.** Unbounded synchronous recursion blows
   the stack in any environment where rAF is synchronous, and shims like that exist outside jest.

`MAX_SYNC_DEPTH = LENS_RESOLVE_STABLE_FRAMES + 2` is correctly sized: in a sync-rAF, jsdom
environment the first frame sets `lastHeight` from `-1` (held false), frames 2–4 hold, and
`stableFrames` reaches 3 at depth 3 — two frames of margin. One residual: when the cap *is* hit the
chain dies permanently rather than yielding, so a sync-rAF suite whose paper is not stable within
five frames gets a lens that silently never resolves. **P2-05.**

### (c) `mobile-margin-sheet:159` → `expect.poll` — **honest**

The predicate is unchanged (`scrollY !== scrollYBefore`); only the time it is given changed, and
the reason is real: `scrollIntoView` is smooth outside the reduce register, and the press now
`flushSync`es FF&E's 62 lines before the scroll is issued. A single read genuinely raced, and the
comment says which change made it race. That is a widened wait, not a weakened claim.

It is weak in the way it was already weak: `not.toBe(before)` passes on *any* scroll movement, and
a 10s window widens the aperture for a coincidental one (a lazy image, a late layout). The stronger
form is to poll on the landing itself — `#ffe-selection-<id>`'s rect near the frame top, or simply
in view. Recorded as advice, not a finding, since it neither weakens nor was introduced here.

## The other specific checks

**`queryCache.subscribe`** — covered in the W4F3-06 row: no render, no key coupling needed, correct
per-client, unsubscribed and re-subscribed on `client` change, seeded eagerly, and ordered before
the density effect. `read()` walks the cache on every event (O(queries) × O(events) ≈ 14k cheap
iterations across the readiness fan-out) — orders of magnitude below the page re-render it
replaces.

**The `aria-busy` ratchet** — it **reads files**, it does not render: a source-text scan of every
non-test `.tsx` under `src/components/document` for `animate-pulse` without `aria-busy`. Honest
about being a ratchet, and it caught two real sites (`project-mood-boards`, `recent-boards-strip`).
But it is file-level, not element-level, and it can be satisfied the wrong way — **P2-02**. On the
coordinator's specific question: **yes, it produces the wrong pressure on a decorative pulse.** A
non-loading `animate-pulse` added to a document component fails the ratchet, and the message tells
the author to add `aria-busy` — which would make the paper never resolve except at the deadline,
i.e. the ratchet pushes toward the exact failure it guards. It also cannot see a *new* unguarded
pulse in any file that already contains `aria-busy` anywhere, and four paper files do
(`ffe-section`, `schedule-spine`, `mobile-bar`, `phase-advance-control`).

**`onJumpToLine` / `onJumpToRoom`** — identity-stable: `landOnFfeAnchor` is `useCallback([lens])`
and `lens` is `useMemo([])`, so both wrappers are stable and the fact that `useMobileActiveDoc`'s
signature does not include them is safe (the same reasoning that held for `onJumpRegion`). The
D-B18 order in `landOnFfeAnchor` (`page.tsx:1628-1655`) is right: `requestRegionUnfold('ffe')` →
`lens.forceFullThrough('ffe')` → land, with the two-rAF wait taken **only** when the element is
still absent — correct, because the promotion is flushed but the unfold is a React state change
that needs a paint. Moving the landing out of the sheet is the right ownership call, and the jest
rewrite is honest about it: the old case appended a stub `#ffe-selection-ffe-2` to `document.body`
and asserted `scrollIntoView` on it, which is a target that cannot exist on a cold load. Two gaps:
`onPromoteThrough` is now orphaned (**P2-03**) and nothing tests `landOnFfeAnchor` itself
(**P2-07**).

**The four owed jest cases — honest, and three of them strong.** *"does not resolve in a lull"*
mounts a real `[aria-busy="true"]` node in the paper, holds the gate 400ms, removes it, resolves —
the direct proof that the register condition does work the fetch count cannot. *"cascades: the pass
opens the prefix that stays at the line"* is the best case in the wave: it stubs
`getBoundingClientRect` as a **function of the current densities**, pre-asserts that all six roots
are inside the lookahead at reserve (so a single-measurement pass would open all six), and then
asserts approvals+schedule full, the other four quiet and still observed. It reproduces the lead's
acceptance map arithmetically and would fail against a non-cascading pass. *"returns a stale
crossing to waiting"* and *"starts the deadline when the paper arrives"* are covered above. None of
them can pass vacuously.

## New findings

| id | severity · confidence | file:line | what |
|---|---|---|---|
| **P2-01** | minor · medium-high | `section-loading-line.tsx:36, :55` | `aria-busy="true"` now sits on the **same element** as `role="status" aria-live="polite"`. A live region that is busy defers its announcement until busy clears — and this element never clears it, it **unmounts**. So the sr-only label ("Reading approvals", "Checking readiness") is likely never announced, defeating the component's stated reason for existing ("the human-readable label preserved for assistive tech … so a screen reader still hears what is loading"). The `section-loading-line.test.tsx:14` assertion was flipped from `not.toHaveAttribute('aria-busy')` to `toHaveAttribute` without weighing this. **Fix:** move `aria-busy="true"` onto the inner `<span aria-hidden>` pulse — it is already hidden from AT, so nothing is suppressed, and `paper.querySelector('[aria-busy="true"]')` still finds it. |
| **P2-02** | minor · high | `section-loading-line.test.tsx:122-179` | The ratchet is a file-level source grep: any file containing `aria-busy` **anywhere** satisfies it, so a new unguarded pulse in `ffe-section`, `schedule-spine`, `mobile-bar` or `phase-advance-control` passes; it scans only `src/components/document`, not `src/app/(document)` or the packages the paper renders; and it pressures a *decorative* pulse toward adding `aria-busy`, which is the failure it exists to prevent. **Fix:** assert element-level in a render (each register renders a node matching `LOADING_SELECTOR`) and make the source scan an explicit allowlist of known-decorative pulses rather than a per-file OR. |
| **P2-03** | nit · high | `mobile-shell.tsx:69-71`, `page.tsx:1835` | `onPromoteThrough` is now published by the page and consumed by nobody — the sheet moved to `onJumpToLine`. Dead API surface added last pass and orphaned this one. |
| **P2-04** | nit · medium | `lens-density.spec.ts:636-651` | Two mid-test `test.skip(true, …)` calls mean the warm case can silently stop running if the "Put down document" exit or the desk's link to the long paper changes shape. A case that proves the warm path should fail, not vanish. **Fix:** `expect(count).toBeGreaterThan(0)` with the same message. |
| **P2-05** | nit · medium | `use-lens-density.ts:494-501` | When `MAX_SYNC_DEPTH` is hit the sampler chain ends and schedules nothing further, so in a synchronous-rAF environment a paper that is not stable within five frames leaves the lens permanently unresolved (until a 3,000ms timer fake timers may never advance). A suite could then assert quiet-everything and pass for the wrong reason. **Fix:** on hitting the cap, schedule the next sample from a `setTimeout(…, 0)` instead of returning. |
| **P2-06** | nit · low | `use-lens-density.ts:443-446` | The comment attributes the `if (stopped) return;` guard to **W4F3-05**; it implements **W4F3-18**. W4F3-05 (the cascade ignoring `frozen`) is untouched, and the mislabel will read as closed to the next person. |
| **P2-07** | nit · low | `page.tsx:1628-1660` | Nothing tests `landOnFfeAnchor`. The sheet suite now proves only that the sheet *asks*; the composition it asks for — unfold → flushed promote → land, with the two-frame wait taken only when the element is absent — has no case at any level. |
| **P2-08** | nit · low | `use-lens-density.ts:495` | `held` now accepts `height === lastHeight` at `0`, so a paper that were boxless for three frames with no fetch and no register would resolve and the cascade would measure all-zero rects (`top: 0 ≤ innerHeight + 240`) and promote everything. Unreachable today — `<main>` carries `pt-8 pb-32` and is never `display:none` now that D-B33 removed `content-visibility` — but the guard that made it unreachable is gone, and nothing records that. |

## Owed, not gating

**W4F3-05** (the resolution cascade is not freeze-aware — with **P2-06**'s mislabel to correct),
**W4F3-08** (no per-root guard that a quiet root does not move while at or above the frame top),
and **P2-01** (the announcement regression) are the three I would take before this merges. None
of them can move a pixel above the frame or change what the paper prints, so none gates.

**SIGNED — no gating ids.**
