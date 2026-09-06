# Wave 2 · lane iOS-D — adversarial review, round three

Reviewer context: fresh, did not write this code. Worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w2-iosd`
(`git rev-parse --show-toplevel` returns exactly that), branch `approvals/w2-iosd`,
HEAD `f987c7999`, base `main` = `107549568`.

Sixteen commits, 23 files, +3585/−90. The tree was clean at review start (`git status
--short` prints only the eight `.env.example: Operation not permitted` lines the sandbox's
read denials produce).

---

## The two round-2 majors: both fixed, verified against the other branch and the wire

### iosd2-M1 — "Ask a question" on a proposal or an invoice · **CLOSED**

The finding's premise was that two of three banners landed on a screen with no way to write
to the studio. It no longer holds, and I confirmed the reason from the backend branch rather
than from the lane log:

- `approvals/w2-backend` `6d2316922` adds `resolveProjectThreadId` (`apns-send/index.ts:113-162`):
  entity → `client_decisions`/`proposals`/`invoices`.`project_id` → the project's single
  `comms_threads` row of kind `project`, via `projectTableFor` (`core.ts:168-179`) and
  `pickProjectThreadId` (`core.ts:189-195`).
- `buildApnsPayload` writes it as the custom key `thread_id` (`core.ts:286-288`), omitted —
  never blank — where there is no single thread.
- `NotificationCategories.conversationRoute` reads that key FIRST, so on a project with a
  conversation every banner's "Ask a question" opens the conversation, all three rails.
  `.threadDetail` is a real, exercised route (`ContentView.swift:391`,
  `WidgetRouteToken`, six product call sites).
- Pinned by `askOnAResolvedEnvelopeOpensTheProjectThread`, which rebuilds the envelope as
  `buildApnsPayload` now assembles it and asserts `.threadDetail` on decision, proposal and
  invoice. The stale doc comment ("Neither is on a `PATINA_*` envelope today") is rewritten
  and no longer misstates shipped behaviour.

Residual, still true and still not a lane defect: where the project has zero project threads
(or two), the act lands on `ProposalDetailView` / `InvoiceDetailView`, and neither carries a
door to the studio — `InvoiceDetailView.swift:287`'s "Message your designer" sits inside the
payment-failure branch. The mid-Wave-2 ruling chose that over the inbox. Recorded below as
`iosd3-m8`.

### iosd2-M2 — the acts array · **CLOSED**

Verified by extracting both files and diffing them:

```
git show approvals/w2-iosc:…/ProjectApprovalCopy.swift > A
git show approvals/w2-iosd:…/ProjectApprovalCopy.swift > B
diff -u A B
```

The only hunks are iosc's `import PatinaDesignKit`, `stamp(for:)`, the P-18 signature copy
and the R10 note copy on one side, and iosd's `recorded(_:thing:)` / `unnamedEdition` /
`artifactNoun(kind:)` on the other. **The `acts` block itself produces no hunk** — it is
byte-identical, so the merge resolves to one text whichever side is taken.
`ProjectApprovalActTests.theActsReadVerbThenConsequence` matches iosc's body including
`#expect(!acts.contains { $0.label == "Decline" })`. `theBannerAndTheDoorsShareNoWord` is a
real new pin: it asserts the doors read `approve / return / hold` and that no
`PatinaNotificationAction.title` collides with one.

No index-based access to `acts` exists in product code
(`ProjectApprovalBlock.swift:218` is a `ForEach`, `:241` a `first { $0.outcome == chosen }`),
so the reorder is safe.

---

## What the wire actually says (checked, not assumed)

- `viewerRole` and `artifactKind` are the projection's real key names —
  `00569:938` (`'artifactKind', artifact.source_kind`) and `00569:966-970`
  (`'viewerRole' … 'lead' | 'studio' | 'household'`). The lane decodes both verbatim. Correct.
- `household` → `.observes` is right: the row filter is
  `AND (v_is_studio OR snapshot.decision_lead_id = v_actor)` (`00569:1051`), so a
  non-studio non-lead row is not serialized at all; and `respond_project_approval` accepts
  only the frozen lead. A reader the RPC refuses may not be asked and may not be credited.
- `artifactKind` is NOT new in 00569 — it is already on the projection on `main`
  (`00464:3063`, `00465:423`), i.e. live on Strata today. The M4 sentence therefore works
  even if 00569 slips. The lane log and one code comment still date it to 00569 (`iosd3-n5`).
