//  LocalCaptureSyncService.swift
//  Capture
//
//  The concrete sync backbone (real mode). Offline-first: `enqueue` only ever
//  touches the local outbox and never blocks on the network; `drain` walks the
//  outbox oldest-first, and `commit` does the real work — uploads each artifact
//  to the `capture-media` bucket (00234) then calls `commit_field_capture`
//  (00235), idempotent on `Specimen.clientToken`. It streams `SyncSnapshot`s that
//  drive U1 and the offline-sync Live Activity.
//
//  Network I/O goes through the injected `SupabaseCaptureGateway`. A missing
//  gateway is deferrable: the record remains queued and is never presented as a
//  remote success without a server receipt.

import Foundation
import UIKit
import CaptureKit

enum LocalSyncError: LocalizedError {
    case specimenNotFound(UUID)
    /// No signed-in session — the capture must stay queued, not fail.
    case notAuthenticated
    case remoteUnavailable
    case destinationRequired
    case missingRemoteReceipt
    case remoteRejected(String)
    case invalidPlacementTarget

    var errorDescription: String? {
        switch self {
        case .specimenNotFound(let id):
            return "Specimen \(id) not found in the local store."
        case .notAuthenticated:
            return "Not signed in — captures stay queued until you connect."
        case .remoteUnavailable:
            return "Sync isn't available yet — this capture stays on this device."
        case .destinationRequired:
            return "Choose where this belongs before sending it."
        case .missingRemoteReceipt:
            return "The server did not confirm this capture."
        case .remoteRejected(let message):
            return message
        case .invalidPlacementTarget:
            return "The saved project placement is no longer valid. Choose the project, room, and slot again."
        }
    }

    /// Deferrable failures leave the item queued (no `.failed`, no retry penalty).
    var isDeferrable: Bool {
        if case .notAuthenticated = self { return true }
        if case .remoteUnavailable = self { return true }
        return false
    }

    var isRejected: Bool {
        if case .destinationRequired = self { return true }
        if case .remoteRejected = self { return true }
        return false
    }
}

@MainActor
final class LocalCaptureSyncService: CaptureSyncService {
    private let store: CaptureStore
    private let analytics: (any CaptureAnalytics)?
    /// Optional: when present, the offline-sync Live Activity tracks the queue.
    private let liveActivity: CaptureLiveActivityController?
    /// Identity source for the storage path (`<uid>/…`) + `p_organization_id`.
    private let session: (any SessionProviding)?
    /// When present, commits do real upload + RPC; nil leaves records queued.
    private let remote: SupabaseCaptureGateway?
    /// Where a filing is remembered (§2.2), so proximity can offer the project
    /// back next visit. Fed only from a capture the server has accepted.
    private let projectCache: CaptureProjectCache?
    /// FC-R4's two post-commit lanes. Nil leaves both closed, exactly as a nil
    /// `remote` leaves the capture itself queued.
    private let fieldWrites: SupabaseFieldWriteGateway?
    private let stream: AsyncStream<SyncSnapshot>
    private let continuation: AsyncStream<SyncSnapshot>.Continuation
    /// One drain task per authenticated identity. Re-entrant callers await the
    /// same task; a workspace/account switch starts an isolated task whose first
    /// owner revalidation safely defers the old one.
    private var activeDrainTasks: [CaptureOwnerIdentity: Task<Void, Never>] = [:]

    init(store: CaptureStore,
         analytics: (any CaptureAnalytics)? = nil,
         liveActivity: CaptureLiveActivityController? = nil,
         session: (any SessionProviding)? = nil,
         remote: SupabaseCaptureGateway? = nil,
         projectCache: CaptureProjectCache? = nil,
         fieldWrites: SupabaseFieldWriteGateway? = nil) {
        self.store = store
        self.analytics = analytics
        self.liveActivity = liveActivity
        self.session = session
        self.remote = remote
        self.projectCache = projectCache
        self.fieldWrites = fieldWrites
        var cont: AsyncStream<SyncSnapshot>.Continuation!
        self.stream = AsyncStream(bufferingPolicy: .bufferingNewest(8)) { cont = $0 }
        self.continuation = cont
    }

    var snapshots: AsyncStream<SyncSnapshot> { stream }

    // ── enqueue ──────────────────────────────────────────────────────────────
    /// Persist the specimen in the local queue. Offline-safe: never reaches for
    /// the network.
    func enqueue(_ specimenID: UUID) async {
        let owner = activeOwner
        guard let specimen = scopedSpecimen(id: specimenID, owner: owner) else {
            return
        }
        // A committed specimen is NOT demoted. Its receipt is durable and its
        // local media has been swept, so a re-stamped `.queued` sends it back
        // through the upload leg against files that are gone and ends it
        // `.rejected` — a permanent failure badge on a capture the server
        // accepted. The only reason a committed row returns to the drain is a
        // wave-4 write lane, and those keep their own state: the same fact
        // `isFieldWriteLaneOnly` makes the three transfer-phase branches honour.
        // Reachable from every field-write verb, each of which enqueues.
        if !specimen.hasConfirmedCaptureReceipt {
            specimen.applyTransferState(CaptureTransferState(
                phase: .queued, retryCount: specimen.retryCount))
        }
        try? store.save()
        analytics?.event("sync.enqueue", ["id": specimenID.uuidString])
        emitFromOutbox(lastTitle: specimen.title)

        // Preserve CaptureSyncService's offline-safe/nonblocking enqueue contract:
        // authenticated real-mode captures schedule a serialized drain and return.
        guard remote != nil else { return }
        Task { @MainActor [weak self] in
            await self?.drain()
        }
    }

