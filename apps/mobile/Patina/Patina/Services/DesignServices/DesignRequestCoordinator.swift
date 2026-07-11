//
//  DesignRequestCoordinator.swift
//  Patina
//
//  Owns the design-request draft lifecycle and the explicit, user-initiated
//  upload→submit sequence. This is the ONLY place scan bytes leave the phone
//  for a design request, and the atomic `submit_design_request` RPC only ever
//  fires from `send()` (a user tap) — never automatically, even on resume.
//
//  Flow: the user has assembled a draft (scans + details). `send()` uploads
//  each not-yet-synced held scan sequentially with `intent: .userRequested`
//  (bypassing the passive cellular gate — consent is collected inline by the
//  flow), then, once every scan is `ready` server-side, calls the RPC. A
//  failure stops before the RPC so nothing half-submits; the user can retry a
//  single scan or all failed scans.
//

import Foundation
import Observation
import SwiftData

/// The request's detail fields, bundled so the draft-creation API stays small.
public struct DesignRequestDetails: Sendable {
    public var projectType: DesignServiceType?
    public var budget: DesignBudget?
    public var timeline: DesignTimeline?
    public var description: String

    public init(
        projectType: DesignServiceType? = nil,
        budget: DesignBudget? = nil,
        timeline: DesignTimeline? = nil,
        description: String = ""
    ) {
        self.projectType = projectType
        self.budget = budget
        self.timeline = timeline
        self.description = description
    }
}

@MainActor
@Observable
public final class DesignRequestCoordinator {

    /// Per-scan upload status surfaced to the flow UI.
    public enum ScanUploadPhase: Equatable, Sendable {
        case waiting
        case uploading
        case uploaded
        case failed(String)
    }

    // MARK: - Dependencies

    @ObservationIgnored private let modelContext: ModelContext
    @ObservationIgnored private let submitter: DesignRequestSubmitting
    @ObservationIgnored private let syncService: RoomScanSyncService

    // MARK: - Observable state

    public private(set) var draft: DesignRequestDraft?
    public private(set) var scanPhases: [UUID: ScanUploadPhase] = [:]
    public private(set) var isSubmitting = false
    public private(set) var lastError: DesignServicesError?
    /// Set on a successful submit; carries `pooled` / `designer_id` for the
    /// success screen.
    public private(set) var result: DesignRequestResult?

    // MARK: - Init

    public init(
        modelContext: ModelContext,
        submitter: DesignRequestSubmitting = DesignServicesService.shared,
        syncService: RoomScanSyncService = .shared
    ) {
        self.modelContext = modelContext
        self.submitter = submitter
        self.syncService = syncService
    }

    // MARK: - Draft lifecycle

    /// The single active draft, if any.
    public func activeDraft() -> DesignRequestDraft? {
        try? modelContext.fetch(DesignRequestDraft.activeDraftDescriptor).first
    }

    /// Adopt an existing draft as the coordinator's current draft (resume).
    public func adopt(_ existing: DesignRequestDraft) {
        draft = existing
        // A resumed draft never auto-submits: drop `submitting` back to
        // `readyToSubmit` (if its scans are all synced) or `uploading`.
        if existing.phase == .submitting {
            existing.setPhase(allScansSynced(for: existing) ? .readyToSubmit : .uploading)
            try? modelContext.save()
        }
        rebuildScanPhases(for: existing)
    }

    /// Create a fresh draft. Caller must ensure no active draft exists (or
    /// discard it first) — this enforces the at-most-one invariant by
    /// deleting any stragglers before inserting.
    @discardableResult
    public func createDraft(
        scanIds: [UUID],
        primaryScanId: UUID?,
        details: DesignRequestDetails = DesignRequestDetails()
    ) -> DesignRequestDraft {
        discardActiveDraft()
        let newDraft = DesignRequestDraft(
            phase: .composing,
            projectTypeRaw: details.projectType?.rawValue,
            budgetRaw: details.budget?.rawValue,
            timelineRaw: details.timeline?.rawValue,
            requestDescription: details.description,
            scanIds: scanIds,
            primaryScanId: primaryScanId ?? scanIds.first
        )
        modelContext.insert(newDraft)
        try? modelContext.save()
        draft = newDraft
        rebuildScanPhases(for: newDraft)
        return newDraft
    }

