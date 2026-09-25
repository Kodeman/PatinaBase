//
//  SharedDirectionStore.swift
//  Patina
//
//  W1A-10 · CONTRACT-C (revision 4). The offline shared direction: the last
//  AUTHORIZED revision of every approval edition this account can read, its
//  frozen attachments, and the three ways it is ever deleted — a typed answer
//  (`revoked`, `not_found`, `withdrawn`, `superseded`), and the two account
//  wipes. A lost connection, a session lapse or an undecodable answer never
//  deletes anything.
//
//  Every commit — a record written, a file moved into place, a record or file
//  deleted — happens on this main-actor-isolated store, one turn at a time.
//  Two mechanisms order them (§C.5.2):
//
//   • Generations gate liveness. `sessionGeneration` moves on every session
//     change and wipe; an edition's generation moves only when it is purged.
//     Every asynchronous task captures `(account, session, edition)` when it
//     starts and its commit is dropped if any part has moved, so a late
//     download never recreates purged files.
//   • Sequence numbers order authority. Each edition has at most one refresh
//     in flight (a request made meanwhile marks it dirty, and exactly one
//     follow-up runs); every authority request takes the next number when it
//     starts, and an answer commits only past the last committed one. An
//     older `ok` can therefore never undo a newer `revoked`.
//

import Foundation
import SwiftData

/// Why an act was refused before anything was sent (§C.8).
enum SharedDirectionActRefusal: Error, Equatable {
    /// No typed answer — offline, a timeout, a 5xx, an undecodable body.
    /// Nothing was purged.
    case indeterminate
    /// A typed answer that is not the edition the reader was shown, still
    /// active. It was handled per §C.5 before the refusal.
    case notCurrent
}

@MainActor
final class SharedDirectionStore {

    static let shared = SharedDirectionStore(environment: .live)

    /// Everything the store reaches outside itself, so a test can hold each
    /// answer, own the clock and point the files at a temporary root.
    struct Environment {
        var client: any SharedDirectionClient
        var context: @MainActor () -> ModelContext
        var root: URL
        /// The Supabase user id signed in now, or nil.
        var account: @MainActor () -> String?
        var limits: SharedDirectionLimits
        /// The wait between two `202 materializing` answers (§C.5.3).
        var retryWait: @Sendable (Duration) async throws -> Void
        /// Returns when an authority request has passed its deadline.
        var deadline: @Sendable () async throws -> Void
        var now: @Sendable () -> ContinuousClock.Instant
        var telemetry: @MainActor (String, [String: Any]) -> Void

        static var live: Environment {
            Environment(
                client: DecisionsAPIClient.shared,
                context: { PersistenceController.shared.container.mainContext },
                root: SharedDirectionFiles.defaultRoot(),
                account: { AuthService.shared.currentUserId },
                limits: .contract,
                retryWait: { try await Task.sleep(for: $0) },
                deadline: { try await Task.sleep(for: .seconds(APIConfiguration.requestTimeout)) },
                now: { ContinuousClock.now },
                telemetry: { PostHogService.shared.capture($0, properties: $1) }
            )
        }
    }

    /// One task's claim on one edition's liveness (§C.5.2).
    struct Ticket: Equatable {
        let account: String?
        let session: Int
        let edition: Int
    }

    /// One authority request's hold on one edition.
    struct Claim {
        let decisionId: String
        let seq: Int
        let ticket: Ticket
        let flight: UUID?
    }

    struct AuthorityFlight {
        let token: UUID
        var dirty = false
        var deadline: Task<Void, Never>?
    }

    struct FileFetch {
        let token: UUID
        var task: Task<Void, Never>?
        /// Started by a screen that opened the edition; cancelled when the
        /// screen is left while the 202 loop is still waiting (§C.5.3).
        var screenBound: Bool
        var looping = true
    }

    /// Who asked. A screen's fetch is bound to it; a re-check after NI-06
    /// refused commits the record and fetches nothing, so the two never loop.
    enum Origin { case screen, background, recheck }

    let env: Environment

    // MARK: - Process-local state. None of it is persisted or sent anywhere.

    private(set) var sessionGeneration = 0
    var editionGeneration: [String: Int] = [:]
    var authoritySeq: [String: Int] = [:]
    var lastCommittedSeq: [String: Int] = [:]
    var inFlight: [String: AuthorityFlight] = [:]
    /// Bytes held for an edition's download, by the fetch that holds them.
    var reservations: [String: (token: UUID, bytes: Int)] = [:]
    var fileFetches: [String: FileFetch] = [:]
    /// What each screen was last shown: the proof the pre-act check compares.
    var shownProof: [String: SharedDirectionHeldProof] = [:]
    /// The editions a screen was last handed FROM THE CACHE, and their stamp.
    /// A live answer clears the entry: a screen drawing a response from this
    /// foreground session shows no label (§C.7).
    var shownFromCache: [String: Date] = [:]
    /// The monotonic freshness anchor (§C.7). Server time, not account data,
    /// so a session change leaves it where it is.
    private(set) var anchor = SharedDirectionAnchor()
    /// `sweepAfterLaunch` has run in this process.
    var launchSwept = false

