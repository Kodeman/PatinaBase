# Critique — C-feasibility

*The Document · The Smart Lens · 2026-08-29. Seat C: the tree is the territory. Every verdict below carries a `file:line` I opened, a number from `research/12-layout-measurements.json`, or an F-id. I picked no winner. I found what is wrong with both.*

---

## 1 · One line

**X — "the spine is the lens."** X promises that a region's height changes only while it is entirely out of frame, and calls that its zero-layout-shift mechanism (§4, H5b). It is not one. A region 120px above the frame that drops from 1,840px to 112px pulls every pixel below it — including the line she is reading — up by 1,728px. There is no `scrollBy`, no correction, no compensation anywhere in the 587 lines of proposal X; I grepped. That is F04's 283.19px jump, generalised to every region and every fling. The second worst thing is next to it: X's ladder draws segments at "true proportional extent" read from the region roots through a `ResizeObserver` (§9, Wave 2), and X-4 has just made every off-screen root 112px. The instrument measures the thing the instrument erased.

**Y — "the paper is the lens."** Y's rail is a twelve-rung ladder of the Vandersteen project spread, and three of the twelve rungs are not there. `AccountBand` mounts only under `spreadSection !== 'project'` (`page.tsx:2202`), so `The accounts` is absent from the spread Y indexes it on. `AuthorizationsLedger` renders inside `ProjectCommerceSection` inside `MoneyRegion` (`page.tsx:2122`), so `Authorizations` is a child of `Money`, not its peer. `The call sheet` is an overlay, never a section (`page.tsx:2331`). The ladder is the proposal's whole instrument, and it was drawn from the deck rather than from the tree.

---

## 2 · The brief, item by item

### 2.1 Every mechanism in both mechanics tables, against the real code

#### X — ten mechanics

| # | Verdict against the tree |
|---|---|
| **X-1 The window travels** | Buildable. A rAF-throttled write of `data-lens-window` needs no browser feature. **But its reduced-motion form does not exist as written.** X says the bracket "steps to segment boundaries instead of tracking" and that the Document's policy stays CSS-media-query-only (F30: no file under `components/document` imports `hooks/useReducedMotion.ts`, verified — `src/hooks/useReducedMotion.ts` is 25 lines, imported nowhere in the document tree). A CSS `@media` block cannot change what a JS rAF handler computes. X would have to read `matchMedia` in JS, which is the policy it says it keeps. **DC-07.** |
| **X-2 The segment inks** | Buildable. `spine-running-index.tsx:98-114` already swaps `font-semibold` and `--text-muted`→`--color-charcoal` on `current`. This is the shipped mechanic renamed. |
| **X-3 The passed mark** | Buildable, illegible. A 1px `--color-clay` rule on `--doc-rail-stock`: `contrast.test.ts:320-325` asserts clay measures **below 4.5:1** on rail stock, and F74 puts it at 1.82:1. A state-carrying non-text mark wants 3:1 (1.4.11). **DC-12.** |
| **X-4 A region quiets** | **The blocker.** "0ms — one commit, entirely off-screen" is true of the commit and false of its consequence: a collapse above the reading line moves the reading line. `use-region-fold.ts` already unmounts bodies, so the unmount is cheap; the missing thing is the scroll correction. **DC-01.** |
| **X-5 A region returns to full** | Same hole, mirrored: a region below returning to full grows below the frame (harmless), but a region *above* returning to full pushes her down. X's return threshold is 40px, so this fires constantly on upward scroll. **DC-01.** |
| **X-6 The head-line yields** | Buildable. |
| **X-7 The rail's act cell** | Buildable, 28px reserved. But the "one inked leader" it prints is `region-head.tsx:156-157`'s `index === 0 ? 'inked'` entry, which lives inside `DocumentActionGroup` with `data-action-region` — reproducing it in the rail means a second render of an action whose contract `region-head.test.tsx:128-158` pins to one element. Not named. |
| **X-8 The head-line swaps** | Buildable. |
| **X-9 The edited line takes weight** | Buildable — `.has-wash` / `.row-wash` (`globals.css:322-349`) already does the wash; the clay rule is a border swap. |
| **X-10 The lens settles** | Buildable. |

**The one thing X says is cheap that the tree says is not:** `studio-drawer.tsx:120-130`. X's Wave 1 says "`breadcrumbFor()` returns the household for `/doc/*` … One function, present at every scroll offset". Opened: `function breadcrumbFor(pathname: string | null): string | null` — a pure pathname→string map, with `if (pathname.startsWith('/doc')) return 'Document';` at `:128`. It has no document row, no household, and `StudioDrawer` (`:132`) is global chrome mounted outside the document tree. This is a cross-tree data-plumbing job, not one function. **DC-06.**

#### Y — ten mechanics

| # | Verdict against the tree |
|---|---|
| **Y-1 The sentence turns** | Buildable. Two text spans with `motion-reduce:transition-none`. |
| **Y-2 The ladder segment travels** | Already shipped. `spine-running-index.tsx:79` is verbatim `transition-[top,height] duration-200 ease-out motion-reduce:transition-none` on a `w-[2px] bg-[var(--color-clay)]` span measured from `el.offsetTop` / `el.offsetHeight` (`:45-52`). Y's citation is exact and its reuse claim is true. |
| **Y-3 A region prepares** | Buildable, and correct: growth happens below the frame, which moves nothing above it. |
| **Y-4 A region releases** | Buildable, and it is the one place either proposal names the correction: "a same-frame `scrollBy` takes back the exact height delta". Y's own R1 names the failure mode. This is the single strongest engineering line in either document. |
| **Y-5 The margin's rule slides** | Buildable — one absolutely-positioned span in `margin-rail.tsx`, same idiom as `spine-running-index.tsx:76-82`. |
| **Y-6 She folds a region** | Buildable **except the rule step.** Y says the seam's rule steps `--rule-strong → --rule-mid`. `RegionRule` already takes `weight="mid"` (`region-rule.tsx:17-22`), so the mechanism exists — but the change is at the call sites (`commercial/money-region.tsx:233`, `schedule/schedule-rule-region.tsx:182`, `approvals/project-approval-document.tsx`), and Y's §9 says "`region/region-rule.tsx` — **untouched.** The rule weight never carries density," naming no call site. **DC-40.** |
| **Y-7 The pen goes down** | Buildable. `globals.css:439-458`'s reduce block already gives the flat `-still` tint. |
| **Y-8 The breath** | Unchanged. `globals.css:271-287` verified: keyframes `:271-279`, `.doc-breath` `:280-282`, the reduce block `:283-287`. |
| **Y-9 A rung is pressed** | Buildable. `scrollToRegion` (`use-document-running-index.ts:202-222`) already branches on `prefers-reduced-motion` at `:206-214`. Y's citation of `:212-215` is off by two lines; the branch is at `:214`. |
| **Y-10 Back to the top** | Buildable. |

**The thing Y says is cheap that the tree says is not:** the ladder itself. Twelve rungs on a spread that carries four `[data-index-region]` roots — `ffe-section.tsx:1209`, `schedule/schedule-spine.tsx:1057`, `commercial/money-region.tsx:229`/`:250`, `approvals/project-approval-document.tsx:565`/`:586`, and nothing else in the tree. `DocumentIndexKey` is `'schedule' | 'approvals' | 'ffe' | 'money'` (`document-index.ts:17`) and `regionHeadingId` throws on any key not in `PROJECT_PAPER_ORDER` (`:100`). Y's Wave 2a ships the ladder; Wave 2b covers pre-work only. The eight new roots are in no wave. **DC-30.**

**And the second:** `doc-spine.tsx:44` carries `min-[1440px]:w-auto` — the rail's 200px comes from the grid template at `page.tsx:1764`, `min-[1440px]:grid-cols-[200px_minmax(0,1fr)_232px]`. Y's Wave 2a file list has `doc-spine.tsx` and no `page.tsx`. The narrowing cannot happen in the file Y assigns it to. **DC-37.**

### 2.2 Every test each proposal breaks, including the ones it did not name

I opened every file below. Line numbers are from the working tree.

#### `src/lib/document/__tests__/stage2-approval-cutover-contract.test.ts`

The regex at `:19` is exactly `/data-active-section[\s\S]{0,1500}?<SectionStageLineMount/`. Measured with Python over the real `page.tsx`:

| occurrence of `data-active-section` | line | chars to `<SectionStageLineMount` |
|---|---|---|
| `querySelector('[data-active-section]')` | **1170** | 36,494 — out of range |
| the real attribute | **1942** | **1,109** (391 of headroom, not 372) |
| the comment "*They ride inside \<div data-active-section\> so they*" | **1961** | **143** |

**X:** Wave 0 deletes it. Correct disposition. X's numbers are wrong — 1128 and 162 against a measured 1109 and 143 — and X's replacement ("render the page and assert `SectionStageLineMount` is the first element child of `[data-active-section]`") moves a pure `fs.readFileSync` test (`:1-6`) into a React render that needs `page.test.tsx`'s 1,897 lines of mock scaffolding. **DC-23.**

**Y:** Wave 1 deletes it, with the same two wrong numbers and the same replacement. **DC-50.** Y additionally claims that deleting `page.tsx:1838-1847` and `:1863-1880` "shortens the source between `data-active-section` and `<SectionStageLineMount>`". Both ranges are **above** the attribute at `:1942`. The window is untouched. **DC-36.**

**Both missed the same file's other five `it` blocks.** `:50-58` requires `margin-rail.tsx`, `mobile/mobile-margin-chips.tsx` and `mobile/mobile-sheets.tsx` each to contain both `classifyMarginItems` and `MarginDecisionClassificationNotice`. X rewrites two of the three; Y rewrites all three (Waves 2a and 4). Neither names the contract. **DC-54 / DC-55.**

#### `src/components/document/__tests__/job-ticket.test.tsx` (541 lines)

