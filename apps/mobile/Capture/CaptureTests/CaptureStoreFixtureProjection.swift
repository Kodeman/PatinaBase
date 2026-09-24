//  CaptureStoreFixtureProjection.swift
//  CaptureTests
//
//  One persisted store, flattened to plain strings: every row of every entity
//  in `CaptureStore.schema`, keyed by its unique attribute, each row a map from
//  STORED ATTRIBUTE NAME to that attribute's JSON value.
//
//  The seed harness that wrote `Fixtures/Store-0.1-6` ran this projection
//  inside Patina Field 0.1 (6) (source b1447ba7d) to record what the shipped
//  build put on disk; the migration test runs it inside the current build to
//  read the same store back. The keys are string literals on purpose: they are
//  the names 0.1 (6) stored, and a Swift-side rename that forgets to carry the
//  stored name across still has to answer to the key the shipped build wrote.
//
//  One rename is deliberate. V2 stores 0.1 (6)'s `Specimen` rows as `Piece`,
//  and the photo and measurement `specimen` relationship as `piece`
//  (`CaptureSchemaV2`). This file projects them back under the shipped names,
//  so the V1 manifest checks the V1→V2 stage attribute by attribute. That is
//  the only difference from the seed's copy.
//
//  The file holds a projection and nothing else: no seeding, no assertions.

import CryptoKit
import Foundation
import SwiftData
@testable import CaptureKit

enum StoreFixtureProjection {
    typealias Row = [String: String]

    /// The SwiftData entity names 0.1 (6) stored, which key the manifest.
    static let entityNames = [
        "Specimen", "CapturePhoto", "CaptureMeasurement", "CaptureProjectRef",
        "ScanUploadRecord", "SiteRequestOutboxRecord", "FieldVisitCloseRecord",
        "TimeEntryOutboxRecord"
    ]

    /// The entity a shipped name is stored as today (V1→V2 renamed one).
    static func storedEntityName(_ shipped: String) -> String {
        shipped == "Specimen" ? "Piece" : shipped
    }

    /// JSON, sorted keys, so two runs of either build print the same text.
    /// Dates encode as `timeIntervalSinceReferenceDate`, which is exactly what
    /// the store holds; `Data` encodes as base64.
    static func value<T: Encodable>(_ value: T) -> String {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        guard let data = try? encoder.encode(value) else { return "<unencodable>" }
        return String(decoding: data, as: UTF8.self)
    }

    static func sha256(_ data: Data) -> String {
        SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }

    static func specimen(_ row: Piece) -> Row {
        [
            "id": value(row.id),
            "clientToken": value(row.clientToken),
            "createdAt": value(row.createdAt),
            "updatedAt": value(row.updatedAt),
            "ownerUserID": value(row.ownerUserID),
            "ownerWorkspaceID": value(row.ownerWorkspaceID),
            "title": value(row.title),
            "maker": value(row.maker),
            "sku": value(row.sku),
            "colorway": value(row.colorway),
            "materialNote": value(row.materialNote),
            "finish": value(row.finish),
            "priceTradeCents": value(row.priceTradeCents),
            "priceRetailCents": value(row.priceRetailCents),
            "currencyCode": value(row.currencyCode),
            "sourceURL": value(row.sourceURL),
            "note": value(row.note),
            "categoryRaw": value(row.categoryRaw),
            "materials": value(row.materials),
            "colors": value(row.colors),
            "styleTags": value(row.styleTags),
            "photos": value(row.photos.map(\.id.uuidString).sorted()),
            "measurements": value(row.measurements.map(\.id.uuidString).sorted()),
            "voiceTranscript": value(row.voiceTranscript),
            "voicePartialTranscript": value(row.voicePartialTranscript),
            "voiceAudioFilename": value(row.voiceAudioFilename),
            "voiceAudioSegmentsRaw": value(row.voiceAudioSegmentsRaw),
            "voiceAudioRemotePathsRaw": value(row.voiceAudioRemotePathsRaw),
            "voiceTranscriptSourceRaw": value(row.voiceTranscriptSourceRaw),
            "captureKindRaw": value(row.captureKindRaw),
            "voiceDurationSeconds": value(row.voiceDurationSeconds),
            "scannedCodes": value(row.scannedCodes),
            "catalogMatchRemoteId": value(row.catalogMatchRemoteId),
            "provenanceRaw": value(row.provenanceRaw),
            "guessConfidenceRaw": value(row.guessConfidenceRaw),
            "venue": value(row.venue),
            "captureSessionID": value(row.captureSessionID),
            "destinationRaw": value(row.destinationRaw),
            "statusRaw": value(row.statusRaw),
            "lifecycleRaw": value(row.lifecycleRaw),
            "remoteId": value(row.remoteId),
            "committedProductId": value(row.committedProductId),
            "lastSyncError": value(row.lastSyncError),
            "retryCount": value(row.retryCount),
            "uploadProgress": value(row.uploadProgress),
            "placementProjectId": value(row.placementProjectId),
            "placementRoomId": value(row.placementRoomId),
            "placementSlotId": value(row.placementSlotId),
            "placementCategory": value(row.placementCategory),
            "placementStateRaw": value(row.placementStateRaw),
            "placementFFEItemId": value(row.placementFFEItemId),
            "placementSpecId": value(row.placementSpecId),
            "placementLastError": value(row.placementLastError),
            "placementRetryCount": value(row.placementRetryCount),
            "marginNoteId": value(row.marginNoteId),
            "marginNoteBodyRaw": value(row.marginNoteBodyRaw),
            "marginNoteStateRaw": value(row.marginNoteStateRaw),
            "marginNoteLastError": value(row.marginNoteLastError),
            "marginNoteRetryCount": value(row.marginNoteRetryCount),
            "punchTaskId": value(row.punchTaskId),
            "punchTaskPartyId": value(row.punchTaskPartyId),
            "punchTaskOwnerRaw": value(row.punchTaskOwnerRaw),
            "punchTaskStateRaw": value(row.punchTaskStateRaw),
            "punchTaskLastError": value(row.punchTaskLastError),
            "punchTaskRetryCount": value(row.punchTaskRetryCount),
            "degradeNoteId": value(row.degradeNoteId),
            "degradeNoteBodyRaw": value(row.degradeNoteBodyRaw),
            "degradeNoteStateRaw": value(row.degradeNoteStateRaw),
            "degradeNoteLastError": value(row.degradeNoteLastError),
            "degradeNoteRetryCount": value(row.degradeNoteRetryCount),
            "fieldWriteAttentionRaw": value(row.fieldWriteAttentionRaw),
            "visitKindRaw": value(row.visitKindRaw),
            "visitKitRaw": value(row.visitKitRaw),
            "visitLabel": value(row.visitLabel),
            "visitStartedAt": value(row.visitStartedAt),
            "visitEndedAt": value(row.visitEndedAt),
            "noteSettingRaw": value(row.noteSettingRaw),
            "suggestedProjectID": value(row.suggestedProjectID),
            "suggestedProjectRoomID": value(row.suggestedProjectRoomID),
            "suggestionBasisRaw": value(row.suggestionBasisRaw),
            "suggestionConfidence": value(row.suggestionConfidence),
            "suggestionReasonRaw": value(row.suggestionReasonRaw),
            "placementReplayPending": value(row.placementReplayPending),
            "placementEventEmitted": value(row.placementEventEmitted)
        ]
    }

