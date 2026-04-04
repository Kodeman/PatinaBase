//
//  MonoLabel.swift
//  Patina
//
//  DM Mono metadata label — used for categories, timestamps, tags
//

import SwiftUI

/// DM Mono metadata label for categories, timestamps, match percentages, tags
struct MonoLabel: View {
    let text: String
    var size: Font = PatinaTypography.mono
    var uppercase: Bool = true
    var color: Color = PatinaColors.agedOak
    var tracking: CGFloat = 0.5

    var body: some View {
        Text(text)
            .font(size)
            .foregroundColor(color)
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
        MonoLabel(text: "Scanned Apr 2", size: PatinaTypography.monoTiny)
        MonoLabel(text: "Step 2 of 4", size: PatinaTypography.monoSmall, color: PatinaColors.clay)
    }
    .padding()
    .background(PatinaColors.offWhite)
}
