# W1b — Lane C task list (identity, reach & notify)

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-dr-w1b-c` · branch `daily-return/w1b-c`
· base `main @ 5b5c0c054` · simulator `dr-w1b-c` `18B12089-F4E2-4523-9173-1353A7F74CDF`
· DerivedData `.../agent-dr-w1b-c/.build/dd`

Planks: **SP-09**, **SP-19 (remainder)**, **SP-20**, **SP-08 (client half)**, **SP-03 (client half)**,
plus the `companion-context` duplicate-request fix.

Gate for every task (foreground, sandbox disabled):

```bash
/Users/kody/Code/patina-merged/.codex/worktrees/agent-dr-w1b-c/apps/mobile/Patina/scripts/ios-gate.sh build
xcodebuild test -project /Users/kody/Code/patina-merged/.codex/worktrees/agent-dr-w1b-c/apps/mobile/Patina/Patina.xcodeproj \
  -scheme Patina -configuration Debug \
  -destination 'platform=iOS Simulator,id=18B12089-F4E2-4523-9173-1353A7F74CDF' \
  -derivedDataPath /Users/kody/Code/patina-merged/.codex/worktrees/agent-dr-w1b-c/.build/dd \
  -only-testing:PatinaTests CODE_SIGNING_ALLOWED=NO
