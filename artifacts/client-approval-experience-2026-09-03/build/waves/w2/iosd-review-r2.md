# Wave 2 · lane iOS-D — adversarial review, round 2

Reviewer worktree (read-only for source; this file is the only thing written):
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w2-iosd`
(`git -C … rev-parse --show-toplevel` →
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w2-iosd`), branch
`approvals/w2-iosd`, base `107549568`.

```
$ git log --oneline main..HEAD
af83781e6 docs(approvals): the W2 iOS-D round-1 fixes and re-run gates
7d6ac3653 fix(ios): an answered approval does not survive into the next account (iosd1-M3)
25ce8509e fix(ios): Ask a question reaches the document it is about (iosd1-M2)
c45effeca fix(ios): the afterglow row names its thing, and only the lead is credited (iosd1-M1, M4, carry1)
ae6dc216a docs(approvals): adversarial review of the W2 iOS-D lane, round one
0508fd40b docs(approvals): the W2 iOS-D gate results
c4d98affd feat(ios): a collapsed reminder still names its own row (P-22)
ba8539707 docs(approvals): the W2 iOS-D lane log
0b6f61dc1 fix(ios): the Studio hub names an approval an approval
69d107ef9 feat(ios): the answered row crosses to MOVED carrying its word (P-21)
7ea3073a7 feat(ios): the lock screen offers two acts and never an outcome (P-22)
6fc52792e feat(ios): the router follows a Threshold link to the native screen (P-06)

$ git diff main...HEAD --stat | tail -1
 22 files changed, 3098 insertions(+), 79 deletions(-)
```

Working tree clean (`git status --short` prints only the eight
`.env.example: Operation not permitted` lines the sandbox's read denials
produce). Round-2 commits are pathspec-clean — `git show --numstat` on each
touches only its item's product and test files; the docs commit touches only
`iosd-notes.md`, force-added as ruled. Conventional Commits subjects, no
trailers, no `merge(...)` subject.

## Verdict — **fix**

No blocker. **All four round-1 majors and the carried "Decline" are genuinely
fixed** — each verified against the migration body or by reading the shipped
code path, not by reading the lane's claim. Two NEW majors, both created by the
M2 fix and both cross-lane, need the steward rather than a lane rewrite. Six
round-1 minors and three nits were not addressed and are re-recorded here.

## Gates I ran myself

From this worktree, unsandboxed, `IOS_GATE_UDID=493547C8-D84B-478B-8673-3FF6ACAA05C6`
(`cae-w1-iosb`, the UDID `env.md` assigns this lane).

| tier | result |
|---|---|
| `build` | **PASS** — `** BUILD SUCCEEDED **`, exit 0 |
| `unit` | **PASS** — `Test run with 2533 tests in 276 suites passed after 10.036 seconds with 2 known issues`; `** TEST SUCCEEDED **`; `UNIT_EXIT=0` |
| `lint-delta main` | **PASS** — `✓ lint-delta: no new warnings in touched files`, `LINT_EXIT=0` |

The two known issues are the pre-existing pair both iOS lanes report
(`BrandVoiceLintTests` on "curated_mix", `RoomLifecycleTests.theTodayRailFollowsALocalDelete`).
**`CompanionCoachingModelTests.introGate_freshUser_pollsUntilTourResolves` did
not flake on this run** — no isolated re-run was needed, and the `unit` tier
exits 0 on this tree as run, which it did not at round 1.

2524 tests at round 1 → **2533** here; +9, exactly the count the lane's log claims.

## Round-1 findings — verified one by one

