//  Specimen+Accessors.swift
//  CaptureKit
//
//  Typed accessors over the raw-string storage, and the SINGLE sanctioned
//  mutation path (`setValue`) so provenance + updatedAt always stay in sync.

import Foundation

public extension Specimen {
    var category: SpecimenCategory {
        get { SpecimenCategory(rawValue: categoryRaw) ?? .unknown }
        set { categoryRaw = newValue.rawValue }
    }
    var destination: CaptureDestination {
        get { CaptureDestination(rawValue: destinationRaw) ?? .undecided }
        set { destinationRaw = newValue.rawValue }
    }
    var status: CaptureStatus {
        get { CaptureStatus(rawValue: statusRaw) ?? .draft }
        set { statusRaw = newValue.rawValue }
    }

    /// Honest transfer state projected from persisted sync fields. `.complete`
    /// is impossible without a non-empty remote receipt.
    var transferState: CaptureTransferState {
        let lifecycle = CaptureLifecycle.State(rawValue: lifecycleRaw)
        if status == .committed, let receipt = remoteId?.trimmingCharacters(
            in: .whitespacesAndNewlines), !receipt.isEmpty {
            switch placementState {
            case .pending:
                return CaptureTransferState(
                    phase: .queued, progress: 100,
                    retryCount: placementRetryCount ?? 0,
                    receiptID: receipt)
            case .placing:
                return CaptureTransferState(
                    phase: .awaitingConfirmation, progress: 100,
                    retryCount: placementRetryCount ?? 0,
                    receiptID: receipt)
            case .failed:
                return CaptureTransferState(
                    phase: .retryableFailure, progress: 100,
                    errorMessage: placementLastError,
                    retryCount: placementRetryCount ?? 0,
                    receiptID: receipt)
            case .placed, nil:
                break
            }
            return CaptureTransferState(
                phase: .complete, progress: 100, retryCount: retryCount,
                receiptID: receipt)
        }
        if lifecycle == .awaitingConfirmation {
            return CaptureTransferState(
                phase: .awaitingConfirmation, progress: 100,
                retryCount: retryCount)
        }
        if lifecycle == .rejected {
            return CaptureTransferState(
                phase: .rejected, progress: uploadProgress,
                errorMessage: lastSyncError, retryCount: retryCount)
        }
        switch status {
        case .draft:
            return CaptureTransferState(
                phase: .local, progress: uploadProgress,
                retryCount: retryCount)
        case .ready, .queued:
            return CaptureTransferState(
                phase: .queued, progress: uploadProgress,
                retryCount: retryCount)
        case .uploading:
            return CaptureTransferState(
                phase: .uploading, progress: uploadProgress,
                retryCount: retryCount)
        case .failed:
            return CaptureTransferState(
                phase: .retryableFailure, progress: uploadProgress,
                errorMessage: lastSyncError, retryCount: retryCount)
        case .committed:
            // Legacy/broken row: bytes may have landed, but no receipt means
            // it remains visibly unconfirmed.
            return CaptureTransferState(
                phase: .awaitingConfirmation, progress: 100,
                retryCount: retryCount)
        }
    }

    /// Persist a transfer transition through the existing frozen schema.
    func applyTransferState(_ state: CaptureTransferState) {
        uploadProgress = state.progress
        retryCount = state.retryCount
        lastSyncError = state.errorMessage
        switch state.phase {
        case .local:
            status = .draft
            lifecycleRaw = CaptureLifecycle.State.captured.rawValue
        case .queued:
            status = .queued
            lifecycleRaw = CaptureLifecycle.State.queued.rawValue
        case .uploading:
            status = .uploading
            lifecycleRaw = CaptureLifecycle.State.uploading.rawValue
        case .awaitingConfirmation:
            status = .uploading
            lifecycleRaw = CaptureLifecycle.State.awaitingConfirmation.rawValue
        case .complete:
            guard let receipt = state.receiptID, !receipt.isEmpty else { return }
            remoteId = receipt
            status = .committed
        case .retryableFailure:
            status = .failed
            lifecycleRaw = CaptureLifecycle.State.failed.rawValue
        case .rejected:
            status = .failed
            lifecycleRaw = CaptureLifecycle.State.rejected.rawValue
        }
        touch()
    }

