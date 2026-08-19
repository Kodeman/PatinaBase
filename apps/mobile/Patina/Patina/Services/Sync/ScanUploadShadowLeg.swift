//
//  ScanUploadShadowLeg.swift
//  Patina
//
//  The R2 shadow leg: after an artifact's PRIMARY upload to Supabase Storage
//  succeeds, send the same bytes a second time through the Phase-2 upload
//  interface (`MediaUploadIntentClient`) and record what came back.
//
//  It is a measurement, not a delivery. Nothing downstream reads the R2 object
//  yet — `MEDIA_UPLOADS` is `off` in every committed environment — so the leg's
//  only product is the answer to "would the new interface have accepted these
//  bytes, and did it hash them the same?", recorded per artifact in
//  device-local state.
//
//  THE INVARIANT, and the reason `afterPrimary` exists as its own function:
//  the primary path's success and failure semantics must be byte-identical
//  whether the toggle is on or off, and whether the shadow succeeds or fails.
//

import Foundation
import Supabase

public struct ScanUploadShadowLeg: Sendable {

    /// UserDefaults toggle, default OFF. Same shape as
    /// `RoomScanSyncService.cellularOptInKey` — the app's existing local
    /// (non-PostHog) switch for this exact upload path.
    public static let toggleKey = "patina.scanUploadShadowR2"

    /// Artifacts larger than this are not shadowed.
    ///
    /// The shadow leg runs on a FOREGROUND `URLSession`, so an upload it starts
    /// dies when the app is suspended. The primary path's own background
    /// threshold is 5 MB, which is where it stops trusting a foreground
    /// transfer to finish; the shadow gets a far more generous ceiling because
    /// its failure is free, but it still needs one — `depth.zip` and the bundle
    /// archive run to hundreds of megabytes, and spending that twice on a
    /// user's cellular plan to measure a checksum is not a trade this leg is
    /// allowed to make.
    ///
    /// See the file header of `MediaUploadIntentClient` for why the background
    /// session was not reused: `BackgroundScanUploader` is a singleton whose
    /// completion router is keyed by `(scanId, artifactKind)` — the key the
    /// PRIMARY leg's waiter already occupies for this same artifact — and whose
    /// delegate hard-codes Supabase Storage's 401-refresh and metadata
    /// round-trip. Threading a second, differently-shaped request through it
    /// would rework the primary path's transport to serve the shadow.
    public static let maxShadowBytes = 64 * 1024 * 1024

    // MARK: - Outcome

    /// What the leg observed, in the three fields `ArtifactUploadState` keeps.
    public struct Outcome: Sendable, Equatable {
        public var uploaded: Bool?
        public var sha256: String?
        public var matched: Bool?

        /// The leg did not run at all. Distinct from a failed run, and never
        /// written to the package — see `afterPrimary`.
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

    /// This app's artifact vocabulary onto the interface's closed set.
    ///
    /// Nil means "the interface has no name for this kind", and the leg skips
    /// it rather than guessing — the `artifactKind` is part of the object key
    /// and of the registry row, so a wrong name files real bytes under a false
    /// fact.
    ///
    /// `.bundleArchive` is the one deliberate omission. The only slot in the
    /// interface's set carrying its column and folder (`scan_bundle_url` /
    /// `bundle`, per `keys.py`) is `keyframesArchive`, whose name asserts
    /// keyframe content — this app's `bundle.zip` is a whole-bundle backup, so
    /// the two coincide in the legacy key layout and disagree about what the
    /// bytes are. Left unmapped for the contract owner to rule on.
    ///
    /// `.depthIndex`, `.photoThumbnails` and `.annotations` never reach an
    /// upload at all (`ArtifactUploader.routing(for:)` returns nil), so their
    /// absence here is unreachable rather than a gap.
    public static func uploadKind(
        for kind: ScanManifest.ArtifactKind
    ) -> MediaUploadIntentClient.ArtifactKind? {
        switch kind {
        case .usdz:             return .usdz
        case .capturedRoomJson: return .capturedRoomJson
        case .worldMap:         return .worldMap
        case .mesh:             return .mesh
        case .depthArchive:     return .depthArchive
        case .photosManifest:   return .photosManifest
        case .coverageHeatmap:  return .coverageHeatmap
        case .bundleManifest:   return .bundleManifest
        // `hero_frame_url` on both sides — the same slot under two names.
        case .heroThumbnail:    return .heroFrame
        case .bundleArchive,
             .depthIndex,
             .photoThumbnails,
             .annotations:
            return nil
        }
    }

    // MARK: - Construction

    private let client: MediaUploadIntentClient
    private let maxBytes: Int

    public init(client: MediaUploadIntentClient, maxBytes: Int = ScanUploadShadowLeg.maxShadowBytes) {
        self.client = client
        self.maxBytes = maxBytes
    }

    /// The live leg, or nil when dormant: toggle off, or no `EDGE_API_URL`.
    ///
    /// Both are checked here so the call site holds one optional and no policy.
    public static func live(
        defaults: UserDefaults = .standard,
        edgeAPIURL: URL? = APIConfiguration.edgeAPIURL
    ) -> ScanUploadShadowLeg? {
        guard defaults.bool(forKey: toggleKey), let baseURL = edgeAPIURL else {
            return nil
        }
        return ScanUploadShadowLeg(
            client: MediaUploadIntentClient(
                baseURL: baseURL,
                // The async `session` accessor refreshes an expired token on
                // its own, so the ordinary refresh needs no help; the explicit
                // `refreshSession` below is for the 401 the worker returns when
                // the cached token is rejected despite looking valid.
                accessToken: { try? await supabase.auth.session.accessToken },
                refreshSession: { _ = try? await supabase.auth.refreshSession() }
            )
        )
    }