| r1 | status | how I checked |
|---|---|---|
| **M1** `household` read as answering | **FIXED** | `git show approvals/w2-backend:supabase/migrations/00569_…sql` — the `CASE` at `:884-888` emits `lead \| studio \| household` and the function `COMMENT` advertises the same three. `ProjectApprovalViewerRole.observing` now contains `"household"` (`DecisionsAPIClient+ProjectApprovals.swift:79`). `AfterglowRowTests.theProjectionsOwnVocabularyIsRead` pins all three literals; `aHouseholdWatcherIsNeitherAskedNorCredited` pins BOTH consequences — `!awaitsClientInFeed` and an empty `answeredApprovalRows`. The reachability caveat (the row filter at `:969`) is recorded correctly and the fix lands anyway, which is right: the declared vocabulary is the contract. |
| **M2** "Ask a question" could not reach a thread | **FIXED as stated; see R2-M1/R2-M2** | `conversationRoute` (`NotificationCategories.swift:216-230`) now falls through `thread_id` → `entity_type: "thread"` → `NotificationRouter.resolve` → the sender's grouping key → `.threadList`. I re-read `buildApnsPayload` on `approvals/w2-backend` (`apns-send/core.ts:220-241`): it emits `aps` (with `interruption-level`, `category`, `thread-id`), `entity_type`, `entity_id`, `notification_log_id` — still **no** `thread_id`, so the second leg is indeed the one that runs. `NotificationRouter.resolve` cannot answer a LIST route (`route(forEntityType:)` names an entity or nil), so the fall-through is safe. |
| **M3** `resetForSessionChange` left `projectApprovals` | **FIXED** | `BadgeCountService.swift:451-457` — `signedProposals = []` and `projectApprovals = []` beside the other eleven. `SessionIsolationTests.theAnsweredApprovalsAreClearedToo` asserts the ROW disappears (through the `applyProjectApprovalsForTesting` DEBUG seam), not merely that the array emptied, and `theResetBodyNamesEveryField` now names both new arrays. |
| **M4** the afterglow sentence | **FIXED, and the reasoning is right** | `artifactKind` is decoded (`RemoteProjectApprovalReview.artifactKind: String?`) and `ProjectApprovalCopy.artifactNoun(kind:)` maps the three CHECK-constrained values (`00463:134-135`) to lower-case common nouns. `mixedKindsDoNotRepeatOneHeadline` asserts three distinct titles; `anUnknownKindFallsBackToTheEdition` pins the degrade for `NSNull()` and for an unknown kind. The remaining deviation from the deck (no room qualifier — "the budget", not "the dining room budget") is honest: only `artifactTitle` carries the qualifier and only in capitals. |
| **carry1** `acts[2].label == "Decline"` | **FIXED** | `ProjectApprovalCopy.swift:41` reads `label: "Return"`; `ProjectApprovalActTests` updated; and — the part that matters — `ApprovalVocabularySweepTests.noRefusedWords` now sweeps `acts` labels AND consequences and refuses the stem `"decline"`, so the array can no longer exclude itself from its own sweep. **See R2-M2: `approvals/w2-iosc` fixed it too, differently.** |

## New findings

### R2-M1 — "Ask a question" on a proposal or an invoice now lands where no question can be asked (major, confidence 0.8)

The M2 fix routes the act through `NotificationRouter.resolve`, which for the
other two `PATINA_*` categories answers `.proposalDetail` / `.invoiceDetail`.
`NotificationCategoryTests.askOpensTheDocumentItself` pins exactly that for all
three entities.

For the decision rail that is right — the approval screen carries the act. For
the other two it is not:

```
$ grep -rniE "thread|messag" apps/mobile/Patina/Patina/Features/Proposals
  (nothing but errorMessage / PatinaErrorState)
$ grep -rn "Message your designer" apps/mobile/Patina/Patina/Features/Invoices
  InvoiceDetailView.swift:287 — inside `if failure.offersDesignerMessage`
```

`ProposalDetailView` offers Sign and Decline and nothing else; `InvoiceDetailView`
offers a designer message only inside the payment-FAILURE branch. So a homeowner
who taps **Ask a question** on a proposal banner is carried to a signature
screen, and on an invoice banner to a payment screen — with no way to ask
anything. Before the fix she landed on `.threadList`, which lost the document's
identity but was at least where she writes to the studio. Two of the three
categories got worse.

