//
//  ScanSharingService.swift
//  Patina
//
//  Service for sharing room scans with designers.
//  Handles association creation, listing, and revocation.
//

import Foundation
import Combine
import Supabase

/// Access level for shared room scans
public enum ScanAccessLevel: String, Codable, CaseIterable {
    case full = "full"                   // Full 3D model access
    case preview = "preview"             // Thumbnail and basic info only
    case measurementsOnly = "measurements_only" // Dimensions and measurements

    public var displayName: String {
        switch self {
        case .full: return "Full Access"
        case .preview: return "Preview Only"
        case .measurementsOnly: return "Measurements Only"
        }
    }

    public var description: String {
        switch self {
        case .full: return "Designer can view full 3D model, add annotations, and take measurements"
        case .preview: return "Designer can see thumbnail and basic room info"
        case .measurementsOnly: return "Designer can see dimensions and measurements only"
        }
    }
}

/// Association status
public enum AssociationStatus: String, Codable {
    case pending = "pending"
    case active = "active"
    case revoked = "revoked"
    case expired = "expired"
}

/// A room scan association with a designer
public struct RoomScanAssociation: Identifiable, Codable {
    public let id: UUID
    public let scanId: UUID
    public let consumerId: UUID
    public let designerId: UUID
    public let associationType: String
    public let status: String
    public let accessLevel: String
    public let expiresAt: String?
    public let sharedAt: String?
    public let revokedAt: String?
    public let createdAt: String

    // Joined designer info
    public let designer: DesignerInfo?

    public struct DesignerInfo: Codable {
        public let id: UUID
        public let email: String
        public let fullName: String?
        public let avatarUrl: String?
        public let businessName: String?

        enum CodingKeys: String, CodingKey {
            case id
            case email
            case fullName = "full_name"
            case avatarUrl = "avatar_url"
            case businessName = "business_name"
        }
    }

    enum CodingKeys: String, CodingKey {
        case id
        case scanId = "scan_id"
        case consumerId = "consumer_id"
        case designerId = "designer_id"
        case associationType = "association_type"
        case status
        case accessLevel = "access_level"
        case expiresAt = "expires_at"
        case sharedAt = "shared_at"
        case revokedAt = "revoked_at"
        case createdAt = "created_at"
        case designer
    }
}

/// Insert structure for creating associations
struct RoomScanAssociationInsert: Encodable {
    let scan_id: UUID
    let consumer_id: UUID
    let designer_id: UUID
    let association_type: String
    let status: String
    let access_level: String
    let expires_at: String?
    let shared_at: String
}

/// Designer search result
public struct DesignerSearchResult: Identifiable, Codable {
    public let id: UUID
    public let email: String
    public let fullName: String?
    public let avatarUrl: String?
    public let businessName: String?

    enum CodingKeys: String, CodingKey {
        case id
        case email
        case fullName = "full_name"
        case avatarUrl = "avatar_url"
        case businessName = "business_name"
    }
}

/// Errors for scan sharing
public enum ScanSharingError: Error, LocalizedError {
    case notAuthenticated
    case scanNotFound
    case designerNotFound
    case alreadyShared
    case networkError(Error)
    case invalidOperation(String)

    public var errorDescription: String? {
        switch self {
        case .notAuthenticated:
            return "You must be signed in to share scans"
        case .scanNotFound:
            return "Room scan not found"
        case .designerNotFound:
            return "Designer not found"
        case .alreadyShared:
            return "This scan is already shared with this designer"
        case .networkError(let error):
            return "Network error: \(error.localizedDescription)"
        case .invalidOperation(let message):
            return message
        }
    }
}

/// Service for sharing room scans with designers
@MainActor
public final class ScanSharingService: ObservableObject {
    public static let shared = ScanSharingService()

    // MARK: - Published State

    @Published public private(set) var isLoading = false
    @Published public private(set) var lastError: ScanSharingError?

    // MARK: - Initialization

    private init() {}

    // MARK: - Public Methods

    /// Share a room scan with a designer
    /// - Parameters:
    ///   - scanId: The ID of the scan to share
    ///   - designerId: The ID of the designer to share with
    ///   - accessLevel: The level of access to grant
    ///   - expiresInDays: Optional expiration in days (nil = no expiration)
    /// - Returns: The created association
    @discardableResult
    public func shareScan(
        scanId: UUID,
        designerId: UUID,
        accessLevel: ScanAccessLevel = .full,
        expiresInDays: Int? = nil
    ) async throws -> RoomScanAssociation {
        isLoading = true
        lastError = nil
        defer { isLoading = false }

        // Get current user
        guard let userId = await getCurrentUserId() else {
            let error = ScanSharingError.notAuthenticated
            lastError = error
            throw error
        }

        // Calculate expiration if specified
        var expiresAt: String? = nil
        if let days = expiresInDays {
            let expireDate = Calendar.current.date(byAdding: .day, value: days, to: Date())!
            expiresAt = ISO8601DateFormatter().string(from: expireDate)
        }

        let insert = RoomScanAssociationInsert(
            scan_id: scanId,
            consumer_id: userId,
            designer_id: designerId,
            association_type: "explicit",
            status: "active",
            access_level: accessLevel.rawValue,
            expires_at: expiresAt,
            shared_at: ISO8601DateFormatter().string(from: Date())
        )

        do {
            let response: RoomScanAssociation = try await supabase.database
                .from("room_scan_associations")
                .insert(insert)
                .select("""
                    *,
                    designer:profiles!designer_id(
                        id,
                        email,
                        full_name,
                        avatar_url,
                        business_name
                    )
                """)
                .single()
                .execute()
                .value

            return response
        } catch {
            // Check for unique constraint violation
            if error.localizedDescription.contains("unique") ||
               error.localizedDescription.contains("duplicate") {
                let sharingError = ScanSharingError.alreadyShared
                lastError = sharingError
                throw sharingError
            }

            let sharingError = ScanSharingError.networkError(error)
            lastError = sharingError
            throw sharingError
        }
    }

