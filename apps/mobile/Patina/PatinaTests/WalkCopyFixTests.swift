//
//  WalkCopyFixTests.swift
//  PatinaTests
//
//  The round-two walk's copy findings: the bell that went on asking for a
//  sign-off after the answer had landed (`W1R2-n4`), "Overdue" surviving in the
//  error ramp on the money rail (`iosa R3-02`), and an asked-on clause that
//  told no story (`W1R2-n1`).
//
//  Its own file for the same reason as `WalkCASAndFeedTests`: the suites these
//  came out of are at SwiftLint's length limits.
//

import Foundation
import Testing
@testable import Patina

@MainActor
struct BellApprovalTitleTests {

    private static let now = ISO8601DateFormatter().date(from: "2026-08-27T16:00:00Z")!

    /// An ordinary delivered row of some other kind, for the control.
    private static func delivered(
        type: AppNotificationType, entityId: String
    ) -> AppNotification {
        AppNotification(
            remoteId: "remote-\(entityId)",
            type: type,
            title: type.defaultTitle,
            body: "",
            timestamp: now,
            entityType: type.entityType,
            entityId: entityId
        )
    }

    // MARK: - W1R2-n4 · the bell says what the approval is now

    /// 00534:324 freezes "A sign-off needs you" into `metadata.title` when the
    /// approval is raised, and no row is ever rewritten — so every Stage-2
    /// approval in the bell wore that title for the rest of its life, answered
    /// ones included, in a word this program retired.
    @Test("an open approval is titled in the ruled vocabulary")
    func anOpenApprovalIsAnApproval() throws {
        let rows = NotificationsViewModel.retitleApprovals(
            [Self.raised(entityId: ProjectApprovalFixture.decisionId)],
            approvals: [try ProjectApprovalFixture.review()]
        )
        #expect(rows[0].title == "An approval needs you")
        #expect(!rows[0].title.contains("sign-off"))
    }

    @Test("a settled approval stops asking, and names the answer")
    func aSettledApprovalNamesItsAnswer() throws {
        for (outcome, sentence) in [
            ("approved", "You approved this edition."),
            ("changes_requested", "You returned this edition for revision."),
            ("needs_discussion", "You held this edition to talk it through with your designer.")
        ] {
            let rows = NotificationsViewModel.retitleApprovals(
                [Self.raised(entityId: ProjectApprovalFixture.decisionId)],
                approvals: [try ProjectApprovalFixture.review(
                    lifecycleStatus: "responded", outcome: outcome,
                    respondedAt: "2026-09-05T09:00:00+00:00"
                )]
            )
            #expect(rows[0].title == sentence)
        }
    }

    /// An answer landed but the projection did not name which one — the fact
    /// alone, which is all that can honestly be said.
    @Test("an answered approval with no outcome word says only that it landed")
    func anAnsweredApprovalWithoutAWordSaysSo() throws {
        let rows = NotificationsViewModel.retitleApprovals(
            [Self.raised(entityId: ProjectApprovalFixture.decisionId)],
            approvals: [try ProjectApprovalFixture.review(
                lifecycleStatus: "responded",
                respondedAt: "2026-09-05T09:00:00+00:00"
            )]
        )
        #expect(rows[0].title == "Your approval was recorded")
    }

    /// The disposition stands ahead of any outcome, the house's own precedence.
    @Test("a withdrawn or superseded approval stops asking too")
    func aClosedApprovalStopsAsking() throws {
        for disposition in ["withdrawn", "superseded"] {
            let rows = NotificationsViewModel.retitleApprovals(
                [Self.raised(entityId: ProjectApprovalFixture.decisionId)],
                approvals: [try ProjectApprovalFixture.review(disposition: disposition)]
            )
            #expect(rows[0].title == "This approval is closed")
        }
    }

    /// A row the projection does not cover keeps its claim; only the retired
    /// word is renamed, which needs no knowledge of the row's state.
    @Test("an uncovered row is renamed and nothing more")
    func anUncoveredRowIsOnlyRenamed() {
        let rows = NotificationsViewModel.retitleApprovals(
            [Self.raised(entityId: "some-other-decision")], approvals: []
        )
        #expect(rows[0].title == "An approval needs you")

        // …and a row that is not a decision at all is untouched.
        let invoice = NotificationsViewModel.retitleApprovals(
            [Self.delivered(type: .invoice, entityId: "i-1")], approvals: []
        )
        #expect(invoice[0].title == AppNotificationType.invoice.defaultTitle)
    }

