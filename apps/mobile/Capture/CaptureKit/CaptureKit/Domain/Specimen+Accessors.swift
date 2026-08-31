//  Specimen+Accessors.swift
//  CaptureKit
//
//  Typed accessors over the raw-string storage, and the SINGLE sanctioned
//  mutation path (`setValue`) so provenance + updatedAt always stay in sync.

import Foundation

public extension Specimen {
    var category: SpecimenCategory {
        get { SpecimenCategory(rawValue: categoryRaw) ?? .unknown }
        set { categoryRaw = newValue.rawValue }
    }
    var destination: CaptureDestination {
        get { CaptureDestination(rawValue: destinationRaw) ?? .undecided }
        set { destinationRaw = newValue.rawValue }
    }
    var status: CaptureStatus {
        get { CaptureStatus(rawValue: statusRaw) ?? .draft }
        set { statusRaw = newValue.rawValue }
    }

    /// Honest transfer state projected from persisted sync fields. `.complete`
    /// is impossible without a non-empty remote receipt.
    var transferState: CaptureTransferState {
        let lifecycle = CaptureLifecycle.State(rawValue: lifecycleRaw)
        if status == .committed, let receipt = remoteId?.trimmingCharacters(
            in: .whitespacesAndNewlines), !receipt.isEmpty {
            switch placementState {
            case .pending:
                return CaptureTransferState(
                    phase: .queued, progress: 100,
                    retryCount: placementRetryCount ?? 0,
                    receiptID: receipt)
            case .placing:
                return CaptureTransferState(
                    phase: .awaitingConfirmation, progress: 100,
                    retryCount: placementRetryCount ?? 0,
                    receiptID: receipt)
            case .failed:
                return CaptureTransferState(
                    phase: .retryableFailure, progress: 100,
                    errorMessage: placementLastError,
                    retryCount: placementRetryCount ?? 0,
                    receiptID: receipt)
            case .placed, nil:
                break
            }
            return CaptureTransferState(
                phase: .complete, progress: 100, retryCount: retryCount,
                receiptID: receipt)
        }
        if lifecycle == .awaitingConfirmation {
            return CaptureTransferState(
                phase: .awaitingConfirmation, progress: 100,
                retryCount: retryCount)
        }
        if lifecycle == .rejected {
            return CaptureTransferState(
                phase: .rejected, progress: uploadProgress,
                errorMessage: lastSyncError, retryCount: retryCount)
        }
        switch status {
        case .draft:
            return CaptureTransferState(
                phase: .local, progress: uploadProgress,
                retryCount: retryCount)
        case .ready, .queued:
            return CaptureTransferState(
                phase: .queued, progress: uploadProgress,
                retryCount: retryCount)
        case .uploading:
            return CaptureTransferState(
                phase: .uploading, progress: uploadProgress,
                retryCount: retryCount)
        case .failed:
            return CaptureTransferState(
                phase: .retryableFailure, progress: uploadProgress,
                errorMessage: lastSyncError, retryCount: retryCount)
        case .committed:
            // Legacy/broken row: bytes may have landed, but no receipt means
            // it remains visibly unconfirmed.
            return CaptureTransferState(
                phase: .awaitingConfirmation, progress: 100,
                retryCount: retryCount)
        }
    }

    /// Persist a transfer transition through the existing frozen schema.
    func applyTransferState(_ state: CaptureTransferState) {
        uploadProgress = state.progress
        retryCount = state.retryCount
        lastSyncError = state.errorMessage
        switch state.phase {
        case .local:
            status = .draft
            lifecycleRaw = CaptureLifecycle.State.captured.rawValue
        case .queued:
            status = .queued
            lifecycleRaw = CaptureLifecycle.State.queued.rawValue
        case .uploading:
            status = .uploading
            lifecycleRaw = CaptureLifecycle.State.uploading.rawValue
        case .awaitingConfirmation:
            status = .uploading
            lifecycleRaw = CaptureLifecycle.State.awaitingConfirmation.rawValue
        case .complete:
            guard let receipt = state.receiptID, !receipt.isEmpty else { return }
            remoteId = receipt
            status = .committed
        case .retryableFailure:
            status = .failed
            lifecycleRaw = CaptureLifecycle.State.failed.rawValue
        case .rejected:
            status = .failed
            lifecycleRaw = CaptureLifecycle.State.rejected.rawValue
        }
        touch()
    }

