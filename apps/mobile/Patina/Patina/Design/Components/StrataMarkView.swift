//
//  StrataMarkView.swift
//  Patina
//
//  The Strata Mark - Patina's brand mark component
//  Three horizontal lines representing accumulated layers of time and value
//

import SwiftUI

/// The Strata Mark - Patina's animated brand mark
/// Three horizontal lines representing accumulated layers of time and value
/// Per spec: Line 1 (Mocha Brown), Line 2 (Clay Beige), Line 3 (Clay Beige @ 50%)
public struct StrataMarkView: View {
    let color: Color
    var scale: CGFloat = 1.0
    var breathing: Bool = false
    var useSpecColors: Bool = true  // Use spec-accurate colors

    @State private var breatheScale: CGFloat = 1.0

    public init(color: Color, scale: CGFloat = 1.0, breathing: Bool = false, useSpecColors: Bool = true) {
        self.color = color
        self.scale = scale
        self.breathing = breathing
        self.useSpecColors = useSpecColors
    }

    public var body: some View {
        VStack(spacing: 4 * scale) {
            // Line 1 - 100% width, Mocha Brown (spec section 1.4)
            Capsule()
                .fill(useSpecColors ? PatinaColors.Strata.line1 : color)
                .frame(width: 24 * scale, height: 3 * scale)

            // Line 2 - 80% width, Clay Beige at 100% (spec section 1.4)
            Capsule()
                .fill(useSpecColors ? PatinaColors.Strata.line2 : color.opacity(0.7))
                .frame(width: 18 * scale, height: 3 * scale)

            // Line 3 - 60% width, Clay Beige at 50% (spec section 1.4)
            Capsule()
                .fill(useSpecColors ? PatinaColors.Strata.line3 : color.opacity(0.5))
                .frame(width: 12 * scale, height: 3 * scale)
        }
        .scaleEffect(breathing ? breatheScale : 1.0)
        .onAppear {
            if breathing {
                withAnimation(
                    .easeInOut(duration: CompanionConstants.breathingDuration)  // 3s per spec
                    .repeatForever(autoreverses: true)
                ) {
                    breatheScale = 1.08
                }
            }
        }
        .onChange(of: breathing) { _, newValue in
            if newValue {
                withAnimation(
                    .easeInOut(duration: CompanionConstants.breathingDuration)  // 3s per spec
                    .repeatForever(autoreverses: true)
                ) {
                    breatheScale = 1.08
                }
            } else {
                withAnimation(.easeOut(duration: 0.3)) {
                    breatheScale = 1.0
                }
            }
        }
    }
}

// MARK: - Preview

#Preview("Default") {
    VStack(spacing: 40) {
        StrataMarkView(color: PatinaColors.mochaBrown)

        StrataMarkView(color: PatinaColors.clayBeige, scale: 1.5)

        StrataMarkView(color: .white, scale: 0.8, breathing: true)
    }
    .padding(40)
    .background(PatinaColors.Background.primary)
}

#Preview("Dark Background") {
    StrataMarkView(color: .white, scale: 1.2, breathing: true)
        .padding(40)
        .background(PatinaColors.charcoal)
}
