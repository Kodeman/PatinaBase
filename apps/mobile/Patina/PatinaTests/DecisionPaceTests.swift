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
    }

    /// `r1 M1`. The caption sits directly under a picker whose third option is
    /// "Once a week, on Sunday", and the backend mails that cadence ON Sunday
    /// morning (`notification-digest`'s `isDigestDue`). A caption claiming no
    /// Sunday mail contradicts the control above it; one claiming an 8pm
    /// ceiling on MAIL claims a gate that does not exist (only the push leg
    /// has one). The floor — nothing before 8am local — is the promise every
    /// leg keeps, and it is the one the sentence is allowed to make.
    @Test("the floor under the cadence promises only what every leg keeps")
    func theFloorDoesNotOutrunTheLegs() {
        let floor = DecisionPaceCopy.quietHours

        #expect(!floor.contains("Sunday"),
                "the caption contradicts the Sunday cadence in the picker above it")
        #expect(ReminderCadence.weeklySunday.label.contains("Sunday"),
                "the option the caption must not contradict has moved")

        // The 8pm ceiling belongs to the phone, not the post.
        #expect(floor.contains("buzzes between 8am and 8pm"),
                "the ceiling is stated without naming the leg that keeps it")
        #expect(floor.contains("never mails about an approval before 8am"))

        // Deferred, never dropped: R16's push leg holds the buzz to the next
        // morning, and the sentence may not imply the notice is lost.
        #expect(floor.contains("waits"))
        for word in ["overdue", "sorry", "gate", "task", "dashboard"] {
            #expect(!floor.lowercased().contains(word), "the floor says \(word)")
        }
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
        #expect(DecisionPaceCopy.onlyTheRemindersWait
                == "Still yours to answer; only the reminders wait.")
    }

    /// `r2 M1`. Every confirmation, pinned — not just one of the four. The
    /// sentence Patina says back is the only place it can promise something
    /// `R16` will make it break, and the string that did so
    /// ("I won’t ask again") was the one case this suite did not pin.
    ///
    /// Two rules, and both halves of every sentence carry them:
    ///
    ///   • It says what the SNOOZE does — hold the reminders — not what
    ///     Patina will do at that hour. `decisionMailHold` runs the cadence
    ///     gate after the snooze lifts, so "I’ll ask you tomorrow morning"
    ///     under `weekly_sunday` names a day Patina will not speak on.
    ///   • It names the two legs no snooze holds. `decision_overdue` returns
    ///     from `decisionMailHold` before the snooze test, and a superseding
    ///     edition is exempted from it.
    @Test("every confirmation says what the snooze holds, and what it cannot")
    func everyConfirmationIsHonestAboutTheHold() {
        #expect(DecisionSnooze.tomorrowMorning.holdsUntil
                == "I’ll hold the reminders until tomorrow morning.")
        #expect(DecisionSnooze.sunday.holdsUntil == "I’ll hold the reminders until Sunday.")
        #expect(DecisionSnooze.whenDue.holdsUntil
                == "I’ll hold the reminders until the day it’s due.")
        // `r3 M1`. The other three name an hour the row carries; this one
        // named a condition nothing in the rail can detect.
        #expect(DecisionSnooze.never.holdsUntil
                == "I’ll hold the reminders. Choose again here whenever you want them back.")

        #expect(DecisionPaceCopy.theTwoThatStillReachHer
                == "If the date passes or a new edition arrives, I’ll still say so.")

        for kind in DecisionSnooze.allCases {
            let said = kind.confirmation
            #expect(said == "\(kind.holdsUntil) \(DecisionPaceCopy.theTwoThatStillReachHer)")

            // The promise R16 makes Patina break, in every spelling it took.
            for broken in ["won’t ask again", "won’t ask", "never ask", "silence"] {
                #expect(!said.lowercased().contains(broken),
                        "\(kind.rawValue) promises \(broken), which R16 overrides")
            }
            // It promises a HOLD, never an hour Patina will speak at.
            #expect(!said.contains("I’ll ask you"),
                    "\(kind.rawValue) names an hour the cadence gate may not keep")
            #expect(said.contains("hold the reminders"))
            #expect(said.contains("I’ll still say so"))

            for word in ["overdue", "sorry", "gate", "task", "dashboard"] {
                #expect(!said.lowercased().contains(word), "\(kind.rawValue) says \(word)")
            }
        }
    }

    /// `never` is the one that most wants to over-promise: 00572 stores it as
    /// `snoozed_until = 'infinity'`, which is a standing quiet for the
    /// reminder leg and nothing more.
    ///
    /// `r3 M1`. It also wants to promise an END it cannot keep. "Until you
    /// come back" named a condition nothing in the rail watches for — the row
    /// stores `infinity` and no leg lifts it — so the sentence names the act
    /// that ends the hold instead, which is the menu drawn beside it.
    @Test("the standing snooze promises a standing hold, not a standing silence")
    func theStandingSnoozeIsStillInterrupted() {
        let said = DecisionSnooze.never.confirmation
        #expect(said == "I’ll hold the reminders. Choose again here whenever you want them back. "
                + "If the date passes or a new edition arrives, I’ll still say so.")
        #expect(said.contains("Choose again here"))
        #expect(said.contains("If the date passes or a new edition arrives"))
        // The end condition Patina cannot detect, in every spelling it took.
        for undetectable in ["until you come back", "when you come back", "when you’re ready"] {
            #expect(!said.lowercased().contains(undetectable),
                    "the standing snooze promises \(undetectable), which nothing detects")
        }
        #expect(DecisionSnooze.never.label == "Don’t remind me — I’ll come back")
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

    /// `r2 M2`. The reason drawn in the act’s place is not "not snoozeable
    /// and past its date" — answering an approval sets `answeredOutcome` and
    /// never refetches the review, so `canRespond` stays true and a past-due
    /// approval she has just answered would print "the reminders stay until
    /// it’s answered" directly beneath her own mark.
    @Test("a past-due approval she has answered draws neither the act nor the reason")
    func anAnsweredPastDueApprovalSaysNothing() throws {
        let viewModel = DecisionDetailViewModel()
        viewModel.approvalReview = try ProjectApprovalFixture.review()
        viewModel.answeredOutcome = .approved

        // The trap: every leg the old branch tested still reads "past due".
        #expect(viewModel.approvalIsPastDue(now: Self.afterDue))
        #expect(viewModel.approvalReview?.canRespond == true)
        #expect(!viewModel.canSnoozeApproval(now: Self.afterDue))

        #expect(!viewModel.approvalPaceIsHeldByDate(now: Self.afterDue),
                "the past-due line draws under an approval she has answered")
    }

    /// Unanswered and past its date is the one case the reason exists for.
    @Test("a past-due approval still open says the reminders stay")
    func anOpenPastDueApprovalSaysTheReminderStays() throws {
        let viewModel = DecisionDetailViewModel()
        viewModel.approvalReview = try ProjectApprovalFixture.review()

        #expect(viewModel.approvalPaceIsHeldByDate(now: Self.afterDue))
        #expect(!viewModel.approvalPaceIsHeldByDate(now: Self.beforeDue))
    }

    /// A reader who is not the one being asked is told nothing about a pace
    /// that was never hers to set (`IOSC-R2-07`, applied to the reason too).
    @Test("a reader who is not the one asked is given no past-due reason either")
    func anObserverIsGivenNoReason() throws {
        let viewModel = DecisionDetailViewModel()
        viewModel.approvalReview = try ProjectApprovalFixture.review(viewerRole: "studio")

        #expect(!viewModel.approvalPaceIsHeldByDate(now: Self.afterDue))
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
        // `r3 M1`: the act is drawn whether or not a snooze already stands.
        // `never`'s sentence says to choose again HERE, and a menu that
        // vanished the moment she chose would leave the hold with no way back.
        let said = try #require(code.range(of: "approval.snooze.confirmation"))
        let act = try #require(code.range(of: "accessibilityIdentifier(\"approval.snooze\")"))
        #expect(!code[said.upperBound..<act.lowerBound].contains("else"),
                "the act is drawn only while no snooze stands")
        // r2 M2: the reason is drawn on its own predicate, never on the date
        // alone — answering leaves `canRespond` true underneath it.
        #expect(code.contains("viewModel.approvalPaceIsHeldByDate()"))
        #expect(!code.contains("viewModel.approvalReview?.canRespond == true"))
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

