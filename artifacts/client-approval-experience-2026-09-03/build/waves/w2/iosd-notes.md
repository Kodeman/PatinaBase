# Wave 2 · lane iOS-D — notes

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w2-iosd`
(`git rev-parse --show-toplevel` returns exactly that), branch `approvals/w2-iosd`,
base `107549568c23b321fe413284de75164bde5852c9`.

Items: **P-21** (iOS half — the afterglow rows), **P-22** (iOS half — the lock
screen), **P-06** (iOS half — the router), plus the vocabulary sweep on the rails
this lane touches.

---

## What the lane found before it changed anything

- **P-06's two "dead" arms were already live.** `NotificationRouter.swift:65-68`
  and `:71-74` both carried "no edge function emits this yet". Wave 1 landed the
  emitters: `proposal-send/index.ts:381` calls `notifyClientAttention` with
  `entityType: "proposal"`, and `invoice-send/index.ts:332` +
  `invoice-reminders/index.ts:406` do the same with `"invoice"`. 00534 puts that
  string on both legs of the envelope, so the arms fire. The annotations are
  replaced with the call sites that prove it and pinned by tests.
- **The real P-06 gap is the Threshold, not the two arms.** Since the
  2026-09-04 cutover `_shared/client-portal-links.ts` writes
  `/projects/<id>?invoice=<id>#ledger` and `/?proposal=<id>#mat-papers` — the
  entity is in a query param or a `#approval-<id>` anchor and there is no
  `entity_type` pair at all. The iOS side never read `deep_link`, so a push
  composed from one of those links resolved to nothing and dropped the reader on
  the plain notifications feed.
- **`respondedAt` was already on the projection** (`RemoteProjectApprovalReview`),
  already flowed into `asWaitingDecision` as `responded_at`, and
  `BadgeCountService.projectApprovals` already retained answered and closed rows
  (kept for the bell in `W1R2-n4`). So P-21's "resolved-at timestamps must flow
  through the reads" needed no new read for the approval half.
- **`DecisionPushHandler` was a stub with no caller**, exactly as its own header
  says. `grep -rn "DecisionPushHandler" Patina/` returned only its own file and
  its copy test.
- **The money rail's "Overdue" is already gone.** The Wave-1-close ruling
  ("`DateDisplay.due` reads 'Past due · {date}' in body ink") is on base:
  `DateDisplay.swift:73` returns `"Past due · \(short(date))"`. Nothing owed.

## Decisions the lane made

### P-21 — the copy

**The afterglow sentence is `ProjectApprovalCopy.recorded(_:)`, not a new
string.** That function already prints "You approved this edition." / "You
returned this edition for revision." / "You held this edition to talk it through
with your designer." on the approval screen and in the bell
(`NotificationsViewModel.approvalTitle`). Reusing it means the Record, the
screen and the bell cannot name one outcome three ways, and RETURNED stays the
word for `changes_requested` on all three by construction.

**The thing is named on the second line, not inside the sentence.** The deck's
mock reads "You approved the dining room budget." — an article plus a
lower-cased title. The wire has neither: `artifact_title` is a proper-ish name
(`'Budget checkpoint ' || checkpoint_code`, an issue's name, a book's title), so
interpolating it produces "You approved Budget checkpoint BC-3." — the
capital-mid-sentence defect the backend review already ledgered as F6. The row
therefore follows the precedent the Wave-1 walk fix set for the OPEN approval
row (`0542908dd`): the act in the headline, the thing on the second line. Same
for the proposal: `"You signed the proposal."` with the proposal's title
beneath. **Flagged for the orchestrator** — if the deck's exact sentence is
wanted, it needs a name the wire can supply in lower case, which is a backend
change, not a lane one.

**The stamp MARK is not drawn on the row.** The mock shows a `PatinaStamp`
beside the sentence. `PatinaStamp` is P-17, in the iosc lane, and drawing a
second one here would either duplicate it or conflict at the merge. The row
carries the stamp WORD in its sentence; the mark is left for whoever lands
P-17's component. **Flagged.**

**An afterglow row is never marked new.** `HouseRecordRow.Kind.isOwnAct` is a
new predicate beside `isObligation`, and `markingNew(against:)` refuses to tick
a row that names it. The Record does not report the reader to himself as news —
the same rule (B §2) that keeps a save off the card and stops a repriced piece
claiming the save date. The row still carries its real date and still ages out
on the ordinary seven-day window, with no special-casing, no persistence and no
new decay rule.

