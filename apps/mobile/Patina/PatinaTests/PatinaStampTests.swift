//
//  PatinaStampTests.swift
//  PatinaTests
//
//  `P-17` / `R13`. The twelve-state table, dial by dial, plus the one aging
//  step — pinned as values rather than as pixels, because the table IS the
//  component and a wrong pigment is a wrong statement about a $50,000
//  agreement.
//

import Testing
import Foundation
import SwiftUI
@testable import Patina

struct PatinaStampTests {

    // MARK: - The word

    @Test("every state prints its own word, and RETURNED is the word for changes requested")
    func everyStateHasItsWord() {
        let words = Dictionary(
            uniqueKeysWithValues: PatinaStamp.State.allCases.map { ($0, $0.word) }
        )
        #expect(words[.awaiting] == "AWAITING YOU")
        #expect(words[.approved] == "APPROVED")
        #expect(words[.chosen] == "CHOSEN")
        #expect(words[.returned] == "RETURNED")
        #expect(words[.held] == "HELD")
        #expect(words[.signed] == "SIGNED")
        #expect(words[.signedOnPaper] == "SIGNED")
        #expect(words[.reviewed] == "REVIEWED")
        #expect(words[.withdrawn] == "WITHDRAWN")
        #expect(words[.superseded] == "SUPERSEDED")
        #expect(words[.expired] == "EXPIRED")
        #expect(words[.declined] == "DECLINED")
        #expect(PatinaStamp.State.allCases.count == 12)
    }

    /// The paper original is the same act, in the same word, with where it
    /// happened as the qualifier — and it is the ONLY state carrying a second
    /// line inside the rule.
    @Test("only the paper original carries a second line inside the rule")
    func onlyPaperCarriesAnInnerLine() {
        #expect(PatinaStamp.State.signedOnPaper.innerLine == "ON PAPER")
        for state in PatinaStamp.State.allCases where state != .signedOnPaper {
            #expect(state.innerLine == nil, "\(state.rawValue) drew a second line")
        }
    }

    // MARK: - The pigments

    /// `R13`, the whole ruling: SIGNED is mocha, not sage; the hold border is
    /// golden-hour INK, not the light gold that reads as a wash; terracotta
    /// appears once, as DECLINED.
    @Test("every state takes its ruled border pigment")
    func everyStateTakesItsBorderPigment() {
        #expect(PatinaStamp.State.approved.borderPigment == .mocha)
        #expect(PatinaStamp.State.chosen.borderPigment == .mocha)
        #expect(PatinaStamp.State.signed.borderPigment == .mocha)
        #expect(PatinaStamp.State.signedOnPaper.borderPigment == .mocha)
        #expect(PatinaStamp.State.held.borderPigment == .goldenHour)
        #expect(PatinaStamp.State.awaiting.borderPigment == .goldenHour)
        #expect(PatinaStamp.State.returned.borderPigment == .clay)
        #expect(PatinaStamp.State.declined.borderPigment == .terracotta)
        for muted in [PatinaStamp.State.reviewed, .withdrawn, .superseded, .expired] {
            #expect(muted.borderPigment == .muted, "\(muted.rawValue) is not muted")
        }
    }

    @Test("the word ink never degrades: primary ink inside a coloured rule")
    func theWordInkIsNeverTheRuleWhereTheRuleIsColoured() {
        #expect(PatinaStamp.State.held.wordPigment == .word)
        #expect(PatinaStamp.State.returned.wordPigment == .word)
        #expect(PatinaStamp.State.declined.wordPigment == .word)
        #expect(PatinaStamp.State.awaiting.wordPigment == .word)
        #expect(PatinaStamp.State.signed.wordPigment == .mocha)
        #expect(PatinaStamp.State.approved.wordPigment == .mocha)
    }

