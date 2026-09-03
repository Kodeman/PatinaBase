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
    ///
    /// Nine, as PROGRAM.md §3 · L1-B writes it. Round 2 shipped five and the
    /// charter's count went unremarked (review `RL1B2-12`); documents,
    /// projects, decisions and the thread list are the four that were
    /// missing. All four already draw three states — this locks that, and it
    /// is a `#expect`, not a rewrite.
    private struct Surface {
        let path: String
        let name: String
        let required: [String]
    }

    private static let surfaces = [
        Surface(
            path: "Patina/Features/Rooms/RoomSyncCoordinator.swift", name: "rooms",
            required: ["lastLoadFailed", "isLoading", "lastSuccessAt"]
        ),
        Surface(
            path: "Patina/Features/Collections/ViewModels/CollectionsViewModel.swift",
            name: "saved pieces",
            required: ["lastLoadFailed", "isLoading", "loadState"]
        ),
        Surface(
            path: "Patina/Features/Profile/ViewModels/StudioHubViewModel.swift",
            name: "the Studio hub",
            required: ["failedSources", "isLoading", "hasLoaded", "lastSuccessAt", "stalenessLine"]
        ),
        Surface(
            path: "Patina/Features/Orders/Views/OrderDetailView.swift", name: "an order",
            required: ["service.isLoading", "service.lastRefreshFailed"]
        ),
        Surface(
            path: "Patina/Features/Proposals/ViewModels/ProposalsViewModel.swift",
            name: "a proposal",
            required: ["isLoading", "error", "fetchDeadline"]
        ),
        Surface(
            path: "Patina/Features/Documents/DocumentsViewModel.swift",
            name: "documents",
            required: ["isLoading", "error"]
        ),
        Surface(
            path: "Patina/Features/Projects/ViewModels/ProjectsViewModel.swift",
            name: "projects",
            required: ["isLoading", "error"]
        ),
        Surface(
            path: "Patina/Features/Decisions/ViewModels/DecisionsViewModel.swift",
            name: "decisions",
            required: ["isLoading", "error"]
        ),
        Surface(
            path: "Patina/Features/Messaging/ViewModels/MessagingViewModel.swift",
            name: "the thread list",
            required: ["isLoading", "error"]
        )
    ]

    @Test
    func everySurfaceCanTellTheThreeStatesApart() throws {
        #expect(Self.surfaces.count == 9, "PROGRAM.md §3 · L1-B names nine list surfaces")
        for surface in Self.surfaces {
            let source = try SourcePin.read(surface.path)
            for token in surface.required {
                #expect(source.contains(token), "\(surface.name) cannot express \(token)")
            }
        }
    }

    /// A view model that *can* say "failed" is only half of it. These four
    /// draw their own list, so the pin is that the empty sentence sits behind
    /// the error branch rather than beside it — the exact shape `C4-03` was
    /// filed about on rooms and saved pieces.
    @Test(
        "a failed fetch never renders the empty copy",
        arguments: [
            "Patina/Features/Documents/DocumentListView.swift",
            "Patina/Features/Projects/Views/ProjectListView.swift",
            "Patina/Features/Decisions/Views/DecisionListView.swift",
            "Patina/Features/Messaging/Views/ThreadListView.swift"
        ]
    )
    func theListDrawsTheErrorBeforeTheEmptyState(path: String) throws {
        let source = try SourcePin.read(path)
        let error = try #require(source.range(of: "} else if let error = viewModel.error,"))
        let loading = try #require(source.range(of: "if viewModel.isLoading &&"))
        #expect(loading.lowerBound < error.lowerBound, "\(path) checks failure before loading")
        // The bare `isEmpty` branch — the one that draws "nothing here yet" —
        // must come after the failure branch, or a failed fetch renders it.
        let empty = try #require(
            source.range(of: "isEmpty {", range: error.upperBound..<source.endIndex)
        )
        #expect(error.upperBound < empty.lowerBound)
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

    /// The other way the fetch never happens: a signed-in reader whose
    /// `resolveUserId()` throws — an expired token with the backend down.
    /// The early return left `lastLoadFailed` false, so Spaces' error branch
    /// could not fire and it drew "No rooms yet" instead (review RL1B-12).
    /// The two arms above it — already in flight, and not yet due — are not
    /// failures and must not set it.
    @Test
    func aFailedOwnerLookupIsAlsoAFailure() throws {
        let source = try SourcePin.read("Patina/Features/Rooms/RoomSyncCoordinator.swift")
        let ownerGuard = try #require(
            source.components(separatedBy: "guard let owner = try? await api.resolveUserId()").last?
                .components(separatedBy: "\n        }").first
        )
        #expect(ownerGuard.contains("lastLoadFailed = true"))

        for notAFailure in ["guard !inFlight else { return }", "guard Self.isDue("] {
            let arm = try #require(
                source.components(separatedBy: notAFailure).last?
                    .components(separatedBy: "\n\n").first
            )
            #expect(arm.contains("lastLoadFailed = true") == false, "\(notAFailure) is not a failure")
        }
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
        // C5-09 / note E3-L1B-4: this lane's C4-03 hunk rewrote the block
        // L1-E had already corrected, and carried the retired noun back in.
        #expect(view.contains(#"Text("No saved pieces yet")"#))
        // The empty copy must sit behind the failed and loading branches, not
        // beside them.
        let errorIndex = try #require(view.range(of: "CollectionsView.ErrorState")).lowerBound
        let emptyIndex = try #require(view.range(of: #"Text("No saved pieces yet")"#)).lowerBound
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

    /// `R-05`'s other half: the fix line asks for the title "from the record
    /// row that launched it", and the route carries only an id. The lookup
    /// answers from the rows Today and Studio already hold; a proposal the
    /// app has never seen still gets the grey skeleton (review `RL1B2-15`).
    @Test
    func theSkeletonCanNameAProposalItHasNotFetched() {
        #expect(ProposalDetailViewModel.knownRecord(for: UUID().uuidString) == nil)
    }

    @Test
    func theSkeletonDrawsThatNameInsteadOfAGreyBar() throws {
        let view = try SourcePin.read("Patina/Features/Proposals/Views/ProposalDetailView.swift")
        let skeleton = try #require(
            view.components(separatedBy: "private var loadingSkeleton: some View {").last?
                .components(separatedBy: "// MARK: - Header").first
        )
        #expect(skeleton.contains("ProposalDetailViewModel.knownRecord(for: proposalId)"))
        #expect(skeleton.contains("if let title = known?.title, !title.isEmpty {"))
        #expect(skeleton.contains("if let address = known?.project_address, !address.isEmpty {"))
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

