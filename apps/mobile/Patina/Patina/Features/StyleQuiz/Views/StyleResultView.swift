//
//  StyleResultView.swift
//  Patina
//
//  Human-readable taste portrait shown after the real style quiz result.
//

import SwiftUI
import SwiftData

struct StyleResultView: View {
    let result: StyleProfileResult
    /// Optional callback for onboarding flow; if nil, uses coordinator navigation.
    var onViewRecommendations: (() -> Void)? = nil
    /// True only for the pushed-nav mount. Onboarding remains chromeless.
    var showsChrome: Bool = false

    @Environment(\.appCoordinator) private var coordinator
    @Environment(\.modelContext) private var modelContext
    @State private var storedPortrait: TastePortrait?
    @State private var tuningConfirmation: String?

    var body: some View {
        if showsChrome {
            content.patinaScreen(title: nil)
        } else {
            content
        }
    }

    private var portrait: TastePortrait {
        storedPortrait ?? TastePortrait(result: result)
    }

    private var content: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 0) {
                portraitHeader
                    .padding(.top, showsChrome ? 24 : 48)

                tastePortraitCard
                    .padding(.top, 24)

                tuningControls
                    .padding(.top, 16)

                Button {
                    if let onViewRecommendations {
                        onViewRecommendations()
                    } else {
                        coordinator.navigate(to: .emergence(pieceId: nil))
                    }
                } label: {
                    Text("View Recommendations")
                        .font(PatinaTypography.uiAction)
                        .foregroundStyle(PatinaColors.Text.inverse)
                        .frame(maxWidth: .infinity)
                        .frame(height: 50)
                        .background(PatinaColors.Interactive.active)
                        .clipShape(Capsule())
                }
                .padding(.top, 24)
                .accessibilityIdentifier("StyleResultView.ViewRecommendations")

                Text("Your portrait stays on this device and can be reset in Settings.")
                    .font(PatinaTypography.caption)
                    .foregroundStyle(PatinaColors.Text.muted)
                    .multilineTextAlignment(.center)
                    .padding(.top, 12)
                    .padding(.bottom, 40)
            }
            .padding(.horizontal, 24)
        }
        .background(PatinaColors.Background.primary)
        .task {
            loadPortrait()
            ContextMemoryStore.shared.rememberStyleUse()
        }
    }

    private var portraitHeader: some View {
        VStack(spacing: 12) {
            ZStack {
                Circle()
                    .stroke(PatinaColors.clay, lineWidth: 2)
                    .frame(width: 76, height: 76)
                Circle()
                    .fill(materialGradient(for: portrait.materials.first))
                    .frame(width: 62, height: 62)
                Text("✦")
                    .font(.system(size: 25))
                    .foregroundStyle(PatinaColors.Text.primary)
            }

            Text(portrait.title)
                .font(PatinaTypography.h1)
                .foregroundStyle(PatinaColors.Text.primary)
                .multilineTextAlignment(.center)

            MonoLabel(text: "Your Taste Portrait")
        }
    }

    private var tastePortraitCard: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(portrait.summary)
                .font(PatinaTypography.h4)
                .foregroundStyle(PatinaColors.Text.primary)
                .fixedSize(horizontal: false, vertical: true)

            if !portrait.materials.isEmpty {
                HStack(spacing: 8) {
                    ForEach(portrait.materials.prefix(3), id: \.self) { material in
                        HStack(spacing: 6) {
                            Circle()
                                .fill(materialGradient(for: material))
                                .frame(width: 18, height: 18)
                            Text(material)
                                .font(PatinaTypography.caption)
                                .foregroundStyle(PatinaColors.Text.secondary)
                        }
                        .padding(.horizontal, 9)
                        .padding(.vertical, 6)
                        .background(PatinaColors.Background.primary)
                        .clipShape(Capsule())
                    }
                }
                .accessibilityElement(children: .combine)
                .accessibilityLabel("Preferred materials: \(portrait.materials.joined(separator: ", "))")
            }

            VStack(alignment: .leading, spacing: 10) {
                MonoLabel(text: "Why Patina sees this", size: PatinaTypography.monoSmall)
                ForEach(Array(portrait.evidence.prefix(3).enumerated()), id: \.offset) { _, rationale in
                    HStack(alignment: .top, spacing: 9) {
                        Circle()
                            .fill(PatinaColors.clay)
                            .frame(width: 5, height: 5)
                            .padding(.top, 7)
                            .accessibilityHidden(true)
                        Text(rationale)
                            .font(PatinaTypography.bodySmall)
                            .foregroundStyle(PatinaColors.Text.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }

            VStack(spacing: 8) {
                GeometryReader { geometry in
                    ZStack(alignment: .leading) {
                        Capsule()
                            .fill(PatinaColors.pearl)
                            .frame(height: 5)
                        Capsule()
                            .fill(PatinaColors.clay)
                            .frame(
                                width: geometry.size.width * min(max(portrait.confidence, 0), 1),
                                height: 5
                            )
                    }
                }
                .frame(height: 5)
                MonoLabel(text: "A starting point — refine it any time.")
            }
        }
        .padding(18)
        .background(PatinaColors.Background.secondary)
        .clipShape(RoundedRectangle(cornerRadius: PatinaRadius.xl, style: .continuous))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("StyleResultView.TastePortrait")
    }

    private var tuningControls: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text("Tune the portrait")
                    .font(PatinaTypography.uiAction)
                    .foregroundStyle(PatinaColors.Text.primary)
                Text(tuningConfirmation ?? "Tell Patina which direction feels closer.")
                    .font(PatinaTypography.caption)
                    .foregroundStyle(PatinaColors.Text.muted)
            }
            Spacer()
            Menu {
                ForEach(TasteAdjustment.allCases) { adjustment in
                    Button(adjustment.label) {
                        apply(adjustment)
                    }
                }
            } label: {
                Text("Tune this")
                    .font(PatinaTypography.uiSmall)
                    .foregroundStyle(PatinaColors.Text.interactive)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(PatinaColors.clay.opacity(0.12))
                    .clipShape(Capsule())
            }
            .accessibilityLabel("Tune your taste portrait")
            .accessibilityHint("Choose warmer, cooler, more relaxed, or more tailored.")
            .accessibilityIdentifier("StyleResultView.TuneButton")
        }
        .padding(16)
        .background(PatinaColors.Background.secondary)
        .clipShape(RoundedRectangle(cornerRadius: PatinaRadius.lg, style: .continuous))
    }

    private func loadPortrait() {
        let store = StylePreferenceStore(context: modelContext)
        let preference = store.mostRecent() ?? store.upsert(
            StylePreferenceSnapshot(
                keywords: [result.displayName],
                warmth: result.paletteWarmth.lowercased().contains("warm") ? 0.75 : 0.3,
                formality: 0.5,
                materials: [result.primaryMaterial],
                eras: [],
                confidence: result.confidence,
                budgetRange: result.budgetMin > 0 && result.budgetMax > 0
                    ? "\(result.budgetMin)-\(result.budgetMax)"
                    : nil
            )
        )
        storedPortrait = TastePortrait(preference: preference)
    }

    private func apply(_ adjustment: TasteAdjustment) {
        guard let preference = StylePreferenceStore(context: modelContext).tune(adjustment) else {
            return
        }
        storedPortrait = TastePortrait(preference: preference)
        tuningConfirmation = "\(adjustment.label) — noted."
        ContextMemoryStore.shared.rememberStyleUse()
        PostHogService.shared.capture("taste_portrait_tuned", properties: [
            "dimension": adjustment.analyticsDimension,
            "direction": adjustment.analyticsDirection
        ])
        HapticManager.shared.impact(.light)
    }

    private func materialGradient(for material: String?) -> LinearGradient {
        let key = material?
            .lowercased()
            .replacingOccurrences(of: " ", with: "_") ?? ""
        switch key {
        case let value where value.contains("oak") || value.contains("wood"):
            return PatinaGradients.wood
        case let value where value.contains("linen") || value.contains("fabric"):
            return PatinaGradients.linen
        case let value where value.contains("leather"):
            return PatinaGradients.leather
        case let value where value.contains("metal"):
            return PatinaGradients.metal
        case let value where value.contains("rattan"):
            return PatinaGradients.rattan
        case let value where value.contains("marble"):
            return PatinaGradients.dusk
        default:
            return PatinaGradients.earth
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