    /// Provenance of a field, if it has been set.
    func provenance(for key: FieldKey) -> ProvenanceSource? {
        provenanceRaw[key.rawValue].flatMap(ProvenanceSource.init(rawValue:))
    }

    var primaryPhoto: CapturePhoto? {
        photos.first(where: { $0.isPrimary }) ?? photos.sorted(by: { $0.order < $1.order }).first
    }

    /// Has any field been set by a smart guess that the designer hasn't confirmed?
    var hasUnconfirmedGuess: Bool {
        provenanceRaw.values.contains(ProvenanceSource.smartGuess.rawValue)
    }

    /// THE mutation entry point: writes the field, records provenance, bumps updatedAt.
    /// Guesses never overwrite a value a tag/scan/measure/human already set
    /// (the spec's "guesses never overwrite" rule, N5).
    func setValue(_ value: String?, for key: FieldKey, source: ProvenanceSource) {
        if source == .smartGuess, let existing = provenance(for: key),
           existing != .smartGuess {
            return // don't clobber a confirmed/recognised value with a guess
        }
        switch key {
        case .title:     title = value
        case .maker:     maker = value
        case .sku:       sku = value
        case .colorway:  colorway = value
        case .material:  materialNote = value
        case .price:     priceTradeCents = value.flatMap { Int($0) }
        case .sourceURL: sourceURL = value
        case .note:      note = value
        case .category:  if let v = value { categoryRaw = v }
        case .dimensions: break // dimensions live in `measurements`; use addMeasurement
        }
        provenanceRaw[key.rawValue] = source.rawValue
        touch()
    }

    func setConfidence(_ confidence: Double, for key: FieldKey) {
        guessConfidenceRaw[key.rawValue] = confidence
    }

    /// Write a batch of smart-guess suggestions and confidence-gate them in one
    /// pass — the shared source of truth for C1's post-shutter read and N5's
    /// mirrored test loop. `setValue` refuses to overwrite what a tag, a scan,
    /// a measure or she already set; never pin a confidence to a value we
    /// didn't write.
    @MainActor
    func recordSmartGuess(_ suggestions: [FieldSuggestion]) {
        for suggestion in suggestions {
            setValue(suggestion.value, for: suggestion.key, source: suggestion.source)
            guard provenance(for: suggestion.key) == suggestion.source else { continue }
            setConfidence(suggestion.confidence, for: suggestion.key)
        }
    }

    func addMeasurement(axis: MeasurementAxis, millimeters: Double, source: MeasureSource) {
        let m = CaptureMeasurement(axisRaw: axis.rawValue, millimeters: millimeters, sourceRaw: source.rawValue)
        m.specimen = self
        measurements.append(m)
        provenanceRaw[FieldKey.dimensions.rawValue] =
            (source == .arkit ? ProvenanceSource.measure : ProvenanceSource.manual).rawValue
        touch()
    }

    func touch() { updatedAt = Date() }

    // MARK: - Project placement

    var placementState: ProjectPlacementState? {
        get { placementStateRaw.flatMap(ProjectPlacementState.init(rawValue:)) }
        set { placementStateRaw = newValue?.rawValue }
    }

    var hasConfirmedCaptureReceipt: Bool {
        status == .committed
            && remoteId?.trimmingCharacters(in: .whitespacesAndNewlines)
                .isEmpty == false
    }

    var needsProjectPlacement: Bool {
        guard placementProjectId?.trimmingCharacters(
            in: .whitespacesAndNewlines
        ).isEmpty == false else { return false }
        return placementState != .placed
    }

