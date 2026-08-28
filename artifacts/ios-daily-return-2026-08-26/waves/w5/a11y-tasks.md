# W5 — lane A11Y — task list

Written before coding, per the build-plan's rule for lanes. Two deliverables, both carry-overs
named in `build-plan.md` § "W4 — DONE 2026-08-28":

> **Carried to W5 (a small accessibility lane):** the Companion action sheet does not scroll at
> accessibility text sizes (round 3's fix did not hold); on the flag-off root the floating orb
> steals taps from the story card at accessibility sizes (the orb must yield there as it does on
> pay/sign screens).

Evidence for both: `waves/w4/walk.md` walk 4 — item 7 (FAIL) and new finding 1.

**Owned files (the whole write surface for this lane):**
- `apps/mobile/Patina/Patina/Features/Companion/Components/CompanionHearthView.swift`
- `apps/mobile/Patina/Patina/Features/Companion/Views/CompanionOverlay.swift`
- `apps/mobile/Patina/Patina/Design/Components/CompanionSafeArea.swift`
- their tests under `apps/mobile/Patina/PatinaTests/`
- `waves/w5/a11y-notes.md` (the C1 coordination note), this file, and `shots/w5-a11y-*.png`
  + the `## w5-a11y` section of `research/01-shot-ledger.md`.

---

## A — Diagnose before changing anything (delivery 1's "find why")

The brief names three candidate causes and asks for the real one. Round 3's `d5760170f` added a
`ScrollView` bounded to `companionAccessibilityPanelMaxHeight = 460` inside
`CompanionHearthView.expandedColumn`; walk 4 found rows 5/6 still unreachable across four scroll
attempts of varying speed and start position. So the fix is either not in the layout it claims to
be in, or the gesture never reaches it.

- **A1** — Build the lane's tree, install on the clone, set
  `xcrun simctl ui <udid> content_size accessibility-extra-extra-large`, open the Companion on the
  flag-off root and capture the AX tree: the panel's own frame, the `companion.shell` /
  `companion.panel` frames, and every `companion.action.*` row frame. Record whether the panel is
  bounded near 460 + chrome (the fix's layout is live) or runs the full content height (it is not).
- **A2** — Attempt the swipe with the same shape walk 4 used and re-read the frames. This separates
  "the ScrollView exists and does not receive the drag" from "there is no bounded ScrollView".
- **A3** — Write the finding down before writing the fix, and name which of the brief's three
  hypotheses it is (fixed-height shell / hit-test shield / sheet detent) or a fourth.

## B — Delivery 1: the action sheet scrolls at accessibility text sizes

- **B1** — A failing unit test at the diagnosed cause. It must fail on the current tree for the
  reason A3 names, not merely assert "a ScrollView exists" (which round 3's test already did and
  which passed while the panel did not scroll).
- **B2** — Run it, watch it fail.
- **B3** — Fix at the cause in `CompanionHearthView.swift` (and `CompanionOverlay.swift` if the
  cause sits in the overlay's frame chain, which is in the owned set).
- **B4** — Run: the new test green, `CompanionHearthViewTests` and every Companion suite green.
- **B5** — Prove on glass: `describe_screen` frames showing the last row (`Your profile`) inside the
  viewport after a swipe, at `accessibility-extra-extra-large`, on the lane's clone. Shots
  `w5-a11y-01…`.
- **B6** — Pathspec commit.

## C — Delivery 2: the orb yields at accessibility sizes on the flag-off root

W1b's ruling already exists and is quoted in `CompanionSafeArea.swift`'s
`yieldsToPinnedFooter` doc comment: *"the dock steps aside instead: on these routes it drops to its
minimal resting state — the 44-point mark in the trailing corner, caption retired — out of the act's
column at every scroll offset."* Walk 4's finding 1 is the same defect on a different surface: the
64 pt dock's frame (`y=748–812, x=169–233`) sits wholly inside the story card's bounds
(`y=711–961`) and wins the hit test, so the card cannot be opened. The brief's instruction is to
reuse that policy for the accessibility-size case **everywhere the Hearth is drawn**, not to add a
per-route exception.

- **C1** — Failing tests, three of them:
  1. `CompanionHearthMetrics` answers a *smaller* reservation at accessibility sizes (the dock is
     the 44 pt mark, not 140 pt of mark + caption + lift), so the story card and the rail get the
     space back.
  2. The overlay's `displayMode` resolves to `.minimal` at an accessibility size on a route that
     would otherwise rest (the flag-off root's `heroFrame`).
  3. `pinnedFooterClearance` follows the same policy — a screen reserving for the dock must not
     reserve 140 pt for a dock that is now 44.
- **C2** — Run, watch them fail.
- **C3** — Implement: a single policy function on `CompanionHearthMetrics` (the type that already
  owns the yield rule), consumed by `CompanionOverlay.displayMode` and by the reservation modifier.
  The reservation modifier and `displayMode` must read the **same** environment value so they can
  never disagree — that disagreement is what leaves either dead space or an orb over content.
- **C4** — Run: the three new tests green; `CompanionSafeAreaTests`, `HouseFirstRootTests` and the
  Companion suites green (`HouseFirstRootTests` pins `barRowHeight` to `PatinaTabBar.itemHeight`).
- **C5** — Prove on glass, the exact failure case from walk 4: at
  `accessibility-extra-extra-large`, flag off, scroll Today until the story card is under the former
  bubble coordinates, tap there, and show the **story** opens, not the Companion. Shots
  `w5-a11y-…`.
- **C6** — Pathspec commit.

## D — SourcePin tests

Both fixes are layout/policy rules that a later refactor can silently undo (round 3's did exactly
that). Add SourcePin assertions in the suite's existing style — pinning the accessibility branch in
`CompanionHearthView.swift` and the yield policy in `CompanionSafeArea.swift` to their source — so a
regression fails a test rather than a walk.

## E — Gate and report

- **E1** — `apps/mobile/Patina/scripts/ios-gate.sh build` (unsandboxed, foreground; twice if the
  first run trips `GitCommit.swift` in a fresh tree, or dies with no `error:` line, which is
  DerivedData contention with a sibling lane).
- **E2** — `xcodebuild test … -only-testing:PatinaTests -destination id=<clone>` — the whole tier
  green, not just the lane's files. No `ios-gate.sh all`, no `lint-delta` (steward-only: they touch
  the shared `.git` and grab the first simulator).
- **E3** — Sim check on the clone with `-DeploymentTarget local -PatinaFlags direct-orders`, and
  once without the flag (delivery 2 is a flag-off-root behaviour, so the flag-off pass is the
  load-bearing one).
- **E4** — Shots into `shots/w5-a11y-NN-*.png`; ledger rows under `## w5-a11y` in
  `research/01-shot-ledger.md`.
- **E5** — `a11y-notes.md` for C1's lane (this lane touches no `CompanionAreaBuilders`).
- **E6** — `rmdir .writer.lock.d`; `git status --porcelain -uno` empty; report.

---

# Addendum, written after the work (labelled as such, C5)

Everything above is the list as written before coding. Three things came out differently and are
recorded here rather than edited into the plan above.

**A3's answer — it is the brief's first hypothesis, and there were two of them.** Not a hit-test
shield (the shield is declared first in the overlay's ZStack, i.e. beneath the panel) and not a
sheet detent (the panel is not a sheet). It is the ScrollView inside a fixed-height shell, twice
over: the hardcoded `460` cap, and a 20 pt shell inset sitting *outside* the ScrollView. Both are
in the file's doc comment and both commit messages.

**Walk 4's item-7 wording needs one correction, and I would rather say it than let it stand.** The
walk reported the list "stayed there across four scroll attempts" and read that as "the list
specifically does not respond to a scroll". It does. On the pre-fix binary a drag from y=790 moved
the column; the same drag from y=800 moved nothing. The ScrollView's viewport ended at 796, and all
four of the walk's attempts began at y=800 or y=850 — in the dead inset or below the panel
entirely. The walk's control (tapping `companion.help` successfully) proved the panel received
*touches*, which is not the same as proving a *drag* reached the ScrollView, so the conclusion
outran the evidence. The FAIL was still the right call: with a 460 pt viewport, a 1,522 pt column
and a dead strip on the panel's bottom edge, the last two rows were genuinely out of practical
reach. Both causes are fixed and the walk's own start point (y=800) now scrolls.

**C1.3 was dropped on purpose.** The plan named `pinnedFooterClearance` as a third failing test.
It is not in the change. Those routes (`invoiceDetail`, `proposalDetail`, `decisionDetail`) already
returned `.minimal` at *every* text size, so their over-reservation predates this defect and is
unrelated to walk 4's finding; adding an `accessibilityText:` parameter no call site would pass is
the kind of unrequested abstraction the program forbids. Left alone, and recorded here so the
inconsistency is not lost: a pushed money screen reserves `dockHeight + 8` (148 pt) for a dock that
is 72. Fable's call whether that is worth its own item.

## Not in this lane

No purchase-path work, no `direct-orders` UI, no migration, no backend. The `direct-orders` launch
arg is used only to confirm this lane's two fixes do not regress under the flag C1 is building
behind.
