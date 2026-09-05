# iOS-B lane notes — Wave 1 (P-09, P-24 iOS half)

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w1-iosb`, branch
`approvals/w1-iosb`, base `6600cc069986ba6e948d7201e2dd2d0978f5b0ef`.

## What I found before writing anything

**The list RPC.** `list_my_project_decision_reviews()` is defined in
`supabase/migrations/00467_stage2_client_access_repair.sql:135` (NOT 00440 — the brief's
number is the proposal's, the repair migration is where the body actually lives). It takes
no arguments, returns `jsonb` (`[]` for an unauthenticated caller), and fans out over
`get_project_decision_reviews(project_id)`, whose latest body is
`00465_project_approval_notification_traceability.sql:370`. The per-row projection is
camelCase and is exactly the shape `packages/supabase/src/hooks/use-project-approvals.ts`
parses in `parseProjectApprovalReview` — so the Swift model decodes the same key names the
web does, with no PostgREST aliasing.

**The two act RPCs.**
- `confirm_project_decision_review(p_decision_id uuid, p_payload jsonb, p_idempotency_key text)`
  — `00463_project_approval_authority_evidence.sql:1467`. `p_payload` admits exactly
  `authorityRevision` (positive int32), `artifactHash` (lowercase SHA-256), `reviewMethod`
  (must be `portal_clickthrough` — R1 keeps it). Refuses unless the decision is still
  `draft` and both the revision and the hash match. Any other payload key is a
  `invalid_parameter_value`.
- `respond_project_approval(p_decision_id, p_payload, p_expected_updated_at, p_idempotency_key)`
  — `00464_project_approval_lifecycle.sql:811`, delegating to
  `_respond_project_approval_checked` (`:496`). `p_payload` admits exactly one of
  `outcome` / `optionId`. The server gates on: actor is the frozen decision lead,
  `updated_at` matches (`serialization_failure` otherwise), status is `pending`, the
  approval is published, and the lead's review confirmation exists for the current
  revision + hash. So the client's "can respond" predicate has to be
  `pending && active && reviewComplete && outcome == nil` — which is what
  `approval-ask.tsx:527-541` computes. iOS now computes the same thing.

**What was actually on iOS.** `DecisionsAPIClient.swift:245` already selects
`coordination_kind,court,approval_contract`, and `:145-149` (`isClientSignoff`) admits only
`approval_contract == nil`. A `project_artifact_v1` row therefore fell straight through to
the option-card `ForEach` — and a Stage-2 decision DOES carry `client_decision_options`
rows (one per canonical outcome; `_respond_project_approval_checked` looks the option up by
`approval_outcome`). So a homeowner was shown three unlabelled option cards with "Choose
this", each of which would have gone to `apply_client_decision` and been refused.

## What I decided

- The Stage-2 branch keys off the DECISION (`approval_contract == 'project_artifact_v1'`),
  never off the review having loaded. If the list RPC fails, the screen says so and still
  refuses the option-card path — a failed fetch must not fall back to the wrong ceremony.
- The detail screen finds its row by scanning the caller-global list and matching
  `decisionId` case-insensitively (deep links carry whatever case the sender used).
  `get_project_decision_review(uuid)` exists and is granted, but the brief pins the list
  RPC and it is the one the web reads.
- Consequence copy is the brief's, not `approval-ask.tsx`'s: the web still says "Accept this
  exact **artifact**" and "Hold **the gate** while…". "Gate" is refused on every client
  string, and "artifact" is studio vocabulary. iOS ships "edition" and "Hold this".
- The header's own due line is suppressed on the Stage-2 branch. Two reasons: the branch
  prints the due date itself (duplication otherwise), and the header paints a past-due date
  in `PatinaColors.Text.error` — red status on the approval surface, refused.
- No stamp, no recorded-outcome block. P-16 rules the stamp words and it is Wave 2; the
  existing resolved banner in the header already says the decision is answered.
- Deferral acts ("Not yet" / "Neither of these") are left drawing on the Stage-2 branch.
  They are message-only acts that predate this work and already draw on the option-less
  client-court sign-off; suppressing them is a copy ruling, not a P-09 line. Flagged as an
  advisory for Wave 2 instead.
- **P-24**: there is no badge on `PatinaTabBar` — it draws four words and a mark, no counts.
  The only in-product numeric badge fed by `BadgeCountService.attentionCount` is the clay
  count capsule inside `DailyGreetingHeader.studioControl` (the Studio pill, B-1's fallback
  door for the root without a bar). That capsule is what R5 retires, so that is what came
  out — together with the `attentionCount` parameter, the `StudioControlLabel.waitingValue`
  VoiceOver value that spoke the same number, and the `DailyRoomView` call site. The bell's
  `UnreadBadge` is fed by `unreadNotificationCount`, not `attentionCount`, and is out of
  P-24's scope as briefed.

## What I could not verify

- No local Supabase round trip: the backend lane owns the stack this wave, so the two act
  RPCs are pinned by their migration definitions and by the parameter names the client
  sends, not by a live call.
- No simulator walk. The gates below are build + unit + lint-delta only.

## One instruction I could not follow as written

The brief says to commit the lane log. `.gitignore:7` is a bare `build/`, which matches
`artifacts/client-approval-experience-2026-09-03/build/` — the whole wave directory, the
rulings and the build sheet included, is ignored by design and untracked in the main
checkout. `git add` refuses it and only `-f` would get past, so this file stays where every
other lane's notes are: the main checkout, uncommitted. Say the word if the wave wants
`build/` un-ignored and I will not be the lane that force-adds it.

---

# Round-1 fix pass (2026-09-04)

Six findings from the adversarial review, all addressed. Two blockers, four majors.

## iosb-B1 — the ceremony was unreachable for the homeowner (blocker)

The reviewer is right and it is the whole item. `00467_stage2_client_access_repair.sql:18-38`
rewrites BOTH raw `client_decisions` SELECT policies a homeowner can reach to
`approval_contract IS DISTINCT FROM 'project_artifact_v1'`, on purpose — Stage-2 is meant
to be read only through the sanitized projections. So `fetchDecision(id:)` (a PostgREST
GET on `client_decisions`) returns nil for the very person being asked, `load()` set
`error = "Couldn’t load this decision"`, and the P-09 branch — keyed off
`decision?.isProjectArtifactApproval` — never fired. It worked only for a studio
co-member, which is exactly who a sim walk would have signed in as. My "the branch keys
off the DECISION, never off the review" decision was the defect.

Inverted, per the reviewer's fix:

- New `DecisionsAPIClient.fetchProjectApprovalReview(decisionId:)` on
  `get_project_decision_review(p_decision_id uuid)` (00467:101) — definer, `GRANT EXECUTE
  … TO authenticated`, and `NULL` (four bytes of `null` over the wire) for a nonexistent,
  legacy or unauthorized id. It is the exact single-row read a detail screen wants; the
  caller-global `list_my_project_decision_reviews` came out with it (nothing else called
  it, and a list read to answer a one-row question is the wrong shape).
- `isStage2Approval` now reads `approvalReview != nil || decision?.isProjectArtifactApproval
  == true` — the projection first, the row second (for the studio co-member, and for a
  Stage-2 row whose projection failed, which must still not fall through to option cards).
- `loadApprovalReview` asks for the projection whenever the row did NOT arrive, or arrived
  carrying the contract. Only a row that loaded and is plainly legacy skips the RPC.
- `load()` no longer calls a missing row a failure when the projection arrived:
  `if self.decision == nil, self.approvalReview == nil { error = … }`.
- `messageRoute` and `resolveDiscussThread` fall back to `approvalReview.projectId`, so
  "Discuss this" and "Message your designer" still have a thread when the row is hidden.

## iosb-B2 + M1 + M4 — one structural fix

The Stage-2 branch drew `DecisionDetailView`'s header, and the header mounted
`resolvedBanner`: sage `checkmark.seal.fill` + "You’ve responded to this decision" —
green status, checkmark-as-status, and the ask called a decision. It also drew the
deferral pair ("Not yet" / "Neither of these" over three named outcomes) and a past-due
date in `PatinaColors.Text.error`.

Rather than bolt three `!isStage2Approval` guards onto a file that is already over
`file_length`, the Stage-2 branch is now a screen of its own —
`Views/ProjectApprovalScreen.swift` — mounted first in the body and drawing the whole
surface: eyebrow, heading, a flat (untinted) failure line, `ProjectApprovalBlock`, and a
plain "Discuss this with your designer" link. Nothing legacy can reach it, which is also
what makes M1 fixable: the vision pin is now `arguments:`-parameterised over the two files
that ARE the branch (screen + block) instead of certifying one file while the violation
lived in another. A second pin asserts the screen reaches none of `resolvedBanner`,
`deferralActs`, `optionCard`, `ceremony(`.

The bubble glyph went with the discuss link on this surface only — it is the one icon that
would have kept `systemName:` in the ban's blast radius, and the ceremony carries no icons.

## iosb-M2 — withdrawn / superseded

`disposition` is now readable (`isWithdrawn` / `isSuperseded` / `isClosedByDisposition`),
the three draft predicates exclude a closed disposition, and the block draws a `closureLeg`
where the acts would be. Precedence is the house's own (`client-attention.ts:55-71`):
disposition ahead of outcome.

## iosb-M3 — the answered approval names its answer

`closureLeg` reads `viewModel.answeredOutcome ?? review.recordedOutcome` and prints one
flat line. `hasAnsweredApproval` became computed off a new `answeredOutcome`, so the
outcome submitted in-session survives `chosenOutcome = nil`. Words per P-16/R8:
approved → "You approved this edition."; changes_requested → "You returned this edition for
revision."; needs_discussion → "You held this edition to talk it through with your
designer." No stamp — that is still P-16/P-17 in Wave 2.

## iosb-M5 — two untrue retry instructions

- `reviewUnavailable` → "This edition isn’t ready to be confirmed. Your designer has to
  send it again." (a missing frozen authority revision is a property of the snapshot; a
  retry cannot fix it, and "the frozen authority revision was not supplied" is studio
  vocabulary).
- `unavailable` → "We couldn’t open this approval." (the same branch catches a caller the
  projection will never open for; pull-to-refresh still exists, the sentence just stops
  promising it will help).

## Still not verified

Same two gaps as round one, unchanged: no local Supabase round trip (the backend lane owns
the stack) and no simulator walk. Build, unit and lint-delta are the evidence.

---

# Round-2 fix pass (2026-09-04)

Four findings: one blocker, three majors. All four addressed. Gates re-run green
(build · unit 2379/2379 · lint-delta no new warnings).

## iosb2-B1 — the ceremony had no in-app door (blocker)

Round 1 fixed the DETAIL screen and, in doing so, deleted the list read the
brief had actually asked for. The reviewer is right that the two are different
problems: `get_project_decision_review(uuid)` answers "draw this approval",
and nothing answered "she has an approval". Every surface that could have sent
her — the NEEDS YOU eyebrow (`HouseRecord.swift:244` → `badges.pendingDecisions`),
the Studio's "Awaiting you" (`StudioQueueBuilder.itemizedAwaitingRows`), the
decision list (`DecisionsListViewModel`) — reads `listPending()`, a PostgREST
GET on `client_decisions`, and `00467_stage2_client_access_repair.sql:18-38`
rewrote both SELECT policies she can reach to
`approval_contract IS DISTINCT FROM 'project_artifact_v1'`. So the one read
those feeds make is the one read that can never return her own approvals. A
push deep link was the whole door, on the same wave R5 took the Studio count
off because "the eyebrow carries the truth".

Built, per the reviewer's fix and the brief's original first instruction:

- `DecisionsAPIClient.fetchProjectApprovalReviews()` on
  `list_my_project_decision_reviews()` (00467:135 — no arguments, `[]` for an
  unauthenticated caller, and the same per-row projection the detail read
  serializes, so one model decodes both).
- `RemoteProjectApprovalReview.awaitsClient` — `needsReviewConfirmation ||
  canRespond`. A reviewed draft is with the STUDIO and a closed or answered one
  is with nobody; NEEDS YOU is what needs HER, so only those two states become
  rows.
- `RemoteProjectApprovalReview.asWaitingDecision` — the projection as a
  `RemoteClientDecision`, so every existing consumer (eyebrow, Studio rows,
  notifications, the list) works unchanged and the route is the same
  `.decisionDetail(decisionId:)` the ceremony already opens. `approval_contract`
  is carried verbatim so the detail screen knows the ceremony before the
  projection lands; `lifecycleStatus` is carried unchanged rather than
  flattened to `pending` (both `draft` and `pending` read as unresolved
  downstream, so there was nothing to gain by overstating it). The projection
  carries no project name and no designer, so the row names neither.
- `BadgeCountService.mergedDecisions(pending:approvals:previous:)` — static and
  pure, folding the two reads into the one feed. A half that failed keeps its
  own last-known rows rather than blanking a feed the other half answered;
  both failing is the only nil, which is what still tells `performRefresh` to
  keep the floor it has.
- `DecisionsListViewModel.load()` reads both, and a failed projection leaves
  the ordinary decisions standing.

## iosb2-M1 — the money truncated where the web rounds (major)

`abs(cents) / 100` is an integer divide. $1,250.60 read "+$1,250" on iOS and
"+$1,251" in the email and on the web (`moneyInWords`,
`standing-sentence.ts:148`, is `Intl.NumberFormat` at
`maximumFractionDigits: 0`, which rounds), and a 99-cent delta printed "+$0"
under a row that exists only because the cost changed. Now
`PatinaCurrency.formatWholeDollars` — the house's own whole-dollar formatter,
already pinned at `99 → "$1"` and `123_456 → "$1,235"` in
`CurrencyFormattingTests` — which both rounds and formats as currency instead
of a "$" typed in front of a decimal number.

## iosb2-M2 — the present tense over an answer already given (major)

`submitApprovalResponse` does not refetch the projection, so `canRespond` is
still true on the row in hand and the immutability sentence drew above
"You approved this edition." The guard now asks `!viewModel.hasAnsweredApproval`
first. Refetching was the alternative; it costs a round trip to learn something
the screen already knows.

## iosb2-M3 — the bell's numeric capsule (major)

Ruled inside R5 rather than escalated: R5 retires "the iOS tab badge and any
in-product numeric badge", and the wording is about badges, not about which
service feeds them. But the word doing the work is *numeric* — so the number
came off and the mark stayed. `UnreadBadge` (a clay capsule printing the count,
capped "9+") is now `UnreadMark`, a fixed 8 pt clay dot, and the button's
accessibilityValue says "Unread notifications" instead of speaking the number.
That also ends the Dynamic Type problem the count had (RL1C-04): a mark that
draws no text has no ramp to cap.

**For the orchestrator**: if R5 was meant to leave the bell alone, this is the
commit to revert (`iosb2-M3`) — nothing else depends on it.

## Still not verified

Unchanged from rounds one and two: no local Supabase round trip (the backend
lane owns the stack, so the list RPC is pinned by its migration definition and
by the parameter shape the client sends, not by a live call), and no simulator
walk. Build, unit and lint-delta are the evidence.

## One thing the fix turned up that the review did not name

A studio co-member is the one caller BOTH reads answer for — 00467 hides the
Stage-2 row from the homeowner, not from the studio — so the merge would have
carried one obligation twice, under one id, into a `ForEach`. Both merges
(`BadgeCountService.mergedDecisions` and `DecisionsListViewModel.load`) drop a
projection row whose id the pending read already returned. Pinned by
`ProjectApprovalDoorTests.anApprovalVisibleToBothReadsIsNotDoubled`, which is
also why `ProjectApprovalFixture.decision` grew an `id:` parameter (defaulted,
so no existing caller moved): a test needing a SECOND row could not use the
one decision every other fixture is about.

`mergedDecisions` lives in a new `BadgeCountService+Decisions.swift` rather
than in `BadgeCountService.swift`: adding it inline pushed that file to 526
lines and lint-delta caught the new `file_length` warning. Same split, same
reason, as `DecisionsAPIClient+ProjectApprovals.swift`.

## Gates (final tree, commit `0369544d7`)

```
ios-gate.sh build       ** BUILD SUCCEEDED **
ios-gate.sh unit        ━ Test run with 2380 tests in 257 suites passed
                          after 7.630 seconds with 2 known issues.
                        ** TEST SUCCEEDED **
ios-gate.sh lint-delta main
                        ✓ lint-delta: no new warnings in touched files
```

The two known issues are pre-existing and not this lane's: a BrandVoiceLint
expectation on "curated_mix" (`BrandVoiceLintTests.swift:168`) and
`RoomLifecycleTests.theTodayRailFollowsALocalDelete`.

Round 2 adds nine tests — `ProjectApprovalDoorTests` (six), the money pair, and
the immutability-after-answer pin — and rewrites three that pinned the retired
numbers (`AttentionCountTests`, `DynamicTypeLayoutTests`, `HomeHeaderTests`).
The suite ran 2379 mid-pass and 2380 after the de-duplication test; I did not
measure round 1's own total, so I am not quoting one.

---

# Close-out — the round-two walk's iOS findings (2026-09-05)

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w1-integration`
(`git rev-parse --show-toplevel` returns exactly that), branch
`approvals/w1-integration`, base `c65f9740609e95fc62ae19c2b588cc9cad166ce5`.
Every file touched is under `apps/mobile/Patina`; no migration was minted, no
edge function edited, nothing deployed.

## W1R2-B1 (blocker) — the first submit always lost the CAS

Two halves, and the first one is an ORDER.

`mark_client_decision_viewed` (00464:2211-2222) writes `viewed_at = now(),
**updated_at = now()**`. `updated_at` is the exact value
`respond_project_approval` does its CAS on (00464:811), and the client-safe
projection echoes it back as `updatedAt` (00465:453). `DecisionDetailViewModel
.load` read the projection first and stamped afterwards — so the screen was
holding an `updatedAt` its own stamp had invalidated one line later, and the
FIRST "Submit response" on every published Stage-2 approval lost the CAS.
The second open succeeded because `viewed_at` was already set and the stamp
became a no-op, which is exactly what the walk observed.

**Fixed by ordering**, not by re-reading: the stamp goes before
`loadApprovalReview`, so the projection is read after the row has settled and
carries the post-stamp value. A second open is unchanged — the RPC only
UPDATEs while `viewed_at IS NULL`, so it never moves `updated_at` twice.

The stamp moved behind a seam (`markDecisionViewed`) for the same reason the
acts are: an ordering defect is only pinnable where a test can watch both
calls. `ProjectApprovalActTests.theStampGoesBeforeTheProjectionRead` holds the
order inside `load`'s own body (and that it is sent once, not once at each
end); `theStampIsSeamed` holds the call site.

