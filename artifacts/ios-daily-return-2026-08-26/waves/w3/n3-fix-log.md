# W3 · lane N3 — fix log

Fix round against `waves/w3/n3-review.md`, in `.codex/worktrees/agent-dr-w3-n3` on branch
`daily-return/w3-n3`. One MAJOR, no BLOCKING. The major is **changed, not rebutted**.

Gate: `ios-gate.sh build` → `** BUILD SUCCEEDED **`; `ios-gate.sh unit` → `✔ Test run with 1057
tests in 121 suites passed` (was 1052 — five new tests, all green, named below).

---

## MAJOR 1 — the tour rewrite reached the flag-off root · **CHANGED**

**The finding, restated:** `FirstLaunchTourModel.defaultSteps` was rewritten unconditionally.
`DailyRoomView` is the `.today` root on both roots, so B-8's new copy and the new `.todayRecord`
anchor reached flag-off users — contradicting B-8's own *Rollback* clause (*"the tour is gated by the
same `house-first` flag as the root it describes"*) and W3's acceptance line (*"flag off restores the
W2 root byte-for-byte"*). N3 disclosed it as a deliberate ruling; the reviewer elevated it because it
was taken unilaterally rather than escalated, and was sim-verified on the flag-on root only.

**What changed.** The tour is now branched on the same flag as the root, exactly as written.