    /// Provenance of a field, if it has been set.
    func provenance(for key: FieldKey) -> ProvenanceSource? {
        provenanceRaw[key.rawValue].flatMap(ProvenanceSource.init(rawValue:))
    }

    var primaryPhoto: CapturePhoto? {
        photos.first(where: { $0.isPrimary }) ?? photos.sorted(by: { $0.order < $1.order }).first
    }

    /// Has any field been set by a smart guess that the designer hasn't confirmed?
    var hasUnconfirmedGuess: Bool {
        provenanceRaw.values.contains(ProvenanceSource.smartGuess.rawValue)
    }

    /// THE mutation entry point: writes the field, records provenance, bumps updatedAt.
    /// Guesses never overwrite a value a tag/scan/measure/human already set
    /// (the spec's "guesses never overwrite" rule, N5).
    func setValue(_ value: String?, for key: FieldKey, source: ProvenanceSource) {
        if source == .smartGuess, let existing = provenance(for: key),
           existing != .smartGuess {
            return // don't clobber a confirmed/recognised value with a guess
        }
        switch key {
        case .title:     title = value
        case .maker:     maker = value
        case .sku:       sku = value
        case .colorway:  colorway = value
        case .material:  materialNote = value
        case .price:     priceTradeCents = value.flatMap { Int($0) }
        case .sourceURL: sourceURL = value
        case .note:      note = value
        case .category:  if let v = value { categoryRaw = v }
        case .dimensions: break // dimensions live in `measurements`; use addMeasurement
        }
        provenanceRaw[key.rawValue] = source.rawValue
        touch()
    }

    func setConfidence(_ confidence: Double, for key: FieldKey) {
        guessConfidenceRaw[key.rawValue] = confidence
    }

    /// Write a batch of smart-guess suggestions and confidence-gate them in one
    /// pass — the shared source of truth for C1's post-shutter read and N5's
    /// mirrored test loop. `setValue` refuses to overwrite what a tag, a scan,
    /// a measure or she already set; never pin a confidence to a value we
    /// didn't write.
    @MainActor
    func recordSmartGuess(_ suggestions: [FieldSuggestion]) {
        for suggestion in suggestions {
            setValue(suggestion.value, for: suggestion.key, source: suggestion.source)
            guard provenance(for: suggestion.key) == suggestion.source else { continue }
            setConfidence(suggestion.confidence, for: suggestion.key)
        }
    }

    func addMeasurement(axis: MeasurementAxis, millimeters: Double, source: MeasureSource) {
        let m = CaptureMeasurement(axisRaw: axis.rawValue, millimeters: millimeters, sourceRaw: source.rawValue)
        m.specimen = self
        measurements.append(m)
        provenanceRaw[FieldKey.dimensions.rawValue] =
            (source == .arkit ? ProvenanceSource.measure : ProvenanceSource.manual).rawValue
        touch()
    }

    func touch() { updatedAt = Date() }

    // MARK: - Project placement

    var placementState: ProjectPlacementState? {
        get { placementStateRaw.flatMap(ProjectPlacementState.init(rawValue:)) }
        set { placementStateRaw = newValue?.rawValue }
    }

    var hasConfirmedCaptureReceipt: Bool {
        status == .committed
            && remoteId?.trimmingCharacters(in: .whitespacesAndNewlines)
                .isEmpty == false
    }

    var needsProjectPlacement: Bool {
        guard placementProjectId?.trimmingCharacters(
            in: .whitespacesAndNewlines
        ).isEmpty == false else { return false }
        return placementState != .placed
    }

    func configureProjectPlacement(
        projectID: String,
        roomID: String?,
        slotID: String?,
        category: String?
    ) {
        placementProjectId = projectID
        placementRoomId = roomID
        placementSlotId = slotID
        placementCategory = category
        placementState = .pending
        placementFFEItemId = nil
        placementSpecId = nil
        placementLastError = nil
        placementRetryCount = 0
        touch()
    }

