# W1 FIX lane — the review's blockers, closed

Lane: W1 FIX (separate context; wrote none of the W1 code under review).
Branch: `document-lens/w1-fix` off `document-lens/integration@de82db0e5`.
Worktree: `.codex/worktrees/agent-lens-w1-fix`.
Inputs: `build/w1-review-correctness.md` (C-03, C-04, C-05, M-05, M-02, L-05), `build/w1-review-fidelity.md` (F-3), `build/design/reconciliation.md` §4 D-6, `source/proposal.md` §4 "The spine".

---

## 1 · C-03 / M-12 — the letterhead keeps its write path

`letterhead-vitals.tsx` + `letterhead-vitals.test.tsx`.

D-6 ruled what the vitals row PRINTS; the lane gated the EDITORS, so an unset
date and an unrecorded band had no door anywhere on the paper, and `×` on a
recorded date removed the field for good with focus falling to `<body>`.

Ruling applied (ORCHESTRATOR, logged as **D-B7** in `design/deviations.md`):
an unset vital prints ONE scored-ink act in the vitals row, opening the very
editor the recorded field uses.

- `VitalDate` gains `emptyAct: string | null`. With no value it prints the act
  (`da-score-hover`, clay focus ring) instead of a `—`; `emptyAct: null`
  prints nothing at all, which is how the two empty dates share one door.
- Parent: `noDates = !startDate && !targetDate` → start's act is `Set dates`
  and target prints nothing; otherwise `Set start` / `Set target`. Both
  `VitalDate`s are now unconditionally mounted, so the field can never vanish
  from under a press.
- New `VitalBand`: `Set a budget band` when no bound is recorded; pressing it
  reveals the same two `VitalMoney` editors in place and puts the caret in the
  minimum (`VitalMoney` gains an optional `inputRef`).
- One `triggerRef` serves whichever of the two buttons is mounted, and `clear()`
  raises a `restoreFocus` flag that a `useEffect` on `value` consumes — so the
  `×` hands focus to the act that replaces the field.
- **The act is never `disabled` while a save is in flight.** First cut kept the
  field's `disabled={state === 'saving'}` on it; the new focus test caught that
  a disabled button cannot take focus and focus still landed on `<body>` — the
  exact one-way door C-03 names. The act only opens a popover, so it stays live.
- The `if (!phaseWord && !startDate && …) return null` early return is gone:
  on a project document the row now always prints at least the two acts. D-6's
  "0px when a document has none of the three" is amended in D-B7, not silently.

Tests (letterhead-vitals.test.tsx, +3 cases): unset → both acts print, no
`Start`/`Target`/`Band` label, no `—`, no `$`; `Set dates` opens the Folio;
`Set a budget band` reveals the editors and focuses the minimum; a set date
prints its value with no act while its unset sibling names itself; `×` leaves
focus on the enabled act and not on `<body>`.

## 2 · C-04 / C-05 — the two-line cap is the caller's, not the primitive's

`margin-note.tsx` + `margin-note.test.tsx`, one call site in `margin-rail.tsx`.

`line-clamp-2` sat on the shared `MarginNote`, so it applied at all five call
sites — three of which pass a `<button>` inside the body (`desk/page.tsx:337`,
`people/views/directory-view.tsx:398`). `-webkit-box` + `overflow:hidden`
paints such a child out of view while it stays in the tab order (SC 2.4.11),
and the `title` recovery was pointer-only and absent on four of five sites.

- `clamp?: boolean` (default **false**). Only `margin-rail.tsx`'s
  `doc-first-touch` note passes it.
- The clamped note gets a keyboard-reachable `More` act (`da-score-hover`,
  clay focus ring) carrying `aria-expanded` and `aria-controls` on the body's
  id; pressing it drops the clamp in place.
- `title`/`fullText` deleted — a hover-only recovery on a non-focusable
  `<span>` was never the affordance.

Tests: unclamped by default (no `line-clamp-2`, no `More`, no `title`);
clamped + `More` expands and flips `aria-expanded`; a note carrying a focusable
child has no `line-clamp-2` on any ancestor of that child.

