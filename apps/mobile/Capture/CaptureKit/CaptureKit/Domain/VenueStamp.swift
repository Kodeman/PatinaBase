//  VenueStamp.swift
//  CaptureKit
//
//  Where a capture was found (F-08/F-09). GPS is an immutable capture fact;
//  the human label is editable (S1). Stored as one Codable value on Specimen.

import Foundation

public struct VenueStamp: Codable, Hashable, Sendable {
    public var projectId: String?
    public var projectName: String?
    public var projectRoomId: String?
    public var room: String?
    /// Loose status string ("Seating · maybe"), not an enum (S1).
    public var shelf: String?
    public var latitude: Double?
    public var longitude: Double?
    public var accuracyMeters: Double?
    /// Human venue label, e.g. "High Point · Showroom 214" — editable.
    public var placemarkName: String?
    public var placeId: String?
    public var capturedAt: Date
    public var timezoneIdentifier: String?

    public init(
        projectId: String? = nil,
        projectName: String? = nil,
        projectRoomId: String? = nil,
        room: String? = nil,
        shelf: String? = nil,
        latitude: Double? = nil,
        longitude: Double? = nil,
        accuracyMeters: Double? = nil,
        placemarkName: String? = nil,
        placeId: String? = nil,
        capturedAt: Date = Date(),
        timezoneIdentifier: String? = TimeZone.current.identifier
    ) {
        self.projectId = projectId
        self.projectName = projectName
        self.projectRoomId = projectRoomId
        self.room = room
        self.shelf = shelf
        self.latitude = latitude
        self.longitude = longitude
        self.accuracyMeters = accuracyMeters
        self.placemarkName = placemarkName
        self.placeId = placeId
        self.capturedAt = capturedAt
        self.timezoneIdentifier = timezoneIdentifier
    }
}
