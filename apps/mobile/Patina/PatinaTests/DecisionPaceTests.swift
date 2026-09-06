//
//  DecisionPaceTests.swift
//  PatinaTests
//
//  `P-28` / `R16`. She sets the pace.
//
//  The rule this suite exists for: a snooze may never suppress the overdue
//  notice. The server enforces it; the phone's half is that the act is not
//  offered over a past-due approval at all, and says so instead.
//

import Foundation
import Testing
@testable import Patina

@MainActor
struct DecisionPaceTests {

    // MARK: - The cadence

    @Test("the three cadences are plain words, not column values")
    func theCadencesArePlainWords() {
        #expect(ReminderCadence.allCases.count == 3)
        #expect(ReminderCadence.rightAway.label == "Tell me right away")
        #expect(ReminderCadence.daily.label == "Once a day")
        #expect(ReminderCadence.weeklySunday.label == "Once a week, on Sunday")
        for cadence in ReminderCadence.allCases {
            #expect(!cadence.label.contains("_"), "\(cadence.label) is a column value")
            #expect(cadence.label != cadence.rawValue)
        }
    }

    /// The widened column's three, and the two 00278 carried before it. Both
    /// vocabularies decode, because the backend widening lands in the same
    /// wave and a homeowner must not meet a row this build cannot read.
    @Test("both vocabularies of the cadence column are understood")
    func bothCadenceVocabulariesAreRead() {
        #expect(ReminderCadence.from(wireValue: "right_away") == .rightAway)
        #expect(ReminderCadence.from(wireValue: "daily") == .daily)
        #expect(ReminderCadence.from(wireValue: "weekly_sunday") == .weeklySunday)

        #expect(ReminderCadence.from(wireValue: "immediate") == .rightAway)
        #expect(ReminderCadence.from(wireValue: "daily_digest") == .daily)

        #expect(ReminderCadence.from(wireValue: " DAILY ") == .daily)
        #expect(ReminderCadence.from(wireValue: nil) == nil)
        #expect(ReminderCadence.from(wireValue: "hourly") == nil)
    }

    /// No dark defaults: the default is the quietest cadence that still gets
    /// an answer on time, which is neither the loudest nor the one that can
    /// miss a Tuesday date.
    @Test("the default cadence is the quietest honest one")
    func theDefaultIsQuiet() {
        #expect(ReminderCadence.quietestHonest == .daily)
        #expect(ReminderCadence.quietestHonest != .rightAway)
        #expect(ReminderCadence.quietestHonest != .weeklySunday)
        #expect(SettingsService.shared.reminderCadence != .rightAway)
    }