    static func photo(_ row: CapturePhoto) -> Row {
        [
            "id": value(row.id),
            "filename": value(row.filename),
            "thumbnailFilename": value(row.thumbnailFilename),
            "remotePath": value(row.remotePath),
            "publicURL": value(row.publicURL),
            "width": value(row.width),
            "height": value(row.height),
            "isPrimary": value(row.isPrimary),
            "isDuplicate": value(row.isDuplicate),
            "order": value(row.order),
            "captureModeRaw": value(row.captureModeRaw),
            "createdAt": value(row.createdAt),
            "specimen": value(row.piece?.id)
        ]
    }

    static func measurement(_ row: CaptureMeasurement) -> Row {
        [
            "id": value(row.id),
            "axisRaw": value(row.axisRaw),
            "label": value(row.label),
            "millimeters": value(row.millimeters),
            "sourceRaw": value(row.sourceRaw),
            "createdAt": value(row.createdAt),
            "specimen": value(row.piece?.id)
        ]
    }

    static func projectRef(_ row: CaptureProjectRef) -> Row {
        [
            "id": value(row.id),
            "remoteId": value(row.remoteId),
            "name": value(row.name),
            "createdAt": value(row.createdAt),
            "ownerUserID": value(row.ownerUserID),
            "ownerWorkspaceID": value(row.ownerWorkspaceID),
            "specRoomsData": value(row.specRoomsData),
            "roomsData": value(row.roomsData),
            "lastRefreshedAt": value(row.lastRefreshedAt),
            "lastVisitedAt": value(row.lastVisitedAt),
            "lastFiledLatitude": value(row.lastFiledLatitude),
            "lastFiledLongitude": value(row.lastFiledLongitude),
            "filedCaptureCount": value(row.filedCaptureCount)
        ]
    }

    static func scanUpload(_ row: ScanUploadRecord) -> Row {
        [
            "bundlePath": value(row.bundlePath),
            "scanID": value(row.scanID),
            "roomID": value(row.roomID),
            "ownerUserID": value(row.ownerUserID),
            "ownerWorkspaceID": value(row.ownerWorkspaceID),
            "name": value(row.name),
            "projectID": value(row.projectID),
            "projectRoomID": value(row.projectRoomID),
            "scanSchemaVersion": value(row.scanSchemaVersion),
            "artifacts": value(row.artifacts),
            "statusRaw": value(row.statusRaw),
            "lastError": value(row.lastError),
            "retryCount": value(row.retryCount),
            "receiptID": value(row.receiptID),
            "createdAt": value(row.createdAt),
            "updatedAt": value(row.updatedAt)
        ]
    }

