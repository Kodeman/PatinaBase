//
//  StyleQuizView.swift
//  Patina
//
//  5-question style quiz with visual resonance, lifestyle, material, budget, catalyst
//

import SwiftData
import SwiftUI

struct StyleQuizView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.appCoordinator) private var coordinator
    /// Writes the completed quiz to `StylePreferenceModel` — the row Home and
    /// Profile read to decide whether a style profile exists.
    @Environment(\.modelContext) private var modelContext
    /// R26: selection/progress springs respect Reduce Motion. Not `private`:
    /// the question layouts read it from `StyleQuizView+Questions.swift`.
    @Environment(\.accessibilityReduceMotion) var reduceMotion
    /// Not `private` for the same reason as `reduceMotion` above.
    @State var viewModel = StyleQuizViewModel()
    @State private var companionPresentation: CompanionPresentationState = .resting
    @State private var hasPresentedCompanion = false
    /// R05: drives the mid-quiz "save or discard?" exit confirmation.
    @State private var showExitDialog = false

    /// Optional callback when quiz completes (for onboarding flow)
    var onComplete: ((StyleProfileResult) -> Void)?
    /// B-21 — "I'll do this later". Set by `OnboardingFlowHost`, which is the
    /// mount that had no exit at all: the AX tree carried no Back, Skip or
    /// close control on any step.
    var onDefer: (() -> Void)?
    /// P-18 — the sign-in door, on every quiz step.
    var onSignIn: (() -> Void)?
    /// C1-28 — a save on backgrounding, not only on an explicit exit.
    @Environment(\.scenePhase) private var scenePhase

    /// Step labels for the journey pill
    private let stepLabels = [
        "Your visual style",
        "How you live",
        // R17: kept in step with the question copy — the swatches show
        // materials/palettes, not tactile textures.
        "Materials you love",
        "Your investment",
        "Your catalyst"
    ]

    var body: some View {
        ZStack(alignment: .bottom) {
            VStack(spacing: 0) {
                quizNavigationRow

                // Question text
                Text(viewModel.currentQuestionData.title)
                    .font(PatinaTypography.h3)
                    .foregroundStyle(PatinaColors.Text.primary)
                    .padding(.top, 12)
                    .padding(.horizontal, 24)
                    .frame(maxWidth: .infinity, alignment: .leading)

                // Answer content
                questionContent(viewModel.currentQuestionData)

                Spacer()

                if let onSignIn {
                    // P-18: reachable from every step, not only from Welcome.
                    Button("I already have an account — Sign in", action: onSignIn)
                        .font(PatinaTypography.caption)
                        .foregroundStyle(PatinaColors.Text.interactive)
                        .frame(minHeight: 44)
                        .contentShape(Rectangle())
                        .accessibilityIdentifier("StyleQuiz.SignInButton")
                }
            }

            // Companion-style journey progress pill at bottom
            quizProgressPill
                .padding(.bottom, 28)

            if viewModel.isSubmitting {
                submittingOverlay
            }
        }
        .background(PatinaColors.Background.primary)
        .toolbar(.hidden, for: .navigationBar)
        // R05: exit affordance. Shown only when the quiz was pushed via the
        // coordinator (`onComplete == nil`). During onboarding (`onComplete`
        // set by OnboardingFlowHost) there is deliberately NO ✕ — the
        // `.onboarding` phase only flips to `.main` when onboarding is
        // marked complete, and the host exposes no partial-exit path, so an
        // exit here would either strand the user or falsely complete
        // onboarding. Onboarding users finish the (short) quiz instead.
        .overlay(alignment: .topTrailing) {
            if onComplete == nil {
                exitButton
                    .padding(.top, 8)
                    .padding(.trailing, 18)
            }
        }
        .confirmationDialog(
            "Leave the quiz?",
            isPresented: $showExitDialog,
            titleVisibility: .visible
        ) {
            Button("Save progress & exit") {
                viewModel.saveProgress()
                exitQuiz()
            }
            Button("Discard & exit", role: .destructive) {
                viewModel.discardSavedProgress()
                exitQuiz()
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Save your answers so far and pick up where you left off next time.")
        }
        .onAppear {
            presentQuizCompanionIfNeeded()
        }
        // C1-28: the answers survive a call, a home swipe or a kill.
        .onDisappear {
            viewModel.saveProgress()
        }
        .onChange(of: scenePhase) { _, phase in
            if phase != .active { viewModel.saveProgress() }
        }
        .onChange(of: viewModel.currentQuestion) { _, _ in
            updateQuizCompanion()
        }
        .onDisappear {
            guard hasPresentedCompanion else { return }
            CompanionAnalytics.shared.trackPresentationDismissed(
                screen: "style_quiz",
                from: .expanded
            )
        }
        .onChange(of: viewModel.isComplete) { _, complete in
            if complete, let result = viewModel.result {
                // Persist before routing: both mounts leave through this one
                // seam, so this is where a finished quiz becomes a style
                // profile the rest of the app can see.
                viewModel.persistToSwiftData(context: modelContext)
                if let onComplete {
                    onComplete(result)
                } else {
                    coordinator.navigate(to: .styleResult(result: result))
                }
            }
        }
    }

    // MARK: - Exit (R05)

    /// Circular ✕ icon-button matching the BackChevronButton chrome used on
    /// other nav-bar-hidden screens (36pt circle, light pill, pearl stroke).
    private var exitButton: some View {
        Button {
            HapticManager.shared.impact(.light)
            if viewModel.hasAnyAnswers {
                showExitDialog = true
            } else {
                exitQuiz()
            }
        } label: {
            Image(systemName: "xmark")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(PatinaColors.Text.primary)
                .frame(width: 36, height: 36)
                .background(Circle().fill(PatinaColors.Background.primary.opacity(0.92)))
                .overlay(Circle().stroke(PatinaColors.pearl, lineWidth: 0.5))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Exit quiz")
    }

    /// Only reachable when `onComplete == nil`, i.e. the quiz was pushed via
    /// the coordinator — pop back to wherever the user came from.
    private func exitQuiz() {
        coordinator.goBack()
    }

    // MARK: - Navigation row (B-21, P-18)

    /// Back on every step past the first, and an "I'll do this later" that
    /// leaves. The quiz had neither: `onComplete == nil` was the only route to
    /// the ✕, and during onboarding that route did not exist.
    private var quizNavigationRow: some View {
        HStack {
            if viewModel.currentQuestion > 0 {
                Button {
                    HapticManager.shared.impact(.light)
                    viewModel.goBack()
                } label: {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(PatinaColors.Text.primary)
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Previous question")
                .accessibilityIdentifier("StyleQuiz.BackButton")
            }

            Spacer()

            if let onDefer {
                Button("I'll do this later") {
                    viewModel.saveProgress()
                    onDefer()
                }
                .font(PatinaTypography.uiSmall)
                .foregroundStyle(PatinaColors.Text.muted)
                .frame(minHeight: 44)
                .contentShape(Rectangle())
                .accessibilityIdentifier("StyleQuiz.DeferButton")
            }
        }
        .padding(.top, 52)
        .padding(.horizontal, 18)
    }

    // MARK: - Submitting (C1-04)

    /// `isSubmitting` had no reader anywhere in the app, so the fifth answer
    /// left the reader on a highlighted Q5 for up to the RPC timeout with
    /// nothing to look at.
    private var submittingOverlay: some View {
        VStack(spacing: PatinaSpacing.md) {
            ProgressView()
                .tint(PatinaColors.Text.secondary)
            Text("Reading your answers…")
                .font(PatinaTypography.bodySmall)
                .foregroundStyle(PatinaColors.Text.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(PatinaColors.Background.primary.opacity(0.96))
        .accessibilityIdentifier("StyleQuiz.SubmittingState")
    }

    // MARK: - Journey Progress Pill

    private var quizProgressPill: some View {
        let isMultiSelect = !viewModel.currentQuestionData.type.isSingleSelect
        let nudge = viewModel.companionNudgeLabel

        return CompanionHearthView(
            presentation: companionPresentation,
            onDismiss: nil
        ) {
            VStack(alignment: .leading, spacing: 10) {
                if let nudge, !nudge.isEmpty {
                    Text(nudge)
                        .font(PatinaTypography.uiSmall)
                        .foregroundStyle(PatinaColors.Text.inverse.opacity(0.78))
                        .fixedSize(horizontal: false, vertical: true)
                }

                if isMultiSelect {
                    Button {
                        guard viewModel.canAdvance else { return }
                        HapticManager.shared.impact(.light)
                        viewModel.advance()
                    } label: {
                        HStack(spacing: 8) {
                            Text("Continue")
                                .font(PatinaTypography.uiSmall)
                            Spacer()
                            Image(systemName: "arrow.right")
                                .font(.system(size: 13, weight: .semibold))
                        }
                        .foregroundStyle(
                            viewModel.canAdvance
                                ? PatinaColors.offWhite
                                : PatinaColors.Text.inverse.opacity(0.42)
                        )
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .padding(.horizontal, 14)
                        .background(Color.white.opacity(viewModel.canAdvance ? 0.10 : 0.05))
                        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .disabled(!viewModel.canAdvance)
                    .accessibilityHint("Moves to the next quiz question.")
                    .accessibilityIdentifier("companion.quiz.continue")
                }
            }
        }
    }

    private func quizDotColor(step: Int, currentStep: Int) -> Color {
        if step < currentStep { return PatinaColors.clay }
        if step == currentStep { return PatinaColors.offWhite }
        return Color.white.opacity(0.2)
    }

    // MARK: - Helpers

    func selectOption(question: Int, option: Int) {
        HapticManager.shared.impact(.light)
        viewModel.toggleSelection(question: question, option: option)
    }
}

private extension StyleQuizView {
    var currentQuizCompanionPresentation: CompanionPresentationState {
        let step = viewModel.currentQuestion + 1
        let total = viewModel.questions.count
        // A-21: answers recorded, not the index of the question on screen.
        let fraction = Double(viewModel.progress)
        let label = stepLabels[min(viewModel.currentQuestion, stepLabels.count - 1)]
        let progress = CompanionProgressPresentation(
            fraction: fraction,
            title: label,
            detail: "Question \(step) of \(total)",
            step: step,
            totalSteps: total
        )

        return .expanded(
            CompanionExpandedPresentation(
                title: label,
                detail: "Question \(step) of \(total)",
                progress: progress,
                communicationLength: .brief
            )
        )
    }

    func presentQuizCompanionIfNeeded() {
        guard !hasPresentedCompanion else {
            updateQuizCompanion()
            return
        }

        hasPresentedCompanion = true
        CompanionAnalytics.shared.trackPresentationExposed(
            state: .collapsed,
            surface: "style_quiz"
        )

        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(80))
            CompanionAnalytics.shared.trackPresentationExpanded(
                screen: "style_quiz",
                from: .collapsed,
                extent: .card
            )
            updateQuizCompanion()
        }
    }

    func updateQuizCompanion() {
        withAnimation(
            reduceMotion
                ? .easeOut(duration: CompanionConstants.reducedMotionCrossfadeDuration)
                : .spring(
                    response: CompanionConstants.springResponse,
                    dampingFraction: CompanionConstants.springDamping
                )
        ) {
            companionPresentation = currentQuizCompanionPresentation
        }

        CompanionAnalytics.shared.trackPresentationExposed(
            state: .expanded,
            surface: "style_quiz",
            extent: .card
        )
    }
}

#Preview {
    StyleQuizView()
        .environment(\.appCoordinator, AppCoordinator())
}