    /// Permanently drop the active draft (user chose "discard"). The held
    /// scans themselves are untouched — a draft is only the *request*.
    public func discardActiveDraft() {
        let existing = (try? modelContext.fetch(DesignRequestDraft.activeDraftDescriptor)) ?? []
        for draftRow in existing { modelContext.delete(draftRow) }
        if !existing.isEmpty { try? modelContext.save() }
        draft = nil
        scanPhases = [:]
        lastError = nil
        result = nil
    }

    // MARK: - Send (upload → submit)

    /// User-initiated. Upload every not-yet-synced selected scan, then submit.
    /// Stops before the RPC if any upload fails (nothing half-submits).
    public func send() async {
        guard let draft else { return }
        lastError = nil

        // Validate we have what the RPC needs before touching the network.
        guard !draft.scanIds.isEmpty else { lastError = .noScans; return }
        guard draft.projectTypeRaw != nil else { lastError = .invalidProjectType; return }

        draft.setPhase(.uploading)
        try? modelContext.save()

        await uploadAll(for: draft)

        guard allScansSynced(for: draft) else {
            // Leave the draft in .uploading; the flow shows per-scan retry.
            return
        }

        draft.setPhase(.readyToSubmit)
        try? modelContext.save()

        await submit()
    }

    /// Retry a single failed scan's upload.
    public func retryScan(_ scanId: UUID) async {
        guard let draft, draft.scanIds.contains(scanId) else { return }
        await upload(scanId: scanId, for: draft)
        // If that was the last outstanding scan, move to readyToSubmit so the
        // flow can offer "Send" again (never auto-submits).
        if allScansSynced(for: draft), draft.phase == .uploading {
            draft.setPhase(.readyToSubmit)
            try? modelContext.save()
        }
    }

    /// Retry every failed scan, in order.
    public func retryAllFailed() async {
        guard let draft else { return }
        for scanId in draft.scanIds where isFailed(scanId) {
            await upload(scanId: scanId, for: draft)
        }
        if allScansSynced(for: draft), draft.phase == .uploading {
            draft.setPhase(.readyToSubmit)
            try? modelContext.save()
        }
    }

    /// Fire the atomic RPC. Only valid once every scan is synced.
    public func submit() async {
        guard let draft else { return }
        guard draft.leadId == nil else { lastError = .alreadySubmitted; return }
        guard allScansSynced(for: draft) else { return }
        guard let projectType = draft.projectTypeRaw,
              let primary = draft.primaryScanId else {
            lastError = .invalidProjectType
            return
        }

        isSubmitting = true
        lastError = nil
        draft.setPhase(.submitting)
        try? modelContext.save()
        defer { isSubmitting = false }

        let params = SubmitDesignRequestParams(
            scanIds: draft.scanIds,
            projectType: projectType,
            primaryScanId: primary,
            budgetRange: draft.budgetRaw,
            timeline: draft.timelineRaw,
            description: draft.requestDescription,
            source: draft.sourceRaw,
            clientRequestId: draft.id
        )

        do {
            let submitResult = try await submitter.submitDesignRequest(params)
            result = submitResult
            draft.leadId = submitResult.leadId
            try? modelContext.save()

            PostHogService.shared.capture("design_request_submitted", properties: [
                "scan_count": draft.scanIds.count,
                "pooled": submitResult.pooled,
                "idempotent_replay": submitResult.idempotentReplay,
                "project_type": projectType
            ])

            // Success — the request is server-side; the draft has served its
            // purpose. Held scans remain (now synced) in the library.
            modelContext.delete(draft)
            try? modelContext.save()
            self.draft = nil
        } catch {
            let mapped = DesignServicesError.map(error)
            lastError = mapped
            draft.lastError = mapped.errorDescription
            draft.setPhase(.readyToSubmit)
            try? modelContext.save()
        }
    }

    // MARK: - Upload internals

    private func uploadAll(for draft: DesignRequestDraft) async {
        for scanId in draft.scanIds {
            if case .uploaded = scanPhases[scanId] { continue }
            await upload(scanId: scanId, for: draft)
        }
    }

