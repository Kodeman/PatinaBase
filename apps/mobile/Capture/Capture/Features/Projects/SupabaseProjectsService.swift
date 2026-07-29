//  SupabaseProjectsService.swift
//  Capture · Wave P (Projects)
//
//  The real `ProjectsService`: PostgREST reads against the app's single
//  authenticated supabase-swift client. All audience scoping is RLS
//  (00168 "Project participants can view projects": designer_id = auth.uid()
//  OR client_id = auth.uid() OR is_project_team_member(id)) — no client-side
//  role filtering. Mirrors the reference `ProjectsAPIClient` queries
//  (apps/mobile/Patina — listProjects/listPhases/listMilestones/listFFEItems),
//  with two upgrades taken from the designer-portal hooks where the reference
//  client under-fetches:
//    • client display name — embed `client:profiles!projects_client_id_fkey
//      (full_name, display_name)` exactly as `use-project-v2.ts` does
//      (profiles SELECT RLS is `USING (true)`, 00013 — readable);
//    • FF&E room label — embed `room:project_rooms!project_room_id(name)`
//      exactly as `useProjectFFEItems` does (00066: project_ffe_items.
//      project_room_id → project_rooms.name).
//
//  TWO DIFFERENT room tables feed the detail — don't conflate them:
//    • `FieldFFEItem.roomName`   ← `project_rooms` (00066) — scope rooms the
//      project was activated with; pure display labels for grouping FF&E.
//    • `FieldProjectDetail.rooms` ← `public.rooms` (00019) — the CLIENT's
//      actual physical rooms (projects.client_id → rooms.user_id), readable
//      by the designer via the "Designers can view client rooms" policy
//      (designer_clients join). These ids are what `room_scans.room_id`
//      accepts — the F-team site-scan flow consumes them.

import Foundation
import Supabase
import CaptureKit

private enum ProjectsOwnerError: LocalizedError {
    case unavailable
    case changed

    var errorDescription: String? {
        switch self {
        case .unavailable:
            return "Choose a workspace before loading projects."
        case .changed:
            return "Your account or workspace changed while projects were loading."
        }
    }
}

struct SupabaseProjectsService: ProjectsService {
    let client: SupabaseClient
    let session: any SessionProviding

    // MARK: ProjectsService

    /// `GET /rest/v1/projects?select=id,name,status,current_phase,updated_at,
    /// client:profiles!projects_client_id_fkey(full_name,display_name)
    /// &order=updated_at.desc.nullslast` — RLS-scoped, most-recent first
    /// (reference: ProjectsAPIClient.listProjects orders updated_at.desc).
    func listProjects() async throws -> [FieldProject] {
        guard let owner = await session.ownerIdentity else {
            throw ProjectsOwnerError.unavailable
        }

        let rows: [ProjectRow] = try await client
            .from("projects")
            .select("id, name, status, current_phase, updated_at, "
                + "client:profiles!projects_client_id_fkey(full_name, display_name)")
            .eq("studio_id", value: owner.workspaceID)
            .order("updated_at", ascending: false)
            .execute()
            .value

        guard await session.ownerIdentity == owner else {
            throw ProjectsOwnerError.changed
        }
        return rows.map { $0.field }
    }

    /// One project + its phases, milestones, FF&E, and client rooms. The
    /// project row is fetched first (the rooms query needs its `client_id`);
    /// the four collections then load in parallel.
    func projectDetail(id: String) async throws -> FieldProjectDetail {
        guard let owner = await session.ownerIdentity else {
            throw ProjectsOwnerError.unavailable
        }

        let row: ProjectRow = try await client
            .from("projects")
            .select("id, name, status, current_phase, updated_at, client_id, "
                + "client:profiles!projects_client_id_fkey(full_name, display_name)")
            .eq("id", value: id)
            .eq("studio_id", value: owner.workspaceID)
            .single()
            .execute()
            .value

        guard await session.ownerIdentity == owner else {
            throw ProjectsOwnerError.changed
        }

        async let phases = fetchPhases(projectID: id)
        async let milestones = fetchMilestones(projectID: id)
        async let ffeItems = fetchFFEItems(projectID: id)
        async let rooms = fetchClientRooms(clientID: row.clientID)

        let detail = try await FieldProjectDetail(
            project: row.field,
            phases: phases,
            milestones: milestones,
            ffeItems: ffeItems,
            rooms: rooms
        )

        guard await session.ownerIdentity == owner else {
            throw ProjectsOwnerError.changed
        }
        return detail
    }

