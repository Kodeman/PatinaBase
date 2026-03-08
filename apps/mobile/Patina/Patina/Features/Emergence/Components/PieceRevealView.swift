//
//  PieceRevealView.swift
//  Patina
//
//  Animated piece reveal with floating effect
//

import SwiftUI

/// Animated circular piece image with floating effect
struct PieceRevealView: View {

    let piece: EmergingPiece
    let isRevealed: Bool

    @State private var floatOffset: CGFloat = 0

    var body: some View {
        ZStack {
            // Glow effect behind image
            Circle()
                .fill(
                    RadialGradient(
                        colors: [
                            PatinaColors.clayBeige.opacity(0.4),
                            PatinaColors.clayBeige.opacity(0.1),
                            Color.clear
                        ],
                        center: .center,
                        startRadius: 80,
                        endRadius: 140
                    )
                )
                .frame(width: 280, height: 280)
                .blur(radius: 20)
                .opacity(isRevealed ? 1 : 0)

            // Main image container
            Circle()
                .fill(
                    LinearGradient(
                        colors: [
                            Color(hex: "d4a574"),
                            PatinaColors.clayBeige
                        ],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .frame(width: 200, height: 200)
                .shadow(
                    color: PatinaColors.clayBeige.opacity(0.4),
                    radius: 30,
                    x: 0,
                    y: 15
                )
                .overlay {
                    // Piece image or placeholder
                    if let imageURL = piece.imageURL, let url = URL(string: imageURL) {
                        AsyncImage(url: url) { phase in
                            switch phase {
                            case .success(let image):
                                image
                                    .resizable()
                                    .aspectRatio(contentMode: .fill)
                                    .frame(width: 180, height: 180)
                                    .clipShape(Circle())
                            case .failure:
                                placeholderContent
                            case .empty:
                                ProgressView()
                                    .tint(.white)
                            @unknown default:
                                placeholderContent
                            }
                        }
                    } else {
                        placeholderContent
                    }
                }
                .clipShape(Circle())
                .offset(y: floatOffset)
        }
        .scaleEffect(isRevealed ? 1.0 : 0.6)
        .opacity(isRevealed ? 1.0 : 0)
        .animation(.spring(response: 0.8, dampingFraction: 0.7), value: isRevealed)
        .onAppear {
            // Start floating animation
            withAnimation(
                .easeInOut(duration: 3)
                .repeatForever(autoreverses: true)
            ) {
                floatOffset = -10
            }
        }
    }

    private var placeholderContent: some View {
        Image(systemName: piece.categoryIcon)
            .font(.system(size: 64))
            .foregroundStyle(.white.opacity(0.9))
    }
}

// MARK: - Preview

#Preview {
    ZStack {
        PatinaColors.charcoal
            .ignoresSafeArea()

        PieceRevealView(
            piece: MockPieces.emergingPieces[0],
            isRevealed: true
        )
    }
}
