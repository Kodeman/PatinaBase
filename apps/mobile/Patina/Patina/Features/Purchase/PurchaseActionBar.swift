//
//  PurchaseActionBar.swift
//  Patina
//
//  M3 block 11 — the piece screen's bottom bar, once a piece can be acted on.
//
//  One primary and one ghost. The primary is whatever `PieceActResolver`
//  returned; the ghost is "Add to room", which is what the bar used to be
//  entirely. Where the act is Path C the gate's reason prints above the pair,
//  because "Ask about this piece" without the reason reads as a downgrade
//  rather than as the app declining to sell something it does not know enough
//  about.
//

import SwiftUI

struct PurchaseActionBar: View {

    let act: PieceAct
    let isSaved: Bool
    /// SP-18: `usdz_url` is NULL on every catalogue row today, so this is
    /// false everywhere — the control is kept rather than deleted because the
    /// screen's AR route still exists.
    var showsARButton: Bool = false
    var onAR: () -> Void = {}
    let onPrimary: () -> Void
    let onAddToRoom: () -> Void

    /// `W1-C-05`: at `extra-extra-extra-large` the two capsules shared one row
    /// and the primary got whatever the secondary's intrinsic width left —
    /// 144.33 pt on an iPhone 17 Pro — so "Ask Leah to source this" rendered as
    /// "Ask Leah to sour…" and the full sentence survived only in the AX label.
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    /// Where the row stops being a row. Pure so a test can hold the threshold
    /// without rendering the bar.
    static func stacksActions(at size: DynamicTypeSize) -> Bool {
        size >= .xxLarge
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let reason = act.reason {
                Text(reason)
                    .font(PatinaTypography.caption)
                    .foregroundStyle(PatinaColors.Text.muted)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("PurchaseActionBar.Reason")
            }

            if Self.stacksActions(at: dynamicTypeSize) {
                VStack(spacing: 8) {
                    HStack(spacing: 8) {
                        arButton
                        primaryButton
                    }
                    addToRoomButton(fillsWidth: true)
                }
            } else {
                HStack(spacing: 8) {
                    arButton
                    primaryButton
                    addToRoomButton(fillsWidth: false)
                }
            }
        }
    }

    // MARK: - The three controls

    @ViewBuilder
    private var arButton: some View {
        if showsARButton {
            Button(action: onAR) {
                Circle()
                    .fill(PatinaColors.Background.secondary)
                    .frame(width: 50, height: 50)
                    .overlay(
                        Image(systemName: "arkit")
                            .font(.system(size: 18))
                            .foregroundStyle(PatinaColors.Text.primary)
                    )
            }
            .accessibilityLabel("Place in AR")
            .accessibilityHint("Preview this piece in your room with augmented reality.")
            .accessibilityIdentifier("ProductDetailView.ARButton")
        }
    }

    private var primaryButton: some View {
        Button(action: onPrimary) {
            // W1-C-05: two lines and a real scale floor. `lineLimit(1)` with
            // `minimumScaleFactor(0.8)` could not fit "Ask Leah to source this"
            // into the width the row left it, so the label truncated instead.
            Text(act.primaryLabel)
                .font(PatinaTypography.uiAction)
                .foregroundStyle(PatinaColors.Text.inverse)
                .lineLimit(2)
                .minimumScaleFactor(0.6)
                .allowsTightening(true)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .frame(maxWidth: .infinity)
                .frame(minHeight: 52)
                .background(PatinaColors.Interactive.active)
                .clipShape(Capsule())
        }
        .accessibilityIdentifier("PurchaseActionBar.Primary")
    }

    private func addToRoomButton(fillsWidth: Bool) -> some View {
        Button(action: onAddToRoom) {
            // This is the secondary of two buttons on one bar, and it
            // stays an outline in both its states. Filling it when
            // saved made it `Interactive.active` + `Text.inverse` —
            // pixel-identical to the Buy capsule beside it, so the bar
            // read as two primaries. The saved state is carried by the
            // accent ink and a heavier rule instead, which is a
            // difference a tester can see without a second commitment
            // colour (C3-05, C-41).
            Text(isSaved ? "Saved ✓" : "Add to room")
                .font(PatinaTypography.uiAction)
                .foregroundStyle(
                    isSaved ? PatinaColors.Text.interactive : PatinaColors.Text.primary
                )
                .lineLimit(1)
                .minimumScaleFactor(0.6)
                .allowsTightening(true)
                .fixedSize(horizontal: !fillsWidth, vertical: false)
                .padding(.horizontal, 18)
                .frame(maxWidth: fillsWidth ? .infinity : nil)
                .frame(height: 52)
                .overlay(
                    Capsule()
                        .stroke(
                            isSaved
                                ? PatinaColors.Text.interactive
                                : PatinaColors.Border.strong,
                            lineWidth: isSaved ? 1.5 : 1
                        )
                )
        }
        .accessibilityIdentifier("PurchaseActionBar.AddToRoom")
    }
}
