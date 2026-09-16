# W6 — fix round 1

**Wave** W6 (Patina Field: an hour that is not a visit) · **Lane C** · worktree
`.codex/worktrees/agent-ios`, branch `hour-tracking/ios`.
**Round 1 findings:** W6-R1-01 … W6-R1-04. **All four applied.** None skipped.

No migration, no SQL, no generated type and no TypeScript changed this round, so
the DB half of W6's gate block (`pnpm supabase:reset`, `run-sql-tests.sh`,
`pnpm db:generate`, the `database.types.ts` diff) is not re-run — there is
nothing in this round for it to cover. `00616` is untouched.

---

## W6-R1-01 — a stale visit pre-filled a wall-clock multi-hour billable duration

**Confirmed.** `FieldLogTimeDraft.init(visit:now:)` took a bare
`CaptureSessionContext?` and gated on `visit.isVisit`
(`CaptureSessionContext.swift:96` — `kind != nil && endedAt == nil`), while the
call site handed it `contextStore.visitState(identity:).context`.
`CaptureVisitState.context` (`CaptureVisitPolicy.swift:21-26`) is non-nil for
`.stale` as well as `.active`, so the whole stale band — idle > 30 min, idle
≤ 12 h, same calendar day (`CaptureVisitPolicy.swift:74-94`) — reached the
elapsed-minutes branch. The reported walk (opened 08:00, last touched 09:00,
Hours tapped at 14:00) opened the sheet on `Log 6h`, Billable on, activity
Drive.

**Fix.** The initializer now takes the **state**, not the context, and pre-fills
only from `.active`:

```swift
public init(visit state: CaptureVisitState, now: Date) {
    guard case .active(let visit) = state, visit.isVisit else { …default 30m… }
    …
}
```

`LogTimeSheet.open()` passes `contextStore.visitState(identity: identity)`
whole. `.stale`, `.none` and an ended visit all fall to the same default branch
— 30 minutes ending now, no project, `canLog == false`, so `isPickingProject`
opens the picker. That is exactly the contract the doc comment at
`FieldLogTime.swift:118-119` and the call-site comment already claimed, so **no
ruling is owed**: the code now does what both comments said it did.

**What was deliberately NOT done.** The finding offered a second remedy —
bounding the pre-fill by `lastActivityAt` the way
`VisitReviewComposer.activeMinutes` bounds by the last capture. That is right
for V4, where the offer *is* the visit, and wrong here: the hour this sheet logs
is the **un-captured tail** — the drive away from the house — and the last
capture is the wrong end of it. Bounding by it would propose ~0 minutes for the
drive the surface exists to log. The reasoning is now in the initializer's doc
comment.

**Residual, named.** An `.active` visit can still be long: `visitState` bounds
it at "touched within 30 min **and** opened on today's calendar date", so a
06:00 install day worked through to 20:00 pre-fills 12 h (the clamp). That span
is genuinely today's and still on the clock, and the stepper is the correction —
but it is a wall clock, so it is recorded here rather than left silent.

**Tests** (`CaptureTests/LogTimeSheetTests.swift`). Every pre-fill test now runs
through the real policy (`CaptureSessionContextPolicy.visitState`, UTC calendar)
instead of asserting a state by hand:

- **new** `aStaleVisitPreFillsNeitherTheProjectNorTheWallClock` — the reported
  walk, exactly: asserts the state IS `.stale`, that its `.context` is non-nil
  (the trap), and that the draft takes neither answer.
- **new** `aVisitCarriedOverFromAnotherDayPreFillsNothing` — the rollover half.
- **replaced** `aPreFillLongerThanTheBoundIsClamped` → 
  `anActivePreFillLongerThanTheBoundIsClamped`. The old test pinned the bad
  behaviour (a 40-hour open visit offering 12 h); a 40-hour visit is now
  `.none` by the calendar-day rule and never reaches the clamp. The new test
  keeps the bound honest with a 14-hour visit on a 20:00 `now`.
- The rest were rewritten to pass a `CaptureVisitState`.

## W6-R1-02 — five acts under 44 pt

**Confirmed**, and the cause was as reported: `.frame(minHeight: 44)` applied
**outside** the `Button`, which grows the layout frame but not a plain button's
hit region. Fixed by moving the sizing inside the label, matching `stepButton`
(`LogTimeSheet.swift:180-194`), which already measured 45 × 45.

| Act | Before (iPhone 17, 402 pt) | After (iPhone 17e, **390 pt**) |
|---|---|---|
| `Change` (back to the project picker) | 48 × 16 | **64 × 44** |
| Activity chips (Drive … Design) | 34–35 tall | **44 tall** |
| Role chips (same `LogTimeChips` component) | 35 tall | **44** (same component, proven by the activity row) |
| Day | 34 tall | **350 × 44** |
| Project rows | 43.67 tall | **44** |