    func configureProjectPlacement(
        projectID: String,
        roomID: String?,
        slotID: String?,
        category: String?
    ) {
        placementProjectId = projectID
        placementRoomId = roomID
        placementSlotId = slotID
        placementCategory = category
        placementState = .pending
        placementFFEItemId = nil
        placementSpecId = nil
        placementLastError = nil
        placementRetryCount = 0
        touch()
    }

    func clearProjectPlacement() {
        placementProjectId = nil
        placementRoomId = nil
        placementSlotId = nil
        placementCategory = nil
        placementState = nil
        placementFFEItemId = nil
        placementSpecId = nil
        placementLastError = nil
        placementRetryCount = nil
        touch()
    }

    func markProjectPlacementPending() {
        guard placementProjectId != nil else { return }
        placementState = .pending
        placementLastError = nil
        touch()
    }

    func markProjectPlacementStarted() {
        guard placementProjectId != nil else { return }
        placementState = .placing
        placementLastError = nil
        touch()
    }

    func markProjectPlacementFailed(_ message: String) {
        guard placementProjectId != nil else { return }
        placementState = .failed
        placementLastError = message
        placementRetryCount = (placementRetryCount ?? 0) + 1
        touch()
    }

    func applyProjectPlacementReceipt(_ receipt: ProjectPlacementReceipt) {
        placementState = .placed
        placementFFEItemId = receipt.ffeItemID.uuidString
        placementSpecId = receipt.specID.uuidString
        placementLastError = nil
        touch()
    }
}

// MARK: - The visit (Field Companion wave 3)

public extension Specimen {
    var visitKind: FieldVisitKind? {
        get { visitKindRaw.flatMap(FieldVisitKind.init(rawValue:)) }
        set { visitKindRaw = newValue?.rawValue }
    }
    var visitKit: FieldVisitKit? {
        get { visitKitRaw.flatMap(FieldVisitKit.init(rawValue:)) }
        set { visitKitRaw = newValue?.rawValue }
    }
    var noteSetting: FieldNoteSetting? {
        get { noteSettingRaw.flatMap(FieldNoteSetting.init(rawValue:)) }
        set { noteSettingRaw = newValue?.rawValue }
    }
    var suggestionBasis: FieldSuggestionBasis? {
        get { suggestionBasisRaw.flatMap(FieldSuggestionBasis.init(rawValue:)) }
        set { suggestionBasisRaw = newValue?.rawValue }
    }

    /// "Placed" is `venue.projectId is not null` — the same rule the server uses
    /// (`project_id IS NOT NULL`). There is no new status value, ever, and SYNC
    /// STATE IS IRRELEVANT: a capture that committed hours ago and still has no
    /// project is unplaced, and FC-R6 says it waits on Today until she files it.
    var isUnplaced: Bool {
        (venue?.projectId?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "").isEmpty
    }

    /// FC-R6: a capture that was placed AFTER it committed. The server learns the
    /// project on the next drain; until then the tray shows `placed · syncing`.
    var placementNeedsReplay: Bool { placementReplayPending == true }

    /// Place this capture — write the FACT. Never touches `suggested_*`.
    /// A capture that has not committed yet needs nothing more: its routing rides
    /// the FIRST commit, exactly as a capture taken inside a visit does. One that
    /// HAS committed needs the outbox to re-run `commit_field_capture`, so it is
    /// flagged for replay here and the ordinary drain does the rest.
    func place(projectID: String?, projectRoomID: String?, room: String?) {
        var stamp = venue ?? VenueStamp()
        stamp.projectId = projectID
        stamp.projectRoomId = projectRoomID
        if let room { stamp.room = room }
        venue = stamp
        if status == .committed { placementReplayPending = true }
        touch()
    }

    func inherit(_ context: CaptureSessionContext) {
        visitKind = context.kind
        visitKit = context.kit
        visitLabel = context.label
        visitStartedAt = context.kind == nil ? nil : context.startedAt
        visitEndedAt = context.endedAt
        if noteSettingRaw == nil, let kind = context.kind {
            noteSetting = CaptureVisitDraft(kind: kind, kit: context.kit).defaultNoteSetting
        }
    }
}
