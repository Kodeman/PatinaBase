//
//  StyleContinueButton.swift
//  Patina
//
//  Reusable full-width "Continue" CTA for the Quiet Conversation flow.
//  52pt tall, 26pt radius, Charcoal bg / Off-White text.
//

import SwiftUI

struct StyleContinueButton: View {

    let title: String
    let isEnabled: Bool
    let action: () -> Void

    init(
        title: String = "Continue",
        isEnabled: Bool,
        action: @escaping () -> Void
    ) {
        self.title = title
        self.isEnabled = isEnabled
        self.action = action
    }

    var body: some View {
        Button(action: {
            if isEnabled { action() }
        }) {
            Text(title)
                .font(PatinaTypography.uiAction)
                .tracking(0.3)
                .foregroundStyle(PatinaColors.offWhite)
                .frame(maxWidth: .infinity)
                .frame(height: 52)
                .background(
                    RoundedRectangle(cornerRadius: 26)
                        .fill(isEnabled
                            ? PatinaColors.charcoal
                            : PatinaColors.charcoal.opacity(0.3))
                )
        }
        .buttonStyle(.plain)
        .disabled(!isEnabled)
        .accessibilityLabel(Text(title))
        .accessibilityAddTraits(isEnabled ? [.isButton] : [.isButton])
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