```

Suites C keeps green: `PushTokenServiceTests`, `NotificationsAPIClientContractTests`,
`AuthSheetPresentationTests`, `FirstLaunchTourTests` (untouched), `MessagingThreadCreationTests`,
`ArtifactRoutingTests`, `RouteAnalyticsParityTests`, `SurfaceKeysParityTests`.

New suites this lane adds: `ChromeReachTests`, `PortalLinkRoutingTests`, `AccountActionsTests`,
`BellQueueFallbackTests`, `CompanionRequestGateTests`.

Verified facts this list is built on (read in-session, not assumed):

- `SettingsView.swift:51-58` **is** a real `NavigationLink { AccountView() }` inside a
  `NavigationStack` (`:33`). `AccountView` has no inner stack (`:14` comment). So the destination and
  the stack are both correct — the defect is the **hit area**: the link's label is `settingsRow(...)`,
  whose middle is a `Spacer()`, and `.buttonStyle(.plain)` restricts hit-testing to the label's
  drawn content. The review tapped "dead-centre of its 338×44 frame" (F45) — the Spacer. T1 bisects
  this on the simulator before changing anything.
- `companionHearthReservation` (`Design/Components/CompanionSafeArea.swift:39-52`) already carries
  `.allowsHitTesting(false)`; what it still does is **paint** an opaque
  `PatinaColors.Background.primary` with `.ignoresSafeArea(edges: .bottom)` (`:44-47`) — the band
  F49/F137 name, and the thing C8 says the Hearth must never be.
- `PatinaDeepLinks.productURL` lives in **C's** `Features/Shared/PatinaPortalLinks.swift` and is
  called from three **A-owned** views (`ProductDetailView:283`, `RecommendationsView:319`,
  `CollectionsView:285`). Changing the URL inside C's file repoints all three with no A edit.
- `DeepLinkHandler.handle(_:)` returns `false` for anything whose scheme is not `patina`
  (`:62-64`), so a universal link is dropped before the path switch at `:194-210` is reached.
- `CompanionOverlay` calls `viewModel.updateContext(...)` from three places (`:423`, `:426`, `:451`)
  and `CompanionViewModel.updateContext` fires `fetchAPIQuickActions()` unconditionally
  (`:145-150`) — that is the 4×-at-launch storm. `CompanionOverlay.swift` is **carved out to lane A**
  (steward §6.5), so the fix goes in `CompanionViewModel` only.
- `ThreadListView` (C's) already ships W1a's live-relationship compose (`:196-249`). The bell reuses
  it via a shared helper rather than a second copy.
- `SpatialMetadataRow.swift` has **no interactive control** — `:46-50` is the metres→feet
  conversion, which F40/F97 cite as *correct*. There is no 44 pt target to raise there, so the file
  is left untouched and that is reported, not invented.

---

## T1 — SP-20a · bisect the inert "Account" row, then give every settings row a real hit area

**Files:** `apps/mobile/Patina/Patina/Features/Settings/Views/SettingsView.swift`
**Interface neighbours rely on:** none — `SettingsView()` keeps its signature.

**Bisect first (no code change):** build + install on `dr-w1b-c`, launch with `-DeploymentTarget local`,
sign in as `client@patina.dev`, open Settings, and tap (a) the dead centre of the Account row, then
(b) the word "Account". If (a) does nothing and (b) pushes `AccountView`, the cause is the hit area,
not the link. Record both taps as shots.

**Failing test** — `PatinaTests/ChromeReachTests.swift` (new), source-pinned in the house style
already used by `NotificationsAPIClientContractTests`:

```swift
@Test("every settings row declares a rectangular hit area")
func settingsRowsAreFullyTappable() throws {
    let source = try SourcePin.read("Patina/Features/Settings/Views/SettingsView.swift")
    // settingsRow is the label for the Account NavigationLink and for every
    // settingsButtonRow; without contentShape its Spacer is not hit-testable.
    #expect(source.contains(".contentShape(Rectangle())"))
    #expect(source.contains("minHeight: 44"))
}
```

**Run:** the gate command above (expect `settingsRowsAreFullyTappable` to fail).

**Implement:** in `settingsRow(...)`, `settingsToggleRow(...)`, `contextMemoryToggle` and
`appearanceRow`, add `.frame(minHeight: 44)` and `.contentShape(Rectangle())` **before** the
`.overlay` hairline so the whole row, Spacer included, is the tap target.

**Pass run:** the gate command. **Then re-run the simulator bisect** — tap (a) must now push.

**Commit:** `fix(ios): SP-20 — settings rows get a real 44pt hit area so Account pushes`
pathspec `apps/mobile/Patina/Patina/Features/Settings/Views/SettingsView.swift`
`apps/mobile/Patina/PatinaTests/ChromeReachTests.swift`

---

## T2 — SP-20b · Sign Out in Settings, and a way to close the account

**Files:**
- `apps/mobile/Patina/Patina/Features/Settings/Views/SettingsView.swift`
- `apps/mobile/Patina/Patina/Features/Account/AccountView.swift`
- `apps/mobile/Patina/Patina/Features/Account/AccountDeletionService.swift` (new)
- `apps/mobile/Patina/Patina/Services/API/APIConfiguration.swift`

**Interfaces neighbours rely on:**
`AccountDeletionService.shared.deleteAccount() async throws` · `AccountDeletionService.endpointPath`
(`/functions/v1/delete-account`) · `AccountDeletionService.failureCopy` (Patina-voice, no vendor text).

**Failing test** — `PatinaTests/AccountActionsTests.swift` (new):

```swift
@Test("account deletion calls the edge function, not the missing RPC")
func deletionEndpointIsTheEdgeFunction() {
    #expect(AccountDeletionService.endpointPath == "/functions/v1/delete-account")
    #expect(APIConfiguration.Endpoint.deleteAccount.path == "/functions/v1/delete-account")
}

@Test("a deletion failure is rendered in Patina's voice, never the server's")
func deletionFailureCopyCarriesNoVendorText() {
    let copy = AccountDeletionService.failureCopy
    #expect(copy == "We couldn't close your account just now. Try again, or write to hello@patina.cloud.")
    #expect(!copy.lowercased().contains("error"))
    #expect(!copy.contains("500"))
}

