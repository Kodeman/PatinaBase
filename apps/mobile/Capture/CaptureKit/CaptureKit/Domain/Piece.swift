//  Piece.swift
//  CaptureKit
//
//  The capture record — the single editable unit the whole app revolves around
//  (C3/C5/V3) — and its children, as CaptureSchemaV2 declares them. V1 called
//  the record `Specimen` (Specimen.swift, frozen). The V1→V2 stage and why it
//  copies rather than renames are in CaptureSchema.swift and
//  PieceMigrationCarry.swift.
//
//  FROZEN SCHEMA once shipped: a stored-property change is a new VersionedSchema
//  plus its stage in CaptureMigrationPlan, never an edit here.
//
//  EVERY non-optional stored property here carries an inline default. Without
//  one, SwiftData cannot lightweight-migrate a store written before the column
//  existed — it fails the whole container open with NSCocoaErrorDomain 134110
//  "Cannot migrate store in-place: Validation error missing attribute values on
//  mandatory destination attribute". CaptureStoreLadderTests enforces this.

import Foundation
import SwiftData

extension CaptureSchemaV2 {
    @Model
    public final class Piece {
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
        @Relationship(deleteRule: .cascade, inverse: \CapturePhoto.piece)
        public var photos: [CapturePhoto]
        @Relationship(deleteRule: .cascade, inverse: \CaptureMeasurement.piece)
        public var measurements: [CaptureMeasurement]

        // ── Voice (N4) ──
        public var voiceTranscript: String?
        public var voicePartialTranscript: String?
        public var voiceAudioFilename: String?      // relative path in App Group media dir
        /// Ordered voice-audio segments in the App Group media dir.
        /// `voiceAudioFilename` stays segment 0 for every reader that predates
        /// segmentation.
        public var voiceAudioSegmentsRaw: [String]?
        /// Remote object paths for segments that have uploaded. Append-only and
        /// order-independent: readers match a segment by the path's trailing
        /// component, not by index, because `[String]?` cannot express a sparse
        /// positional array when only some segments have uploaded.
        public var voiceAudioRemotePathsRaw: [String]?
        /// 'device' | 'device_partial' | 'designer' | 'server' — which reading
        /// produced voiceTranscript. 00530:55 admits all four.
        public var voiceTranscriptSourceRaw: String?
        /// 'note' | 'context' | nil. nil means the server default capture_kind
        /// 'specimen' applies — that wire value is kept (lexicon, ruling D3a).
        public var captureKindRaw: String?
        public var voiceDurationSeconds: Double?

        // ── Codes (N2) — ["gtin:00123...", "url:https://...", "ean13:..."] ──
        public var scannedCodes: [String] = []
        public var catalogMatchRemoteId: String?

        // ── Per-field provenance ──
        /// FieldKey.rawValue -> ProvenanceSource.rawValue: the field's ORIGIN.
        /// Confirming a value never rewrites it: a guess she accepted is still a
        /// `.smartGuess`, a tag read is still `.ocr`. It changes only when the
        /// value itself is replaced (`setValue`).
        public var provenanceRaw: [String: String] = [:]
        /// Smart-guess metadata: FieldKey.rawValue -> confidence (0...1).
        public var guessConfidenceRaw: [String: Double] = [:]
        /// FieldKey.rawValue -> who confirmed the field's current value (user id).
        /// Confirmation is its own fact, never folded into the origin.
        public var confirmedByRaw: [String: String] = [:]
        /// FieldKey.rawValue -> when the field's current value was confirmed.
        /// A key here is what "confirmed" means; `confirmedByRaw` may lack it
        /// when no signed-in user confirmed (previews, mocks).
        public var confirmedAtRaw: [String: Date] = [:]
        /// FieldKey.rawValue -> the machine-proposed value a human replaced.
        /// Present exactly for fields whose origin is `.edited`.
        public var proposedValueRaw: [String: String] = [:]

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

        // ── Optional Spec Book / FF&E placement ──
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
        //    margin lane's; see Specimen.swift for why a single slot cannot hold
        //    both notes.
        public var degradeNoteId: String?
        public var degradeNoteBodyRaw: String?
        public var degradeNoteStateRaw: String?
        public var degradeNoteLastError: String?
        public var degradeNoteRetryCount: Int?

        // ── The lane that closed WITHOUT landing its row (a margin refusal, or any
        //    lane that ran out of retries). Nil once nothing is owed.
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
        /// DEVICE-ONLY ON PURPOSE: `FieldCapturePayload` omits it and migration
        /// 00532 has no column for it; neither is an oversight.
        public var suggestionReasonRaw: String?
        /// FC-R6: placed AFTER the capture committed, so the routing the server
        /// already stored is stale until the outbox re-runs `commit_field_capture`.
        public var placementReplayPending: Bool?
        /// Task 31: set the moment EITHER emitter counts this capture toward
        /// `capture.placed` / `capture.unplaced`, so a route that hands off to S3,
        /// or a later re-file (V3), never mints a second event.
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
            self.confirmedByRaw = [:]
            self.confirmedAtRaw = [:]
            self.proposedValueRaw = [:]
            self.destinationRaw = destinationRaw
            self.statusRaw = statusRaw
            self.lifecycleRaw = lifecycleRaw
            self.retryCount = 0
            self.uploadProgress = 0
        }

        /// The V1→V2 carry's way in for the owner stamp, which crosses exactly as
        /// V1 stored it: `CaptureOwnerIdentity` would re-normalise it and drop a
        /// half-stamped legacy row's one value. Nothing else calls this.
        func restoreOwnerStamp(userID: String?, workspaceID: String?) {
            ownerUserID = userID
            ownerWorkspaceID = workspaceID
        }
    }
}

extension CaptureSchemaV2 {
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
        /// V1's `specimen`. No `originalName`: its target entity is new in V2, so
        /// a carried V1 foreign key would point into the dropped Specimen table.
        /// The V1→V2 carry relinks every photo by id instead.
        public var piece: Piece?

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
}

extension CaptureSchemaV2 {
    @Model
    public final class CaptureMeasurement {
        @Attribute(.unique) public var id: UUID = UUID()
        /// The migration default is the one value that behaves exactly like an
        /// unrecognised raw did: `.custom`, which claims no width/height/depth slot.
        public var axisRaw: String = MeasurementAxis.custom.rawValue
        public var label: String?
        public var millimeters: Double = 0
        public var sourceRaw: String = MeasureSource.manual.rawValue
        public var createdAt: Date = Date()
        /// V1's `specimen`; relinked by id, as `CapturePhoto.piece` is.
        public var piece: Piece?

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
}
