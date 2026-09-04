# Client Page Completion — W2 Integration

**Branch** `client-page-2/integration` · **Base** `origin/main` @ `26b15145e`
**Head (pushed)** `c06c2b79cef746b1574341a798279531a4c1bf5d`
**Worktree** `/Users/kody/Code/patina-merged/.codex/worktrees/agent-cpc-int`

All nine lanes merged with real merge commits, in the briefed order. Every briefed
lane head verified an ancestor of the final head.

---

## 1. Merge list

| # | Lane | Briefed head | Merge commit | Conflicts | Suites | Tests |
|---|------|--------------|--------------|-----------|--------|-------|
| — | *baseline* (`origin/main`) | `26b15145e` | — | — | 30 | 568 |
| 1 | l9 | `373d4a834` | `85f4496e9` | none | 33 | 618 |
| 2 | l8 | `2bf23a0a8` | `266b4d1ff` | none | 36 | 659 |
| 3 | l1 | `7dc29fa0e` | `d878bc90a` (+ `8d2ad2a5e`) | 2 textual + 1 semantic | 37 | 693 |
| 4 | l2 | `8d14bfb69` | `2ffea2d37` | 3 textual | 43 | 766 |
| 5 | l3 | `3f7f21896` | `184f96f2e` (+ `84027b141`) | 1 semantic | 45 | 801 |
| 6 | l4 | `87badbaa0` | `21bf467c3` | 3 textual | 47 | 852 |
| 7 | l5 | `3543e0717` | `b5c003d0d` | 2 textual | 51 | 921 |
| 8 | l6 | `1ead8fca0` | `d51d12f56` (+ `f6e84c019`) | 3 textual + 1 semantic | 53 | 975 |
| 9 | l7 | `42bd456c9` | `c06c2b79c` | 3 textual + 2 semantic | **54** | **1008** |

Gate after every merge: `pnpm --dir …/apps/client-portal test -- threshold making` and
`type-check`. Both green at every row above (counts are the post-resolution figures).

### Ancestry verification
`git merge-base --is-ancestor <sha> HEAD` — all ANCESTOR:

```
373d4a834 ANCESTOR   2bf23a0a8 ANCESTOR   7dc29fa0e ANCESTOR
8d14bfb69 ANCESTOR   3f7f21896 ANCESTOR   87badbaa0 ANCESTOR
3543e0717 ANCESTOR   1ead8fca0 ANCESTOR   42bd456c9 ANCESTOR
```

---

## 2. Conflicts and resolutions

Guiding rule throughout: **both lanes' intent must survive.** Where two lanes each
*added*, the resolution is the union. Where one lane *deliberately removed* what the
other lane merely carried as unchanged context, the removal is honoured.

### Merge 3 — l1

**C1 · `threshold.tsx` imports.** HEAD (l9) had dropped `splitSpinePhases` (replaced by
`thresholdPhases` from `canonical-phases.ts`) and added `ScoredAction`; l1 had dropped
`ScoredAction` (it moved `DoorstepApproval` out into `approval-ask.tsx`) and carried
`splitSpinePhases` as context.
→ **Both removals are real, so both were honoured**: the line became
`import { openChapterOf } from '@/components/making/making-spine';` and the
`ScoredAction` import was dropped. Verified against each side's diff before deciding —
a naive union would have left two dead imports.

**C2 · `threshold.tsx` props destructure.** HEAD (l8) added `otherHouses = []`; l1 added
`projectApprovalsError = false`. → union, both kept. Both are used
(`otherHouses` at the Mat, `projectApprovalsError` in the asks region).

**C3 · semantic, not textual — `parseSourceDate`.** l1 removed `parseSourceDate` from the
`derive` import (its only user, `DoorstepApproval`, had moved out); l9 had *added* a new
call site — `readingMark={readingMarkLine(parseSourceDate(previousReadAt))}`. Git merged
both hunks cleanly and produced a file that did not compile. Caught by the gate:
`TS2304: Cannot find name 'parseSourceDate'` plus **45 failing tests**.
→ Import restored (commit `8d2ad2a5e`); all 45 tests recovered.

### Merge 4 — l2

**C1 · `threshold.tsx` standing/road-orders imports.** l9's multiline `standing` import
(with `readingMarkLine`) vs l2's added `road-orders` import. → union, l2's new import
placed above, l9's multiline form kept.

**C2 · `threshold.tsx` ledger / letterbox / road block.** l9 had added `today={today}` to
`HouseLedger`; l2 rewrote `Letterbox` (invoices, designerName, onRefetch) and `TheRoad`
(direct orders, closed orders, the `ordersSettled` gate). l2's side was otherwise the
pre-l9 base. → **l2's richer block taken, with l9's `today={today}` restored on
`HouseLedger`.** l2's `TheRoad`/`Letterbox` already pass `today`, so l9's intent survives
on all three.

