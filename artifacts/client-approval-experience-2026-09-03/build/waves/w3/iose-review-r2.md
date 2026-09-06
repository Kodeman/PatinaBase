# iOS-E — Wave 3 adversarial review, round 2

Reviewer context: fresh, did not write this code. Worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w3-iose`
(`git rev-parse --show-toplevel` confirmed), branch `approvals/w3-iose`, eleven commits over
`main` at `42d9057e4`.

## Gates — run by the reviewer, unsandboxed, `IOS_GATE_UDID=B6AD6271-E9E1-4BC6-B94A-F115E270CCAE`

| Gate | Result |
|---|---|
| `ios-gate.sh build` | **PASS** — `** BUILD SUCCEEDED **` (exit 0) |
| `ios-gate.sh unit` | **PASS** — `Test run with 2694 tests in 289 suites passed after 9.060 seconds with 2 known issues.` · `** TEST SUCCEEDED **` (exit 0) |
| `ios-gate.sh lint-delta main` | **PASS** — `✓ lint-delta: no new warnings in touched files` (exit 0) |

The two known issues are pre-existing `withKnownIssue` records in `BrandVoiceLintTests` and
`RoomLifecycleTests`, neither in this lane's touched set.
`CompanionCoachingModelTests.introGate_freshUser_pollsUntilTourResolves` did not flake.

## Round-1 findings — verified

| id | verdict |
|---|---|
| `B1` lint-delta red | **FIXED.** `DecisionsAPIClient+Pace.swift` and `RemoteClientDecision+Kind.swift` are new files, `StudioHubView`'s entry-key pair moved to a `private extension`. Reviewer re-ran the gate: green. |
| `M1` quiet-hours caption over-claimed | **FIXED.** The Sunday clause and the mail-side 8pm ceiling are gone; `theFloorDoesNotOutrunTheLegs` pins the absence against `ReminderCadence.weeklySunday.label`. |
| `M2` option choice could no longer be e-signed | **FIXED.** `DecisionSpread.consent(forTypedName:)` + `signatureLine`, the two-character floor matches `00399`'s trigger (`char_length(btrim(NEW.client_signature)) < 2` → `check_violation`), and `actConsequence` restores the consequence sentence the sheet took with it. |
| `M3` `inWords` where `inWordsCapitalized` is the convention | **FIXED.** Fourteen head-of-line strings swept; the mid-sentence "and N more" and the parenthetical eyebrows correctly stay lowercase. |
| `m1`–`m6`, `n1`–`n6` | **NOT addressed** (the lane's prerogative — the orchestrator filters). Each re-verified as still standing; see the StructuredOutput findings. |

## New this round

Two majors, three minors, one nit. Both majors are the same family as `M1`: a sentence a
homeowner reads that promises more than the system keeps.

### `R2-M1` — "I won't ask again" is a promise R16 forbids

`DecisionSnooze.never.confirmation` reads *"I won't ask again. It's here when you want it."*
It is drawn as `approval.snooze.confirmation` the moment the write lands.

`R16`'s one hard rule is that a snooze never suppresses an overdue notice or a superseding
edition, and the backend lane implements exactly that:
`supabase/functions/_shared/decision-notify.ts` `decisionMailHold` returns `null` for
`decision_overdue` **before** it reaches the snooze test, and exempts
`isSupersedingEdition` from the snooze test as well. 00572 stores `never` as
`snoozed_until = 'infinity'` and its own comment says *"Nothing here suppresses the overdue
notice or a superseding edition (R16)"*.

So for a dated approval Patina asks again the moment the date passes, and for any approval a
superseding edition speaks through the snooze. The one case where the sentence is true is an
undated approval that is never re-issued. `DecisionPaceTests` pins `.sunday`'s confirmation and
does not pin this one, so nothing catches it.

The same shape, weaker: `tomorrowMorning`/`sunday`/`whenDue` name an hour the snooze only
UNBLOCKS — the cadence gate runs after it (`cadence_digest` for `daily` and `weekly_sunday`).
"I'll ask you tomorrow morning" under the `weekly_sunday` cadence names a day Patina will not
speak on.

Fix: say what the snooze does rather than what Patina will not do — e.g. "The reminders wait.
I'll still tell you if the date passes or a new edition arrives." Pin it.

### `R2-M2` — the past-due sentence draws over an approval she has just answered

`ProjectApprovalScreen.pace`'s else-branch is
`viewModel.approvalIsPastDue(), viewModel.approvalReview?.canRespond == true`.
The happy path of `submitApprovalResponse` calls `record(outcome)` — which sets
`answeredOutcome` and nothing else — and never refetches `approvalReview`. So `canRespond`
stays `true` after she answers.

Result: she approves a past-due approval, the seal lands, and directly beneath it the screen
still says *"This one is past its date. The reminders stay until it's answered."*

Proven with a throwaway probe (deleted after): with `approvalReview` from
`ProjectApprovalFixture.review()` and `answeredOutcome = .approved` at `2026-09-22`,
`canSnoozeApproval == false`, `approvalIsPastDue == true`, `approvalReview?.canRespond == true`
— all three legs of the branch. `✔ Test run with 3 tests in 1 suite passed`.

Fix: add `!viewModel.hasAnsweredApproval` (and `review.viewerAnswers`, see `R2-m1`) to the
past-due branch.

### `R2-m1` — the past-due sentence also draws for a reader who is not the one asked

Same branch, same probe. `iose-notes.md` states *"A reader who is not the one being asked
(`viewerAnswers == false`) and an approval already answered are offered nothing"*, and
`DecisionPaceTests.anObserverTakesNoSnooze` asserts only `canSnoozeApproval`. The else-branch
tests `canRespond`, which carries no viewer role — a studio co-member reading a past-due
approval is told the reminders stay until *she* answers it.

### `R2-m2` — a contentless plate is now a live control that silently does nothing

`optionCard` wraps the whole plate in `Button { viewModel.chooseLeaning(...) }` with
`.buttonStyle(.plain)` and `.allowsHitTesting(!viewModel.isResolved)`. `chooseLeaning` refuses
an option without `hasRenderableContent` (correct, `R06`). Before `P-30` that refusal was
VISIBLE — `PatinaButton(isEnabled: hasDetails)` dimmed and disabled itself. Now the plate looks
identical to a leanable one, announces itself to VoiceOver as a button, and absorbs the tap with
no mark, no act and no word.

### `R2-m3` — one namespace across four stacks

`HouseFirstRoot` publishes a single `@Namespace` to all four `NavigationStack`s. Two
`matchedTransitionSource(id:)` with the same decision id in one namespace would be ambiguous.
Today only `HouseRecordCard` mounts `HouseRecordRowView`, so this is latent rather than live —
recorded so a second Record-row surface does not land on it silently.

### `R2-n1` — the typed name survives a change of leaning

`spreadSignature` is never cleared when `leaningOptionId` moves. A name typed under "I choose
Shaker Oak" is still in the field, and still sent, under "I choose Natural Linen". Defensible;
recorded.

## Scope, hygiene, refusals

- No migration, no edge function, no production mutation, nothing outside `apps/mobile/Patina`
  and the program's own `build/` docs. `git diff main...HEAD --stat`: 40 files, all in scope.
- `ProposalListView`'s eyebrow is one file wider than the carried item's wording ("invoice list
  headers") — disclosed by the lane, consistent with the sweep's intent.
- Every new homeowner string read against the refusals: no badge, no numeric count chip, no
  red/green, no checkmark as status, no shadow, no stamp fill, no tab or dashboard, no emoji,
  no "AI"/"gate"/"task"/"dashboard"/"overdue", no guilt or apology. The two majors above are
  false-promise defects, not refusal breaches.
- `PatinaStamp(isUpright:)` is the one design-kit change; the tilt is unchanged everywhere but
  the printed Record.

## Verdict

**fix** — two majors (`R2-M1`, `R2-M2`), no blocker. All three named gates are green and every
round-1 blocker/major is closed.
