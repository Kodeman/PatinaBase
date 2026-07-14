//
//  EngagementTier.swift
//  Patina
//
//  The client's progressive-disclosure tier on the Daily Room home. Patina
//  opens as a clean, marketplace-first discovery app and *morphs* into the
//  full project-engagement platform only as the client actually engages a
//  designer — so a brand-new user isn't greeted with Projects / Invoices /
//  Decisions before they've done anything.
//
//  The tier is DERIVED, never stored: it reads the two app-wide `@Observable`
//  services that already refresh on the home's polling floor (appear +
//  foreground + push):
//    • `DesignRequestStatusService.shared` — the `public.leads` engagement
//      signal (has the client asked for / matched with a designer?).
//    • `BadgeCountService.shared` — project + money-rail existence signals.
//  Reading their properties inside a SwiftUI `body` establishes the
//  observation dependency, so the home re-renders as the tier advances.
//
//  The designer relationship is read from `leads` (not `designer_clients`,
//  which has no client-side SELECT policy) — the same source
//  `DesignRequestStatusService` already uses.
//

import Foundation

/// Progressive-disclosure tier for the client home. `Comparable` so callers
/// can gate a surface with `tier >= .engaged`.
///
/// Main-actor-isolated by the module default (`SWIFT_DEFAULT_ACTOR_ISOLATION =
/// MainActor`): the resolver reads `@MainActor` services and the main-actor
/// `DesignRequestStatus.stage`, and the only callers are the SwiftUI home and
/// the `@MainActor` unit tests — so there's no reason to fight the isolation.
enum EngagementTier: Int, Comparable {
    /// No active design request and no project — marketplace / discovery only.
    case discovering = 0
    /// A design request is in flight or matched, but no project exists yet —
    /// reveal the designer + messaging surfaces.
    case engaged = 1
    /// At least one project (or money-rail artifact) exists — the full
    /// project-engagement platform.
    case activeProject = 2

    static func < (lhs: EngagementTier, rhs: EngagementTier) -> Bool {
        lhs.rawValue < rhs.rawValue
    }

    /// Resolve the current tier from the app-wide services. Call inside a
    /// SwiftUI `body`/computed view so the reads register as observation
    /// dependencies and the home re-renders when a refresh lands.
    static var current: EngagementTier {
        resolve(
            requests: DesignRequestStatusService.shared.requests,
            projectCount: BadgeCountService.shared.projectCount,
            proposalCount: BadgeCountService.shared.proposalsAwaitingSignatureCount,
            invoiceCount: BadgeCountService.shared.payableInvoiceCount,
            decisionCount: BadgeCountService.shared.pendingDecisionCount
        )
    }

    /// Pure resolver — unit-testable without touching the services.
    ///
    /// A project is the strongest signal for the full platform; proposals /
    /// invoices / decisions are treated as fallbacks that imply a project, so
    /// the tier degrades gracefully if the project-count query returns empty.
    /// Otherwise any non-terminal design request (finding / reviewing /
    /// inTouch / matched) means the relationship has begun.
    static func resolve(
        requests: [DesignRequestStatus],
        projectCount: Int,
        proposalCount: Int,
        invoiceCount: Int,
        decisionCount: Int
    ) -> EngagementTier {
        if projectCount > 0 || proposalCount > 0 || invoiceCount > 0 || decisionCount > 0 {
            return .activeProject
        }
        if requests.contains(where: { !$0.stage.isTerminal }) {
            return .engaged
        }
        return .discovering
    }
}