/// `P-28` / `r3 M1`. The snooze, read back.
///
/// Its own suite rather than four more cases on `DecisionPaceTests`: that
/// struct is at SwiftLint's 300-line `type_body_length`, the same limit that
/// split `DecisionDetailViewModel+Pace.swift` off its class.
@MainActor
struct DecisionSnoozeReadBackTests {

    /// A hold she set is the server's, not the screen's: it has to survive the
    /// screen going away. `standing(…)` is the honest half of that — a hold
    /// that has already lifted is not a hold, and drawing "until Sunday" on
    /// the Monday after is the same lie in the other direction.
    @Test("a row still holding is read back; one that has lifted is not")
    func aStandingRowIsReadBack() {
        let now = ISO8601DateParsing.date(from: "2026-09-06T12:00:00Z")!

        #expect(DecisionSnooze.standing(
            kind: "sunday", snoozedUntil: "2026-09-07T12:00:00Z", now: now
        ) == .sunday)

        // 'never' and a dateless 'when_due' are both stored as infinity.
        #expect(DecisionSnooze.standing(
            kind: "never", snoozedUntil: "infinity", now: now
        ) == .never)

        // Lifted, so the act is offered again rather than a stale sentence.
        #expect(DecisionSnooze.standing(
            kind: "tomorrow_morning", snoozedUntil: "2026-09-05T12:00:00Z", now: now
        ) == nil)

        // Nothing to say, and nothing invented from a shape we do not know.
        #expect(DecisionSnooze.standing(kind: nil, snoozedUntil: nil, now: now) == nil)
        #expect(DecisionSnooze.standing(kind: "sunday", snoozedUntil: nil, now: now) == nil)
        #expect(DecisionSnooze.standing(
            kind: "next_year", snoozedUntil: "infinity", now: now
        ) == nil)
        #expect(DecisionSnooze.standing(
            kind: "sunday", snoozedUntil: "not-a-date", now: now
        ) == nil)
    }

    @Test("the standing snooze survives re-entering the approval")
    func theSnoozeSurvivesReEntry() async throws {
        let viewModel = DecisionDetailViewModel()
        viewModel.approvalReview = try ProjectApprovalFixture.review()
        viewModel.fetchDecisionSnooze = { _ in
            RemoteDecisionSnooze(kind: "never", snoozedUntil: "infinity")
        }

        #expect(viewModel.chosenSnooze == nil)
        await viewModel.loadSnooze(
            decisionId: ProjectApprovalFixture.decisionId, now: beforeDue
        )
        #expect(viewModel.chosenSnooze == .never)
    }

    /// A read that failed says nothing. Silence about a hold is recoverable;
    /// a hold announced over a row that is not there is not.
    @Test("a read that did not land leaves the act where it was")
    func aFailedReadSaysNothing() async throws {
        struct Boom: Error {}
        let viewModel = DecisionDetailViewModel()
        viewModel.approvalReview = try ProjectApprovalFixture.review()
        viewModel.fetchDecisionSnooze = { _ in throw Boom() }

        await viewModel.loadSnooze(
            decisionId: ProjectApprovalFixture.decisionId, now: beforeDue
        )
        #expect(viewModel.chosenSnooze == nil)
        #expect(!viewModel.snoozeFailed, "a failed READ is not a failed write")
    }

    /// The row is read where the block that draws it lives, and the read is
    /// the table the write lands in.
    @Test("the approval reads its snooze back off the table the act writes")
    func theSnoozeIsReadBackFromTheTable() throws {
        let load = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Decisions/ViewModels/DecisionsViewModel.swift")
        )
        #expect(load.contains("await loadSnooze(decisionId: approvalDecisionId)"))

        let client = SourceScan.code(
            in: try SourcePin.read("Patina/Core/Network/DecisionsAPIClient+Pace.swift")
        )
        #expect(client.contains("\"decision_snoozes\""))
        #expect(client.contains("\"kind,snoozed_until\""))
    }

    /// The fixture's `dueAt` is 2026-09-11.
    private let beforeDue = ISO8601DateParsing.date(from: "2026-09-04T00:00:00Z")!
}