**Silence beats a guess, four times.** A row draws only where the projection
names an outcome this build knows, carries `respondedAt`, is not withdrawn or
superseded (which stand ahead of an outcome everywhere else,
`client-attention.ts:55-71`), and is one this caller ANSWERED. A proposal draws
only where `hasSignatureRecord` is true — `status = 'accepted'` alone is also
what a designer-side accept sets, and "You signed" may only be said of a
signature she gave.

### P-21 — `viewer_role`

The backend lane had committed nothing when this lane ran
(`git log --oneline approvals/w2-backend` = the base sha), so the field's exact
spelling is unknown. `RemoteProjectApprovalReview.viewerRole` is decoded
verbatim and read through `ProjectApprovalViewerRole(raw:)`, which normalises
(lower-case, letters only) and then classifies:

- answering — `decisionlead`, `lead`, `client`, `clientlead`, `recipient`, `owner`
- observing — `studiocomember`, `comember`, `studiomember`, `studio`, `designer`,
  `teammate`, `observer`, `viewer`, `watcher`
- anything else, and an absent field — `unspecified`

**`unspecified` reads as HERS** (`viewerAnswers` is `!= .observes`). Excluding
an unknown spelling would silently drop a homeowner's own obligations off every
feed she has, which is far worse than the leak this field closes. `awaitsClientInFeed`
gains `&& viewerAnswers`, so an observed row reaches neither NEEDS YOU nor the
Studio's "Awaiting you", and `answeredApprovalRows` refuses it too — "You
approved this edition" over a co-member's studio row would be a lie about who
acted. **Owed to the orchestrator: confirm the migration's actual value with the
backend lane and, if it is not in either list above, add it.**

**One accepted cost while `viewer_role` is absent.** `answeredApprovalRows`
reads the same default-include rule as the feed, so until the migration lands a
studio co-member reading her own client app would see "You approved this
edition." over an approval her studio answered — words in her mouth, which is a
shade worse than the misplaced NEEDS YOU row Wave 1 already leaves her. The
alternative is to require a POSITIVE `.answers`, which would ship P-21's
approval half dark for everyone until the backend lands. Taken deliberately:
both lanes land in this wave's integration, and the rulings record that there
are zero live clients in the window. **Flagged.**

### P-21 — the Codable shape

`HouseRecordRow.Kind` is decoded as a raw string and an unknown one throws a
typed `HouseRecordDecodingError`; `HouseRecord.init(from:)` decodes each half
row-by-row and drops what it cannot read. Before this, one unknown kind threw
out of `RecordSnapshotStore.load()` and Today painted blank on the first cold
launch after a downgrade — the same "a smaller failure than a snapshot that will
not decode at all" rule `RouteToken` already follows for a route it cannot name.
Nothing about the on-disk shape changed; only the vocabulary of one field grew.

### P-21 — where the rows come from

`BadgeCountService.signedProposals` is new, filtered in `apply` out of the same
`proposals` argument `pendingProposals` already reads, and NOT persisted (an
afterglow row is a week of daily surface, not an offline floor). It mirrors
`projectApprovals`, which already retained answered rows.

**One relocation was forced.** `BadgeCountService.swift` sat at 468 of
SwiftLint's 500-line `file_length`, and a stored property cannot live in an
extension. `attentionCount`, `attentionHint`, `activeProjectCount` and
`studioHint` — four read-only computed properties that mutate nothing — moved to
a new `BadgeCountService+Attention.swift`, the same split and the same reason as
the two siblings the Wave 1 close already created
(`BadgeCountService+Decisions.swift`, `BadgeCountPersistedCounts.swift`). The
file is 476 lines after the move.

### P-22 — the acts

Two acts, `Open` and `Ask a question`, both foreground, on all three categories.
No Approve, no Sign, no Accept, no Pay, no Decline — and
`NotificationCategories.refusedActionWords` plus a test over
`PatinaNotificationAction.allCases` is the pin that keeps a later hand from
adding one.

**"Ask a question" lands on the thread when the envelope names one
(`thread_id`, or `entity_type: "thread"`), and on the inbox when it does not.**
There is no entity-scoped composer route in `AppRoute` — the nearest thing,
`.decisionDetail`, opens the approval whose "Ask a question" is an OUTCOME, not
a message — and inventing a thread that does not exist is worse than landing her
where she writes to the studio. **Owed: ask the backend lane to put `thread_id`
in the `PATINA_*` envelopes; the client reads it the moment it appears.**

