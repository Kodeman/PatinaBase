//  PieceMigrationCarry.swift
//  CaptureKit
//
//  How V1's `Specimen` rows become V2's `Piece` rows with nothing lost.
//
//  SwiftData renames an attribute or a relationship inside a lightweight stage
//  (`originalName:`), but it has no entity rename: `@Model` takes no arguments
//  and `Schema.Entity` carries no renaming identifier (checked against the
//  iOS 27 SDK's SwiftData.swiftinterface). A lightweight V1→V2 stage would infer
//  "Specimen removed, Piece added" and drop every capture on the phone. So the
//  stage is custom and carries the rows across itself:
//
//  1. `write(from:)`, the stage's willMigrate, runs while the store is still V1.
//     It reads every Specimen — every stored attribute, and the ids of its
//     photos and measurements — and writes them atomically to a file beside
//     the store (`carryURL(beside:)`).
//  2. The stage's own step then drops the Specimen table, keeps every other
//     table and row, and adds Piece and the children's `piece` column.
//  3. `restorePending(into:storeURL:)` inserts a Piece for every carried row not
//     already there, relinks its photos and measurements by id, saves once, and
//     only then deletes the file. `CaptureStore.makeContainer` runs it after
//     EVERY open, not from didMigrate.
//
//  Running step 3 on every open is what makes the carry crash-safe. A launch
//  killed between steps 2 and 3 leaves a V2 store without its pieces, and no
//  stage will ever run on it again; the next open finishes from the file. Step 3
//  is idempotent. The file is part of the store until it is gone:
//  `CaptureStore.storeFileTrio` lists it, so a store the ladder sets aside takes
//  its pending carry into the recovery folder with it.

import Foundation
import OSLog
import SwiftData

struct PieceMigrationCarry: Codable {
    /// One V1 Specimen, every stored attribute under its stored name.
    struct Row: Codable {
        var id: UUID
        var clientToken: UUID
        var createdAt: Date
        var updatedAt: Date
        var ownerUserID: String?
        var ownerWorkspaceID: String?
        var title: String?
        var maker: String?
        var sku: String?
        var colorway: String?
        var materialNote: String?
        var finish: String?
        var priceTradeCents: Int?
        var priceRetailCents: Int?
        var currencyCode: String?
        var sourceURL: String?
        var note: String?
        var categoryRaw: String
        var materials: [String]
        var colors: [String]
        var styleTags: [String]
        var voiceTranscript: String?
        var voicePartialTranscript: String?
        var voiceAudioFilename: String?
        var voiceAudioSegmentsRaw: [String]?
        var voiceAudioRemotePathsRaw: [String]?
        var voiceTranscriptSourceRaw: String?
        var captureKindRaw: String?
        var voiceDurationSeconds: Double?
        var scannedCodes: [String]
        var catalogMatchRemoteId: String?
        /// Carried verbatim. A V1 `.manual` cannot be told apart from an
        /// accepted guess V1 promoted to `.manual`, so it stays `.manual`.
        var provenanceRaw: [String: String]
        var guessConfidenceRaw: [String: Double]
        var venue: VenueStamp?
        var captureSessionID: UUID?
        var destinationRaw: String
        var statusRaw: String
        var lifecycleRaw: String
        var remoteId: String?
        var committedProductId: String?
        var lastSyncError: String?
        var retryCount: Int
        var uploadProgress: Int
        var placementProjectId: String?
        var placementRoomId: String?
        var placementSlotId: String?
        var placementCategory: String?
        var placementStateRaw: String?
        var placementFFEItemId: String?
        var placementSpecId: String?
        var placementLastError: String?
        var placementRetryCount: Int?
        var marginNoteId: String?
        var marginNoteBodyRaw: String?
        var marginNoteStateRaw: String?
        var marginNoteLastError: String?
        var marginNoteRetryCount: Int?
        var punchTaskId: String?
        var punchTaskPartyId: String?
        var punchTaskOwnerRaw: String?
        var punchTaskStateRaw: String?
        var punchTaskLastError: String?
        var punchTaskRetryCount: Int?
        var degradeNoteId: String?
        var degradeNoteBodyRaw: String?
        var degradeNoteStateRaw: String?
        var degradeNoteLastError: String?
        var degradeNoteRetryCount: Int?
        var fieldWriteAttentionRaw: String?
        var visitKindRaw: String?
        var visitKitRaw: String?
        var visitLabel: String?
        var visitStartedAt: Date?
        var visitEndedAt: Date?
        var noteSettingRaw: String?
        var suggestedProjectID: String?
        var suggestedProjectRoomID: String?
        var suggestionBasisRaw: String?
        var suggestionConfidence: Double?
        var suggestionReasonRaw: String?
        var placementReplayPending: Bool?
        var placementEventEmitted: Bool?
        /// The two relationships, by the children's ids: the V1 foreign key does
        /// not survive the stage, so this is how each child finds its piece.
        var photoIDs: [UUID]
        var measurementIDs: [UUID]
    }

