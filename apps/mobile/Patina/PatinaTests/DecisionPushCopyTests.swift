//
//  DecisionPushCopyTests.swift
//  PatinaTests
//
//  P-04 / R8 — a passed date is a check-in, never a warning.
//
//  `DecisionPushType.overdue` carried `exclamationmark.triangle.fill` and the
//  banner title "A decision is overdue": a warning glyph and the one word this
//  program retires from everything a homeowner reads.
//

import Testing
@testable import Patina

struct DecisionPushCopyTests {

    @Test("a passed date is a clock, not a warning triangle")
    func theOverdueIconIsAClock() {
        #expect(DecisionPushType.overdue.icon == "clock")
        for type in DecisionPushType.allCases {
            #expect(!type.icon.contains("exclamationmark"),
                    "\(type.rawValue) still draws a warning glyph")
        }
    }

    @Test("no default banner title uses the retired word")
    func noTitleSaysTheRetiredWord() {
        #expect(DecisionPushType.overdue.defaultTitle == "A decision is still open")
        for type in DecisionPushType.allCases {
            #expect(!type.defaultTitle.lowercased().contains("overdue"))
            // No guilt register, no invented timing.
            #expect(!type.defaultTitle.lowercased().contains("late"))
        }
    }

    /// The wire value is unchanged — this is presentation, not a state change.
    /// The backend still emits `decision_overdue` and the app still routes it.
    @Test("the wire type is untouched")
    func theWireContractIsUnchanged() {
        #expect(DecisionPushType.overdue.rawValue == "decision_overdue")
        #expect(DecisionPushType(rawValue: "decision_overdue") == .overdue)
    }

    /// A passed date still counts as something waiting on the person — the
    /// copy softened, the meaning did not.
    @Test("a passed date is still action-required")
    func stillActionRequired() {
        #expect(DecisionPushType.overdue.isActionRequired)
        #expect(DecisionPushType.required.isActionRequired)
        #expect(!DecisionPushType.resolved.isActionRequired)
    }
}
