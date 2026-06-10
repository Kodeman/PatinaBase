//
//  StyleSwatchCell.swift
//  Patina
//
//  Material swatch cell for Q3 Material Connection.
//  Double-border selected state + checkmark badge.
//  Per PRD §4.6.3.
//

import SwiftUI

struct StyleSwatchCell: View {

    let label: String
    let gradient: LinearGradient
    let isSelected: Bool
    let onTap: () -> Void

    @State private var shakeTrigger = false

    var body: some View {
        Button(action: onTap) {
            ZStack(alignment: .topTrailing) {
                ZStack(alignment: .bottomLeading) {
                    gradient

                    // Bottom gradient scrim so the label is always legible
                    LinearGradient(
                        colors: [Color.black.opacity(0), Color.black.opacity(0.45)],
                        startPoint: .top,
                        endPoint: .bottom
                    )

                    Text(label)
                        .font(.custom("Inter-SemiBold", size: 11, relativeTo: .caption2))
                        .foregroundStyle(.white)
                        .shadow(color: Color.black.opacity(0.6), radius: 2, x: 0, y: 1)
                        .padding(14)
                }

                if isSelected {
                    checkmarkBadge
                        .padding(10)
                }
            }
            .frame(maxWidth: .infinity)
            .aspectRatio(1, contentMode: .fit)
            .overlay(selectionBorder)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(label))
        .accessibilityAddTraits(isSelected ? [.isSelected] : [])
    }

    @ViewBuilder
    private var selectionBorder: some View {
        if isSelected {
            // Double-border effect — 3px white outer ring + 1.5px charcoal inset
            ZStack {
                RoundedRectangle(cornerRadius: 0)
                    .stroke(Color.white, lineWidth: 3)
                RoundedRectangle(cornerRadius: 0)
                    .inset(by: 2.25)
                    .stroke(PatinaColors.charcoal, lineWidth: 1.5)
            }
        }
    }

    private var checkmarkBadge: some View {
        ZStack {
            Circle()
                .fill(PatinaColors.charcoal)
                .frame(width: 22, height: 22)
            Image(systemName: "checkmark")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(.white)
        }
    }
}

private let previewGradient = LinearGradient(
    colors: [Color.brown, Color.orange.opacity(0.6)],
    startPoint: .topLeading,
    endPoint: .bottomTrailing
)

#Preview {
    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 3), count: 2), spacing: 3) {
        StyleSwatchCell(label: "Weathered Oak", gradient: previewGradient, isSelected: false, onTap: {})
        StyleSwatchCell(label: "Aged Leather", gradient: previewGradient, isSelected: true, onTap: {})
    }
    .padding()
    .background(PatinaColors.Background.primary)
}