    func clearProjectPlacement() {
        placementProjectId = nil
        placementRoomId = nil
        placementSlotId = nil
        placementCategory = nil
        placementState = nil
        placementFFEItemId = nil
        placementSpecId = nil
        placementLastError = nil
        placementRetryCount = nil
        touch()
    }

    func markProjectPlacementPending() {
        guard placementProjectId != nil else { return }
        placementState = .pending
        placementLastError = nil
        touch()
    }

    func markProjectPlacementStarted() {
        guard placementProjectId != nil else { return }
        placementState = .placing
        placementLastError = nil
        touch()
    }

    func markProjectPlacementFailed(_ message: String) {
        guard placementProjectId != nil else { return }
        placementState = .failed
        placementLastError = message
        placementRetryCount = (placementRetryCount ?? 0) + 1
        touch()
    }

    func applyProjectPlacementReceipt(_ receipt: ProjectPlacementReceipt) {
        placementState = .placed
        placementFFEItemId = receipt.ffeItemID.uuidString
        placementSpecId = receipt.specID.uuidString
        placementLastError = nil
        touch()
    }

    // MARK: - Margin-note lane (wave 4)

    var marginNoteState: FieldWriteState? {
        get { marginNoteStateRaw.flatMap(FieldWriteState.init(rawValue:)) }
        set { marginNoteStateRaw = newValue?.rawValue }
    }

    /// `.refused` closes the lane as firmly as `.written`: a 42501 is a fact
    /// about who owns this project, not a transient error (FC-R8).
    var needsMarginNote: Bool {
        guard marginNoteId?.trimmingCharacters(
            in: .whitespacesAndNewlines
        ).isEmpty == false else { return false }
        return marginNoteState != .written && marginNoteState != .refused
    }

    /// `body: nil` means "compose it from the transcript at drain time" — the
    /// ordinary case, including the automatic in-visit note (ruling 1). A body
    /// is passed only by FC-R8's degrade (ruling 3), which has words of its own.
    ///
    /// Re-requesting an OPEN lane is a no-op on the id: the id is the
    /// idempotency key, and re-minting it mid-flight would write the note
    /// twice. A lane whose note has already landed is FREE, and re-requesting
    /// it starts a second note — which is how FC-R8's degrade (ruling 3) still
    /// files its words on a capture that already auto-filed its transcript.
    /// The degrade passes a deterministic id (the refused task's own UUID), so
    /// that second note is replay-safe exactly like the first.
    func requestMarginNote(noteID: UUID, body: String? = nil) {
        guard marginNoteId == nil || marginNoteState == .written else { return }
        marginNoteId = noteID.uuidString
        marginNoteBodyRaw = body
        marginNoteState = .pending
        marginNoteLastError = nil
        marginNoteRetryCount = 0
        touch()
    }

    func markMarginNotePending() {
        guard marginNoteId != nil else { return }
        marginNoteState = .pending
        marginNoteLastError = nil
        touch()
    }

    func markMarginNoteStarted() {
        guard marginNoteId != nil else { return }
        marginNoteState = .writing
        marginNoteLastError = nil
        touch()
    }

    func markMarginNoteWritten() {
        guard marginNoteId != nil else { return }
        marginNoteState = .written
        marginNoteLastError = nil
        touch()
    }

    func markMarginNoteFailed(_ message: String) {
        marginNoteState = .failed
        marginNoteLastError = message
        marginNoteRetryCount = (marginNoteRetryCount ?? 0) + 1
        touch()
    }

    func markMarginNoteRefused(_ message: String) {
        marginNoteState = .refused
        marginNoteLastError = message
        touch()
    }

    func clearMarginNote() {
        marginNoteId = nil
        marginNoteBodyRaw = nil
        marginNoteState = nil
        marginNoteLastError = nil
        marginNoteRetryCount = nil
        touch()
    }

    // MARK: - Task/punch lane (wave 4)

    var punchTaskState: FieldWriteState? {
        get { punchTaskStateRaw.flatMap(FieldWriteState.init(rawValue:)) }
        set { punchTaskStateRaw = newValue?.rawValue }
    }

    var needsPunchTask: Bool {
        guard punchTaskId?.trimmingCharacters(
            in: .whitespacesAndNewlines
        ).isEmpty == false else { return false }
        return punchTaskState != .written && punchTaskState != .refused
    }

