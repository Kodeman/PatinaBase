//  RoutingMemoryStampTests.swift
//  CaptureTests
//
//  S1AssignVenueScreen.persistRouting() writes projectRoomID into visit routing
//  memory, and ViewfinderModel.makeDraft() read four of the five fields back —
//  venue.projectRoomId was assigned nowhere in that file, so
//  CaptureRoutingMemory.projectRoomID was WRITE-ONLY and every capture after
//  the first silently lost the FF&E room. One pure mapper, one regression test.

import Foundation
import Testing
@testable import CaptureKit

struct RoutingMemoryStampTests {

    @Test func routingMemoryStampsAllFiveFieldsIncludingTheProjectRoom() {
        let routing = CaptureRoutingMemory(destination: .inbox,
                                           projectID: "p-1",
                                           projectName: "Maple St",
                                           projectRoomID: "pr-9",
                                           room: "Living",
                                           shelf: "Seating · maybe")
        let stamped = routing.stamped(onto: VenueStamp())
        #expect(stamped.projectId == "p-1")
        #expect(stamped.projectName == "Maple St")
        #expect(stamped.projectRoomId == "pr-9")   // the regression this exists for
        #expect(stamped.room == "Living")
        #expect(stamped.shelf == "Seating · maybe")
    }

    @Test func routingMemoryStampPreservesNonRoutingVenueFacts() {
        var venue = VenueStamp(latitude: 43.07, longitude: -89.40,
                               placemarkName: "Maple St")
        venue.placeId = "place-1"
        let stamped = CaptureRoutingMemory(projectID: "p-1").stamped(onto: venue)
        #expect(stamped.latitude == 43.07)
        #expect(stamped.longitude == -89.40)
        #expect(stamped.placemarkName == "Maple St")
        #expect(stamped.placeId == "place-1")
        #expect(stamped.projectId == "p-1")
    }

    @Test func anEmptyRoutingMemoryClearsPlacementWithoutTouchingGPS() {
        var venue = VenueStamp(latitude: 43.07, longitude: -89.40)
        venue.projectId = "stale"
        venue.projectRoomId = "stale-room"
        let stamped = CaptureRoutingMemory.empty.stamped(onto: venue)
        #expect(stamped.projectId == nil)
        #expect(stamped.projectRoomId == nil)
        #expect(stamped.latitude == 43.07)
    }
}
