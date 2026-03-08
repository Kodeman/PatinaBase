//
//  HeroEmptyStateView.swift
//  Patina
//
//  Engaging empty state for Hero Page when user has no rooms
//  Encourages starting a walk, signing up, and learning about Patina
//

import SwiftUI
import Auth

/// Engaging empty state for the Hero Page
public struct HeroEmptyStateView: View {

    // MARK: - Environment

    @Environment(\.colorScheme) private var colorScheme

    // MARK: - Auth State

    private var authService = AuthService.shared

    // MARK: - State

    @State private var timeOfDay: TimeOfDay = .current
    @State private var showingLearnMore = false
    @State private var showSignedInIndicator = true

    // MARK: - Computed Properties

    /// Display name for authenticated user
    private var userDisplayName: String? {
        guard authService.isAuthenticated,
              let user = authService.currentUser else { return nil }

        // Try display_name from user metadata first
        if let displayName = user.userMetadata["display_name"]?.stringValue,
           !displayName.isEmpty {
            return displayName
        }

        // Fallback to email prefix
        if let email = user.email {
            return email.components(separatedBy: "@").first
        }

        return nil
    }

    // MARK: - Callbacks

    /// Called when user wants to start a walk
    public var onStartWalk: () -> Void

    /// Called when user wants to sign in
    public var onSignIn: () -> Void

    /// Called when user wants to learn more
    public var onLearnMore: (() -> Void)?

    // MARK: - Initialization

    public init(
        onStartWalk: @escaping () -> Void,
        onSignIn: @escaping () -> Void,
        onLearnMore: (() -> Void)? = nil
    ) {
        self.onStartWalk = onStartWalk
        self.onSignIn = onSignIn
        self.onLearnMore = onLearnMore
    }

    public var body: some View {
        GeometryReader { geometry in
            ZStack {
                // Time-based gradient background
                backgroundGradient
                    .ignoresSafeArea()

                // Overlay gradient for depth
                timeOfDay.overlayGradient
                    .ignoresSafeArea()

                // Content
                VStack(spacing: 0) {
                    // Account indicator for authenticated users (fades after 5 seconds)
                    if authService.isAuthenticated && showSignedInIndicator {
                        HStack {
                            Spacer()
                            accountIndicator
                        }
                        .padding(.top, geometry.safeAreaInsets.top + PatinaSpacing.md)
                        .padding(.horizontal, PatinaSpacing.lg)
                        .transition(.opacity)
                    } else if authService.isAuthenticated {
                        Spacer()
                            .frame(height: geometry.safeAreaInsets.top + PatinaSpacing.md + 28)
                    } else {
                        Spacer()
                            .frame(height: geometry.safeAreaInsets.top + 60)
                    }

                    // Strata Mark
                    strataMark
                        .padding(.top, authService.isAuthenticated ? PatinaSpacing.xl : 0)
                        .padding(.bottom, PatinaSpacing.xxxl)

                    // Welcome message
                    welcomeContent
                        .padding(.horizontal, PatinaSpacing.xl)

                    Spacer()

                    // Call to action buttons
                    actionButtons
                        .padding(.horizontal, PatinaSpacing.xl)
                        .padding(.bottom, geometry.safeAreaInsets.bottom + 40)
                }
            }
        }
        .onAppear {
            updateTimeOfDay()

            // Fade out signed-in indicator after 5 seconds
            if authService.isAuthenticated {
                DispatchQueue.main.asyncAfter(deadline: .now() + 5) {
                    withAnimation(.easeOut(duration: 0.5)) {
                        showSignedInIndicator = false
                    }
                }
            }
        }
    }

    // MARK: - Background

    private var backgroundGradient: some View {
        LinearGradient(
            colors: timeOfDay.gradientColors,
            startPoint: .top,
            endPoint: .bottom
        )
    }

    // MARK: - Strata Mark

    private var strataMark: some View {
        ZStack {
            // Subtle glow circle
            Circle()
                .fill(
                    RadialGradient(
                        colors: [
                            timeOfDay.textColor.opacity(0.1),
                            Color.clear
                        ],
                        center: .center,
                        startRadius: 20,
                        endRadius: 80
                    )
                )
                .frame(width: 160, height: 160)

            // Outer ring
            Circle()
                .stroke(
                    timeOfDay.textColor.opacity(0.15),
                    lineWidth: 1.5
                )
                .frame(width: 100, height: 100)

            // Strata mark
            StrataMarkView(
                color: timeOfDay.textColor,
                scale: 2.0,
                breathing: false,
                useSpecColors: false
            )
        }
    }

    // MARK: - Welcome Content