    // ── drain ────────────────────────────────────────────────────────────────
    /// Back online / manual retry: walk the outbox oldest-first, upload + commit
    /// each, emitting progress snapshots. Re-entrancy guarded.
    func drain() async {
        guard let owner = activeOwner else {
            emit(queued: 0, uploading: 0, failed: 0, lastTitle: nil)
            return
        }
        if let active = activeDrainTasks[owner] {
            await active.value
            return
        }

        let task = Task { @MainActor [weak self] in
            guard let self else { return }
            await self.drainOwned(owner)
            self.activeDrainTasks.removeValue(forKey: owner)
        }
        activeDrainTasks[owner] = task
        await task.value
    }

    private func drainOwned(_ owner: CaptureOwnerIdentity) async {
        var attempted: Set<UUID> = []
        var didBegin = false

        while activeOwner == owner {
            let items = scopedOutbox(owner: owner).filter {
                !attempted.contains($0.id)
                    && $0.transferState.phase != .rejected
            }
            guard !items.isEmpty else { break }

            if !didBegin {
                beginDrain(items)
                didBegin = true
            }

            var remaining = items.count
            for specimen in items {
                guard activeOwner == owner else { break }
                attempted.insert(specimen.id)
                beginAttempt(specimen)
                emit(
                    queued: max(remaining - 1, 0),
                    uploading: 1,
                    lastTitle: specimen.title
                )
                await runAttempt(specimen, owner: owner)

                remaining -= 1
                if activeOwner == owner {
                    emit(
                        queued: remaining,
                        uploading: 0,
                        lastTitle: specimen.title
                    )
                }
            }
        }

        guard activeOwner == owner else {
            emitFromOutbox()
            return
        }
        let failed = failedCount()
        liveActivity?.end(.init(queued: 0, uploading: 0, failed: failed))
        analytics?.event("sync.drain.done", ["failed": "\(failed)"])
        // A successful drain is a natural point to reclaim space: every
        // receipt this pass landed is already stamped, so the size-capped
        // sweep (FC-R19) can only find files that are safe to remove.
        store.sweepMediaRetention()
        emitFromOutbox()
    }

    /// A committed row back in the outbox ONLY for a wave-4 write lane. Its
    /// capture is durable and its Product (if any) is placed; the three
    /// transfer-phase branches below must leave it alone, or a margin-note
    /// retry paints `.uploading` and then `.retryableFailure` on a row the
    /// server accepted — a failure badge for something that did not fail.
    /// The lanes keep their own state, and that is where their errors show.
    private func isFieldWriteLaneOnly(_ specimen: Specimen) -> Bool {
        specimen.hasConfirmedCaptureReceipt
            && !specimen.needsProjectPlacement
            && !specimen.placementNeedsReplay
            && (specimen.needsMarginNote || specimen.needsPunchTask
                || specimen.needsDegradeNote)
    }

    private func beginAttempt(_ specimen: Specimen) {
        if specimen.hasConfirmedCaptureReceipt
            && specimen.needsProjectPlacement {
            specimen.markProjectPlacementStarted()
        } else if !isFieldWriteLaneOnly(specimen) {
            specimen.applyTransferState(CaptureTransferState(
                phase: .uploading, retryCount: specimen.retryCount))
        }
        try? store.save()
    }

    private func runAttempt(
        _ specimen: Specimen,
        owner: CaptureOwnerIdentity
    ) async {
        do {
            _ = try await commit(specimen.id, owner: owner)
            analytics?.event("sync.commit.ok", ["id": specimen.id.uuidString])
        } catch let error as LocalSyncError where error.isDeferrable {
            if specimen.hasConfirmedCaptureReceipt
                && specimen.needsProjectPlacement {
                specimen.markProjectPlacementPending()
            } else if !isFieldWriteLaneOnly(specimen) {
                specimen.applyTransferState(CaptureTransferState(
                    phase: .queued, retryCount: specimen.retryCount))
            }
            try? store.save()
            analytics?.event("sync.commit.deferred", ["id": specimen.id.uuidString])
        } catch {
            recordFailure(error, on: specimen)
            analytics?.event("sync.commit.fail", ["id": specimen.id.uuidString])
        }
    }

    private func recordFailure(_ error: Error, on specimen: Specimen) {
        let placementRetry = specimen.hasConfirmedCaptureReceipt
            && specimen.needsProjectPlacement
        if placementRetry {
            if specimen.placementState != .failed {
                specimen.markProjectPlacementFailed(error.localizedDescription)
            }
        } else if !isFieldWriteLaneOnly(specimen) {
            let rejected = shouldReject(error)
            specimen.applyTransferState(CaptureTransferState(
                phase: rejected ? .rejected : .retryableFailure,
                progress: specimen.uploadProgress,
                errorMessage: error.localizedDescription,
                retryCount: specimen.retryCount + (rejected ? 0 : 1)))
        }
        try? store.save()
    }

    private func shouldReject(_ error: Error) -> Bool {
        (error as? LocalSyncError)?.isRejected == true
            || error is CaptureMediaAvailabilityError
    }

    // ── commit ───────────────────────────────────────────────────────────────
    /// Upload artifacts + land the record server-side. Idempotent on
    /// `Specimen.clientToken`. No gateway leaves the item queued.
    @discardableResult
    func commit(_ specimenID: UUID) async throws -> CommitReceipt {
        guard let owner = activeOwner else {
            throw LocalSyncError.notAuthenticated
        }
        return try await commit(specimenID, owner: owner)
    }

