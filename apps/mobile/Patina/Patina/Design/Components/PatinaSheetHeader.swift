//
//  PatinaSheetHeader.swift
//  Patina
//
//  Patina Design System - Sheet header (PT-5-4)
//

import SwiftUI

/// Patina Design System - Header for presented sheets, with an optional
/// eyebrow, a serif title, and optional leading/trailing action buttons.
struct PatinaSheetHeader: View {
    let title: String
    var eyebrow: String?
    var leadingAction: Action?
    var trailingAction: Action?

    /// An icon-driven header action.
    struct Action {
        let systemImage: String
        let accessibilityLabel: String
        let handler: () -> Void

        init(systemImage: String, accessibilityLabel: String, handler: @escaping () -> Void) {
            self.systemImage = systemImage
            self.accessibilityLabel = accessibilityLabel
            self.handler = handler
        }
    }

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: PatinaSpacing.md) {
            actionButton(leadingAction)

            VStack(alignment: .leading, spacing: PatinaSpacing.xxxs) {
                if let eyebrow {
                    Text(eyebrow)
                        .patinaEyebrow()
                }
                Text(title)
                    .font(PatinaTypography.h4)
                    .foregroundStyle(PatinaColors.Text.primary)
            }

            Spacer(minLength: 0)

            actionButton(trailingAction)
        }
        .padding(.horizontal, PatinaSpacing.lg)
        .padding(.vertical, PatinaSpacing.md)
    }

    @ViewBuilder
    private func actionButton(_ action: Action?) -> some View {
        if let action {
            Button(action: action.handler) {
                Image(systemName: action.systemImage)
                    .font(PatinaTypography.bodyMedium)
                    .foregroundStyle(PatinaColors.Text.secondary)
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(action.accessibilityLabel)
        }
    }
}

#Preview {
    VStack(spacing: PatinaSpacing.xl) {
        PatinaSheetHeader(
            title: "Add Product",
            eyebrow: "New",
            leadingAction: .init(systemImage: "xmark", accessibilityLabel: "Close") {},
            trailingAction: .init(systemImage: "checkmark", accessibilityLabel: "Save") {}
        )

        PatinaSheetHeader(title: "Filters")

        PatinaSheetHeader(
            title: "Room Details",
            trailingAction: .init(systemImage: "ellipsis", accessibilityLabel: "More options") {}
        )
    }
    .background(PatinaColors.Background.primary)
}
