# W1 · L1-B — task list, **fix round 5** (dispatch carried review `RL1B-01` … `RL1B-21`)

Lane: **L1-B Data, persistence, resilience** · worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-ff-w1-l1b` · branch `first-flight/w1-l1b` ·
tip at start **`47bbffe3b`**.

Format: superpowers `writing-plans` — failing test → run → implement → run → pathspec commit.
Rounds 1–3 are in `l1b-tasks.md`; round 4 is in `l1b-tasks-fix-round-3.md`; this file is round 5.

---

## 0. What this round actually found, before anything else

**The dispatch handed this lane the *round-one* review.** The prior-lane-report block in the brief is
round 1's report (tip `af9c46949`, 12 commits, gate green at 1656 tests) and the attached review is
`RL1B-01` … `RL1B-21`, written against that same tip. The branch is twenty commits past it: rounds 2,
3 and 4 answered `RL1B-01`…`-21`, then `RL1B2-01`…`-18`, then `RL1B3-01`…`-12`.

So round 5 is **not** a fix round against new findings. It is:

1. an **independent re-verification** of all twenty-one rows against the tip, with evidence (§Coverage);
2. the **one thing that is genuinely wrong right now** — `ios-gate.sh unit` is **red** on the tip
   (§F5-01), which no prior round reported.

Nothing else in the twenty-one rows survives verification as open.

---

## 1. Simulator

```bash
export IOS_GATE_UDID=1D595108-E73C-47D6-A832-184C082386E4   # ff-w1-l1b
```

Launch line for every relaunch: `-DeploymentTarget local` and **nothing else** (D1a — `house-first`
defaults ON). HID preflight before trusting input. Screenshots only via
`xcrun simctl io 1D595108-E73C-47D6-A832-184C082386E4 screenshot`.

## 2. The VISION check

*Name any fix in this round that would add tab / zone / dashboard UI beyond D1's ruling, shadows,
red/green status, badges, engagement optimisation or the word "AI", and why it survives.*

**None.** Round 5 changes no view, no string and no token. Its only candidate change (`F5-01`) is a
test-harness budget in `PatinaTests/`, which ships in no binary a tester installs. There is nothing
to weigh against §6.

## 3. The notes I must apply

Every `build/waves/w1/*-notes.md` addressed to L1-B, re-read at the top of this round.

| # | Source | State |
|---|---|---|
| N1–N16 | `l1-b-notes.md`, rounds 1–4 | **unchanged**. `l1-b-notes.md` last changed `2026-09-03 01:01`, before round 4's own notes pass (`05:58`). No note has arrived since round 4 read them. Verified by mtime, not by assumption. |
| N17 | `build/waves/w1/l1-e-copy-deck.md` | **exists**; last changed `2026-09-02 18:06` — older than round 4, which applied and re-verified every `L1-B applies` row. **No new L1-B row has appeared.** Re-read this round; nothing to apply. |
| — | still open, both blocked on another branch's symbols | `B-L1A-2` (`C9-08`, five number pads) and the merge-3 resolution of `C3-01`/`C3-15`. Both are in §S6's table with a named owner and a merge position. Unchanged. |

## 4. The notes I will send

| # | To | What |
|---|---|---|
| **S8** | steward | `S4`'s ruling request, re-filed with a second and much harder data point: the tier's two wall-clock pollers put `ios-gate.sh unit` **red** at load average 790, and green at load average 3 — same tip, same simulator, no code change between the runs. §S8 gives the two runs verbatim and asks for the ruling S4 asked for on 2026-09-03 00:10 and has not had. |

Written to `l1b-notes-out.md` and appended to `steward.md`'s inbox section.

---

## Coverage — every row of the review this dispatch carried

Claim level per row: **code** = verified in the source on this tip · **test** = a suite pins it ·
**note** = the half that lives in another lane's file, routed with exact final text and a tripwire ·
**declined** = written reason, in `l1b-tasks.md`'s Declined table.

| review id | sev | state on tip `47bbffe3b` | evidence |
|---|---|---|---|
| `RL1B-01` | blocker | **closed** (round 2, `02ecf0718`) | `RoomStore.swift:28` is `self.isSharedStore = PersistenceController.isSharedContext(context)` — the singleton is never forced from `init`. `PersistenceMigrationTests` ×2. |
| `RL1B-02` | blocker | **closed** (rounds 2–3, `3cc80ed4c`, `20007c623`) | `RoomStore.swift:310` records a `RoomTombstones` row; `RoomSyncCoordinator.swift:264` retries `api.deleteRoom(id:)`, `:300` passes `tombstoned:` into the merge, `:352` retires a tombstone the server no longer has. `RoomLifecycleTests` ×7. |
| `RL1B-03` | major | **closed** (round 2, `498aad450`; extended round 4, `a1f592696`) | `grep -rn isIntermittent PatinaTests/` returns **eight comment lines and zero call sites**. The nine ledger rows are hard `withKnownIssue` — the tier run below records 14 known issues, each one an open note. |
| `RL1B-04` | major | **half, by design** | `LaunchWatchdog.stallDeadline = 8` (L1-F's forced `.auth`), `splashSurfaceDeadline = 6.5`. `C1-18`'s stale pin was dropped per note `L1F→B-2`. The coordinator half is **O1**/**O17** to L1-F, merge 4. Coverage table says half, not closed. |
| `RL1B-05` | major | **closed as routing** | §S6 of `l1b-notes-out.md` — seven rows, each with a merge position, an owner and a named tripwire; `C3-01`/`C3-15` shown by `git show first-flight/w1-l1d:…` to need no apply task, only the merge-3 conflict rule. |
| `RL1B-06` | major | **closed as claim level** | table reads `A-81 — pinned, not changed`; the behaviour half is **O7** to L1-C, tripwire `theBellStillOwesItsKnownFlag` (ran, 1 known issue). |
| `RL1B-07` | major | **closed as claim level** | `R-02` recorded 0 % in-branch; the fix is **O6** to L1-F. |
| `RL1B-08` | major | **closed as note** | `StudioHubViewModel.stalenessLine` exists; **O12** carries the exact `StudioHubView.swift` block; tripwire `theStudioHubStalenessLineIsStillOwed` (ran, 1 known issue). |
| `RL1B-09` | major | **closed as note** | `ProductModel.matchVerdict: String?` (`:222`) returns `nil` unscored; the two pills are in **L1-C's** files, routed as **O11 revised** with final text; tripwire `theVerdictPillsAreStillUnguarded` ×2 (ran, 2 known issues). The five strings went to L1-E as **O13**/**O16**. |
| `RL1B-10` | minor | **declined, in writing** | `l1b-tasks.md` Declined table: `A-34`'s `where` is Browse pieces; the band vocabulary does not fit a 20 pt two-cell `HStack`; shortening it is L1-E's deck. Raised as a W2 row in **O13**. |
| `RL1B-11` | minor | **closed** (round 3, `21a403ae4`) | `SavedItem.swift:133` — `makerName: product.resolvedMakerName ?? product.makerName`. `ProductDecodingTests` ×2. |
| `RL1B-12` | minor | **closed** (round 2, `3cc80ed4c`) | `RoomSyncCoordinator.swift:219` — the `resolveUserId()` arm sets `lastLoadFailed`; the `!inFlight` and `isDue` arms deliberately do not. `LoadStateHonestyTests.aFailedOwnerLookupIsAlsoAFailure`. |
| `RL1B-13` | minor | **closed** (round 3, `ec2200f48`) | `DailyRoomBatchQueue.swift:54,148-150` — `isFlushing`, claimed before the POST. `TelemetryQueueBoundsTests.twoConcurrentFlushesPostEachEventExactlyOnce`. |
| `RL1B-14` | minor | **closed as routing** | §S6's seven-file table (was five; corrected in round 4) — every unowned path L1-B edited, with why, awaiting a §5.9 ruling. |
| `RL1B-15` | minor | **declined, then partly done anyway** | Declined with a written reason in round 2 (all five `internal`, `@testable`-only). Round 4 went further for the one that mattered: `DailyRoomBatchQueue.swift:84,190` are now `#if DEBUG`. |
| `RL1B-16` | minor | **closed** (round 3, `6578b5dfb`) | `LocalStoreOwnership.swift:44-48` takes `isAuthStateReady`; `ProfileViewModel`'s counts are revision-derived. `AccountIsolationTests` ×2. |
| `RL1B-17` | minor | **closed** (round 3, `21a403ae4`) | `grep -n PatinaLog Features/RoomScan/Shared/Components/ScanUploadFailureCopy.swift` → **no match**; the copy function is pure. |
| `RL1B-18` | minor | **closed as claim level** | `GAP4-25` is recorded compile-green + source-pinned, never sim-verified; the Rescan tap sits on the R1 device pass beside `D-17`. |
| `RL1B-19` | minor | **closed** (round 2, `af9c46949`+) | `RefreshableSurfacesTests.closure(after:in:)` brace-matches with a depth counter; the naive first-`}` split is gone. |
| `RL1B-20` | minor | **closed as report line** | `APIConfiguration.resourceTimeout = 300` with the storage-upload reason; the deviation from the finding's 120 s is a report line for Fable, not a source comment alone. |
| `RL1B-21` | minor | **closed** (round 2, `02ecf0718`) | the mechanism behind `RL1B-01`; `RoomStore` no longer constructs `PersistenceController.shared`. |

