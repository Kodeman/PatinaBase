# W7 · correctness review (adversarial)

**Scope:** `git diff 646aa98d5..c616045b7`, branch `document-lens/w7-adjust`, worktree
`.codex/worktrees/agent-lens-w7`. 19 files, all `.ts`/`.tsx`. Four ruled items: the single
progress `StrataMark` (W7-R1 §1 / D-B51), the packed ladder track with one `mt-auto` gap
(§2 / D-B52), the lucide door icons (§3 / D-B53), the mobile edge-owner fix (D-B54).

**Read:** `build/design/reconciliation.md` W7-R1, `build/design/deviations.md` D-B51…D-B54,
`build/w7-triage-mobile-nav.md`, `build/e2e-baseline.md` "W7 fix lane" (uncommitted in the
main checkout), the three `build/w7-shots/*.png`.

**Verified by running, in the worktree:**

| check | result |
|---|---|
| `npx jest --ci --silent` (whole portal) | **476 suites · 5687 tests · 0 failed** — the lane's number exactly |
| `npx tsc --noEmit -p tsconfig.json` | **0 errors** |
| `npx eslint` on all 10 touched source + test files | **clean** |
| `git diff --stat 646aa98d5..c616045b7 -- '*.png'` | **0** — no PNG carried; the help-walkthrough rewrites were reverted |
| `git diff --name-only … \| grep -v '\.tsx\?$'` | **empty** — the diff is source and tests only |
| +5 itemisation | reconciles against the diff: doc-spine −1/+3, lens-ladder +1, derivation −2/+1, mobile-bar +3 |

**Verdict: SHIP AFTER FIXES.** The four ruled items are built, the behaviour is right as far as
I can read it statically, and every gate the lane claims I reproduced. The problem is not the
code — it is that D-B54, the only item on this branch that fixes a live prod defect, is
defended by tests that would not catch its regression. Two findings (W7-C1, W7-C2) mean the
prod bug can come back green.

---

## Findings

Every finding, no severity filter. Confidence is my own.

### W7-C1 · the D-B54 jest falsifier never executes the defect · **medium** · conf 0.9

`mobile-bar.test.tsx:75` still hard-codes `offer: null` for the whole file and varies only the
already-derived `offerOwnsEdge`. D-B54 required the opposite in as many words: *"the `offer: null`
file-wide pin is broken"*. It is not broken.

Traced against `646aa98d5`: the old bar reads `offer` alone (`if (offer) return null`), and the
mock pins it to null, so the old component renders the bar in **both** new cases. Case 1
("RENDERS the bar while an offer stands that the strip will not paint") therefore **passes
unchanged on the old code** — it falsifies nothing. Case 2 fails on the old code only because
the old component ignores a prop it has never heard of, not because of cross-project semantics.

The case D-B54 asked for is `offer: { projectId: 'A', … }` with `heldProjectId: 'B'` fed through
the *real* provider or a provider stub that carries both fields — which is exactly the shape
`log-strip.test.tsx` already has and `mobile-bar.test.tsx` still refuses.

### W7-C2 · the rule now lives where no test looks · **medium-high** · conf 0.95

`grep -rn offerOwnsEdge src e2e` returns 15 hits: the provider's declaration and derivation, the
two consumers, and **mocks**. `document-time-provider.test.tsx` was not touched and has no
`offerOwnsEdge` case. `log-strip.test.tsx:22` re-derives the provider's formula inside its own
stub, so it asserts the stub, not the provider.

Consequence: replace `document-time-provider.tsx:483` with `offerOwnsEdge: offer !== null` —
i.e. re-introduce the exact prod defect — and all 5687 jest tests stay green. The fix moved the
cross-project rule *out* of a place the suite covered (`log-strip.tsx`'s own `crossProject` line,
exercised through `offer` + `heldProjectId` against real component code) and *into* a place it
does not. That is a net loss of coverage on the one line the whole triage is about.

The structural choice (one provider boolean) is right and is what D-B54 ruled; it just needs its
own falsifier at the provider.

### W7-C3 · the D-B54 e2e is not self-validating · **medium** · conf 0.8