    @discardableResult
    private func commit(
        _ specimenID: UUID,
        owner: CaptureOwnerIdentity
    ) async throws -> CommitReceipt {
        guard activeOwner == owner else {
            throw LocalSyncError.notAuthenticated
        }
        guard let specimen = scopedSpecimen(id: specimenID, owner: owner) else {
            throw LocalSyncError.specimenNotFound(specimenID)
        }
        guard CaptureRouteSafetyPolicy.canCommit(specimen.destination) else {
            throw LocalSyncError.destinationRequired
        }
        guard let remote else { throw LocalSyncError.remoteUnavailable }
        guard let uid = UUID(uuidString: owner.userID) else {
            throw LocalSyncError.notAuthenticated
        }

        let receipt: CommitReceipt
        if let confirmed = confirmedReceipt(for: specimen) {
            receipt = confirmed
        } else {
            receipt = try await commitCapture(
                specimen,
                owner: owner,
                remote: remote,
                userID: uid
            )
        }
        if let productID = receipt.productId {
            try await performProjectPlacementIfNeeded(
                for: specimen,
                productID: productID,
                owner: owner)
        }
        // OUTSIDE the productId branch on purpose: a spoken note commits with no
        // Product at all, and that is precisely the capture the margin lane
        // exists for. The receipt above is the only thing either lane waits on.
        await performFieldWritesIfNeeded(specimen, owner: owner)
        return receipt
    }

    private func commitCapture(
        _ specimen: Specimen,
        owner: CaptureOwnerIdentity,
        remote: SupabaseCaptureGateway,
        userID: UUID
    ) async throws -> CommitReceipt {
        let voiceUpload = try await uploadMedia(
            for: specimen,
            owner: owner,
            remote: remote,
            userID: userID
        )
        var payload = FieldCapturePayload(
            specimen: specimen,
            device: Self.deviceInfo()
        )
        if !voiceUpload.paths.isEmpty {
            payload.voice?.audioPath = voiceUpload.paths.first
            payload.voice?.audioSegments = voiceUpload.paths
        }
        if voiceUpload.lost > 0 {
            payload.voice?.audioLost = true
            if voiceUpload.paths.isEmpty {
                // Every segment was lost. audioSegments is always the ordered
                // list of segments that exist server-side, so here it is empty
                // — never the builder's bare local filenames, which would name
                // objects nothing ever uploaded. Empty + audioLost separates
                // "had audio, all of it is gone" from "had no audio" (no key).
                payload.voice?.audioPath = nil
                payload.voice?.audioSegments = []
            }
        }

        let routing = CaptureRoutingContext(
            projectID: specimen.venue?.projectId.flatMap { UUID(uuidString: $0) },
            projectRoomID: specimen.venue?.projectRoomId.flatMap { UUID(uuidString: $0) },
            shelf: specimen.venue?.shelf,
            organizationID: UUID(uuidString: owner.workspaceID)
        )
        // FC-R6: the placement AS SENT, taken with the routing. She can re-place
        // during the awaits below, and the receipt must not be read as covering
        // a project it never carried.
        let sentProjectID = specimen.venue?.projectId
        let sentProjectRoomID = specimen.venue?.projectRoomId
        try requireActiveOwner(owner)
        specimen.applyTransferState(CaptureTransferState(
            phase: .awaitingConfirmation,
            progress: 100,
            retryCount: specimen.retryCount))
        try? store.save()
        emitTransferState(lastTitle: specimen.title)
        let destination: String
        switch specimen.destination {
        case .library:
            destination = "library"
        case .inbox:
            destination = "inbox"
        case .undecided:
            throw LocalSyncError.destinationRequired
        }
        let result = try await remote.commit(
            clientCaptureID: specimen.clientToken,
            destination: destination,
            payload: payload,
            routing: routing
        )
        try requireActiveOwner(owner)
        let receipt = try applyCommitResult(result, to: specimen)
        rememberFiling(specimen, owner: owner)
        if specimen.reconcilePlacementReplay(sentProjectID: sentProjectID,
                                             sentProjectRoomID: sentProjectRoomID) {
            try? store.save()
        }
        return receipt
    }

    /// §2.2: a capture the server accepted teaches the cache where its project
    /// physically is, so standing here again next visit can offer that project
    /// back. Only a FILED capture counts — `venue.projectId` is the fact she
    /// stated, never `suggested_*`, which nothing reads as truth.
    private func rememberFiling(_ specimen: Specimen, owner: CaptureOwnerIdentity) {
        guard let projectID = specimen.venue?.projectId, !projectID.isEmpty else { return }
        let coordinate = specimen.venue.flatMap { stamp -> CaptureCoordinate? in
            guard let lat = stamp.latitude, let lng = stamp.longitude else { return nil }
            return CaptureCoordinate(latitude: lat, longitude: lng)
        }
        projectCache?.recordFiling(projectID: projectID, at: coordinate, owner: owner)
    }

    /// FC-R6: `canReuseConfirmedReceipt` is `hasConfirmedCaptureReceipt` MINUS a
    /// pending placement replay — a capture placed after it committed re-runs
    /// `commit_field_capture` so the server learns its project.
    private func confirmedReceipt(for specimen: Specimen) -> CommitReceipt? {
        guard specimen.canReuseConfirmedReceipt,
              let remoteID = specimen.remoteId,
              let productID = specimen.committedProductId else { return nil }
        return CommitReceipt(
            remoteId: remoteID,
            productId: productID,
            destination: specimen.destination,
            created: false
        )
    }

