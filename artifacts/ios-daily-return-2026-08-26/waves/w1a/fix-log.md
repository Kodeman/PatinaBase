# W1a — fix round F1 (against review V1)

Fixer F1, same worktree `.codex/worktrees/agent-dr-w1a-prereq`, branch
`daily-return/w1a-prereq`. Four commits on top of `770ca33f0`, all pathspec-restricted.

| Commit | Answers |
|---|---|
| `6aa7a4b94` fix(ios): resolve every flag synchronously at launch, from PostHog's own cache | **B1**, m5 |
| `3ea9f4b91` fix(ios): one attention sentence, and one predicate under it | **B2**, M4 (both halves), M5, M6, m7 |
| `8a08db6f3` fix(ios): the guard and the designer relationship stop reading a display value | M1, M2, M3, m3 |
| `57e9b4462` fix(ios): three lines that told a client something not true of them | m1, m2, m4 |

Gate, re-run exactly as the implementer did, on the same clone
`dr-w1a` `66973A52-06CB-4455-8EC1-4C8A75496FA8`:

```
apps/mobile/Patina/scripts/ios-gate.sh build              -> ** BUILD SUCCEEDED **   (exit 0)
xcodebuild test … -only-testing:PatinaTests               -> ✔ Test run with 671 tests in 86 suites passed after 2.252 seconds.
                                                             ** TEST SUCCEEDED **     (exit 0)
apps/mobile/Patina/scripts/ios-gate.sh lint-delta main    -> ✓ lint-delta: no new warnings in touched files  (exit 0)
xcodebuild build … (signed, no CODE_SIGNING_ALLOWED=NO)   -> ** BUILD SUCCEEDED **, Signing Identity "Sign to Run Locally"
```

671 is the count after this round; the review recorded no baseline count, so no delta is
claimed. Signed `.app`:
`.codex/worktrees/agent-dr-w1a-prereq/apps/mobile/Patina/.build/dd/Build/Products/Debug-iphonesimulator/Patina.app`
(`Identifier=cloud.patina.app`, adhoc).

---

## Blocking

### B1 — fixed, and the ruling the reviewer asked for is narrower than it looked

The reviewer named three exits and said picking one is a ruling. Reading the vendored SDK
removes most of the choice: **posthog-ios already persists its flag payload and reads it back
synchronously**, so exit 3 needs no `UserDefaults` of our own and no product decision.

Evidence, from `apps/mobile/Patina/.build/dd/SourcePackages/checkouts/posthog-ios/PostHog/PostHogRemoteConfig.swift`:

```
576:    private func setCachedFeatureFlags(_ featureFlags: [String: Any]) {
577:        self.featureFlags = featureFlags
578:        storage.setDictionary(forKey: .enabledFeatureFlags, contents: featureFlags)

568:    private func getCachedFeatureFlags() -> [String: Any]? {
569:        if featureFlags == nil {
570:            featureFlags = storage.getDictionary(forKey: .enabledFeatureFlags) as? [String: Any]
572:        return featureFlags
```

`PostHogSDK.isFeatureEnabled` → `getFeatureFlag` → `getCachedFeatureFlags()` (`:535-542`), i.e.
a disk read, lazily on first access after `setup()`. So `resolveAtLaunch()` is now fully
synchronous — override → `--uitesting` → that cached payload → false — and returns with every
flag decided before `body` mounts the root. `awaitFeatureFlags`, `FlagDeliveryGate` and the
`didReceiveFeatureFlags` observer are deleted; m5's never-removed observer goes with them.

**Two things Kody still owns, neither blocking W3:**

1. **First launch after install resolves every flag off** (no payload cached yet; PostHog
   fetches during that session and the flag is correct from launch two). This is exit 3's
   stated cost, accepted here. If `house-first` must be honoured on a first launch, that needs
   a splash blocked on `isResolved` — a product decision about what a cold first launch looks
   like, not an implementation detail. `isResolved` is public and already true at the right
   moment, so adding the splash later is additive.
2. **The PostHog branch is still not exercisable locally** (Kody's flags target client
   auth-user UUIDs; a locally seeded account has different ones). Unchanged from the review.
   What changed is that a walk can now at least see the resolution path taken:
   `[FeatureFlags] resolved via posthog-cache: on=[]` vs `via launch-arguments`.

The plan's "PostHog value after `onFeatureFlags` (bounded wait)" is therefore **not**
implemented as written — the bounded wait is gone. Deviation recorded here rather than
silently kept, because the plan's own acceptance criterion ("resolved once … before the root
is chosen") and its bounded wait cannot both hold.