**The sender's thread identifier is honoured as a routing fall-back.** The
categories name the shape once (`PatinaNotificationCategory.threadIdentifier(entityId:)`
and its reader), and `didReceive response` passes
`response.notification.request.content.threadIdentifier` down: when an envelope
reaches the device carrying neither an entity pair nor a `deep_link` — a
reminder that collapsed onto an earlier letter — `decision-<id>` still says
which rail and which row. The envelope wins where it has one; an identifier
that is not ours names nothing and the feed fall-back takes over.

**The NSE is not built**, per the ruling. No `mutable-content`, no attachment
target.

### P-22 — the delegate

`handleNotificationPayload` gains an `actionIdentifier` (defaulting to
`UNNotificationDefaultActionIdentifier`, which is what the cold-launch path
supplies). Three behaviours:

1. A **dismissal** navigates nowhere and marks nothing opened. Swiping a letter
   away is not reading it, and telling the studio she has seen it would be an
   invention.
2. **`DecisionPushHandler.handle` is called first** for everything but "Ask a
   question" — the one-line wiring its header asks for. It navigates through the
   same `DeepLinkHandler.navigate` seam and marks the row opened itself, so a
   payload it claims returns early; otherwise the row would be PATCHed twice for
   one tap. It only recognises `decision_required` / `_overdue` / `_resolved`,
   so 00534's `*_attention` rows still take the generic path — the wiring is
   additive, exactly as its header promised.
3. Everything else routes through `NotificationCategories.route` →
   `NotificationRouter` → `DeepLinkHandler.navigate`, which is P-08's queue: a
   route that arrives before the app can show it is held and replayed at
   `.main`.

`markOpened` moved to one static helper so both doors PATCH once.

### The vocabulary sweep

- **The Studio hub's approvals row is named for what it holds.** Its title was
  `countLabel(count, singular: "Decision", plural: "Decisions")` for a group
  that is routinely all approvals. Where every waiting row is an approval
  (`isProjectArtifactApproval || isClientSignoff`) it now reads Approval /
  Approvals; a group holding a real option choice keeps the older word, which is
  true of at least one of its rows. The detail line was already words, not
  figures, and the glyph was already `hand.raised`, not a checkmark — both from
  Wave 1.
- **The bell** already says the ruled words (`ProjectApprovalCopy.bellOpen`,
  `.recorded`), and the sweep test pins that it never says "sign-off" for an
  open approval and never "Declined" for `changes_requested`.
- Every string this lane composes is swept for `overdue`, `gate`, `task`,
  `dashboard`, `declined`, `late` and for any digit.

## Two Wave 1 pins this lane had to move

Both are source-pins whose subject this wave deliberately changed, not
regressions. Recorded here so a reviewer can see they were moved on purpose.

- **`WalkCASAndFeedTests.bothFeedsReadOnePredicate`** pinned the literal line
  `var awaitsClientInFeed: Bool { awaitsClient && isPublished }`. P-21 widened it
  with `&& viewerAnswers`; the pin now carries all three clauses, so dropping any
  one of them still goes red.
- **`WalkCASAndFeedTests.anUnissuedEditionIsNotCountedAsAnApproval`** expected the
  hub row title `"Decision"`. Its subject is the DETAIL line — that an unissued
  edition is not counted among "approvals waiting on you" — and that assertion is
  untouched. The title is now "Approval", which is the sweep's whole point: the
  group in that fixture holds one Stage-2 approval and nothing else.

## What the lane could NOT verify

- **`viewer_role`'s real spelling.** The backend lane had no commits when this
  ran. The normaliser is defensive and default-includes; see above.
- **No live round trip.** The projection's `viewerRole` key name is this lane's
  reading of the naming convention every other key in
  `get_project_decision_reviews` follows (camelCase — `respondedAt`,
  `artifactTitle`). If the migration emits `viewer_role` in snake_case the field
  will decode as nil and the app behaves exactly as Wave 1 did — a silent
  degrade, not a break, but it must be checked at integration.
- **Nothing was exercised on a simulator by this lane** beyond the gate's own
  test run. The lock-screen acts in particular cannot be seen without a real
  APNs push; the categories are pinned by their registered set, not by a banner.

## Advisories for the orchestrator

1. **`ProjectApprovalCopy.acts` still labels `changes_requested` "Decline"**
   (`ProjectApprovalCopy.swift:41`). `rulings-2026-09-04.md` is explicit —
   changes_requested is RETURNED everywhere, never "Declined" — and P-16 owns
   that array (button labels, verb-then-consequence). Left untouched to avoid a
   double fix and a merge conflict with the iosc lane. **If iosc does not change
   it, a ruling violation ships in front of a homeowner.**