Cheapest honest shape: keep `.decisionDetail` for `PATINA_DECISION`, and let
`PATINA_PROPOSAL` / `PATINA_INVOICE` keep `.threadList` until either those
screens grow the act or the backend puts `thread_id` on the envelope. That is a
three-line change in `conversationRoute` plus the test. Steward's call, because
it partially reverts a fix this round was asked to make.

### R2-M2 — the M2 fix's stated rationale is void at integration: iOS-C renamed the in-app act to "Hold" (major, confidence 0.85)

`NotificationCategories.swift:206-211` justifies landing the lock-screen act on
the document because *"'Ask a question' is the same act on the lock screen as it
is inside the app (`ProjectApprovalCopy.acts`)"*. That was true of this branch's
`acts[1]`. It is not true of the tree that will exist after the merge:

```
$ git show approvals/w2-iosc:apps/mobile/Patina/Patina/Features/Decisions/ProjectApprovalCopy.swift
    ProjectApprovalAct(outcome: .approved,          label: "Approve", …)
    ProjectApprovalAct(outcome: .changesRequested,  label: "Return",  …)
    ProjectApprovalAct(outcome: .needsDiscussion,   label: "Hold",
      consequence: "Keep this open while you and your designer talk it through.")
```

P-16 gives the three doors equal weight and renames the hold door **Hold**. So
after `approvals/w2-iosc` merges there is no "Ask a question" button anywhere in
the app, the banner promises a question and delivers a screen offering
Approve / Return / Hold, and the comment above is a false statement in shipped
source.

Two further consequences the steward must not resolve by taking "either" side,
which is what `iosd-notes.md`'s merge note advises:

1. **The array ORDER differs.** iOS-D keeps `[approve, needsDiscussion, changesRequested]`;
   iOS-C ships `[approve, changesRequested, needsDiscussion]` — the P-16 shape,
   which is the one the ruling names. Taking iOS-D's file would silently revert
   P-16's ordering and its rewritten consequence lines.
2. **`ProjectApprovalActTests.swift` conflicts too** (`acts[2].label` is asserted
   in both), and `ApprovalVocabularySweepTests`' new sweep over `acts` must
   survive — it is the pin that caught "Decline" in the first place.

Take iOS-C's `ProjectApprovalCopy.acts` verbatim, keep iOS-D's sweep, and then
decide R2-M1 and the lock-screen act's wording together, because they are one
question.

### R2-m1 — `DecisionPushHandler` can hijack a linked decision push to the list (minor, confidence 0.7)

`AppDelegate.handleNotificationPayload` calls `DecisionPushHandler.handle` FIRST
for every action but "Ask a question", and returns when it claims the payload.
`DecisionPush.route` (`DecisionPushHandler.swift:86-91`) falls back to
`.decisionList` when the envelope carries no decision id — so an envelope
carrying `type: "decision_required"` and only a `deep_link` would be routed to
the list, discarding the Threshold-link resolution P-06 exists to provide, and
the carefully-built `NotificationCategories.route` value would never be used.

Latent, not live: no producer puts `type` on an APNs body —
`00534:200-208`, `00330:182`, `00331:342`, `00334:120` pass only
`user_id/title/body/entity_type/entity_id/notification_log_id`, and
`buildApnsPayload` adds nothing else. One guard (`guard push.decisionId != nil`,
or call the handler only when the generic route is nil) closes it.

### R2-m2 — the bell and the approval screen still say "this edition" while the Record names the thing (minor, confidence 0.85)

The lane's own P-21 argument for reusing `recorded(_:)` was that "the Record,
the screen and the bell cannot name one outcome three ways". After M4 they do
name it two ways:

```
Patina/Features/Decisions/Views/ProjectApprovalBlock.swift:172  ProjectApprovalCopy.recorded(answered)
Patina/Features/Notifications/ViewModels/NotificationsViewModel.swift:151  ProjectApprovalCopy.recorded(recorded)
Patina/Features/Home/Models/HouseRecord.swift:895               recorded(outcome, thing: artifactNoun(…))
```

