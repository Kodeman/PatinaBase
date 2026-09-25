//
//  PatinaSchema.swift
//  Patina
//
//  The local store's schema, versioned, and the plan that carries an
//  installed app across a change to it.
//
//  Until this file existed the container was built from a bare
//  `Schema([...])` with no `SchemaMigrationPlan` and a `fatalError` on the
//  catch. A model added or a property renamed in build 2 would have met an
//  installed store SwiftData could not open by inference, and every tester
//  would have got a launch crash loop with no way out but a delete-and-
//  reinstall. Versioning the schema is what makes a stage writable when
//  inference is not enough; `PersistenceController`'s recovery path is what
//  makes even a failed stage survivable.
//
//  Every shipped version is FROZEN: its models are nested snapshot classes
//  that copy the stored properties as that version wrote them, and nothing
//  edits them again. The app's own classes are `PatinaSchemaCurrent`, which
//  must stay hash-for-hash equal to the latest version. A stage can only be
//  written between two shapes the code still holds, and a version that listed
//  the live classes would change shape under every tester's store the moment
//  one of them was edited (SQ-247 F2).
//
//  To change a stored property: add `PatinaSchemaV3` with snapshots of the
//  new shape, append it and its stage to `PatinaMigrationPlan`, and point
//  `PatinaSchemaCurrent.version` at it. `PatinaSchemaGoldenTests` pins every
//  version's entity hashes, so an edit that skips those steps fails a test.
//
//  A snapshot's `init` exists because `@Model` requires one. Nothing in the
//  app builds a snapshot; the plan reads their shape.
//

import Foundation
import SwiftData

/// The classes the app reads and writes, and the schema its container opens.
///
/// Not a version — a version is frozen and these are not. The container opens
/// them stamped with the latest version's identifier, after the plan has
/// carried an older store up to that version, so they must equal it exactly.
enum PatinaSchemaCurrent {
    static var version: any VersionedSchema.Type { PatinaSchemaV2.self }

    static var models: [any PersistentModel.Type] {
        [
            TableItemModel.self,
            RoomModel.self,
            SavedItem.self,
            StylePreferenceModel.self,
            SyncQueueItem.self,
            RoomScanPackage.self,
            DesignRequestDraft.self,
            SubmittedDesignRequest.self,
            BoardModel.self,
            CachedDirectionEdition.self
        ]
    }

    static var schema: Schema {
        Schema(models, version: version.versionIdentifier)
    }
}

/// The shipped schema: builds 1.0(3) and 1.0(4) wrote it. `BoardModel` is in
/// it — `CollectionsViewModel` fetches and inserts boards against this
/// container, and before V1 the container's schema did not contain the type
/// (C7-02).
///
/// Frozen from the model classes as build 1.0(4) (d5bb92251) shipped them.
/// A store older than V1 (build 1.0(2)) is not rescued by a V0 stage: it
/// lacks `RoomModel.budgetCents` and `measuredWithUnitControl` (SQ-247 probe
/// P3), and its exact shape was never recorded. Such a store is set aside.
enum PatinaSchemaV1: VersionedSchema {
    static var versionIdentifier: Schema.Version { Schema.Version(1, 0, 0) }

    static var models: [any PersistentModel.Type] {
        [
            TableItemModel.self,
            RoomModel.self,
            SavedItem.self,
            StylePreferenceModel.self,
            SyncQueueItem.self,
            RoomScanPackage.self,
            DesignRequestDraft.self,
            SubmittedDesignRequest.self,
            BoardModel.self
        ]
    }
}

/// V1 plus the cached shared direction (W1A-10, CONTRACT-C §C.2): one row per
/// approval edition an account has read. Every V1 model is carried unchanged —
/// the same frozen classes — so the stage below is lightweight: it adds a
/// table and touches no existing row. A tester's store keeps everything it
/// held.
enum PatinaSchemaV2: VersionedSchema {
    static var versionIdentifier: Schema.Version { Schema.Version(2, 0, 0) }

    static var models: [any PersistentModel.Type] {
        PatinaSchemaV1.models + [CachedDirectionEdition.self]
    }
}

