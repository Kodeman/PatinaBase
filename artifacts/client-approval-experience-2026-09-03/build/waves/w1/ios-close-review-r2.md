# Adversarial review — Wave 1 close-out, iOS lane, round 2 (2026-09-05)

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w1-integration`
(`git -C … rev-parse --show-toplevel` returns exactly that), branch
`approvals/w1-integration`. Reviewed range
`c65f9740609e95fc62ae19c2b588cc9cad166ce5..6d2a0b9a8` — five commits, 38 files,
+2186 / −155.

```
6d2a0b9a8 docs(approvals): W1 close-out round two — the review's three majors
c93d56633 fix(ios): the reading keeps its door, the Record keeps one sentence, money keeps no red
456cf456d docs(approvals): adversarial review of the W1 close-out iOS lane
7032cacd3 docs(approvals): W1 close-out — the iOS half of the round-two walk
21a54b166 fix(ios): the bell says what an approval is, and the money rail drops the retired word
6522b6ec1 fix(ios): the first submit no longer loses the CAS to its own seen stamp
```

`git diff --name-only c65f97406...HEAD` touches 36 files under
`apps/mobile/Patina` and two force-added lane documents under
`artifacts/…/build/waves/w1/`. Nothing else: no `.env`, no `.claude/`, no
migration, no deploy, no `git add -A`. `git status --porcelain` is clean apart
from the sandbox's EPERM lines on `*.env.example`.

## Gates, run by this review

Both on the lane's head, unsandboxed, `IOS_GATE_UDID=B6AD6271-…`.

```
scripts/ios-gate.sh build
  ** BUILD SUCCEEDED **                                   [exited with code 0]

scripts/ios-gate.sh unit
  ━ Test run with 2463 tests in 271 suites passed after 8.193 seconds
    with 2 known issues.
  ** TEST SUCCEEDED **                                    [exited with code 0]
```

2463 tests / 271 suites, exit 0. The `CompanionCoachingModelTests` load flake did
not appear. `lint-delta` was NOT run: that tier adds and removes a detached git
worktree, which this brief forbids; the lane reports it green and the two
SwiftLint-forced moves it names (`stillOpenSentence`, `HouseRecordRedRefusalTests`)
are visible in the diff.

### The behavioural pin on W1R2-B1, re-run with its negative control

A throwaway suite drove `DecisionDetailViewModel.load` against fakes modelling
the server (`markDecisionViewed` moves the row's `updated_at`;
`fetchApprovalReview` echoes whatever the row holds now; `respondToApproval` is
the CAS), then submitted and asserted the value the FIRST submit sent. Written,
run, deleted; `git status --porcelain -- apps/mobile/Patina` is clean and
`DecisionsViewModel.swift:197` is back to `await markViewed(decisionId:)`.

On the lane's head:

```
✔ Test "the expectedUpdatedAt the first submit sends is the post-stamp value"
  passed after 0.360 seconds.
** TEST SUCCEEDED **
```

Negative control — the same test with the two `await`s in `load` swapped back to
the pre-fix order (swap reverted immediately after, file restored with
`git checkout --`):

```
✘ Expectation failed: (sent → ["2026-09-04T10:15:00+00:00",
                               "2026-09-05T09:00:00+00:00"])
                   == ([post] → ["2026-09-05T09:00:00+00:00"])
