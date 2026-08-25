//  FieldVisit.swift
//  CaptureKit
//
//  The visit vocabulary (FC-R2) and the small value types the offline cache,
//  the room merge (FC-R5) and the suggestion lane all share.

import Foundation

// MARK: - Vocabulary

/// FC-R2: two kinds. "Roving" is the ABSENCE of a kind, never a case.
public enum FieldVisitKind: String, Codable, CaseIterable, Sendable {
    case site
    case sourcing
}

/// FC-R2: three kits, and a kit is never also a kind.
public enum FieldVisitKit: String, Codable, CaseIterable, Sendable {
    case walkThrough = "walk_through"
    case tradeWalk   = "trade_walk"
    case install
}

/// FC-R11: chosen at the start of every note; the kit carries the default.
public enum FieldNoteSetting: String, Codable, CaseIterable, Sendable {
    case solo
    case conversation
}

/// §9.3 `suggestion_basis`. Waves 1–3 produce only `visit`, `venue` and `proximity`.
public enum FieldSuggestionBasis: String, Codable, CaseIterable, Sendable {
    case visit, scan, proximity, venue, calendar, transcript
}

// MARK: - Value types

/// FC-R5: a cached room carries the id of exactly the lane it came from.
/// `project_rooms.id` and `public.rooms.id` are never cross-assigned.
public struct CaptureCachedRoom: Codable, Hashable, Sendable {
    public let id: String
    public let name: String
    public init(id: String, name: String) {
        self.id = id
        self.name = name
    }
}

public struct CaptureCoordinate: Codable, Hashable, Sendable {
    public let latitude: Double
    public let longitude: Double

    public init(latitude: Double, longitude: Double) {
        self.latitude = latitude
        self.longitude = longitude
    }

    /// Great-circle distance in metres over a spherical earth. CoreLocation is
    /// app-side; CaptureKit stays pure Foundation so this unit-tests.
    public func distanceMeters(to other: CaptureCoordinate) -> Double {
        let earthRadius = 6_371_000.0
        let lat1 = latitude * .pi / 180
        let lat2 = other.latitude * .pi / 180
        let dLat = (other.latitude - latitude) * .pi / 180
        let dLon = (other.longitude - longitude) * .pi / 180
        let a = sin(dLat / 2) * sin(dLat / 2)
            + cos(lat1) * cos(lat2) * sin(dLon / 2) * sin(dLon / 2)
        return earthRadius * 2 * atan2(sqrt(a), sqrt(max(0, 1 - a)))
    }
}
