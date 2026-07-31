//  ProjectPlacementTests.swift
//  CaptureTests

import Foundation
import Testing
@testable import CaptureKit

struct ProjectPlacementTests {
    private let projectID = UUID(uuidString: "11111111-1111-4111-8111-111111111111")!
    private let productID = UUID(uuidString: "22222222-2222-4222-8222-222222222222")!
    private let roomID = UUID(uuidString: "33333333-3333-4333-8333-333333333333")!
    private let slotID = UUID(uuidString: "44444444-4444-4444-8444-444444444444")!

    @Test func rpcPayloadUsesExactPlaceProductArgumentKeys() throws {
        let request = ProjectPlacementRequest(
            projectID: projectID,
            productID: productID,
            roomID: roomID,
            slotID: slotID,
            category: "seating",
            source: ["client": "field-ios", "captureId": "capture-a"]
        )

        let data = try JSONEncoder().encode(request)
        let json = try #require(
            JSONSerialization.jsonObject(with: data) as? [String: Any])

        #expect(json["p_project_id"] as? String == projectID.uuidString)
        #expect(json["p_product_id"] as? String == productID.uuidString)
        #expect(json["p_room_id"] as? String == roomID.uuidString)
        #expect(json["p_slot_id"] as? String == slotID.uuidString)
        #expect(json["p_category"] as? String == "seating")
        let source = try #require(json["p_source"] as? [String: String])
        #expect(source["client"] == "field-ios")
        #expect(source["captureId"] == "capture-a")
        #expect(json.count == 6)
    }

    @Test func responseLossRetryFindsExistingPlacementBeforeWritingAgain() async throws {
        let receipt = makeReceipt(ffeItemID: slotID, placement: "filled_slot")
        let gateway = ResponseLossGateway(receipt: receipt)
        let orchestrator = ProjectPlacementOrchestrator(gateway: gateway)
        let request = makeRequest(captureID: "capture-retry", slotID: slotID)

        await #expect(throws: PlacementTestError.responseLost) {
            try await orchestrator.place(request)
        }
        let replay = try await orchestrator.place(request)

        #expect(replay == receipt)
        #expect(await gateway.calls == ["lookup", "place", "lookup"])
        #expect(await gateway.placeCount == 1)
    }

    @Test func duplicateProductCanCreateDistinctProjectSelections() async throws {
        let gateway = DistinctLineGateway(projectID: projectID)
        let orchestrator = ProjectPlacementOrchestrator(gateway: gateway)

        let first = try await orchestrator.place(
            makeRequest(captureID: "capture-one", slotID: nil))
        let second = try await orchestrator.place(
            makeRequest(captureID: "capture-two", slotID: nil))

        #expect(first.productID == productID)
        #expect(second.productID == productID)
        #expect(first.ffeItemID != second.ffeItemID)
        #expect(await gateway.placeCount == 2)
    }

    @Test @MainActor
    func placementFailurePreservesCaptureAndProductThenRetriesHonestly() throws {
        let store = try CaptureStore.inMemory()
        let specimen = store.newDraft()
        let captureID = UUID()
        specimen.applyTransferState(CaptureTransferState(
            phase: .complete,
            progress: 100,
            receiptID: captureID.uuidString))
        specimen.committedProductId = productID.uuidString
        specimen.configureProjectPlacement(
            projectID: projectID.uuidString,
            roomID: roomID.uuidString,
            slotID: nil,
            category: "seating")
        specimen.markProjectPlacementFailed("Network unavailable")
        try store.save()

        #expect(specimen.status == .committed)
        #expect(specimen.remoteId == captureID.uuidString)
        #expect(specimen.committedProductId == productID.uuidString)
        #expect(specimen.transferState.phase == .retryableFailure)
        #expect(specimen.placementRetryCount == 1)
        #expect(store.outbox().map(\.id) == [specimen.id])

        specimen.markProjectPlacementStarted()
        specimen.applyProjectPlacementReceipt(
            makeReceipt(ffeItemID: UUID(), placement: "created_line"))
        try store.save()

        #expect(specimen.status == .committed)
        #expect(specimen.remoteId == captureID.uuidString)
        #expect(specimen.committedProductId == productID.uuidString)
        #expect(specimen.transferState.phase == .complete)
        #expect(store.outbox().isEmpty)
    }

    private func makeRequest(
        captureID: String,
        slotID: UUID?
    ) -> ProjectPlacementRequest {
        ProjectPlacementRequest(
            projectID: projectID,
            productID: productID,
            roomID: roomID,
            slotID: slotID,
            category: "seating",
            source: ["client": "field-ios", "captureId": captureID]
        )
    }

    private func makeReceipt(
        ffeItemID: UUID,
        placement: String
    ) -> ProjectPlacementReceipt {
        ProjectPlacementReceipt(
            projectID: projectID,
            ffeItemID: ffeItemID,
            specID: UUID(),
            productID: productID,
            roomID: roomID,
            placement: placement
        )
    }
}

private enum PlacementTestError: Error {
    case responseLost
}

private actor ResponseLossGateway: ProjectPlacementGateway {
    private let receipt: ProjectPlacementReceipt
    private var storedReceipt: ProjectPlacementReceipt?
    private(set) var calls: [String] = []
    private(set) var placeCount = 0

    init(receipt: ProjectPlacementReceipt) {
        self.receipt = receipt
    }

    func existingPlacement(
        for request: ProjectPlacementRequest
    ) async throws -> ProjectPlacementReceipt? {
        calls.append("lookup")
        return storedReceipt
    }

    func placeProduct(
        _ request: ProjectPlacementRequest
    ) async throws -> ProjectPlacementReceipt {
        calls.append("place")
        placeCount += 1
        // Simulate a committed RPC whose response is lost in transit.
        storedReceipt = receipt
        throw PlacementTestError.responseLost
    }
}

private actor DistinctLineGateway: ProjectPlacementGateway {
    private let projectID: UUID
    private(set) var placeCount = 0

    init(projectID: UUID) {
        self.projectID = projectID
    }

    func existingPlacement(
        for request: ProjectPlacementRequest
    ) async throws -> ProjectPlacementReceipt? {
        nil
    }

    func placeProduct(
        _ request: ProjectPlacementRequest
    ) async throws -> ProjectPlacementReceipt {
        placeCount += 1
        return ProjectPlacementReceipt(
            projectID: projectID,
            ffeItemID: UUID(),
            specID: UUID(),
            productID: request.productID,
            roomID: request.roomID,
            placement: "created_line"
        )
    }
}
