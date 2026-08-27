//
//  LocalStoreClaimSheet.swift
//  Patina
//
//  SP-06. The one screen that turns the silent inheritance of a guest's rooms
//  and saves into the account's own decision.
//

import SwiftUI

struct LocalStoreClaimSheet: View {
    let onKeep: () -> Void
    let onStartFresh: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Keep the room and the pieces you saved on this phone?")
                .font(PatinaTypography.h4)
                .foregroundStyle(PatinaColors.Text.primary)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 40)

            Text("They were saved before you signed in. Keep them and they become yours; start fresh and this phone keeps nothing from before.")
                .font(PatinaTypography.bodySmall)
                .foregroundStyle(PatinaColors.Text.secondary)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 10)

            Spacer(minLength: 24)

            Button(action: onKeep) {
                Text("Keep them")
                    .font(PatinaTypography.uiAction)
                    .foregroundStyle(PatinaColors.Text.inverse)
                    .frame(maxWidth: .infinity)
                    .frame(height: 50)
                    .background(PatinaColors.Interactive.active)
                    .clipShape(Capsule())
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("LocalStoreClaim.Keep")

            Button(action: onStartFresh) {
                Text("Start fresh")
                    .font(PatinaTypography.uiAction)
                    .foregroundStyle(PatinaColors.Text.primary)
                    .frame(maxWidth: .infinity)
                    .frame(height: 50)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .padding(.top, 4)
            .padding(.bottom, 28)
            .accessibilityIdentifier("LocalStoreClaim.StartFresh")
        }
        .padding(.horizontal, 24)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(PatinaColors.Background.primary)
        .presentationDetents([.height(320)])
        // Dismissing without choosing is the safe answer, and the sheet's
        // binding treats it as "Keep them" — nothing is destroyed by walking
        // away from this question.
        .interactiveDismissDisabled(false)
    }
}

#Preview {
    LocalStoreClaimSheet(onKeep: {}, onStartFresh: {})
}
