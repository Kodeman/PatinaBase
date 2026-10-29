//
//  ServiceAcceptanceModel.swift
//  Patina
//
//  US-52 WP-10C-d. The state behind the agreed-services entry and its detail
//  sheet: the caller's requests, the request on screen, one draft answer per
//  request binding, the answers the server has acknowledged, and the one
//  submission a retry re-sends.
//

import SwiftUI

/// The calls this feature makes. `DecisionsAPIClient` is the real one;
/// tests hand in a fake.
nonisolated protocol ServiceAcceptanceService: Sendable {
    func fetchMyServiceAcceptanceRequests() async throws -> [RemoteServiceAcceptanceRequest]
    func fetchMyServiceAcceptanceEvidence(requestId: String) async throws -> RemoteServiceAcceptanceEvidence
    func respondToServiceAcceptance(_ submission: ServiceAcceptanceSubmission) async throws
    func fetchStudioServiceCompletion(projectId: String) async throws -> RemoteStudioServiceCompletionRead
}

extension DecisionsAPIClient: ServiceAcceptanceService {}

/// The three acts a required signer is offered, in the order drawn.
enum ServiceAcceptanceChoice: CaseIterable, Identifiable, Sendable {
    case accept, acceptWithConditions, returnToStudio

    var id: Self { self }
}

/// What a draft is bound to: the request and the exact scope and evidence it
/// presented. A changed hash is a different binding with its own empty draft.
struct ServiceAcceptanceDraftKey: Hashable, Sendable {
    let requestId: String
    let scopeContentHash: String
    let evidenceManifestHash: String

    init(_ request: RemoteServiceAcceptanceRequest) {
        requestId = request.requestId
        scopeContentHash = request.scopeContentHash
        evidenceManifestHash = request.evidenceManifestHash
    }
}

/// One answer being composed.
struct ServiceAcceptanceDraft: Equatable, Sendable {
    var choice: ServiceAcceptanceChoice?
    var conditions: [String] = [""]
    var returnReason = ""
    /// The signer policy revision on screen when she picked her act. The
    /// answer goes only under this revision (C4 §2.9); a read showing another
    /// keeps her words but asks her to review again.
    var presentedRevision: Int?

    var answer: ServiceAcceptanceAnswer? {
        switch choice {
        case .accept: return .accept
        case .acceptWithConditions: return .acceptWithConditions(conditions)
        case .returnToStudio: return .returned(reason: returnReason)
        case nil: return nil
        }
    }
}

/// The signer slot an act was made from: the request, her signer entry and
/// the policy revision that held it. A studio replacement gives a new signer
/// id and revision (00886 `replace_service_acceptance_signer`), so a new slot
/// is a different binding.
struct ServiceAcceptanceBinding: Hashable, Sendable {
    let requestId: String
    let signerId: String?
    let signerPolicyRevision: Int

    init(_ request: RemoteServiceAcceptanceRequest) {
        requestId = request.requestId
        signerId = request.viewerSignerId
        signerPolicyRevision = request.signerPolicyRevision
    }
}

/// A binding the server has settled for this caller since the last good read:
/// her answer was acknowledged (`answer` set), or a refusal said no act can
/// succeed (`answer` nil). That binding stays read-only until a successful
/// read shows it no longer waiting on her; a new slot for her is not settled.
struct ServiceAcceptanceSettled: Equatable, Sendable {
    let binding: ServiceAcceptanceBinding
    let answer: ServiceAcceptanceAnswer?
}

/// What the entry above the decision list draws.
enum ServiceAcceptanceEntryState: Equatable, Sendable {
    /// No read has finished yet.
    case loading
    /// No read has ever succeeded and the last one failed.
    case firstLoadFailed
    /// A read has succeeded; `refreshFailed` when the latest one did not,
    /// however many rows are cached.
    case loaded(refreshFailed: Bool)
    /// The latest read succeeded and found nothing.
    case empty
}

