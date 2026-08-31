//  FieldWriteState.swift
//  CaptureKit
//
//  Shared state for the post-commit write lanes FC-R4 opened: a margin note
//  and a project task, both written by the designer's own phone, both riding
//  the existing capture outbox rather than a second queue.
//
//  `refused` is the one state that matters and the one the placement lane has
//  no equivalent for. project_tasks' only INSERT-capable policy is
//  "Designers manage their project tasks" (00169:61-62), a FOR ALL policy with
//  no explicit WITH CHECK — so Postgres reuses its USING clause,
//  `projects.designer_id = auth.uid()`, and a studio co-member gets 42501.
//  FC-R8 rules that per-designer, so 42501 is a FACT about this designer and
//  this project, not a transient error: retrying it forever would be a lie.
//  The lane closes and the caller degrades honestly.

import Foundation

public enum FieldWriteState: String, Codable, Sendable {
    case pending
    case writing
    case written
    case failed
    case refused
    /// Terminal, and NOT a refusal. The row as composed can never be accepted —
    /// a dangling FK, a null in a NOT NULL column, a check the body fails, an
    /// unparseable uuid, or a column this build knows about and the deployed
    /// schema does not. Retrying spends battery to receive the same error, so
    /// the lane closes and its words stay on `…LastError`.
    case unwritable
}

/// Which post-commit lane a fact belongs to. Persisted on the specimen so a
/// lane that closed without landing leaves something a reader can name.
public enum FieldWriteLane: String, Codable, Sendable {
    case marginNote = "margin_note"
    case punchTask = "punch_task"
    case degradeNote = "degrade_note"
}

public enum FieldWriteOutcome: Equatable, Sendable {
    case written
    case alreadyWritten
    case deferred(String)
    case refused(String)
    case failed(String)
    case unsatisfiable(String)
}

public enum FieldWriteClassifier {
    /// Codes no retry can ever satisfy, so they must not enter the retry loop.
    ///
    /// `23503` the capture row this FK points at is gone · `23502` a NOT NULL
    /// column arrived null · `23514` the body fails a CHECK · `22P02` an id is
    /// not uuid text · `PGRST204` the deployed schema has no such column.
    ///
    /// `PGRST204` is the live one: 00543–00545 add `project_tasks.
    /// field_capture_id`, and a Field build shipping ahead of them takes
    /// "Could not find the 'field_capture_id' column … in the schema cache" on
    /// every attempt. As a `.failed` that is an infinite loop with no surface.
    public static let unsatisfiableCodes: Set<String> = [
        "23503", "23502", "23514", "22P02", "PGRST204"
    ]

    /// PostgREST surfaces the SQLSTATE as `code`; the SDK sometimes only gives
    /// a message. Both paths must reach the same verdict.
    ///
    /// A refusal needs the CODE or the words "row-level security". The bare
    /// substring "permission denied" is NOT enough: `permission denied for
    /// table project_tasks` is a missing GRANT — a deploy defect on every
    /// device, not a fact about this designer and this project — and closing
    /// the lane terminally on it would discard every write silently.
    public static func outcome(code: String?, message: String) -> FieldWriteOutcome {
        let lowered = message.lowercased()

        if code == "42501" || lowered.contains("row-level security") {
            return .refused(message)
        }
        if code == "23505" || lowered.contains("duplicate key") {
            return .alreadyWritten
        }
        if let code, unsatisfiableCodes.contains(code) {
            return .unsatisfiable(message)
        }
        if code == "PGRST301"
            || lowered.contains("offline")
            || lowered.contains("jwt")
            || lowered.contains("network connection was lost")
            || lowered.contains("could not connect") {
            return .deferred(message)
        }
        return .failed(message)
    }

    /// Cancellation is the app being told to stop, never a verdict on the write.
    /// A cancelled `URLSession` task surfaces as `URLError.cancelled` and a
    /// cancelled structured task as `CancellationError`; neither carries a
    /// PostgREST code or any of the words `outcome` recognises, so both land as
    /// `.failed` and SPEND AN ATTEMPT. Five interrupted launches then close a
    /// perfectly writable record at the retry ceiling. `.deferred` reopens it
    /// with no backoff and no attempt consumed.
    ///
    /// Nil for everything else, so a caller falls through to `outcome`.
    public static func cancellationOutcome(for error: Error) -> FieldWriteOutcome? {
        if error is CancellationError {
            return .deferred(error.localizedDescription)
        }
        if let urlError = error as? URLError, urlError.code == .cancelled {
            return .deferred(error.localizedDescription)
        }
        return nil
    }
}

