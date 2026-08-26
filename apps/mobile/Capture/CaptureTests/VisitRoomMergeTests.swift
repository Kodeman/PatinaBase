//  VisitRoomMergeTests.swift
//  CaptureTests
//
//  FC-R5 — merge project_rooms + public.rooms by trimmed name, stamp only the
//  legal lane, never cross-assign.

import Foundation
import Testing
@testable import CaptureKit

struct VisitRoomMergeTests {

    @Test func sameNameMergesIntoOneEntryCarryingBothIDs() {
        let merged = FieldVisitRoomMerge.merge(
            specRooms: [CaptureCachedRoom(id: "sr1", name: " Living ")],
            rooms: [CaptureCachedRoom(id: "r1", name: "living")])
        #expect(merged.count == 1)
        #expect(merged[0].projectRoomID == "sr1")
        #expect(merged[0].scanRoomID == "r1")
        #expect(merged[0].name == "Living")
    }

    @Test func aRoomInOnlyOneListLeavesTheOtherLaneNil() throws {
        let merged = FieldVisitRoomMerge.merge(
            specRooms: [CaptureCachedRoom(id: "sr1", name: "Dining")],
            rooms: [CaptureCachedRoom(id: "r9", name: "Garage")])
        let dining = try #require(merged.first { $0.name == "Dining" })
        let garage = try #require(merged.first { $0.name == "Garage" })
        #expect(dining.projectRoomID == "sr1")
        #expect(dining.scanRoomID == nil)
        #expect(garage.projectRoomID == nil)
        #expect(garage.scanRoomID == "r9")
    }

    @Test func differentNamesNeverCollapse() {
        let merged = FieldVisitRoomMerge.merge(
            specRooms: [CaptureCachedRoom(id: "sr1", name: "Living")],
            rooms: [CaptureCachedRoom(id: "r1", name: "Living Room")])
        #expect(merged.count == 2)
    }

    @Test func emptyScanLaneProducesTheHonestCaption() {
        let onlySpec = FieldVisitRoomMerge.merge(
            specRooms: [CaptureCachedRoom(id: "sr1", name: "Living")], rooms: [])
        #expect(FieldVisitRoomMerge.scanLaneCaption(onlySpec)
                == "No client rooms on this project yet — a scan has nothing to attach to.")
        let both = FieldVisitRoomMerge.merge(
            specRooms: [CaptureCachedRoom(id: "sr1", name: "Living")],
            rooms: [CaptureCachedRoom(id: "r1", name: "Living")])
        #expect(FieldVisitRoomMerge.scanLaneCaption(both) == nil)
    }

    @Test func wholeHouseCarriesNeitherLane() {
        #expect(FieldVisitRoomMerge.wholeHouseIsUnstamped)
    }

    // Same count, same names, distinct ids on both sides: nothing about the
    // shape of the two lists distinguishes them, so only the ids can catch a
    // transposed call. This test fails if specRooms and rooms are exchanged.
    @Test func theTwoLanesSurviveASameShapedListWithoutTransposing() {
        let merged = FieldVisitRoomMerge.merge(
            specRooms: [CaptureCachedRoom(id: "spec-1", name: "Living"),
                        CaptureCachedRoom(id: "spec-2", name: "Dining")],
            rooms: [CaptureCachedRoom(id: "scan-1", name: "Living"),
                    CaptureCachedRoom(id: "scan-2", name: "Dining")])
        #expect(merged.count == 2)
        #expect(merged.map(\.name) == ["Living", "Dining"])
        #expect(merged.map(\.projectRoomID) == ["spec-1", "spec-2"])
        #expect(merged.map(\.scanRoomID) == ["scan-1", "scan-2"])
    }

    @Test func surroundingWhitespaceAndCaseDoNotSplitAnEntry() {
        let merged = FieldVisitRoomMerge.merge(
            specRooms: [CaptureCachedRoom(id: "spec-1", name: "\n Primary Bath \t")],
            rooms: [CaptureCachedRoom(id: "scan-1", name: "PRIMARY BATH")])
        #expect(merged.count == 1)
        #expect(merged[0].name == "Primary Bath")
        #expect(merged[0].projectRoomID == "spec-1")
        #expect(merged[0].scanRoomID == "scan-1")
    }

    @Test func aScanOnlyRoomKeepsItsOwnTrimmedName() {
        let merged = FieldVisitRoomMerge.merge(
            specRooms: [],
            rooms: [CaptureCachedRoom(id: "scan-1", name: "  Mudroom  ")])
        #expect(merged.count == 1)
        #expect(merged[0].name == "Mudroom")
        #expect(merged[0].projectRoomID == nil)
        #expect(merged[0].scanRoomID == "scan-1")
    }

    @Test func specRoomOrderLeadsAndScanOnlyRoomsFollow() {
        let merged = FieldVisitRoomMerge.merge(
            specRooms: [CaptureCachedRoom(id: "spec-1", name: "Kitchen"),
                        CaptureCachedRoom(id: "spec-2", name: "Living")],
            rooms: [CaptureCachedRoom(id: "scan-9", name: "Garage"),
                    CaptureCachedRoom(id: "scan-1", name: "Kitchen")])
        #expect(merged.map(\.name) == ["Kitchen", "Living", "Garage"])
        #expect(merged.map(\.projectRoomID) == ["spec-1", "spec-2", nil])
        #expect(merged.map(\.scanRoomID) == ["scan-1", nil, "scan-9"])
    }

    // Two rows for one room name is a server-side duplicate, not two rooms she
    // can tell apart at the door: one picker entry, one id per lane, last seen.
    // The spelling she reads is the FIRST one — a later duplicate may not
    // re-case a room name under her.
    @Test func duplicateNamesWithinOneListCollapseToTheLastIDSeen() {
        let merged = FieldVisitRoomMerge.merge(
            specRooms: [CaptureCachedRoom(id: "spec-1", name: "Bath"),
                        CaptureCachedRoom(id: "spec-2", name: " bath ")],
            rooms: [CaptureCachedRoom(id: "scan-1", name: "Bath"),
                    CaptureCachedRoom(id: "scan-2", name: "BATH")])
        #expect(merged.count == 1)
        #expect(merged[0].name == "Bath")
        #expect(merged[0].projectRoomID == "spec-2")
        #expect(merged[0].scanRoomID == "scan-2")
    }

    @Test func aBlankNameIsNotAPickableRoom() {
        let merged = FieldVisitRoomMerge.merge(
            specRooms: [CaptureCachedRoom(id: "spec-1", name: "   ")],
            rooms: [CaptureCachedRoom(id: "scan-1", name: "")])
        #expect(merged.isEmpty)
    }

    @Test func aPartlyScannableListAndAnEmptyListBothGoUncaptioned() {
        let mixed = FieldVisitRoomMerge.merge(
            specRooms: [CaptureCachedRoom(id: "spec-1", name: "Living"),
                        CaptureCachedRoom(id: "spec-2", name: "Dining")],
            rooms: [CaptureCachedRoom(id: "scan-1", name: "Dining")])
        #expect(FieldVisitRoomMerge.scanLaneCaption(mixed) == nil)
        #expect(FieldVisitRoomMerge.scanLaneCaption([]) == nil)
    }
}

