//  CaptureSyncService.swift
//  CaptureKit
//
//  The backend seam. Team D owns the concrete (SupabaseCaptureSyncService:
//  uploads media to capture-media, calls commit_field_capture, idempotent on
//  clientToken). B/E/F code against this protocol with the in-memory mock.

import Foundation

public struct CommitReceipt: Sendable {
    public let remoteId: String
    public let productId: String?
    public let destination: CaptureDestination
    public let created: Bool
    public init(remoteId: String, productId: String?, destination: CaptureDestination, created: Bool) {
        self.remoteId = remoteId; self.productId = productId
        self.destination = destination; self.created = created
    }
}

/// Drives U1 (sync status) and the R4/U1 Live Activity.
public struct SyncSnapshot: Sendable {
    public let queued: Int
    public let uploading: Int
    public let failed: Int
    public let lastError: String?
    public init(queued: Int, uploading: Int, failed: Int, lastError: String? = nil) {
        self.queued = queued; self.uploading = uploading; self.failed = failed; self.lastError = lastError
    }
}

public protocol CaptureSyncService: Sendable {
    /// Mark ready and persist to the outbox — offline-safe, never blocks on network.
    func enqueue(_ specimenID: UUID) async
    /// Back-online / manual retry: drain the outbox oldest-first.
    func drain() async
    /// Composition-root startup seam. Call after auth is ready; idempotency is
    /// anchored by each specimen's stable client token.
    func reconcilePendingTransfers() async
    /// Upload artifacts + call commit_field_capture. Idempotent on clientToken.
    func commit(_ specimenID: UUID) async throws -> CommitReceipt
    /// Triage: route a synced/inbox capture to library vs inbox.
    func route(_ specimenID: UUID, to destination: CaptureDestination) async throws
    var snapshots: AsyncStream<SyncSnapshot> { get }
}

/// Safety rules shared by route terminals, assignment, and session culling.
public enum CaptureRouteSafetyPolicy {
    /// Update visit-scoped assignment context without changing the last
    /// destination that S3 successfully routed.
    public static func updatingAssignment(
        in routing: CaptureRoutingMemory,
        projectID: String?,
        projectName: String?,
        room: String?,
        shelf: String?,
        projectRoomID: String? = nil
    ) -> CaptureRoutingMemory {
        var updated = routing
        updated.projectID = projectID
        updated.projectName = projectName
        updated.projectRoomID = projectRoomID
        updated.room = room
        updated.shelf = shelf
        return updated
    }

    /// Once a record leaves the device-local phase, review must not rewrite it.
    public static func canCull(_ transfer: CaptureTransferState) -> Bool {
        transfer.phase == .local
    }

    /// A kept item remains local until the designer explicitly routes it, but it
    /// should not reappear in the same visit's cull deck.
    public static func canCull(_ specimen: Specimen) -> Bool {
        guard canCull(specimen.transferState) else { return false }
        return CaptureLifecycle.State(rawValue: specimen.lifecycleRaw) != .session
    }

    /// Server commits require the explicit S3 destination choice. In particular,
    /// `.undecided` must never be interpreted as Library by a fallback branch.
    public static func canCommit(_ destination: CaptureDestination) -> Bool {
        destination == .library || destination == .inbox
    }

    /// A terminal can name a destination only when both the server receipt and
    /// server-mapped destination are present.
    public static func confirmedDestination(
        recordedDestination: CaptureDestination,
        transfer: CaptureTransferState
    ) -> CaptureDestination? {
        guard transfer.phase == .complete,
              let receipt = transfer.receiptID?.trimmingCharacters(
                in: .whitespacesAndNewlines),
              !receipt.isEmpty else {
            return nil
        }
        switch recordedDestination {
        case .library, .inbox:
            return recordedDestination
        case .undecided:
            return nil
        }
    }
}

public extension CaptureSyncService {
    func reconcilePendingTransfers() async {
        await drain()
    }

    /// Route a bounded set through the same per-record sync contract. Stops at
    /// the first error so the caller can keep unresolved records visible.
    func routeAll(
        _ specimenIDs: [UUID],
        to destination: CaptureDestination
    ) async throws {
        for specimenID in specimenIDs {
            try await route(specimenID, to: destination)
        }
    }
}
