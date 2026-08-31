//  MarginNoteWrite.swift
//  CaptureKit
//
//  Pure-Swift contract for promoting a field note into the Document's margin
//  (§9.4, FC-R4). The app-side Supabase gateway owns the SDK call; this file
//  owns the column names, the composition rule and the replay-safe orchestration.
//
//  A note spoken inside a PLACED visit files itself: §6 Flow 2 step 4 is
//  binding (orchestrator ruling, 2026-08-24), and §11.4's "only the notes she
//  promoted" alternative is overruled. There is no tap. A deliberate act is
//  required only for filing an UNPLACED note from Today (FC-R6) — and that case
//  is enforced here by construction, because `request` needs a projectID and an
//  unplaced capture has none.
//
//  Idempotency is the whole reason this is safe to do automatically: the id is
//  minted once on the phone and persisted, so a second drain finds it already
//  set, re-uses it, and the gateway's lookup-before-write turns the replay into
//  `.alreadyWritten`.

import Foundation

public struct MarginNoteWriteRequest: Encodable, Equatable, Sendable {
    public let id: UUID
    public let projectID: UUID
    public let designerID: UUID
    public let body: String
    public let anchorKind: String
    public let fieldCaptureID: UUID

    public init(
        id: UUID,
        projectID: UUID,
        designerID: UUID,
        body: String,
        anchorKind: String = "letterhead",
        fieldCaptureID: UUID
    ) {
        self.id = id
        self.projectID = projectID
        self.designerID = designerID
        self.body = body
        self.anchorKind = anchorKind
        self.fieldCaptureID = fieldCaptureID
    }

    enum CodingKeys: String, CodingKey {
        case id
        case body
        case projectID = "project_id"
        case designerID = "designer_id"
        case anchorKind = "anchor_kind"
        case fieldCaptureID = "field_capture_id"
    }
}

public enum MarginNoteComposer {
    /// Returns nil when there are no words to file. `margin_notes.body` is
    /// NOT NULL (00196:30) and a blank note in the margin is worse than none.
    /// The body is trimmed and NEVER truncated — the whole point of §9.4 is
    /// that the Document stops receiving the first eighty characters.
    public static func request(
        noteID: UUID,
        projectID: UUID,
        designerID: UUID,
        fieldCaptureID: UUID,
        transcript: String?
    ) -> MarginNoteWriteRequest? {
        let body = (transcript ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !body.isEmpty else { return nil }

        return MarginNoteWriteRequest(
            id: noteID,
            projectID: projectID,
            designerID: designerID,
            body: body,
            fieldCaptureID: fieldCaptureID)
    }

    /// FC-R8's degrade, composed here so the drain has something real to write
    /// (orchestrator ruling 3, 2026-08-24). A studio co-member's punch/task
    /// INSERT takes 42501 and is terminal; the item becomes her own margin
    /// note — which margin_notes_designer_all DOES admit, because that policy
    /// keys on the note's designer_id, not the project's.
    ///
    /// The body is the task as she wrote it, then its context, then one plain
    /// line saying why it did not become a task. No mechanism talk, no code.
    public static func refusedTaskBody(title: String, context: String?) -> String {
        let head = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let ctx = (context ?? "").trimmingCharacters(in: .whitespacesAndNewlines)

        var lines: [String] = []
        if !head.isEmpty { lines.append(head) }
        if !ctx.isEmpty, ctx != head { lines.append(ctx) }
        lines.append("Couldn't assign — you're not this project's owner.")
        return lines.joined(separator: "\n")
    }
}

public protocol MarginNoteGateway: Sendable {
    /// True when a note with this client-minted id already landed. Closes the
    /// response-loss gap one round-trip before the primary key does.
    func existingMarginNote(id: UUID) async throws -> Bool
    func insertMarginNote(_ request: MarginNoteWriteRequest) async throws
}

public struct MarginNoteOrchestrator: Sendable {
    private let gateway: any MarginNoteGateway

    public init(gateway: any MarginNoteGateway) {
        self.gateway = gateway
    }

    public func write(_ request: MarginNoteWriteRequest) async throws -> FieldWriteOutcome {
        if try await gateway.existingMarginNote(id: request.id) {
            return .alreadyWritten
        }
        try await gateway.insertMarginNote(request)
        return .written
    }
}
