//  Specimen.swift
//  CaptureKit
//
//  The capture record — the single editable unit the whole app revolves around
//  (C3/C5/V3). FROZEN SCHEMA: this and its children define CaptureStore.schema.
//  Adding nullable fields is safe; any other change is a versioned, foundation-
//  owner-only migration (VersionedSchema / SchemaMigrationPlan).
//
//  EVERY non-optional stored property here carries an inline default. Without
//  one, SwiftData cannot lightweight-migrate a store written before the column
//  existed — it fails the whole container open with NSCocoaErrorDomain 134110
//  "Cannot migrate store in-place: Validation error missing attribute values on
//  mandatory destination attribute". CaptureStoreSchemaTests enforces this.

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
    @Attribute(.unique) public var id: UUID = UUID()
    /// Device-stable idempotency key == backend `client_capture_id`. Set once at
    /// draft creation, NEVER regenerated (dedupes offline replay + share double-enqueue).
    public var clientToken: UUID = UUID()
    public var createdAt: Date = Date()
    public var updatedAt: Date = Date()
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
    public var categoryRaw: String = SpecimenCategory.unknown.rawValue

    // Tag/array attributes (smart-guess + manual)
    public var materials: [String] = []
    public var colors: [String] = []
    public var styleTags: [String] = []

    // ── Children (cascade) ──
    @Relationship(deleteRule: .cascade, inverse: \CapturePhoto.specimen)
    public var photos: [CapturePhoto]
    @Relationship(deleteRule: .cascade, inverse: \CaptureMeasurement.specimen)
    public var measurements: [CaptureMeasurement]

    // ── Voice (N4) ──
    public var voiceTranscript: String?
    public var voicePartialTranscript: String?
    public var voiceAudioFilename: String?      // relative path in App Group media dir
    /// Ordered voice-audio segments in the App Group media dir. Additive and
    /// OPTIONAL so SwiftData migrates lightweight — there is no VersionedSchema
    /// in this app. `voiceAudioFilename` stays segment 0 for every reader that
    /// predates segmentation.
    public var voiceAudioSegmentsRaw: [String]?
    /// Remote object paths for segments that have uploaded. Append-only and
    /// order-independent: readers match a segment by the path's trailing
    /// component, not by index, because `[String]?` cannot express a sparse
    /// positional array when only some segments have uploaded.
    /// This is what lets missingRequiredMedia exempt an uploaded segment the
    /// way it already exempts an uploaded photo — without it a voice file is
    /// required-LOCAL forever and one unreadable segment blocks a whole note.
    public var voiceAudioRemotePathsRaw: [String]?
    /// 'device' | 'device_partial' | 'designer' | 'server' — which reading
    /// produced voiceTranscript. The app writes the first three; 'designer' is
    /// manual entry, which claims no speech and implies no audio. 'server' is
    /// the server's own transcription. 00530:55 admits all four.
    public var voiceTranscriptSourceRaw: String?
    /// 'note' | 'context' | nil. Wave 1's producer for the server's
    /// capture_kind CHECK; nil means the server default 'specimen' applies.
    public var captureKindRaw: String?
    public var voiceDurationSeconds: Double?

    // ── Codes (N2) — ["gtin:00123...", "url:https://...", "ean13:..."] ──
    public var scannedCodes: [String] = []
    public var catalogMatchRemoteId: String?

    // ── Per-field provenance: FieldKey.rawValue -> ProvenanceSource.rawValue ──
    public var provenanceRaw: [String: String] = [:]
    /// Smart-guess metadata: FieldKey.rawValue -> "confidence" (0...1, stored as String).
    public var guessConfidenceRaw: [String: Double] = [:]

    // ── Venue stamp (S1, F-08/F-09) ──
    public var venue: VenueStamp?

    // ── Routing + lifecycle + sync bookkeeping ──
    /// Visit-scoped capture grouping. Nil only for records created before Option B.
    public var captureSessionID: UUID?
    public var destinationRaw: String = CaptureDestination.undecided.rawValue
    public var statusRaw: String = CaptureStatus.draft.rawValue
    public var lifecycleRaw: String = CaptureLifecycle.State.captured.rawValue
    public var remoteId: String?         // field_captures.id once committed
    public var committedProductId: String?
    public var lastSyncError: String?
    public var retryCount: Int = 0
    public var uploadProgress: Int = 0 // 0...100

    // ── Optional Spec Book / FF&E placement (additive, nullable migration) ──
    // A committed capture and Product remain durable while this independently
    // retryable step is pending or failed. No second outbox is introduced.
    public var placementProjectId: String?
    public var placementRoomId: String?
    public var placementSlotId: String?
    public var placementCategory: String?
    public var placementStateRaw: String?
    public var placementFFEItemId: String?
    public var placementSpecId: String?
    public var placementLastError: String?
    public var placementRetryCount: Int?

    // ── Margin-note lane (wave 4, FC-R4) — a post-commit write, exactly the
    //    shape of the placement lane above. marginNoteId is the client-minted
    //    margin_notes.id AND the idempotency key.
    //
    //    marginNoteBodyRaw exists for a note whose words are not the transcript.
    public var marginNoteId: String?
    public var marginNoteBodyRaw: String?
    public var marginNoteStateRaw: String?
    public var marginNoteLastError: String?
    public var marginNoteRetryCount: Int?

    // ── Task/punch lane (wave 4, FC-R7) — punchTaskId is the client-minted
    //    project_tasks.id AND the idempotency key. punchTaskOwnerRaw is
    //    'designer' for a task and 'gc' for a punch item.
    public var punchTaskId: String?
    public var punchTaskPartyId: String?
    public var punchTaskOwnerRaw: String?
    public var punchTaskStateRaw: String?
    public var punchTaskLastError: String?
    public var punchTaskRetryCount: Int?

    // ── Degrade-note lane (wave 4, FC-R8 / ruling 3) — its OWN slot, not the
    //    margin lane's. By ruling 1 the same specimen has usually already
    //    auto-opened `marginNote*` with its transcript; a single-slot lane
    //    cannot hold two pending notes, so routing the degrade through it drops
    //    the write whenever that auto-note is still in flight. The id is the
    //    refused task's own UUID (same lineage, replay-safe) and the body is
    //    composed at refusal time, because it has to survive the relaunch
    //    between the 42501 and the write.
    public var degradeNoteId: String?
    public var degradeNoteBodyRaw: String?
    public var degradeNoteStateRaw: String?
    public var degradeNoteLastError: String?
    public var degradeNoteRetryCount: Int?

    // ── The lane that closed WITHOUT landing its row (a margin refusal, or any
    //    lane that ran out of retries). `…LastError` alone was written and read
    //    by nothing, so the loss was invisible. Nil once nothing is owed.
    public var fieldWriteAttentionRaw: String?

    // ── The visit (Field Companion wave 3). All additive optionals. ──
    // captureSessionID already carries the visitID; these carry what
    // field_captures' visit/suggestion columns need.
    public var visitKindRaw: String?
    public var visitKitRaw: String?
    public var visitLabel: String?
    public var visitStartedAt: Date?
    public var visitEndedAt: Date?
    public var noteSettingRaw: String?
    // The SUGGESTION is always distinct from the fact. Nothing reads these as truth.
    public var suggestedProjectID: String?
    public var suggestedProjectRoomID: String?
    public var suggestionBasisRaw: String?
    /// Orders the tray. NEVER RENDERED (Principle 4).
    public var suggestionConfidence: Double?
    /// The basis in WORDS — the only suggestion value a designer ever sees.
    /// DEVICE-ONLY ON PURPOSE: the unplaced tray is device-side SwiftData, so the
    /// sentence is composed here and rendered here. `FieldCapturePayload` omits it
    /// and migration 00532 has no column for it; neither is an oversight, and
    /// neither should be "fixed" to carry it.
    public var suggestionReasonRaw: String?
    /// FC-R6: placed AFTER the capture committed, so the routing the server
    /// already stored is stale until the outbox re-runs `commit_field_capture`.
    public var placementReplayPending: Bool?
    /// Task 31: set the moment EITHER emitter — `ViewfinderModel.saveFromCard()`'s
    /// pre-route emission or `S3DestinationScreen`'s post-route one — counts this
    /// capture toward `capture.placed` / `capture.unplaced`. The pre-route
    /// emission must fire before `sync.route` (FC-R6: placement doesn't wait on
    /// the server), so when that route throws and hands off to S3, S3 checks this
    /// flag rather than re-counting a capture that was already counted. Also
    /// protects a later deliberate re-file (V3) from minting a second event for
    /// a capture that already has one.
    public var placementEventEmitted: Bool?

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
    @Attribute(.unique) public var id: UUID = UUID()
    public var filename: String = "" // HEIC, relative to App Group media dir
    public var thumbnailFilename: String?
    public var remotePath: String?       // capture-media storage path once uploaded
    public var publicURL: String?        // product-images display copy once uploaded
    public var width: Int = 0
    public var height: Int = 0
    public var isPrimary: Bool = false
    public var isDuplicate: Bool = false
    public var order: Int = 0
    public var captureModeRaw: String = CameraMode.photo.rawValue
    public var createdAt: Date = Date()
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
    @Attribute(.unique) public var id: UUID = UUID()
    /// No init default exists for the axis — it is always supplied — so the
    /// migration default is the one value that behaves exactly like an
    /// unrecognised raw did: `.custom`, which claims no width/height/depth slot.
    public var axisRaw: String = MeasurementAxis.custom.rawValue
    public var label: String?
    public var millimeters: Double = 0
    public var sourceRaw: String = MeasureSource.manual.rawValue
    public var createdAt: Date = Date()
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
    @Attribute(.unique) public var id: UUID = UUID()
    public var remoteId: String?
    public var name: String = ""
    public var createdAt: Date = Date()
    public private(set) var ownerUserID: String?
    public private(set) var ownerWorkspaceID: String?

    // ── Offline cache (Field Companion wave 3 · package 3-1) ──
    // All additive optionals → SwiftData migrates lightweight. Room lists are
    // JSON Data, not stored arrays of a Codable struct, so no composite type
    // enters the schema. lastFiledCoordinate is a computed pair: SwiftData
    // cannot persist a tuple.
    public var specRoomsData: Data?
    public var roomsData: Data?
    public var lastRefreshedAt: Date?
    public var lastVisitedAt: Date?
    public var lastFiledLatitude: Double?
    public var lastFiledLongitude: Double?
    public var filedCaptureCount: Int?

    public init(
        id: UUID = UUID(),
        remoteId: String? = nil,
        name: String,
        createdAt: Date = Date(),
        owner: CaptureOwnerIdentity? = nil
    ) {
        self.id = id
        self.remoteId = remoteId
        self.name = name
        self.createdAt = createdAt
        self.ownerUserID = owner?.userID
        self.ownerWorkspaceID = owner?.workspaceID
    }

    public func belongs(to owner: CaptureOwnerIdentity) -> Bool {
        owner.matches(userID: ownerUserID, workspaceID: ownerWorkspaceID)
    }

    /// FC-R5: the `project_rooms` lane. Never derived from, nor fallen back to, `rooms`.
    public var specRooms: [CaptureCachedRoom] {
        get { CaptureProjectRef.decodeRooms(specRoomsData) }
        set { specRoomsData = CaptureProjectRef.encodeRooms(newValue) }
    }

    /// FC-R5: the `public.rooms` lane. Never derived from, nor fallen back to, `specRooms`.
    public var rooms: [CaptureCachedRoom] {
        get { CaptureProjectRef.decodeRooms(roomsData) }
        set { roomsData = CaptureProjectRef.encodeRooms(newValue) }
    }

    public var lastFiledCoordinate: CaptureCoordinate? {
        get {
            guard let lastFiledLatitude, let lastFiledLongitude else { return nil }
            return CaptureCoordinate(latitude: lastFiledLatitude, longitude: lastFiledLongitude)
        }
        set {
            lastFiledLatitude = newValue?.latitude
            lastFiledLongitude = newValue?.longitude
        }
    }

    private static func decodeRooms(_ data: Data?) -> [CaptureCachedRoom] {
        guard let data else { return [] }
        return (try? JSONDecoder().decode([CaptureCachedRoom].self, from: data)) ?? []
    }

    private static func encodeRooms(_ rooms: [CaptureCachedRoom]) -> Data? {
        rooms.isEmpty ? nil : try? JSONEncoder().encode(rooms)
    }
}