Both other call sites hold the same `RemoteProjectApprovalReview` and could pass
the noun — `ProjectApprovalBlock` is rendering the very artifact, and
`retitleApprovals` takes `approvals:` as an argument. The outcome WORD is still
identical on all three (which is the ruling), so this is consistency, not a
refusal: two one-line changes, or a note saying the divergence is deliberate.

## Round-1 minors and nits still open (re-verified, not re-argued)

| r1 | still open? | evidence |
|---|---|---|
| **m1** the dismissal branch cannot fire | **yes** | `NotificationCategories.categories()` still builds each category with `options: []` (`:134`). Without `.customDismissAction` iOS never delivers `UNNotificationDismissActionIdentifier`, so `AppDelegate`'s `guard NotificationCategories.isOpening(…)` and `aDismissalOpensNothing()` describe behaviour the OS will not produce. Either add the option or drop the claim from the notes. |
| **m2** `queryRoute` omits `?order=` | **yes** | `NotificationRouter.queryRoute` reads `["decision", "proposal", "invoice"]` (`:138`). The only query-param deep link with a producer is `clientProjectDeepLink(project, 'road', { order: order.id })` at `stripe-webhook/index.ts:1311,1384`; it falls through to `pathRoute` and opens the project, when `orderRoute` could have opened the order. |
| **m3** the APNs half of the deep-link fallback is unreachable | **yes** | `buildApnsPayload` on `approvals/w2-backend` (quoted above) emits no `deep_link` and no `url`; `notify_client_attention`'s invoke body (`00534:200-208`) passes neither. The live half of P-06's link work is the FEED path, which is real. `askFollowsTheLinkThenTheGroupingKey` and `openFollowsTheDeepLink` read as if the lock screen exercises it; it does not. |
| **m4** `awaitsClientInFeed` keeps its Wave 1 stand-in | **yes** | `DecisionsAPIClient+ProjectApprovals.swift:255-257` still reads "P-09's review confirmation is therefore WEB-ONLY for Wave 1; the viewer-role field that would let the phone carry it is a Wave 2 migration item." The field landed and is read three lines below; `&& isPublished` stayed. Ruling, not a defect — but the comment now describes a cause that is gone. |
| **m5** the last numeric hints were relocated, not converted | **yes** | `BadgeCountService+Attention.swift:55-58` — `"\(unreadMessageCount) new conversations"`, `"\(activeProjectCount) projects are moving"`. The neighbouring approval figure is words (`PatinaCount`); these are the last digits on the same subhead. |
| **m6** the hub row is named "Approval" and routes to "Decisions" | **yes** | `StudioQueueBuilder` titles the row Approval/Approvals; `AppRoute.decisionList` → `Coordinator.swift:155` `displayName == "Decisions"`, and the destination's own eyebrow is `MonoLabel(text: "DECISIONS")` at `DecisionListView.swift:32`. She taps Approvals and arrives at DECISIONS. |
| **n1** the ageing test does not exercise the builder | **yes** | `AfterglowRowTests.theAfterglowAgesOutOnTheOrdinaryWindow:340-344` still asserts `!window.contains(oldRow.date)` — arithmetic about a `DateInterval`, not `HouseRecordBuilder.build` dropping the row. |
| **n2** "You signed" asserts an identity the wire cannot confirm | **yes** | unchanged; safe only because R3 keeps one client login per project. |
| **n3** the row-skip loop has no progress guard | **yes** | `HouseRecord.rows(in:forKey:)` still relies on `SkippedRow` always consuming an element. It does on both decoders; a `currentIndex` compare is one line of insurance against an infinite loop on a corrupt snapshot. |
| **carry2** `ProposalDetailView.swift:174` draws `PatinaStatusBadge(state: .error, text: "Declined")` | not this lane | P-17 territory; `approvals/w2-iosc` has landed P-17 — confirm it took this banner with it. |
| **carry3** the afterglow row draws no stamp MARK | **yes, by design** | P-17's `PatinaStamp` now exists on `approvals/w2-iosc`. The row carries the stamp WORD only. Integration item, not a lane defect. |

## New nits

