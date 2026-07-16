//
//  MatchIntroductionLogicTests.swift
//  PatinaTests
//
//  Pins the pure logic behind the Match Ceremony's client screen (Arrival Arc,
//  R106 §6): slot label formatting (incl. the device/designer time-zone split),
//  stale detection at the boundary, the optimistic pick → `.booked` flip and its
//  revert, and the `client_pick` error-branch mapping. All deterministic — fixed
//  clock, locale, and time zone; no network, no view, no SwiftData.
//

import Testing
import Foundation
@testable import Patina

struct MatchIntroductionLogicTests {

    private let enUS = Locale(identifier: "en_US")
    private let chicago = TimeZone(identifier: "America/Chicago")!
    private let newYork = TimeZone(identifier: "America/New_York")!

    /// 2026-07-23 14:00 in Chicago (CDT, -05:00).
    private var chicagoAfternoon: Date {
        ISO8601DateFormatter().date(from: "2026-07-23T14:00:00-05:00")!
    }

    private func slot(_ offset: TimeInterval, duration: Int = 30) -> IntroductionSlot {
        IntroductionSlot(id: UUID(), startsAt: Date().addingTimeInterval(offset), durationMinutes: duration)
    }

    // MARK: - Slot label formatting (device-local zone)

    @Test
    func slotLabelShowsDayDateAndTimeInGivenZone() {
        let label = MatchSlotFormatting.slotLabel(for: chicagoAfternoon, timeZone: chicago, locale: enUS)
        #expect(label.contains("July"))
        #expect(label.contains("23"))
        #expect(label.contains("2:00"))
        #expect(label.contains("PM"))
        #expect(label.contains("·"))
        #expect(label.contains("Thursday"))
    }

    @Test
    func slotLabelHonorsTimeZone() {
        // The same instant reads 2:00 PM in Chicago, 3:00 PM in New York.
        let chi = MatchSlotFormatting.slotLabel(for: chicagoAfternoon, timeZone: chicago, locale: enUS)
        let nyc = MatchSlotFormatting.slotLabel(for: chicagoAfternoon, timeZone: newYork, locale: enUS)
        #expect(chi.contains("2:00"))
        #expect(nyc.contains("3:00"))
        #expect(chi != nyc)
    }

    // MARK: - "Her time" secondary label

