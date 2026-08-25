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
    /// FC-R5: the two lanes an open visit stored, held until `select` has the
    /// project's merged rooms. Never a `FieldVisitRoomOption` rebuilt from one id.
    private var restoringRoomLanes: (projectRoomID: String?, scanRoomID: String?)?

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
            // R36 on the way IN — same reason as `toggleProjectInMind` below:
            // a DECODED context bypasses the memberwise truncation.
            projectsInMind = Array(open.projectsInMind.prefix(CaptureSessionContext.maxProjectsInMind))
            if open.routing.projectRoomID != nil || open.scanRoomID != nil {
                restoringRoomLanes = (open.routing.projectRoomID, open.scanRoomID)
            }
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
            // Membership, not merely non-empty: `draft()` requires the project to
            // still be in the cache, so a restored id whose project has since been
            // evicted would otherwise light the primary button and return nil on
            // tap — a live-but-dead control.
            guard let selectedProjectID, !selectedProjectID.isEmpty else { return false }
            return allProjects.contains { $0.id == selectedProjectID }
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
        if selectedProjectID != projectID {
            selectedRoom = nil
            restoringRoomLanes = nil
        }
        selectedProjectID = projectID
        let refreshed = await cache.refreshDetail(projectID: projectID, owner: owner)
        if !refreshed { isOffline = true }
        allProjects = cache.snapshots(owner: owner)
        selectedDetail = allProjects.first { $0.id == projectID }
        restoreSelectedRoom()
    }

    /// FC-R5: an open visit stored its room as TWO ids, so the option is
    /// RECOVERED by matching both lanes against the merged list — never rebuilt
    /// from one id, which is the exact cross-assignment the merge exists to
    /// prevent. No match (renamed room, re-cached project) leaves it nil rather
    /// than inventing an option.
    ///
    /// The lanes are CONSUMED only when there is a real room to match against —
    /// index 0 is always Whole house, so `count > 1` is the test. A project
    /// cached list-only, or one whose detail fetch just failed, would otherwise
    /// discard them permanently on a doomed match, and no later refresh could
    /// recover the room: the primary button stays live and "Change" writes both
    /// lanes nil. That is the silent degrade this restore exists to close.
    /// A room she has already chosen herself is never overwritten by a retry.
    private func restoreSelectedRoom() {
        guard let lanes = restoringRoomLanes,
              selectedRoom == nil,
              roomOptions.count > 1 else { return }
        restoringRoomLanes = nil
        selectedRoom = roomOptions.first {
            $0.projectRoomID == lanes.projectRoomID && $0.scanRoomID == lanes.scanRoomID
        }
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

public extension FieldVisitDoorModel {
    /// Never overwrites a typed venue — a GPS guess is a courtesy, not a fact.
    func prefillVenue(from location: any LocationService) async {
        guard venueName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        guard let placemark = await location.currentVenue()?.placemarkName else { return }
        venueName = placemark
    }

    var offeredKits: [FieldVisitKit] { FieldVisitKit.allCases }

    /// FC-R11: the kit carries the consent default, and wave 3 ships ONLY that
    /// posture — the four-way pill row that tunes the shutter is wave 4.
    var consentPosture: FieldNoteSetting {
        CaptureVisitDraft(kind: kind, kit: kit).defaultNoteSetting
    }

    var projectsInMindIsFull: Bool {
        projectsInMind.count >= CaptureSessionContext.maxProjectsInMind
    }
}