`quiet-responsive-shell.spec.ts`'s new test seeds a running timer on `…d1`, opens `…d5` at 390,
and then asserts only what a **no-offer** session also satisfies: bar visible, one
`[data-mobile-edge-owner]`, `--doc-mobile-bar-height` non-empty. Nothing asserts the
cross-project offer actually stood at assertion time. If `hold()` ever stops chaining out with
`offerStrip: true`, or the seeded row is adopted rather than chained, the test is green while
covering nothing — the same class of blind spot the triage's own "Why 153/0 missed it" section
diagnoses.

Mitigation that does hold: `psqlRun` shells `psql` with `ON_ERROR_STOP=1` through
`execFileSync`, so a rejected INSERT throws — the seed itself is loud, and my earlier worry about
a silently-vacuous fixture does not apply.

Smallest honest addition: after `settle`, assert the seeded `…d1` row now has
`duration_minutes IS NOT NULL` (proof `hold()` chained it out) **and** that the log strip is
absent — the two halves that together mean "an offer stood and the strip refused it".

### W7-C4 · the new e2e writes shared DB state under `fullyParallel: true` · **medium** · conf 0.85

`beforeAll` deletes **every** open `project_time_entries` row for `designer@patina.dev`, then
inserts a running timer on `…d1`; `afterAll` deletes open rows on `…d1` and `…d5`.
`playwright.config.ts` is `fullyParallel: true` with `workers: process.env.CI ? 1 : undefined`, so
locally other spec files run concurrently as the same designer. While this file runs, every
concurrent spec that opens a document gets a cross-project offer it did not ask for, and this
file's `afterAll` can delete a timer another file has just opened on `…d5`.

CI is `workers: 1` and the lane ran `--workers=1`, so the measured run was safe; the spec as
committed is not. Fix: a dedicated designer for this fixture, or scope the delete by
`project_id` only (never "every open row for this user").

### W7-C5 · the bracket now moves on a step whose reading index did not change · **medium** · conf 0.75

`place()` unions the `activeKey` row with the `headInFrame` row. `headInFrame` flips when a
region head crosses the frame band — precisely the step D-B37 spent a wave making layout-inert
after D-B34's cause gate caught it. Before this commit `place()` read the `activeKey` row alone,
and since D-B37 made the yield paint-only a `headInFrame` flip moved **nothing**; now it changes
the bracket's height, and where the head sits above the reading stop, its `translateY` too.

`lens-rail-budget.spec.ts`'s cause gate samples `[data-ladder-segment]` heights only, so it
cannot see this — the run's "0 unexplained segment resize(s)" is true and silent on the bracket.

W7-R1 §2 does say the bracket spans "the first row whose stop intersects the frame to the last",
which may be exactly this. If so it is an amendment to D-B34's scope and belongs in
`deviations.md`; if not, the bracket should stay anchored on `activeKey` alone.

### W7-C6 · the bracket has no falsifier at all · **medium** · conf 0.9

`grep -rn 'data-lens-window' src e2e` → zero hits outside `lens-ladder.tsx` itself. The union
rule, the 27px floor, and the hidden-with-no-index branch are all new or changed with neither a
jest nor an e2e assertion. jsdom cannot measure `offsetTop`, but the shown/hidden branch and the
presence and shape of `data-lens-window` are assertable there, and the geometry is assertable in
the e2e that already walks the nav in the same file.

### W7-C7 · `:207` was changed against D-B54's explicit "stays" · **low** · conf 0.9

D-B54: *"`:207`'s `if (sheet || offer) setMoreOpen(false)` stays."* The triage said the same. It
now reads `offerOwnsEdge`, so a cross-project chain-out no longer closes an open More menu.

I think the new behaviour is the better one — the bar survives that chain-out now, so dismissing
its menu would be an unexplained close — but it is an unlogged departure from a written ruling,
and it was forced only by the lane's choice to stop destructuring `offer`, which it did not have
to do.

### W7-C8 · the mark's shipped accessible name is ALL CAPS, not the spec's string · **low** · conf 0.85

`page.tsx:2475` passes `stageWord={ticketPhase.name.toUpperCase()}`, and `markLabel` is built
from `stagePhrase.top`, so production announces **`PROCUREMENT & ORDERS — 3 of 5`**. W7-R1 §1's
printed example is `Procurement & Orders — 3 of 5`.

`doc-spine.test.tsx` passes mixed-case `stageWord` in every case, so the twin never sees the
string the page produces — the test asserting `'Procurement & Orders — 3 of 5'` is asserting a
string that cannot occur. The lane knew the real value: `e2e-baseline.md` records it verbatim.

