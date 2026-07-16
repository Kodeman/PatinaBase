//
//  SubmittedDesignRequest.swift
//  Patina
//
//  SwiftData row that remembers a design request AFTER it has been submitted
//  server-side. Where a `DesignRequestDraft` is the *request being assembled*
//  (at most one active, deleted on submit), a `SubmittedDesignRequest` is the
//  *durable receipt* of a sent request — many-rowed, one per `leadId`, kept so
//  the home status card and the "Your Designer" hub row survive an app kill,
//  a reinstall, or a second device (reconciled from the server on refresh).
//
//  It is deliberately a separate model from the draft: the draft's
//  single-active invariant (`activeDraftDescriptor`) is load-bearing and its
//  descriptor has no phase predicate, so overloading it with submitted history
//  would break that invariant. Submitted requests are pure history.
//
//  Write point: `DesignRequestCoordinator.submit()` success block, via the
//  idempotent-replay-safe `record(...)` upsert (never a blind insert — the
//  RPC can replay under `client_request_id`, and the status service can also
//  reconcile a row the server already knows about).
//

import Foundation
import SwiftData

@Model
public final class SubmittedDesignRequest {

    /// `leads.id` returned by `submit_design_request`. Unique so replays and
    /// server reconciles converge on one row rather than duplicating.
    @Attribute(.unique) public var leadId: UUID

    /// The submitting user (`auth.uid()` at submit). Nil for the rare case
    /// where the session vanished between submit and write.
    public var homeownerId: UUID?

    /// When this app first recorded the submission locally.
    public var submittedAt: Date

    /// `leads.project_type` raw value (maps to `DesignServiceType`).
    public var projectTypeRaw: String?

    /// Number of scans attached at submit — for the "N scans" summary.
    public var scanCount: Int

    /// Whether the request was pooled (no designer auto-resolved) at submit.
    public var pooledAtSubmit: Bool

    /// Last `leads.status` seen — seeded from the submit result, then kept
    /// fresh by `DesignRequestStatusService` reconciliation.
    public var lastKnownStatusRaw: String

    /// `leads.designer_id` — nil while pooled, set once a designer claims.
    public var designerId: UUID?

    /// The claiming designer's display name, resolved by the status service's
    /// `profiles!designer_id` embed. Nil until claimed / resolved.
    public var designerName: String?

    /// The claiming designer's resolved studio brand (via
    /// `resolve_studio_identity`). Additive (Arrival Arc / R106) — last-known
    /// studio name so the held/introduced/booked copy names the studio offline.
    public var studioName: String?

    /// When the Match Ceremony introduction was delivered (`offered_at`).
    /// Additive; drives the offline reconstruction of the `.introduced` stage.
    public var introducedAt: Date?

    /// The picked discovery slot's start (`picked_slot_starts_at`). Additive;
    /// drives the offline reconstruction of the `.booked` stage and its
    /// headline day + time. Nil until the client picks.
    public var bookedSlotStartsAt: Date?

    /// The introduction/discovery thread id (`match_ceremonies.thread_id`).
    /// Additive; the head of the client–designer thread. Nil until introduced.
    public var introThreadId: UUID?

    /// When the user dismissed the promoted home card, if ever.
    public var dismissedAt: Date?

    /// The `DesignRequestStage` raw value at dismissal. The card reappears
    /// when the stage advances past this; a terminal-stage dismissal never
    /// advances, so it is permanent.
    public var dismissedStageRaw: String?

    /// Last time the status service reconciled this row from the server.
    public var lastRefreshedAt: Date?

    // MARK: - Init

    public init(
        leadId: UUID,
        homeownerId: UUID? = nil,
        submittedAt: Date = Date(),
        projectTypeRaw: String? = nil,
        scanCount: Int = 0,
        pooledAtSubmit: Bool = false,
        lastKnownStatusRaw: String = "new",
        designerId: UUID? = nil,
        designerName: String? = nil,
        studioName: String? = nil,
        introducedAt: Date? = nil,
        bookedSlotStartsAt: Date? = nil,
        introThreadId: UUID? = nil,
        dismissedAt: Date? = nil,
        dismissedStageRaw: String? = nil,
        lastRefreshedAt: Date? = nil
    ) {
        self.leadId = leadId
        self.homeownerId = homeownerId
        self.submittedAt = submittedAt
        self.projectTypeRaw = projectTypeRaw
        self.scanCount = scanCount
        self.pooledAtSubmit = pooledAtSubmit
        self.lastKnownStatusRaw = lastKnownStatusRaw
        self.designerId = designerId
        self.designerName = designerName
        self.studioName = studioName
        self.introducedAt = introducedAt
        self.bookedSlotStartsAt = bookedSlotStartsAt
        self.introThreadId = introThreadId
        self.dismissedAt = dismissedAt
        self.dismissedStageRaw = dismissedStageRaw
        self.lastRefreshedAt = lastRefreshedAt
    }
}

// MARK: - Idempotent upsert

extension SubmittedDesignRequest {

    /// Fetch-or-insert by the submit result's `leadId`. Never blind-inserts,
    /// so a submit replay (same `client_request_id` → same `leadId`) updates
    /// the existing row in place instead of tripping the unique constraint.
    /// `submittedAt` and any dismissal are preserved.
    @discardableResult
    public static func record(
        homeownerId: UUID?,
        result: DesignRequestResult,
        projectTypeRaw: String?,
        scanCount: Int,
        in context: ModelContext
    ) -> SubmittedDesignRequest {
        let leadId = result.leadId
        let descriptor = FetchDescriptor<SubmittedDesignRequest>(
            predicate: #Predicate { $0.leadId == leadId }
        )
        if let existing = try? context.fetch(descriptor).first {
            existing.lastKnownStatusRaw = result.status
            existing.designerId = result.designerId
            existing.pooledAtSubmit = result.pooled
            existing.scanCount = scanCount
            existing.projectTypeRaw = projectTypeRaw
            if existing.homeownerId == nil { existing.homeownerId = homeownerId }
            return existing
        }
        let row = SubmittedDesignRequest(
            leadId: leadId,
            homeownerId: homeownerId,
            submittedAt: Date(),
            projectTypeRaw: projectTypeRaw,
            scanCount: scanCount,
            pooledAtSubmit: result.pooled,
            lastKnownStatusRaw: result.status,
            designerId: result.designerId
        )
        context.insert(row)
        return row
    }
}