    func requestPunchTask(taskID: UUID, owner: String, partyID: String?) {
        punchTaskId = taskID.uuidString
        punchTaskOwnerRaw = owner
        punchTaskPartyId = partyID
        punchTaskState = .pending
        punchTaskLastError = nil
        punchTaskRetryCount = 0
        touch()
    }

    func markPunchTaskPending() {
        guard punchTaskId != nil else { return }
        punchTaskState = .pending
        punchTaskLastError = nil
        touch()
    }

    func markPunchTaskStarted() {
        guard punchTaskId != nil else { return }
        punchTaskState = .writing
        punchTaskLastError = nil
        touch()
    }

    func markPunchTaskWritten() {
        guard punchTaskId != nil else { return }
        punchTaskState = .written
        punchTaskLastError = nil
        touch()
    }

    func markPunchTaskFailed(_ message: String) {
        punchTaskState = .failed
        punchTaskLastError = message
        punchTaskRetryCount = (punchTaskRetryCount ?? 0) + 1
        touch()
    }

    func markPunchTaskRefused(_ message: String) {
        punchTaskState = .refused
        punchTaskLastError = message
        touch()
    }

    func clearPunchTask() {
        punchTaskId = nil
        punchTaskPartyId = nil
        punchTaskOwnerRaw = nil
        punchTaskState = nil
        punchTaskLastError = nil
        punchTaskRetryCount = nil
        touch()
    }
}

// MARK: - The visit (Field Companion wave 3)

public extension Specimen {
    var visitKind: FieldVisitKind? {
        get { visitKindRaw.flatMap(FieldVisitKind.init(rawValue:)) }
        set { visitKindRaw = newValue?.rawValue }
    }
    var visitKit: FieldVisitKit? {
        get { visitKitRaw.flatMap(FieldVisitKit.init(rawValue:)) }
        set { visitKitRaw = newValue?.rawValue }
    }
    var noteSetting: FieldNoteSetting? {
        get { noteSettingRaw.flatMap(FieldNoteSetting.init(rawValue:)) }
        set { noteSettingRaw = newValue?.rawValue }
    }
    var suggestionBasis: FieldSuggestionBasis? {
        get { suggestionBasisRaw.flatMap(FieldSuggestionBasis.init(rawValue:)) }
        set { suggestionBasisRaw = newValue?.rawValue }
    }

    /// The basis in WORDS. Never a number, never a mechanism.
    var suggestionReason: String? { suggestionReasonRaw }

    /// Write a SUGGESTION — WE THINK SO, never SHE SAID SO. This function must
    /// never write `venue.projectId` / `venue.projectRoomId`: that is the fact,
    /// and only `place(…)` may set it. Passing nil clears the question and
    /// leaves the fact exactly as it stood.
    func apply(_ suggestion: CaptureSuggestion?) {
        suggestedProjectID = suggestion?.projectID
        suggestedProjectRoomID = suggestion?.projectRoomID
        suggestionBasis = suggestion?.basis
        suggestionConfidence = suggestion?.confidence
        suggestionReasonRaw = suggestion?.reason
    }

    /// Whether this capture's destination is one that OWES a project.
    /// Spec Flow 6: an un-chipped market find filed to the Library shelf is
    /// DONE — only a chipped one takes `place_product_in_project` — so a
    /// `.library` capture is never waiting to be placed. `.undecided` is the
    /// default a fresh draft carries and still owes a decision, so it counts.
    /// Switched, not compared, so a fourth destination has to choose a side.
    var destinationRequiresProject: Bool {
        switch destination {
        case .library: return false
        case .inbox, .undecided: return true
        }
    }

    /// "Placed" is `venue.projectId is not null` — the same rule the server uses
    /// (`project_id IS NOT NULL`) — for a destination that owes a project at all.
    /// There is no new status value, ever, and SYNC STATE IS IRRELEVANT: a
    /// capture that committed hours ago and still has no project is unplaced, and
    /// FC-R6 says it waits on Today until she files it. This narrows on
    /// DESTINATION, never on sync — the two are different axes and only one moves.
    ///
    /// The SINGLE shared predicate: Today's count and the tray's list both read
    /// it, so R98's "they agree" holds by construction rather than by discipline.
    var isUnplaced: Bool {
        guard destinationRequiresProject else { return false }
        return (venue?.projectId?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "").isEmpty
    }

