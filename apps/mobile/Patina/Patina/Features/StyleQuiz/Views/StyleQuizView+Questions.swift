//
//  StyleQuizView+Questions.swift
//  Patina
//
//  The five question layouts, lifted out of `StyleQuizView.swift` so that file
//  stays under the 500-line / 300-line-body budgets `.swiftlint.yml` sets. No
//  behaviour changes with the move — this is the same code, in an extension on
//  the same view.
//

import SwiftUI

extension StyleQuizView {

    // MARK: - Question Content

    @ViewBuilder
    func questionContent(_ question: QuizQuestion) -> some View {
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

    func imageGridView(options: [QuizOption], questionId: Int, selections: Set<Int>) -> some View {
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

    func listView(options: [QuizOption], questionId: Int, selections: Set<Int>, isBudget: Bool) -> some View {
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

    func materialCardsView(options: [QuizOption], questionId: Int, selections: Set<Int>) -> some View {
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
}
