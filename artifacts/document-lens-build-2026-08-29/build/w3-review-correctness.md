# W3 review — CORRECTNESS · The Smart Lens (adversarial)

Reviewed `document-lens/integration` @ `4915583c2` in `.codex/worktrees/agent-lens-integration`, scope `git diff e6da8bd76..4915583c2` (60 files, +4235/−1949). Read against `technical-design.md` (§3, §5, C-5…C-8, OD-1, OD-6…OD-10, OD-15), `deviations.md` (D-B1…D-B23), `reconciliation.md` "W3-L2 rulings", `proposal.md` §2–§3 and §9 Wave 3, `test-impact.md`.

**Evidence run in the worktree** (read-only, no writes to the tree):

- `npx jest src/app/(document)/doc src/components/document` → 238 suites / 2088 tests, all pass.
- `npx jest src/lib/document src/hooks` → 116 suites / 2088 tests, all pass.
- `npx tsc --noEmit -p tsconfig.json` → every error is either `Cannot find module '@patina/api-routes'` or `@patina/types/media` (unbuilt workspace dists in this worktree, the artefact `test-impact.md` already records) plus pre-existing `media-utils`/design-system `any`s. **Zero type errors on the W3 surface.**

Findings are numbered `C-nn`, every one reported, unfiltered. Severity · confidence on each.

---

## Majors

### C-01 · The band writes `data-lens-state`, an attribute the shell owns — major · high
`src/components/document/lens-band.tsx:114` — `data-lens-state={open ? 'rest' : 'reading'}` on the band `<section>`.

§5's DOM contract assigns `data-lens-state` to `[data-document-shell]` alone, values `rest | reading | editing | mobile`, and **D-B19 makes `hooks/use-lens-state.ts` its sole writer**. `git grep data-lens-state -- apps/designer-portal/src` returns exactly this line plus its test assertion, so today the only element carrying the attribute is the wrong one.

Failure scenario: W4 adds the shell writer. `[data-lens-state="reading"]` then matches two elements with different boxes; a CSS rule or a `lens-*.spec.ts` locator written against the contract picks the band, whose vocabulary has no `editing` and no `mobile`, so the editing freeze reads as `rest` from the band and `editing` from the shell in the same frame. This is a name collision that will be much cheaper to remove now than after W4 has selectors pointing at it.

