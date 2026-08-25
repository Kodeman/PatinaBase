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

    // MARK: - The C3 / C5 placement line (spec §7.5)

    @MainActor
    @Test func thePlacementLineNamesProjectAndRoomOrSaysItIsNotPlaced() throws {
        let store = try CaptureStore.inMemory()

        let placed = store.newDraft()
        placed.venue = VenueStamp(projectId: "p1", projectName: "Maple St", room: "Living")
        #expect(FieldPlacementLine.text(for: placed) == "Maple St · Living")
        #expect(!FieldPlacementLine.isUnplaced(placed))

        let wholeHouse = store.newDraft()
        wholeHouse.venue = VenueStamp(projectId: "p1", projectName: "Maple St")
        #expect(FieldPlacementLine.text(for: wholeHouse) == "Maple St · Whole house")

        let unplaced = store.newDraft()
        #expect(FieldPlacementLine.text(for: unplaced) == "Not placed — tap to place")
        #expect(FieldPlacementLine.isUnplaced(unplaced))
    }

    /// Spec Flow 6: an un-chipped market find filed to the Library shelf is DONE.
    /// Offering "tap to place" on a finished market find is the visible failure
    /// of the destination clause, so the line must neither invite a placement nor
    /// invent a project the capture has not got.
    @MainActor
    @Test func aLibraryCaptureWithNoProjectIsNeverOfferedAPlacement() throws {
        let store = try CaptureStore.inMemory()

        let marketFind = store.newDraft()
        marketFind.destination = .library
        #expect(!FieldPlacementLine.isUnplaced(marketFind))
        let line = FieldPlacementLine.text(for: marketFind)
        #expect(line == "Library")
        #expect(!line.lowercased().contains("tap to place"))
        #expect(!line.contains("This project"))

        // Chipped at the market: it has a project, so the line names it.
        let chipped = store.newDraft()
        chipped.destination = .library
        chipped.venue = VenueStamp(projectId: "p1", projectName: "Maple St", room: "Living")
        #expect(FieldPlacementLine.text(for: chipped) == "Maple St · Living")
    }

    /// FC-R6: the line clears on PLACEMENT, never on sync. A capture that
    /// committed hours ago and still has no project is still unplaced.
    @MainActor
    @Test func thePlacementLineIsBlindToSyncState() throws {
        let store = try CaptureStore.inMemory()

        let committed = store.newDraft()
        committed.destination = .inbox
        committed.status = .committed
        committed.remoteId = UUID().uuidString
        #expect(FieldPlacementLine.isUnplaced(committed))
        #expect(FieldPlacementLine.text(for: committed) == "Not placed — tap to place")
    }

    /// FC-R3: "Inbox" has left Field's user-facing copy, and the line she reads
    /// one-handed after the shutter is user-facing copy.
    @MainActor
    @Test func noPlacementLineCopyEverSaysInbox() throws {
        let store = try CaptureStore.inMemory()

        let inbox = store.newDraft()
        inbox.destination = .inbox
        let library = store.newDraft()
        library.destination = .library
        let placed = store.newDraft()
        placed.venue = VenueStamp(projectId: "p1", projectName: "Maple St", room: "Living")

        for specimen in [inbox, library, placed] {
            #expect(!FieldPlacementLine.text(for: specimen).lowercased().contains("inbox"))
        }
    }
}
