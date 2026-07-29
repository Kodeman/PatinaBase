//  FieldAttention.swift
//  CaptureKit
//
//  A pure, deterministic projection of Field's existing list DTOs and local
//  capture activity. It makes no deadline guesses and performs no fetching.

import Foundation

public struct FieldCaptureActivity: Hashable, Sendable {
    public let id: UUID
    public let title: String?
    public let status: CaptureStatus
    public let destination: CaptureDestination
    public let updatedAt: Date

    public init(
        id: UUID,
        title: String?,
        status: CaptureStatus,
        destination: CaptureDestination,
        updatedAt: Date
    ) {
        self.id = id
        self.title = title
        self.status = status
        self.destination = destination
        self.updatedAt = updatedAt
    }
}

public enum FieldAttentionKind: String, Hashable, Sendable {
    case capture
    case message
    case lead
    case decision
    case project
    case arrival
}

public enum FieldAttentionDestination: Hashable, Sendable {
    case specimen(UUID)
    case thread(String)
    case lead(String)
    case decision(String)
    case project(String)
    case receiving
}

public struct FieldAttentionItem: Identifiable, Hashable, Sendable {
    public let id: String
    public let kind: FieldAttentionKind
    public let title: String
    public let detail: String
    public let timestamp: Date?
    public let destination: FieldAttentionDestination

    public init(
        id: String,
        kind: FieldAttentionKind,
        title: String,
        detail: String,
        timestamp: Date?,
        destination: FieldAttentionDestination
    ) {
        self.id = id
        self.kind = kind
        self.title = title
        self.detail = detail
        self.timestamp = timestamp
        self.destination = destination
    }
}

public struct FieldAttentionSnapshot: Sendable {
    public let needsYou: [FieldAttentionItem]
    public let waitingOnOthers: [FieldAttentionItem]
    public let movingToday: [FieldAttentionItem]

    public init(
        needsYou: [FieldAttentionItem] = [],
        waitingOnOthers: [FieldAttentionItem] = [],
        movingToday: [FieldAttentionItem] = []
    ) {
        self.needsYou = needsYou
        self.waitingOnOthers = waitingOnOthers
        self.movingToday = movingToday
    }
}

public enum FieldAttentionBuilder {
    public static func build(
        projects: [FieldProject] = [],
        leads: [FieldLead] = [],
        decisions: [FieldDecision] = [],
        threads: [FieldThread] = [],
        arrivingPOs: [FieldArrivingPO] = [],
        captures: [FieldCaptureActivity] = [],
        now: Date = Date(),
        calendar: Calendar = .current
    ) -> FieldAttentionSnapshot {
        let captureGroups = captureCandidates(captures, now: now, calendar: calendar)
        let threadGroups = threadCandidates(threads, now: now, calendar: calendar)
        let projectGroups = projectCandidates(projects, now: now, calendar: calendar)
        let needsYou = captureGroups.needs + threadGroups.needs + leadCandidates(leads)
        let waiting = decisionCandidates(decisions) + projectGroups.waiting
        let moving = arrivalCandidates(arrivingPOs, now: now, calendar: calendar)
            + captureGroups.moving + projectGroups.moving + threadGroups.moving

        var assigned = Set<String>()
        return FieldAttentionSnapshot(
            needsYou: sortedUnique(needsYou, assigned: &assigned),
            waitingOnOthers: sortedUnique(waiting, assigned: &assigned),
            movingToday: sortedUnique(moving, assigned: &assigned)
        )
    }

    private struct Candidate {
        let priority: Int
        let item: FieldAttentionItem
    }

    private struct CandidateGroups {
        var needs: [Candidate] = []
        var waiting: [Candidate] = []
        var moving: [Candidate] = []
    }

    private static func captureCandidates(
        _ captures: [FieldCaptureActivity],
        now: Date,
        calendar: Calendar
    ) -> CandidateGroups {
        var groups = CandidateGroups()
        for capture in captures {
            let id = "capture:\(capture.id.uuidString.lowercased())"
            let title = nonEmpty(capture.title) ?? "Untitled capture"
            let destination = FieldAttentionDestination.specimen(capture.id)
            switch capture.status {
            case .draft:
                groups.needs.append(Candidate(
                    priority: 0,
                    item: FieldAttentionItem(
                        id: id, kind: .capture, title: title,
                        detail: "Continue this capture",
                        timestamp: capture.updatedAt, destination: destination
                    )
                ))
            case .ready where calendar.isDate(capture.updatedAt, inSameDayAs: now):
                groups.moving.append(Candidate(
                    priority: 1,
                    item: FieldAttentionItem(
                        id: id, kind: .capture, title: title,
                        detail: "Ready from Camera",
                        timestamp: capture.updatedAt, destination: destination
                    )
                ))
            default:
                break
            }
        }
        return groups
    }

