//
//  ProposalDetailStatusIconTests.swift
//  PatinaTests
//
//  Pins rulings-fable.md #6, carried forward through `P-17`'s stamp swap.
//
//  The ruling has not changed and the four cases below are the four this file
//  has always held: `RemoteProposal.isSigned` is `status == "accepted"` — it
//  does not check `signed_at` — so an accepted-but-unsigned proposal must not
//  wear the mark a genuinely signed one wears.
//
//  What changed is the mark. `checkmark.seal.fill` / `checkmark.circle` in
//  sage were a glyph carrying a state and a green mark on the most
//  consequential state in the product; both retire into
//  `ProposalStatusDisplay.stampState`, the eleven-state grammar. The weaker
//  glyph has no successor: the honest answer for accepted-but-unsigned is NO
//  mark, because SIGNED and SIGNED / ON PAPER are the only marks that shape
//  could take and neither is true.
//
//  The two filled `PatinaStatusBadge`s the header drew under an unsignable
//  proposal are pinned here too, for the same reason: a tinted fill standing
//  in for a state is the thing the stamp replaces.
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
    func acceptedWithoutSignatureCarriesNoMarkAtAll() throws {
        let proposal = try decode("""
        { "id": "p", "status": "accepted", "signed_by_name": null, "signed_at": null }
        """)
        #expect(
            ProposalStatusDisplay.stampState(for: proposal, justSigned: false) == nil,
            "an accepted-but-unsigned proposal was stamped — SP-04's whole subject"
        )
        // The words are unchanged and still carry the state on their own.
        #expect(ProposalStatusDisplay.detailStatusLine(proposal, justSigned: false) == "Accepted")
    }

    @Test
    func acceptedWithSignatureRecordIsStampedSigned() throws {
        let proposal = try decode("""
        { "id": "p", "status": "accepted", "signed_by_name": "Kody",
          "signed_at": "2026-07-02T00:00:00Z" }
        """)
        let stamp = try #require(
            ProposalStatusDisplay.stampState(for: proposal, justSigned: false)
        )
        #expect(stamp == .signed)
        // `R13`: mocha, never sage. The green mark is what this swap retires.
        #expect(stamp.word == "SIGNED")
        #expect(stamp.borderPigment == .mocha)
        #expect(stamp.wordPigment == .mocha)
    }

    @Test
    func justSignedThisSessionIsStampedBeforeTheServerRecordArrives() throws {
        // `didSign` is the client's own signature landing in this session,
        // before the server's `signed_at` has round-tripped back.
        let proposal = try decode("""
        { "id": "p", "status": "accepted", "signed_by_name": null, "signed_at": null }
        """)
        #expect(ProposalStatusDisplay.stampState(for: proposal, justSigned: true) == .signed)
    }

    @Test
    func aLiveProposalAwaitingHerNameIsNotStamped() throws {
        // Not in the accepted family at all, and still signable — nothing has
        // happened to it, so nothing marks it.
        let proposal = try decode("""
        { "id": "p", "status": "sent", "signed_by_name": null, "signed_at": null }
        """)
        #expect(ProposalStatusDisplay.stampState(for: proposal, justSigned: false) == nil)
    }

    /// The two filled badges retire into the muted and the terracotta marks.
    /// `DECLINED` is the one terracotta in the whole grammar and it has no
    /// sage counterpart anywhere, so no traffic-light reading is available.
    @Test
    func theExpiredAndDeclinedBadgesBecomeStamps() throws {
        let expired = try decode("""
        { "id": "p", "status": "expired", "signed_by_name": null, "signed_at": null }
        """)
        #expect(ProposalStatusDisplay.stampState(for: expired, justSigned: false) == .expired)

        let declined = try decode("""
        { "id": "p", "status": "declined", "signed_by_name": null, "signed_at": null }
        """)
        let stamp = try #require(
            ProposalStatusDisplay.stampState(for: declined, justSigned: false)
        )
        #expect(stamp == .declined)
        #expect(stamp.borderPigment == .terracotta)
    }

    /// The glyphs and the sage are gone from the file, not merely unused by
    /// the pure function.
    @Test
    func noSealGlyphAndNoSageSurviveOnTheProposalHeader() throws {
        let source = try SourcePin.readCode(
            "Patina/Features/Proposals/Views/ProposalDetailView.swift"
        )
        for banned in ["checkmark.seal.fill", "checkmark.circle",
                       "PatinaColors.sage", "PatinaStatusBadge"] {
            #expect(!source.contains(banned), "ProposalDetailView still draws \(banned)")
        }
        #expect(source.contains("PatinaStamp("))
    }
}