**Second half — the honest failure path.** `submitApprovalResponse` now buys
exactly one re-read before it shows the sentence, and the re-read has three
answers:

- the outcome is already recorded → name it (the first call landed and only
  its reply was lost; writing it twice under a fresh idempotency key would be
  the wrong repair),
- the row moved → retry once with the value it moved to,
- nothing changed → the failure was not a CAS miss, and the sentence stands.

Four tests: `aLostCASIsRetriedOnce` (two sends, one re-read, never a loop),
`anAlreadyRecordedAnswerIsNamed`, `aFailureOverAnUnmovedRowIsHonest`,
`aFailedReReadStillSaysSo`.

## W1R2-M1 — the immutability sentence

"You are approving edition N, exactly as shown." now draws on exactly
`outcomeLeg`'s guard: `!hasAnsweredApproval, review.canRespond`. It was
`needsReviewConfirmation || canRespond`, which put it on the review screen —
where the act on offer is READING the edition and nothing is being approved —
and kept it there after the confirmation, because the projection in hand still
says the review is outstanding. `theImmutabilitySentenceIsGatedOnTheOutcomes`.

## W1R2-M2 — the row names the designer

`asWaitingDecision` set `project: nil`, so `d.project?.designer?.askedByName`
was nil on every Stage-2 row and R8's sentence degraded to "Still open, your
designer asked on …" — while the Record two screens away said "Leah asked for
your approval." (the Record resolves a `designerFallback` from the
relationship; the decision list and the Studio row read the embed directly).