**Result: 21 of 21 addressed — 14 closed in code, 4 closed as routed notes with tripwires, 2 declined
in writing, 1 (`RL1B-04`) half by design with the other half owned and scheduled.** No row from this
review required a code change in round 5.

---

## F5-01 — the one live defect: `ios-gate.sh unit` is red on the tip

**Symptom.** On tip `47bbffe3b`, unchanged:

```
UNIT_RC=65
✘ Test run with 1703 tests in 182 suites failed after 141.873 seconds with 21 issues (including 14 known issues).
✘ Suite OrderHandoffTests failed after 124.349 seconds with 6 issues.
✘ Suite CompanionCoachingModelTests failed after 127.049 seconds with 1 issue.
```

**Hypothesis, and why it is not a regression.** Every failing assertion is behind a **wall-clock**
budget, and the three failing tests each burned ~57–60 s of wall time to reach a budget measured in
milliseconds:

- `OrderHandoffTests.waitFor` polls a `@MainActor` condition; `handoff()` gives the machine
  `pollInterval: 5 ms`, `pollDeadline: 60 ms`.
- `CompanionCoachingModelTests.introGate_freshUser_pollsUntilTourResolves` races a
  `Task.sleep(for: .milliseconds(50))` against the model's own `introGateTimeout = .seconds(5)`.

