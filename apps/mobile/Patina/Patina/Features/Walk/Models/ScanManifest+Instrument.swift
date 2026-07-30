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
//  `unverified`, `checksumAlgorithm`) live there directly. Nothing in the
//  client populates any of it yet — a later wave wires the producers. Until
//  then every one of them is nil, and a nil Optional is omitted by the
//  synthesized `encode(to:)`, so a client-written manifest is byte-for-byte
//  what it always was.
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
    public struct PoseGraphSummary: Codable, Equatable, Sendable {
        public var keyframeCount: Int
        public var nodeCount: Int
        public var edgeCount: Int
        public var loopClosures: Int
        public var meanTranslationDriftPct: Double
        public var blurRejectedCount: Int

        /// Field's two extra counters. They sit beyond the written spec as a
        /// logged spec-delta, but `validate_capture_bundle.py` §10.9 already
        /// type-checks them by name alongside the spec fields, and Field emits
        /// them unconditionally — so a superset that dropped them would lose
        /// data on every Field manifest it round-tripped. Carried, Optional,
        /// so a spec-only producer's summary still decodes and re-encodes
        /// without gaining keys.
        public var rawBlurFailures: Int?
        public var encodeDropped: Int?

        public init(
            keyframeCount: Int,
            nodeCount: Int,
            edgeCount: Int,
            loopClosures: Int,
            meanTranslationDriftPct: Double,
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
