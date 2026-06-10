//
//  ProfileLookupService.swift
//  Patina
//
//  Batch-resolves profile ids → display names (and avatar URLs) from the
//  `profiles` table. Used by Messaging to label thread counterparts and
//  message senders. `profiles` RLS allows authenticated reads of any row
//  ("Profiles are viewable by everyone"), so a direct PostgREST select
//  is safe — no RPC or view needed.
//
//  Cache is in-memory for the app session; misses are fetched in a
//  single `id=in.(...)` batch per call.
//

import Foundation
import Supabase

/// Slim row from `profiles` used for name/avatar lookups.
public struct ProfileSummary: Codable, Sendable {
    public let id: String
    public let displayName: String?
    public let fullName: String?
    public let avatarUrl: String?
    public let role: String?

    enum CodingKeys: String, CodingKey {
        case id
        case displayName = "display_name"
        case fullName = "full_name"
        case avatarUrl = "avatar_url"
        case role
    }

    /// Best human-readable name for the profile. Falls back to a
    /// role-based label so the UI never shows a raw UUID.
    public var bestName: String {
        if let displayName, !displayName.isEmpty { return displayName }
        if let fullName, !fullName.isEmpty { return fullName }
        switch role {
        case "designer": return "Designer"
        case "client", "homeowner": return "Client"
        case "vendor": return "Vendor"
        case "admin": return "Patina Team"
        default: return "Member"
        }
    }
}

/// Batch profile id → name/avatar resolution with an in-memory cache.
public actor ProfileLookupService {
    public static let shared = ProfileLookupService()

    /// Keyed by lowercased profile UUID.
    private var cache: [String: ProfileSummary] = [:]

    public init() {}

    /// Batch-resolve profile ids → display names. Only cache misses hit
    /// the network (one `in=(...)` query). Unresolvable ids are absent
    /// from the result — callers should fall back to a generic label.
    /// Result keys are lowercased UUID strings.
    public func names(for ids: [String]) async -> [String: String] {
        await profiles(for: ids).mapValues { $0.bestName }
    }

    /// Batch-resolve profile ids → full summaries (name + avatar + role).
    /// Result keys are lowercased UUID strings.
    public func profiles(for ids: [String]) async -> [String: ProfileSummary] {
        let wanted = Set(ids.map { $0.lowercased() }).filter { !$0.isEmpty }
        guard !wanted.isEmpty else { return [:] }

        let missing = wanted.filter { cache[$0] == nil }
        if !missing.isEmpty {
            do {
                let rows: [ProfileSummary] = try await supabase.database
                    .from("profiles")
                    .select("id, display_name, full_name, avatar_url, role")
                    .in("id", values: Array(missing))
                    .execute()
                    .value
                for row in rows {
                    cache[row.id.lowercased()] = row
                }
            } catch {
                #if DEBUG
                PatinaLog.ui.error("[ProfileLookup] batch fetch failed: \(error.localizedDescription)")
                #endif
            }
        }

        var result: [String: ProfileSummary] = [:]
        for id in wanted {
            if let hit = cache[id] { result[id] = hit }
        }
        return result
    }
}
