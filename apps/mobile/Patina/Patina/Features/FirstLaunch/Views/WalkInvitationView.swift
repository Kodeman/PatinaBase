//
//  WalkInvitationView.swift
//  Patina
//
//  Scene 2 of the first-launch flow: Companion's first appearance.
//  Invites the user to walk their space together.
//

import SwiftUI

/// Walk invitation view - Companion's first appearance
struct WalkInvitationView: View {

    // MARK: - Actions

    let onLetsWalk: () -> Void
    let onNotYet: () -> Void

    // MARK: - Animation State

    @State private var companionVisible = false
    @State private var messageVisible = false
    @State private var buttonsVisible = false
    @State private var backgroundBlurred = false

    // MARK: - Constants

    private enum Layout {
        static let companionAnimationDelay: Double = 0.3
        static let messageAnimationDelay: Double = 0.5
        static let buttonsAnimationDelay: Double = 0.7
        static let springResponse: Double = 0.5
        static let springDamping: Double = 0.8
    }

    var body: some View {
        ZStack {
            // Blurred background (LivingSceneView or solid)
            background

            // Content
            VStack {
                Spacer()

                // Companion message area
                companionArea
            }
        }
        .onAppear {
            animateEntrance()
        }
    }

    // MARK: - Background

    private var background: some View {
        ZStack {
            // Base atmospheric scene
            LivingSceneView(timeOfDay: TimeOfDay.current)
                .blur(radius: backgroundBlurred ? 20 : 0)

            // Overlay for dimming
            Color.black.opacity(backgroundBlurred ? 0.3 : 0)
        }
        .ignoresSafeArea()
        .animation(.easeInOut(duration: 0.5), value: backgroundBlurred)
    }

    // MARK: - Companion Area

    private var companionArea: some View {
        VStack(spacing: 0) {
            // Strata Mark
            strataMarkSection
                .opacity(companionVisible ? 1 : 0)
                .offset(y: companionVisible ? 0 : 50)

            // Message
            messageSection
                .opacity(messageVisible ? 1 : 0)
                .offset(y: messageVisible ? 0 : 20)

            // Buttons
            buttonSection
                .opacity(buttonsVisible ? 1 : 0)
                .offset(y: buttonsVisible ? 0 : 20)
        }
        .padding(.horizontal, PatinaSpacing.xl)
        .padding(.bottom, PatinaSpacing.xxxl)
        .background(
            // Soft gradient background
            LinearGradient(
                colors: [
                    PatinaColors.Background.primary.opacity(0),
                    PatinaColors.Background.primary.opacity(0.9),
                    PatinaColors.Background.primary
                ],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()
            .frame(height: 400)
        )
    }

    // MARK: - Strata Mark Section

    private var strataMarkSection: some View {
        VStack(spacing: PatinaSpacing.md) {
            StrataMarkView(
                color: PatinaColors.clayBeige,
                scale: 1.0,
                breathing: true
            )
            .frame(height: 40)
        }
        .padding(.bottom, PatinaSpacing.lg)
    }

    // MARK: - Message Section

    private var messageSection: some View {
        VStack(spacing: PatinaSpacing.md) {
            Text("Shall we walk your space together?")
                .font(PatinaTypography.patinaVoice)
                .foregroundColor(PatinaColors.Text.primary)
                .multilineTextAlignment(.center)
                .accessibilityIdentifier("walkInvitation.message")

            Text("I'd love to see where you live.")
                .font(PatinaTypography.patinaVoice)
                .foregroundColor(PatinaColors.Text.secondary)
                .multilineTextAlignment(.center)
        }
        .padding(.horizontal, PatinaSpacing.md)
        .padding(.bottom, PatinaSpacing.xl)
    }

    // MARK: - Button Section

    private var buttonSection: some View {
        VStack(spacing: PatinaSpacing.md) {
            // Primary button: Let's walk
            Button(action: {
                HapticManager.shared.impact(.medium)
                onLetsWalk()
            }) {
                Text("Let's walk")
                    .font(PatinaTypography.bodyMedium)
                    .foregroundColor(PatinaColors.offWhite)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, PatinaSpacing.md)
                    .background(PatinaColors.clayBeige)
                    .cornerRadius(PatinaRadius.lg)
            }
            .accessibilityIdentifier("walkInvitation.letsWalkButton")
            .buttonStyle(ScaleButtonStyle())

            // Secondary button: Not yet
            Button(action: {
                HapticManager.shared.impact(.light)
                onNotYet()
            }) {
                Text("Not yet")
                    .font(PatinaTypography.body)
                    .foregroundColor(PatinaColors.Text.secondary)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, PatinaSpacing.md)
                    .background(Color.clear)
                    .overlay(
                        RoundedRectangle(cornerRadius: PatinaRadius.lg)
                            .stroke(PatinaColors.Text.muted, lineWidth: 1)
                    )
            }
            .accessibilityIdentifier("walkInvitation.notYetButton")
            .buttonStyle(ScaleButtonStyle())
        }
    }

    // MARK: - Animation

    private func animateEntrance() {
        withAnimation(.easeOut(duration: 0.4)) {
            backgroundBlurred = true
        }

        withAnimation(.spring(response: Layout.springResponse, dampingFraction: Layout.springDamping).delay(Layout.companionAnimationDelay)) {
            companionVisible = true
        }

        withAnimation(.spring(response: Layout.springResponse, dampingFraction: Layout.springDamping).delay(Layout.messageAnimationDelay)) {
            messageVisible = true
        }

        withAnimation(.spring(response: Layout.springResponse, dampingFraction: Layout.springDamping).delay(Layout.buttonsAnimationDelay)) {
            buttonsVisible = true
        }
    }
}

// MARK: - Scale Button Style

private struct ScaleButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.97 : 1.0)
            .animation(.easeInOut(duration: 0.15), value: configuration.isPressed)
    }
}

// MARK: - Preview

#Preview("Walk Invitation") {
    WalkInvitationView(
        onLetsWalk: { print("Let's walk") },
        onNotYet: { print("Not yet") }
    )
}
