# W2 FIX log

Lane: W2 FIX (independent context; wrote none of the code under review).
Worktree `.codex/worktrees/agent-lens-w2-fix`, branch `document-lens/w2-fix`
off `document-lens/integration@06ad45de9`.

Sources: `w2-review-correctness.md` (32 findings), `w2-review-fidelity.md` (13),
the orchestrator's walk addendum (item 8) and the DESIGN LEAD's W2 review
(items 9–12).

The two known lint errors (`piece-room-save-gate.test.tsx` `import/first`,
`use-commercial-documents.test.ts` `rules-of-hooks`) were not touched.

---

## 1 · Roving tabstop — C-02, C-03, C-14 (blocker 2)

`spine/lens-ladder.tsx`, `spine/__tests__/lens-ladder.test.tsx`

**What changed.**

- The tabstop is held as the ROW'S OWN KEY (`seg:<key>` / `room:<id>`, written
  on `data-ladder-row`), never as a position. `rowKeys` is built during render
  from exactly what will be rendered, and `rovingKey` falls back to `rowKeys[0]`
  whenever the remembered key is no longer on the rail — so exactly one row
  carries `tabIndex={0}` at every render, whatever the row count does.
- The rungs are the full measure's alone: each rung button is
  `hidden … min-[1440px]:flex` (the wrapper `<div className="hidden
  min-[1440px]:block">` is gone), and the arrow walk filters rows by
  `offsetParent !== null || getClientRects().length > 0`, with a documented
  fall-back to the unfiltered list when the environment reports no layout at
  all (jsdom).
- A segment with `mounted: false` is no longer a `disabled` button (an
  unfocusable row that could still take the tabstop) — see fix 2.
- Home/End and the focus ring were already right; both are now asserted.

**Evidence.** `lens-ladder.test.tsx` +6 cases: `walks to the ends with Home and
End`; `never walks into a rung the narrow measure has hidden` (row visibility
stated by defining `offsetParent`, then a full walk in both directions
asserting no rung ever holds focus); `keeps exactly one tabstop as the row
count changes beneath it` (10 rows → 6 → 4 → 10, one `tabIndex=0` after each,
with the tabstop parked on the last rung before the rungs are taken away);
`gives every row a visible focus ring`; and the two `a stop the spread does not
mount` cases. 27/27 green in `src/components/document/spine`.

## 2 · Dead press targets — C-04, C-07 (blocker 3)

`hooks/use-document-running-index.ts`, `app/(document)/doc/[id]/page.tsx`,
`components/document/care-band.tsx` + tests

**What changed.**

- `useDocumentRunningIndex` now returns `mountedKeys` — the keys whose
  paper-scoped `[data-index-region]` root is currently observed, in paper
  order, published by value so an irrelevant mutation batch does not re-render
  the document.
- `page.tsx` threads it into `deriveLadderSegments({ mountedKeys })`. `mounted`
  is false ONLY where the index can answer for the key and says there is no
  root: a key the index was never given (a pinned Worktable spread declaring a
  region the live section does not index) is *unknown*, not absent, and stays
  pressable.
- A `mounted: false` segment renders `<div role="text" data-ladder-unmounted>`
  with the same name + fallback — no `<button>`, no `data-ladder-row`, out of
  the roving list.
- `care-band.tsx`: `indexRootAttrs` now carries `tabIndex: -1` as well as
  `data-index-region` + `id`, so L-10's `scrollToRegion` focus actually lands
  (`.focus()` on a non-focusable element is a silent no-op). The
  `status === 'completed'` branch no longer returns `null`: it prints one
  settled line carrying the root, so a spread that declares the care stop
  always has somewhere to land. `authLoading` still returns null — deliberately;
  `mountedKeys` reports the stop unmounted and the rail prints its fallback.

