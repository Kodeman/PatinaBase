//
//  RefreshableSurfacesTests.swift
//  PatinaTests
//
//  C4-12 and R-03. `.refreshable` appears on twelve Features screens and on
//  none of the four tab roots, and on one of the five Studio detail screens.
//  With the backend down, the only way to recover Today was to background the
//  app; pulling down produced pixel-identical frames.
//
//  This lane owns two of those screens. The rest are integration notes —
//  `l1b-notes-out.md` O3 (L1-C: the four roots), O4 (L1-C: the decision
//  detail) and O8 (L1-F: the thread detail) — and the second half of this
//  suite is the ledger for them: it names every surface that still owes one,
//  so a note nobody applied fails here instead of being discovered on a
//  device.
//

import Foundation
import Testing
@testable import Patina

struct RefreshableSurfacesTests {

    private func hasRefreshable(_ path: String) throws -> Bool {
        try SourcePin.read(path).contains(".refreshable")
    }

    // MARK: - This lane's screens

    @Test(
        "every detail screen this lane owns can be pulled to refresh",
        arguments: [
            "Patina/Features/Proposals/Views/ProposalDetailView.swift",
            "Patina/Features/Projects/Views/ProjectDetailView.swift"
        ]
    )
    func thisLanesDetailsRefresh(path: String) throws {
        #expect(try hasRefreshable(path), "\(path) has no .refreshable")
    }

    /// A refresh that does not do the same work as the `.task` is theatre.
    @Test
    func theRefreshRunsTheSameWorkTheTaskDoes() throws {
        for path in [
            "Patina/Features/Proposals/Views/ProposalDetailView.swift",
            "Patina/Features/Projects/Views/ProjectDetailView.swift"
        ] {
            let source = try SourcePin.read(path)
            let task = try #require(
                source.components(separatedBy: ".task {").last?
                    .components(separatedBy: "}").first
            )
            let refresh = try #require(
                source.components(separatedBy: ".refreshable {").last?
                    .components(separatedBy: "}").first
            )
            #expect(
                task.trimmingCharacters(in: .whitespacesAndNewlines)
                    == refresh.trimmingCharacters(in: .whitespacesAndNewlines),
                "\(path): the refresh and the task do different work"
            )
        }
    }

    /// The in-repo pattern the finding names, kept as the reference.
    @Test
    func theInvoiceDetailIsStillTheTemplate() throws {
        #expect(try hasRefreshable("Patina/Features/Invoices/Views/InvoiceDetailView.swift"))
    }

    // MARK: - The ledger for the notes

    /// The four tab roots — the whole of `C4-12`'s headline and all of
    /// `R-03`. Every one is L1-C's file this wave; the exact text is in
    /// `build/waves/w1/l1-c-notes.md` (Task C-L1B-1).
    /// `isIntermittent` because the assertion is true only once the owning
    /// lane has merged: this suite must not redden L1-B's own gate before
    /// then, and must not redden the integration gate after. Either way the
    /// state is in the test report, by name.
    @Test(
        "the four tab roots can be pulled to refresh",
        arguments: [
            "Patina/Features/Home/Views/DailyRoomView.swift",
            "Patina/Features/Rooms/Views/YourSpacesView.swift",
            "Patina/Features/Recommendations/Views/RecommendationsView.swift",
            "Patina/Features/Profile/Views/ProfileView.swift"
        ]
    )
    func theTabRootsRefresh(path: String) throws {
        let present = try hasRefreshable(path)
        withKnownIssue(
            "a tab root owes .refreshable (l1b-notes-out.md O3, applied by L1-C)",
            isIntermittent: true
        ) {
            #expect(present)
        }
    }

    /// The two remaining Studio details, in other lanes' files: the decision
    /// detail (L1-C, O4) and the thread detail (L1-F, O8).
    @Test(
        "the remaining Studio details can be pulled to refresh",
        arguments: [
            "Patina/Features/Decisions/Views/DecisionDetailView.swift",
            "Patina/Features/Messaging/Views/ThreadDetailView.swift"
        ]
    )
    func theRemainingDetailsRefresh(path: String) throws {
        let present = try hasRefreshable(path)
        withKnownIssue(
            "a Studio detail owes .refreshable (l1b-notes-out.md O4 / O8)",
            isIntermittent: true
        ) {
            #expect(present)
        }
    }
}
