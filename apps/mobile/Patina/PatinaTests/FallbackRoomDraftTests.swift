//
//  FallbackRoomDraftTests.swift
//  PatinaTests
//
//  U40: pins the manual-scan → room conversion the fallback (non-LiDAR) path
//  depends on. `RoomScanSession` is metric, `RoomCreationCoordinator` is
//  imperial — a silent unit slip here would persist rooms at ~30% of their
//  real size, so the conversion and the default naming are both pinned.
//

import Testing
import Foundation
@testable import Patina

@MainActor
struct FallbackRoomDraftTests {

    private func makeManualSession(
        roomType: String = "living",
        widthMeters: Float = 4.2672,
        lengthMeters: Float = 5.4864,
        heightMeters: Float? = nil,
        windowCount: Int = 2,
        doorCount: Int = 1
    ) -> RoomScanSession {
        var session = RoomScanSession(
            userId: "test-user",
            scanMethod: .manual,
            hasLidar: false
        )
        session.dimensions = ScanRoomDimensions(
            length: lengthMeters,
            width: widthMeters,
            height: heightMeters,
            area: lengthMeters * widthMeters
        )
        session.features = ScanRoomFeatures(
            windowCount: windowCount,
            doorCount: doorCount,
            hasFireplace: false,
            roomType: roomType
        )
        return session
    }

    @Test
    func manualSessionConvertsMetersToFeet() {
        let draft = FallbackRoomDraft(session: makeManualSession())

        #expect(abs(draft.widthFeet - 14.0) < 0.01)
        #expect(abs(draft.lengthFeet - 18.0) < 0.01)

        let withCeiling = FallbackRoomDraft(session: makeManualSession(heightMeters: 2.4384))
        #expect(abs((withCeiling.ceilingHeightFeet ?? 0) - 8.0) < 0.01)
    }

    @Test
    func nameDerivesFromRoomType() {
        #expect(FallbackRoomDraft(session: makeManualSession(roomType: "living")).name == "Living Room")
        #expect(FallbackRoomDraft(session: makeManualSession(roomType: "other")).name == "Room")
    }

    @Test
    func heightIsNilForManualSessions() {
        // The fallback entry screen never asks for ceiling height, so the
        // session carries none and the draft must not invent one.
        let draft = FallbackRoomDraft(session: makeManualSession())
        #expect(draft.ceilingHeightFeet == nil)
    }

    @Test
    func windowAndDoorCountsCarryThrough() {
        let draft = FallbackRoomDraft(session: makeManualSession(
            roomType: "bedroom",
            windowCount: 5,
            doorCount: 3
        ))

        #expect(draft.windowCount == 5)
        #expect(draft.doorCount == 3)
        #expect(draft.roomType == "bedroom")
    }

    @Test
    func defaultDisplayNameMatchesManualEntryVocabulary() {
        #expect(RoomCreationCoordinator.defaultDisplayName(forType: "living") == "Living Room")
        #expect(RoomCreationCoordinator.defaultDisplayName(forType: "bedroom") == "Bedroom")
        #expect(RoomCreationCoordinator.defaultDisplayName(forType: "office") == "Office")
        #expect(RoomCreationCoordinator.defaultDisplayName(forType: "dining") == "Dining Room")
        #expect(RoomCreationCoordinator.defaultDisplayName(forType: "kitchen") == "Kitchen")
        #expect(RoomCreationCoordinator.defaultDisplayName(forType: "other") == "Room")
    }
}
