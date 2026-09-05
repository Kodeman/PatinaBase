# Adversarial review — Wave 1 close-out, iOS lane, round 1 (2026-09-05)

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w1-integration`
(`git -C … rev-parse --show-toplevel` returns exactly that), branch
`approvals/w1-integration`. Reviewed range
`c65f9740609e95fc62ae19c2b588cc9cad166ce5..7032cacd3` — three commits, 26 files,
+1449 / −107.

```
7032cacd3 docs(approvals): W1 close-out — the iOS half of the round-two walk
21a54b166 fix(ios): the bell says what an approval is, and the money rail drops the retired word
6522b6ec1 fix(ios): the first submit no longer loses the CAS to its own seen stamp
```

Every commit stages explicit pathspecs; nothing outside `apps/mobile/Patina` and the
force-added lane note is touched. No `.env`, no `.claude/`, no migration, no
deploy. `git status --porcelain` is clean apart from the sandbox's EPERM lines on
`*.env.example`.

## Delivery against the ten items

| # | Item | Delivered | Note |
|---|------|-----------|------|
| 1 | W1R2-B1 CAS order + honest failure | Yes | order fix verified behaviourally (below) |
| 2 | W1R2-M1 immutability sentence | Yes | guard now exactly `outcomeLeg`'s |
| 3 | W1R2-M2 designer name on Stage-2 rows | Yes | via the projects the rail holds |
| 4 | W1R2-M3 unsent drafts off the feeds | Yes, **with a regression** | see M-1 |
| 5 | W1R2-m1 `markAllOpened` both legs | Yes | matches 00562's own policy |
| 6 | W1R2-m2 plural grammar | Yes | |
| 7 | iosa R3-02 "Past due" in body ink | Yes on the three named sites | see M-3 for the residue |
| 8 | W1R2-n1 asked-on clause | Yes in `DateDisplay.approval` | see M-2 for the other composer |
| 9 | W1R2-n4 bell titles | Yes | see m-2 for the cold-start hole |
| 10 | Badge definition comment | Yes | see m-1: the comment overclaims |

Nothing outside the list changed except two file splits SwiftLint's `file_length`
/ `type_body_length` forced (`DecisionsListViewModel.swift`, two new test suites,
`sectionBadgeLabel` onto `StudioQueueSectionKind`). All three are mechanical
moves, and `sectionBadgeCount`'s two branches are unchanged, so the spoken
number is the same number as before.

## Verified independently

**W1R2-B1, behaviourally.** The lane's order pin is a source-text scan. I wrote a
throwaway suite that drives `DecisionDetailViewModel.load` against fakes modelling
the server — `markDecisionViewed` moves the row's `updated_at`, `fetchApprovalReview`
returns whatever the row holds now, `respondToApproval` does the CAS — then submits.
It asserts the value the submit sends. Result below in "Gates". The reasoning
also checks out against the migrations: `mark_client_decision_viewed`
(00464:2211-2222) writes `updated_at = now()` **only while `viewed_at IS NULL`**,
`_respond_project_approval_checked` compares `v_decision.updated_at IS DISTINCT
FROM p_expected_updated_at` (00464:656), and `get_project_decision_reviews`
echoes `updated_at` back (00465:453).

**The retry mints a fresh idempotency key, and that is correct.** The receipt
lookup keys on `idempotency_key` and then compares `request_hash`, which embeds
`expectedUpdatedAt` (00464:634-648) — reusing the first attempt's key on a retry
carrying a different CAS value would raise `idempotency key was reused with a
different response`. The three-way re-read (already recorded / moved / unmoved)
is the right shape.

**W1R2-m1 matches the schema.** 00562's own header documents the app issuing
`channel=in.(in_app,push)`, and its policy `USING (auth.uid() = user_id AND
channel IN ('in_app','push'))` permits exactly that. The narrowing this fix
reverses was the regression.

**`sentAt` is on the wire.** `get_project_decision_reviews` builds `'sentAt',
decision.sent_at` (00465:451), and `list_my_project_decision_reviews`
(00467:135) / `get_project_decision_review` (00467:101) both delegate to it. The
field decodes.

**Copy.** Every new homeowner-visible string in the diff — "An approval needs
you", "Your approval was recorded", "This approval is closed", "Past due · Aug 22",
"Still open.", the badge values "one category" / "five things awaiting you" —
clears the refusals: no badge, no count chip, no red/green, no checkmark-as-status,
no shadow, no tab, no emoji, no "AI", no "gate", "task", "dashboard" or "overdue".
No guilt, no apology, no invented timing.

---

## M-1 (major) — the M3 filter closes the only in-app door to the review leg

`awaitsClientInFeed = isPublished && awaitsClient`
(`DecisionsAPIClient+ProjectApprovals.swift:166`) is now the predicate on
`DecisionsListViewModel.load` and `BadgeCountService.mergedDecisions`.

Work out what it actually removes:

- `awaitsClient == needsReviewConfirmation || canRespond`.
- `canRespond` requires `lifecycleStatus == "pending"`, and `publish_client_decision`
  sets `status = 'pending', sent_at = COALESCE(sent_at, now())` in one statement
  (00464:998, 00464:1061) — a `pending` row always has `sent_at`.
- `needsReviewConfirmation` requires `lifecycleStatus == "draft"`, and nothing but
  publish stamps `sent_at` — a `draft` row never has it.

So `isPublished` subtracts **exactly the review-confirmation rows and nothing
else**. The whole behavioural effect of the M3 fix is to remove the review leg
from every homeowner feed.

That leg has no other door. `AppRoute.decisionDetail` is pushed only from a row
(`HouseFirstRoot.swift:317`, `ContentView.swift:378`), and Today, the Studio hub
and the decision list all read the two filtered merges. The bell cannot supply
one either — the lane's own note says 00534 writes a row only on the transition
into `pending`. walk-r2 recorded the leg as **passing** and reached it from the
Studio hub: shot `walk-shots-r2/37-g1-draft-review.png` shows "Review exact
edition" with **Studio** selected in the tab bar. Build-sheet P-09 asks for
exactly this ("wire `confirm_project_decision_review` so review confirmation is
no longer web-only"), and W1R1-n2 was closed on it.

The code comment at `DecisionsAPIClient+ProjectApprovals.swift:161-163` asserts
"the review leg on a draft is still reachable by its own route (the detail
screen reads `get_project_decision_review` directly)". The detail screen does,
but no route pushes it. The claim names no door that exists.

Note the brief named "Today, Studio hub, bell" and the lane also filtered the
decision list; but even the three named surfaces include the one the walk used.
This needs an orchestrator ruling, not a silent merge: either keep the draft row
and change how it is DRAWN (the walk's complaint was "drawn as an ask with a due
date", not "present"), or accept that the review leg is web-only for Wave 1 and
say so.

## M-2 (major) — n1's guard lands on one of the two composers, so Today and the Studio now disagree

`DateDisplay.approval` drops the asked-on clause when `askedAt` is not before
`dueDate` (`DateDisplay.swift:126-134`). The Today Record card does not go
through it: `HouseRecordCard.swift:66-78` composes the same sentence itself —

```swift
case .overdue:
    let sentence = DateDisplay.stillOpen(
        designer: row.askedBy,
        askedOn: HouseRecordDates.short(row.date, calendar: calendar)
    )
