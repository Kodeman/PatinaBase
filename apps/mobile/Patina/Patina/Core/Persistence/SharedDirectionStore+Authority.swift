//
//  SharedDirectionStore+Authority.swift
//  Patina
//
//  W1A-10 · CONTRACT-C §C.5, §C.5.1, §C.5.2. The refresh, and what each typed
//  answer does to the cache.
//

import Foundation
import SwiftData

extension SharedDirectionStore {

    /// One edition in a refresh: its held proof and the project it groups by.
    struct RefreshItem: Equatable {
        let proof: SharedDirectionHeldProof
        let projectId: String
    }

    static let batchLimit = 200

    // MARK: - Refresh (§C.5.1)

    /// Foreground or reconnection, after `list_my_project_decision_reviews`:
    /// every cached edition with its held proof, plus every active edition
    /// the list discovered that is not cached yet. No time-to-live applies.
    func refresh(discovered: [RemoteProjectApprovalReview]) async {
        guard env.account() != nil else { return }
        sweepAfterLaunch()
        var items: [String: RefreshItem] = [:]
        for record in rows() {
            items[record.decisionId] = RefreshItem(proof: Self.proof(record), projectId: record.projectId)
        }
        for review in discovered where review.disposition == "active" && items[review.decisionId] == nil {
            items[review.decisionId] = RefreshItem(
                proof: SharedDirectionHeldProof(
                    decisionId: review.decisionId, heldAuthorityRevision: nil, heldArtifactChecksum: nil
                ),
                projectId: review.projectId
            )
        }
        await run(Array(items.values), origin: .background)
    }

    /// A named set of editions: a coalesced follow-up, a successor, or the
    /// re-check NI-06 schedules.
    func refresh(decisionIds: [String], origin: Origin = .background) async {
        let items = decisionIds.map { decisionId in
            let record = row(decisionId)
            return RefreshItem(
                proof: record.map(Self.proof) ?? SharedDirectionHeldProof(
                    decisionId: decisionId, heldAuthorityRevision: nil, heldArtifactChecksum: nil
                ),
                projectId: record?.projectId ?? ""
            )
        }
        await run(items, origin: origin)
    }

    /// Whole projects packed into batches of at most `limit` (N5, ruling E);
    /// a project past the limit splits across batches. Deterministic, so the
    /// same cache always makes the same calls.
    static func batches(_ items: [RefreshItem], limit: Int = batchLimit) -> [[RefreshItem]] {
        let byProject = Dictionary(grouping: items, by: \.projectId)
        var batches: [[RefreshItem]] = []
        var current: [RefreshItem] = []
        for projectId in byProject.keys.sorted() {
            var rest = ArraySlice(byProject[projectId, default: []]
                .sorted { $0.proof.decisionId < $1.proof.decisionId })
            if !current.isEmpty, current.count + rest.count > limit {
                batches.append(current)
                current = []
            }
            while rest.count > limit {
                batches.append(Array(rest.prefix(limit)))
                rest = rest.dropFirst(limit)
            }
            current += rest
        }
        if !current.isEmpty { batches.append(current) }
        return batches
    }

    /// Chunks run one after another, and each commits as it lands, so a
    /// failed chunk leaves the others' outcomes standing.
    private func run(_ items: [RefreshItem], origin: Origin) async {
        let session = sessionGeneration
        for batch in Self.batches(items) {
            guard session == sessionGeneration else { return }
            // Single flight (§C.5.2): an edition already asked about is marked
            // dirty and gets exactly one follow-up when that request lands.
            var ready: [RefreshItem] = []
            for item in batch {
                if inFlight[item.proof.decisionId] != nil {
                    inFlight[item.proof.decisionId]?.dirty = true
                } else {
                    ready.append(item)
                }
            }
            guard !ready.isEmpty else { continue }
            await runBatch(ready, origin: origin)
        }
    }

    private func runBatch(_ batch: [RefreshItem], origin: Origin) async {
        let claims = batch.map { claim($0.proof.decisionId, singleFlight: true) }
        let data = try? await env.client.projectDecisionEditions(held: batch.map(\.proof))
        if let data, let envelope = SharedDirectionWire.envelope(from: data) {
            observe(servedAt: envelope.servedAt)
            let byId = Dictionary(claims.map { ($0.decisionId, $0) }, uniquingKeysWith: { first, _ in first })
            for answer in envelope.answers {
                guard let claim = byId[answer.decisionId] else { continue }
                commit(answer, claim, servedAt: envelope.servedAt, origin: origin)
            }
        }
        // Anything else is indeterminate: nothing commits, nothing purges.
        let dirty = claims.filter(land).map(\.decisionId)
        if !dirty.isEmpty { await refresh(decisionIds: dirty) }
    }

    // MARK: - Sequencing (§C.5.2, ruling B)

    /// Takes the edition's next sequence number. A refresh also takes the
    /// single-flight slot and arms its deadline; a screen's read and the
    /// pre-act check are the reader's own and never wait behind one — their
    /// sequence numbers order them all the same.
    func claim(_ decisionId: String, singleFlight: Bool) -> Claim {
        let seq = authoritySeq[decisionId, default: 0] + 1
        authoritySeq[decisionId] = seq
        var token: UUID?
        if singleFlight {
            let flight = UUID()
            token = flight
            let wait = env.deadline
            let deadline = Task { [weak self] in
                do { try await wait() } catch { return }
                guard !Task.isCancelled else { return }
                self?.expire(decisionId, flight: flight)
            }
            inFlight[decisionId] = AuthorityFlight(token: flight, deadline: deadline)
        }
        return Claim(decisionId: decisionId, seq: seq, ticket: ticket(decisionId), flight: token)
    }