`stagePhase.name` is already on the prop and carries the sentence-case form; one line fixes it,
or the twin adopts the page's shape.

### W7-C9 · the empty pre-work track lost its shrink guard, silently · **low** · conf 0.8

`lens-ladder.test.tsx` **deleted** `expect(track.style.flexShrink).toBe('0')` rather than
updating it; every track is now `flexShrink: 1`. B4's original bug (a pre-work track laid out at
0 height, clipping OD-2's one line under `overflow-y-auto`) was patched by the definite basis
*and* by `flexShrink: 0`. `flexBasis: 'auto'` alone protects the line only while the nav has
room. Low likelihood in practice — pre-work spreads carry no doors (OD-8), so nothing competes
for the column — but the guard went without a replacement sentence, and the test comment
("the pre-work spread has no branch of its own left to get wrong") reads as if nothing was lost.

### W7-C10 · `onJump` is dead in `DocSpine` · **low** · conf 0.85

It is no longer destructured, yet `page.tsx:2457` still passes `jumpToSection`, and the prop's
new doc-comment — *"it stays declared because the page's own section landing is still routed
through the spine's callers"* — does not describe anything the spine does with it. Drop the prop
and the call site, or say plainly that it is retained for the callers' own use.

### W7-C11 · the rung cap is right by coincidence, and still deaf to resize · **low** · conf 0.7

Two parts, both minor:

- The cap measures free space as `nav.clientHeight − doors.offsetHeight − track.marginBottom`,
  which is correct and **ratchet-proof in both directions**: `nav` is `flex-1` in a fixed-height
  column, the track's `flexShrink: 1 / min-h-0` cannot push it, and the doors' height does not
  depend on `rungCap`. Good — this is the right fix for the growth deletion. But `stops` sums
  `max(stopButton.offsetHeight, 36)` while the box the track actually spends is the
  `[data-ladder-segment]` wrapper, `max(36, button + rungs)`. The two `max`es happen to agree
  today; measuring `[data-ladder-segment]` would be exact by construction rather than by luck.
- The effect's deps are `[segments, roomCount, printRooms]` — no `resize` listener, so the cap is
  stale after a window resize in **either** direction until one of those changes. Pre-existing
  (unchanged from `646aa98d5`), not a W7 regression, but the answer to "resize both ways" is
  "the effect does not re-run".

Also cosmetic: `lens-constants.ts:67` still documents `LADDER_SEGMENT_MIN_PX` as *"the floor every
ladder segment takes before extent distributes the rest"* — `extent` is gone.

### W7-C12 · the ruled short-viewport acceptance was amended in a test comment, not in the record · **low** · conf 0.8

W7-R1 §2 asks for the doors whole "at 900×620". The rail is `display:none` below 1180, so the
number is unreachable. The spec asserts the 900 absence and then re-asserts at 1180×620 and
explains itself in a comment — honest work — but neither `deviations.md` nor `reconciliation.md`
records the amendment, so the ruled acceptance still reads as met at 900.

### W7-C13 · D-B54's stated gate was not fully run · **low** · conf 0.9

D-B54's gate: `pnpm --filter @patina/designer-portal test` **+ `quiet-responsive-shell.spec.ts`
+ `action-visibility.spec.ts`**. The W7 e2e run lists `lens-rail-budget lens-band-height
lens-density quiet-responsive-shell desk-walkthrough mobile-margin-sheet`.
`action-visibility.spec.ts` — which carries `expectMobileBar`'s edge-owner assertions on `/desk`,
`/doc`, `/library` and `/people`, i.e. the assertions most exposed to the bar's render gate
changing — was not run.

### W7-C14 · the mark may not read as progress at all (design-adjacent) · **low** · conf 0.7

In `build/w7-shots/head-mark.png` line 3 shows a ~10px stub with **no visible remainder**: the
ghost track (`rgba(44,41,38,0.12)`) does not print at 3px on the rail stock. A reader sees three
descending bars — the brand device at rest — not "delivery 17% done". Kody ruled "a single strata
mark that is **filled in to represent current progress**"; whether an invisible remainder
satisfies that is the DESIGN LEAD's call, not mine. Related, same call: at s0 this mark prints
the identical fill to the letterhead's own `StrataMark` ~60px away and, unlike the stage phrase,
does not yield.