    private func upload(scanId: UUID, for draft: DesignRequestDraft) async {
        guard let package = package(for: scanId) else {
            scanPhases[scanId] = .failed("Scan not found on this device")
            return
        }

        // Already synced from a prior attempt — nothing to do.
        if package.status == .synced {
            scanPhases[scanId] = .uploaded
            return
        }

        guard let bundleURL = package.absoluteBundleURL,
              let manifest = try? ScanBundleWriter.readManifest(at: bundleURL) else {
            scanPhases[scanId] = .failed("Scan files are missing")
            draft.lastError = "A scan's files are missing"
            try? modelContext.save()
            return
        }

        scanPhases[scanId] = .uploading
        let roomData = RoomScanSyncService.deriveRoomData(
            from: manifest,
            package: package,
            context: modelContext
        )

        do {
            _ = try await syncService.uploadAdvancedScanBundle(
                package: package,
                roomData: roomData,
                styleSignals: FirstWalkStyleSignals(),
                intent: .userRequested
            )
            if package.status == .synced {
                scanPhases[scanId] = .uploaded
            } else {
                scanPhases[scanId] = .failed(package.lastError ?? "Upload didn't finish")
            }
        } catch {
            scanPhases[scanId] = .failed(error.localizedDescription)
            draft.lastError = error.localizedDescription
            try? modelContext.save()
        }
    }

    // MARK: - Live phase derivation

    /// The effective phase of a scan: the coordinator's snapshot merged with
    /// the LIVE `RoomScanPackage.status`. The snapshot alone can go stale — a
    /// resumed draft is snapshotted once in `rebuildScanPhases`, but a
    /// background `resumePendingUploads` can finish (or fail) that upload
    /// afterwards; the package row is the source of truth for terminal
    /// states. Reading `package.statusRaw` here also registers SwiftUI
    /// observation on the model, so views gating on these values re-render
    /// when the package flips behind the scenes (the same mechanism that
    /// keeps the per-row `ScanUploadProgressView` live).
    public func livePhase(for scanId: UUID) -> ScanUploadPhase {
        let pkg = package(for: scanId)
        if pkg?.status == .synced { return .uploaded }
        let snapshot = scanPhases[scanId] ?? .waiting
        // An upload actively owned by this coordinator stays .uploading.
        if case .uploading = snapshot { return snapshot }
        if pkg?.status == .failed {
            return .failed(pkg?.lastError ?? "Upload didn't finish")
        }
        return snapshot
    }

    /// True when every selected scan is synced server-side (live, not
    /// snapshot). Drives the "Send request" affordance.
    public var allScansUploaded: Bool {
        guard let draft, !draft.scanIds.isEmpty else { return false }
        return draft.scanIds.allSatisfy {
            if case .uploaded = livePhase(for: $0) { return true } else { return false }
        }
    }

    /// True when any selected scan is in a failed state (live). Drives the
    /// "Try again" affordance.
    public var anyScanFailed: Bool {
        guard let draft else { return false }
        return draft.scanIds.contains {
            if case .failed = livePhase(for: $0) { return true } else { return false }
        }
    }

    // MARK: - Helpers

    private func package(for scanId: UUID) -> RoomScanPackage? {
        let descriptor = FetchDescriptor<RoomScanPackage>(
            predicate: #Predicate { $0.scanId == scanId }
        )
        return (try? modelContext.fetch(descriptor))?.first
    }

    private func allScansSynced(for draft: DesignRequestDraft) -> Bool {
        guard !draft.scanIds.isEmpty else { return false }
        return draft.scanIds.allSatisfy { package(for: $0)?.status == .synced }
    }

    private func isFailed(_ scanId: UUID) -> Bool {
        if case .failed = livePhase(for: scanId) { return true }
        return false
    }

    /// Seed `scanPhases` from current package state so a resumed draft shows
    /// already-synced scans as done.
    private func rebuildScanPhases(for draft: DesignRequestDraft) {
        var phases: [UUID: ScanUploadPhase] = [:]
        for scanId in draft.scanIds {
            phases[scanId] = (package(for: scanId)?.status == .synced) ? .uploaded : .waiting
        }
        scanPhases = phases
    }
}