@Test("Settings offers Sign Out and Delete account directly")
func settingsSurfacesBothAccountActions() throws {
    let source = try SourcePin.read("Patina/Features/Settings/Views/SettingsView.swift")
    #expect(source.contains("\"Sign Out\""))
    #expect(source.contains("\"Delete account\""))
}
```

**Run:** gate command (three failures).

**Implement:**
1. `APIConfiguration`: repoint `case deleteAccount` from `/rest/v1/rpc/delete_user_account`
   (no such RPC exists — critique B5) to `/functions/v1/delete-account` (lane D's function).
2. New `AccountDeletionService` (actor): POST the endpoint with the caller's JWT + apikey; on
   non-2xx throw `AccountDeletionError.failed`; never surface the response body. On success call
   `LocalStoreReset.wipeUserScopedData()` then `AuthService.shared.signOut()`.
3. `SettingsView` Account group gains, signed-in only: a `Sign Out` button row (same alert copy
   `AccountView` already ships) and a destructive `Delete account` row → a confirmation alert
   ("Close your account? / This removes your account and everything on this device. It can't be
   undone.") → the service. Failure renders `failureCopy` inline above the group, never a vendor
   string.
4. `AccountView` keeps its own Sign Out (it is still a valid destination) and gains the same
   `Delete account` row so the two surfaces do not disagree.

**Pass run:** gate command.

**Commit:** `feat(ios): SP-20 — Sign Out in Settings and an account-deletion path`
pathspec the four files + `apps/mobile/Patina/PatinaTests/AccountActionsTests.swift`

---

## T3 — SP-09 · the last tap of a design request has a way back

**Files:**
- `apps/mobile/Patina/Patina/Features/Authentication/Views/AuthSheet.swift`
- `apps/mobile/Patina/Patina/Features/DesignServices/DesignRequestFlowView.swift`
- `apps/mobile/Patina/Patina/Features/DesignServices/DesignRequestFlowView+Steps.swift`
- `apps/mobile/Patina/Patina/Features/DesignServices/DesignRequestAuthCopy.swift` (new)

**Interfaces neighbours rely on:** `AuthSheet(title: String? = nil)` — the existing zero-argument
call in `ContentView.sheetContent(for:)` keeps compiling unchanged.

**Failing test** — extends `PatinaTests/AuthSheetPresentationTests.swift` (C's suite):

```swift
@Test("the soft wall names what it is gating and can be cancelled")
func softWallCarriesTitleAndCancel() throws {
    #expect(DesignRequestAuthCopy.wallTitle == "Sign in to send your request")
    #expect(DesignRequestAuthCopy.reviewHint == "You'll sign in to send this.")
    let source = try SourcePin.read("Patina/Features/Authentication/Views/AuthSheet.swift")
    #expect(source.contains("ToolbarItem(placement: .cancellationAction)"))
    #expect(source.contains("Button(\"Cancel\""))
}

