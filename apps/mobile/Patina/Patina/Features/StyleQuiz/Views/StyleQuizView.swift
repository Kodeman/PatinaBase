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
    /// R26: selection/progress springs respect Reduce Motion.
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var viewModel = StyleQuizViewModel()
    @State private var companionPresentation: CompanionPresentationState = .resting
    @State private var hasPresentedCompanion = false
    /// R05: drives the mid-quiz "save or discard?" exit confirmation.
    @State private var showExitDialog = false

    /// Optional callback when quiz completes (for onboarding flow)
    var onComplete: ((StyleProfileResult) -> Void)?

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
                // Question text
                Text(viewModel.currentQuestionData.title)
                    .font(PatinaTypography.h3)
                    .foregroundStyle(PatinaColors.Text.primary)
                    .padding(.top, 72)
                    .padding(.horizontal, 24)
                    .frame(maxWidth: .infinity, alignment: .leading)

                // Answer content
                questionContent(viewModel.currentQuestionData)

                Spacer()
            }

            // Companion-style journey progress pill at bottom
            quizProgressPill
                .padding(.bottom, 28)
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

    // MARK: - Question Content

    @ViewBuilder
    private func questionContent(_ question: QuizQuestion) -> some View {
        let currentSelections = viewModel.selections[question.id] ?? []

        switch question.type {
        case let .imageGrid(options):
            imageGridView(options: options, questionId: question.id, selections: currentSelections)

        case let .iconList(options), let .budgetTiers(options):
            listView(options: options, questionId: question.id, selections: currentSelections, isBudget: question.id == 3)

        case let .materialCards(options):
            materialCardsView(options: options, questionId: question.id, selections: currentSelections)
        }
    }

    // MARK: - Image Grid (Q1)

    private func imageGridView(options: [QuizOption], questionId: Int, selections: Set<Int>) -> some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
            ForEach(Array(options.enumerated()), id: \.offset) { index, option in
                Button {
                    selectOption(question: questionId, option: index)
                } label: {
                    VStack(spacing: 0) {
                        (option.gradient ?? PatinaGradients.warm)
                            .frame(minHeight: 120)
                        Text(option.label)
                            .font(PatinaTypography.uiSmall)
                            .foregroundStyle(selections.contains(index) ? .white : PatinaColors.Text.primary)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 10)
                            .frame(maxWidth: .infinity)
                            .background(selections.contains(index) ? PatinaColors.clay : PatinaColors.Background.secondary)
                    }
                    .clipShape(RoundedRectangle(cornerRadius: 14))
                    .overlay(
                        RoundedRectangle(cornerRadius: 14)
                            .stroke(selections.contains(index) ? PatinaColors.clay : Color.clear, lineWidth: 2.5)
                    )
                    .scaleEffect(selections.contains(index) ? 0.97 : 1.0)
                    .animation(reduceMotion ? nil : .spring(response: 0.3), value: selections.contains(index))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(24)
    }

    // MARK: - List View (Q2, Q4, Q5)

    private func listView(options: [QuizOption], questionId: Int, selections: Set<Int>, isBudget: Bool) -> some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 10) {
                ForEach(Array(options.enumerated()), id: \.offset) { index, option in
                    Button {
                        selectOption(question: questionId, option: index)
                    } label: {
                        HStack(spacing: 14) {
                            if let icon = option.icon {
                                if isBudget {
                                    Text(icon)
                                        .font(.system(size: 20))
                                        .frame(width: 44, height: 44)
                                        .background(selections.contains(index) ? PatinaColors.clay : PatinaColors.Background.secondary)
                                        .clipShape(RoundedRectangle(cornerRadius: 11))
                                } else {
                                    Text(icon)
                                        .font(.system(size: 24))
                                        .frame(width: 56)
                                }
                            }
                            VStack(alignment: .leading, spacing: 2) {
                                Text(option.label)
                                    .font(PatinaTypography.uiAction)
                                    .foregroundStyle(selections.contains(index) ? PatinaColors.Text.inverse : PatinaColors.Text.primary)
                                if let subtitle = option.subtitle {
                                    Text(subtitle)
                                        .font(PatinaTypography.caption)
                                        .foregroundStyle(selections.contains(index) ? PatinaColors.Text.inverse.opacity(0.8) : PatinaColors.Text.muted)
                                }
                            }
                            Spacer()
                        }
                        .padding(16)
                        .background(selections.contains(index) ? PatinaColors.Interactive.active : PatinaColors.Background.secondary)
                        .clipShape(RoundedRectangle(cornerRadius: 14))
                        .scaleEffect(selections.contains(index) ? 0.97 : 1.0)
                        .animation(reduceMotion ? nil : .spring(response: 0.3), value: selections.contains(index))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 24)
            .padding(.top, 12)
        }
    }

    // MARK: - Material Cards (Q3)

    private func materialCardsView(options: [QuizOption], questionId: Int, selections: Set<Int>) -> some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 10) {
                ForEach(Array(options.enumerated()), id: \.offset) { index, option in
                    Button {
                        selectOption(question: questionId, option: index)
                    } label: {
                        HStack(spacing: 14) {
                            (option.gradient ?? PatinaGradients.warm)
                                .frame(width: 52, height: 52)
                                .clipShape(RoundedRectangle(cornerRadius: 10))

                            VStack(alignment: .leading, spacing: 2) {
                                Text(option.label)
                                    .font(PatinaTypography.uiAction)
                                    .foregroundStyle(selections.contains(index) ? .white : PatinaColors.Text.primary)
                                if let subtitle = option.subtitle {
                                    Text(subtitle)
                                        .font(PatinaTypography.caption)
                                        .foregroundStyle(selections.contains(index) ? .white.opacity(0.8) : PatinaColors.Text.muted)
                                }
                            }
                            Spacer()
                        }
                        .padding(14)
                        .background(selections.contains(index) ? PatinaColors.clay : PatinaColors.Background.secondary)
                        .clipShape(RoundedRectangle(cornerRadius: 14))
                        .scaleEffect(selections.contains(index) ? 0.97 : 1.0)
                        .animation(reduceMotion ? nil : .spring(response: 0.3), value: selections.contains(index))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 24)
            .padding(.top, 12)
        }
    }

    // MARK: - Helpers

    private func selectOption(question: Int, option: Int) {
        HapticManager.shared.impact(.light)
        viewModel.toggleSelection(question: question, option: option)
    }
}

private extension StyleQuizView {
    var currentQuizCompanionPresentation: CompanionPresentationState {
        let step = viewModel.currentQuestion + 1
        let total = viewModel.questions.count
        let fraction = total > 0 ? Double(step) / Double(total) : 0
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
