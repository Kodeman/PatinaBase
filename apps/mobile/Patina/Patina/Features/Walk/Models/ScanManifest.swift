//
//  ScanManifest.swift
//  Patina
//
//  Codable schema for the on-disk scan bundle manifest. Written by
//  ScanBundleWriter while the scan is in progress, finalized in
//  RoomCaptureService.captureSession(_:didEndWith:), and consumed by
//  RoomScanSyncService to drive per-artifact uploads.
//

import Foundation

/// On-disk bundle format version. Bumped when the manifest shape or
/// artifact layout changes in a way the uploader cares about.
///
/// v3 (additive over v2): new ArtifactKinds (coverageHeatmap, depthIndex,
/// photoThumbnails, annotations, bundleManifest, photosManifest), extra
/// PhotoEntry annotation fields, top-level `annotations` struct, and extra
/// CaptureEnvironment optical-flow/depth/coverage fields. A v2 manifest.json
/// on disk still decodes through the v3 types — every new field is optional
/// or has a default.
///
/// The instrument layer (see below) is additive *within* v3 and does NOT bump
/// this number. Field's `FieldScanManifest` also writes `schemaVersion = 3`
/// and distinguishes an instrument bundle by `bundleSpecVersion = 1`; keeping
/// one on-disk format version across both apps is the whole point of the
/// superset. `bundleSpecVersion`, not `schemaVersion`, is the marker.
public nonisolated let scanBundleSchemaVersion: Int = 3

