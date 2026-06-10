//
//  StyleQuizView.swift
//  Patina
//
//  5-question style quiz with visual resonance, lifestyle, material, budget, catalyst
//

import SwiftUI

struct StyleQuizView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.appCoordinator) private var coordinator
    /// R26: selection/progress springs respect Reduce Motion.
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var viewModel = StyleQuizViewModel()
    /// R05: drives the mid-quiz "save or discard?" exit confirmation.
    @State private var showExitDialog = false

    /// Optional callback when quiz completes (for onboarding flow)
    var onComplete: ((StyleProfileResult) -> Void)? = nil

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
        .onChange(of: viewModel.isComplete) { _, complete in
            if complete, let result = viewModel.result {
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
        let step = viewModel.currentQuestion + 1
        let total = viewModel.questions.count
        let progress = Double(step) / Double(total)
        let label = stepLabels[min(viewModel.currentQuestion, stepLabels.count - 1)]
        let isMultiSelect = !viewModel.currentQuestionData.type.isSingleSelect
        let nudge = viewModel.companionNudgeLabel

        return Button {
            if isMultiSelect && viewModel.canAdvance {
                HapticManager.shared.impact(.light)
                viewModel.advance()
            }
        } label: {
            HStack(spacing: 12) {
                // Progress ring
                ZStack {
                    Circle()
                        .stroke(Color.white.opacity(0.15), lineWidth: 2.5)
                        .frame(width: 40, height: 40)

                    Circle()
                        .trim(from: 0, to: progress)
                        .stroke(PatinaColors.clay, style: StrokeStyle(lineWidth: 2.5, lineCap: .round))
                        .frame(width: 40, height: 40)
                        .rotationEffect(.degrees(-90))
                        .animation(reduceMotion ? nil : .spring(response: 0.4, dampingFraction: 0.85), value: progress)

                    // Deliberately fixed: lives inside a 40pt progress ring;
                    // Dynamic Type scaling would overflow the gauge.
                    Text("\(Int(progress * 100))%")
                        .font(.custom("PlayfairDisplay-Medium", size: 13))
                        .foregroundStyle(PatinaColors.offWhite)
                }

                // Text
                VStack(alignment: .leading, spacing: 1) {
                    Text(label)
                        .font(PatinaTypography.uiSmall)
                        .foregroundStyle(PatinaColors.offWhite)

                    MonoLabel(text: "Question \(step) of \(total)", size: PatinaTypography.monoSmall, color: PatinaColors.clay)
                }

                Spacer()

                // Nudge or step dots
                if let nudge, isMultiSelect {
                    Text(nudge)
                        .font(PatinaTypography.uiSmall)
                        .foregroundStyle(PatinaColors.Text.interactive)
                } else {
                    HStack(spacing: 4) {
                        ForEach(1...total, id: \.self) { i in
                            Circle()
                                .fill(quizDotColor(step: i, currentStep: step))
                                .frame(width: 6, height: 6)
                        }
                    }
                }
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 12)
            .background(PatinaColors.Background.dark)
            .clipShape(Capsule())
            .patinaShadow(PatinaShadows.companion)
            .padding(.horizontal, 40)
        }
        .buttonStyle(.plain)
        .animation(reduceMotion ? nil : .spring(response: 0.3), value: nudge)
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
        case .imageGrid(let options):
            imageGridView(options: options, questionId: question.id, selections: currentSelections)

        case .iconList(let options), .budgetTiers(let options):
            listView(options: options, questionId: question.id, selections: currentSelections, isBudget: question.id == 3)

        case .materialCards(let options):
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

#Preview {
    StyleQuizView()
        .environment(\.appCoordinator, AppCoordinator())
}
