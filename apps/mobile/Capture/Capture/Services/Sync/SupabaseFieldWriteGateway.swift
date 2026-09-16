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

final class SupabaseFieldWriteGateway: MarginNoteGateway, PunchTaskGateway,
                                       TimeEntryGateway, @unchecked Sendable {
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

    // MARK: - TimeEntryGateway

    /// Both hour lanes — the visit close's entry (FC-R3) and LogTimeSheet's
    /// drive. Always a COMPLETED entry: duration_minutes IS NULL is reserved
    /// for the designer's one running desk timer
    /// (uniq_project_time_entries_running_timer, 00177:39-41), it stays with
    /// the desk in v1 (HT-7), and neither TimeEntryWriteRequest nor `log_time`
    /// can express a nil duration.
    func existingTimeEntry(id: UUID) async throws -> Bool {
        try await rowExists(table: "project_time_entries", id: id)
    }

    /// `log_time` (00608), not a table insert — the third write on this phone
    /// that is an RPC rather than a `from(...).insert(...)`, and the first with
    /// a reason the other two do not have.
    ///
    /// The id is client-minted, and the RPC is `ON CONFLICT (id) DO NOTHING`
    /// followed by a read-back of the row already standing under it. A plain
    /// insert has neither half: a replayed drain either logs her hour twice or
    /// returns 23505, which the classifier can only read as a failure. It also
    /// carries the two things the table write could not — `p_billable`, which
    /// 00608 RAISES on when absent (HT-11), and `p_rate_role` (HT-41) — and
    /// deliberately carries no rate: the server has owned `hourly_rate_cents`
    /// on every branch since W1 (00601).
    func insertTimeEntry(_ request: TimeEntryWriteRequest) async throws {
        try await client.rpc("log_time", params: request).execute()
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
