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

    /// When the held reminders are let go again.
    ///
    /// Deliberately not "I’ll ask you Sunday" (`r2 M1`). A snooze only
    /// UNBLOCKS the letter at its hour — `decisionMailHold` then runs the
    /// cadence gate underneath it, so under "Once a week, on Sunday" a Tuesday
    /// hour is a day Patina will not speak on. What the snooze itself does is
    /// hold, and holding is all this half of the sentence claims.
    var holdsUntil: String {
        switch self {
        case .tomorrowMorning: return "I’ll hold the reminders until tomorrow morning."
        case .sunday: return "I’ll hold the reminders until Sunday."
        case .whenDue: return "I’ll hold the reminders until the day it’s due."
        case .never: return "I’ll hold the reminders until you come back."
        }
    }

    /// What Patina says back, once: what the snooze moves, and the two things
    /// it cannot move.
    ///
    /// `R16` is not negotiable server-side and must not be softened here.
    /// `decisionMailHold` returns `null` for `decision_overdue` BEFORE the
    /// snooze test, and exempts a superseding edition from it
    /// (`!gate.isSupersedingEdition && isSnoozeActive(…)`). So no snooze —
    /// not even `never`, which 00572 stores as `snoozed_until = 'infinity'` —
    /// buys silence about a passed date or a new edition, and the sentence
    /// says so rather than promising a quiet Patina will break.
    var confirmation: String {
        "\(holdsUntil) \(DecisionPaceCopy.theTwoThatStillReachHer)"
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

    /// The floor, stated where she sets the pace — and stated only as far as
    /// every leg actually keeps it (`r1 M1`).
    ///
    /// Two facts, and no third: **no automated approval mail before 8am
    /// local** (`notification-digest`'s `LOCAL_MORNING_HOUR`, and
    /// `decision-notify`'s `before_local_morning` hold), and **the phone buzzes
    /// only between 8am and 8pm local** — 00572's `push_deliver_after` defers a
    /// push minted outside that window to the next 8am (`R16`). The buzz is
    /// DEFERRED, never dropped, which is why the sentence says it waits.
    ///
    /// What it deliberately no longer claims: an 8pm ceiling on mail (there is
    /// none — the ceiling is the push leg's), and "never on Sunday". The third
    /// cadence in the picker directly above this line is "Once a week, on
    /// Sunday", and `isDigestDue` mails it ON Sunday morning; a caption that
    /// contradicts the option above it is a false promise, whichever half the
    /// homeowner believes.
    static let quietHours =
        "Patina never mails about an approval before 8am, and your phone only "
        + "buzzes between 8am and 8pm — your own clock. Anything later waits "
        + "for the morning."

    // MARK: - The snooze

    static let remindMe = "Remind me"

    /// `P-28`'s ruled sentence. The answer is still hers; only the reminders
    /// move. No guilt, no apology, and no claim that anything has been
    /// resolved by waiting.
    static let onlyTheRemindersWait = "Still yours to answer; only the reminders wait."

    /// The two legs no snooze holds (`R16`). Said as the exception it is, in
    /// the same breath as the hold — a promise of silence Patina intends to
    /// break is worse than no snooze at all.
    static let theTwoThatStillReachHer =
        "If the date passes or a new edition arrives, I’ll still say so."

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
