//
//  DecisionSpreadTests.swift
//  PatinaTests
//
//  `P-30`. The decision spread: two plates side by side, a leaning that
//  commits nothing, one act that names what it is agreeing to, and an arrival
//  a reader who has turned motion off can look at.
//
//  Four behaviours are load-bearing and every one of them is here:
//   • the leaning does not submit;
//   • the act names the option;
//   • three or more options are paged, not stacked into a wall;
//   • Reduce Motion takes the still arrival.
//

import Foundation
import Testing
@testable import Patina

@MainActor
struct DecisionSpreadTests {

    private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
        try JSONDecoder().decode(type, from: Data(json.utf8))
    }

    private func options(_ count: Int) throws -> [RemoteDecisionOption] {
        let names = ["Shaker Oak", "Rift White Oak", "Walnut", "Painted Poplar"]
        let rows = (0..<count).map { index in
            """
            { "id": "o-\(index)", "decision_id": "d-1",
              "title": "\(names[index % names.count])" }
            """
        }
        return try decode([RemoteDecisionOption].self, "[\(rows.joined(separator: ","))]")
    }

    // MARK: - The leaning

    @Test("tapping a plate marks a leaning and submits nothing")
    func theLeaningSubmitsNothing() throws {
        let viewModel = DecisionDetailViewModel()
        viewModel.options = try options(2)

        viewModel.chooseLeaning(optionId: "o-1")

        #expect(viewModel.leaningOptionId == "o-1")
        // The three things a submitted answer would have moved.
        #expect(viewModel.selectedOptionId == nil)
        #expect(viewModel.pendingOptionId == nil)
        #expect(!viewModel.isResolved)
    }

    @Test("the leaning moves from plate to plate without answering")
    func theLeaningIsRevisable() throws {
        let viewModel = DecisionDetailViewModel()
        viewModel.options = try options(2)

        viewModel.chooseLeaning(optionId: "o-0")
        viewModel.chooseLeaning(optionId: "o-1")

        #expect(viewModel.leaningOptionId == "o-1")
        #expect(viewModel.selectedOptionId == nil)
    }

    /// `R06`: a plate with no title, note or image cannot be chosen, so it
    /// cannot be leaned on either — the act above it would name nothing.
    @Test("a contentless plate takes no leaning")
    func aContentlessPlateTakesNoLeaning() throws {
        let viewModel = DecisionDetailViewModel()
        viewModel.options = try decode([RemoteDecisionOption].self, """
        [{ "id": "o-blank", "decision_id": "d-1" }]
        """)

        viewModel.chooseLeaning(optionId: "o-blank")

        #expect(viewModel.leaningOptionId == nil)
    }

    @Test("an answered decision takes no new leaning")
    func anAnsweredDecisionTakesNoLeaning() throws {
        let viewModel = DecisionDetailViewModel()
        viewModel.options = try options(2)
        viewModel.selectedOptionId = "o-0"

        viewModel.chooseLeaning(optionId: "o-1")

        #expect(viewModel.leaningOptionId == nil)
    }

    // MARK: - The act

    @Test("the act names the option, and never says Choose this")
    func theActNamesTheOption() throws {
        let picked = try options(2)[0]

        let label = DecisionSpread.actLabel(optionTitle: picked.resolvedTitle)

        #expect(label == "I choose Shaker Oak")
        #expect(!label.lowercased().contains("choose this"))
    }

    @Test("an option whose title did not resolve still gets a named act")
    func anUntitledOptionStillGetsAnAct() {
        #expect(DecisionSpread.actLabel(optionTitle: nil) == "I choose this one")
        #expect(DecisionSpread.actLabel(optionTitle: "   ") == "I choose this one")
    }

    /// The act is the whole of the commit: the option path no longer opens the
    /// consent sheet, so the screen's only consent presentation is the
    /// sign-off's.
    @Test("the option path no longer opens the consent sheet")
    func theOptionPathHasNoConsentSheet() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Decisions/Views/DecisionDetailView.swift")
        )
        #expect(!code.contains("viewModel.pendingOptionId != nil || viewModel.isApprovingSignoff"),
                "the consent sheet still opens on a pending option")
        #expect(code.contains("HoldToActButton("),
                "the spread's act is not held")
        #expect(code.contains("DecisionSpread.actLabel(optionTitle:"),
                "the act does not name the option it carries")
    }

    // MARK: - `r1 M2` · the optional signature the sheet used to carry

    /// The retired `DecisionConsentSheet` could put `electronic_signature` on
    /// an option choice (its "Add my signature" toggle). `P-30` removed the
    /// sheet; it may not remove the capability, because 00117's
    /// `client_consent_method` is a per-decision column and the mid-Wave-2
    /// "signature only on Approve" ruling is scoped to the Stage-2 ceremony
    /// rail, not to a legacy choice between named alternatives.
    @Test("an empty name is an unsigned choice, and a typed one is signed")
    func theTypedNameDecidesTheConsent() {
        #expect(DecisionSpread.consent(forTypedName: nil) == .clickThrough)
        #expect(DecisionSpread.consent(forTypedName: "") == .clickThrough)
        #expect(DecisionSpread.consent(forTypedName: "   \n ") == .clickThrough)
        #expect(DecisionSpread.consent(forTypedName: " Anne Vinter ")
                == .signed("Anne Vinter"))
    }

    /// The floor is `_apply_client_decision`'s: a one-character signature is a
    /// check violation server-side. Below it the act is HELD rather than
    /// quietly downgraded, so a half-typed name never lands as an unsigned
    /// submit the homeowner did not choose.
    @Test("a half-typed name holds the act rather than sending unsigned")
    func aHalfTypedNameHoldsTheAct() throws {
        #expect(DecisionSpread.consent(forTypedName: "A") == .tooShort)
        #expect(DecisionSpread.consent(forTypedName: " A ") == .tooShort)

        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Decisions/Views/DecisionDetailView.swift")
        )
        #expect(code.contains("spreadConsent != .tooShort"),
                "the act is live over a name too short to send")
    }

    @Test("the held act carries the typed name into the commit")
    func theActCarriesTheName() throws {
        let view = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Decisions/Views/DecisionDetailView.swift")
        )
        #expect(view.contains("typedName: spreadSignature"))
        #expect(view.contains("DecisionSpread.signatureTitle"))

        let model = SourceScan.code(
            in: try SourcePin.read(
                "Patina/Features/Decisions/ViewModels/DecisionDetailViewModel+Spread.swift"
            )
        )
        #expect(model.contains("consent: .electronicSignature"),
                "the option path can no longer be e-signed")
        #expect(model.contains("consent: .clickThrough"),
                "an unsigned hold no longer records click_through")
    }

    /// The signature is an offer, never a gate: nothing in the copy asks for
    /// it, apologises for it, or names a lapse.
    @Test("the signature line is offered, not demanded")
    func theSignatureIsOptional() {
        #expect(DecisionSpread.signatureNote.lowercased().hasPrefix("optional"))
        for word in ["required", "must", "sorry", "overdue", "gate", "task"] {
            #expect(!DecisionSpread.signatureNote.lowercased().contains(word),
                    "the signature note says \(word)")
            #expect(!DecisionSpread.signatureTitle.lowercased().contains(word),
                    "the signature title says \(word)")
            #expect(!DecisionSpread.signatureTooShort.lowercased().contains(word),
                    "the too-short line says \(word)")
        }
    }

    /// `r1 M2`, second order: the consent sheet carried the only sentence on
    /// this path naming what the act DOES. `leaningPrompt` names only what is
    /// not happening, so the consequence moves beside the act.
    @Test("the act says what holding it sets off")
    func theActNamesItsConsequence() throws {
        #expect(DecisionSpread.actConsequence.contains("your designer"))
        #expect(DecisionSpread.actConsequence.contains("waiting on it"))

        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Decisions/Views/DecisionDetailView.swift")
        )
        #expect(code.contains("DecisionSpread.actConsequence"),
                "the act is drawn without the sentence naming what it does")
    }

    /// `P-30`: the deferral acts sit BELOW the act at equal weight, "not
    /// smaller" — so they are drawn through one control at the body face, and
    /// not at a caption size that would read as a footnote beside the act.
    @Test("the deferral acts are not drawn smaller than the act above them")
    func theDeferralActsAreNotSmaller() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Decisions/Views/DecisionDetailView.swift")
        )
        let control = try #require(code.range(of: "private func deferralAct("))
        let block = String(code[control.lowerBound...].prefix(500))
        #expect(block.contains("PatinaTypography.bodySmallMedium"),
                "the deferral acts dropped below the body face")
        #expect(!block.contains("PatinaTypography.caption"),
                "the deferral acts are drawn as a footnote")
        #expect(block.contains("minHeight: 44"))
    }

    // MARK: - Layout

    @Test("two options share a row; three or more are paged")
    func theLayoutFollowsTheCount() {
        #expect(DecisionSpread.layout(optionCount: 2, isAccessibilitySize: false) == .sideBySide)
        #expect(DecisionSpread.layout(optionCount: 3, isAccessibilitySize: false) == .paged)
        #expect(DecisionSpread.layout(optionCount: 6, isAccessibilitySize: false) == .paged)
        #expect(DecisionSpread.layout(optionCount: 1, isAccessibilitySize: false) == .stacked)
        #expect(DecisionSpread.layout(optionCount: 0, isAccessibilitySize: false) == .stacked)
    }

    /// AX-XL and above: the width cannot hold two plates, so every count
    /// stacks. This is `C-06`'s rule — a title broken inside its own word is
    /// what a half-width plate does at those sizes.
    @Test("at accessibility text sizes the plates stack, whatever the count")
    func accessibilitySizesStack() {
        for count in [1, 2, 3, 7] {
            #expect(
                DecisionSpread.layout(optionCount: count, isAccessibilitySize: true) == .stacked,
                "\(count) options did not stack at an accessibility size"
            )
        }
    }

    /// The paged spread's indicator is a dot rule. A numeric one ("2 of 4") is
    /// the count chip the refusals name, drawn as a caption.
    @Test("the paged spread carries dots, never a numeric indicator")
    func thePagedSpreadIsNotCounted() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Decisions/Views/DecisionDetailView.swift")
        )
        let dots = try #require(code.range(of: "private var pageDots"))
        let block = String(code[dots.lowerBound...].prefix(600))
        #expect(block.contains("PatinaColors.clay"), "the page dot is not in clay")
        // Shapes, not words: a numeric indicator would need a `Text(`.
        #expect(!block.contains("Text("), "the page indicator draws a figure")
        #expect(!DecisionSpread.pagedSpreadLabel.contains("of"))
    }

    // MARK: - Arrival

    @Test("Reduce Motion takes the still arrival; everyone else gets the zoom")
    func theArrivalHonoursReduceMotion() {
        #expect(DecisionSpread.transition(reduceMotion: true) == .crossFade)
        #expect(DecisionSpread.transition(reduceMotion: false) == .zoom)
    }

    @Test("the zoom has both halves: a source on the Record row and the destination")
    func theZoomHasBothHalves() throws {
        let row = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Home/Views/HouseRecordCard.swift")
        )
        #expect(row.contains(".decisionZoomSource(row.route, in: decisionZoomNamespace)"),
                "the Record row publishes no zoom source")

        let arrival = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Decisions/Views/DecisionArrival.swift")
        )
        #expect(arrival.contains("navigationTransition(.zoom(sourceID: decisionId, in: namespace))"))
        #expect(arrival.contains("matchedTransitionSource(id: decisionId, in: namespace)"))

        // Both roots publish the namespace, or one of the two lands on a
        // zoom with no source and pushes plainly.
        for root in ["Patina/ContentView.swift",
                     "Patina/Features/Navigation/HouseFirstRoot.swift"] {
            let code = SourceScan.code(in: try SourcePin.read(root))
            #expect(code.contains("@Namespace private var decisionZoom"),
                    "\((root as NSString).lastPathComponent) declares no namespace")
            #expect(code.contains(".environment(\\.decisionZoomNamespace, decisionZoom)"),
                    "\((root as NSString).lastPathComponent) publishes no namespace")
        }
    }
}
