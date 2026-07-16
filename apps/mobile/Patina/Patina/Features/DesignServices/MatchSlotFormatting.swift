//
//  MatchSlotFormatting.swift
//  Patina
//
//  Pure formatting + selection helpers for the Match Ceremony time picker
//  (Arrival Arc, R106 §6). Kept out of the view so slot labels, the optional
//  "her time" secondary label, and stale detection can be unit-tested with a
//  fixed clock, locale, and time zone.
//
//  Times are shown in the DEVICE's local zone. The designer's zone
//  (`introduction.timezone`) drives the quiet secondary label only when it
//  actually differs from the device — a same-zone pair shows nothing extra.
//

import Foundation

enum MatchSlotFormatting {

    /// Primary slot label in the device's local zone, e.g.
    /// "Thursday, July 23 · 2:00 PM". Day name + date + time.
    static func slotLabel(
        for date: Date,
        timeZone: TimeZone = .current,
        locale: Locale = .current
    ) -> String {
        let formatter = DateFormatter()
        formatter.locale = locale
        formatter.timeZone = timeZone
        formatter.setLocalizedDateFormatFromTemplate("EEEE MMMM d")
        let day = formatter.string(from: date)
        formatter.setLocalizedDateFormatFromTemplate("j mm")
        let time = formatter.string(from: date)
        return "\(day) · \(time)"
    }

    /// Time-only label in the designer's zone — the quiet "her time" secondary
    /// line — returned ONLY when that zone's offset for this instant differs
    /// from the device's (otherwise nil, so no redundant line is drawn).
    /// `timezone` is the raw `introduction.timezone` IANA identifier.
    static func herTimeLabel(
        for date: Date,
        designerTimeZoneIdentifier: String?,
        deviceTimeZone: TimeZone = .current,
        locale: Locale = .current
    ) -> String? {
        guard
            let identifier = designerTimeZoneIdentifier,
            let designerZone = TimeZone(identifier: identifier),
            designerZone.secondsFromGMT(for: date) != deviceTimeZone.secondsFromGMT(for: date)
        else { return nil }

        let formatter = DateFormatter()
        formatter.locale = locale
        formatter.timeZone = designerZone
        formatter.setLocalizedDateFormatFromTemplate("j mm")
        return "\(formatter.string(from: date)) her time"
    }

    /// Slots still in the future, in wire order — the only ones offered to tap.
    static func futureSlots(_ slots: [IntroductionSlot], now: Date = Date()) -> [IntroductionSlot] {
        slots.filter { $0.startsAt >= now }
    }

    /// A picker is stale when it HAD offered slots but every one has passed. An
    /// empty slot list is not "stale" — it's a not-yet-loaded / offline shape,
    /// handled separately.
    static func isStale(_ slots: [IntroductionSlot], now: Date = Date()) -> Bool {
        !slots.isEmpty && futureSlots(slots, now: now).isEmpty
    }

    /// Duration for the "Pick a time · N minutes" header — the first still-open
    /// slot's length, falling back to any slot's, then a 45-minute default.
    static func pickHeaderDuration(_ slots: [IntroductionSlot], now: Date = Date()) -> Int {
        futureSlots(slots, now: now).first?.durationMinutes
            ?? slots.first?.durationMinutes
            ?? 45
    }
}
