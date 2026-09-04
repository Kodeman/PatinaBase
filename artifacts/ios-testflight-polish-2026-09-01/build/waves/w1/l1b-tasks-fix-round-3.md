# W1 · L1-B — task list, **fix round 3** (review `RL1B3-01` … `RL1B3-12`)

Lane: **L1-B Data, persistence, resilience** · worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-ff-w1-l1b` · branch `first-flight/w1-l1b` ·
tip at start `a1f592696`.

Format: superpowers `writing-plans` — failing test → run → implement → run → pathspec commit.
Rounds 1–3 are in `l1b-tasks.md`; this file carries **only** the round-4 fix round.

---

## Standing lines

### 1. Simulator

```bash
export IOS_GATE_UDID=1D595108-E73C-47D6-A832-184C082386E4   # ff-w1-l1b
```

Launch line for every relaunch: `-DeploymentTarget local` and **nothing else** (D1a — `house-first`
defaults ON). HID preflight before trusting input. Screenshots only via
`xcrun simctl io 1D595108-E73C-47D6-A832-184C082386E4 screenshot`.

### 2. The VISION check

*Name any fix in this round that would add tab / zone / dashboard UI beyond D1's ruling, shadows,
red/green status, badges, engagement optimisation or the word "AI", and why it survives.*

Three candidates, all survive:

| task | why it looks like a §6 problem | why it survives |
|---|---|---|
| `F4-04` (`RL1B3-04`) | It is *about* a badge — the green verdict capsule on a piece. | The change **removes** a verdict rather than adding one: `matchVerdict` is `nil` for an unscored piece, so the guarded call site draws **nothing**. Fewer capsules, and no green over an absence. |
| `F4-02` (`RL1B3-02`) | A launch "stall message" is one step from a red error state. | It is one sentence in the app's voice — `"We couldn’t reach Patina — try again."` — in `Text.secondary`, no colour, no icon, no code. This task only changes **when** it appears (6.5 s, before the coordinator's 8 s forced transition), not what it is. |
| `F4-10` (`RL1B3-10`) | Widening `showsLeaveControl` puts one more control on five more screens. | It is the same "Not now" text button GAP4-02 already ruled in, on the steps that today have **no** way out. It adds no chrome, no bar, no zone. |

Nothing in this round adds a tab, a zone, a dashboard, a shadow, a red/green state, a new badge, an
engagement mechanic, or the word "AI".

### 3. The notes I must apply

Every `build/waves/w1/*-notes.md` addressed to L1-B, re-read at the top of this round:

| # | Source | State |
|---|---|---|
| N1–N13 | `l1-b-notes.md`, rounds 1–3 | **unchanged from `l1b-tasks.md`** — all applied or recorded open there. Re-verified this round: `B-L1A-2` (`C9-08`) and `D→B-2`/`D→B-3` (`C3-01`/`C3-15`) are still the only open ones, both blocked on symbols that exist on another lane's branch. |
| N14 | `l1-b-notes.md` **From L1-E — round 4** · `Note E4-L1B-1` (`A-06`, `StyleResponseModel.swift:99` `"Let’s Discuss"`) | **applied** in round 3 (`a556ed576`); re-verified by grep this round — `:99` reads `return "Let’s Discuss"`. |
| N15 | `build/waves/w1/l1-e-copy-deck.md` | **exists**; re-read this round. Every row under §"L1-B applies" (`C4-09`, `C5-16` ×4, `C5-09`, `C5-10`) plus the two note-routed rows (`C4-08`'s `RoomsAPIError` half, `C5-11`'s headline period) was applied in `a7744b9c3` / `a556ed576` and re-verified. **No new L1-B row has appeared in the deck since round 3.** |
| N16 | `l1-b-notes.md` **From L1-F** `L1F→B-4` — *"`LaunchWatchdog.swift` is on `first-flight/w1-l1f` too, byte-identical"* | **Now false, on purpose.** `F4-02` adds `splashSurfaceDeadline` to that file. Answered as note **O17**. |

### 4. The notes I will send

Written to `build/waves/w1/l1b-notes-out.md` **and appended verbatim to each target lane's
`<target>-notes.md`**.

| # | To | Finding | What |
|---|---|---|---|
| **O11 (revised)** | steward (merge 1) | `A-34`, `C-11` | the verdict pill now guards on `product.matchVerdict` (optional), not `hasMatchScore` — a two-line `if let` at each of the two call sites |
| **O16** | **L1-E** | `RL1B3-06`, `RL1B3-07` | ratify the shipped `LocalStoreRecoveryNotice.body`, and five strings that shipped after `O13` with no deck row |
| **O17** | **L1-F** | `C1-19` | `LaunchWatchdog.swift` is no longer byte-identical across the two branches: `stallDeadline` is unchanged at 8 s (the coordinator's forced `.auth`), and the splash now surfaces at the new `splashSurfaceDeadline` = 6.5 s. Take L1-B's copy at merge 4. |
| **S7** | steward | `RL1B3-03`, `RL1B3-08` | §S6 corrected: the applies table gains **O5**, the unowned-file table goes from five rows to **seven**, and the steward's own already-recorded routing of `C-L1B-1`/`-3`/`-4` to L1-B-after-merge is folded in so ownership and scheduling read as one decision |

---

## Coverage — every review row in this round

| review id | severity | task | test that pins it |
|---|---|---|---|
| `RL1B3-01` | blocker | **F4-01** | `ScanFallbackEntryTests.theManualEntryFieldsStartEmpty`, `.manualSaveIsDisabledUntilBothDimensionsAreEntered`, `.theManualDimensionFieldsCarryAPlaceholder` |
| `RL1B3-02` | major | **F4-02** | `LaunchWatchdogTests.theSplashSpeaksBeforeTheCoordinatorForcesAuth` (+ three rewritten) |
| `RL1B3-03` | major | **F4-03** | `LoadStateHonestyTests.theSpacesErrorBranchIsStillOwed` / `.theStudioHubStalenessLineIsStillOwed`, `AttentionCountTests.theBellStillOwesItsKnownFlag`, `MatchScoreResolverTests.theVerdictPillsAreStillUnguarded` — four tripwires, none `isIntermittent` |
| `RL1B3-04` | major | **F4-04** | `MatchScoreResolverTests.anUnscoredPieceHasNoVerdictAtAll` |
| `RL1B3-05` | major | **F4-05** | `LoadStateHonestyTests.aSlowLoadMayNotClearAFreshBundle` |
| `RL1B3-06` | minor | **F4-06** | note **O16** to L1-E (no code change; see the task for why) |
| `RL1B3-07` | minor | **F4-06** | note **O16** to L1-E |
| `RL1B3-08` | minor | **F4-03** | ledger row (§S6, note **S7**) |
| `RL1B3-09` | minor | **F4-07** | `RoomLifecycleTests.aMirroredInsertBumpsTheLocalSignal` |
| `RL1B3-10` | minor | **F4-08** | `ScanFallbackEntryTests.theHostShowsALeaveControlOnEveryStepThatHasNoOtherWayOut` |
| `RL1B3-11` | minor | **F4-09** | `RoomLifecycleTests.aServerThatNoLongerHasTheRowRetiresTheTombstone` |
| `RL1B3-12` | minor | **F4-10** | `TelemetryQueueBoundsTests.theTestSeamsAreDebugOnly` |

---

## F4-01 — `RL1B3-01` · GAP4-03's developer defaults on the second room door

**Failing test.** In `PatinaTests/ScanFallbackEntryTests.swift`, three tests mirroring the
`ScanFallbackEntryView` trio onto `Patina/Features/Rooms/Views/ManualRoomEntryView.swift` through
`SourcePin`, plus a direct call of the new static gate.

**Run.** `apps/mobile/Patina/scripts/ios-gate.sh unit` — red.

**Implement.** `ManualRoomEntryView.swift`:
`lengthFeet` / `widthFeet` start `""`; `dimensionField` gains a real placeholder (`TextField(label, …)`,
which it already has); a `static func dimensionsAreValid(length:width:)` and a private `isValid`;
`.disabled(!isValid)` plus a muted fill on Save Room.

**Run.** unit — green.

**Commit.** `apps/mobile/Patina/Patina/Features/Rooms/Views/ManualRoomEntryView.swift`
`apps/mobile/Patina/PatinaTests/ScanFallbackEntryTests.swift`

## F4-02 — `RL1B3-02` · the stall message that could never render

**Failing test.** `LaunchWatchdogTests.theSplashSpeaksBeforeTheCoordinatorForcesAuth` —
`splashSurfaceDeadline < stallDeadline`, by at least a second.

**Implement.** `LaunchWatchdog.splashSurfaceDeadline = stallDeadline - 1.5`;
`shouldSurfaceStall` compares against it; `SplashView`'s `.task` sleeps it. `stallDeadline` is
untouched — it is L1-F's forced-`.auth` deadline and must stay 8 s.

**Commit.** `Patina/Core/State/LaunchWatchdog.swift` `Patina/Features/Splash/Views/SplashView.swift`
`PatinaTests/LaunchWatchdogTests.swift`

## F4-03 — `RL1B3-03` + `RL1B3-08` · four unapplied notes with no tripwire, and a ledger that undercounts

**Failing test.** Four `withKnownIssue` tripwires (O5, O7, O11, O12), written the same way as the
five that already exist — not `isIntermittent`, so each goes **red** the moment its note lands, which
is the signal to delete the block.

**Implement.** The tripwires, then §S6 in `l1b-notes-out.md`: add the O5 row, correct the
unowned-file table to seven, fold in the steward's routing of `C-L1B-1`/`-3`/`-4`.

**Commit.** the three test files, then a docs commit for the notes.

## F4-04 — `RL1B3-04` · a green capsule announcing the absence of a verdict

**Failing test.** `MatchScoreResolverTests.anUnscoredPieceHasNoVerdictAtAll`.

**Implement.** `ProductModel.matchVerdict: String?` — `nil` when `!hasMatchScore`, otherwise
`matchLabel`. `matchLabel` itself is unchanged: it is the correct **spoken** string
(`RecommendationsView`'s accessibility label says "Not scored yet", which is right) and L1-E ratified
all four bands in `E3-L1B-3`. O11 is revised to point the two pills at `matchVerdict`.

**Commit.** `Patina/Core/Models/ProductModel.swift` `PatinaTests/MatchScoreResolverTests.swift`

## F4-05 — `RL1B3-05` · two concurrent loads, and the slow one wins

**Failing test.** `LoadStateHonestyTests.aSlowLoadMayNotClearAFreshBundle`.

**Implement.** `ProposalDetailViewModel.isInFlight`, claimed before the first `await`, same shape as
`RoomSyncCoordinator.inFlight` and `DailyRoomBatchQueue.isFlushing`.

**Commit.** `Patina/Features/Proposals/ViewModels/ProposalsViewModel.swift`
`PatinaTests/LoadStateHonestyTests.swift`

## F4-06 — `RL1B3-06` + `RL1B3-07` · the deck and the app disagree, and five strings have no row

**No code change.** Note **O16** to L1-E: ratify the shipped recovery-notice body (it names what was
lost, which the deck's version does not), and rule on five strings that arrived after `O13`.

**Commit.** the notes files.

## F4-07 — `RL1B3-09` · Studio follows a local delete but not a server one

**Failing test.** `RoomLifecycleTests.aMirroredInsertBumpsTheLocalSignal`.

**Implement.** `LocalRoomSignal.shared.changed()` beside `revision += 1` in `RoomSyncCoordinator.apply`.

**Commit.** `Patina/Features/Rooms/RoomSyncCoordinator.swift` `PatinaTests/RoomLifecycleTests.swift`

## F4-08 — `RL1B3-10` · GAP4-02's exit covers two steps of eight

**Failing test.** `ScanFallbackEntryTests.theHostShowsALeaveControlOnEveryStepThatHasNoOtherWayOut`.

**Implement.** Invert `showsLeaveControl`: shown on every step **except** the ones that carry their
own explicit way out. Today that is `.savedConfirmation` alone (its "Not right now" calls `onDone`).
Inverting means a step added later gets the control by default, which is the failure mode GAP4-02
actually describes.

**Commit.** `Patina/Features/RoomScan/Views/QuietConversationFlowHost.swift`
`PatinaTests/ScanFallbackEntryTests.swift`

## F4-09 — `RL1B3-11` · a tombstone with nothing left to guard

**Failing test.** `RoomLifecycleTests.aServerThatNoLongerHasTheRowRetiresTheTombstone`.

**Implement.** In `apply`, clear any tombstone absent from this owner's server rows. Safe across
accounts because `LocalStoreReset` already calls `RoomTombstones.clearAll()` on the account-change
wipe, before the new account's first reconcile.

**Commit.** `Patina/Features/Rooms/RoomSyncCoordinator.swift` `PatinaTests/RoomLifecycleTests.swift`

## F4-10 — `RL1B3-12` · test seams in the shipping actor

**Failing test.** `TelemetryQueueBoundsTests.theTestSeamsAreDebugOnly`.

**Implement.** `#if DEBUG` around the detached initialiser, the four inspectors, `writes`, and its
one increment in `persistIfChanged`.

**Commit.** `Patina/Services/Analytics/DailyRoomBatchQueue.swift`
`PatinaTests/TelemetryQueueBoundsTests.swift`

---

## Gate, at the end, on the committed tip

```bash
export IOS_GATE_UDID=1D595108-E73C-47D6-A832-184C082386E4
apps/mobile/Patina/scripts/ios-gate.sh build
apps/mobile/Patina/scripts/ios-gate.sh release
apps/mobile/Patina/scripts/ios-gate.sh unit
apps/mobile/Patina/scripts/ios-gate.sh lint-delta main
```

Self-check on the clone: launch with `-DeploymentTarget local`, sign in as
`client@patina.dev` / `password123`, screenshot every changed screen before and after into
`artifacts/ios-testflight-polish-2026-09-01/shots/w1-l1b-r4/` with a `ledger.md`.