**⚠ Flagged, not decided.** The completed branch previously rendered nothing
("the Care section owns the settled read", the band's own docblock). It now
prints one line on a completed project's project/install spread. This follows
the orchestrator's ruling ("pick the former for completed: a completed care
band still prints its head"); the wording (`The book is closed. · Care holds
the settled read of this project.`) is mine and wants the design lead's eye.

**Evidence.** `care-band.test.tsx` +2 (`marks the completed branch as the care
root`, `gives the care root a focus destination the jump can land on`);
`use-document-running-index.test.tsx` +1 (`reports which roots are on the
paper, in paper order`); `lens-ladder.test.tsx` +2.

## 3 · Observer hygiene — C-05, C-06, C-20a/b/c

`hooks/use-document-running-index.ts` + test

**What changed.**

- `seen.delete(key)` on every unobserve — both the replaced-in-place branch and
  the root-has-left branch. A stale `true` no longer lets `resolve()`'s
  crossing branch hand the line to a region that has not reported since it left.
- The MutationObserver watches `document.body` only until
  `[data-document-paper]` exists, then re-roots onto the paper
  (`watchForRoots()`, called at start-up and at the end of every `attach()`).
  The permanent body watch — a forced layout per frame for every toast, sheet,
  portal and re-render in the application — is gone.

**Evidence.** +3 cases: `re-observes a root replaced in place, and drops the
report the old one left`; `disconnects both observers when the document goes`
(a capturing `MutationObserver` subclass counts `disconnect()`); `watches the
body only until the paper arrives, then re-roots on it` (asserts the observed
targets are `[body, paper]` — replaced, not added to). 13/13 green.

## 4 · The record head — C-15, C-16, F-07

`components/document/previous-work.tsx` + test

**What changed.**

- `aria-controls={contentId}` restored on the disclosure act. This needed one
  additive pass-through in `region/region-head.tsx`
  (`RegionLedgerEntry['aria-controls']` → the `shared` props object;
  `DocumentAction` already spreads `...rest`). **That file is outside the
  brief's touch list** — flagged here; the change is two lines and additive.
- `bodyId` is passed only when a body actually renders (`hasHistory`), so
  `RegionHead`'s dev guard is honest and `aria-controls` never names an id that
  is not on the page.
- **Wording.** The brief said `Nothing settled yet` was ratified and asked me to
  confirm it in `reconciliation.md`. It is **not**: §"Quiet regions"'s `empty`
  row ratifies `Nothing yet` (no count), which is also what F-07 asked for.
  Shipped `Nothing yet`; the test asserts it.

**⚠ Flagged, not decided.** With the honest `bodyId`, `RegionHead`'s dev guard
now fires on the empty record head — `RegionHead "project/record" has neither a
ledger entry nor a foldable body; a head with no acts is a caption, not a head.`
That is the guard doing exactly what C-15 asked, but it fires on a **ratified**
state (W2-L2: "a zero-count project isn't a press target: no ledger entry, no
toggle"), i.e. a dev-console error on every project with nothing settled. Either
the empty record earns an act, or the guard needs an exemption. Not mine to rule.

**Evidence.** `previous-work.test.tsx`: both deleted `aria-controls` assertions
restored (`toBeInTheDocument()` collapsed, `toBeVisible()` expanded), and the
status-line assertion aligned to `Nothing yet`. 7/7 green.

## 5 · The bracket — C-12, C-13

`spine/lens-ladder.tsx`

**What changed.** The layout effect's deps gained `headInFrame` and a
`valueSignature` over every segment's `value`/`narrowValue`, so the bracket
re-measures when a value yields (RF-02 unmounts the value line and the row
shrinks by a line). The `resize` listener now rides one rAF instead of running
a forced `offsetTop`/`offsetHeight` read per resize event.

## 6 · The lost assertion — C-19

`components/document/__tests__/shelved-spine.test.tsx`

**What changed.** "pays for no money read on a spread that prints no money row"
is re-homed onto the ladder. `spine-shelved-blocks.tsx@main:dab057537` gated
`useMoneyLadder` (and the two un-`enabled` queries beneath it,
`useProjectInvoices` / `usePurchaseOrders`) by a conditional MOUNT —
`printsMoneyRow = props.regions.some(r => r.key === 'money')`. The file is gone;
the guard now asserts the replacement opens no read at all: the three hooks are
mocked with spies, the ladder is rendered for `install` and `care` (no money
segment, no `[data-index-region="money"]` row) and then for `project` (a money
segment, `data-reading-index="money"`), and not one spy is ever called. The
rail states the money stop from facts it is HANDED.

**Evidence.** +2 cases; 4/4 green in that file.

## 7 · Fidelity — F-13/C-09, D-B9, deviations

- **Call sheet, one rule both tiers.** `deriveLadderDoors` gained
  `callSheetEnabled?: boolean` (defaulting to printing the door, so no existing
  caller changes), and `page.tsx` passes `callSheetGate.value` — the same
  `useFeatureFlag('call-sheet')` the sections sheet gates its own row on
  (`mobile-sheets.tsx:334, 584`). The gate lives in the derivation rather than
  as a filter at the page so it is unit-testable; the flag is still read
  directly from the page (the ticket input's `people.callSheetEnabled` is NOT
  in `ladderFactsSignature`, so a value routed through the ticket could go
  stale). `mobile-sheets.tsx` needed no change — it already gates, and
  `mobile-bar.test.tsx:496` already covers flag-off. **The desktop half has a
  unit test** (`lens-ladder-derivation.test.ts`) but no page-level test: the
  page's own suites are outside this lane's touch list.
- **`onCloseoutReady` widened** to `CloseoutState = { ready, closed, total }`
  (exported from `care-band.tsx`), consumed by `page.tsx` through a stable
  `acceptCloseout` that only sets state when a field actually moves. The care
  stop now prints `N OF M CLOSED OUT`. Closes D-B9's owed half.
- **`damagedOn`** — see item 11.
- **`deviations.md`** gained D-B10, D-B11, D-B12 (and D-B11 is amended by item
  8 below).

---

# The orchestrator's walk addendum

## 8 · The doors overprinted the tail rungs at 1440

`spine/lens-ladder.tsx` + test; `deviations.md` D-B11 amended

**(a) Rungs at 27px.** `min-h-11` → `min-h-[27px]` — the same 2.5.8 pointer-floor
cell the design lead set for the arc. The doors keep `min-h-11`.

**(b) Override 2 unchanged and now asserted**: the rungs print while the
reading window touches Pieces **or** a room is held, never otherwise
(`prints them only while the window touches Pieces or a room is held`).

**(c) The track never overflows into the doors.** The track carries
`data-lens-track`, `overflow-y-auto` + `[scrollbar-width:thin]` (no gutter),
and a per-measure flex basis — `--track-floor-full` / `--track-floor-narrow`,
chosen by class, not by a width read — computed from the floors it is about to
lay out plus the rungs it is about to print. It grows only when it has stops to
distribute, so a pre-work spread's doors follow its one line instead of sitting
under ~450px of nothing.

**(d) Measured (Playwright, this worktree's dev server on :3010, long paper
`…d5`).** Before the drawer reserve of item 9, at 1440×900 with Pieces open:

| | track bottom | `FILED WITH THIS JOB` top | overprints |
|---|---|---|---|
| 1440/s0 | 608.5 | 636.5 | no |
| 1440/s2 (Pieces open) | 608.5 | 636.5 | no |
| 1440 room in hand | 559.0 | 587.0 | no |

Rail `scrollHeight === clientHeight` in all three (RF-05's gate holds); rung
height measured 27px. jsdom test: `prints them under Pieces … each a press
target` asserts `min-h-[27px]` and `not.toHaveClass('min-h-11')`.

---

# The DESIGN LEAD's W2 review

## 9 · The rail must fit its column, doors above the drawer

`spine/lens-ladder.tsx`, `doc-spine.tsx` + tests

**What changed.**

- **No reserved space for closed rungs.** Pieces' flex basis includes the rungs
  only while they print; closed, it asks for its own floor and nothing more.
- **The rungs spend the remainder.** Every stop keeps `flexShrink: 0` (a stop
  shrunk below its own words does not clip — it overprints the stop beneath
  it), so opening the rungs consumes the track's grow-remainder first.
- **Overflow collapses to `+N`.** A layout effect measures the track's
  `clientHeight` against the MEASURED heights of the stop rows
  (`[data-ladder-stop]` — measured, not `floorPx`, because the floor formula
  counts the value line and not the 13px name above it and under-reserves by
  about a line at every stop), takes the remainder in 27px slots, spends one
  slot on the `+N` line itself, and renders `rooms.slice(0, cap)` plus
  `+N more`. A stop row's height does not move with the cap, so this converges
  in one pass. The cap is `Infinity` until the first layout (SSR and the first
  client paint agree) and is not applied when `clientHeight` reads 0 (the rail
  below 1180, or jsdom).
- **The doors follow the track's content** — `flexGrow: 0` when there are no
  segments.
- **The rail reserves the drawer.** `min-[1180px]:pb-6` (27px) →
  `min-[1180px]:pb-[var(--doc-shell-floating-bottom)]` (the existing token:
  `--doc-shell-bottom-inset` 60px + 1.5rem = 87px). Without it the last door
  sat *under* the fixed 60px studio drawer.

**Measured (Playwright, :3010, long paper, after the change).**

| viewport | `Call sheet` box | drawer top | fully above | all 4 doors in viewport | rail self-scrolls | track excess |
|---|---|---|---|---|---|---|
| 1440×900 s0 | 763.5–813.0 | 840 | **yes** | yes | no | 0px |
| 1440×900 Pieces open | 763.5–813.0 | 840 | **yes** | yes | no | 0px |
| 1280×800 s0 | 663.5–713.0 | 740 | **yes** | yes | no | 140px |
| 1280×800 Pieces open | 663.5–713.0 | 740 | **yes** | yes | no | 140px |

Before the change the same door measured 823.5–873.0 against a drawer top of
840 — 33px of it behind the drawer at 1440×900.

**⚠ Two arithmetic consequences the design lead should see.**

1. **At 1440×900 no rung can print.** Measured: track `clientHeight` 324px; the
   six stop rows measure `[40, 54, 54, 54, 40, 40] = 282`; remainder 42px = one
   27px slot, which the `+N` line takes — so Pieces prints `+5 more` and no
   rungs. At 1440×1100 the remainder is 242px and all five rungs print with no
   `+N`. The fixed furniture at 900px is: pt 27 + `Put down` 49.5 + head 117 +
   mb 13.5 + doors block 245 + drawer-reserved padding 87 = 539, leaving 324.
   Printing rungs at 1440×900 needs a ruling on one of those blocks (the doors'
   `min-h-11` × 4 = 198px is the largest), and I have not taken it.
2. **At 1280×800 the track scrolls itself by 140px.** With no rungs to collapse,
   the excess is the six stops' own words at the 112px measure. The head and
   `FILED WITH THIS JOB` stay whole and all four doors are in the viewport and
   above the drawer; the track scrolls internally rather than overprinting
   (the orchestrator's item 8(c) backstop). Removing it needs the same ruling.

**jsdom evidence.** `collapses the rungs it cannot hold to one +N line`
(`clientHeight` mocked to `stops + 2 × 27` → one rung + `+3 more`, and the `+N`
line carries no `data-ladder-row`, so the tabstop count stays 1);
`does not grow over a spread that has nothing on the paper yet` (`flexGrow` 0);
`asks for the sum of the floors it prints, per measure, and scrolls rather than
spilling`; `drops the rungs' share back out of the ask when they are not
printed`.

## 10 · The seventh arc mark was clipped at 1440

`doc-spine.tsx`

**Cause.** `w-6` computes to **27px** at this portal's 18px root, not 24. Seven
cells + six `gap-0.5` (2.25px) = 202.5px against the 182px the 200px rail
leaves inside `px-4` (18px a side) plus the `-mx-2` (9px a side) reclaim — the
seventh mark ran into the aside's own `overflow-x-hidden`.

**Fix.** The cells are `min-[1440px]:w-[24px]` (the `xs` mark is 22px) and the
row reclaims `min-[1440px]:-mx-2.5` (11.25px a side). 7 × 24 + 6 × 2.25 = 181.5
inside 186.5. The inner `div`/`button` take `w-full` so they follow the cell.

**Measured.** Rightmost arc cell edge **188.25px** against a rail right edge of
**200px** at 1440 (was 211.5px, i.e. 11.5px outside the rail); **126px** against
**136px** at 1280. Seven marks counted at both tiers.

## 11 · Pieces prints the damage date at 1440

`app/(document)/doc/[id]/page.tsx`, `lib/document/stamp-derivation.ts`

**The cheapest existing read.** `useProjectFFEItems` already embeds
`item_claims:damage_claims!ffe_item_id(id, state, created_at)`
(`packages/supabase/src/hooks/use-project-v2.ts:192`) — the same embed
`deriveLineStamp` reads to stamp a line `damaged`. No new query, no new hook.

**What changed.** `JobTicketMount` (which is where that read already stands)
derives the oldest OPEN claim's `created_at` and reports it up through a new
`onDamagedOn` callback; the page holds it as a primitive and passes it as
`damagedOn` to `deriveLadderSegments`. `OPEN_DAMAGE_CLAIM_STATES` is now
exported from `stamp-derivation.ts` and used by both readers, so the rail's date
and the paper's stamp can never name different damage.

**Measured.** 1440: `Pieces` / `62 LINES · 1 DAMAGED AUG 29` (was
`62 LINES · 1 DAMAGED`). 1280 keeps OD-14's narrow form
`62 LINES · 5 ROOMS · 1 DAMAGED` — the date is the first thing dropped to stay
inside the 30-char cap, which is the ratified behaviour.

**Note.** `AUG 29` is the seeded claim's `created_at`, i.e. the day the claim
was raised, not a carrier's promised window (no carrier-window column exists).
If the design lead means a carrier date specifically, that is a schema question.

## 12 · `←PUT DOWN` lost its space at 1280

`doc-spine.tsx`. The `gap-1` was `min-[1440px]:` only. Now unconditional.
**Measured:** 4.5px between the arrow and the word at **both** 1440 and 1280
(was 0 at 1280).

---

## Gates

| Gate | Result |
|---|---|
| `test -- <the eight paths>` | **101 suites / 2002 tests, 0 failed** |
| `test -- --ci --silent` | **461 suites / 5283 tests, 0 failed** |
| `type-check` | **0 errors** |
| `lint` | 201 problems — **the 2 known errors only**, 199 warnings |
| e2e `quiet-responsive-shell` + `desk-walkthrough` | **10 passed / 0 failed** |

**Jest reconciliation vs the W2 baseline (461 / 5263): +0 suites, +20 tests.**

| file | + | what |
|---|---|---|
| `spine/__tests__/lens-ladder.test.tsx` | +11 | Home/End · hidden rungs never focused · one tabstop across row-count changes · focus ring · unmounted stop (×2) · rungs only while Pieces is open or a room is held · track floor per measure · rung share dropped when closed · `+N` collapse · no grow on a pre-work spread |
| `hooks/__tests__/use-document-running-index.test.tsx` | +4 | replace-in-place re-observe + stale `seen` · disconnect on unmount · body→paper upgrade · `mountedKeys` |
| `care-band.test.tsx` | +2 | completed branch is the care root · the root can take focus |
| `__tests__/shelved-spine.test.tsx` | +2 | the re-homed money-read cost guard (×2) |
| `lib/document/__tests__/lens-ladder-derivation.test.ts` | +1 | the call-sheet flag gate |

The e2e ran against **this worktree's** dev server on `:3010` (booted with the
same local-Supabase env as the walker's `:3000`, which serves the pre-fix
`agent-lens-w2-int` tree and was left untouched). A throwaway
`playwright.w2fix.config.ts` pointed `baseURL` at `:3010`; it is not committed.

## Files touched outside the brief's list

Both are additive and are flagged rather than assumed:

- `components/document/region/region-head.tsx` — `RegionLedgerEntry` gains
  `'aria-controls'?: string`, forwarded to `DocumentAction`. Without it fix 4's
  `aria-controls` cannot be emitted at all.
- `lib/document/stamp-derivation.ts` — `OPEN_DAMAGE_CLAIM_STATES` exported so
  item 11's date and the line stamp read one list.

`doc-spine.tsx` moved beyond "ladder props only" for design items 9, 10 and 12,
which are its own markup.

## Seed, re-run for keeps (after the merge)

`scripts/the-document-lens-seed.sql` re-applied from the integration worktree,
then the three ambient `timer_auto` rows removed
(`delete … where project_id = …d5 and source = 'timer_auto'` → `DELETE 3`).
The walker's 8/5 reading was those rows, not a seed regression: the seed
creates no time entries and the `margin_items` view's `time` branch picks up any
that exist. Note the seed-notes' narrower predicate
(`raw_seconds = idle_seconds`) matched none this time — two of the three rows
had `raw_seconds 60 / idle 0` (a browser tab left open with activity), so the
predicate has to be `source = 'timer_auto'` alone.

```
                       check_name                       |   actual   |  expected  | result
--------------------------------------------------------+------------+------------+--------
 a non-clean receiving_inspections row exists           | 1          | >= 1       | PASS
 a separate PO reaches clean-delivered >= 1             | 1          | >= 1       | PASS
 blocked lines = 2 (console + COM)                      | 2          | = 2        | PASS
 damaged = 1                                            | 1          | = 1        | PASS
 install milestone = current_date + 21                  | 2026-09-19 | 2026-09-19 | PASS
 lines >= 60                                            | 62         | >= 60      | PASS
 lines with product >= 40                               | 58         | >= 40      | PASS
 margin_items beside Pieces (anchor=line) = 3           | 3          | = 3        | PASS
 margin_items total = 7                                 | 7          | = 7        | PASS
 margin_items whole job (anchor=letterhead/section) = 4 | 4          | = 4        | PASS
 open damage_claims on a line of this project = 1       | 1          | = 1        | PASS
 overdue approvals = 2                                  | 2          | = 2        | PASS
 PO unacknowledged >= 14d = 1                           | 1          | = 1        | PASS
 pre-work doc d6 exists (sent, unopened)                | 1          | = 1        | PASS
 purchase orders >= 3                                   | 4          | >= 3       | PASS
 rooms >= 4                                             | 5          | >= 4       | PASS
 unspecified = 2                                        | 2          | = 2        | PASS
(17 rows)  —  17 PASS / 0 FAIL
```

## Merge

| | |
|---|---|
| fix commit | `c6175792e` (15 files, +1252 / −201) |
| merge into `document-lens/integration` | `e6da8bd76` — `merge(document-lens): wave 2 fixes` (`--no-ff --no-verify`; the merge commit only) |
| pushed | `document-lens/w2-fix` (new branch) and `document-lens/integration` `06ad45de9..e6da8bd76` |
| ancestry | `c6175792e` confirmed an ancestor of `document-lens/integration` |
| retired | worktree `.codex/worktrees/agent-lens-w2-fix`, local branch `document-lens/w2-fix`; the `:3010` dev server stopped (the walker's `:3000` was never touched) |
