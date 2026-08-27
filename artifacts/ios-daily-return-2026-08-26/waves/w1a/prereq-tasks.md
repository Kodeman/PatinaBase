# W1a — Prerequisites lane task list (implementer I1)

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-dr-w1a-prereq`, branch
`daily-return/w1a-prereq`, base `main` = `dc5722b0b`. Simulator clone `dr-w1a`
`66973A52-06CB-4455-8EC1-4C8A75496FA8`. DerivedData `.build/dd`.

Every task: failing test → run (RED) → implement → run (GREEN) → pathspec commit.
Paths below are relative to `apps/mobile/Patina/` unless stated.

Verified facts this list rests on (re-checked in the worktree, not quoted from the spec):

- `ScanManifest.ArtifactKind` has 16 cases; `ScanBucketMimeTests` declares 13 → the
  `semanticByKind[kind]!` force-unwrap at `:50` traps and takes the whole unit tier down.
  Producer MIMEs: `RoomCaptureBundleAdapter.swift:276,281,293` → `application/x-tar`,
  `application/x-ndjson`, `application/json`.
- `PostHogService.swift:149` (`isFeatureEnabled`) is the only flag API; `isEnabled` is private
  and false when `AppConfiguration.postHogAPIKey` is empty. posthog-ios 3.48 has **no**
  `onFeatureFlags` method — the readiness signal is the notification
  `PostHogSDK.didReceiveFeatureFlags` (`PostHogExtensions.swift:19`, posted at
  `PostHogRemoteConfig.swift:507`).
- `PatinaApp.swift` init already runs `PostHogService.shared.initialize()` behind
  `!Self.isUITesting`; `ContentView()` is the root chosen in `body`.
- `DesignRequestStatusService.fetchLeadRows()` (`:737`) carries
  `client_request_id=not.is.null` and **no** client-scope query item — `leads` RLS
  (`00014:58-59`, `auth.uid() = homeowner_id`) is the scope. Dropping the filter therefore
  keeps the client scope exactly as it is.
- `TodayExperience.swift:80-91` is the `trackDesignRequest` branch, reached iff
  `promotedDesignRequestID != nil`.
- Seed: `james.okafor@example.com` = `h4`, lead `l4` `status='accepted'`, `designer_id` set,
  `client_request_id` NULL (`supabase/seed/leads_room_scans.sql:49,143-147,167`) → stage
  `.matched` → card title "You're matched with …".
- `designer_clients` RLS is **designer-only**: `00014:110` `FOR ALL USING (auth.uid() =
  designer_id)` plus the studio-comember leg `00316:39`. There is **no** client SELECT policy,
  which `EngagementTier.swift:20-22` already records. A client-side select therefore returns
  `[]` today. W1a has no backend delta, so the read ships as specified and the resolver's
  `.roster` case stays unreachable in production until a policy migration lands (reported, not
  minted here).
- `00103_comms_rpcs.sql:51` `rpc_start_direct_thread(counterpart UUID)` (GRANT `:105`),
  `:113` `rpc_start_project_thread(p_project_id UUID)` (GRANT `:173`). Both `RETURNS UUID`,
  both idempotent. Critique B1: no migration.
- Three counts disagree because `StudioAttentionSummary.awaitingCount` sums *items*
  (decisions+proposals+invoices) while `DailyRoomView.projectAttentionSummary:246-262` prints
  the decision count alone and `CompanionOverlay.liveStudioAttentionHint:239-244` falls back to
  it whenever the Studio VM has not loaded.

---

## Task 1 — Gate hygiene: map the three keyframe kinds

**Files:** `PatinaTests/ScanBucketMimeTests.swift`

**Interfaces:** none new.

**Failing test:** the existing
`ScanBucketMimeTests.everyUploadableKindIsBucketLegal` already IS the failing test — it
force-unwraps `semanticByKind[kind]!` for all 16 `ArtifactKind` cases and traps on
`.keyframesArchive`.

**Run (RED):**
```
xcodebuild test -project apps/mobile/Patina/Patina.xcodeproj -scheme Patina -configuration Debug \
  -destination 'platform=iOS Simulator,id=66973A52-06CB-4455-8EC1-4C8A75496FA8' \
  -derivedDataPath .build/dd -only-testing:PatinaTests/ScanBucketMimeTests