    /// Get all associations for a specific scan
    public func getAssociationsForScan(scanId: UUID) async throws -> [RoomScanAssociation] {
        guard await getCurrentUserId() != nil else {
            throw ScanSharingError.notAuthenticated
        }

        do {
            let response: [RoomScanAssociation] = try await supabase.database
                .from("room_scan_associations")
                .select("""
                    *,
                    designer:profiles!designer_id(
                        id,
                        email,
                        full_name,
                        avatar_url,
                        business_name
                    )
                """)
                .eq("scan_id", value: scanId.uuidString)
                .neq("status", value: "revoked")
                .order("created_at", ascending: false)
                .execute()
                .value

            return response
        } catch {
            throw ScanSharingError.networkError(error)
        }
    }

    /// Get all scans shared by the current user
    public func getMySharedScans() async throws -> [RoomScanAssociation] {
        guard let userId = await getCurrentUserId() else {
            throw ScanSharingError.notAuthenticated
        }

        do {
            let response: [RoomScanAssociation] = try await supabase.database
                .from("room_scan_associations")
                .select("""
                    *,
                    designer:profiles!designer_id(
                        id,
                        email,
                        full_name,
                        avatar_url,
                        business_name
                    )
                """)
                .eq("consumer_id", value: userId.uuidString)
                .neq("status", value: "revoked")
                .order("created_at", ascending: false)
                .execute()
                .value

            return response
        } catch {
            throw ScanSharingError.networkError(error)
        }
    }

    /// Revoke access for a designer
    public func revokeAccess(associationId: UUID) async throws {
        isLoading = true
        lastError = nil
        defer { isLoading = false }

        guard await getCurrentUserId() != nil else {
            let error = ScanSharingError.notAuthenticated
            lastError = error
            throw error
        }

        do {
            try await supabase.database
                .from("room_scan_associations")
                .update([
                    "status": "revoked",
                    "revoked_at": ISO8601DateFormatter().string(from: Date())
                ])
                .eq("id", value: associationId.uuidString)
                .execute()
        } catch {
            let sharingError = ScanSharingError.networkError(error)
            lastError = sharingError
            throw sharingError
        }
    }

    /// Update access level for an existing association
    public func updateAccessLevel(
        associationId: UUID,
        newAccessLevel: ScanAccessLevel
    ) async throws {
        isLoading = true
        lastError = nil
        defer { isLoading = false }

        guard await getCurrentUserId() != nil else {
            let error = ScanSharingError.notAuthenticated
            lastError = error
            throw error
        }

        do {
            try await supabase.database
                .from("room_scan_associations")
                .update(["access_level": newAccessLevel.rawValue])
                .eq("id", value: associationId.uuidString)
                .execute()
        } catch {
            let sharingError = ScanSharingError.networkError(error)
            lastError = sharingError
            throw sharingError
        }
    }

    /// Search for designers by email or name
    public func searchDesigners(query: String) async throws -> [DesignerSearchResult] {
        guard await getCurrentUserId() != nil else {
            throw ScanSharingError.notAuthenticated
        }

        guard query.count >= 3 else {
            return []
        }

        do {
            // Search profiles that have is_designer = true
            let response: [DesignerSearchResult] = try await supabase.database
                .from("profiles")
                .select("id, email, full_name, avatar_url, business_name")
                .eq("is_designer", value: true)
                .or("email.ilike.%\(query)%,full_name.ilike.%\(query)%,business_name.ilike.%\(query)%")
                .limit(10)
                .execute()
                .value

            return response
        } catch {
            throw ScanSharingError.networkError(error)
        }
    }

    /// Get designers the user has previously shared with
    public func getRecentDesigners() async throws -> [DesignerSearchResult] {
        guard let userId = await getCurrentUserId() else {
            throw ScanSharingError.notAuthenticated
        }

        do {
            // Get unique designers from recent associations
            let associations: [RoomScanAssociation] = try await supabase.database
                .from("room_scan_associations")
                .select("""
                    designer:profiles!designer_id(
                        id,
                        email,
                        full_name,
                        avatar_url,
                        business_name
                    )
                """)
                .eq("consumer_id", value: userId.uuidString)
                .order("created_at", ascending: false)
                .limit(20)
                .execute()
                .value

            // Extract unique designers
            var seen = Set<UUID>()
            var designers: [DesignerSearchResult] = []

            for assoc in associations {
                if let designer = assoc.designer, !seen.contains(designer.id) {
                    seen.insert(designer.id)
                    designers.append(DesignerSearchResult(
                        id: designer.id,
                        email: designer.email,
                        fullName: designer.fullName,
                        avatarUrl: designer.avatarUrl,
                        businessName: designer.businessName
                    ))
                }
            }

            return designers
        } catch {
            throw ScanSharingError.networkError(error)
        }
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
