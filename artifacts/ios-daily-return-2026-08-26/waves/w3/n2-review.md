# W3 · lane N2 — review (Pieces tab, Saved door)

Reviewer: separate context, read-only. Checked `git -C .codex/worktrees/agent-dr-w3-n2 diff
daily-return/w3-n1...HEAD` (4 commits, 9 files, +511/-23) against `build-plan.md` §W3/N2,
`direction-b.md` §8 B-7 (a)/(b), §2, §11 M9 + `mock/fragments/b-M9.html`/`.sheet.html`,
`build-plan-critique.md` B7/B8/M18, `n1-notes.md` §1b/§1c/§1d, `n2-tasks.md`, `n2-notes.md`, and the
report's claims against the code, the shot ledger (`research/01-shot-ledger.md` `## w3-n2`), and the
worktree's git history/status.

## Verdict

Clean pass. No blocking or major findings. The diff matches the task list and the spec precisely,
the tests exercise real behavior rather than tautologies, four commits are pathspec-scoped with no
stray files, and the report's every checkable claim (server-side `p_category` via `match_events`
row 72, the AX labels, the flag-off pixel/tree equivalence, the environment-scoping of the tab-root
seam) verified against the code or the ledger. The lane's self-reported gaps (M9's rugs chip, the
two unbuilt analytics events, M9b's per-row note, signed-in-tier and dark-mode coverage) are honest
and correctly scoped as out-of-brief rather than silently dropped.

## Findings

None blocking or major.

**Minor / confidence: high — `isTabRoot` is used as two unrelated names in the same file set.**
`RouteTabTable.isTabRoot(_ route: AppRoute) -> Bool` (a static function over `AppRoute`, pre-existing,
not touched by N2) and the new `EnvironmentValues.isTabRoot` (a `Bool` the tab-root wrapper sets) are
different types in different namespaces and do not collide at compile time — confirmed by the green
build and by `PiecesTabTests.savedOpensOnThePiecesTabAndComesBack` calling both
(`RouteTabTable.isTabRoot(.table)` and, implicitly via the view layer, the environment key) in the
same suite. It is a readability trap for the next person grepping "isTabRoot," not a defect. No
action needed; noting it because a future N1/steward edit near either name should double-check which
one it means.

**Minor / confidence: medium — the environment-scoping trick this lane depends on is easy to break
silently.** `HouseFirstRoot.stack(for:)` chains `.navigationDestination(for: AppRoute.self)` onto the
result of `root(for: tab)`, i.e. *outside* the `.environment(\.isTabRoot, true)` that `SpacesTabRoot`/
`PiecesTabRoot` set two levels down inside their own bodies. That ordering is exactly why a pushed
`YourSpacesView` (via `.navigationDestination`) does not inherit `isTabRoot = true` from its tab
root and keeps its back chevron — verified in the code and in shot `w3-n2-03` (the pushed Saved
screen draws `chevron.left`/`Back`) and `w3-n2-08` (the flag-off browse grid, reached by a different
path entirely, also keeps it). If a future change moved `.navigationDestination` inside
`SpacesTabRoot`/`PiecesTabRoot` instead of leaving it on `HouseFirstRoot.stack(for:)`, every pushed
screen under that tab would silently lose its back chevron — a real SwiftUI environment-inheritance
footgun, not a defect in this diff. Nothing to fix now; worth a one-line comment on
`.navigationDestination` in `HouseFirstRoot.swift` if the steward wants to pre-empt it, but that file
is not N2's to edit.

## Confirmed against spec