`asWaitingDecision(from: [RemoteProject])` matches the projection's own
`projectId` against the projects the rail has already fetched and carries that
project's `name` and `designer` embed onto the row. Nothing is invented: with
no matching project the row still names nobody. Both merges pass what they
hold (`BadgeCountService.performRefresh` → `fetchedProjects ?? projects`;
`DecisionsListViewModel.load` → `BadgeCountService.shared.projects`).

Three tests, and the date in the sentence is deliberately NOT pinned — it is
formatted in the device calendar, and the fact these hold is the name.

## W1R2-M3 — an unsent draft is not an ask

The projection already carries `sentAt` (00465:452, `decision.sent_at`); the
app was not decoding it. It is stamped by `publish_client_decision`
(00464:998,1061) and by nothing else, so it is the one field that says whether
the studio has issued the edition.

`awaitsClientInFeed = isPublished && awaitsClient` is what both homeowner-facing
merges now filter on. `awaitsClient` itself is unchanged, and the review leg on
a draft stays reachable by its own route — the detail screen reads
`get_project_decision_review` directly, which is where a pre-publish act
belongs. The bell needed no change of its own: it carries no approval merge,
it reads `notification_log`, and 00534 writes a row only on the transition
into `pending`.

**What remains of `iosb3-M2`.** The draft leak is closed. What is NOT closed is
the published half: `list_my_project_decision_reviews` (00467:135) returns rows
for `is_design_studio_comember(decision.designer_id)` as well as for the frozen
lead, and the projection carries no viewer role — so a studio co-member signed
into the client app still sees studio-wide PUBLISHED approvals under "waiting
on you". That is the Wave 2 migration item the rulings name (a viewer-role
field on the projection); it cannot be fixed on this side without guessing.