    // MARK: Detail collections

    /// `project_phases?select=id,name,phase_key,status,sort_order&project_id=
    /// eq.<id>&order=sort_order.asc.nullslast,start_date.asc.nullslast` —
    /// column set trimmed to the DTO; order mirrors the reference listPhases.
    /// RLS: "Designers manage their project phases" / client-view (00066).
    private func fetchPhases(projectID: String) async throws -> [FieldProjectPhase] {
        let rows: [PhaseRow] = try await client
            .from("project_phases")
            .select("id, name, phase_key, status, sort_order")
            .eq("project_id", value: projectID)
            .order("sort_order", ascending: true)
            .order("start_date", ascending: true)
            .execute()
            .value
        return rows.map { $0.field }
    }

    /// `project_payment_milestones?select=id,label,amount_cents,status,
    /// due_date&project_id=eq.<id>&order=due_date.asc.nullslast` — order
    /// mirrors the reference listMilestones. NOTE the column is `label`
    /// (00066 4D); the reference DTO decodes a nonexistent `title` —
    /// migrations win. RLS: designer-manage / client-view (00066).
    private func fetchMilestones(projectID: String) async throws -> [FieldMilestone] {
        let rows: [MilestoneRow] = try await client
            .from("project_payment_milestones")
            .select("id, label, amount_cents, status, due_date")
            .eq("project_id", value: projectID)
            .order("due_date", ascending: true)
            .execute()
            .value
        return rows.map { $0.field }
    }

    /// `project_ffe_items?select=id,name,status,room:project_rooms!
    /// project_room_id(name)&project_id=eq.<id>&order=sort_order.asc.nullslast`
    /// — room label via the `project_rooms` embed (00066 source #1 above; the
    /// portal's useProjectFFEItems uses the same FK hint). Ordered by
    /// sort_order like the portal (the reference iOS client orders by
    /// category, which we don't render). RLS: designer-manage / client-view.
    private func fetchFFEItems(projectID: String) async throws -> [FieldFFEItem] {
        let rows: [FFEItemRow] = try await client
            .from("project_ffe_items")
            .select("id, name, status, room:project_rooms!project_room_id(name)")
            .eq("project_id", value: projectID)
            .order("sort_order", ascending: true)
            .execute()
            .value
        return rows.map { $0.field }
    }

    /// `rooms?select=id,name&user_id=eq.<client_id>&order=created_at.desc` —
    /// the client's actual `public.rooms` (source #2 above), readable by the
    /// designer through "Designers can view client rooms" (00019:
    /// designer_clients.designer_id = auth.uid() AND …client_id =
    /// rooms.user_id) and by the client-as-owner. Order mirrors the portal's
    /// useClientRooms. A project with no client (field-created draft) has no
    /// rooms to list — return [] without a query.
    private func fetchClientRooms(clientID: String?) async throws -> [FieldProjectRoom] {
        guard let clientID else { return [] }
        let rows: [RoomRow] = try await client
            .from("rooms")
            .select("id, name")
            .eq("user_id", value: clientID)
            .order("created_at", ascending: false)
            .execute()
            .value
        return rows.map { FieldProjectRoom(id: $0.id, name: $0.name) }
    }
}

// MARK: - Timestamp parsing (shared decoder for this file's wire rows)
//
// The DTO boundary carries `Date?`; the wire carries strings in two shapes:
//   • TIMESTAMPTZ (projects.updated_at) — ISO-8601, usually with fractional
//     seconds ("2026-06-14T16:20:00.123456+00:00");
//   • DATE (project_payment_milestones.due_date) — bare "2026-06-20".
// The SDK's built-in Date decoding rejects the bare-DATE shape, so wire rows
// decode String? and map through here (brief: "shared decoder in your file").

enum ProjectsWireDate {
    private static let isoFractional: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    private static let isoPlain = ISO8601DateFormatter()

