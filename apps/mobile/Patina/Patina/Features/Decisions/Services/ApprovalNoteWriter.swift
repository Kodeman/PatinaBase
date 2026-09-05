//
//  ApprovalNoteWriter.swift
//  Patina
//
//  `P-16` / `R10`. Where a homeowner's note about a RETURNED edition lands.
//
//  On the approval itself — `decision_comments`, keyed by `decision_id` —
//  because that is where the web puts it
//  (`packages/supabase/src/hooks/use-decisions.ts:991`, the insert behind
//  `useCreateDecisionComment`) and where a designer reading the approval will
//  look for it. 00467:256 admits the person being asked:
//
//    WITH CHECK (author_id = auth.uid()
//                AND app_private.is_decision_comment_client(decision_id))
//
//  and for a `project_artifact_v1` row that resolver accepts the authority
//  snapshot's `decision_lead_id` (00467:215), which is the project's own
//  client (00463:392). So the note the homeowner writes reaches the row the
//  outcome was recorded against.
//
//  The project conversation is the FALLBACK, not the rail: half the notes in
//  a chat thread and half on the approval is a designer reading two places
//  for one answer. A note that reached neither is what `noteFailure` says out
//  loud, beside a recorded outcome — never as a failed submit.
//

import Foundation
import Supabase

enum ApprovalNoteWriter {

    /// No signed-in actor to author the comment as. Distinct from a network
    /// failure so the fallback can tell them apart.
    struct NoAuthor: Error {}
    /// Neither door was open — nowhere at all for the note to go.
    struct NoRoute: Error {}

    /// Send the note, approval first.
    ///
    /// - Returns: the thread the note landed in when it fell back to the
    ///   project conversation, and `nil` when it landed on the approval — so
    ///   the caller only moves "Discuss this" to a thread the note is in.
    static func send(
        decisionId: String?,
        route: DecisionDetailViewModel.MessageRoute?,
        body: String
    ) async throws -> String? {
        if let decisionId, !decisionId.isEmpty {
            do {
                try await post(decisionId: decisionId, body: body)
                return nil
            } catch {
                guard route != nil else { throw error }
                PatinaLog.sync.debug(
                    "ApprovalNoteWriter: comment refused, trying the conversation — "
                        + error.localizedDescription
                )
            }
        }
        guard let route else { throw NoRoute() }
        let threadId: String
        switch route {
        case .project(let id):
            threadId = try await MessagingAPIClient.shared.createThread(projectId: id)
        case .direct(let id):
            threadId = try await MessagingAPIClient.shared.createDirectThread(counterpart: id)
        }
        _ = try await MessagingAPIClient.shared.sendMessage(threadId: threadId, body: body)
        return threadId
    }

    private static func post(decisionId: String, body: String) async throws {
        guard let authorId = await AuthService.shared.currentUserId else { throw NoAuthor() }
        try await supabase.database
            .from("decision_comments")
            .insert(ApprovalNoteRow(decisionId: decisionId, authorId: authorId, body: body))
            .execute()
    }
}

/// The row `ApprovalNoteWriter` writes. Explicit shape rather than a
/// dictionary literal: the three columns are `decision_comments`' own
/// (00091:5-12), and `author_id` is bound to the JWT actor by the policy in
/// this file's header, so a wrong or missing one is a refusal rather than a
/// mislabelled row.
///
/// File scope, not nested: `CodingKeys` inside a type inside the enum is
/// three levels deep and SwiftLint's `nesting` rule refuses it.
private struct ApprovalNoteRow: Encodable {
    let decisionId: String
    let authorId: String
    let body: String

    enum CodingKeys: String, CodingKey {
        case decisionId = "decision_id"
        case authorId = "author_id"
        case body
    }
}
