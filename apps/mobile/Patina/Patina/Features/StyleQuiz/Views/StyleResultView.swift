//
//  StyleResultView.swift
//  Patina
//
//  Style profile result screen shown after completing the quiz
//  Matches v4 design spec: badge ring, style name, attributes, confidence bar
//

import SwiftUI

struct StyleResultView: View {
    let result: StyleProfileResult
    /// Optional callback for onboarding flow; if nil, uses coordinator navigation
    var onViewRecommendations: (() -> Void)? = nil
    @Environment(\.appCoordinator) private var coordinator

    var body: some View {
        VStack(spacing: 0) {
            Spacer()

            // Badge ring
            ZStack {
                Circle()
                    .stroke(PatinaColors.clay, lineWidth: 2.5)
                    .frame(width: 96, height: 96)

                Circle()
                    .fill(PatinaColors.softCream)
                    .frame(width: 76, height: 76)

                Text("✦")
                    .font(.system(size: 32))
            }
            .padding(.bottom, 24)

            // Style name
            Text(result.displayName)
                .font(PatinaTypography.h1)
                .foregroundColor(PatinaColors.charcoal)
                .padding(.bottom, 4)

            // Subtitle
            MonoLabel(text: "Your Primary Style")
                .padding(.bottom, 24)

            // Attributes row
            HStack(spacing: 16) {
                attributeColumn(value: result.primaryMaterial, label: "Material")
                attributeColumn(value: result.paletteWarmth, label: "Palette")
                attributeColumn(value: result.budgetLabel, label: "Budget")
            }
            .padding(.bottom, 32)

            // Confidence bar
            VStack(spacing: 8) {
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        Capsule()
                            .fill(PatinaColors.pearl)
                            .frame(height: 6)

                        Capsule()
                            .fill(PatinaColors.clay)
                            .frame(width: geo.size.width * result.confidence, height: 6)
                    }
                }
                .frame(width: 200, height: 6)

                MonoLabel(text: "\(result.confidencePercent)% Style Confidence")
            }
            .padding(.bottom, 32)

            // Primary CTA
            Button {
                if let onViewRecommendations {
                    onViewRecommendations()
                } else {
                    coordinator.navigate(to: .heroFrame)
                }
            } label: {
                Text("View Recommendations")
                    .font(PatinaTypography.uiAction)
                    .foregroundColor(PatinaColors.offWhite)
                    .frame(maxWidth: .infinity)
                    .frame(height: 50)
                    .background(PatinaColors.charcoal)
                    .clipShape(Capsule())
            }
            .padding(.horizontal, 28)

            // Secondary CTA
            Button {
                // Future: navigate to refine style flow
            } label: {
                Text("Refine your style →")
                    .font(PatinaTypography.bodySmall)
                    .foregroundColor(PatinaColors.clay)
            }
            .padding(.top, 12)

            Spacer()
        }
        .padding(.horizontal, 28)
        .background(PatinaColors.offWhite)
        .navigationBarHidden(true)
    }

    // MARK: - Attribute Column

    private func attributeColumn(value: String, label: String) -> some View {
        VStack(spacing: 2) {
            Text(value)
                .font(PatinaTypography.h3)
                .foregroundColor(PatinaColors.charcoal)

            Text(label.uppercased())
                .font(PatinaTypography.monoTiny)
                .foregroundColor(PatinaColors.agedOak)
        }
    }
}

#Preview {
    StyleResultView(result: StyleProfileResult(
        primaryStyle: "warm_minimalist",
        secondaryStyle: "scandinavian",
        primaryMaterial: "Linen",
        paletteWarmth: "Warm",
        budgetLabel: "$2–5K",
        budgetMin: 2000,
        budgetMax: 5000,
        confidence: 0.87
    ))
    .environment(\.appCoordinator, AppCoordinator())
}
