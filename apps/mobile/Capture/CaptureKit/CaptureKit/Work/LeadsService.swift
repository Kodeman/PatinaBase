//  LeadsService.swift
//  CaptureKit
//
//  L1/L2 seam — open leads visible to the designer, and one lead's detail. PURE
//  Foundation (no SDK): the app's concrete maps the reference `ProjectsAPIClient`
//  `leads` rows into `FieldLead`; the mock returns fixtures. Wave L builds the
//  screens against this.
//
//  DTO shaping (from ProjectsAPIClient.listOpenLeads SELECT, trimmed):
//  `clientName` has no name column on `leads` (only `homeowner_id`) — it is a
//  resolved display string the concrete fills. `source` maps to `leads.source`
//  (migration 00223). `budgetLabel` ← budget_range, `note` ← project_description.

import Foundation

/// A lead for the L1 list / L2 detail.
public struct FieldLead: Identifiable, Sendable, Codable {
    public let id: String
    /// Resolved homeowner display name (concrete joins `homeowner_id` → profile).
    public let clientName: String
    /// Where the lead came from (`leads.source`, 00223).
    public let source: String?
    public let status: String
    /// Human label for `leads.budget_range`.
    public let budgetLabel: String?
    /// The homeowner's `project_description`.
    public let note: String?
    public let createdAt: Date?

    public init(id: String, clientName: String, source: String? = nil, status: String,
                budgetLabel: String? = nil, note: String? = nil, createdAt: Date? = nil) {
        self.id = id
        self.clientName = clientName
        self.source = source
        self.status = status
        self.budgetLabel = budgetLabel
        self.note = note
        self.createdAt = createdAt
    }
}

public protocol LeadsService: Sendable {
    /// Open leads (status in new/reviewing/contacted), newest first.
    func listOpenLeads() async throws -> [FieldLead]
    func leadDetail(id: String) async throws -> FieldLead
}