    /// The retitle runs on the delivered rows the feed builds, before they are
    /// merged with the Studio stand-ins.
    @Test("the feed retitles what it loaded")
    func theFeedRetitlesWhatItLoaded() throws {
        let code = try SourcePin.readCode(
            "Patina/Features/Notifications/ViewModels/NotificationsViewModel.swift"
        )
        #expect(code.contains("Self.retitleApprovals("))
        #expect(code.contains("approvals: BadgeCountService.shared.projectApprovals"))
    }

    /// A row carrying the frozen title, exactly as 00534 writes it.
    private static func raised(entityId: String) -> AppNotification {
        AppNotification(
            remoteId: "remote-\(entityId)",
            type: .decision,
            title: "A sign-off needs you",
            body: "Approve the kitchen millwork as drawn?",
            timestamp: now,
            entityType: "decision",
            entityId: entityId
        )
    }
}

@MainActor
struct MoneyPastDueCopyTests {

    // MARK: - iosa R3-02 · the retired word leaves the money rail too

    /// "Overdue · Aug 21" in `PatinaColors.Text.error` survived on the invoice
    /// list, the invoice detail and the Studio's money row. The refusal is the
    /// same on every surface: the fact that a date has passed is a debt's to
    /// state, the alarm register is not (ruled, 2026-09-05).
    @Test("a passed money date reads past due, in body ink, on every surface")
    func moneyPastDueIsTheRuledLine() throws {
        let now = try #require(ISO8601DateFormatter().date(from: "2026-08-27T16:00:00Z"))
        let past = try #require(DateDisplay.due("2026-08-22", now: now))
        #expect(past.text == "Past due \u{00B7} Aug 22")
        #expect(past.isPastDue, "the fact survives; only the word and the ink changed")

        let helper = try SourcePin.readCode("Patina/Features/Shared/DateDisplay.swift")
        #expect(!helper.contains("Overdue"), "the retired word is back in the helper")

        // The Studio's money row reads the same helper — so the hub says the
        // new line too — and the hub has never painted a meta line red.
        let builder = try SourcePin.readCode(
            "Patina/Features/Profile/ViewModels/StudioQueueBuilder.swift"
        )
        #expect(builder.contains("DateDisplay.due(date, now: now).text"))
        let hub = try SourcePin.readCode("Patina/Features/Profile/Views/StudioHubView.swift")
        #expect(!hub.contains("PatinaColors.Text.error"))

        for file in [
            "Patina/Features/Invoices/Views/InvoiceListView.swift",
            "Patina/Features/Invoices/Views/InvoiceDetailView.swift"
        ] {
            let source = try SourcePin.readCode(file)
            #expect(!source.contains("isPastDue ? PatinaColors.Text.error"),
                    "\(file) still paints a passed money date red")
            #expect(source.contains("isPastDue ? PatinaColors.Text.primary"),
                    "\(file) no longer reads the passed date in body ink")
        }
    }

    // MARK: - W1R2-n1 · a clause that tells no story does not print

    /// "Still open, Leah asked on Sep 4." under a date of Sep 4 says the studio
    /// asked and ran out of time in the same breath. Where the asked-on day is
    /// not BEFORE the day it was wanted by, the clause goes.
    @Test("the asked-on clause goes when it is not before the date")
    func theAskedOnClauseNeedsAStory() throws {
        let now = try #require(ISO8601DateFormatter().date(from: "2026-09-10T16:00:00Z"))
        // Asked the same day it was wanted by.
        #expect(DateDisplay.approval(
            dueDate: "2026-09-04", askedAt: "2026-09-04T09:00:00Z",
            designer: "Leah", now: now
        ) == DateDisplay.ApprovalLine(text: "Still open.", isStillOpen: true))
        // Asked after it was wanted by.
        #expect(DateDisplay.approval(
            dueDate: "2026-09-04", askedAt: "2026-09-06T09:00:00Z",
            designer: "Leah", now: now
        ) == DateDisplay.ApprovalLine(text: "Still open.", isStillOpen: true))
        // And the day before it still tells the story it always did.
        #expect(DateDisplay.approval(
            dueDate: "2026-09-04", askedAt: "2026-09-03T09:00:00Z",
            designer: "Leah", now: now
        ) == DateDisplay.ApprovalLine(
            text: "Still open, Leah asked on Sep 3.", isStillOpen: true
        ))
    }
}
