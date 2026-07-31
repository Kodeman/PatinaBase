//
//  ScanManifest+Instrument.swift
//  Patina
//
//  The instrument layer of the v3 scan manifest — the part Field's
//  `FieldScanManifest` adds on top of the client shape it calls "a strict
//  SUPERSET of the client v3 ScanManifest". Defined by
//  `docs/design/field-capture/capture-bundle-spec-v1.md` §3.2–§3.5 and
//  enforced by `scripts/validate_capture_bundle.py` §10.
//
//  These types are held by the Optional properties on `ScanManifest`
//  (`session`, `poseGraphSummary`); the scalars (`bundleSpecVersion`,
//  `unverified`, `checksumAlgorithm`) live there directly.
//
//  ── The producer ─────────────────────────────────────────────────────────────
//  All seven keys are populated at SEAL, and only at seal, by
//  `ScanManifest.apply(_:)` below — fed from `RoomCaptureService
//  .finalizeInstrumentLane(arSession:)` through `ScanBundleWriter
//  .applyInstrumentLayer(_:)`. Before seal they are nil, and a nil Optional is
//  omitted by the synthesized `encode(to:)`, so an in-progress bundle's
//  manifest is byte-for-byte what it always was.
//
//  Seal, not freeze, is the moment on purpose: `checksumAlgorithm` is a
//  statement ABOUT THE ARTIFACT HASHES, and the hashes only exist once
//  `finalize(hashArtifacts: true)` has run. Writing it earlier would put a
//  claim on disk that the file did not yet support.
//
//  ── Only two types live here ──────────────────────────────────────────────
//  `anchors` and `scorecard` are typed by the PORTED SUBSTRATE next door in
//  `Features/Walk/Instrument/` — `AnchorRecord` (with `AnchorRecord.Point3`,
//  `.SpanKind`, `.EntryMethod`) and `Scorecard` (with `Scorecard.Verdict`,
//  `.TrackingHealth`, plus `SurfaceStatus` and `ScorecardGap`). This file
//  briefly carried a second, flattened set of those — `AnchorPoint3`,
//  `ScorecardVerdict` and friends nested inside `ScanManifest` — written in
//  parallel by an agent that did not know the substrate port existed. Two
//  Swift models of one wire format is a bug waiting for the first producer, so
//  they were collapsed onto the substrate's: those are the types
//  `ScorecardEvaluator` and `AnchorGate` actually emit, they are already
//  `nonisolated` + `Sendable` for the capture callback, and the guard in
//  `InstrumentIsolationTests` covers that directory and not this one. The
//  flattening was only ever a workaround for the two-level nesting a
//  `ScanManifest.AnchorRecord.Point3` would have needed; top-level substrate
//  types nest one level, so the workaround is unnecessary.
//
//  `Session` and `PoseGraphSummary` have no substrate counterpart — the
//  substrate is decision logic and neither of these feeds a decision — so they
//  stay here, nested, as `ScanManifest.Session` / `.PoseGraphSummary`.
//
//  Every timestamp here is an ISO8601 `String` rather than a `Date`. See the
//  type note on `ScanManifest` — these are pass-through diagnostics that must
//  round-trip 1:1 whatever the decoder's `dateDecodingStrategy` is.
//

import Foundation

// MARK: - Session (spec §3.2)

extension ScanManifest {

    /// Per-session instrument provenance: which build, for how long, under
    /// what tracking configuration and thermal load.
    public struct Session: Codable, Equatable, Sendable {
        public var sessionId: String
        public var appVersion: String
        public var appBuild: String
        /// ISO8601 wall-clock.
        public var startedAt: String
        /// ISO8601 wall-clock.
        public var endedAt: String
        public var captureDurationSeconds: Int
        /// The ARKit configuration the session ran, e.g. `"shared-roomcapture"`.
        public var arWorldTrackingConfig: String
        /// Worst `ProcessInfo.thermalState` observed, e.g. `"nominal"`.
        public var thermalPeak: String

        public init(
            sessionId: String,
            appVersion: String,
            appBuild: String,
            startedAt: String,
            endedAt: String,
            captureDurationSeconds: Int,
            arWorldTrackingConfig: String,
            thermalPeak: String
        ) {
            self.sessionId = sessionId
            self.appVersion = appVersion
            self.appBuild = appBuild
            self.startedAt = startedAt
            self.endedAt = endedAt
            self.captureDurationSeconds = captureDurationSeconds
            self.arWorldTrackingConfig = arWorldTrackingConfig
            self.thermalPeak = thermalPeak
        }
    }
}

