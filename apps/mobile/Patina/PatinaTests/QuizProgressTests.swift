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

    private func freshViewModel() -> StyleQuizViewModel {
        UserDefaults.standard.removeObject(forKey: "styleQuiz.savedProgress.v1")
        return StyleQuizViewModel()
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

    @Test("no nudge sits above a Continue button that already says the same thing")
    func noDeadNudgeAboveContinue() {
        let viewModel = freshViewModel()
        // Q2 is multi-select — it has the real Continue button, so no nudge.
        viewModel.currentQuestion = 1
        viewModel.toggleSelection(question: 1, option: 0)
        #expect(!viewModel.currentQuestionData.type.isSingleSelect)
        #expect(viewModel.companionNudgeLabel == nil)
    }

    @Test("the arrow that did nothing is gone")
    func nextQuestionArrowIsGone() throws {
        // Comment lines out first — the doc comment above `companionNudgeLabel`
        // quotes the string it removed, which is the record of why.
        let code = try SourcePin.read("Patina/Features/StyleQuiz/ViewModels/StyleQuizViewModel.swift")
            .split(separator: "\n", omittingEmptySubsequences: false)
            .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") }
            .joined(separator: "\n")
        #expect(!code.contains("\"Next question →\""))
        #expect(!code.contains("\"See your style →\""))
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