```

— and `HouseRecordBuilder.state(for:now:)` (`HouseRecord.swift:485-495`) throws
the due date away when it returns `.overdue`, so the card cannot apply the guard
even if it wanted to.

Failure scenario: an approval asked on Sep 4, wanted by Sep 4, read on Sep 10.
Today prints "Still open, Leah asked on Sep 4."; the Studio hub and the decision
list, two taps away, print "Still open." The divergence is new — before this
diff both surfaces said the same thing. No test covers the card.

## M-3 (major) — "Past due" is still red, twice, one of them in the file the fix edited

The ruling reads "'Past due · {date}' in body ink, **never red — same refusal,
every surface**", and the vision refuses red status outright. Two money surfaces
still paint it:

- `InvoiceDetailView.swift:91` —
  `.foregroundStyle(isOverdue(invoice) ? PatinaColors.Text.error : PatinaColors.Text.primary)`
  on `statusHeadline`, which for a passed invoice is literally `"Past due"`
  (`:106`), set in `PatinaTypography.h2`. It is the largest type on the screen,
  and it sits directly above the due line this diff just moved out of the error
  ramp — one screen, two registers for one fact.
- `HouseRecordCard.swift:529` — `lateText` (the past-due invoice line on Today)
  in `PatinaColors.Text.error`, uppercase mono.

`MoneyPastDueCopyTests` pins the absence of `isPastDue ? PatinaColors.Text.error`
in the two invoice files, which both of these sites evade because neither reads
`isPastDue`. Strictly, brief item 7 named `DateDisplay.due` and three sites, and
those three are done — so this is a ruling-coverage call for the orchestrator,
not a missed instruction.

## m-1 (minor) — the badge-definition comment states an invariant the code does not hold

`BadgeCountService.swift:58-77` (item 10's deliverable) ends:

> `markAllOpened` marks BOTH legs (`W1R2-m1`), so a read cannot part them either.

`markAllOpened` does. `markOpened(id:)` — the per-row read, which is the path a
homeowner takes on nearly every notification — PATCHes
`notification_log?id=eq.<row>` (`NotificationsAPIClient.swift:94-96`), the id of
the `in_app` row the feed listed. Its `push` twin keeps `opened_at IS NULL`
forever. The divergence the ruling names is closed on the rare path and open on
the common one, and the comment the backend lane is meant to build against says
otherwise. Either widen `markOpened` to the entity's rows on both legs or delete
the sentence.

(The APNs badge itself is unaffected — R5's second pass counts unread `in_app`
rows — so this is hygiene and a false comment, not a wrong number.)

## m-2 (minor) — n4's "settled rows stop asking" is not guaranteed on a cold bell

`NotificationsViewModel.retitleApprovals` composes the title from
`BadgeCountService.shared.projectApprovals`. That array is populated only by a
badge refresh whose projection fetch succeeded; it is `[]` at launch and after
`clear()`. For any row the map does not cover, the fallback is an unconditional
rename:

```swift
if retitled.title == ProjectApprovalCopy.retiredBellTitle {
    retitled.title = ProjectApprovalCopy.bellOpen
}
```

So a Stage-2 approval the homeowner already answered still reads "An approval
needs you" whenever the bell loads before (or without) a successful projection
fetch — the second half of n4's defect, surviving in the window that matters most
(cold launch, tap the bell). The same fallback also renames legacy non-Stage-2
decision rows, whose state the projection will never cover. A safer fallback is
to leave an uncovered row's claim alone, or to await the projection the feed
depends on.

## m-3 (minor) — a fourth bell string flattens a distinction the detail screen keeps

`ProjectApprovalCopy.bellClosed = "This approval is closed"` covers both
`withdrawn` and `superseded`. The detail screen keeps them apart — "Your designer
withdrew this approval. Nothing is being asked of you here." vs "A later edition
has replaced this one. This edition is closed." (`ProjectApprovalCopy.swift:88-92`).
Item 9 asked for two titles (open, settled); this is an unrequested third, and it
gives one state two vocabularies on two surfaces, which is the shape P-16 exists
to close.

## n-1 (nit) — `theStampIsSeamed` asserts nothing about the seam

`WalkCASAndFeedTests.swift:60-75` installs `markDecisionViewed`, never calls
`load`, and then asserts `stamped == nil` ("nothing stamps until the screen
loads"). The only load-bearing line in it is a source-text `contains`. The
ordering pin beside it (`theStampGoesBeforeTheProjectionRead`) is also a
source scan — it would stay green if `markViewed`'s body stopped stamping. The
behavioural test I ran (see Gates) is what actually holds B1; it is worth
keeping rather than throwing away.

## n-2 (nit) — the lane note misattributes its own tests

`iosb-notes.md`'s Close-out says `ProjectApprovalActTests.theStampGoesBeforeThe
ProjectionRead` (it is `ApprovalCASOrderTests`), "Six tests in
`BellQueueFallbackTests`" (they are in `BellApprovalTitleTests`), and
"`sectionBadgeLabel` is now a pure `static func` on `StudioHubView`" (it is an
instance method on `StudioQueueSectionKind` — which the same document says
correctly 100 lines further down). Cosmetic, but the note is the program's
record.

## n-3 (nit) — three homeowner-visible "sign-off" strings survive the vocabulary argument

The n4 rationale is that "sign-off" is not the ask's name. `DecisionDeferral.swift:83-85`
still reads "…your designer needs your sign-off.", "Give your sign-off",
"CONFIRM YOUR SIGN-OFF". That is the legacy client-court path, outside the ten
items — flagged so the orchestrator can decide whether the vocabulary ruling
reaches it.

## n-4 (nit) — the detail screen's first paint now waits on the stamp

`load` awaits `markViewed` before `loadApprovalReview`, so the approval content
is behind one more serial round trip than it was. The order is required for
correctness; the cost is real and unmeasured. Worth a note if the detail screen
ever feels slow.

---

## Gates

Run by the reviewer, on the lane's head (`7032cacd3`), unsandboxed.

```
IOS_GATE_UDID=B6AD6271-E9E1-4BC6-B94A-F115E270CCAE …/apps/mobile/Patina/scripts/ios-gate.sh unit
  ━ Test run with 2458 tests in 269 suites passed after 7.743 seconds
    with 2 known issues.
  ** TEST SUCCEEDED **
  [exited with code 0]
