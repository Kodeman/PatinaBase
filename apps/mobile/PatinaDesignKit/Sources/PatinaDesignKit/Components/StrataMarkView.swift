//
//  StrataMarkView.swift
//  Patina
//
//  The Strata Mark - Patina's brand mark component
//  Three horizontal lines representing accumulated layers of time and value
//

import SwiftUI

/// Lets a host decide whether the Strata mark is the accessible control or a
/// decorative glyph inside a larger accessible shell.
public enum StrataMarkAccessibility: Equatable, Sendable {
    case decorative
    case labeled(label: String, hint: String?)

    public static let companionControl = StrataMarkAccessibility.labeled(
        label: "Patina Companion",
        hint: "Double tap to open, or drag up for quick actions"
    )
}

/// The Strata Mark - Patina's animated brand mark
/// Three horizontal lines representing accumulated layers of time and value
/// Per spec: Line 1 (Mocha Brown), Line 2 (Clay Beige), Line 3 (Clay Beige @ 50%)
public struct StrataMarkView: View {
    let color: Color
    var scale: CGFloat = 1.0
    var breathing: Bool = false
    var useSpecColors: Bool = true  // Use spec-accurate colors
    let accessibility: StrataMarkAccessibility

    @State private var breatheScale: CGFloat = 1.0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    public init(
        color: Color,
        scale: CGFloat = 1.0,
        breathing: Bool = false,
        useSpecColors: Bool = true,
        accessibility: StrataMarkAccessibility = .companionControl
    ) {
        self.color = color
        self.scale = scale
        self.breathing = breathing
        self.useSpecColors = useSpecColors
        self.accessibility = accessibility
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
        .modifier(StrataMarkAccessibilityModifier(accessibility: accessibility))
        .onAppear {
            if breathing && !reduceMotion {
                startBreathing()
            }
        }
        .onChange(of: breathing) { _, newValue in
            if newValue && !reduceMotion {
                startBreathing()
            } else {
                stopBreathing(animated: !reduceMotion)
            }
        }
        .onChange(of: reduceMotion) { _, isReduced in
            if isReduced {
                stopBreathing(animated: false)
            } else if breathing {
                startBreathing()
            }
        }
    }

    private func startBreathing() {
        withAnimation(
            .easeInOut(duration: PatinaCompanionMotion.breathingDuration)
            .repeatForever(autoreverses: true)
        ) {
            breatheScale = 1.08
        }
    }

    private func stopBreathing(animated: Bool) {
        if animated {
            withAnimation(.easeOut(duration: 0.3)) {
                breatheScale = 1.0
            }
        } else {
            var transaction = Transaction()
            transaction.disablesAnimations = true
            withTransaction(transaction) {
                breatheScale = 1.0
            }
        }
    }
}

private struct StrataMarkAccessibilityModifier: ViewModifier {
    let accessibility: StrataMarkAccessibility

    @ViewBuilder
    func body(content: Content) -> some View {
        switch accessibility {
        case .decorative:
            content.accessibilityHidden(true)
        case let .labeled(label, hint):
            if let hint, !hint.isEmpty {
                content
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(Text(label))
                    .accessibilityHint(Text(hint))
            } else {
                content
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(Text(label))
            }
        }
    }
}

// MARK: - Preview

#Preview("Default") {
    VStack(spacing: 40) {
        StrataMarkView(color: PatinaColors.mocha)

        StrataMarkView(color: PatinaColors.clay, scale: 1.5)

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