@Observable
@MainActor
final class ServiceAcceptanceModel {
    private(set) var requests: [RemoteServiceAcceptanceRequest] = []
    private(set) var isLoading = false
    private(set) var loadFailed = false
    /// True once any read has succeeded; until then an empty list means
    /// "not known yet", never "no request".
    private(set) var hasLoaded = false
    private(set) var presentedEvidence: RemoteServiceAcceptanceEvidence?
    private(set) var evidenceLoading = false
    private(set) var evidenceFailed = false
    private(set) var evidenceChanged = false
    private var evidenceGeneration = 0

    /// The request the sheet shows. Opening another drops the last one's
    /// refusal line; drafts stay with the request they were written for.
    var presentedRequestId: String? {
        didSet {
            if presentedRequestId != oldValue {
                refusal = nil
                evidenceGeneration += 1
                presentedEvidence = nil
                evidenceFailed = false
                evidenceChanged = false
            }
        }
    }

    private(set) var drafts: [ServiceAcceptanceDraftKey: ServiceAcceptanceDraft] = [:]
    private(set) var settled: [String: ServiceAcceptanceSettled] = [:]
    private(set) var isSubmitting = false
    private(set) var refusal: ServiceAcceptanceRefusal?
    /// The submission last sent and not yet answered. A retry of the same
    /// answer on the same request re-sends it, key and all.
    private(set) var pendingSubmission: ServiceAcceptanceSubmission?

    /// The last `get_studio_service_completion` read per project. Absent until
    /// one succeeds; a failed read (permission denied included) drops it, so
    /// the section hides rather than say anything it cannot stand behind.
    private(set) var studioServiceReads: [String: RemoteStudioServiceCompletionRead] = [:]
    private var studioServiceGeneration: [String: Int] = [:]

    /// Server cap on conditions per response (00886 `_service_acceptance_conditions`).
    static let maxConditions = ServiceAcceptanceAnswer.maxConditions

    private let service: ServiceAcceptanceService
    /// Bumped by every read that starts and by every settled act. A read
    /// publishes only while it is still the latest, so a slow read begun
    /// before an act can never write over what the act settled.
    private var readGeneration = 0

    init(service: ServiceAcceptanceService = DecisionsAPIClient.shared) {
        self.service = service
    }

    // MARK: - Read

    /// Sent and still waiting on someone: the entry's cards.
    var openRequests: [RemoteServiceAcceptanceRequest] { requests.filter(\.isOpen) }

    /// Withdrawn, superseded, closed or decided: read-only history.
    var pastRequests: [RemoteServiceAcceptanceRequest] { requests.filter { !$0.isOpen } }

    /// Nothing read yet and nothing failed: the first read is in flight.
    var isFirstLoad: Bool { !hasLoaded && !loadFailed }

    var entryState: ServiceAcceptanceEntryState {
        if isFirstLoad || (isLoading && !hasLoaded) { return .loading }
        if !hasLoaded { return .firstLoadFailed }
        if loadFailed || !requests.isEmpty { return .loaded(refreshFailed: loadFailed) }
        return .empty
    }

    func request(id: String) -> RemoteServiceAcceptanceRequest? {
        requests.first { $0.requestId == id }
    }

    var presentedRequest: RemoteServiceAcceptanceRequest? { presentedRequestId.flatMap(request(id:)) }

    var evidenceReady: Bool {
        guard let request = presentedRequest, let presentedEvidence else { return false }
        return !evidenceFailed && presentedEvidence.matches(request)
    }

    func loadEvidence(for request: RemoteServiceAcceptanceRequest) async {
        evidenceGeneration += 1
        let generation = evidenceGeneration
        presentedEvidence = nil
        evidenceLoading = true
        evidenceFailed = false
        evidenceChanged = false
        do {
            let read = try await service.fetchMyServiceAcceptanceEvidence(requestId: request.requestId)
            guard generation == evidenceGeneration, presentedRequestId == request.requestId else { return }
            evidenceLoading = false
            if read.matches(request) { presentedEvidence = read }
            else { evidenceChanged = true }
        } catch {
            guard generation == evidenceGeneration, presentedRequestId == request.requestId else { return }
            evidenceLoading = false
            evidenceFailed = true
        }
    }

