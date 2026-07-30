//  ProjectPlacement.swift
//  CaptureKit
//
//  Pure-Swift contract for routing a committed field Product into a project's
//  live FF&E schedule. The app-side Supabase gateway owns SDK calls; this file
//  owns the deterministic RPC envelope and retry/idempotency orchestration.

import Foundation

public enum ProjectPlacementState: String, Codable, Sendable {
    case pending
    case placing
    case placed
    case failed
}

public struct ProjectPlacementRequest: Encodable, Equatable, Sendable {
    public let projectID: UUID
    public let productID: UUID
    public let roomID: UUID?
    public let slotID: UUID?
    public let category: String?
    public let source: [String: String]

    public init(
        projectID: UUID,
        productID: UUID,
        roomID: UUID? = nil,
        slotID: UUID? = nil,
        category: String? = nil,
        source: [String: String]
    ) {
        self.projectID = projectID
        self.productID = productID
        self.roomID = roomID
        self.slotID = slotID
        self.category = category
        self.source = source
    }

    public var captureRoutingKey: String? {
        source["captureId"]?.trimmingCharacters(in: .whitespacesAndNewlines)
            .nilIfEmpty
    }

    enum CodingKeys: String, CodingKey {
        case projectID = "p_project_id"
        case productID = "p_product_id"
        case roomID = "p_room_id"
        case slotID = "p_slot_id"
        case category = "p_category"
        case source = "p_source"
    }
}

public struct ProjectPlacementReceipt: Decodable, Equatable, Sendable {
    public let projectID: UUID
    public let ffeItemID: UUID
    public let specID: UUID
    public let productID: UUID
    public let roomID: UUID?
    public let placement: String

    public init(
        projectID: UUID,
        ffeItemID: UUID,
        specID: UUID,
        productID: UUID,
        roomID: UUID?,
        placement: String
    ) {
        self.projectID = projectID
        self.ffeItemID = ffeItemID
        self.specID = specID
        self.productID = productID
        self.roomID = roomID
        self.placement = placement
    }

    enum CodingKeys: String, CodingKey {
        case projectID = "projectId"
        case ffeItemID = "ffeItemId"
        case specID = "specId"
        case productID = "productId"
        case roomID = "roomId"
        case placement
    }
}

public protocol ProjectPlacementGateway: Sendable {
    /// Returns a prior placement carrying the same stable capture routing key.
    /// This closes the response-loss gap for create-line retries.
    func existingPlacement(
        for request: ProjectPlacementRequest
    ) async throws -> ProjectPlacementReceipt?

    func placeProduct(
        _ request: ProjectPlacementRequest
    ) async throws -> ProjectPlacementReceipt
}

public struct ProjectPlacementOrchestrator: Sendable {
    private let gateway: any ProjectPlacementGateway

    public init(gateway: any ProjectPlacementGateway) {
        self.gateway = gateway
    }

    /// Lookup-before-write makes a replay safe even when the original RPC
    /// committed but its response never reached the device.
    public func place(
        _ request: ProjectPlacementRequest
    ) async throws -> ProjectPlacementReceipt {
        if let existing = try await gateway.existingPlacement(for: request) {
            return existing
        }
        return try await gateway.placeProduct(request)
    }
}

private extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }
}
