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

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let reason = act.reason {
                Text(reason)
                    .font(PatinaTypography.caption)
                    .foregroundStyle(PatinaColors.Text.muted)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("PurchaseActionBar.Reason")
            }

            HStack(spacing: 8) {
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

                Button(action: onPrimary) {
                    Text(act.primaryLabel)
                        .font(PatinaTypography.uiAction)
                        .foregroundStyle(PatinaColors.Text.inverse)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                        .frame(maxWidth: .infinity)
                        .frame(height: 52)
                        .background(PatinaColors.Interactive.active)
                        .clipShape(Capsule())
                }
                .accessibilityIdentifier("PurchaseActionBar.Primary")

                Button(action: onAddToRoom) {
                    Text(isSaved ? "Saved ✓" : "Add to room")
                        .font(PatinaTypography.uiAction)
                        .foregroundStyle(
                            isSaved ? PatinaColors.Text.inverse : PatinaColors.Text.primary
                        )
                        .lineLimit(1)
                        .fixedSize(horizontal: true, vertical: false)
                        .padding(.horizontal, 18)
                        .frame(height: 52)
                        .background(
                            Capsule()
                                .fill(isSaved ? PatinaColors.Interactive.active : Color.clear)
                        )
                        .overlay(
                            Capsule()
                                .stroke(PatinaColors.Border.strong, lineWidth: isSaved ? 0 : 1)
                        )
                }
                .accessibilityIdentifier("PurchaseActionBar.AddToRoom")
            }
        }
    }
}