// MARK: - R-05, the second half of the deadline

@MainActor
extension LoadStateHonestyTests {

    /// The ten-second cap and the `.refreshable` that makes the retry
    /// reachable are what create the overlap: two `load(proposalId:)` calls
    /// with no mutual exclusion. A pull-to-refresh that returns at t=3 s
    /// populates the bundle; the original `.task` then times out at t=10 s and
    /// its catch clears `proposal`, `items`, `sections`, `exclusions`,
    /// `scopeRooms` and `boards` over the page the reader is looking at
    /// (review `RL1B3-05`). Same guard as `RoomSyncCoordinator.inFlight` and
    /// `DailyRoomBatchQueue.isFlushing`.
    @Test
    func aSlowLoadMayNotClearAFreshBundle() async {
        let viewModel = ProposalDetailViewModel()

        // The first load is still suspended when the second arrives — exactly
        // the `.task` / `.refreshable` overlap. Both are capped at 50 ms, so
        // this needs no reachable backend and cannot hang.
        async let first: Void = viewModel.load(proposalId: "p1", deadline: 0.05)
        try? await Task.sleep(for: .milliseconds(5))
        await viewModel.load(proposalId: "p1", deadline: 0.05)
        await first

        // The second caller was refused entry rather than racing, so the view
        // model lands in one consistent state instead of a torn one: nothing
        // left mid-flight, and a failure reported once.
        #expect(viewModel.isLoading == false)
        #expect(viewModel.error != nil)
        #expect(viewModel.proposal == nil)
    }

    /// The guard is claimed before the first `await`, or two callers in the
    /// same tick both pass it.
    @Test
    func theProposalLoadClaimsItsGuardBeforeSuspending() throws {
        let source = try SourcePin.read(
            "Patina/Features/Proposals/ViewModels/ProposalsViewModel.swift"
        )
        let load = try #require(
            source.components(separatedBy: "func load(proposalId: String, deadline:").last?
                .components(separatedBy: "\n    }").first
        )
        let guardIndex = try #require(load.range(of: "guard !isInFlight else { return }")).lowerBound
        let firstAwait = try #require(load.range(of: "try await Self.withDeadline")).lowerBound
        #expect(guardIndex < firstAwait)
        #expect(load.contains("isInFlight = true"))
        #expect(load.contains("defer { isInFlight = false }"))
    }
}

// MARK: - The cross-lane halves

/// Two of this lane's findings close only in files L1-C owns, and L1-C merges
/// first (D14) — so neither has an owner left to schedule it (review
/// `RL1B3-03`). The steward has since routed both back to L1-B after merge
/// (`steward.md`, "From L1-C — fix round", rows `C-L1B-3` and `C-L1B-1`); what
/// these two pin is that the work is *not done yet*.
///
/// Known issues, deliberately **not** `isIntermittent`: green while the note is
/// owed, red the moment it lands. `l1b-notes-out.md` §S6 carries the schedule.
@MainActor
extension LoadStateHonestyTests {

    /// `C4-03`'s own `where` names Spaces first, and Spaces is the one surface
    /// in the nine-row table with no error branch at all: `YourSpacesView`
    /// draws a bare `Text("No rooms yet")` whatever `lastLoadFailed` says.
    @Test
    func theSpacesErrorBranchIsStillOwed() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Rooms/Views/YourSpacesView.swift")
        )
        withKnownIssue("C4-03 owes Your Spaces its error branch (l1b-notes-out.md O5)") {
            #expect(code.contains("lastLoadFailed"))
        }
    }

    /// `L07-05`. `stalenessLine` exists on the view model and is tested there;
    /// O12 landed at merge 6, on the integration tip, so the hub now says when
    /// its numbers are from instead of drawing stale counts with full
    /// confidence. The known issue is gone and this is the bar.
    @Test
    func theStudioHubRendersItsStalenessLine() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Profile/Views/StudioHubView.swift")
        )
        #expect(code.contains("stalenessLine"))
    }
}
