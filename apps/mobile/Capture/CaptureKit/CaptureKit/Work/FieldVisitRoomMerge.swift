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
