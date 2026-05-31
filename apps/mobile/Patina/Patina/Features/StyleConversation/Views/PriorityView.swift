//
//  PriorityView.swift
//  Patina
//
//  Q5: The Priority. Vertical card stack, contextual to room type.
//  Per PRD §4.6.5.
//

import SwiftUI

struct PriorityView: View {

    @Bindable var viewModel: StyleConversationViewModel

    struct PriorityCard: Identifiable {
        let id: PriorityChoice
        let label: String
        let subtext: String
    }

    var body: some View {
        VStack(spacing: 12) {
            ForEach(cards) { card in
                button(for: card)
            }
        }
        .padding(.horizontal, 24)
    }

    private var cards: [PriorityCard] {
        switch viewModel.roomType {
        case "bedroom":
            return [
                .init(id: .rest, label: "A place to truly rest", subtext: "Comfort that invites you in"),
                .init(id: .anchor, label: "A piece that anchors", subtext: "Something that defines the room"),
                .init(id: .light, label: "Better light", subtext: "Morning light, evening calm"),
                .init(id: .breathingRoom, label: "More room to breathe", subtext: "Space to think, space to be")
            ]
        default:
            return [
                .init(id: .gathering, label: "A place to gather", subtext: "Somewhere people want to sit and stay"),
                .init(id: .anchor, label: "A piece that anchors", subtext: "Something that makes the room make sense"),
                .init(id: .light, label: "Better light", subtext: "Warmth that changes how it feels to be here"),
                .init(id: .breathingRoom, label: "More room to breathe", subtext: "Less clutter, more calm")
            ]
        }
    }

    private func button(for card: PriorityCard) -> some View {
        let isSelected = viewModel.responses.priority == card.id
        return Button(action: { viewModel.answerQ5(card.id) }) {
            VStack(alignment: .leading, spacing: 4) {
                Text(card.label)
                    .font(.custom("PlayfairDisplay-Regular", size: 16))
                    .foregroundStyle(isSelected ? PatinaColors.offWhite : PatinaColors.charcoal)
                Text(card.subtext)
                    .font(.custom("Inter-Light", size: 12))
                    .foregroundStyle(isSelected ? PatinaColors.pearl : PatinaColors.agedOak)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, 20)
            .padding(.horizontal, 22)
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(isSelected ? PatinaColors.charcoal : PatinaColors.softCream)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .stroke(
                        isSelected ? PatinaColors.charcoal : PatinaColors.pearl,
                        lineWidth: 1.5
                    )
            )
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(card.label))
        .accessibilityHint(Text(card.subtext))
        .accessibilityAddTraits(isSelected ? [.isSelected] : [])
    }
}