```

**Implement:** add to `semanticByKind`
```swift
.keyframesArchive: "application/x-tar",
.keyframeIndex: "application/x-ndjson",
.keyframeSummary: "application/json",
```
(the values `RoomCaptureBundleAdapter` actually registers).

**Run (GREEN):** the whole `-only-testing:PatinaTests` tier runs to completion.

**Commit:** `test(ios): map the three keyframe kinds in the scan-bucket MIME contract -- apps/mobile/Patina/PatinaTests/ScanBucketMimeTests.swift`

---

## Task 2 — `FeatureFlags`

**Files:** `Patina/Core/State/FeatureFlags.swift` (new),
`Patina/Services/Analytics/PostHogService.swift` (readiness accessor),
`Patina/PatinaApp.swift`, `PatinaTests/FeatureFlagsTests.swift` (new)

**Interfaces:**
```swift
@MainActor protocol FeatureFlagProvider {
    func waitUntilReady(timeout: Duration) async
    func isEnabled(_ key: String) -> Bool
}

@MainActor final class FeatureFlags {
    enum Flag: String, CaseIterable, Sendable {
        case houseFirst = "house-first"
        case directOrders = "direct-orders"
        case houseWidget = "house-widget"
    }
    static let shared: FeatureFlags
    static let launchArgument: String            // "-PatinaFlags"
    private(set) var isResolved: Bool
    func isOn(_ flag: Flag) -> Bool
    func resolveAtLaunch()                       // sync entry, called from PatinaApp.init
    func resolveAtLaunch(arguments: [String], provider: FeatureFlagProvider,
                         timeout: Duration) async
}

struct PostHogFeatureFlagProvider: FeatureFlagProvider   // wraps PostHogService

extension PostHogService {
    var isFeatureFlagSourceLive: Bool { get }
    func awaitFeatureFlags(timeout: Duration) async
}
```
Precedence, once, held for the session: DEBUG `-PatinaFlags a,b` (comma list of raw values;
when present it is authoritative for every flag — named on, unnamed off, PostHog not
consulted) → `--uitesting` → all off → PostHog value read after
`PostHogSDK.didReceiveFeatureFlags`, waited at most 1.5 s → `false`.

**Failing test:** `PatinaTests/FeatureFlagsTests.swift`
- `launchArgumentOverrideWins` — `["-PatinaFlags", "house-first,house-widget"]` + a provider
  that says every flag is on → `houseFirst` true, `houseWidget` true, `directOrders` false.
- `postHogValueIsUsedWhenNoOverride` — no override, ready provider with `direct-orders` on →
  `directOrders` true, others false.
- `timeoutResolvesToFalse` — provider that never becomes ready, timeout 50 ms → all false,
  `isResolved` true.
- `resolvedValueIsHeldForTheSession` — resolve once, flip the provider, resolve again → the
  first answer survives.
- `uiTestingKeepsFlagsOffUnlessNamed` — `["--uitesting"]` → all off even with an on provider;
  `["--uitesting", "-PatinaFlags", "house-first"]` → `houseFirst` true.

**Run (RED):** `-only-testing:PatinaTests/FeatureFlagsTests`

**Implement:** as above; `PatinaApp.init()` calls `FeatureFlags.shared.resolveAtLaunch()`
right after `PostHogService.shared.initialize()` and before `body` chooses `ContentView()`.
The sync entry resolves the override/uitesting paths inline and otherwise spawns the bounded
PostHog resolution; `isOn` answers `false` until it lands.

**Run (GREEN):** same command.

**Commit:** `feat(ios): FeatureFlags resolved once at launch -- Core/State/FeatureFlags.swift PatinaApp.swift PostHogService.swift PatinaTests/FeatureFlagsTests.swift`

---

## Task 3 — SP-07: the matched designer becomes visible, and no second lead

**Files:** `Patina/Services/DesignServices/DesignRequestStatusService.swift`,
`Patina/Core/State/DesignHelpDestination.swift` (new),
`Patina/App/Coordinators/AppCoordinator.swift`,
call sites: `Patina/Features/Profile/Views/ProfileView.swift`,
`Patina/Features/Home/Views/DailyRoomView.swift`,
`Patina/Features/Rooms/Views/RoomProjectView.swift`,
`Patina/Features/Rooms/Views/RoomSettingsView.swift`,
`Patina/Features/RoomScan/Views/ScanSavedConfirmationView.swift`,
`Patina/Features/Companion/Views/CompanionOverlay.swift`,
`PatinaTests/EngagementTierTests.swift`

**Interfaces:**
```swift
enum DesignHelpDestination: Equatable {
    case existingRequest(leadId: UUID)
    case newRequest
    static func resolve(tier: EngagementTier,
                        promotedRequest: DesignRequestStatus?) -> DesignHelpDestination
}

