//
//  LearnAboutPatinaView.swift
//  Patina
//
//  Educational view explaining Patina's core features.
//  Presented as a sheet from HeroEmptyStateView.
//

import SwiftUI

/// Feature model for Learn About Patina content
private struct PatinaFeature: Identifiable {
    let id = UUID()
    let icon: String
    let title: String
    let description: String
}

/// Educational view explaining Patina's features
public struct LearnAboutPatinaView: View {

    // MARK: - Environment

    @Environment(\.dismiss) private var dismiss

    // MARK: - Actions

    let onStartWalk: () -> Void
    let onDismiss: () -> Void

    // MARK: - State

    @State private var timeOfDay: TimeOfDay = .current
    @State private var contentVisible = false
    @State private var buttonsVisible = false
    @State private var currentFeatureIndex = 0

    // MARK: - Constants

    private let features: [PatinaFeature] = [
        PatinaFeature(
            icon: "camera.viewfinder",
            title: "Room Scanning",
            description: "Walk through your space while Patina captures and understands your room's dimensions, furniture, and style."
        ),
        PatinaFeature(
            icon: "sparkles.rectangle.stack",
            title: "Furniture Discovery",
            description: "Get personalized furniture recommendations that complement your existing pieces and match your style."
        ),
        PatinaFeature(
            icon: "paintpalette",
            title: "Style Analysis",
            description: "Patina learns your aesthetic preferences to suggest pieces that feel uniquely you."
        ),
        PatinaFeature(
            icon: "person.crop.circle.badge.checkmark",
            title: "Designer Services",
            description: "Connect with professional designers who can help bring your vision to life."
        )
    ]

    private enum Layout {
        static let contentAnimationDelay: Double = 0.2
        static let buttonsAnimationDelay: Double = 0.4
        static let springResponse: Double = 0.5
        static let springDamping: Double = 0.8
    }

    // MARK: - Body

    public var body: some View {
        ZStack {
            // Background
            background

            // Content
            VStack(spacing: 0) {
                // Header with close button
                header

                // Feature content
                featureContent
                    .opacity(contentVisible ? 1 : 0)
                    .offset(y: contentVisible ? 0 : 20)

                Spacer()

                // Action buttons
                actionButtons
                    .opacity(buttonsVisible ? 1 : 0)
                    .offset(y: buttonsVisible ? 0 : 20)
            }
            .padding(.horizontal, PatinaSpacing.xl)
            .padding(.bottom, PatinaSpacing.xxxl)
        }
        .onAppear {
            animateEntrance()
        }
    }

    // MARK: - Background

    private var background: some View {
        LinearGradient(
            colors: timeOfDay.gradientColors,
            startPoint: .top,
            endPoint: .bottom
        )
        .ignoresSafeArea()
    }

    // MARK: - Header

    private var header: some View {
        HStack {
            Spacer()

            Button(action: {
                HapticManager.shared.impact(.light)
                onDismiss()
                dismiss()
            }) {
                Image(systemName: "xmark.circle.fill")
                    .font(.system(size: 28))
                    .foregroundColor(timeOfDay.textColor.opacity(0.5))
            }
        }
        .padding(.top, PatinaSpacing.lg)
        .padding(.bottom, PatinaSpacing.md)
    }

    // MARK: - Feature Content

    private var featureContent: some View {
        VStack(spacing: PatinaSpacing.xl) {
            // Title
            VStack(spacing: PatinaSpacing.sm) {
                StrataMarkView(
                    color: timeOfDay.textColor,
                    scale: 1.2,
                    breathing: false,
                    useSpecColors: false
                )
                .frame(height: 36)
                .padding(.bottom, PatinaSpacing.sm)

                Text("What is Patina?")
                    .font(PatinaTypography.h1)
                    .foregroundColor(timeOfDay.textColor)
                    .multilineTextAlignment(.center)

                Text("Your personal design companion")
                    .font(PatinaTypography.patinaVoice)
                    .foregroundColor(timeOfDay.textColor.opacity(0.8))
                    .multilineTextAlignment(.center)
            }
            .padding(.bottom, PatinaSpacing.lg)

            // Feature cards
            VStack(spacing: PatinaSpacing.md) {
                ForEach(features) { feature in
                    featureCard(feature)
                }
            }
        }
    }

    // MARK: - Feature Card

    private func featureCard(_ feature: PatinaFeature) -> some View {
        HStack(alignment: .top, spacing: PatinaSpacing.md) {
            // Icon
            Image(systemName: feature.icon)
                .font(.system(size: 24, weight: .medium))
                .foregroundColor(timeOfDay.textColor.opacity(0.9))
                .frame(width: 40, height: 40)
                .background(
                    Circle()
                        .fill(timeOfDay.textColor.opacity(0.1))
                )

            // Text content
            VStack(alignment: .leading, spacing: PatinaSpacing.xs) {
                Text(feature.title)
                    .font(PatinaTypography.bodyMedium)
                    .foregroundColor(timeOfDay.textColor)

                Text(feature.description)
                    .font(PatinaTypography.bodySmall)
                    .foregroundColor(timeOfDay.textColor.opacity(0.7))
                    .lineSpacing(2)
            }

            Spacer(minLength: 0)
        }
        .padding(PatinaSpacing.md)
        .background(
            RoundedRectangle(cornerRadius: PatinaRadius.lg)
                .fill(timeOfDay.textColor.opacity(0.08))
        )
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(feature.title): \(feature.description)")
    }

    // MARK: - Action Buttons

    private var actionButtons: some View {
        VStack(spacing: PatinaSpacing.md) {
            // Primary: Start Walk
            Button(action: {
                HapticManager.shared.impact(.medium)
                onStartWalk()
                dismiss()
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
            .buttonStyle(ScaleButtonStyle())
            .accessibilityIdentifier("learnAboutPatina.startWalkButton")

            // Secondary: Maybe Later
            Button(action: {
                HapticManager.shared.impact(.light)
                onDismiss()
                dismiss()
            }) {
                Text("Maybe Later")
                    .font(PatinaTypography.body)
                    .foregroundColor(timeOfDay.textColor.opacity(0.8))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, PatinaSpacing.md)
                    .background(Color.clear)
                    .overlay(
                        RoundedRectangle(cornerRadius: PatinaRadius.lg)
                            .stroke(timeOfDay.textColor.opacity(0.3), lineWidth: 1)
                    )
            }
            .buttonStyle(ScaleButtonStyle())
            .accessibilityIdentifier("learnAboutPatina.maybeLaterButton")
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

    // MARK: - Animation

    private func animateEntrance() {
        withAnimation(.spring(response: Layout.springResponse, dampingFraction: Layout.springDamping).delay(Layout.contentAnimationDelay)) {
            contentVisible = true
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

#Preview("Learn About Patina") {
    LearnAboutPatinaView(
        onStartWalk: { print("Start walk") },
        onDismiss: { print("Dismiss") }
    )
}