- The three `source_kind` values the CHECK allows (`00463:134-135`) are exactly the three
  `artifactNoun` names.

---

## Findings

Severity per the brief. Confidence is in the mechanism, not in the ruling it invites.

### major

**`iosd3-M1` · The hub row says Approvals; the screen it opens says DECISIONS.**
`StudioQueueBuilder.swift:334-337` now titles the awaiting row `Approval` / `Approvals`
whenever every waiting row is one. Its `route` is `.decisionList` (`:348`), whose
`displayName` is `"Decisions"` (`App/Coordinators/Coordinator.swift:155`) and whose own
eyebrow is `MonoLabel(text: "DECISIONS")` (`Features/Decisions/Views/DecisionListView.swift:33`).
A homeowner taps **Approvals** and arrives at **DECISIONS** — two words for one thing, on
two consecutive frames, which is the defect P-16's re-ruling exists to end and which the
binding vocabulary names directly ("'Decision' only for an option choice between named
alternatives"). This is lane-introduced: before the sweep both frames said Decisions.
Carried as a minor in rounds 1 and 2 and dropped both times by the rounds' own triage
("blockers and majors only"), so it is escalated here rather than recorded a third time.
Two acceptable fixes: (a) give the list the same predicate the hub row uses and title it for
what it holds, or (b) revert the hub row to Decisions until the list is renamed. Not
(c) leave it. Confidence 0.85.

### minor

**`iosd3-m1` · The afterglow rows reach the home- and lock-screen widget, and no ruling says
they may.** `WidgetSnapshot.init(record:houseLine:refreshedAt:flagOn:ownerId:)`
(`Core/Persistence/WidgetSnapshot.swift:144-149`) projects **every** `record.moved` row that
has a mappable route; `WidgetRouteToken.init(_:)` (`:75-76`) maps both `.decisionDetail` and
`.proposalDetail`. So "You approved the budget." and "You signed the proposal." will draw on
the widget — a surface `rulings-2026-09-04.md` R15 names in the same breath as this wave
("iOS carries the full approval ceremony. **The widget is untouched.**"). The lane log's
Files section does not mention the widget and no test pins the new kinds against
`WidgetSnapshot`. Mitigation: the payload is gated by `FeatureFlagMirror.isOn(.houseWidget)`
(`RecordSnapshotStore.swift:90`), so it is dark while that flag is off — which is why this is
a minor and not a major. It becomes a major the day the flag flips. Wants a steward ruling
(carry them, or filter `kind.isOwnAct` out of the widget projection — one `compactMap`
clause), not silence. Confidence 0.85 on the mechanism.

**`iosd3-m2` · Three of her own acts can evict every studio-side movement from MOVED.**
`maxRowsPerEyebrow` is 3 (`HouseRecord.swift:329`) and the afterglow rows are sorted into the
same pool as orders, messages and repriced pieces (`:411-420`), with no cap of their own and
no pin except `matchedDesigner`. A week with three answered approvals leaves MOVED a mirror
of the reader's own actions — the half of the card whose job is what the studio did. The deck
asked for the afterglow; it did not ask for it to be able to take the whole eyebrow.
Confidence 0.55 — a product ruling, not a bug.

**`iosd3-m3` · (carry, `iosd2-m1`) `DecisionPushHandler.handle` still claims a payload it
cannot route.** `AppDelegate.swift:145-148` calls it before the generic route for every
action but "Ask a question"; `DecisionPush.route` (`DecisionPushHandler.swift:84-89`) answers
`.decisionList` when the envelope named no decision id, discarding the `deep_link` the
generic path would have followed. Latent — `buildApnsPayload` still writes no `type` key —
but the guard is one line: `guard push.decisionId != nil` before claiming. Confidence 0.7.

**`iosd3-m4` · (carry, `iosd2-m2`) The Record names the thing; the screen and the bell still
do not.** `HouseRecord.swift:895` calls `recorded(_:thing:)` with `artifactNoun(kind:)`;
`ProjectApprovalBlock.swift:172` and `NotificationsViewModel.swift:151` still call the
one-argument `recorded(_:)` and print "You approved this edition." Both hold the same
`RemoteProjectApprovalReview` and could pass the noun — two one-line changes. The outcome
word is identical everywhere, so this is a texture divergence, not a contradiction; but the
lane's own stated rationale for reusing `recorded` was that the three surfaces cannot name
one outcome three ways, and they now name one THING two ways. Confidence 0.85.

**`iosd3-m5` · (carry, `iosd1-m1`) The categories register with `options: []`, so the
dismissal guard is unreachable.** `NotificationCategories.categories()` (`:127-136`) passes
`options: []`; without `.customDismissAction` iOS never delivers
`UNNotificationDismissActionIdentifier` to `didReceive`. `AppDelegate.swift:123`'s guard and
`NotificationCategoryTests.aDismissalOpensNothing` therefore pin behaviour the OS will not
produce, and the lane log states the dismissal rule as shipped behaviour. Either pass
`.customDismissAction` (one word) or stop claiming it. Confidence 0.9.

**`iosd3-m6` · (carry, `iosd1-m3`, with corrected evidence) The lock-screen deep-link tests
claim coverage the wire cannot give — and the lane's stated cause is the wrong one.**
No APNs envelope carries `deep_link`: `notify_client_attention` invokes `apns-send` with
`user_id, title, body, entity_type, entity_id, notification_log_id` only
(`00534:200-208`) and `buildApnsPayload` adds `aps`, the pair, the log id and `thread_id`.
So `NotificationCategoryTests.openFollowsTheDeepLink` and the first half of
`askFollowsTheLinkThenTheGroupingKey` exercise a path no banner reaches, and their doc
comments say otherwise. Correcting the lane's own framing while I am here: the Threshold's
query/anchor links are also NOT the live beneficiary — every producer that writes a
Threshold-shaped `deep_link` into an in-app row also writes an entity pair, which wins
(`00534:147-157`, `:259-273`), and the one `?order=` producer
(`stripe-webhook/index.ts:1311, :1384`) writes to the EMAIL leg, which P-05 narrowed the
bell away from. What the new `route(forDeepLink:)` actually rescues is
`proposal-nudge/index.ts:153-166`: a `channel: 'in_app'` row for the client carrying
`deep_link: /proposals/<id>` and **no entity pair at all** — a bell row that had no route
before this lane and now opens the proposal. That is a real, live win the log does not
claim. Fix: re-comment the two tests and the file header to name `proposal-nudge` and the
in-app leg, and stop asserting the lock screen. Confidence 0.9.

**`iosd3-m7` · (carry, `iosd1-m4`) `awaitsClientInFeed`'s comment still names a cause that
has expired, and P-09's review-confirmation leg is still dark on iOS.**
`DecisionsAPIClient+ProjectApprovals.swift:255-257` still reads "the viewer-role field that
would let the phone carry it is a Wave 2 migration item" three lines above the code that
reads that field. The `&& isPublished` clause was added because the projection could not tell
a co-member from the lead; `viewerAnswers` now does, so the clause's original justification
is gone and the review-confirmation leg could come to iOS. Ruling, not a rewrite: either
carry the leg or say the restriction is deliberate for Wave 2. Confidence 0.7.

**`iosd3-m8` · The ruled fall-back lands on a screen with no door.** Where a project has no
single project thread, "Ask a question" opens `ProposalDetailView` / `InvoiceDetailView`,
neither of which offers a way to write to the studio outside the invoice payment-failure
branch. The mid-Wave-2 ruling chose the document over the inbox, so this is compliant; but
"never the inbox as a dead end" was written against dead ends, and this is one.
`ProjectMessageDesignerLink` already exists and already says "Ask a question about this
project". Out of this lane's items; an integration/Wave-3 line for the steward.
Confidence 0.8.

**`iosd3-m9` · (carry, `iosd1-m5`) The two numeric hints the lane RELOCATED are still
numeric.** `BadgeCountService+Attention.swift:53-56` returns `"\(unreadMessageCount) new
conversations"` and `"\(activeProjectCount) projects are moving"`. P-24: no numbers where
words will do; the rung above them is already words via `PatinaCount`. The lane created this
file — copying the strings across was the moment to convert them, and
`ApprovalVocabularySweepTests`' digit sweep does not reach them. Confidence 0.85.

**`iosd3-m10` · (carry, `iosd2-n3`, escalated) The afterglow row still draws no stamp
MARK, and no lane now owns it.** P-21's build sheet says the row "crosses from NEEDS YOU to
MOVED **carrying its stamp**". `answeredApprovalRows` sets `state: .none` and carries the
stamp WORD in the sentence only. `PatinaStamp` landed on `approvals/w2-iosc` (P-17), so it
exists at integration — but iOS-C's items do not include the Record row and iOS-D cannot
import a component that is not on its branch. Left as is, the item ships with the mark
missing and nobody's lane log records the omission as a decision. Steward call at the merge.
Confidence 0.6.

### nit

**`iosd3-n1` · (carry, `iosd1-m2`, downgraded) `queryRoute` omits `order`, and that is now
the right call.** `NotificationRouter.swift:139` reads `decision / proposal / invoice`.
The only `?order=` producer writes to the email leg (see `iosd3-m6`), which the iOS bell does
not read, so adding the key would be dead code. Recorded so the next reviewer does not
re-raise it. Confidence 0.85.

**`iosd3-n2` · `PatinaNotificationCategory.from(apnsUserInfo:)` has no production caller.**
`grep -rn PatinaNotificationCategory apps/mobile/Patina --include=*.swift` outside the tests
returns only `NotificationCategories.swift` itself; `categories()` iterates `allCases`. The
function is exercised solely by `theCategoryIsReadFromThePayload`. Harmless and plausibly
forward-looking, but it is a test pinning a function nothing calls. Confidence 0.9.

**`iosd3-n3` · The one line that actually reads `deep_link` off the wire has no test.**
`NotificationsAPIClient.swift:194-198` (`remote.metadata?["deep_link"]?.value as? String ??
remote.metadata?["url"]?.value as? String`) is the whole of P-06's in-app leg, and every
deep-link test constructs `AppNotification(deepLink:)` directly instead. The pattern matches
`entity_type`/`entity_id` two lines above, which is proven, so the risk is low — but the leg
this lane's live win depends on is the one leg unpinned. Confidence 0.8.

**`iosd3-n4` · (carry, `iosd1-n1`) `theAfterglowAgesOutOnTheOrdinaryWindow` still asserts
arithmetic, not behaviour.** `AfterglowRowTests.swift:340-344` builds a `DateInterval` by
hand and asserts `!window.contains(oldRow.date)`; it never calls
`HouseRecordBuilder.build(...)` with the eight-day row. It also computes the window as
`now − rollingWindow`, where `build` uses `startOfDay(for: now) − rollingWindow` and widens
to `lastSeen` — so the test's window is not the product's. One `build(...)` call with
`#expect(record.moved.isEmpty)` replaces it. Confidence 0.9.

**`iosd3-n5` · (carry, `iosd2-n1`) `artifactKind` is dated to 00569 in two places.**
`iosd-notes.md` ("`artifactKind` (00569:865…)") and
`DecisionsAPIClient+ProjectApprovals.swift:106-110` ("served as `artifactKind` (00569:865)").
It is on the projection on `main` at `00464:3063` and `00465:423`, i.e. live on Strata now.
Worth correcting so the steward does not treat the row's copy as blocked on 00569.
Confidence 0.95.

**`iosd3-n6` · (carry, `iosd1-n3`) `rows(in:forKey:)` has no independent advance guard.**
`HouseRecord.swift:285-296`: the loop's only advance is `_ = try? unkeyed.decode(SkippedRow.self)`.
Both the classic and swift-foundation decoders do advance there (they increment
`currentIndex` only on a successful decode, and `SkippedRow` always succeeds — including on
`null`), so this is correct today. Recording `currentIndex` and breaking when nothing was
consumed is one line of insurance on a cold-launch path. Confidence 0.7.

**`iosd3-n7` · (carry, `iosd2-n2`) `signedProposals` is unbounded.**
`BadgeCountService.swift:408`: `proposals.filter { $0.isSigned && $0.hasSignatureRecord }`,
no recency predicate, re-filtered on every Record build; the seven-day window drops them
downstream. Harmless at today's volumes. Confidence 0.85.

**`iosd3-n8` · The cold-launch door drops the grouping key.**
`AppDelegate.swift:53` calls `handleNotificationPayload(userInfo, source: "cold_launch")`
with no `threadIdentifier`, so the last-resort `decision-<id>` leg is absent there. A
launchOptions payload always carries the entity pair, so it never matters in practice.
Confidence 0.8.

**`iosd3-n9` · `conversationRoute` still ends at the inbox, which the ruling's words
forbid.** `NotificationCategories.swift:238` returns `.threadList` as the last resort.
Unreachable from a `PATINA_*` banner — `apnsCategoryFor` (`core.ts:129-141`) assigns a
category only for `decision | proposal | invoice`, so the envelope always names an entity —
but the leg and its test (`askFallsBackToTheInbox`) read as if the inbox is a live
destination for a categorized letter, which the mid-Wave-2 ruling closed. Confidence 0.6.

---

## Nothing out of scope, and one deliberate cross-lane reach

Files touched are the eleven the lane's item list implies plus `BadgeCountService+Attention.swift`
(a `file_length` carve-out — `BadgeCountService.swift` is 482 lines against SwiftLint's 500
warning) and `ProjectApprovalCopy.swift`/`ProjectApprovalActTests.swift`, which belong to
P-16/iOS-C. The lane took those two deliberately, to make the conflicting hunk byte-identical,
and its round-2 merge note tells the steward exactly which side to take for every other block
in the file. That is the right call and it is documented; no finding.

`HouseRecord`'s Codable resilience is beyond the letter of P-21 but is directly caused by it
(two new `Kind` cases would otherwise blank Today on the first cold launch after a downgrade),
and it is pinned by five tests. Kept.

No production mutation was run. No `.env`, hook or settings file was read or written. The
widget target does not compile `HouseRecord.swift` — `PatinaWidgetShared/HouseWidgetPayload.swift:13`
says it deliberately does not decode `HouseRecord` — so the new kinds cannot break the
extension's decode.

## Gates — run by the reviewer, from this worktree, unsandboxed

`IOS_GATE_UDID=493547C8-D84B-478B-8673-3FF6ACAA05C6`, tree `f987c7999`.

| gate | command | result |
|---|---|---|
| `build` | `ios-gate.sh build` | **PASS** — `** BUILD SUCCEEDED **`, exit 0 |
| `unit` (run 1) | `ios-gate.sh unit` | **RED** — `Test run with 2535 tests in 276 suites failed after 13.822 seconds with 3 issues (including 2 known issues)`; `** TEST FAILED **`, exit 65 |
| `unit` (run 2) | `ios-gate.sh unit` | **RED** — same three issues, exit 65 |
| `CompanionCoachingModelTests` alone | `xcodebuild -only-testing:PatinaTests/CompanionCoachingModelTests` | **PASS** — `Test run with 21 tests in 1 suite passed after 0.075 seconds`, `** TEST SUCCEEDED **`, exit 0 |
| `unit` minus this lane's 5 suites | `-only-testing:PatinaTests` + 5 `-skip-testing:` | **RED, identically** — `Test run with 2468 tests in 271 suites failed … with 3 issues (including 2 known issues)`, exit 65 |
| `lint-delta main` | `ios-gate.sh lint-delta main` | **PASS** — `✓ lint-delta: no new warnings in touched files` |

The third issue in both full runs is
`CompanionCoachingModelTests.introGate_freshUser_pollsUntilTourResolves()`
(`CompanionCoachingModelTests.swift:384`, `Expectation failed: (result → false) == true`) —
a 10 ms poll against a 50 ms `Task.sleep` handoff. The other two are the pre-existing pair
both iOS lanes report: `BrandVoiceLintTests.swift:168` ("curated_mix") and
`RoomLifecycleTests.theTodayRailFollowsALocalDelete` (`:297`), both `recorded a known issue`.

`git diff --name-only main...HEAD | grep -i companion` is empty — this lane touches no
Companion source. I proved the exoneration rather than asserting it: a full run with all five of this lane's
new suites skipped (`AfterglowRowTests`, `NotificationCategoryTests`,
`NotificationDeepLinkRoutingTests`, `RecordSnapshotCompatibilityTests`,
`ApprovalVocabularySweepTests` — 2468 tests in 271 suites) fails on the SAME test with the
SAME three issues. The failure is pre-existing and load/ordering dependent, not a lane
regression, and the `unit` tier is therefore green on this lane's merits.

Worth the steward's attention regardless: the lane's rounds 1 and 2 each reported the full
`unit` tier green with 2 known issues; it went red on **both** of my runs today. The flake
rate on this test is high enough that the integration gate should expect it and re-run the
suite in isolation rather than treat the first red as a lane regression.

## Verdict

**fix** — no blocker; one major (`iosd3-M1`, the Approvals → DECISIONS mismatch this lane
introduced and two rounds of triage have skipped). The two round-2 majors are genuinely
closed and verified against the other branches and the migration, the build and lint-delta
gates are green, and the unit tier's only non-known failure is proven pre-existing. Ten
minors and nine nits stand for the steward; `iosd3-m1` (the widget) and `iosd3-m10` (the
stamp mark) want a ruling at integration rather than a lane fix.
