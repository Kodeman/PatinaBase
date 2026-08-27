//
//  ProposalsMoneyRailTests.swift
//  PatinaTests
//
//  Pins ProposalsAPIClient's client-safe RPC DTOs, immutable product snapshot
//  fallbacks, raw-table read prohibition, sign guard, and route names.
//

import Testing
import Foundation
@testable import Patina

struct ProposalsMoneyRailTests {

    private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
        try JSONDecoder().decode(T.self, from: Data(json.utf8))
    }

    // MARK: - Proposal decode + signability

    @Test
    func decodesSentProposalAndIsSignable() throws {
        let json = """
        {
          "id": "prop-1", "project_id": "proj-1", "designer_id": "des-1",
          "client_id": "cli-1", "title": "Living Room Refresh",
          "description": "A cozy update", "project_address": "123 Main",
          "client_visibility_tier": "full", "total_amount": 1250000,
          "payment_terms": "50% deposit", "payment_notes": null,
          "status": "sent", "valid_until": "2099-01-01T00:00:00Z",
          "sent_at": "2026-07-01T00:00:00Z", "viewed_at": null,
          "responded_at": null, "created_at": "2026-06-01T00:00:00Z",
          "updated_at": "2026-07-01T00:00:00Z", "version": 1,
          "signed_at": null, "signed_by_name": null, "accepted_at": null,
          "declined_at": null, "decline_reason": null,
          "project": { "id": "proj-1", "name": "Downtown Loft" },
          "payment_milestones": [
            { "id": "m1", "label": "Deposit", "percentage": 50,
              "amount_cents": 625000, "sort_order": 0 }
          ]
        }
        """
        let proposal = try decode(RemoteProposal.self, json)
        #expect(proposal.title == "Living Room Refresh")
        #expect(proposal.total_amount == 1_250_000)
        #expect(proposal.project?.name == "Downtown Loft")
        #expect(proposal.payment_milestones?.first?.amount_cents == 625_000)
        #expect(proposal.isSignable)
        #expect(!proposal.isSigned)
    }

    @Test
    func acceptedProposalIsSignedAndNotSignable() throws {
        let json = """
        { "id": "p", "status": "accepted", "signed_by_name": "Kody",
          "signed_at": "2026-07-02T00:00:00Z" }
        """
        let proposal = try decode(RemoteProposal.self, json)
        #expect(proposal.isSigned)
        #expect(!proposal.isSignable)
    }

    @Test
    func expiredProposalIsNotSignable() throws {
        let json = """
        { "id": "p", "status": "sent", "valid_until": "2000-01-01T00:00:00Z" }
        """
        let proposal = try decode(RemoteProposal.self, json)
        #expect(!proposal.isSignable)
    }

    // MARK: - Immutable product snapshot fallback

    @Test
    func itemFallsBackToLinkedProduct() throws {
        let json = """
        {
          "id": "i1", "proposal_id": "prop-1", "product_id": "pr1",
          "name": null, "description": null, "image_url": null,
          "category": null, "quantity": 2, "unit_sell_price": 50000,
          "line_total_cents": 100000, "vendor_name": null,
          "item_type": "fixed", "lead_time_weeks": 6, "position": 0,
          "client_product_snapshot": {
            "product_id": "pr1", "name": "Oak Chair",
            "images": ["https://x.test/a.jpg"], "brand": "Acme"
          }
        }
        """
        let item = try decode(RemoteProposalItem.self, json)
        #expect(item.resolvedName == "Oak Chair")
        #expect(item.resolvedVendor == "Acme")
        #expect(item.resolvedImageURL?.absoluteString == "https://x.test/a.jpg")
    }

    @Test
    func itemPrefersManualFieldsOverProduct() throws {
        let json = """
        {
          "id": "i2", "name": "Custom Sofa", "image_url": "https://x.test/s.jpg",
          "vendor_name": "Studio", "quantity": 1, "line_total_cents": 200000,
          "client_product_snapshot": {
            "product_id": "p", "name": "Generic Sofa",
            "images": ["https://x.test/g.jpg"], "brand": "Other"
          }
        }
        """
        let item = try decode(RemoteProposalItem.self, json)
        #expect(item.resolvedName == "Custom Sofa")
        #expect(item.resolvedVendor == "Studio")
        #expect(item.resolvedImageURL?.absoluteString == "https://x.test/s.jpg")
    }

    // MARK: - Board thumbnail derivation

    @Test
    func boardThumbnailsAreImageItemsOrderedByZIndex() throws {
        let json = """
        {
          "id": "b1", "name": "Palette", "cover_image_url": null, "sort_order": 0,
          "items": [
            { "type": "image", "image_url": "https://x.test/2.jpg", "z_index": 2 },
            { "type": "image", "image_url": "https://x.test/1.jpg", "z_index": 1 },
            { "type": "note", "image_url": null, "z_index": 0 }
          ]
        }
        """
        let board = try decode(RemoteProposalBoard.self, json)
        #expect(board.itemCount == 3)
        #expect(board.thumbnailURLs.map(\.absoluteString) == ["https://x.test/1.jpg", "https://x.test/2.jpg"])
    }

    @Test
    func boardCoverLeadsTheThumbnails() throws {
        let json = """
        {
          "id": "b2", "name": "Cover", "cover_image_url": "https://x.test/cover.jpg", "sort_order": 0,
          "items": [
            { "type": "image", "image_url": "https://x.test/1.jpg", "z_index": 1 }
          ]
        }
        """
        let board = try decode(RemoteProposalBoard.self, json)
        #expect(board.thumbnailURLs.first?.absoluteString == "https://x.test/cover.jpg")
    }

    // MARK: - Child-table decode (scope-builder parity)

    @Test
    func decodesMilestoneWithCentsAndPercentage() throws {
        let json = """
        { "id": "m1", "label": "Deposit", "percentage": 50, "amount_cents": 625000,
          "trigger_condition": "On signing", "sort_order": 0 }
        """
        let milestone = try decode(RemoteProposalMilestone.self, json)
        #expect(milestone.label == "Deposit")
        #expect(milestone.amount_cents == 625_000)
        #expect(milestone.percentage == 50)
    }

    @Test
    func decodesAtomicClientSafeBundle() throws {
        let json = """
        {
          "proposal": {
            "id": "prop-1", "project_id": "proj-1", "status": "viewed",
            "client_visibility_tier": "full",
            "project": { "id": "proj-1", "name": "Downtown Loft" },
            "items": [{
              "id": "i1", "proposal_id": "prop-1", "name": "Oak Chair",
              "quantity": 1, "unit_sell_price": 50000,
              "line_total_cents": 50000, "position": 0,
              "client_product_snapshot": {
                "product_id": "pr1", "name": "Oak Chair",
                "images": ["https://x.test/chair.jpg"]
              }
            }]
          },
          "sections": [{
            "id": "s1", "proposal_id": "prop-1", "type": "overview",
            "title": "Overview", "body": "A calm room", "sort_order": 0
          }],
          "payment_milestones": [{
            "id": "m1", "proposal_id": "prop-1", "label": "Deposit",
            "percentage": 50, "amount_cents": 25000, "sort_order": 0
          }],
          "phases": [{
            "id": "ph1", "proposal_id": "prop-1", "name": "Design",
            "duration_weeks": 4, "sort_order": 0
          }],
          "exclusions": [],
          "scope_rooms": [{
            "id": "r1", "proposal_id": "prop-1", "name": "Living Room",
            "room_type": "living_room", "budget_cents": 50000, "sort_order": 0
          }],
          "boards": [{
            "id": "b1", "name": "Palette", "sort_order": 0,
            "cover_image_url": "https://x.test/cover.jpg", "items": [{
              "id": "bi1", "type": "image", "image_url": "https://x.test/chair.jpg",
              "z_index": 1
            }]
          }]
        }
        """
        let bundle = try decode(RemoteProposalBundle.self, json)
        #expect(bundle.proposal.status == "viewed")
        #expect(bundle.proposal.project?.name == "Downtown Loft")
        #expect(bundle.proposal.items?.first?.resolvedName == "Oak Chair")
        #expect(bundle.payment_milestones.first?.amount_cents == 25_000)
        #expect(bundle.boards.first?.thumbnailURLs.map(\.absoluteString) == [
            "https://x.test/cover.jpg", "https://x.test/chair.jpg"
        ])
    }

    // MARK: - Client-safe read boundary

    @Test("proposal reads use only the client-safe RPC boundary")
    func proposalReadsNeverReturnToRawTables() throws {
        let sourceURL = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // PatinaTests
            .deletingLastPathComponent() // Patina project directory
            .appendingPathComponent("Patina/Services/API/ProposalsAPIClient.swift")
        let source = try String(contentsOf: sourceURL, encoding: .utf8)
        #expect(source.contains("static let listReadRPC = \"list_client_proposals\""))
        #expect(source.contains("static let detailReadRPC = \"get_client_proposal_bundle\""))

        let uncommented = source.split(separator: "\n")
            .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") }
            .joined(separator: "\n")
        let authoredRelations = [
            "proposals", "proposal_items", "proposal_sections", "proposal_phases",
            "proposal_payment_milestones", "proposal_exclusions", "proposal_scope_rooms",
            "proposal_boards", "proposal_board_items", "products"
        ]
        for relation in authoredRelations {
            #expect(!uncommented.contains(".from(\"\(relation)\")"),
                    "raw client proposal read returned for \(relation)")
        }
    }

    // MARK: - Sign guard + error mapping

    @Test
    func signRejectsShortNameBeforeAnyNetworkCall() async {
        await #expect(throws: ProposalSignError.self) {
            try await ProposalsAPIClient().signProposal(proposalId: "prop-1", signedName: " a ")
        }
    }

    @Test
    func signErrorMapsGuardMessages() {
        func mapped(_ message: String) -> ProposalSignError {
            ProposalSignError.map(NSError(
                domain: "test", code: 1,
                userInfo: [NSLocalizedDescriptionKey: message]
            ))
        }
        if case .expired = mapped("proposal x has expired") {} else { Issue.record("expected .expired") }
        if case .notSignable = mapped("proposal x is not in a signable status (accepted)") {} else {
            Issue.record("expected .notSignable")
        }
        if case .nameTooShort = mapped("a signature name of at least 2 characters is required") {} else {
            Issue.record("expected .nameTooShort")
        }
        if case .notOwner = mapped("proposal x may only be signed by its client") {} else {
            Issue.record("expected .notOwner")
        }
        if case .generic = mapped("some other database error") {} else { Issue.record("expected .generic") }
    }

    // MARK: - SP-04 · accepted is not signed

    @Test("an accepted proposal with no signature record is called Accepted, never Signed")
    func acceptedWithoutSignatureIsNotCalledSigned() throws {
        let json = """
        { "id": "p-1", "status": "accepted", "title": "Sample accepted proposal",
          "total_amount": 10000000, "signed_at": null, "signed_by_name": null,
          "accepted_at": "2026-07-04T10:00:00Z", "created_at": "2026-07-01T00:00:00Z" }
        """
        let proposal = try decode(RemoteProposal.self, json)
        #expect(!proposal.hasSignatureRecord)
        #expect(ProposalStatusDisplay.rowLabel(proposal) == "Accepted")
        #expect(ProposalStatusDisplay.acceptedSectionTitle == "Accepted")
        #expect(ProposalStatusDisplay.detailStatusLine(proposal, justSigned: false)
                == "Accepted on Jul 4, 2026")
    }

    @Test("a proposal carrying a signature record is called Signed")
    func signedProposalIsCalledSigned() throws {
        let json = """
        { "id": "p-2", "status": "accepted", "signed_at": "2026-07-04T10:00:00Z",
          "signed_by_name": "Ruth Alvarez", "created_at": "2026-07-01T00:00:00Z" }
        """
        let proposal = try decode(RemoteProposal.self, json)
        #expect(proposal.hasSignatureRecord)
        #expect(ProposalStatusDisplay.rowLabel(proposal) == "Signed")
        #expect(ProposalStatusDisplay.detailStatusLine(proposal, justSigned: false)
                == "Signed by Ruth Alvarez on Jul 4, 2026")
    }

    @Test("the list section is titled for the status the server set")
    func proposalListSectionTitleIsAccepted() throws {
        let source = try String(
            contentsOf: Self.sourceURL("Patina/Features/Proposals/Views/ProposalListView.swift"),
            encoding: .utf8
        )
        #expect(source.contains("ProposalStatusDisplay.acceptedSectionTitle"))
        #expect(!source.contains("section(\"Signed\""))
    }

    static func sourceURL(_ relativePath: String) -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // PatinaTests
            .deletingLastPathComponent() // apps/mobile/Patina
            .appendingPathComponent(relativePath)
    }

    // MARK: - Route names

    @Test
    func proposalRouteNames() {
        #expect(AppRoute.proposalList.displayName == "Proposals")
        #expect(AppRoute.proposalDetail(proposalId: "p").displayName == "Proposal")
    }
}
