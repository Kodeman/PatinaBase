//
//  DecisionPace.swift
//  Patina
//
//  `P-28` / `R16`. She sets the pace.
//
//  Two controls, in her words rather than the column's:
//
//   • THE CADENCE, in Settings — how often Patina checks in at all. Three
//     named options, widened from the two-value `notification_preferences
//     .reminder_cadence` (00278). The default is the quietest one that still
//     gets a real answer on time; there is no dark default here.
//   • THE SNOOZE, on one open approval — "remind me later", in four words,
//     writing `decision_snoozes` through `set_decision_snooze`.
//
//  What a snooze may never do (`R16`, and it is not negotiable): suppress the
//  overdue notice or a superseding edition. Both bypass every user-controlled
//  cadence server-side, so the phone does not have to enforce it — but the
//  phone must not PROMISE otherwise, which is why a past-due approval is
//  offered no snooze at all and says why instead of quietly failing.
//

import Foundation

/// How often Patina checks in.
///
/// The wire values are the widened column's. The two the column carried
/// before it (00278: `immediate`, `daily_digest`) are read as the nearest of
/// these, and are what a write falls back to where a database has not taken
/// the widening yet — the backend lane widens it in the same wave, and a
/// homeowner must not meet a settings row that refuses to save either side of
/// that deploy.
public enum ReminderCadence: String, CaseIterable, Identifiable, Sendable {
    case rightAway = "right_away"
    case daily = "daily"
    case weeklySunday = "weekly_sunday"

    public var id: String { rawValue }

    /// Plain words, the same three the web's details sheet carries.
    var label: String {
        switch self {
        case .rightAway: return "Tell me right away"
        case .daily: return "Once a day"
        case .weeklySunday: return "Once a week, on Sunday"
        }
    }

    /// The two-value column's spelling of the same choice, where one exists.
    /// `weekly_sunday` is new and has none — a database still on the old CHECK
    /// cannot hold it, and the write says so rather than pretending.
    var legacyWireValue: String? {
        switch self {
        case .rightAway: return "immediate"
        case .daily: return "daily_digest"
        case .weeklySunday: return nil
        }
    }

    /// The quietest cadence that still gets a real answer on time.
    ///
    /// Not `rightAway`: a homeowner who hears about every edition the moment
    /// it is frozen turns Patina off, and the ladder (issue → 48 hours before
    /// → the day → overdue → stop) already carries the urgent legs whatever
    /// this is set to. Not `weeklySunday` either — a Sunday-only cadence can
    /// miss a Tuesday due date entirely, which is the "still gets an answer on
    /// time" half of the rule.
    public static let quietestHonest: ReminderCadence = .daily

    /// What the column says, in this build's words. Both spellings are
    /// understood; a value neither vocabulary knows reads as nil and the
    /// screen falls back to the default rather than inventing a fourth option.
    public static func from(wireValue: String?) -> ReminderCadence? {
        guard let key = wireValue?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased(), !key.isEmpty else { return nil }
        if let exact = ReminderCadence(rawValue: key) { return exact }
        return allCases.first { $0.legacyWireValue == key }
    }
}

/// "Remind me later", in her words.
///
/// The raw values are `decision_snoozes.kind`'s own, checked by
/// `set_decision_snooze`, so they are load-bearing.
public enum DecisionSnooze: String, CaseIterable, Identifiable, Sendable {
    case tomorrowMorning = "tomorrow_morning"
    case sunday = "sunday"
    case whenDue = "when_due"
    case never = "never"

    public var id: String { rawValue }

    var label: String {
        switch self {
        case .tomorrowMorning: return "Tomorrow morning"
        case .sunday: return "Sunday"
        case .whenDue: return "When it’s due"
        case .never: return "Don’t remind me — I’ll come back"
        }
    }

    /// What Patina says back, once. `R16`'s register: it names when it will
    /// ask, and never what she has failed to do.
    var confirmation: String {
        switch self {
        case .tomorrowMorning: return "I’ll ask you tomorrow morning."
        case .sunday: return "I’ll ask you Sunday."
        case .whenDue: return "I’ll ask you on the day it’s due."
        case .never: return "I won’t ask again. It’s here when you want it."
        }
    }

    /// The four, minus the one that needs a date the approval does not have.
    /// "When it's due" on an approval with no due date is an invented timing.
    static func offered(hasDueDate: Bool) -> [DecisionSnooze] {
        allCases.filter { hasDueDate || $0 != .whenDue }
    }
}

enum DecisionPaceCopy {

    // MARK: - Settings

    static let cadenceLabel = "Reminders"

    /// The floor, stated where she sets the pace. It is the one promise the
    /// push leg actually keeps (`R16`), so it is said plainly and not as a
    /// feature.
    static let quietHours =
        "Patina never sends an approval reminder before 8am or after 8pm, or on Sunday."

    // MARK: - The snooze

    static let remindMe = "Remind me"

    /// `P-28`'s ruled sentence. The answer is still hers; only the reminders
    /// move. No guilt, no apology, and no claim that anything has been
    /// resolved by waiting.
    static let onlyTheRemindersWait = "Still yours to answer; only the reminders wait."

    /// `R16`: the overdue notice cannot be snoozed, so the act is not offered
    /// over one. Stated as a fact about the paper, never about her — there is
    /// no lapse named and nobody is blamed for the date.
    static let pastItsDate =
        "This one is past its date. The reminders stay until it’s answered."

    /// The write did not land. It costs her the quiet, not the answer, and the
    /// sentence says exactly that much.
    static let snoozeFailed =
        "That didn’t save. The approval is still yours to answer whenever you like."
}
