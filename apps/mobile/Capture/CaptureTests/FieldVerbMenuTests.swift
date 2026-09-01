//  FieldVerbMenuTests.swift
//  CaptureTests
//
//  I-4's mount. The three verbs shipped in wave 4 on N5 — a screen no release
//  build can open — and Kody ruled them onto the C3 quick-confirm card. This
//  suite pins the state machine that moved into CaptureKit so both surfaces
//  render one behaviour: the punch confirm FC-R7 requires, I-5's re-tap, the
//  disable that keeps a swallowed tap off the screen, and FC-R16.
//
//  The SwiftUI wiring in the app target is compile-gated only — `CaptureTests`
//  links CaptureKit alone (scripts/generate_project.rb:161-186), which is the
//  wave's own C1 finding.

import Foundation
import Testing
@testable import CaptureKit

struct FieldVerbMenuTests {
    private let gc = FieldPartyRef(
        id: "party-gc", displayName: "Delaney Build Co",
        partyKind: "gc", smsConsentGranted: true, phoneE164: "+15125550100")

    private func placed(
        note: Bool = false,
        punchRequested: Bool = false,
        punch: FieldWriteState? = nil,
        owner: String? = nil,
        party: String? = nil
    ) -> FieldVerbFacts {
        FieldVerbFacts(
            hasProject: true, noteRequested: note, punchRequested: punchRequested,
            punchState: punch, punchOwnerRaw: owner, punchPartyID: party)
    }

    // MARK: - The rows

    @Test func aPlacedCaptureOffersAllThreeVerbs() {
        let menu = FieldVerbMenu()
        #expect(menu.rows(placed()) == [.note, .task, .punch])
    }

    @Test func anUnplacedCaptureIsToldWhyRatherThanShownDeadRows() {
        let menu = FieldVerbMenu()
        let rows = menu.rows(FieldVerbFacts(hasProject: false))
        #expect(rows == [.note, .needsProject])
        // FC-R6 keeps an unplaced note on Today, so the note verb survives.
        #expect(menu.isEnabled(.note, FieldVerbFacts(hasProject: false)))
        #expect(rows.contains(.task) == false)
        #expect(rows.contains(.punch) == false)
    }

    @Test func arequestedNoteBecomesAStatementNotASecondVerb() {
        let menu = FieldVerbMenu()
        let rows = menu.rows(placed(note: true))
        #expect(rows.first == .noteFiled)
        #expect(rows.contains(.note) == false)
        #expect(menu.isEnabled(.noteFiled, placed(note: true)) == false)
    }

    // MARK: - idle → confirm → writing → filed

    @Test func thePunchVerbNeverWritesWithoutAConfirmStep() {
        var menu = FieldVerbMenu()
        let facts = placed()
        #expect(menu.phase(facts) == .idle)

        // The tap opens the confirm; it does NOT return a write.
        let onTap = menu.tap(.punch, facts: facts, parties: [gc])
        #expect(onTap == nil)
        #expect(menu.phase(facts) == .confirming(.reachable(gc)))
        #expect(menu.intentLine == "Delaney Build Co will get a text.")

        // Only the confirm yields the write, owner + party already resolved.
        let confirmed = menu.confirmPunch()
        #expect(confirmed == .punchTask(owner: "gc", partyID: "party-gc"))
        #expect(menu.pendingPunch == nil)

        // The lane in flight is `writing`, and the verbs stop offering a tap
        // `requestPunchTask` would swallow.
        let inFlight = placed(punchRequested: true, punch: .pending)
        #expect(menu.phase(inFlight) == .writing)
        #expect(menu.isEnabled(.punch, inFlight) == false)
        #expect(menu.isEnabled(.task, inFlight) == false)

        let landed = placed(punchRequested: true, punch: .written,
                            owner: "gc", party: "party-gc")
        #expect(menu.phase(landed) == .filed)
    }

    @Test func aSecondConfirmWritesNothing() {
        var menu = FieldVerbMenu()
        _ = menu.tap(.punch, facts: placed(), parties: [gc])
        #expect(menu.confirmPunch() != nil)
        #expect(menu.confirmPunch() == nil)
    }