    var rows: [Row]

    enum CarryError: Error {
        /// The migrating store has no file URL, so there is nowhere to carry the
        /// rows. Thrown BEFORE the stage drops anything: the open fails and the
        /// ladder sets the V1 store aside whole.
        case noStoreURL
    }

    private static let log = Logger(subsystem: "cloud.patina.field", category: "store")

    /// Beside the store, named like its `-wal` and `-shm`.
    static func carryURL(beside storeURL: URL) -> URL {
        URL(fileURLWithPath: storeURL.path + "-specimen-carry.json")
    }

    // MARK: - Step 1: the stage's willMigrate, on the V1 store

    static func write(from context: ModelContext) throws {
        guard let storeURL = context.container.configurations.first?.url else {
            throw CarryError.noStoreURL
        }
        let specimens = try context.fetch(FetchDescriptor<CaptureSchemaV1.Specimen>())
        let carry = PieceMigrationCarry(rows: specimens.map(Row.init))
        try JSONEncoder().encode(carry).write(to: carryURL(beside: storeURL), options: .atomic)
        log.notice("Carrying \(carry.rows.count) specimen row(s) across the V1→V2 stage")
    }

    // MARK: - Step 3: after every open

    /// Finishes a carry the stage started, or does nothing when there is none.
    /// A failure leaves the file where it is for the next open to retry; it
    /// never fails the open, since the store itself is sound.
    @MainActor
    static func restorePending(into container: ModelContainer, storeURL: URL) {
        let url = carryURL(beside: storeURL)
        guard FileManager.default.fileExists(atPath: url.path) else { return }
        do {
            let carry = try JSONDecoder().decode(Self.self, from: Data(contentsOf: url))
            try restore(carry, into: ModelContext(container))
            try FileManager.default.removeItem(at: url)
            log.notice("Restored \(carry.rows.count) carried specimen row(s) as pieces")
        } catch {
            log.error("""
                Carried specimen rows at \(url.path, privacy: .public) not restored yet \
                (\(error.localizedDescription, privacy: .public)); kept for the next open
                """)
        }
    }

    static func restore(_ carry: PieceMigrationCarry, into context: ModelContext) throws {
        let present = Set(try context.fetch(FetchDescriptor<CaptureSchemaV2.Piece>()).map(\.id))
        let photos = Dictionary(
            try context.fetch(FetchDescriptor<CaptureSchemaV2.CapturePhoto>()).map { ($0.id, $0) },
            uniquingKeysWith: { first, _ in first })
        let measurements = Dictionary(
            try context.fetch(FetchDescriptor<CaptureSchemaV2.CaptureMeasurement>()).map { ($0.id, $0) },
            uniquingKeysWith: { first, _ in first })

        for row in carry.rows where !present.contains(row.id) {
            let piece = row.makePiece()
            context.insert(piece)
            for id in row.photoIDs { photos[id]?.piece = piece }
            for id in row.measurementIDs { measurements[id]?.piece = piece }
        }
        try context.save()
    }
}

