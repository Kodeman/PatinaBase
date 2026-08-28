//
//  ProjectPhaseFeeTests.swift
//  PatinaTests
//
//  W4 fix round · integration.md §6.7 — a phase with no fee draws no fee.
//

import Testing
import Foundation
@testable import Patina

struct ProjectPhaseFeeTests {

    private func money(_ cents: Int) -> String { "$\(cents / 100)" }

    @Test("a phase priced at zero draws nothing")
    func aZeroFeeDrawsNothing() {
        #expect(ProjectDetailCopy.phaseFee(cents: 0, format: money) == nil)
    }

    @Test("a phase with no fee column draws nothing")
    func aNullFeeDrawsNothing() {
        #expect(ProjectDetailCopy.phaseFee(cents: nil, format: money) == nil)
    }

    @Test("a phase that carries a fee draws it")
    func arealFeeDraws() {
        #expect(ProjectDetailCopy.phaseFee(cents: 250_000, format: money) == "$2500")
    }

    @Test("VoiceOver says a fee only where the screen shows one")
    func theVoiceLabelFollowsTheSameRule() {
        let silent = ProjectDetailCopy.phaseVoiceLabel(
            name: "Installation & Styling", statusLine: "Upcoming",
            isCurrent: false,
            fee: ProjectDetailCopy.phaseFee(cents: 0, format: money)
        )
        #expect(silent == "Installation & Styling. Upcoming")

        let spoken = ProjectDetailCopy.phaseVoiceLabel(
            name: "Design Development", statusLine: "In Progress",
            isCurrent: true,
            fee: ProjectDetailCopy.phaseFee(cents: 250_000, format: money)
        )
        #expect(spoken == "Current phase. Design Development. In Progress $2500.")
    }
}