@Test("AuthSheet builds with and without a title")
func authSheetBuildsBothWays() {
    _ = AuthSheet().body
    _ = AuthSheet(title: DesignRequestAuthCopy.wallTitle).body
}
```

**Run:** gate command.

**Implement:**
1. `AuthSheet` gains `var title: String? = nil`; body wraps the `AuthScreenView` in a
   `NavigationStack` with `.navigationTitle(title ?? "")`, `.toolbarTitleDisplayMode(.inline)` and a
   `.cancellationAction` `Cancel` calling `dismiss()`.
2. `DesignRequestFlowView` presents `AuthSheet(title: DesignRequestAuthCopy.wallTitle)` and clears
   `awaitingAuthToSend` on dismissal so cancelling leaves the review step intact.
3. `reviewStep` renders `DesignRequestAuthCopy.reviewHint` above the send footer when
   `!authService.isAuthenticated` — said on the way in, per the plank.

**Pass run:** gate command.

**Commit:** `fix(ios): SP-09 — the design-request soft wall gets a title and a Cancel`

---

## T4 — SP-19a · the Hearth stops painting over scrolled content

**Files:** `apps/mobile/Patina/Patina/Design/Components/CompanionSafeArea.swift`
**Interface neighbours rely on:** `companionHearthReservation(isActive:)`,
`companionSafeArea()`, `CompanionHearthMetrics.reservedHeight` (== 120) — all unchanged.

**Failing test** — `PatinaTests/ChromeReachTests.swift`:

```swift
@Test("the Hearth is a reserved region, never a painted band (C8)")
func hearthReservationDrawsNothing() throws {
    let source = try SourcePin.read("Patina/Design/Components/CompanionSafeArea.swift")
    #expect(!source.contains("PatinaColors.Background.primary"))
    #expect(source.contains("Color.clear"))
    #expect(CompanionHearthMetrics.reservedHeight == 120)
}
```

**Run:** gate command.

**Implement:** delete the `.background { PatinaColors.Background.primary.ignoresSafeArea(edges: .bottom) }`
from the inset. The reservation keeps its 120 pt height, `allowsHitTesting(false)` and
`accessibilityHidden(true)`; the layout inset is unchanged, so nothing moves — the band simply
stops being drawn over content that scrolls beneath it.

**Pass run:** gate command. Sim shot: proposal detail scrolled, "Sign proposal" whole.

**Commit:** `fix(ios): SP-19 — the Companion Hearth reserves space without painting a band`

---

## T5 — SP-19b · a real segmented unit control, thumb-sized targets, one dark screen fixed

**Files:**
- `apps/mobile/Patina/Patina/Features/RoomScan/Views/ScanFallbackEntryView.swift`
- `apps/mobile/Patina/Patina/Features/StyleReveal/Views/ScanFloorPlanPreviewView.swift`

**Interfaces neighbours rely on:** `ScanFallbackEntryView(userId:onContinue:)` and
`ScanFloorPlanPreviewView(session:onAccept:onRescan:)` — unchanged.

**Failing test** — `PatinaTests/ChromeReachTests.swift`:

```swift
@Test("ft/m is a segmented control that does not persist silently")
func unitToggleIsSegmentedAndNotPersisted() throws {
    let source = try SourcePin.read("Patina/Features/RoomScan/Views/ScanFallbackEntryView.swift")
    #expect(source.contains(".pickerStyle(.segmented)"))
    // F40: the old control restored `patina.scan.manual_entry.unit` onAppear, so a
    // later session silently started in metres.
    #expect(!source.contains("patina.scan.manual_entry.unit"))
    #expect(source.contains("frame(width: 44, height: 44)"))
}

