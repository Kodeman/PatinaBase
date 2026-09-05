# Adversarial review — W1 close-out, iOS lane, round three (2026-09-05)

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w1-integration`
(`git rev-parse --show-toplevel` confirmed), branch `approvals/w1-integration`.
Range reviewed: `c65f9740609e95fc62ae19c2b588cc9cad166ce5..HEAD` (`09ac03adc`).

```
09ac03adc docs(approvals): the W1 close-out iOS lane, round two
49183a76f fix(ios): the feed carries only editions the studio has issued, and mark-all leaves a failed delivery alone
ab86807c8 docs(approvals): adversarial review of the W1 close-out iOS lane, round two
6d2a0b9a8 docs(approvals): W1 close-out round two — the review's three majors
c93d56633 fix(ios): the reading keeps its door, the Record keeps one sentence, money keeps no red
456cf456d docs(approvals): adversarial review of the W1 close-out iOS lane
7032cacd3 docs(approvals): W1 close-out — the iOS half of the round-two walk
21a54b166 fix(ios): the bell says what an approval is, and the money rail drops the retired word
6522b6ec1 fix(ios): the first submit no longer loses the CAS to its own seen stamp
```

39 files, +2773/−156. No `.claude/`, `.agents/`, hook, settings or `.env` path is
touched; every commit is pathspec-clean; the two program docs are force-added
under the ruling.

**Verdict: fix.** No blocker. All ten briefed items are delivered and both gates
are green. Three majors stand: one false invariant that the wave record's
central trade-off is argued from, one surface (Today) that item 4's exclusion
did not reach, and item 9's settled title still absent on the cold bell.

---

## Gates, run here

```
IOS_GATE_UDID=B6AD6271-E9E1-4BC6-B94A-F115E270CCAE …/scripts/ios-gate.sh build
  ** BUILD SUCCEEDED **

IOS_GATE_UDID=B6AD6271-E9E1-4BC6-B94A-F115E270CCAE …/scripts/ios-gate.sh unit
  ━ Test run with 2467 tests in 271 suites passed after 8.140 seconds
    with 2 known issues.
  ** TEST SUCCEEDED **        [exited with code 0]
```

No rerun was needed; `CompanionCoachingModelTests.introGate_freshUser_…` did not
flake.

**Advisory, environmental.** The in-build SwiftLint phase is a no-op on this
machine — `warning: The file ".swiftlint.yml" couldn't be opened because you
don't have permission to view it` then `Error: No lintable files found at paths:
'Patina'`, from Xcode's own `sandbox-exec` wrapper. So the build gate proves
nothing about the length limits the lane's two file splits were justified by. I
ran `swiftlint lint --config .swiftlint.yml` separately: none of the 36 touched
Swift files reports `file_length` or `type_body_length`. The splits hold.

### W1R2-B1, driven behaviourally (throwaway, deleted)

The repo's own order pin is a source-text scan, so I wrote a probe that drives
`DecisionDetailViewModel.load` against fakes for `markDecisionViewed`,
`fetchApprovalReview` and `respondToApproval`, where the stamp moves the
server's `updated_at`, and asserts what the first submit sends.

On HEAD:

```
✔ Test "the first submit sends the value the stamp left behind" passed after 0.355 seconds.
** TEST SUCCEEDED **
```

Negative control — the two `await`s in `load` swapped back to read-then-stamp:

```
✘ Expectation failed: (server.sent → ["2026-09-04T10:15:00+00:00",
   "2026-09-05T09:00:00+00:00"]) == ["2026-09-05T09:00:00+00:00"]