## 3 · M-05 — the bar's floor and the paper's inset agree again

`src/app/globals.css` (the `--doc-shell-bottom-inset` block only).

The bar moved `min-h-[64px]` → `min-h-[72px]` in W1-L3; the token still said
64/52. With `env(safe-area-inset-bottom) = 0` the contract was false by 8px.

- below 1180: `max(72px, calc(60px + env(safe-area-inset-bottom)))`
- ≥ 1180: unchanged at `60px` (the Studio Drawer)
- the block comment now names the 72px bar and says the below-1180 value is
  the bar's own floor, so it holds with no safe area to add.

## 4 · F-3 — presence lands in the drawer's account zone

`studio-drawer.tsx` + `studio-drawer.test.tsx`.

The proposal §4 tenant table evicts the presence line to the drawer's account
line (F137); W1-L1 deleted it from `doc-spine.tsx` and it landed nowhere.

- `presenceSentence(others)` — `null` alone, `You and Marit` for one,
  `You and 2 others` beyond one. Nothing prints when she is alone: "just you"
  is the resting state of every session.
- Printed as `[data-drawer-presence]` immediately before `<AccountNameplate />`
  in the drawer's right zone, in the zone's own 12px mono register, bounded
  `max-w-[18ch] truncate whitespace-nowrap` so the right zone cannot grow into
  the centre the way F03's `Find anything` words did at 1280.
- `StudioDrawer` gains `others?: string[]`, defaulting to `[]`.

Tests: alone → no `[data-drawer-presence]` node, no `You and`, no `Just you`;
one other → `You and Marit`; two → `You and 2 others`.

**Call site OWED to the W2 integration lane** (see "Owed" below).

## 5 · L-05 — one accessor for the region label

`margin-item.tsx`: `marginRegionName` re-derived the label with its own
`PROJECT_PAPER_ORDER.find(...)?.label ?? key`, whose fallback would print a raw
key where `regionHeadingId` deliberately throws. Now
`DOCUMENT_INDEX_LABELS[key].toUpperCase()`; the `PROJECT_PAPER_ORDER` import is
replaced by `DOCUMENT_INDEX_LABELS`.

## 6 · M-02 — "sole timer doorway" is now a count

`e2e/document/quiet-release-contracts.spec.ts` (the replacement test only).

The old form proved presence: the drawer printed one of two strings and
`[data-spine-timer-regime]` was absent. A second document-scoped doorway that
merely omitted the attribute passed unchanged.

At **1440 and 1280**: `[data-drawer-timer-doorway]` `toHaveCount(1)` and
visible · `[data-spine-timer-regime]` `toHaveCount(0)` · every button whose
accessible name matches `/time controls|in hand/i` counts **1** page-wide, and
the drawer-scoped count of the same is **1** — i.e. nothing outside the drawer
opens the clock. (Playwright's role engine reads the accessibility tree, so a
CSS-hidden doorway is already excluded; what is counted is what she can reach.)

At **390**: drawer hidden, `[data-drawer-timer-doorway]` hidden,
`[data-spine-timer-regime]` count 0, and the clock-named count is **0** on the
closed bar — then opening `More studio actions` brings the `Time in hand` row
to exactly one, and it opens the `Time in hand` dialog. The integration lane's
re-point to the More sheet is kept; the fallback-timer-block dependency M-01
flagged is gone with it.

The first `toHaveCount(1)` carries a 70s timeout: the drawer prints the clock
only once the held document has a minute on it (`inHandToday > 0`), and on a
freshly reset database the seeded designer starts at zero. It passes instantly
on a warm database (measured: 5.6s / 6.0s for the whole test).

---

## Gates — all run in `.codex/worktrees/agent-lens-w1-fix`