New test `resolutionIsCompleteWhenTheCallReturns` fails on anything asynchronous;
`postHogPersistsItsFlagPayload` asserts the SDK claim above against the checkout (a no-op
where the checkout is not beside the bundle, rather than a false failure).

### B2 — fixed, on all three surfaces, from one source

`BadgeCountService.studioHint` restores the chain `attentionHint` alone had dropped —
attention → unread conversations → projects moving — computed from rows this service already
retains. The Studio subhead, the Companion footer and the Daily Room all read it. The subhead
additionally falls through to `viewModel.snapshot.attentionSummary.hint`, because the one rung
`BadgeCountService` cannot carry is unread Studio *updates* (`notification_log`, which it does
not fetch).

The count stays single-sourced: when `attentionCount > 0` every surface prints the same
sentence. `nothingAwaitingIsNotNothingHappening` is the regression (0 awaiting + 1 unread
thread → `"1 new conversation"`, not nil).

---

## Major

### M1 — fixed, better than by source-scraping

The leads query items now come from `DesignRequestStatusService.leadQueryItems()`, and
`theLeadsQueryCarriesNoFilter` pins the **whole list** (`["order", "select"]`) rather than the
absence of one name — so any filter added back fails, not only `client_request_id`.

### M2 — fixed

`DesignHelpDestination.resolve` takes `EngagementTierState`. `.unknown` resolves to a new
`.requestList` case, routed to `.designRequests(focusLeadId: nil)`. That screen calls
`service.refresh()` in `.task` and renders `DesignerConsultationView` when there is genuinely
no request (`DesignRequestStatusView.swift:61-66`), so the tap is neither lost nor duplicated —
no third behaviour had to be invented. Both entry mechanisms (`presentDesignServices` and the
`.designerConsultation` guard) handle the case.

### M3 — fixed; and yes, this is a finding against the plan

`DesignerRelationshipResolver.resolve` takes `lead:` (renamed from `promotedRequest:`) and is
fed `DesignRequestStatusService.liveLead` — newest non-terminal request with a designer, no
promotion window, no dismissal. The guard reads `openRequest` on the same basis.
`promotedRequest` keeps its one real job, the card.

**The plan named `promotedRequest` for both.** Build-plan v2 W1a item 4 specifies
`DesignerRelationshipResolver.resolve(promotedRequest:projects:roster:)`, and critique M15 asked
only that the predicate be named. Deviating was necessary: kept as written, R3's pre-emption
fails open in W5 for any client matched more than 14 days ago or who dismissed the card. **W5's
brief should cite `liveLead`, not `promotedRequest`.**

Tests: `aRelationshipOutlivesItsCard` (30-day-old accepted lead and a dismissed one both stay
`isLive`), `designHelpOpensARequestOlderThanThePromotionWindow`.

### M4 — both halves fixed; one of them is a copy change Kody may want to see

*Predicate divergence:* one definition each now.
- Decisions: `BadgeCountService` filters `!$0.isResolved`, the same predicate the Studio uses.
- Proposals: new `RemoteProposal.isAwaitingSignature(now:)` is THE counting predicate; both
  `BadgeCountService` and `StudioQueueBuilder` call it. `isSignable` is untouched — it gates
  the signature *act* at instant precision and changing that is a money-rail decision, not a
  counting one.

The divergence was worse than the review found. `valid_until` is a Postgres `date`
(`"2026-09-08"`), which **both** ISO8601 formatters reject, so `isSignable`'s
`guard let expires = ISO8601DateParsing.date(from: until)` fell through to `return true` — a
proposal that expired in 2020 counted in `attentionCount` and did not appear in the Studio's
rows. `ISO8601DateParsing.dateOrDay` is now the one parser for both.
Test: `anExpiredDateOnlyProposalCountsNowhere`, `aRespondedDecisionCountsNowhere`.

*The "Awaiting you 3" badge:* **changed, not deferred.** SP-16's stated symptom names it as the
third of three numbers ("let every surface read that number"), so leaving it was a silent
disposition of a plank clause. The `.awaitingYou` section badge now prints the awaiting **item**
count (`attentionSummary.awaitingCount`, which the predicate work above makes equal to
`BadgeCountService.attentionCount`); every other section badge still counts its cards. The
accessibility label changes with it ("N things awaiting you" vs "N categories").

⚠ **For Kody:** this is the one change in this round a walk will see as different copy — the
number under "Awaiting you" on `shots/w1a-03-studio-subhead-count.png` goes 3 → 4. If the
grouped-card count was the intent, reverting is `sectionBadgeCount` in `StudioHubView.swift`,
four lines.

