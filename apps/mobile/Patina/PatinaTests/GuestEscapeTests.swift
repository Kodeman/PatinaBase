//
//  GuestEscapeTests.swift
//  PatinaTests
//
//  P-18 — one tap on "Look around first" was permanent.
//
//  `guestModeOptIn` is persisted (`GuestSessionStore`), `derivePhase` returns
//  `.auth` only when it is false, and no onboarding or quiz screen offered a
//  way to unset it — so launch 2 and launch 3 landed on the guest intro, not
//  Welcome, and `describe_screen` returned the same seven nodes each time.
//
//  A-05 — "Skip" did not skip: `onComplete` and `onSkip` were byte-identical.
//  C1-28 — quiz answers survived only an explicit "Save progress & exit",
//  which only existed on the mount an onboarding reader could not reach.
//

import Foundation
import Testing
@testable import Patina

/// Serialized: `savedProgressRestores` drives a real `StyleQuizViewModel`,
/// whose auto-advance is a live task.
@Suite(.serialized)
struct GuestEscapeTests {

    // MARK: - P-18 · a door back to Welcome

    @Test("clearing the guest session puts the reader back on the auth phase")
    @MainActor
    func returnToSignInLandsOnAuth() {
        let suite = "GuestEscapeTests.optIn"
        let defaults = UserDefaults(suiteName: suite)!
        defaults.removePersistentDomain(forName: suite)
        let store = GuestSessionStore(defaults: defaults)

        store.optIn()
        #expect(store.isOptedIn)
        store.clear()
        #expect(!store.isOptedIn)

        defaults.removePersistentDomain(forName: suite)
    }

    @Test("returnToSignIn clears both the persisted opt-in and the coordinator's copy")
    func returnToSignInClearsBothHalves() throws {
        let source = try SourcePin.read("Patina/Services/Auth/GuestSessionStore.swift")
        let start = try #require(source.range(of: "static func returnToSignIn("))
        let body = String(source[start.lowerBound...])
        #expect(body.contains("shared.clear()"))
        #expect(body.contains("coordinator.guestModeOptIn = false"))
    }

    @Test("every guest onboarding page offers a sign-in door")
    func onboardingCarouselOffersSignIn() throws {
        let view = try SourcePin.read("Patina/Features/Onboarding/Views/OnboardingFlowView.swift")
        #expect(view.contains("I already have an account — Sign in"))
        #expect(view.contains("Onboarding.SignInButton"))
        // Outside the per-page TabView, so it is on every page rather than one.
        let start = try #require(view.range(of: "TabView(selection: $currentPage)"))
        let signIn = try #require(view.range(of: "Onboarding.SignInButton"))
        #expect(signIn.lowerBound > start.upperBound)

        let host = try SourcePin.read("Patina/Features/FirstLaunch/Views/OnboardingFlowHost.swift")
        #expect(host.contains("onSignIn: { returnToSignIn() }"))
        #expect(host.contains("GuestSessionStore.returnToSignIn(coordinator)"))
    }

    @Test("every quiz step offers the same door")
    func quizOffersSignIn() throws {
        let quiz = try SourcePin.read("Patina/Features/StyleQuiz/Views/StyleQuizView.swift")
        #expect(quiz.contains("I already have an account — Sign in"))
        #expect(quiz.contains("StyleQuiz.SignInButton"))
        // In the step-agnostic column, not inside a per-question layout —
        // those live in `StyleQuizView+Questions.swift` and this file has no
        // question-specific view at all.
        let questions = try SourcePin.read("Patina/Features/StyleQuiz/Views/StyleQuizView+Questions.swift")
        #expect(!questions.contains("StyleQuiz.SignInButton"))
        let signIn = try #require(quiz.range(of: "StyleQuiz.SignInButton"))
        let pill = try #require(quiz.range(of: "quizProgressPill"))
        #expect(signIn.lowerBound < pill.lowerBound)
    }

    // MARK: - A-05 · Skip skips

    @Test("Skip and Continue no longer share a destination")
    func skipDoesNotLandInTheQuiz() throws {
        let host = try SourcePin.read("Patina/Features/FirstLaunch/Views/OnboardingFlowHost.swift")
        #expect(host.contains("onComplete: { advanceToQuiz() }"))
        #expect(host.contains("onSkip: { skipToBrowsing() }"))
        #expect(!host.contains("onSkip: { advanceToQuiz() }"))
        // And skipping really finishes onboarding rather than deferring it.
        let start = try #require(host.range(of: "private func skipToBrowsing() {"))
        #expect(String(host[start.lowerBound...].prefix(120)).contains("completeOnboarding()"))
    }

    /// It used to be hidden on the last page (`if currentPage < pages.count - 1`
    /// wrapping the whole overlay), which is the page a reader who wants out is
    /// most likely to be on.
    @Test("Skip is on the last page too")
    func skipIsVisibleOnTheLastPage() throws {
        let view = try SourcePin.read("Patina/Features/Onboarding/Views/OnboardingFlowView.swift")
        #expect(view.contains("Onboarding.SkipButton"))

        // Nothing between the TabView and the Skip button gates it on the page
        // index. (`primaryButton` still reads `currentPage` — that is the CTA
        // deciding whether to advance or finish, not a visibility guard.)
        let tabView = try #require(view.range(of: "tabViewStyle(.page(indexDisplayMode: .never))"))
        let skip = try #require(view.range(of: "Button(\"Skip\")"))
        let between = String(view[tabView.upperBound..<skip.lowerBound])
        #expect(!between.contains("currentPage <"))
        #expect(!between.contains("pages.count - 1"))
    }

    @Test("the accessibility hint tells the truth about where Skip goes")
    func skipHintMatchesBehaviour() throws {
        let view = try SourcePin.read("Patina/Features/Onboarding/Views/OnboardingFlowView.swift")
        #expect(view.contains("Skips the introduction and the style questions."))
        #expect(!view.contains("Skips the introduction and continues to style questions."))
    }

    // MARK: - C1-28 · answers survive

    @Test("progress is saved on disappear and on backgrounding, not only on an explicit exit")
    func quizProgressPersistsWithoutTheDialog() throws {
        let quiz = try SourcePin.read("Patina/Features/StyleQuiz/Views/StyleQuizView.swift")
        #expect(quiz.contains(".onDisappear {\n            viewModel.saveProgress()"))
        #expect(quiz.contains("if phase != .active { viewModel.saveProgress() }"))
        #expect(quiz.contains("@Environment(\\.scenePhase) private var scenePhase"))
    }

    /// Its own defaults suite rather than `UserDefaults.standard`: this ran
    /// beside 1600 other tests and wrote a real key into the shared domain.
    @Test("a saved snapshot is restored on the next mount")
    @MainActor
    func savedProgressRestores() {
        let suite = "GuestEscapeTests.savedProgress"
        let defaults = UserDefaults(suiteName: suite)!
        defaults.removePersistentDomain(forName: suite)
        defer { defaults.removePersistentDomain(forName: suite) }

        let first = StyleQuizViewModel(defaults: defaults)
        first.toggleSelection(question: 0, option: 1)
        first.currentQuestion = 2
        first.toggleSelection(question: 2, option: 0)
        first.saveProgress()

        let resumed = StyleQuizViewModel(defaults: defaults)
        #expect(resumed.currentQuestion == 2)
        #expect(resumed.selections[0] == [1])
        #expect(resumed.selections[2] == [0])
    }
}
