//  FieldScanUploadShadowLeg.swift
//  CaptureKit
//
//  The R2 shadow leg for Patina Field, ported from the client app's
//  `ScanUploadShadowLeg` (`apps/mobile/Patina/Patina/Services/Sync/`, W3-B).
//
//  After an artifact's PRIMARY upload to Supabase Storage succeeds, send the
//  same bytes a second time through the Phase-2 upload interface
//  (`MediaUploadIntentClient`) and record what came back.
//
//  It is a measurement, not a delivery. Nothing downstream reads the R2 object
//  yet — `MEDIA_UPLOADS` is `off` in every committed environment — so the leg's
//  only product is the answer to "would the new interface have accepted these
//  bytes, and did it hash them the same?", recorded per artifact in
//  device-local state (`ScanArtifactUploadState`, inside the `ScanUploadRecord`
//  @Model).
//
//  THE INVARIANT, and the reason `afterPrimary` exists as its own function:
//  the primary path's success and failure semantics must be byte-identical
//  whether the toggle is on or off, and whether the shadow succeeds or fails.
//
//  DISJOINT FROM `confirm-scan-bundle`. Field's real confirmation is a bundle-
//  level call to the `confirm-scan-bundle` edge function
//  (`SupabaseSiteScanService.confirmBundle`), gated by `ScanConfirmPolicy` and
//  able to mark a scan ready. The shadow's confirm is a per-ARTIFACT POST to
//  `/v1/media/uploads/:id/confirm` on the edge API worker. Different endpoint,
//  different granularity, different transport, no shared state, and neither can
//  see the other's result — the naming here keeps them visibly apart.

import Foundation
import os.log

public struct FieldScanUploadShadowLeg: Sendable {

    /// App Group defaults toggle, default OFF. The App Group suite
    /// (`CaptureStore.appGroupID`) is Field's local, non-PostHog switch store —
    /// the same one `CapturePrefs` writes its per-designer dials into.
    public static let toggleKey = "field.scanUploadShadowR2"

    /// The App Group defaults, or `.standard` when the container is unavailable
    /// (Simulator without the entitlement) — mirrors `CapturePrefs.store`.
    public static var defaultStore: UserDefaults {
        UserDefaults(suiteName: CaptureStore.appGroupID) ?? .standard
    }

    /// Artifacts larger than this are not shadowed.
    ///
    /// The PRIMARY path here is a BACKGROUND `URLSession`
    /// (`FieldBackgroundScanUploader`), so it survives suspension; the shadow
    /// leg deliberately does not reuse that session and runs foreground, so an
    /// upload it starts dies when the app is suspended. The cap is generous
    /// because a shadow failure is free, but it still needs one — `depth.tar`
    /// and `keyframes.tar` run to hundreds of megabytes, and spending that
    /// twice on a designer's cellular plan to measure a checksum is not a trade
    /// this leg is allowed to make.
    ///
    /// The background session was not reused because its completion router is
    /// keyed by `ScanArtifactTransferKey(owner, scanID, kind)` — the key the
    /// PRIMARY leg's waiter already occupies for this same artifact — and its
    /// delegate hard-codes Supabase Storage's 401-refresh and the
    /// `/object/info/authenticated` metadata round-trip. Threading a second,
    /// differently-shaped request through it would rework the primary path's
    /// transport to serve the shadow.
    public static let maxShadowBytes = 64 * 1024 * 1024

    private static let logger = Logger(
        subsystem: "cloud.patina.field",
        category: "SiteScanShadowR2"
    )

    // MARK: - Outcome

    /// What the leg observed, in the three fields `ScanArtifactUploadState`
    /// keeps.
    public struct Outcome: Sendable, Equatable {
        public var uploaded: Bool?
        public var sha256: String?
        public var matched: Bool?

        /// The leg did not run at all. Distinct from a failed run, and never
        /// written to the record — see `afterPrimary`.
        public static let notAttempted = Outcome(uploaded: nil, sha256: nil, matched: nil)

        public var wasAttempted: Bool { uploaded != nil }

        public init(uploaded: Bool?, sha256: String?, matched: Bool?) {
            self.uploaded = uploaded
            self.sha256 = sha256
            self.matched = matched
        }
    }

    // MARK: - Isolation

    /// Run `primary`, then the shadow — and only then.
    ///
    /// This function IS the isolation guarantee, which is why it is not inlined
    /// at the call site: `shadow` is unreachable when `primary` throws, it
    /// cannot itself throw, and the value `primary` produced is handed back
    /// untouched. The outcome is RETURNED rather than written through a
    /// callback so the caller folds it into the state record it was already
    /// building — a shadow that wrote its own record would race the primary's.
    ///
    /// With the toggle off, `shadow` answers `.notAttempted` and the call
    /// reduces to `primary`.
    public static func afterPrimary<T>(
        primary: () async throws -> T,
        shadow: (T) async -> Outcome
    ) async rethrows -> (value: T, shadow: Outcome) {
        let value = try await primary()
        return (value, await shadow(value))
    }

    // MARK: - Kind mapping

