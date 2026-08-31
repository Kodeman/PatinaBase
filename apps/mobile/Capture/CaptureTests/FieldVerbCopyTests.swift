//  FieldVerbCopyTests.swift
//  CaptureTests
//
//  The one place the app talks to a designer about whether a text went out.
//  fc_dispatch_task_assignment sends only to a consented, dispatchable party
//  (00284:172-179) and returns silently otherwise — so a line promising a send
//  that the database declines is a lie the designer cannot detect. These
//  strings are pinned in a test for the same reason the SQL constraints are.

import Foundation
import Testing
@testable import CaptureKit

struct FieldVerbCopyTests {
    private let consented = FieldPartyRef(
        id: "p1", displayName: "Delaney Build Co",
        partyKind: "gc", smsConsentGranted: true)

    @Test func aReachableCourtIsPromisedATextByName_inTheFutureTense() {
        #expect(PunchCourtCopy.intent(for: .reachable(consented))
                == "Delaney Build Co will get a text.")
    }

    @Test func noCourtSaysWhatWillHappenInstead() {
        #expect(PunchCourtCopy.intent(for: .noCourt)
                == "No general contractor with texting on this project — this stays as your task.")
    }

    @Test func theCardReportsTheSendOnlyOnceTheRowIsWritten() {
        #expect(PunchCourtCopy.filed(for: .reachable(consented))
                == "Filed. Delaney Build Co was texted.")
        #expect(PunchCourtCopy.filed(for: .noCourt) == "Filed as your task.")
    }

    @Test func aRefusedTaskNamesTheReasonAndTheFallback() {
        #expect(PunchCourtCopy.refusedTask
                == "Tasks on this project belong to its designer of record. "
                + "Saved as a note in the Document instead.")
    }

    @Test func noPreTapLineEverReportsASendAsAlreadyDone() {
        // The row does not exist yet when this line is read. Past tense here
        // would be a receipt for something that has not happened.
        for court in [PunchCourt.reachable(consented), .noCourt] {
            let line = PunchCourtCopy.intent(for: court)
            #expect(line.lowercased().contains("was texted") == false)
            #expect(line.lowercased().contains("gets a text") == false)
        }
    }

    @Test func noLineEverClaimsASendOnAProjectWithNoCourt() {
        #expect(PunchCourtCopy.intent(for: .noCourt).lowercased().contains("text"))
        #expect(PunchCourtCopy.filed(for: .noCourt).lowercased().contains("text") == false)
    }
}
