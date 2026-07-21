//
//  CompanionIntroBubble.swift
//  Patina
//
//  A speech-bubble card the Companion overlay presents rising from the mark:
//  a full self-introduction the first time a brand-new user ever sees the
//  Companion, and a compact one-line acknowledgement ("That's the way…")
//  reused for later reinforcement moments. Visually kin to the existing
//  first-launch coachmark card (`CompanionOverlay.companionCoachmark`,
//  Views/CompanionOverlay.swift ~412–441).
//
//  This view owns no transition of its own — the overlay applies
//  `.transition(.move(edge: .bottom).combined(with: .opacity))` (or
//  `.opacity` under reduce motion) at the presentation site, so this stays a
//  plain, transition-free card.
//

import SwiftUI

public struct CompanionIntroBubble: View {

    /// The two presentation modes, keyed off of `init`.
    private enum Mode {
        case intro(onShowMe: () -> Void, onLater: () -> Void)
        case compactAck(text: String)
    }

    private let mode: Mode

    /// Full intro mode — the one-time self-introduction for brand-new users.
    public init(onShowMe: @escaping () -> Void, onLater: @escaping () -> Void) {
        self.mode = .intro(onShowMe: onShowMe, onLater: onLater)
    }

    /// Compact ack mode — a transient single-line acknowledgement, no buttons.
    public init(compactText: String) {
        self.mode = .compactAck(text: compactText)
    }

    public var body: some View {
        Group {
            switch mode {
            case let .intro(onShowMe, onLater):
                introContent(onShowMe: onShowMe, onLater: onLater)
            case let .compactAck(text):
                compactContent(text: text)
            }
        }
        .padding(16)
        .frame(maxWidth: 300, alignment: .leading)
        .background(PatinaColors.Background.primary)
        .clipShape(RoundedRectangle(cornerRadius: 18))
        .patinaShadow(PatinaShadows.companion)
    }

    // MARK: - Full intro mode

    private func introContent(
        onShowMe: @escaping () -> Void,
        onLater: @escaping () -> Void
    ) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 6) {
                Text("I'm your Companion.")
                    .font(.custom("PlayfairDisplay-Italic", size: 18, relativeTo: .headline))
                    .foregroundStyle(PatinaColors.Text.primary)

                Text("Tap me any time, anywhere in Patina — I'll show you the way to what's next.")
                    .font(.custom("PlayfairDisplay-Italic", size: 15, relativeTo: .body))
                    .foregroundStyle(PatinaColors.Text.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel(
                "I'm your Companion. Tap me any time, anywhere in Patina — I'll show you the way to what's next."
            )

            HStack(spacing: 20) {
                Button(action: onShowMe) {
                    Text("Show me")
                        .font(PatinaTypography.bodySmallMedium)
                        .foregroundStyle(PatinaColors.offWhite)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 8)
                        .background(PatinaColors.clay)
                        .clipShape(Capsule())
                        // 44pt hit target without inflating the visual capsule.
                        .frame(minHeight: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("companion.intro.showMe")

                Button(action: onLater) {
                    Text("Later")
                        .font(PatinaTypography.bodySmallMedium)
                        .foregroundStyle(PatinaColors.Text.muted)
                        .frame(minWidth: 44, minHeight: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("companion.intro.later")
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("companion.intro")
    }

    // MARK: - Compact ack mode

    private func compactContent(text: String) -> some View {
        Text(text)
            .font(.custom("PlayfairDisplay-Italic", size: 15, relativeTo: .body))
            .foregroundStyle(PatinaColors.Text.primary)
            .fixedSize(horizontal: false, vertical: true)
    }
}

// MARK: - Previews

#Preview("Intro — Light") {
    CompanionIntroBubble(onShowMe: {}, onLater: {})
        .padding(40)
        .background(PatinaColors.Background.tertiary)
}

#Preview("Intro — Dark") {
    CompanionIntroBubble(onShowMe: {}, onLater: {})
        .padding(40)
        .background(PatinaColors.Background.tertiary)
        .preferredColorScheme(.dark)
}

#Preview("Compact Ack — Light") {
    CompanionIntroBubble(compactText: "That's the way — I'll be here when you need me.")
        .padding(40)
        .background(PatinaColors.Background.tertiary)
}

#Preview("Compact Ack — Dark") {
    CompanionIntroBubble(compactText: "That's the way — I'll be here when you need me.")
        .padding(40)
        .background(PatinaColors.Background.tertiary)
        .preferredColorScheme(.dark)
}