extension PieceMigrationCarry.Row {
    // One line per stored attribute, every one of them; splitting it only
    // hides which one is missing.
    // swiftlint:disable:next function_body_length
    init(_ s: CaptureSchemaV1.Specimen) {
        id = s.id
        clientToken = s.clientToken
        createdAt = s.createdAt
        updatedAt = s.updatedAt
        ownerUserID = s.ownerUserID
        ownerWorkspaceID = s.ownerWorkspaceID
        title = s.title
        maker = s.maker
        sku = s.sku
        colorway = s.colorway
        materialNote = s.materialNote
        finish = s.finish
        priceTradeCents = s.priceTradeCents
        priceRetailCents = s.priceRetailCents
        currencyCode = s.currencyCode
        sourceURL = s.sourceURL
        note = s.note
        categoryRaw = s.categoryRaw
        materials = s.materials
        colors = s.colors
        styleTags = s.styleTags
        voiceTranscript = s.voiceTranscript
        voicePartialTranscript = s.voicePartialTranscript
        voiceAudioFilename = s.voiceAudioFilename
        voiceAudioSegmentsRaw = s.voiceAudioSegmentsRaw
        voiceAudioRemotePathsRaw = s.voiceAudioRemotePathsRaw
        voiceTranscriptSourceRaw = s.voiceTranscriptSourceRaw
        captureKindRaw = s.captureKindRaw
        voiceDurationSeconds = s.voiceDurationSeconds
        scannedCodes = s.scannedCodes
        catalogMatchRemoteId = s.catalogMatchRemoteId
        provenanceRaw = s.provenanceRaw
        guessConfidenceRaw = s.guessConfidenceRaw
        venue = s.venue
        captureSessionID = s.captureSessionID
        destinationRaw = s.destinationRaw
        statusRaw = s.statusRaw
        lifecycleRaw = s.lifecycleRaw
        remoteId = s.remoteId
        committedProductId = s.committedProductId
        lastSyncError = s.lastSyncError
        retryCount = s.retryCount
        uploadProgress = s.uploadProgress
        placementProjectId = s.placementProjectId
        placementRoomId = s.placementRoomId
        placementSlotId = s.placementSlotId
        placementCategory = s.placementCategory
        placementStateRaw = s.placementStateRaw
        placementFFEItemId = s.placementFFEItemId
        placementSpecId = s.placementSpecId
        placementLastError = s.placementLastError
        placementRetryCount = s.placementRetryCount
        marginNoteId = s.marginNoteId
        marginNoteBodyRaw = s.marginNoteBodyRaw
        marginNoteStateRaw = s.marginNoteStateRaw
        marginNoteLastError = s.marginNoteLastError
        marginNoteRetryCount = s.marginNoteRetryCount
        punchTaskId = s.punchTaskId
        punchTaskPartyId = s.punchTaskPartyId
        punchTaskOwnerRaw = s.punchTaskOwnerRaw
        punchTaskStateRaw = s.punchTaskStateRaw
        punchTaskLastError = s.punchTaskLastError
        punchTaskRetryCount = s.punchTaskRetryCount
        degradeNoteId = s.degradeNoteId
        degradeNoteBodyRaw = s.degradeNoteBodyRaw
        degradeNoteStateRaw = s.degradeNoteStateRaw
        degradeNoteLastError = s.degradeNoteLastError
        degradeNoteRetryCount = s.degradeNoteRetryCount
        fieldWriteAttentionRaw = s.fieldWriteAttentionRaw
        visitKindRaw = s.visitKindRaw
        visitKitRaw = s.visitKitRaw
        visitLabel = s.visitLabel
        visitStartedAt = s.visitStartedAt
        visitEndedAt = s.visitEndedAt
        noteSettingRaw = s.noteSettingRaw
        suggestedProjectID = s.suggestedProjectID
        suggestedProjectRoomID = s.suggestedProjectRoomID
        suggestionBasisRaw = s.suggestionBasisRaw
        suggestionConfidence = s.suggestionConfidence
        suggestionReasonRaw = s.suggestionReasonRaw
        placementReplayPending = s.placementReplayPending
        placementEventEmitted = s.placementEventEmitted
        photoIDs = s.photos.map(\.id)
        measurementIDs = s.measurements.map(\.id)
    }

