//
//  HoldToActButton.swift
//  Patina
//
//  `P-18` / `R1`. The three acts that commit a homeowner to something are
//  held, not tapped: the review confirmation, the outcome submit, and the
//  signature on a commercial document.
//
//  Held is not friction for its own sake. A tap is the same gesture as
//  scrolling past, and these three are the only places in the client app where
//  the phone records a legal act. Nine hundred milliseconds is long enough
//  that the hand knows it did something and short enough that nobody waits.
//
//  Three things this must not lose:
//   • `HoldableModifier`'s VoiceOver `Activate` action, which is the whole
//     accessible path — a sustained drag is not performable under VoiceOver;
//   • the completion haptic (`HapticManager`), which is the confirmation for
//     anyone who cannot see the ink fill;
//   • the delay under reduced motion. Reduced motion removes the INK, never
//     the deliberation — a reader who asked for less movement did not ask to
//     sign faster.
//

import SwiftUI

enum PatinaHold {
    /// The scored press, in seconds.
    static let duration: Double = 0.9
    static let voiceOverHint = "Press and hold to confirm."
    /// The affordance lives on the CONTROL, not in each act's label — so
    /// "Submit response" and "Sign proposal" keep their own words and one
    /// line explains the gesture everywhere it is used.
    static let affordance = "PRESS AND HOLD"
}

struct HoldToActButton: View {
    let title: String
    var isEnabled: Bool = true
    var isBusy: Bool = false
    let onComplete: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var progress: CGFloat = 0

    /// The ink only ever draws where motion is welcome; the hold itself is
    /// identical either way.
    private var inkWidth: CGFloat { reduceMotion ? 0 : progress }

    var body: some View {
        label
            .accessibilityElement(children: .combine)
            .accessibilityLabel(Text(title))
            .accessibilityAddTraits(.isButton)
            .accessibilityHint(Text(PatinaHold.voiceOverHint))
            .holdable(
                duration: PatinaHold.duration,
                onProgress: { progress = $0 },
                onComplete: {
                    guard isEnabled, !isBusy else { return }
                    onComplete()
                }
            )
            .disabled(!isEnabled || isBusy)
            .opacity(isEnabled && !isBusy ? 1 : 0.5)
    }

    private var label: some View {
        ZStack {
            GeometryReader { geometry in
                // The scored ink: a clay wash filling from the leading edge as
                // the press is held. No fill behind the resting state — the
                // act is a hairline rule until a hand is on it.
                Rectangle()
                    .fill(PatinaColors.clay.opacity(0.22))
                    .frame(width: geometry.size.width * inkWidth)
            }
            VStack(spacing: 3) {
                Text(title)
                    .font(PatinaTypography.bodySmallMedium)
                    .foregroundStyle(PatinaColors.Text.primary)
                    .multilineTextAlignment(.center)
                MonoLabel(text: PatinaHold.affordance)
                    .tracking(1.4)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
        }
        .frame(minHeight: 52)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .strokeBorder(PatinaColors.Border.strong, lineWidth: 1)
        }
        .contentShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}

#Preview {
    VStack(spacing: 20) {
        HoldToActButton(title: "Submit response") {}
        HoldToActButton(title: "Sign", isEnabled: false) {}
    }
    .padding(24)
    .background(PatinaColors.Background.primary)
}