    private func uploadMedia(
        for specimen: Specimen,
        owner: CaptureOwnerIdentity,
        remote: SupabaseCaptureGateway,
        userID: UUID
    ) async throws -> (paths: [String], lost: Int) {
        // Photos only. Validating voice here would throw
        // CaptureMediaAvailabilityError, which shouldReject classifies as
        // `.rejected`, and drainOwned excludes a rejected specimen from the
        // drain query — one lost segment would orphan the note from sync
        // forever. The per-segment drop below is what handles voice instead.
        try store.validateRequiredPhotos(for: specimen)

        let folder = CaptureMediaPath.folder(
            userID: userID,
            clientToken: specimen.clientToken
        )
        let photos = specimen.photos
            .filter {
                ($0.remotePath?.trimmingCharacters(
                    in: .whitespacesAndNewlines
                ) ?? "").isEmpty
            }
            .sorted { $0.order < $1.order }
        let voiceFilenames: [String] = {
            let raw = (specimen.voiceAudioSegmentsRaw?.isEmpty == false)
                ? specimen.voiceAudioSegmentsRaw!
                : [specimen.voiceAudioFilename].compactMap { $0 }
            return raw
                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                .filter { !$0.isEmpty }
        }()
        let stampedRemotePaths = stampedVoicePaths(for: specimen)
        let total = photos.count + voiceFilenames.count
        var uploaded = 0

        for photo in photos {
            try requireActiveOwner(owner)
            let url = store.mediaURL(for: photo.filename)
            guard let data = try? Data(contentsOf: url), !data.isEmpty else {
                throw CaptureMediaAvailabilityError
                    .missingLocalMedia([photo.filename])
            }
            let path = "\(folder)/\(photo.filename)"
            try await remote.upload(
                data,
                to: path,
                contentType: Self.mimeType(for: photo.filename)
            )
            photo.remotePath = path
            uploaded += 1
            bumpProgress(specimen, uploaded: uploaded, total: total)
        }

        var voicePaths: [String] = []
        // Only ever an UNSTAMPED segment: one whose bytes this phone was still
        // the only copy of and can no longer read. A receipted segment the
        // retention sweep deleted is answered from its stamp, so `audioLost`
        // still means what it says — written, and genuinely gone.
        var lostSegments = 0
        for filename in voiceFilenames {
            var path = stampedRemotePaths[filename]
            if path == nil {
                path = try await uploadVoiceSegment(filename, for: specimen,
                                                    owner: owner, remote: remote, folder: folder)
            }
            if let path { voicePaths.append(path) } else { lostSegments += 1 }
            uploaded += 1
            bumpProgress(specimen, uploaded: uploaded, total: total)
        }
        if lostSegments > 0 {
            analytics?.event("voice.audio_write_failed",
                             ["reason": "missing_local", "count": String(lostSegments)])
        }
        try? store.save()
        return (paths: voicePaths, lost: lostSegments)
    }

    /// Filename → durable remote path for every segment this specimen has ALREADY
    /// put on the server. The voice half of the `remotePath` exemption the photo
    /// filter in `uploadMedia` applies — with one difference: `audioSegments`
    /// must come back as the ordered list of objects the server holds, so an
    /// already-stamped segment is not dropped from the list, it is answered from
    /// its stamp, in place. Without this a second commit re-read a local file
    /// the receipt deleter had already removed, counted the segment lost, and
    /// wrote `audioSegments = []` over audio sitting intact in Storage.
    private func stampedVoicePaths(for specimen: Specimen) -> [String: String] {
        var byFilename: [String: String] = [:]
        for raw in specimen.voiceAudioRemotePathsRaw ?? [] {
            let path = raw.trimmingCharacters(in: .whitespacesAndNewlines)
            guard let name = path.split(separator: "/").last.map(String.init),
                  !name.isEmpty else { continue }
            byFilename[name] = path
        }
        return byFilename
    }

    /// Uploads one voice segment and stamps its durable remote path. Returns nil
    /// — a DROP, not a throw — when the local file cannot be read:
    /// CaptureMediaAvailabilityError is not a LocalSyncError, so isDeferrable
    /// does not apply, and throwing would permanently stick a note that today
    /// commits transcript-only after a segment failed to flush on a full disk
    /// or was lost across a reinstall.
    private func uploadVoiceSegment(
        _ filename: String,
        for specimen: Specimen,
        owner: CaptureOwnerIdentity,
        remote: SupabaseCaptureGateway,
        folder: String
    ) async throws -> String? {
        try requireActiveOwner(owner)
        let url = store.mediaURL(for: filename)
        guard let data = try? Data(contentsOf: url), !data.isEmpty else {
            return nil
        }
        let path = "\(folder)/\(filename)"
        try await remote.upload(data, to: path,
                                contentType: Self.mimeType(for: filename))
        // Stamp the durable path so missingRequiredMedia exempts this segment
        // from now on, exactly as it exempts an uploaded photo. Upload is
        // upsert-idempotent and a deferred commit re-runs the whole drain, so
        // the stamp must not double-append on replay.
        if specimen.voiceAudioRemotePathsRaw?.contains(path) != true {
            specimen.voiceAudioRemotePathsRaw =
                (specimen.voiceAudioRemotePathsRaw ?? []) + [path]
        }
        return path
    }

    private func requireActiveOwner(_ owner: CaptureOwnerIdentity) throws {
        guard activeOwner == owner else {
            throw LocalSyncError.notAuthenticated
        }
    }

