//
//  FilterChip.swift
//  Patina
//
//  Pill-shaped filter chip for category/filter selection
//

import SwiftUI

/// Pill-shaped filter chip used in recommendation filters, quiz options, etc.
struct FilterChip: View {
    let title: String
    let isActive: Bool
    var action: (() -> Void)? = nil

    var body: some View {
        Button {
            action?()
        } label: {
            Text(title)
                .font(PatinaTypography.caption)
                .foregroundStyle(isActive ? PatinaColors.Text.inverse : PatinaColors.Text.secondary)
                .padding(.horizontal, 14)
                .padding(.vertical, 6)
                .background(isActive ? PatinaColors.Interactive.active : PatinaColors.Background.secondary)
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}

#Preview {
    HStack(spacing: 8) {
        FilterChip(title: "All", isActive: true)
        FilterChip(title: "Seating", isActive: false)
        FilterChip(title: "Tables", isActive: false)
        FilterChip(title: "Lighting", isActive: false)
    }
    .padding()
    .background(PatinaColors.Background.primary)
}
