//  SupabaseFieldHoursService.swift
//  Capture
//
//  The read half of Field's hours (plan-v2 §7, W6): "My hours this week" on the
//  Work screen, and the roster roles that decide whether LogTimeSheet shows a
//  role chip (HT-41).
//
//  ⚠ OWN SCOPE ONLY (MOB-8). `.eq("user_id", me)` is not a convenience here and
//  is not to be lifted "for the owner": this is a one-handed, camera-first
//  screen handed to trades, and the studio's dollars belong on the desk's scope
//  lens (W2), which is admin-gated and sits above the rows that produced it.
//  RLS would permit a studio co-member to read more; the surface chooses not to.

import Foundation
import Supabase
import CaptureKit

private enum FieldHoursError: LocalizedError {
    case noAccount

    var errorDescription: String? {
        switch self {
        case .noAccount: return "Sign in to see your hours."
        }
    }
}

struct SupabaseFieldHoursService: FieldHoursService {
    let client: SupabaseClient
    let session: any SessionProviding

    func myHours(since: Date) async throws -> [FieldHourRow] {
        guard let userID = await session.userID?
            .trimmingCharacters(in: .whitespacesAndNewlines), !userID.isEmpty
        else { throw FieldHoursError.noAccount }

        let rows: [HourRow] = try await client
            .from("project_time_entries")
            .select("id, started_at, duration_minutes, activity, billable, "
                + "billing_state, rate_source, project:projects(name)")
            .eq("user_id", value: userID)
            .gte("started_at", value: ISO8601DateFormatter().string(from: since))
            // A running desk timer has no duration and is not hers to report
            // on here (HT-7 — that slot belongs to the desk). NULL fails a
            // comparison, so this also excludes it — one filter, not two.
            .gte("duration_minutes", value: 1)
            .order("started_at", ascending: false)
            .limit(60)
            .execute()
            .value

        return rows.compactMap(\.field)
    }

    /// HT-41. The project's OWN designer is fixed at `lead_designer` above any
    /// pick (00599/00601), so she never gets a chip whatever seats she also
    /// holds — the same short-circuit `useMyRateRoles` makes on the desk, so the
    /// two surfaces cannot disagree about who is asked.
    func myRateRoles(projectID: String) async throws -> [FieldRateRole] {
        guard let userID = await session.userID?
            .trimmingCharacters(in: .whitespacesAndNewlines), !userID.isEmpty
        else { throw FieldHoursError.noAccount }

        let owners: [DesignerRow] = try await client
            .from("projects")
            .select("designer_id")
            .eq("id", value: projectID)
            .limit(1)
            .execute()
            .value
        if owners.first?.designerID == userID { return [.leadDesigner] }

        let seats: [RoleRow] = try await client
            .from("project_team_members")
            .select("role")
            .eq("project_id", value: projectID)
            .eq("user_id", value: userID)
            .is("removed_at", value: nil)
            .execute()
            .value

        let held = Set(seats.map(\.role))
        return FieldRateRole.allCases.filter { held.contains($0.rawValue) }
    }
}

// MARK: - Wire rows

private struct DesignerRow: Decodable {
    let designerID: String?
    enum CodingKeys: String, CodingKey { case designerID = "designer_id" }
}

private struct RoleRow: Decodable {
    let role: String
}

private struct HourRow: Decodable {
    let id: String
    let startedAt: String?
    let durationMinutes: Int?
    let activity: String?
    let billable: Bool?
    let billingState: String?
    let rateSource: String?
    let project: ProjectNameRow?

    struct ProjectNameRow: Decodable { let name: String? }

    enum CodingKeys: String, CodingKey {
        case id
        case startedAt = "started_at"
        case durationMinutes = "duration_minutes"
        case activity
        case billable
        case billingState = "billing_state"
        case rateSource = "rate_source"
        case project
    }

    /// nil rather than a zero-minute placeholder: a row this phone cannot read
    /// honestly is a row it does not show. `project_time_entries.id` is a uuid
    /// and `started_at` is NOT NULL, so neither guard fires in practice — they
    /// exist so a shape change is an absence, not a lie.
    var field: FieldHourRow? {
        guard let uuid = UUID(uuidString: id),
              let startedAt = FieldHoursWireDate.parse(startedAt)
        else { return nil }
        return FieldHourRow(
            id: uuid,
            startedAt: startedAt,
            projectName: project?.name,
            minutes: durationMinutes ?? 0,
            activity: activity.flatMap(FieldTimeActivity.init(rawValue:)),
            billable: billable ?? false,
            billingState: billingState,
            rateSource: rateSource)
    }
}

/// TIMESTAMPTZ arrives with or without fractional seconds depending on the
/// column's precision, and the SDK's built-in Date decoding rejects one of the
/// two. Same reason `ProjectsWireDate` exists; kept local rather than reaching
/// across a feature boundary for it.
private enum FieldHoursWireDate {
    private static let isoFractional: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    private static let isoPlain = ISO8601DateFormatter()

    static func parse(_ raw: String?) -> Date? {
        guard let raw, !raw.isEmpty else { return nil }
        return isoFractional.date(from: raw) ?? isoPlain.date(from: raw)
    }
}
