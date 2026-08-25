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

    /// The chip's subject is the visit, which is known synchronously. A
    /// transitional string must never name a lookup whose result the chip
    /// discards: "Locating venue…" settling to "Not placed" reads as a failure.
    /// Same words throughout; only the terracotta alarm waits.
    @Test func locatingNeverPromisesAVenueTheChipWillNotShow() {
        let chip = FieldVisitChipBuilder.chip(for: .none, isLocating: true)
        #expect(chip.primary == "Not placed")
        #expect(chip.secondary == "Tap to place")
        #expect(!chip.isUnplaced)
        #expect(!chip.primary.lowercased().contains("locating"))
        #expect(!chip.secondary.lowercased().contains("venue"))
    }

    @Test func aSourcingRunWithNoVenueNameStillReadsAsSourcing() {
        let state = CaptureVisitState.active(CaptureSessionContext(
            identity: identity, startedAt: now, lastActivityAt: now,
            routing: CaptureRoutingMemory(destination: .library),
            kind: .sourcing, label: nil))
        let chip = FieldVisitChipBuilder.chip(for: state, isLocating: false)
        #expect(chip.primary == "Sourcing")
        #expect(chip.secondary == "Library")
        #expect(!chip.isUnplaced)
    }

    @Test func aSiteVisitWithNothingToNameItFallsBackToThisVisit() {
        let state = CaptureVisitState.active(CaptureSessionContext(
            identity: identity, startedAt: now, lastActivityAt: now,
            routing: CaptureRoutingMemory(destination: .inbox),
            kind: .site, label: nil))
        let chip = FieldVisitChipBuilder.chip(for: state, isLocating: false)
        #expect(chip.primary == "This visit")
        #expect(chip.secondary == "Whole house")
        #expect(!chip.isUnplaced)
    }

    /// A name that is only whitespace is no name: it must fall through to the
    /// next candidate rather than render as a blank line at arm's length.
    @Test func whitespaceOnlyNamesCountAsAbsent() {
        let siteState = CaptureVisitState.active(CaptureSessionContext(
            identity: identity, startedAt: now, lastActivityAt: now,
            routing: CaptureRoutingMemory(destination: .inbox, projectID: "p1",
                                          projectName: "   ", room: " \n "),
            kind: .site, label: "Maple St"))
        let siteChip = FieldVisitChipBuilder.chip(for: siteState, isLocating: false)
        #expect(siteChip.primary == "Maple St")
        #expect(siteChip.secondary == "Whole house")

        let sourcingState = CaptureVisitState.active(CaptureSessionContext(
            identity: identity, startedAt: now, lastActivityAt: now,
            routing: CaptureRoutingMemory(destination: .library),
            kind: .sourcing, label: "  "))
        #expect(FieldVisitChipBuilder.chip(for: sourcingState,
                                           isLocating: false).primary == "Sourcing")
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