### M5 — fixed by not restating the sentence

Today's decision next-move read `"N decisions need your eye."` directly above a footer reading
`"N things need your eye"`. It speaks for decisions alone, and decisions are a subset — so it
now reads `"N decisions are waiting on you."` rather than printing a second, smaller number
under SP-16's own phrasing. (Making it print the attention count instead would be false: the
move is specifically "Review a project decision".)

### M6 — fixed

`private init()` restored; tests take `BadgeCountService.makeForTests()` behind `#if DEBUG`.

### M7 — **not fixed. Rebutted in part, escalated in full.**

Confirmed independently, again: `designer_clients` has `00014:110`
(`FOR ALL USING (auth.uid() = designer_id)`) plus `00316`'s studio co-member leg, both
designer-side. `RosterAPIClient.listRoster()` returns `[]` by RLS, and
`DesignerRelationship.roster` is unreachable in production.

**Not fixed here because W1a carries no backend delta** (build-plan v2 W1a; the wave's own
"Backend delta: none" in SP-07/SP-13/SP-16). Minting a policy migration in a lane whose gate
runs no `supabase db reset` and whose reviewer checked no SQL would ship an unexercised RLS
change on the client roster — the wrong lane for it.

**Escalation to Fable, needed before W5 writes attribution:** a client-SELECT policy on
`designer_clients` needs a number in the 00533–00540 reservation and a named wave. Proposed
shape, for whoever owns it:

```sql
CREATE POLICY "designer_clients_client_read" ON public.designer_clients
  FOR SELECT TO authenticated
  USING (client_id = auth.uid() AND status = 'active');
```

Until it lands, direction-a §5's "Attribution, written once" and R3's "Roster-designer
attribution still credits" have no path, and W5 must not claim roster attribution works.

*Second-order (the sixth round trip):* **kept, deliberately.** The read is plan-specified (W1a
item 4) and W2/W5 both consume `BadgeCountService.roster`. It is one GET issued in parallel
with five others already on that path, returning an empty array. Removing it would trade a
measured, negligible cost for a wiring step someone has to remember to redo the day the policy
lands — and the day it lands, nothing else has to change. `apply(…)`'s doc comment already
records that an empty roster is the successful answer and is excluded from the load verdict.

---

## Minor

| # | Disposition |
|---|---|
| m1 | Fixed. `"Start one with your designer"` → `"No messages yet"`, true for a pooled client too. `StudioHubTests.conversationRowIsEmittedAtZeroThreads` updated. |
| m2 | Fixed. The control reads `"See your open request"` when the guard will send the client to a different, open request. |
| m3 | Fixed. `DesignRequestStatusService.attentionCount` → `requestsNeedingAttentionCount` (one call site, `StudioHubSection.swift:118`). |
| m4 | Comment added naming the constraint. Not changed: duplicating `00103` into a fixture is the drift the tests exist to catch. |
| m5 | Fixed as a side effect of B1 — the observer and its `assumeIsolated` blocks are deleted. |
| m6 | **Cannot be fixed.** It is a commit-history point about `0560fd071`, already published to this branch; rewriting it would rewrite the SHAs the review cites. Noted, not amended. |
| m7 | Fixed. `everyConsumerReadsTheOneHint` asserts on what each of the three view files reads, and fails if any goes back to `attentionHint` alone. |
| m8 | **Not actionable in this lane.** `rpc_start_direct_thread`'s grant and its missing counterpart predicate predate the branch and are a backend delta SP-13 explicitly prices at none. Escalated with M7: a `counterpart` predicate belongs in the same migration wave. |
| m9 | Kept, as the reviewer recommended. |
| base note | Re-confirmed: `git merge-base main daily-return/w1a-prereq` = `dc5722b0b` = current `main` tip. No rebase. |

---

## What is still not proven

- **The PostHog branch of `FeatureFlags`.** No local stack can exercise it. What is proven is
  that resolution is complete before the root is chosen (`resolutionIsCompleteWhenTheCallReturns`)
  and that the SDK persists what the read depends on (asserted against the checkout).
  First real evidence comes from a TestFlight build once W3 mounts something flag-gated.
- **`.roster`** — unreachable, M7.
- **Every change here is compile-green + sim-verified via the unit tier.** This round ran no
  simulator walk: the walker owns `shots/w1a-*`, and three surfaces changed copy (Studio
  subhead fallback, "Awaiting you" badge, Today's decision move, the Studio Conversation row).
  **Those four need re-shooting** before the wave closes.