2. **The stamp mark on the afterglow row** is left to P-17's `PatinaStamp` (see
   above).
3. **`thread_id` in the `PATINA_*` envelopes** would upgrade "Ask a question"
   from the inbox to the thread with no further client change.
4. **Confirm `viewer_role`'s value vocabulary** against the backend lane's
   migration at integration.
5. **`BadgeCountService+Attention.swift` is a new file** carved out of
   `BadgeCountService.swift` purely for the 500-line limit. Nothing moved but
   four computed properties; call sites are unchanged.

## Gates — results

Run from this worktree, unsandboxed, against `cae-w1-iosb`
(`IOS_GATE_UDID=493547C8-D84B-478B-8673-3FF6ACAA05C6`). Final tree, `c4d98affd`.

| tier | result |
|---|---|
| `build` | **PASS** — `** BUILD SUCCEEDED **`, exit 0 |
| `unit` | **PASS** — `** BUILD SUCCEEDED **`; `Test run with 2524 tests in 276 suites passed after 8.916 seconds with 2 known issues`; `** TEST SUCCEEDED **`; exit 0 |
| `lint-delta main` | **PASS** — `✓ lint-delta: no new warnings in touched files`, exit 0 |

2436 tests in 265 suites at the Wave 1 close; **2524 in 276** now — this lane's
five new suites. The two known issues are the pre-existing pair both iOS lanes
report: a `BrandVoiceLint` expectation on "curated_mix" and
`RoomLifecycleTests.theTodayRailFollowsALocalDelete`.

**Two red rounds on the way there, both recorded rather than papered over.**

1. `ApprovalVocabularySweepTests` would not compile: `contains(where: \.isNumber)`
   reads as a throwing call inside an `#expect` expansion ("call can throw, but
   it is not marked with 'try'"). Rewritten as a `rangeOfCharacter(from:
   .decimalDigits)` helper.
2. Two Wave 1 source-pins went red, and a third failure did not belong to this
   lane. The pins are covered in their own section above. The third was
   `CompanionCoachingModelTests.introGate_freshUser_pollsUntilTourResolves` —
   the timing-dependent test iOS-A already recorded in Wave 1 (a 10 ms poll
   against a 50 ms `Task.sleep` handoff, which "failed once on a loaded machine,
   then passed on a clean re-run of the same tree"). `git diff --name-only
   107549568..HEAD | grep -i companion` is empty: this lane touches nothing in
   Companion, and the test passed on the final run without any change to it.

**The cold-cache transient.** The first `build` of the wave reported
`** BUILD FAILED **` with three `SwiftCompile` failures in the `x86_64` slice
and no `error:` diagnostic anywhere in the log — the class the gate script's own
header names and the Wave 1 integration report recorded. The immediate re-run
returned exit 0 with `** BUILD SUCCEEDED **`.

## Files

- `apps/mobile/Patina/Patina/App/DeepLinking/NotificationRouter.swift` (P-06)
- `apps/mobile/Patina/Patina/Features/Notifications/Models/AppNotification.swift` (P-06)
- `apps/mobile/Patina/Patina/Core/Network/NotificationsAPIClient.swift` (P-06)
- `apps/mobile/Patina/Patina/Features/Notifications/NotificationCategories.swift` (P-22, new)
- `apps/mobile/Patina/Patina/App/AppDelegate.swift` (P-22)
- `apps/mobile/Patina/Patina/Features/Home/Models/HouseRecord.swift` (P-21)
- `apps/mobile/Patina/Patina/Core/Network/DecisionsAPIClient+ProjectApprovals.swift` (P-21, viewer_role)
- `apps/mobile/Patina/Patina/Services/Badges/BadgeCountService.swift` (P-21)
- `apps/mobile/Patina/Patina/Services/Badges/BadgeCountService+Attention.swift` (P-21, new — file_length)
- `apps/mobile/Patina/Patina/Features/Profile/ViewModels/StudioQueueBuilder.swift` (sweep)
- Tests: `NotificationDeepLinkRoutingTests`, `NotificationCategoryTests`,
  `AfterglowRowTests`, `RecordSnapshotCompatibilityTests`,
  `ApprovalVocabularySweepTests`, plus `ProjectApprovalFixtures` (a `viewerRole`
  parameter, absent by default).

---

# Round 1 fixes — 2026-09-05

Five findings, all addressed. Tree was clean at start (`git status --short`
empty unsandboxed; the eight `.env.example: Operation not permitted` lines a
sandboxed `git status` prints are the harness's read denials, not leftovers).
No leftovers from an interrupted attempt.

## iosd1-M1 — `household` read as answering

**Confirmed against the migration, not against a guess.** 00569 on
`approvals/w2-backend` (`00569_approval_why_viewer_role_and_receipt.sql`) emits
exactly three values at :884-888:

```sql
'viewerRole', CASE
  WHEN snapshot.decision_lead_id = v_actor THEN 'lead'
  WHEN v_is_studio THEN 'studio'
  ELSE 'household'
