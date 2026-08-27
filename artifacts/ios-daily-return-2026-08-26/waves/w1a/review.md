# W1a — adversarial review (V1)

Reviewer V1, separate context from the implementer. Read-only: no build, no commit, no simulator.

Branch `daily-return/w1a-prereq` @ `770ca33f0`, base `main` = `dc5722b0b` (8 commits, 33 files,
+1666/−72). `git merge-base main daily-return/w1a-prereq` = `dc5722b0b` = current `main` tip; the
plan's stated base `0b7f2291d` is an ancestor (`git merge-base --is-ancestor` → yes), `main` having
moved one docs commit forward. No divergence, no rebase needed.

Checked against `source/build-plan.md` "Global constraints" + "### W1a", `source/rulings-2026-08-27.md`,
`source/shared-planks.md` §SP-07/§SP-13/§SP-16, `source/direction-a.md` §5 "Attribution, written once",
`source/direction-b.md` §5 ¶1, and `source/build-plan-critique.md` B1/B8/B10/M15/M20.

---

## Item-by-item verdict

| Plan item | Interface as specified | Verdict |
|---|---|---|
| 1 · Gate hygiene | — | ✅ three kinds mapped to the MIMEs `RoomCaptureBundleAdapter` registers; the force-unwrap at `:50` no longer traps the tier |
| 2 · `FeatureFlags` | `enum Flag`, `isOn(_:)`, `resolveAtLaunch()`, DEBUG `-PatinaFlags` → PostHog (≤1.5 s) → false | ⚠ signatures exact, precedence exact, **but the PostHog branch resolves after the root is chosen and nothing re-reads it** — see B1 |
| 3 · SP-07 | filter dropped, matched branch reachable, design help routed away from a second lead | ⚠ filter dropped correctly and scope not widened; routing closed at both entry mechanisms; **the change itself carries no test, and the guard has two holes** — M1, M2, M3 |
| 4 · `DesignerRelationship` | cases, `isLive`, `resolve(promotedRequest:projects:roster:)`, roster read, tie rule | ✅ verbatim. ⚠ `isLive`'s only lead input is a *display-promotion* value — M3. `.roster` unreachable — M7 |
| 5 · SP-13 | `createThread(projectId:)`, `createDirectThread(counterpart:)`, RPC names, affordance gating | ✅ names/params correct against `00103:51`/`:113`, both RPCs verified idempotent in the migration, affordance gated on `isLive` |
| 6 · SP-16 half | one count, consumers switched, rows retained | ⚠ the *sentence* is unified across the four named surfaces; the Studio's own rows are not, a fifth surface still disagrees, and one surface now prints a new false negative — B2, M4, M5, M6 |

---

## BLOCKING

### B1 · The PostHog flag path cannot ever be on in production
`FeatureFlags.resolveAtLaunch()` (`Core/State/FeatureFlags.swift:78-95`) resolves the launch-argument
and `--uitesting` branches **inline**, but hands the PostHog branch to a detached `Task` that waits up
to 1.5 s. `PatinaApp.init()` returns immediately; `body` mounts the root in the same runloop turn.
`FeatureFlags` is a plain `final class` — not `@Observable` — so nothing re-renders when the task
lands. Confidence: high (read directly from the diff; `resolveAtLaunch` is the only writer and
`isOn` is `values[flag] ?? false`).

Consequence for W3, which stacks directly on this: a root chosen at launch from
`FeatureFlags.shared.isOn(.houseFirst)` reads `false` on **every** launch in TestFlight and prod,
because the only path that answers before the root is chosen is the DEBUG launch argument. Local
walks will look correct and the shipped flag will be dead. The plan's own wording — *"resolved once
by `resolveAtLaunch()` called from `PatinaApp` **before the root is chosen**"* — is met for the
override, not for PostHog, which is the only source that exists off a developer's machine.