    /// A V2 Piece holding every carried value. New V2 facts (confirmation,
    /// proposals) start empty: V1 never recorded them.
    func makePiece() -> CaptureSchemaV2.Piece { // swiftlint:disable:this function_body_length
        let p = CaptureSchemaV2.Piece(
            id: id, clientToken: clientToken, createdAt: createdAt,
            captureSessionID: captureSessionID, owner: nil, categoryRaw: categoryRaw,
            destinationRaw: destinationRaw, statusRaw: statusRaw, lifecycleRaw: lifecycleRaw)
        p.restoreOwnerStamp(userID: ownerUserID, workspaceID: ownerWorkspaceID)
        p.title = title
        p.maker = maker
        p.sku = sku
        p.colorway = colorway
        p.materialNote = materialNote
        p.finish = finish
        p.priceTradeCents = priceTradeCents
        p.priceRetailCents = priceRetailCents
        p.currencyCode = currencyCode
        p.sourceURL = sourceURL
        p.note = note
        p.materials = materials
        p.colors = colors
        p.styleTags = styleTags
        p.voiceTranscript = voiceTranscript
        p.voicePartialTranscript = voicePartialTranscript
        p.voiceAudioFilename = voiceAudioFilename
        p.voiceAudioSegmentsRaw = voiceAudioSegmentsRaw
        p.voiceAudioRemotePathsRaw = voiceAudioRemotePathsRaw
        p.voiceTranscriptSourceRaw = voiceTranscriptSourceRaw
        p.captureKindRaw = captureKindRaw
        p.voiceDurationSeconds = voiceDurationSeconds
        p.scannedCodes = scannedCodes
        p.catalogMatchRemoteId = catalogMatchRemoteId
        p.provenanceRaw = provenanceRaw
        p.guessConfidenceRaw = guessConfidenceRaw
        p.venue = venue
        p.remoteId = remoteId
        p.committedProductId = committedProductId
        p.lastSyncError = lastSyncError
        p.retryCount = retryCount
        p.uploadProgress = uploadProgress
        p.placementProjectId = placementProjectId
        p.placementRoomId = placementRoomId
        p.placementSlotId = placementSlotId
        p.placementCategory = placementCategory
        p.placementStateRaw = placementStateRaw
        p.placementFFEItemId = placementFFEItemId
        p.placementSpecId = placementSpecId
        p.placementLastError = placementLastError
        p.placementRetryCount = placementRetryCount
        p.marginNoteId = marginNoteId
        p.marginNoteBodyRaw = marginNoteBodyRaw
        p.marginNoteStateRaw = marginNoteStateRaw
        p.marginNoteLastError = marginNoteLastError
        p.marginNoteRetryCount = marginNoteRetryCount
        p.punchTaskId = punchTaskId
        p.punchTaskPartyId = punchTaskPartyId
        p.punchTaskOwnerRaw = punchTaskOwnerRaw
        p.punchTaskStateRaw = punchTaskStateRaw
        p.punchTaskLastError = punchTaskLastError
        p.punchTaskRetryCount = punchTaskRetryCount
        p.degradeNoteId = degradeNoteId
        p.degradeNoteBodyRaw = degradeNoteBodyRaw
        p.degradeNoteStateRaw = degradeNoteStateRaw
        p.degradeNoteLastError = degradeNoteLastError
        p.degradeNoteRetryCount = degradeNoteRetryCount
        p.fieldWriteAttentionRaw = fieldWriteAttentionRaw
        p.visitKindRaw = visitKindRaw
        p.visitKitRaw = visitKitRaw
        p.visitLabel = visitLabel
        p.visitStartedAt = visitStartedAt
        p.visitEndedAt = visitEndedAt
        p.noteSettingRaw = noteSettingRaw
        p.suggestedProjectID = suggestedProjectID
        p.suggestedProjectRoomID = suggestedProjectRoomID
        p.suggestionBasisRaw = suggestionBasisRaw
        p.suggestionConfidence = suggestionConfidence
        p.suggestionReasonRaw = suggestionReasonRaw
        p.placementReplayPending = placementReplayPending
        p.placementEventEmitted = placementEventEmitted
        // Last: the init stamped updatedAt = createdAt.
        p.updatedAt = updatedAt
        return p
    }
}