    private var welcomeContent: some View {
        VStack(spacing: PatinaSpacing.lg) {
            if let name = userDisplayName {
                // Authenticated user greeting
                Text("Welcome back,")
                    .font(PatinaTypography.h2)
                    .foregroundColor(timeOfDay.textColor.opacity(0.9))
                    .multilineTextAlignment(.center)

                Text(name)
                    .font(PatinaTypography.h1)
                    .foregroundColor(timeOfDay.textColor)
                    .multilineTextAlignment(.center)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)

                // Subheadline
                Text("Ready to explore your space?")
                    .font(PatinaTypography.patinaVoice)
                    .foregroundColor(timeOfDay.textColor.opacity(0.8))
                    .multilineTextAlignment(.center)
            } else {
                // Default anonymous greeting
                Text("Your space\ntells a story.")
                    .font(PatinaTypography.h1)
                    .foregroundColor(timeOfDay.textColor)
                    .multilineTextAlignment(.center)
                    .lineSpacing(4)

                // Subheadline
                Text("Let's discover it together.")
                    .font(PatinaTypography.patinaVoice)
                    .foregroundColor(timeOfDay.textColor.opacity(0.8))
                    .multilineTextAlignment(.center)
            }
        }
    }

    // MARK: - Account Indicator

    private var accountIndicator: some View {
        HStack(spacing: PatinaSpacing.xs) {
            Image(systemName: "checkmark.circle.fill")
                .foregroundColor(.green.opacity(0.9))
            Text("Signed in")
                .font(PatinaTypography.caption)
                .foregroundColor(timeOfDay.textColor.opacity(0.7))
        }
        .padding(.horizontal, PatinaSpacing.sm)
        .padding(.vertical, PatinaSpacing.xs)
        .background(
            Capsule()
                .fill(timeOfDay.textColor.opacity(0.1))
        )
    }

    // MARK: - Action Buttons

    private var actionButtons: some View {
        VStack(spacing: PatinaSpacing.md) {
            // Primary CTA - Start Walk
            Button(action: {
                HapticManager.shared.impact(.medium)
                onStartWalk()
            }) {
                HStack(spacing: PatinaSpacing.sm) {
                    Image(systemName: "camera.viewfinder")
                        .font(.system(size: 18, weight: .medium))

                    Text("Start Your First Walk")
                        .font(PatinaTypography.bodyMedium)
                }
                .foregroundColor(primaryButtonTextColor)
                .frame(maxWidth: .infinity)
                .padding(.vertical, PatinaSpacing.md + 2)
                .background(primaryButtonBackground)
                .cornerRadius(PatinaRadius.lg)
            }
            .buttonStyle(PressableButtonStyle())
            .accessibilityIdentifier("heroEmpty.startWalkButton")

            // Secondary CTA - Learn More
            if onLearnMore != nil {
                Button(action: {
                    HapticManager.shared.impact(.light)
                    onLearnMore?()
                }) {
                    Text("Learn About Patina")
                        .font(PatinaTypography.bodyMedium)
                        .foregroundColor(timeOfDay.textColor.opacity(0.9))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, PatinaSpacing.md)
                        .background(
                            RoundedRectangle(cornerRadius: PatinaRadius.lg)
                                .stroke(timeOfDay.textColor.opacity(0.3), lineWidth: 1.5)
                        )
                }
                .buttonStyle(PressableButtonStyle())
                .accessibilityIdentifier("heroEmpty.learnMoreButton")
            }

            // Tertiary - Sign In (only show if NOT authenticated)
            if !authService.isAuthenticated {
                Button(action: {
                    HapticManager.shared.impact(.light)
                    onSignIn()
                }) {
                    Text("Already have an account? ")
                        .font(PatinaTypography.bodySmall)
                        .foregroundColor(timeOfDay.textColor.opacity(0.6))
                    +
                    Text("Sign In")
                        .font(PatinaTypography.bodySmallMedium)
                        .foregroundColor(timeOfDay.textColor.opacity(0.9))
                }
                .padding(.top, PatinaSpacing.sm)
                .accessibilityIdentifier("heroEmpty.signInButton")
            }
        }
    }

    // MARK: - Button Styling

    private var primaryButtonTextColor: Color {
        switch timeOfDay {
        case .dawn, .morning, .day, .afternoon:
            return PatinaColors.Text.inverse
        case .evening, .night:
            return PatinaColors.Text.primary
        }
    }

    private var primaryButtonBackground: some View {
        Group {
            switch timeOfDay {
            case .dawn, .morning, .day, .afternoon:
                RoundedRectangle(cornerRadius: PatinaRadius.lg)
                    .fill(Color.black.opacity(0.85))
            case .evening, .night:
                RoundedRectangle(cornerRadius: PatinaRadius.lg)
                    .fill(Color.white.opacity(0.95))
            }
        }
    }

    // MARK: - Helpers

    private func updateTimeOfDay() {
        timeOfDay = .current
    }
}

// MARK: - Preview

#Preview("Morning") {
    HeroEmptyStateView(
        onStartWalk: { print("Start walk") },
        onSignIn: { print("Sign in") },
        onLearnMore: { print("Learn more") }
    )
}

#Preview("Evening") {
    HeroEmptyStateView(
        onStartWalk: { print("Start walk") },
        onSignIn: { print("Sign in") },
        onLearnMore: { print("Learn more") }
    )
    .onAppear {
        // Would need to mock time for preview
    }
}