    @Test func cancellingTheConfirmWritesNothing() {
        var menu = FieldVerbMenu()
        _ = menu.tap(.punch, facts: placed(), parties: [gc])
        menu.cancelPunch()
        #expect(menu.pendingPunch == nil)
        #expect(menu.intentLine == nil)
        #expect(menu.confirmPunch() == nil)
    }

    @Test func withNoReachableCourtTheConfirmFilesItAsHerOwnTask() {
        var menu = FieldVerbMenu()
        let mute = FieldPartyRef(id: "p", displayName: "Quiet GC",
                                 partyKind: "gc", smsConsentGranted: false)
        _ = menu.tap(.punch, facts: placed(), parties: [mute])
        #expect(menu.phase(placed()) == .confirming(.noCourt))
        #expect(menu.confirmPunch() == .punchTask(owner: "designer", partyID: nil))
    }

    @Test func makeItATaskIsHerOwnAndSkipsTheCourtEntirely() {
        var menu = FieldVerbMenu()
        let action = menu.tap(.task, facts: placed(), parties: [gc])
        #expect(action == .punchTask(owner: "designer", partyID: nil))
        #expect(menu.pendingPunch == nil)
    }

    // MARK: - I-5, the re-tap

    @Test func aLandedPunchLaneSaysSoAndReOpensForADeliberateSecondItem() {
        var menu = FieldVerbMenu()
        let landed = placed(punchRequested: true, punch: .written,
                            owner: "gc", party: "party-gc")
        // The filed row sits ABOVE the still-present verb — the first filing is
        // read rather than remembered, and the re-open is unchanged.
        #expect(menu.rows(landed) == [.note, .task, .punchFiled, .punch])
        #expect(menu.isEnabled(.punch, landed))
        #expect(menu.tap(.punch, facts: landed, parties: [gc]) == nil)
        #expect(menu.pendingPunch == .reachable(gc))
    }

    @Test func aClosedButUnlandedLaneOffersNoRetapAtAll() {
        // `.refused` and `.unwritable` close the lane as firmly as `.written`
        // does, and `requestPunchTask` refuses both — so neither may be offered.
        let menu = FieldVerbMenu()
        for state: FieldWriteState in [.refused, .unwritable, .failed, .writing] {
            let facts = placed(punchRequested: true, punch: state)
            #expect(menu.isEnabled(.punch, facts) == false)
            #expect(menu.isEnabled(.task, facts) == false)
        }
    }

    // MARK: - The lines

