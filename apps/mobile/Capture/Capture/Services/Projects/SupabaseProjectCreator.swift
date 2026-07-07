//  SupabaseProjectCreator.swift
//  Capture
//
//  Minimal seam for S2's inline "create project". Real mode inserts a row into
//  public.projects via PostgREST (RLS: "Lead designer can create projects",
//  00168 — WITH CHECK designer_id = auth.uid()) and returns the server id, so the
//  local CaptureProjectRef can carry a real remoteId instead of faking sync.
//
//  Deliberately tiny and marked for absorption: Phase 2 introduces a full
//  ProjectsService (rooms, membership, listing). Do not grow this here.

import Foundation
import Supabase
import CaptureKit

/// App-side seam so S2 stays testable and mock mode keeps its local-only path.
/// Main-actor-bound: it reads the (@MainActor) session and is only ever used from
/// SwiftUI. No cross-actor hop, so it needn't be Sendable.
@MainActor
protocol CaptureProjectCreating {
    /// Insert a project owned by the signed-in designer; returns its server id.
    func createProject(name: String) async throws -> String
}

enum ProjectCreateError: LocalizedError {
    case notAuthenticated
    var errorDescription: String? {
        switch self {
        case .notAuthenticated: return "You need to be signed in to create a project."
        }
    }
}

struct SupabaseProjectCreator: CaptureProjectCreating {
    let client: SupabaseClient
    let session: any SessionProviding

    func createProject(name: String) async throws -> String {
        guard let uid = session.userID else { throw ProjectCreateError.notAuthenticated }

        // Minimal columns: `name` (NOT NULL) + `designer_id` (the RLS check). No
        // other column on public.projects is NOT-NULL-without-default, and the
        // table has no organization_id, so nothing else is required.
        let row = NewProjectRow(name: name, designerID: uid)
        let created: CreatedProjectRow = try await client
            .from("projects")
            .insert(row)
            .select("id")
            .single()
            .execute()
            .value
        return created.id.uuidString
    }
}

// MARK: - Wire rows (file-scope; keys are literal column names — the PostgREST
// encoder/decoder apply no key strategy, mirroring the app's other row models)

private struct NewProjectRow: Encodable {
    let name: String
    let designerID: String
    enum CodingKeys: String, CodingKey {
        case name
        case designerID = "designer_id"
    }
}

private struct CreatedProjectRow: Decodable {
    let id: UUID
}
