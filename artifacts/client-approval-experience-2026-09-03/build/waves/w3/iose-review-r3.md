# iOS-E — Wave 3, round 3 adversarial review

Reviewer context, separate from the lane's. Worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w3-iose`, branch `approvals/w3-iose`,
fifteen commits over `main` (`42d9057e4`).

## Gates, run by the reviewer

Unsandboxed, `IOS_GATE_UDID=B6AD6271-E9E1-4BC6-B94A-F115E270CCAE`, from the lane's own worktree.

| Gate | Result |
|---|---|
| `ios-gate.sh build` | **PASS** — `** BUILD SUCCEEDED **` (exit 0) |
| `ios-gate.sh unit` | **PASS** — `Test run with 2699 tests in 289 suites passed after 8.027 seconds with 2 known issues.` · `** TEST SUCCEEDED **` |
| `ios-gate.sh lint-delta main` | **PASS** — `✓ lint-delta: no new warnings in touched files` |

`CompanionCoachingModelTests.introGate_freshUser_pollsUntilTourResolves` did not flake: the carried
fix made the poll counted (`TourStateBox(resolvingAfter: 3)`) rather than clock-raced.

## Round-2 findings — verification

| id | verdict | evidence |
|---|---|---|
| `R2-M1` | **FIXED, with a residual** | `DecisionSnooze.confirmation` is now `holdsUntil` + `DecisionPaceCopy.theTwoThatStillReachHer`; "I won’t ask again" is gone and `everyConfirmationIsHonestAboutTheHold` walks all four cases against the forbidden spellings. The residual is `R3-M1` below. |
| `R2-M2` | **FIXED** | `DecisionDetailViewModel.approvalPaceIsHeldByDate(now:)` = `canRespond && viewerAnswers && !hasAnsweredApproval && approvalIsPastDue`; `ProjectApprovalScreen.pace`'s else-branch calls it. `anAnsweredPastDueApprovalSaysNothing` asserts the trap is real before asserting the fix. |
| `R2-m1` | **FIXED** | the same predicate carries `review.viewerAnswers`; `anObserverIsGivenNoReason` covers the studio co-member. |
| `R2-m2` | **STILL STANDS** | `optionCard` is unchanged: `Button { chooseLeaning }` + `.buttonStyle(.plain)` + `.allowsHitTesting(!isResolved)`, with no `.disabled(!hasRenderableContent)`. |
| `R2-m3` | **STILL STANDS** (latent) | one `@Namespace` in `HouseFirstRoot` across four stacks; one Record-row call site. |
| `R2-n1` | **STILL STANDS** | `spreadSignature` has no `onChange(of: leaningOptionId)` reset; `grep -n onChange DecisionDetailView.swift` returns nothing. |
| `B1`, `M1`, `M2`, `M3` | **CLOSED** | re-verified: lint-delta green, `quietHours` carries no Sunday clause, `DecisionSpread.consent(forTypedName:)` restores the e-signature, `inWordsCapitalized` at every head-of-line site. |
| `m1`–`m6`, `n1`–`n6` | **ALL STILL STAND** | none was touched by the round-2 fix pass, which is two files. `n6` is re-graded minor with a mechanism (see `R3-m3`). |

## New this round

- **`R3-M1` (major)** — `DecisionSnooze.never.holdsUntil` is *"I’ll hold the reminders until you
  come back."* Nothing lifts the hold when she comes back. 00572 stores `never` as
  `snoozed_until = 'infinity'`, and `grep -rn decision_snoozes supabase/` finds no DELETE and no
  UPDATE outside `set_decision_snooze` itself — the only readers are `decision-notify.ts:1346`
  and `notification-digest/index.ts:106`. The sentence names an end condition the product does
  not implement. Same family as `R2-M1`, opposite direction: it under-delivers speech rather than
  over-promising silence, and on an undated approval (no overdue notice possible) it is the only
  thing that could ever break the quiet.
- **`R3-m1` (minor)** — `DecisionPaceCopy.quietHours` still over-claims one leg: *"Patina never
  mails about an approval before 8am"*. `decisionMailHold` returns `null` for
  `kind === "decision_overdue"` at line 199, **before** the `hour < 8 → before_local_morning`
  test at 216, and the overdue notice fires from `expire-decisions` on 00174's 02:00 UTC cron —
  which is pre-8am local across Europe.
- **`R3-m2` (minor)** — a snooze cannot be changed or lifted in-session: `chosenSnooze` replaces
  the whole `Menu` in `ProjectApprovalScreen.pace` and is never cleared, so "Tomorrow morning"
  chosen by mistake leaves no control to correct it.
- **`R3-m3` (minor, was `n6`)** — `pagedPlates` puts `.containerRelativeFrame(.horizontal, count: 1)`
  on each plate inside a `LazyHStack` carrying `.padding(.horizontal, 24)`. Each page is sized to
  the FULL container width while the layout is inset by 24 on each side, so `.viewAligned` snaps
  page 2+ flush to the leading edge while page 1 sits inset — the idiomatic pairing is
  `.safeAreaPadding(.horizontal, 24)` + `.scrollClipDisabled()`. Wants the walker's eye at four
  options.
- **`R3-n1` (nit)** — `RecordOfDecision.proposal` always emits the `electronic_signature`
  sentence, so a return visit whose `signed_by_name` is empty prints *"Signed by typing your full
  legal name."* with no name above it.
- **`R3-n2` (nit)** — `KeepACopyAct` renders once (`guard sheetImage == nil`) and never re-renders
  when `record` changes, so a refetch that fills in `respondedAt` shares the older sheet.
- **`R3-n3` (nit)** — `theTwoThatStillReachHer` is appended to every confirmation, including on an
  approval with no due date, where "If the date passes" points at a date that does not exist.

## Verdict

No blocker. One major (`R3-M1`) plus the standing minors. `fix`.
- **`R3-n4` (nit)** — `ios-gate.sh lint-delta` filters touched files to `^apps/mobile/Patina/`
  (script line 121), so the one design-kit file this lane changed,
  `apps/mobile/PatinaDesignKit/Sources/PatinaDesignKit/Components/PatinaStamp.swift`, is outside
  the gate's view. It is 374 lines, well under the 500-line floor, so nothing is wrong today —
  recorded so a future design-kit edit is not assumed to be gated.
