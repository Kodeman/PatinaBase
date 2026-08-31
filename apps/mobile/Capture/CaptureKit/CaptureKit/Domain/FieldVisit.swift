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

/// FC-R21 part 3: why a visit closed. §14's `visit.end` carries exactly these
/// four and no others — `explicit` is one of the four End-visit taps, `auto` is
/// the 12-hour idle rule or a backwards clock, `rollover` is the calendar-day
/// rule, and `change` is a new visit started at the door over an open one.
/// Without it `visit.start` and `visit.end` do not pair and a completion rate
/// read from §14 is wrong in the common case.
public enum FieldVisitEndReason: String, Codable, CaseIterable, Sendable {
    case explicit
    case auto
    case rollover
    case change
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

/// FC-R11's gate, in CaptureKit so the two surfaces this wave gates — the C3
/// card and C6 — share one rule and one test. §15.2 item 2: she TAPS it. A
/// recording that starts while the chip is untapped has not been affirmed,
/// whatever it says.
///
/// COVERAGE IS C3 AND C6 ONLY. FC-R11 names two further recording surfaces —
/// N4 (`VoiceNoteSheet`) and F2 (`SiteScanContextCapture`'s recorder) — and
/// neither has a chip or calls this gate. Wave 3's plan scoped Ruling 4 to C3
/// and C6, so that is a SCHEDULED GAP, not a rule this type enforces. Read
/// `recordingIsBlocked` as "blocked on the surfaces that ask", never as
/// "every conversation note is affirmed".
public enum FieldAffirmationPolicy {
    public static func chipTitle(noteSetting: FieldNoteSetting?) -> String? {
        noteSetting?.affirmation
    }

    public static func recordingIsBlocked(noteSetting: FieldNoteSetting?,
                                          affirmed: Bool) -> Bool {
        noteSetting == .conversation && !affirmed
    }
}

/// FC-R11 / R263: the take's visit and note setting, fixed at `start()`.
///
/// `C6VoiceModel` is app-target and `CaptureTests` has no app host, so the
/// invariant the Critical FC-R11 fix rests on cannot be tested where it is
/// used. It is tested HERE instead, and the model is forced through this type:
/// the memberwise initialiser is internal, so the only way to mint one from the
/// app target is `start(reading:)`, which reads the live visit exactly once and
/// keeps the answer. A model holding a `FieldVoiceTake` has nothing left to
/// re-read — the chip stays tappable in VOICE mode WHILE recording, and a visit
/// she changes or ends mid-take must not restamp words spoken somewhere else.
public struct FieldVoiceTake: Equatable, Sendable {
    public let visit: CaptureVisitState
    public let noteSetting: FieldNoteSetting

    /// No take in hand. The model's resting value.
    public static let none = FieldVoiceTake(visit: .none, noteSetting: .solo)

    /// Calls `liveVisit` EXACTLY ONCE and pins what it returns. Taking the
    /// visit as a closure rather than a value is the point: it puts the single
    /// read inside this type, where a test can change the source afterwards and
    /// prove the take did not move.
    public static func start(reading liveVisit: () -> CaptureVisitState) -> FieldVoiceTake {
        let pinned = liveVisit()
        return FieldVoiceTake(visit: pinned, noteSetting: noteSetting(for: pinned))
    }

    /// The kit carries FC-R11's default; no visit means `.solo`.
    public static func noteSetting(for visit: CaptureVisitState) -> FieldNoteSetting {
        guard let context = visit.context, let kind = context.kind else { return .solo }
        return CaptureVisitDraft(kind: kind, kit: context.kit).defaultNoteSetting
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