    @Test func theStatusLineNamesTheCourtTheWrittenRowRecords() {
        let menu = FieldVerbMenu()
        let landed = placed(punchRequested: true, punch: .written,
                            owner: "gc", party: "party-gc")
        #expect(menu.statusLine(landed, parties: [gc])
                == "Filed. Delaney Build Co was texted.")
        // The party list is gone (a relaunch): no name, so no claim of a send.
        #expect(menu.statusLine(landed, parties: []) == "Filed as your task.")
    }

    @Test func aDesignerOwnedRowNeverClaimsASend() {
        let menu = FieldVerbMenu()
        let mine = placed(punchRequested: true, punch: .written, owner: "designer")
        #expect(menu.statusLine(mine, parties: [gc]) == "Filed as your task.")
    }

    @Test func aRefusalReportsTheFallbackAndAnOpenLaneSaysNothing() {
        let menu = FieldVerbMenu()
        #expect(menu.statusLine(placed(punchRequested: true, punch: .refused),
                                parties: []) == PunchCourtCopy.refusedTask)
        #expect(menu.statusLine(placed(punchRequested: true, punch: .pending),
                                parties: []) == nil)
        #expect(menu.statusLine(placed(), parties: []) == nil)
    }

    @Test func everyRowCarriesTheCopyTheSheetShipped() {
        #expect(FieldVerbRow.note.title == "Make it a note in the Document")
        #expect(FieldVerbRow.noteFiled.title == "Filed in the Document.")
        #expect(FieldVerbRow.task.title == "Make it a task")
        #expect(FieldVerbRow.punch.title == "Make it a punch item")
        #expect(FieldVerbRow.punchFiled.title == PunchCourtCopy.punchFiledMenuRow)
        #expect(FieldVerbRow.needsProject.title == "Put this on a project first.")
        for row in FieldVerbRow.allCases {
            #expect(row.isVerb == [.note, .task, .punch].contains(row))
        }
    }

    // MARK: - Against a real Specimen

    @Test func theFactsReadTheSpecimenTheCardIsShowing() {
        let specimen = Specimen()
        #expect(FieldVerbFacts(specimen: specimen).hasProject == false)

        specimen.venue = VenueStamp(projectId: "proj-1")
        #expect(FieldVerbFacts(specimen: specimen).hasProject)

        specimen.requestPunchTask(taskID: UUID(), owner: "gc", partyID: "party-gc")
        let facts = FieldVerbFacts(specimen: specimen)
        #expect(facts.punchRequested)
        #expect(facts.punchState == .pending)
        #expect(facts.punchOwnerRaw == "gc")
        #expect(facts.punchPartyID == "party-gc")

        specimen.requestMarginNote(noteID: UUID())
        #expect(FieldVerbFacts(specimen: specimen).noteRequested)
    }

    /// FC-R16: a spoken measurement never becomes a measured record. The verbs
    /// are the one place a dictated number reaches a business table, and the
    /// whole flow must leave the measurement list empty.
    @Test func noVerbEverInventsAMeasurement() {
        let specimen = Specimen()
        specimen.venue = VenueStamp(projectId: "proj-1")
        specimen.voiceTranscript = "The alcove reads 42.5 short."
        var menu = FieldVerbMenu()

        for row: FieldVerbRow in [.note, .task, .punch] {
            let facts = FieldVerbFacts(specimen: specimen)
            if let action = menu.tap(row, facts: facts, parties: [gc]) {
                apply(action, to: specimen)
            }
            if let confirmed = menu.confirmPunch() { apply(confirmed, to: specimen) }
        }

        #expect(specimen.measurements.isEmpty)
        #expect(specimen.marginNoteId != nil)
        #expect(specimen.punchTaskId != nil)
    }

    private func apply(_ action: FieldVerbAction, to specimen: Specimen) {
        switch action {
        case .note:
            specimen.requestMarginNote(noteID: UUID())
        case .punchTask(let owner, let partyID):
            specimen.requestPunchTask(taskID: UUID(), owner: owner, partyID: partyID)
        }
    }
}

/// The verbs mounted on C3 must not move what C3 was already for. The card's
/// own act is confirming the guess — category, material, their provenance — and
/// the placement line beneath them.
@MainActor
struct CaptureCardConfirmUnchangedTests {
    private func confirmedCard() -> Specimen {
        let specimen = Specimen()
        specimen.venue = VenueStamp(projectId: "proj-1", projectName: "Maple St", room: "Living")
        specimen.setValue("seating", for: .category, source: .smartGuess)
        specimen.setValue("Oak / bouclé", for: .material, source: .manual)
        return specimen
    }

    @Test func filingANoteLeavesTheConfirmedFieldsAndTheirProvenanceAlone() {
        let specimen = confirmedCard()
        specimen.requestMarginNote(noteID: UUID())

        #expect(specimen.category == .seating)
        #expect(specimen.materialNote == "Oak / bouclé")
        #expect(specimen.provenance(for: .category) == .smartGuess)
        #expect(specimen.provenance(for: .material) == .manual)
    }

    @Test func filingAPunchItemLeavesTheConfirmedFieldsAndTheirProvenanceAlone() {
        let specimen = confirmedCard()
        specimen.requestPunchTask(taskID: UUID(), owner: "gc", partyID: "party-gc")

        #expect(specimen.category == .seating)
        #expect(specimen.materialNote == "Oak / bouclé")
        #expect(specimen.provenance(for: .category) == .smartGuess)
        #expect(specimen.provenance(for: .material) == .manual)
    }

    @Test func thePlacementLineTheCardDrawsIsUnmovedByEitherVerb() {
        let specimen = confirmedCard()
        let before = FieldPlacementLine.text(for: specimen)
        #expect(before == "Maple St · Living")

        specimen.requestMarginNote(noteID: UUID())
        specimen.requestPunchTask(taskID: UUID(), owner: "designer", partyID: nil)

        #expect(FieldPlacementLine.text(for: specimen) == before)
        #expect(FieldPlacementLine.isUnplaced(specimen) == false)
    }
}