@Test("the room-summary step goes through the dynamic tokens")
func floorPlanPreviewRespectsAppearance() throws {
    let source = try SourcePin.read("Patina/Features/StyleReveal/Views/ScanFloorPlanPreviewView.swift")
    #expect(!source.contains("PatinaColors.offWhite"))
    #expect(!source.contains("PatinaColors.charcoal"))
    #expect(!source.contains("PatinaColors.pearl"))
}
```

**Run:** gate command.

**Implement:**
1. `ScanFallbackEntryView`: `unitToggle` becomes
   `Picker("Units", selection: $unit) { Text("ft").tag(Unit.feet); Text("m").tag(Unit.meters) }
   .pickerStyle(.segmented).frame(width: 108).accessibilityLabel("Units")`; delete `unitKey`, both
   `UserDefaults.standard.set` writes and the `onAppear` restore (the `ScanAnalytics` call stays);
   each dimension field gets the current unit as a visible suffix; the −/+ steppers go from
   32×32 to a 44×44 hit area (`.frame(width: 44, height: 44).contentShape(Circle())`, circle art
   still 32).
2. `ScanFloorPlanPreviewView`: `PatinaColors.offWhite` ground → `PatinaColors.Background.primary`;
   `.charcoal` text/strokes → `PatinaColors.Text.primary`; the accept button's fill →
   `PatinaColors.Interactive.active` with `PatinaColors.Text.inverse` label; `.pearl` divider →
   `PatinaColors.Text.muted.opacity(0.3)`.

`Features/Rooms/Components/SpatialMetadataRow.swift` is deliberately **not** touched: it has no
interactive control (see the verified-facts note above).

**Pass run:** gate command. Sim shots: manual room entry (segmented control, ft selected) and the
room-summary step in dark mode.

**Commit:** `fix(ios): SP-19 — segmented unit control, 44pt steppers, dynamic tokens on the room summary`

---

## T6 — SP-03 · the share points at a client piece route, and the app can open it

**Files:**
- `apps/mobile/Patina/Patina/Features/Shared/PatinaPortalLinks.swift`
- `apps/mobile/Patina/Patina/Patina.entitlements`
- `apps/mobile/Patina/Patina/App/DeepLinking/DeepLinkHandler.swift`

**Interfaces neighbours rely on:** `PatinaDeepLinks.piece(_ id: String) -> URL` (new) ·
`PatinaDeepLinks.productURL(forProductId:)` **kept** and delegating, so A's three `ShareLink`
call sites need no edit · `DeepLinkHandler.route(forUniversalLink:) -> AppRoute?` (new, pure).

**Failing test** — `PatinaTests/PortalLinkRoutingTests.swift` (new):

```swift
@Test("a shared piece URL is the client host, not the designer portal")
func pieceURLIsTheClientHost() {
    #expect(PatinaDeepLinks.piece("abc-123").absoluteString == "https://client.patina.cloud/piece/abc-123")
    #expect(PatinaDeepLinks.productURL(forProductId: "abc-123") == PatinaDeepLinks.piece("abc-123"))
}

@Test("the four client-facing universal-link paths route")
func universalLinksRoute() {
    func route(_ s: String) -> AppRoute? {
        DeepLinkHandler.route(forUniversalLink: URL(string: s)!)
    }
    let uuid = "11111111-1111-1111-1111-111111111111"
    #expect(route("https://client.patina.cloud/piece/abc") == .pieceDetail(pieceId: "abc"))
    #expect(route("https://client.patina.cloud/invoice/\(uuid)") == .invoiceDetail(invoiceId: uuid))
    #expect(route("https://client.patina.cloud/proposal/\(uuid)") == .proposalDetail(proposalId: uuid))
    #expect(route("https://client.patina.cloud/decision/\(uuid)") == .decisionDetail(decisionId: uuid))
}

@Test("a foreign host is not routed")
func foreignHostsAreRejected() {
    #expect(DeepLinkHandler.route(forUniversalLink: URL(string: "https://evil.example/piece/abc")!) == nil)
    #expect(DeepLinkHandler.route(forUniversalLink: URL(string: "https://app.patina.cloud/piece/abc")!) == nil)
}