extension AppCoordinator {
    func presentDesignServices(roomId: UUID?, preselectedScanIds: [UUID])
}
```
Rule: at `.engaged`/`.activeProject` with a promoted, non-terminal request → open that
request (`.designRequests(focusLeadId:)`); otherwise the compose sheet. `navigate(to:
.designerConsultation)` applies the same guard, so both entry mechanisms are covered.

**Failing test:** `EngagementTierTests` gains
- `portalCreatedLeadPromotesToEngaged` — a lead with no `client_request_id` (the field is not
  in the model; the case is the accepted/claimed row James has) resolves `.engaged` and is
  visible for promotion, so `TodayExperience.nextMove` returns `.trackDesignRequest`.
- `designHelpOpensExistingRequestWhenEngaged` — duplicate-lead guard.
- `designHelpComposesWhenDiscovering`, `designHelpComposesWhenRequestIsTerminal`.

**Run (RED):** `-only-testing:PatinaTests/EngagementTierTests`

**Implement:** delete the `client_request_id` query item at
`DesignRequestStatusService.swift:737` (scope stays RLS `homeowner_id`); add
`DesignHelpDestination`; route the seven sheet/consultation entry points through the
coordinator guard.

**Run (GREEN):** same command.

**Commit:** `fix(ios): SP-07 — portal-created leads reach Today, and "Get design help" stops filing a second lead -- <pathspecs>`

---

## Task 4 — `DesignerRelationship`

**Files:** `Patina/Core/State/DesignerRelationship.swift` (new),
`Patina/Core/Network/RosterAPIClient.swift` (new),
`PatinaTests/DesignerRelationshipTests.swift` (new)

**Interfaces:**
```swift
enum DesignerRelationship: Equatable, Sendable {
    case none
    case roster(designerId: UUID)
    case lead(leadId: UUID, designerId: UUID, studioName: String?)
    case project(projectId: UUID, designerId: UUID, studioName: String?)
    var isLive: Bool          // .lead / .project only
    var designerId: UUID?
}

struct RosterDesigner: Equatable, Sendable {
    let designerId: UUID
    let addedAt: Date
}

enum DesignerRelationshipResolver {
    static func resolve(promotedRequest: DesignRequestStatus?,
                        projects: [RemoteProject],
                        roster: [RosterDesigner]) -> DesignerRelationship
}

