//
//  SealMomentView.swift
//  Patina
//
//  `P-19`. The seal, full screen, once.
//
//  The stamp is the reward. Someone who has just committed real money does not
//  want a party, and she may be reading this in bed at eleven at night — so
//  there is no confetti, no celebration animation and no sound anywhere in
//  this file, and there never may be. What there is: the mark settling once,
//  one success haptic, one plain sentence about what happens next, and one
//  way out.
//
//  Reduced motion cross-fades instead. The scale and the rotation go; the
//  haptic still fires, because for a reader who has turned motion off the
//  haptic IS the confirmation.
//

import SwiftUI
import UIKit

struct SealMomentView: View {
    /// The studio that countersigns, where the app already holds a name for
    /// it. Never invented — `whatHappensNext` says "Your designer" instead.
    let studioName: String?
    let signedName: String?
    let onDone: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var hasSettled = false

    var body: some View {
        VStack(alignment: .leading, spacing: 28) {
            Spacer(minLength: 0)
            seal
            VStack(alignment: .leading, spacing: 10) {
                Text(ProposalSignActCopy.sealHeading)
                    .font(PatinaTypography.h2)
                    .foregroundStyle(PatinaColors.Text.primary)
                Text(ProposalSignActCopy.whatHappensNext(studio: studioName))
                    .font(PatinaTypography.bodySmall)
                    .foregroundStyle(PatinaColors.Text.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("sealMoment.next")
            }
            Spacer(minLength: 0)
            PatinaButton(ProposalSignActCopy.done, style: .secondary) {
                onDone()
            }
            .accessibilityIdentifier("sealMoment.done")
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 32)
        .padding(.vertical, 56)
        .background(PatinaColors.Background.primary)
        .onAppear(perform: settle)
    }

    /// SIGNED, in mocha, with the signer's name beneath it — the state table's
    /// own footnote for a signature (`P-17`). It stands alone here, so it
    /// speaks rather than hiding.
    private var seal: some View {
        PatinaStamp(
            state: .signed,
            sublabel: signedName,
            accessibilityLabel: ProposalSignActCopy.sealHeading
        )
        .scaleEffect(scale)
        .rotationEffect(.degrees(rotation))
        .opacity(hasSettled ? 1 : (reduceMotion ? 0 : 1))
        .animation(settleAnimation, value: hasSettled)
        .accessibilityIdentifier("sealMoment.stamp")
    }

    /// 1.06 → 1.0. Reduced motion never leaves 1.0.
    private var scale: CGFloat {
        guard !reduceMotion else { return 1 }
        return hasSettled ? 1 : ProposalSignActCopy.settleFromScale
    }

    /// A few degrees of press, settling onto the stamp's own resting tilt.
    /// Reduced motion never rotates beyond that resting value, which
    /// `PatinaStamp` applies itself.
    private var rotation: Double {
        guard !reduceMotion else { return 0 }
        return hasSettled ? 0 : ProposalSignActCopy.settleFromRotation
    }

    /// One curve, 420 ms. Reduced motion gets the cross-fade instead — the
    /// same duration, no transform.
    private var settleAnimation: Animation {
        .easeOut(duration: ProposalSignActCopy.settleDuration)
    }

    /// The haptic fires either way. It is the one confirmation available to a
    /// reader who has turned motion off, and to one who cannot see the mark.
    private func settle() {
        guard !hasSettled else { return }
        hasSettled = true
        HapticManager.shared.notification(.success)
    }
}

#Preview {
    SealMomentView(
        studioName: "Quist Interiors",
        signedName: "Margaret Whitfield",
        onDone: {}
    )
}
