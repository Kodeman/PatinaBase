//  FieldRosterRules.swift
//  CaptureKit
//
//  W5's rules, stated once and unit-tested: which band a seat falls in, how a
//  phone becomes a `tel:` target, what the site access card may say about the
//  way in (PR-r: never a code), and how authority reads on a phone (PR-t: the
//  yes or the no, never the figure).
//
//  Pure value code — no SwiftUI, no SDK, no clock of its own. Every entry point
//  takes the date it should reckon against, so a test pins the week instead of
//  waiting for one.

import Foundation

// MARK: - The week

public enum FieldRosterWeek {
    /// Monday-to-Sunday, in the caller's own calendar but with the week pinned
    /// to Monday so "this week" means the same thing on every phone.
    public static func containing(_ date: Date,
                                  calendar: Calendar = .current) -> DateInterval {
        var cal = calendar
        cal.firstWeekday = 2
        if let week = cal.dateInterval(of: .weekOfYear, for: date) { return week }
        let day = cal.startOfDay(for: date)
        return DateInterval(start: day, duration: 7 * 24 * 60 * 60)
    }
}

// MARK: - Bands

public enum FieldRosterGrouping {
    /// Stage words that mean "asked, not yet on the job".
    private static let biddingStages: Set<String> = [
        "bidding", "prospect", "no_response", "no response", "declined"
    ]
    /// Stage words that mean "finished with".
    private static let doneStages: Set<String> = [
        "off_job", "off the job", "closed"
    ]

    /// Which band one seat belongs in, reckoned against `week`.
    ///
    /// Order is the rule, not a convenience: a seat that came off the job is
    /// done even if its window still covers today, and a bidder is bidding even
    /// though it has no window at all.
    public static func band(for seat: FieldRosterSeat,
                            week: DateInterval) -> FieldRosterBand {
        let stage = (seat.stageWord ?? "").lowercased()
        if seat.offJobAt != nil || doneStages.contains(stage) { return .done }
        if biddingStages.contains(stage) { return .bidding }

        let from = seat.onSiteFrom
        let to = seat.onSiteTo
        if from == nil, to == nil {
            // No window: a seat the studio calls live is here this week; every
            // other wordless seat is later, never silently promoted.
            return stage == "on the job" || stage == "on_the_job" || stage == "active"
                ? .thisWeek
                : .later
        }
        let start = from ?? week.start
        let end = to ?? week.end
        if start <= week.end && end >= week.start { return .thisWeek }
        if start > week.end { return .later }
        // The window closed before this week began and nobody dated the close.
        return .done
    }

    /// The roster in band order, each band's seats ordered the way the room
    /// reads them: this week and later by start date, bidding and done by name.
    public static func grouped(_ seats: [FieldRosterSeat],
                               week: DateInterval) -> [(band: FieldRosterBand, seats: [FieldRosterSeat])] {
        var buckets: [FieldRosterBand: [FieldRosterSeat]] = [:]
        for seat in seats {
            buckets[band(for: seat, week: week), default: []].append(seat)
        }
        return FieldRosterBand.allCases.compactMap { band in
            guard let rows = buckets[band], !rows.isEmpty else { return nil }
            return (band, sorted(rows, in: band))
        }
    }

    private static func sorted(_ seats: [FieldRosterSeat],
                               in band: FieldRosterBand) -> [FieldRosterSeat] {
        switch band {
        case .thisWeek, .later:
            return seats.sorted { lhs, rhs in
                let left = lhs.onSiteFrom ?? .distantPast
                let right = rhs.onSiteFrom ?? .distantPast
                if left != right { return left < right }
                return byName(lhs, rhs)
            }
        case .bidding, .done:
            return seats.sorted(by: byName)
        }
    }

    /// `sorted` is not stable, so the tie is decided rather than left to luck.
    private static func byName(_ lhs: FieldRosterSeat, _ rhs: FieldRosterSeat) -> Bool {
        let compared = lhs.displayName.localizedCaseInsensitiveCompare(rhs.displayName)
        if compared != .orderedSame { return compared == .orderedAscending }
        return lhs.id < rhs.id
    }
}

// MARK: - Reaching a phone

