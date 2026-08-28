//
//  ProposalDetailStatusIconTests.swift
//  PatinaTests
//
//  Pins rulings-fable.md #6: `checkmark.seal.fill` is reserved for a
//  proposal that carries a signature record. `RemoteProposal.isSigned`
//  (ProposalsAPIClient.swift) is `status == "accepted"` — it does not check
//  `signed_at` — so an accepted-but-unsigned proposal must not wear the
//  seal glyph the same way a genuinely signed one does. A new file: the
//  existing `ProposalsMoneyRailTests.swift` is lane B's to keep green for
//  the duration of W2 (steward.md §8a), so this pin does not touch it.
//

import Testing
import Foundation
@testable import Patina

@MainActor
struct ProposalDetailStatusIconTests {
    private func decode(_ json: String) throws -> RemoteProposal {
        try JSONDecoder().decode(RemoteProposal.self, from: Data(json.utf8))
    }

    @Test
    func acceptedWithoutSignatureShowsTheCircleNotTheSeal() throws {
        let proposal = try decode("""
        { "id": "p", "status": "accepted", "signed_by_name": null, "signed_at": null }
        """)
        #expect(ProposalDetailView.statusIcon(for: proposal, justSigned: false) == "checkmark.circle")
    }

    @Test
    func acceptedWithSignatureRecordKeepsTheSeal() throws {
        let proposal = try decode("""
        { "id": "p", "status": "accepted", "signed_by_name": "Kody",
          "signed_at": "2026-07-02T00:00:00Z" }
        """)
        #expect(ProposalDetailView.statusIcon(for: proposal, justSigned: false) == "checkmark.seal.fill")
    }

    @Test
    func justSignedThisSessionShowsTheSealBeforeTheServerRecordArrives() throws {
        // `didSign` is the client's own signature landing in this session,
        // before the server's `signed_at` has round-tripped back.
        let proposal = try decode("""
        { "id": "p", "status": "accepted", "signed_by_name": null, "signed_at": null }
        """)
        #expect(ProposalDetailView.statusIcon(for: proposal, justSigned: true) == "checkmark.seal.fill")
    }

    @Test
    func sentProposalIsUnaffected() throws {
        // Not in the "accepted family" branch at all in the view, but pin
        // the pure function's behavior for a non-accepted status too — it
        // must never claim a signature for a proposal that was never signed.
        let proposal = try decode("""
        { "id": "p", "status": "sent", "signed_by_name": null, "signed_at": null }
        """)
        #expect(ProposalDetailView.statusIcon(for: proposal, justSigned: false) == "checkmark.circle")
    }
}