Verified: `:226-241` eight rows in order · `:244-254` seam collapse · `:256-266` sticky, `data-pinned`, eight rows again at `:265` · `:268` unfold in place · `:505-508` focus lands on `Unfold ↓` · `:511-531` the seam-var lifecycle (`''` at `:519`, `/px$/` at `:524`, `''` at `:529`) · `:533-541` no shadow.

**X:** deletes the file. Clean, and correct — the component is gone.

**Y:** names `:519`, `:524`, `:529`, `:259`, `:262`, `:517`, `:533-541` line by line. The unit is the `it`, not the line. `:259` and `:262` live inside `:256-266`, whose `:265` asserts `ticketRows()).toHaveLength(8)`; `:244-254`, `:268`+ and `:505-508` all die with the rows and with the `:235-244` pin-focus effect Y deletes. Y names none of them. **DC-38.**

#### `src/app/(document)/doc/[id]/page.test.tsx` (1,897 lines)

`const TICKET = '[data-job-ticket]'` at `:1244`. Ticket-dependent tests: `:1252-1269` (eight rows on project/install/care, three cases) · `:1271-1293` (eight rows and four values with no project) · `:1309-1313` · `:1315-1341` · `:1343-1349` · `:1351-1358` (exactly one ticket) · `:1361-1382` (the sentinel contract) · `:1384-1410` (stands above the red-letter zone) · `:1583-1587` and `:1602-1604` (the money row's text).

**X** names `:1236-1257` ("the ticket-position block") and `:1360-1379`, and keeps `:1230-1234`. The eight-row test runs to `:1269`; six further tests and two money-row assertions go unnamed. **DC-08.**

**Y** names `:1351-1358` and `:1360-1379` as surviving a selector rename — which is right, and is the better call than X's deletion, because `:1381`'s `sentinel.nextElementSibling` is the only thing stopping a block from landing between the sentinel and the band. Y names none of the eight-row or money-row tests, and `:1384-1410` dies twice over for Y: the ticket loses its rows *and* `screen.getByRole('region', { name: 'Needs attention' })` disappears when the `:1839-1847` ternary is deleted. **DC-41.**

#### `e2e/document/quiet-responsive-shell.spec.ts` (261 lines)

`:165` `spine.getByText(/On this paper/i)` · `:168-171` the retired blocks stay gone · `:173-176` and `:183-185` `toHaveCount(8)` · `:190-196` the 390 unfold path · `:224-228` spine width 55–57px · `:251-253` spine width ≥199.

**X** names `:165`, `:173-176`, `:183-196`. Correct — X's rail prints no `ON THIS PAPER` heading, so `:165` genuinely must be rewritten. X keeps the 200px rail, so `:251-253` survives (X never says so, because X never states its rail width — see §2.5).

**Y** names `:173-176`, `:183-185`, `:190-196`. `:165` survives for Y (`ON THIS PAPER` kept, `doc-spine.tsx` unchanged there). But `:251-253` asserts the spine's `boundingBox().width >= 199` at 1440 and Y narrows it to 160. Y names `quiet-release-contracts.spec.ts:150-158` for the same fact and misses this one. **DC-37.**

#### `e2e/document/quiet-release-contracts.spec.ts` (463 lines)

`:105-118` compact-tier width 55–57 and bounds `spine [0,56]`, `paper [56,width]` · `:150-158` at 1440, `spine [0,200]`, `paper [200,1208]`, `margin [1208,1440]` · **`:169-299` — one test, "keeps one focused timer doorway at 1280px"**, running on `[data-compact-spine-timer-doorway]` (`:185`), its `data-spine-timer-regime` (`:187-190`), the timer dialog, and four viewport-handoff steps: `:212-237` **1439→1440**, landing focus on `[data-full-spine-timer] [data-action-key="open-manual-time-entry"]` (`:223-228`); `:239-260` 1280→1179; `:262-291` 1179→1180.

Both proposals evict the timer from the rail. That test dies whole.

**X** names `:188-190` only. Understated by 130 lines. **DC-26.**

**Y** names nothing here, and in §5 `mobile` states: "The existing 1179↔1180 focus handoff (`quiet-release-contracts.spec.ts:212-300`) is unchanged." `:212-237` is the **1439→1440** handoff onto the full spine timer, which Y deletes; `:262-291` is the 1179→1180 step, which runs on the compact doorway Y deletes. The range is misnamed and the claim is false. **DC-32.**

#### `src/components/document/doc-spine.test.tsx` (48 lines — the whole file)

`:14-19` names unrecorded history and pins `Jump to Project` as a button · `:23-29` `Put down` has `min-[1180px]:inline` **and** `screen.getByText('Project').closest('p')` has `min-[1180px]:block` · `:31-47` the shelved wrapper is `hidden min-[1440px]:block`.

Both evict the seven-mark `<ul>` (`doc-spine.tsx:64-120`), so `:14-19` goes red for both, unnamed by both. Both evict the active caption (`:122-136`), so `:26-28` goes red for both. X names `:25-28` as a block. **Y names only `:43-46` and says explicitly "`:25` (`Put down` `min-[1180px]:inline`) survives" — `:25` does survive; `:26-28`, in the same `it`, does not.** **DC-24 / DC-39.**

#### `src/components/document/__tests__/responsive-document-shell.test.tsx` (750 lines)

`:186-196` the spine regime string and classes · `:198-201` `Put down` targets · `:202-211` the arc's jump buttons · `:213-221` the two timer surfaces' visibility classes · `:310-320` the margin rail's `min-[1440px]:sticky col-start-3` · `:655-689` eight ticket rows at 1440 · **`:692-750` — two tests, the room-in-hand flow.**

`:186-196` survives both (`min-[1440px]:w-auto` is unchanged by Y's grid-template edit). `:202-211` dies for both, unnamed by both. `:213-221` dies for both; X names `:215-219`, Y names nothing.

`:692-750` is the finding neither proposal saw. The take is `fireEvent.click(ticketRow('rooms')!.querySelector('button')!)` then `fireEvent.click(roomChip('living')!)` — **the only way to take a room in hand is the ticket's `Rooms` row and its chips.** Both proposals dissolve the ticket. X homes `Rooms` at "the FF&E segment's sub-rungs on the rail", and §4 says those sub-rungs print only "while Pieces is under the window" — so at s0, s1 and s3 there is no way to take a room. Y homes `Rooms` at "the `Pieces` region head's ledger (`ADD A ROOM` already lives there)", which is a door to a different act. The release survives in both (the letterhead's in-hand row, `doc-letterhead.tsx:69-70`); the take does not. **DC-09 / DC-42.**

#### `src/components/document/__tests__/shelved-spine.test.tsx` (349 lines)

`:82-98` one `aria-current`, jump from any · `:100`+ paper order · `:155-196` `paperRegionsForSection` (`:156-163` four on project, `:165-176` two on install/care, `:178-187` `[]` on the four pre-work spreads, `:189-195` never states an order the canon does not print) · `:217-236` `On this paper` and nothing else · `:238-246` four rows on project · `:248-262` two rows on install and care.

**X** names `:82-98`, `:217-236`, `:238-262` (Wave 2) and `:155-197` (Wave 5). Complete enough.

**Y** names `:155-197`, `:217-236` ("stays true"), `:238-262`. But Y's twelve-rung ladder prints on *every* spread, so `:165-176` and `:248-262`'s "two on install and on care" both break — Y covers the first in `:155-197` and the second in `:238-262`. Adequate.

#### `src/components/document/region/__tests__/use-region-fold.test.tsx` — the shared error

`:38-41`, opened:

```
it('applies the derived default when no choice has been made', () => {
  render(<Probe docId="doc-1" region="schedule" defaultFolded={true} />);
  expect(state()).toBe('folded');
});
```

Both proposals make `latchedDefault` the region's **initial density instead of its initial fold** (X §9 Wave 4; Y §9(a)3). Under that change `state()` reads `'open'`. Both call the rewrite additive in almost the same words — X: "rewrite `:38-60` **additively** — every existing assertion stays true"; Y: "an **additive rewrite**: every existing assertion at `:38-60` stays true". The first assertion in the range is the one the change falsifies. **DC-03 / DC-31.**

#### Gates confirmed green

- **`shadow-gate.test.ts`** (137 lines). `:85-95` one `box-shadow` in `globals.css`, selector `.doc-elevated` · `:97-105` a frozen inventory elsewhere under `src/` · `:107-122` no `drop-shadow(` and no shadow in any `filter:` · `:124-127` one `--elevation-sheet` declaration · `:129-136` `.doc-elevated` on ≤3 TSX files. Neither proposal declares a shadow, a `drop-shadow`, or a new `.doc-elevated` wearer. **Both stay green.** One note: the gate is a source grep by construction (`readFileSync` + regex), and NG2 requires a computed-style sweep. Both proposals cite this test as the proof. **DC-27 / DC-52.**
- **`contrast.test.ts`.** `:301` `--doc-rail-stock === '#E8E3DB'` · `:304-311` charcoal, the muted ramp and clay-ink at 4.5:1 on rail stock · `:313-341` the five-file `RAIL_FILES` scan for `text-[var(--color-aged-oak)]` and `text-[var(--color-clay)]` · `:365-372` rail-vs-ground separation > 1.1. Neither proposal introduces clay *text* on the rail; both stay green. X's Wave 0 converts the hard-coded list to a glob before renaming a spine file — the right order. Y keeps `spine-timer.tsx` and `spine-shelved-blocks.tsx` on disk for exactly this reason and adds `spine-ladder.tsx` to the list by hand — also correct, and stated with the reason. Both handled.
- **`region/__tests__/region-rule.test.tsx:59-74`** pins `.doc-rule-strong` to `border-bottom: 1px solid rgba(44, 41, 38, 0.18); border-top: 2px solid #2C2926; height: 6px`. Neither touches it. Green.
- **`region/__tests__/fold-seam.test.tsx:36-45`** forbids `opacity-0|translate-y` and requires `fold-settle`. Neither gates on a hydration flag. Green.
- **`region/__tests__/row-overflow.test.tsx:31-45`** the always-visible glyph and unmounted verbs. Green for both; Y cites it correctly for its 390 head.
- **`region/__tests__/region-head.test.tsx:110-121`, `:128-157`** the head's `grid-cols-1` / `min-[1180px]:grid-cols-[1fr_auto]` and the unconditional action region. Neither collapses the grid. Green — but see DC-15.
- **`e2e/document/workflow-stage-responsive.spec.ts:30-32`, `:47`** shell visible at 320, no horizontal overflow. Green for both; Y cites it exactly.
- **`e2e/document/margin-handoffs.spec.ts:67-70`, `:102-105`** `data-margin-mode` rail/sheet. Green for both; Y cites it.
- **`lib/document/__tests__/ticket-derivation.test.ts`** untouched by both, correctly — `deriveTicket` survives in both proposals.

### 2.3 Browser-feature dependence

Neither proposal depends on `animation-timeline: scroll()`, `content-visibility`, `@property`, or any scroll-driven CSS. Both say so explicitly and both give the reason (X §7/F35 and §9's disagreement with E1; Y §7/F35 and §11.4/§11.5). Both keep the `var(…, 0px)` fallback arms at `globals.css:1026`, `:1034`, `:1037` and `commercial/money-region.tsx:48` meaningful by never registering the property. Both refuse `content-visibility: auto` on E1-08's grounds — the `contain: layout paint` stacking context against `.row-wash`'s `z-index: -1` (`globals.css:330`), which I confirmed is still `-1` in the tree. **On this item both are clean, and both are right.**

Two residues:

- `apps/designer-portal/package.json` has **no** `browserslist` key — confirmed by grep. `playwright.config.ts:65-68` enables WebKit. X's Wave 0 adds the key. Y names the gap and leaves it open while arguing from the WebKit matrix in §11.4. **DC-51.**
- The one JS-only dependence in either proposal that lacks a form under reduced motion is X-1. **DC-07**, above.

### 2.4 Animated layout properties, dynamic sticky heights, `--doc-seam-height` consumers

**Every consumer in the tree**, by grep — there are exactly four in product code plus the writer:

| site | file:line | X | Y |
|---|---|---|---|
| writer | `job-ticket.tsx:60`, `:248-259` (deps `[pinned, unfolded, seam.identity, seam.exceptions]`) | deleted; **zero writers** | moved to `lens-band.tsx`; published always |
| schedule glance `top` | `globals.css:1026` | rule deleted — safe: `schedule-rule.tsx:548` carries Tailwind `top-0`, so the glance still sticks | resolves once |
| region landing | `globals.css:1034` | reads a new `--doc-landing-clear: 4rem` | unchanged |
| FF&E landing floor | `globals.css:1037` | reads `--doc-landing-clear` | unchanged; at 56px the `4rem` floor still wins — Y is right |
| money inline clearance | `commercial/money-region.tsx:48` | reads `--doc-landing-clear` | kept as written |
| (test) | `job-ticket.test.tsx:519`, `:524`, `:529` | file deleted | rewritten, named |

**Both enumerations are complete for product code.** Y's is the more careful of the two — it is the only one that reaches the test lines and the only one that notices the `max(…, 4rem)` floor survives at 56px.

Two drifts from SP-04, which reads "exactly one element measures and publishes its height (`--doc-seam-height` keeps its name and its single writer)":

- **X** drops to zero writers. Openly stated, but it is not what the plank says. **DC-21.**
- **Y** keeps `job-ticket.tsx`'s `sticky top-0 z-[4]` shell and its sentinel in Wave 1 while creating `lens-band.tsx` as the publisher. Two elements, one of them sticky and one of them measured. Which is the band is never resolved, and SP-04 forbids a second publisher. **DC-49.**

**Layout properties animated:**

- **Y** animates none. Height is a step, taken off screen, with a same-frame correction. `top` moves inside a fixed-content column. The band's box in flow is 56px before and after the pin. This is correct and it is stated with the mechanism.
- **X** animates none *as a transition*, but changes region height in one commit above the reading line with no correction — a worse failure than an animated one, because it is instantaneous and unrecorded (F113: the existing 283.19px jump does not appear in `PerformanceObserver` entries in either register). **DC-01.**

### 2.5 Are the §9 waves independent?

They are not, in either proposal, and both say "each wave is valuable alone".

**X — six waves.**
- **Wave 3 claims SC1 = 378px.** Measured, at rich/1440/s0, `approvals` is a **55.5px** block at y 791.8 and the first `[data-region-head]` is `schedule` at **y 1005.31** — approvals is folded on arrival (F89) and a `FoldSeam` prints no `[data-region-head]`. X's band table places the first head immediately after the approvals `RegionRule`, which requires approvals to be open. Approvals opens only when `latchedDefault` stops folding — **Wave 4**. Wave 3 alone lands the first head at roughly 378 + 55.5 + a gap. **DC-05.**
- **Wave 2's ladder needs Wave 5** for its own SC4 pre-work number (60.8%), and needs Wave 4's data-derived reserve heights not to destroy its extents — which they do (DC-02).
- **Wave 0 must precede Wave 2** (X says so: the contrast glob before the spine rename). That is a dependency, correctly declared.
- Only Wave 4 is behind a flag. Wave 3 is stated as unflaggable: "deleting a component is not flaggable."

**Y — four waves behind one flag.**
- **Wave 1 claims SC1 = 329px.** Same defect, same cause: it needs Wave 3's fold→density. **DC-33.**
- **Wave 1 ships the ticket dissolved and Wave 4 builds the home.** Y's own §4 table sends `Drawings`, `Spec`, `Boards` and `People` to "the margin's shelf line", and the shelf line is built in **Wave 4** (`margin-rail.tsx`, "the shelf line mounts above the first-touch note at `:462`"). Between Wave 1 and Wave 4 those four doors have no destination at any scroll state — which is F09, the finding Wave 1 claims to answer. **DC-56.**
- **Wave 2a ships a twelve-rung ladder whose eight new rungs have no roots**, and no wave creates them (2b is the four pre-work spreads). Y names this as R6 and prices nothing. **DC-30.**
- One flag, `doc-lens`, for all four waves. Wave 2a's narrowing is a grid template at `page.tsx:1764`; a boolean that has to serve `grid-cols-[200px_…_232px]` and `grid-cols-[160px_…_232px]` at once, plus `shelf-panel.tsx:145`'s `min-[1440px]:left-[200px]`, is a wider flag than "one fail-closed flag" implies. **DC-53.**

### 2.6 What the three load-bearing mechanisms actually become

| | X | Y | Verdict |
|---|---|---|---|
| **`use-region-fold`'s three voices** | `forceOpen` supreme; `explicit` a hard fold that outranks position; `latchedDefault` → initial **density**; position added as a fourth non-persisting voice, `full ⇄ quiet` only, never writing storage. Return widens to add `density`. | Identical, voice for voice, plus the explicit note that the widening runs "across all seven fold keys (`:25-40`)" — which is right: `RegionFoldKey` is a seven-member union at `use-region-fold.ts:25-40`. | **Both answer it explicitly and both answer it the same way.** Both then get the test wrong (DC-03/DC-31), and neither notices that the change opens `Client approvals` and `Schedule dates` on arrival, since both are folded by a derived default today (F89) — a visible product change on the first screen, unnamed in both. **DC-57 / DC-58.** |
| **The ticket seam and `--doc-seam-height`** | Retired. Four consumers repointed at a declared constant `--doc-landing-clear: 4rem`. A refusal, stated as one. | Kept, one writer, published always, value constant across scroll. Consumer table complete. | **Both answer it.** X's is cleaner (nothing can change); Y's is the more conservative and keeps `page.test.tsx:1361-1382`'s sentinel contract alive. X's SP-04 drift (DC-21) and Y's two-sticky-elements ambiguity (DC-49) are the residues. |
| **The `-20% 0px -62% 0px` band and the 700ms jump lock** | Band **retired** — rootMargin becomes `0px`, the window is the frame, and the hysteresis moves onto the region box (120/40). Jump lock **kept and widened**: for 700ms it holds every region at `full` and pins the window. | Band **kept unchanged**, with the reason (F105, probe §2 measured it clean). Jump lock kept and gains one job: forcing the target stop to `full`. The density observer is a *separate* hook with its own attach via `MutationObserver` on `[data-document-paper]`, explicitly not inheriting the 8 × 250ms retry at `:120-133`. | **Both answer it.** Y's is the better answer: it changes only what needs changing, and `READING_BAND` at `:34` genuinely does work. X retires the band and never says what `resolve()` picks instead when every region intersects a `0px` root margin — the pick rule is "the window's midpoint", which is a rewrite of the resolver X does not name. **DC-59.** |

### 2.7 Path verification — `ls` on every §9 citation

Every product and test path cited in either §9 exists. Run against `apps/designer-portal/`: 40 product paths, 22 test paths, all `OK`. No proposal cites a path that is not there.

Two citation errors, neither a missing path:

- **X** cites `mobile/mobile-bar.tsx:156` for `min-h-[64px]`; the class is at **`:216`**. `:150-160` is a keydown handler. **DC-60.**
- **X** cites `job-ticket.tsx:345` for the sentinel in one place and `:347` in another; `:347` is correct (`:345-346` is the comment above it). Cosmetic.

---

## 3 · The standing assignment — second copies on screen

Read from `shots/w1440-rich-s0.png`, `-s1.png`, `-s2.png`, `w1280-rich-s1.png`, `w1440-ticket-seam.png`, and the region/heading structure in the tree. Labels are quoted as they print.

**Today, for the baseline** — at 1440/s0 the frame carries `Money` / `$6,200 OWED` (rail), `MONEY  $6,200 owed you, 15 days · $16,330 deposit not drawn` (ticket), `Invoice INV-2026-W02 · $3,800 overdue — oldest due Aug 14 — send a reminder` (needs band), and three `MONEY ·` chips (margin). Five money statements, four numbers (F10). `Pieces` prints twice (`Pieces / 3 PIECES · 0 ROOMS` in the rail, `PIECES  3 unspecified` in the ticket). The in-hand clock prints twice and disagrees: `● IN HAND / 18 min` in the rail against `IN HAND TODAY 1h 09m` in the drawer (F82).

### Proposal X

| cell | second copies on screen |
|---|---|
| **1440 s0** | **Identity** — `Vandersteen` in the letterhead `<h1>` *and* `Vandersteen` on the rail head's line 1. **Stage** — the seven-mark arc plus its active caption in the letterhead *and* `PROJECT · PROCUREMENT & ORDERS 4 OF 6` on the rail head's line 2. **Install date** — the vitals line *and* `INSTALL SEP 15 · 3 WEEKS` on the rail head's line 3. **Money rung** — the needs band's overdue invoice *and* the ladder's money segment value `$17,500 OWED · 22 DAYS`, two different numbers in one frame. X gives the rail head no yielding rule at s0; §5 `at rest` prints it in full. Four of the seven standing facts print twice. |
| **1440 s1** | Identity once, stage once, install date once (the letterhead is gone; the rail head is the only carrier — this is X working). Still doubled: **money** (needs band + ladder segment value), and **the current region's name** — the ladder's segment prints `Pieces` while the margin's group heading prints `BESIDE PIECES · 3`. X's Appendix A licenses the second explicitly: "the margin never prints a region's extent or position, only the region's *name* as its group heading." |
| **1440 s2** | **Current region's name** — three copies: the paper's own 24px `Pieces` head, the margin's `BESIDE PIECES · 3`, and the rail's window position. The segment's word yields (X-6); the group heading does not. **Worst exception** — the rail head's line 3 has swapped to `OVERDUE 6 DAYS · PRIMARY BEDROOM` while the approvals segment carries a terracotta tick and its own `2 AWAITING · 1 OVERDUE 6D` value line. |
| **1440 s3** | **The Record** three times: the rail head's line 3 reads `THE RECORD` (M-9), the ladder's last segment prints `The record` with its end cap, and the paper prints `The record · 12 complete` (`previous-work.tsx:46`). |
| **1280 s0** | **Identity twice** — the letterhead's `<h1>` *and* the drawer breadcrumb, which X gates on width only, never on scroll. |
| **1280 s1–s3** | No duplication of identity — and no stage, phase, install date or region **name** anywhere on screen. The rail is text-free, the active caption is deleted, the breadcrumb is one word. That is the opposite failure and it is worse. **DC-19.** |

**Verdict on X:** the rail head is a second header. It carries identity, stage and date, and at s0 the letterhead carries all three too. X's §11.1 argues that a band is "a permanent 6–7% tax on every frame at every offset, forever, to carry facts a column carries for free" — the column does not carry them for free at s0; it carries them a second time.

### Proposal Y

| cell | second copies on screen |
|---|---|
| **1440 s0** | **Identity** — `Vandersteen Residence` in the letterhead `<h1>` *and* `VANDERSTEEN RESIDENCE` on the band's line 1, roughly 60px apart, since the band sits directly under the letterhead in flow. **Stage** — the `lg` StrataMark and the seven-mark arc Y keeps in the letterhead (`doc-letterhead.tsx:53-55`) *and* `PROCUREMENT & ORDERS 4 OF 6` on the band. **Install date** — the vitals *and* the band's right-flush `INSTALL SEP 15`. **Current region** — three copies: the band's right-flush stop word `CLIENT APPROVALS`, the ladder's bolded rung with the clay segment on it, and the paper's own 24px `Client approvals` `<h2>`. Y gives the band no yielding rule at s0 either. |
| **1440 s1** | Identity, stage and install date each once — the band is doing exactly the job Y designed it for, and F13 is genuinely answered. **Current region** still three copies (band word + ladder rung + the paper's head when it is in frame). **The call sheet** twice at every state: the ladder's `The call sheet` rung and the margin shelf line's `CALL SHEET · 4`. |
| **1440 s2** | **Current region** three copies: `PIECES` right-flush on the band, `Pieces` bolded on the ladder, `Pieces` at 24px Playfair on the paper. Y's §11.2 names this and defends it — "the ladder's clay segment says the same thing in the same frame" — which is the standing assignment's first catch, conceded rather than fixed. |
| **1440 s3** | **`Closing the book`** three copies: the band's line 2 (`Closing the book · 0 of 6 closed out`), the ladder's rung, and the paper's own head (`care-band.tsx:254`, `:311`). Plus `The record` twice (rung + `previous-work.tsx:46`). |
| **1280 s0–s3** | The same DOM, so the same band duplications at s0. Below the fold the ladder is a text-free tick line, so the current-region count drops from three to two (band word + paper head). The 1280 tier is Y's quietest cell. |

**Verdict on Y:** Y's redundancy is narrower than X's and it is honest about it — the band is one organ, one height, and it wins every contest it enters. What it does not win is the current stop, which it prints three ways at 1440 and defends on the ground that the third copy is cheap. SP-08 says the loser prints nothing.

---

## 4 · Defects

Severity is against the ask and the tree, not against the proposal's ambition. Confidence below 0.5 carries "what would settle this".

---

**DC-01 · X · blocker · 0.90 · s1/s2/s3 · 1440 / 1280 / 390 · §3 X-4, X-5; §4 "The header", H5(b); §5 `condensed`**
A region that releases above the reading line takes its height with it and nothing gives it back. X-4 collapses FF&E `1,840px → 112px` when its box is 120px clear of the viewport; a region clearing the *top* by 120px is above her, so every pixel below it — the line she is reading — rises by 1,728px. X's own promise ("every pixel inside the viewport, at any offset") and its H5 claim ("the words she is reading stay on the pixel they were on") both fail. `scrollBy`, "correction", "compensat" and "takes back" appear nowhere in proposal X; the only hit for "compensation" is §11.5, about find-in-page. This is F04's 283.19px jump multiplied by the region count, and F113 records that nothing in the tree catches it.
*Fix:* adopt Y-4's same-frame `scrollBy(−Δ)`, or forbid density changes above the frame top entirely.

**DC-02 · X · blocker · 0.85 · s1/s2/s3 · 1440 / 1280 · §4 "The spine" (the ladder); §9 Wave 2; §10 R2**
The ladder's segments are drawn at "true proportional extent", read "from the region roots through one `ResizeObserver`" (§9, Wave 2). X-4 has just made every off-screen root its 112px quiet reserve. Once the lens is on, the only region whose measured height is its true height is the one on screen, so the map's extents flatten to the reserve for every region except the one she is already in. X's R2 anticipates *crops resolving* as the extent risk and offers "data-derived extents (line counts) … which is a different mechanic" as the exit — it does not notice that its own density mechanic forces that exit.
*Fix:* derive extents from data (line counts, row counts) from the start, as X already does for the quiet reserve.

**DC-03 · X · high · 0.90 · all states · all widths · §9 Wave 4**
`region/__tests__/use-region-fold.test.tsx:38-41` reads `render(<Probe … defaultFolded={true} />); expect(state()).toBe('folded')`. Making `latchedDefault` an initial *density* makes that `'open'`. X calls the rewrite "additive — every existing assertion stays true". The first assertion in the named range is the one it falsifies.
*Fix:* name `:38-41` as a rewrite, not an addition.

**DC-04 · X · high · 0.85 · s0 · 1440 / 1280 / 390 · §6 SC1; §9 Wave 3**
SC1 = 378px is credited to Wave 3, and needs Wave 4. Measured at `rich.1440.s0`: `approvals` is 55.5px at y 791.8 and the first `[data-region-head]` is `schedule` at y **1005.31** — approvals is folded on arrival and a `FoldSeam` prints no head. X's band table jumps straight from the approvals `RegionRule` to the first head. Wave 3 alone lands it near 434px, over the ≤405 threshold.
*Fix:* credit SC1 to Wave 4, or move the fold→density voice into Wave 3.

**DC-05 · X · high · 0.85 · s0/s1/s2/s3 · 1280 (and 1180–1439) · §4 "The 1180–1439 tier"; §9 Wave 1**
`studio-drawer.tsx:120-130` is `function breadcrumbFor(pathname: string | null): string | null` — a pure pathname map with no access to the document. `StudioDrawer` (`:132`) is global chrome. X's Wave 1 calls returning the household "One function, present at every scroll offset, at every width ≥1180". It is a cross-tree data path into a component that is mounted outside the document's tree and has no props.
*Fix:* name the data path — a context or store subscription — and price it.

**DC-06 · X · high · 0.80 · s1/s2/s3 · 1440 / 1280 · §3 X-1; §4 "Motion grammar", M5**
X-1's reduced-motion form is "the bracket **steps to segment boundaries** instead of tracking — a static bracket around the segment under the frame's midpoint, redrawn on settle only". That is a different JS computation, not a CSS rule, and X asserts in M5 that the Document's motion policy stays CSS-media-query-only (F30) and that it adds "exactly one new `@media (prefers-reduced-motion: reduce)` block".
*Fix:* either read `matchMedia` in the rAF handler and say so, or give X-1 a CSS-expressible reduce form.

**DC-07 · X · high · 0.85 · s0/s1/s2 · 1440 / 1280 / 390 · §9 Wave 3, "Tests"**
`page.test.tsx`'s ticket blast radius is understated. X names `:1236-1257` and `:1360-1379`. Unnamed and red: `:1252-1269` (eight rows on three spreads), `:1271-1293` (eight rows and four values with no project), `:1309-1313`, `:1315-1341`, `:1343-1349`, `:1351-1358`, `:1384-1410` (the ticket stands above the red-letter zone), `:1583-1587` and `:1602-1604` (the money row's text).
*Fix:* delete the whole `describe('the job ticket mount (B1)')` block, `:1243-1411`, by name, and repoint the money-row assertions at `deriveTicket`.

**DC-08 · X · high · 0.80 · s0/s1/s3 · 1440 / 1280 / 390 · Appendix B, row `Rooms`; §9 Wave 3**
Taking a room in hand runs only through the ticket. `responsive-document-shell.test.tsx:697-698` is `fireEvent.click(ticketRow('rooms')!.querySelector('button')!)` then `fireEvent.click(roomChip('living')!)`. X's Appendix B homes `Rooms` at "the FF&E segment's sub-rungs on the rail", and §4 says those sub-rungs print only "while Pieces is under the window" — so at s0, s1 and s3 there is no way to take a room. The release survives (`doc-letterhead.tsx:69-70`), the take does not. `responsive-document-shell.test.tsx:692-750` is unnamed.
*Fix:* give the room chips a home that exists at every offset, and name `:692-750`.

**DC-09 · X · medium · 0.85 · all states · 1440 · §4 "The spine"; §11**
X never answers the brief's S5. The rail's width after is stated nowhere: §4 opens "**Before.** 200px at ≥1440" and never says what it becomes. The `200 + 1040 + 232 = 1472 > 1440` arithmetic, the 1008px paper column at exactly 1440, and what a returned pixel buys the measure are all absent, and no §11 refusal covers it. Grep for "160px", "rail width", "S5" in `proposal-x-v1.md` returns nothing.
*Fix:* state the width, or refuse the question in §11 with the reason.

**DC-10 · X · medium · 0.80 · all states · 1440 · §4 "Rail ink, computed"; §6 SC4**
X's own table ends its last element at y 719 in a 900px rail, then claims "longest empty run **96px**, the foot padding". `measure-layout.mjs:277-289` runs the empty-run cursor to `spineRect.bottom`, so the run is 900 − 719 = **181px**. The comparison number X quotes (270px today) was produced by that same instrument.
*Fix:* recompute against `spineRect.bottom`, or extend the ladder track.

**DC-11 · X · medium · 0.75 · s1/s2/s3 · 1440 / 1280 · §3 X-3; §2 "Stock and ink"**
X-3's passed mark is "a 1px `--color-clay` rule". `contrast.test.ts:319-325` asserts clay measures **below** 4.5:1 on `--doc-rail-stock`; F74 measures 1.82:1. It is a state-carrying non-text mark ("where she has already been") at 1.82:1, under 1.4.11's 3:1. `contrast.test.ts` will not catch it, because `:334-338` only greps for `text-[var(--color-clay)]`.
*Fix:* draw the passed mark in `--color-clay-ink`, which `contrast.test.ts:304-311` already gates at 4.5:1 on the rail.

**DC-12 · X · medium · 0.80 · s0 · 1440 · §5 `at rest`; SP-08**
Four of the seven standing facts print twice at s0/1440: identity (`<h1>` + rail-head line 1), stage (letterhead arc + rail-head line 2), install date (vitals + rail-head line 3), money (needs band + ladder segment value). X's yielding rule (X-6) covers segment *names and values* against their own heads; it says nothing about the rail head against the letterhead. SP-08 forbids a second printing in the same frame.
*Fix:* give the rail head an s0 yielding rule, the way X gave the segments one.

**DC-13 · X · medium · 0.75 · s0/s1 · 1440 / 1280 · §3 X-8; §4 "The spine"; SP-08**
Two money numbers in one frame. At s0 and s1 the needs band prints `Invoice INV-2026-W02 · $3,800 overdue` while the ladder's money segment prints `$17,500 OWED · 22 DAYS`. That is F10's five-statements/four-numbers defect and F82's two-disagreeing-clocks defect reproduced in the new organ. X's F10 answer claims "money is printed by the needs band at s0 … and by the rail's money segment at every other offset" — but nothing in §3 or §4 silences the segment while the band is in frame.
*Fix:* make the segment yield to the band, or the band to the segment; name which.

**DC-14 · X · medium · 0.70 · s0 · 390 · §4 "The header", move 2; §4 "390"**
X moves the instruments into the letterhead's ledger "in exactly the two-track grid `region/region-head.tsx:118-121` already uses" and calls it "zero vertical cost". That grid is `grid-cols-1` below 1180 and two-track only from 1180 (`region-head.tsx:120`, pinned by `region-head.test.tsx:110-121`). At 390 the ledger stacks below the title and the cost is not zero. X's 390 letterhead budget of 155px does not carry it.
*Fix:* budget the stacked ledger at 390, or leave the instruments where they are below 1180.

**DC-15 · X · medium · 0.70 · s0 · 1440 / 1280 · §4 "The header", the band table**
The arc row is budgeted at **24px**. The seven marks are `<li>` cells whose jump controls carry `min-h-11` (`doc-spine.tsx:100`, `:111`) — 44px. Collapsing them to a 24px row collapses seven interactive targets to 24px tall, which is 2.5.8's floor and not its comfortable side, on the one control that reaches the six other stages. X's own ladder argument insists "every desktop segment clears 44px".
*Fix:* budget 44px, or say why the arc's targets may be smaller than the ladder's.

**DC-16 · X · medium · 0.70 · s0 · 1440 / 1280 / 390 · §9 Wave 3, `page.tsx`**
`page.tsx:1863-1880` is one fragment holding `LetterheadInstruments` **and** `<FolioLetterhead projectId={row.project_id} />` at `:1871`. X's Wave 3 says "`LetterheadInstruments` (`:1863-1880`) moves into the letterhead" and never mentions the folio. Deleting the range deletes the folio letterhead.
*Fix:* name `FolioLetterhead` and its destination.

**DC-17 · X · medium · 0.75 · s1/s2/s3 · 390 · §4 "390"**
"The lens line is the mobile bar's left zone … the context word becomes the same two strings the rail head prints: `Vandersteen · Pieces`. Same words at 390 as at 1440." The zone is `flex-[1_1_0]` sharing a 390px bar with the centre act and `MORE` (`mobile-bar.tsx:223`), and its context word carries `truncate` (`:230`). `m390-rich-s1.png` shows the studio puck already overprinting `IN THIS DOCUMENT` / `Project` — one word. `Vandersteen · Pieces` will not print.
*Fix:* take the identity out of the bar at 390 and give it a line of its own.

**DC-18 · X · medium · 0.65 · s1/s2/s3 · 1280 · §4 "The 1180–1439 tier"**
At 1280 below the fold X prints, on the whole screen: `←` in the rail, a text-free ladder, and one drawer breadcrumb word. The stage, the phase count and the install date are on no organ at that tier at any offset. The active caption is deleted by name; the ladder has no words; the drawer crumb is the household only. Axis 3's 6-anchor asks for identity, stage and current region legible at every offset at 1440 **and 1280**.
*Fix:* keep one word of stage somewhere at 1280, or declare the loss in §11.

**DC-19 · X · medium · 0.60 · s0 · 390 (and 1440) · §4 "The header", move 3**
The needs band's reserve is 152px at 1440 and 200px at 390. Measured on the Chen seed: `guideOrAttn` is **152.75px** at 1440/s0 and **192.75px** at 390/s0 — so the reserves are the seed's current heights, not a budget. On the Vandersteen specimen the band carries longer strings plus X's own new `+2 MORE — OPEN THE LEDGER`, and at 390 an exception already wraps to four lines (`m390-rich-s1.png`). A reserve that the content exceeds is either a clip or a shift, and the reserve is X's whole SP-03 mechanism.
*Fix:* size the reserve on the specimen's longest live `deriveTicketSeam` exception, and state the truncation rule.

**DC-20 · X · low · 0.70 · all states · all widths · §9 Wave 3, "What becomes of the seam variable"**
SP-04 reads "`--doc-seam-height` keeps its name and its single writer". X drops it to zero writers. Stated openly, but it is a plank implemented differently from the floor both proposals were required to adopt identically.
*Fix:* note it as an amendment to SP-04 rather than as compliance with it.

**DC-21 · X · low · 0.65 · s1/s2/s3 · 1440 / 1280 · §4 "Region heads and spacing", R3 table**
The R3 table gives the folded reading "Rule above: `--rule-mid` single". `RegionRule` takes `weight="mid"` (`region-rule.tsx:17-22`), so the mechanism exists — but the change lives at the call sites (`money-region.tsx:233`, `schedule-rule-region.tsx:182`, `approvals/project-approval-document.tsx`), and X's mount-order note says "Every change is inside a region's own wrapper element or in `region/region-head.tsx`."
*Fix:* name the three call sites.

**DC-22 · X · low · 0.75 · n/a · n/a · §9 Wave 0**
The regex arithmetic is wrong and the replacement is misplaced. Measured over the real file: the attribute at `page.tsx:1942` is **1,109** characters from `<SectionStageLineMount` at `:1964` (X says 1128; headroom is 391, not 372), and the comment at `:1961` is **143** (X says 162). The replacement — "render the page and assert `SectionStageLineMount` is the first element child" — moves a `fs.readFileSync` contract test (`:1-6`, zero React imports) into a render that needs `page.test.tsx`'s 1,897 lines of mocks.
*Fix:* put the render assertion in `page.test.tsx`, where the harness already exists, and leave the source file's four remaining `it` blocks alone.

**DC-23 · X · low · 0.60 · s0 · 1440 / 1280 · §9 Wave 1, "Tests"**
Two more spine tests go red unnamed when the seven-mark `<ul>` (`doc-spine.tsx:64-120`) leaves the rail: `doc-spine.test.tsx:14-19` (`getByLabelText('Brief: Not recorded')`, `getByRole('button', { name: /Jump to Project/ })`) and `responsive-document-shell.test.tsx:202-211` (the same jump buttons).
*Fix:* add both to Wave 3's list, since the arc moves in Wave 3.

**DC-24 · X · low · 0.60 · all states · 1440 / 1280 · §6 SC4**
`measure-layout.mjs:245-253` counts an element as ink over its whole rect if it has own text **or a background or a border**. X's 372px ladder track is a stack of `--rule-hair`-bordered segments, so it reads as 372px of continuous ink whatever it actually paints. 71.4% is partly a property of the instrument, not of the rail.
*Fix:* state the rail's ink as painted area, or say the metric is being read as "structured, not empty".

**DC-25 · X · medium · 0.70 · s0/s1/s2/s3 · 1280 · §9 Wave 1, "Tests"**
`quiet-release-contracts.spec.ts:169-299` is one test, "keeps one focused timer doorway at 1280px", running on `[data-compact-spine-timer-doorway]` (`:185`) with four viewport-handoff steps, including `:212-237`'s 1439→1440 handoff onto `[data-full-spine-timer] [data-action-key="open-manual-time-entry"]` (`:223-228`). Evicting the timer kills all of it. X names `:188-190`.
*Fix:* name `:169-299` and say where the compact timer doorway goes.

**DC-26 · X · low · 0.60 · all states · all widths · §8, NG2**
NG2 requires the shadow budget be "proven by a computed-style sweep, not a source grep — a `filter: drop-shadow` counts". X's proof is `lib/document/__tests__/shadow-gate.test.ts`, which is `readFileSync` plus regex by construction (`:91`, `:101-104`, `:110-120`). It is a good gate and it is the grep NG2 names.
*Fix:* say the mockup's computed-style sweep is the proof and the gate is the tripwire.

**DC-27 · X · low · 0.55 · s0 · 1440 · §4 "The header", the band table**
`letterhead-vitals.tsx` renders an optional 44px in-hand row (`doc-letterhead.tsx:69-70`, `inHandRoomName`). X's 128px letterhead subtotal has no slot for it. With a room in hand, SC1 becomes 422px — over the ≤405 threshold. *What would settle this:* measure `rich.1440.s0` with a room held; the measurement file was captured with none.

**DC-28 · X · low · 0.60 · n/a · n/a · §9 Wave 2, `use-document-running-index.ts`**
X retires `READING_BAND` (`:34`) and sets `rootMargin` to `0px`, but never says what `resolve()` picks when several roots intersect a zero-margin root. The stated rule ("the window's midpoint") is a rewrite of the resolver, not a constant change, and SC12 ("never null while the paper is in view") depends on it. `shelved-spine.test.tsx:82-98` (exactly one `aria-current`) is named for rewrite; the resolver is not.
*Fix:* state the pick rule as a change to `resolve()`.

**DC-29 · X · low · 0.55 · n/a · n/a · §9 Wave 4; §4 "Region heads and spacing"**
Making `latchedDefault` a density instead of a fold opens `Client approvals` and `Schedule dates` on arrival — both are folded by a derived default today (F89; visible in `w1440-rich-s0.png` as `Client approvals  NO DECISION LEAD · NO APPROVALS AUTHORED  UNFOLD ↓`). That is a visible change to the first screen of every project document and X does not name it. *What would settle this:* trace which callers pass `defaultFolded` truthy on a project spread.

**DC-30 · X · low · 0.55 · n/a · n/a · §9 Wave 1 / Wave 3**
`stage2-approval-cutover-contract.test.ts:50-58` requires `margin-rail.tsx` and `mobile/mobile-sheets.tsx` (and `mobile-margin-chips.tsx`) each to contain the literals `classifyMarginItems` and `MarginDecisionClassificationNotice`. X rewrites `margin-rail.tsx` (Waves 1 and 3) and `mobile-sheets.tsx` (390 work) and never names the contract. *What would settle this:* keep the imports; the risk is only that a rewrite drops them.

**DC-31 · X · low · 0.60 · n/a · n/a · §4 "390"**
`mobile/mobile-bar.tsx:156` is cited for `min-h-[64px]`; the class is at `:216`. `:150-160` is a keydown handler.
*Fix:* repoint the citation.

---

**DC-32 · Y · blocker · 0.90 · s0/s1/s2/s3 · 1440 / 1280 / 390 · §4 "The spine"; §6 SC4; §9 Wave 2a**
`The accounts` is not on the project spread. `page.tsx:2202` gates `<AccountBand …>` on `spreadSection !== 'project'` — the comment at `:2197-2201` is explicit: "the band and the money region are one either-or … a band gated on the live row would print the accounts twice (or nowhere)". Y lists `The accounts` as one of the twelve Vandersteen **project** stops and gives it a quiet line, `$184,500 approved · 20% margin`. The rung indexes a region the spread does not mount — which is the exact failure `document-index.ts:59-70` and `shelved-spine.test.tsx:165-176` exist to prevent.
*Fix:* drop `The accounts` from the project ladder; eleven stops, not twelve.

**DC-33 · Y · high · 0.85 · s0/s1/s2/s3 · 1440 · §4 "The spine"; §4 "quiet line" table**
`Authorizations` is inside `Money`, not beside it. `AuthorizationsLedger` (`commercial/authorizations-ledger.tsx:113`, heading `Authorizations & trade scopes` at `:167`) renders inside `ProjectCommerceSection` (`project-commerce-section.tsx:33`, `aria-label="Project commercial planning"`), which renders inside `MoneyRegion` (`page.tsx:2122`). F116's own evidence is this nesting: at s3 the rail says `Money` while the frame shows `AUTHORIZATIONS & TRADE SCOPES`. Y gives `Authorizations` a peer rung and a peer quiet line (`Nothing released yet`), so pressing it and pressing `Money` land in the same region.
*Fix:* make `Authorizations` a sub-rung of `Money`, or drop it.

**DC-34 · Y · high · 0.85 · s0/s1/s2/s3 · 1440 / 1280 / 390 · §9 Wave 2a; §10 R6**
Eight of Y's twelve rungs have no root and no key. The tree carries exactly four `[data-index-region]` values (`ffe-section.tsx:1209`, `schedule-spine.tsx:1057`, `money-region.tsx:229`/`:250`, `project-approval-document.tsx:565`/`:586`), `DocumentIndexKey` is a four-member union (`document-index.ts:17`), and `regionHeadingId` **throws** on an undeclared key (`:100`). Wave 2a ships the ladder; Wave 2b covers only the four pre-work spreads. The work that creates roots for `The letterhead`, `The work`, `Authorizations`, `The accounts`, `Closing the book`, `The call sheet`, `The record` and `Colophon` is in no wave and carries no cost band. Y names it as R6 and prices nothing.
*Fix:* add the eight roots to Wave 2a and re-band it, or ship four rungs in 2a.

**DC-35 · Y · high · 0.90 · all states · all widths · §9(a); §9 Wave 3, "Tests"**
Identical to DC-03. `use-region-fold.test.tsx:38-41` asserts `defaultFolded={true}` → `'folded'`; Y's `latchedDefault`→density makes it `'open'`; Y calls the rewrite "additive … every existing assertion at `:38-60` stays true".
*Fix:* name `:38-41` as a rewrite.

**DC-36 · Y · high · 0.85 · s0/s1/s2/s3 · 1280 · §5 `mobile`; §9 Wave 2a, "Tests"**
Y states: "The existing 1179↔1180 focus handoff (`quiet-release-contracts.spec.ts:212-300`) is unchanged." Opened: `:212-237` is the **1439→1440** step, asserting focus lands on `[data-full-spine-timer] [data-action-key="open-manual-time-entry"]`; `:239-260` is 1280→1179; `:262-291` is 1179→1180. Every step of the enclosing test `:169-299` runs on `[data-compact-spine-timer-doorway]` (`:185`) or `[data-full-spine-timer]` (`:223`), both of which Y's timer eviction deletes. The range is misnamed and the "unchanged" claim is false.
*Fix:* name `:169-299` as a rewrite and say where the compact timer doorway goes.

**DC-37 · Y · high · 0.80 · s0 · 1440 / 1280 / 390 · §6 SC1; §9 Wave 1**
SC1 = 329px is credited to Wave 1 and needs Wave 3. Measured: approvals is a 55.5px `FoldSeam` at y 791.8 and the first `[data-region-head]` is `schedule` at y 1005.31. Y's arithmetic (`32 + 211 + 56 + 24 + 6`) assumes approvals prints a head, which happens only when `latchedDefault` stops folding — Wave 3.
*Fix:* credit SC1 to Wave 3, or move the fourth voice into Wave 1.

**DC-38 · Y · high · 0.80 · s0/s1/s2/s3 · 390 · §1 the falsifiable sentence; §4 "390"; §6 SC3**
The 64px two-line band cannot hold Y's own line 1 at 390. `page.tsx:1791` gives `<main>` `px-7` at 390, so the measure is 390 − 56 = **334px**. Line 1 is `VANDERSTEEN RESIDENCE · PROCUREMENT & ORDERS 4 OF 6` (50 chars) plus right-flush `INSTALL SEP 15 · PIECES` (23) = 73 characters of 11px mono at `tracking-[0.05em]` ≈ 525px. Line 1 alone wraps to two lines; line 2's sentence (Y's R2 sizes it at ~96 characters) wraps to two more. Y's R2 covers line 2 at 1440 and never reaches line 1 at 390, and Y says explicitly "Not a shortened copy; the identical text".
*Fix:* rule what line 1 drops at 390, before the band ships.

**DC-39 · Y · high · 0.80 · s0/s1/s2/s3 · 1440 / 1280 · §4 "The spine"; §4 margin shelf line; §5 transitions**
`The call sheet` cannot be a stop and is printed twice. `page.tsx:2331-2334`: "D1: the Call Sheet is an overlay, never a section — mounted once here (closed by default)". Y makes it a ladder rung (a `scrollToRegion` target, §9 NG1) **and** a margin shelf-line door (`CALL SHEET · 4`). One of the two is unreachable; both are on screen in the same frame at 1440 at every state, which SP-08 forbids.
*Fix:* the shelf line keeps it; the ladder drops it.

**DC-40 · Y · medium · 0.85 · n/a · n/a · §4 "Mount-order consequence in `page.tsx`"**
"That removes two children and, incidentally, **shortens the source between `data-active-section` and `<SectionStageLineMount>`** rather than lengthening it." Both deleted ranges — `:1838-1847` and `:1863-1880` — are **above** the attribute at `:1942`. The window is 1,109 characters and neither deletion touches it. The claim is offered as reassurance about the regex Y is deleting anyway, which makes it harmless and still wrong.
*Fix:* strike the sentence.

**DC-41 · Y · medium · 0.80 · all states · 1440 · §9 Wave 2a, "Files"**
The rail's 200px is the grid template at `page.tsx:1764` (`min-[1440px]:grid-cols-[200px_minmax(0,1fr)_232px]`); `doc-spine.tsx:44` carries `min-[1440px]:w-auto`. Y assigns "the rail narrows to 160px at ≥1440" to `doc-spine.tsx` and lists no `page.tsx` in Wave 2a. Y also rewrites `shelf-panel.test.tsx:145` (`min-[1440px]:left-[200px]` → `left-[160px]`) without listing `shelf-panel.tsx:145`, the component that actually carries the class — and `quiet-responsive-shell.spec.ts:251-253` (spine width ≥199 at 1440) is unnamed.
*Fix:* add `page.tsx`, `shelf-panel.tsx` and `quiet-responsive-shell.spec.ts:251-253` to Wave 2a.

**DC-42 · Y · medium · 0.80 · s0/s1 · 1440 / 1280 / 390 · §9 Wave 1, "Tests"**
`job-ticket.test.tsx` is named line by line where the unit is the `it`. `:259` and `:262` are cited as surviving, but they sit inside `:256-266`, whose `:265` asserts `ticketRows()).toHaveLength(8)`. Unnamed and red: `:226-241` (Y sends it to a `deriveTicket` assertion, which is right), `:244-254` (the seam collapse), `:268`+ (unfold in place), `:505-508` (focus on `Unfold ↓`, which the deleted `:235-244` effect produced).
*Fix:* name the file as a whole rewrite; four of its ten tests have no subject left.

**DC-43 · Y · medium · 0.80 · s0 · 1440 / 1280 · §4 "The spine", mount-order; §9 Wave 2a, "Tests"**
`doc-spine.test.tsx:23-29` is one test with two assertions: `:25` (`Put down` has `min-[1180px]:inline`) and `:26-28` (`screen.getByText('Project').closest('p')` has `min-[1180px]:block`). Y evicts child 3, the active caption (`doc-spine.tsx:122-136`), which is where `Project` prints — and says "`:25` (`Put down` `min-[1180px]:inline`) survives", naming only `:43-46` for rewrite. `:14-19` (the arc's `Jump to Project` button) and `responsive-document-shell.test.tsx:202-211`, `:213-221` are unnamed too.
*Fix:* name `:14-19` and `:23-29`, and the two `responsive-document-shell` blocks.

**DC-44 · Y · medium · 0.75 · s0/s1/s2/s3 · 1440 / 1280 / 390 · §9 Wave 1 / Wave 4; F09 answer**
Wave 1 dissolves the ticket's rows. Wave 4 builds the margin's shelf line, which is where §4's SP-10 table sends `Drawings`, `Spec`, `Boards` and `People`. Between them, four doors have no destination at any scroll state — which is F09, the finding Wave 1's own table claims to answer. Y opens §9 with "Every wave is worth shipping alone."
*Fix:* move the shelf line into Wave 1, or say Wave 1 ships behind Wave 4.

**DC-45 · Y · medium · 0.75 · s0/s1/s2/s3 · 1440 / 1280 · §4 "Region heads and spacing", the four readings; §9 Wave 3**
Y's SP-02 table gives `folded by her` "rule stepped down to `--rule-mid`", and Y-6 repeats it. §9 Wave 3 says "`region/region-rule.tsx` — **untouched.** The rule weight never carries density." Both are true only if the step happens at the call sites — `money-region.tsx:233`, `schedule-rule-region.tsx:182`, `approvals/project-approval-document.tsx` — which Y never names. `RegionRule` does take `weight="mid"` (`region-rule.tsx:17-22`), so the fix is small; the omission is the defect.
*Fix:* name the three call sites in Wave 3.

**DC-46 · Y · medium · 0.75 · s0/s1/s2 · 1440 / 1280 / 390 · §9 Wave 1, "Tests"**
`page.test.tsx`'s ticket-row tests go unnamed: `:1252-1269`, `:1271-1293`, `:1309-1313`, `:1315-1341`, `:1343-1349`, `:1583-1587`, `:1602-1604`. And `:1384-1410` ("stands above the red-letter zone") dies twice for Y — the rows go, and `screen.getByRole('region', { name: 'Needs attention' })` disappears when the `:1839-1847` ternary is deleted. Y names `:1351-1358` and `:1360-1379` only.
*Fix:* name the whole `describe` at `:1243-1411`.

**DC-47 · Y · medium · 0.70 · s0/s1/s3 · 1440 / 1280 / 390 · §4 H1 table, row `Rooms`**
Same loss as DC-08. `responsive-document-shell.test.tsx:697-698` shows the only path to taking a room in hand: the ticket's `Rooms` row, then a room chip. Y homes `Rooms` at "The `Pieces` region head's ledger (`ADD A ROOM` already lives there)" — a door to creating a room, not the toggle that takes one in hand. The letterhead release survives (`doc-letterhead.tsx:69-70`); the take does not. `:692-750` unnamed.
*Fix:* give the room chips a home and name `:692-750`.

**DC-48 · Y · medium · 0.70 · s0/s1/s2/s3 · 1440 · §11.2; SP-08**
The current stop prints three times in one frame at 1440: the band's right-flush word, the ladder's bolded rung with the clay segment on it, and — when its head is in frame — the paper's own 24px Playfair `<h2>`. Y's §11.2 concedes the first two ("the ladder's clay segment says the same thing in the same frame") and argues that a whole band for a word would be worse. SP-08 does not ask which copy is cheaper; it asks which organ yields.
*Fix:* name the owner per state; the ladder's segment is position, the band's word is naming — one of them is redundant.

**DC-49 · Y · medium · 0.70 · s0 · 1440 / 1280 / 390 · §5 `at rest`; SP-08**
At s0 the letterhead and the band both print the household, both print the stage (the `lg` StrataMark plus the seven-mark arc Y keeps at `doc-letterhead.tsx:53-55`, against `PROCUREMENT & ORDERS 4 OF 6`), and both print the install date (vitals against the right-flush `INSTALL SEP 15`). Y's `at rest` row prints line 1 in full. Y's H2 argues the title in on the ground that it is "the fact the paper stops printing below the fold" — at s0 it has not stopped.
*Fix:* let line 1 yield while the letterhead is in frame; the band is in flow there anyway.

**DC-50 · Y · medium · 0.70 · s0/s1/s2/s3 · 1440 / 1280 / 390 · §6, SC1 row**
§6 opens "Against `research/12-layout-measurements.json`" and then takes the letterhead at **211px** from `10-code-anatomy.md` §2.9, which labels it an *estimate* ("Estimated px stack at 1440"). The JSON measures the letterhead at **189.31px** at `rich.1440.s0`. The direction is conservative — the true SC1 would be ~307 — but the file the section names is not the file the number came from.
*Fix:* use 189.31 and say what the two client acts add.

**DC-51 · Y · medium · 0.60 · s0/s1 · 1440 / 1280 / 390 · §4 H5; §7 F24**
"The late-arriving blocks that actually dominate CLS … render into a reserved 56px on the band **and a reserved glance height on the schedule**." The schedule's pinned glance is a deliberately zero-height sticky: `schedule-rule.tsx:548` is `pointer-events-none sticky top-0 z-[3] h-0`, and `:541` says "it reserves nothing in flow (so nothing shifts)". Giving it a reserved height introduces the shift Y is trying to remove. F79's 0.1189 shift is the needs banner and the schedule *content* arriving at 3.3–3.6s, not the glance.
*Fix:* reserve height on the schedule's content block, not on the zero-height glance.

**DC-52 · Y · medium · 0.65 · all states · 1440 · §6 SC4**
The ladder is budgeted from y 112 to y 856 — 744px of rungs in a 900px rail. `doc-spine.tsx:44` sets `min-[1180px]:pb-24` (96px), so the rail's content box ends at y 804. Y's 89.2% ink and 44px longest empty run both require the ladder to overrun its own padding by 52px. `measure-layout.mjs:286-289` runs the empty-run cursor to `spineRect.bottom`, so the honest run against the padded box is 96px.
*Fix:* end the ladder at y 804 and recompute (≈ 76.9%), or change `pb-24`.

**DC-53 · Y · medium · 0.60 · s0/s1/s2/s3 · 1280 · §6 SC4; §4 "The 1180–1439 tier"**
SC4 is stated as "**≥88%** on both" with no tier qualifier, and Y's 1280 rail is `Put down`'s glyph, one `--rule-hair` down the column and twelve 12px ticks. By `measure-layout.mjs:245-253` — an element counts as ink over its whole rect if it has a border — a full-height hair rule reads as ~100%, and the ticks alone read as ~21%, below today's measured **24.0%**. Either way SC4 stops measuring what it was written to measure at the tier that needs it most.
*Fix:* state SC4 at 1280 separately, and say which reading it claims.

**DC-54 · Y · medium · 0.65 · s0/s1 · 1440 / 1280 / 390 · §9(b); §9 Wave 1, "Files"**
Two sticky elements, one contract. Wave 1 keeps `job-ticket.tsx`'s `sticky top-0 z-[4]` shell (`:362`) and its sentinel (`:347`) while creating `components/document/lens-band.tsx` as the new `--doc-seam-height` writer and the thing `page.test.tsx:1381`'s `sentinel.nextElementSibling` must equal. Which element is the 56px pinned band, which one measures itself, and what the other one is for are never resolved. SP-04 forbids a second element publishing a height anything measures against.
*Fix:* say the band replaces the ticket's shell, and that `job-ticket.tsx` becomes the band's model only.

**DC-55 · Y · medium · 0.80 · s0/s1/s2/s3 · 1440 / 1280 / 390 · §6 SC11; §3 Y-3**
"SC11 density map: exactly **one** region at `full`." Y-3 brings a region to `full` when "its root's top comes within 240px of the frame's bottom edge — **off screen, always**". At that moment the region she is reading is `full` and the region below is `full`. Two, by design, for the whole distance between the enter threshold and the release threshold. Y's own §5 `reading` row repeats "Exactly one stop `full`."
*Fix:* restate SC11 as "one or two, never zero", which is what the mechanic actually delivers — the same replacement X argues for openly in §6.

**DC-56 · Y · low · 0.70 · n/a · n/a · §9 Wave 1, "Tests"**
Same regex arithmetic error as X: 1128 and 162 against a measured **1,109** and **143**; and the same replacement — "renders the page and asserts `SectionStageLineMount` is the **first element child** of `[data-active-section]`" — dropped into a `fs.readFileSync` contract file with no React harness. Note also that the assertion as worded is stronger than the tree: `page.tsx:1959-1963` puts a JSX comment before the mount, and `SectionStageLineMount` may render null on a non-project row.
*Fix:* put the render assertion in `page.test.tsx`; assert order, not first-child.

**DC-57 · Y · low · 0.70 · n/a · n/a · §7 F35**
Y says "The missing `browserslist` remains a real gap and is named, not inherited as a risk," and no wave adds it — confirmed: `apps/designer-portal/package.json` has no `browserslist` key. Y then argues from `playwright.config.ts:65-68`'s WebKit project in §11.4. Naming a gap you are arguing from is not closing it.
*Fix:* add the key in Wave 1; it is one line.

**DC-58 · Y · low · 0.60 · all states · all widths · §8, NG2**
Same as DC-26. NG2 requires a computed-style sweep; Y's proof is `shadow-gate.test.ts:97-105` and `:129-136`, which are `readFileSync` plus regex.
*Fix:* name the mockup's sweep as the proof.

**DC-59 · Y · low · 0.60 · all states · 1440 · §8 R125; §9 preamble**
"One fail-closed flag, `doc-lens`, for this program's four waves." Wave 2a's narrowing is a grid template literal at `page.tsx:1764`; a fail-closed boolean has to serve `grid-cols-[200px_minmax(0,1fr)_232px]` and `grid-cols-[160px_minmax(0,1fr)_232px]`, plus `shelf-panel.tsx:145`'s `min-[1440px]:left-[200px]`, plus two Playwright bounds specs that assert one or the other. That is a flag with a layout fork behind it, not a mount gate.
*Fix:* say what the flag switches at each site, or narrow the flag to Waves 1 and 3.

**DC-60 · Y · low · 0.55 · n/a · n/a · §9 Wave 2a / Wave 4, "Files"**
`stage2-approval-cutover-contract.test.ts:50-58` requires `margin-rail.tsx`, `mobile/mobile-margin-chips.tsx` and `mobile/mobile-sheets.tsx` each to contain both `classifyMarginItems` and `MarginDecisionClassificationNotice`; `:60-63` requires `margin-rail.tsx` to contain `legacyCoordinationDrafts(coordItems ?? [])`. Y rewrites all three files across Waves 2a and 4 and names neither contract. *What would settle this:* keep the imports and the call; the risk is only that a rewrite drops them.

**DC-61 · Y · low · 0.55 · s0 · 1440 / 1280 / 390 · §9 Wave 1, `page.tsx`**
Same as DC-16: `page.tsx:1863-1880` holds `LetterheadInstruments` **and** `<FolioLetterhead projectId={row.project_id} />` at `:1871`. Y says "`LetterheadInstruments` stops mounting at `:1863-1880`" and never mentions the folio letterhead. *What would settle this:* say whether the folio moves with the two client acts or stays where it is.

**DC-62 · Y · low · 0.55 · n/a · n/a · §9(a)**
Same as DC-29: making `latchedDefault` a density opens `Client approvals` and `Schedule dates` on arrival, both of which are folded by a derived default today (F89, visible in `w1440-rich-s0.png`). Neither proposal names the change to the first screen. *What would settle this:* trace `defaultFolded`'s truthy callers on a project spread.

---

### The two automatic returns

**No RETURN.** I looked for both.

- **NG1** — every state change in both proposals is a DOM attribute or a same-document scroll inside `[data-document-shell]`. Neither renders a second engagement at any density; both keep `Esc` / Put down as the exit; both refuse F06 by name and for the right reason.
- **NG2** — neither declares a `box-shadow`, a `drop-shadow()`, or a new `.doc-elevated` wearer. `shadow-gate.test.ts` stays green for both. (DC-26 / DC-58 are about the *proof*, not the budget.)
- **NG3** — X's ladder has unequal, data-derived segment heights and as many marks as the paper has regions; Y's has one rung per stop labelled with the paper's own head words, inside the rail behind `Put down`. Neither is an alphabet of edge tabs.
- **NG4** — neither introduces a type size, a rule weight or a pigment. X adds a 6×2px terracotta tick and a 1px clay gutter rule; Y adds nothing. (DC-11 is a contrast defect within the existing palette, not a register change.)
- **Hover-only affordances** — zero in both. X returns the 1280 labels **on press** and says so twice; Y opens the Sections sheet **on press** and says so. F128 records the shipped tree has none; neither adds one.

---

## 5 · The seven-axis scorecard

Never averaged. The scoring verdict belongs to the judges.

### Proposal X — "the spine is the lens"

| axis | | |
|---|---|---|
| **a1 · uncluttered and peaceful** | **7** | SC1 378px with the arithmetic shown, a 0px condensed band, and every evicted element given a named home in the SP-10 table — but the twelve cells are targets rather than measurements, and four of the seven standing facts print twice at s0. |
| **a2 · lens honesty** | **4** | The rubric's own 3-anchor: "A design that unmounts a region body on scroll lands here by construction," and X-4 unmounts. X earns its way back up with four readings tabled, the collision ruled, the returning designer answered by name, and find-in-page refused openly rather than hidden — but there is no per-region ≤40-character line. |
| **a3 · orientation at depth** | **6** | The rail head names the job at every offset at 1440 and the ladder is a genuine map — position, extent, exception, distance — on all seven spreads. Two holes: the extents cannot be measured once the lens is on (DC-02), and at 1280 below the fold there is no stage, no phase and no region name anywhere on screen. |
| **a4 · engineering credibility** | **4** | All three load-bearing mechanisms answered explicitly, real paths, the regex handled by name, both gates addressed, no browser-feature dependence. Against that: no scroll compensation at all, a measurement source its own mechanic erases, a "one function" that cannot see the household, SC1 credited to the wrong wave, `quiet-release-contracts.spec.ts:169-299` reduced to three lines, and an "every existing assertion stays true" that the first assertion falsifies. |
| **a5 · motion discipline** | **5** | The grammar table is complete, the hysteresis is two numbers with the reason for the distance, down and up are ruled separately and asymmetrically, and the ambient budget is defended. But the 6-anchor asks for zero layout shift "**with the mechanism** that delivers it", and the mechanism does not deliver it; and X-1's reduced-motion form is not expressible in the CSS-only policy X says it keeps. |
| **a6 · still Patina** | **8** | No new size, no new pigment, no second icon language, nothing on THE STUDIO block, and §2 names what was tempting and left alone (the terracotta needs block). The one deduction is the 1px clay gutter rule at 1.82:1 on rail stock, which is a state mark drawn in an ink the rail cannot hold. |
| **a7 · the 390 form** | **6** | The same lens in one column: the ladder in the sheet, first head 1054 → 453, the extra `Unfold` tap gone, chips sorted, `Put down` promoted out of More, every sheet named. Two costs it did not price: the bar's left zone truncates, and the letterhead ledger stacks below 1180. |

### Proposal Y — "the paper is the lens"

| axis | | |
|---|---|---|
| **a1 · uncluttered and peaceful** | **7** | SC1 329px, one band with one height at every offset, s1 header+summary 60.7% → 0%. The band is the cleanest single answer to the ask's own sentence about the header. Same s0 double-printing as X, plus the current stop three ways, and the letterhead number is an estimate where a measurement exists. |
| **a2 · lens honesty** | **5** | The same 3-anchor applies — Y-4 unmounts. Y earns more of it back than X: a per-region ≤40-character table, the count line as the discipline that separates quiet from empty, `CLOSED BY YOU` on a fold from her hand, and the returning designer answered. The deduction on top is SC11, which Y claims exactly and Y-3 contradicts. |
| **a3 · orientation at depth** | **6** | The band names the household, the phase, the install date and the stop at every offset and every width — the strongest answer to F13 (blocker) in either proposal. The rail is where it fails: three of twelve stops are wrong or unreachable, eight have no root, and the 9-anchor's "extent, exception, distance" are refused by design. |
| **a4 · engineering credibility** | **4** | The most thorough test accounting in either document — gates enumerated line by line, `contrast.test.ts`'s five-file scan protected by keeping files on disk, the sentinel contract preserved rather than deleted, and the one correct scroll correction in the program. Against that: `The accounts` and `Authorizations` are wrong about the tree, eight rungs have no roots and no wave, three claims about tests are false as written (`:212-300` "unchanged", "shortens the source", "every existing assertion stays true"), the 160px narrowing is assigned to a file that does not carry it, and Wave 1 ships four doors with no home until Wave 4. |
| **a5 · motion discipline** | **8** | Nine moves, every cell filled, no layout property animated anywhere, both density thresholds off screen so the 4× prober has no boundary to sit on, momentum and reverse-scroll ruled separately with two different rules, and a two-frame agreement in place of the velocity threshold and dwell M-10 warns about. The same-frame `scrollBy` is the exposure and Y names it as R1 with the seeding task that would falsify it. |
| **a6 · still Patina** | **9** | No new size, weight or pigment anywhere; the band's two lines are the existing 11px mono and 15px body; the count line is `region-head.tsx:135`'s existing 12.5px; the ladder's names are `spine-running-index.tsx:97-105`'s existing 13px; the clay segment is the shipped one, transition and reduce block included. §2 names the region rule as the deliberate non-restyle, with the reason. |
| **a7 · the 390 form** | **6** | Same band, same strings, the whole ladder in the Sections sheet, anchored chips only, every sheet kind named, and `row-overflow.test.tsx:31-44`'s glyph contract honoured rather than broken. The 64px band is arithmetically impossible at that measure, and the falsifiable sentence is the thing it falsifies. |
