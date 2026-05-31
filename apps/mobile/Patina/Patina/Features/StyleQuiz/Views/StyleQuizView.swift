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
    @State private var viewModel = StyleQuizViewModel()

    /// Optional callback when quiz completes (for onboarding flow)
    var onComplete: ((StyleProfileResult) -> Void)? = nil

    /// Step labels for the journey pill
    private let stepLabels = [
        "Your visual style",
        "How you live",
        "Textures you love",
        "Your investment",
        "Your catalyst"
    ]

    var body: some View {
        ZStack(alignment: .bottom) {
            VStack(spacing: 0) {
                // Question text
                Text(viewModel.currentQuestionData.title)
                    .font(PatinaTypography.h3)
                    .foregroundStyle(PatinaColors.charcoal)
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
        .background(PatinaColors.offWhite)
        .toolbar(.hidden, for: .navigationBar)
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
                        .animation(.spring(response: 0.4, dampingFraction: 0.85), value: progress)

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
            .background(PatinaColors.charcoal)
            .clipShape(Capsule())
            .patinaShadow(PatinaShadows.companion)
            .padding(.horizontal, 40)
        }
        .buttonStyle(.plain)
        .animation(.spring(response: 0.3), value: nudge)
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
                            .foregroundStyle(selections.contains(index) ? .white : PatinaColors.charcoal)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 10)
                            .frame(maxWidth: .infinity)
                            .background(selections.contains(index) ? PatinaColors.clay : PatinaColors.softCream)
                    }
                    .clipShape(RoundedRectangle(cornerRadius: 14))
                    .overlay(
                        RoundedRectangle(cornerRadius: 14)
                            .stroke(selections.contains(index) ? PatinaColors.clay : Color.clear, lineWidth: 2.5)
                    )
                    .scaleEffect(selections.contains(index) ? 0.97 : 1.0)
                    .animation(.spring(response: 0.3), value: selections.contains(index))
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
                                        .background(selections.contains(index) ? PatinaColors.clay : PatinaColors.softCream)
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
                                    .foregroundStyle(selections.contains(index) ? .white : PatinaColors.charcoal)
                                if let subtitle = option.subtitle {
                                    Text(subtitle)
                                        .font(PatinaTypography.caption)
                                        .foregroundStyle(selections.contains(index) ? .white.opacity(0.8) : PatinaColors.agedOak)
                                }
                            }
                            Spacer()
                        }
                        .padding(16)
                        .background(selections.contains(index) ? PatinaColors.charcoal : PatinaColors.softCream)
                        .clipShape(RoundedRectangle(cornerRadius: 14))
                        .scaleEffect(selections.contains(index) ? 0.97 : 1.0)
                        .animation(.spring(response: 0.3), value: selections.contains(index))
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
                                    .foregroundStyle(selections.contains(index) ? .white : PatinaColors.charcoal)
                                if let subtitle = option.subtitle {
                                    Text(subtitle)
                                        .font(PatinaTypography.caption)
                                        .foregroundStyle(selections.contains(index) ? .white.opacity(0.8) : PatinaColors.agedOak)
                                }
                            }
                            Spacer()
                        }
                        .padding(14)
                        .background(selections.contains(index) ? PatinaColors.clay : PatinaColors.softCream)
                        .clipShape(RoundedRectangle(cornerRadius: 14))
                        .scaleEffect(selections.contains(index) ? 0.97 : 1.0)
                        .animation(.spring(response: 0.3), value: selections.contains(index))
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
