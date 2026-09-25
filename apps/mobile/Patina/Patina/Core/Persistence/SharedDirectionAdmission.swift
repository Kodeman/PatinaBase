//
//  SharedDirectionAdmission.swift
//  Patina
//
//  W1A-10 · CONTRACT-C §C.3.3. The 500 MiB ceiling, and who gives way under
//  it. Pure: the store asks, executes a complete plan inside its own serial
//  turn, and nothing else interleaves between the plan and the deletion.
//

import Foundation

/// The confirmed bounds (Kody, 2026-09-25). Injected so a test can scale them
/// down; the app uses `.contract`.
struct SharedDirectionLimits: Sendable, Equatable {
    var ceilingBytes: Int
    var maxFileBytes: Int
    var maxPlanSetBytes: Int
    var maxPlanSheets: Int

    static let contract = SharedDirectionLimits(
        ceilingBytes: 500 << 20,
        maxFileBytes: 50 << 20,
        maxPlanSetBytes: 200 << 20,
        maxPlanSheets: 60
    )
}

enum SharedDirectionAdmission {

    /// One edition's committed set, as the planner sees it.
    struct Holding: Sendable, Equatable {
        let decisionId: String
        let bytes: Int
        let isProtected: Bool
        let respondedAt: Date?
        let servedAt: Date
    }

    enum Plan: Sendable, Equatable {
        case fits
        /// Evict these whole sets, in this order, then admit.
        case evict([String])
        /// Nothing is evicted and nothing is downloaded (§C.3.3 step 4).
        case noSpace
    }

    /// The authoritative predicate (N7, ruling G): protected while the edition
    /// awaits an act of THIS viewer, eligible otherwise. Observer rows never
    /// answer, so they are always eligible; responded editions are eligible;
    /// a lead's incomplete draft awaits her confirmation and is protected.
    static func isProtected(_ review: RemoteProjectApprovalReview) -> Bool {
        review.awaitsClient && review.viewerAnswers
    }

    /// Plan before deleting anything (N6, ruling F). The shortest prefix of
    /// the eligible sets — oldest `respondedAt` first, an unanswered one
    /// oldest of all, then oldest `servedAt` — whose bytes cover the
    /// shortfall. If every eligible set together cannot cover it, there is no
    /// plan and nothing is evicted.
    static func plan(
        needed: Int, committed: Int, reserved: Int, ceiling: Int, holdings: [Holding]
    ) -> Plan {
        let shortfall = committed + reserved + needed - ceiling
        guard shortfall > 0 else { return .fits }
        let eligible = holdings
            .filter { !$0.isProtected && $0.bytes > 0 }
            .sorted(by: evictsFirst)
        var covered = 0
        var chosen: [String] = []
        for holding in eligible {
            chosen.append(holding.decisionId)
            covered += holding.bytes
            if covered >= shortfall { return .evict(chosen) }
        }
        return .noSpace
    }

    private static func evictsFirst(_ lhs: Holding, _ rhs: Holding) -> Bool {
        switch (lhs.respondedAt, rhs.respondedAt) {
        case let (left?, right?) where left != right: return left < right
        case (nil, _?): return true
        case (_?, nil): return false
        default: return lhs.servedAt < rhs.servedAt
        }
    }

    /// The bytes a signed set needs, or nil when the set may not be committed
    /// at all (§C.3.3 "all or nothing"): a URL for every manifest entry and
    /// nothing else, a known content type, one spec book or 1…60 sheets, no
    /// file past 50 MiB and no sheet set past 200 MiB.
    static func admissibleBytes(
        manifest: [SharedDirectionManifestEntry],
        signed: [SharedDirectionSignedFile],
        limits: SharedDirectionLimits
    ) -> Int? {
        let signedIds = signed.map(\.attachmentId)
        guard !manifest.isEmpty, Set(signedIds).count == signedIds.count,
              Set(signedIds) == Set(manifest.map(\.attachmentId)) else { return nil }
        for entry in manifest {
            if let type = entry.contentType,
               !SharedDirectionManifestEntry.contentTypes.contains(type) { return nil }
        }
        guard signed.allSatisfy({ $0.sizeBytes <= limits.maxFileBytes }) else { return nil }
        let total = signed.reduce(0) { $0 + $1.sizeBytes }
        let kinds = Set(manifest.map(\.kind))
        if kinds == ["spec_book_pdf"] {
            guard manifest.count == 1 else { return nil }
        } else if kinds == ["plan_sheet"] {
            guard manifest.count <= limits.maxPlanSheets, total <= limits.maxPlanSetBytes else {
                return nil
            }
        } else {
            return nil
        }
        return total
    }
}