    /// The request finished; true when a follow-up is owed.
    private func land(_ claim: Claim) -> Bool {
        guard let flight = claim.flight, inFlight[claim.decisionId]?.token == flight else { return false }
        let entry = inFlight.removeValue(forKey: claim.decisionId)
        entry?.deadline?.cancel()
        return entry?.dirty == true
    }

    /// Past its deadline the slot is released. The late answer, if it comes,
    /// is still ordered by its sequence number, never by arrival.
    private func expire(_ decisionId: String, flight: UUID) {
        guard inFlight[decisionId]?.token == flight else { return }
        let entry = inFlight.removeValue(forKey: decisionId)
        if entry?.dirty == true {
            Task { await self.refresh(decisionIds: [decisionId]) }
        }
    }

    // MARK: - Commit (§C.5)

    /// One typed answer. It lands only while its ticket is current and its
    /// sequence number is past the last committed one; true when it did.
    @discardableResult
    func commit(
        _ answer: SharedDirectionAnswer, _ claim: Claim, servedAt: Date, origin: Origin
    ) -> Bool {
        let decisionId = answer.decisionId
        // `unauthorized` is no session, never an answer about the edition.
        guard answer.status != .unauthorized, isCurrent(claim.ticket, decisionId),
              claim.seq > lastCommittedSeq[decisionId, default: 0] else { return false }
        lastCommittedSeq[decisionId] = claim.seq
        switch answer.status {
        case .revoked:
            purge(decisionId)
            env.telemetry("shared_direction_revoked", [:])
        case .notFound:
            purge(decisionId)
        case .unauthorized:
            return false
        case .ok:
            return commitOk(answer, account: claim.ticket.account, servedAt: servedAt, origin: origin)
        }
        return true
    }

    /// `ok`: the disposition decides. Active is cached; withdrawn and
    /// superseded are let go, and a successor is read through the RPC.
    private func commitOk(
        _ answer: SharedDirectionAnswer, account: String?, servedAt: Date, origin: Origin
    ) -> Bool {
        guard let review = answer.review else { return false }
        switch review.disposition {
        case "active":
            write(answer, servedAt: servedAt, account: account, origin: origin)
        case "withdrawn":
            purge(answer.decisionId)
        case "superseded":
            purge(answer.decisionId)
            if let successor = answer.successorDecisionId, successor != answer.decisionId {
                Task { await self.refresh(decisionIds: [successor]) }
            }
        default:
            return false
        }
        return true
    }

    /// `ok` + `active`: replace the record and stamp its `servedAt`; fetch the
    /// files when the verified set is not this manifest's (§C.5.1). A set
    /// that failed is tried again at most once per foreground, after its
    /// backoff; a screen opening the edition always tries (SQ-247 F9).
    private func write(_ answer: SharedDirectionAnswer, servedAt: Date, account: String?, origin: Origin) {
        guard let account, let review = answer.review, let reviewJSON = answer.reviewJSON,
              SharedDirectionFiles.isSafeComponent(account),
              SharedDirectionFiles.isSafeComponent(answer.decisionId) else { return }
        let key = answer.manifest.map(SharedDirectionWire.manifestKey)
        let record: CachedDirectionEdition
        if let existing = row(answer.decisionId) {
            record = existing
            record.projectId = review.projectId
            record.authorityRevision = review.authorityRevision
            record.artifactChecksum = review.artifactChecksum
            record.reviewJSON = reviewJSON
            record.attachmentsJSON = answer.attachmentsJSON
            record.editionFiguresJSON = answer.editionFiguresJSON
            record.servedAt = servedAt
            record.manifestKey = key
        } else {
            record = CachedDirectionEdition(
                accountId: account, decisionId: answer.decisionId, projectId: review.projectId,
                authorityRevision: review.authorityRevision, artifactChecksum: review.artifactChecksum,
                reviewJSON: reviewJSON, attachmentsJSON: answer.attachmentsJSON,
                editionFiguresJSON: answer.editionFiguresJSON, servedAt: servedAt, manifestKey: key
            )
            env.context().insert(record)
        }
        save()
        // A set deleted from disk under a complete record is fetched again.
        demoteIfFilesMissing(record)
        guard origin != .recheck, let manifest = answer.manifest, !manifest.isEmpty,
              record.filesManifestKey != key || record.availability != .complete,
              origin == .screen || mayRetryFiles(answer.decisionId, manifestKey: key) else { return }
        startFileFetch(answer.decisionId, origin: origin)
    }

    /// A typed purge (§C.5.2 barrier): the generation moves, the edition's
    /// tasks are cancelled, and only then are the record and its files
    /// deleted.
    func purge(_ decisionId: String) {
        editionGeneration[decisionId, default: 0] += 1
        lastCommittedSeq[decisionId] = nil
        if let fetch = fileFetches.removeValue(forKey: decisionId) { fetch.task?.cancel() }
        fileRetries[decisionId] = nil
        reservations[decisionId] = nil
        shownFromCache[decisionId] = nil
        guard let account = env.account(), SharedDirectionFiles.isSafeComponent(decisionId) else { return }
        if let record = row(decisionId) {
            env.context().delete(record)
            save()
        }
        SharedDirectionFiles.remove(
            SharedDirectionFiles.editionDirectory(root: env.root, account: account, decisionId: decisionId)
        )
    }
}