    // ── route ────────────────────────────────────────────────────────────────
    /// Triage a synced/inbox capture to library vs inbox; updates local status.
    /// A not-yet-committed specimen keeps only the local mutation (it carries its
    /// `destination` into the eventual commit). An already-committed capture being
    /// promoted to the library mirrors server-side via `route_field_capture`.
    func route(
        _ specimenID: UUID,
        to destination: CaptureDestination
    ) async throws {
        guard CaptureRouteSafetyPolicy.canCommit(destination) else {
            throw LocalSyncError.destinationRequired
        }
        guard let owner = activeOwner else {
            throw LocalSyncError.notAuthenticated
        }
        guard let specimen = scopedSpecimen(id: specimenID, owner: owner) else {
            throw LocalSyncError.specimenNotFound(specimenID)
        }
        let previousDestination = specimen.destination

        guard let remoteId = specimen.remoteId,
              let captureUUID = UUID(uuidString: remoteId),
              specimen.status == .committed else {
            specimen.destination = destination
            specimen.touch()
            try? store.save()
            await enqueue(specimenID)
            analytics?.event("sync.route", [
                "id": specimenID.uuidString,
                "to": destination.rawValue,
                "state": "queued"
            ])
            return
        }

        if destination == .library {
            guard let remote else { throw LocalSyncError.remoteUnavailable }
            guard activeOwner == owner else {
                throw LocalSyncError.notAuthenticated
            }
            let routing = CaptureRoutingContext(
                projectID: specimen.venue?.projectId.flatMap { UUID(uuidString: $0) },
                projectRoomID: specimen.venue?.projectRoomId.flatMap { UUID(uuidString: $0) },
                shelf: specimen.venue?.shelf
            )
            let result = try await remote.route(
                captureID: captureUUID,
                routing: routing
            )
            guard activeOwner == owner else {
                throw LocalSyncError.notAuthenticated
            }
            let receipt = try applyCommitResult(result, to: specimen)
            if let productID = receipt.productId {
                try await performProjectPlacementIfNeeded(
                    for: specimen,
                    productID: productID,
                    owner: owner
                )
            }
            await performFieldWritesIfNeeded(specimen, owner: owner)
        } else if previousDestination != .inbox {
            throw LocalSyncError.remoteRejected(
                "A confirmed library capture can’t be held for later from this device.")
        }

        analytics?.event("sync.route", [
            "id": specimenID.uuidString,
            "to": destination.rawValue
        ])
        emitFromOutbox()
    }

    // ── project placement ───────────────────────────────────────────────────
    /// Runs only after a durable capture receipt + Product exist. Any failure
    /// updates the placement portion of the same persisted outbox record while
    /// leaving those durable capture fields untouched.
    private func performProjectPlacementIfNeeded(
        for specimen: Specimen,
        productID: String,
        owner: CaptureOwnerIdentity
    ) async throws {
        guard specimen.needsProjectPlacement else { return }
        do {
            guard let remote else { throw LocalSyncError.remoteUnavailable }
            try requireActiveOwner(owner)
            let request = try placementRequest(
                for: specimen,
                productID: productID)
            specimen.markProjectPlacementStarted()
            try? store.save()
            emitTransferState(lastTitle: specimen.title)
            let receipt = try await ProjectPlacementOrchestrator(
                gateway: remote
            ).place(request)
            try requireActiveOwner(owner)
            specimen.applyProjectPlacementReceipt(receipt)
            try? store.save()
            analytics?.event("spec_book.capture_placement.ok", [
                "project_id": request.projectID.uuidString,
                "placement": receipt.placement
            ])
        } catch let error as LocalSyncError where error.isDeferrable {
            specimen.markProjectPlacementPending()
            try? store.save()
            throw error
        } catch {
            specimen.markProjectPlacementFailed(error.localizedDescription)
            try? store.save()
            analytics?.event("spec_book.capture_placement.fail", [
                "project_id": specimen.placementProjectId ?? "invalid"
            ])
            throw error
        }
    }

    // ── field writes (wave 4, FC-R4) ────────────────────────────────────────
    /// Post-commit, exactly like the placement lane above: both rows carry
    /// field_capture_id, an FK to field_captures(id), which only exists once
    /// commit_field_capture has returned a receipt. `FieldWriteGate` reads the
    /// same `hasConfirmedCaptureReceipt` the placement lane waits on.
    ///
    /// Nothing here throws. A lane failure is the lane's own state, never the
    /// capture's: the capture already landed, and reporting a refused task as a
    /// failed upload would be a lie about a row the server has.
    private func performFieldWritesIfNeeded(
        _ specimen: Specimen,
        owner: CaptureOwnerIdentity
    ) async {
        guard activeOwner == owner,
              let captureID = FieldWriteGate.fieldCaptureID(for: specimen),
              let writes = fieldWrites else { return }

        // Ruling 1 (2026-08-24) / spec §6 Flow 2 step 4: a note spoken inside a
        // PLACED visit files itself. No tap. The id is minted once here and
        // persisted, so a second drain finds marginNoteId already set, re-uses
        // it, and the gateway's lookup-before-write turns the replay into
        // .alreadyWritten — exactly as idempotent as the deliberate path.
        //
        // Wave 3 spells "in a visit" as `visitKind` (there is no `visitID` on
        // Specimen; `captureSessionID` groups a session, and a fresh draft
        // carries one whether or not a visit was ever declared). `visitKind` is
        // what `FieldCapturePayload` itself gates the visit block on.
        if FieldWriteGate.shouldAutoFileMarginNote(
            for: specimen,
            projectID: specimen.venue?.projectId,
            insideVisit: specimen.visitKind != nil) {
            specimen.requestMarginNote(noteID: UUID())
        }

        await writeMarginNoteIfNeeded(
            specimen, owner: owner, captureID: captureID, writes: writes)
        await writePunchTaskIfNeeded(specimen, owner: owner, captureID: captureID, writes: writes)
        // FC-R8's degrade (ruling 3) is opened from inside the punch branch
        // above, which has already run past the note pass — and a degrade that
        // waits for the NEXT drain is a degrade that may never happen on a phone
        // about to go in a pocket. It has its own lane precisely so it does not
        // have to find the margin slot free.
        await writeDegradeNoteIfNeeded(
            specimen, owner: owner, captureID: captureID, writes: writes)

        try? store.save()
    }