END,
```

and the function COMMENT (:987) advertises `lead | studio | household`.
`household` was in neither the answering nor the observing set, so it
normalised to `.unspecified`, and `viewerAnswers` (`!= .observes`) read TRUE —
a NEEDS YOU row she cannot answer, and, after the lead answered, "You approved
the budget." over an act she did not take.

**Ruled: `household` WATCHES.** The migration's own comment (:880-883) calls it
"the project's client on a row whose frozen lead is somebody else (reachable
only after a lead reassignment)", and `respond_project_approval` accepts nobody
but the frozen lead (00569:1102 — "only the frozen household decision lead may
respond"). A reader the RPC will refuse may not be asked, and may not be told
she answered. Added to `observing`.

The lane's earlier guessed spellings were kept (they cost nothing and a
re-spelling of the same word must not change what she sees), but the three
strings the projection ACTUALLY emits are now pinned literally in
`AfterglowRowTests.theProjectionsOwnVocabularyIsRead`, plus a behaviour test
(`aHouseholdWatcherIsNeitherAskedNorCredited`) over both feeds.

The reviewer's reachability caveat is confirmed and stands: the row filter at
00569:969 is `AND (v_is_studio OR snapshot.decision_lead_id = v_actor)`, so a
non-lead non-studio row is not serialized at all today. The mismap was latent.
It is closed anyway — the field's declared vocabulary is the contract.

## iosd1-M2 — "Ask a question" could not reach the document

**Confirmed.** `buildApnsPayload` (`supabase/functions/apns-send/core.ts`,
identical on base and on the backend branch) returns `{ aps, entity_type,
entity_id, notification_log_id }` — no `thread_id` — and `apnsCategoryFor`
never assigns a `PATINA_*` category to a thread. So `conversationRoute`'s two
thread legs could not fire on any envelope that exists, and every "Ask a
question" tap landed on `.threadList` with the approval's identity discarded.

**Ruled: land the act on the document, keep the deck's words.** The reviewer
offered three fixes; the first is the one the deck supports. `proposal.html`
:1109 is explicit — "The honest non-answer, **Ask a question**, is the second
action instead, because it needs to be as reachable as the answer" — so the
lock-screen act is MEANT to be the same act as `ProjectApprovalCopy.acts[1]`,
not a different one wearing its words. The collision the review named is not
two meanings for two words; it is one act that could not reach its own surface.
Renaming it would have broken the deck's intent to fix a routing bug.

`conversationRoute` now reads, in order: the named thread (`thread_id`, then
`entity_type: "thread"`) → `NotificationRouter.resolve` (the entity pair, then
the Threshold deep link) → the sender's thread identifier (`decision-<id>`) →
`.threadList`. `NotificationRouter.resolve` never answers a LIST route — it
names a specific entity or nil — so the fall-through cannot drop her on a
generic list by accident.

Four tests, including one over a byte-for-byte reconstruction of the real
`PATINA_DECISION` envelope (`aps.category`, `aps["thread-id"]`,
`interruption-level`, the entity pair, the log id, and no `thread_id`):
`askOpensTheDocumentItself`, `askOnTheRealEnvelopeReachesTheApproval`,
`askFollowsTheLinkThenTheGroupingKey`, `askFallsBackToTheInbox`.

**Still owed from the backend (unchanged, now non-blocking):** `thread_id` on
the `PATINA_*` envelope. The client reads it first the moment it appears, and
the fall-back is no longer a dead end in the meantime.

## iosd1-M3 — the previous account's approval

**Confirmed.** `resetForSessionChange()` cleared eleven fields and not
`projectApprovals`, which `HouseRecord.swift:629` now reads in the FIRST
person. Fixed beside `signedProposals`. Two tests: a behavioural one through
the existing `applyProjectApprovalsForTesting` DEBUG seam
(`theAnsweredApprovalsAreClearedToo` — it asserts the ROW disappears, not only
the array), and the source pin `theResetBodyNamesEveryField` widened with
`signedProposals` and `projectApprovals`. That pin exists for exactly this
defect class and had not been updated when P-21 added its arrays; both are
named now.

## iosd1-M4 — the afterglow sentence

**Ruled: name the thing, from the wire's COMMON noun.** The lane's original
objection to interpolating `artifactTitle` stands and is not overturned — it is
a proper-ish name ("Budget checkpoint BC-3"), and putting it mid-sentence
reproduces the capital-mid-sentence defect the backend ledgered as F6. But the
reviewer is right that three identical headlines under a three-row MOVED cap is
not the deck's row either.

The projection carries a second name for the same thing that the lane had not
read: **`artifactKind`** (00569:865, `artifact.source_kind`), whose values are
fixed by a CHECK constraint at 00463:134-135 — `plan_issue`,
`spec_book_artifact`, `budget_version`. Those are common nouns. Added
`RemoteProjectApprovalReview.artifactKind` (optional — an older projection
decodes as nil) and `ProjectApprovalCopy.artifactNoun(kind:)`:

| kind | sentence |
|---|---|
| `budget_version` | You approved the budget. |
| `plan_issue` | You returned the plan set for revision. |
| `spec_book_artifact` | You held the spec book to talk it through with your designer. |
| absent / unknown | You approved this edition. *(the previous copy, unchanged)* |

That is the deck's shape — the act and the thing in one sentence — minus the
room qualifier, which only `artifactTitle` carries and only in capitals. The
title stays on the second line, so two budgets in one week are still two
distinguishable rows.

`recorded(_:)` keeps its one-argument form and its exact three strings, so the
approval screen (`ProjectApprovalBlock`), the bell
(`NotificationsViewModel.approvalTitle`), `WalkCopyFixTests` and
`RecordSnapshotCompatibilityTests` are untouched — the new noun is the ROW's,
where the second line is not available to carry it. Three tests, including
`mixedKindsDoNotRepeatOneHeadline`, which asserts three distinct titles.

**No backend change requested.** The field was already there.

## iosd1-carry1 — "Decline" on `changes_requested`

**Fixed here.** `ProjectApprovalCopy.acts[2].label` is now **"Return"**. The
lane had left it for iosc to avoid a merge conflict; iosc's head still carries
"Decline", so it was going to ship. `rulings-2026-09-04.md` is flat about it and
P-16 reconciles the day's word to the next visit's — which `recorded(_:)` has
always printed as "returned". The consequence line already said "Return this
edition for revision"; the button was the last place the wrong word lived.

`ApprovalVocabularySweepTests.noRefusedWords` now sweeps
`ProjectApprovalCopy.acts` (labels AND consequences) and refuses the stem
"decline", not only "declined". The array excluding itself from its own sweep
is exactly how the word survived Wave 1 and the lane's own pass.

⚠ **Merge note for the steward:** this touches
`Features/Decisions/ProjectApprovalCopy.swift` and
`PatinaTests/ProjectApprovalActTests.swift`, which P-16/iosc also owns. If iosc
relabels it too, take either — they must both read "Return".

## Gates (re-run after the fixes, all from this worktree, unsandboxed)

| gate | result |
|---|---|
| `build` | **PASS** — `** BUILD SUCCEEDED **`, exit 0 |
| `unit` | **PASS** — `Test run with 2533 tests in 276 suites passed after 8.052 seconds with 2 known issues`, exit 0 |
| `lint-delta main` | **PASS** — `✓ lint-delta: no new warnings in touched files` |

2524 → **2533 tests**, +9 for this pass (5 afterglow, 3 lock-screen, 1 session
isolation). The two known issues are the same pre-existing pair both iOS lanes
report (`BrandVoiceLintTests` "curated_mix", `RoomLifecycleTests`
`theTodayRailFollowsALocalDelete`), neither touched here.

**One transient, recorded rather than hidden.** The first `unit` run after the
edits reported 1 failure —
`CompanionCoachingModelTests/introGate_freshUser_pollsUntilTourResolves()`,
`Expectation failed: (result → false) == true`, 2530 passed. That is the same
50 ms `Task.sleep` poll this lane already logged above as "failed once on a
loaded machine, then passed on a clean re-run of the same tree"; the machine
was running two gates at once. It passed on the immediate re-run of the same
tree with no change to it or to the Companion. Nothing in this pass touches
`CompanionCoachingModel`.

## What this pass could NOT verify

- **No live round trip, still.** The `viewerRole` and `artifactKind` key names
  are read from 00569's own `jsonb_build_object` on `approvals/w2-backend`, not
  from a response. If the merged migration renames either, both degrade
  silently to nil and the app behaves as it did before this pass — a duller
  row, not a wrong one. Worth one probe at integration.
- **The lock screen was not seen.** The acts still cannot be exercised without
  a real APNs push; the routing is pinned by the reconstructed envelope, not by
  a banner.

---

# Round 2 fixes — 2026-09-05

Two majors, both cross-lane, both settled by `rulings-2026-09-04.md`'s
"Rulings made mid-Wave 2" section rather than by a lane preference. Tree was
clean at start (`git status --short` prints only the eight
`.env.example: Operation not permitted` lines the sandbox's read denials
produce — not modifications). No leftovers from the usage-limit stop.

## iosd2-M1 — "Ask a question" on a proposal or an invoice

**The reviewer's premise was true when he wrote it and is not true now.**
Two things changed underneath the finding:

1. **The ruling settles the destination, and it is not `.threadList`.**
   `rulings-2026-09-04.md`, "Rulings made mid-Wave 2": *"Lock-screen 'Ask a
   question.' The PATINA_* envelope carries `thread_id` when the entity's
   project has a thread; the action opens that thread, else the entity's own
   screen. **Never the inbox as a dead end.**"* The reviewer's proposed
   three-line revert — proposal and invoice back to `.threadList` — is the one
   shape the ruling names and refuses. It is not taken.

2. **The backend lane landed `thread_id`, so the primary leg is live.**
   `approvals/w2-backend` `6d2316922` ("fix(edge): the lock screen knows which
   conversation to open") adds `resolveProjectThreadId` to
   `apns-send/index.ts:126`: entity → its project (`client_decisions` /
   `proposals` / `invoices`, `projectTableFor`, `core.ts:168-179`) → the
   project's single `comms_threads` row of kind `project`
   (`pickProjectThreadId`, `core.ts:189-195`), written onto the envelope by
   `buildApnsPayload` as `thread_id` (`core.ts:286-288`). **All three rails**,
   not only the decision one. So on a project with a conversation — the normal
   case — every banner's "Ask a question" now opens that conversation, which is
   where she writes to the studio, with the letter's identity kept.

   That is the leg `conversationRoute` already reads first. The client needed no
   routing change; it needed the wire, and the wire arrived.

**What actually needed fixing was the source, which had gone stale.** The
`conversationRoute` doc comment asserted *"Neither is on a `PATINA_*` envelope
today … so the second leg is the one that actually runs"* — a false statement
about shipped behaviour the moment `6d2316922` merges. Rewritten to name the
resolver, its two hops, the omission rule, and the ruling it implements. Two
test doc comments carried the same dead premise and are rewritten with it.

**New pin:** `askOnAResolvedEnvelopeOpensTheProjectThread` reconstructs the
envelope as `buildApnsPayload` now assembles it — `aps` (alert, category,
`thread-id`, `interruption-level`) plus the entity pair, the log id and
`thread_id` — and asserts `.threadDetail` on **all three** categories. The older
`askOnTheRealEnvelopeReachesTheApproval` keeps its subject and is re-labelled
for what it now describes: a project with no single thread.

**The residual, stated plainly rather than closed.** Where a project has zero
project threads (or somehow two), the act lands on `ProposalDetailView` /
`InvoiceDetailView`, and neither screen carries a way to write to the studio —
`InvoiceDetailView.swift:287`'s "Message your designer" sits inside the
payment-failure branch. The ruling chose that over the inbox, and the document's
identity is worth more than a generic list; but it is a screen with no door.
**Advisory for the orchestrator:** the honest close is a "Message your designer"
line on both detail screens — `ProjectMessageDesignerLink` already exists and
already says "Ask a question about this project" — not a routing change. Out of
this lane's items.

## iosd2-M2 — the acts array, and a rationale that was about to become false

**Confirmed exactly as reported.** `approvals/w2-iosc` ships P-16's shape —
`[approved, changesRequested ("Return"), needsDiscussion ("Hold")]` — and this
lane carried `[approved, needsDiscussion ("Ask a question"), changesRequested
("Return")]`. Taking either, as the round-1 merge note advised, would have
reverted P-16's ordering and its rewritten consequence lines half the time.

**Ruled: iOS-C's array wins, verbatim.** P-16 owns it and P-16 is the ruling's
shape. `ProjectApprovalCopy.acts` and its doc comment are now **byte-identical**
to `approvals/w2-iosc:…/ProjectApprovalCopy.swift` (verified by extracting the
block from both trees and comparing), so that hunk resolves to one text whichever
side the merge takes. `ProjectApprovalActTests.theActsReadVerbThenConsequence` is
likewise taken verbatim from iOS-C, including its
`#expect(!acts.contains { $0.label == "Decline" })`.

