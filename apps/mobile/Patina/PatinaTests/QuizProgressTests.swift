//
//  QuizProgressTests.swift
//  PatinaTests
//
//  A-21 — Q5 read "STEP 5 OF 5 · 100%" with a full gold bar while nothing was
//  selected and Continue was disabled. The bar counted the question being
//  SHOWN, so Q1 already read 20 % before anything was chosen.
//
//  A-13 — "Next question →" was a StaticText at {{44,722},{102.33,16}} with no
//  button role and no action, 26 pt above the real `companion.quiz.continue`
//  "Continue" at {{44,748},{314,44}}: same arrow, same meaning, and one of
//  them did nothing when tapped.
//
//  C1-04 — `isSubmitting` had no reader anywhere in the app, so the fifth
//  answer left the reader on a highlighted Q5 with nothing to look at.
//
//  B-21 — the quiz AX tree carried no Back, Skip or close control on any step.
//

import Foundation
import Testing
@testable import Patina

@MainActor
struct QuizProgressTests {

    /// Its own defaults suite: this suite runs beside 1600 others and has no
    /// business writing into the shared domain.
    private func freshViewModel() -> StyleQuizViewModel {
        let suite = "QuizProgressTests.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defaults.removePersistentDomain(forName: suite)
        return StyleQuizViewModel(defaults: defaults)
    }

    // MARK: - A-21 · answers recorded

    @Test("an untouched quiz reads zero, not one-fifth")
    func unansweredQuizReadsZero() {
        let viewModel = freshViewModel()
        #expect(viewModel.answeredCount == 0)
        #expect(viewModel.progress == 0)
    }

    @Test("the last question does not read 100% while it is unanswered")
    func lastQuestionIsNotFullBeforeItIsAnswered() {
        let viewModel = freshViewModel()
        // Four answered, sitting on Q5.
        for question in 0..<4 {
            viewModel.toggleSelection(question: question, option: 0)
        }
        viewModel.currentQuestion = 4
        #expect(viewModel.answeredCount == 4)
        #expect(viewModel.progress == 0.8)
        #expect(viewModel.progress < 1.0)
    }

    @Test("a complete set reads 100%")
    func completeSetIsFull() {
        let viewModel = freshViewModel()
        for question in 0..<viewModel.questions.count {
            viewModel.toggleSelection(question: question, option: 0)
        }
        #expect(viewModel.progress == 1.0)
    }

    @Test("a cleared multi-select answer stops counting")
    func clearedAnswersDoNotCount() {
        let viewModel = freshViewModel()
        // Q2 is the multi-select step.
        viewModel.toggleSelection(question: 1, option: 0)
        #expect(viewModel.answeredCount == 1)
        viewModel.toggleSelection(question: 1, option: 0)
        #expect(viewModel.answeredCount == 0)
    }

    @Test("the pill's fraction reads the view model, not the question index")
    func pillReadsAnswers() throws {
        let source = try SourcePin.read("Patina/Features/StyleQuiz/Views/StyleQuizView.swift")
        #expect(source.contains("let fraction = Double(viewModel.progress)"))
        #expect(!source.contains("let fraction = total > 0 ? Double(step) / Double(total) : 0"))
    }

    // MARK: - A-13 · the dead nudge

    /// Round one closed A-13 by making `companionNudgeLabel` unreachable —
    /// the guard required `isSingleSelect` on the LAST question, and the last
    /// question (id 4, `.iconList`) is the one multi-select case. Dead code
    /// that reads as live is a worse record than no code, so the property and
    /// its render site are gone.
    @Test("the nudge that did nothing is gone, not merely unreachable")
    func nextQuestionArrowIsGone() throws {
        let source = try SourcePin.read("Patina/Features/StyleQuiz/ViewModels/StyleQuizViewModel.swift")
        #expect(!source.contains("companionNudgeLabel"))

        let view = try SourcePin.read("Patina/Features/StyleQuiz/Views/StyleQuizView.swift")
        #expect(!view.contains("companionNudgeLabel"))
        #expect(!view.contains("\"See your style\""))

        let code = source
            .split(separator: "\n", omittingEmptySubsequences: false)
            .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") }
            .joined(separator: "\n")
        #expect(!code.contains("\"Next question →\""))
    }

