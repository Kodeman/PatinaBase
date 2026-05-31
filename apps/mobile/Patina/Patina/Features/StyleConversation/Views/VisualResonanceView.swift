//
//  VisualResonanceView.swift
//  Patina
//
//  Q1: Visual Resonance. 2×2 image grid, single select, auto-advance.
//  Per PRD §4.6.1.
//

import SwiftUI

struct VisualResonanceView: View {

    @Bindable var viewModel: StyleConversationViewModel

    /// Visual attributes per choice for the tinted background placeholder.
    /// Replace these gradients with real photographs when assets land.
    private let cells: [(VisualResonance, LinearGradient)] = [
        (.warmMinimal, LinearGradient(
            colors: [PatinaColors.softCream, PatinaColors.clay.opacity(0.4)],
            startPoint: .topLeading, endPoint: .bottomTrailing
        )),
        (.coolModern, LinearGradient(
            colors: [PatinaColors.dustyBlue.opacity(0.5), PatinaColors.charcoal.opacity(0.7)],
            startPoint: .topLeading, endPoint: .bottomTrailing
        )),
        (.layeredComfort, LinearGradient(
            colors: [PatinaColors.mocha.opacity(0.7), PatinaColors.terracotta.opacity(0.6)],
            startPoint: .topLeading, endPoint: .bottomTrailing
        )),
        (.curatedMix, LinearGradient(
            colors: [PatinaColors.sage.opacity(0.6), PatinaColors.goldenHour.opacity(0.4)],
            startPoint: .topLeading, endPoint: .bottomTrailing
        ))
    ]

    var body: some View {
        let columns = [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)]

        LazyVGrid(columns: columns, spacing: 8) {
            ForEach(cells, id: \.0) { choice, gradient in
                cell(for: choice, gradient: gradient)
            }
        }
        .padding(.horizontal, 24)
    }

    private func cell(for choice: VisualResonance, gradient: LinearGradient) -> some View {
        let isSelected = viewModel.responses.visualResonance == choice
        let anySelected = viewModel.responses.visualResonance != nil

        return Button(action: {
            viewModel.answerQ1(choice)
        }) {
            ZStack {
                RoundedRectangle(cornerRadius: 12)
                    .fill(gradient)
                    .aspectRatio(1, contentMode: .fit)

                if isSelected {
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(PatinaColors.charcoal, lineWidth: 3)

                    VStack {
                        Spacer()
                        Text(choice.displayName)
                            .font(.custom("Inter-SemiBold", size: 11, relativeTo: .caption2))
                            .foregroundStyle(.white)
                            .shadow(color: Color.black.opacity(0.6), radius: 2)
                            .padding(14)
                    }
                }
            }
            .opacity(anySelected && !isSelected ? 0.6 : 1)
            .scaleEffect(isSelected ? 0.97 : 1.0)
            .animation(.spring(response: 0.3), value: isSelected)
            .animation(.easeOut(duration: 0.2), value: anySelected)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text("\(choice.displayName) room photograph"))
        .accessibilityAddTraits(isSelected ? [.isSelected] : [])
    }
}