    func retryEvidence() async {
        guard let request = presentedRequest else { return }
        await loadEvidence(for: request)
    }

    func load() async {
        readGeneration += 1
        let generation = readGeneration
        isLoading = true
        do {
            let fresh = try await service.fetchMyServiceAcceptanceRequests()
            // A later read, or an act settled meanwhile, owns the screen now.
            guard generation == readGeneration else { return }
            isLoading = false
            requests = fresh
            hasLoaded = true
            loadFailed = false
            // A good read that still offers her an act from the same binding
            // keeps it read-only; anything else (answered, closed, or a new
            // slot for her) reconciles it.
            settled = settled.filter { id, entry in
                guard let row = fresh.first(where: { $0.requestId == id }) else { return false }
                return row.canRespond && ServiceAcceptanceBinding(row) == entry.binding
            }
        } catch {
            guard generation == readGeneration else { return }
            isLoading = false
            // A failed read keeps whatever was already on screen.
            loadFailed = true
            #if DEBUG
            PatinaLog.ui.error("[ServiceAcceptance] load failed: \(error.localizedDescription)")
            #endif
        }
    }

    /// What has settled this request's current binding, if anything.
    func settlement(for request: RemoteServiceAcceptanceRequest) -> ServiceAcceptanceSettled? {
        settled[request.requestId].flatMap { $0.binding == ServiceAcceptanceBinding(request) ? $0 : nil }
    }

    /// The server offers her an act and nothing here has settled that slot since.
    func canRespond(_ request: RemoteServiceAcceptanceRequest) -> Bool {
        request.canRespond && settlement(for: request) == nil
    }

    // MARK: - Studio service (C6, read-only)

    /// The request's **Studio service** section, or nil while it is hidden.
    func studioService(for request: RemoteServiceAcceptanceRequest) -> StudioServiceReading? {
        studioServiceReads[request.projectId].flatMap { StudioServiceReading(request: request, read: $0) }
    }

    /// Read the studio's completion for an accepted request's project.
    func loadStudioService(for request: RemoteServiceAcceptanceRequest) async {
        guard request.showsStudioService else { return }
        let projectId = request.projectId
        let generation = (studioServiceGeneration[projectId] ?? 0) + 1
        studioServiceGeneration[projectId] = generation
        let read: RemoteStudioServiceCompletionRead?
        do {
            read = try await service.fetchStudioServiceCompletion(projectId: projectId)
        } catch {
            read = nil
            #if DEBUG
            PatinaLog.ui.error("[ServiceAcceptance] studio service read failed: \(error.localizedDescription)")
            #endif
        }
        // A later read for this project owns the section now.
        guard studioServiceGeneration[projectId] == generation else { return }
        studioServiceReads[projectId] = read
    }

    // MARK: - Compose (the presented request's draft)

    private var draftKey: ServiceAcceptanceDraftKey? { presentedRequest.map(ServiceAcceptanceDraftKey.init) }

    private var draft: ServiceAcceptanceDraft {
        get { draftKey.flatMap { drafts[$0] } ?? ServiceAcceptanceDraft() }
        set { if let draftKey { drafts[draftKey] = newValue } }
    }

    /// The act she picked; nil until she picks one.
    var choice: ServiceAcceptanceChoice? { draft.choice }

    var conditions: [String] {
        get { draft.conditions }
        set { draft.conditions = newValue }
    }

    var returnReason: String {
        get { draft.returnReason }
        set { draft.returnReason = newValue }
    }

    /// Picking an act binds the draft to the signer policy revision on screen.
    func choose(_ choice: ServiceAcceptanceChoice?) {
        draft.choice = choice
        draft.presentedRevision = choice == nil ? nil : presentedRequest?.signerPolicyRevision
        refusal = nil
    }

    /// The answer as composed, or nil when nothing is chosen.
    var draftAnswer: ServiceAcceptanceAnswer? { draft.answer }