## W1R2-m1 — `markAllOpened`

The READ stays `eq.in_app`. The opened WRITE is now
`openedWriteChannelFilter = "in.(in_app,push)"`, so one event is read once, on
both legs, and `notification_log` cannot diverge. Two tests, and the older pin
that asserted BOTH sites read the one constant is rewritten to assert each site
reads its own.

## W1R2-m2 — "one categories"

`sectionBadgeLabel` is now a pure `static func` on `StudioHubView` whose noun
agrees with the word before it, pinned in `AttentionCountTests`.

## iosa R3-02 — "Overdue" leaves the money rail

`DateDisplay.due` reads "Past due · Aug 22", and the invoice list and invoice
detail take `PatinaColors.Text.primary` for a passed date instead of
`Text.error`. `isPastDue` survives — the ordering and the payable filters read
it, and it is simply no longer a colour. The Studio's money row already drew
its meta in `Text.interactive` and only inherits the new wording.
`MoneyAndStudioCopyTests` pins the new line, the absence of the retired word
from `DateDisplay.swift`, and the new ink at both sites. Proposals keep
`DateDisplay.expiry` and its red — the ruling named `due` and the three money
surfaces, and "Expired" is not the retired word.

## W1R2-n1 — the clause that told no story

`DateDisplay.approval` drops the asked-on clause where the asked-on day is not
BEFORE the day it was wanted by. "Still open, Leah asked on Sep 4." under a
date of Sep 4 said the studio asked and ran out of time in the same breath.