### W7-C15 · what checks out (stated so the gating list is not read as the whole review) · info · conf 0.95

- **Test honesty on PNGs:** confirmed 0. The whole diff is 19 `.ts`/`.tsx` files.
- **Full-jest reconciliation:** 476/5687/0 reproduced exactly; the +5 itemisation matches the diff.
- **`stagePhase` swap:** `page.tsx` is the only production caller of `<DocSpine>`; every test
  caller was updated (`lens-ladder.test.tsx:920` `stageIndex` → `stagePhase`). No `stageIndex`
  residue on the spine — the remaining hits are the **band's** differently-shaped
  `{position, of}` prop, untouched.
- **`N OF M`, one source:** `ticketPhase` feeds both the band (`lens-band-derivation.ts:626`) and
  the spine, and inside the spine the mark's name and the printed count both come from the one
  `ordinal` — they cannot disagree, which is D-B51's whole point.
- **Pre-work null path:** `preWork || !activeSection → [0,0,0]`, mark still printed, box kept —
  D-B51 (3) as written. Guarding on `preWork` rather than `stagePhase == null` is the stricter
  reading and is right.
- **Deleted arc residue:** no `Jump to …` role queries survive outside the two tests that assert
  their absence; no keyboard or aria path led into the arc other than those buttons.
- **Head reserve:** nothing anywhere read 126/117 except `doc-spine.test.tsx`, updated. 107/93
  over measured 106/92.25 is a floor, not a cap, so a longer stage word grows the head rather
  than clipping it, and the reserve's actual job (constant height across offsets *within* one
  document) still holds because the L-6 yield keeps the word's box.
- **`motion-reduce` wins the cascade:** Tailwind emits variant rules after their base utilities
  and `transition-none` sets `transition-property: none`, so the reduce register now actually
  stills the fill — which an inline `transition` shorthand could never have allowed. `ease-in-out`
  *is* `cubic-bezier(.4,0,.2,1)`; the comment is accurate.
- **Other `StrataMark` consumers:** unaffected. The desk/auth marks are different files
  (`components/portal/strata-mark.tsx`, `apps/extension/src/components/StrataMark.tsx`);
  `StrataSweep` is an independent component and `globals.css`'s `.strata-sweep .strata-fill`
  animation rules never meet this transition. The eleven document consumers get the same computed
  transition they had.
- **L-6 yield:** untouched — the two yielding spans and their `data-*` hooks are byte-identical;
  only the count's *source* changed. The mark does not yield, per §1.
- **Ladder deletions complete:** `extent`, `floorPx`, `narrowFloorPx`, `--seg-floor`,
  `--track-floor`, `LadderTier` have no live consumers; the derivation twin asserts the exact
  remaining key set, which is the right shape of falsifier for C-3's amendment.
- **`mt-auto` is safe:** the doors block is a **sibling** of the track inside the nav, not a child
  of the `overflow-y-auto` scroller, so the auto margin is not swallowed. Measured breath is
  13.5px (`mb-3` at this portal's 18px root — note the ruling says 12px; the shipped value is
  larger, which is the safe direction), the e2e asserts ≥12, and the run printed 13.5.
- **Doors at 1180×620:** honest. The 900 case is asserted absent-by-regime and explained;
  D-B52 (3)'s drawer-reserve question is answered by measurement (doors bottom 533 vs drawer top
  560) rather than by adding the conditional `max-height` it authorised.
- **Icons:** `DOOR_ICON` covers exactly `LadderDoorKey`'s six members (TS would reject either
  direction); imports are named — no `import *`, no deep `dist/` path — so tree-shaking and
  Next's `optimizePackageImports` both apply; `aria-hidden`, `currentColor`, `shrink-0`,
  `gap-[8px]`; both twins assert `toHaveAccessibleName(label)` and `textContent === label`, so the
  R1 census is genuinely unchanged. The 390 sheet has no "Put down the room" row, so the absent
  `Undo2` import there is correct, not an omission.
- **D-B54 semantics are exact:** `heldProjectId` is `held?.projectId ?? null`
  (`document-time-provider.tsx:477`), so
  `!(held?.projectId && held.projectId !== offer.projectId)` is `!crossProject`, character for
  character. The null-held case — an offer standing with nothing in hand → the offer **owns** the
  edge — is not a change: it is the shipped strip's own behaviour and its own comment ("it can
  surface again once no other project is held", the Desk). Correct.
