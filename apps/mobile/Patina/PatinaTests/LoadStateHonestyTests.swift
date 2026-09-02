//
//  LoadStateHonestyTests.swift
//  PatinaTests
//
//  The lane's charter in one file: loading, loaded-empty and failed are three
//  different facts, and a failed fetch may never render the empty copy.
//
//  C4-03: `RoomSyncCoordinator` swallowed `listRooms` failures with a bare
//  `return` and `CollectionsViewModel` used `(try? …) ?? []`, and neither
//  view has an error branch — so a client whose fetch failed was told "No
//  rooms yet" and "No saved items yet" about rooms and pieces she has.
//  R-01: `StudioHubViewModel.apply()` rebuilt the snapshot from
//  `result.x ?? []`, so a source that FAILED was written back as zero, under
//  a header reading "5 things need your eye".
//  L07-05: with the backend down the hub rendered its counts with full
//  confidence and no word saying nothing had been fetched.
//  R-05: the proposal detail sat blank on "One moment…" for 65–185 seconds.
//

import Foundation
import Testing
@testable import Patina

@MainActor
struct LoadStateHonestyTests {

    private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
        try JSONDecoder().decode(T.self, from: Data(json.utf8))
    }

    // MARK: - The table

    /// Every list surface this lane owns, and the three states it must be
    /// able to be in. A surface that cannot distinguish them is a surface
    /// that will eventually lie.
    @Test
    func everySurfaceCanTellTheThreeStatesApart() throws {
        let sources: [(String, String, [String])] = [
            (
                "Patina/Features/Rooms/RoomSyncCoordinator.swift",
                "rooms",
                ["lastLoadFailed", "isLoading", "lastSuccessAt"]
            ),
            (
                "Patina/Features/Collections/ViewModels/CollectionsViewModel.swift",
                "saved pieces",
                ["lastLoadFailed", "isLoading", "loadState"]
            ),
            (
                "Patina/Features/Profile/ViewModels/StudioHubViewModel.swift",
                "the Studio hub",
                ["failedSources", "isLoading", "hasLoaded", "lastSuccessAt", "stalenessLine"]
            ),
            (
                "Patina/Features/Orders/Views/OrderDetailView.swift",
                "an order",
                ["service.isLoading", "service.lastRefreshFailed"]
            ),
            (
                "Patina/Features/Proposals/ViewModels/ProposalsViewModel.swift",
                "a proposal",
                ["isLoading", "error", "fetchDeadline"]
            )
        ]
        for (path, surface, required) in sources {
            let source = try SourcePin.read(path)
            for token in required {
                #expect(source.contains(token), "\(surface) cannot express \(token)")
            }
        }
    }

    // MARK: - C4-03 · rooms

    /// A fresh coordinator has neither failed nor succeeded — the third
    /// state, and the one Spaces has to draw on a first appearance.
    @Test
    func aFreshCoordinatorClaimsNeitherSuccessNorFailure() {
        let coordinator = RoomSyncCoordinator()
        #expect(coordinator.lastLoadFailed == false)
        #expect(coordinator.lastSuccessAt == nil)
        #expect(coordinator.isLoading == false)
    }

    /// A failed read must not stamp `lastRunAt`, or the thirty-second
    /// debounce swallows the retry the error state offers.
    @Test
    func aFailedRoomListDoesNotStartTheDebounce() throws {
        let source = try SourcePin.read("Patina/Features/Rooms/RoomSyncCoordinator.swift")
        let catchBlock = try #require(
            source.components(separatedBy: "rows = try await api.listRooms(userId: owner)").last?
                .components(separatedBy: "lastLoadFailed = false").first
        )
        #expect(catchBlock.contains("lastLoadFailed = true"))
        #expect(catchBlock.contains("lastRunAt = now") == false)
    }

    @Test
    func forgettingTheStoreClearsTheFailure() {
        let coordinator = RoomSyncCoordinator(lastOwner: "a", lastRunAt: Date())
        coordinator.forget()
        #expect(coordinator.lastLoadFailed == false)
        #expect(coordinator.lastSuccessAt == nil)
    }

    // MARK: - C4-03 · saved pieces

    @Test
    func theSavedScreenHasAnErrorBranchDistinctFromItsEmptyOne() throws {
        let view = try SourcePin.read("Patina/Features/Collections/Views/CollectionsView.swift")
        #expect(view.contains("CollectionsView.ErrorState"))
        #expect(view.contains("CollectionsView.Loading"))
        #expect(view.contains(#"Text("No saved items yet")"#))
        // The empty copy must sit behind the failed and loading branches, not
        // beside them.
        let errorIndex = try #require(view.range(of: "CollectionsView.ErrorState")).lowerBound
        let emptyIndex = try #require(view.range(of: #"Text("No saved items yet")"#)).lowerBound
        #expect(errorIndex < emptyIndex)
    }

    @Test
    func theSavedListStopsCoercingAFailureToAnEmptyArray() throws {
        let source = try SourcePin.read("Patina/Features/Collections/ViewModels/CollectionsViewModel.swift")
        #expect(source.contains("(try? await RoomsAPIClient.shared.listItems(forRoomId: remoteId)) ?? []") == false)
        #expect(source.contains("lastLoadFailed = anyFailed"))
    }

    @Test
    func theSavedLoadStateResolvesInPriorityOrder() {
        let viewModel = CollectionsViewModel()
        #expect(viewModel.loadState == .loaded)
    }

    // MARK: - R-01 / L07-05 · the Studio hub

    private func hubResult(
        decisionsFailed: Bool = false,
        everythingFailed: Bool = false
    ) throws -> StudioLoadResult {
        let decisions = try decode([RemoteClientDecision].self, """
        [{ "id": "d1", "title": "Rug colour", "status": "pending",
           "due_date": "2026-08-22", "created_at": "2026-08-12T12:00:00Z" }]
        """)
        let projects = try decode([RemoteProject].self, """
        [{ "id": "p1", "name": "Aspen Loft", "status": "active",
           "updated_at": "2026-08-20T12:00:00Z" }]
        """)
        if everythingFailed {
            return StudioLoadResult(
                projects: nil, decisions: nil, proposals: nil, invoices: nil,
                documents: nil, threads: nil, notifications: nil
            )
        }
        return StudioLoadResult(
            projects: projects,
            decisions: decisionsFailed ? nil : decisions,
            proposals: [], invoices: [], documents: [], threads: [], notifications: []
        )
    }

    /// The finding, exactly: a source that fails must not be written back as
    /// zero rows under a header that says otherwise.
    @Test
    func aFailedSourceKeepsTheRowsItLastReturned() throws {
        let hub = StudioHubViewModel()
        hub.apply(try hubResult())
        let awaitingBefore = hub.snapshot.attentionSummary.awaitingCount
        #expect(awaitingBefore > 0)

        hub.apply(try hubResult(decisionsFailed: true))
        #expect(
            hub.snapshot.attentionSummary.awaitingCount == awaitingBefore,
            "a decisions fetch that failed emptied the Awaiting you section"
        )
        #expect(hub.failedSources == ["decisions"])
        #expect(hub.loadMessage == "Some Studio details couldn’t be refreshed. What loaded is still shown.")
    }

    @Test
    func aCleanLoadStampsTheSuccessAndSaysNothingAboutStaleness() throws {
        let hub = StudioHubViewModel()
        let now = Date(timeIntervalSince1970: 1_800_000_000)
        hub.apply(try hubResult(), now: now)
        #expect(hub.lastSuccessAt == now)
        #expect(hub.stalenessLine == nil)
        #expect(hub.loadMessage == nil)
    }

    /// L07-05's own constraint, carried from the walk: a word, never a dot
    /// and never a badge.
    @Test
    func aStaleHubSaysSoInWords() throws {
        let hub = StudioHubViewModel()
        hub.apply(try hubResult(), now: Date(timeIntervalSinceNow: -3600))
        hub.apply(try hubResult(everythingFailed: true))

        let line = try #require(hub.stalenessLine)
        #expect(line.localizedCaseInsensitiveContains("last updated"))
        #expect(line.hasSuffix("."))
    }

    @Test
    func aHubThatNeverLoadedSaysThatInsteadOfANonExistentTimestamp() throws {
        let hub = StudioHubViewModel()
        hub.apply(try hubResult(decisionsFailed: true))
        #expect(hub.stalenessLine == "We couldn’t reach your studio just now.")
    }

    /// Nothing held is nothing to be stale about — that is the error state,
    /// not a staleness line.
    @Test
    func anEmptyHubHasNoStalenessLine() throws {
        let hub = StudioHubViewModel()
        hub.apply(try hubResult(everythingFailed: true))
        #expect(hub.stalenessLine == nil)
        #expect(hub.loadMessage == "We couldn’t gather your Studio. Check your connection and try again.")
    }

    @Test
    func anAccountChangeDropsTheHeldRows() throws {
        let hub = StudioHubViewModel()
        hub.apply(try hubResult())
        hub.resetForSessionChange()
        hub.apply(try hubResult(everythingFailed: true))
        #expect(hub.snapshot.attentionSummary.awaitingCount == 0)
        #expect(hub.lastSuccessAt == nil)
    }

    // MARK: - R-05 · the proposal detail

    @Test
    func theProposalFetchIsCappedAtTenSeconds() {
        #expect(ProposalDetailViewModel.fetchDeadline <= 10)
    }

    @Test
    func theDeadlineFiresWhenTheWorkOutlastsIt() async {
        await #expect(throws: ProposalDetailViewModel.ProposalLoadTimeout.self) {
            try await ProposalDetailViewModel.withDeadline(0.05) {
                try await Task.sleep(for: .seconds(5))
                return 1
            }
        }
    }

    @Test
    func theDeadlineLetsFastWorkThrough() async throws {
        let value = try await ProposalDetailViewModel.withDeadline(5) { 42 }
        #expect(value == 42)
    }

    /// The blank cream page is replaced by the screen's own chrome.
    @Test
    func theProposalLoadsInsideItsOwnChrome() throws {
        let view = try SourcePin.read("Patina/Features/Proposals/Views/ProposalDetailView.swift")
        #expect(view.contains("ProposalDetailView.LoadingSkeleton"))
        #expect(view.contains(#"Text("Opening your proposal…")"#))
    }

    // MARK: - C4-03 · the order detail, which already got this right

    /// `OrderDetailView` is the in-repo template for the three states, and
    /// the reason the finding names it. Pinned so it stays that way.
    @Test
    func theOrderDetailKeepsItsThreeBranches() throws {
        let view = try SourcePin.read("Patina/Features/Orders/Views/OrderDetailView.swift")
        #expect(view.contains("service.lastRefreshFailed"))
        #expect(view.contains("We couldn’t reach your orders."))
        #expect(view.contains("We couldn’t find that order"))
    }
}