** TEST FAILED **
```

The ordering fix is real, and the control also shows the new retry doing its job
(the second send carried the moved value and landed). Both the probe and the
swap were reverted; `git status` over `apps/mobile/Patina` is clean.

---

## The ten items

| # | Item | State |
|---|---|---|
| 1 | W1R2-B1 stamp-before-read + one refetch-and-retry | delivered; proven behaviourally above |
| 2 | W1R2-M1 immutability sentence on `canRespond` alone | delivered |
| 3 | W1R2-M2 designer's name on Stage-2 rows | delivered, with a degrade path (R3-08) |
| 4 | W1R2-M3 exclude unpublished from every homeowner merge | delivered on two of three surfaces (R3-02) |
| 5 | W1R2-m1 opened WRITE marks both legs | delivered, plus a status guard (R3-07) |
| 6 | W1R2-m2 badge plural grammar | delivered |
| 7 | iosa R3-02 "Past due" in body ink | delivered, pin updated |
| 8 | W1R2-n1 asked-on clause earns its place | delivered |
| 9 | W1R2-n4 bell titles | delivered on the warm path only (R3-03) |
| 10 | badge-definition comment | delivered; its last sentence is still untrue (R3-04) |

No refusal appears in any new homeowner-visible string. The complete set of new
literals: "An approval needs you", "Your approval was recorded", "This approval
is closed", "Past due · {date}", "Still open.", "{Name} asked you to read this
edition.", and the spoken badge nouns. "Overdue" and "A sign-off needs you"
survive only as the retired constants being matched against.

---

## Findings

### R3-01 · major · the record's central trade-off rests on a false invariant

`apps/mobile/Patina/Patina/Core/Network/DecisionsAPIClient+ProjectApprovals.swift:180`

> `AppRoute.decisionDetail` is pushed from a feed row and nowhere else.

It is not. `App/DeepLinking/DeepLinkHandler.swift:306` maps `/decisions/<id>` and
`/decision/<id>` onto that route, and `App/DeepLinking/NotificationRouter.swift:70`
maps a push whose `entity_type` is `"decision"` onto it too. Walk-r2's own P-08
pass is the proof: a cold `simctl openurl https://client.patina.cloud/decisions/31eaa388-…`
landed on auth and, after sign-in, opened that exact approval.

