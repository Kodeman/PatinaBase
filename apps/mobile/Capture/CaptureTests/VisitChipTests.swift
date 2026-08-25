//  VisitChipTests.swift
//  CaptureTests
//
//  Invariant V on C1/C3/C5 (spec §7.2): the visit's project and room are
//  legible without a tap, and changing them is exactly one tap away.

import Foundation
import Testing
@testable import CaptureKit

struct VisitChipTests {

    private let identity = CaptureSessionIdentity(userID: "u1", workspaceID: "w1")
    private let now = Date(timeIntervalSince1970: 1_800_000_000)

    private func site(room: String?) -> CaptureVisitState {
        .active(CaptureSessionContext(
            identity: identity, startedAt: now, lastActivityAt: now,
            routing: CaptureRoutingMemory(destination: .inbox, projectID: "p1",
                                          projectName: "Maple St", room: room),
            kind: .site, label: "Maple St"))
    }

    @Test func siteVisitWithARoomShowsProjectOverRoom() {
        let chip = FieldVisitChipBuilder.chip(for: site(room: "Living"), isLocating: false)
        #expect(chip.primary == "Maple St")
        #expect(chip.secondary == "Living")
        #expect(!chip.isUnplaced)
    }

    @Test func siteVisitWithNoRoomReadsWholeHouse() {
        let chip = FieldVisitChipBuilder.chip(for: site(room: nil), isLocating: false)
        #expect(chip.primary == "Maple St")
        #expect(chip.secondary == "Whole house")
    }

    @Test func sourcingShowsTheVenueOverLibrary() {
        let state = CaptureVisitState.active(CaptureSessionContext(
            identity: identity, startedAt: now, lastActivityAt: now,
            routing: CaptureRoutingMemory(destination: .library),
            kind: .sourcing, label: "High Point 214"))
        let chip = FieldVisitChipBuilder.chip(for: state, isLocating: false)
        #expect(chip.primary == "High Point 214")
        #expect(chip.secondary == "Library")
    }

    @Test func noVisitReadsNotPlacedAndIsTerracotta() {
        let chip = FieldVisitChipBuilder.chip(for: .none, isLocating: false)
        #expect(chip.primary == "Not placed")
        #expect(chip.secondary == "Tap to place")
        #expect(chip.isUnplaced)
    }

    @Test func locatingKeepsTodaysString() {
        let chip = FieldVisitChipBuilder.chip(for: .none, isLocating: true)
        #expect(chip.primary == "Locating venue…")
        #expect(chip.secondary == "")
    }

    @Test func aStaleVisitStillNamesItselfRatherThanGoingBlank() {
        let stale = CaptureVisitState.stale(CaptureSessionContext(
            identity: identity, startedAt: now, lastActivityAt: now,
            routing: CaptureRoutingMemory(destination: .inbox, projectID: "p1",
                                          projectName: "Maple St", room: "Living"),
            kind: .site, label: "Maple St"))
        let chip = FieldVisitChipBuilder.chip(for: stale, isLocating: false)
        #expect(chip.primary == "Maple St")
        #expect(chip.secondary == "Living")
    }

    /// FC-R2: no visit is a NULL KIND. Routing memory alone is not a visit, and
    /// the chip must not claim one.
    @Test func aKindlessContextIsNotAVisit() {
        let kindless = CaptureVisitState.active(CaptureSessionContext(
            identity: identity, startedAt: now, lastActivityAt: now,
            routing: CaptureRoutingMemory(destination: .inbox, projectID: "p1",
                                          projectName: "Maple St", room: "Living")))
        let chip = FieldVisitChipBuilder.chip(for: kindless, isLocating: false)
        #expect(chip.primary == "Not placed")
        #expect(chip.isUnplaced)
    }

    @Test func noChipCopyEverSaysInbox() {
        let all = [
            FieldVisitChipBuilder.chip(for: site(room: "Living"), isLocating: false),
            FieldVisitChipBuilder.chip(for: .none, isLocating: false),
            FieldVisitChipBuilder.chip(for: .none, isLocating: true)
        ]
        for chip in all {
            #expect(!"\(chip.primary) \(chip.secondary)".lowercased().contains("inbox"))
        }
    }
}