- **No other bare `offer` reads:** `mobile-bar.tsx` reads `offer` nowhere (grep: zero);
  `log-strip.tsx` reads it only for the payload it is about to submit, never as a gate — the gate
  is `if (!offer || !offerOwnsEdge)`, where the `!offer` half is a type narrowing, not a second
  rule.

---

## Gating list

Ship once these are closed:

1. **W7-C2 + W7-C1 together** — one unit test on `document-time-provider.tsx` that drives the real
   derivation (held B + offer on A → `false`; held A + offer on A → `true`; nothing held + offer →
   `true`; no offer → `false`), and `mobile-bar.test.tsx`'s stub carrying `offer` + `heldProjectId`
   so the file's `offer: null` pin is actually broken as D-B54 required. Without these the prod
   defect can return green.
2. **W7-C3** — make the e2e prove the offer stood (the chained-out row + the strip's absence),
   or the run measures nothing it claims to.
3. **W7-C13** — run `action-visibility.spec.ts`, the half of D-B54's own gate that was skipped.
4. **W7-C5** — a ruling: either the bracket's new two-row span is W7-R1 §2's intent and gets a
   deviation entry amending D-B34's scope, or `place()` goes back to anchoring on `activeKey`.

Fix before the integration merge (not ship-gating on their own):

5. **W7-C4** — the fixture must stop deleting every open timer for the shared designer.
6. **W7-C8** — the shipped accessible name should be the spec's sentence-case string, and the
   twin should assert the shape the page actually passes.
7. **W7-C6, W7-C7, W7-C12** — a falsifier for the bracket; log the `:207` departure; log the
   900 → 1180 acceptance amendment.

Non-gating: W7-C9, W7-C10, W7-C11, W7-C14 (W7-C14 is the DESIGN LEAD's call, not mine).

---

# Sign-off 2 — `document-lens/w7-adjust` @ `ad4befdf7`

Re-review of `git diff c616045b7..ad4befdf7` (3 commits, 15 files, +592/−103) against
W7-C1…C14, plus the pass-2 section of `build/e2e-baseline.md`.

## Verified by running, myself, in the worktree

| check | result |
|---|---|
| **mutation proof (W7-C1/C2)** — `offerOwnsThumbEdge` body replaced with `return offer !== null`, then the three suites | **3 suites failed · 3 tests failed · 44 passed**, and the three failing test names are exactly the lane's: `LogStrip › does not overlay an unrelated saved offer on the project in hand`, `DocumentTimeProvider — who owns the thumb edge (D-B54) › an offer on ANOTHER project while this one is held…`, `the thumb edge's one owner (D-B54) › RENDERS the bar while a CROSS-PROJECT offer stands…`. **Mutation reverted** (`cp` from a `$TMPDIR` copy taken before the edit); `git status --porcelain` in the worktree is empty afterwards — the tree is byte-identical to `ad4befdf7`. |
| single home of the rule | `grep -rn "crossProject\|heldProjectId !==" src e2e` → **one hit**, `document-time-provider.tsx:121`. No second copy anywhere. All three consumer doubles reach it through `jest.requireActual(...).offerOwnsThumbEdge` (`log-strip.test.tsx:24`, `mobile-bar.test.tsx:83`, `mobile-action-dock.test.tsx:53`). |
| provider tests drive `hold`/`release`, never the boolean | confirmed — all four cases in `document-time-provider.test.tsx` reach their state through `result.current.hold(...)` / `.release()` and then read `offerOwnsEdge`; none sets it. |
| `npx jest --ci --silent` (whole portal) | **477 suites · 5699 tests · 0 failed** — the lane's number exactly |
| `npx tsc --noEmit` | 0 errors |
| `npx eslint` on all 13 touched files | clean |
| delta arithmetic | +12 / +1 suite reconciles: provider +4, mobile-bar +1 (the D-B54 describe 2 → 3), lens-ladder +3 (the bracket describe), `strata-mark.test.tsx` +4 (new suite) |
| the re-shot `head-mark.png` | read it — line 3 now prints a dark filled stub **and** a legible grey remainder. At 0.12 there was none. W7-C14's ruling (b) does what it claims. |

Not run by me: the e2e. No server, and the brief is read-only. The e2e mutation proof
(`mobile-bar.tsx` back to `if (offer) return null` → failure at
`quiet-responsive-shell.spec.ts:713`) is sound **by construction** and I checked the line: 713 is
`await expect(page.getByTestId('mobile-bar')).toBeVisible();`, and assertion (1) above it now
*proves* `offer` is non-null at that moment by reading `duration_minutes` back out of Postgres —
which is precisely what makes the mutation bite. I take W7-C13's `action-visibility.spec.ts` run
(3 passed · 1 skipped) on the lane's log.

## Status table

| id | status | why |
|---|---|---|
| W7-C1 | **CLOSED** | `mobile-bar.test.tsx` now carries the raw pair (`mockOffer`, `mockHeldProjectId`); the file-wide `offer: null` pin is gone. The cross-project case is stated in the two facts the provider reasons over, and a third case (nothing held → the Desk) was added. |
| W7-C2 | **CLOSED** | The rule has one exported home and four cases through the real provider. Mutation-verified by me, not taken on report. |
| W7-C3 | **CLOSED** | The spec proves its own state: `expect.poll(timerState).toBe('closed')` reads the chain-out straight from Postgres, the strip's absence is asserted two ways, and a **control** case (same-project timer → adopted, never chained out, `'open'`) pins the seeded row as the variable that moves the outcome. This is now a real falsifier. |
| W7-C4 | **ACCEPTED — carved out** | The fixture no longer deletes anything it did not create: two fixed entry ids, `dropSeeded()` by id only. Full isolation is genuinely unreachable and I verified why — `00177_project_time_entries.sql:39`, `CREATE UNIQUE INDEX uniq_project_time_entries_running_timer ON project_time_entries(user_id) WHERE duration_minutes IS NULL`: one running timer per user, so the insert cannot proceed while a foreign open row exists. Closing at 1 is the least-destructive way out and is legal — the column's constraint is `CHECK (duration_minutes IS NULL OR duration_minutes > 0)`, so 1 is the smallest closed value. **Does closing a foreign row corrupt another spec?** No, and I checked the only two directions it could: (a) the `…d4` row is opened by this same file's own earlier tests (`PROJECT_ID` at `quiet-responsive-shell.spec.ts:32`), which assert layout and overflow and never read a duration; (b) the one e2e that depends on time-entry data at all is `quiet-release-contracts.spec.ts:207`, which waits for the drawer's clock doorway once `inHandToday > 0` — a **monotone threshold**, and closing a row *adds* minutes to the day, so the change can only help it, never break it. `arrival-arc.spec.ts`'s `duration_minutes` hits are a different table (ceremony slots). Dedicated designer stays flagged for the integration merge, per the coordinator. |
| W7-C5 | **ACCEPTED — ruled** | D-B52 now carries the ARCHITECT's W7-C5 note: the union is the DESIGN LEAD's ruled intent under W7-R1 §2, no revert, and it touches neither gate because the bracket is out of flow. I verified that claim against the JSX rather than taking it: `lens-ladder.tsx:343-347` — `absolute left-0 top-0 w-0 [border-left:var(--rule-mid)]`, driven by `transform`/`height`. Absolutely positioned, so a height change reflows no sibling; a transform cannot enter the layout-shift record. The argument holds. |
| W7-C6 | **CLOSED, with a stated limit** | The bracket has falsifiers now: jest asserts the branch (printed + stamped with a reading stop; hidden and un-stamped without one; still printed when a head crosses under the stop) and the e2e asserts the geometry covers the `aria-current` row with the 27px floor. The limit is honest and named below as W7P2-1. |
| W7-C7 | **CLOSED** | `:207` is back on the bare `offer`, `offer` re-destructured, with a comment stating why the edge question and the subject-change question are different questions. D-B54 as written. |
| W7-C8 | **CLOSED (the honesty half)** | The twin now asserts `PROCUREMENT & ORDERS — 3 of 5`, the string `page.tsx:2475` actually produces, in all four cases. The conformance half is raised fresh as W7P2-2. |
| W7-C9 | **CLOSED** | `flexShrink: segments.length > 0 ? 1 : 0` restores B4's other half, and `lens-ladder.test.tsx` restores the assertion it had deleted rather than leaving the guard unwritten. |
| W7-C10 | **OPEN — non-gating** | `onJump` is still dead in `DocSpine` and still passed by `page.tsx:2457`. Untouched this pass, as agreed. |
| W7-C11 | **CLOSED (the listener) / ACCEPTED (the measurement)** | A rAF-throttled `resize` listener now bumps `measureTick`, which is in the cap effect's deps, so the cap is re-asked in both directions — and the measurement it re-asks is the nav's free space, which is why enlarging gets the rungs back. The `stops`-vs-`[data-ladder-segment]` nicety I called "right by coincidence" is left as is; that was explicitly non-gating. |
| W7-C12 | **CLOSED** | `reconciliation.md` §400 (2) records the restatement in the DESIGN LEAD's own voice — "my '900×620' was mis-addressed (no rail exists below 1180); **absent-below-1180 + doors-whole-at-1180×620** is the correct form of the ruling and W7-R1 §2's acceptance line is amended to it." The record no longer reads as if 900 was met. |
| W7-C13 | **CLOSED** | `action-visibility.spec.ts` run, alone and in the basket: 3 passed · 1 skipped, and the seven-file chromium basket is 65 passed · 2 skipped · 0 failed. On the lane's log — I cannot run e2e. |
| W7-C14 | **CLOSED** | `ground="rail"` (`rgba(44,41,38,0.22)`), a new register used by the rail alone. `strata-mark.test.tsx` asserts light and dark are byte-unchanged and that **only** the ghost moved — every fill's className and full `style` attribute compared string-equal between `rail` and `light` on the same fill triple. The DESIGN LEAD re-shot and signed; I read the re-shot and the remainder prints. |

## New findings (pass 2)

### W7P2-1 · the bracket's union arm is still unexercised · low · conf 0.9

The pass-2 run printed `bracket {top 241.25, bottom 295.25, h 54}` against
`row {top 241.25, bottom 295, h 53.75}` — i.e. `headInFrame === activeKey` at s2 and the union
collapsed to one row. The e2e's sentence ("covers the row of the stop it names") is satisfied by
both the one-row and the union shape, so it cannot detect a union that grows unboundedly, and
jsdom gives the new `activeKey: 'ffe', headInFrame: 'money'` case all-zero geometry so it asserts
only that the bracket is printed. Since W7-C5 is now ruled intent and the bracket is out of flow,
this is a coverage note, not a defect: the honest form is a second e2e offset where the two keys
differ, asserting the bracket covers **both** rows and no more. Worth a follow-up, not a gate.

### W7P2-2 · the shipped mark name diverges from W7-R1 §1's printed string, unruled · low · conf 0.85

The twin is honest now, but the substance is unchanged: production announces
`PROCUREMENT & ORDERS — 3 of 5` where W7-R1 §1 prints `Procurement & Orders — 3 of 5`.
`stagePhase.name` carries the sentence-case form and is already on the prop, so either answer is
one line. C12 and C14 both got a line in the record; this choice did not. It needs the same —
a DESIGN LEAD ruling that the caps are what ships, or the one-line change.

### W7P2-3 · the teardown leaves permanent 1-minute entries · low · conf 0.8

`afterEach` calls `closeForeignOpenTimers()`, which closes the timer `hold()` opened on `…d5`
rather than deleting it — correct under W7-C4's rule, and the price of it. Every local run
therefore adds logged minutes to the designer's ledger on `…d5`/`…d4` that no teardown ever
removes. Nothing asserts an exact figure (`inHandToday` is only ever read as `> 0`), so this is
hygiene, not correctness. Naming it so a future spec that *does* assert a time total knows why
the number drifts.

### W7P2-4 · `flexShrink`'s restored branch is not in the record · low · conf 0.8

D-B52 (2) says the `flexBasis: auto` change "deletes the pre-work zero-floor special case and the
bug it patched". W7-C9's fix correctly puts half of that special case back
(`segments.length > 0 ? 1 : 0`). The code comment says why; `deviations.md` still says the branch
is gone. One sentence on D-B52 closes it.

## Verdict

**SIGNED.** Every gating id from sign-off 1 is closed or ruled, and I verified the two claims that
mattered rather than accepting them: the mutation goes red in exactly the three named tests (and
I reverted it), and the rule has exactly one home that all three doubles call. The four new
findings are all low and none of them is a gate. W7-C10 stays open as agreed; the dedicated-designer
fixture is the integration merge's, not this branch's.