public enum FieldPhoneLine {
    /// The digits a `tel:` URL may carry, or nil when there is nothing to dial.
    ///
    /// `phone_e164` wins when the record holds one. Otherwise the displayed
    /// number is reduced to digits: ten digits take a `+1` (the studio's own
    /// country, the only one the fixture and the schema carry), eleven starting
    /// with 1 take a `+`, and anything already international keeps its own.
    /// A number too short to dial returns nil rather than a broken link.
    public static func dialable(e164: String? = nil, display: String? = nil) -> String? {
        if let e164 = normalizedE164(e164) { return e164 }
        guard let display else { return nil }
        let digits = display.filter(\.isNumber)
        switch digits.count {
        case 10:                                   return "+1\(digits)"
        case 11 where digits.hasPrefix("1"):       return "+\(digits)"
        case 11...15:                              return "+\(digits)"
        default:                                   return nil
        }
    }

    /// `tel:` URL for a row, or nil when nothing is dialable. The URL never
    /// carries punctuation: iOS dials the digits, the screen prints the words.
    public static func telURL(e164: String? = nil, display: String? = nil) -> URL? {
        guard let number = dialable(e164: e164, display: display) else { return nil }
        return URL(string: "tel:\(number)")
    }

    private static func normalizedE164(_ raw: String?) -> String? {
        guard let raw else { return nil }
        let trimmed = raw.trimmingCharacters(in: .whitespaces)
        guard trimmed.hasPrefix("+") else { return nil }
        let digits = trimmed.dropFirst().filter(\.isNumber)
        guard digits.count >= 8, digits.count <= 15 else { return nil }
        return "+\(digits)"
    }

    /// What the row reads when there is no number on file. A fact, not an
    /// empty string (R-V).
    public static let noPhone = "No phone on file"
}

// MARK: - The way in (PR-r)

public enum FieldSiteAccessRules {
    /// The standing sentence. Patina holds the lockbox version, the key holder,
    /// the hours and who was told — never the code.
    public static func wayIn(lockboxVersion: String?, askName: String?) -> String {
        let ask = (askName?.trimmingCharacters(in: .whitespaces)).flatMap { $0.isEmpty ? nil : $0 }
        let held = ask.map { "The code is held off Patina; ask \($0)." }
            ?? "The code is held off Patina; ask the key holder."
        guard let version = lockboxVersion?.trimmingCharacters(in: .whitespaces),
              !version.isEmpty else {
            return held
        }
        return "Lockbox, version \(version). \(held)"
    }

    /// True when free text carries something shaped like a code: a bare run of
    /// four to eight digits that is neither a phone number nor a year.
    ///
    /// The schema has no column for a code (00625), so the only way one reaches
    /// a phone is somebody typing it into the notes. This is what catches that.
    public static func looksLikeACode(_ text: String) -> Bool {
        // Ten or eleven digits altogether reads as a phone, and a phone is a
        // thing this surface exists to print.
        let total = text.filter(\.isNumber).count
        if total == 10 || total == 11 { return false }
        return digitRuns(in: text).contains { run in
            guard run.count >= 4, run.count <= 8 else { return false }
            if run.count == 4, let year = Int(run), (1900...2999).contains(year) { return false }
            return true
        }
    }

    private static func digitRuns(in text: String) -> [String] {
        var runs: [String] = []
        var current = ""
        for character in text {
            if character.isNumber {
                current.append(character)
            } else if !current.isEmpty {
                runs.append(current)
                current = ""
            }
        }
        if !current.isEmpty { runs.append(current) }
        return runs
    }

    /// Free text, with anything code-shaped withheld and the standing sentence
    /// put in its place. Applied to every free-text field on the card.
    public static func withholding(_ text: String?, askName: String?) -> String? {
        guard let text, !text.trimmingCharacters(in: .whitespaces).isEmpty else { return nil }
        guard looksLikeACode(text) else { return text }
        let ask = (askName?.trimmingCharacters(in: .whitespaces)).flatMap { $0.isEmpty ? nil : $0 }
        return ask.map { "The code is held off Patina; ask \($0)." }
            ?? "The code is held off Patina; ask the key holder."
    }