Not taken: iOS-C's `stamp(for:)` and its `import PatinaDesignKit`. `PatinaStamp`
is P-17 and does not exist on this branch — copying it would not compile here and
would be this lane inventing P-17.

Kept: this lane's `recorded(_:thing:)` / `artifactNoun(kind:)` (the iosd1-M4 fix)
and `ApprovalVocabularySweepTests.noRefusedWords`' sweep over `acts` labels AND
consequences — the pin that caught "Decline" in the first place. It is written
against the array, not against an index, so the reorder costs it nothing; it
passes over iOS-C's three strings unchanged.

**The lock-screen act keeps its own word — and the comment now says why.** After
P-16 there is no "Ask a question" BUTTON in the app, so the old rationale ("the
same act on the lock screen as it is inside the app") was going to be a false
statement in shipped source. The answer is not to rename the banner act: the
mid-Wave-2 ruling names it "Ask a question" in its own text, and the two things
are genuinely different acts. The three doors are OUTCOMES (Approve / Return /
Hold) and a banner may never carry an outcome — that refusal is why
`NotificationCategories.swift` exists at all. "Ask a question" writes nothing; it
opens the conversation. It keeps a word none of the doors uses **because** none
of the doors may appear there.

**New pin:** `theBannerAndTheDoorsShareNoWord` asserts the doors read
`approve / return / hold` and that no `PatinaNotificationAction.title` collides
with any of them. If a later hand renames a door to a banner word, or adds a
banner act wearing a door's, the suite goes red rather than the two vocabularies
quietly merging again.

**Merge note for the steward, superseding round 1's.** Do NOT "take either" on
`ProjectApprovalCopy.swift`. Take iOS-C's file for the acts block, the signature
copy, the note copy and `stamp(for:)`; take iOS-D's file for `recorded(_:thing:)`,
`unnamedEdition` and `artifactNoun(kind:)`. The acts hunk itself is identical on
both sides, so only the surrounding additions need combining. Same rule on
`ProjectApprovalActTests.swift`: the `theActsReadVerbThenConsequence` body is now
identical on both sides; iOS-C's `theRefusedWordsAreAbsent` adds four note
strings this branch does not have, so take iOS-C's there.

## Not addressed this round, and why

The round-2 review's minors (`R2-m1` the `DecisionPushHandler` guard, `R2-m2` the
bell/screen noun) and every round-1 minor and nit it re-recorded are untouched:
the brief for this round is "every blocker and major; minors only when trivial",
and none of these is a one-liner whose fix is obvious without a second ruling.
They stand in `iosd-review-r2.md` for the steward.

