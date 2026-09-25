//
//  SharedDirectionStore+Files.swift
//  Patina
//
//  W1A-10 · CONTRACT-C §C.3.3, §C.5.3. An edition's frozen files: the NI-06
//  continuation loop, admission under the ceiling, and the verified download.
//  A set commits whole or not at all, and never after its ticket has moved.
//

import Foundation
import SwiftData

extension SharedDirectionStore {

    static let continuationCap = 6

    /// One fetch per edition at a time. A screen opening an edition whose
    /// background fetch is already running binds it to the screen.
    func startFileFetch(_ decisionId: String, origin: Origin) {
        if fileFetches[decisionId] != nil {
            if origin == .screen { fileFetches[decisionId]?.screenBound = true }
            return
        }
        sweepAfterLaunch()
        let token = UUID()
        let ticket = ticket(decisionId)
        fileFetches[decisionId] = FileFetch(token: token, screenBound: origin == .screen)
        let task = Task { [weak self] in
            guard let self else { return }
            await self.runFileFetch(decisionId, token: token, ticket: ticket)
        }
        fileFetches[decisionId]?.task = task
    }

    /// The running fetch for an edition, for a caller that has to wait on it.
    func pendingFileFetch(_ decisionId: String) -> Task<Void, Never>? {
        fileFetches[decisionId]?.task
    }

    /// The screen that opened the edition was left: a 202 loop it started
    /// stops (§C.5.3). A download already under way finishes.
    func leaveEdition(_ decisionId: String) {
        guard let fetch = fileFetches[decisionId], fetch.screenBound, fetch.looping else { return }
        fetch.task?.cancel()
        fileFetches[decisionId] = nil
    }

    // MARK: - The continuation loop (§C.5.3)

    private func runFileFetch(_ decisionId: String, token: UUID, ticket: Ticket) async {
        defer {
            if fileFetches[decisionId]?.token == token { fileFetches[decisionId] = nil }
        }
        var requests = 0
        while requests < Self.continuationCap {
            guard isCurrent(ticket, decisionId), !Task.isCancelled else { return }
            requests += 1
            let answer: SharedDirectionAttachmentAnswer
            do {
                let (status, body) = try await env.client.projectApprovalAttachments(decisionId: decisionId)
                answer = SharedDirectionWire.attachmentAnswer(status: status, body: body)
            } catch {
                return
            }
            guard isCurrent(ticket, decisionId), !Task.isCancelled else { return }
            switch answer {
            case .signed(let files):
                fileFetches[decisionId]?.looping = false
                await download(decisionId, files, token: token, ticket: ticket)
                return
            case .unavailable:
                // NI-06 never purges. The RPC is asked again, and that answer
                // fetches nothing, so the two cannot chase each other.
                Task { await self.refresh(decisionIds: [decisionId], origin: .recheck) }
                return
            case .materializing(let retryAfter):
                // At the cap the record stays as it is; §C.5.1 retries on the
                // next refresh or screen open.
                guard requests < Self.continuationCap else { return }
                let seconds = min(30, max(1, retryAfter ?? 5))
                do { try await env.retryWait(.seconds(seconds)) } catch { return }
            }
        }
    }

    // MARK: - Admission and the verified download (§C.3.3)

    private func download(
        _ decisionId: String, _ files: [SharedDirectionSignedFile], token: UUID, ticket: Ticket
    ) async {
        guard let account = ticket.account, let record = row(decisionId),
              let manifest = record.manifest, !manifest.isEmpty else { return }
        let ids = manifest.map(\.attachmentId)
        guard let needed = SharedDirectionAdmission.admissibleBytes(
            manifest: manifest, signed: files, limits: env.limits
        ) else {
            markFailed(decisionId, missing: ids)
            return
        }
        guard admit(decisionId, needed: needed, token: token) else {
            if record.filesManifestKey == nil {
                record.availability = .noSpace
                save()
            }
            return
        }
        let staging = SharedDirectionFiles.stagingDirectory(root: env.root, account: account, task: token)
        defer {
            SharedDirectionFiles.remove(staging)
            if reservations[decisionId]?.token == token { reservations[decisionId] = nil }
        }
        let verified = await verifiedFiles(manifest, files, into: staging, decisionId, ticket: ticket)
        // A ticket that moved during the download commits nothing.
        guard isCurrent(ticket, decisionId), !Task.isCancelled,
              fileFetches[decisionId]?.token == token else { return }
        guard verified.count == ids.count, move(staging, into: account, decisionId) else {
            markFailed(decisionId, missing: ids.filter { !verified.contains($0) })
            return
        }
        guard let current = row(decisionId) else { return }
        current.filesManifestKey = SharedDirectionWire.manifestKey(manifest)
        current.availability = .complete
        current.missingAttachmentIds = []
        current.committedBytes = needed
        save()
    }

    /// Downloads the set into staging, hashing each file against its manifest
    /// `sha256` and signed size. Stops at the first failure, or as soon as the
    /// ticket has moved; returns the ids that verified.
    private func verifiedFiles(
        _ manifest: [SharedDirectionManifestEntry], _ files: [SharedDirectionSignedFile],
        into staging: URL, _ decisionId: String, ticket: Ticket
    ) async -> Set<String> {
        let signed = Dictionary(files.map { ($0.attachmentId, $0) }, uniquingKeysWith: { first, _ in first })
        var verified: Set<String> = []
        do {
            try SharedDirectionFiles.makeDirectory(env.root)
            try SharedDirectionFiles.makeDirectory(staging)
            for entry in manifest {
                guard let file = signed[entry.attachmentId] else { break }
                let destination = staging.appendingPathComponent(entry.attachmentId)
                try await env.client.downloadAttachment(from: file.url, to: destination)
                guard isCurrent(ticket, decisionId), !Task.isCancelled else { break }
                let digest = try await Task.detached(priority: .utility) {
                    try SharedDirectionFiles.digest(of: destination)
                }.value
                // A mismatch discards the file and fails the set.
                guard digest.sha256 == entry.sha256, digest.bytes == file.sizeBytes else { break }
                verified.insert(entry.attachmentId)
            }
        } catch {
            // Falls through: whatever did not verify is missing.
        }
        return verified
    }

