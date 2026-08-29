//
//  SessionIsolationTests.swift
//  PatinaTests
//
//  W5's walk item 2, closed. Signing out of one account and into another
//  inside the same process left `BadgeCountService.projects` holding the first
//  account's rows, and `DesignerThreadOpener` resolved the second account
//  against the first account's project. The server refused the write — nothing
//  leaked — but the message the person sent did not go anywhere.
//
//  Three things are pinned here: the seam decides correctly, the reset reaches
//  every participant, and the participant list is the whole list.
//

import Testing
import Foundation
@testable import Patina

@MainActor
struct SessionIsolationTests {

    // MARK: - The seam

    @Test("a token refresh is not an account change; a sign-out and a sign-in are")
    func theSeamOnlyFiresOnARealChange() {
        let a = "AAAA-1111"
        let b = "BBBB-2222"
        #expect(AuthService.isAccountChange(previous: nil, incoming: a))
        #expect(!AuthService.isAccountChange(previous: a, incoming: a))
        #expect(AuthService.isAccountChange(previous: a, incoming: b))
        #expect(AuthService.isAccountChange(previous: a, incoming: nil))
        #expect(!AuthService.isAccountChange(previous: nil, incoming: nil))
    }

    /// Order is the whole safety property: the hydration block and
    /// `settleLocalStore`'s room reconcile both read singletons that are still
    /// holding the previous account's rows until the reset has run.
    @Test("the reset runs before anything fetches for the new account")
    func theResetPrecedesTheFirstFetch() throws {
        let source = try SourcePin.read("Patina/Services/Auth/AuthService.swift")
        let reset = try #require(source.range(of: "SessionScope.reset()"))
        let settle = try #require(source.range(of: "Self.settleLocalStore(for:"))
        let hydrate = try #require(source.range(of: "await ProfileService.shared.fetchProfile"))
        let refresh = try #require(source.range(of: "SessionScope.refresh()"))
        #expect(reset.lowerBound < settle.lowerBound)
        #expect(reset.lowerBound < hydrate.lowerBound)
        #expect(reset.lowerBound < refresh.lowerBound)
    }

    // MARK: - The reset reaches everyone

    @MainActor
    private final class SpyParticipant: SessionScoped {
        private(set) var resets = 0
        func resetForSessionChange() { resets += 1 }
    }

    @Test("every participant is reset, exactly once")
    func everyParticipantIsReset() {
        let spies = [SpyParticipant(), SpyParticipant(), SpyParticipant()]
        SessionScope.reset(spies)
        #expect(spies.allSatisfy { $0.resets == 1 })
    }

    @Test("the participant list is not empty and holds no duplicates")
    func theParticipantsAreDistinct() {
        let participants = SessionScope.participants()
        #expect(participants.count == 11)
        let identities = Set(participants.map { ObjectIdentifier($0) })
        #expect(identities.count == participants.count)
    }

    // MARK: - The service that caused the defect

    @Test("the badge service really does drop the previous account's rows")
    func badgeCountsAreCleared() throws {
        let service = BadgeCountService.makeForTests()
        let projects = try JSONDecoder().decode([RemoteProject].self, from: Data("""
        [{ "id": "a-project", "name": "Aspen Loft Refresh", "status": "active",
           "designer_id": "22222222-2222-2222-2222-222222222222" }]
        """.utf8))
        let decisions = try JSONDecoder().decode([RemoteClientDecision].self, from: Data("""
        [{ "id": "d-1", "project_id": "a-project", "title": "Rug color",
           "status": "pending", "created_at": "2026-08-20T10:00:00Z" }]
        """.utf8))
        service.apply(
            decisions: decisions, summaries: nil, proposals: nil,
            invoices: nil, projects: projects, roster: [
                RosterDesigner(designerId: UUID(), addedAt: Date())
            ]
        )
        #expect(service.projects.count == 1)
        #expect(service.pendingDecisionCount == 1)
        #expect(service.projectsLoaded)

        service.resetForSessionChange()

        #expect(service.projects.isEmpty)
        #expect(service.pendingDecisions.isEmpty)
        #expect(service.roster.isEmpty)
        #expect(service.pendingDecisionCount == 0)
        #expect(service.attentionCount == 0)
        #expect(!service.hasLoaded)
        // The R3 gate: "no answer yet" must not read as "this client has no
        // designer", which is the one state that draws Buy.
        #expect(!service.projectsLoaded)
    }