```

2458 tests, 269 suites, exit 0 — the lane's own claim reproduces exactly. The
`CompanionCoachingModelTests` flake did not appear. `lint-delta` was NOT run by
this review: the gate's `lint-delta` tier adds and removes a detached git
worktree, which this brief forbids; the lane reports it green.

### The throwaway behavioural pin on W1R2-B1, and its negative control

A single-test suite driving `DecisionDetailViewModel.load` against fakes that
model the server (`markDecisionViewed` moves the row's `updated_at`;
`fetchApprovalReview` returns whatever the row holds now; `respondToApproval`
does the CAS), asserting the value the first submit sends. Written, run, deleted;
`git status` under `apps/mobile/Patina` is clean.

On the lane's head:

```
✔ Test "the expectedUpdatedAt submit sends is the post-stamp value" passed after 0.288 seconds.
✔ Test run with 1 test in 1 suite passed after 0.290 seconds.
** TEST SUCCEEDED **
```

Negative control — the same test with the two `await`s in `load` swapped back to
the pre-fix order (swap reverted immediately afterwards, file restored via
`git checkout --`):

```
✘ Expectation failed: (sent → ["2026-09-04T10:15:00+00:00", "2026-09-05T09:00:00+00:00"])
                   == ([postStamp] → ["2026-09-05T09:00:00+00:00"])
** TEST FAILED **
```

Two things fall out of that control. First, the ordering fix is what makes the
FIRST submit land — the walk's blocker is genuinely closed. Second, the retry
half would have masked the symptom on its own, at the cost of a second write on
every first submit; keeping both is right, and the retry should not be read as
redundant.