    private static func threadCandidates(
        _ threads: [FieldThread],
        now: Date,
        calendar: Calendar
    ) -> CandidateGroups {
        var groups = CandidateGroups()
        for thread in threads {
            let item = FieldAttentionItem(
                id: "thread:\(thread.id)",
                kind: .message,
                title: thread.title,
                detail: nonEmpty(thread.lastMessagePreview)
                    ?? (thread.unread ? "Unread message" : "Message today"),
                timestamp: thread.lastMessageAt,
                destination: .thread(thread.id)
            )
            if thread.unread {
                groups.needs.append(Candidate(priority: 1, item: item))
            } else if let timestamp = thread.lastMessageAt,
                      calendar.isDate(timestamp, inSameDayAs: now) {
                groups.moving.append(Candidate(priority: 3, item: item))
            }
        }
        return groups
    }

    private static func leadCandidates(_ leads: [FieldLead]) -> [Candidate] {
        leads
            .filter { normalized($0.status) == "new" }
            .map { lead in
                let source = nonEmpty(lead.source)
                return Candidate(
                    priority: 2,
                    item: FieldAttentionItem(
                        id: "lead:\(lead.id)",
                        kind: .lead,
                        title: lead.clientName,
                        detail: source.map { "New lead · \($0)" } ?? "New lead",
                        timestamp: lead.createdAt,
                        destination: .lead(lead.id)
                    )
                )
            }
    }

    private static func decisionCandidates(
        _ decisions: [FieldDecision]
    ) -> [Candidate] {
        decisions
            .filter { normalized($0.status) == "pending" }
            .map { decision in
                let relationship = nonEmpty(decision.clientName)
                    ?? nonEmpty(decision.projectName)
                return Candidate(
                    priority: 0,
                    item: FieldAttentionItem(
                        id: "decision:\(decision.id)",
                        kind: .decision,
                        title: decision.title,
                        detail: relationship.map { "Waiting on \($0)" }
                            ?? "Client decision pending",
                        timestamp: decision.viewedAt ?? decision.sentAt,
                        destination: .decision(decision.id)
                    )
                )
            }
    }

    private static func projectCandidates(
        _ projects: [FieldProject],
        now: Date,
        calendar: Calendar
    ) -> CandidateGroups {
        let closed: Set<String> = [
            "archived", "cancelled", "canceled", "completed", "draft", "on_hold"
        ]
        var groups = CandidateGroups()
        for project in projects {
            let status = normalized(project.status)
            if status == "on_hold" {
                groups.waiting.append(Candidate(
                    priority: 1,
                    item: FieldAttentionItem(
                        id: "project:\(project.id)", kind: .project,
                        title: project.name,
                        detail: nonEmpty(project.phaseLabel) ?? "Project on hold",
                        timestamp: project.updatedAt,
                        destination: .project(project.id)
                    )
                ))
            } else if !closed.contains(status),
                      let updatedAt = project.updatedAt,
                      calendar.isDate(updatedAt, inSameDayAs: now) {
                groups.moving.append(Candidate(
                    priority: 2,
                    item: FieldAttentionItem(
                        id: "project:\(project.id)", kind: .project,
                        title: project.name,
                        detail: nonEmpty(project.phaseLabel) ?? "Updated today",
                        timestamp: updatedAt,
                        destination: .project(project.id)
                    )
                ))
            }
        }
        return groups
    }

    private static func arrivalCandidates(
        _ arrivals: [FieldArrivingPO],
        now: Date,
        calendar: Calendar
    ) -> [Candidate] {
        let closed: Set<String> = ["cancelled", "canceled", "delivered", "received"]
        return arrivals.compactMap { arrival in
            guard !closed.contains(normalized(arrival.status)),
                  let eta = arrival.eta,
                  calendar.isDate(eta, inSameDayAs: now) else { return nil }
            let title = nonEmpty(arrival.poNumber)
                ?? nonEmpty(arrival.vendorName)
                ?? "Arrival"
            let context = [nonEmpty(arrival.vendorName), nonEmpty(arrival.projectName)]
                .compactMap { $0 }
                .filter { $0 != title }
                .joined(separator: " · ")
            return Candidate(
                priority: 0,
                item: FieldAttentionItem(
                    id: "arrival:\(arrival.id)", kind: .arrival, title: title,
                    detail: context.isEmpty ? "Arriving today" : "\(context) · Arriving today",
                    timestamp: eta, destination: .receiving
                )
            )
        }
    }

    private static func sortedUnique(
        _ candidates: [Candidate],
        assigned: inout Set<String>
    ) -> [FieldAttentionItem] {
        candidates
            .sorted(by: precedes)
            .compactMap { candidate in
                guard assigned.insert(candidate.item.id).inserted else { return nil }
                return candidate.item
            }
    }

    private static func precedes(_ lhs: Candidate, _ rhs: Candidate) -> Bool {
        if lhs.priority != rhs.priority { return lhs.priority < rhs.priority }
        switch (lhs.item.timestamp, rhs.item.timestamp) {
        case let (left?, right?) where left != right:
            return left > right
        case (.some, .none):
            return true
        case (.none, .some):
            return false
        default:
            return lhs.item.id < rhs.item.id
        }
    }

    private static func normalized(_ value: String) -> String {
        value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    private static func nonEmpty(_ value: String?) -> String? {
        guard let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines),
              !trimmed.isEmpty else { return nil }
        return trimmed
    }
}
