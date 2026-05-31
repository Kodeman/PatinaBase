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
                    .fill(PatinaColors.softCream)
                    .frame(width: 80, height: 80)
                Image(systemName: "house")
                    .font(.system(size: 32, weight: .light))
                    .foregroundStyle(PatinaColors.mocha)
            }
            .padding(.bottom, 16)

            Text("Start your first room")
                .font(.custom("PlayfairDisplay-Regular", size: 20))
                .foregroundStyle(PatinaColors.charcoal)
                .padding(.bottom, 6)

            Text("Capture a room to see daily picks tailored to your space")
                .font(.system(size: 13))
                .foregroundStyle(PatinaColors.agedOak)
                .multilineTextAlignment(.center)
                .lineSpacing(2)
                .frame(maxWidth: 260)
                .padding(.bottom, 20)

            Button {
                onScan()
            } label: {
                Text("Scan a Room")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(PatinaColors.offWhite)
                    .padding(.vertical, 12)
                    .padding(.horizontal, 28)
                    .background(Capsule().fill(PatinaColors.charcoal))
            }
            .buttonStyle(.plain)

            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(.horizontal, 32)
        .background(PatinaColors.offWhite)
    }
}

#Preview {
    DailyRoomEmptyState(onScan: { })
}