    /// FC-R6: a capture that was placed AFTER it committed. The server learns the
    /// project on the next drain; until then the tray shows `placed · syncing`.
    var placementNeedsReplay: Bool { placementReplayPending == true }

    /// The sync path may short-circuit on a receipt it already holds ONLY while
    /// nothing new has to reach the server. A capture placed after it committed
    /// has something new, so it must re-run `commit_field_capture` instead —
    /// idempotent on `client_capture_id`, and 00530's inbox branch is what
    /// persists the project.
    var canReuseConfirmedReceipt: Bool {
        hasConfirmedCaptureReceipt && !placementNeedsReplay
    }

    /// A receipt just landed for the placement named in `sent`. If the record
    /// still says what went out, the server is current and the replay bit is let
    /// go of — it replays once, not forever. If she re-placed WHILE the RPC was
    /// in flight, what went out is already stale, so the bit is raised instead
    /// and the ordinary drain carries the newer project.
    ///
    /// Raising, not merely declining to clear, is what closes the hole: during a
    /// drain the row is `.uploading`, so `place(…)` sets no bit of its own, and a
    /// receipt for the OLDER placement would otherwise clear the bit and strand
    /// the newer one — the same silent divergence one layer in.
    /// Returns whether the bit changed.
    @discardableResult
    func reconcilePlacementReplay(sentProjectID: String?,
                                  sentProjectRoomID: String?) -> Bool {
        func trimmed(_ value: String?) -> String {
            (value ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        }
        let stillCurrent = trimmed(sentProjectID) == trimmed(venue?.projectId)
            && trimmed(sentProjectRoomID) == trimmed(venue?.projectRoomId)
        let desired: Bool? = stillCurrent ? nil : true
        guard placementReplayPending != desired else { return false }
        placementReplayPending = desired
        return true
    }

    /// Place this capture — write the FACT. Never touches `suggested_*`.
    /// A capture that has not committed yet needs nothing more: its routing rides
    /// the FIRST commit, exactly as a capture taken inside a visit does. One that
    /// HAS committed needs the outbox to re-run `commit_field_capture`, so it is
    /// flagged for replay here and the ordinary drain does the rest.
    /// The two ids are written unconditionally, but `room: nil` means KEEP THE
    /// EXISTING LABEL, not clear it — so placing into a project with no room
    /// leaves the old room name standing beside a nil `projectRoomId`. Callers
    /// that mean "no room" must pass the replacement label themselves.
    func place(projectID: String?, projectRoomID: String?, room: String?) {
        var stamp = venue ?? VenueStamp()
        stamp.projectId = projectID
        stamp.projectRoomId = projectRoomID
        if let room { stamp.room = room }
        venue = stamp
        if status == .committed { placementReplayPending = true }
        touch()
    }

    func inherit(_ context: CaptureSessionContext) {
        visitKind = context.kind
        visitKit = context.kit
        visitLabel = context.label
        visitStartedAt = context.kind == nil ? nil : context.startedAt
        visitEndedAt = context.endedAt
        if noteSettingRaw == nil, let kind = context.kind {
            noteSetting = CaptureVisitDraft(kind: kind, kit: context.kit).defaultNoteSetting
        }
    }
}

/// Orders a tray so the strongest suggestions surface first. The CONFIDENCE
/// NEVER LEAVES THIS TYPE: it decides sequence and is never handed to a view,
/// which is the whole of Principle 4's "orders, never renders". A record with no
/// suggestion sorts below every record that has one, and ties fall back to the
/// tray's ordinary newest-first order so the sequence is total and stable.
public enum FieldTraySuggestionOrder {
    @MainActor
    public static func ordered(_ specimens: [Specimen]) -> [Specimen] {
        specimens.sorted { lhs, rhs in
            let left = lhs.suggestionConfidence ?? -1
            let right = rhs.suggestionConfidence ?? -1
            if left != right { return left > right }
            return lhs.createdAt > rhs.createdAt
        }
    }
}
