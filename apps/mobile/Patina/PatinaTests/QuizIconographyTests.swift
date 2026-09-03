//
//  QuizIconographyTests.swift
//  PatinaTests
//
//  A-11 — full-colour system emoji were the production iconography of the
//  style quiz, on the onboarding path every tester walks in minute two.
//  VoiceOver read the glyph as part of the label ("🍷, Love having people
//  over…") and Q4 mixed 🌱 and 💬 with flat black ✦ and ◆ in one four-item
//  list.
//
//  C3-05 — the selected states put an `offWhite`/white label on a `clay` fill
//  at 2.18:1, on the same screens.
//
//  C3-15 — the inline `.font(.custom(…))` sites in this lane's files, two of
//  which carried no `relativeTo:` at all and so ignored Dynamic Type outright.
//
//  All three are L1-D's findings on L1-A's files, sent as notes D→A-3, D→A-2
//  and D→A-4.
//

import Foundation
import SwiftUI
import Testing
@testable import Patina

struct QuizIconographyTests {

    // MARK: - A-11 · SF Symbols, not emoji

    @Test("no quiz option carries an emoji")
    func noOptionCarriesAnEmoji() {
        for question in QuizContent.allQuestions {
            for option in question.type.options {
                guard let icon = option.icon else { continue }
                for scalar in icon.unicodeScalars {
                    #expect(
                        !scalar.properties.isEmojiPresentation
                            && !scalar.properties.isEmojiModifierBase,
                        "\(question.id)/\(option.key): \(icon)"
                    )
                }
            }
        }
    }

    @Test("every icon names a real SF Symbol")
    @MainActor
    func everyIconIsARegisteredSymbol() {
        for question in QuizContent.allQuestions {
            for option in question.type.options {
                guard let icon = option.icon else { continue }
                #expect(UIImage(systemName: icon) != nil, "unknown symbol: \(icon)")
            }
        }
    }

    /// One weight, one colour, no fill variants — so the icon never carries
    /// state — and hidden from VoiceOver, so the option's label is the
    /// sentence alone.
    @Test("the icons render as symbols in one weight, hidden from VoiceOver")
    func iconsRenderAsHiddenSymbols() throws {
        let source = try SourcePin.read("Patina/Features/StyleQuiz/Views/StyleQuizView+Questions.swift")
        #expect(source.contains("Image(systemName: icon)"))
        #expect(!source.contains("Text(icon)"))
        // One symbol, built once, so the weight and the tint cannot diverge
        // between the budget chip and the plain row.
        let weights = source.components(separatedBy: ".font(.system(size: 22, weight: .light))").count - 1
        #expect(weights == 1, "expected one icon definition, found \(weights)")
        let hidden = source.components(separatedBy: ".accessibilityHidden(true)").count - 1
        #expect(hidden == 2, "expected both icon shapes hidden, found \(hidden)")
    }

    // MARK: - C3-05 · never clay under a light label

    @Test("no light label sits on a clay fill")
    func noLightLabelSitsOnClay() throws {
        let source = try SourcePin.read("Patina/Features/StyleQuiz/Views/StyleQuizView+Questions.swift")
        #expect(!source.contains("PatinaColors.clay"))
        #expect(!source.contains(".white"))
        // The selected state is the interactive fill with the inverse label.
        let fills = source.components(separatedBy: "PatinaColors.Interactive.active").count - 1
        #expect(fills >= 4, "expected every selected state on the interactive fill, found \(fills)")
        #expect(source.contains("PatinaColors.Text.inverse"))
    }

    // MARK: - C3-15 · the inline fonts that have a token

    /// Seven of D→A-4's nine sites. `ConversationHeaderView:28` needs
    /// `PatinaTypography.voiceLead` and `PriorityView:54` needs `bodySerif`;
    /// both are L1-D's new ramp entries and neither exists until
    /// `first-flight/w1-l1d` is on the tip, so they are reported open rather
    /// than pinned here.
    @Test("the conversation and reveal fonts take the ramp")
    func noInlineCustomFontsInTheseFiles() throws {
        let paths = [
            "Patina/Features/StyleConversation/Views/ContemplativePauseView.swift",
            "Patina/Features/StyleConversation/Views/VisualResonanceView.swift",
            "Patina/Features/StyleConversation/Shared/Components/StyleSwatchCell.swift",
            "Patina/Features/StyleConversation/Views/InvestmentPerspectiveView.swift",
            "Patina/Features/StyleReveal/Views/ScanFloorPlanPreviewView.swift"
        ]
        for path in paths {
            let source = try SourcePin.read(path)
            #expect(!source.contains(".font(.custom("), "\(path) still sets a face inline")
        }
    }

    /// The two that had no `relativeTo:` at all — a font that ignores Dynamic
    /// Type outright — are the reason this is scored as a Dynamic Type row and
    /// not only a token one.
    @Test("the two sites that ignored Dynamic Type now scale")
    func theFloorPlanCaptionsScale() throws {
        let source = try SourcePin.read("Patina/Features/StyleReveal/Views/ScanFloorPlanPreviewView.swift")
        // Three sites, not two: `monoSmall` at :139 was already on the ramp
        // and shares the prefix. What matters is that no face is set inline
        // here any more — the file's other pin above says so.
        let mono = source.components(separatedBy: "PatinaTypography.mono").count - 1
        #expect(mono == 3, "expected the two captions plus the existing site, found \(mono)")
        #expect(!source.contains("size: 11)"), "a face is still sized without relativeTo:")
    }
}