// MARK: - Anchors (spec §3.3) and scorecard (spec §3.4)
//
// Deliberately absent. `ScanManifest.anchors` is `[AnchorRecord]?` and
// `.scorecard` is `Scorecard?`, both resolving to the top-level substrate types
// in `Features/Walk/Instrument/` (`AnchorRecord.swift`, `CoverageScorecard.swift`).
// See the file header for why the duplicates that used to sit here were removed
// rather than the substrate ones.

// MARK: - Pose-graph summary (spec §3.5)

extension ScanManifest {

    /// SfM pose-graph statistics for the keyframe lane.
    ///
    /// ── Why four of these are Optional here and are not on Field ─────────────
    /// Field builds a keyframe lane that ENCODES (a full-resolution HEIC and a
    /// pose per fired keyframe) and can therefore speak about a graph. Patina
    /// runs the **decision lane only** — `KeyframeTelemetryRecorder` evaluates
    /// the real gate against real frames and keeps the real counters, but
    /// writes no image, no pose file and no bundle bytes (see that file's
    /// header). There is consequently no pose graph in this app: no nodes are
    /// constructed, no edges are formed, no loop closure is detected and no
    /// translation drift is estimated.
    ///
    /// So `nodeCount`, `edgeCount`, `loopClosures` and `meanTranslationDriftPct`
    /// are Optional and Patina OMITS them. Zeros would not be humbler than
    /// Field's numbers, they would be a different claim — "we built a graph and
    /// it had no edges" — about a graph that was never built. Field's own
    /// producer hardcodes `meanTranslationDriftPct: 0.3`, which is the shape of
    /// invention this type is arranged to make unnecessary.
    ///
    /// `validate_capture_bundle.py` §10.9 type-checks `keyframeCount`,
    /// `blurRejectedCount`, `rawBlurFailures` and `encodeDropped` *when
    /// present* and requires only that `poseGraphSummary` be an object, so an
    /// omission is spec-legal. A Field manifest carrying all eight still
    /// decodes and re-encodes with all eight — Optional preserves presence.
    public struct PoseGraphSummary: Codable, Equatable, Sendable {
        /// Keyframes the gate fired. REAL in Patina — the decision lane runs.
        public var keyframeCount: Int
        /// Not measured in Patina: no pose graph is constructed. See above.
        public var nodeCount: Int?
        public var edgeCount: Int?
        public var loopClosures: Int?
        public var meanTranslationDriftPct: Double?
        /// Deduped blur rejections. REAL in Patina.
        public var blurRejectedCount: Int

        /// Field's two extra counters. They sit beyond the written spec as a
        /// logged spec-delta, but `validate_capture_bundle.py` §10.9 already
        /// type-checks them by name alongside the spec fields, and Field emits
        /// them unconditionally — so a superset that dropped them would lose
        /// data on every Field manifest it round-tripped. Carried, Optional,
        /// so a spec-only producer's summary still decodes and re-encodes
        /// without gaining keys.
        ///
        /// Both are REAL in Patina. ⚠ `encodeDropped` can only ever be 0 here,
        /// and that is a fact about the configuration rather than a lucky run:
        /// the sequencer's in-flight slot is released in the same turn it is
        /// taken because there is no encoder behind it, so `inFlight` never
        /// exceeds 1 and the backpressure drop is unreachable. Stated rather
        /// than hidden — see `KeyframeTelemetryRecorder.swift`.
        public var rawBlurFailures: Int?
        public var encodeDropped: Int?

        public init(
            keyframeCount: Int,
            nodeCount: Int? = nil,
            edgeCount: Int? = nil,
            loopClosures: Int? = nil,
            meanTranslationDriftPct: Double? = nil,
            blurRejectedCount: Int,
            rawBlurFailures: Int? = nil,
            encodeDropped: Int? = nil
        ) {
            self.keyframeCount = keyframeCount
            self.nodeCount = nodeCount
            self.edgeCount = edgeCount
            self.loopClosures = loopClosures
            self.meanTranslationDriftPct = meanTranslationDriftPct
            self.blurRejectedCount = blurRejectedCount
            self.rawBlurFailures = rawBlurFailures
            self.encodeDropped = encodeDropped
        }
    }
}

// MARK: - The layer as one value, and the one place it is folded in

extension ScanManifest {

    /// The bundle-spec version a SEALED bundle from this app conforms to.
    ///
    /// `1` is `capture-bundle-spec-v1`, and it is now true of a Patina client
    /// bundle as well as a Field one: the seven instrument keys are emitted and
    /// `validate_capture_bundle.py` accepts the result. The older reading —
    /// "1 marks a Field instrument bundle; nil means a plain client bundle" —
    /// is retired. It could not survive contact with the server, which requires
    /// the key of every bundle it ingests; a client scan that omitted it parked
    /// permanently on `SCHEMA_VIOLATION`. The marker that still distinguishes
    /// the two producers is what they CONTAIN (Field ships a keyframes/ lane
    /// and typed anchors; Patina ships neither), not a version number.
    public static let instrumentBundleSpecVersion = 1

