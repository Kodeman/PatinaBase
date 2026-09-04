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
            let task = try #require(Self.closure(after: ".task {", in: source))
            let refresh = try #require(Self.closure(after: ".refreshable {", in: source))
            #expect(
                task.trimmingCharacters(in: .whitespacesAndNewlines)
                    == refresh.trimmingCharacters(in: .whitespacesAndNewlines),
                "\(path): the refresh and the task do different work"
            )
        }
    }

    /// The closure's real extent, brace-matched.
    ///
    /// Splitting on the first `}` worked only because this lane's two screens
    /// each call one function. `DailyRoomView`'s block (note O3) is ten
    /// statements with nested braces, so the naive split would have compared
    /// two different fragments and reported agreement (review RL1B-19).
    private static func closure(after marker: String, in source: String) -> String? {
        guard let start = source.range(of: marker, options: .backwards) else { return nil }
        var depth = 1
        var body = ""
        for character in source[start.upperBound...] {
            if character == "{" { depth += 1 }
            if character == "}" {
                depth -= 1
                if depth == 0 { return body }
            }
            body.append(character)
        }
        return nil
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
        #expect(try hasRefreshable(path), "\(path) owes .refreshable (l1b-notes-out.md O3)")
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
        #expect(try hasRefreshable(path), "\(path) owes .refreshable (l1b-notes-out.md O4 / O8)")
    }
}