extension FieldVisitRoomMerge {
    static var wholeHouseIsUnstamped: Bool {
        FieldVisitRoomOption.wholeHouse.projectRoomID == nil
            && FieldVisitRoomOption.wholeHouse.scanRoomID == nil
            && FieldVisitRoomOption.wholeHouse.isWholeHouse
    }
}

extension VisitRoomMergeTests {

    private var identity: CaptureSessionIdentity {
        CaptureSessionIdentity(userID: "u1", workspaceID: "w1")
    }

    private func siteVisit(projectID: String, project: String,
                           room: String?) -> CaptureVisitState {
        let now = Date(timeIntervalSince1970: 1_800_000_000)
        return .active(CaptureSessionContext(
            identity: identity, startedAt: now, lastActivityAt: now,
            routing: CaptureRoutingMemory(destination: .inbox, projectID: projectID,
                                          projectName: project, room: room),
            kind: .site, label: project))
    }

    @Test func f1CollapsesWhenTheVisitAnsweredItAndTheGuardAgrees() {
        let state = FieldScanSetupPolicy.state(
            visitState: siteVisit(projectID: "p1", project: "Maple St", room: "Living"),
            ownableProjectIDs: ["p1"], scanRoomIsAvailable: true)
        #expect(state == .collapsed(summary: "Maple St · Living"))
    }

    @Test func f1ExpandsAndSaysSoWhenTheProjectFailsTheUploadGuard() {
        let state = FieldScanSetupPolicy.state(
            visitState: siteVisit(projectID: "p1", project: "Maple St", room: "Living"),
            ownableProjectIDs: ["p9"], scanRoomIsAvailable: true)
        #expect(state == .expanded(
            reason: "Maple St isn't a project you can attach a scan to — choose another."))
    }

    @Test func f1ExpandsWhenTheProjectHasNoClientRoomsYet() {
        let state = FieldScanSetupPolicy.state(
            visitState: siteVisit(projectID: "p1", project: "Maple St", room: "Living"),
            ownableProjectIDs: ["p1"], scanRoomIsAvailable: false)
        #expect(state == .expanded(
            reason: "No client rooms on this project yet — a scan has nothing to attach to."))
    }

    @Test func withNoVisitF1StaysTheFullForm() {
        let state = FieldScanSetupPolicy.state(
            visitState: .none, ownableProjectIDs: ["p1"], scanRoomIsAvailable: true)
        #expect(state == .expanded(reason: "Choose a project for this scan."))
    }

    @Test func aSourcingVisitNeverCollapsesF1() {
        let now = Date(timeIntervalSince1970: 1_800_000_000)
        let sourcing = CaptureVisitState.active(CaptureSessionContext(
            identity: identity, startedAt: now, lastActivityAt: now,
            kind: .sourcing, label: "High Point 214"))
        let state = FieldScanSetupPolicy.state(
            visitState: sourcing, ownableProjectIDs: ["p1"], scanRoomIsAvailable: true)
        #expect(state == .expanded(reason: "Choose a project for this scan."))
    }
}