    /// R-U — the one-line summary at the head of the roster.
    public static func headLine(keyHolderName: String?, gateControl: String?,
                                changedAt: Date?) -> String? {
        var parts: [String] = []
        if let keyHolderName, !keyHolderName.isEmpty { parts.append("Key held by \(keyHolderName).") }
        if let gateControl, !gateControl.isEmpty { parts.append(gateControl) }
        if let changedAt { parts.append("Changed \(FieldPeopleDates.short(changedAt)).") }
        return parts.isEmpty ? nil : parts.joined(separator: " ")
    }

    /// PR-w, printed on the card so nobody has to ask.
    public static let studioOnly = "Studio only. This card never reaches a client page."
}

// MARK: - Authority (PR-t)

public enum FieldAuthorityWords {
    /// What a phone may say about an authority grant: the yes or the no, in
    /// words, with any figure taken out.
    ///
    /// PR-t is the whole reason this exists — a threshold belongs on the desk,
    /// where nobody is reading over the designer's shoulder on a job site.
    public static func phoneSafe(_ line: String) -> String {
        var out = ""
        var index = line.startIndex
        while index < line.endIndex {
            let character = line[index]
            if character == "$" || character.isNumber {
                // Swallow the whole figure — the currency mark, the digits, and
                // the separators INSIDE it. A separator is only part of the
                // figure when a digit follows it, so the full stop that ends the
                // sentence survives.
                while index < line.endIndex {
                    let here = line[index]
                    if here == "$" || here.isNumber {
                        index = line.index(after: index)
                        continue
                    }
                    guard here == "," || here == "." else { break }
                    let next = line.index(after: index)
                    guard next < line.endIndex, line[next].isNumber else { break }
                    index = line.index(after: next)
                }
                out += "an agreed amount"
                continue
            }
            out.append(character)
            index = line.index(after: index)
        }
        return out
            .replacingOccurrences(of: "  ", with: " ")
            .trimmingCharacters(in: .whitespaces)
    }

    /// Every authority line on a seat, made phone-safe and de-duplicated in
    /// the order the record gave them.
    public static func phoneSafe(lines: [String]) -> [String] {
        var seen = Set<String>()
        return lines.compactMap { raw -> String? in
            let trimmed = raw.trimmingCharacters(in: .whitespaces)
            guard !trimmed.isEmpty else { return nil }
            let safe = phoneSafe(trimmed)
            guard !safe.isEmpty, seen.insert(safe).inserted else { return nil }
            return safe
        }
    }

    /// The fallback a card prints rather than an empty region (R-V).
    public static let none = "No grant on file."

    /// One authority row (E12) as a sentence a phone may carry.
    ///
    /// `threshold_cents` is deliberately absent from the argument list, and the
    /// real service never selects the column: PR-t is enforced by not fetching
    /// the figure, not by remembering to hide it.
    public static func sentence(scope: String, preparesOnly: Bool) -> String {
        if preparesOnly { return "Prepares only." }
        switch scope {
        case "money":        return "May sign money on this job, up to an agreed amount."
        case "change_order": return "May approve a change order."
        case "draw_certify": return "May certify a draw."
        case "selections":   return "Makes selections."
        case "schedule":     return "Sets the schedule."
        case "site_access":  return "Controls the gate."
        case "key":          return "Holds a key."
        default:             return scope.replacingOccurrences(of: "_", with: " ") + "."
        }
    }
}

// MARK: - The words the columns carry

/// The four families again, this time as the map from what Postgres stores to
/// what the room prints (direction §3.8). Stated once so the roster row, the
/// person card and the site access card can never disagree.
public enum FieldPeopleVocabulary {
    /// `people_directory.reach_state`
    public static func reach(_ raw: String?) -> String {
        switch raw {
        case "account":    return "Account"
        case "field_link": return "Field link"
        default:           return "On paper"
        }
    }

    /// `studio_channel_consent.status`, as the record's verdict (R-AY). Nil
    /// stays nil: a word nobody can read is not "Not asked".
    public static func consent(_ raw: String?) -> String? {
        switch raw {
        case "granted":   return "Texting"
        case "pending":   return "Invited"
        case "opted_out": return "Opted out"
        case "not_asked": return "Not asked"
        default:          return nil
        }
    }

    /// `compliance_state()`
    public static func paper(_ raw: String?) -> String? {
        switch raw {
        case "current":      return "Current"
        case "lapses_soon":  return "Lapses in 30 days"
        case "lapsed":       return "Lapsed"
        case "not_on_file":  return "Not on file"
        default:             return nil
        }
    }

