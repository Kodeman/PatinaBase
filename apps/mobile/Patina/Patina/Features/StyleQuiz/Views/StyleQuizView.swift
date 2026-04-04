//
//  StyleQuizView.swift
//  Patina
//
//  5-question style quiz with visual resonance, lifestyle, material, budget, focus
//

import SwiftUI

struct StyleQuizView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var currentQuestion = 0
    @State private var selections: [Int: Set<Int>] = [:]

    var onComplete: () -> Void = {}

    private let questions: [QuizQuestion] = [
        QuizQuestion(
            number: 1,
            title: "Which room speaks to you?",
            type: .imageGrid([
                QuizOption(label: "Warm Minimal", gradient: PatinaGradients.warm),
                QuizOption(label: "Cool Modern", gradient: PatinaGradients.metal),
                QuizOption(label: "Classic Comfort", gradient: PatinaGradients.linen),
                QuizOption(label: "Eclectic Curated", gradient: PatinaGradients.rattan),
            ])
        ),
        QuizQuestion(
            number: 2,
            title: "How do you actually live in your space?",
            type: .iconList([
                QuizOption(label: "Love having people over", subtitle: "Entertaining & gathering", icon: "🍷"),
                QuizOption(label: "My quiet sanctuary", subtitle: "Rest & recharge", icon: "🧘"),
                QuizOption(label: "Work from this room", subtitle: "Productivity & focus", icon: "💻"),
                QuizOption(label: "Family central", subtitle: "Activity & play", icon: "👨‍👩‍👧"),
                QuizOption(label: "Personal retreat", subtitle: "Reading & reflection", icon: "📚"),
            ])
        ),
        QuizQuestion(
            number: 3,
            title: "What texture calls to you?",
            type: .materialCards([
                QuizOption(label: "Weathered Oak", subtitle: "Warmth & history", gradient: PatinaGradients.wood),
                QuizOption(label: "Smooth Marble", subtitle: "Cool & timeless", gradient: PatinaGradients.stone),
                QuizOption(label: "Soft Linen", subtitle: "Light & breathable", gradient: PatinaGradients.linen),
                QuizOption(label: "Aged Leather", subtitle: "Rich & evolving", gradient: PatinaGradients.leather),
                QuizOption(label: "Woven Rattan", subtitle: "Natural & organic", gradient: PatinaGradients.rattan),
            ])
        ),
        QuizQuestion(
            number: 4,
            title: "What's your comfort zone?",
            type: .budgetTiers([
                QuizOption(label: "Starter", subtitle: "$500–2,000 per piece", icon: "🌱"),
                QuizOption(label: "Investment", subtitle: "$2,000–5,000 per piece", icon: "🪴"),
                QuizOption(label: "Heirloom", subtitle: "$5,000+ per piece", icon: "🌳"),
            ])
        ),
        QuizQuestion(
            number: 5,
            title: "What matters most right now?",
            type: .iconList([
                QuizOption(label: "A statement piece", subtitle: "One show-stopper", icon: "✦"),
                QuizOption(label: "Full room harmony", subtitle: "Everything flows", icon: "◎"),
                QuizOption(label: "Smart storage", subtitle: "Beautiful organization", icon: "▦"),
                QuizOption(label: "Comfort upgrade", subtitle: "Sink-in seating", icon: "☁"),
            ])
        ),
    ]

    var body: some View {
        VStack(spacing: 0) {
            // Progress dots
            HStack(spacing: 6) {
                ForEach(0..<questions.count, id: \.self) { i in
                    Capsule()
                        .fill(progressColor(for: i))
                        .frame(height: 3)
                }
            }
            .padding(.top, 54)
            .padding(.horizontal, 24)

            // Question number
            MonoLabel(text: "Question \(currentQuestion + 1) of \(questions.count)")
                .padding(.top, 16)
                .padding(.horizontal, 24)
                .frame(maxWidth: .infinity, alignment: .leading)

            // Question text
            Text(questions[currentQuestion].title)
                .font(PatinaTypography.h3)
                .foregroundColor(PatinaColors.charcoal)
                .padding(.top, 8)
                .padding(.horizontal, 24)
                .frame(maxWidth: .infinity, alignment: .leading)

            // Answer content
            questionContent(questions[currentQuestion])

            Spacer()
        }
        .background(PatinaColors.offWhite)
        .navigationBarHidden(true)
    }

    // MARK: - Question Content

    @ViewBuilder
    private func questionContent(_ question: QuizQuestion) -> some View {
        let qIndex = question.number - 1
        let currentSelections = selections[qIndex] ?? []

        switch question.type {
        case .imageGrid(let options):
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
                ForEach(Array(options.enumerated()), id: \.offset) { index, option in
                    Button {
                        toggleSelection(question: qIndex, option: index)
                    } label: {
                        VStack(spacing: 0) {
                            (option.gradient ?? PatinaGradients.warm)
                                .frame(minHeight: 120)
                            Text(option.label)
                                .font(PatinaTypography.uiSmall)
                                .foregroundColor(currentSelections.contains(index) ? .white : PatinaColors.charcoal)
                                .padding(.horizontal, 12)
                                .padding(.vertical, 10)
                                .frame(maxWidth: .infinity)
                                .background(currentSelections.contains(index) ? PatinaColors.clay : PatinaColors.softCream)
                        }
                        .clipShape(RoundedRectangle(cornerRadius: 14))
                        .overlay(
                            RoundedRectangle(cornerRadius: 14)
                                .stroke(currentSelections.contains(index) ? PatinaColors.clay : Color.clear, lineWidth: 2.5)
                        )
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(24)

        case .iconList(let options), .budgetTiers(let options):
            ScrollView(showsIndicators: false) {
                VStack(spacing: 10) {
                    ForEach(Array(options.enumerated()), id: \.offset) { index, option in
                        Button {
                            toggleSelection(question: qIndex, option: index)
                        } label: {
                            HStack(spacing: 14) {
                                if let icon = option.icon {
                                    Text(icon)
                                        .font(.system(size: 24))
                                        .frame(width: 56)
                                }
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(option.label)
                                        .font(PatinaTypography.uiAction)
                                        .foregroundColor(currentSelections.contains(index) ? .white : PatinaColors.charcoal)
                                    if let subtitle = option.subtitle {
                                        Text(subtitle)
                                            .font(PatinaTypography.caption)
                                            .foregroundColor(currentSelections.contains(index) ? .white.opacity(0.8) : PatinaColors.agedOak)
                                    }
                                }
                                Spacer()
                            }
                            .padding(16)
                            .background(currentSelections.contains(index) ? PatinaColors.charcoal : PatinaColors.softCream)
                            .clipShape(RoundedRectangle(cornerRadius: 14))
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 24)
                .padding(.top, 12)
            }

        case .materialCards(let options):
            ScrollView(showsIndicators: false) {
                VStack(spacing: 10) {
                    ForEach(Array(options.enumerated()), id: \.offset) { index, option in
                        Button {
                            toggleSelection(question: qIndex, option: index)
                        } label: {
                            HStack(spacing: 14) {
                                (option.gradient ?? PatinaGradients.warm)
                                    .frame(width: 52, height: 52)
                                    .clipShape(RoundedRectangle(cornerRadius: 10))

                                VStack(alignment: .leading, spacing: 2) {
                                    Text(option.label)
                                        .font(PatinaTypography.uiAction)
                                        .foregroundColor(currentSelections.contains(index) ? .white : PatinaColors.charcoal)
                                    if let subtitle = option.subtitle {
                                        Text(subtitle)
                                            .font(PatinaTypography.caption)
                                            .foregroundColor(currentSelections.contains(index) ? .white.opacity(0.8) : PatinaColors.agedOak)
                                    }
                                }
                                Spacer()
                            }
                            .padding(14)
                            .background(currentSelections.contains(index) ? PatinaColors.clay : PatinaColors.softCream)
                            .clipShape(RoundedRectangle(cornerRadius: 14))
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 24)
                .padding(.top, 12)
            }
        }
    }

    // MARK: - Helpers

    private func toggleSelection(question: Int, option: Int) {
        var current = selections[question] ?? []
        if current.contains(option) {
            current.remove(option)
        } else {
            current.insert(option)
        }
        selections[question] = current

        // Auto-advance for single-select questions after brief delay
        if questions[question].type.isSingleSelect {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
                if currentQuestion < questions.count - 1 {
                    withAnimation { currentQuestion += 1 }
                } else {
                    onComplete()
                }
            }
        }
    }

    private func progressColor(for index: Int) -> Color {
        if index < currentQuestion { return PatinaColors.clay }
        if index == currentQuestion { return PatinaColors.mocha }
        return PatinaColors.pearl
    }
}

// MARK: - Models

private struct QuizQuestion {
    let number: Int
    let title: String
    let type: QuizType
}

private enum QuizType {
    case imageGrid([QuizOption])
    case iconList([QuizOption])
    case materialCards([QuizOption])
    case budgetTiers([QuizOption])

    var isSingleSelect: Bool {
        switch self {
        case .imageGrid, .budgetTiers: return true
        case .iconList, .materialCards: return false
        }
    }
}

private struct QuizOption {
    let label: String
    var subtitle: String? = nil
    var gradient: LinearGradient? = nil
    var icon: String? = nil
}

#Preview {
    StyleQuizView()
}