    private func writeMarginNoteIfNeeded(
        _ specimen: Specimen,
        owner: CaptureOwnerIdentity,
        captureID: UUID,
        writes: SupabaseFieldWriteGateway
    ) async {
        // Re-checked per lane, not once for all three: the lanes run in
        // sequence, so a switch during the note's await must not send the punch
        // item on the new account's JWT.
        guard specimen.needsMarginNote,
              activeOwner == owner,
              let noteID = specimen.marginNoteId.flatMap(UUID.init(uuidString:)),
              let projectRaw = specimen.venue?.projectId,
              let projectID = UUID(uuidString: projectRaw),
              let designerID = UUID(uuidString: owner.userID)
        else { return }

        // A lane opened on a capture whose words later resolve to nothing has no
        // row to write and no way to close itself: only markWritten/markRefused
        // close a lane, so `outbox()` would hand this committed specimen back on
        // every drain, forever. Settle it instead of returning.
        guard let request = MarginNoteComposer.request(
            noteID: noteID,
            projectID: projectID,
            designerID: designerID,
            fieldCaptureID: captureID,
            transcript: specimen.marginNoteBodyRaw
                ?? specimen.voiceTranscript
                ?? specimen.voicePartialTranscript)
        else {
            specimen.settleMarginNoteWithNothingToWrite()
            return
        }

        specimen.markMarginNoteStarted()
        do {
            let outcome = try await MarginNoteOrchestrator(gateway: writes).write(request)
            // The same owner re-check `commit`, `route` and `drainOwned` make
            // after every network await. An account switch mid-await means this
            // verdict was reached under a different JWT, and `.refused` is
            // terminal — so it defers instead, and the next drain under the
            // right account decides.
            guard activeOwner == owner else {
                specimen.markMarginNotePending()
                return
            }
            apply(outcome: outcome, toMarginNoteOn: specimen)
        } catch {
            guard activeOwner == owner else {
                specimen.markMarginNotePending()
                return
            }
            apply(outcome: FieldWriteClassifier.outcome(
                      code: SupabaseFieldWriteGateway.postgrestCode(from: error),
                      message: error.localizedDescription),
                  toMarginNoteOn: specimen)
        }
        if specimen.marginNoteState == .written {
            analytics?.event("field.margin_note.ok", ["capture_id": captureID.uuidString])
        }
    }

    /// FC-R8's degrade, on its own lane. Same write as a margin note and the
    /// same policy admits it (`margin_notes_designer_all` keys on the note's own
    /// designer_id, 00196:51-54); only the slot differs, so a capture that
    /// already auto-filed its transcript can still land this.
    private func writeDegradeNoteIfNeeded(
        _ specimen: Specimen,
        owner: CaptureOwnerIdentity,
        captureID: UUID,
        writes: SupabaseFieldWriteGateway
    ) async {
        guard specimen.needsDegradeNote,
              activeOwner == owner,
              let noteID = specimen.degradeNoteId.flatMap(UUID.init(uuidString:)),
              let projectRaw = specimen.venue?.projectId,
              let projectID = UUID(uuidString: projectRaw),
              let designerID = UUID(uuidString: owner.userID),
              let request = MarginNoteComposer.request(
                  noteID: noteID,
                  projectID: projectID,
                  designerID: designerID,
                  fieldCaptureID: captureID,
                  transcript: specimen.degradeNoteBodyRaw)
        else { return }

        specimen.markDegradeNoteStarted()
        do {
            let outcome = try await MarginNoteOrchestrator(gateway: writes).write(request)
            guard activeOwner == owner else {
                specimen.markDegradeNotePending()
                return
            }
            apply(outcome: outcome, toDegradeNoteOn: specimen)
        } catch {
            guard activeOwner == owner else {
                specimen.markDegradeNotePending()
                return
            }
            apply(outcome: FieldWriteClassifier.outcome(
                      code: SupabaseFieldWriteGateway.postgrestCode(from: error),
                      message: error.localizedDescription),
                  toDegradeNoteOn: specimen)
        }
        if specimen.degradeNoteState == .written {
            analytics?.event("field.degrade_note.ok", ["capture_id": captureID.uuidString])
        }
    }

    private func writePunchTaskIfNeeded(
        _ specimen: Specimen,
        owner: CaptureOwnerIdentity,
        captureID: UUID,
        writes: SupabaseFieldWriteGateway
    ) async {
        guard specimen.needsPunchTask,
              activeOwner == owner,
              let request = punchTaskRequest(for: specimen, owner: owner, captureID: captureID)
        else { return }

        specimen.markPunchTaskStarted()
        do {
            let outcome = try await PunchTaskOrchestrator(gateway: writes).write(request)
            guard activeOwner == owner else {
                specimen.markPunchTaskPending()
                return
            }
            apply(outcome: outcome, toPunchTaskOn: specimen, request: request)
        } catch {
            guard activeOwner == owner else {
                specimen.markPunchTaskPending()
                return
            }
            apply(outcome: FieldWriteClassifier.outcome(
                      code: SupabaseFieldWriteGateway.postgrestCode(from: error),
                      message: error.localizedDescription),
                  toPunchTaskOn: specimen, request: request)
        }
        if specimen.punchTaskState == .written {
            analytics?.event("field.punch_task.ok", [
                "capture_id": captureID.uuidString,
                "owner": specimen.punchTaskOwnerRaw ?? "designer"
            ])
        }
    }