- **B-7 (a)** — `PatinaTab.canonicalName`: `.today` = "Today", `.spaces` = "Your Spaces", `.pieces` =
  "Browse pieces", `.studio` = "Your Studio" (pre-existing, N1's file, not touched). N2's three
  wrappers read this via `.tabRoot(tab)` → `.navigationTitle(tab.canonicalName)`, never re-typed —
  `TabRootTitleTests.theWrappersReadTheirTitleFromPatinaTabRatherThanRetypingIt` asserts the literal
  strings are absent from `TabRoot.swift`. Matches.
- **B-7 (b)** — `SavedDoorRow.accessibilityLabel(count:)` builds `"Saved, …"`, never
  `PatinaTab.pieces.canonicalName`; `PiecesTabTests.theRowCarriesItsOwnAccessibilityLabel` asserts
  inequality for counts 0/1/3. M9's copy row (`Saved` / `Nothing yet` / `N piece(s)`) matches
  `b-M9.sheet.html`'s "Copy" and "States" rows exactly, including the zero-count draw (F14).
- **M9 mock geometry** — full-width row, gutter, radius 14, serif title + mono meta + chevron,
  `minHeight: 44` all present in `SavedDoorRow.swift`; N2's own commentary (task list §3) explains the
  24 pt gutter choice over the mock's 20 pt as "the screen's own gutter, every other block on this
  screen is 24" — a reasonable, disclosed deviation from a mock-scale figure, not a spec miss.
- **Server-side-only filtering** — `filteredProducts` is now `products` unconditionally;
  `BrowseGridContractTests.theSubtitleCountsWhatTheServerReturned` and
  `PiecesTabTests.theGridShowsEverythingTheServerReturnedForTheActiveChip` both exercise the removed
  double-filter with real fixtures (not source-grep alone). The claim that this was "already sent" by
  W1b/SP-02 is correct: `ProductAPIClient.swift:56` (`if let category { params["p_category"] =
  category.rawValue }`) predates this diff and is untouched.
- **Flag-off root untouched** — `git diff --stat` shows `ContentView.swift` absent from the changed
  file list entirely; the only edits outside test files and the two new views are the 2-line chevron
  gate in `PatinaScreenChrome.swift` (defaults to today's behavior when `isTabRoot` is unset) and the
  `root(for:)` swap in `HouseFirstRoot.swift`, which only exists on the flag-on branch. Shot
  `w3-n2-08` confirms pixel-for-pixel: chevron back, no `Pieces.SavedDoorRow` node, chips at the same
  y-offset the Saved row occupies on the flag-on root.
- **Canon / C8 / Companion** — `RouteTabTable.swift`, `PatinaTab.swift`, `Features/Companion/**` are
  all absent from the diff, matching the task list's "not touched" list; `n2-notes.md` §4 states the
  Companion rows for `.table`/`.emergence` were verified live rather than assumed.
- **The one edit inside N1's file** — `HouseFirstRoot.swift`'s `root(for:)` swap (+5/-16) is exactly
  what `n1-notes.md` §1c invited ("ping N1/the steward rather than editing it yourself" — N1 had
  already reported and its worktree was not live), and is recorded for the steward in `n2-notes.md`
  §1. No dispatcher, bar, Companion slot, mount order, or `onChange` touched, matching both the report
  and a direct read of the diff.
- **Tests are real, not tautological.** `PiecesTabTests` and `BrowseGridContractTests` construct
  `Product`/`RecommendationsViewModel` fixtures and assert on computed output (`filteredProducts`,
  `headerSubtitle`, `SavedDoorRow.meta/accessibilityLabel`), not just string-matching the source
  they're supposed to verify — the `SourcePin` assertions (`TabRootTitleTests`,
  `nothingFiltersTheGridOnTheActiveChipInTheClient`) are the minority and are used specifically to pin
  negative claims (a literal is *not* re-typed, a filter line is *gone*) that a runtime test can't
  cheaply express.
- **Commit hygiene** — 4 pathspec commits, each named for what it does; `git status --porcelain apps/`
  reported clean by the lane at report time; no `git add -A` pattern visible in the diff (no
  incidental files).

## Not independently re-verified (accepted on the lane's evidence)

- Live simulator AX-tree captures (labels, hints, y-offsets) — taken from the shot ledger and the
  report, not re-run in this review.
- The `match_events` row 72 / Kong log server-side proof — taken from the ledger; plausible and
  consistent with the migration text the lane cites (`00244_aesthete_match_rpc.sql:1016`), not
  re-queried here.
- Dark-mode/XXL coverage beyond the single frame the lane itself flags as partial (n2-notes §6) — the
  lane's own disclosure is accurate: only `w3-n2-09` is dark+XXL, and it is a `simctl` capture per the
  documented MCP-screenshot light-render trap.

## Cross-lane items N2 raised, not N2's to fix (unchanged by this review)

- `Features/Rooms/**` — `YourSpacesView`'s `emptyState` branch has no header, so the canonical name
  "Your Spaces" is on the nav-title but not on glass at zero rooms (`n2-notes.md` §2, shot `w3-n2-05`).
  Confirmed real (verified in `YourSpacesView.swift`'s branch structure) and correctly left unowned —
  it's outside N2's file set per `n2-tasks.md` §0b.
- `PatinaTabBar.swift` XXL label collision (N1's file) and the Companion `.minimal` orb overlap
  (N3's, per n1-notes §2a) — both re-confirmed as pre-existing/other-lane issues, not introduced or
  worsened by this diff.