    /// The pigment names are proved against the values they actually resolve
    /// to in the light appearance — the appearance the ruling's contrast
    /// numbers were measured in.
    @Test("each pigment resolves to the measured portal value in light")
    func eachPigmentResolvesToItsMeasuredValue() {
        for pigment in PatinaStamp.Pigment.allCases {
            #expect(
                Self.lightHex(pigment.ink) == pigment.lightInkHex,
                "\(pigment.rawValue) ink resolved to \(Self.lightHex(pigment.ink))"
            )
            #expect(
                Self.lightHex(pigment.rule) == pigment.lightRuleHex,
                "\(pigment.rawValue) rule resolved to \(Self.lightHex(pigment.rule))"
            )
        }
    }

    /// Every pigment carries a dark companion. A stamp is a hairline rule and
    /// a 10 pt word: a static `mocha` on the warm-graphite canvas is 1.6:1 and
    /// is not a mark at all.
    @Test("every pigment adapts to the dark canvas")
    func everyPigmentAdapts() {
        for pigment in PatinaStamp.Pigment.allCases {
            #expect(
                PatinaContrast.isAdaptive(pigment.ink),
                "\(pigment.rawValue) is a flat literal — it blinds one appearance"
            )
        }
    }

    private static func lightHex(_ color: Color) -> String {
        let channels = PatinaContrast.components(color, .light)
        return String(
            format: "%02X%02X%02X",
            Int((channels.red * 255).rounded()),
            Int((channels.green * 255).rounded()),
            Int((channels.blue * 255).rounded())
        )
    }

    /// No sage anywhere in the grammar, and terracotta exactly once. Together
    /// these are what make a traffic-light reading unavailable.
    @Test("no state is sage, and exactly one is terracotta")
    func noTrafficLightPairExists() {
        let borders = PatinaStamp.State.allCases.map(\.borderPigment)
        let words = PatinaStamp.State.allCases.map(\.wordPigment)
        #expect(borders.filter { $0 == .terracotta }.count == 1)
        #expect(words.filter { $0 == .terracotta }.isEmpty)
        // `sage` is not a member of the enum at all — that is the point, and
        // this asserts it stays that way rather than trusting the reading.
        #expect(PatinaStamp.Pigment.allCases.count == 6)
        #expect(!PatinaStamp.Pigment.allCases.map(\.rawValue).contains("sage"))
    }

    /// The stamp is ink on paper. Not a fill, not a shadow, not a badge.
    @Test("the component paints no fill and no shadow")
    func theStampIsInkOnPaper() throws {
        // Truncated at the preview: a `#Preview` legitimately paints a page
        // behind the marks it is drawing, and that ground is not the stamp.
        let whole = try SourcePin.readCode(
            "../PatinaDesignKit/Sources/PatinaDesignKit/Components/PatinaStamp.swift"
        )
        let source = String(whole[..<(whole.range(of: "#Preview")?.lowerBound ?? whole.endIndex)])
        for banned in [".shadow(", "PatinaShadows", ".background(", "PatinaColors.sage"] {
            #expect(!source.contains(banned), "PatinaStamp draws \(banned)")
        }
        // The one `.fill(` the component may use is the 1 pt strike through a
        // withdrawn word — never a fill behind the mark.
        #expect(source.components(separatedBy: ".fill(").count - 1 == 1)
    }

    // MARK: - Weight and rotation

    @Test("a doubled rule reads terminal; a single rule reads still open")
    func theWeightSaysWhetherItIsTerminal() {
        for doubled in [PatinaStamp.State.approved, .signed, .signedOnPaper, .held] {
            #expect(doubled.weight == .doubled, "\(doubled.rawValue) lost its inner rule")
        }
        for single in [PatinaStamp.State.awaiting, .returned, .declined,
                       .reviewed, .withdrawn, .superseded, .expired] {
            #expect(single.weight == .single, "\(single.rawValue) gained an inner rule")
        }
    }

    /// Upright is a statement, not a missing rotation: nothing pressed a mark
    /// on this surface.
    @Test("only a mark pressed on this surface is rotated, and by −1.1°")
    func onlyAStampedMarkIsRotated() {
        #expect(PatinaStamp.rotationDegrees == -1.1)
        for upright in [PatinaStamp.State.awaiting, .signedOnPaper,
                        .withdrawn, .superseded, .expired] {
            #expect(upright.rotationDegrees == 0, "\(upright.rawValue) was tilted")
        }
        for stamped in [PatinaStamp.State.approved, .returned, .held,
                        .signed, .reviewed, .declined] {
            #expect(stamped.rotationDegrees == -1.1, "\(stamped.rawValue) sits upright")
        }
    }

    @Test("the withdrawn word, and only it, is struck through")
    func onlyWithdrawnIsStruckThrough() {
        for state in PatinaStamp.State.allCases {
            #expect(state.isStruckThrough == (state == .withdrawn))
        }
    }

    // MARK: - The one aging step

    /// Terminal states age once, at thirty days, and then stop. The three that
    /// are still asking something never age at all.
    @Test("only terminal states age")
    func onlyTerminalStatesAge() {
        for open in [PatinaStamp.State.awaiting, .returned, .held] {
            #expect(!open.ages, "\(open.rawValue) ages while it is still asking")
        }
        for terminal in [PatinaStamp.State.approved, .signed, .signedOnPaper,
                         .reviewed, .withdrawn, .superseded, .expired, .declined] {
            #expect(terminal.ages, "\(terminal.rawValue) never settles")
        }
    }

    @Test("the aging step lands at thirty days, once, and never again")
    func theAgingStepLandsAtThirtyDays() {
        let recorded = Date(timeIntervalSince1970: 1_756_000_000)
        let day = 86_400.0
        #expect(PatinaStamp.agingDays == 30)
        #expect(!PatinaStamp.isAged(
            state: .approved, recordedAt: recorded, now: recorded.addingTimeInterval(29 * day)
        ))
        #expect(PatinaStamp.isAged(
            state: .approved, recordedAt: recorded, now: recorded.addingTimeInterval(30 * day)
        ))
        // Nothing ages further, ever: the far-future value is the same step.
        #expect(PatinaStamp.isAged(
            state: .approved, recordedAt: recorded, now: recorded.addingTimeInterval(4000 * day)
        ))
        #expect(PatinaStamp.agedBorderOpacity == 0.74)
        #expect(PatinaStamp.borderOpacity == 0.88)
        #expect(PatinaStamp.innerRuleOpacity == 0.42)
        #expect(PatinaStamp.agedInnerRuleOpacity == 0.26)
    }

    @Test("an open state never ages, however old, and an unrecorded one cannot")
    func anOpenOrUnrecordedStampNeverAges() {
        let recorded = Date(timeIntervalSince1970: 1_700_000_000)
        let long = recorded.addingTimeInterval(900 * 86_400)
        #expect(!PatinaStamp.isAged(state: .held, recordedAt: recorded, now: long))
        #expect(!PatinaStamp.isAged(state: .returned, recordedAt: recorded, now: long))
        #expect(!PatinaStamp.isAged(state: .approved, recordedAt: nil, now: long))
    }

    // MARK: - The mark is decoration over a sentence

    @Test("the stamp is hidden from VoiceOver unless it stands alone")
    func theStampSpeaksOnlyWhenItStandsAlone() {
        #expect(PatinaStamp(state: .approved).accessibilityLabel == nil)
        #expect(
            PatinaStamp(state: .expired, accessibilityLabel: "Expired")
                .accessibilityLabel == "Expired"
        )
    }

    // MARK: - `W3R1-n2` · the settled option choice

    /// A choice between named alternatives is CHOSEN, not APPROVED — and it
    /// takes APPROVED's dials exactly, so the two read as one act at one
    /// weight rather than as a hierarchy of consent.
    @Test("CHOSEN is APPROVED's twin in every dial but the word")
    func chosenCarriesApprovedsDials() {
        let chosen = PatinaStamp.State.chosen
        let approved = PatinaStamp.State.approved
        #expect(chosen.word == "CHOSEN")
        #expect(chosen.borderPigment == approved.borderPigment)
        #expect(chosen.wordPigment == approved.wordPigment)
        #expect(chosen.weight == approved.weight)
        #expect(chosen.rotationDegrees == approved.rotationDegrees)
        #expect(chosen.ages == approved.ages)
        #expect(chosen.isStruckThrough == false)
        #expect(chosen.innerLine == nil)
        #expect(chosen.borderPigment.lightInkHex == "5C4A3C", "mocha, and no other pigment")
    }

    /// And the screen that settles an option choice presses it: a sign-off,
    /// which carries no options by design, keeps APPROVED.
    @Test("the legacy rail stamps by what the act was")
    @MainActor
    func theLegacyRailStampsByTheAct() {
        #expect(DecisionDetailView.resolvedStamp(hasNamedOptions: true) == .chosen)
        #expect(DecisionDetailView.resolvedStamp(hasNamedOptions: false) == .approved)
    }
}