    /// The court was RESOLVED at tap time (Task 12); only the party id was
    /// persisted, and `punch(courtPartyID:)` is all this needs. Nothing is
    /// re-decided here, and whether a text goes out is the database's call, not
    /// this call site's: fc_dispatch_task_assignment re-reads the party's real
    /// sms_consent_status (00284:172-179).
    ///
    /// owner=='gc' with no persisted party cannot happen — ruling 2 makes a
    /// partyless punch a plain task at tap time — but if a build ever produced
    /// one, writing it as her own task is the honest landing: an
    /// owner_party_id-less gc row reaches no trigger and no digest.
    private func punchTaskRequest(
        for specimen: Specimen,
        owner: CaptureOwnerIdentity,
        captureID: UUID
    ) -> PunchTaskWriteRequest? {
        guard let taskID = specimen.punchTaskId.flatMap(UUID.init(uuidString:)),
              let projectRaw = specimen.venue?.projectId,
              let projectID = UUID(uuidString: projectRaw),
              let designerID = UUID(uuidString: owner.userID) else { return nil }

        let transcript = specimen.voiceTranscript ?? specimen.voicePartialTranscript
        let room = specimen.venue?.room
        if specimen.punchTaskOwnerRaw == "gc", let partyID = specimen.punchTaskPartyId {
            return PunchTaskComposer.punch(
                id: taskID, projectID: projectID, createdBy: designerID,
                fieldCaptureID: captureID, transcript: transcript, roomName: room,
                courtPartyID: partyID)
        }
        return PunchTaskComposer.task(
            id: taskID, projectID: projectID, createdBy: designerID,
            fieldCaptureID: captureID, transcript: transcript, roomName: room)
    }

    /// Both lanes read the returned outcome rather than assuming a non-throwing
    /// call wrote the row. Today the orchestrators return only `.written` /
    /// `.alreadyWritten` and throw on everything else, so marking written
    /// unconditionally would be correct — but correct by accident. The day one
    /// of them RETURNS `.refused`, that shape marks a refusal as written and
    /// FC-R8's degrade never fires.
    private func apply(outcome: FieldWriteOutcome, toMarginNoteOn specimen: Specimen) {
        switch FieldWriteGate.laneState(for: outcome) {
        case .written:    specimen.markMarginNoteWritten()
        case .pending:    specimen.markMarginNotePending()
        case .refused:    specimen.markMarginNoteRefused(outcome.message ?? "")
        case .failed:     specimen.markMarginNoteFailed(outcome.message ?? "")
        case .unwritable: specimen.markMarginNoteUnwritable(outcome.message ?? "")
        case .writing:    break   // laneState never returns the in-flight state
        }
    }

    private func apply(outcome: FieldWriteOutcome, toDegradeNoteOn specimen: Specimen) {
        switch FieldWriteGate.laneState(for: outcome) {
        case .written:    specimen.markDegradeNoteWritten()
        case .pending:    specimen.markDegradeNotePending()
        case .refused:    specimen.markDegradeNoteRefused(outcome.message ?? "")
        case .failed:     specimen.markDegradeNoteFailed(outcome.message ?? "")
        case .unwritable: specimen.markDegradeNoteUnwritable(outcome.message ?? "")
        case .writing:    break
        }
    }

    private func apply(
        outcome: FieldWriteOutcome,
        toPunchTaskOn specimen: Specimen,
        request: PunchTaskWriteRequest
    ) {
        switch FieldWriteGate.laneState(for: outcome) {
        case .written:    specimen.markPunchTaskWritten()
        case .pending:    specimen.markPunchTaskPending()
        case .failed:     specimen.markPunchTaskFailed(outcome.message ?? "")
        case .unwritable: specimen.markPunchTaskUnwritable(outcome.message ?? "")
        case .writing:    break
        case .refused:
            specimen.markPunchTaskRefused(outcome.message ?? "")
            // FC-R8 / ruling 3: 42501 is terminal on this lane, and the degrade
            // has to be a WRITE, HERE. This drain is background and
            // per-owner-serialized; the card that reports the refusal may never
            // be on screen, and the app may have been relaunched since. A
            // degrade that lives only in the UI silently loses her punch item,
            // which is what §3.3 forbids.
            //
            // The refused task's own UUID becomes the note id — same
            // client-minted id lineage, so a replayed drain re-uses it and
            // writes once. margin_notes_designer_all admits her own note
            // (00196:51-54) because it keys on the note's designer_id, not the
            // project's, so this write is the one that CAN land.
            //
            // It goes to `degradeNote*`, NOT the margin lane: by ruling 1 this
            // capture has usually already auto-opened the margin slot with its
            // transcript, and a single-slot lane silently drops the second note.
            let degrade = FieldWriteGate.degrade(request)
            specimen.requestDegradeNote(noteID: degrade.noteID, body: degrade.body)
        }
    }

    private func placementRequest(
        for specimen: Specimen,
        productID: String
    ) throws -> ProjectPlacementRequest {
        guard let projectRaw = specimen.placementProjectId,
              let projectID = UUID(uuidString: projectRaw),
              let productUUID = UUID(uuidString: productID),
              let roomID = validOptionalUUID(specimen.placementRoomId),
              let slotID = validOptionalUUID(specimen.placementSlotId) else {
            throw LocalSyncError.invalidPlacementTarget
        }
        return ProjectPlacementRequest(
            projectID: projectID,
            productID: productUUID,
            roomID: roomID,
            slotID: slotID,
            category: specimen.placementCategory,
            source: [
                "client": "field-ios",
                "captureId": specimen.clientToken.uuidString.lowercased(),
                "fieldCaptureId": specimen.remoteId ?? ""
            ])
    }

    /// Outer optional distinguishes "absent" (valid nil) from malformed.
    private func validOptionalUUID(_ raw: String?) -> UUID?? {
        guard let raw else { return .some(nil) }
        guard let value = UUID(uuidString: raw) else { return nil }
        return .some(value)
    }

