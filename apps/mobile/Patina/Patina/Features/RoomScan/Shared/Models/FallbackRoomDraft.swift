//
//  FallbackRoomDraft.swift
//  Patina
//
//  U40: bridges a manual (non-LiDAR) `RoomScanSession` to the arguments
//  `RoomCreationCoordinator.createManualRoom` expects. A pure value type so
//  the unit conversion is testable without SwiftData or a live coordinator.
//

import Foundation

public struct FallbackRoomDraft: Equatable {

    /// `RoomScanSession.dimensions` is metric (the capture pipeline is);
    /// `RoomStore`/`RoomCreationCoordinator` take feet.
    private static let feetPerMeter = 3.28084

    public let name: String
    public let roomType: String
    public let widthFeet: Double
    public let lengthFeet: Double
    public let ceilingHeightFeet: Double?
    public let windowCount: Int
    public let doorCount: Int

    public init(session: RoomScanSession) {
        let type = session.features.roomType
        self.name = RoomCreationCoordinator.defaultDisplayName(forType: type)
        self.roomType = type
        self.widthFeet = Double(session.dimensions.width) * Self.feetPerMeter
        self.lengthFeet = Double(session.dimensions.length) * Self.feetPerMeter
        // Manual entry never asks for ceiling height — only LiDAR sessions
        // carry one, so this stays nil on the fallback path.
        self.ceilingHeightFeet = session.dimensions.height.map { Double($0) * Self.feetPerMeter }
        self.windowCount = session.features.windowCount
        self.doorCount = session.features.doorCount
    }
}