Smallest fix: delete `lens-band.tsx:114` and `lens-band.test.tsx:115`. The band already publishes `data-lens-open`, which is the bit the page needs (D-B19's `onPinChange` carries it upward in W4).

### C-02 · Line 2's `overflow-hidden` clips the act's 44px target — major · medium-high
`src/components/document/lens-band.tsx:153` — line 2's `<p>` carries `LINE_CLIP` (`overflow-hidden text-ellipsis whitespace-nowrap`); `:169-182` puts a `DocumentAction` inside it, and `:177` insets that control with `my-[-12px]`.

`document-action.tsx:53` builds the control as `min-h-[44px] min-w-[44px]` — "an honest 44px control box". The `-12px` block margins reduce its outer contribution to 20px so the declared 56px box holds (that part is right), but the flex line's content box is then ~20px tall and the `<p>`'s `overflow: hidden` clips the remaining 12px above and below — **for painting and for hit-testing**. The `+N MORE` button (`:183-194`) sits in the same clipped line.

Failure scenario: at 390, DL-05 removed `useMobilePrimaryAction` from `red-letter-zone.tsx` and `document-guide.tsx`, so line 2 is now the **only** printing of that act at that width. The phone's primary act ships with roughly a 20px tall press target against the document's own 44px contract. `e2e/document/lens-band-height.spec.ts` cannot see it: the band's height is fixed by `h-[var(--doc-band-height,56px)]`, so the box measures 56 whatever happens inside it.

Smallest fix: move the clipping off the flex `<p>` — keep `whitespace-nowrap` there and drop `overflow-hidden text-ellipsis`; the sentence span at `:161` already carries its own `min-w-0 ${LINE_CLIP}`, which is what produces the ellipsis. (Do not reach for `overflow-x-hidden`: `overflow-x: hidden` with `overflow-y: visible` computes back to `auto`.)

### C-03 · The model is re-derived every render, and the 90ms latch restarts on identity — major · medium
`src/app/(document)/doc/[id]/page.tsx:1967` — `const bandModel = deriveLensBand({…})`, in the render body, unmemoized (the `deriveGuideModel(...)` argument at `:1971` is a fresh object too). `src/components/document/lens-band.tsx:67-80` — the turn effect's deps are `[model.line2, printed]` and its first guard is object identity (`model.line2 === printed`).

Two consequences:

1. **The turn can be held open.** During the 90ms window `printed` still holds the OLD words, so any parent re-render arriving inside that window produces a new `line2` object, `sameWords(model.line2, printed)` is false, the cleanup clears the pending timeout, and the latch restarts with the sentence at `opacity: 0`. The page re-renders on `activeKey`, on `headInFrame`, on `letterheadInFrame` and on every one of ~20 queries settling — a burst faster than 90ms holds the paper's one standing-exception line blank (showing the stale text at zero opacity) for the length of the burst. `test-impact.md`'s own jest pitfall note describes the latch but not this restart.
2. **Cost.** `rankStanding` (a sort plus two regexes per item), `truncateLine` and `deriveGuideModel` now run on every render of `DocumentPageBody`. The deleted `TicketFace` memoised `deriveTicket` precisely to avoid this ("the derivation runs when a fact changes, not on every render one of the reads beneath it causes" — the comment survives at `page.tsx` on `TicketFacts`, while the band's derivation does the opposite).

Note `bandModel` sits below the page's early returns, so a `useMemo` there is not legal without hoisting. Smallest fix is in the band: hold the pending target in a ref and skip re-scheduling when the incoming `line2` has the same words as the pending target (`sameWords(model.line2, pendingRef.current)`), so only a genuine word change restarts the 90ms. Hoisting the derivation above the early returns and memoising it is the better second step.

### C-04 · `#doc-ticket-sentinel` is rendered and observed by nothing — major · medium
`src/components/document/lens-band.tsx:109` renders the sentinel; `grep -rn doc-ticket-sentinel src e2e` returns that line, a page.tsx comment, and two test assertions. **No observer reads it.**

§4's seam checklist says `job-ticket.tsx:218-228`'s IO **moves** into `lens-band.tsx`; §2's state machine triggers `rest → reading` on "`#doc-ticket-sentinel` leaves the viewport (IO, `threshold: 0`)". What shipped instead: `page.tsx:1515` calls `useLensFrame()`, whose first observer watches `#document-project-status` — the letterhead `<header>` — and `page.tsx` passes `open={letterheadInFrame}`.

Failure scenarios:
- The two geometries are not the same. The header's intersection rect excludes its own `mb-4`, so `letterheadInFrame` goes false ~16px of scroll **before** the band actually reaches `top: 0`. In that window `data-lens-open="false"` and line 1 prints the s1 form (household · stage · both facts) while the band is still in flow under a letterhead that is still printing the same facts — the duplication the s0 yield exists to prevent.
- `page.test.tsx:1436` and `lens-band.test.tsx:60-66` keep the adjacency assertion whose stated reason is "`sentinel.nextElementSibling` is the only thing stopping a future edit from putting a block between the sentinel and the band". With no observer behind it the guard protects nothing — it is a surviving assertion that now proves a fiction.

Smallest fix: give `lens-band.tsx` the sentinel IO §4 specifies and drive `pinned` from it (letting `useLensFrame().letterheadInFrame` keep its real job, the rail head's L-6 yield, per D-B23). If the substitution is deliberate, it needs a `D-B` row and the sentinel should be deleted with its two assertions.

### C-05 · The A-07 foot reserve did not ship — major · medium
§4's Wave-3 checklist, row "new (A-07, foot reserve)": `[data-document-paper] { padding-block-end: calc(100dvh - var(--doc-landing-clear) - 4rem) }` "so the last stop can land at 72px". `grep -n "padding-block-end\|100dvh" src/app/globals.css` finds only the sheet's own `100dvh` arithmetic — the rule is absent.

Failure scenario: L-10 promises "the landing offset is identical in both registers" and `--doc-landing-clear` resolves "once and correctly at any fling speed". Press `The record` (or whatever the last stop is on a short spread) on the ladder: `scrollToRegion` runs out of scroll extent and the head comes to rest wherever the document ends, not at 72px under the band. Nothing catches it — `quiet-responsive-shell.spec.ts`'s retargeted landing case jumps to **Money**, which always has regions below it.

Smallest fix: add the declared rule as written.

---

## Minors

### C-06 · `scroll-padding-bottom: 60px` contradicts the shell's own bottom inset — minor · high
`src/app/globals.css:1063-1065` — `html:has([data-document-shell]) { scroll-padding-bottom: 60px }`.

Thirty lines above, `globals.css:227-238` declares `.document-route-shell { --doc-shell-bottom-inset: max(72px, calc(60px + env(safe-area-inset-bottom))) }` with the comment "the 72px MobileBar below 1180px (W1/OD-11 raised it from 64px for its third line) and the 60px Studio Drawer above it". So below 1180 the persistent edge is 72px (more with a safe area) and the scroll padding is short by at least 12px: a stop or a focusable scrolled into view can come to rest behind the mobile bar — the exact failure (F120/Dc-10) the new focusable clearance rule was added to close, at the other edge.

Smallest fix: `scroll-padding-bottom: max(72px, calc(60px + env(safe-area-inset-bottom)))`. (The token cannot be read from `html`, since it is declared on `.document-route-shell`; §4 asked for the rule to be scoped to that class, which would let the token do the work.)

### C-07 · `shortenAct` turns `FOLLOW UP` into `UP` — minor · high
`src/lib/document/lens-band-derivation.ts:179-184` drops stop words then `kept.slice(-1)` — the last word only. The suite documents the result itself: `lens-band-derivation.test.ts:370-373` asserts `shortenAct('Chase Sturdy Oak') === 'Oak'`.

OD-1's rule is "the act's words shorten first (`SEND A REMINDER` → `REMIND`)" — shorten the verb phrase, keep the act. Slicing to the last word prints a preposition for `FOLLOW UP` (the act W3-R2 names for the standing sheet's input rows) and a maker's surname for `Chase Sturdy Oak`.

Failure scenario: any line 2 longer than `LENS_LINE2_MAX_CHARS − doorChars` (110 minus the `+N MORE` door) prints an act labelled `UP`. The act is a real press with a real destination, so the reader is asked to press a word that names nothing.

Smallest fix: refuse the shortened form when the surviving word is under ~4 characters or is a particle, and fall back to dropping only the leading stop words (`SEND A REMINDER` → `SEND REMINDER`).

### C-08 · `LENS_ANNOUNCE_DEDUPE_MS` is declared twice — minor · high
`src/lib/document/lens-constants.ts:18` holds it (OD-3: "anything that needs one of these … imports it here, so the threshold a test asserts and the threshold the observer uses are one declaration"). `src/components/document/lens-band.tsx:30` re-declares it, and `lens-band.tsx` imports nothing from `lens-constants.ts`. `LENS_TURN_OUT_MS` (`:33`) is likewise local while OD-3 is the declared home for the lens's numbers.

Failure scenario: the dedupe window is tuned in `lens-constants.ts`, its test goes green, and the band keeps announcing on the old window. Smallest fix: import the constant; add `LENS_TURN_OUT_MS` to `lens-constants.ts`.

### C-09 · `use-lens-frame` leaks a queued rAF past unmount — minor · medium
`src/hooks/use-lens-frame.ts:147-165`: the MutationObserver debounce schedules `attach()` in a `requestAnimationFrame` and the cleanup does not cancel it. If the component unmounts between the mutation and the frame, `attach()` runs after `observer.disconnect()` and calls `observer.observe(el)` again — re-arming a disconnected IntersectionObserver, whose callback then calls `setHeadInFrame` on an unmounted component and holds references to the old paper's nodes.

Smallest fix: keep the rAF handle and `cancelAnimationFrame` it in the cleanup (or set a `cancelled` flag the callback checks).

### C-10 · The letterhead watch retires and never re-arms — minor · medium
`src/hooks/use-lens-frame.ts:53-70`: `attach()` disconnects the MutationObserver on first success ("the letterhead is mounted once per document and never replaced"). If `#document-project-status` is ever replaced — a route-group remount, a conditional letterhead branch, a Fast Refresh in dev — `watched` points at a detached node, no new element is ever observed, and `letterheadInFrame` freezes at its last value. That single boolean drives both the band's s0/s1 form and the rail head's L-6 yield, so both stick silently.

Smallest fix: keep the MutationObserver alive, or re-attach whenever `document.getElementById(LETTERHEAD_ID) !== watched`.

### C-11 · `aria-atomic` re-reads the stop announcement on every line-2 change — minor · medium
`src/components/document/lens-band.tsx:148-201`: line 2 is `aria-live="polite" aria-atomic="true"` and the `sr-only` announcement span (`:198`) is set once and never cleared. With `aria-atomic="true"` every later change to the region — a sentence turn, a new act label, a changed `+N MORE` count — re-reads the **whole** region including the stale `Now at Pieces · …`.

OD-7's contract is "once per distinct stop … same key within `LENS_ANNOUNCE_DEDUPE_MS` → no write". The write-side dedupe is implemented correctly (`:88-100`, and `lens-band.test.tsx:314-368` genuinely exercises it); the read-side repetition is the gap.

Smallest fix: clear `announcement` shortly after it is set (or whenever `printed` changes), so the span is empty by the time the next atomic update fires.

### C-12 · Sheet close can drop focus to `<body>` — minor · medium
`standing-sheet.tsx:42` passes `fallbackFocusRef={triggerRef}` — and `triggerRef` **is** the `+N MORE` button. `doc-sheet.tsx:274-289` restores to the original trigger when it is still connected, else to the fallback; here they are the same element. `lens-band.tsx:183` unmounts the button when `withheld <= 0`.

Failure scenario: the sheet is open, an act inside it resolves a need (or a query settles) so the standing set drops to one; `+N MORE` unmounts; the reader presses Esc; `originalTrigger.isConnected` is false, `fallback` is the same null ref, and focus lands on `<body>` — the drop OD-6's fallback exists to prevent. (OD-6 as written names the same element, so this is the contract's hole as much as the code's.) Related: the sheet stays open showing `Standing · 0` with no rows if the set empties.

Smallest fix: give the band `<section>` `tabIndex={-1}` and pass a ref to it as `fallbackFocusRef`.

### C-13 · The quiet-reserve token drifted from C-7 — minor · high
C-7 and OD-12 declare one token, `--doc-quiet-reserve` (default 68px), set per root as `style={{ '--doc-quiet-reserve': hasStanding ? '112px' : '68px' }}` and read by `[data-index-region] { min-block-size: var(--doc-quiet-reserve, 68px) }`. What shipped (`globals.css:223-224`) is two differently-named tokens, `--doc-quiet-reserve-min` and `--doc-quiet-reserve-exc`, with **no consumer anywhere** and no `min-block-size` rule.

Nothing is broken today (the roots land in W4), but W4 now has to either adopt a mechanism the contract does not describe or rename tokens that already shipped. Smallest fix: rename to `--doc-quiet-reserve` per C-7, or add the deviation row that re-specifies OD-12's mechanism.

### C-14 · The `1rem → 16px` substitution has no ledger row — minor · high
`globals.css:222` ships `--doc-landing-clear: calc(var(--doc-band-height) + 16px)` where §5/§4 declare `calc(var(--doc-band-height) + 1rem)`. The reasoning is right and is stated in the CSS comment (this route's root is 18px, so `1rem` would compute to 74 against the declared 72), and `quiet-responsive-shell.spec.ts:305-320` repeats it. But `deviations.md` carries no row, and `quiet-responsive-shell.spec.ts:299` still describes the token as `calc(band + 1rem)` two lines above the comment that says it is not. Smallest fix: one `D-B` row, and align the spec's two comments.

### C-15 · `worktable-finalize.test.tsx` replaces a rendered assertion with a hand-built derivation — minor · high (test honesty)
`worktable-finalize.test.tsx:607-668`. The two cases that replace the deleted ninth-row assertions call `deriveLensBand(bandInput(...))` on a fixture the test file builds and assert on the returned object. The first still calls `renderPage()` but reads only `[data-shelf-trigger]` from it; the second never renders anything. So:

- Neither can fail on a `page.tsx` regression — they duplicate `lens-band-derivation.test.ts` inside a page-integration suite whose stated subject is "the band is the DOCUMENT's map and the Finalize table is what comes and goes beneath it".
- The fixture asserts `rightFlush: 'SENT AUG 10 · $5,000'`, a shape the shipped page **cannot produce**: `page.tsx:1975-1979` passes `proposalInvestment: null` by W3-R4's own ruling, so the real proposal spread prints `SENT AUG 10` alone. The test enshrines a line the product does not print.

Smallest fix: assert on the rendered band (`[data-lens-right-flush]`, `[data-lens-sentence]`) inside `renderPage()`, the way `page.test.tsx` does, and let `proposalInvestment: null` show up as the missing figure it is.

### C-16 · `table-composition.test.tsx` asserts its own harness — minor · high (test honesty)
`table-composition.test.tsx:62` defines `const BAND = <section data-lens-band="" …/>` and `:70-78` renders it as a **sibling of** `<TableFrame>`, since the frame no longer takes a `ticket` node. Consequently:

- `:95` "prints above the table on the %s composition" asserts that the test file's own JSX put `BAND` before `<TableFrame>`.
- `:120` "stands on the paper that has no table too" asserts that the test file's own stub exists.

Both are unfalsifiable. Only `:110` ("the frame mounts no band of its own", a count of 1) retains value, because `TableFrame` could in principle render one. The file's header presents the ordering claims as "KEPT — the ordering claims, which are what B2-L4 was actually protecting", which is no longer true of them.

Smallest fix: keep the count case, delete the two self-referential ones, and let `page.test.tsx`'s "mounts once on the %s spread" (which does render the page with `worktable` on) carry the composition claim it already carries.

### C-17 · The guide path is mocked out of six page suites, and no test counts live regions at document scope — minor · medium (test honesty)
Six page-level suites now `jest.mock('@/components/document/document-guide', …)` including the **pure** `deriveGuideModel` (`worktable.test.tsx:178`, `paper-order.test.tsx:175`, `worktable-speccing.test.tsx:337`, `worktable-delivery.test.tsx:194`, `worktable-finalize.test.tsx:241`, `worktable-finalize-once.test.tsx:248`). Only `page.test.tsx` exercises the real one, so a defect in the guide→line-2 hop is invisible in every worktable suite.

Separately, `document-guide.test.tsx:200-219` still asserts `DocumentGuide`'s own `aria-live` region and its "Next up:" announcements, for a component that no longer mounts anywhere in product (`grep '<DocumentGuide' src` → nothing). OD-7's actual invariant — "exactly one live region in the document" — is asserted only inside the band (`lens-band.test.tsx:295` scopes the count to `band()`), so nothing proves the *document* has one.

Smallest fix: add `expect(document.querySelectorAll('[aria-live]')).toHaveLength(1)` to a rendered-page case in `page.test.tsx`.

### C-18 · Two assertions that cannot fail, and a tripwire that is red as written — minor · high (test honesty)
`lens-band.test.tsx:96-98` asserts `document.documentElement.style.getPropertyValue('--doc-seam-height') === ''` — nothing in the rendered subtree could ever write it, so the seam half of "publishes no height" is vacuous (the `ResizeObserver` spy half is real).

Relatedly, §4's tripwire — `git grep -n 'doc-seam-height\|SEAM_HEIGHT_VAR\|data-job-ticket' -- apps/designer-portal` = 0 at W3-L6 — currently returns **4** hits: this assertion plus `quiet-responsive-shell.spec.ts:299`, `:304`, `:324`. `data-job-ticket` and `SEAM_HEIGHT_VAR` are genuinely at zero. Smallest fix: restate the tripwire as "0 outside deliberate absence-assertions", or drop the vacuous jsdom assertion and keep the Playwright one (which does have a subject: a live stale publisher).

### C-19 · A ticket-only exception silences the guide's act at every width — minor · medium
`page.tsx:1943-1948` builds `bandNeeds` from `redLetterRows`, and `deriveLensBand` puts **every** `row.exception` from `deriveTicket` into the standing set (`lens-band-derivation.ts:302-319`). By A-11 a ticket-sourced item carries `act: null`. `line2.kind` is then `standing` (`:445`) and the guide's sentence and act are not printed at all — while `document-guide.tsx` no longer registers `useMobilePrimaryAction` (DL-05) and `red-letter-zone.tsx` no longer mounts.

Failure scenario: a paper whose only trouble is a stuck piece (`piece-stuck` → `po-silence`, no desk need behind it) prints an actless sentence on line 2 and offers the guide's act nowhere, at any width. This follows the letter of OD-1 ("the guide prints only when nothing stands"), so it is a ruling question rather than a slip — but the DL-05 amendment removed the only other printing of that act, and the walk should see this case before deploy.

Smallest fix (if it is to be fixed in W3): when the elected standing item has no act and a guide act exists, print the guide's act beside the standing sentence — or file actless ticket exceptions to the sheet and let the guide speak on line 2.

---

## Nits

### C-20 · `deriveRedLetterModel` is dead product code — nit · high
`red-letter-zone.tsx:70-77` exports `deriveRedLetterModel(rows): {rows, primary}`; `page.tsx:1947` passes `redLetterRows` straight into `deriveLensBand`, and the only caller is `red-letter-zone.test.tsx:207-221`. Nothing consumes `primary`. C-6 specified `redLetterModel(rows): LensStandingItem[]` (and `guideLine`, shipped as `deriveGuideModel`) — the shipped shapes differ from the contract and one of them has no product caller. Smallest fix: delete it with its test, or use it in `page.tsx`.

### C-21 · `moreId` is set and never referenced; the door has no dialog semantics — nit · high
`lens-band.tsx:104` computes `moreId` and `:186` sets it as the button's `id`; nothing references it (no `aria-controls`, no `aria-labelledby`), and `docId` — a required prop (C-5) — exists only to build it. The `+N MORE` button carries no `aria-haspopup="dialog"` and no `aria-expanded`. Smallest fix: add both ARIA attributes, or drop the id and the prop.

### C-22 · FF&E keeps a contradicting `scroll-mt-16` — nit · high
`ffe-section.tsx:1244` — `className="mt-[var(--doc-region-gap)] scroll-mt-16"` on the `[data-index-region="ffe"]` root, while §4 retires FF&E's 4rem floor ("the `max()` arm is deleted") and `globals.css:1047` gives every region root `scroll-margin-top: var(--doc-landing-clear)`. The CSS rule wins on specificity today (`[data-document-shell] [data-index-region]` = 0,2,0 beats `.scroll-mt-16` = 0,1,0), so nothing changes — but a second, contradicting answer to the same question is sitting on the element the rule targets. Smallest fix: delete `scroll-mt-16`.

### C-23 · `line2.kind === 'none'` is unreachable — nit · medium
`lens-band-derivation.ts:445` can return `'none'`, but `page.tsx:1435` derives `guideModel` for every non-null `row`, so the page never hands the band a null guide. The old ternary's guard ("silence is not a state this page is allowed to render") therefore survives only by accident. Harmless; worth a comment or a test on the branch.

### C-24 · Ladder segments carry `data-index-region`, and the CSS now reaches them — nit · medium (forward hazard for W4)
`spine/lens-ladder.tsx:386,409` put `data-index-region={segment.key}` on the rail's `<button>`s (C-4). `globals.css:1046-1048`'s `[data-document-shell] [data-index-region]` therefore now also gives every ladder button a 72px `scroll-margin-top` (harmless), and OD-12's planned `[data-index-region] { min-block-size: var(--doc-quiet-reserve, 68px) }` would give every ladder segment a 68px floor — against D-B11's ruled 27px rungs. `use-lens-frame.ts:112-123` correctly scopes its own query to `[data-document-paper]`. Smallest fix in W4: scope the reserve rule to `[data-document-paper] [data-index-region]`.

---

## Where the code contradicts an already-ruled item (not re-reported as findings)

- **W3-R1 deadline sort (fix lane).** `lens-band-derivation.ts:321-342` sorts by `TIER_ORDER` then day count — the four-tier sort the ruling replaces. Beyond the code, `page.test.tsx:1544` was **rewritten in this wave to pin the tier order** ("leads line 2 by standing tier, and files the rest") with a comment presenting it as a deliberate ratified change ("The ordering assertion CHANGES here, and deliberately"). The fix lane must rewrite that test too, and the comment should say the tier sort is owed, not settled — as written, a later reader will read it as the ruling.
- **W3-R2 `INPUT NEEDED · N` (fix lane).** `standingCount` (`lens-band-derivation.ts:409`) counts exceptions only, so `+N MORE` under-counts by the open-input count and `standing-sheet.tsx` takes no `inputs` prop. Consistent with "owed".
- **D-B22 telemetry re-home (fix lane).** Confirmed: `lens-band.tsx` imports no `documentEvents`, `page.tsx` fires no `lensLine*`, and `documentEvents.guideShown`/`guideSelected` now fire only from the unmounted `DocumentGuide` — i.e. nowhere. `document-guide.test.tsx` still asserts them, which will keep them green while the events are dark in prod.
- **D-B15** (`latchedDefault` no longer feeding density) is correctly absent — `use-region-fold.ts:180` ships the OD-10 form (`latchedDefault === true ? 'quiet' : 'full'`), as the brief states it should on this branch.
- `margin-handoffs.spec.ts:156` and the webkit 1431px allowance are outside this diff.

## What I checked and found correct

- **C-8 / OD-10.** `use-region-fold.ts:168-183` implements the stop/non-stop split exactly: `folded = explicit ?? false` for the five `STOP_FOLD_KEYS`, `explicit ?? latchedDefault ?? false` for `schedule-rule` / `money-table` / `boards`; `density` is `'full'` for every non-stop key and whenever `forceOpen` or `explicit !== null`; `cause` is `'CLOSED BY YOU'` iff `explicit === true` for every key (DL-09's condition, honoured). Position never writes storage — `writeExplicit` is reached only from `setFolded` (`:185-197`). The first-render/hydration ordering is preserved (`useState(defaultFolded)` initialiser, storage read in an effect), and `use-region-fold.test.tsx:249-260` proves it on `density`. `money-table` is in the union and keeps its derived fold.
- **The region-gap audit.** All seven roots plus both money postures and all **five** `care-band.tsx` branches (`:255, :284, :304, :319, :375`) carry `mt-[var(--doc-region-gap)]` and nothing else in the margin family; the three folded rule steps land on exactly the sites §Wave 3 names (`money-region.tsx:231`, `schedule-rule-region.tsx:182`, `project-approval-document.tsx:566`); `RoomHeading` is `mt-4 → mt-[12px]`; `region-rule.tsx` is untouched. The per-root assertions in `care-band.test.tsx`, `previous-work.test.tsx`, `money-region-seam.test.tsx` etc. are honest and per-branch.
- **`region-head.tsx allowNoActs`** is correctly narrowed: default `false`, added to the effect deps, and passed only by `previous-work.tsx:70` for the count-0 record head. `previous-work.test.tsx` proves the guard stays on elsewhere.
- **`use-lens-frame.ts` head semantics.** One head per stop (the first `[data-region-head]` inside each `[data-index-region]`, deduped by element), scoped to `[data-document-paper]` so the ladder's own `data-index-region` buttons are excluded; `HEAD_BAND = '0px 0px -85% 0px'` is a genuinely different geometry from the reading band; stale keys are unobserved and their `crossing` entry deleted; SSR-safe (`typeof IntersectionObserver === 'undefined'` guards, effects only). `use-lens-frame.test.tsx` installs a capturing IO mock, so "the yield turned on" really does prove attachment — this is the strongest new suite in the wave.
- **`page.tsx` composition.** `activateDestination` gained the `href` arm (D-B23) with `router.push` and `router` in the deps; `LetterheadInstruments` is mounted exactly once and handed to the letterhead (proved twice in `page.test.tsx`, and by `doc-letterhead.test.tsx`'s grid-children assertions); `FolioLetterhead` survives; `MobileMarginChips` is untouched; `TableFrame` takes no node; the stage2 contract test passes unchanged. Nothing that used to render silently stopped except the two organs C-6 converts by design (`RedLetterZone`, `DocumentGuide`) and `JobTicket`.
- **`settle()`'s fallback** (`e2e/helpers/lens.ts:38-52`) is honest: two frames always, and the `data-lens-settled` wait only where the shell actually publishes the attribute, with the "absence is not unsettled" reasoning written down. No `waitForTimeout`.
- **The `--doc-landing-clear` probe** (`quiet-responsive-shell.spec.ts:305-320`) is the right instrument — an unregistered custom property hands back the unresolved `calc()` string, and the appended hidden `div` lays it out. The seam-property-is-gone assertion has a real subject (a stale publisher).
- **`DocSheet.kind`** is one additive optional prop, omitted → attribute absent; the standing sheet's `aria-labelledby` rides `DocSheet`'s own title id, so there is no `aria-label={undefined}` case (OD-6).
- **Jest/type gates** as recorded at the top: 238 + 116 suites green, zero type errors on the W3 surface.

---

## Verdict

**ship-after-fixes.**

Must close before the verdict is *ship*: **C-01, C-02, C-03, C-04, C-05.**

Strongly recommended in the same fix lane (cheap, and each is a real defect rather than a contract drift): **C-06, C-07, C-08, C-11, C-12**. The test-honesty set (**C-15, C-16, C-17, C-18**) should close before the wave is used as the baseline for W4's arithmetic, since three of those assertions cannot fail and one asserts a line the product does not print.

---

# Sign-off — the W3 fix lane

Reviewed `document-lens/w3-fix` @ `3fb009c4b` (8 commits over `document-lens/integration@4915583c2`) in `.codex/worktrees/agent-lens-w3-fix`, against `build/w3-fix-log.md`. Read-only, no git.

**Evidence run in the fix worktree:**

- `npx jest src` → **465 suites / 5404 tests, all pass** (1 snapshot).
- `npx tsc --noEmit -p tsconfig.json` → zero errors outside the worktree's unbuilt `@patina/api-routes` / `@patina/types/media` dists and the pre-existing design-system `any`s. Clean on the whole fix surface.
- The three `… (W3-R4 budget — OWED A RULING)` e2e cases are **not** counted as regressions, per the brief.

## Per-id disposition

| id | disposition | evidence / what remains |
|---|---|---|
| **C-01** band writes `data-lens-state` | **CLOSED** | Gone from `lens-band.tsx` (`:153-157` carries `data-lens-open` only; `git grep data-lens-state -- src` → 0). Falsifier: `lens-band.test.tsx:116` "never writes data-lens-state — that attribute is the shell's (C-01)". |
| **C-02** the act's 44px target clipped | **CLOSED** | `lens-band.tsx:200` — line 2 keeps `whitespace-nowrap` only; the clip moved to `[data-lens-sentence]` at `:208`. Two falsifiers: `lens-band.test.tsx:138` (asserts line 2 has no `overflow-hidden`/`text-ellipsis` and the sentence does) and `lens-band-height.spec.ts` "line 2's act is a whole 44px target at 390 (C-02)", which measures `getComputedStyle(line2).overflow === 'visible'`, the act box `≥44px`, and `elementFromPoint` resolving to the act 2px inside its top **and** bottom edges. That last one is the strongest new test in either lane. |
| **C-03** unmemoised model, latch restarts | **CLOSED**, with a residue | `page.tsx:1817-1857` — `bandModel` hoisted above the early returns into a `useMemo` whose deps are values (`inputSignature`, `guideHeadline`, `guideActLabel`, `bandStageWord`, `bandStageIndex`, `bandInstall`, `bandMoney`, `bandSent`, `lensTier`, `bandStop`), and `bandStop` is its own memo at `:1808`. I checked the dep list against the body: nothing that changes the printed model is missing, and the two `eslint-disable`d omissions (`guideInputs`, `ticketPhase`) are each represented by a value dep. Residue: the latch in `lens-band.tsx:98-118` still guards on object identity, so the restart is structurally possible whenever two deps change inside 90ms — and **N-03 is a case where it now fires on every 390 load**. |
| **C-04** the sentinel observed by nothing | **CLOSED** | `lens-band.tsx:76-93` — the band holds `sentinelRef`, observes it at `threshold: 0`, owns `open`, and reports it up through `onPinChange` (`:94-96`). The `open` prop is gone and `page.tsx` no longer hands the band `letterheadInFrame`, which now feeds only `DocSpine` (D-B23). Falsifiers: `lens-band.test.tsx:109` ("observes that sentinel, and pins on it leaving the frame") and `:187` (`onPinChange`), both driven through a **capturing** IO mock installed in `beforeEach` — so the adjacency assertions at `:101` guard a live mechanism again. |
| **C-05** A-07 foot reserve missing | **CLOSED** | `globals.css:1075-1077` — `[data-document-paper] { padding-block-end: calc(100dvh - var(--doc-landing-clear) - 4rem) }`, exactly §4's declared form. Noted, not raised: the reserve is unconditional, so at 390×844 the paper carries ~708px of dead scroll below the colophon. A-07 priced that as "slight over-reserve"; it is the ratified rule and I am not re-opening it. |
| **C-06** `scroll-padding-bottom: 60px` | **CLOSED** | `globals.css:1067` — `max(72px, calc(60px + env(safe-area-inset-bottom)))`, the shell's own `--doc-shell-bottom-inset` arithmetic restated inline (the token is declared on `.document-route-shell` and cannot be read from `html`, which the comment says). |
| **C-07** `FOLLOW UP` → `UP` | **CLOSED** | `lens-band-derivation.ts:211-215` keeps the **first** word after the leading articles. Falsifier: `lens-band-derivation.test.ts:397` "keeps the act's FIRST word — the verb, never a particle or a surname". The lane's declared divergence (`SEND REMINDER` → `SEND`, not the design's illustrative `REMIND`) is stated in the log rather than taken silently; **accepted** — no word-selection rule produces `REMIND`, and the log says so. |
| **C-08** `LENS_ANNOUNCE_DEDUPE_MS` declared twice | **CLOSED** | `lens-band.tsx:24-27` imports both constants; `lens-constants.ts:22` now holds `LENS_TURN_OUT_MS`. No local re-declaration remains. |
| **C-09** `use-lens-frame` leaks a queued rAF | **NO-CHANGE ACCEPTED** | Agreed on the reason (W4-L1 owns the hook; a half-touch while another lane edits it is worse). It is a two-line `cancelAnimationFrame` and should ride W4-L1, not lapse. |
| **C-10** the letterhead watch never re-arms | **NO-CHANGE ACCEPTED** | Same hook, same owner — and the lane is right that C-04 genuinely shrank the blast radius: `letterheadInFrame` no longer decides the band's pin, only the rail head's yield. |
| **C-11** `aria-atomic` re-reads the announcement | **NO-CHANGE ACCEPTED** | Out of the brief, real, cheap, needs a ruling on whether the span clears. Keep it on the ledger. |
| **C-12** sheet close can drop focus to `<body>` | **NO-CHANGE ACCEPTED** | Correct diagnosis: OD-6 as written names the same element as trigger and fallback, so this is a contract question, not a patch. |
| **C-13** `--doc-quiet-reserve` token drift | **NO-CHANGE ACCEPTED** | Renaming a shipped token out from under W4-L1 is the worse move. It has to close in W4 with OD-12's consumer. |
| **C-14** the `1rem → 16px` ledger row | **NO-CHANGE ACCEPTED** | A `deviations.md` row, not code — and the lane has since opened two more entries owed to that same ledger (see N-04). |
| **C-15** hand-built fixture in a page suite | **CLOSED** | `worktable-finalize.test.tsx:606-660` — both cases now read the rendered band inside `renderPage()` (`[data-lens-identity]`, `[data-lens-right-flush]`, `[data-lens-sentence]`), and the impossible `SENT AUG 10 · $5,000` assertion is replaced by "prints no investment figure it cannot derive — never a placeholder (W3-R4)", which asserts the absence and that no placeholder dash stands in for it. |
| **C-16** self-referential harness assertions | **CLOSED** | `table-composition.test.tsx:89-96` — the two unfalsifiable cases deleted with a comment naming what replaced them; the count case (which `TableFrame` could fail) kept. |
| **C-17** no document-scope live-region count | **CLOSED** | `page.test.tsx:1657-1661` — "is the document's ONE live region, wherever line 2 came from (OD-7)" asserts `document.querySelectorAll('[aria-live]')` has length 1 on a rendered page. |
| **C-18** vacuous `--doc-seam-height` assertion | **CLOSED** | `lens-band.test.tsx:160-166` keeps only the `ResizeObserver` spy. The Playwright assertion (which has a live publisher for a subject) is untouched, and the §4 tripwire can now be stated as "0 outside that one spec". |
| **C-19** a ticket-only exception silences the guide's act | **NO-CHANGE ACCEPTED** (with a caveat) | Agreed it is a ruling. But the lane's reason — "after W3-R1 it is far less reachable, an actless ticket exception now has to win on deadline distance" — **does not hold on real data**: see N-01, where every desk need lands in one of two equal-distance buckets and the ticket's `money` row (distance `-0`, tie-break 5) sorts against them by input order alone. |
| **C-20** `deriveRedLetterModel` dead | **NO-CHANGE ACCEPTED** | Not this lane's symbol to delete. |
| **C-21** `moreId` unreferenced, no dialog semantics | **NO-CHANGE ACCEPTED** | Nit, out of brief. |
| **C-22** `ffe-section.tsx` `scroll-mt-16` | **NO-CHANGE ACCEPTED** | Nit; specificity still wins. |
| **C-23** `line2.kind === 'none'` unreachable | **NO-CHANGE ACCEPTED** | Now covered by the derivation suite's empty-spread case, which asserts the whole `line2` shape including `form: 'long'`, `short: null`. |
| **C-24** ladder segments carry `data-index-region` | **NO-CHANGE ACCEPTED** | Explicitly a W4 CSS-scope item. |

**Also verified closed from the lane's own list, since they touch this review's surface:** FID-02 — all **seven** `<FoldSeam>` call sites pass `cause` (`git grep '<FoldSeam' -- src` → 7 files: approvals, care, ffe, money, boards, schedule-rule, schedule-spine; `cause={` → 7), and the lane's two corrections to my site list are right (`previous-work.tsx` renders no `FoldSeam`; `project-mood-boards.tsx` and `schedule-spine.tsx` do). The cell is inside the summary span (`fold-seam.tsx:76-85`) with `shrink-0` on the cause and `truncate` on the summary, so the seam stays a one-line 44px control and the cause never truncates. D-B25 — `margin-handoffs.spec.ts:146-175` pins **both** supersessions and reads the row off the standing sheet. B4 — `lens-ladder.tsx:275-289` (`flexBasis: 'auto'` and `flexShrink: 0` on an empty spread) and `:470` (`doors.length > 0` gates the heading), both matching OD-2's second branch.

---

## New findings in the fix diff

### N-01 · The deadline sort is real in the fixtures and inert on real desk data — major · high
`lens-band-derivation.ts:325-328` (`statedDays`) and `:356-365` (`deadline`) derive the whole W3-R1 ordering by **regex-scraping the printed sentence** for `N day(s)`. The desk does not write day counts into those sentences. Every `NeedLine.text` template in `desk-derivation.ts`:

- `overdue_decision` `:576-579` → `` `${n} decisions overdue — oldest due ${fmtDay(...)}` `` — a **date**, no day count.
- `overdue_invoice` `:612-615` → `` `${label}${figure} overdue${oldest} — send a reminder` `` — same.
- `damage_claim` `:813-815` → `` `${po} has an open damage claim` `` — no day, no window.
- `awaiting_inspection` `:830-832`, `task_due` `:917-919`, `po_unacknowledged` `:985-987` — none state a day count.

And `RedLetterRow` (`red-letter-zone.tsx:50-57`) carries `key · kind · text · actionLabel · onAct · urgent` — the desk's own `dueOn` (which `deriveNeeds` sets from `earliest_overdue_due`) is dropped by `page.tsx`'s mapper and never reaches the band.

So on a real paper every need resolves to one of exactly two buckets: `sense: 'past', distance: -0` (the three overdue kinds, because `days` is null) or `sense: 'none', standingSince: null` (everything else). Inside each bucket `distance` ties, `standingSince` is null for every need, and the sort falls through to `needTieBreakRank` and then input order — **which is the desk's kind rank, the thing W3-R1 exists to replace** ("neither the shipped `NEED_TIER` nor the desk's `TIE_BREAK_RANK`"). `overdue_decision` and `overdue_invoice` are both `TIE_BREAK_RANK` 2 (`need-tie-break.ts:97-98`), so even the tie-break cannot separate them and line 2 leads with whatever `rankOperationalNeeds` emitted first.

Failure scenario, on the document the ruling was written about: `…d5` carries an overdue invoice, two overdue approvals, a damage window and a 14-day PO silence. W3-R1 states line 2 must print "the **older overdue approval**" and the sheet must run approval (6d) → approval (3d) → carrier window (tomorrow) → PO silence (14d). What ships is the desk's order, unchanged — and the lane's own seeded case (`lens-band-derivation.test.ts:512-518`) asserts the **invoice** leads, because its fixture happened to list the invoice first. When the carrier window actually closes tomorrow, nothing moves.

Why the suite is green: every W3-R1 falsifier hand-writes a string the desk never emits — `'… overdue 6 days'`, `'… — due in 21 days'`, `'… window closes in 1 day'` (`lens-band-derivation.test.ts:343-395`, `page.test.tsx:1552-1562`). The assertions are correct; the fixtures are fiction. This is the same defect class as C-15, one layer down.

Smallest fix: widen `RedLetterRow` with the `dueOn` the need already holds (and the claim window's close date where one exists), and compute `distance` in `page.tsx`'s mapper or in `deadline()` from `dueOn − today` in whole days; keep `statedDays` only as the fallback for a source that does state one. Then re-point at least one falsifier at a desk-shaped sentence (`'2 decisions overdue — oldest due Aug 23'`) so a fixture can never again prove a rule the product cannot reach.

### N-02 · `+N MORE` never prints when only open inputs stand — major · high
`lens-band.tsx:173` — `const withheld = printed.standingCount - 1`, where `standingCount = standing.length + inputs.length` (`lens-band-derivation.ts:555`). The `−1` is correct only while line 2 is naming one of the sheet's rows. When `line2.kind` is `'guide'` (or `'none'`) line 2 names **nothing** from the sheet, so the door has to count all of them.

Failure scenario — W3-R2's own worked example: the A1 proposal fixture, nothing standing, one open input. `standingCount = 1`, `withheld = 0`, **no door prints**, and the signature row is unreachable at every offset and every width. The ruling states that case prints `Sent Aug 23 — not yet opened` `FOLLOW UP` `+1 MORE` "and the sheet holds the signature row". With three inputs the band prints `+2 MORE` over a sheet titled `Standing · 3` — the door and the title disagree by one.

Why the suite is green: `lens-band-derivation.test.ts:579-590` ("carries them on a paper where nothing else stands") pins `standingCount === 1` and `inputs` length 1 and never asserts the door; `lens-band.test.tsx:370` only exercises the standing case (4 exceptions + 1 input → `+4 MORE`), where the `−1` is right.

Smallest fix: `const withheld = printed.standingCount - (printed.kind === 'standing' ? 1 : 0);` plus one case asserting `+1 MORE` on the guide-with-one-input shape.

### N-03 · Both new "assume-wide, correct in an effect" tiers move the first paint at 390 — major · medium-high
`page.tsx:355-370` `useLensTier` starts at `'full'`; `letterhead-instruments.tsx:64-80` `useWideTier` starts at `true`. Both correct themselves in a `useEffect`, i.e. after the first paint. At 390 that produces two visible artefacts on every load:

1. **Line 2 blanks for 90ms.** The tier correction changes `line2.sentence` and `line2.act.label` (long → short), so `sameWords` is false and the L-1 latch runs: `opacity-0` for `LENS_TURN_OUT_MS`, then the short form. L-1's trigger is "the reading stop commits, on settle, never in flight" — a tier correction is neither, and this is the C-03 residue firing deterministically rather than by luck.
2. **The letterhead reflows.** `SharingTierInstrument` (`letterhead-instruments.tsx:529-540`) swaps `Sharing · Milestones` → `Sharing` after paint. That changes the ledger row's width inside a `flex-wrap` row in the letterhead, which can drop a row and move the band and the entire paper beneath it — a first-paint layout shift at exactly the width whose header budget is the wave's tightest number, and on the first screen the CLS sentence (c) is written about (the 30-step scroll spec would not see it, because it happens before the scroll).

Smallest fix: print both label forms and toggle with CSS (`min-[1180px]:hidden` / `hidden min-[1180px]:inline`) so the ledger never swaps after paint; and for the band, either seed `useLensTier` from a `useSyncExternalStore` with a matching server snapshot, or let `LensBand` adopt a change that leaves `line2.long.sentence` identical (form-only) without turning.

### N-04 · Two print changes are recorded as CLOSED that are the design lead's seat — major · high (process)
Both are defensible engineering and neither is in the review's finding list nor in a ruling:

- **A second title size.** `doc-letterhead.tsx:79` and `letterhead-vitals.tsx:478/:498` ship `text-[32px] … sm:text-[40px]`. Proposal §2 "What stays identical" reads: "40px Playfair letterhead title (`doc-letterhead.tsx:57`/`:59`) … **No new size.**" This adds a second title size *and* a fourth breakpoint (Tailwind `sm` = 640px, not one of the document's 390 / 1180 / 1440 tiers).
- **Label shortening at every width.** `letterhead-instruments.tsx:346-362` drops the family word from `Message the client` / `Preview as the client` unconditionally. W3-R3 authorises that shortening as the **390** response to the 390 budget ("the ledger goes to one line by shortening its labels (`MESSAGE · PREVIEW`), never by dropping an act"); the lane applies it at 1440 too, where the constraint the ruling named does not bind.

The lane already built the right instrument for this — the "Owed a ruling" section, where it correctly parked the two budget numbers. These two belong beside them, not in the CLOSED table. No code change requested; re-file them (and D-B24's `REMIND` divergence, which the log does state) so the design lead sees one list.

### N-05 · The lens line's `action_key` is the printed label, so one act reports two keys — minor · high
`page.tsx:1878` — `action_key: bandModel.line2.act?.label ?? null`. At 390 that label is `shortenAct(...)` (`Chase`), at 1440 it is the whole act (`Chase the approval`), so the same act emits two different `action_key`s by viewport, and any copy edit re-keys the event. The retired `guideSelected` reported `model.action.key`, a stable identity, and the red letter's own rule was "one need is one act in telemetry whether it was pressed on the paper or the bar". `page.test.tsx:1620` pins the label form, so the suite ratifies it.

Smallest fix: carry a stable `key` on `LensAct` (the need's `key`/`kind`; the guide's `action.key`) and report that; keep the label as a separate property if the dashboards want it.

### N-06 · `border-[var(--rule-mid)]` is not a colour, so the sheet's input rule paints terracotta — minor · high
`standing-sheet.tsx:92` — `className="mt-4 border-t border-[var(--rule-mid)] pt-3 ${EYEBROW}"`. `--rule-mid` is a border **shorthand** (`globals.css:131`: `1.5px solid #2C2926`), which is why `lens-ladder.tsx:296` writes it as `[border-left:var(--rule-mid)]`. `border-[…]` compiles to `border-color`, so this emits `border-top-color: 1.5px solid #2C2926` — invalid at computed-value time, dropped, and the property falls back to `currentColor`. The same element carries `EYEBROW`'s `text-[var(--color-terracotta-ink)]`, so W3-R2's "a rule and a second heading" prints as a **1px terracotta hairline** instead of the 1.5px charcoal `--rule-mid` — a weight and a colour outside the document's three-rule vocabulary, on a new surface, invisible to jsdom.

Smallest fix: `[border-top:var(--rule-mid)]` and drop `border-t`.

### N-07 · The vitals row now clips its own focus rings — minor · medium
`letterhead-vitals.tsx:414-417` adds `overflow-hidden text-ellipsis whitespace-nowrap` to the `flex flex-wrap` vitals row at **every** width. The FolioPopover check is right (it is portaled to `<body>`, so no calendar is swallowed), but the row's `VitalDate` controls carry `focus-visible:outline` with `outline-offset-2`, and an outline drawn outside the border box is clipped by an ancestor's `overflow: hidden` — so the keyboard ring on the first and last vital is cut against the row's edges. Separately, `text-ellipsis` on a flex container is inert: it never produces the ellipsis the class name implies, so an over-long vitals row is cut with no marker.

Smallest fix: move the clip to the individual `<span>`s (they are the things that must not wrap), leaving the row itself `overflow: visible`.

### N-08 · `shortSubject` can cut a word mid-letter, with no marker — nit · high
`lens-band-derivation.ts:257` — `chosen.toUpperCase().slice(0, 12).trim()`. A 13-character subject prints as 12 characters of one word with nothing to say it was cut (`RECONCILIATIO`), which reads as a typo rather than an abbreviation, in the 15px register at the width where line 2 is the only thing the reader has. Smallest fix: cut back to the last word or hyphen boundary inside 12, or append `…` (the door and the day count still never truncate).

### N-09 · The re-pointed `margin-handoffs` case depends on there being a second standing item — minor · medium
`margin-handoffs.spec.ts:169` clicks `[data-lens-more]`, which exists only while `standingCount > 1`. It passes on the FULL_RAIL fixture today (the log measured it on chromium), but if that seed ever composes a single need the click times out and the case fails for a reason that has nothing to do with the overdue derivation it is about — and, with N-02 unfixed, a fixture whose only extra item is an *input* fails the same way. Smallest fix: assert `[data-lens-more]` count 1 with a message first, or read the row from line 2 when it is the worst and from the sheet otherwise.

### N-10 · The "fires once" telemetry case does not assert once — minor · high
`page.test.tsx:1600-1622` is titled "fires once for the model the page actually printed" and asserts only `toHaveBeenLastCalledWith`. A double-fire — precisely the failure a keyed effect over a memoised model exists to prevent, and the one C-03's residue could produce — passes it. Smallest fix: add `expect(mockLensLineShown).toHaveBeenCalledTimes(1)`.

### N-11 · `lensLineShown` can fire from a tree the band is not in — nit · medium
The telemetry effect sits above the page's early returns and fires whenever `bandModel` is non-null. `bandModel` is null only when `bandSpread` is null (no row), so on a warm client navigation the event fires on the `!hydrated` render — before the band paints — and, because the deps do not change when the real tree mounts, never fires again for that shape. The `resolutionState === 'missing'` branch with a stale `row` has the same shape. Payloads are correct; the timing claim ("shown") is not. Smallest fix: return early from the effect unless the page is on its ready render.

### N-12 · The lane moves the suite and test counts with no written arithmetic — nit · high
`test-impact.md` closes with "A wave whose suite count moves without a written reconciliation does not merge." `npx jest src` on `3fb009c4b` reports **465 suites / 5404 tests**; the lane adds `letterhead-instruments.test.tsx` (new suite) and several cases, and `w3-fix-log.md` carries no arithmetic section. W0 and W3 both wrote one. Smallest fix: one table.

### N-13 · Three deliberately-red e2e cases ship inside the wave's own gating spec — nit · high
I am **not** counting the budget miss as a regression — leaving it visible rather than weakened is the right call. But the three `… (W3-R4 budget — OWED A RULING)` cases live in `lens-band-height.spec.ts`, the file that also carries the band's 18 height cells, SC1, SC2 and the C-02 target proof, so the nightly `integration.yml` run goes red on a file whose red is expected — which is how a team learns to stop reading it, and how a *new* failure in that file hides. Smallest fix: `test.fail()` (Playwright inverts the expectation and fails loudly the day the ruling lands and they start passing), keeping the comment verbatim.

---

## Verdict

**NOT SIGNED — N-01, N-02, N-03 gate; N-04 must be re-filed under "Owed a ruling" before merge.**

Everything the fix lane was asked to close in my list is genuinely closed: C-01…C-08 and C-15…C-18 all have a fix site and a test that can fail, and the C-02 and C-04 falsifiers are materially better than what they replace. Every NO-CHANGE reason is one I accept, with the single caveat recorded against C-19.

What holds the signature is that the lane's headline item — W3-R1's deadline sort — is proved only by fixtures the desk never emits (**N-01**), so the ranking the ruling replaced is still what ships on the seeded paper; that W3-R2's own worked example cannot be reached because the door is off by one whenever line 2 speaks for the guide (**N-02**); and that the two new tier hooks put a 90ms blank line and a letterhead reflow into the first paint at 390 (**N-03**). N-05…N-13 are fix-lane-next, not gates.

---

# Sign-off — pass 2

Reviewed `document-lens/w3-fix` @ `b6330afd4` (6 commits over `3fb009c4b`) against `build/w3-fix-log.md` "PASS 2". Read-only, no git.

**Evidence re-run in the fix worktree:** `npx jest src` → **465 suites / 5418 tests, 0 failing** — exactly the arithmetic the lane's N-12 table declares (5404 → 5418, +14). `npx tsc --noEmit` → zero errors outside the worktree's unbuilt dists. `grep matchMedia src/components/document/letterhead-{instruments,vitals}.tsx doc-letterhead.tsx` → none, so N-03(a) is structural rather than asserted.

## Per-id disposition

| id | disposition | evidence / what remains |
|---|---|---|
| **N-01** deadline sort inert on real data | **CLOSED**, one residual named below | `red-letter-zone.tsx:57-62` widens `RedLetterRow` with `dueOn`; `page.tsx:1521-1523` fills it from `need.dueOn`; `lens-band-derivation.ts:112-119` carries `LensStandingItem.deadline`; `deadlineOf()` at `:394-428` takes `structured ?? scraped` so `calendarDaysUntil` decides and the sentence regex is genuinely last-resort; `rankStanding(rows, needs, now)` and `LensBandInput.now` inject the day (`:440-447`, `:617`) so nothing reads the clock inside the derivation and no model changes under the reader at midnight; `short.days` derives from the same `distance` at `:459-461`, so the printed `7D` cannot disagree with the order it ranked in. Falsifiers are on the desk's **real emitted templates**, including the negative control I asked for — "reads no day count out of the sentence" strips `dueOn` from the same two sentences and shows both collapse to distance 0 and the desk's own order, which is the pass-1 defect reproduced on demand. And the end-to-end proof is the strongest artefact in either pass: `lens-band-height.spec.ts` NF-01 asserts `/^OVERDUE \d+D · INV-2026-114$/` at 390, a day count that can only come from `dueOn`, because "— oldest due Aug 22" states none. |
| **N-01 · the `po-silence` judgment** | **AGREE** | `po_unacknowledged` sets `dueOn` from `row.oldest_unacked_sent_at` (`desk-derivation.ts:992`) — the day the order **went out**, provenance rather than a deadline. Read as a date it yields −14 and the maker's quiet leads the paper, above a window closing tomorrow, which is the exact inversion W3-R1 forbids ("then things with no deadline (a silence), longest-standing first"). `deadlineOf` returning `none` for the whole tier before it looks at the date (`:409`) is the right shape, and the falsifier "files a maker's silence last, whatever day its PO was sent" pins it. One thing the lane could still take for free: that same sent day is the PO's true `standingSince`, and the sort already reads `standingSince` inside the `none` bucket — feeding it there would finally implement W3-R1's third clause for desk needs, which today ties at null and falls through to the tie-break. |
| **N-02** `+N MORE` off by one | **CLOSED** | `lens-band-derivation.ts:637` — `withheld = standingCount − (worst ? 1 : 0)`, exposed on the model (`:186-194`), consumed by the band at `lens-band.tsx:196`, and spent in the measure at `:663` so the door's own width tracks the number it prints. Three door assertions, and the one that matters is W3-R2's own example: a guide line with one open input now prints `+1 MORE` where `standingCount − 1` printed no door at all. |
| **N-03** the 390 first paint moves | **CLOSED**, both halves | **(a)** `useWideTier`/`WIDE_TIER` are deleted; `SharingTierInstrument` prints `Sharing` at every width (`letterhead-instruments.tsx:531`) with the tier kept in `aria-label`, and the register is CSS — `[&_.da-act]:text-[11px] min-[1180px]:[&_.da-act]:text-[12px]` on the group. The specificity argument in the comment is correct: the generated `.parent .da-act` is (0,2,0) and beats `DocumentAction`'s own single-class `text-[12px]`, where a `className` hand-down would have raced it. Nothing in the letterhead reads the viewport in JS any more, so there is no post-paint reflow left to have. **(b)** the latch compares the **long** form (`sameItem`, `lens-band.tsx:40-52`), so the tier settling under the model is adopted in place; `hasPrinted` (`:129-141`) makes the first model print directly. Hydration checked: `printed` is seeded from `model.line2`, the server and the first client render both hold the wide-tier model, and the correction arrives as a same-item adopt — no `useLayoutEffect`, no mismatch. A real later change still turns: `long.sentence` differs, `hasPrinted` is true, the 90ms path runs, and the existing "turns the sentence out at 90ms" case still passes. |
| **N-04** the two print rulings | **ACCEPTED** | Ruled as W3-R4/W3-R5 and recorded in `deviations.md` under D-B26. Nothing to carry; NF-02's `sm:` → `min-[1180px]:` correction at all three sites is the right follow-through, since `sm` (640px) was handing every phone above it the 40px title the ruling excludes at 390. |
| **N-05** `action_key` was the printed label | **CLOSED** | `LensAct.key` (`lens-band-derivation.ts:42-44`), sourced from `need.key` (`:488`) and `model.action.key` (`document-guide.tsx:23`), preserved across the short form (`:651-655`), and reported at `page.tsx:1889` with the effect's dep re-pointed at `act?.key` — so a tier swap no longer churns the impression key either. `page.test.tsx` pins `action_key: 'task_due-0'`. |
| **N-06** `border-[var(--rule-mid)]` invalid | **CLOSED** | `standing-sheet.tsx:93` → `border-[var(--doc-ink-border)]`, which `globals.css:61` declares as a colour (`rgba(44,41,38,0.18)`) and `:323` already uses in the same shape. The comment records why the shorthand could not work. |
| **N-07** the vitals row clipped its focus rings | **CLOSED** | `letterhead-vitals.tsx:416-421` → `overflow-clip [overflow-clip-margin:6px]`, and the inert `text-ellipsis` dropped. `overflow-clip-margin` is inside OD-4's browserslist, and `clip` (unlike `hidden`) makes no scroll container, so nothing else changes shape. |
| **N-08** `shortSubject` cut mid-word | **CLOSED** | `lens-band-derivation.ts:295-302` cuts back to the last space inside 12 and falls through to the hard cut only for a single over-length word; three cases including that fallback. |
| **N-09** the `margin-handoffs` re-point is fixture-fragile | **ACCEPTED** (report-only) | Unchanged, and non-gating. Worth noting it got slightly safer for the wrong reason: after N-02 the door also stands on a guide line with one input, so more shapes satisfy the unguarded `[data-lens-more]` click than before. |
| **N-10** "fires once" asserted no count | **CLOSED** | `page.test.tsx` now asserts `toHaveBeenCalledTimes(1)` beside the payload. |
| **N-11** `shown` from the loading tree | **CLOSED** | `page.tsx:1881-1895` gates the props on `hydrated && resolutionState !== 'loading' && !== 'error'` and adds `lensLineSettled` to the effect's deps so the impression fires when the band actually arrives; a new case renders the loading tree and asserts nothing fires. |
| **N-12** no jest arithmetic | **CLOSED** | The reconciliation is written and I reproduced it independently: 465 / 5418, and the four named suite deltas sum to +14. |
| **N-13** three silently-red e2e cases | **CLOSED** | `lens-band-height.spec.ts:478-479` — `test.describe('W3-R5's budget numbers (ruled, not yet met)', () => { test.fail(); … })`, with the decomposition above it. Both browsers exit 0, and the day a ruling lands the block fails loudly instead of going quietly green. |

## The declared divergence — NF-01's `psqlRun` paid-invoice fixture

**Agree, and I would have refused the mutation for a second reason.** The ratified fixture existed to make a long sentence outrank the ticket's short `$17,500 owed you` under the retired tier sort. After W3-R1 + N-01 the invoice already ranks worst on its own date (−7) on the untouched seed, and its 76-character sentence is exactly the long/short trigger NF-01 is about — the lane's spec proves both forms without touching the database. Marking the invoice paid would delete the `overdue_invoice` need itself, so the case would assert a sentence the paper no longer prints: a fixture that must not run. The second reason: a `psqlRun` mutation inside a `mode: 'serial'` spec mutates a seed every other document spec reads, and the wave's own e2e ledger already carries fixture-rot as a named hazard. The re-ranking half that the mutation would have exercised is covered at the unit level by the five N-01 deadline cases.

**Not counted as findings, per the brief:** the three W3-R5 budget numbers (`test.fail()`, decomposition written, W3-R6 pending) and NF-01's 9px webkit gutter allowance, which is scoped to the visual-elision check while the regex proves no words are lost.

---

## New findings in the pass-2 diff

### N2-01 · The damage window still cannot rank, and its falsifier is fiction — minor · high
`damage_claim` is not one of the six kinds that set `dueOn` (`desk-derivation.ts:583, 623, 766, 799, 924, 992`); its template is `` `${po} has an open damage claim` `` (`:813-815`), which states no date either. So on real data a carrier window still resolves to `sense: 'none'` and can never rank on when it closes — and W3-R1's own headline example, "a window closing tomorrow beats a task due next week", together with the `…d5` sheet order ending `CLOSES TOMORROW`, remains unreachable.

The new falsifier "puts a window closing tomorrow above a decision due weeks out" supplies `need('claim', 'damage_claim', 'FDL-0912 — carrier window closes Aug 30', 'File it', '2026-08-30')` — a sentence **and** a `dueOn` the desk does not emit. The sort logic it exercises is correct; the input is aspirational, which is the same fixture-fiction pattern N-01 was raised about, now surviving in exactly one kind.

This is not a code defect of this lane: no source field holds a claim window's close date, so it cannot be carried. Smallest fix: a `deviations.md` row stating that the `damage` tier ranks as a silence until a window date exists, and one line in the test's comment marking that fixture aspirational — so the next reader does not take the green case as proof the rung works.

### N2-02 · A client-side navigation records every 390 impression as `tier: 'full'` — minor · medium-high
`page.tsx:1899-1903` keys the `lensLineShown` effect on `[id, lensLineKind, lensLineActKey, lensStandingCount, lensLineSettled]`; `lensTier` is not among them, and `action_key` is now stable across the tier by design (N-05), so nothing in the key moves when the tier settles.

On a **cold** load this is fine: `hydrated` and the tier are both set from effects in the first commit and React batches them, so the one impression carries the settled tier. On a **client-side navigation** `hydrated` is already true, so the first commit has `lensTier === 'full'`, the props are non-null, the impression fires — and `useLensTier`'s own effect then corrects the tier into a re-render whose deps are unchanged, so no correction is ever recorded. Every in-app navigation to a document at 390 or 1280 is logged as `full`, and `tier` is one of the five fields D-B22 defined the payload around.

Smallest fix: have `useLensTier` also report whether it has read the viewport once, and `&&` that into `lensLineSettled` — the impression then waits one frame and carries the real tier, with no second event.

### N2-03 · `sense` can contradict `tier` on a due-today deadline — nit · medium
`deadlineOf` (`lens-band-derivation.ts:415-427`) derives `sense` purely from the sign of the distance, so an `overdue`-tier need whose `dueOn` is **today** returns `{ sense: 'ahead', distance: 0 }` — and `shortState` (`:388-391`) then drops `OVERDUE` and prints the raw eyebrow instead. The desk's overdue predicates use strictly-past dates today, so it is unreachable; it becomes reachable the first time a rule is written with `<=` or a timezone puts the boundary a few hours out. Smallest fix: force `sense: 'past'` whenever `tier === 'overdue'` and keep the signed distance for ordering only.

### N2-04 · The short form gives a deadline ahead the same `ND` grammar as a day past — nit · medium
`short.days = Math.abs(distance)` (`:459-461`), so a claim window closing in one day prints `CLAIM OPEN 1D · FDL-0912` in the same shape as `OVERDUE 7D · INV-2026-114`. D-B24 specified the form against the past case (`OVERDUE 6D · BEDROOM`) and the mockup's word for the ahead case is `CLOSES TOMORROW`. Nothing lies, but `1D` beside a non-overdue state word does not say which side of the day it is on. The design lead's call; naming it before the walk, not asking for code. (Unreachable today for the same reason as N2-01.)

### N2-05 · Three comments now contradict the code NF-02 just fixed — nit · high
`doc-letterhead.tsx:76-77` and `letterhead-vitals.tsx:483-484` still read "32px at phone widths, 40px from `sm` up" directly above `min-[1180px]:text-[40px]`. `sm` being the wrong breakpoint is precisely what NF-02 corrected, so the comment now teaches the mistake the code no longer makes.

### N2-06 · C-11's clear can pre-empt an announcement it should not — nit · low
The clear effect keys on `printedWords` and therefore fires on the commit where the turn lands, 90ms **after** the announce effect wrote the stop line. When a stop change and a genuine line-2 change coincide, the `Now at …` text exists for roughly one turn before it is wiped, and a polite region may not have been read by then. The coincidence is rare — line 2 is derived independently of the reading stop, so a stop change alone never moves `printedWords` — and the atomic re-read at the turn still speaks the sentence. Noted for completeness; the keying decision itself (words, not identity) is right, and the lane's comment explains why an identity key was worse.

---

## Verdict

**SIGNED — no gating ids.**

All three pass-1 gates are closed with falsifiers I can run: N-01 with a negative control that reproduces the old collapse on demand and an end-to-end `OVERDUE \d+D` that only `dueOn` can produce; N-02 with W3-R2's own example asserted at the door; N-03 with the JS tier read removed from the letterhead entirely and the latch keyed on the long form. N-04 is ruled and recorded. N-05…N-08, N-10…N-13 are closed, N-09 is accepted report-only, and I agree with both judgment calls I was asked to rule on — `po-silence` staying a silence whatever `dueOn` it carries, and NF-01's paid-invoice mutation being refused.

N2-01…N2-06 are minor or nit and none of them gates. Two are worth a ledger row rather than code (N2-01's unreachable damage window, N2-04's `ND` grammar for a deadline ahead); N2-02 is the one I would take into the next lane, because it silently mislabels every mobile impression reached by in-app navigation.