    init(environment: Environment) {
        self.env = environment
    }

    // MARK: - The two account wipes

    /// A session change: sign-in, sign-out, account switch. The account's
    /// records stay on disk under it — the same account signing back in finds
    /// them — but nothing in the air for the previous session may land.
    func resetForSessionChange() {
        sessionGeneration += 1
        for flight in inFlight.values { flight.deadline?.cancel() }
        inFlight = [:]
        for fetch in fileFetches.values { fetch.task?.cancel() }
        fileFetches = [:]
        reservations = [:]
        editionGeneration = [:]
        authoritySeq = [:]
        lastCommittedSeq = [:]
        shownProof = [:]
        shownFromCache = [:]
    }

    /// `LocalStoreReset.wipeUserScopedData`: an account switch or an account
    /// deletion. Generations first, cancellation second, deletion last — so a
    /// commit either landed before this and is deleted by it, or arrives
    /// after and is dropped.
    func wipe() {
        resetForSessionChange()
        let context = env.context()
        do {
            try context.delete(model: CachedDirectionEdition.self)
            try context.save()
        } catch {
            PatinaLog.sync.error("[SharedDirection] wipe failed: \(error.localizedDescription)")
        }
        SharedDirectionFiles.remove(env.root)
    }

    // MARK: - Reads

    /// The detail screen's read. Online it is a typed authority answer and
    /// commits like any other; `ok` returns the edition — withdrawn and
    /// superseded ones too, which the screen draws with their own copy while
    /// the cache lets them go. `revoked` and `not_found` return nil.
    ///
    /// With no typed answer (offline, a 5xx, an undecodable body) or no
    /// session, the last authorized revision is served read-only with its
    /// stamp; with nothing cached the error is rethrown.
    func readProjectApprovalReview(decisionId: String) async throws -> RemoteProjectApprovalReview? {
        let held = heldProof(decisionId)
        let claim = claim(decisionId, singleFlight: false)
        var failure: Error = SharedDirectionActRefusal.indeterminate
        do {
            let data = try await env.client.projectDecisionEdition(held)
            if let answer = decodeSingle(data, decisionId: decisionId), answer.answer.status != .unauthorized {
                let committed = commit(answer.answer, claim, servedAt: answer.servedAt, origin: .screen)
                shownFromCache[decisionId] = nil
                let review = committed ? answer.answer.review : row(decisionId)?.review
                shownProof[decisionId] = review.map(Self.proof)
                return review
            }
        } catch {
            failure = error
        }
        guard let cached = row(decisionId), let review = cached.review else { throw failure }
        shownFromCache[decisionId] = cached.servedAt
        shownProof[decisionId] = Self.proof(review)
        return review
    }

    /// The stamp beside an edition a screen was handed from the cache, or nil
    /// when the screen is drawing a live answer.
    func freshnessLabel(forDecision decisionId: String?) -> String? {
        guard let decisionId, let servedAt = shownFromCache[decisionId] else { return nil }
        return SharedDirectionFreshness.label(servedAt: servedAt, anchor: anchor, now: env.now())
    }

    /// The bound account's cached edition, or nil. One whose files have gone
    /// from disk is read as `.none`, never as a complete set (SQ-247 F4).
    func cachedEdition(decisionId: String) -> CachedDirectionEdition? {
        guard let record = row(decisionId) else { return nil }
        demoteIfFilesMissing(record)
        return record
    }

    // MARK: - Acts (§C.8): an online check before every one, no deferral

    func confirmProjectApprovalReview(
        decisionId: String, authorityRevision: Int, artifactChecksum: String, idempotencyKey: String
    ) async throws {
        let fresh = try await preActCheck(SharedDirectionHeldProof(
            decisionId: decisionId, heldAuthorityRevision: authorityRevision,
            heldArtifactChecksum: artifactChecksum
        ))
        guard let revision = fresh.authorityRevision else { throw SharedDirectionActRefusal.notCurrent }
        try await env.client.confirmProjectApprovalReview(
            decisionId: decisionId, authorityRevision: revision,
            artifactChecksum: fresh.artifactChecksum, idempotencyKey: idempotencyKey
        )
    }