## W1R2-n4 — the bell says what the approval is now

00534:324 freezes "A sign-off needs you" into `metadata.title` at raise time and
no row is ever rewritten, so an answered approval went on asking, in a word this
program retired. `NotificationsViewModel.retitleApprovals` composes the title
from `BadgeCountService.projectApprovals` — every approval the projection
returns, answered and closed ones included, retained for this. The order is the
house's own: disposition, then the answer, then the ask. A row the projection
does not cover keeps its claim and gets the rename alone, which needs no
knowledge of its state. Six tests in `BellQueueFallbackTests`.

## The springboard mirror (item 10)

Nothing to do on iOS: `aps.badge` is the backend lane's. What this pass added is
the DEFINITION, written where the app sets the badge
(`BadgeCountService.applyNotificationRows`):

> **Unread `in_app` rows in `notification_log` for this user, one per entity.**
> `channel = 'in_app'`, `opened_at IS NULL`, `status IN (queued, sending,
> delivered, unconfirmed, opened, clicked)`, collapsed on
> `entity_type|entity_id`. Studio-composed fallback rows are excluded.

The two counts agree on user, channel and `opened_at IS NULL`. Two clauses are
the app's alone and both are bounded, and the comment names them: the collapse
can only differ where one entity holds two unread `in_app` rows, which
`notify_client_attention`'s own de-dup (00534:163-178 — one unopened row per
user and entity, updated rather than re-inserted) is what prevents; and the
status filter drops `failed`/`suppressed` rows a raw count would keep. **For the
backend lane: a server-side count that wants to agree exactly must carry that
status predicate too.** The walk's 14-vs-15 gap was the collapse, on an entity
that had somehow acquired two rows.

