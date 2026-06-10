//
//  NewRoomSheet.swift
//  Patina
//
//  Bottom sheet with two creation paths: LiDAR scan or manual entry.
//

import SwiftUI

struct NewRoomSheet: View {
    @Environment(\.appCoordinator) private var coordinator
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(spacing: 0) {
            Capsule()
                .fill(PatinaColors.pearl)
                .frame(width: 36, height: 4)
                .padding(.top, 10)

            Text("Add a new room")
                .font(PatinaTypography.h5)
                .foregroundStyle(PatinaColors.Text.primary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 24)
                .padding(.vertical, 16)

            option(
                icon: "◎",
                iconBackground: PatinaColors.clay,
                iconForeground: PatinaColors.offWhite,
                title: "Scan with camera",
                subtitle: "Walk your room for full spatial intelligence, AR placement, and smart recommendations"
            ) {
                dismiss()
                coordinator.navigate(to: .scanFlow(reason: .fresh))
            }

            option(
                icon: "📐",
                iconBackground: PatinaColors.Background.secondary,
                iconForeground: PatinaColors.Text.primary,
                title: "Enter manually",
                subtitle: "Add room type and dimensions. No AR, but you'll still get style-matched picks."
            ) {
                dismiss()
                coordinator.navigate(to: .manualRoomEntry)
            }

            Spacer().frame(height: 24)
        }
        .padding(.horizontal, 20)
        .background(PatinaColors.Background.primary)
    }

    private func option(icon: String, iconBackground: Color, iconForeground: Color,
                        title: String, subtitle: String,
                        action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 14) {
                ZStack {
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(iconBackground)
                        .frame(width: 48, height: 48)
                    Text(icon)
                        .font(.system(size: 22))
                        .foregroundStyle(iconForeground)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(PatinaTypography.bodySmallMedium)
                        .foregroundStyle(PatinaColors.Text.primary)
                    Text(subtitle)
                        .font(PatinaTypography.caption)
                        .foregroundStyle(PatinaColors.Text.muted)
                        .multilineTextAlignment(.leading)
                }
                Spacer(minLength: 0)
            }
            .padding(16)
            .background(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(PatinaColors.Background.secondary)
            )
        }
        .buttonStyle(.plain)
        .padding(.bottom, 8)
    }
}
