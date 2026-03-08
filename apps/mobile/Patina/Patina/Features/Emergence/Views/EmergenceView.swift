//
//  EmergenceView.swift
//  Patina
//
//  Single piece emergence/recommendation reveal
//  "One at a time. Let each piece speak."
//

import SwiftUI
import SwiftData

/// The Emergence - Where pieces surface for you
struct EmergenceView: View {

    // MARK: - Properties

    let pieceId: String?

    /// Whether this is the first emergence (part of first-launch flow)
    var isFirstEmergence: Bool = false

    /// Room context for first emergence
    var roomContext: FirstWalkRoomData? = nil

    /// Callback for first emergence actions
    var onAction: ((EmergenceAction) -> Void)? = nil

    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var modelContext
    @State private var viewModel = EmergenceViewModel()

    // MARK: - Body

    var body: some View {
        ZStack {
            // Background
            backgroundGradient

            VStack(spacing: 0) {
                // Header
                header

                Spacer()

                // Main content
                if let piece = viewModel.piece {
                    VStack(spacing: PatinaSpacing.xl) {
                        // Piece image with floating animation
                        PieceRevealView(
                            piece: piece,
                            isRevealed: viewModel.isRevealed
                        )

                        // Story card
                        PieceStoryCard(
                            piece: piece,
                            isVisible: viewModel.showStory
                        )
                    }
                }

                Spacer()

                // Action buttons
                if viewModel.showStory && !viewModel.hasDrifted {
                    EmergenceActionButtons(
                        onStay: { handleStay() },
                        onDrift: { handleDrift() },
                        isSaving: viewModel.isSaving,
                        hasSaved: viewModel.hasSaved,
                        stayLabel: isFirstEmergence ? "Invite to stay" : nil,
                        driftLabel: isFirstEmergence ? "Let it drift" : nil
                    )
                    .padding(.bottom, PatinaSpacing.xxxl)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                }

                // Success message after save
                if viewModel.hasSaved {
                    savedConfirmation
                        .padding(.bottom, PatinaSpacing.xl)
                        .transition(.opacity)
                }
            }

            // Drift animation overlay
            if viewModel.hasDrifted {
                driftOverlay
            }
        }
        .onAppear {
            viewModel.configure(pieceId: pieceId, modelContext: modelContext)
            viewModel.beginReveal()
        }
        .animation(.easeInOut(duration: 0.4), value: viewModel.hasSaved)
        .animation(.easeOut(duration: 0.5), value: viewModel.hasDrifted)
    }

    // MARK: - Background

    private var backgroundGradient: some View {
        LinearGradient(
            colors: [
                PatinaColors.charcoal,
                Color(hex: "2a2520"),
                PatinaColors.mochaBrown.opacity(0.6)
            ],
            startPoint: .top,
            endPoint: .bottom
        )
        .ignoresSafeArea()
        .overlay {
            // Subtle noise texture
            Rectangle()
                .fill(
                    ImagePaint(image: Image(systemName: "circle.fill"), scale: 0.01)
                )
                .opacity(0.02)
                .ignoresSafeArea()
        }
    }

    // MARK: - Header

    private var header: some View {
        ZStack {
            // Room name and title
            VStack(spacing: PatinaSpacing.xxs) {
                if isFirstEmergence, let roomName = roomContext?.roomName {
                    Text("For your \(roomName)")
                        .font(PatinaTypography.caption)
                        .foregroundStyle(PatinaColors.clayBeige)
                } else {
                    Text(viewModel.roomName)
                        .font(PatinaTypography.caption)
                        .foregroundStyle(PatinaColors.clayBeige)
                }

                Text("Something emerged...")
                    .font(PatinaTypography.h3)
                    .foregroundStyle(PatinaColors.offWhite)
            }
            .opacity(viewModel.isRevealed ? 1 : 0)
            .animation(.easeOut(duration: 0.5).delay(0.3), value: viewModel.isRevealed)

            // Close button (hidden in first emergence mode)
            if !isFirstEmergence {
                HStack {
                    Spacer()
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 14, weight: .medium))
                            .foregroundStyle(PatinaColors.offWhite.opacity(0.6))
                            .padding(PatinaSpacing.sm)
                            .background(
                                Circle()
                                    .fill(Color.white.opacity(0.1))
                            )
                    }
                }
            }
        }
        .padding(.horizontal, PatinaSpacing.lg)
        .padding(.top, PatinaSpacing.lg)
    }

    // MARK: - Saved Confirmation

    private var savedConfirmation: some View {
        HStack(spacing: PatinaSpacing.sm) {
            Image(systemName: "checkmark.circle.fill")
                .foregroundStyle(PatinaColors.clayBeige)

            Text("Added to your table")
                .font(PatinaTypography.bodySmall)
                .foregroundStyle(PatinaColors.offWhite.opacity(0.8))

            Button("View") {
                // Navigate to table
                dismiss()
            }
            .font(PatinaTypography.bodySmallMedium)
            .foregroundStyle(PatinaColors.clayBeige)
        }
        .padding(.horizontal, PatinaSpacing.lg)
        .padding(.vertical, PatinaSpacing.sm)
        .background(
            Capsule()
                .fill(PatinaColors.mochaBrown.opacity(0.5))
        )
    }

    // MARK: - Drift Overlay

    private var driftOverlay: some View {
        VStack {
            Spacer()

            VStack(spacing: PatinaSpacing.lg) {
                Image(systemName: "leaf")
                    .font(.system(size: 32))
                    .foregroundStyle(PatinaColors.clayBeige.opacity(0.5))

                Text("It drifted away...")
                    .font(PatinaTypography.patinaVoice)
                    .foregroundStyle(PatinaColors.offWhite.opacity(0.7))

                Text("More will surface when the time is right")
                    .font(PatinaTypography.caption)
                    .foregroundStyle(PatinaColors.offWhite.opacity(0.5))

                Button {
                    dismiss()
                } label: {
                    Text("Continue")
                        .font(PatinaTypography.bodySmallMedium)
                        .foregroundStyle(PatinaColors.offWhite)
                        .padding(.horizontal, PatinaSpacing.xl)
                        .padding(.vertical, PatinaSpacing.sm)
                        .background(
                            Capsule()
                                .stroke(PatinaColors.offWhite.opacity(0.3), lineWidth: 1)
                        )
                }
                .padding(.top, PatinaSpacing.md)
            }

            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(PatinaColors.charcoal.opacity(0.9))
    }

    // MARK: - Actions

    private func handleStay() {
        viewModel.stay()

        // First emergence callback
        if isFirstEmergence {
            // Brief delay for success feedback
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
                onAction?(.stay)
            }
        }
    }

    private func handleDrift() {
        viewModel.drift()

        // Auto-dismiss after drift animation
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
            if isFirstEmergence {
                onAction?(.drift)
            } else {
                dismiss()
            }
        }
    }
}

// MARK: - Preview

#Preview("Emergence") {
    EmergenceView(pieceId: nil)
}

#Preview("Emergence - Specific Piece") {
    EmergenceView(pieceId: "edo-lounge")
}