/// Every version this app has shipped, oldest first, and the stages between
/// them. A new version is appended here with its stage; the plan is what
/// `ModelContainer` is given, so the stage list is not optional bookkeeping.
enum PatinaMigrationPlan: SchemaMigrationPlan {
    static var schemas: [any VersionedSchema.Type] {
        [PatinaSchemaV1.self, PatinaSchemaV2.self]
    }

    static var stages: [MigrationStage] {
        [.lightweight(fromVersion: PatinaSchemaV1.self, toVersion: PatinaSchemaV2.self)]
    }
}

// MARK: - V1, frozen

extension PatinaSchemaV1 {

    @Model
    final class TableItemModel {
        @Attribute(.unique) var id: UUID
        var name: String
        var productId: String?
        var imageURL: String?
        var savedAt: Date
        var positionX: Float
        var positionY: Float
        var rotation: Float
        var notes: String?
        var brandName: String?
        var priceInCents: Int?
        var roomId: UUID?
        var lastInteractedAt: Date?
        var viewCount: Int

        init() {
            id = UUID(); name = ""; savedAt = .distantPast
            positionX = 0; positionY = 0; rotation = 0; viewCount = 0
        }
    }

    @Model
    final class RoomModel {
        @Attribute(.unique) var id: UUID
        var name: String
        var roomType: String
        var hasBeenScanned: Bool
        var width: Double?
        var length: Double?
        var height: Double?
        var notes: String?
        var userRoomNotes: String = ""
        var createdAt: Date
        var updatedAt: Date
        var scanDataReference: String?
        var remoteId: String?
        var orientationRaw: String = ""
        var windowCount: Int = 0
        var doorCount: Int = 0
        var ceilingHeightFeet: Double?
        var lastScanConfidenceRaw: String = ""
        var budgetCents: Int?
        var measuredWithUnitControl: Bool = false
        @Relationship(deleteRule: .cascade, inverse: \SavedItem.room)
        var items: [SavedItem] = []
        var heroFrameData: Data?
        var heroFrameTimestamp: Date?
        var heroFrameScore: Float?
        var heroFrameId: UUID?
        var imageCollectionMetadata: Data?
        var imageCount: Int = 0
        var imageUrlsJson: Data?
        var savedItemCount: Int
        var hasActiveEmergence: Bool
        var emergenceMessage: String?
        var remoteScanId: UUID?
        var syncStatusRaw: String
        var lastSyncedAt: Date?

        init() {
            id = UUID(); name = ""; roomType = ""; hasBeenScanned = false
            createdAt = .distantPast; updatedAt = .distantPast
            savedItemCount = 0; hasActiveEmergence = false; syncStatusRaw = ""
        }
    }

    @Model
    final class SavedItem {
        @Attribute(.unique) var id: UUID
        var productId: String
        var productName: String
        var makerName: String
        var priceCents: Int
        var matchScore: Int
        var hasAR: Bool
        var thumbGradientKey: String
        var addedAt: Date
        var room: RoomModel?

        init() {
            id = UUID(); productId = ""; productName = ""; makerName = ""
            priceCents = 0; matchScore = 0; hasAR = false; thumbGradientKey = ""
            addedAt = .distantPast
        }
    }

    @Model
    final class StylePreferenceModel {
        @Attribute(.unique) var id: UUID
        var warmth: Double
        var formality: Double
        var materialsJSON: String
        var erasJSON: String
        var primaryColorsJSON: String
        var accentColorsJSON: String
        var patternPreference: Double
        var scalePreference: Double
        var keywordsJSON: String
        var confidence: Double
        var budgetRange: String?
        var createdAt: Date
        var updatedAt: Date

        init() {
            id = UUID(); warmth = 0; formality = 0
            materialsJSON = ""; erasJSON = ""; primaryColorsJSON = ""; accentColorsJSON = ""
            patternPreference = 0; scalePreference = 0; keywordsJSON = ""; confidence = 0
            createdAt = .distantPast; updatedAt = .distantPast
        }
    }