    // MARK: - The five other in-file resets, pinned at the source

    /// Each reset must name every field of the account's data its own file
    /// declares. A property added later and forgotten here is a leak with no
    /// symptom until someone switches accounts, so the pin is by name.
    @Test(
        "every in-file reset clears every field it holds",
        arguments: [
            (
                "Patina/Services/Badges/BadgeCountService.swift",
                [
                    "pendingDecisionCount", "unreadMessageCount",
                    "proposalsAwaitingSignatureCount", "payableInvoiceCount",
                    "projectCount", "pendingDecisions", "pendingProposals",
                    "payableInvoices", "threadSummaries", "projects", "roster",
                    "hasLoaded", "projectsLoaded", "lastRefreshFailed", "pendingRefresh"
                ]
            ),
            (
                "Patina/Services/DesignServices/DesignRequestStatusService.swift",
                ["requests", "hasLoaded", "sessionDismissedLeadIds", "pendingRefresh"]
            ),
            (
                "Patina/Features/Orders/ViewModels/OrdersService.swift",
                ["orders", "terms", "isLoading", "hasLoaded", "lastRefreshFailed", "inFlight"]
            ),
            (
                "Patina/Features/Profile/ViewModels/StudioHubViewModel.swift",
                ["snapshot", "failedSources", "isLoading", "hasLoaded"]
            ),
            (
                "Patina/Services/Settings/SettingsService.swift",
                ["notificationsEnabled", "hapticsEnabled", "isLoaded"]
            )
        ]
    )
    func theResetBodyNamesEveryField(path: String, fields: [String]) throws {
        let source = try SourcePin.read(path)
        let start = try #require(source.range(of: "func resetForSessionChange() {"))
        let body = try #require(
            source[start.upperBound...].range(of: "\n    }").map {
                String(source[start.upperBound..<$0.lowerBound])
            }
        )
        for field in fields {
            #expect(body.contains(field), "\(path) reset does not clear \(field)")
        }
    }

    // MARK: - The list is the whole list

    /// Participants, by the file that declares them.
    private static let participantFiles: Set<String> = [
        "BadgeCountService.swift",
        "DesignRequestStatusService.swift",
        "OrdersService.swift",
        "StudioHubViewModel.swift",
        "SettingsService.swift",
        "ProfileService.swift",
        "RoomSelectionStore.swift",
        "NotificationManager.swift",
        "RoomSyncCoordinator.swift",
        "CompanionService.swift",
        "PieceActChannel.swift"
    ]

    /// Every other `static let shared` in the app, and why it is not one.
    /// A new singleton lands in neither set and reddens `theListIsTheWholeList`
    /// — which is the point: the author has to say which it is.
    private static let excludedFiles: [String: String] = {
        var out: [String: String] = [:]

        // Network clients. Configuration and a URLSession; every row they
        // return is handed to a caller and held there, never here.
        for file in [
            "DecisionsAPIClient.swift", "DirectOrdersAPIClient.swift",
            "EditorialStoriesAPIClient.swift", "FulfillmentAPIClient.swift",
            "MessagingAPIClient.swift", "NotificationsAPIClient.swift",
            "ProductAPIClient.swift", "ProjectsAPIClient.swift", "RoomsAPIClient.swift",
            "RosterAPIClient.swift", "SupabaseClient.swift", "DocumentsAPIClient.swift",
            "InvoicesAPIClient.swift", "ProposalsAPIClient.swift",
            "CompanionAPIClient.swift", "SanityHelpClient.swift", "DailyRoomAPI.swift"
        ] { out[file] = "stateless client — holds no rows" }

        // Caches keyed by the id of the thing they describe, not by session.
        // A designer's display name is the same fact for whoever is signed in.
        for file in ["StudioIdentityService.swift", "ProfileLookupService.swift"] {
            out[file] = "keyed by the id it describes, not by the session"
        }

        // Device- or owner-scoped persistence. `LocalStoreReset` runs on the
        // same seam for the account-change case, and the two App Group
        // artefacts carry `RecordOwnerStamp` so a foreign one is refused.
        for file in [
            "PersistenceController.swift", "RecordSnapshotStore.swift", "LastSeenStore.swift",
            "RecordOwner.swift", "ContextMemoryStore.swift", "ConversationStorageService.swift",
            "StyleProfileStore.swift", "FirstLaunchDataStore.swift",
            "firstLaunchTourState.swift", "UserDefaultsBacked.swift"
        ] { out[file] = "on disk, owner-keyed or device-scoped — LocalStoreReset's boundary" }

        // Scan pipeline. Its rows are SwiftData, wiped by `LocalStoreReset`;
        // the in-memory parts are queue mechanics and file bookkeeping.
        for file in [
            "RoomScanSyncService.swift", "RoomUploadService.swift", "ScanDiskBudget.swift",
            "ScanHoldMigrator.swift", "ScanRecoveryService.swift",
            "BackgroundScanUploader.swift", "UploadDiagnosticsLog.swift",
            "ScanSharingService.swift"
        ] { out[file] = "scan queue mechanics; its rows are SwiftData, wiped by LocalStoreReset" }

        // Analytics. `PostHogService.reset()` already runs on `.signedOut`;
        // the rest count screens, not accounts.
        for file in [
            "PostHogService.swift", "SessionMetricsService.swift", "DwellTracker.swift",
            "InteractionTracker.swift", "CompanionAnalytics.swift", "HelpAnalytics.swift",
            "ScanAnalytics.swift", "WalkAnalytics.swift", "DailyRoomBatchQueue.swift",
            "OnboardingFunnel.swift"
        ] { out[file] = "analytics — PostHogService.reset() is the sign-out hook" }

        // Transient flow state, alive only for the duration of one flow.
        for file in [
            "QRAuthService.swift", "BiometricService.swift", "CameraPermissionService.swift",
            "AccountDeletionService.swift", "DesignServicesService.swift",
            "CompanionVoice.swift", "IntentDetector.swift", "ScanHaptics.swift",
            "PushTokenService.swift", "DeepLinkHandler.swift"
        ] { out[file] = "transient flow state, not a cache of the account" }

        // The boundary itself, and the two stores it drives.
        out["AuthService.swift"] = "the seam — it decides the reset, it is not reset by it"
        out["GuestSessionStore.swift"] = "cleared by AuthService on every real session"
        out["LocalStoreClaim.swift"] = "drives the SP-06 claim sheet across the same boundary"
        out["FeatureFlags.swift"] = "resolved once per launch; a device answer, not an account's"
        return out
    }()

    @Test("no singleton in the app escapes the ruling")
    func theListIsTheWholeList() {
        var found: Set<String> = []
        for path in SourcePin.swiftFiles(under: "Patina") {
            guard let source = try? String(contentsOfFile: path, encoding: .utf8),
                  source.contains("static let shared ") else { continue }
            found.insert(URL(fileURLWithPath: path).lastPathComponent)
        }
        let ruled = Self.participantFiles.union(Self.excludedFiles.keys)
        #expect(found.subtracting(ruled).isEmpty, "unruled singleton(s): \(found.subtracting(ruled).sorted())")
        #expect(ruled.subtracting(found).isEmpty, "ruled on a singleton that is gone: \(ruled.subtracting(found).sorted())")
    }
}
