//
//  DecisionDetailViewModel+Pace.swift
//  Patina
//
//  `P-28` / `R16`. "Remind me later", on one approval.
//
//  The rule the phone has to hold up its half of: **a snooze never suppresses
//  the overdue notice.** The server enforces that in `decision-reminders`; the
//  screen's job is to never PROMISE otherwise — so past its date the act is
//  not offered at all, and the sentence in its place says the reminders stay.
//  Offering a control that quietly does nothing is the worse failure.
//
//  Its own file because `DecisionsViewModel.swift` is at SwiftLint's 500-line
//  `file_length`.
//

import Foundation

extension DecisionDetailViewModel {

    /// The approval's date has passed.
    ///
    /// No due date is not past due: an approval with no `dueAt` never reaches
    /// the overdue notice at all, so there is nothing a snooze could be
    /// accused of suppressing.
    func approvalIsPastDue(now: Date = Date()) -> Bool {
        guard let dueAt = approvalReview?.dueAt,
              let due = ISO8601DateParsing.date(from: dueAt) else { return false }
        return due < now
    }

    /// Whether the act is offered at all: an open approval that is hers to
    /// answer, not yet answered in this session, and not past its date.
    func canSnoozeApproval(now: Date = Date()) -> Bool {
        guard let review = approvalReview else { return false }
        return review.canRespond
            && review.viewerAnswers
            && !hasAnsweredApproval
            && !approvalIsPastDue(now: now)
    }

    /// Whether the reason is drawn in the act's place: every leg of
    /// `canSnoozeApproval` except the date, which is the one that is failing.
    ///
    /// `r2 M2`. `canSnoozeApproval` going false is not on its own a past-due
    /// approval — it also goes false the moment she answers, because
    /// `record(_:)` sets `answeredOutcome` and never refetches the review, so
    /// `canRespond` stays true underneath. Read as "not snoozeable and past
    /// its date", the line "the reminders stay until it’s answered" draws
    /// directly beneath the mark recording that she answered it.
    func approvalPaceIsHeldByDate(now: Date = Date()) -> Bool {
        guard let review = approvalReview else { return false }
        return review.canRespond
            && review.viewerAnswers
            && !hasAnsweredApproval
            && approvalIsPastDue(now: now)
    }

    /// The four words, minus the one that needs a date this approval has not
    /// got. "When it's due" on an undated approval is an invented timing.
    var snoozeOptions: [DecisionSnooze] {
        DecisionSnooze.offered(hasDueDate: approvalReview?.dueAt != nil)
    }

    /// Ask Patina to wait.
    ///
    /// The confirmation is written only on success: a sentence saying "I'll
    /// ask you Sunday" over a write that did not land is the product lying
    /// about its own behaviour.
    func snoozeApproval(_ kind: DecisionSnooze, now: Date = Date()) async {
        guard !isSnoozing,
              canSnoozeApproval(now: now),
              let decisionId = approvalDecisionId else { return }
        isSnoozing = true
        snoozeFailed = false
        defer { isSnoozing = false }
        do {
            try await setDecisionSnooze(decisionId, kind)
            chosenSnooze = kind
        } catch {
            MoneyFailureCopy.log("decision snooze", error)
            snoozeFailed = true
        }
    }
}