    /// The digest `ScanBundleWriter` actually computes (`CryptoKit.SHA256`),
    /// named on the wire. `validate_capture_bundle.py` §10.3 rejects any other
    /// value, and the claim is only true once artifacts have been hashed —
    /// which is why the layer is applied at seal.
    public static let instrumentChecksumAlgorithm = "sha256"

    /// The four structured instrument values, as ONE assignment.
    ///
    /// Grouped rather than passed as four parameters because the three scalar
    /// keys (`unverified`, `checksumAlgorithm`, `bundleSpecVersion`) are not
    /// independent of them — `unverified` is a function of `anchors`, and
    /// `scorecard.anchorCount` must equal `anchors.count` (validator §10.6).
    /// A caller that could set any of those separately could produce a manifest
    /// the validator rejects for INCONSISTENCY rather than absence, which is a
    /// worse failure than the one this whole change exists to fix. `apply(_:)`
    /// derives all three, so that state is unreachable.
    public struct InstrumentLayer: Equatable, Sendable {
        /// Per-session provenance (spec §3.2).
        public let session: Session
        /// Typed ground-truth spans (spec §3.3). EMPTY on a Patina client scan:
        /// this app has no anchor-entry UI, so nothing in it can mint an
        /// `AnchorRecord`. An empty array is the honest emission — the
        /// validator requires the key to BE an array, and inventing anchors to
        /// look verified would defeat the accuracy contract the key exists for.
        public let anchors: [AnchorRecord]
        /// End-of-scan QA scorecard (spec §3.4).
        public let scorecard: Scorecard
        /// Keyframe-lane statistics (spec §3.5).
        public let poseGraphSummary: PoseGraphSummary

        public init(
            session: Session,
            anchors: [AnchorRecord],
            scorecard: Scorecard,
            poseGraphSummary: PoseGraphSummary
        ) {
            self.session = session
            self.anchors = anchors
            self.scorecard = scorecard
            self.poseGraphSummary = poseGraphSummary
        }
    }

    /// Fold the instrument layer into this manifest, deriving every key that is
    /// derivable so no caller can write an internally inconsistent bundle.
    ///
    /// Derived, not accepted:
    ///
    ///  * `unverified` — `AnchorGate.isUnverified(anchorCount:)` over
    ///    `layer.anchors.count`. That gate is the single definition of the `< 3`
    ///    rule (bundle spec §6, validator §10.6); recomputing it anywhere else
    ///    is how the flag stops propagating untouched.
    ///  * `scorecard.anchorCount` — re-minted from `layer.anchors.count`. The
    ///    anchors array is the ground truth for its own length, and §10.6 checks
    ///    the scorecard against it.
    ///  * `checksumAlgorithm` and `bundleSpecVersion` — constants of this
    ///    writer, not of the call site.
    ///
    /// A disagreeing `scorecard.anchorCount` is logged and corrected, NOT
    /// asserted. An `assert` reads as the stricter choice and is the weaker one
    /// here: it traps in every DEBUG build, and this runs on the seal path of a
    /// scan the user has just finished, so the "safe" reaction to a producer
    /// drift would be to destroy the scan instead of emitting a consistent
    /// bundle. Correcting toward the array is both the recoverable answer and
    /// the true one.
    public mutating func apply(_ layer: InstrumentLayer) {
        if layer.scorecard.anchorCount != layer.anchors.count {
            PatinaLog.scan.error(
                "[Instrument] scorecard.anchorCount \(layer.scorecard.anchorCount) disagrees with "
                + "anchors.count \(layer.anchors.count) — correcting toward the array")
        }

        bundleSpecVersion = Self.instrumentBundleSpecVersion
        checksumAlgorithm = Self.instrumentChecksumAlgorithm
        session = layer.session
        anchors = layer.anchors
        poseGraphSummary = layer.poseGraphSummary
        unverified = AnchorGate.isUnverified(anchorCount: layer.anchors.count)
        scorecard = Scorecard(
            coveragePct: layer.scorecard.coveragePct,
            sharpFrameRatio: layer.scorecard.sharpFrameRatio,
            trackingHealth: layer.scorecard.trackingHealth,
            anchorCount: layer.anchors.count,
            verdict: layer.scorecard.verdict,
            surfaceChecklist: layer.scorecard.surfaceChecklist,
            namedGaps: layer.scorecard.namedGaps)
    }
}
