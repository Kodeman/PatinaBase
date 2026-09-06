//
//  WaveTwoCarryTests.swift
//  PatinaTests
//
//  The five Wave-2 nits carried into Wave 3, each with the finding that named
//  it: `W2R3-n1` (the hub's number is a snapshot), `W2R1-n3` (numerals where
//  the neighbouring copy spells counts), `W2R1-n4` (the Stage-2 row carries no
//  kind chip, and calls itself a decision), and `IOSC-R3-01` (the red
//  "Expired" line two rows from the badge P-17 retired).
//

import Foundation
import Testing
@testable import Patina

@MainActor
struct WaveTwoCarryTests {

    // MARK: - `W2R3-n1` · the hub's number is not a snapshot any more

    /// The walk read "Ten" across three consecutive Today→Studio re-entries
    /// while the real set fell to eight. The merge was right; the FETCH never
    /// re-ran, because the key was the auth flag and the auth flag does not
    /// move inside a session.
    @Test("the hub refreshes when she arrives, and not on the way out")
    func theHubRefreshesOnReEntry() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Profile/Views/StudioHubView.swift")
        )
        #expect(!code.contains(".task(id: authService.isAuthenticated)"),
                "the hub still keys its load on the auth flag alone")
        #expect(code.contains(".task(id: studioEntryKey)"))
        #expect(code.contains("guard isOnStudio else { return }"),
                "the hub refetches eight sources on the way out of the tab")
    }

    // MARK: - `W2R1-n3` · words where the neighbouring copy spells counts

    @Test("the Studio's record rows count in words")
    func theRecordRowsCountInWords() throws {
        let three = try #require(Self.proposalsRow(
            in: StudioQueueBuilder.build(Self.input(proposals: try Self.proposals(3, accepted: 2)))
        ))
        #expect(three.detail == "Three shared proposals")
        #expect(three.meta == "Two accepted")

        let one = try #require(Self.proposalsRow(
            in: StudioQueueBuilder.build(Self.input(proposals: try Self.proposals(1, accepted: 1)))
        ))
        #expect(one.detail == "One shared proposal")
        #expect(one.meta == "One accepted")
    }

    private static func proposalsRow(in snapshot: StudioQueueSnapshot) -> StudioQueueRow? {
        snapshot.sections
            .flatMap(\.rows)
            .first { $0.id == "records.proposals" }
    }

    private static func input(proposals: [RemoteProposal]) -> StudioQueueInput {
        StudioQueueInput(
            projects: [], decisions: [], proposals: proposals, invoices: [],
            documents: [], threads: [], notifications: [],
            currentUserId: nil, now: Date()
        )
    }

    private static func proposals(_ count: Int, accepted: Int) throws -> [RemoteProposal] {
        let rows = (0..<count).map { index in
            """
            { "id": "p-\(index)", "title": "Proposal \(index)",
              "status": "\(index < accepted ? "accepted" : "sent")",
              "created_at": "2026-09-01T00:00:00Z" }
            """
        }
        return try JSONDecoder().decode(
            [RemoteProposal].self,
            from: Data("[\(rows.joined(separator: ","))]".utf8)
        )
    }

    /// Every count string the hub's rows build, read off the source: none of
    /// them interpolates a bare figure any more.
    @Test("no Studio row interpolates a bare count")
    func noStudioRowPrintsAFigure() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Profile/ViewModels/StudioQueueBuilder.swift")
        )
        for bare in ["\\(proposals.count) shared", "\\(invoices.count) shared",
                     "\\(documents.count) shared", "\\(accepted) accepted",
                     "\\(paid) paid", "\\(projectCount) projects",
                     "\\(voided.count) voided", "\\(archived.count) declined"] {
            #expect(!code.contains(bare), "a Studio row still prints \(bare)")
        }
        #expect(!code.contains("singular: \"1 "), "a Studio row still spells one as a figure")
    }

    @Test("the money list eyebrows count in words")
    func theListEyebrowsCountInWords() throws {
        for file in ["Patina/Features/Invoices/Views/InvoiceListView.swift",
                     "Patina/Features/Proposals/Views/ProposalListView.swift"] {
            let code = SourceScan.code(in: try SourcePin.read(file))
            #expect(code.contains("PatinaCount.inWords("),
                    "\((file as NSString).lastPathComponent) still counts in figures")
        }
        // Past twelve the word stops helping — the web's own cutoff, so the
        // two surfaces cannot say one count two ways.
        #expect(PatinaCount.inWords(9) == "nine")
        #expect(PatinaCount.inWords(14) == "14")
    }

    // MARK: - `W2R1-n4` · the chip, and the word for an untitled row

    @Test("a Stage-2 approval carries the same kind chip the legacy rows do")
    func theStageTwoRowCarriesAChip() throws {
        let approval = try ProjectApprovalFixture.decision()
        #expect(approval.kindChipLabel == "Approval")

        // The projection's synthesized row carries no `decision_type` at all,
        // which is exactly the row the walk found chipless beside three
        // chipped ones.
        let synthesized = try ProjectApprovalFixture.review().asWaitingDecision()
        #expect(synthesized.decision_type == nil)
        #expect(synthesized.kindChipLabel == "Approval")
    }

    @Test("a legacy decision keeps its own kind on the chip")
    func aLegacyRowKeepsItsKind() throws {
        let row = try JSONDecoder().decode(RemoteClientDecision.self, from: Data("""
        { "id": "d-1", "title": "Rug colour", "status": "pending",
          "decision_type": "color", "created_at": "2026-09-01T00:00:00Z" }
        """.utf8))
        #expect(row.kindChipLabel == "Color")

        let unkinded = try JSONDecoder().decode(RemoteClientDecision.self, from: Data("""
        { "id": "d-2", "status": "pending", "created_at": "2026-09-01T00:00:00Z" }
        """.utf8))
        #expect(unkinded.kindChipLabel == nil)
    }

    @Test("an untitled row is called an approval or a choice, never a decision")
    func theUntitledRowIsNamedForItsAsk() throws {
        #expect(try ProjectApprovalFixture.decision().untitledRowTitle == "An approval")

        let choice = try JSONDecoder().decode(RemoteClientDecision.self, from: Data("""
        { "id": "d-1", "status": "pending", "decision_type": "product",
          "created_at": "2026-09-01T00:00:00Z" }
        """.utf8))
        #expect(choice.untitledRowTitle == "A choice")

        let list = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Decisions/Views/DecisionListView.swift")
        )
        #expect(!list.contains("?? \"Decision\""),
                "the list still calls an untitled approval a decision")
        #expect(list.contains("decision.untitledRowTitle"))
        #expect(list.contains("d.kindChipLabel"))
    }

    // MARK: - `IOSC-R3-01` · no red on a passed date

    /// The Wave-1-close ruling is every surface: "a passed date is a fact, not
    /// an alarm." The invoice rail obeyed it; the two proposal surfaces were
    /// never moved, so an expired proposal drew a quiet EXPIRED stamp near the
    /// header and a red status word in the investment card below it.
    @Test("no proposal surface paints a passed date red")
    func theProposalRailCarriesNoRed() throws {
        for file in ["Patina/Features/Proposals/Views/ProposalListView.swift",
                     "Patina/Features/Proposals/Views/ProposalDetailView.swift"] {
            let code = SourceScan.code(in: try SourcePin.read(file))
            #expect(!code.contains("isPastDue ? PatinaColors.Text.error"),
                    "\((file as NSString).lastPathComponent) still paints a passed date red")
            #expect(code.contains("isPastDue ? PatinaColors.Text.primary"),
                    "\((file as NSString).lastPathComponent) lost the body-ink branch")
        }
    }
}