    // MARK: - The leg

    /// Shadow one artifact. Never throws: a shadow failure is an observation,
    /// not an error, and this is called from inside the primary path's success
    /// branch where a throw would be indistinguishable from a primary failure.
    public func run(
        artifact: ScanManifest.Artifact,
        fileURL: URL,
        scanId: UUID
    ) async -> Outcome {
        guard let kind = Self.uploadKind(for: artifact.kind) else {
            PatinaLog.sync.debug("[ShadowR2] skipped \(artifact.kind.rawValue): no interface kind")
            return .notAttempted
        }
        guard let filename = Self.safeFilename(from: artifact.relativePath) else {
            PatinaLog.sync.debug("[ShadowR2] skipped \(artifact.kind.rawValue): unsafe filename")
            return .notAttempted
        }

        guard let (declaredSha, declaredSize) = measure(fileURL, kind: artifact.kind) else {
            return .notAttempted
        }

        let request = MediaUploadIntentClient.IntentRequest(
            scanId: scanId,
            artifactKind: kind,
            filename: filename,
            declaredSha256: declaredSha,
            declaredSize: declaredSize,
            declaredMime: Self.safeMime(artifact.mimeType)
        )

        do {
            let confirmation = try await client.upload(fileAt: fileURL, request: request)
            let matched = confirmation.sha256 == declaredSha
            PatinaLog.sync.info(
                "[ShadowR2] confirmed \(artifact.kind.rawValue) lifecycle=\(confirmation.lifecycle) matched=\(matched)"
            )
            UploadDiagnosticsLog.shared.log(
                event: "shadow.confirmed",
                scanId: scanId,
                artifactKind: artifact.kind.rawValue,
                sha: declaredSha,
                extra: ["lifecycle": confirmation.lifecycle, "matched": String(matched)]
            )
            return Outcome(uploaded: true, sha256: declaredSha, matched: matched)
        } catch {
            // Every failure lands here and stops here. The primary upload has
            // already succeeded by the time this runs; nothing about the scan's
            // state depends on the answer.
            PatinaLog.sync.info(
                "[ShadowR2] failed \(artifact.kind.rawValue): \(String(describing: error))"
            )
            UploadDiagnosticsLog.shared.log(
                event: "shadow.failed",
                scanId: scanId,
                artifactKind: artifact.kind.rawValue,
                sha: declaredSha,
                error: String(describing: error)
            )
            return Outcome(uploaded: false, sha256: declaredSha, matched: nil)
        }
    }

    /// The artifact's true digest and length, or nil when it should not be
    /// shadowed at all.
    ///
    /// Measured off DISK rather than read from the manifest: the declared
    /// checksum is a signed condition R2 enforces, so a stale manifest value
    /// would be a guaranteed BadDigest rather than a merely wrong label.
    private func measure(
        _ fileURL: URL,
        kind: ScanManifest.ArtifactKind
    ) -> (sha: String, size: Int)? {
        do {
            let size = try MediaUploadIntentClient.fileSize(ofFileAt: fileURL)
            guard size > 0, size <= maxBytes else {
                PatinaLog.sync.debug("[ShadowR2] skipped \(kind.rawValue): \(size) bytes")
                return nil
            }
            return (try MediaUploadIntentClient.sha256Hex(ofFileAt: fileURL), size)
        } catch {
            PatinaLog.sync.info("[ShadowR2] digest failed \(kind.rawValue): \(error.localizedDescription)")
            return nil
        }
    }

    // MARK: - Field shaping

    /// The last path component, if it satisfies the interface's
    /// `FILENAME_PATTERN` (one safe segment, no traversal). Nil otherwise —
    /// the worker would answer 400 and the leg would rather not ask.
    static func safeFilename(from relativePath: String) -> String? {
        let candidate = relativePath.split(separator: "/").last.map(String.init) ?? relativePath
        guard
            (1...128).contains(candidate.count),
            !candidate.contains(".."),
            let first = candidate.first,
            first.isLetter || first.isNumber,
            first.isASCII
        else { return nil }
        let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "._-"))
        guard candidate.unicodeScalars.allSatisfy({ $0.isASCII && allowed.contains($0) }) else {
            return nil
        }
        return candidate
    }

    /// The interface's `MIME_PATTERN` is lowercase `type/subtype`. Anything
    /// this app cannot make fit becomes `application/octet-stream` — the type
    /// is metadata on this route (`content-type` is explicitly NOT signed), so
    /// a fallback costs nothing and a 400 would cost the whole measurement.
    static func safeMime(_ raw: String) -> String {
        let lowered = raw.lowercased()
        let parts = lowered.split(separator: "/", omittingEmptySubsequences: true)
        guard parts.count == 2 else { return "application/octet-stream" }
        let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "!#$&^_.+-"))
        let valid = parts.allSatisfy { part in
            !part.isEmpty
                && part.count <= 127
                && part.unicodeScalars.allSatisfy { $0.isASCII && allowed.contains($0) }
        }
        return valid ? lowered : "application/octet-stream"
    }
}

extension ArtifactUploadState {
    /// Fold a shadow outcome into the artifact's device-local state.
    ///
    /// A leg that never ran writes nothing — so with the toggle off this state
    /// is identical to what the primary path produced before the leg existed,
    /// and a re-upload whose shadow was skipped does not erase what an earlier
    /// run measured.
    mutating func apply(shadow outcome: ScanUploadShadowLeg.Outcome) {
        guard outcome.wasAttempted else { return }
        shadowUploaded = outcome.uploaded
        shadowSha256 = outcome.sha256
        shadowMatched = outcome.matched
    }
}