The invariant is load-bearing twice — in the doc comment, and in `iosb-notes.md`
(the round-one escalation and the round-two "cost, recorded rather than argued
away"), where it becomes **"P-09's review confirmation is therefore WEB-ONLY for
Wave 1."** That conclusion is overstated: what the exclusion actually removes is
the *discovery* door, not the door. A homeowner (or a studio co-member) handed a
`/decisions/<id>` link still reaches the review-confirmation screen on the phone.

Fix: correct the comment and both note passages to say the feed no longer
surfaces the row, the link still opens it. The orchestrator should re-weigh
P-09 against the smaller cost that actually applies.

### R3-02 · major · item 4's exclusion does not reach Today

The brief named three surfaces — Today, Studio hub, bell. Two exclude the
unissued edition; Today does not.

- `Services/Badges/BadgeCountService.swift:284` — `restore()` writes
  `pendingDecisions = stored.pendingDecisions ?? []`, unfiltered. This is the
  path the lane's own R2-M2 note names ("the disk-restored `pendingDecisions` a
  version upgrade can hand straight to the bell before any merge runs").
- `Features/Profile/ViewModels/StudioQueueBuilder.swift:250` —
  `StudioQueueContext` filters `!isResolved && !isUnissuedApproval`. The hub and
  the bell's stand-in are covered.
- `Features/Profile/ViewModels/StudioQueueBuilder.swift:110` —
  `itemizedAwaitingRows` filters `!isResolved` only. `Features/Home/Models/
  HouseRecord.swift:272` feeds it `badges.pendingDecisions` directly.

So on the first cold launch after upgrading from the build that carried drafts,
Today draws the unissued edition — carrying the `due_date` that build persisted,
because the `awaitsReadingOnly` nil-ing arrived later — while the Studio hub one
tap away has dropped it, and `pendingDecisionCount` (restored whole at :275)
counts it while `awaitingCount` (:29) does not. That is W1R2-M3's original
complaint, a dated ask nobody made, on the one path that survives; and it breaks
the invariant `HouseRecord.swift:266-270` states in its own comment ("the
Studio's 'Awaiting you' counts the same items … the two surfaces must not
disagree about how many there are").

Fix: one predicate in `itemizedAwaitingRows` (or filter at `restore()`), and a
pin beside `anUnissuedEditionIsNotCountedAsAnApproval`.

### R3-03 · major · item 9's settled title is absent on a cold bell (carried, third round)

`Features/Notifications/ViewModels/NotificationsViewModel.swift:138`

`retitleApprovals` composes from `BadgeCountService.shared.projectApprovals`,
which is `[]` at launch and after `clear()` (`BadgeCountService.swift:115`,
`:346`), is filled only by a refresh whose projection fetch succeeded (`:375`),
and — unlike `pendingDecisions`, `projects`, `pendingProposals` and
`payableInvoices` — is **not** persisted (`persistCounts`, `:290-305`). For an
uncovered row the fallback is unconditional:

```swift
if retitled.title == ProjectApprovalCopy.retiredBellTitle {
    retitled.title = ProjectApprovalCopy.bellOpen
}
```

Cold launch, then tap the bell, is the common case, and there a settled Stage-2
approval reads "An approval needs you" — the claim item 9 exists to retire. The
same fallback also renames a legacy client-court sign-off (00534:324 titles every
`coordination_kind = 'signoff'` decision "A sign-off needs you", not only Stage-2
ones) without knowing whether it is still open.

Declined in rounds one and two on the grounds that the rename alone needs no
knowledge of state. That is true of the *word* and untrue of the *claim*: "needs
you" is the half that can be false. Fix: rename only where the projection covers
the row, or persist `projectApprovals` alongside the other four arrays.

### R3-04 · minor · the badge comment's last sentence is still untrue (m-1 carried)

`Services/Badges/BadgeCountService.swift:78` ends "`markAllOpened` marks BOTH
legs (`W1R2-m1`), so a read cannot part them either." `markOpened(id:)`
(`NotificationsAPIClient.swift:106-119`), the per-row read taken on nearly every
notification, still PATCHes `notification_log?id=eq.<row>` — the id of the one
`in_app` row the feed listed — so its push twin keeps `opened_at IS NULL`
forever. Round two's own fix makes it doubly untrue: with
`openedWriteStatusFilter` in place even mark-all now leaves a `failed` push twin
unread. Fix: delete the sentence or widen `markOpened`.

### R3-05 · minor · two files in this diff still disagree about what the badge counts (m-4 carried)

`PatinaTests/NotificationsAPIClientContractTests.swift:49` still argues item 5
from "a row every server-side unread count, the springboard badge included,
still sees." `BadgeCountService.swift:58-79` — item 10's own deliverable — and
R5's second pass in `rulings-2026-09-04.md` both say the badge is unread `in_app`
rows, never the push leg. The true argument for item 5 is `notification_log`
consistency. Fix: correct the comment.

### R3-06 · minor · `bellClosed` is a third vocabulary (m-3 carried)

`Features/Decisions/ProjectApprovalCopy.swift:126` flattens withdrawn and
superseded into "This approval is closed"; the detail screen keeps them apart at
`:88-92`. Item 9 asked for two titles; this is a third the brief did not request,
and one state with two vocabularies across two surfaces is the shape P-16 exists
to close.

### R3-07 · minor · the opened write is now narrower than the read it was matched to

`NotificationsAPIClient.swift:57` — `openedWriteStatusFilter =
"in.(queued,sending,delivered,unconfirmed)"` — against `visibleStatusFilter` at
`:33`, which also admits `opened` and `clicked`. The docstring at `:121-126`
still promises mark-all "can neither leave behind a row the list would have
shown"; a listed row whose status is `opened`/`clicked` while `opened_at IS NULL`
would now be left. Neither enum value is written for an `in_app` row in practice,
so reachability is low. Separately, `sent` (added by 00552) is in neither
constant — an in-app row ever stamped `sent` would be invisible *and*
unmarkable. Fix: a sentence acknowledging the narrowing, or add the two
engagement values to the write filter.

### R3-08 · minor · W1R2-M2's name depends on a second read having landed

`Features/Profile/ViewModels/StudioQueueBuilder.swift:314` reads
`soonest?.0.project?.designer?.askedByName` with **no** `designerFallback`,
unlike the row builder five lines up (`:112`, `naming(… fallback:)`). The
name now comes from `BadgeCountService.projects` matched on `projectId`
(`DecisionsListViewModel.swift:47`, `BadgeCountService.swift:377`). On a
first-ever cold refresh where `listProjects()` has not landed and nothing is on
disk, R8's sentence still degrades to "Still open, your designer asked on …" —
the walk's finding, transiently. Pinned as the honest degrade
(`anUnmatchedProjectNamesNobody`), so this is a note rather than a defect; the
Record's own headline has a fallback this path does not.

### R3-09 · nit · the in-repo B1 pins are still source-text scans (n-1 carried)

`PatinaTests/WalkCASAndFeedTests.swift:36` compares `range(of:)` offsets in the
file's text and would stay green if `markViewed`'s body stopped stamping;
`:56` (`theStampIsSeamed`) installs the seam, never calls `load`, and asserts
`stamped == nil`. The four retry tests added this round *are* behavioural — the
gap is the ordering itself, which my throwaway probe covered and which no
committed test does.

### R3-10 · nit · the notes still misattribute three of their own deliverables (n-2 carried)

`iosb-notes.md:337` (`ProjectApprovalActTests.theStampGoesBeforeTheProjectionRead`
— the suite is `ApprovalCASOrderTests`), `:415` ("`sectionBadgeLabel` is now a
pure `static func` on `StudioHubView`" — it is `badgeLabel(count:)` on
`StudioQueueSectionKind`, as `:497` itself later says), `:445` ("Six tests in
`BellQueueFallbackTests`" — they are in `BellApprovalTitleTests`). The
round-two "Still owed" list (`:761-764`) also lists only round one's items and
omits the round-two-only `m-4`, `n-5`, `n-6`, `n-7`.

### R3-11 · nit · two comments describe a red that no longer exists (n-5 carried)

`Features/Shared/DateDisplay.swift:131` — "never the error ramp, which stays
money's"; money has no ramp as of R3-02. `Features/Decisions/Views/
ProjectApprovalScreen.swift:11` still lists "the past-due date in
`PatinaColors.Text.error`" among the treatments the Stage-2 screen refuses to
draw, naming something that no longer exists anywhere. `grep -rn
PatinaColors.Text.error Patina/` returns 8 hits: six error messages and the two
proposal-expiry sites that keep their red by ruling.

### R3-12 · nit · three "sign-off" strings survive on the legacy client-court path (n-3 carried)

`Features/Decisions/DecisionDeferral.swift:83-85` — "…your designer needs your
sign-off.", "Give your sign-off", "CONFIRM YOUR SIGN-OFF". Outside the ten items
and possibly deliberate; a ruling either way would close it.

### R3-13 · nit · the "one sentence, two surfaces" guarantee covers decisions only

`HouseRecordBuilder.state(for:)` (`HouseRecord.swift:501`) emits
`.overdue(due:)` for `.proposal` as well as `.decision`, so Today prints R8's
"Still open, Leah asked on …" over a past-date proposal, while the Studio hub's
proposal row prints `dueLabel` → "Past due · {date}"
(`StudioQueueBuilder.swift:748-750`). Pre-existing, not introduced here — but
`RecordAndStudioSaySoTests`' claim holds for the decision rail alone.

### R3-14 · nit · the `State.overdue(due:)` Codable break costs a widget tap too (n-7 carried)

The associated value changes the synthesized JSON, so a snapshot from the
previous build fails to decode and `RecordSnapshotStore.load()` returns nil. The
note calls the cost "one pre-fetch paint"; `DeepLinkHandler.handleWidgetURL`
reads that snapshot as well and, with nil, resolves no row and falls back to
`.heroFrame`. Graceful, one launch after the update.