    static func siteRequest(_ row: SiteRequestOutboxRecord) -> Row {
        [
            "clientDeliveryID": value(row.clientDeliveryID),
            "requestID": value(row.requestID),
            "itemID": value(row.itemID),
            "itemVersionID": value(row.itemVersionID),
            "payloadPath": value(row.payloadPath),
            "mediaPaths": value(row.mediaPaths),
            "checksumSHA256": value(row.checksumSHA256),
            "stateRaw": value(row.stateRaw),
            "retryCount": value(row.retryCount),
            "nextAttemptAt": value(row.nextAttemptAt),
            "lastError": value(row.lastError),
            "serverDeliverableID": value(row.serverDeliverableID),
            "terminalReasonRaw": value(row.terminalReasonRaw),
            "createdAt": value(row.createdAt),
            "updatedAt": value(row.updatedAt)
        ]
    }

    static func visitClose(_ row: FieldVisitCloseRecord) -> Row {
        [
            "visitID": value(row.visitID),
            "timeEntryID": value(row.timeEntryID),
            "projectID": value(row.projectID),
            "ownerUserID": value(row.ownerUserID),
            "startedAt": value(row.startedAt),
            "endedAt": value(row.endedAt),
            "durationMinutes": value(row.durationMinutes),
            "billable": value(row.billable),
            "stateRaw": value(row.stateRaw),
            "lastError": value(row.lastError),
            "retryCount": value(row.retryCount),
            "nextAttemptAt": value(row.nextAttemptAt)
        ]
    }

    static func timeEntry(_ row: TimeEntryOutboxRecord) -> Row {
        [
            "entryID": value(row.entryID),
            "projectID": value(row.projectID),
            "ownerUserID": value(row.ownerUserID),
            "startedAt": value(row.startedAt),
            "durationMinutes": value(row.durationMinutes),
            "activityRaw": value(row.activityRaw),
            "billable": value(row.billable),
            "notes": value(row.notes),
            "rateRoleRaw": value(row.rateRoleRaw),
            "source": value(row.source),
            "createdAt": value(row.createdAt),
            "stateRaw": value(row.stateRaw),
            "lastError": value(row.lastError),
            "retryCount": value(row.retryCount),
            "nextAttemptAt": value(row.nextAttemptAt)
        ]
    }

    /// Every row in the store: entity name → unique key → row.
    @MainActor
    static func snapshot(_ context: ModelContext) throws -> [String: [String: Row]] {
        func keyed<T: PersistentModel>(_ type: T.Type,
                                        key: (T) -> String,
                                        project: (T) -> Row) throws -> [String: Row] {
            let rows = try context.fetch(FetchDescriptor<T>())
            return Dictionary(uniqueKeysWithValues: rows.map { (key($0), project($0)) })
        }
        return [
            "Specimen": try keyed(Piece.self, key: { $0.id.uuidString }, project: specimen),
            "CapturePhoto": try keyed(CapturePhoto.self, key: { $0.id.uuidString }, project: photo),
            "CaptureMeasurement": try keyed(CaptureMeasurement.self,
                                            key: { $0.id.uuidString }, project: measurement),
            "CaptureProjectRef": try keyed(CaptureProjectRef.self,
                                           key: { $0.id.uuidString }, project: projectRef),
            "ScanUploadRecord": try keyed(ScanUploadRecord.self,
                                          key: { $0.bundlePath }, project: scanUpload),
            "SiteRequestOutboxRecord": try keyed(SiteRequestOutboxRecord.self,
                                                 key: { $0.clientDeliveryID.uuidString },
                                                 project: siteRequest),
            "FieldVisitCloseRecord": try keyed(FieldVisitCloseRecord.self,
                                               key: { $0.visitID.uuidString }, project: visitClose),
            "TimeEntryOutboxRecord": try keyed(TimeEntryOutboxRecord.self,
                                               key: { $0.entryID.uuidString }, project: timeEntry)
        ]
    }

    /// Two JSON values are the same value — equal text, or equal once parsed, so
    /// a number the runtime prints differently still compares by value.
    static func sameValue(_ lhs: String, _ rhs: String) -> Bool {
        if lhs == rhs { return true }
        let parse = { (text: String) -> NSObject? in
            (try? JSONSerialization.jsonObject(with: Data(text.utf8),
                                               options: .fragmentsAllowed)) as? NSObject
        }
        guard let left = parse(lhs), let right = parse(rhs) else { return false }
        return left.isEqual(right)
    }
}

/// What the seed harness wrote beside the store, and what the migration test
/// checks the store against.
struct StoreFixtureManifest: Codable {
    var sourceCommit: String
    var build: String
    var storeRung: String
    var storeFilename: String
    var seededStorePath: String
    var seededMediaPath: String
    /// entity name → unique key → stored attribute → JSON value.
    var rows: [String: [String: [String: String]]]
    /// filename in `CaptureMedia/` → SHA-256 of its bytes.
    var media: [String: String]
    /// unique key → what the seed made that row, in words.
    var labels: [String: String]
    /// query name → the unique keys the shipped build's own query returned.
    var queries: [String: [String]]
}
