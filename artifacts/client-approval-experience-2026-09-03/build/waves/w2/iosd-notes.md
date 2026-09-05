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

## Gates

Run from this worktree against `cae-w1-iosb`
(`IOS_GATE_UDID=493547C8-D84B-478B-8673-3FF6ACAA05C6`). `xcodebuild` needs the
unsandboxed retry: the sandboxed attempt dies at
`Could not resolve package dependencies: error: permissionDenied`.

The first `build` of the wave failed on a cold per-worktree `DerivedData` with
three `SwiftCompile` failures in the `x86_64` slice and **no `error:` diagnostic
anywhere in the log** — the transient the gate script's own header names and the
Wave 1 integration report recorded. The immediate re-run returned exit 0.

Results are recorded in the lane's report-back.

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
