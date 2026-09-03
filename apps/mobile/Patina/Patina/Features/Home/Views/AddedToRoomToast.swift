//
//  AddedToRoomToast.swift
//  Patina
//

import SwiftUI

struct AddedToRoomToast: View {
    let message: String
    /// U05: opens the room the piece was just added to. Nil when no room is
    /// resolvable — the button is then omitted rather than shown dead.
    var onView: (() -> Void)?

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
                .font(PatinaTypography.caption)
                .foregroundStyle(PatinaColors.offWhite)
            if let onView {
                Button(action: onView) {
                    Text("View")
                        .font(PatinaTypography.caption)
                        .foregroundStyle(PatinaColors.Text.interactive)
                }
                .buttonStyle(.plain)
                .padding(.leading, 4)
                .accessibilityHint("Opens the room this piece was added to.")
            }
        }
        .padding(.vertical, 10)
        .padding(.horizontal, 18)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                // Deliberately dark toast surface in both modes. It lifts off
                // charcoal in dark mode because a toast is an object floating
                // on the page, and charcoal on the dark canvas is 1.15:1 —
                // the toast had no body at all (C-01).
                .fill(PatinaColors.Background.dark)
        )
        .shadow(color: PatinaColors.charcoal.opacity(0.25), radius: 16, x: 0, y: 8)
    }
}

#Preview {
    VStack(spacing: 16) {
        AddedToRoomToast(message: "Added to Living Room", onView: {})
        AddedToRoomToast(message: "Added to Living Room")
    }
    .padding()
    .background(PatinaColors.Background.primary)
}