    /// `project_parties.stage`
    public static func stage(_ raw: String?) -> String? {
        switch raw {
        case "prospect":    return "Prospect"
        case "invited":     return "Invited"
        case "bidding":     return "Bidding"
        case "declined":    return "Declined"
        case "no_response": return "No response"
        case "awarded":     return "Awarded"
        case "mobilized":   return "Awarded"
        case "active":      return "On the job"
        case "closeout":    return "Closing out"
        case "warranty":    return "Warranty"
        case "off_job":     return "Off the job"
        case "retired":     return "Off the job"
        default:            return nil
        }
    }

    /// `project_parties.party_kind`, in the words the room uses.
    public static func kind(_ raw: String?) -> String? {
        guard let raw, !raw.isEmpty else { return nil }
        switch raw {
        case "gc":         return "gc"
        case "client_rep": return "household member"
        case "other":      return nil
        default:           return raw.replacingOccurrences(of: "_", with: " ")
        }
    }
}

// MARK: - Dates and freshness

public enum FieldPeopleDates {
    private static let shortFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "d MMM yyyy"
        return formatter
    }()

    private static let longFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "d MMMM yyyy"
        return formatter
    }()

    /// "16 Oct 2026"
    public static func short(_ date: Date) -> String { shortFormatter.string(from: date) }
    /// "13 August 2027"
    public static func long(_ date: Date) -> String { longFormatter.string(from: date) }

    /// The offline line: what a cached copy says about its own age. Ink, never
    /// a spinner (ux-4-field-mobile §6).
    public static func lastLoaded(_ stamp: Date, now: Date = Date()) -> String {
        let seconds = max(0, now.timeIntervalSince(stamp))
        switch seconds {
        case ..<90:      return "Last loaded just now"
        case ..<3_600:   return "Last loaded \(Int(seconds / 60)) minutes ago"
        case ..<86_400:  return "Last loaded \(Int(seconds / 3_600)) hours ago"
        default:         return "Last loaded \(short(stamp))"
        }
    }
}

// MARK: - When a field link ends (PR-d)

/// What a minted field link actually ends on, and the sentence that says so.
///
/// `create_field_link` (00627) decides the date server-side and its
/// `RETURNS TABLE (id, token)` carries no expiry column, so the phone cannot
/// read the answer back — it computes the same one from the same facts. The
/// rule, mirrored from the migration: the seat's window end (the later of
/// `on_site_to` and `warranty_until`) through the END of that day, while that
/// day is still ahead; otherwise the ninety-day default a windowless or
/// closed-window seat falls back to.
///
/// A seat minted from the phone carries no window at all — the sheet has no
/// field for one — so the fallback is the branch this surface actually takes,
/// and it prints a real date rather than a promise about a window that does
/// not exist.
public enum FieldLinkExpiry {
    /// 00627's own fallback, in days.
    public static let fallbackDays = 90

    /// The date the link stops working, and the sentence the mint result prints.
    public struct Window: Sendable, Hashable {
        /// The instant the token stops working.
        public let endsAt: Date
        /// The last day it works, as the sentence prints it.
        public let lastDay: Date
        /// True when the job's own window dated it; false on the ninety-day
        /// default.
        public let isJobWindow: Bool
        public let sentence: String
    }

    public static func resolve(windowEnd: Date?, now: Date = Date()) -> Window {
        // `+ interval '1 day'` in the migration: through the end of that day.
        if let windowEnd, windowEnd.addingTimeInterval(oneDay) > now {
            return Window(endsAt: windowEnd.addingTimeInterval(oneDay),
                          lastDay: windowEnd,
                          isJobWindow: true,
                          sentence: "Ends with the job, \(FieldPeopleDates.long(windowEnd)).")
        }
        let ends = now.addingTimeInterval(Double(fallbackDays) * oneDay)
        return Window(endsAt: ends,
                      lastDay: ends,
                      isJobWindow: false,
                      sentence: "The job carries no window yet, so it ends "
                          + "\(FieldPeopleDates.long(ends)) — ninety days from today.")
    }

    private static let oneDay: TimeInterval = 24 * 60 * 60
}
