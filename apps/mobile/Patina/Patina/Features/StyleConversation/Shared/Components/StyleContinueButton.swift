//
//  StyleContinueButton.swift
//  Patina
//
//  Reusable full-width "Continue" CTA for the Quiet Conversation flow.
//  52pt tall, 26pt radius, Charcoal bg / Off-White text.
//

import SwiftUI

struct StyleContinueButton: View {

    /// The ground this CTA is drawn on.
    ///
    /// GAP4-16: `Interactive.active` is `patinaDynamic(light: charcoal, …)`,
    /// and `RevealView` paints its ground with the RAW `PatinaColors.charcoal`
    /// constant — so in light appearance the app's only way off the Reveal was
    /// a charcoal capsule on a charcoal field (`shots/GAP4/26-reveal-light.png`).
    /// The screen knows which ground it painted; the button does not.
    enum Ground {
        /// The app's own surfaces — the CTA fills with the interactive token.
        case app
        /// A fixed charcoal field, whatever the system appearance says.
        case charcoal
    }

    let title: String
    let isEnabled: Bool
    let ground: Ground
    let action: () -> Void

    init(
        title: String = "Continue",
        isEnabled: Bool,
        ground: Ground = .app,
        action: @escaping () -> Void
    ) {
        self.title = title
        self.isEnabled = isEnabled
        self.ground = ground
        self.action = action
    }

    var body: some View {
        Button(action: {
            if isEnabled { action() }
        }) {
            Text(title)
                .font(PatinaTypography.uiAction)
                .tracking(0.3)
                .foregroundStyle(labelColor)
                .frame(maxWidth: .infinity)
                .frame(height: 52)
                .background(
                    RoundedRectangle(cornerRadius: 26)
                        .fill(isEnabled ? fillColor : fillColor.opacity(0.3))
                )
        }
        .buttonStyle(.plain)
        .disabled(!isEnabled)
        .accessibilityLabel(Text(title))
        .accessibilityAddTraits(isEnabled ? [.isButton] : [.isButton])
    }

    private var fillColor: Color {
        switch ground {
        case .app:      return PatinaColors.Interactive.active
        case .charcoal: return PatinaColors.offWhite
        }
    }

    private var labelColor: Color {
        switch ground {
        case .app:      return PatinaColors.Text.inverse
        case .charcoal: return PatinaColors.charcoal
        }
    }
}

#Preview {
    VStack(spacing: 16) {
        StyleContinueButton(isEnabled: true, action: {})
        StyleContinueButton(isEnabled: false, action: {})
        StyleContinueButton(title: "See What Fits Your Space", isEnabled: true, action: {})
    }
    .padding()
}
