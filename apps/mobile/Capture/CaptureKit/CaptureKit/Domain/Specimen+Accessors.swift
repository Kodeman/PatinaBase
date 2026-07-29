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

    func addMeasurement(axis: MeasurementAxis, millimeters: Double, source: MeasureSource) {
        let m = CaptureMeasurement(axisRaw: axis.rawValue, millimeters: millimeters, sourceRaw: source.rawValue)
        m.specimen = self
        measurements.append(m)
        provenanceRaw[FieldKey.dimensions.rawValue] =
            (source == .arkit ? ProvenanceSource.measure : ProvenanceSource.manual).rawValue
        touch()
    }

    func touch() { updatedAt = Date() }
}
