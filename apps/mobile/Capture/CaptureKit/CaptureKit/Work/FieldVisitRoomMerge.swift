//  FieldVisitRoomMerge.swift
//  CaptureKit
//
//  FC-R5. `FieldProjectDetail` returns BOTH lists from one projectDetail(id:)
//  call: specRooms (project_rooms — what field_captures.project_room_id FKs to)
//  and rooms (public.rooms — what room_scans.room_id and the siteScanContext
//  provenance carry). One picker merges them by case-insensitive trimmed name.
//  A capture stamps ONLY the id legal for its lane; the other stays nil.
//  ContextCaptureProvenance's refusal to put a rooms.id in project_room_id stands.

import Foundation

public struct FieldVisitRoomOption: Identifiable, Hashable, Sendable {
    public let name: String
    /// project_rooms.id → field_captures.project_room_id. NEVER a public.rooms id.
    public let projectRoomID: String?
    /// public.rooms.id → siteScanContext.projectRoomId + room_scans.room_id.
    public let scanRoomID: String?

    public init(name: String, projectRoomID: String?, scanRoomID: String?) {
        self.name = name
        self.projectRoomID = projectRoomID
        self.scanRoomID = scanRoomID
    }

    public var id: String {
        "\(projectRoomID ?? "-")|\(scanRoomID ?? "-")|\(FieldVisitRoomMerge.normalized(name))"
    }

    public var isWholeHouse: Bool {
        projectRoomID == nil && scanRoomID == nil
            && FieldVisitRoomMerge.normalized(name) == FieldVisitRoomMerge.normalized("Whole house")
    }

    public static let wholeHouse = FieldVisitRoomOption(
        name: "Whole house", projectRoomID: nil, scanRoomID: nil)
}

public enum FieldVisitRoomMerge {

    public static func normalized(_ name: String) -> String {
        name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    /// FC-R5: merge by case-insensitive trimmed name. An entry present in only one
    /// list keeps the other lane nil — never guessed, never cross-assigned.
    public static func merge(specRooms: [CaptureCachedRoom],
                             rooms: [CaptureCachedRoom]) -> [FieldVisitRoomOption] {
        var order: [String] = []
        var byKey: [String: FieldVisitRoomOption] = [:]

        for room in specRooms {
            let key = normalized(room.name)
            guard !key.isEmpty else { continue }
            if byKey[key] == nil { order.append(key) }
            let display = byKey[key]?.name
                ?? room.name.trimmingCharacters(in: .whitespacesAndNewlines)
            byKey[key] = FieldVisitRoomOption(name: display,
                                              projectRoomID: room.id,
                                              scanRoomID: byKey[key]?.scanRoomID)
        }
        for room in rooms {
            let key = normalized(room.name)
            guard !key.isEmpty else { continue }
            if byKey[key] == nil { order.append(key) }
            let display = byKey[key]?.name
                ?? room.name.trimmingCharacters(in: .whitespacesAndNewlines)
            byKey[key] = FieldVisitRoomOption(name: display,
                                              projectRoomID: byKey[key]?.projectRoomID,
                                              scanRoomID: room.id)
        }
        return order.compactMap { byKey[$0] }
    }

    /// Spec §9.7: `FieldProjectDetail.rooms` comes from `fetchClientRooms(clientID:)`,
    /// which returns [] when a project has no registered client — so the picker
    /// silently degrades to project_rooms-only and a site scan has no room to
    /// attach to. Say it out loud rather than degrade quietly.
    public static func scanLaneCaption(_ options: [FieldVisitRoomOption]) -> String? {
        guard !options.isEmpty else { return nil }
        guard options.allSatisfy({ $0.scanRoomID == nil }) else { return nil }
        return "No client rooms on this project yet — a scan has nothing to attach to."
    }
}

/// Spec §7.10 / Flow 4. F1 opens pre-answered from the visit — and the GUARD is
/// the tiebreak: if the visit's project is not in `ownableProjects()` (which
/// deliberately mirrors room_scans' BEFORE-INSERT guard), F1 must EXPAND AND SAY
/// SO, never silently start a scan that will 4xx at upload.
public enum FieldScanSetupState: Equatable, Sendable {
    /// Whether the expanded reason is an INSTRUCTION she has nothing to fix, or
    /// a CAUTION about the project she already picked. "Choose a project for
    /// this scan." is what EVERY user without a site visit sees, every time, and
    /// waves 1-2 showed no header there at all — rendered in a warning's colour
    /// it reads as an error she caused. The other two arms are cautions: the
    /// project she picked will 4xx at upload, or has nothing to attach to.
    public enum Tone: Equatable, Sendable {
        case instruction
        case caution
    }

    case collapsed(summary: String)
    case expanded(reason: String, tone: Tone)
}

public enum FieldScanSetupPolicy {
    public static func state(visitState: CaptureVisitState,
                             ownableProjectIDs: [String],
                             scanRoomIsAvailable: Bool) -> FieldScanSetupState {
        guard let context = visitState.context,
              context.kind == .site,
              let projectID = context.routing.projectID,
              !projectID.isEmpty else {
            return .expanded(reason: "Choose a project for this scan.", tone: .instruction)
        }
        let name = context.routing.projectName ?? context.label ?? "This project"
        guard ownableProjectIDs.contains(projectID) else {
            return .expanded(reason: "\(name) isn't a project you can attach a scan to — choose another.",
                             tone: .caution)
        }
        guard scanRoomIsAvailable else {
            return .expanded(reason: "No client rooms on this project yet — a scan has nothing to attach to.",
                             tone: .caution)
        }
        let room = context.routing.room?.trimmingCharacters(in: .whitespacesAndNewlines)
        let tail = (room?.isEmpty == false) ? room! : "Whole house"
        return .collapsed(summary: "\(name) · \(tail)")
    }
}
