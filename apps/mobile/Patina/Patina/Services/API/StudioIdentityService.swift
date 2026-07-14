//
//  StudioIdentityService.swift
//  Patina
//
//  Resolves the studio identity (business name + logo) behind a project or
//  a designer via the `resolve_studio_identity` RPC — the single canonical
//  precedence (project's studio → owning designer's primary studio →
//  profiles.business_name → profiles.full_name) shared across the designer
//  portal, edge functions, and this app, so none of the three runtimes can
//  drift (see the "Designer Studios" program's D2 design decision). The RPC
//  is callable with the anon or authenticated key and always returns exactly
//  one row — `name` is guaranteed non-empty; `studio_id`/`logo_url`/`website`
//  are null when the resolver fell back to a personal name.
//
//  Mirrors `ProfileLookupService`'s shape: an actor holding an in-memory,
//  session-lifetime cache. Failures return nil, never throw to the UI —
//  studio identity is supplementary decoration on the project header, not
//  load-bearing data.
//

import Foundation
import Supabase

/// Resolved studio brand for a project or designer. Only `name` is
/// guaranteed non-empty; the rest are nil when the resolver fell back to a
/// personal name rather than a studio.
///
/// `nonisolated` so its synthesized `Decodable` conformance can be used from
/// `StudioIdentityService`'s actor context — the app's default actor
/// isolation is main-actor-wide, and without this a decode from a
/// non-main-actor context is a Swift 6 error (same reasoning as
/// `DesignRequestResult`/`SubmitDesignRequestParams` in DesignServicesService).
nonisolated public struct StudioIdentity: Codable, Equatable, Sendable {
    public let studioId: UUID?
    public let name: String
    public let logoUrl: String?
    public let website: String?

    enum CodingKeys: String, CodingKey {
        case studioId = "studio_id"
        case name
        case logoUrl = "logo_url"
        case website
        // `source` (studio/business_name/full_name) is intentionally absent
        // here — synthesized decoding simply ignores the extra RPC column.
    }
}

/// Batch-free studio identity resolution with an in-memory cache, keyed by
/// project or designer id.
public actor StudioIdentityService {
    public static let shared = StudioIdentityService()

    /// Keyed by `"project:<uuid>"` / `"designer:<uuid>"` so the two id
    /// spaces never collide in one cache.
    private var cache: [String: StudioIdentity] = [:]

    public init() {}

    private struct ResolveStudioIdentityParams: Encodable {
        let p_project_id: String?
        let p_designer_id: String?
    }

    /// Studio identity for the studio that owns `projectId` (falls back to
    /// the owning designer's business/full name when the project has none).
    /// Returns nil on any failure.
    public func identity(forProject projectId: UUID) async -> StudioIdentity? {
        await resolve(
            cacheKey: "project:\(projectId.uuidString.lowercased())",
            params: ResolveStudioIdentityParams(
                p_project_id: projectId.uuidString,
                p_designer_id: nil
            )
        )
    }

    /// Studio identity for `designerId` directly (used where no project is
    /// in hand, e.g. a matched-designer card before a project exists).
    /// Returns nil on any failure.
    public func identity(forDesigner designerId: UUID) async -> StudioIdentity? {
        await resolve(
            cacheKey: "designer:\(designerId.uuidString.lowercased())",
            params: ResolveStudioIdentityParams(
                p_project_id: nil,
                p_designer_id: designerId.uuidString
            )
        )
    }

    private func resolve(cacheKey: String, params: ResolveStudioIdentityParams) async -> StudioIdentity? {
        if let hit = cache[cacheKey] { return hit }
        do {
            // The RPC always returns exactly one row — `.single()` decodes
            // it directly rather than as a one-element array.
            let identity: StudioIdentity = try await supabase
                .rpc("resolve_studio_identity", params: params)
                .single()
                .execute()
                .value
            cache[cacheKey] = identity
            return identity
        } catch {
            #if DEBUG
            await PatinaLog.ui.error("[StudioIdentity] resolve failed: \(error.localizedDescription)")
            #endif
            return nil
        }
    }
}
