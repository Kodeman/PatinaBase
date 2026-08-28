//
//  RoomTypedCopyTests.swift
//  PatinaTests
//
//  W4 fix round · integration.md §6.4 — one wording for a typed room, and one
//  printing of its size.
//

import Testing
import Foundation
@testable import Patina

@MainActor
struct RoomTypedCopyTests {

    private func room(scanned: Bool = false) -> RoomModel {
        RoomModel(
            name: "Guest Bedroom",
            roomType: "bedroom",
            hasBeenScanned: scanned,
            width: 12 / 3.28084,
            length: 15 / 3.28084
        )
    }

    @Test("the Spaces card says a room was typed, in F51's words")
    func theGalleryMetaSaysTyped() {
        let line = room().galleryMetaLine
        #expect(line.contains("Typed, not scanned"))
        #expect(!line.contains("Manual entry"))
    }

    @Test("a scanned room still says when it was scanned")
    func aScannedRoomStillSaysScanned() {
        #expect(room(scanned: true).galleryMetaLine.contains("Scanned"))
    }

    @Test("the room's size is printed once — by the hero, not twice")
    func theRoomPrintsItsDimensionsOnce() throws {
        let source = try SourcePin.read("Patina/Features/Rooms/Components/SpatialMetadataRow.swift")
        #expect(!source.contains("dimensionsString"))
        #expect(!source.contains("' × %"))
    }

    @Test("a room that knows nothing else about itself draws no spatial card")
    func anEmptySpatialRowDrawsNothing() {
        let bare = room()
        #expect(SpatialMetadataRow.hasContent(bare) == false)
        bare.windowCount = 2
        #expect(SpatialMetadataRow.hasContent(bare) == true)
    }
}
