//
//  EmergenceActionButtons.swift
//  Patina
//
//  Stay and Drift action buttons for emergence
//

import SwiftUI

/// Action buttons for the emergence experience
struct EmergenceActionButtons: View {

    let onStay: () -> Void
    let onDrift: () -> Void
    let isSaving: Bool
    let hasSaved: Bool
    var stayLabel: String? = nil
    var driftLabel: String? = nil

    var body: some View {
        VStack(spacing: PatinaSpacing.lg) {
            // Action buttons
            HStack(spacing: PatinaSpacing.xl) {
                // Stay (save to table)
                stayButton

                // Drift (dismiss)
                driftButton
            }

            // Hint text
            Text("More will surface with time")
                .font(PatinaTypography.caption)
                .foregroundStyle(PatinaColors.clayBeige.opacity(0.7))
        }
    }

    // MARK: - Stay Button

    private var stayButton: some View {
        Button(action: onStay) {
            VStack(spacing: PatinaSpacing.xs) {
                ZStack {
                    Circle()
                        .fill(hasSaved ? PatinaColors.mochaBrown : PatinaColors.clayBeige)
                        .frame(width: 56, height: 56)

                    if isSaving {
                        ProgressView()
                            .tint(.white)
                    } else {
                        Image(systemName: hasSaved ? "checkmark" : "plus")
                            .font(.system(size: 22, weight: .medium))
                            .foregroundStyle(.white)
                    }
                }
                .shadow(color: PatinaColors.clayBeige.opacity(0.4), radius: 10, y: 4)

                Text(hasSaved ? "Saved" : (stayLabel ?? "Stay"))
                    .font(PatinaTypography.bodySmallMedium)
                    .foregroundStyle(PatinaColors.offWhite.opacity(0.9))
            }
        }
        .accessibilityIdentifier("emergence.stayButton")
        .disabled(isSaving || hasSaved)
        .opacity(hasSaved ? 0.7 : 1)
    }

    // MARK: - Drift Button

    private var driftButton: some View {
        Button(action: onDrift) {
            VStack(spacing: PatinaSpacing.xs) {
                ZStack {
                    Circle()
                        .stroke(PatinaColors.offWhite.opacity(0.3), lineWidth: 1.5)
                        .frame(width: 56, height: 56)

                    Image(systemName: "arrow.down")
                        .font(.system(size: 22, weight: .medium))
                        .foregroundStyle(PatinaColors.offWhite.opacity(0.7))
                }

                Text(driftLabel ?? "Drift")
                    .font(PatinaTypography.bodySmallMedium)
                    .foregroundStyle(PatinaColors.offWhite.opacity(0.7))
            }
        }
        .accessibilityIdentifier("emergence.driftButton")
        .disabled(hasSaved)
        .opacity(hasSaved ? 0.5 : 1)
    }
}

// MARK: - Compact Variant

/// Horizontal compact action buttons
struct EmergenceActionButtonsCompact: View {

    let onStay: () -> Void
    let onDrift: () -> Void
    let isSaving: Bool
    let hasSaved: Bool

    var body: some View {
        HStack(spacing: PatinaSpacing.md) {
            // Stay button
            Button(action: onStay) {
                HStack(spacing: PatinaSpacing.xs) {
                    if isSaving {
                        ProgressView()
                            .tint(.white)
                            .scaleEffect(0.8)
                    } else {
                        Image(systemName: hasSaved ? "checkmark" : "plus")
                            .font(.system(size: 14, weight: .semibold))
                    }

                    Text(hasSaved ? "Saved" : "Invite to stay")
                        .font(PatinaTypography.bodySmallMedium)
                }
                .foregroundStyle(.white)
                .padding(.horizontal, PatinaSpacing.lg)
                .padding(.vertical, PatinaSpacing.md)
                .background(
                    Capsule()
                        .fill(hasSaved ? PatinaColors.mochaBrown : PatinaColors.clayBeige)
                )
            }
            .disabled(isSaving || hasSaved)

            // Drift button
            Button(action: onDrift) {
                HStack(spacing: PatinaSpacing.xs) {
                    Image(systemName: "arrow.down")
                        .font(.system(size: 14, weight: .medium))

                    Text("Let it drift")
                        .font(PatinaTypography.bodySmallMedium)
                }
                .foregroundStyle(PatinaColors.offWhite.opacity(0.7))
                .padding(.horizontal, PatinaSpacing.lg)
                .padding(.vertical, PatinaSpacing.md)
                .background(
                    Capsule()
                        .stroke(PatinaColors.offWhite.opacity(0.3), lineWidth: 1)
                )
            }
            .disabled(hasSaved)
            .opacity(hasSaved ? 0.5 : 1)
        }
    }
}

// MARK: - Preview

#Preview("Action Buttons") {
    ZStack {
        PatinaColors.charcoal
            .ignoresSafeArea()

        VStack(spacing: 60) {
            EmergenceActionButtons(
                onStay: {},
                onDrift: {},
                isSaving: false,
                hasSaved: false
            )

            EmergenceActionButtons(
                onStay: {},
                onDrift: {},
                isSaving: false,
                hasSaved: true
            )

            EmergenceActionButtonsCompact(
                onStay: {},
                onDrift: {},
                isSaving: false,
                hasSaved: false
            )
        }
    }
}
