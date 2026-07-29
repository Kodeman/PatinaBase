//  Specimen.swift
//  CaptureKit
//
//  The capture record — the single editable unit the whole app revolves around
//  (C3/C5/V3). FROZEN SCHEMA: this and its children define CaptureStore.schema.
//  Adding nullable fields is safe; any other change is a versioned, foundation-
//  owner-only migration (VersionedSchema / SchemaMigrationPlan).

import Foundation
import SwiftData

/// Immutable identity stamp for locally persisted work.
///
/// The optional owner columns on persisted models exist for lightweight migration:
/// pre-Option-B rows decode as nil and remain quarantined. New authenticated work
/// receives both normalized values at creation and never changes owners.
public struct CaptureOwnerIdentity: Sendable, Hashable, Codable {
    public let userID: String
    public let workspaceID: String

    public init?(userID: String?, workspaceID: String?) {
        guard let userID = Self.normalize(userID),
              let workspaceID = Self.normalize(workspaceID) else { return nil }
        self.userID = userID
        self.workspaceID = workspaceID
    }

    public func matches(userID: String?, workspaceID: String?) -> Bool {
        Self.normalize(userID) == self.userID
            && Self.normalize(workspaceID) == self.workspaceID
    }

    private static func normalize(_ value: String?) -> String? {
        let normalized = value?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased() ?? ""
        return normalized.isEmpty ? nil : normalized
    }
}

@Model
public final class Specimen {
    @Attribute(.unique) public var id: UUID
    /// Device-stable idempotency key == backend `client_capture_id`. Set once at
    /// draft creation, NEVER regenerated (dedupes offline replay + share double-enqueue).
    public var clientToken: UUID
    public var createdAt: Date
    public var updatedAt: Date
    /// Immutable creation-time owner stamp. Nil only for legacy/quarantined rows.
    public private(set) var ownerUserID: String?
    public private(set) var ownerWorkspaceID: String?

    // ── Recognised / editable scalar fields ──
    public var title: String?
    public var maker: String?            // brand / vendor name
    public var sku: String?
    public var colorway: String?
    public var materialNote: String?
    public var finish: String?
    public var priceTradeCents: Int?
    public var priceRetailCents: Int?
    public var currencyCode: String?
    public var sourceURL: String?
    public var note: String?
    public var categoryRaw: String       // SpecimenCategory.rawValue

    // Tag/array attributes (smart-guess + manual)
    public var materials: [String]
    public var colors: [String]
    public var styleTags: [String]

    // ── Children (cascade) ──
    @Relationship(deleteRule: .cascade, inverse: \CapturePhoto.specimen)
    public var photos: [CapturePhoto]
    @Relationship(deleteRule: .cascade, inverse: \CaptureMeasurement.specimen)
    public var measurements: [CaptureMeasurement]

    // ── Voice (N4) ──
    public var voiceTranscript: String?
    public var voicePartialTranscript: String?
    public var voiceAudioFilename: String?      // relative path in App Group media dir
    public var voiceDurationSeconds: Double?

    // ── Codes (N2) — ["gtin:00123...", "url:https://...", "ean13:..."] ──
    public var scannedCodes: [String]
    public var catalogMatchRemoteId: String?

    // ── Per-field provenance: FieldKey.rawValue -> ProvenanceSource.rawValue ──
    public var provenanceRaw: [String: String]
    /// Smart-guess metadata: FieldKey.rawValue -> "confidence" (0...1, stored as String).
    public var guessConfidenceRaw: [String: Double]

    // ── Venue stamp (S1, F-08/F-09) ──
    public var venue: VenueStamp?

