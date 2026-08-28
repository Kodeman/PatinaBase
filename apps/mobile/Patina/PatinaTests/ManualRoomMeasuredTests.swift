//
//  ManualRoomMeasuredTests.swift
//  PatinaTests
//
//  W4 fix round · integration.md §6.8 — a room typed on the feet-labelled
//  fields counts as measured, so the fit line can quote its longest wall.
//  The scan-fallback draft still does not: nobody read a unit off a control
//  there, and a wrong fit line on a made-to-order table is worse than none.
//

import Testing
import Foundation
import SwiftData
@testable import Patina

@MainActor
struct ManualRoomMeasuredTests {

    private func makeStore() throws -> RoomStore {
        let schema = Schema([RoomModel.self, SavedItem.self])
        let config = ModelConfiguration(schema: schema, isStoredInMemoryOnly: true)
        let container = try ModelContainer(for: schema, configurations: [config])
        return RoomStore(context: ModelContext(container))
    }

    @Test("a room typed on the manual-entry fields is measured")
    func aTypedRoomIsMeasured() throws {
        let store = try makeStore()
        let room = store.createRoom(
            name: "Guest Bedroom", roomType: "bedroom",
            widthFeet: 12, lengthFeet: 15,
            manualEntry: true, measuredWithUnitControl: true
        )
        #expect(room.measuredWithUnitControl)
    }

    @Test("every other creation path stays silent for the fit line")
    func otherPathsStaySilent() throws {
        let store = try makeStore()
        let room = store.createRoom(
            name: "Fallback Room", roomType: "other",
            widthFeet: 12, lengthFeet: 15,
            manualEntry: true
        )
        #expect(room.measuredWithUnitControl == false)
    }

    @Test("the manual-entry screen is the caller that passes it")
    func theManualEntryScreenPassesIt() throws {
        let screen = try SourcePin.read("Patina/Features/Rooms/Views/ManualRoomEntryView.swift")
        #expect(screen.contains("measuredWithUnitControl: true"))
        let fallback = try SourcePin.read("Patina/Features/RoomScan/Views/QuietConversationFlowHost.swift")
        #expect(!fallback.contains("measuredWithUnitControl"))
    }
}