    @Test("Settings offers the three cadences and states the floor")
    func settingsCarriesTheCadenceAndTheFloor() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Settings/Views/SettingsView.swift")
        )
        #expect(code.contains("ForEach(ReminderCadence.allCases)"))
        #expect(code.contains("settings.setReminderCadence($0)"))
        #expect(code.contains("DecisionPaceCopy.quietHours"))
        #expect(DecisionPaceCopy.quietHours.contains("8am"))
        #expect(DecisionPaceCopy.quietHours.contains("8pm"))
        #expect(DecisionPaceCopy.quietHours.contains("Sunday"))
    }

    /// The column is read and written under its own name; the select has to
    /// ask for it or the row decodes with the default standing forever.
    @Test("the cadence column is both read and written")
    func theCadenceColumnIsReadAndWritten() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Services/Settings/SettingsService.swift")
        )
        #expect(code.contains("reminder_cadence"))
        #expect(code.contains("ReminderCadence.from(wireValue: row.reminder_cadence)"))
        // The old vocabulary is the fallback, so both sides of the backend
        // lane's widening save.
        #expect(code.contains("cadence.legacyWireValue"))
        #expect(ReminderCadence.rightAway.legacyWireValue == "immediate")
        #expect(ReminderCadence.daily.legacyWireValue == "daily_digest")
        // The option the widening ADDS has no old spelling to fall back to.
        #expect(ReminderCadence.weeklySunday.legacyWireValue == nil)
    }

    // MARK: - The snooze

    @Test("the snooze offers the four words, and its kinds are the column's")
    func theSnoozeCarriesFourWords() {
        #expect(DecisionSnooze.allCases.count == 4)
        #expect(DecisionSnooze.tomorrowMorning.rawValue == "tomorrow_morning")
        #expect(DecisionSnooze.sunday.rawValue == "sunday")
        #expect(DecisionSnooze.whenDue.rawValue == "when_due")
        #expect(DecisionSnooze.never.rawValue == "never")
        #expect(DecisionSnooze.sunday.confirmation == "I’ll ask you Sunday.")
        #expect(DecisionPaceCopy.onlyTheRemindersWait
                == "Still yours to answer; only the reminders wait.")
    }

    /// "When it's due" on an approval with no date is an invented timing.
    @Test("an approval with no date is not offered when-it-is-due")
    func anUndatedApprovalDropsWhenDue() {
        #expect(DecisionSnooze.offered(hasDueDate: true).count == 4)
        let undated = DecisionSnooze.offered(hasDueDate: false)
        #expect(undated.count == 3)
        #expect(!undated.contains(.whenDue))
    }

    @Test("an open approval that is hers to answer can be snoozed")
    func anOpenApprovalCanBeSnoozed() async throws {
        let viewModel = DecisionDetailViewModel()
        viewModel.approvalReview = try ProjectApprovalFixture.review()
        let sent = Recorder()
        viewModel.setDecisionSnooze = { id, kind in sent.record(id, kind) }

        #expect(viewModel.canSnoozeApproval(now: Self.beforeDue))
        await viewModel.snoozeApproval(.sunday, now: Self.beforeDue)

        #expect(sent.decisionId == ProjectApprovalFixture.decisionId)
        #expect(sent.kind == .sunday)
        #expect(viewModel.chosenSnooze == .sunday)
        #expect(!viewModel.snoozeFailed)
    }

    /// `R16`, the whole reason this suite exists. The overdue notice cannot be
    /// snoozed, so past its date the act is not offered — and the write is
    /// refused even if something calls it anyway.
    @Test("a past-due approval is offered no snooze, and refuses one")
    func aPastDueApprovalTakesNoSnooze() async throws {
        let viewModel = DecisionDetailViewModel()
        viewModel.approvalReview = try ProjectApprovalFixture.review()
        let sent = Recorder()
        viewModel.setDecisionSnooze = { id, kind in sent.record(id, kind) }

        #expect(viewModel.approvalIsPastDue(now: Self.afterDue))
        #expect(!viewModel.canSnoozeApproval(now: Self.afterDue))

        await viewModel.snoozeApproval(.sunday, now: Self.afterDue)
        #expect(sent.kind == nil, "a past-due approval wrote a snooze")
        #expect(viewModel.chosenSnooze == nil)
    }

    /// An approval with no date never reaches the overdue notice, so there is
    /// nothing a snooze could be accused of suppressing.
    @Test("an approval with no date is not past due")
    func anUndatedApprovalIsNotPastDue() throws {
        let viewModel = DecisionDetailViewModel()
        viewModel.approvalReview = try Self.undatedReview()

        #expect(!viewModel.approvalIsPastDue(now: Self.afterDue))
        #expect(viewModel.canSnoozeApproval(now: Self.afterDue))
        #expect(!viewModel.snoozeOptions.contains(.whenDue))
    }

    @Test("an approval already answered is offered no snooze")
    func anAnsweredApprovalTakesNoSnooze() throws {
        let viewModel = DecisionDetailViewModel()
        viewModel.approvalReview = try ProjectApprovalFixture.review()
        viewModel.answeredOutcome = .approved

        #expect(!viewModel.canSnoozeApproval(now: Self.beforeDue))
    }

    /// A studio co-member is not the one being asked, so the pace is not hers
    /// to set either (`IOSC-R2-07`'s rule, applied to this act).
    @Test("a reader who is not the one asked is offered no snooze")
    func anObserverTakesNoSnooze() throws {
        let viewModel = DecisionDetailViewModel()
        viewModel.approvalReview = try ProjectApprovalFixture.review(viewerRole: "studio")

        #expect(!viewModel.canSnoozeApproval(now: Self.beforeDue))
    }

    /// A sentence saying "I'll ask you Sunday" over a write that did not land
    /// is the product lying about its own behaviour.
    @Test("a failed write says so and promises nothing")
    func aFailedSnoozePromisesNothing() async throws {
        struct Boom: Error {}
        let viewModel = DecisionDetailViewModel()
        viewModel.approvalReview = try ProjectApprovalFixture.review()
        viewModel.setDecisionSnooze = { _, _ in throw Boom() }

        await viewModel.snoozeApproval(.tomorrowMorning, now: Self.beforeDue)

        #expect(viewModel.chosenSnooze == nil)
        #expect(viewModel.snoozeFailed)
        #expect(!DecisionPaceCopy.snoozeFailed.lowercased().contains("sorry"))
    }

    @Test("the screen draws the act, the sentence, and the past-due reason")
    func theScreenCarriesTheAct() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Decisions/Views/ProjectApprovalScreen.swift")
        )
        #expect(code.contains("DecisionPaceCopy.remindMe"))
        #expect(code.contains("DecisionPaceCopy.onlyTheRemindersWait"))
        #expect(code.contains("DecisionPaceCopy.pastItsDate"))
        #expect(code.contains("viewModel.canSnoozeApproval()"))
        // R8 / the refusals: the past-due line is a fact about the paper.
        for word in ["overdue", "sorry", "failed to", "you didn"] {
            #expect(!DecisionPaceCopy.pastItsDate.lowercased().contains(word),
                    "the past-due line says \(word)")
        }
    }

    @Test("the snooze is written through the RPC the backend lane defines")
    func theSnoozeCallsTheRPC() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Core/Network/DecisionsAPIClient+Pace.swift")
        )
        #expect(code.contains("\"set_decision_snooze\""))
        #expect(code.contains("\"p_decision_id\": decisionId, \"p_kind\": kind.rawValue"))
    }

    // MARK: - Fixtures

    /// The fixture's `dueAt` is 2026-09-11.
    private static let beforeDue = ISO8601DateParsing.date(from: "2026-09-04T00:00:00Z")!
    private static let afterDue = ISO8601DateParsing.date(from: "2026-09-22T00:00:00Z")!

    /// What the seam was handed. A reference box rather than a captured
    /// `var`, so the escaping closure has somewhere real to write.
    private final class Recorder: @unchecked Sendable {
        private(set) var decisionId: String?
        private(set) var kind: DecisionSnooze?
        func record(_ decisionId: String, _ kind: DecisionSnooze) {
            self.decisionId = decisionId
            self.kind = kind
        }
    }

    private static func undatedReview() throws -> RemoteProjectApprovalReview {
        let dated = try ProjectApprovalFixture.review()
        var row = try JSONSerialization.jsonObject(
            with: try JSONEncoder().encode(dated)
        ) as! [String: Any]
        row["dueAt"] = NSNull()
        return try JSONDecoder().decode(
            RemoteProjectApprovalReview.self,
            from: try JSONSerialization.data(withJSONObject: row)
        )
    }
}
