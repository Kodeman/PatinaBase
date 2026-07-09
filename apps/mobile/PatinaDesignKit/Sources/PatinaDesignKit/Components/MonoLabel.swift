//
//  MonoLabel.swift
//  Patina
//
//  DM Mono metadata label — used for categories, timestamps, tags
//

import SwiftUI

/// DM Mono metadata label for categories, timestamps, match percentages, tags
public struct MonoLabel: View {
    let text: String
    var size: Font = PatinaTypography.mono
    var uppercase: Bool = true
    var color: Color = PatinaColors.Text.muted
    var tracking: CGFloat = 0.5

    public init(
        text: String,
        size: Font = PatinaTypography.mono,
        uppercase: Bool = true,
        color: Color = PatinaColors.Text.muted,
        tracking: CGFloat = 0.5
    ) {
        self.text = text
        self.size = size
        self.uppercase = uppercase
        self.color = color
        self.tracking = tracking
    }

    public var body: some View {
        Text(text)
            .font(size)
            .foregroundStyle(color)
            .tracking(tracking)
            .modifier(UppercaseModifier(isUppercase: uppercase))
    }
}

private struct UppercaseModifier: ViewModifier {
    let isUppercase: Bool

    func body(content: Content) -> some View {
        if isUppercase {
            content.textCase(.uppercase)
        } else {
            content
        }
    }
}

#Preview {
    VStack(alignment: .leading, spacing: 16) {
        MonoLabel(text: "Chilton Furniture")
        MonoLabel(text: "92% match", size: PatinaTypography.monoSmall)
        MonoLabel(text: "Scanned Apr 2", size: PatinaTypography.monoLabel)
        MonoLabel(text: "Step 2 of 4", size: PatinaTypography.monoSmall, color: PatinaColors.clay)
    }
    .padding()
    .background(PatinaColors.Background.primary)
}