/// Root manifest describing everything in a `Scans/{scanId}/` bundle.
///
/// ## The instrument layer (Field superset)
///
/// Field's `FieldScanManifest`
/// (`apps/mobile/Capture/CaptureKit/CaptureKit/SiteScan/FieldScanManifest.swift`)
/// documents itself as a strict SUPERSET of this type: every inherited key
/// keeps its v3 name, and it adds an instrument layer — `session`, `anchors`,
/// `scorecard`, `poseGraphSummary`, `unverified`, `checksumAlgorithm`,
/// `bundleSpecVersion` — defined by `capture-bundle-spec-v1.md` §3 and
/// enforced by `scripts/validate_capture_bundle.py` §10.
///
/// Those seven keys now live here too, all Optional, so this type can hold a
/// Field-produced manifest without loss. Nothing in the client populates them
/// yet (a later wave wires the producers); a client scan encodes exactly the
/// bytes it encoded before, because a nil Optional is omitted entirely by the
/// synthesized `encode(to:)`. The four structured ones are defined next door
/// in `ScanManifest+Instrument.swift`.
///
/// ### Type note — why the inherited keys keep UUID/Date and the instrument
/// ### layer uses String
///
/// Field declares `scanId`/`createdAt` as `String`; this type keeps `UUID` and
/// `Date`. That is not a divergence in the JSON: `ScanBundleWriter` encodes
/// with `dateEncodingStrategy = .iso8601`, so `createdAt` is already the same
/// ISO8601 string Field writes, and `UUID` already encodes as a string. The
/// Swift-side types are load-bearing on this side of the fence in a way they
/// are not on Field's — `RoomScanPackage.scanId` is an `@Attribute(.unique)
/// UUID` matched by `#Predicate { $0.scanId == scanId }`, and
/// `RoomScanPackage.createdAt` is a `Date` driving `SortDescriptor`. Weakening
/// them to String would buy nothing on the wire and cost every call site.
///
/// The instrument layer goes the other way: its timestamps are `String`,
/// matching Field exactly. They are pass-through diagnostics the client never
/// sorts or does arithmetic on, and a `String` round-trips 1:1 regardless of
/// the decoder's `dateDecodingStrategy` — the same reasoning Field's
/// `FieldPhotoEntry` records for its own `capturedAt`. A `Date` here would
/// make the whole manifest fail to decode the day a producer emits fractional
/// seconds.
public nonisolated struct ScanManifest: Codable, Equatable, Sendable {

    public var schemaVersion: Int
    public var scanId: UUID
    public var roomLocalId: UUID?
    public var roomName: String
    public var createdAt: Date
    public var completedAt: Date?

    public var device: DeviceInfo
    public var capture: CaptureInfo
    public var artifacts: [Artifact]
    public var photos: [PhotoEntry]
    public var captureEnvironment: CaptureEnvironment
    /// v3 additive: user-entered review annotations. Defaults to empty so v2
    /// manifests on disk decode cleanly (JSONDecoder returns nil for missing
    /// keys and this property falls back to `.init()` via the initializer
    /// default).
    public var annotations: Annotations

    // MARK: - Instrument layer (Field superset · capture-bundle-spec-v1 §3)
    //
    // All Optional and all nil on a client-written bundle, so they encode to
    // nothing. Key names are Field's, verbatim.

    /// Bundle-spec version. `1` marks a Field instrument bundle; nil means a
    /// plain client bundle. This is the marker the server keys on, not
    /// `schemaVersion` (which is 3 on both).
    public var bundleSpecVersion: Int?
    /// The accuracy verdict: true when fewer than three typed ground-truth
    /// anchors were captured (spec §10.6 / AnchorGate). The validator cross-
    /// checks this against `anchors.count`, so the two must be written
    /// together.
    public var unverified: Bool?
    /// Always `"sha256"` in a v1 bundle; the validator rejects anything else.
    public var checksumAlgorithm: String?
    /// Per-session instrument provenance (spec §3.2).
    public var session: Session?
    /// Typed ground-truth spans (spec §3.3). Field folds `anchors.json` into
    /// the manifest here.
    public var anchors: [AnchorRecord]?
    /// End-of-scan QA scorecard (spec §3.4).
    public var scorecard: Scorecard?
    /// SfM pose-graph statistics (spec §3.5).
    public var poseGraphSummary: PoseGraphSummary?

    public init(
        schemaVersion: Int = scanBundleSchemaVersion,
        scanId: UUID,
        roomLocalId: UUID? = nil,
        roomName: String = "Room",
        createdAt: Date = Date(),
        completedAt: Date? = nil,
        device: DeviceInfo,
        capture: CaptureInfo = .init(),
        artifacts: [Artifact] = [],
        photos: [PhotoEntry] = [],
        captureEnvironment: CaptureEnvironment = .init(),
        annotations: Annotations = Annotations(),
        bundleSpecVersion: Int? = nil,
        unverified: Bool? = nil,
        checksumAlgorithm: String? = nil,
        session: Session? = nil,
        anchors: [AnchorRecord]? = nil,
        scorecard: Scorecard? = nil,
        poseGraphSummary: PoseGraphSummary? = nil
    ) {
        self.schemaVersion = schemaVersion
        self.scanId = scanId
        self.roomLocalId = roomLocalId
        self.roomName = roomName
        self.createdAt = createdAt
        self.completedAt = completedAt
        self.device = device
        self.capture = capture
        self.artifacts = artifacts
        self.photos = photos
        self.captureEnvironment = captureEnvironment
        self.annotations = annotations
        self.bundleSpecVersion = bundleSpecVersion
        self.unverified = unverified
        self.checksumAlgorithm = checksumAlgorithm
        self.session = session
        self.anchors = anchors
        self.scorecard = scorecard
        self.poseGraphSummary = poseGraphSummary
    }

    // v2 bundles on disk predate the `annotations` field. Provide a custom
    // decoder that tolerates its absence (default = empty Annotations). All
    // other fields are required on both v2 and v3.
    //
    // The instrument-layer keys are absent from every client-written bundle,
    // so they decode with `decodeIfPresent` and stay nil there.
    private enum CodingKeys: String, CodingKey {
        case schemaVersion, scanId, roomLocalId, roomName, createdAt, completedAt
        case device, capture, artifacts, photos, captureEnvironment, annotations
        case bundleSpecVersion, unverified, checksumAlgorithm
        case session, anchors, scorecard, poseGraphSummary
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.schemaVersion = try c.decode(Int.self, forKey: .schemaVersion)
        self.scanId = try c.decode(UUID.self, forKey: .scanId)
        self.roomLocalId = try c.decodeIfPresent(UUID.self, forKey: .roomLocalId)
        self.roomName = try c.decode(String.self, forKey: .roomName)
        self.createdAt = try c.decode(Date.self, forKey: .createdAt)
        self.completedAt = try c.decodeIfPresent(Date.self, forKey: .completedAt)
        self.device = try c.decode(DeviceInfo.self, forKey: .device)
        self.capture = try c.decode(CaptureInfo.self, forKey: .capture)
        self.artifacts = try c.decode([Artifact].self, forKey: .artifacts)
        self.photos = try c.decode([PhotoEntry].self, forKey: .photos)
        self.captureEnvironment = try c.decode(CaptureEnvironment.self, forKey: .captureEnvironment)
        self.annotations = try c.decodeIfPresent(Annotations.self, forKey: .annotations) ?? Annotations()
        self.bundleSpecVersion = try c.decodeIfPresent(Int.self, forKey: .bundleSpecVersion)
        self.unverified = try c.decodeIfPresent(Bool.self, forKey: .unverified)
        self.checksumAlgorithm = try c.decodeIfPresent(String.self, forKey: .checksumAlgorithm)
        self.session = try c.decodeIfPresent(Session.self, forKey: .session)
        self.anchors = try c.decodeIfPresent([AnchorRecord].self, forKey: .anchors)
        self.scorecard = try c.decodeIfPresent(Scorecard.self, forKey: .scorecard)
        self.poseGraphSummary = try c.decodeIfPresent(PoseGraphSummary.self, forKey: .poseGraphSummary)
    }

    // MARK: - Device

    public struct DeviceInfo: Codable, Equatable, Sendable {
        public var model: String
        public var osVersion: String
        public var hasLidar: Bool
        public var roomPlanVersion: String

        public init(
            model: String,
            osVersion: String,
            hasLidar: Bool,
            roomPlanVersion: String = "1.0"
        ) {
            self.model = model
            self.osVersion = osVersion
            self.hasLidar = hasLidar
            self.roomPlanVersion = roomPlanVersion
        }
    }

    // MARK: - Capture info

    public struct CaptureInfo: Codable, Equatable, Sendable {
        /// When the user intends us to also dump `sceneDepth` frames.
        public var highFidelityDepthEnabled: Bool
        /// Interval between automatic posed-photo samples, seconds.
        public var autoPhotoInterval: TimeInterval
        /// Whether a `CapturedRoomBuilder` is stitching multiple rooms.
        public var multiRoomBuilderId: UUID?

        public init(
            highFidelityDepthEnabled: Bool = false,
            autoPhotoInterval: TimeInterval = 2.0,
            multiRoomBuilderId: UUID? = nil
        ) {
            self.highFidelityDepthEnabled = highFidelityDepthEnabled
            self.autoPhotoInterval = autoPhotoInterval
            self.multiRoomBuilderId = multiRoomBuilderId
        }
    }

    // MARK: - Capture environment snapshot

    public struct CaptureEnvironment: Codable, Equatable, Sendable {
        public var lightEstimate: Double?
        public var thermalState: String?
        public var batteryLevel: Double?
        public var motionQuality: String?

        // v3 additive — all optional/defaulted so v2 manifests decode cleanly.
        /// Mean optical-flow magnitude across captured frames (higher = more
        /// camera motion). Populated by FrameScoringEngine in a later wave.
        public var opticalFlowMean: Double?
        /// Count of sceneDepth frames DepthFrameRecorder wrote to `depth/`.
        public var sceneDepthFrameCount: Int?
        /// Whether `coverage_heatmap.json` was written at finalize.
        public var coverageHeatmapPresent: Bool

        public init(
            lightEstimate: Double? = nil,
            thermalState: String? = nil,
            batteryLevel: Double? = nil,
            motionQuality: String? = nil,
            opticalFlowMean: Double? = nil,
            sceneDepthFrameCount: Int? = nil,
            coverageHeatmapPresent: Bool = false
        ) {
            self.lightEstimate = lightEstimate
            self.thermalState = thermalState
            self.batteryLevel = batteryLevel
            self.motionQuality = motionQuality
            self.opticalFlowMean = opticalFlowMean
            self.sceneDepthFrameCount = sceneDepthFrameCount
            self.coverageHeatmapPresent = coverageHeatmapPresent
        }

        // v2 bundles predate the new fields — tolerate their absence on decode.
        private enum CodingKeys: String, CodingKey {
            case lightEstimate, thermalState, batteryLevel, motionQuality
            case opticalFlowMean, sceneDepthFrameCount, coverageHeatmapPresent
        }

        public init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            self.lightEstimate = try c.decodeIfPresent(Double.self, forKey: .lightEstimate)
            self.thermalState = try c.decodeIfPresent(String.self, forKey: .thermalState)
            self.batteryLevel = try c.decodeIfPresent(Double.self, forKey: .batteryLevel)
            self.motionQuality = try c.decodeIfPresent(String.self, forKey: .motionQuality)
            self.opticalFlowMean = try c.decodeIfPresent(Double.self, forKey: .opticalFlowMean)
            self.sceneDepthFrameCount = try c.decodeIfPresent(Int.self, forKey: .sceneDepthFrameCount)
            self.coverageHeatmapPresent = try c.decodeIfPresent(Bool.self, forKey: .coverageHeatmapPresent) ?? false
        }
    }

    // MARK: - Annotations (v3)

    /// User-supplied review-step annotations captured after the scan freezes
    /// but before it finalizes. Entirely optional — a v2 bundle that predates
    /// the review step decodes with this struct empty.
    public struct Annotations: Codable, Equatable, Sendable {
        public var roomNotes: String
        public var userProvidedRoomName: String?
        public var reviewCompletedAt: Date?

        public init(
            roomNotes: String = "",
            userProvidedRoomName: String? = nil,
            reviewCompletedAt: Date? = nil
        ) {
            self.roomNotes = roomNotes
            self.userProvidedRoomName = userProvidedRoomName
            self.reviewCompletedAt = reviewCompletedAt
        }

        private enum CodingKeys: String, CodingKey {
            case roomNotes, userProvidedRoomName, reviewCompletedAt
        }

        public init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            self.roomNotes = try c.decodeIfPresent(String.self, forKey: .roomNotes) ?? ""
            self.userProvidedRoomName = try c.decodeIfPresent(String.self, forKey: .userProvidedRoomName)
            self.reviewCompletedAt = try c.decodeIfPresent(Date.self, forKey: .reviewCompletedAt)
        }
    }

    // MARK: - Artifacts

    /// The kinds of files the bundle may contain. Mapped 1:1 to
    /// `room_scans` URL columns by `RoomScanSyncService`.
    public enum ArtifactKind: String, Codable, CaseIterable, Sendable {
        case usdz                   // scan.usdz
        case capturedRoomJson       // captured_room.json (parametric)
        case worldMap               // world_map.arworldmap
        case mesh                   // mesh.ply
        case depthArchive           // depth.zip (optional)
        case heroThumbnail          // hero.heic small thumbnail
        case bundleArchive          // bundle.zip (optional backup)

        // v3 additive kinds.
        case coverageHeatmap        // coverage_heatmap.json (XZ grid JSON)
        case depthIndex             // depth/depth_index.ndjson (per-frame depth index)
        case photoThumbnails        // photos/photo_thumbnails.ndjson (256px thumb index)
        case annotations            // annotations.json (user review notes/name/etc.)
        case bundleManifest         // manifest.json (pointer to existing root manifest)
        case photosManifest         // photos/photos_metadata.ndjson (pointer to existing NDJSON)

        // NOT YET BROUGHT ACROSS from Field's artifact vocabulary:
        // `scorecard`, `anchors`, `keyframeIndex`, `keyframeSummary`,
        // `keyframesArchive` (see FieldManifestAssembler.candidates). Adding
        // them is a *coupled* change, not an additive one: this enum is
        // switched exhaustively and without a `default` in three places —
        // ScanBundleWriter.defaultFileName(for:), ArtifactUploader
        // .scanColumn(for:) and .storagePathComponents(for:) — each needing a
        // real storage-folder / room_scans-column decision per kind.
        // Consequence today: the instrument *layer* round-trips, but a Field
        // manifest that LISTS one of those kinds in `artifacts[]` fails to
        // decode here. Pinned by
        // `ScanManifestSupersetTests.fieldOnlyArtifactKindDoesNotDecodeYet`.
    }

    public struct Artifact: Codable, Equatable, Sendable {
        public var kind: ArtifactKind
        public var relativePath: String
        public var sizeBytes: Int
        public var sha256: String?
        public var mimeType: String

        public init(
            kind: ArtifactKind,
            relativePath: String,
            sizeBytes: Int,
            sha256: String? = nil,
            mimeType: String
        ) {
            self.kind = kind
            self.relativePath = relativePath
            self.sizeBytes = sizeBytes
            self.sha256 = sha256
            self.mimeType = mimeType
        }
    }

    // MARK: - Photos

    public enum PhotoKind: String, Codable, Sendable {
        case hero       // selected as the card image
        case auto       // continuous sampled
        case user       // shutter-tapped
        case feature    // anchored to a detected room feature
    }

    /// Per-photo metadata persisted in the manifest (and separately appended
    /// as NDJSON to `photos/photos_metadata.ndjson` during capture so a crash
    /// doesn't lose the tail).
    public struct PhotoEntry: Codable, Equatable, Identifiable, Sendable {
        public var id: UUID
        public var relativePath: String
        public var kind: PhotoKind
        public var capturedAt: Date
        public var timestampSeconds: Double
        public var mimeType: String
        public var sizeBytes: Int
        public var width: Int
        public var height: Int
        public var isFullResolution: Bool

        /// Row-major 4x4 camera transform (16 doubles).
        public var cameraTransform: [Double]
        public var cameraIntrinsics: Intrinsics
        public var eulerAngles: [Double]   // [pitch, yaw, roll]
        public var lightEstimateLumens: Double?

        /// Optional — populated only after `CapturedRoom` is finalized and we
        /// can match the photo to its nearest wall/door/window/object.
        public var associatedFeatureCategory: String?
        public var associatedFeatureId: UUID?

        /// Quality scores (populated by FrameScoringEngine post-scan).
        public var qualityScore: Float?
        public var sharpnessScore: Float?
        public var brightnessScore: Float?
        public var compositionScore: Float?
        public var stabilityScore: Float?

        // v3 additive — all optional/defaulted so v2 manifests decode cleanly.
        /// Relative path to the small (~256px) JPEG thumbnail for this photo,
        /// e.g. `"photos/thumb_hero.jpg"`. Nil when the thumbnail hasn't been
        /// generated yet.
        public var thumbnailRelativePath: String?
        public var thumbnailSizeBytes: Int?
        /// Mesh anchors this photo visibly overlaps; populated at finalize by
        /// projecting the photo's camera-forward ray against mesh-anchor AABBs.
        public var associatedMeshAnchorIds: [UUID]?
        /// Set by the user in the review step when they pick a different hero.
        public var isUserSelectedHero: Bool
        /// Free-form per-photo caption entered in the review step.
        public var userAnnotation: String?
        /// Display order applied in the review step (nil = natural capture order).
        public var orderIndex: Int?

        public init(
            id: UUID = UUID(),
            relativePath: String,
            kind: PhotoKind,
            capturedAt: Date,
            timestampSeconds: Double,
            mimeType: String = "image/heic",
            sizeBytes: Int,
            width: Int,
            height: Int,
            isFullResolution: Bool = false,
            cameraTransform: [Double],
            cameraIntrinsics: Intrinsics,
            eulerAngles: [Double],
            lightEstimateLumens: Double? = nil,
            associatedFeatureCategory: String? = nil,
            associatedFeatureId: UUID? = nil,
            qualityScore: Float? = nil,
            sharpnessScore: Float? = nil,
            brightnessScore: Float? = nil,
            compositionScore: Float? = nil,
            stabilityScore: Float? = nil,
            thumbnailRelativePath: String? = nil,
            thumbnailSizeBytes: Int? = nil,
            associatedMeshAnchorIds: [UUID]? = nil,
            isUserSelectedHero: Bool = false,
            userAnnotation: String? = nil,
            orderIndex: Int? = nil
        ) {
            self.id = id
            self.relativePath = relativePath
            self.kind = kind
            self.capturedAt = capturedAt
            self.timestampSeconds = timestampSeconds
            self.mimeType = mimeType
            self.sizeBytes = sizeBytes
            self.width = width
            self.height = height
            self.isFullResolution = isFullResolution
            self.cameraTransform = cameraTransform
            self.cameraIntrinsics = cameraIntrinsics
            self.eulerAngles = eulerAngles
            self.lightEstimateLumens = lightEstimateLumens
            self.associatedFeatureCategory = associatedFeatureCategory
            self.associatedFeatureId = associatedFeatureId
            self.qualityScore = qualityScore
            self.sharpnessScore = sharpnessScore
            self.brightnessScore = brightnessScore
            self.compositionScore = compositionScore
            self.stabilityScore = stabilityScore
            self.thumbnailRelativePath = thumbnailRelativePath
            self.thumbnailSizeBytes = thumbnailSizeBytes
            self.associatedMeshAnchorIds = associatedMeshAnchorIds
            self.isUserSelectedHero = isUserSelectedHero
            self.userAnnotation = userAnnotation
            self.orderIndex = orderIndex
        }

        // v2 bundles predate the review-step fields — tolerate absence on decode.
        private enum CodingKeys: String, CodingKey {
            case id, relativePath, kind, capturedAt, timestampSeconds, mimeType
            case sizeBytes, width, height, isFullResolution
            case cameraTransform, cameraIntrinsics, eulerAngles, lightEstimateLumens
            case associatedFeatureCategory, associatedFeatureId
            case qualityScore, sharpnessScore, brightnessScore, compositionScore, stabilityScore
            case thumbnailRelativePath, thumbnailSizeBytes
            case associatedMeshAnchorIds
            case isUserSelectedHero, userAnnotation, orderIndex
        }

        public init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            self.id = try c.decode(UUID.self, forKey: .id)
            self.relativePath = try c.decode(String.self, forKey: .relativePath)
            self.kind = try c.decode(PhotoKind.self, forKey: .kind)
            self.capturedAt = try c.decode(Date.self, forKey: .capturedAt)
            self.timestampSeconds = try c.decode(Double.self, forKey: .timestampSeconds)
            self.mimeType = try c.decode(String.self, forKey: .mimeType)
            self.sizeBytes = try c.decode(Int.self, forKey: .sizeBytes)
            self.width = try c.decode(Int.self, forKey: .width)
            self.height = try c.decode(Int.self, forKey: .height)
            self.isFullResolution = try c.decode(Bool.self, forKey: .isFullResolution)
            self.cameraTransform = try c.decode([Double].self, forKey: .cameraTransform)
            self.cameraIntrinsics = try c.decode(Intrinsics.self, forKey: .cameraIntrinsics)
            self.eulerAngles = try c.decode([Double].self, forKey: .eulerAngles)
            self.lightEstimateLumens = try c.decodeIfPresent(Double.self, forKey: .lightEstimateLumens)
            self.associatedFeatureCategory = try c.decodeIfPresent(String.self, forKey: .associatedFeatureCategory)
            self.associatedFeatureId = try c.decodeIfPresent(UUID.self, forKey: .associatedFeatureId)
            self.qualityScore = try c.decodeIfPresent(Float.self, forKey: .qualityScore)
            self.sharpnessScore = try c.decodeIfPresent(Float.self, forKey: .sharpnessScore)
            self.brightnessScore = try c.decodeIfPresent(Float.self, forKey: .brightnessScore)
            self.compositionScore = try c.decodeIfPresent(Float.self, forKey: .compositionScore)
            self.stabilityScore = try c.decodeIfPresent(Float.self, forKey: .stabilityScore)
            self.thumbnailRelativePath = try c.decodeIfPresent(String.self, forKey: .thumbnailRelativePath)
            self.thumbnailSizeBytes = try c.decodeIfPresent(Int.self, forKey: .thumbnailSizeBytes)
            self.associatedMeshAnchorIds = try c.decodeIfPresent([UUID].self, forKey: .associatedMeshAnchorIds)
            self.isUserSelectedHero = try c.decodeIfPresent(Bool.self, forKey: .isUserSelectedHero) ?? false
            self.userAnnotation = try c.decodeIfPresent(String.self, forKey: .userAnnotation)
            self.orderIndex = try c.decodeIfPresent(Int.self, forKey: .orderIndex)
        }
    }

    public struct Intrinsics: Codable, Equatable, Sendable {
        public var fx: Double
        public var fy: Double
        public var cx: Double
        public var cy: Double
        public var width: Int
        public var height: Int

        public init(fx: Double, fy: Double, cx: Double, cy: Double, width: Int, height: Int) {
            self.fx = fx
            self.fy = fy
            self.cx = cx
            self.cy = cy
            self.width = width
            self.height = height
        }
    }
}