    @Test
    func herTimeLabelAppearsOnlyWhenZonesDiffer() {
        // Device in New York, designer in Chicago → show her (earlier) time.
        // Assert structurally: iOS inserts a narrow no-break space (U+202F)
        // before "PM", so an exact-equality check on the whole string is brittle.
        let her = MatchSlotFormatting.herTimeLabel(
            for: chicagoAfternoon,
            designerTimeZoneIdentifier: "America/Chicago",
            deviceTimeZone: newYork,
            locale: enUS
        )
        #expect(her?.contains("2:00") == true)
        #expect(her?.contains("PM") == true)
        #expect(her?.hasSuffix("her time") == true)

        // Device and designer both in Chicago → nothing extra.
        let same = MatchSlotFormatting.herTimeLabel(
            for: chicagoAfternoon,
            designerTimeZoneIdentifier: "America/Chicago",
            deviceTimeZone: chicago,
            locale: enUS
        )
        #expect(same == nil)

        // Missing / unparseable identifier → nil.
        #expect(MatchSlotFormatting.herTimeLabel(
            for: chicagoAfternoon, designerTimeZoneIdentifier: nil, deviceTimeZone: newYork) == nil)
        #expect(MatchSlotFormatting.herTimeLabel(
            for: chicagoAfternoon, designerTimeZoneIdentifier: "Not/AZone", deviceTimeZone: newYork) == nil)
    }

    // MARK: - Stale detection boundary

    @Test
    func staleDetectionAtTheBoundary() {
        let now = Date()
        // A slot exactly at `now` is still bookable (>= now) — not stale.
        #expect(!MatchSlotFormatting.isStale([slot(0)], now: now))
        // One second past → stale (its only slot has gone).
        #expect(MatchSlotFormatting.isStale([slot(-1)], now: now))
        // Any future slot keeps the picker live.
        #expect(!MatchSlotFormatting.isStale([slot(-3_600), slot(3_600)], now: now))
        // An empty list is not "stale" — it's the not-yet-loaded shape.
        #expect(!MatchSlotFormatting.isStale([], now: now))
    }

    @Test
    func futureSlotsAndHeaderDuration() {
        let now = Date()
        let slots = [slot(-3_600, duration: 60), slot(3_600, duration: 30), slot(7_200, duration: 45)]
        let future = MatchSlotFormatting.futureSlots(slots, now: now)
        #expect(future.count == 2)
        #expect(future.map(\.durationMinutes) == [30, 45])

        // Header uses the first still-open slot's duration.
        #expect(MatchSlotFormatting.pickHeaderDuration(slots, now: now) == 30)
        // All past → falls back to the first slot's duration (not the default).
        #expect(MatchSlotFormatting.pickHeaderDuration([slot(-7_200, duration: 60)], now: now) == 60)
        // No slots → 45-minute default.
        #expect(MatchSlotFormatting.pickHeaderDuration([], now: now) == 45)
    }

    // MARK: - Optimistic pick flip + revert (the transforms applyPick/revertPick use)

    private func introducedStatus() -> DesignRequestStatus {
        let intro = IntroductionInfo(
            ceremonyId: UUID(),
            state: "sent",
            introText: "Let's talk.",
            credentialLine: "Principal",
            portfolioUrl: "https://example.test",
            slots: [slot(3_600, duration: 45)],
            timezone: "America/Chicago",
            offeredAt: Date().addingTimeInterval(-3_600),
            pickedSlotId: nil,
            pickedSlotStartsAt: nil,
            threadId: UUID(),
            createdAt: Date().addingTimeInterval(-3_600)
        )
        return DesignRequestStatus(
            leadId: UUID(),
            statusRaw: "new",
            designerId: UUID(),
            designerName: "Ada",
            projectTypeRaw: "full_room",
            budgetRange: nil,
            timeline: nil,
            requestDescription: nil,
            scanCount: 1,
            createdAt: Date(),
            updatedAt: nil,
            dismissedAt: nil,
            dismissedStageRaw: "finding",
            introduction: intro,
            studioName: "Middle Studio"
        )
    }

    @Test
    func pickingFlipsStageToBookedAndUnpickingRestoresIntroduced() throws {
        let status = introducedStatus()
        #expect(status.stage == .introduced)

        let intro = try #require(status.introduction)
        let pickedSlotId = try #require(intro.slots.first).id
        let pickedStart = try #require(intro.slots.first).startsAt

        // picking(...) → the shape applyPick stamps in-memory.
        let booked = status.withIntroduction(intro.picking(slotId: pickedSlotId, startsAt: pickedStart))
        #expect(booked.stage == .booked)
        #expect(booked.introduction?.state == "picked")
        #expect(booked.introduction?.pickedSlotId == pickedSlotId)
        #expect(booked.introduction?.pickedSlotStartsAt == pickedStart)

        // unpicked() → the shape revertPick restores.
        let reverted = booked.withIntroduction(booked.introduction?.unpicked())
        #expect(reverted.stage == .introduced)
        #expect(reverted.introduction?.state == "sent")
        #expect(reverted.introduction?.pickedSlotId == nil)
        #expect(reverted.introduction?.pickedSlotStartsAt == nil)
    }

    @Test
    func withIntroductionPreservesOtherFields() {
        let status = introducedStatus()
        let rebuilt = status.withIntroduction(status.introduction?.picking(
            slotId: status.introduction!.slots.first!.id,
            startsAt: status.introduction!.slots.first!.startsAt
        ))
        // Local + identity state must survive the rebuild.
        #expect(rebuilt.studioName == "Middle Studio")
        #expect(rebuilt.dismissedStageRaw == "finding")
        #expect(rebuilt.designerName == "Ada")
        #expect(rebuilt.leadId == status.leadId)
        #expect(rebuilt.budgetRange == status.budgetRange)
    }

    // MARK: - Error-branch mapping (client_pick)

    @Test
    func pickErrorBranchMapping() {
        #expect(PickIntroductionError.map(message: "already_picked") == .alreadyPicked)
        #expect(PickIntroductionError.map(message: "slot_stale") == .slotStale)
        #expect(PickIntroductionError.map(message: "not_found") == .notFound)
        // Case-insensitive on the raised slug.
        #expect(PickIntroductionError.map(message: "ALREADY_PICKED") == .alreadyPicked)
        // A slug embedded in a longer Postgres message still matches.
        #expect(PickIntroductionError.map(message: "ERROR: slot_stale (SQLSTATE P0001)") == .slotStale)
        // Anything else → generic retryable failure carrying the message.
        #expect(PickIntroductionError.map(message: "connection reset") == .failed("connection reset"))
    }
}