Three exits, all cheap, and one has to be picked before W3 writes its root: block the root behind
`isResolved` with a splash for ≤1.5 s; make `FeatureFlags` `@Observable` and let the root re-evaluate
once (which breaks "held for the session" as literally worded, but only for the first 1.5 s of the
first launch); or persist the last resolved payload to `UserDefaults` and resolve synchronously from
it, treating the first launch as off. Naming which one is a ruling, not an implementation detail.

### B2 · The Studio subhead now prints a false negative
`StudioHubView.swift:57-68`: `if let hint = BadgeCountService.shared.attentionHint { … } else if
viewModel.hasLoaded { Text("Nothing needs your attention right now.") }`.

`attentionHint` is nil whenever `attentionCount == 0`. The string it replaced,
`viewModel.attentionSummary.hint`, had a four-step fallback chain
(`StudioQueueModels.swift:101-110`): awaiting → unread conversations → unread Studio updates →
projects moving. So a client with 0 decisions/proposals/invoices and 3 unread threads now reads
**"Nothing needs your attention right now."** as the header directly above a Conversation block
reading "3 unread threads". That is a new C5 violation authored by this lane — a rendered claim the
client can disprove by looking one block down. Confidence: high; the code path is unconditional.

Fix is one line: fall back to the rest of the chain when `attentionHint` is nil, e.g.
`BadgeCountService.shared.attentionHint ?? viewModel.attentionSummary.hint`, keeping the *number*
single-sourced while restoring the non-attention sentences. `CompanionOverlay.liveStudioAttentionHint`
(`:247-249`) lost the same chain and should take the same fallback — on the Studio screen its only
remaining fallback is `companionContext.attentionSummary`, which is written **only** by
`DailyRoomView.syncCompanionContext` (`:272`) and is therefore whatever Today last set, or nil.

---

## MAJOR

### M1 · SP-07's actual change has no test; the tests added for it pass on `main` unchanged
The whole of SP-07's mechanism is the deleted query item in
`DesignRequestStatusService.fetchLeadRows()` (`:737`). `grep -rn "fetchLeadRows\|client_request_id"
PatinaTests/` finds no assertion over that function's query items — only a comment in
`EngagementTierTests:213`.

The two tests added to answer for it, `portalCreatedLeadPromotesToEngaged` and
`aPromotedRequestReachesTheMatchedBranchOnToday`, build a `DesignRequestStatus` in-process via the
local `request(status:designerId:)` helper (`EngagementTierTests:18-34`) and never touch the service.
They exercise `EngagementTier.resolve` and `TodayExperience.nextMove`, neither of which was ever
broken. Both pass on `main` byte-for-byte. Confidence: high, from the diff.