    /// The CAS value is the pre-act read's `updatedAt`, never the cache's.
    func respondToProjectApproval(
        decisionId: String, outcome: ProjectApprovalOutcome, clientSignature: String,
        idempotencyKey: String
    ) async throws {
        guard let shown = shownProof[decisionId] ?? row(decisionId).map(Self.proof) else {
            throw SharedDirectionActRefusal.notCurrent
        }
        let fresh = try await preActCheck(shown)
        try await env.client.respondToProjectApproval(
            decisionId: decisionId, outcome: outcome, clientSignature: clientSignature,
            expectedUpdatedAt: fresh.updatedAt, idempotencyKey: idempotencyKey
        )
    }

    /// Proceed only on `ok`, still `active`, with the revision and checksum
    /// the reader was shown. The read is an authority answer: it takes a
    /// sequence number and a non-`ok` is handled per §C.5 before the refusal.
    func preActCheck(_ shown: SharedDirectionHeldProof) async throws -> RemoteProjectApprovalReview {
        let claim = claim(shown.decisionId, singleFlight: false)
        let data: Data
        do {
            data = try await env.client.projectDecisionEdition(shown)
        } catch {
            throw SharedDirectionActRefusal.indeterminate
        }
        guard let answer = decodeSingle(data, decisionId: shown.decisionId),
              answer.answer.status != .unauthorized else {
            throw SharedDirectionActRefusal.indeterminate
        }
        commit(answer.answer, claim, servedAt: answer.servedAt, origin: .screen)
        guard answer.answer.status == .ok, let review = answer.answer.review,
              review.disposition == "active",
              review.authorityRevision == shown.heldAuthorityRevision,
              review.artifactChecksum == shown.heldArtifactChecksum else {
            throw SharedDirectionActRefusal.notCurrent
        }
        return review
    }

    // MARK: - Pieces the extensions share

    func ticket(_ decisionId: String) -> Ticket {
        Ticket(
            account: env.account(), session: sessionGeneration,
            edition: editionGeneration[decisionId, default: 0]
        )
    }

    func isCurrent(_ ticket: Ticket, _ decisionId: String) -> Bool {
        ticket == self.ticket(decisionId)
    }

    /// A decoded envelope moves the anchor; nothing else does (§C.7).
    func observe(servedAt: Date) {
        anchor.observe(servedAt: servedAt, at: env.now())
    }

    /// The bound account's row for one edition.
    func row(_ decisionId: String) -> CachedDirectionEdition? {
        guard let account = env.account() else { return nil }
        var descriptor = FetchDescriptor<CachedDirectionEdition>(
            predicate: #Predicate { $0.accountId == account && $0.decisionId == decisionId }
        )
        descriptor.fetchLimit = 1
        return try? env.context().fetch(descriptor).first
    }

    /// The bound account's rows.
    func rows() -> [CachedDirectionEdition] {
        guard let account = env.account() else { return [] }
        let descriptor = FetchDescriptor<CachedDirectionEdition>(
            predicate: #Predicate { $0.accountId == account }
        )
        return (try? env.context().fetch(descriptor)) ?? []
    }

    func save() {
        do {
            try env.context().save()
        } catch {
            PatinaLog.sync.error("[SharedDirection] save failed: \(error.localizedDescription)")
        }
    }

    func heldProof(_ decisionId: String) -> SharedDirectionHeldProof {
        let cached = row(decisionId)
        return SharedDirectionHeldProof(
            decisionId: decisionId, heldAuthorityRevision: cached?.authorityRevision,
            heldArtifactChecksum: cached?.artifactChecksum
        )
    }

    static func proof(_ review: RemoteProjectApprovalReview) -> SharedDirectionHeldProof {
        SharedDirectionHeldProof(
            decisionId: review.decisionId, heldAuthorityRevision: review.authorityRevision,
            heldArtifactChecksum: review.artifactChecksum
        )
    }

    static func proof(_ record: CachedDirectionEdition) -> SharedDirectionHeldProof {
        SharedDirectionHeldProof(
            decisionId: record.decisionId, heldAuthorityRevision: record.authorityRevision,
            heldArtifactChecksum: record.artifactChecksum
        )
    }

    /// The wrapper's single envelope, for this edition, with the anchor moved.
    private func decodeSingle(
        _ data: Data, decisionId: String
    ) -> (answer: SharedDirectionAnswer, servedAt: Date)? {
        guard let envelope = SharedDirectionWire.singleEdition(from: data),
              let answer = envelope.answers.first, answer.decisionId == decisionId else { return nil }
        observe(servedAt: envelope.servedAt)
        return (answer, envelope.servedAt)
    }
}
