//  SupabaseFieldWriteGateway.swift
//  Capture
//
//  FC-R4's two direct writes. Plain table inserts, not RPCs:
//    · margin_notes  — margin_notes_designer_all is
//      `for all to authenticated using (designer_id = auth.uid())
//       with check (designer_id = auth.uid())` (00196:51-54). The author IS
//      the designer, so the policy already contemplates exactly this writer.
//    · project_tasks — "Designers manage their project tasks" (00169:61-62) is
//      a FOR ALL policy with no explicit WITH CHECK, so Postgres reuses its
//      USING clause: projects.designer_id = auth.uid(). A studio co-member
//      gets 42501 and the caller degrades (FC-R8).
//
//  Both inserts carry a client-minted id, which is the idempotency key: a
//  replay after a lost response collides on the primary key (23505) and the
//  orchestrator reads that as "already written". The `existing…` probes close
//  the same gap one round-trip earlier.

import Foundation
import CaptureKit
import Supabase

final class SupabaseFieldWriteGateway: MarginNoteGateway, PunchTaskGateway, @unchecked Sendable {
    private let client: SupabaseClient

    init(client: SupabaseClient) {
        self.client = client
    }

    /// PostgREST surfaces the SQLSTATE here; every other error carries no code
    /// and falls through to FieldWriteClassifier's message reading. Static and
    /// app-side because the SDK error type stops at this seam — the drain that
    /// classifies the failure never imports Supabase.
    static func postgrestCode(from error: Error) -> String? {
        (error as? PostgrestError)?.code
    }

    // MARK: - MarginNoteGateway

    func existingMarginNote(id: UUID) async throws -> Bool {
        try await rowExists(table: "margin_notes", id: id)
    }

    func insertMarginNote(_ request: MarginNoteWriteRequest) async throws {
        try await client.from("margin_notes").insert(request).execute()
    }

    // MARK: - PunchTaskGateway

    func existingProjectTask(id: UUID) async throws -> Bool {
        try await rowExists(table: "project_tasks", id: id)
    }

    func insertProjectTask(_ request: PunchTaskWriteRequest) async throws {
        try await client.from("project_tasks").insert(request).execute()
    }

    // MARK: -

    private struct IDRow: Decodable { let id: String }

    private func rowExists(table: String, id: UUID) async throws -> Bool {
        let rows: [IDRow] = try await client
            .from(table)
            .select("id")
            .eq("id", value: id.uuidString)
            .limit(1)
            .execute()
            .value
        return !rows.isEmpty
    }
}