## Left alone, as instructed

W1R2-n2 (Decline vs Returned — P-16, Wave 2), W1R2-n3, W1R2-m3 (backend).

## Still not verified

No local Supabase round trip and no simulator walk from this lane — the stack
belongs to the integration steward. The CAS ordering is argued from the
migration text (00464:2211-2222 writing `updated_at`, 00464:811 reading it,
00465:453 echoing it) and pinned in the app by the call order and the seams.
Build, unit and lint-delta are the evidence.

## Two splits lint-delta forced

Neither is a refactor of choice — both are the repo's own gate.

- **`DecisionsListViewModel` → its own file.** `DecisionsViewModel.swift` sat at
  496 of SwiftLint's 500-line `file_length`; the B1 ordering comment and the
  stamp seam put it at 517. The list half moved out whole. Three source pins
  that read the list from the old path follow it.
- **The walk's new tests → two new suites**, `WalkCASAndFeedTests.swift`
  (`ApprovalCASOrderTests`, `ApprovalFeedGuardTests`) and
  `WalkCopyFixTests.swift` (`BellApprovalTitleTests`, `MoneyPastDueCopyTests`).
  `ProjectApprovalActTests`, `ProjectApprovalPathTests`, `BellQueueFallbackTests`
  and `MoneyAndStudioCopyTests` were each at `file_length` or
  `type_body_length`, or went over on the first run. The edits those suites
  keep are the pins the fixes moved (the "Past due" line, the new ink, each
  channel site reading its own constant, `asWaitingDecision(from:)`).

`sectionBadgeLabel` also moved off `StudioHubView` (304 of 300 on
`type_body_length`) onto `StudioQueueSectionKind.badgeLabel(count:)`, which is
the better home anyway: the noun belongs to the section.

## Gates (final tree)

```
IOS_GATE_UDID=B6AD6271-E9E1-4BC6-B94A-F115E270CCAE …/ios-gate.sh all
  ** BUILD SUCCEEDED **
  ━ Test run with 2458 tests in 269 suites passed after 7.515 seconds
    with 2 known issues.
  ** TEST SUCCEEDED **
  ✓ lint-delta: no new warnings in touched files
  EXIT=0
```

The two known issues are the pre-existing pair this branch has carried all
wave: `BrandVoiceLintTests.swift:168` ("curated_mix" contains "curated") and
`RoomLifecycleTests.theTodayRailFollowsALocalDelete`. The round-two close-out
adds 78 tests (2380 → 2458) across 12 suites.