The lane already demonstrates the right technique elsewhere —
`MessagingThreadCreationTests.createPathsUseThePinnedConstants` reads the client's own source and
asserts on it. The same shape over `fetchLeadRows` ("`client_request_id` appears nowhere in the
leads query") would make the regression impossible to reintroduce. As it stands the only evidence
that SP-07 works is one simulator walk, and W1b's four lanes will build on top of it.

### M2 · The duplicate-lead guard reopens during the load window
`DesignHelpDestination.current` (`DesignHelpDestination.swift:37-48`) calls `EngagementTier.resolve`,
**not** `EngagementTier.resolveState`. `resolveState` exists (`EngagementTier.swift:80-100`) precisely
to model "we do not know yet": it returns `.unknown` until both `badgesLoaded` and `requestsLoaded`
are true. `resolve` on an unloaded `DesignRequestStatusService` sees `requests == []` → `.discovering`
→ `.newRequest` → the compose sheet opens → a second lead is filed.

That is reachable on any cold launch where the client taps "Get design help" (Profile row, Daily Room
next-move, a list empty state) before the leads fetch returns. It is the exact failure SP-07 exists to
close, surviving in a narrower window. Confidence: high on the code path, medium on how often a real
client hits it. The guard should treat `.unknown` as "do not compose" — hold the tap, or open the
request list, rather than defaulting to the destructive branch.

### M3 · Both the guard and R3's pre-emption predicate hang on a 14-day display window
`promotedRequest` (`DesignRequestStatusService.swift:399-403`) filters on `isVisibleForPromotion()`
(`:353-361`), which returns **false** when the client dismissed the card at the current stage, and
false for a matched or terminal request whose `stageAnchor` is more than 14 days old.

Two consequences, and the second is the more expensive one:

1. A client matched more than 14 days ago, or who dismissed the match card, has `promotedRequest ==
   nil`. `EngagementTier.resolve` still returns `.engaged` (it reads `requests`, not the promoted
   one), so `DesignHelpDestination.resolve` falls to `.newRequest` — the second lead again.
2. `DesignerRelationshipResolver.resolve` takes `promotedRequest` as its lead input, so the same
   client resolves `.none`, `isLive == false`. In W5 that means **Buy draws for a client with a live
   designer** — the precise outcome R3 forbids ("`Ask Leah to source this` pre-empts Buy for any
   client with a live designer relationship"), and it fails open, silently, on exactly the long-lived
   relationships the pre-emption is for.

The implementer followed the plan verbatim here — the plan named `promotedRequest` as the input, and
critique M15 asked only that the predicate be named. So this is a finding against the plan as much as
against the branch. The fix is small: resolve the lead leg from
`DesignRequestStatusService.shared.requests` filtered on `!stage.isTerminal && designerId != nil`
(no promotion window, no dismissal), keeping `promotedRequest` for the card that actually displays.
Confidence: high. A test with a 30-day-old accepted lead would pin it.

### M4 · The count is unified in the sentence, not in the rows beneath it
`BadgeCountService.attentionCount` and `StudioQueueBuilder`'s `awaitingCount`
(`StudioQueueBuilder.swift:27-32`) are two independent computations over two independent fetches, and
their predicates differ:

- proposals — `RemoteProposal.isSignable` (`ProposalsAPIClient.swift:73-79`, `expires >= Date()`,
  instant-precision) vs `StudioQueueBuilder.proposalIsAwaiting` (`:435-444`, `startOfDay(expiry) >=
  startOfDay(now)`). A proposal expiring earlier today counts in one and not the other.
- decisions — `BadgeCountService` counts every row `listPending` returns; the Studio filters
  `!$0.isResolved` (`DecisionsAPIClient.swift:79-81`, also true when `responded_at != nil`). A
  `status='pending'` row carrying `responded_at` counts in one and not the other.

So the header can read "4 things need your eye" over an "Awaiting you" block listing three items, for
a reason that has nothing to do with grouping. Both fetches are also separate round trips, so a
transient skew is normal. Confidence: high on the predicate divergence, medium on how often it shows.
The honest single source is one of: compute `awaitingCount` from the retained
`BadgeCountService` rows (which now exist, per item 6), or have the Studio snapshot feed
`BadgeCountService` instead of the reverse.

Related, and named explicitly in the plank the item cites: SP-16's stated symptom is *three* numbers
on one screen — header "4 things need your eye", footer "4 THINGS NEED YOUR EYE", **and the block
between them reading "Awaiting you 3"**. The implementer deliberately left the "Awaiting you"
section badge alone, arguing it counts grouped rows and is a different honest number. That is
defensible, but it is a deviation from the plank's "let every surface read that number", and the
screen the review walked still shows two different figures stacked on top of each other
(`shots/w1a-03-studio-subhead-count.png` shows exactly this). It needs Kody's ruling, not a silent
disposition.

### M5 · A fifth surface still prints a fourth number
`TodayExperience.swift:96-101` builds the Next Move detail as
`"\(input.pendingDecisionCount) decisions need your eye."` from the decision count alone, fed by
`DailyRoomView:192`. It sits on Today, directly above the Companion footer that now reads "4 things
need your eye". Same screen, same minute, two numbers — SP-16's opening sentence, relocated.
The plan named four surfaces and this is not one of them, so it is out of the letter of W1a; it is
inside SP-16's intent, and it is one line. Confidence: high.
(`StudioHubSection.swift:226-230` does the same, but Q4 has already retired that file.)

### M6 · `BadgeCountService` is no longer a guaranteed singleton
`private init()` became `init()` (`BadgeCountService.swift:94`) so `AttentionCountTests` can build
instances, and `apply(…)` is internal and callable from anywhere in the module. The plank this item
implements exists because two surfaces read two different objects. Opening the constructor makes that
reproducible by accident. `@testable import` reaches `private init` in Swift only via the type's own
file, so the honest alternatives are a test-only factory behind `#if DEBUG`, or leaving `init`
internal but marking it with a comment that names the invariant. Confidence: medium — no current
caller misuses it; this is about the next lane. Severity is on the invariant, not on today's build.

### M7 · `.roster` is unreachable, and W5's attribution has no path yet
Confirmed independently: `designer_clients` carries `00014:110` (`FOR ALL USING (auth.uid() =
designer_id)`) and `00316:46-53`'s studio co-member leg — both designer-side, no client SELECT. A
client's select returns `[]` by RLS rather than an error, so `RosterAPIClient.listRoster()` always
yields an empty array and `DesignerRelationship.roster` can never be constructed in production.

The implementer reported this rather than minting an out-of-scope migration, which was the right
call under "W1a carries no backend delta". But direction-a §5's "Attribution, written once" and R3's
"Roster-designer attribution (`designer_clients`) still credits" both rest on it, so **W5 cannot
credit a roster designer until a client SELECT policy lands**, and no wave currently owns that
migration. It needs a number in the 00533–00540 reservation and a wave. Confidence: high.

Second-order: `BadgeCountService.refresh()` now issues a sixth round trip on every scenePhase→active
and every home appear for a query that is known to return nothing. Harmless, but it is a live cost
for a dead read until the policy exists.

---

## MINOR

- **m1 · The Studio Conversation row promises a designer that may not exist.**
  `conversationThreadRow` now emits at zero threads with detail `"Start one with your designer"`
  (`StudioQueueBuilder.swift:203-224`), unconditionally. The Studio hub is reachable at `.engaged`,
  which includes a client whose request is still pooled with no designer claimed. That client reads
  "Start one with your designer", taps through, and `ThreadListView.emptyCTATitle` — which *is*
  gated on `isLive` — offers "Track your request" instead. The row's own detail should take the same
  gate, or read something true for both cases. C5, small surface. Confidence: high.
- **m2 · "Start a new request" on a terminal request can bounce elsewhere.**
  `DesignRequestStatusView.swift:107` now routes through `presentDesignServices`, which consults
  `DesignHelpDestination.current` — computed from `promotedRequest`, not from the request on screen.
  A client looking at a *closed* request among "others" who taps "Start a new request" is pushed to a
  different, non-terminal request. Arguably the safe outcome, but the control's label then lies about
  what it did. Confidence: high; frequency low.
- **m3 · Two properties are now called `attentionCount`.**
  `BadgeCountService.attentionCount` (decisions + proposals + invoices) and
  `DesignRequestStatusService.attentionCount` (`:406-408`, requests whose stage `needsAttention`).
  Different meanings, one name, both `@MainActor` singletons. A rename on one side is cheap now and
  expensive after W2 consumes both.
- **m4 · Two tests read the working tree at runtime.**
  `pinnedNamesMatchTheMigration` and `createPathsUseThePinnedConstants` walk `#filePath` up to the
  repo root and read `supabase/migrations/00103_comms_rpcs.sql` and `MessagingAPIClient.swift` off
  disk. Correct in a worktree, and the path arithmetic checks out (5 and 2 components respectively);
  they will fail in any context where the test bundle runs without the checkout beside it. Worth a
  comment on the constraint, not a change.
- **m5 · `flagDeliveryObserver` is stored and never removed** (`PostHogService.swift:40,73-79`), and
  both notification blocks use `MainActor.assumeIsolated` inside an `OperationQueue.main` callback.
  Both are fine in practice for a process-lifetime singleton on the main queue; neither is free of
  assumption.
- **m6 · The lint refactor rode the wrong commit.** `ProjectMessageDesignerLink`'s extraction from
  `ProjectDetailView` landed in `0560fd071` ("SP-16 half"), not in the `style(ios)` commit that
  followed. Pathspecs are clean throughout and no commit touches a path its subject doesn't cover,
  so this is a readability point, not a hygiene breach.
- **m7 · `everyConsumerPrintsTheSameCount` does not exercise a consumer.** It compares
  `StudioAttentionSummary.attentionHint(count:)` against the snapshot's own `hint` — model to model.
  That the three views were actually switched is verified only by reading the diff and by the walk
  shots. Given B2 was introduced in exactly that seam, a test that renders or at least calls each
  view's hint expression would have caught it.
- **m8 · `rpc_start_direct_thread(counterpart)` accepts any profile UUID** (`00103:51-104`) and is
  granted to `authenticated`. The client now becomes its first caller from this app. The grant and
  the shape predate this lane and SP-13 explicitly prices the backend delta at none, so nothing to
  do here — but "a client who can open a thread can start one the designer does not want" (SP-13's
  own risk line) is now reachable from the client app for the first time, and no server-side
  predicate limits the counterpart.
- **m9 · The extra DEBUG log commit** (`770ca33f0`) is a declared deviation, `#if DEBUG`-guarded, and
  separable at one commit. It is the only observable signal a walk has that `-PatinaFlags` took, so
  it earns its place until W3 mounts something that reads a flag.

---

## Scope, hygiene, voice

- **No unrelated change in the diff.** All 33 files are under `apps/mobile/Patina`. The only edits
  outside the six items' stated file sets are two deliberate, reported moves:
  `StudioQueueBuilder.projectIsArchived` from a `private extension` to the enum (so the resolver and
  the Studio queue share one definition of "archived"), and the `ProjectMessageDesignerLink`
  extraction. Both are justified in the task list's execution notes.
- **Conventional Commits + pathspecs: clean.** Eight commits, correct types (`test`/`feat`/`fix`/
  `style`), each `--stat` list matching its subject. No `git add -A` residue; `git status` in the
  worktree is empty apart from sandbox `.env` read denials. Nothing pushed.
- **No migration minted**, correctly (critique B1: 00535 was a duplicate that would not have
  applied). No backend delta anywhere in the diff — verified by the file list.
- **Brand voice** on the new copy: "Start one with your designer", "Ask a question about this
  project", "Message your designer", "Opening…", "That didn't go through. Try again." — plain,
  second person, no system nouns, curly apostrophes. Passes.
- **C5 / no vendor error text**: both new failure paths (`ThreadListView.openThread`,
  `ProjectMessageDesignerLink.open`) log `error.localizedDescription` to `PatinaLog` and render only
  the authored line. Correct, and explicitly commented as such.
- **Nothing rendered that lies** — except B2 and m1 above.

## What is proven and what is not

Sim-verified, with server-side evidence where it matters: SP-13's project thread
(`comms_threads` 1→2, `kind='project'`, the RPC's own system message) and SP-07's non-duplication
(`select count(*) from leads` = 1 before and after). That is the right standard and it was met.

Not proven, and correctly not claimed: anything device-dependent (nothing device-dependent was
touched); the PostHog branch of `FeatureFlags` (no local stack can exercise it — which is exactly why
B1 went unnoticed); `.roster` (unreachable, M7); Settings → Account sign-out (the known SP-20/F45
defect, which M20(i) says needs a bisect, not a wiring fix — the walk used `simctl keychain reset`
instead, and the report says so).