    /// A descriptor's `kind` as the interface names it.
    ///
    /// There is no translation layer, and that is the point: Field's
    /// `ScanUploadDescriptor.all` already speaks the worker's vocabulary —
    /// `kind`, `folder`, `filename`, and `contentType` are the same strings
    /// `keys.py` and `UPLOAD_ARTIFACT_KINDS` use — so the descriptor table IS
    /// the mapping and this is a raw-value lookup. Nil would mean the interface
    /// has no name for a kind, and the leg skips it rather than guessing; the
    /// drift guard in `ShadowLegDescriptorContractTests` asserts nil is
    /// unreachable for all 11 shipped descriptors.
    public static func uploadKind(
        for descriptor: ScanUploadDescriptor
    ) -> MediaUploadIntentClient.ArtifactKind? {
        MediaUploadIntentClient.ArtifactKind(rawValue: descriptor.kind)
    }

    // MARK: - Construction

    private let client: MediaUploadIntentClient
    private let maxBytes: Int

    public init(
        client: MediaUploadIntentClient,
        maxBytes: Int = FieldScanUploadShadowLeg.maxShadowBytes
    ) {
        self.client = client
        self.maxBytes = maxBytes
    }

    /// The live leg, or nil when dormant: toggle off, or no `EDGE_API_URL`.
    ///
    /// Both are checked here so the call site holds one optional and no policy.
    /// The session seams are parameters rather than a reach for the app's
    /// Supabase client because CaptureKit does not link supabase-swift — the
    /// app target passes the same closures it gives
    /// `FieldBackgroundScanUploader`.
    public static func live(
        defaults: UserDefaults = FieldScanUploadShadowLeg.defaultStore,
        edgeAPIURL: URL?,
        accessToken: @escaping @Sendable () async -> String?,
        refreshSession: @escaping @Sendable () async -> Void = {}
    ) -> FieldScanUploadShadowLeg? {
        guard defaults.bool(forKey: toggleKey), let baseURL = edgeAPIURL else {
            return nil
        }
        return FieldScanUploadShadowLeg(
            client: MediaUploadIntentClient(
                baseURL: baseURL,
                accessToken: accessToken,
                refreshSession: refreshSession
            )
        )
    }

    // MARK: - The leg

    /// Shadow one artifact. Never throws: a shadow failure is an observation,
    /// not an error, and this is called from inside the primary path's success
    /// branch where a throw would be indistinguishable from a primary failure.
    ///
    /// `filename` and `declaredMime` come straight off the descriptor, unshaped.
    /// Both are already interface-legal — `filename` satisfies the worker's
    /// `FILENAME_PATTERN` and `contentType` its `MIME_PATTERN` — and the drift
    /// guard keeps them that way, so a shaping layer here would only be able to
    /// hide a table that had drifted.
    public func run(
        descriptor: ScanUploadDescriptor,
        fileURL: URL,
        scanId: UUID
    ) async -> Outcome {
        guard let kind = Self.uploadKind(for: descriptor) else {
            Self.logger.debug("[ShadowR2] skipped \(descriptor.kind): no interface kind")
            return .notAttempted
        }

        guard let (declaredSha, declaredSize) = measure(fileURL, kind: descriptor.kind) else {
            return .notAttempted
        }

        let request = MediaUploadIntentClient.IntentRequest(
            scanId: scanId,
            artifactKind: kind,
            filename: descriptor.filename,
            declaredSha256: declaredSha,
            declaredSize: declaredSize,
            declaredMime: descriptor.contentType
        )

        do {
            let confirmation = try await client.upload(fileAt: fileURL, request: request)
            let matched = confirmation.sha256 == declaredSha
            Self.logger.info(
                "[ShadowR2] confirmed \(descriptor.kind) lifecycle=\(confirmation.lifecycle) matched=\(matched)"
            )
            return Outcome(uploaded: true, sha256: declaredSha, matched: matched)
        } catch {
            // Every failure lands here and stops here. The primary upload has
            // already succeeded by the time this runs; nothing about the scan's
            // state depends on the answer.
            Self.logger.info(
                "[ShadowR2] failed \(descriptor.kind): \(String(describing: error))"
            )
            return Outcome(uploaded: false, sha256: declaredSha, matched: nil)
        }
    }

    /// The artifact's true digest and length, or nil when it should not be
    /// shadowed at all.
    ///
    /// Measured off DISK rather than reused from the primary path's
    /// `BundleChecksum` result: the declared checksum is a signed condition R2
    /// enforces, and an independent measurement is the only kind whose
    /// agreement with the confirmed digest means anything.
    private func measure(
        _ fileURL: URL,
        kind: String
    ) -> (sha: String, size: Int)? {
        do {
            let size = try MediaUploadIntentClient.fileSize(ofFileAt: fileURL)
            guard size > 0, size <= maxBytes else {
                Self.logger.debug("[ShadowR2] skipped \(kind): \(size) bytes")
                return nil
            }
            return (try MediaUploadIntentClient.sha256Hex(ofFileAt: fileURL), size)
        } catch {
            Self.logger.info("[ShadowR2] digest failed \(kind): \(error.localizedDescription)")
            return nil
        }
    }
}

public extension ScanArtifactUploadState {
    /// Fold a shadow outcome into the artifact's device-local state.
    ///
    /// A leg that never ran writes nothing — so with the toggle off this state
    /// is identical to what the primary path produced before the leg existed,
    /// and a re-upload whose shadow was skipped does not erase what an earlier
    /// run measured.
    mutating func apply(shadow outcome: FieldScanUploadShadowLeg.Outcome) {
        guard outcome.wasAttempted else { return }
        shadowUploaded = outcome.uploaded
        shadowSha256 = outcome.sha256
        shadowMatched = outcome.matched
    }
}
