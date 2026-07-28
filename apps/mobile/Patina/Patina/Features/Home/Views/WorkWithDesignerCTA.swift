//
//  WorkWithDesignerCTA.swift
//  Patina
//
//  The discovering-tier footer on the Daily Room home. Patina opens as a
//  marketplace — browse and save pieces — and this card is the single, soft
//  bridge into the design-services relationship. Engaging a designer is what
//  advances the client past `.discovering`, which then progressively reveals
//  the Studio hub (Messages, Projects, …) via `EngagementTier`.
//
//  House card language, matched to `DailyFeedEmptyModule`: ✦ clay eyebrow,
//  Playfair headline, muted body, a clay capsule primary, and two quiet
//  discovery links (Browse / Saved) so the marketplace stays reachable
//  without a room scan.
//

import SwiftUI

struct WorkWithDesignerCTA: View {
    /// Primary morph action → `.designerConsultation` (design services).
    let onWorkWithDesigner: () -> Void
    /// Secondary discovery link → `.emergence` (browse the full collection).
    let onBrowse: () -> Void
    /// Secondary discovery link → `.table` (saved items / collections).
    let onSaved: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 6) {
                Text("✦")
                    .font(.system(size: 11))
                    .foregroundStyle(PatinaColors.clay)
                Text("Design help")
                    .font(PatinaTypography.monoLabel)
                    .tracking(0.8)
                    .textCase(.uppercase)
                    .foregroundStyle(PatinaColors.Text.interactive)
            }
            .padding(.bottom, 8)

            Text("Ready to bring in a designer?")
                .font(PatinaTypography.h4)
                .foregroundStyle(PatinaColors.Text.primary)
                .lineSpacing(2)
                .padding(.bottom, 6)

            Text("Start with a piece you love, then work with a Patina designer "
                + "to shape the whole room.")
                .font(PatinaTypography.bodySmall)
                .foregroundStyle(PatinaColors.Text.muted)
                .lineSpacing(3)
                .padding(.bottom, 16)

            Button(action: onWorkWithDesigner) {
                Text("Explore design services")
                    .font(PatinaTypography.bodySmallMedium)
                    .foregroundStyle(PatinaColors.Text.inverse)
                    .frame(maxWidth: .infinity)
                    // minHeight (not height) so the CTA grows instead of
                    // clipping its label at accessibility type sizes.
                    .frame(minHeight: 44)
                    .background(Capsule().fill(PatinaColors.Interactive.active))
            }
            .buttonStyle(.plain)

            // U44: at `.discovering` these two links ARE the marketplace
            // block — there is no `MarketplaceLinksSection` below yet — so
            // they carry body weight and primary ink rather than reading as
            // fine print under the designer pitch.
            HStack(spacing: 24) {
                Button(action: onBrowse) {
                    Text("Browse pieces →")
                        .font(PatinaTypography.bodySmallMedium)
                        .foregroundStyle(PatinaColors.Text.primary)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityHint("Opens the full collection.")

                Button(action: onSaved) {
                    Text("Saved")
                        .font(PatinaTypography.bodySmallMedium)
                        .foregroundStyle(PatinaColors.Text.primary)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityHint("Opens your saved pieces.")

                Spacer(minLength: 0)
            }
            .frame(minHeight: 44)
            .padding(.top, 8)
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(PatinaColors.Background.secondary)
        )
    }
}

#Preview {
    WorkWithDesignerCTA(
        onWorkWithDesigner: {},
        onBrowse: {},
        onSaved: {}
    )
    .padding(20)
    .background(PatinaColors.Background.primary)
}