** TEST FAILED **
```

The blocker the walk found is genuinely closed, and the retry is not redundant —
without the ordering fix it is what would have masked the symptom at the cost of
a second write on every first submit.

## Delivery against the ten items

| # | Item | Delivered |
|---|------|-----------|
| 1 | W1R2-B1 CAS order + honest failure | Yes — proven behaviourally above |
| 2 | W1R2-M1 immutability sentence | Yes — guard is exactly `review.canRespond` |
| 3 | W1R2-M2 designer name on Stage-2 rows | Yes — `asWaitingDecision(from: projects)` |
| 4 | W1R2-M3 unpublished rows off the feeds | **No — deliberately inverted.** See R2-M1 |
| 5 | W1R2-m1 `markAllOpened` both legs | Yes, **with a new defect** — see R2-M3 |
| 6 | W1R2-m2 plural grammar | Yes |
| 7 | iosa R3-02 "Past due" in body ink | Yes, and r1's residue is now closed too |
| 8 | W1R2-n1 asked-on clause | Yes, on both composers (r1's M-2 closed) |
| 9 | W1R2-n4 bell titles | Yes — see the carried m-2/m-3 |
| 10 | Badge definition comment | Yes, but it still overclaims — carried m-1 |

## Round one's findings, re-checked

| r1 | State |
|----|-------|
| M-1 (review leg lost its door) | **Answered by inversion.** The row is back on the feeds; see R2-M1 / R2-M2 |
| M-2 (Today vs Studio disagreed) | **Fixed.** `DateDisplay.askedOnClauseEarned` is one guard, `State.overdue(due:)` carries the day, `RecordAndStudioSaySoTests` reads both surfaces from one decision |
| M-3 (red on two money surfaces) | **Fixed.** `InvoiceDetailView` h2 and `HouseRecordCard.lateText` to `Text.primary`; `grep -c PatinaColors.Text.error` over `Patina/` is 8, none of them a money or approval date (six are error messages; two are proposal expiry, ruled) |
| m-1 (badge comment overclaims) | **Open**, declined in the note |
| m-2 (cold-bell rename) | **Open**, declined |
| m-3 (`bellClosed` flattens) | **Open**, declined |
| n-1 (source-scan pins) | **Open**, declined |
| n-2 (note misattributes 3 suites) | **Open**, declined — the note now says so in its own words |
| n-3 (three "sign-off" strings) | **Open**, declined |
| n-4 (extra serial round trip) | **Open**, documented |

No regression found in the r1-verified work: the CAS order, the retry's fresh
idempotency key, the `in.(in_app,push)` policy match, `sentAt` on the wire, and
the copy refusals all still hold. Every new homeowner-visible string in the
round-two commit — "Leah asked you to read this edition.", "Still open.",
"Past due · Aug 22", "one category" — clears the refusals: no badge, no count
chip, no red/green, no checkmark-as-status, no shadow, no tab, no emoji, no
"AI", no "gate", "task", "dashboard" or "overdue"; no guilt, no apology, no
invented timing.

---

## R2-M1 (major, 0.95) — item 4 is delivered inverted, against a written ruling

Brief item 4: "Exclude unpublished rows from **every** homeowner-facing merge
(Today, Studio hub, bell)." `rulings-2026-09-04.md`, *Rulings made at Wave 1
close*: "Drafts are excluded now; the viewer-role field is a Wave 2 migration
item."

The lane does the opposite. `awaitsClientInFeed` is deleted; both merges are
back to `filter(\.awaitsClient)` (`DecisionsListViewModel.swift:48`,
`BadgeCountService+Decisions.swift:52`), and a source pin now asserts neither
reads `isPublished` — the exclusion is not merely absent, it is pinned out.
What survives of item 4 is narrower: `asWaitingDecision` withholds `due_date`
from an unissued row, and `HouseRecordBuilder.title(for:)` gains one branch so
the Record calls it a reading.

The argument for it is the one my own round-one M-1 laid out and is not in
dispute: `isPublished` subtracts exactly the review-confirmation rows, those
rows have no other door on the phone, and a published-only feed puts P-09's
review confirmation back to web-only — which walk-r2 recorded PASSING, reached
from the Studio hub (`walk-shots-r2/37-g1-draft-review.png`).

This is the right shape of answer and it is escalated honestly in
`iosb-notes.md` ("⚠ For the orchestrator"). It is still an item delivered
against its brief and against a ruling in the ruling file, and only the
orchestrator can bless that. It also re-widens iosb3-M2: a studio co-member in
the client app now sees the studio's unissued drafts as things waiting on her.
The lane's read — that the KIND of exposure is unchanged, because
`list_my_project_decision_reviews` already returns published studio-wide rows to
a co-member and the projection carries no viewer role — checks out against
00467; drafts widen the existing hole rather than opening a new one.

**Fix:** an orchestrator ruling, not a code change. Either bless the inversion
and amend the ruling line, or take the exclusion back (one line in each merge)
and accept the review leg as web-only for Wave 1, recording that against P-09.

## R2-M2 (major, 0.85) — the reading is de-approval-ised on the Record only; the Studio hub and the bell still call it an approval waiting on her

`StudioQueueItemRow.awaitsReading` is read in exactly one place —
`HouseRecordBuilder.title(for:)` (`HouseRecord.swift:443`). `grep -rn
"awaitsReading"` over `Patina/` returns the flag's definition, the one producer
and that one consumer, and nothing else.

The Studio hub's own decision row does not go through it. `pendingDecisionRow`
(`StudioQueueBuilder.swift:294-320`) builds from `context.pendingDecisions`,
which is `input.decisions.filter { !$0.isResolved }` — and an unissued draft is
`status = "draft"`, `responded_at = nil`, so `isResolved` is false and the row
is in. Its plural detail line is:

```swift
: "\(PatinaCount.inWordsCapitalized(decisions.count)) approvals are waiting on you"
```

So one real approval plus one unissued edition reads **"Two approvals are
waiting on you"** — the exact claim the lane's own commit message forbids ("the
copy must not call it an approval"), on the surface walk-r2 shot the reading
from. It also feeds the header count and the section badge
(`attentionSummary.awaitingCount`).

It reaches the bell as well, which is the third surface item 4 named:
`NotificationsViewModel.currentFallbackRows` builds the stand-in rows from this
same `StudioQueueBuilder.build` snapshot and composes each body as
`detail · meta` (`NotificationsViewModel.swift:162-215`), so the bell's
decision stand-in carries the same sentence.

Failure scenario: one published approval and one frozen-but-unissued edition on
one project. Today says "Leah asked you to read this edition." (correct); the
Studio hub one tap away says "Two approvals are waiting on you"; the bell says
it again. Three surfaces, two vocabularies, and the second one makes an ask the
studio has not made.

**Fix:** carry `isUnissuedApproval` into `pendingDecisionRow` — count and name
the readings apart from the approvals, or exclude them from that aggregate's
noun — and pin it in `MoneyAndStudioCopyTests` / `ApprovalFeedGuardTests`
alongside the Record title pin that already exists. (Moot if the orchestrator
reverses R2-M1.)

## R2-M3 (major, 0.70) — the widened opened-write can rewrite a push row's delivery status

Item 5 widened the mark-all PATCH from `channel=eq.in_app` to
`channel=in.(in_app,push)` (`NotificationsAPIClient.swift:41-45, 115-125`). The
request body is unchanged:

```swift
let body: [String: String] = ["opened_at": iso, "status": "opened"]
```

and the only other predicate is `opened_at=is.null`. There is no status filter
on the write, and 00562's `USING` clause has none either (its `WITH CHECK` only
constrains the value being written, to `delivered|opened|clicked`). So the PATCH
now reaches unread rows on the push leg in **any** prior state and stamps them
`opened`.

That matters because the push leg is the one that actually carries delivery
state. `notify_client_attention` inserts the push envelope as
`status='queued'` (00534:192), and `apns-send` stamps it `delivered` or
`failed` with an `error` string (`apns-send/index.ts:216-238`). A homeowner who
taps "mark all read" over a push that failed turns `failed` into `opened` — the
record now says she read a notification that was never delivered. The `error`
column survives; the status does not.

Nothing in Wave 1 reads that status, so no number moves today: the springboard
badge and the bell both count `in_app` rows. But the rulings park the first-notice
retry ("a retry sweep rides with P-28, Wave 3 backend") and a sweep keyed on
`status = 'failed'` would skip exactly the rows this write has laundered. It is
also a false claim inside the program's own record, which is the thing this
program is about.

**Fix:** add `status=in.(queued,sending,delivered,unconfirmed)` (or
`status=not.in.(failed,suppressed)`) to the mark-all PATCH, and pin it in
`NotificationsAPIClientContractTests` beside the channel pin.

## m-1 (minor, 0.95, carried) — item 10's comment still states an invariant the code does not hold

`BadgeCountService.swift:76-77` still ends: "`markAllOpened` marks BOTH legs
(`W1R2-m1`), so a read cannot part them either." `markOpened(id:)`
(`NotificationsAPIClient.swift:94-107`) — the per-row read, the path a homeowner
takes on nearly every notification — still PATCHes
`notification_log?id=eq.<row>`, the id of the one `in_app` row the feed listed.
Its push twin keeps `opened_at IS NULL` forever. The badge number is unaffected;
the sentence the backend lane is meant to build against is not true. Either
widen `markOpened` or delete the sentence.

## m-2 (minor, 0.80, carried) — a settled approval still reads "An approval needs you" on a cold bell

`NotificationsViewModel.retitleApprovals` composes from
`BadgeCountService.shared.projectApprovals`, which is `[]` at launch and after
`clear()` and is filled only by a refresh whose projection fetch succeeded. For
an uncovered row the fallback is unconditional:

```swift
if retitled.title == ProjectApprovalCopy.retiredBellTitle {
    retitled.title = ProjectApprovalCopy.bellOpen
}
```

Cold launch → tap the bell is the common case, and there an already-answered
Stage-2 approval goes on asking. The same fallback also renames legacy
non-Stage-2 rows the projection will never cover.

## m-3 (minor, 0.60, carried) — `bellClosed` flattens withdrawn and superseded

`ProjectApprovalCopy.bellClosed = "This approval is closed"` covers both
dispositions; the detail screen keeps them apart (`:88-92`). Item 9 asked for
two titles; this is a third, and one state with two vocabularies across two
surfaces is the shape P-16 exists to close.

## m-4 (minor, 0.80, new) — two files in this diff disagree about what the badge counts

`NotificationsAPIClientContractTests.swift:47-51` justifies item 5 with: the
unmarked push twin is "a row every server-side unread count, **the springboard
badge included**, still sees." `BadgeCountService.swift:58-70` — item 10's
deliverable, the file that exists to make this definition single — says the
badge is "unread `in_app` rows … **never the `push` leg**", and R5's second pass
in the rulings says the same. One of the two sentences is wrong (the test's),
and it is the kind of drift item 10 was added to prevent. Correct the test's
rationale to the `notification_log`-consistency argument, which is the true one.

## n-1 (nit, 0.95, carried) — the two W1R2-B1 order pins are source-text scans

`theStampIsSeamed` installs `markDecisionViewed`, never calls `load`, and asserts
`stamped == nil`; `theStampGoesBeforeTheProjectionRead` compares `range(of:)`
offsets in the file's text and would stay green if `markViewed`'s body stopped
stamping. The behavioural version above passes on the head and fails on the
swap; it is worth keeping rather than throwing away twice.

## n-2 (nit, 0.95, carried) — the lane note still misattributes three of its own suites

`iosb-notes.md` Close-out (round one) still says
`ProjectApprovalActTests.theStampGoesBeforeTheProjectionRead` (it is
`ApprovalCASOrderTests`), "Six tests in `BellQueueFallbackTests`" (they are in
`BellApprovalTitleTests`), and "`sectionBadgeLabel` is now a pure `static func`
on `StudioHubView`" (it is `badgeLabel(count:)` on `StudioQueueSectionKind`).
The round-two section lists the finding as owed rather than fixing it.

## n-3 (nit, 0.90, carried) — three homeowner-visible "sign-off" strings on the legacy path

`DecisionDeferral.swift:83-85`. Outside the ten items; flagged so the
orchestrator can rule whether the n4 vocabulary argument reaches the legacy
client-court sign-off.

## n-4 (nit, 0.70, carried) — the detail screen's first paint waits on the stamp

Required for CAS correctness, and for a Stage-2 row the guard
`decision?.viewed_at == nil` never short-circuits, so the RPC is issued on every
open. Cost is real, unmeasured, and documented.

## n-5 (nit, 0.90, new) — two comments now describe a red that no longer exists

- `DateDisplay.swift:129-131`: `isStillOpen` "drives body ink instead of muted —
  never the error ramp, **which stays money's**." As of R3-02 money has no ramp
  either.
- `ProjectApprovalScreen.swift:11`: the header still lists "the past-due date in
  `PatinaColors.Text.error`" among the things this screen refuses to draw. That
  ramp is gone from every money surface; the sentence names a ghost.

## n-6 (nit, 0.60, new) — one concept, two predicates, held equal by a trigger

`awaitsReadingOnly` is publication-based (`!isPublished &&
needsReviewConfirmation`); `isUnissuedApproval` is status-based
(`isProjectArtifactApproval && status == "draft"`). One drops the date, the
other picks the word, and they agree only because 00171's guard forbids any
transition back to `draft`
(`draft→pending`, `pending→responded|expired`, `responded|expired→pending`). If
a future migration ever allows a revision to return a sent row to `draft`, the
Record would call it a reading while the row kept a due date. Worth one line of
comment naming 00171 as the reason the two are one.

## n-7 (nit, 0.50, new) — the snapshot break costs one widget tap as well as one paint

`HouseRecordRow.State.overdue` gained an associated value, so the synthesized
`Codable` shape changed and a snapshot written by the previous build fails to
decode. `RecordSnapshotStore.load()` swallows that and returns nil, as the
comment says. The note records the cost as "one pre-fetch paint"; it is also one
`DeepLinkHandler.handleWidgetURL` — a widget row tapped on the first launch
after the update resolves no row and falls back to `.heroFrame`
(`DeepLinkHandler.swift:338-341`). Graceful, one launch, worth a line in the
note rather than a change.

---

## Verdict

**fix.** No blocker: the gates are green, the ten items are all present in some
form, and no homeowner-visible string breaks a refusal. Three majors stand —
R2-M1 needs an orchestrator ruling (an item delivered against its brief and
against a written ruling, for a reason the brief's author could not have
weighed), R2-M2 is that decision carried through only one of its three surfaces,
and R2-M3 is a new state corruption introduced by item 5's widening. The seven
minors and nits are polish, six of them carried unfixed from round one by the
lane's own account.
