//
//  ApprovalDiscussion.swift
//  Patina
//
//  `IOSC-R2-01`. The notes ON an approval, read back.
//
//  `ApprovalNoteWriter` puts a homeowner's change note on the approval itself
//  — `decision_comments`, the row the web writes and reads — which is right
//  for the designer and, on its own, made the note invisible to the person who
//  wrote it: iOS held exactly one `decision_comments` statement, an INSERT,
//  and no SELECT anywhere. Her sentence disappeared the instant she sent it,
//  and "Discuss this with your designer" opens the project thread, which is
//  deliberately NOT where the note went.
//
//  So this is the read the write was missing. The same rail as the web's
//  `Discussion` (`approval-ask.tsx`), which mounts `useDecisionComments` over
//  the same table with the same filter and the same order.
//
//  It is a read and nothing else. The change-note composer above the three
//  doors is the one place a note is written on this surface; a second field
//  down here would be a second rail into the same table, which is the defect
//  `IOSC-02` closed.
//
//  RLS admits her: 00467:248 grants SELECT to any `authenticated` caller
//  `app_private.is_decision_comment_client` accepts, which for a
//  `project_artifact_v1` row resolves the authority snapshot's
//  `decision_lead_id` — the homeowner being asked.
//

import Foundation
import Observation
import Supabase

/// One note on an approval. Four of the table's columns
/// (00091:5-12); the rest are the studio's own bookkeeping and are not
/// decoded, because `JSONDecoder` ignores what it is not asked for.
struct ApprovalComment: Identifiable, Decodable, Equatable, Sendable {
    let id: String
    let authorId: String
    let body: String
    let createdAt: String

    enum CodingKeys: String, CodingKey {
        case id
        case authorId = "author_id"
        case body
        case createdAt = "created_at"
    }
}

/// The discussion under one approval: what is written there, and who is
/// reading it.
///
/// Its own small model rather than three more stored properties on
/// `DecisionDetailViewModel`: that class's file is within five lines of
/// SwiftLint's `file_length`, and a screen-local read with a screen-local
/// lifetime does not need to outlive the view that draws it.
@Observable
@MainActor
final class ApprovalDiscussion {

    private(set) var comments: [ApprovalComment] = []

    /// The read was attempted and refused. Distinct from "there is nothing
    /// here": an empty thread is drawn as silence, and a thread that could not
    /// be read says so, because the alternative is telling a homeowner her
    /// note is gone.
    private(set) var isUnreadable = false

    /// Who "You" is. Read at load time rather than held, so an account switch
    /// cannot leave a previous reader's id attributing the rows.
    private(set) var viewerId: String?

    /// The read, behind a seam — same reason as every other one on this rail:
    /// the singleton's network call is not reachable from a test.
    @ObservationIgnored
    var fetch: (String) async throws -> [ApprovalComment] = { decisionId in
        try await ApprovalDiscussion.read(decisionId: decisionId)
    }

    /// Read the notes on this approval, oldest first — the order the web
    /// renders and the order a conversation is read in.
    ///
    /// A failure keeps whatever was already on screen. Comments that loaded
    /// once do not vanish because a later refresh lost the network.
    func load(decisionId: String?) async {
        guard let decisionId, !decisionId.isEmpty else {
            comments = []
            isUnreadable = false
            return
        }
        viewerId = AuthService.shared.currentUserId
        do {
            comments = try await fetch(decisionId)
            isUnreadable = false
        } catch {
            MoneyFailureCopy.log("project approval discussion", error)
            isUnreadable = true
        }
    }

    /// Whether this row is hers.
    func isMine(_ comment: ApprovalComment) -> Bool {
        Self.isMine(comment, viewerId: viewerId)
    }

    /// The judgement itself, as a value. An unknown viewer is never claimed as
    /// her: the note is attributed to the studio rather than mislabelled
    /// "You", because putting her name on the studio's sentence is worse than
    /// putting the studio's on hers. Ids are compared case-insensitively —
    /// `RoomsAPIClient` already lowercases the JWT subject before matching it.
    static func isMine(_ comment: ApprovalComment, viewerId: String?) -> Bool {
        guard let viewerId, !viewerId.isEmpty else { return false }
        return comment.authorId.caseInsensitiveCompare(viewerId) == .orderedSame
    }

    /// `nonisolated`: the read is the network, and the network has no reason
    /// to run on the main actor — the same shape `ApprovalNoteWriter.post`
    /// takes for the write.
    nonisolated static func read(decisionId: String) async throws -> [ApprovalComment] {
        try await supabase.database
            .from("decision_comments")
            .select("id,author_id,body,created_at")
            .eq("decision_id", value: decisionId)
            .order("created_at", ascending: true)
            .execute()
            .value
    }
}
