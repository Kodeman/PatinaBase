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
    /// Upload artifacts + call commit_field_capture. Idempotent on clientToken.
    func commit(_ specimenID: UUID) async throws -> CommitReceipt
    /// Triage: route a synced/inbox capture to library vs inbox.
    func route(_ specimenID: UUID, to destination: CaptureDestination) async throws
    var snapshots: AsyncStream<SyncSnapshot> { get }
}