public extension FieldWriteOutcome {
    /// The words a closed-in-error lane persists. A success carries none.
    var message: String? {
        switch self {
        case .written, .alreadyWritten: return nil
        case .deferred(let text), .refused(let text), .failed(let text),
             .unsatisfiable(let text):
            return text
        }
    }
}

public enum FieldWriteGate {
    /// The server id both lanes hang off, or nil when it does not exist yet.
    /// `hasConfirmedCaptureReceipt` is the same predicate the placement lane
    /// waits on (Specimen+Accessors.swift).
    public static func fieldCaptureID(for specimen: Specimen) -> UUID? {
        guard specimen.hasConfirmedCaptureReceipt,
              let raw = specimen.remoteId?
                  .trimmingCharacters(in: .whitespacesAndNewlines),
              !raw.isEmpty
        else { return nil }
        return UUID(uuidString: raw)
    }

    /// Ruling 1 (2026-08-24) / §6 Flow 2 step 4: a note spoken inside a PLACED
    /// visit files itself into the margin. Three conditions, all of them the
    /// ruling's own boundary and none of them a heuristic:
    ///   · the lane has never been requested — the id is the idempotency key
    ///   · the capture is on a project — FC-R6 keeps an unplaced note on Today
    ///   · there are words — a photo-only capture files nothing
    /// plus `insideVisit`, which the caller supplies because wave 3 spells a
    /// visit on `Specimen` as `visitKind`/`captureSessionID` rather than a
    /// single id, and this file must not pick one of those for the caller.
    public static func shouldAutoFileMarginNote(
        for specimen: Specimen,
        projectID: String?,
        insideVisit: Bool
    ) -> Bool {
        guard insideVisit,
              specimen.marginNoteId == nil,
              specimen.marginNoteState == nil,
              (projectID?.isEmpty == false)
        else { return false }

        let spoken = (specimen.voiceTranscript ?? specimen.voicePartialTranscript)?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return spoken?.isEmpty == false
    }

    /// The lane state an outcome lands on, as one rule both lanes read.
    ///
    /// `.alreadyWritten` MUST close the lane exactly as `.written` does.
    /// `needsMarginNote` / `needsPunchTask` hold a committed specimen in the
    /// outbox until its lane reads `.written` or `.refused`, so any other
    /// mapping re-attempts a row the server already has, on every drain,
    /// forever. `.deferred` reopens the lane with no retry penalty; `.refused`
    /// is terminal, because 42501 is a fact about who owns this project
    /// (FC-R8) rather than a transient error.
    public static func laneState(for outcome: FieldWriteOutcome) -> FieldWriteState {
        switch outcome {
        case .written, .alreadyWritten: return .written
        case .deferred:                 return .pending
        case .refused:                  return .refused
        case .failed:                   return .failed
        case .unsatisfiable:            return .unwritable
        }
    }

    /// How many `.failed` attempts a lane gets before it closes as `.unwritable`
    /// with its last error kept.
    ///
    /// `…RetryCount` was written and never read as a bound, so a `.failed` lane
    /// re-attempted on every drain forever. A classifier can only recognise the
    /// errors it was taught; this is the backstop for the ones it was not.
    public static let retryCeiling = 5

    /// FC-R8's degrade (ruling 3): a refused task becomes her own margin note.
    ///
    /// The refused task's OWN id becomes the note id. Minting a fresh one here
    /// would write another note on every replayed drain; re-using the
    /// client-minted task id keeps the same lineage, so the note lane's
    /// lookup-before-write turns a replay into `.alreadyWritten`.
    public static func degrade(
        _ request: PunchTaskWriteRequest
    ) -> (noteID: UUID, body: String) {
        (request.id, MarginNoteComposer.refusedTaskBody(
            title: request.title, context: request.description))
    }
}
