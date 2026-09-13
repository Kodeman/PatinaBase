//  LogTimeSheetTests.swift
//  CaptureTests
//
//  H1 · An hour that is not a visit. The SHEET is a thin renderer; every
//  decision it makes is `FieldLogTimeDraft`'s or `FieldLogTimePolicy`'s, and
//  these are those decisions. The gate's test step runs `-scheme CaptureKit`
//  alone (C1), so anything left in the view is proven by a device pass and
//  nothing else — which is exactly why the decisions are not in the view.

import Foundation
import Testing
@testable import CaptureKit

@MainActor
struct LogTimeSheetTests {
    private let now = Date(timeIntervalSince1970: 1_800_000_000)

    private func openVisit(startedAt: Date,
                           projectID: String? = "6f1d1b9c-0000-4000-8000-000000000001",
                           projectName: String? = "Maple St") -> CaptureSessionContext {
        CaptureSessionContext(
            identity: CaptureSessionIdentity(userID: "u", workspaceID: "w"),
            startedAt: startedAt,
            lastActivityAt: startedAt,
            routing: CaptureRoutingMemory(destination: .library,
                                          projectID: projectID,
                                          projectName: projectName),
            kind: .site,
            label: projectName)
    }

    // MARK: three taps to a logged drive

    /// The walk LEAH-1 described: she is in the truck, a visit is open, she taps
    /// Hours. The project and the duration are already answered; `travel` is
    /// already the activity. Three taps — open the sheet, adjust to 45m, Log.
    @Test func threeTapsToALoggedDrive() throws {
        // Tap 1: the sheet opens, pre-filled from the visit it found.
        var draft = FieldLogTimeDraft(visit: openVisit(startedAt: now.addingTimeInterval(-30 * 60)),
                                      now: now)
        #expect(draft.projectID == "6f1d1b9c-0000-4000-8000-000000000001")
        #expect(draft.projectName == "Maple St")
        #expect(draft.durationMinutes == 30)
        #expect(draft.activity == .travel)
        #expect(draft.canLog)

        // Tap 2: a quarter hour more.
        draft.step(by: FieldLogTimeDraft.stepMinutes)
        #expect(draft.durationMinutes == 45)

        // Tap 3: Log. What it becomes is a durable record with 'travel' and an
        // explicit billable on it.
        let record = try #require(draft.record(entryID: UUID(),
                                               ownerUserID: UUID(), now: now))
        #expect(record.activity == .travel)
        #expect(record.activityRaw == "travel")
        #expect(record.source == "field_manual")
        #expect(record.durationMinutes == 45)
        #expect(record.billable)
    }

    @Test func theBillableAnswerIsCarriedThroughExactlyAsStated() throws {
        var draft = FieldLogTimeDraft(visit: openVisit(startedAt: now), now: now)
        draft.billable = false
        let record = try #require(draft.record(entryID: UUID(), ownerUserID: UUID()))
        #expect(record.billable == false)
    }

    // MARK: the pre-fill

    @Test func anOpenVisitPreFillsTheProjectAndTheElapsedMinutes() {
        let draft = FieldLogTimeDraft(
            visit: openVisit(startedAt: now.addingTimeInterval(-95 * 60)), now: now)
        #expect(draft.durationMinutes == 95)
        #expect(draft.startedAt == now.addingTimeInterval(-95 * 60))
    }

    /// A visit with no project pre-fills nothing to file the hour against, so
    /// the act is HELD — the sheet shows its picker rather than accepting input
    /// and saving nothing (CR-1).
    @Test func aVisitWithNoProjectCannotLogYet() {
        let draft = FieldLogTimeDraft(
            visit: openVisit(startedAt: now, projectID: nil, projectName: nil), now: now)
        #expect(draft.canLog == false)
        #expect(draft.record(entryID: UUID(), ownerUserID: UUID()) == nil)
    }

    @Test func noVisitFallsBackToHalfAnHourEndingNow() {
        let draft = FieldLogTimeDraft(visit: nil, now: now)
        #expect(draft.projectID == nil)
        #expect(draft.durationMinutes == FieldLogTimeDraft.defaultMinutes)
        #expect(draft.canLog == false)
    }

    /// A phone that has been carrying a forgotten visit since Tuesday must not
    /// propose eleven hours. `isVisit` is false once `endedAt` is stamped, and
    /// the draft then contributes neither the project nor the elapsed time.
    @Test func anEndedVisitContributesNothing() {
        var visit = openVisit(startedAt: now.addingTimeInterval(-11 * 3_600))
        visit.endedAt = now.addingTimeInterval(-3_600)
        let draft = FieldLogTimeDraft(visit: visit, now: now)
        #expect(draft.durationMinutes == FieldLogTimeDraft.defaultMinutes)
        #expect(draft.projectID == nil)
    }

    // MARK: the sheet can never express a nil duration (HT-7 / 00177:39-41)

    @Test func theDurationCanNeverReachZeroOrBelow() {
        var draft = FieldLogTimeDraft(visit: nil, now: now)
        for _ in 0..<20 { draft.step(by: -FieldLogTimeDraft.stepMinutes) }
        #expect(draft.durationMinutes == FieldLogTimeDraft.minimumMinutes)
        #expect(draft.canStepDown == false)
        #expect(draft.durationMinutes > 0)
    }

    @Test func theDurationIsBoundedAboveSoOneHeldThumbCannotBillTheYear() {
        var draft = FieldLogTimeDraft(visit: nil, now: now)
        for _ in 0..<200 { draft.step(by: FieldLogTimeDraft.stepMinutes) }
        #expect(draft.durationMinutes == FieldLogTimeDraft.maximumMinutes)
        #expect(draft.canStepUp == false)
    }

    @Test func aPreFillLongerThanTheBoundIsClamped() {
        let draft = FieldLogTimeDraft(
            visit: openVisit(startedAt: now.addingTimeInterval(-40 * 3_600)), now: now)
        #expect(draft.durationMinutes == FieldLogTimeDraft.maximumMinutes)
    }

    @Test func aSubMinuteVisitStillLogsAMinute() {
        let draft = FieldLogTimeDraft(
            visit: openVisit(startedAt: now.addingTimeInterval(-5)), now: now)
        #expect(draft.durationMinutes == FieldLogTimeDraft.minimumMinutes)
    }

    // MARK: the role chip appears only for a multi-role member (HT-41)

    @Test func oneRoleRaisesNoChip() {
        #expect(FieldLogTimePolicy.showsRoleChip(roles: []) == false)
        #expect(FieldLogTimePolicy.showsRoleChip(roles: [.leadDesigner]) == false)
    }

    @Test func twoRolesRaiseTheChip() {
        #expect(FieldLogTimePolicy.showsRoleChip(roles: [.leadDesigner, .vendor]))
    }

    /// A single-role member sends nothing — the server derives the role, and a
    /// pick that decides nothing is a tap that should never have been asked for.
    @Test func aSingleRoleMemberSendsNoRole() {
        #expect(FieldLogTimePolicy.resolvedRole(picked: .leadDesigner,
                                                roles: [.leadDesigner]) == nil)
    }

    /// A role she does not hold RAISES server-side (00601). It is dropped here
    /// rather than sent — the pick survives only while it is one of hers.
    @Test func aRoleSheDoesNotHoldIsNeverSent() {
        #expect(FieldLogTimePolicy.resolvedRole(picked: .bookkeeper,
                                                roles: [.leadDesigner, .vendor]) == nil)
    }

    @Test func aHeldRoleIsSentExactly() {
        #expect(FieldLogTimePolicy.resolvedRole(picked: .vendor,
                                                roles: [.leadDesigner, .vendor]) == .vendor)
    }

    @Test func theRoleReachesTheRecord() throws {
        var draft = FieldLogTimeDraft(visit: openVisit(startedAt: now), now: now)
        draft.rateRole = .supportDesigner
        let record = try #require(draft.record(entryID: UUID(), ownerUserID: UUID()))
        #expect(record.rateRoleRaw == "support_designer")
    }

    // MARK: the vocabulary matches the CHECKs

    /// 00616's admitted set, exactly. A value this enum grows that the CHECK
    /// does not admit is a 23514 on a road with no signal, retried to the
    /// ceiling and then lost.
    @Test func everyActivityIsOneTheConstraintAdmits() {
        #expect(Set(FieldTimeActivity.allCases.map(\.rawValue))
                == ["design", "sourcing", "client", "site_visit", "admin", "travel"])
    }

    /// 00600's `rate_role` CHECK. `client` is deliberately absent — it is a
    /// roster role, not one a rate card can price.
    @Test func everyRateRoleIsOneTheConstraintAdmits() {
        #expect(Set(FieldRateRole.allCases.map(\.rawValue))
                == ["lead_designer", "support_designer", "bookkeeper", "vendor"])
    }

    @Test func durationsAreSpelledTheWayTheVisitOfferSpellsThem() {
        #expect(FieldLogTimeDraft.durationLabel(minutes: 45) == "45m")
        #expect(FieldLogTimeDraft.durationLabel(minutes: 60) == "1h")
        #expect(FieldLogTimeDraft.durationLabel(minutes: 90) == "1h 30m")
    }

    // MARK: my hours this week (read-only, own scope)

    @Test func theWeekStartsOnMondayWhateverTheLocaleThinks() {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        // 2026-09-10 is a Thursday.
        let thursday = calendar.date(from: DateComponents(
            year: 2026, month: 9, day: 10, hour: 15))!
        let start = FieldHoursWeek.start(containing: thursday,
                                         timeZone: TimeZone(identifier: "UTC")!)
        let parts = calendar.dateComponents([.year, .month, .day, .hour], from: start)
        #expect(parts.year == 2026)
        #expect(parts.month == 9)
        #expect(parts.day == 7)
        #expect(parts.hour == 0)
    }

    /// HT-30 — a total with no rows beneath it is a dashboard, and is refused.
    @Test func anEmptyWeekHasNoTotal() {
        #expect(FieldHoursWeek.totalLabel([]) == nil)
    }

    @Test func theTotalIsTheSumOfTheRowsBeneathIt() {
        let rows = [hourRow(minutes: 45), hourRow(minutes: 90)]
        #expect(FieldHoursWeek.totalMinutes(rows) == 135)
        #expect(FieldHoursWeek.totalLabel(rows) == "2h 15m")
    }

    @Test func theNewestHourIsFirst() {
        let older = hourRow(minutes: 30, startedAt: now.addingTimeInterval(-7_200))
        let newer = hourRow(minutes: 30, startedAt: now)
        #expect(FieldHoursWeek.ordered([older, newer]).first?.id == newer.id)
    }

    /// HT-26 — "rate pending" is printed rather than left blank, because a blank
    /// made "legitimately non-billable" and "this hire has no rate" identical.
    @Test func anUnresolvedRateSaysSoRatherThanGoingBlank() {
        #expect(FieldHoursWeek.worthLabel(hourRow(rateSource: "none")) == "Rate pending")
        #expect(FieldHoursWeek.worthLabel(hourRow(billable: false)) == "Not billable")
        #expect(FieldHoursWeek.worthLabel(hourRow(billingState: "pending_authorization"))
                == "Awaiting authorization")
        #expect(FieldHoursWeek.worthLabel(hourRow()) == "Billable")
    }

    /// HT-24 — an hour with no activity says so, and never becomes "Design".
    @Test func anUnsetActivityIsNamedHonestly() {
        #expect(FieldHoursWeek.activityLabel(hourRow(activity: nil)) == "Activity not set")
        #expect(FieldHoursWeek.activityLabel(hourRow(activity: .travel)) == "Drive")
    }

    private func hourRow(minutes: Int = 60,
                         startedAt: Date? = nil,
                         activity: FieldTimeActivity? = .travel,
                         billable: Bool = true,
                         billingState: String? = "authorized",
                         rateSource: String? = "authority") -> FieldHourRow {
        FieldHourRow(id: UUID(), startedAt: startedAt ?? now,
                     projectName: "Maple St", minutes: minutes, activity: activity,
                     billable: billable, billingState: billingState,
                     rateSource: rateSource)
    }
}
