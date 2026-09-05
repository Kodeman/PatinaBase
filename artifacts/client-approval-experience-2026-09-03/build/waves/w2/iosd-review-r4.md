# Wave 2 · lane iOS-D — adversarial review, round four (2026-09-05)

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w2-iosd`
(`git rev-parse --show-toplevel` returns exactly that), branch `approvals/w2-iosd`,
head `990c3389f`, base `main` = `107549568`.

Read for this round: `rulings-2026-09-04.md` (all sections, including "Rulings made
mid-Wave 2"), `source/build-sheet.md` P-13…P-22, `source/threshold-remap.md`,
`waves/w2/env.md`, `iosd-notes.md` (782 lines, all four passes), and
`iosd-review-r1/r2/r3.md`. Cross-branch reads: `approvals/w2-backend`
(`00569_approval_why_viewer_role_and_receipt.sql`, `apns-send/core.ts` at head
`a91b1bb9e`) and `approvals/w2-iosc` (`ProjectApprovalCopy.swift`).

---

## Verdict

**fix.** No blocker. One round-3 major is genuinely closed. Four majors stand —
one of them a correction of a round-3 *mitigation* that turns out to be false,
one new, two carried and aged. Eight minors, eleven nits.

## Gates — run by this reviewer, from this worktree, unsandboxed

`IOS_GATE_UDID=493547C8-D84B-478B-8673-3FF6ACAA05C6`

| gate | result |
|---|---|
| `ios-gate.sh build` | **PASS** — `** BUILD SUCCEEDED **`, exit 0 |
| `ios-gate.sh unit` | **exit 65** — `Test run with 2538 tests in 276 suites failed after 9.810 seconds with 3 issues (including 2 known issues).` Sole non-known failure: `CompanionCoachingModelTests.introGate_freshUser_pollsUntilTourResolves()` at `CompanionCoachingModelTests.swift:384` |
| that test, in isolation | **PASS** — `Test run with 21 tests in 1 suite passed after 0.084 seconds`, `** TEST SUCCEEDED **`, exit 0 |
| `ios-gate.sh lint-delta main` | **PASS** — `✓ lint-delta: no new warnings in touched files` |

The flake is the one the brief names and the one both iOS lanes have logged since
Wave 1. It is proven pre-existing here by the isolation run above; it is **not** a
lane regression. The two known issues are the same pair (`BrandVoiceLintTests`
"curated_mix", `RoomLifecycleTests.theTodayRailFollowsALocalDelete`).

Commit hygiene: eighteen commits, every one an explicit pathspec, Conventional
subjects, no `merge(...)` subject, no trailers, no `.env`/hook/settings/`.claude`
path anywhere in `main..HEAD`. Working tree clean.

---

## Round-3 finding: closed

### `iosd3-M1` — the hub row said Approvals, the screen said DECISIONS · **FIXED**

`DecisionsListViewModel.swift:25-30` now carries one definition —
`Collection where Element == RemoteClientDecision { var groupNoun }` — and both
frames read it: `StudioQueueBuilder.pendingDecisionRow` (`:334-337`,
`countLabel(decisions.count, singular: noun.singular, plural: noun.plural)`) and
`DecisionListView.header` (`:36`, `MonoLabel(text: viewModel.eyebrow)` where
`eyebrow` is `decisions.groupNoun.plural`). Three tests pin the *pair*
(`theRowAndItsScreenAgree`, `theRowAndItsScreenAgreeOnARealChoice`,
`theEmptyListIsNamedForTheAsk`), not the helper, which is the right shape. The
analytics-name argument for leaving `Coordinator.displayName` alone is sound and
checks out — its three call sites are logs and it feeds `analyticsScreenName`'s
`default:` leg, pinned by `RouteAnalyticsParityTests`.

Two residuals fall out of the fix and are recorded below as `iosd4-m7` and
`iosd4-n11`.

---

## Majors

### `iosd4-M1` — the afterglow rows draw on the widget, and round 3's mitigation is false

R15: *"iOS carries the full approval ceremony. **The widget is untouched.**"*

`WidgetSnapshot.init(record:…)` (`Core/Persistence/WidgetSnapshot.swift:144-147`)
projects **every** MOVED row with a mappable route:

```swift
self.movedRows = record.moved.compactMap { row in
    guard let route = row.route.flatMap(WidgetRouteToken.init) else { return nil }
    return WidgetRow(id: row.id, title: row.title, date: row.date, route: route)
}
```

`WidgetRouteToken.init` (`:74-88`; the two arms at `:77-78`) maps `.decisionDetail` and `.proposalDetail` —
exactly the routes `answeredApprovalRows` (`HouseRecord.swift:878`) and
`signedProposalRows` (`:916`) set. So "You approved the budget." and "You signed
the proposal." reach the home- and lock-screen widget.

**Round 3 recorded this as a minor on the grounds that it is "dark while the
`houseWidget` flag is off". That is not true.** `RecordSnapshotStore` writes the
widget payload unconditionally (`:159`, `:204`, `:231`); `flagOn` is a recorded
field, not a gate, and `PatinaWidgetShared/HouseWidgetPayload.swift:143` says so
in its own words: *"D5: not gated on `flagOn`. A widget somebody placed draws what
the app…"*. `rows` there is `Array(movedRows.prefix(Self.maximumRows))` (`:146`),
the same three slots — so with `iosd4-m4` below, three answered approvals in a
week can fill the entire widget with the reader's own acts and show nothing the
studio did, on the surface R15 declared out of scope.

No file under `PatinaWidget*` appears in this lane's Files list, and no test in
`RecordSnapshotCompatibilityTests` or anywhere else asserts widget behaviour for
the two new kinds.

**Fix:** a steward ruling, then one clause. Either accept the rows on the widget
and say so in the lane log with a test, or `guard !row.kind.isOwnAct` inside
`WidgetSnapshot`'s `compactMap` with a test that pins it.

### `iosd4-M2` — the Studio subhead prints figures where its own sibling prints words

`Services/Badges/BadgeCountService+Attention.swift:53-60` (the two figures at `:56` and `:58`) — a file **this lane
created** — returns:

```swift
if unreadMessageCount > 1 { return "\(unreadMessageCount) new conversations" }
if activeProjectCount > 1 { return "\(activeProjectCount) projects are moving" }
```

Three files away, `StudioAttentionSummary.hint`
(`Features/Profile/ViewModels/StudioQueueModels.swift:115-129`; the two rungs at `:119` and `:127`) renders the **same
two rungs** in words —
`"\(PatinaCount.inWordsCapitalized(unreadConversationCount)) new conversations"`,
`"\(PatinaCount.inWordsCapitalized(activeProjectCount)) projects are moving"` —
under a doc comment that states the rule the numeric copy breaks: *"SP-16: the one
attention sentence, so the Studio subhead, the Companion and the Daily Room cannot
phrase the same number three ways. **P-24: counted in words, not figures — the
doorstep's ruled form.**"*

They are not on different surfaces. `CompanionOverlay.swift:312` reads
`BadgeCountService.shared.studioHint ?? coordinator.companionContext.attentionSummary`
— the same footer prints "3 new conversations" from one and "Three new
conversations" from the other depending on which is non-nil. `StudioHubView.swift:73`
and `DailyRoomView.swift:608` both print `studioHint`.

The rung above them is already words (`attentionHint` → `PatinaCount`), which is
what makes this a two-line fix rather than a design question. The lane's own
`ApprovalVocabularySweepTests.noRefusedWords` digit sweep does not reach
`studioHint`, which is why four rounds have passed over it.

The strings are pre-existing text, but this lane moved them into a new file for
the 500-line limit — the diff that moved them is the review surface, and the fix
is `PatinaCount.inWordsCapitalized` at four call sites plus one sweep assertion.

### `iosd4-M3` — Today's own approval prompt: a figure, the wrong noun, and a checkmark

`Features/Home/Models/TodayExperience.swift:104-118`:

```swift
let noun = input.pendingDecisionCount == 1 ? "decision is" : "decisions are"
return TodayNextMove(
    kind: .reviewDecisions,
    title: "Review a project decision",
    detail: "\(input.pendingDecisionCount) \(noun) waiting on you.",
    symbol: "checkmark.seal",
    …
```

Three refusals in five lines, on the Today screen — the same screen whose Record
card this lane rewrote, and two taps from the Studio row this lane renamed:

- **A figure.** "3 decisions are waiting on you." against P-24's "no numbers where
  words will do", while `StudioQueueBuilder.swift:323` renders the same count as
  "Three approvals are waiting on you".
- **The wrong noun.** "decision"/"decisions" for a group that is routinely all
  approvals — the binding vocabulary reserves "Decision" for an option choice
  between named alternatives. This is `iosd3-M1`'s defect one frame over, and the
  lane fixed `iosd3-M1` by naming the group for what it holds.
- **A checkmark as the mark.** `symbol: "checkmark.seal"` on an OPEN obligation.
  The lane's own sweep asserts `!row.systemImage.contains("checkmark")` for the
  Studio row (`ApprovalVocabularySweepTests.theApprovalsRowPrintsNoFigure`), and
  P-17 retires `checkmark.seal.fill` as the primary iOS mark. `DecisionPushType`'s
  own doc comment (`DecisionPushHandler.swift:43-51`) states the rule: *"none of
  the three may be a checkmark: a check beside a row IS a status mark, which the
  refusals name."*

Pre-existing on `main` (last touched by `08397a7d2`, an apostrophe sweep) and not
in the lane's numbered items — but the lane's brief is "**plus the vocabulary
sweep on the rails this lane touches**", and this is the loudest string on the
rail whose Record card the lane rebuilt. A steward scope call, not a lane
preference.

### `iosd4-M4` — P-21's row still carries no stamp MARK, three rounds on

P-21's build sheet: *"On iOS, the row **crosses from NEEDS YOU to MOVED carrying
its stamp**, in second person, dated honestly."* `answeredApprovalRows` sets
`state: .none` (`HouseRecord.swift:902`, and `:928` for the proposal) and carries the stamp WORD inside the
sentence only.

The lane's stated reason has expired. `approvals/w2-iosc` now ships `PatinaStamp`
and `ProjectApprovalCopy.stamp(for:)` — verified by extracting both branches'
`ProjectApprovalCopy.swift` and diffing: iOS-C's file carries `import
PatinaDesignKit` and

```swift
static func stamp(for outcome: ProjectApprovalOutcome) -> PatinaStamp.State {
    case .approved: return .approved
    case .changesRequested: return .returned
    case .needsDiscussion: return .held
}
```

which iOS-D's does not. The component exists; the row does not use it; iOS-C's
items do not include the Record row; no lane log records the word-only row as a
ruled shape. Carried as `iosd2-n3`, then `iosd3-m10`, and dropped by both rounds'
triage rather than by a ruling — the item ships incomplete by default.

**Fix:** a steward call at the merge — wire `PatinaStamp` into the afterglow row
once both branches are on one tree (with a test), or record the word-only row as
the deliberate shape in `iosd-notes.md`.

*(Round-2's byte-identity claim on `ProjectApprovalCopy.acts` still holds — I
re-diffed both branches this round and the `acts` block produces no hunk. Only
iOS-C's `stamp(for:)`, signature and note blocks, and iOS-D's `recorded(_:thing:)`
/ `unnamedEdition` / `artifactNoun(kind:)`, differ. Round 2's merge note is
current.)*

---

## Minors

### `iosd4-m1` — `DecisionPushHandler` claims first, and is unreachable anyway (carry of `iosd3-m3`)

`AppDelegate.swift:144-152` calls `DecisionPushHandler.handle(apnsUserInfo:)`
before the generic route for every action but `askQuestion`, and returns when it
claims. `DecisionPush.route` (`DecisionPushHandler.swift:84-89`) answers
`.decisionList` when `decisionId` is nil or empty — discarding a `deep_link` the
generic path would have followed.

Re-verified against the backend lane's **current** head (`a91b1bb9e`):
`buildApnsPayload` (`apns-send/core.ts:263-289`) writes `aps`, `entity_type`,
`entity_id`, `notification_log_id` and — since `6d2316922` — `thread_id`. **No
`type` key**, and 00534:200-208 passes none either. So `DecisionPushHandler.parse`
returns nil for every envelope any producer sends, the ordering bug stays latent,
and the P-22 "one-line wiring its header asks for" ships dead on today's wire.
That is additive and forward-compatible, not wrong — but the day a producer adds
`type`, the ordering bites.

**Fix:** `guard push.decisionId != nil` before claiming, or call the handler only
when the generic route resolved nil.

### `iosd4-m2` — `options: []`, so the dismissal guard and its test pin behaviour iOS never produces (carry of `iosd1-m1` / `iosd3-m5`, four rounds)

`NotificationCategories.categories()` (`:127-136`) passes `options: []` (`:134`) to every
`UNNotificationCategory`. Without `.customDismissAction` the OS never delivers
`UNNotificationDismissActionIdentifier` to `userNotificationCenter(_:didReceive:)`.
`AppDelegate.swift:123`'s `guard NotificationCategories.isOpening(…)` is therefore
unreachable in production, and `NotificationCategoryTests.aDismissalOpensNothing`
plus the lane log's "A dismissal navigates nowhere and marks nothing opened"
describe behaviour that cannot occur.

**Fix:** one word (`options: [.customDismissAction]`) so the guard becomes real,
or drop the claim from `iosd-notes.md` and the test's doc comment.

### `iosd4-m3` — the Record names the thing, the screen and the bell still say "this edition" (carry of `iosd2-m2` / `iosd3-m4`)

`HouseRecord.swift:895` calls `ProjectApprovalCopy.recorded(outcome, thing:
artifactNoun(kind:) ?? unnamedEdition)` → "You approved the spec book."
`ProjectApprovalBlock.swift:172` (`closureLine(ProjectApprovalCopy.recorded(answered),
id: "recorded")`) and `NotificationsViewModel.swift:151` (`return
ProjectApprovalCopy.recorded(recorded)`) both still call the one-argument form →
"You approved this edition." Both hold the same `RemoteProjectApprovalReview` and
could pass the noun. The lane's own rationale for reusing `recorded(_:)` was that
"the Record, the screen and the bell cannot name one outcome three ways"; the
outcome WORD is still identical everywhere, so this is texture, not contradiction.

**Fix:** pass the noun at both call sites (two one-line changes), or record the
divergence as deliberate in the lane log.

### `iosd4-m4` — afterglow rows compete unbounded for MOVED's three slots (carry of `iosd3-m2`)

`maxRowsPerEyebrow` is 3 (`HouseRecord.swift:329`). `answeredApprovalRows` and
`signedProposalRows` are appended into the same pool as orders, messages and
repriced pieces (`:628-630`) and sorted by date desc (`:411`); the only pin is
`matchedDesigner` (`:415-421`). Nothing caps own-act rows, so a week with three
answers leaves the half of the card whose job is *studio-side* movement showing
only the reader's own acts — and, per `iosd4-M1`, the widget with it.

**Fix:** product ruling. If wanted: pin at most one own-act row, or exclude own-act
rows from the cap the way `matchedDesigner` is pinned into it.

### `iosd4-m5` — a doc comment that contradicts the line three below it (carry of `iosd1-m4` / `iosd3-m7`)

`Core/Network/DecisionsAPIClient+ProjectApprovals.swift:255-257`, verbatim and
unchanged: *"P-09's review confirmation is therefore WEB-ONLY for Wave 1; the
viewer-role field that would let the phone carry it is a Wave 2 migration item."*
Line 261 is `public var awaitsClientInFeed: Bool { awaitsClient && isPublished &&
viewerAnswers }`. The `&& isPublished` clause was added at the Wave 1 close
because the projection could not tell a co-member from the lead; `viewerRole` now
does that directly (verified live on `approvals/w2-backend`: 00569:1140-1144 emits
`lead | studio | household`), so the clause's justification has expired and
`awaitsReadingOnly` rows could reach iOS. The lane appended a paragraph beneath
the stale sentence rather than correcting it.

**Fix:** a ruling, not a rewrite — either carry P-09's review-confirmation leg on
iOS now that the role is known, or rewrite the comment to say the restriction is
deliberate for Wave 2.

### `iosd4-m6` — two tests still claim lock-screen deep-link coverage the wire cannot give (carry of `iosd3-m6`)

No APNs envelope carries `deep_link`: `notify_client_attention` invokes `apns-send`
with `user_id`/`title`/`body`/`entity_type`/`entity_id`/`notification_log_id`
only (00534:200-208), and `buildApnsPayload` adds only `aps`, the pair, the log id
and `thread_id`. So `NotificationCategoryTests.openFollowsTheDeepLink` (`:317`)
and the first half of `askFollowsTheLinkThenTheGroupingKey` exercise a path no
banner reaches, and `NotificationDeepLinkRoutingTests`' file header frames the win
as the lock screen's.

**Correction to round 3's own correction, which was too narrow.** Round 3 named
`proposal-nudge/index.ts:153-166` as the sole live beneficiary. There is at least
one more, and it is on the money rail: `stripe-webhook/index.ts:1437-1451` inserts
a `channel: 'in_app'` `notification_log` row for `order.client_id` carrying
`metadata.deep_link = clientProjectDeepLink(order.project_id, 'road', { order:
order.id })` (`:1384`) and **no entity pair**. That row is one the iOS bell reads,
and before this lane it had no route at all. The win is real and larger than
either the lane or round 3 claimed; the tests' *framing* is still wrong.

**Fix:** re-comment the two tests and the `NotificationDeepLinkRoutingTests` file
header to name the in-app bell leg and its two known producers, and stop asserting
lock-screen coverage.

### `iosd4-m7` — NEW: the two frames do not, in fact, read the same rows

`DecisionsListViewModel`'s own doc comment says the eyebrow is "the same rule the
Studio hub row is titled by, **read off the same rows**". They are different rows.
The hub row is built from `BadgeCountService.pendingDecisions` (`StudioQueueContext`),
which is restored from the persisted floor on a cold launch
(`BadgeCountService.swift:248`); the screen's eyebrow is built from
`DecisionsListViewModel.decisions`, which is a second, independent two-read
`load()` (`:52-81`).

The visible consequence is the transient the fix was meant to end. `header` is
drawn unconditionally (`DecisionListView.swift:18`), `content` shows
`PatinaLoadingState` while `isLoading && decisions.isEmpty` (`:50-52`), and
`groupNoun` on an empty collection returns `("Approval", "Approvals")` by
`allSatisfy`. So a homeowner whose waiting rows are real option choices taps
**Decisions** on the hub and lands on **APPROVALS · Awaiting your call** over a
spinner, for as long as two network reads take, before it flips to DECISIONS.
`theEmptyListIsNamedForTheAsk` pins the empty case and nothing pins the loading
one.

**Fix:** one line — hold the eyebrow while `isLoading && decisions.isEmpty`, or
seed `decisions` from `BadgeCountService.shared.pendingDecisions` so the doc
comment's claim becomes true.

### `iosd4-m8` — the ruled fall-back lands on a screen with no door (carry of `iosd2` residual / `iosd3-m8`)

`conversationRoute` (`NotificationCategories.swift:224-238`) falls through to
`NotificationRouter.resolve`, which answers `.proposalDetail` / `.invoiceDetail`;
`pickProjectThreadId` (`apns-send/core.ts:189-195`) omits `thread_id` whenever the
project has zero or two `project` threads. Neither `ProposalDetailView` nor
`InvoiceDetailView` carries a way to write to the studio — `InvoiceDetailView.swift:312`'s
`coordinator.navigate(to: .threadDetail(...))` sits inside the payment-failure
branch. Compliant with the mid-Wave-2 ruling; still a screen with no door.

**Fix:** out of this lane's items. An integration or Wave-3 line: add
`ProjectMessageDesignerLink` (which already exists and already says "Ask a question
about this project") to both detail screens, rather than change the routing the
ruling fixed.

---

## Nits

- **`iosd4-n1` — NEW, and it overturns round 3's `n1` reasoning.** Round 3 recorded
  "queryRoute omits `order`, and that is now the correct call — the only `?order=`
  producer writes to the email leg". The premise is wrong: `stripe-webhook/index.ts:1437-1451`
  writes the same `?order=` link to the **`channel: 'in_app'`** leg for the client,
  which the iOS bell reads. The *conclusion* survives for a better reason: the id
  in that param is a `direct_orders.id`, and `NotificationRouter.orderRoute`
  (`:170-187`) maps a bare `"order"` to the **fulfillment** rail
  (`"fulfillment:<id>"`) — so adding `"order"` to `queryRoute`'s table would route
  a direct order to the wrong rail. Today the link degrades to
  `.projectDetail(projectId:)` via `pathRoute`, which is honest. **Leave it out —
  and record the real reason so nobody "fixes" it later.**
- **`iosd4-n2`** (carry `iosd3-n2`) — `PatinaNotificationCategory.from(apnsUserInfo:)`
  (`:52-66`) has no production caller; `categories()` iterates `allCases` and
  `route()` never calls it. Only `NotificationCategoryTests.theCategoryIsReadFromThePayload`
  exercises it. Use it or delete it with its test.
- **`iosd4-n3`** (carry `iosd3-n3`) — `NotificationsAPIClient.swift:194-198` is the
  one line that reads `deep_link` off the wire, and it is the only leg of P-06's
  live win no test covers: every deep-link test builds `AppNotification(deepLink:)`
  directly. One decode test over a `RemoteNotification` JSON row with
  `metadata.deep_link` and no entity pair.
- **`iosd4-n4`** (carry `iosd1-n1` / `iosd3-n4`) — `AfterglowRowTests
  .theAfterglowAgesOutOnTheOrdinaryWindow` (`:324`; the hand-built interval at `:340-344`) asserts arithmetic on a
  hand-built `DateInterval` instead of calling `HouseRecordBuilder.build`, and its
  window is not the product's (`defaultWindowStart` uses
  `Calendar.current.startOfDay(for: now)` and widens to `min(rolling, lastSeen)`).
  One `build(...)` call with the eight-day row and `#expect(record.moved.isEmpty)`.
- **`iosd4-n5`** (carry `iosd2-n1` / `iosd3-n5`) — `DecisionsAPIClient+ProjectApprovals.swift:106-110`
  dates `artifactKind` to "00569:865", and `iosd-notes.md`'s round-1 M4 section
  repeats it. Verified on `main`: `'artifactKind', artifact.source_kind` is
  `00464:3063` and `00465:423`; 00569:1112 merely reproduces it. The field is live
  on Strata today. Correct both citations so a steward does not read the row's
  copy as blocked on 00569 landing.
- **`iosd4-n6`** (carry `iosd1-n3` / `iosd3-n6`) — `HouseRecord.rows(in:forKey:)`
  (`:283-297`) relies on `SkippedRow` always consuming an element; correct today on
  both decoders, but a cold-launch loop with no independent advance guard is worth
  one line (record `currentIndex`, break when nothing was consumed).
- **`iosd4-n7`** (carry `iosd2-n2` / `iosd3-n7`) — `BadgeCountService.swift:411`,
  `signedProposals = proposals.filter { $0.isSigned && $0.hasSignatureRecord }`,
  has no recency bound (unlike `pendingProposals`' `isAwaitingSignature(now:)` on
  the line above) and is re-filtered on every Record build. Harmless at today's
  volumes; bound it by `signed_at` if the array grows.
- **`iosd4-n8`** (carry `iosd3-n8`) — `AppDelegate.swift:53`'s cold-launch door
  calls `handleNotificationPayload(userInfo, source: "cold_launch")` with neither
  `actionIdentifier` nor `threadIdentifier`, so the last-resort grouping-key leg is
  absent on that path. A `launchOptions` payload always carries the entity pair, so
  it never matters. Noted for completeness.
- **`iosd4-n9`** (carry `iosd3-n9`) — `conversationRoute`'s final `?? .threadList`
  (`:237`) and `askFallsBackToTheInbox` read as if the inbox is a live destination,
  which the mid-Wave-2 ruling's own words forbid. Unreachable: `apnsCategoryFor`
  assigns a `PATINA_*` category only for decision | proposal | invoice, so any
  envelope that can draw the Ask act names an entity. Say so in the doc comment, or
  drop the leg and let the delegate's `?? .notifications` take over.
- **`iosd4-n10` — NEW** — `NotificationRouter.route(forDeepLink:)` (`:118-123`)
  parses with `URLComponents` and never looks at the host, so an absolute link to
  any origin routes: `https://designer.patina.cloud/projects/<id>` and any third
  party's `/decisions/<id>` both resolve to a native screen. `metadata.deep_link`
  is server-written, and the designer-portal `/desk?book=…` family (which lands in
  the same column, `invoice-reminders:199`, `stripe-webhook:478`) happens to parse
  to nil — so this is theoretical today. `automation-processor` interpolates
  template-authored deep links (`:434-437`), which is the one authoring path a
  human touches. One `guard` on the host (or on the link being relative) would
  match the discipline `DeepLinkHandler`'s universal-link path already keeps.
- **`iosd4-n11` — NEW, fallout of the round-3 fix** — `DecisionListView`'s per-card
  fallback is the bare literal `"Decision"` (`:131`, and `:156` in the VoiceOver
  label). It is pre-existing, but the round-3 fix made it a *same-frame*
  contradiction: an untitled row now reads "Decision" beneath an eyebrow that says
  APPROVALS. The Studio's equivalents already have the right stand-ins
  (`StudioQueueBuilder.untitledApprovalTitle` / `untitledDecisionTitle`, `:60-64`).
  The lane recorded this itself and left it; two lines against those two constants
  would close it.

---

## Things checked and found sound (recorded so round five does not re-open them)

- **`viewerRole`, against the migration.** 00569 on `approvals/w2-backend` emits
  `viewerRole` in camelCase (`:1140-1144`) with exactly `lead | studio | household`,
  and the row filter is `AND (v_is_studio OR snapshot.decision_lead_id = v_actor)`
  (the review subquery's closing `WHERE`), so `household` is unreachable today. The lane's classification (lead →
  answers; studio, household → observes; unknown → default-include) matches the
  migration and its comment, and `theProjectionsOwnVocabularyIsRead` pins the three
  literals.
- **`artifactKind`, against the projection.** `'artifactKind', artifact.source_kind`
  is on the read (00569:1112, and on `main` since 00464/00465); the three values are
  fixed by 00463:134-135; `artifactNoun(kind:)` covers all three and degrades to
  "this edition" for a fourth. Only the *citation* is wrong (`iosd4-n5`).
- **No double-draw of one approval.** `canRespond` requires `outcome == nil` and
  `needsReviewConfirmation` requires `lifecycleStatus == "draft"`, so a row carrying
  an outcome and a `respondedAt` cannot also be `awaitsClient`. NEEDS YOU and the
  afterglow are disjoint by construction.
- **`markOpened` is not lost or doubled.** `DecisionPushHandler.handle`
  (`:139-150`) PATCHes the log row itself and returns `true`, and
  `AppDelegate.Self.markOpened` runs on every path it does not claim. One PATCH per
  tap, from either door.
- **The Threshold link shapes are real.** `_shared/client-portal-links.ts` defines
  `ThresholdAnchor` including `` `approval-${string}` `` and composes
  `${origin}${path}${query}#${anchor}` (`:41-72`) — the anchor, query and path forms
  `route(forDeepLink:)` reads, in the order it reads them.
- **`AppNotification.route` order is unchanged.** `fallbackRoute ??
  NotificationRouter.route(for: self)` — the studio-fallback row keeps its route and
  `deepLink` is consulted last.
- **Persistence symmetry.** Neither `projectApprovals` nor `signedProposals` is in
  `PersistedCounts` (`BadgeCountService.swift:254-267`), so neither draws an
  afterglow off the offline floor; both are cleared in `resetForSessionChange`
  (`:445-460`), pinned behaviourally *and* in source by `SessionIsolationTests`.
- **`ProjectApprovalCopy.acts` byte-identity with `approvals/w2-iosc` still holds.**
  Re-diffed this round: the `acts` block produces no hunk. Round 2's merge note is
  current.

---

## For the integration steward

1. **Rule on `iosd4-M1`** (afterglow rows on the widget) before the merge — the
   flag does not gate it, so this ships the moment iOS-D lands.
2. **`iosd4-M2` is two lines** and is the cheapest major on the board.
3. **`iosd4-M3`** needs a scope call: is `TodayExperience` inside "the rails this
   lane touches"?
4. **`iosd4-M4`**: wire `PatinaStamp` into the afterglow row once iOS-C and iOS-D
   are on one tree, or record the word-only row as ruled.
5. **`ProjectApprovalCopy.swift` / `ProjectApprovalActTests.swift` merge**: follow
   round 2's note (take iOS-C's file for `acts`, the signature/note copy and
   `stamp(for:)`; take iOS-D's for `recorded(_:thing:)`, `unnamedEdition`,
   `artifactNoun(kind:)`). Re-verified current this round.
6. **The unit gate's exit 65 is the known Companion flake.** Re-run it in isolation
   (21 tests, exit 0 here) rather than reading a first red as a lane regression.