@Test("the app claims the client host")
func entitlementsClaimTheClientHost() throws {
    let plist = try SourcePin.read("Patina/Patina.entitlements")
    #expect(plist.contains("com.apple.developer.associated-domains"))
    #expect(plist.contains("applinks:client.patina.cloud"))
}
```

**Run:** gate command.

**Implement:**
1. `PatinaPortalLinks.swift`: add `static let pieceHost = "client.patina.cloud"` and
   `piece(_:)` building `https://client.patina.cloud/piece/<id>`; `productURL(forProductId:)` becomes
   a one-line delegate (keeps A's three call sites compiling and repoints all three shares).
2. `Patina.entitlements`: add `com.apple.developer.associated-domains` =
   `["applinks:client.patina.cloud"]`. No `project.pbxproj` edit is needed —
   `CODE_SIGN_ENTITLEMENTS = Patina/Patina.entitlements` is already set (`:505`, `:553`).
3. `DeepLinkHandler`: add the pure `static func route(forUniversalLink:)` mapping
   `/piece|/invoice|/proposal|/decision` on `PatinaDeepLinks.pieceHost` only, and let
   `handle(_:)` accept `https` for that host by consulting it before the `patina://` guard.
   `.onOpenURL` in `PatinaApp` already delivers universal links, so no App-file change.

**Claim level:** compile-green + sim-verified for the URL and the parser. A universal link actually
*opening the app* is **device-gated** and needs D's AASA deployed — not claimed this wave.

**Pass run:** gate command. Sim shot: the share sheet on a piece showing `client.patina.cloud/piece/…`.

**Commit:** `feat(ios): SP-03 — share the client piece URL and claim the universal-link host`

---

## T7 — SP-08a · the bell stops contradicting the Studio

**Files:**
- `apps/mobile/Patina/Patina/Core/Network/NotificationsAPIClient.swift`
- `apps/mobile/Patina/Patina/Features/Notifications/Models/AppNotification.swift`
- `apps/mobile/Patina/Patina/Features/Notifications/ViewModels/NotificationsViewModel.swift`
- `apps/mobile/Patina/Patina/Features/Notifications/Views/NotificationFeedView.swift`
- `apps/mobile/Patina/Patina/Features/Messaging/DesignerThreadOpener.swift` (new, shared with `ThreadListView`)
- `apps/mobile/Patina/Patina/Features/Messaging/Views/ThreadListView.swift` (adopts the helper)

**Interfaces neighbours rely on:**
`AppNotificationType` gains `.proposal`, `.invoice`, `.decision` ·
`NotificationsViewModel.fallbackRows` (built from `BadgeCountService`'s retained rows, deduped
against real rows by `entityType|entityId`) · `DesignerThreadOpener.open(relationship:) async throws -> String`.

**Failing test** — `PatinaTests/BellQueueFallbackTests.swift` (new) and an addition to
`NotificationsAPIClientContractTests`:

```swift
@Test("00534's client-facing types map to their own buckets, not 'New pieces for you'")
func moneyTypesMapHonestly() {
    #expect(AppNotificationType(serverType: "proposal_sent") == .proposal)
    #expect(AppNotificationType(serverType: "invoice_sent") == .invoice)
    #expect(AppNotificationType(serverType: "invoice_due") == .invoice)
    #expect(AppNotificationType(serverType: "decision_raised") == .decision)
    #expect(AppNotificationType.proposal.defaultTitle == "A proposal needs your signature")
    #expect(AppNotificationType.invoice.defaultTitle == "An invoice is waiting")
    #expect(AppNotificationType.decision.defaultTitle == "A decision needs you")
}

@Test("the fallback prints the Studio's own rows when the log is empty")
func fallbackMirrorsTheStudioQueue() {
    let rows = NotificationsViewModel.fallbackRows(from: studioSnapshotFixture)
    #expect(rows.map(\.entityType) == ["invoice", "decision", "proposal"])
}

@Test("a real row suppresses its fallback twin")
func fallbackDedupesAgainstRealRows() {
    let merged = NotificationsViewModel.merge(real: [invoiceRow(id: "inv-1")],
                                              fallback: fallbackRows)
    #expect(merged.filter { $0.entityId == "inv-1" }.count == 1)
}

@Test("the empty CTA branches on the designer relationship, not on nothing")
func emptyCTAIsTierBranched() {
    #expect(NotificationFeedView.emptyCTATitle(relationship: .project(projectId: UUID(), designerId: UUID(), studioName: nil),
                                               hasPromotedRequest: false) == "Message your designer")
    #expect(NotificationFeedView.emptyCTATitle(relationship: .none, hasPromotedRequest: false) == "Get design help")
    #expect(NotificationFeedView.emptyCTATitle(relationship: .none, hasPromotedRequest: true) == "Track your request")
}
```

**Run:** gate command.

**Implement:**
1. `AppNotificationType` gains the three cases with their own SF Symbols
   (`doc.text`, `creditcard`, `hand.raised`), colours and honest default titles; `init(serverType:)`
   maps lane D's strings (see the integration note in `c-notes.md`, which pins them).
2. `NotificationsViewModel`: after `load()`, when `notifications.isEmpty`, build `fallbackRows`
   from `StudioQueueBuilder.build(...)`'s `awaitingYou` section — the Studio's own computation, so
   the two surfaces cannot disagree — fed from `BadgeCountService.shared`'s retained rows. Merge
   with de-duplication on `entityType|entityId` (the plank's stated risk).
3. `NotificationFeedView`: the empty CTA becomes the pure static
   `emptyCTATitle(relationship:hasPromotedRequest:)`; "Message your designer" opens the thread via
   `DesignerThreadOpener`, which `ThreadListView`'s existing W1a compose is refactored onto so there
   is one implementation, not two.
4. Fallback rows are visually marked as coming from the Studio (they carry no read state and are not
   PATCH-able) — tapping one routes exactly where the Studio row routes.

**Pass run:** gate command.

**Commit:** `feat(ios): SP-08 — the bell falls back to the Studio queue and reads the money rail`

---

## T8 — SP-08b · the permission is earned, once, before the first money push

**Files:**
- `apps/mobile/Patina/Patina/Features/Notifications/Views/PushPrimerView.swift` (new)
- `apps/mobile/Patina/Patina/Services/API/PushTokenService.swift`
- `apps/mobile/Patina/Patina/Features/Home/Views/DailyRoomView.swift`
- `apps/mobile/Patina/Patina/Services/DesignServices/DesignRequestCoordinator.swift` (one line —
  unassigned in the steward map; recorded in `c-notes.md`)

**Interfaces neighbours rely on:**
`PushPrimerView(onDecided:)` · `PushTokenService.shared.armAuthorizationPromptGate()` (renamed from
`armFirstSubmissionPromptGate`, **same** UserDefaults key so an install that was already asked is
never re-asked) · `PushTokenService.resetAuthorizationPromptGate()`.

**Failing test** — `PatinaTests/AccountActionsTests.swift` additions + `PushTokenServiceTests` rename:

```swift
@Test("the primer carries SP-08's sentence verbatim")
func primerCopyIsVerbatim() {
    #expect(PushPrimerView.sentence == "We'll tell you when your designer sends something that needs you — a decision, a proposal, or an invoice. Nothing else.")
}

@Test("the primer is armed by the first client-facing money row, and only once")
func primerFiresOnceOnTheFirstMoneyRow() {
    PushTokenService.shared.resetAuthorizationPromptGate()
    defer { PushTokenService.shared.resetAuthorizationPromptGate() }
    #expect(PushPrimerTrigger.shouldPresent(rows: [moneyRow]))
    _ = PushTokenService.shared.armAuthorizationPromptGate()
    #expect(!PushPrimerTrigger.shouldPresent(rows: [moneyRow]))
}

@Test("a feed with no client-facing money row does not arm the primer")
func primerIgnoresUnrelatedRows() {
    PushTokenService.shared.resetAuthorizationPromptGate()
    defer { PushTokenService.shared.resetAuthorizationPromptGate() }
    #expect(!PushPrimerTrigger.shouldPresent(rows: [scanRow]))
}

@Test("the design-request submission no longer asks for notifications")
func theAskLeftTheWrongRoom() throws {
    let source = try SourcePin.read("Patina/Services/DesignServices/DesignRequestCoordinator.swift")
    #expect(!source.contains("promptForAuthorization"))
}
```

**Run:** gate command.

**Implement:**
1. New `PushPrimerView` — one screen: title "Before we interrupt you", SP-08's sentence **verbatim**,
   a primary "Turn on notifications" (→ `PushTokenService.requestAuthorizationAndRegister()`) and a
   plain "Not now". Both call `onDecided()`. No countdown, no figure, no second promise.
2. `PushTokenService`: delete `promptForAuthorizationAfterFirstSubmission()`; rename the gate to
   `armAuthorizationPromptGate()` / `resetAuthorizationPromptGate()`, key unchanged; update the file
   header so it names the primer as the one sanctioned moment.
3. `PushPrimerTrigger.shouldPresent(rows:)` — pure: true when the gate is unarmed **and** the feed
   holds at least one `proposal | invoice | decision` row. Until lane D's 00534 rows exist locally
   the same predicate fires on the first client-facing money/decision row the app reads, which is
   exactly what the brief asks for.
4. `DailyRoomView` presents `PushPrimerView` as a sheet when `shouldPresent` is true after
   `notificationsViewModel.load()`, arming the gate as it presents.
5. `DesignRequestCoordinator.swift:262`: remove the call (the ask **moves**, it is not deleted).
6. `PushTokenServiceTests`: rename the three gate tests onto the new symbols; the UserDefaults key
   assertion stays `patina.push.hasPromptedAfterFirstSubmission`.

**Pass run:** gate command. Sim shot: the primer, once, on the Daily Room.

**Commit:** `feat(ios): SP-08 — PushPrimerView carries the ask to the first money moment`

---

## T9 — companion-context fires once per screen, not four times

**Files:** `apps/mobile/Patina/Patina/Features/Companion/ViewModels/CompanionViewModel.swift`

**Interface neighbours rely on:** `updateContext(_:)` and `fetchAPIQuickActions()` keep their
signatures — `CompanionOverlay` (lane A's carve-out) is not touched.

**Failing test** — `PatinaTests/CompanionRequestGateTests.swift` (new):

```swift
@Test("three updates for one screen produce one request")
func oneScreenOneRequest() {
    var gate = CompanionQuickActionsGate()
    #expect(gate.shouldFetch(screen: "hero_frame"))
    #expect(!gate.shouldFetch(screen: "hero_frame"))
    #expect(!gate.shouldFetch(screen: "hero_frame"))
}

@Test("a real screen change fetches again")
func aScreenChangeFetches() {
    var gate = CompanionQuickActionsGate()
    #expect(gate.shouldFetch(screen: "hero_frame"))
    #expect(gate.shouldFetch(screen: "invoice_detail"))
    #expect(gate.shouldFetch(screen: "hero_frame"))
}

@Test("an invalidated gate refetches the same screen")
func invalidationRefetches() {
    var gate = CompanionQuickActionsGate()
    #expect(gate.shouldFetch(screen: "hero_frame"))
    gate.invalidate()
    #expect(gate.shouldFetch(screen: "hero_frame"))
}
```

**Run:** gate command.

**Implement:** add `struct CompanionQuickActionsGate` (last-fetched screen identifier +
`invalidate()`), hold one on the view model, and consult it in `updateContext(_:)` before spawning
the fetch task. `fetchAPIQuickActions()` stays callable directly (it invalidates first) so an
explicit refresh still works.

**Pass run:** gate command. Evidence: the launch request count in the Kong log drops from 4 to 1.

**Commit:** `fix(ios): companion-context fetches once per screen, not four times at launch`

---

## Close-out

- `PatinaTests/SourcePin.swift` (new, tiny) — the shared `read(_:)` helper the source-pinned tests
  above use, modelled on `NotificationsAPIClientContractTests`'s existing `#filePath` walk.
- Full-tier `xcodebuild test -only-testing:PatinaTests` green.
- Simulator walk on `dr-w1b-c` with `-DeploymentTarget local`, shots
  `shots/w1b-c-NN-*.png`, ledger rows appended under `## w1b-c`.
- A **signed** `.app` built last (no `CODE_SIGNING_ALLOWED=NO`), path recorded.
- `c-notes.md` carries every cross-lane item: D's 00534 `type` strings, the unassigned
  `DesignRequestCoordinator` line, and the SP-03 share-copy finding (no A edit needed).