// MARK: - Upload-state tracking (lives in SwiftData RoomScanPackage)

/// Per-artifact upload state that the sync service ticks forward.
public nonisolated struct ArtifactUploadState: Codable, Equatable, Sendable {
    public enum Status: String, Codable, Sendable {
        case pending
        case uploading
        case uploaded
        case failed
        case skipped
    }

    public var kind: ScanManifest.ArtifactKind
    public var status: Status
    public var remoteUrl: String?
    public var lastError: String?
    public var attempts: Int

    public init(
        kind: ScanManifest.ArtifactKind,
        status: Status = .pending,
        remoteUrl: String? = nil,
        lastError: String? = nil,
        attempts: Int = 0
    ) {
        self.kind = kind
        self.status = status
        self.remoteUrl = remoteUrl
        self.lastError = lastError
        self.attempts = attempts
    }
}

public nonisolated struct ScanPackageArtifactState: Codable, Equatable, Sendable {
    public var artifacts: [ArtifactUploadState]
    public var photosUploaded: Int
    public var photosTotal: Int

    public init(
        artifacts: [ArtifactUploadState] = [],
        photosUploaded: Int = 0,
        photosTotal: Int = 0
    ) {
        self.artifacts = artifacts
        self.photosUploaded = photosUploaded
        self.photosTotal = photosTotal
    }

    public var allArtifactsDone: Bool {
        artifacts.allSatisfy { $0.status == .uploaded || $0.status == .skipped }
    }

    public var allPhotosDone: Bool {
        photosTotal > 0 ? photosUploaded >= photosTotal : true
    }
}
