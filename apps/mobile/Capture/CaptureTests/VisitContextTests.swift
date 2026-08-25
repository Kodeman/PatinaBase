//  VisitContextTests.swift
//  CaptureTests
//
//  The visit spine (Field Companion wave 3, packages 3-2). Patina Field is not
//  live anywhere, so there is deliberately NO legacy-decode test here.

import Foundation
import Testing
@testable import CaptureKit

struct VisitContextTests {

    private let identity = CaptureSessionIdentity(userID: "u1", workspaceID: "w1")
    private let now = Date(timeIntervalSince1970: 1_800_000_000)

    @Test func aContextWithNoKindIsNotAVisit() {
        let context = CaptureSessionContext(identity: identity, startedAt: now, lastActivityAt: now)
        #expect(context.kind == nil)
        #expect(!context.isVisit)
    }

    @Test func aKindedContextIsAVisitUntilItEnds() {
        var context = CaptureSessionContext(identity: identity, startedAt: now,
                                            lastActivityAt: now, kind: .site,
                                            kit: .walkThrough, label: "Maple St")
        #expect(context.isVisit)
        context.endedAt = now.addingTimeInterval(600)
        #expect(!context.isVisit)
    }

    @Test func theVisitRoundTripsThroughCodable() throws {
        let context = CaptureSessionContext(
            identity: identity, startedAt: now, lastActivityAt: now,
            kind: .sourcing, kit: .install, label: "High Point 214",
            scanRoomID: "r1", projectsInMind: ["p1", "p2"], endedAt: nil)
        let data = try JSONEncoder().encode(context)
        let decoded = try JSONDecoder().decode(CaptureSessionContext.self, from: data)
        #expect(decoded == context)
        #expect(decoded.kit == .install)
        #expect(decoded.kit?.rawValue == "install")
    }

    @Test func kitRawValuesAreTheSchemaVocabulary() {
        #expect(FieldVisitKit.walkThrough.rawValue == "walk_through")
        #expect(FieldVisitKit.tradeWalk.rawValue == "trade_walk")
        #expect(FieldVisitKit.install.rawValue == "install")
        #expect(FieldVisitKind.allCases.map(\.rawValue) == ["site", "sourcing"])
    }

    private func visit(startedAt: Date, lastActivityAt: Date,
                       endedAt: Date? = nil) -> CaptureSessionContext {
        CaptureSessionContext(identity: identity, startedAt: startedAt,
                              lastActivityAt: lastActivityAt, kind: .site,
                              label: "Maple St", endedAt: endedAt)
    }

    /// PINNED, in every visit-state test. `now` is 1_800_000_000 =
    /// 2027-01-15T08:00:00Z; `.current` would put a 30-minute-old
    /// `lastActivityAt` on Jan 14 in US Pacific, where the
    /// never-across-a-calendar-day rule fires first and the state reads `.none`
    /// instead of `.stale`. The rule under test is a calendar rule, so the
    /// calendar is an input, never an ambient.
    private var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "America/Chicago")!
        return calendar
    }

    @Test func aFreshVisitIsActive() {
        // Bind ONCE. `visitID` defaults to `UUID()` (CaptureSessionContext.swift:57)
        // and `CaptureSessionContext` is Equatable over every stored property, so
        // two `visit(…)` calls can never compare equal.
        let context = visit(startedAt: now, lastActivityAt: now.addingTimeInterval(-60))
        let state = CaptureSessionContextPolicy.visitState(
            for: context, now: now, calendar: calendar)
        #expect(state == .active(context))
    }

    @Test func pastThirtyMinutesTheVisitGoesStaleNotAway() {
        let last = now.addingTimeInterval(-(CaptureSessionContextPolicy.staleConfirmWindow + 60))
        let context = visit(startedAt: last, lastActivityAt: last)
        let state = CaptureSessionContextPolicy.visitState(
            for: context, now: now, calendar: calendar)
        #expect(state == .stale(context))
    }

    @Test func pastTwelveHoursTheVisitAutoEnds() {
        let last = now.addingTimeInterval(-(CaptureSessionContextPolicy.autoEndWindow + 60))
        let state = CaptureSessionContextPolicy.visitState(
            for: visit(startedAt: last, lastActivityAt: last), now: now, calendar: calendar)
        #expect(state == .none)
    }

    @Test func aVisitNeverResumesAcrossACalendarDay() {
        let yesterday = calendar.date(byAdding: .day, value: -1, to: now)!
        // Inside both windows, but a different calendar day.
        let state = CaptureSessionContextPolicy.visitState(
            for: visit(startedAt: yesterday, lastActivityAt: now.addingTimeInterval(-60)),
            now: now, calendar: calendar)
        #expect(state == .none)
    }

    @Test func anEndedVisitReadsAsNone() {
        let state = CaptureSessionContextPolicy.visitState(
            for: visit(startedAt: now, lastActivityAt: now, endedAt: now),
            now: now, calendar: calendar)
        #expect(state == .none)
    }

    @Test func aBackwardsClockClosesTheVisitRatherThanTrustingIt() {
        // now < lastActivityAt: a manual clock change, or a DST/NTP correction.
        // Inherited from CaptureSessionContextPolicy.resolve
        // (CaptureSessionContext.swift:82). R3-1 frames a WRONG visit as the
        // systematic error, so refusing to resume is the safe branch — but it
        // silently drops an open visit, which is worth an explicit test.
        let state = CaptureSessionContextPolicy.visitState(
            for: visit(startedAt: now, lastActivityAt: now.addingTimeInterval(600)),
            now: now, calendar: calendar)
        #expect(state == .none)
    }

    @Test func endVisitActuallyEndsTheVisit() {
        let context = visit(startedAt: now.addingTimeInterval(-3600), lastActivityAt: now)
        let ended = CaptureSessionContextPolicy.ended(context, now: now)
        #expect(ended.visitID == context.visitID)   // the SAME visit, closed
        #expect(ended.endedAt == now)
        #expect(!ended.isVisit)
    }

    @Test func startingAVisitCarriesBothRoomLanesWithoutCrossing() {
        let draft = CaptureVisitDraft(kind: .site, kit: .walkThrough, label: "Maple St",
                                      projectID: "p1", projectName: "Maple St",
                                      projectRoomID: "sr1", scanRoomID: "r1", room: "Living")
        let context = CaptureSessionContextPolicy.started(draft, identity: identity, now: now)
        #expect(context.routing.projectRoomID == "sr1")
        #expect(context.scanRoomID == "r1")
        #expect(context.routing.projectID == "p1")
        #expect(context.routing.room == "Living")
        #expect(context.kit == .walkThrough)
        #expect(context.isVisit)
    }

    @Test func theKitCarriesTheConsentDefault() {
        #expect(CaptureVisitDraft(kind: .site, kit: .walkThrough).defaultNoteSetting == .conversation)
        #expect(CaptureVisitDraft(kind: .site, kit: .tradeWalk).defaultNoteSetting == .solo)
        #expect(CaptureVisitDraft(kind: .site, kit: .install).defaultNoteSetting == .solo)
        #expect(CaptureVisitDraft(kind: .site).defaultNoteSetting == .solo)
        #expect(CaptureVisitDraft(kind: .sourcing).defaultNoteSetting == .solo)
    }

    @Test func projectsInMindAreCappedAtFour() {
        let draft = CaptureVisitDraft(kind: .sourcing, label: "High Point 214",
                                      projectsInMind: ["a", "b", "c", "d", "e"])
        let context = CaptureSessionContextPolicy.started(draft, identity: identity, now: now)
        #expect(context.projectsInMind == ["a", "b", "c", "d"])
    }
}
