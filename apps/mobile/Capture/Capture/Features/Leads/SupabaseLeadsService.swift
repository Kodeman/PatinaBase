//  SupabaseLeadsService.swift
//  Capture · Wave L (Leads)
//
//  Real `LeadsService` — reads `public.leads` (migrations 00014, 00166, 00223)
//  via the app's shared supabase-swift client. Ports the reference
//  `ProjectsAPIClient.listOpenLeads()` (apps/mobile/Patina) SELECT + ordering
//  onto the actual schema rather than the reference's status vocabulary, which
//  is stale (see `listOpenLeads()` below). RLS ("Designers can view their
//  leads", 00014: `auth.uid() = designer_id`) does all the audience scoping —
//  no client-side role filtering here.
//
//  clientName mirrors the 00221 `people_directory` view's COALESCE chain
//  exactly: `contact_name` (designer-captured prospect) wins over the joined
//  homeowner profile's name, which wins over `contact_email`, which falls back
//  to a literal "New lead". budgetLabel/note map `budget_range`/
//  `project_description` through `LeadFormat` (see that file for the exact
//  label table, ported from apps/designer-portal/src/lib/lead-format.ts).
//
//  Room/scan attachment (v1 note): `leads.room_scan_id` exists (migration
//  00029, nullable FK -> room_scans) — verified in the schema — but the frozen
//  `FieldLead` DTO (CaptureKit/Work/LeadsService.swift) carries no field for it
//  and the `LeadsService` protocol has no method to fetch it, so a v1
//  "attachment" section cannot be surfaced without a frozen-contract change.
//  Omitted; flagged in the wave report rather than worked around.

import Foundation
import Supabase
import CaptureKit

struct SupabaseLeadsService: LeadsService {
    let client: SupabaseClient

    /// Columns for both list + detail (single row shape). `homeowner_id` is
    /// disambiguated via the `!homeowner_id` embed hint — `leads` has two FKs
    /// to `profiles` (`homeowner_id`, `designer_id`) — mirroring the exact,
    /// already-shipped hint used by `packages/supabase/src/hooks/use-leads.ts`
    /// against this same schema.
    private static let selectColumns =
        "id,contact_name,contact_email,source,status,budget_range,project_description,created_at,"
        + "homeowner:profiles!homeowner_id(full_name,display_name)"

    func listOpenLeads() async throws -> [FieldLead] {
        // Open-pipeline statuses — the `leads.status` domain (00014 comment:
        // new, viewed, contacted, accepted, declined, expired) minus the three
        // terminal outcomes. Equivalent to the 00221 `people_directory` view's
        // `status NOT IN ('accepted','declined','expired')` filter.
        //
        // Deliberately NOT the reference `ProjectsAPIClient.listOpenLeads()`
        // filter (`in.(new,reviewing,contacted)`) — `reviewing` has never
        // existed in this schema; the real value is `viewed`. See the wave
        // report for the migration evidence.
        let rows: [LeadRow] = try await client
            .from("leads")
            .select(Self.selectColumns)
            .in("status", values: ["new", "viewed", "contacted"])
            .order("created_at", ascending: false)
            .execute()
            .value
        return rows.map { $0.toFieldLead() }
    }

    func leadDetail(id: String) async throws -> FieldLead {
        let row: LeadRow = try await client
            .from("leads")
            .select(Self.selectColumns)
            .eq("id", value: id)
            .single()
            .execute()
            .value
        return row.toFieldLead()
    }
}

// MARK: - Wire row (file-scope; keys are literal PostgREST column names — the
// client's default decoder applies no key strategy, mirroring the app's other
// row models). `created_at` decodes straight to `Date`: the default
// `PostgrestClient` decoder (`JSONDecoder.supabase()`) installs a custom
// ISO-8601 date-decoding strategy, so no manual parsing is needed here.

/// The embedded `homeowner:profiles!homeowner_id(...)` resource — kept at file
/// scope (rather than nested in `LeadRow`) to satisfy the lint ratchet's
/// nesting-depth rule.
private struct LeadHomeownerRow: Decodable {
    let fullName: String?
    let displayName: String?
    enum CodingKeys: String, CodingKey {
        case fullName = "full_name"
        case displayName = "display_name"
    }
}

private struct LeadRow: Decodable {
    let id: String
    let contactName: String?
    let contactEmail: String?
    let source: String?
    let status: String
    let budgetRange: String?
    let projectDescription: String?
    let createdAt: Date
    let homeowner: LeadHomeownerRow?

    enum CodingKeys: String, CodingKey {
        case id
        case contactName = "contact_name"
        case contactEmail = "contact_email"
        case source
        case status
        case budgetRange = "budget_range"
        case projectDescription = "project_description"
        case createdAt = "created_at"
        case homeowner
    }

    func toFieldLead() -> FieldLead {
        FieldLead(
            id: id,
            clientName: LeadFormat.clientName(
                contactName: contactName,
                homeownerFullName: homeowner?.fullName,
                homeownerDisplayName: homeowner?.displayName,
                contactEmail: contactEmail
            ),
            source: source,
            status: status,
            budgetLabel: LeadFormat.budgetLabel(budgetRange),
            note: projectDescription,
            createdAt: createdAt
        )
    }
}
