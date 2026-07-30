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
//  (`session`, `anchors`, `scorecard`, `poseGraphSummary`); the scalars
//  (`bundleSpecVersion`, `unverified`, `checksumAlgorithm`) live there
//  directly. Nothing in the client populates any of it yet — a later wave
//  wires the producers. Until then every one of them is nil, and a nil
//  Optional is omitted by the synthesized `encode(to:)`, so a client-written
//  manifest is byte-for-byte what it always was.
//
//  Why a separate file, and why the type names are flat: `ScanManifest` is
//  already at SwiftLint's `type_body_length` ceiling, and the `nesting` rule
//  allows one level, so `AnchorRecord.Point3` / `Scorecard.Verdict` (Field's
//  own arrangement) would both warn. They are declared here as siblings
//  instead — `AnchorPoint3`, `ScorecardVerdict`. Only the *type* names move;
//  the JSON keys and enum raw values are Field's, verbatim, which is the part
//  the wire cares about.
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

// MARK: - Anchors (spec §3.3)

extension ScanManifest {

    /// What a span measures. Matches the `scan_anchors.span_kind` CHECK.
    public enum AnchorSpanKind: String, Codable, Sendable {
        case span
        case height
    }

    /// How the ground truth was entered. P1 is typed-only; the validator
    /// rejects anything else (§10.6).
    public enum AnchorEntryMethod: String, Codable, Sendable {
        case typed
    }

    /// A model-space point, metres, ARKit world frame.
    public struct AnchorPoint3: Codable, Equatable, Sendable {
        public var x: Double
        public var y: Double
        public var z: Double

        public init(x: Double, y: Double, z: Double) {
            self.x = x
            self.y = y
            self.z = z
        }
    }

    /// One typed ground-truth span: two taps on the live model plus the
    /// tape/laser value the operator typed. Three of these are what lift a
    /// scan out of `unverified`.
    ///
    /// `id` stays a `String`, not a `UUID`, on purpose. It is the
    /// `scan_anchors.client_anchor_id` idempotency key and Field writes it
    /// lowercased; decoding to `UUID` and re-encoding would silently
    /// upper-case it and break idempotency against rows already written.
    public struct AnchorRecord: Codable, Equatable, Sendable {
        public var id: String
        /// Capture order within the session.
        public var index: Int
        /// Human label for the span, e.g. `"north wall run"`.
        public var label: String
        public var spanKind: AnchorSpanKind
        public var entryMethod: AnchorEntryMethod
        public var endpointA: AnchorPoint3
        public var endpointB: AnchorPoint3
        /// Captured tap-to-tap distance, metres (for the scale residual).
        public var modelSpanMeters: Double
        /// Typed ground truth, integer millimetres. The validator requires a
        /// positive integer.
        public var measuredValueMm: Int

        public init(
            id: String,
            index: Int,
            label: String,
            spanKind: AnchorSpanKind,
            entryMethod: AnchorEntryMethod = .typed,
            endpointA: AnchorPoint3,
            endpointB: AnchorPoint3,
            modelSpanMeters: Double,
            measuredValueMm: Int
        ) {
            self.id = id
            self.index = index
            self.label = label
            self.spanKind = spanKind
            self.entryMethod = entryMethod
            self.endpointA = endpointA
            self.endpointB = endpointB
            self.modelSpanMeters = modelSpanMeters
            self.measuredValueMm = measuredValueMm
        }
    }
}

// MARK: - Scorecard (spec §3.4)

extension ScanManifest {

    public enum ScorecardVerdict: String, Codable, Sendable {
        case green
        case amber
        case red
    }

    public enum ScorecardTrackingHealth: String, Codable, Sendable {
        case good
        case fair
        case poor
    }

    /// One row of the surface checklist.
    public struct SurfaceStatus: Codable, Equatable, Sendable {
        /// Checklist key, e.g. `"wall:north"`.
        public var surface: String
        public var covered: Bool

        public init(surface: String, covered: Bool) {
            self.surface = surface
            self.covered = covered
        }
    }

    /// One named gap for the "walk me to the gap" list. Keyed on the unique
    /// checklist `surface`, never on the (possibly duplicated) `phrase`.
    public struct ScorecardGap: Codable, Equatable, Sendable {
        public var surface: String
        public var phrase: String

        public init(surface: String, phrase: String) {
            self.surface = surface
            self.phrase = phrase
        }
    }

    /// The end-of-scan QA scorecard.
    public struct Scorecard: Codable, Equatable, Sendable {
        public var coveragePct: Int
        public var sharpFrameRatio: Double
        public var trackingHealth: ScorecardTrackingHealth
        public var anchorCount: Int
        public var verdict: ScorecardVerdict
        public var surfaceChecklist: [SurfaceStatus]
        /// Unobserved-surface gaps. Additive beyond spec §3.4 — a logged Field
        /// spec-delta, which is why it is Optional here: a spec-only producer
        /// omits it, and staying nil means we re-encode without inventing the
        /// key.
        public var namedGaps: [ScorecardGap]?

        public init(
            coveragePct: Int,
            sharpFrameRatio: Double,
            trackingHealth: ScorecardTrackingHealth,
            anchorCount: Int,
            verdict: ScorecardVerdict,
            surfaceChecklist: [SurfaceStatus] = [],
            namedGaps: [ScorecardGap]? = nil
        ) {
            self.coveragePct = coveragePct
            self.sharpFrameRatio = sharpFrameRatio
            self.trackingHealth = trackingHealth
            self.anchorCount = anchorCount
            self.verdict = verdict
            self.surfaceChecklist = surfaceChecklist
            self.namedGaps = namedGaps
        }
    }
}

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
