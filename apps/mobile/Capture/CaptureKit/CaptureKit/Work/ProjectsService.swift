//  ProjectsService.swift
//  CaptureKit
//
//  P1/P2 seam — read the designer's projects and one project's detail (phases,
//  milestones, FF&E, rooms). PURE Foundation (no SDK): the app's concrete maps
//  the reference `ProjectsAPIClient` wire rows (projects / project_phases /
//  project_payment_milestones / project_ffe_items / rooms) into these Field DTOs;
//  the mock returns fixtures. Wave P (Projects) builds the screens against this.
//
//  DTO shaping (from ProjectsAPIClient SELECTs, trimmed to what P1/P2 render):
//  timestamps are `Date` (service→screen boundary, not a wire contract — the real
//  client parses ISO8601). `clientName` and `roomName` have no direct column in
//  the reference SELECTs (only `client_id`, and FF&E has no room join) — they are
//  resolved display strings the concrete fills via a join.

import Foundation

/// A project row for the P1 list.
public struct FieldProject: Identifiable, Sendable, Codable {
    public let id: String
    public let name: String
    public let status: String
    /// Resolved client display name (concrete joins `client_id` → profile).
    public let clientName: String?
    /// Human label for `projects.current_phase`.
    public let phaseLabel: String?
    public let updatedAt: Date?

    public init(id: String, name: String, status: String,
                clientName: String? = nil, phaseLabel: String? = nil, updatedAt: Date? = nil) {
        self.id = id
        self.name = name
        self.status = status
        self.clientName = clientName
        self.phaseLabel = phaseLabel
        self.updatedAt = updatedAt
    }
}

/// A phase row (from `project_phases`).
public struct FieldProjectPhase: Identifiable, Sendable, Codable {
    public let id: String
    public let name: String
    public let status: String
    public let sortOrder: Int

    public init(id: String, name: String, status: String, sortOrder: Int) {
        self.id = id
        self.name = name
        self.status = status
        self.sortOrder = sortOrder
    }
}

/// A payment milestone (from `project_payment_milestones`).
public struct FieldMilestone: Identifiable, Sendable, Codable {
    public let id: String
    public let label: String
    public let amountCents: Int?
    public let dueDate: Date?
    public let status: String

    public init(id: String, label: String, amountCents: Int? = nil,
                dueDate: Date? = nil, status: String) {
        self.id = id
        self.label = label
        self.amountCents = amountCents
        self.dueDate = dueDate
        self.status = status
    }
}

/// An FF&E line (from `project_ffe_items`). `roomName` is a resolved display
/// value (no room join in the reference SELECT).
public struct FieldFFEItem: Identifiable, Sendable, Codable {
    public let id: String
    public let name: String
    public let status: String
    public let roomName: String?

    public init(id: String, name: String, status: String, roomName: String? = nil) {
        self.id = id
        self.name = name
        self.status = status
        self.roomName = roomName
    }
}

/// A project room (from `rooms`) — minimal shape for P2 + the F-team room picker.
public struct FieldProjectRoom: Identifiable, Sendable, Codable {
    public let id: String
    public let name: String

    public init(id: String, name: String) {
        self.id = id
        self.name = name
    }
}

/// Everything the P2 detail renders in one value.
public struct FieldProjectDetail: Sendable, Codable {
    public let project: FieldProject
    public let phases: [FieldProjectPhase]
    public let milestones: [FieldMilestone]
    public let ffeItems: [FieldFFEItem]
    public let rooms: [FieldProjectRoom]

    public init(project: FieldProject,
                phases: [FieldProjectPhase] = [],
                milestones: [FieldMilestone] = [],
                ffeItems: [FieldFFEItem] = [],
                rooms: [FieldProjectRoom] = []) {
        self.project = project
        self.phases = phases
        self.milestones = milestones
        self.ffeItems = ffeItems
        self.rooms = rooms
    }
}

public protocol ProjectsService: Sendable {
    /// Projects the current user can see (RLS-scoped), most-recent first.
    func listProjects() async throws -> [FieldProject]
    /// One project with its phases, milestones, FF&E, and rooms.
    func projectDetail(id: String) async throws -> FieldProjectDetail
}