| Gate | Command | Result |
|---|---|---|
| targeted jest basket | `pnpm --filter @patina/designer-portal test -- src/components/document/letterhead-vitals.test.tsx src/components/document/margin-note.test.tsx src/components/document/margin-item.test.tsx src/components/document/__tests__/margin-rail-stage2.test.tsx src/components/document/studio-drawer.test.tsx src/lib/document/__tests__/contrast.test.ts src/lib/document/__tests__/shadow-gate.test.ts` | **7 suites / 107 tests passed** |
| full jest | `pnpm --filter @patina/designer-portal test -- --ci --silent` | **458 suites / 5201 tests passed**, 1 snapshot |
| type-check | `pnpm --filter @patina/designer-portal type-check` | **clean** (`tsc --noEmit`, no output) |
| lint | `pnpm --filter @patina/designer-portal lint` | 201 problems — **2 errors, 199 warnings**; both errors are the two pre-existing do-not-touch ones (`piece-room-save-gate.test.tsx:159 import/first` rule-not-found, `use-commercial-documents.test.ts:930 react-hooks/rules-of-hooks`). No new error, no new warning from this lane. |
| e2e | `cd apps/designer-portal && NEXT_PUBLIC_SUPABASE_URL='http://127.0.0.1:54321' SUPABASE_URL='http://127.0.0.1:54321' npx playwright test e2e/document/quiet-release-contracts.spec.ts --project=chromium --workers=1 --reporter=list` (unsandboxed; against the :3000 server serving `agent-lens-w1-int` — the spec change is spec-only, so that server's code is valid for it) | **3 passed (21.6s)** |

### Jest arithmetic, reconciled

Baseline (test-impact + the W1 merge): **458 suites / 5194 tests**.
After this lane: **458 suites / 5201 tests** — **suites unchanged, +7 tests**,
every one of them new coverage this lane was asked to add:

| File | + | Cases |
|---|---|---|
| `letterhead-vitals.test.tsx` | +3 | `Set dates` opens the start editor · `Set a budget band` reveals the editors in place · `×` hands focus to the act (the other two D-6 cases were rewritten in place, not added) |
| `margin-note.test.tsx` | +1 | the cap describe goes 2 → 3: unclamped by default · clamped + `More` expands · no clamp on any ancestor of a focusable child |
| `studio-drawer.test.tsx` | +3 | alone prints nothing · one other names them · two or more are counted |

No suite was added, deleted, renamed or moved, so test-impact's merge rule
("a wave whose suite count moves without a written reconciliation does not
merge") is satisfied by an unmoved count.

---

## Owed — one call site, for the W2 integration lane

`StudioDrawer` now takes `others?: string[]` (default `[]`), so presence prints
nothing until it is fed. It cannot be fed from `page.tsx`: the drawer mounts in
**`apps/designer-portal/src/app/(document)/layout.tsx:75`** (`<StudioDrawer />`),
above any engagement, while the presence array is derived one level below at
`app/(document)/doc/[id]/page.tsx:903` —
`const others = useDocumentPresence(row?.engagement_id ?? null);`

Two ways to close it, the integration lane's call:

1. **One line, in the drawer itself** — give `HeldDocument`
   (`hooks/document-time-provider.tsx:65-69`) an `engagementId`, then
   `const others = useDocumentPresence(heldEngagementId)` inside `StudioDrawer`
   and drop the prop. This is the only route that keeps the drawer a
   self-contained studio surface; it touches the provider, which is not this
   lane's file.
2. **Lift the hook to the layout** — call `useDocumentPresence` in
   `(document)/layout.tsx` and pass `others={others}` at `:75`. Needs the
   engagement id at layout level, which the route params do not carry today.

Until one lands, F-3's mechanism is in place and asserted, and prints nothing
in product — the same shape the wave already accepted for `household`,
`roomInHand` and `readingIndex`.

## Watch item

The presence sentence prints at every width the drawer shows (≥1180), bounded
to 18ch. F03's overprint at 1280 was the CENTRE zone's `Find anything` words;
this is the right zone, and no gate measures the drawer's zones against each
other. A 1280 walk should look at the right zone once with two people in the
document.
