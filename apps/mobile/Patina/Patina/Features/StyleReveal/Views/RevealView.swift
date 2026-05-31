//
//  RevealView.swift
//  Patina
//
//  Screen 16: The Reveal. Presents the Aesthete Engine's style profile.
//  Per PRD §4.8.
//

import SwiftUI

struct RevealView: View {

    let profile: StyleProfileResponse
    let onPrimaryAction: () -> Void
    let onExploreAction: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @State private var revealedLetters: Int = 0
    @State private var spectrumScale: CGFloat = 0
    @State private var tagsVisible: Int = 0

    private let spectrumColors: [Color] = [
        PatinaColors.clay,
        PatinaColors.sage,
        PatinaColors.dustyBlue,
        PatinaColors.terracotta,
        PatinaColors.goldenHour
    ]

    var body: some View {
        ZStack {
            PatinaColors.charcoal.ignoresSafeArea()

            VStack(spacing: 32) {
                Spacer()

                Text("THE AESTHETE ENGINE")
                    .font(PatinaTypography.mono)
                    .tracking(1.0)
                    .foregroundStyle(PatinaColors.clay)

                aestheticName
                    .padding(.horizontal, 24)

                spectrumBar

                tagsRow
                    .padding(.horizontal, 24)

                Spacer()

                VStack(spacing: 14) {
                    StyleContinueButton(
                        title: profile.aestheticName.isEmpty ? "See What Fits Your Space" : primaryTitle,
                        isEnabled: true,
                        action: onPrimaryAction
                    )
                    .padding(.horizontal, 24)

                    Button(action: onExploreAction) {
                        HStack(spacing: 6) {
                            Text("or explore your style profile")
                            Image(systemName: "arrow.right")
                        }
                        .font(.custom("Inter-Regular", size: 12))
                        .foregroundStyle(PatinaColors.agedOak)
                    }
                    .buttonStyle(.plain)
                }
                .padding(.bottom, 42)
            }
        }
        .onAppear {
            startReveal()
            ScanAnalytics.shared.track(.revealDisplayed(aestheticName: profile.aestheticName))
        }
    }

    private var primaryTitle: String {
        // We don't have direct access to flagForDesignerLead here — that's
        // stored on StyleResponseModel, not on the response. The container
        // that owns both can swap the title if needed; we show the default
        // CTA and let callers override via `primaryCtaOverride`.
        "See What Fits Your Space"
    }

    // MARK: - Aesthetic name (letter-by-letter)

    private var aestheticName: some View {
        let chars = Array(profile.aestheticName)
        return HStack(spacing: 0) {
            ForEach(chars.indices, id: \.self) { i in
                Text(String(chars[i]))
                    .font(.custom("PlayfairDisplay-Light", size: 42))
                    .foregroundStyle(PatinaColors.offWhite)
                    .opacity(reduceMotion ? 1 : (i < revealedLetters ? 1 : 0))
            }
        }
        .multilineTextAlignment(.center)
        .fixedSize(horizontal: false, vertical: true)
        .accessibilityLabel(Text(profile.aestheticName))
    }

    // MARK: - Spectrum bar

    private var spectrumBar: some View {
        let total = max(profile.spectrumValues.reduce(0, +), 0.01)
        let normalized = profile.spectrumValues.map { Float($0 / total) }
        let barWidth: CGFloat = 200

        return HStack(spacing: 4) {
            ForEach(Array(spectrumColors.enumerated()), id: \.offset) { index, color in
                Rectangle()
                    .fill(color)
                    .frame(
                        width: CGFloat(normalized[safe: index] ?? 0.2) * barWidth * spectrumScale,
                        height: 6
                    )
                    .animation(
                        reduceMotion
                            ? nil
                            : .spring(response: 0.5).delay(Double(index) * 0.1),
                        value: spectrumScale
                    )
            }
        }
        .frame(width: barWidth, height: 6, alignment: .leading)
    }

    // MARK: - Tag pills

    private var tagsRow: some View {
        StylePillFlow(spacing: 8) {
            ForEach(Array(profile.tags.enumerated()), id: \.offset) { index, tag in
                Text(tag)
                    .font(.custom("Inter-Regular", size: 12))
                    .foregroundStyle(PatinaColors.pearl)
                    .padding(.vertical, 7)
                    .padding(.horizontal, 16)
                    .overlay(
                        RoundedRectangle(cornerRadius: 20)
                            .stroke(PatinaColors.clay.opacity(0.35), lineWidth: 1)
                    )
                    .opacity(reduceMotion ? 1 : (index < tagsVisible ? 1 : 0))
                    .animation(
                        reduceMotion ? nil : .easeOut(duration: 0.3).delay(Double(index) * 0.1),
                        value: tagsVisible
                    )
            }
        }
    }

    // MARK: - Animation sequence

    private func startReveal() {
        guard !reduceMotion else {
            revealedLetters = profile.aestheticName.count
            spectrumScale = 1
            tagsVisible = profile.tags.count
            return
        }

        let total = profile.aestheticName.count
        for i in 0..<total {
            DispatchQueue.main.asyncAfter(deadline: .now() + Double(i) * 0.05) {
                revealedLetters = i + 1
            }
        }

        // Spectrum after the name finishes
        DispatchQueue.main.asyncAfter(deadline: .now() + Double(total) * 0.05 + 0.1) {
            withAnimation(.spring(response: 0.5)) {
                spectrumScale = 1
            }
        }

        // Tags after the spectrum
        DispatchQueue.main.asyncAfter(deadline: .now() + Double(total) * 0.05 + 0.7) {
            for i in 0..<profile.tags.count {
                DispatchQueue.main.asyncAfter(deadline: .now() + Double(i) * 0.1) {
                    tagsVisible = i + 1
                }
            }
        }
    }
}

// MARK: - Safe array subscript

private extension Array {
    subscript(safe index: Int) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}