- **n4 — the notes date `artifactKind` to 00569.** It has been on the projection
  since `00464:3063` and `00465:423`, i.e. it is live on Strata today. That is
  good news the log undersells: the M4 sentence names the thing correctly even
  if 00569 slips.
- **n5 — `signedProposals` is unbounded.** `proposals.filter { $0.isSigned && $0.hasSignatureRecord }`
  retains every proposal the account ever signed, re-filtered on every Record
  build; the seven-day window drops them downstream, not here. Harmless at
  today's volumes.

## What I verified beyond re-reading the diff

- **The wire, again, against `approvals/w2-backend` as it stands at `0b18be341`.**
  `00569:864-888` emits `artifactKind` (= `artifact.source_kind`) and
  `viewerRole` (= `lead | studio | household`), both camelCase, both matching
  the synthesized `CodingKeys` of `RemoteProjectApprovalReview`. `00463:134-135`
  is the CHECK that fixes the three kind values `artifactNoun` maps. The
  round-1 nit n4 (key spelling) is confirmed closed.
- **`buildApnsPayload` on the backend branch** now carries
  `interruption-level: "active"`, `aps.category` from `apnsCategoryFor`, and
  `aps["thread-id"]` from `apnsThreadId` — matching this lane's category reader
  and thread-identifier splitter exactly, with no `mutable-content` (NSE
  deferred, as ruled).
- **Refusal grep over every added line** (`git diff main...HEAD -- apps/mobile`,
  `^+` only, for `overdue|gate|task|dashboard|AI|declin|confetti|emoji|shadow|
  badge|checkmark|sage|green|red`). Every hit is a code identifier, a comment,
  or a test asserting the refusal. **No refused word reaches a homeowner-visible
  string this lane authored.** The one digit left is m5's relocated pair.
- **The MOVED window.** The two new kinds still fall into the `default:` arm of
  the filter (`HouseRecord.swift:400-408`) — `window.contains(row.date) ? row : nil`.
  No special-casing, no persistence, no new decay rule, as P-21 requires.
  `signedProposals` is explicitly not persisted.
- **No duplicate row.** An answered approval has `outcome != nil`, so
  `canRespond` is false and `lifecycleStatus == "responded"` makes
  `needsReviewConfirmation` false — it cannot appear in NEEDS YOU and MOVED at
  once.
- **The snapshot codec.** `RecordSnapshotStore` uses a plain `JSONEncoder`/
  `JSONDecoder` with only `dateEncodingStrategy = .iso8601` — no key strategy —
  so `HouseRecord`'s newly-declared `CodingKeys` match what the synthesized
  encoder writes, byte for byte, and an old snapshot still reads.
- **Commit hygiene.** `git show --numstat` on each of the three fix commits:
  product + test files for that item only. `af83781e6` touches only
  `iosd-notes.md`.

## What I did not do

No throwaway Swift probe was needed this round: every claim above is either a
literal read of the shipped source, a read of the migration/edge-function body
on `approvals/w2-backend`, or an assertion the lane's own new tests make and the
`unit` gate proved green. Round 1's probe already measured the two behaviours in
question; this round's fixes are pinned by `askOpensTheDocumentItself`,
`askOnTheRealEnvelopeReachesTheApproval`, `aHouseholdWatcherIsNeitherAskedNorCredited`
and `theAnsweredApprovalsAreClearedToo`, all of which I watched pass.

## Recommended order for the steward

1. **R2-M2** — take `approvals/w2-iosc`'s `ProjectApprovalCopy.acts` verbatim
   (order and consequences), keep iOS-D's sweep over it, and fix the now-false
   comment at `NotificationCategories.swift:206-211`.
2. **R2-M1** — rule the lock-screen act's destination per rail. Decision →
   the approval. Proposal / invoice → `.threadList` until those screens carry
   the act, or the backend carries `thread_id`.
3. **R2-m1** (one guard), **m6** (one word, or one screen title), **R2-m2**
   (two one-line call sites).
4. m1, m2, m3's stale test names, m4's stale comment, m5's two digits, then the nits.