    /// Bare `DATE` columns. POSIX locale + UTC so device settings can't skew
    /// parsing; a due *date* has no meaningful wall-clock time.
    private static let dateOnly: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "UTC")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()

    static func parse(_ raw: String?) -> Date? {
        guard let raw, !raw.isEmpty else { return nil }
        return isoFractional.date(from: raw)
            ?? isoPlain.date(from: raw)
            ?? dateOnly.date(from: raw)
    }
}

// MARK: - Wire rows (file-scope; explicit CodingKeys naming literal PostgREST
// columns — the SDK decoder applies no key strategy, mirroring
// SupabaseProjectCreator's row models)

/// Embedded `profiles` row for the client display name. The portal resolves
/// names as `full_name` with `display_name` fallback (00016 backfilled
/// full_name FROM display_name); nil when the profile has neither.
private struct ClientNameRow: Decodable {
    let fullName: String?
    let displayName: String?

    enum CodingKeys: String, CodingKey {
        case fullName = "full_name"
        case displayName = "display_name"
    }

    var resolved: String? { fullName ?? displayName }
}

private struct ProjectRow: Decodable {
    let id: String
    let name: String
    /// `project_status` enum, DEFAULT 'active' but NULLable (00001).
    let status: String?
    /// `phase_key` of the running phase (00066), e.g. "design_development".
    let currentPhase: String?
    let updatedAt: String?
    /// Only requested by the detail SELECT (drives the rooms query).
    let clientID: String?
    let client: ClientNameRow?

    enum CodingKeys: String, CodingKey {
        case id
        case name
        case status
        case currentPhase = "current_phase"
        case updatedAt = "updated_at"
        case clientID = "client_id"
        case client
    }

    var field: FieldProject {
        FieldProject(
            id: id,
            name: name,
            status: status ?? "",
            clientName: client?.resolved,
            phaseLabel: currentPhase.map(ProjectsFormat.humanize),
            updatedAt: ProjectsWireDate.parse(updatedAt)
        )
    }
}

private struct PhaseRow: Decodable {
    let id: String
    /// NOT NULL in 00066, but the reference DTO treats it as optional —
    /// tolerate and fall back to the humanized phase_key.
    let name: String?
    let phaseKey: String?
    /// CHECK: pending | in_progress | completed | delayed (00066).
    let status: String
    let sortOrder: Int?

    enum CodingKeys: String, CodingKey {
        case id
        case name
        case phaseKey = "phase_key"
        case status
        case sortOrder = "sort_order"
    }

    var field: FieldProjectPhase {
        FieldProjectPhase(
            id: id,
            name: name ?? phaseKey.map(ProjectsFormat.humanize) ?? "Phase",
            status: status,
            sortOrder: sortOrder ?? 0
        )
    }
}

private struct MilestoneRow: Decodable {
    let id: String
    let label: String
    let amountCents: Int?
    /// CHECK: pending | outstanding | paid (00066).
    let status: String
    /// DATE column — bare "yyyy-MM-dd".
    let dueDate: String?

    enum CodingKeys: String, CodingKey {
        case id
        case label
        case amountCents = "amount_cents"
        case status
        case dueDate = "due_date"
    }

    var field: FieldMilestone {
        FieldMilestone(
            id: id,
            label: label,
            amountCents: amountCents,
            dueDate: ProjectsWireDate.parse(dueDate),
            status: status
        )
    }
}

private struct FFEItemRow: Decodable {
    let id: String
    let name: String
    /// CHECK: specified | quoted | approved | ordered | production | shipped
    /// | delivered | installed (00066).
    let status: String
    let room: FFERoomRow?

    enum CodingKeys: String, CodingKey {
        case id
        case name
        case status
        case room
    }

    var field: FieldFFEItem {
        FieldFFEItem(id: id, name: name, status: status, roomName: room?.name)
    }
}

/// Embedded `project_rooms(name)` — display label only (room source #1).
private struct FFERoomRow: Decodable {
    let name: String

    enum CodingKeys: String, CodingKey {
        case name
    }
}

/// `public.rooms` row (room source #2 — scan-target rooms).
private struct RoomRow: Decodable {
    let id: String
    let name: String

    enum CodingKeys: String, CodingKey {
        case id
        case name
    }
}
