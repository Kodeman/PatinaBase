//
//  DailyRoomEmptyState.swift
//  Patina
//

import SwiftUI

struct DailyRoomEmptyState: View {
    let onScan: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            Spacer()
            ZStack {
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .fill(PatinaColors.Background.secondary)
                    .frame(width: 80, height: 80)
                Image(systemName: "house")
                    .font(.system(size: 32, weight: .light))
                    .foregroundStyle(PatinaColors.Text.secondary)
            }
            .padding(.bottom, 16)

            Text("Start your first room")
                .font(PatinaTypography.h4)
                .foregroundStyle(PatinaColors.Text.primary)
                .padding(.bottom, 6)

            Text("Capture a room to see daily picks tailored to your space")
                .font(PatinaTypography.bodySmall)
                .foregroundStyle(PatinaColors.Text.muted)
                .multilineTextAlignment(.center)
                .lineSpacing(2)
                .frame(maxWidth: 260)
                .padding(.bottom, 20)

            Button {
                onScan()
            } label: {
                Text("Scan a Room")
                    .font(PatinaTypography.bodySmallMedium)
                    .foregroundStyle(PatinaColors.Text.inverse)
                    .padding(.vertical, 12)
                    .padding(.horizontal, 28)
                    .background(Capsule().fill(PatinaColors.Interactive.active))
            }
            .buttonStyle(.plain)

            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(.horizontal, 32)
        .background(PatinaColors.Background.primary)
    }
}

#Preview {
    DailyRoomEmptyState(onScan: { })
}
