//
//  PatinaLoadingState.swift
//  Patina
//
//  ux-july WP-FOUND: canonical loading state, replacing the ProgressView +
//  label idiom hand-rolled per-screen (ProjectListView, InvoiceListView, …).
//

import SwiftUI

struct PatinaLoadingState: View {
    var label: String = "One moment…"

    var body: some View {
        VStack(spacing: 10) {
            ProgressView()
                .tint(PatinaColors.Text.interactive)

            Text(label)
                .font(PatinaTypography.bodySmall)
                .foregroundStyle(PatinaColors.Text.muted)
        }
        .frame(maxWidth: .infinity)
    }
}

#Preview {
    VStack(spacing: 48) {
        PatinaLoadingState()
        PatinaLoadingState(label: "Finding pieces for you…")
    }
    .padding(.top, 60)
    .frame(maxWidth: .infinity)
    .background(PatinaColors.Background.primary)
}