The chips take `.frame(minHeight: 44)` **before** `.background(…, in: Capsule())`
so the capsule itself grows rather than a frame around it, plus
`.contentShape(Capsule())`.

**The Day control is a different shape now, and deliberately.** A compact
`DatePicker` renders its own ~34 pt control and owns its own hit region — no
frame hung around it can reach 44. The row became our own act: a full-width
44 pt button reading the date (`Sun, Sep 13`) with `Change` / `Done` on the
right, which discloses a `.graphical` `DatePicker` beneath it, still bounded
`in: ...Date()`. HT-13 (any date) is unchanged.

## W6-R1-03 — the primary blocked on the network

**Confirmed.** `log()` held `isLogging` (which drives the primary's spinner and
`.disabled`) and deferred `coordinator.dismissSheet()` until
`timeEntryOutboxDrainer.resume(trigger: .userInitiated)` returned — i.e. until
the PostgREST round trip completed or timed out, under copy that reads *"It's
kept on this phone and sent when there's signal."*

**Fix.** The record is durable the moment `store.save()` returns, so the act is
over there: `isLogging = false; coordinator.dismissSheet()` run synchronously
after the save, and the drain goes into an unobserved `Task` — the shape
`V4VisitReviewScreen.resumeCloseOutbox()` (`:441-444`) already uses.

## W6-R1-04 — the last "My hours this week" row sat under the companion strip

**Confirmed, and measured.** `RootView` does host the companion in a
`.safeAreaInset(edge: .bottom)` (`RootView.swift:57-59`), but that inset is
applied **outside** the realm's `NavigationStack` and does not reach the
dashboard's own `ScrollView`. At max scroll on iPhone 17e (390 pt), before the
fix:

- last row subtitle `Activity not set · Not billable` — `y 710.67 → 742`, `x 84 → 221`
- `fieldCompanion.bubble` — `y 710 → 774`, `x 163 → 227`

i.e. the bubble bisected the line, with the `2 items need you` hint capsule
below it. As the finding says, the 40 pt inset predates W6 and the previous last
element was the Browse grid; W6 is what put readable text there.

**Fix.** `WorkDashboardScreen`'s scroll content bottom padding 40 → **112**.
After, at max scroll: last row subtitle `y 638.67 → 670`, bubble top `710` —
**40 pt of clearance.**

---

## Verification

**Claim level: sim-verified.** No device pass this session; per **P-6** that is
sufficient to ship and Kody walks the device afterwards. The airplane-mode drain
walk remains **unverified** and is still his post-ship step.

- `ruby apps/mobile/Capture/scripts/generate_project.rb` — ran (no files added
  or removed this round; belt-and-braces).
- `apps/mobile/Capture/scripts/capture-gate.sh all` — **green**: `✔ build`
  `✔ tests` `✔ lint` `✔ fc-r3 sweep (inbox)` `✔ fc-r3 sweep (ai)`
  `✔ principle-4 sweep`.
- CaptureKit test run: **808 tests in 75 suites passed**. The five renamed/new
  `LogTimeSheetTests` cases were confirmed by name in the verbose run
  (`aStaleVisitPreFillsNeitherTheProjectNorTheWallClock`,
  `aVisitCarriedOverFromAnotherDayPreFillsNothing`,
  `anActivePreFillLongerThanTheBoundIsClamped`, `threeTapsToALoggedDrive`,
  `anOpenVisitPreFillsTheProjectAndTheElapsedMinutes` — all `✔ passed`).
- **390 pt** — iPhone 17e simulator, explicit UDID
  `2AB2290B-9505-4E33-8843-18B7DD1DF92B`. Accessibility-tree measurements above;
  H1 walked (project picked → `Change` appears → Day discloses the calendar →
  `Log 30m` dismisses the sheet immediately onto Today), W1 scrolled to max.
- **Wide end** — iPhone 17 Pro Max (440 pt), explicit UDID
  `EDF8B28E-32F2-4DD1-944E-25E3C8538770`: project rows 44, Day 400 × 44, chips
  44, steppers 45 × 45, primary 400 × 52. (1440 is a portal width and has no
  iOS analogue; the widest Field target stands in for it.)

**Not verified:** anything on a physical device; the outbox actually reaching
Postgres (mock mode on the Simulator — `AppConfiguration.runsRealServices` is
false, and the log act is a durable local write plus a mock drain).

## Files

- `apps/mobile/Capture/CaptureKit/CaptureKit/Domain/FieldLogTime.swift`
- `apps/mobile/Capture/Capture/Features/Time/LogTimeSheet.swift`
- `apps/mobile/Capture/Capture/Features/Work/WorkDashboardScreen.swift`
- `apps/mobile/Capture/CaptureTests/LogTimeSheetTests.swift`
