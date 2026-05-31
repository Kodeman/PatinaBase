//
//  AddedToRoomToast.swift
//  Patina
//

import SwiftUI

struct AddedToRoomToast: View {
    let message: String
    let onView: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            ZStack {
                Circle()
                    .fill(PatinaColors.success)
                    .frame(width: 24, height: 24)
                Image(systemName: "checkmark")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(.white)
            }
            Text(message)
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(PatinaColors.offWhite)
            Button {
                onView()
            } label: {
                Text("View")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(PatinaColors.clay)
            }
            .buttonStyle(.plain)
            .padding(.leading, 4)
        }
        .padding(.vertical, 10)
        .padding(.horizontal, 18)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(PatinaColors.charcoal)
        )
        .shadow(color: PatinaColors.charcoal.opacity(0.25), radius: 16, x: 0, y: 8)
    }
}

#Preview {
    AddedToRoomToast(message: "Added to Living Room") { }
        .padding()
        .background(PatinaColors.offWhite)
}