    /// What stops the composed answer going, if anything.
    var draftIssue: ServiceAcceptanceAnswerIssue? { draftAnswer?.issue }

    /// The signers changed after she picked her act: a read brought another
    /// policy revision. Her words stay; Submit waits until she reviews again.
    var signersChanged: Bool {
        guard let request = presentedRequest, draft.choice != nil else { return false }
        return draft.presentedRevision != request.signerPolicyRevision
    }

    /// Re-read the request, then ask her to pick her act again under what is
    /// now shown. Her conditions and reason are kept.
    func reviewAgain() async {
        await reload()
        guard !loadFailed else { return }
        draft.choice = nil
        draft.presentedRevision = nil
    }

    var canSubmit: Bool {
        guard !isSubmitting, evidenceReady, let request = presentedRequest, canRespond(request), !signersChanged,
              let answer = draftAnswer, answer.isComplete else { return false }
        // The server already called this exact answer invalid; she edits it.
        return !(refusal == .invalid && pendingSubmission?.answer == answer)
    }

    var canAddCondition: Bool { conditions.count < Self.maxConditions }

    func addCondition() {
        guard canAddCondition else { return }
        conditions.append("")
    }

    // MARK: - Respond

    /// Send the draft composed for this request. A retry of an unchanged
    /// answer re-sends the pending submission with its original
    /// `client_request_id`, so the server replays rather than records twice.
    func submit(for request: RemoteServiceAcceptanceRequest) async {
        let key = ServiceAcceptanceDraftKey(request)
        // Only under the revision she was shown; never stamped with a newer one.
        guard evidenceReady, presentedRequest == request, canRespond(request), !isSubmitting, let draft = drafts[key],
              draft.presentedRevision == request.signerPolicyRevision,
              let answer = draft.answer, answer.isComplete else { return }
        let submission: ServiceAcceptanceSubmission
        if let pending = pendingSubmission, pending.requestId == request.requestId,
           pending.answer == answer,
           pending.scopeContentHash == request.scopeContentHash,
           pending.evidenceManifestHash == request.evidenceManifestHash,
           pending.signerPolicyRevision == request.signerPolicyRevision {
            submission = pending
        } else {
            submission = ServiceAcceptanceSubmission(request: request, answer: answer)
        }
        pendingSubmission = submission
        isSubmitting = true
        refusal = nil
        do {
            try await service.respondToServiceAcceptance(submission)
            isSubmitting = false
            settle(request, key: key, answer: answer)
            await load()
        } catch {
            isSubmitting = false
            await handle(ServiceAcceptanceRefusal(error: error), for: request, key: key)
        }
    }

    /// The reload a `stale` refusal or an unreconciled answer asks for. What
    /// she read may have moved, so the old submission is dropped with it.
    func reload() async {
        pendingSubmission = nil
        refusal = nil
        await load()
    }

    private func handle(_ refusal: ServiceAcceptanceRefusal, for request: RemoteServiceAcceptanceRequest,
                        key: ServiceAcceptanceDraftKey) async {
        self.refusal = refusal
        switch refusal {
        case .alreadyResponded, .requestNotOpen, .notYours:
            // No act on this request can succeed now; the record says what is
            // true. Read-only until a good read shows it.
            settle(request, key: key, answer: nil)
            await load()
        case .stale, .paused, .failed, .invalid:
            // Stale waits for her Reload; paused and failed keep her answer
            // and its key for a later retry; invalid waits for her edit.
            break
        }
    }

    private func settle(_ request: RemoteServiceAcceptanceRequest, key: ServiceAcceptanceDraftKey,
                        answer: ServiceAcceptanceAnswer?) {
        pendingSubmission = nil
        drafts[key] = nil
        settled[request.requestId] = ServiceAcceptanceSettled(binding: ServiceAcceptanceBinding(request),
                                                              answer: answer)
        // Any read already in flight began before this act; it never publishes.
        readGeneration += 1
    }
}
