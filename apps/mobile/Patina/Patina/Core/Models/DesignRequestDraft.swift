//
//  DesignRequestDraft.swift
//  Patina
//
//  SwiftData row that carries the intent to submit a design request across
//  the multi-step request flow (and across app kills). Where a
//  `RoomScanPackage` in `.heldLocal` is a scan resting on the phone, a
//  `DesignRequestDraft` is the *request* the user is assembling around one or
//  more of those scans. The RPC submit only ever fires from an explicit
//  "Send" — this row persists so a killed flow can be rehydrated and resumed
//  (uploads auto-resume; submit never does).
//
//  Invariant: at most one active draft exists at a time. A new request while
//  one exists prompts resume-or-discard rather than silently starting a
//  second.
//

import Foundation
import SwiftData

/// The lifecycle phase of a design-request draft.
public enum DesignRequestPhase: String, Codable, Sendable, CaseIterable {
    /// User is picking scans / filling in details. Nothing has been uploaded
    /// and no server row exists. Discarding here is free.
    case composing
    /// The user tapped "Send"; the selected held scans are uploading under
    /// explicit consent. Bytes are leaving the phone.
    case uploading
    /// Every selected scan is synced server-side; the request is ready for the
    /// atomic `submit_design_request` RPC. Awaiting the final "Send".
    case readyToSubmit
    /// The RPC is in flight.
    case submitting

    /// Whether a draft in this phase should raise the launch-time resume
    /// banner. `composing` drafts are pre-commitment and don't nag; anything
    /// past that represents an in-flight request the user started and should
    /// be offered a way back into.
    public var needsResumePrompt: Bool {
        switch self {
        case .composing:                                return false
        case .uploading, .readyToSubmit, .submitting:   return true
        }
    }
}

@Model
public final class DesignRequestDraft {

    /// Stable across retries — reused as `p_client_request_id` so the RPC
    /// replays idempotently (including under a concurrent double-fire).
    @Attribute(.unique) public var id: UUID

    public var createdAt: Date
    public var updatedAt: Date

    public var phaseRaw: String

    // Form fields (raw strings so the model has no dependency on the
    // DesignServices enums; the flow maps to/from typed enums).
    public var projectTypeRaw: String?
    public var budgetRaw: String?
    public var timelineRaw: String?
    public var requestDescription: String

    /// Ordered scan ids (== `RoomScanPackage.scanId` == `room_scans.id`),
    /// JSON-encoded to preserve order.
    public var scanIdsJSON: Data

    /// The primary scan (`leads.room_scan_id`). Must be within `scanIds`.
    public var primaryScanId: UUID?

    /// `leads.source`, human-readable. Always "Patina app" from this app.
    public var sourceRaw: String

    /// Set once the submit RPC returns a lead id.
    public var leadId: UUID?

    /// Last error surfaced during upload or submit (for the resume banner).
    public var lastError: String?

    // MARK: - Computed

    public var phase: DesignRequestPhase {
        get { DesignRequestPhase(rawValue: phaseRaw) ?? .composing }
        set { phaseRaw = newValue.rawValue }
    }

    /// Ordered scan ids. Order is meaningful — the first element is the
    /// default primary and `position` in the junction table.
    public var scanIds: [UUID] {
        get { (try? JSONDecoder().decode([UUID].self, from: scanIdsJSON)) ?? [] }
        set {
            scanIdsJSON = (try? JSONEncoder().encode(newValue)) ?? Data()
            updatedAt = Date()
        }
    }

    // MARK: - Init

    public init(
        id: UUID = UUID(),
        phase: DesignRequestPhase = .composing,
        projectTypeRaw: String? = nil,
        budgetRaw: String? = nil,
        timelineRaw: String? = nil,
        requestDescription: String = "",
        scanIds: [UUID] = [],
        primaryScanId: UUID? = nil,
        source: String = "Patina app"
    ) {
        self.id = id
        self.createdAt = Date()
        self.updatedAt = Date()
        self.phaseRaw = phase.rawValue
        self.projectTypeRaw = projectTypeRaw
        self.budgetRaw = budgetRaw
        self.timelineRaw = timelineRaw
        self.requestDescription = requestDescription
        self.scanIdsJSON = (try? JSONEncoder().encode(scanIds)) ?? Data()
        self.primaryScanId = primaryScanId ?? scanIds.first
        self.sourceRaw = source
        self.leadId = nil
        self.lastError = nil
    }

    // MARK: - Mutations

    public func touch() {
        updatedAt = Date()
    }

    public func setPhase(_ newPhase: DesignRequestPhase) {
        phase = newPhase
        updatedAt = Date()
    }
}

// MARK: - Fetch descriptors

extension DesignRequestDraft {

    /// The single active draft, if any — most-recently-updated first. There
    /// should be at most one; the sort + limit makes the accessor total even
    /// if an orphan ever slips through.
    public static var activeDraftDescriptor: FetchDescriptor<DesignRequestDraft> {
        var descriptor = FetchDescriptor<DesignRequestDraft>(
            sortBy: [SortDescriptor(\.updatedAt, order: .reverse)]
        )
        descriptor.fetchLimit = 1
        return descriptor
    }
}
