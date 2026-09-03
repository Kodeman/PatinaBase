//
//  ScanReviewHeader.swift
//  Patina
//
//  Header section of the post-scan Review screen (PT-6-3). Title, supporting
//  copy, and the editable room-name field. Behavior-preserving extraction from
//  ScanReviewView.headerSection.
//

import SwiftUI

/// Title + room-name field for the Review screen.
struct ScanReviewHeader: View {

    @Binding var roomName: String

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Your room, your way")
                .font(PatinaTypography.patinaVoiceLarge)
                .foregroundStyle(PatinaColors.Text.primary.opacity(0.85))
            Text("Give the room a name, pick the photo you love most, and jot down anything worth remembering. You can share it later.")
                .font(.custom("Inter-Regular", size: 13, relativeTo: .footnote))
                .foregroundStyle(PatinaColors.Text.muted)
                .fixedSize(horizontal: false, vertical: true)

            TextField("Room name", text: $roomName)
                .font(.custom("Inter-Regular", size: 15, relativeTo: .subheadline))
                .foregroundStyle(PatinaColors.Text.primary)
                .padding(.horizontal, 16)
                .frame(height: 48)
                .background(
                    RoundedRectangle(cornerRadius: 12)
                        .fill(PatinaColors.Background.secondary)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(PatinaColors.Border.strong, lineWidth: 1.5)
                )
                .padding(.top, 8)
        }
    }
}
