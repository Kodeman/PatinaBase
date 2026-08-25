//  FieldVisitDoorModel.swift
//  CaptureKit
//
//  V0 — the door (spec §7.3). "Where are you today?" answered once, offline,
//  in three taps. The model lives in CaptureKit so it is unit-testable; the
//  sheet is a thin renderer over it.

import Foundation
import Observation

@MainActor
@Observable
public final class FieldVisitDoorModel {
    private let cache: CaptureProjectCache
    private let owner: CaptureOwnerIdentity
    private let existing: CaptureVisitState
    private var allProjects: [CaptureProjectSnapshot] = []
    private var selectedDetail: CaptureProjectSnapshot?

    public var kind: FieldVisitKind = .site
    public var query: String = ""
    public var selectedProjectID: String?
    public var selectedRoom: FieldVisitRoomOption?
    public var kit: FieldVisitKit?
    public var venueName: String = ""
    public private(set) var projectsInMind: [String] = []
    public private(set) var isOffline = false

    public init(cache: CaptureProjectCache,
                owner: CaptureOwnerIdentity,
                existing: CaptureVisitState = .none) {
        self.cache = cache
        self.owner = owner
        self.existing = existing
        if let open = existing.context {
            kind = open.kind ?? .site
            kit = open.kit
            selectedProjectID = open.routing.projectID
            venueName = open.kind == .sourcing ? (open.label ?? "") : ""
            projectsInMind = open.projectsInMind
        }
    }

    public var projects: [CaptureProjectSnapshot] {
        CaptureProjectCachePolicy.filter(allProjects, query: query)
    }

    /// R30: the count is PERSISTED ROWS, never `refreshList`'s return value —
    /// that reports the network leg alone and stays true when the local flush
    /// failed, so keying the line off it would promise rows that are not there.
    public var offlineCaption: String? {
        isOffline ? CaptureProjectCachePolicy.offlineCaption(cachedCount: allProjects.count) : nil
    }

    /// FC-R5: `merge` takes two `[CaptureCachedRoom]`, so a transposed call here
    /// compiles clean and ships a `public.rooms` id into `project_room_id`.
    /// `specRooms:` is the project_rooms lane; `rooms:` is the public.rooms lane.
    public var roomOptions: [FieldVisitRoomOption] {
        guard let selectedDetail else { return [] }
        return [.wholeHouse] + FieldVisitRoomMerge.merge(specRooms: selectedDetail.specRooms,
                                                         rooms: selectedDetail.rooms)
    }

    public var scanLaneCaption: String? {
        FieldVisitRoomMerge.scanLaneCaption(Array(roomOptions.dropFirst()))
    }

    public var isChangingAnOpenVisit: Bool { existing.isVisit }

    public var primaryTitle: String { isChangingAnOpenVisit ? "Change" : "Start visit" }

    public var canStart: Bool {
        switch kind {
        case .site:
            return selectedProjectID?.isEmpty == false
        case .sourcing:
            return !venueName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        }
    }

    public func load() async {
        let refreshed = await cache.refreshList(owner: owner)
        isOffline = !refreshed
        allProjects = cache.snapshots(owner: owner)
        if let selectedProjectID {
            await select(projectID: selectedProjectID)
        }
    }

    public func select(projectID: String) async {
        if selectedProjectID != projectID { selectedRoom = nil }
        selectedProjectID = projectID
        let refreshed = await cache.refreshDetail(projectID: projectID, owner: owner)
        if !refreshed { isOffline = true }
        allProjects = cache.snapshots(owner: owner)
        selectedDetail = allProjects.first { $0.id == projectID }
    }

    /// R36: the cap is enforced HERE, at selection time. `CaptureSessionContext`
    /// truncates in its memberwise init, but decoding bypasses that, so the type
    /// is not a validation boundary — stop offering a fifth rather than let the
    /// array silently eat one.
    public func toggleProjectInMind(_ id: String) {
        if let index = projectsInMind.firstIndex(of: id) {
            projectsInMind.remove(at: index)
        } else if projectsInMind.count < CaptureSessionContext.maxProjectsInMind {
            projectsInMind.append(id)
        }
    }

    public func draft() -> CaptureVisitDraft? {
        guard canStart else { return nil }
        switch kind {
        case .site:
            guard let projectID = selectedProjectID,
                  let project = allProjects.first(where: { $0.id == projectID }) else { return nil }
            let room = selectedRoom.flatMap { $0.isWholeHouse ? nil : $0 }
            return CaptureVisitDraft(
                kind: .site,
                kit: kit,
                label: project.name,
                projectID: projectID,
                projectName: project.name,
                projectRoomID: room?.projectRoomID,
                scanRoomID: room?.scanRoomID,
                room: room?.name)
        case .sourcing:
            return CaptureVisitDraft(
                kind: .sourcing,
                kit: kit,
                label: venueName.trimmingCharacters(in: .whitespacesAndNewlines),
                projectsInMind: projectsInMind)
        }
    }
}
