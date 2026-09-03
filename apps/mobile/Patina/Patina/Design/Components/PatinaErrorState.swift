//
//  PatinaErrorState.swift
//  Patina
//
//  ux-july WP-FOUND: canonical error state, replacing the icon + message +
//  retry idiom hand-rolled per-screen (NotificationFeedView, InvoiceListView,
//  ProjectListView, …). Retry button is omitted entirely when `action` is
//  nil — screens with no reload path (e.g. a terminal failure) show only
//  the message.
//

import SwiftUI

struct PatinaErrorState: View {
    let message: String
    var retryLabel: String = "Let’s try that again"
    var action: (() -> Void)?

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 28))
                .foregroundStyle(PatinaColors.Text.muted)

            Text(message)
                .font(PatinaTypography.bodySmall)
                .foregroundStyle(PatinaColors.Text.secondary)
                .multilineTextAlignment(.center)

            if let action {
                Button(retryLabel, action: action)
                    .font(PatinaTypography.bodySmallMedium)
                    .foregroundStyle(PatinaColors.Text.interactive)
            }
        }
        .frame(maxWidth: .infinity)
    }
}

#Preview("With retry") {
    PatinaErrorState(message: "Something went wrong.", action: {})
        .padding(.top, 60)
        .padding(.horizontal, 32)
        .frame(maxWidth: .infinity)
        .background(PatinaColors.Background.primary)
}

#Preview("No retry") {
    PatinaErrorState(message: "Something went wrong.")
        .padding(.top, 60)
        .padding(.horizontal, 32)
        .frame(maxWidth: .infinity)
        .background(PatinaColors.Background.primary)
}
