//  ReceivingInspectionViewModel.swift
//  Capture · Wave G (Receiving / goods-in)
//
//  Owns G2 (photo capture + notes) and G3 (outcome + submit) state for one
//  `.receivingInspection(poID:)` sheet visit. Photos upload as soon as they're
//  picked — each tracked through its own `UploadState` — so a failure is
//  visible and retriable per-photo instead of only surfacing at submit time
//  (the reference's all-at-submit-time upload aborts the whole thing on one
//  failure; this is a deliberate v1 improvement called out by the brief).
//  Photos/notes/outcome all live here so nothing is lost across a G2⇄G3 step
//  change or a failed submit.

import Foundation
import UIKit
import CaptureKit

@Observable
@MainActor
final class ReceivingInspectionViewModel {
    enum Step {
        case inspection
        case outcome
    }

    enum UploadState: Equatable {
        case uploading
        case uploaded(assetRef: String)
        case failed(String)
    }

    struct PendingPhoto: Identifiable {
        let id = UUID()
        let data: Data
        let thumbnail: UIImage?
        var state: UploadState
    }

    let poID: String
    private let receiving: any ReceivingService

    var step: Step = .inspection

    // PO header (resolved from the arriving list — the sheet only carries poID).
    var poSummary: FieldArrivingPO?
    var isLoadingSummary = false

    // G2 — photos + notes.
    let maxPhotos = 3
    var photos: [PendingPhoto] = []
    var notes = ""

    // G3 — outcome + submit.
    var outcome: FieldInspectionOutcome?
    var damageDescription = ""
    var isSubmitting = false
    var submitError: String?
    var didSubmit = false

    init(poID: String, receiving: any ReceivingService) {
        self.poID = poID
        self.receiving = receiving
    }

    // MARK: - PO summary

    /// `arrivingPOs()` is the only read the frozen `ReceivingService` exposes,
    /// so the header re-fetches the (small) arriving list and matches by id
    /// rather than the sheet carrying a cached row across presentation.
    func loadSummary() async {
        isLoadingSummary = true
        defer { isLoadingSummary = false }
        poSummary = try? await receiving.arrivingPOs().first { $0.id == poID }
    }

    // MARK: - Photos (G2)

    func addPhoto(data: Data) {
        guard photos.count < maxPhotos else { return }
        let photo = PendingPhoto(data: data, thumbnail: UIImage(data: data), state: .uploading)
        photos.append(photo)
        Task { await self.upload(photoID: photo.id) }
    }

    func retryUpload(photoID: UUID) {
        guard let index = photos.firstIndex(where: { $0.id == photoID }) else { return }
        photos[index].state = .uploading
        Task { await self.upload(photoID: photoID) }
    }

    func removePhoto(photoID: UUID) {
        photos.removeAll { $0.id == photoID }
    }

    private func upload(photoID: UUID) async {
        guard let data = photos.first(where: { $0.id == photoID })?.data else { return }
        do {
            let ref = try await receiving.uploadInspectionPhoto(data, poID: poID)
            setPhotoState(photoID, .uploaded(assetRef: ref))
        } catch {
            setPhotoState(photoID, .failed(error.localizedDescription))
        }
    }

    private func setPhotoState(_ photoID: UUID, _ state: UploadState) {
        guard let index = photos.firstIndex(where: { $0.id == photoID }) else { return }
        photos[index].state = state
    }

    var isAnyPhotoBusyOrFailed: Bool {
        photos.contains {
            switch $0.state {
            case .uploading, .failed: return true
            case .uploaded: return false
            }
        }
    }

    // MARK: - Outcome + submit (G3)
    //
    // The screen only ever writes one of the three DB-representable outcomes
    // (receiving_inspection_outcome, migration 00150) into `outcome` — G3 never
    // offers `.refused` a button. `canSubmit` still guards it defensively below.

    var requiresDamageDescription: Bool { outcome == .damaged || outcome == .partial }

    var canSubmit: Bool {
        guard let outcome, outcome != .refused, !isSubmitting, !isAnyPhotoBusyOrFailed else { return false }
        guard outcome == .damaged || outcome == .partial else { return true }
        return !damageDescription.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    func submit() async {
        guard canSubmit, let outcome else { return }
        isSubmitting = true
        submitError = nil
        defer { isSubmitting = false }

        let refs: [String] = photos.compactMap {
            if case let .uploaded(ref) = $0.state { return ref }
            return nil
        }
        let trimmedNotes = notes.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedDamage = damageDescription.trimmingCharacters(in: .whitespacesAndNewlines)
        let submission = FieldInspectionSubmission(
            poID: poID,
            outcome: outcome,
            notes: trimmedNotes.isEmpty ? nil : trimmedNotes,
            photoRefs: refs,
            damageDescription: requiresDamageDescription ? trimmedDamage : nil
        )

        do {
            try await receiving.submitInspection(submission)
            didSubmit = true
        } catch {
            submitError = error.localizedDescription
        }
    }
}