    @Model
    final class SyncQueueItem {
        @Attribute(.unique) var id: UUID
        var operationTypeRaw: String
        var roomScanId: UUID
        var roomId: UUID?
        var roomDataJSON: Data
        var styleSignalsJSON: Data
        var usdzData: Data?
        var thumbnailData: Data?
        var bundlePath: String?
        var statusRaw: String
        var retryCount: Int
        var lastError: String?
        var createdAt: Date
        var lastAttemptAt: Date?
        var syncedAt: Date?

        init() {
            id = UUID(); operationTypeRaw = ""; roomScanId = UUID()
            roomDataJSON = Data(); styleSignalsJSON = Data(); statusRaw = ""
            retryCount = 0; createdAt = .distantPast
        }
    }

    @Model
    final class RoomScanPackage {
        @Attribute(.unique) var scanId: UUID
        var roomLocalId: UUID
        var bundlePath: String
        var schemaVersion: Int
        var sizeBytes: Int
        var remoteRoomId: UUID?
        var createdAt: Date
        var updatedAt: Date
        var lastUploadAttemptAt: Date?
        var syncedAt: Date?
        var statusRaw: String
        var artifactStateJSON: Data
        var lastError: String?
        var userRoomNotes: String = ""
        var userProvidedRoomName: String?
        var reviewCompletedAt: Date?
        var diskSizeBudgetExempt: Bool = false
        var heroPhotoId: UUID?

        init() {
            scanId = UUID(); roomLocalId = UUID(); bundlePath = ""
            schemaVersion = 0; sizeBytes = 0
            createdAt = .distantPast; updatedAt = .distantPast
            statusRaw = ""; artifactStateJSON = Data()
        }
    }

    @Model
    final class DesignRequestDraft {
        @Attribute(.unique) var id: UUID
        var createdAt: Date
        var updatedAt: Date
        var phaseRaw: String
        var projectTypeRaw: String?
        var budgetRaw: String?
        var timelineRaw: String?
        var requestDescription: String
        var scanIdsJSON: Data
        var primaryScanId: UUID?
        var isRoomless: Bool = false
        var sourceRaw: String
        var leadId: UUID?
        var lastError: String?

        init() {
            id = UUID(); createdAt = .distantPast; updatedAt = .distantPast
            phaseRaw = ""; requestDescription = ""; scanIdsJSON = Data(); sourceRaw = ""
        }
    }

    @Model
    final class SubmittedDesignRequest {
        @Attribute(.unique) var leadId: UUID
        var homeownerId: UUID?
        var submittedAt: Date
        var projectTypeRaw: String?
        var scanCount: Int
        var pooledAtSubmit: Bool
        var lastKnownStatusRaw: String
        var designerId: UUID?
        var designerName: String?
        var studioName: String?
        var introducedAt: Date?
        var bookedSlotStartsAt: Date?
        var introThreadId: UUID?
        var dismissedAt: Date?
        var dismissedStageRaw: String?
        var lastRefreshedAt: Date?

        init() {
            leadId = UUID(); submittedAt = .distantPast
            scanCount = 0; pooledAtSubmit = false; lastKnownStatusRaw = ""
        }
    }

    @Model
    final class BoardModel {
        @Attribute(.unique) var id: UUID
        var name: String
        var itemIds: String
        var createdAt: Date
        var updatedAt: Date

        init(name: String) {
            id = UUID(); self.name = name; itemIds = "[]"
            createdAt = .distantPast; updatedAt = .distantPast
        }
    }
}

// MARK: - V2, frozen

extension PatinaSchemaV2 {

    @Model
    final class CachedDirectionEdition {
        #Unique<CachedDirectionEdition>([\.accountId, \.decisionId])

        var accountId: String
        var decisionId: String
        var projectId: String
        var authorityRevision: Int?
        var artifactChecksum: String
        var reviewJSON: Data
        var attachmentsJSON: Data?
        var editionFiguresJSON: Data?
        var servedAt: Date
        var manifestKey: String?
        var filesManifestKey: String?
        var availabilityRaw: String
        var missingAttachmentIds: [String]
        var committedBytes: Int

        init() {
            accountId = ""; decisionId = ""; projectId = ""; artifactChecksum = ""
            reviewJSON = Data(); servedAt = .distantPast; availabilityRaw = ""
            missingAttachmentIds = []; committedBytes = 0
        }
    }
}