public actor RosterAPIClient {
    public static let shared: RosterAPIClient
    public func listRoster() async throws -> [RosterDesigner]
}
```
Precedence: active project with a designer → lead accepted/claimed (non-terminal, designer
set) → roster → none. Roster tie rule: most-recent row wins; two rows on the same calendar
day → `.none` (attribution must not guess). `RosterAPIClient` issues
`GET /rest/v1/designer_clients?select=designer_id,created_at,status&client_id=eq.<uid>&status=eq.active`.

**Failing test:** `DesignerRelationshipTests` — one per case, plus `isLive` per case, plus
most-recent-roster-wins and same-day-tie-is-none.

**Run (RED/GREEN):** `-only-testing:PatinaTests/DesignerRelationshipTests`

**Commit:** `feat(ios): DesignerRelationship + resolver + roster read -- <pathspecs>`

---

## Task 5 — SP-13 client half: a client can start the conversation

**Files:** `Patina/Core/Network/MessagingAPIClient.swift`,
`Patina/Features/Projects/Views/ProjectDetailView.swift`,
`Patina/Features/Profile/ViewModels/StudioQueueBuilder.swift`,
`Patina/Features/Messaging/Views/ThreadListView.swift`,
`Patina/Features/Companion/Services/CompanionAreaBuilders.swift`,
`Patina/Features/Companion/Models/CompanionContext.swift`,
`Patina/Features/Companion/Views/CompanionOverlay.swift`,
`PatinaTests/MessagingThreadCreationTests.swift` (new),
`PatinaTests/StudioHubTests.swift`

**Interfaces:**
```swift
public enum ThreadCreationRPC {
    public static let projectFunction  = "rpc_start_project_thread"
    public static let projectParameter = "p_project_id"
    public static let directFunction   = "rpc_start_direct_thread"
    public static let directParameter  = "counterpart"
}

extension MessagingAPIClient {
    public func createThread(projectId: String) async throws -> String
    public func createDirectThread(counterpart: UUID) async throws -> String
}

extension CompanionContext { var designerRelationship: DesignerRelationship? }
```

**Failing test:** `MessagingThreadCreationTests`
- `rpcNamesArePinned` — the four constants, verbatim, against `00103_comms_rpcs.sql`.
- `theClientBuildsBothRPCPathsFromTheConstants` — source-level check that
  `MessagingAPIClient` builds `/rest/v1/rpc/…` from `ThreadCreationRPC`, not string literals.
- `messageDesignerRowIsHiddenWithoutADesigner` / `…ShownWhenTheRelationshipIsLive` —
  `CompanionAreaBuilders.homeItems` over a context with `.none` vs `.project`.
`StudioHubTests` gains `conversationRowIsEmittedAtZeroThreads` (route `.threadList`).

**Run (RED/GREEN):** `-only-testing:PatinaTests/MessagingThreadCreationTests`,
`-only-testing:PatinaTests/StudioHubTests`

**Implement:** the two RPC calls; "Message your designer" on `ProjectDetailView` (creates the
project thread, then pushes `.threadDetail`); `conversationThreadRow` emitted at zero threads
so the Studio block gains its chevron, with `ThreadListView`'s empty state carrying the
compose act it routes to; a Companion row on the Daily Room when
`DesignerRelationship.isLive`.

**Commit:** `feat(ios): SP-13 client half — a client can start the conversation -- <pathspecs>`

---

## Task 6 — One attention count

**Files:** `Patina/Services/Badges/BadgeCountService.swift`,
`Patina/Features/Profile/ViewModels/StudioQueueModels.swift`,
`Patina/Features/Profile/ViewModels/StudioHubViewModel.swift`,
`Patina/Features/Profile/Views/StudioHubView.swift`,
`Patina/Features/Home/Views/DailyRoomView.swift`,
`Patina/Features/Companion/Views/CompanionOverlay.swift`,
`PatinaTests/AttentionCountTests.swift` (new)

**Interfaces:**
```swift
extension BadgeCountService {
    var attentionCount: Int      // pendingDecisionCount + pendingProposalCount + payableInvoiceCount
    var attentionHint: String?   // StudioAttentionSummary.attentionHint(count:)
    // retained rows, for W2
    private(set) var pendingDecisions: [RemoteClientDecision]
    private(set) var payableInvoices: [RemoteInvoice]
    private(set) var pendingProposals: [RemoteProposal]
    private(set) var threadSummaries: [RemoteCommsThreadSummary]
    private(set) var projects: [RemoteProject]
    func apply(decisions:summaries:proposals:invoices:projects:)   // the seam refresh() uses
}