`uptime` during the run: **`load averages: 476.17 801.76 607.69`**. Five peer lanes are compiling
into their own DerivedData on the same machine. A 50 ms sleep that returns after six seconds loses a
five-second race, and a main-actor condition cannot become true while the main actor is somebody
else's. Commit `8a9532565` (round 3) recorded exactly this shape for `OrderHandoffTests` and named
`CompanionCoachingModelTests` as the second poller the lane deliberately did **not** touch.

**The test that decides it.** Not a new test — the tier itself, run twice on one unchanged tip:

**Run.** `apps/mobile/Patina/scripts/ios-gate.sh unit` under load. → red (above).

**Run.** the same command on a quiet machine (`uptime` < 40), same tip, no edit in between.

- **Green** ⇒ starvation, not regression. No code change. Both runs go in the report verbatim, and
  note **S8** re-files `S4`'s ruling request with the pair as evidence.
- **Red** ⇒ a real defect, and this task becomes a fix: make both pollers count *scheduling
  opportunities* rather than wall seconds (a read-count-driven `TourStateBox` for the Companion
  test; an attempt-bounded `waitFor`), which removes the machine from the assertion entirely.

**Commit.** Only if the second run is red. Otherwise this round commits documentation alone.

## F5-02 — the notes pass

**No code change.** Note **S8** to the steward, written to `l1b-notes-out.md` and appended to
`steward.md`.

**Commit.** `artifacts/ios-testflight-polish-2026-09-01/build/waves/w1/l1b-tasks-fix-round-5.md`
`artifacts/ios-testflight-polish-2026-09-01/build/waves/w1/l1b-notes-out.md`
`artifacts/ios-testflight-polish-2026-09-01/build/waves/w1/steward.md`

---

## Gate, at the end, on the committed tip

```bash
export IOS_GATE_UDID=1D595108-E73C-47D6-A832-184C082386E4
apps/mobile/Patina/scripts/ios-gate.sh build
apps/mobile/Patina/scripts/ios-gate.sh release
apps/mobile/Patina/scripts/ios-gate.sh unit
apps/mobile/Patina/scripts/ios-gate.sh lint-delta main
```

**Never `pnpm supabase:reset`** — the local DB is ahead of this branch (steward §4).

## Self-check

Round 5 changes no screen. The self-check is therefore a **relaunch and confirm-unchanged** pass, not
a before/after pass: build, install, launch with `-DeploymentTarget local`, sign in as
`client@patina.dev` / `password123`, and re-shoot the surfaces round 4 changed, into
`shots/w1-l1b-r5/` with a `ledger.md` saying what each shot proves is *still* true. Round 4's
before/after pairs stay the evidence of record in `shots/w1-l1b-r4/`.
