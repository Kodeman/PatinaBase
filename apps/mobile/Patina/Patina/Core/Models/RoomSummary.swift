//
//  RoomSummary.swift
//  Patina
//
//  Lightweight room summary used by the Daily Room chip rail.
//

import SwiftUI

struct RoomSummary: Identifiable, Hashable {
    let id: UUID
    let name: String
    let itemCount: Int
    let thumbGradient: LinearGradient
    let squareFeet: Int
    let orientation: String
    let windowCount: Int
    /// True when the most recent update is recent enough to show a
    /// "just scanned" dot on the chip (wired from RoomModel.updatedAt).
    let justScanned: Bool

    init(
        id: UUID = UUID(),
        name: String,
        itemCount: Int,
        thumbGradient: LinearGradient,
        squareFeet: Int,
        orientation: String,
        windowCount: Int,
        justScanned: Bool = false
    ) {
        self.id = id
        self.name = name
        self.itemCount = itemCount
        self.thumbGradient = thumbGradient
        self.squareFeet = squareFeet
        self.orientation = orientation
        self.windowCount = windowCount
        self.justScanned = justScanned
    }

    static func == (lhs: RoomSummary, rhs: RoomSummary) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }
}

extension RoomSummary {
    /// Build a RoomSummary from a persisted RoomModel for the Daily Room chip rail.
    init(from room: RoomModel) {
        let gradient: LinearGradient
        switch room.roomType.lowercased() {
        case "living", "living_room", "living room": gradient = PatinaGradients.warm
        case "bedroom":                               gradient = PatinaGradients.dusk
        case "office":                                gradient = PatinaGradients.sageGradient
        case "dining", "dining_room":                 gradient = PatinaGradients.earth
        case "kitchen":                               gradient = PatinaGradients.rattan
        default:                                      gradient = PatinaGradients.linen
        }
        let recentlyUpdated = room.hasBeenScanned &&
            Date().timeIntervalSince(room.updatedAt) < 60
        self.init(
            id: room.id,
            name: room.name,
            itemCount: room.items.count,
            thumbGradient: gradient,
            squareFeet: Int(room.squareFeet ?? 0),
            orientation: room.orientationLabel,
            windowCount: room.windowCount,
            justScanned: recentlyUpdated
        )
    }

    static let mockLiving = RoomSummary(
        name: "Living Room",
        itemCount: 12,
        thumbGradient: PatinaGradients.hero,
        squareFeet: 264,
        orientation: "South-facing",
        windowCount: 2
    )

    static let mockBedroom = RoomSummary(
        name: "Bedroom",
        itemCount: 8,
        thumbGradient: PatinaGradients.hero2,
        squareFeet: 180,
        orientation: "East-facing",
        windowCount: 1
    )

    static let mockOffice = RoomSummary(
        name: "Office",
        itemCount: 5,
        thumbGradient: PatinaGradients.walnut,
        squareFeet: 120,
        orientation: "North-facing",
        windowCount: 1
    )

    static let mockAll: [RoomSummary] = [.mockLiving, .mockBedroom, .mockOffice]
}