| | |
|---|---|
| `FirstLaunchTourModel.defaultSteps` | unchanged content (B-8's rewrite) — now reached **only** on the house-first root |
| `FirstLaunchTourModel.preHouseFirstSteps` | **new** — the W2 list restored verbatim: "Daily Room" step 1, `.addToRoom` step 2, "Your profile" step 3 |
| `DailyRoomView.body` | `FirstLaunchTour(steps: coordinator.isHouseFirstRoot ? .defaultSteps : .preHouseFirstSteps, canAutoStart: …)` |

`isHouseFirstRoot` is `AppCoordinator`'s `let`, resolved once in its `init` from
`FeatureFlags.shared.isOn(.houseFirst)` after `PatinaApp` resolved the flags — the same seam
`ContentView` picks the root from. No live flag read was added to the view layer, and a test pins
that (`theTourIsGatedByTheSameFlagAsTheRootItDescribes` asserts the source does **not** contain
`FeatureFlags.shared.isOn(.houseFirst)`).

**Why changed rather than rebutted.** N3's product argument is sound and I am not overturning it on
the merits — every sentence B-8 replaces is genuinely also wrong on the flag-off root. But the
argument asks to amend two written contracts, and that is a ruling, not a lane decision. Shipping
compliant-with-spec and letting a ruling relax it is the reversible direction; shipping
non-compliant and seeking absolution is not. **The product argument is preserved below with its
exact revert, so Fable/Kody can still rule N3's way in one commit.**

**The one thing kept deliberately wrong.** `preHouseFirstSteps` still carries `.addToRoom`, which has
mounted in no production view since W2 retired `DailyProductCard` — so the flag-off tour drops step 2
and runs two while declaring three. That is the pre-existing W2 defect, and "byte-for-byte" means
keeping it. It is named in the source doc comment and pinned by a test rather than left to be read as
an oversight (`theFlagOffTourKeepsTheStepThatNeverMounts`). **Observed live, not just reasoned:** the
flag-off walk below shows `Step 1 of 2`.

**The `.todayRecord` mount stays unconditional** (`DailyRoomView`, `HouseRecordCard`). The record is
unflagged (R1), so its anchor must not move with a flag the record does not answer to. It is inert on
the flag-off root: `isShowingPopover(forAnchor:)` reads the step list, `preHouseFirstSteps` never
names `.todayRecord`, so the binding is never true and nothing draws. `registerAnchor` for an anchor
absent from `steps` only inserts into `mountedAnchors` — no step-list effect (verified in source at
`FirstLaunchTour.swift:549-556`). Pinned by `theRecordAnchorMountsOnceAndIsInertOnTheFlagOffRoot`.

### If Fable/Kody rules N3's way — the exact revert

One commit, three edits: delete `preHouseFirstSteps`, restore `DailyRoomView.body` to
`FirstLaunchTour(canAutoStart: coordinator.navigationPath.isEmpty)`, delete the four tests under
`// MARK: - The flag-off root's tour`. Then amend B-8's *Rollback* clause and W3's acceptance line to
say the tour copy is explicitly excluded from the byte-for-byte promise — the written contract should
match what ships either way.

### New tests (5, all green)

| Test | What it pins |
|---|---|
| `theFlagOffRootKeepsTheTourItShipped` | all three flag-off steps — anchors, surface keys, headings, bodies — verbatim W2 |
| `theTwoStepListsAreActuallyDifferentCopy` | the branch is not wired to one array twice; surface keys **do** match (same three Sanity docs) |
| `theFlagOffTourKeepsTheStepThatNeverMounts` | `.addToRoom` mounts zero times, and the flag-off list still carries it — honesty, C5 |
| `theTourIsGatedByTheSameFlagAsTheRootItDescribes` | the call site branches on `coordinator.isHouseFirstRoot`, and no live `FeatureFlags` read |
| `theRecordAnchorMountsOnceAndIsInertOnTheFlagOffRoot` | `.todayRecord` absent from the flag-off list; popover binding never true there |

`everyDefaultStepAnchorHasExactlyOneProductionMount` is unchanged and still green — it scopes to
`defaultSteps`, and its doc comment now says so and points at the flag-off counterpart, so it cannot
be misread as covering both lists.

---

## The flag-off spot-check the review asked for — done, with a caveat that matters

Simulator iPhone 17 Pro `973D1724-90BF-4A0A-B02D-481D561547B3`, fresh install each run (uninstall +
install clears tour state), guest walk.

- **`shots/w3-n3-12-tour-step1-flagoff-daily-room.png`** — launched with **no** `-PatinaFlags`.
  Accessibility label: `Step 1 of 2, Welcome to Patina, This is your Daily Room — picks and stories
  chosen for your space.` The orb (`companion.bubble`, 64 pt) and the 120 pt Hearth reservation are
  both present — the W2 root, unchanged. **This is the shot the review said did not exist.**
- **`shots/w3-n3-13-tour-step1-flagon-sanity-served.png`** — launched with `-PatinaFlags house-first`.
  The four-tab bar renders; the tour runs; no crash, correct step math.

**Caveat, stated plainly: the shots cannot discriminate which fallback list was chosen.** The flag-on
shot shows the *Daily Room* sentence too. That is not the branch failing — it is review finding #3
landing, and this run **confirms it empirically for the first time**:

- Both lists are compiled into the shipped binary (`strings Patina.debug.dylib`: "what moved in your
  house" ×1, "picks and stories chosen for your space" ×1, "Anything waiting on you lands here" ×1,
  "they follow you everywhere" ×1, "today-record" ×1), so the build under test is current.
- `FirstLaunchTourPopoverCard.resolvedBody` is `loaded?.body ?? step.fallback?.body`. On the flag-on
  root the fallback is "This is Today — …". The screen showed the Daily Room sentence. On that root
  that string can only have come from `loaded` — i.e. **Sanity**.
- Both lists deliberately share the same three surface keys, so Sanity serves identical copy to both
  roots. Until the three documents in `n3-sanity-copy.md` are edited, **no shot of either root can
  show B-8's copy, and no user sees it either.**

What would discriminate the two lists at runtime: a signed-in client with a non-empty record on the
flag-on root, where step 2 mounts on the record and the caption reads `Step 2 of 3` while the
flag-off root can only ever read `of 2`. That needs a real account and belongs to Kody's walk. The
branch itself is proven deterministically by the five unit tests above, including a source pin of the
exact call site.

**This sharpens finding #3 from a pre-ship gate into a release blocker for B-8:** the rewritten copy
is currently unreachable on every root. `waves/w3/n3-sanity-copy.md` has the exact edits, keys
unchanged.

---

## The other findings

- **#2 (minor, step 3 anchored on the header pill, not the Studio tab item)** — no change. The
  reviewer confirmed N3's reasoning and scoped it out; it needs `HouseFirstRoot.swift` +
  `PatinaTabBar.swift`, N1's closed files. Tracked for whoever owns them.
- **#3 (Sanity copy stale)** — no code change possible; sharpened with live evidence above.
- **#4, #5, #6 (informational: cross-lane edits, unowned `DailyRoomView.swift`, the pre-existing
  `canAutoStart` defect)** — reviewed as correct/disclosed, no change. Worth noting the
  `canAutoStart` defect was **observed again** this round: on the flag-on root the tour auto-started
  while the **Pieces** tab was on screen (`w3-n3-13`), exactly N1 §3c. Still N1's file, still not
  fixed here.

---

## Gate

| Tier | Result |
|---|---|
| `ios-gate.sh build` | `** BUILD SUCCEEDED **` |
| `ios-gate.sh unit` | `✔ Test run with 1057 tests in 121 suites passed` (was 1052) |
| `ios-gate.sh lint-delta` | 0 new warnings in this round's files |

`lint-delta` first reported `FirstLaunchTour.swift: 4 → 5` — a `trailing_comma` on the new
`preHouseFirstSteps` literal, mirroring the pre-existing one on `defaultSteps`. Removed; the file is
back to its prior 4 warnings, and build + unit re-run green after the edit.

`lint-delta` still reports `PatinaTabBar.swift: 0 → 1` and `HouseFirstRootTests.swift: 0 → 2`. Both
are N1's files, introduced by `4a92058b5` / `c8d5d286b` earlier on this branch
(`git log -- <file>`), untouched by this round's commit, and left for N1's owner.

Commit `8f1501229`, three files, exactly the pathspec staged. Worktree clean.