    // ── Routing + lifecycle + sync bookkeeping ──
    /// Visit-scoped capture grouping. Nil only for records created before Option B.
    public var captureSessionID: UUID?
    public var destinationRaw: String    // CaptureDestination.rawValue
    public var statusRaw: String         // CaptureStatus.rawValue
    public var lifecycleRaw: String      // CaptureLifecycle.State.rawValue
    public var remoteId: String?         // field_captures.id once committed
    public var committedProductId: String?
    public var lastSyncError: String?
    public var retryCount: Int
    public var uploadProgress: Int       // 0...100

    public init(
        id: UUID = UUID(),
        clientToken: UUID = UUID(),
        createdAt: Date = Date(),
        captureSessionID: UUID? = nil,
        owner: CaptureOwnerIdentity? = nil,
        categoryRaw: String = SpecimenCategory.unknown.rawValue,
        destinationRaw: String = CaptureDestination.undecided.rawValue,
        statusRaw: String = CaptureStatus.draft.rawValue,
        lifecycleRaw: String = "captured"
    ) {
        self.id = id
        self.clientToken = clientToken
        self.createdAt = createdAt
        self.updatedAt = createdAt
        self.ownerUserID = owner?.userID
        self.ownerWorkspaceID = owner?.workspaceID
        self.captureSessionID = captureSessionID
        self.categoryRaw = categoryRaw
        self.materials = []
        self.colors = []
        self.styleTags = []
        self.photos = []
        self.measurements = []
        self.scannedCodes = []
        self.provenanceRaw = [:]
        self.guessConfidenceRaw = [:]
        self.destinationRaw = destinationRaw
        self.statusRaw = statusRaw
        self.lifecycleRaw = lifecycleRaw
        self.retryCount = 0
        self.uploadProgress = 0
    }
}

@Model
public final class CapturePhoto {
    @Attribute(.unique) public var id: UUID
    public var filename: String          // HEIC, relative to App Group media dir
    public var thumbnailFilename: String?
    public var remotePath: String?       // capture-media storage path once uploaded
    public var publicURL: String?        // product-images display copy once uploaded
    public var width: Int
    public var height: Int
    public var isPrimary: Bool
    public var isDuplicate: Bool
    public var order: Int
    public var captureModeRaw: String    // CameraMode.rawValue
    public var createdAt: Date
    public var specimen: Specimen?

    public init(
        id: UUID = UUID(),
        filename: String,
        width: Int = 0,
        height: Int = 0,
        isPrimary: Bool = false,
        isDuplicate: Bool = false,
        order: Int = 0,
        captureModeRaw: String = CameraMode.photo.rawValue,
        createdAt: Date = Date()
    ) {
        self.id = id
        self.filename = filename
        self.width = width
        self.height = height
        self.isPrimary = isPrimary
        self.isDuplicate = isDuplicate
        self.order = order
        self.captureModeRaw = captureModeRaw
        self.createdAt = createdAt
    }
}

@Model
public final class CaptureMeasurement {
    @Attribute(.unique) public var id: UUID
    public var axisRaw: String           // MeasurementAxis.rawValue
    public var label: String?
    public var millimeters: Double
    public var sourceRaw: String         // MeasureSource.rawValue
    public var createdAt: Date
    public var specimen: Specimen?

    public init(
        id: UUID = UUID(),
        axisRaw: String,
        millimeters: Double,
        sourceRaw: String = MeasureSource.manual.rawValue,
        label: String? = nil,
        createdAt: Date = Date()
    ) {
        self.id = id
        self.axisRaw = axisRaw
        self.millimeters = millimeters
        self.sourceRaw = sourceRaw
        self.label = label
        self.createdAt = createdAt
    }
}

/// A project created inline (S2) and cached locally until it syncs.
@Model
public final class CaptureProjectRef {
    @Attribute(.unique) public var id: UUID
    public var remoteId: String?
    public var name: String
    public var createdAt: Date

    public init(id: UUID = UUID(), remoteId: String? = nil, name: String, createdAt: Date = Date()) {
        self.id = id
        self.remoteId = remoteId
        self.name = name
        self.createdAt = createdAt
    }
}