    /// Replaces the edition's verified set in one step, so a set whose
    /// replacement fails is still the one served.
    private func move(_ staging: URL, into account: String, _ decisionId: String) -> Bool {
        let edition = SharedDirectionFiles.editionDirectory(
            root: env.root, account: account, decisionId: decisionId
        )
        let fm = FileManager.default
        do {
            if fm.fileExists(atPath: edition.path) {
                _ = try fm.replaceItemAt(edition, withItemAt: staging)
            } else {
                try fm.moveItem(at: staging, to: edition)
            }
            return true
        } catch {
            PatinaLog.sync.error("[SharedDirection] commit move failed: \(error.localizedDescription)")
            return false
        }
    }

    /// Plan, then evict, then reserve — all in this one turn, so no other
    /// admission interleaves between the plan and the deletion.
    private func admit(_ decisionId: String, needed: Int, token: UUID) -> Bool {
        let records = rows()
        let committed = records.reduce(0) { $0 + $1.committedBytes }
        let reserved = reservations.values.reduce(0) { $0 + $1.bytes }
        let holdings = records.filter { $0.decisionId != decisionId && $0.committedBytes > 0 }.map { record in
            let review = record.review
            return SharedDirectionAdmission.Holding(
                decisionId: record.decisionId,
                bytes: record.committedBytes,
                // A review that no longer decodes cannot show it was never
                // responded to, so its files are held as if it were (SQ-247 F7).
                isProtected: review.map(SharedDirectionAdmission.isProtected) ?? true,
                respondedAt: review?.respondedAt.flatMap(ISO8601DateParsing.date(from:)),
                servedAt: record.servedAt
            )
        }
        switch SharedDirectionAdmission.plan(
            needed: needed, committed: committed, reserved: reserved,
            ceiling: env.limits.ceilingBytes, holdings: holdings
        ) {
        case .noSpace:
            return false
        case .evict(let victims):
            for victim in victims {
                if let record = records.first(where: { $0.decisionId == victim }) { evictFiles(record) }
            }
        case .fits:
            break
        }
        reservations[decisionId] = (token, needed)
        return true
    }

    // MARK: - The files on disk agree with the record (SQ-247 F4, F6)

    /// A record that says its set is on disk, whose files are not — deleted,
    /// or not the size that verified — goes back to `.none`, so the next
    /// refresh fetches the set again. Size only: re-hashing every file on
    /// every read would cost more than a truncation it has not already caught.
    func demoteIfFilesMissing(_ record: CachedDirectionEdition) {
        guard let key = record.filesManifestKey else { return }
        let edition = SharedDirectionFiles.editionDirectory(
            root: env.root, account: record.accountId, decisionId: record.decisionId
        )
        var bytes = 0
        for attachmentId in SharedDirectionWire.attachmentIds(inManifestKey: key) {
            let path = edition.appendingPathComponent(attachmentId).path
            guard let size = (try? FileManager.default.attributesOfItem(atPath: path))?[.size] as? Int else {
                evictFiles(record)
                return
            }
            bytes += size
        }
        if bytes != record.committedBytes { evictFiles(record) }
    }

    /// Once per process, before its first fetch or refresh: staging is
    /// cleared — no fetch survives a process, so whatever is there is a dead
    /// task's (§C.3.3 step 5) — and so is every edition directory no record
    /// names. A purge deletes the record before the files, so a crash between
    /// the two leaves only files, and this is where they go.
    ///
    /// Skipped while the store runs in memory: the records are then on disk,
    /// out of reach, and every directory would look orphaned (SQ-247 F3).
    func sweepAfterLaunch() {
        guard !launchSwept else { return }
        launchSwept = true
        SharedDirectionFiles.clearStaging(root: env.root)
        let context = env.context()
        guard !context.container.configurations.contains(where: \.isStoredInMemoryOnly),
              let records = try? context.fetch(FetchDescriptor<CachedDirectionEdition>()) else { return }
        let held = Set(records.map { "\($0.accountId)/\($0.decisionId)" })
        let fm = FileManager.default
        for account in (try? fm.contentsOfDirectory(atPath: env.root.path)) ?? [] {
            let accountDirectory = SharedDirectionFiles.accountDirectory(root: env.root, account: account)
            for decisionId in (try? fm.contentsOfDirectory(atPath: accountDirectory.path)) ?? []
            where decisionId != SharedDirectionFiles.stagingName && !held.contains("\(account)/\(decisionId)") {
                SharedDirectionFiles.remove(accountDirectory.appendingPathComponent(decisionId, isDirectory: true))
            }
        }
    }

    /// Records are never evicted, only files.
    private func evictFiles(_ record: CachedDirectionEdition) {
        SharedDirectionFiles.remove(SharedDirectionFiles.editionDirectory(
            root: env.root, account: record.accountId, decisionId: record.decisionId
        ))
        record.availability = .none
        record.filesManifestKey = nil
        record.missingAttachmentIds = []
        record.committedBytes = 0
        save()
    }

    /// Nothing of a failed fetch commits. A verified set already on disk is
    /// kept and served; with none, the record says what is missing.
    private func markFailed(_ decisionId: String, missing: [String]) {
        guard let record = row(decisionId), record.filesManifestKey == nil else { return }
        record.availability = .incomplete
        record.missingAttachmentIds = missing
        save()
    }
}