    // ── result mapping ─────────────────────────────────────────────────────────
    private func applyCommitResult(
        _ result: CaptureCommitResult,
        to s: Specimen
    ) throws -> CommitReceipt {
        guard let captureID = result.captureID else {
            throw LocalSyncError.missingRemoteReceipt
        }
        guard result.status == "saved" || result.status == "inbox" else {
            throw LocalSyncError.remoteRejected(
                "The server rejected this capture; review it before retrying.")
        }

        s.applyTransferState(CaptureTransferState(
            phase: .complete,
            progress: 100,
            retryCount: s.retryCount,
            receiptID: captureID.uuidString))
        if let productID = result.productID { s.committedProductId = productID.uuidString }

        // The receipt is the proof the server has the bytes. Until this
        // landed, every segment stayed on the phone forever — uploadMedia
        // never cleared a local file after a successful commit. Only a
        // filename that is actually stamped in voiceAudioRemotePathsRaw
        // (Task 9's writer) is receipted; a segment that was lost during
        // upload never got a stamp, so it is left on disk rather than
        // guessed at.
        let receiptedSegments = Set((s.voiceAudioRemotePathsRaw ?? [])
            .compactMap { $0.split(separator: "/").last.map(String.init) })
        for name in (s.voiceAudioSegmentsRaw ?? []) where receiptedSegments.contains(name) {
            try? FileManager.default.removeItem(at: store.mediaURL(for: name))
        }

        // Server truth: only status=="saved" is a library landing. The only
        // other accepted receipt-backed result is the inbox safe harbor.
        let landedSaved = (result.status == "saved")
        s.destination = landedSaved ? .library : .inbox
        s.lifecycleRaw = (landedSaved ? CaptureLifecycle.State.saved
                                      : CaptureLifecycle.State.inbox).rawValue
        try? store.save()

        return CommitReceipt(
            remoteId: captureID.uuidString,
            productId: s.committedProductId,
            destination: landedSaved ? .library : .inbox,
            created: result.created ?? true
        )
    }

    private func bumpProgress(_ s: Specimen, uploaded: Int, total: Int) {
        // Reserve the last 10% for the commit RPC.
        s.uploadProgress = min(90, Int(Double(uploaded) / Double(max(total, 1)) * 90))
        try? store.save()
        emitTransferState(lastTitle: s.title)
    }

    private func beginDrain(_ items: [Specimen]) {
        liveActivity?.start(
            venueLabel: items.first?.venue?.placemarkName,
            state: .init(
                queued: items.count,
                uploading: 0,
                failed: 0,
                lastSpecimenTitle: items.first?.title))
        analytics?.event("sync.drain.start", ["count": "\(items.count)"])
    }

    // ── device + mime helpers ──────────────────────────────────────────────────
    private static func deviceInfo() -> FieldCapturePayload.Device {
        let info = Bundle.main.infoDictionary
        let short = info?["CFBundleShortVersionString"] as? String ?? "0"
        let build = info?["CFBundleVersion"] as? String ?? "0"
        return FieldCapturePayload.Device(
            model: hardwareModel(),
            osVersion: UIDevice.current.systemVersion,
            appVersion: "\(short) (\(build))"
        )
    }

    private static func hardwareModel() -> String {
        var systemInfo = utsname()
        uname(&systemInfo)
        let id = Mirror(reflecting: systemInfo.machine).children.reduce(into: "") { acc, element in
            if let value = element.value as? Int8, value != 0 {
                acc.append(Character(UnicodeScalar(UInt8(value))))
            }
        }
        return id.isEmpty ? UIDevice.current.model : id
    }

    private static func mimeType(for filename: String) -> String {
        CaptureMediaMime.forFilename(filename)
    }

    // ── snapshot plumbing ──────────────────────────────────────────────────────
    private var activeOwner: CaptureOwnerIdentity? {
        CaptureOwnerIdentity(
            userID: session?.userID,
            workspaceID: session?.workspaceID
        )
    }

    /// Real mode is always owner-scoped. Mock mode keeps the historical global
    /// projection so fixture records created without auth stamps still render.
    private func scopedOutbox(owner: CaptureOwnerIdentity? = nil) -> [Specimen] {
        guard remote != nil else { return store.outbox() }
        guard let owner = owner ?? activeOwner else { return [] }
        return store.outbox(owner: owner)
    }

    private func scopedSpecimen(
        id: UUID,
        owner: CaptureOwnerIdentity?
    ) -> Specimen? {
        guard remote != nil else { return store.specimen(id: id) }
        guard let owner else { return nil }
        return store.specimen(id: id, owner: owner)
    }

    private func failedCount() -> Int {
        scopedOutbox().filter {
            $0.transferState.phase == .retryableFailure
                || $0.transferState.phase == .rejected
        }.count
    }

    /// Emit a snapshot derived purely from what's still in the outbox
    /// (ready/queued/failed) — used after enqueue/route and at drain edges.
    private func emitFromOutbox(lastTitle: String? = nil) {
        emitTransferState(lastTitle: lastTitle)
    }

    private func emitTransferState(lastTitle: String? = nil) {
        let out = scopedOutbox()
        let uploading = out.filter {
            $0.transferState.phase == .uploading
                || $0.transferState.phase == .awaitingConfirmation
        }.count
        let failed = out.filter {
            $0.transferState.phase == .retryableFailure
                || $0.transferState.phase == .rejected
        }.count
        let queued = max(out.count - uploading - failed, 0)
        emit(
            queued: queued,
            uploading: uploading,
            failed: failed,
            lastTitle: lastTitle ?? out.last?.title
        )
    }

    private func emit(
        queued: Int,
        uploading: Int,
        failed: Int? = nil,
        lastTitle: String?
    ) {
        let failedN = failed ?? failedCount()
        let lastErr = scopedOutbox()
            .compactMap { $0.transferState.errorMessage }
            .first
        continuation.yield(SyncSnapshot(
            queued: queued,
            uploading: uploading,
            failed: failedN,
            lastError: lastErr
        ))
        liveActivity?.update(.init(
            queued: queued,
            uploading: uploading,
            failed: failedN,
            lastSpecimenTitle: lastTitle
        ))
    }
}
