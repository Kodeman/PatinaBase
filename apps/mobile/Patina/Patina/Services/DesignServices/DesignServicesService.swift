//
//  DesignServicesService.swift
//  Patina
//
//  Service for requesting design services from professionals.
//  Submits requests to the leads table for designer matching.
//

import Foundation
import Combine
import Supabase

// MARK: - Design Service Types

/// Types of design services available
public enum DesignServiceType: String, CaseIterable, Codable {
    case consultation = "consultation"
    case fullRedesign = "full_room"
    case furniturePlacement = "single_piece"
    case styling = "staging"

    public var displayName: String {
        switch self {
        case .consultation: return "Design Consultation"
        case .fullRedesign: return "Full Room Redesign"
        case .furniturePlacement: return "Furniture Placement"
        case .styling: return "Styling & Staging"
        }
    }

    public var description: String {
        switch self {
        case .consultation:
            return "Get expert advice on your space and style direction"
        case .fullRedesign:
            return "Complete room transformation with furniture and decor"
        case .furniturePlacement:
            return "Help selecting and placing the perfect piece"
        case .styling:
            return "Finishing touches to complete your space"
        }
    }

    public var icon: String {
        switch self {
        case .consultation: return "bubble.left.and.text.bubble.right"
        case .fullRedesign: return "square.grid.2x2"
        case .furniturePlacement: return "chair.lounge"
        case .styling: return "sparkles"
        }
    }
}

/// Timeline preferences for design projects
public enum DesignTimeline: String, CaseIterable, Codable {
    case asap = "asap"
    case oneToThreeMonths = "1_3_months"
    case threeToSixMonths = "3_6_months"
    case flexible = "flexible"

    public var displayName: String {
        switch self {
        case .asap: return "As soon as possible"
        case .oneToThreeMonths: return "1-3 months"
        case .threeToSixMonths: return "3-6 months"
        case .flexible: return "Flexible"
        }
    }
}

/// Budget ranges for design projects
public enum DesignBudget: String, CaseIterable, Codable {
    case under5k = "under_5k"
    case fiveToFifteen = "5k_15k"
    case fifteenToFifty = "15k_50k"
    case fiftyToHundred = "50k_100k"
    case overHundred = "over_100k"

    public var displayName: String {
        switch self {
        case .under5k: return "Under $5,000"
        case .fiveToFifteen: return "$5,000 - $15,000"
        case .fifteenToFifty: return "$15,000 - $50,000"
        case .fiftyToHundred: return "$50,000 - $100,000"
        case .overHundred: return "Over $100,000"
        }
    }
}

// MARK: - Design Request

/// A request for design services
public struct DesignServiceRequest: Codable {
    public let serviceType: DesignServiceType
    public let timeline: DesignTimeline
    public let budget: DesignBudget
    public let description: String
    public let roomId: UUID?

    public init(
        serviceType: DesignServiceType,
        timeline: DesignTimeline,
        budget: DesignBudget,
        description: String,
        roomId: UUID?
    ) {
        self.serviceType = serviceType
        self.timeline = timeline
        self.budget = budget
        self.description = description
        self.roomId = roomId
    }
}

/// Insert structure for leads table
struct LeadInsert: Encodable {
    let homeowner_id: String
    let project_type: String
    let budget_range: String
    let timeline: String
    let project_description: String
    let room_scan_id: String?
    let status: String
}

// MARK: - Errors

public enum DesignServicesError: Error, LocalizedError {
    case notAuthenticated
    case invalidRequest(String)
    case networkError(Error)
    case submissionFailed

    public var errorDescription: String? {
        switch self {
        case .notAuthenticated:
            return "Please sign in to request design services"
        case .invalidRequest(let message):
            return message
        case .networkError(let error):
            return "Network error: \(error.localizedDescription)"
        case .submissionFailed:
            return "Failed to submit your request. Please try again."
        }
    }
}

// MARK: - Service

/// Service for submitting design service requests
@MainActor
public final class DesignServicesService: ObservableObject {
    public static let shared = DesignServicesService()

    // MARK: - Published State

    @Published public private(set) var isLoading = false
    @Published public private(set) var lastError: DesignServicesError?
    @Published public private(set) var lastSubmittedRequest: DesignServiceRequest?

    // MARK: - Initialization

    private init() {}

    // MARK: - Public Methods

    /// Submit a design service request
    /// This creates a lead in the system for designer matching
    @discardableResult
    public func submitRequest(_ request: DesignServiceRequest) async throws -> Bool {
        isLoading = true
        lastError = nil
        defer { isLoading = false }

        // Validate request
        guard !request.description.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            let error = DesignServicesError.invalidRequest("Please describe what you're looking for")
            lastError = error
            throw error
        }

        // Get current user
        guard let userId = await getCurrentUserId() else {
            let error = DesignServicesError.notAuthenticated
            lastError = error
            throw error
        }

        let lead = LeadInsert(
            homeowner_id: userId.uuidString,
            project_type: request.serviceType.rawValue,
            budget_range: request.budget.rawValue,
            timeline: request.timeline.rawValue,
            project_description: request.description,
            room_scan_id: request.roomId?.uuidString,
            status: "new"
        )

        do {
            try await supabase.database
                .from("leads")
                .insert(lead)
                .execute()

            lastSubmittedRequest = request
            return true
        } catch {
            let serviceError = DesignServicesError.networkError(error)
            lastError = serviceError
            throw serviceError
        }
    }

    /// Clear the last submitted request (e.g., when dismissing confirmation)
    public func clearLastRequest() {
        lastSubmittedRequest = nil
    }

    // MARK: - Private Methods

    private func getCurrentUserId() async -> UUID? {
        do {
            let session = try await supabase.auth.session
            return session.user.id
        } catch {
            return nil
        }
    }
}
