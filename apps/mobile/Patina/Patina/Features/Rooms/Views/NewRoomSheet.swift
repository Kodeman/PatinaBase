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

            // B-60: one icon system. "Scan with camera" carried a 90 pt tan
            // tile with a `◎` glyph and "Enter manually" a bare blue-grey 📐
            // emoji with no tile at all — two treatments and two icon systems
            // on two adjacent rows of the same sheet.
            option(
                icon: "camera.viewfinder",
                title: "Scan with camera",
                subtitle: "Walk your room with the camera — best picks, AR placement, and a floor plan."
            ) {
                dismiss()
                coordinator.navigate(to: .scanFlow(reason: .fresh))
            }

            option(
                icon: "ruler",
                title: "Enter manually",
                subtitle: "Type in room size and details. You'll still get style-matched picks."
            ) {
                dismiss()
                coordinator.navigate(to: .manualRoomEntry)
            }

            Spacer(minLength: 24)
        }
        .padding(.horizontal, 20)
        // B-60: the VStack claimed only its intrinsic height inside a
        // `.medium` detent, so the sheet's own presentation ground showed as a
        // third material below the rows (grey from y≈740 to the bottom edge).
        // One ground, filling the detent.
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(PatinaColors.Background.primary)
    }

    private func option(icon: String,
                        title: String, subtitle: String,
                        action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 14) {
                ZStack {
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(PatinaColors.clay)
                        .frame(width: 48, height: 48)
                    Image(systemName: icon)
                        .font(.system(size: 20, weight: .regular))
                        .foregroundStyle(PatinaColors.offWhite)
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
