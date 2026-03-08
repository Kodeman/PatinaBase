//
//  PieceStoryCard.swift
//  Patina
//
//  Story and provenance display for an emerging piece
//

import SwiftUI

/// Displays the maker, name, and provenance of a piece
struct PieceStoryCard: View {

    let piece: EmergingPiece
    let isVisible: Bool

    var body: some View {
        VStack(spacing: PatinaSpacing.sm) {
            // Maker (eyebrow)
            Text(piece.maker.uppercased())
                .font(PatinaTypography.eyebrow)
                .foregroundStyle(PatinaColors.clayBeige)
                .tracking(2)

            // Piece name
            Text(piece.name)
                .font(PatinaTypography.h2)
                .foregroundStyle(PatinaColors.offWhite)
                .multilineTextAlignment(.center)

            // Provenance (italic)
            Text(piece.provenance)
                .font(PatinaTypography.patinaVoice)
                .foregroundStyle(PatinaColors.offWhite.opacity(0.8))
                .multilineTextAlignment(.center)
                .lineSpacing(4)
                .padding(.top, PatinaSpacing.xxs)

            // Materials and era
            if !piece.materials.isEmpty || piece.era != nil {
                HStack(spacing: PatinaSpacing.sm) {
                    if let era = piece.era {
                        TagView(text: era)
                    }

                    if !piece.materials.isEmpty {
                        TagView(text: piece.materialsDescription)
                    }
                }
                .padding(.top, PatinaSpacing.xs)
            }

            // Price
            if let price = piece.formattedPrice {
                Text(price)
                    .font(PatinaTypography.headlineMedium)
                    .foregroundStyle(PatinaColors.offWhite)
                    .padding(.top, PatinaSpacing.sm)
            }
        }
        .padding(.horizontal, PatinaSpacing.xl)
        .opacity(isVisible ? 1 : 0)
        .offset(y: isVisible ? 0 : 20)
        .animation(.easeOut(duration: 0.6), value: isVisible)
    }
}

// MARK: - Tag View

private struct TagView: View {
    let text: String

    var body: some View {
        Text(text)
            .font(PatinaTypography.caption)
            .foregroundStyle(PatinaColors.offWhite.opacity(0.7))
            .padding(.horizontal, PatinaSpacing.sm)
            .padding(.vertical, PatinaSpacing.xxs)
            .background(
                Capsule()
                    .fill(PatinaColors.offWhite.opacity(0.1))
            )
    }
}

// MARK: - Preview

#Preview {
    ZStack {
        PatinaColors.charcoal
            .ignoresSafeArea()

        PieceStoryCard(
            piece: MockPieces.emergingPieces[0],
            isVisible: true
        )
    }
}