    // MARK: - The auto-advance is owned

    /// On Q1/Q3/Q4 — imageGrid, materialCards, budgetTiers, all single-select
    /// — a selection schedules an advance 0.5 s out. Tap Back inside that
    /// half-second (exactly when someone who mis-tapped a swatch does) and an
    /// unowned task fired afterwards and pushed them forward again.
    @Test("Back cancels the pending auto-advance")
    func backCancelsThePendingAutoAdvance() async {
        let viewModel = freshViewModel()
        viewModel.currentQuestion = 2
        viewModel.toggleSelection(question: 2, option: 0)
        #expect(viewModel.currentQuestionData.type.isSingleSelect)

        viewModel.goBack()
        #expect(viewModel.currentQuestion == 1)

        // Well past the 0.5 s the advance was scheduled for.
        try? await Task.sleep(for: .seconds(1.2))
        #expect(viewModel.currentQuestion == 1, "the cancelled advance still fired")
    }

    /// P-18's door is real, but round one drew it inside the Companion pill's
    /// charcoal panel — measured on the clone, the pill ran to y≈846 and the
    /// link occupied y 796–840. The column reserves the pill's measured height
    /// so the link sits above it at every Dynamic Type size.
    @Test("the sign-in door clears the Companion pill")
    func theSignInDoorClearsTheCompanionPill() throws {
        let source = try SourcePin.read("Patina/Features/StyleQuiz/Views/StyleQuizView.swift")
        #expect(source.contains("@State private var pillHeight: CGFloat = 0"))
        #expect(source.contains(".padding(.bottom, pillHeight + 28 + 12)"))
        #expect(source.contains(".onGeometryChange(for: CGFloat.self) { $0.size.height }"))

        // The inset belongs to the column that holds the link, and the link is
        // still inside it.
        let column = try #require(source.range(of: "StyleQuiz.SignInButton"))
        let inset = try #require(source.range(of: ".padding(.bottom, pillHeight + 28 + 12)"))
        #expect(column.lowerBound < inset.lowerBound)
    }

    // MARK: - C1-04 · submit has a reader

    @Test("isSubmitting is read by the view")
    func submittingHasAReader() throws {
        let source = try SourcePin.read("Patina/Features/StyleQuiz/Views/StyleQuizView.swift")
        #expect(source.contains("if viewModel.isSubmitting {"))
        #expect(source.contains("Reading your answers…"))
        #expect(source.contains("StyleQuiz.SubmittingState"))
    }

    // MARK: - B-21 · Back and an exit on every step

    @Test("Back exists past the first question and actually moves back")
    func backControlExists() throws {
        let source = try SourcePin.read("Patina/Features/StyleQuiz/Views/StyleQuizView.swift")
        #expect(source.contains("StyleQuiz.BackButton"))
        #expect(source.contains("if viewModel.currentQuestion > 0 {"))
        #expect(source.contains("viewModel.goBack()"))

        let viewModel = freshViewModel()
        viewModel.currentQuestion = 3
        viewModel.goBack()
        #expect(viewModel.currentQuestion == 2)
    }

    @Test("'I'll do this later' exists and saves before it leaves")
    func deferControlSavesFirst() throws {
        let source = try SourcePin.read("Patina/Features/StyleQuiz/Views/StyleQuizView.swift")
        #expect(source.contains("StyleQuiz.DeferButton"))
        let start = try #require(source.range(of: "Button(\"I'll do this later\") {"))
        let block = String(source[start.lowerBound...].prefix(200))
        let save = try #require(block.range(of: "viewModel.saveProgress()"))
        let leave = try #require(block.range(of: "onDefer()"))
        #expect(save.lowerBound < leave.lowerBound)
    }

    @Test("the onboarding mount wires both, so the quiz is no longer mandatory there")
    func onboardingMountWiresTheExits() throws {
        let host = try SourcePin.read("Patina/Features/FirstLaunch/Views/OnboardingFlowHost.swift")
        #expect(host.contains("onDefer: { skipToBrowsing() }"))
        #expect(host.contains("onSignIn: { returnToSignIn() }"))
    }
}