## What this pass could NOT verify

- **Still no live round trip and still no banner.** `thread_id` is read from
  `apns-send`'s source on `approvals/w2-backend`, not from a push. The lock-screen
  acts cannot be exercised without real APNs; the routing is pinned by the
  reconstructed envelope, both with and without `thread_id`.
- **iOS-C's array is read from its branch, not from a merged tree.** If iOS-C
  changes `acts` again before integration, the byte-identity claim above expires
  and the hunk must be re-compared.

Run from this worktree, unsandboxed, against `cae-w1-iosb`
(`IOS_GATE_UDID=493547C8-D84B-478B-8673-3FF6ACAA05C6`), one `ios-gate.sh all`
invocation, `GATE_EXIT=0`.

| gate | result |
|---|---|
| `build` | **PASS** — `** BUILD SUCCEEDED **` |
| `unit` | **PASS** — `Test run with 2535 tests in 276 suites passed after 9.049 seconds with 2 known issues`; `** TEST SUCCEEDED **` |
| `lint-delta main` | **PASS** — `✓ lint-delta: no new warnings in touched files` |

2533 → **2535 tests**, +2 for this pass
(`askOnAResolvedEnvelopeOpensTheProjectThread`,
`theBannerAndTheDoorsShareNoWord`). The two known issues are the same
pre-existing pair both iOS lanes report — `BrandVoiceLintTests` on "curated_mix"
(`BrandVoiceLintTests.swift:168`) and
`RoomLifecycleTests.theTodayRailFollowsALocalDelete`
(`RoomLifecycleTests.swift:297`) — neither touched here. **No transient this
round:** `CompanionCoachingModelTests` did not flake, and no tier needed a
re-run.
