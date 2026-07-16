//
//  DesignRequestIntroductionDecodeTests.swift
//  PatinaTests
//
//  Pins the `match_ceremonies` embed decode + end-to-end stage derivation
//  against a realistic `leads` select payload (Arrival Arc, R106 §6).
//
//  Fixture: `Fixtures/lead_introduction_fixture.json` — a THREE-element array
//  in the exact shape `DesignRequestStatusService.selectColumns` returns:
//    [0] HELD       — designer_id set, status "new", match_ceremonies null
//    [1] INTRODUCED — embed present, state "sent", 3 slots, picked fields null
//    [2] BOOKED     — embed present, state "picked", picked_slot_id/starts_at set
//  Timestamps carry timezone offsets; some include fractional seconds and some
//  don't, exercising both branches of the tolerant date parse.
//
//  Loaded relative to `#filePath` (the tests run on this machine — there is no
//  iOS CI), which sidesteps any bundle-resource build-phase question.
//

import Testing
import Foundation
@testable import Patina

@MainActor
struct DesignRequestIntroductionDecodeTests {

    private func fixtureData(_ name: String) throws -> Data {
        let dir = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        let url = dir.appendingPathComponent("Fixtures/\(name).json")
        return try Data(contentsOf: url)
    }

    private func decodedFixture() throws -> [DesignRequestStatus] {
        try DesignRequestStatusService.decodeStatuses(fixtureData("lead_introduction_fixture"))
    }

    // MARK: - All three variants decode

    @Test
    func allThreeVariantsDecode() throws {
        let statuses = try decodedFixture()
        #expect(statuses.count == 3)

        let stages = Set(statuses.map(\.stage))
        #expect(stages == [.held, .introduced, .booked])
    }

    // MARK: - Held

    @Test
    func heldVariantHasNoEmbedAndDerivesHeld() throws {
        let statuses = try decodedFixture()
        let held = try #require(statuses.first { $0.stage == .held })

        #expect(held.introduction == nil)          // draft ceremony arrives as null
        #expect(held.designerId != nil)            // claimed
        #expect(held.statusRaw == "new")
        #expect(held.stage == .held)
    }

    // MARK: - Introduced

    @Test
    func introducedVariantDecodesEmbedAndDerivesIntroduced() throws {
        let statuses = try decodedFixture()
        let introduced = try #require(statuses.first { $0.stage == .introduced })
        let intro = try #require(introduced.introduction)

        #expect(intro.state == "sent")
        #expect(intro.pickedSlotId == nil)
        #expect(intro.pickedSlotStartsAt == nil)
        #expect(intro.slots.count == 3)
        #expect(intro.introText?.isEmpty == false)
        #expect(intro.credentialLine == "Principal, Middle Studio · 12 years in residential")
        #expect(intro.portfolioUrl == "https://middlestudio.example/portfolio")
        #expect(intro.timezone == "America/Chicago")
        #expect(intro.threadId != nil)
        #expect(intro.offeredAt != nil)            // fractional-seconds timestamp parsed

        // First slot: "2026-07-22T14:00:00-05:00" (no fractional seconds), 30 min.
        let firstSlot = try #require(intro.slots.first)
        #expect(firstSlot.durationMinutes == 30)
        let expected = ISO8601DateFormatter().date(from: "2026-07-22T14:00:00-05:00")
        #expect(firstSlot.startsAt == expected)

        // Slots preserve their wire order.
        #expect(intro.slots.map(\.durationMinutes) == [30, 30, 45])

        #expect(introduced.stage == .introduced)   // sent intro overrides status "new"
        #expect(introduced.statusRaw == "new")
    }

    // MARK: - Booked

    @Test
    func bookedVariantDecodesPickedSlotAndDerivesBooked() throws {
        let statuses = try decodedFixture()
        let booked = try #require(statuses.first { $0.stage == .booked })
        let intro = try #require(booked.introduction)

        #expect(intro.state == "picked")
        #expect(intro.pickedSlotId != nil)
        #expect(intro.pickedSlotStartsAt != nil)
        #expect(intro.slots.count == 3)

        // The picked slot id matches one of the offered slots.
        #expect(intro.slots.map(\.id).contains(intro.pickedSlotId!))

        // picked_slot_starts_at == "2026-07-24T16:00:00-05:00".
        let expected = ISO8601DateFormatter().date(from: "2026-07-24T16:00:00-05:00")
        #expect(intro.pickedSlotStartsAt == expected)

        #expect(booked.stage == .booked)           // picked intro overrides status "contacted"
        #expect(booked.statusRaw == "contacted")
    }

    // MARK: - Booked card title uses the picked slot

    @Test
    func bookedCardTitleCarriesTheSlotTime() throws {
        let statuses = try decodedFixture()
        let booked = try #require(statuses.first { $0.stage == .booked })

        let title = booked.stage.cardTitle(bookedSlotStartsAt: booked.introduction?.pickedSlotStartsAt)
        #expect(title.hasPrefix("Discovery · "))
        #expect(title != "Discovery call booked")   // the slot time was threaded through
    }
}
