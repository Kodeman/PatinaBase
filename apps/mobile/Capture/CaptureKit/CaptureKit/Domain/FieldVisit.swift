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

// MARK: - FC-R11: the consent gate

public extension FieldNoteSetting {
    /// FC-R11: a conversation note shows a one-line affirmation she taps. A
    /// nudge, not legal advice — but it converts an invisible act into a
    /// deliberate one.
    var affirmation: String? {
        self == .conversation ? "Everyone here knows this is being recorded" : nil
    }
}

/// FC-R11's gate, in CaptureKit so BOTH surfaces that record — the C3 card and
/// C6 — share one rule and one test. §15.2 item 2: she TAPS it. A recording that
/// starts while the chip is untapped has not been affirmed, whatever it says.
public enum FieldAffirmationPolicy {
    public static func chipTitle(noteSetting: FieldNoteSetting?) -> String? {
        noteSetting?.affirmation
    }

    public static func recordingIsBlocked(noteSetting: FieldNoteSetting?,
                                          affirmed: Bool) -> Bool {
        noteSetting == .conversation && !affirmed
    }
}

/// Which gesture each voice surface uses. §7.4: a twenty-minute walk-through
/// cannot be held, and a slipped finger must not end the note — so tap-to-start
/// / tap-to-stop is the rule and the hold survives ONLY on the C3 card, where a
/// ten-second remark makes a hold right.
public enum FieldVoiceGesture: Equatable, Sendable {
    case pressAndHold
    case tapToStartTapToStop

    public enum Surface: String, Sendable {
        case quickConfirmCard   // C3
        case voiceMode          // C6
        case voiceSheet         // N4
        case scanContext        // F2 / non-Pro context screen
    }

    public static func forSurface(_ surface: Surface) -> FieldVoiceGesture {
        surface == .quickConfirmCard ? .pressAndHold : .tapToStartTapToStop
    }
}