**C3 · `threshold.test.tsx` `@patina/supabase` import list.** l1's approval hooks vs l2's
`useDirectOrders`. → union.

### Merge 5 — l3

No textual conflict. **Semantic conflict caught by the gate:** l3 gave the door leaf its
other four answers (`DoorActs`), which calls `useDeclineCommercialDocument`. l9's
`threshold-robustness.test.tsx` mounts `DoorGate` with a *partial* mock of
`@/hooks/use-commercial-client` (bundle only), so `DoorActs` threw
`TypeError: useDeclineCommercialDocument is not a function` — 4 failing tests, all in
that file's "the note pinned to the door leaf" describe block.
→ Resolved by **adopting l3's own boundary convention**: l3's `door-gate.test.tsx` stubs
`../door-acts` for DoorGate tests that are not about the acts. The same stub was added to
l9's robustness suite (commit `84027b141`), with a comment naming why. Both intents
survive — l9's note assertions still run against the real `DoorGate`, and the acts keep
their own suites (`door-acts.test.tsx`, `door-gate.test.tsx`).

### Merge 6 — l4

**C1 · `mat.tsx` `Mat(...)` signature.** HEAD (l8) `otherHouses = []` vs l4
`correspondence`. → union (reflowed multiline).
**C2 · `threshold.tsx` Mat props + ledger/letterbox/road.** HEAD's l2+l9 block is a strict
superset of l4's side (which was base); l4's only real addition there was the
`correspondence={<MuteLetters …/>}` prop and the three `writeBack`/`hasRecord`/
`replyHeadsTheRecord` consts. → HEAD's block kept, l4's additions grafted in.
**C3 · `threshold.test.tsx` two adjacent `jest.mock` blocks** (l3's `../door-acts` stub vs
l4's `use-project-correspondence`). → both blocks kept, each properly closed.

### Merge 7 — l5

**C1 · `threshold.tsx` component import** (`./other-houses` vs `./papers-sheet`) → union,
alphabetical.
**C2 · `threshold.tsx` Mat props** (`otherHouses`/`correspondence` vs
`onOpenPapers`/`papersOpen`) → union.
**C3 · `mat.tsx` `MatProps` + destructure** (`correspondence` vs `onOpenPapers`/
`papersOpen`) → union, both doc comments preserved.

### Merge 8 — l6

**C1 · `threshold.tsx` `./scope-change-ask` import** vs HEAD's `./room-capture` → union.
**C2 · `threshold.tsx` hooks block.** l4's correspondence hooks vs l6's three review /
scope-change queries → union; l6's explanatory comment kept verbatim.
**C3 · the settle gate.** l4's `correspondence.isPending` vs l6's
`pendingReviewQuery.isPending || submittedReviewQuery.isPending ||
scopeChangesQuery.isPending`. → **all four kept.** This is the load-bearing one: each lane
added its own query to the same gate precisely so the house cannot open saying "nothing
stands open" and then grow an ask a beat later. Dropping either side would reintroduce
exactly the reversal both lanes' gates exist to forbid.
**C4 · `mat.tsx` `MatProps`, destructure, and render slot.** l6's `extraActs` vs HEAD's
`correspondence`/`onOpenPapers`/`papersOpen` → union; in the render, `{extraActs}` placed
first, then `correspondence` on its own line (l4's comment explains why it must not sit
inside the client's own record row).
**C5 · `threshold.tsx` `previouslySection`.** l4 had rewritten it as
`<Previously entries correspondence={…}/>`; l6 wrapped it in a fragment adding
`SubmittedReviewsPrevious` and `ResolvedScopeChangesPrevious`. Taking either side alone
would have lost the other. → **l4's element nested inside l6's fragment.** (Git's raw
output had left *two* `const previouslySection` declarations in one scope.)
**C6 · `threshold.tsx` room band children.** HEAD's `<RoomCapture …/>` vs l6's
`<RequestChangeAct …/>` — they shared a trailing `/>`, so git conflicted them as one.
→ both rendered, as sibling children of `RoomBand`.
**C7 · semantic — duplicate import.** l4 and l6 each added an identical
`import type { ReactNode } from 'react';` to `mat.tsx` at different offsets; git kept
both. `TS2300: Duplicate identifier 'ReactNode'` (×2). → deduped (commit `f6e84c019`).

### Merge 9 — l7

**Root cause, recorded because it shaped every resolution here.** l7's final commit
(`42bd456c9`, "prettier formatting on the fix-round files") reformatted `threshold.tsx`,
`mat.tsx`, `mat.test.tsx`, `details-sheet.tsx` and two others **wholesale** — the repo has
no root prettier config, so that pass produced Prettier's *default* double quotes against
a codebase that is single-quoted throughout. Because l7 branched from `26b15145e`, its
side of every conflict was the **stale base re-quoted**, not new work: `DoorstepApproval`
(deleted by l1), `splitSpinePhases` (replaced by l9), `LONG_MONTH_DAY`, the pre-l3 door
`firstDoorId`, the pre-l1 `signatureGates`, the pre-l9 `useDoorstepApprovals` block.
Taking l7's side on any of those would have silently reverted four lanes.

→ **Resolution strategy: keep HEAD for all 11 `threshold.tsx` hunks, then graft l7's four
genuine additions by hand**, read off `git diff 26b15145e ef4f0545f` (l7's last
*substantive* commit, before the reformat):
1. `import { DetailsSheet } from './details-sheet';`
2. `const [detailsOpen, setDetailsOpen] = useState(false);`
3. `onOpenDetails` / `detailsOpen` on `<Mat>` (replacing `accountHref`)
4. `<DetailsSheet open={detailsOpen} onClose={…} />` beside `<PapersSheet>`

**`mat.tsx`** — same approach: HEAD's imports and `mat-classes` module kept (l7's side
re-declared `LINE_CLASS`/`COLUMN_HEAD_CLASS` locally, which l8 had extracted); l7's
`onOpenDetails`/`detailsOpen` props and the `href→onClick` + `aria-haspopup="dialog"` +
`aria-expanded` swap on the "Your details" act all kept.

**`mat.test.tsx`** — l7's two new tests ("keeps a way to her own details…", "announces the
details act as a dialog trigger…") kept, re-quoted to the file's single-quote style, and
placed after HEAD's two papers-sheet tests; the shared trailing context line
(`it('offers the way out, and takes it'…`) repositioned to head its own body.

**Semantic fallout, caught by the gate.** l7 turned "Your details" from a route link into
a button, but two suites from other lanes still constructed `Mat` with the removed
`accountHref` prop and asserted a `link` role:
- `__tests__/other-houses.test.tsx` (l8) — `accountHref: '/account' as const` →
  `onOpenDetails: jest.fn()`
- `__tests__/correspondence.test.tsx` (l4) — same prop swap, and
  `getByRole('link', {name: /your details/i})` → `getByRole('button', …)`.
  That test asserts the mute act sits on its *own* line, outside the details row —
  that assertion is untouched and still passes.

---

## 3. Final verification

```
$ pnpm --dir …/apps/client-portal test -- threshold making
Test Suites: 54 passed, 54 total
Tests:       1008 passed, 1008 total

$ pnpm --dir …/apps/client-portal type-check
> tsc --noEmit          (clean)
```

Baseline → final: **30 → 54 suites, 568 → 1008 tests.**

### Full-suite run (beyond the briefed gate)

```
Test Suites: 2 failed, 158 passed, 160 total
Tests:       1 failed, 1875 passed, 1876 total
```

**Both failures are inherited from `origin/main` and were not caused by this
integration** — evidence:

- `src/lib/__tests__/portal-access.test.ts` — `foreignPortalFromDomain('manufacturer')`
  expected `null`, got the maker-workspace entry.
  `git diff --stat 26b15145e HEAD -- src/lib/portal-access.ts src/lib/__tests__/portal-access.test.ts`
  is **empty**: neither the source nor the test moved.
- `src/lib/data/__tests__/orders.test.ts` — suite fails to run,
  `Cannot find module '../orders'`. The test exists on `26b15145e`; `src/lib/data/orders.ts`
  **has never existed** (not on main, not added by any lane), and
  `git log 26b15145e..HEAD -- <both paths>` is empty.

Neither is in the briefed `threshold making` gate. Flagging, not fixing — out of the
integration lane's scope.

### Edge functions touched by the lanes
The pre-push advisory flagged the two Deno functions the lanes changed
(l2 → `create-checkout-session`, l6 → `review-requests`). Both check clean:

```
$ deno check --config supabase/functions/deno.json supabase/functions/create-checkout-session/index.ts
Check supabase/functions/create-checkout-session/index.ts
$ deno check --config supabase/functions/deno.json supabase/functions/review-requests/index.ts
Check supabase/functions/review-requests/index.ts
```

---

## 4. Advisories for the reviewer

1. **`mat.test.tsx` now carries l7's double-quote formatting** across the parts git
   auto-merged from its reformat commit. Functionally correct and green, but it is the
   only file in the threshold suite not in the repo's single-quote style. The repo has
   **no root prettier config**, so `prettier` defaults to double quotes and the pre-commit
   hook's "formatting drift" warning fires on essentially every client-portal file. Worth
   a ruling: add a root `.prettierrc` with `singleQuote: true`, or accept the drift.
2. **No migrations were minted or touched** by this integration — nothing to renumber.
3. **`packages/supabase/src/hooks/use-direct-orders.ts`** (new, from l2) merged without
   conflict; `@patina/supabase` is source-resolved (no `dist`), so no rebuild was needed.
4. Two pre-existing `origin/main` failures (§3) are unowned by any lane in this wave.
5. **Worktree `agent-cpc-int` is deliberately left in place** for review of the merged
   tree; retire it (and the branch) once `client-page-2/integration` lands.