extension StudioAttentionSummary { static func attentionHint(count: Int) -> String? }
```

**Failing test:** `AttentionCountTests`
- `everyConsumerPrintsTheSameCount` — one `apply(…)`, then the Studio subhead hint, the
  Companion/footer hint and the Daily Room hint all equal `attentionHint`.
- `attentionCountSumsTheThreeQueues`.
- `refreshRetainsTheFetchedRows` — after `apply(…)` the five row arrays are populated.

**Run (RED/GREEN):** `-only-testing:PatinaTests/AttentionCountTests`

**Commit:** `fix(ios): SP-16 half — one attention count, and BadgeCountService retains its rows -- <pathspecs>`

---

## Gate (foreground, unsandboxed, after task 6)

1. `apps/mobile/Patina/scripts/ios-gate.sh build`
2. `xcodebuild test … -only-testing:PatinaTests` on `66973A52-…` with `-derivedDataPath .build/dd`
3. `apps/mobile/Patina/scripts/ios-gate.sh lint-delta main`
4. `xcodebuild build -destination 'platform=iOS Simulator,id=66973A52-…' -derivedDataPath .build/dd`
   (signed, no `CODE_SIGNING_ALLOWED=NO`) → record the `.app` path for the walker.

## Sim check

`-DeploymentTarget local`, plus `-PatinaFlags house-first` for one launch to prove the
override. James: matched branch on Today; `leads` count before/after tapping "Get design
help" unchanged. `client@patina.dev`: one count on Profile/Studio subhead, footer and
Companion; "Message your designer" on project detail. Shots `w1a-01`…`w1a-06`, ledger rows
appended under `## w1a`.

---

## Execution notes (written after the fact — deviations from the plan above)

1. **Task 1 first run failed on a build race, not the test.** `Cannot find 'GitCommit' in scope`:
   the "Stamp Git SHA" phase writes `Patina/Generated/GitCommit.swift` (gitignored), which does not
   exist in a fresh worktree until one build has run. Second invocation compiled. Worth knowing for
   every other lane's first build.
2. **Task 2 — the readiness signal is a Bool, not a bare wait.** The first cut awaited PostHog and
   then read `isEnabled` regardless, so a timed-out payload returned whatever the SDK happened to
   hold. `waitUntilReady` now returns whether a payload arrived, and a timeout resolves every flag
   to `false` (the plan's third precedence step). `PostHogService` also remembers a payload
   delivered before the wait started, which would otherwise always time out.
3. **Task 2 gained a DEBUG log line, not in the plan.** Nothing reads a flag until W3, so a walk had
   no way to see whether `-PatinaFlags` took. `[FeatureFlags] resolved via launch-arguments:
   on=[house-first]` is what the sim check reads.
4. **Task 3 covered nine call sites, not six.** `presentedSheet = .designServices(...)` appeared at
   nine places; all now route through `AppCoordinator.presentDesignServices`, and
   `navigate(to: .designerConsultation)` carries the same guard, so both entry mechanisms are
   closed rather than a list of views being patched one at a time.
5. **Task 4 — `.roster` is unreachable in production.** `designer_clients` has no client SELECT
   policy (00014:110 and 00316:39 are both designer-side), which `EngagementTier.swift:20-22`
   already recorded. The read ships as specified and returns empty; the policy migration is named
   here, not minted, because W1a carries no backend delta. `projectIsArchived` moved from a
   fileprivate extension onto `StudioQueueBuilder` so the resolver and the Studio queue cannot
   drift on what "archived" means.
6. **Two of task 6's retained rows landed in task 5.** `projects` and `roster` are the resolver's
   own inputs, so they shipped in the commit that needed them; the other three rows plus
   `attentionCount` shipped in task 6.
7. **Task 5's Studio compose path routes through `ThreadListView`.** `StudioQueueRow` carries a
   route, not an action, so the Conversation block's chevron routes to `.threadList` and the compose
   act lives in that screen's empty state, which is where a client who taps the block arrives.
8. **One extra commit for lint.** `ios-gate.sh lint-delta main` failed twice — once on file-length /
   trailing-comma / parameter-count in the implementation, once on `f` and a large tuple in
   `AttentionCountTests`. `ProjectMessageDesignerLink` moved to its own file as part of the first
   fix.
