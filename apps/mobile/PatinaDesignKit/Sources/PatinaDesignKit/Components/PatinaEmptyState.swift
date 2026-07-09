//
//  PatinaEmptyState.swift
//  Patina
//
//  Patina Design System - Empty state (PT-5-5)
//

import SwiftUI

/// Patina Design System - Centered empty/zero state with an icon, title,
/// supporting body, and an optional call-to-action button.
public struct PatinaEmptyState: View {
    let icon: String
    let title: String
    let message: String
    var ctaTitle: String?
    var ctaAction: (() -> Void)?

    public init(
        icon: String,
        title: String,
        message: String,
        ctaTitle: String? = nil,
        ctaAction: (() -> Void)? = nil
    ) {
        self.icon = icon
        self.title = title
        self.message = message
        self.ctaTitle = ctaTitle
        self.ctaAction = ctaAction
    }

    public var body: some View {
        VStack(spacing: PatinaSpacing.md) {
            Image(systemName: icon)
                .font(.system(size: 40, weight: .light))
                .foregroundStyle(PatinaColors.Text.muted)

            VStack(spacing: PatinaSpacing.xs) {
                Text(title)
                    .font(PatinaTypography.h4)
                    .foregroundStyle(PatinaColors.Text.primary)
                    .multilineTextAlignment(.center)

                Text(message)
                    .font(PatinaTypography.bodySmall)
                    .foregroundStyle(PatinaColors.Text.muted)
                    .multilineTextAlignment(.center)
            }

            if let ctaTitle, let ctaAction {
                PatinaButton(ctaTitle, style: .secondary, action: ctaAction)
                    .fixedSize()
                    .padding(.top, PatinaSpacing.xs)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(PatinaSpacing.xl)
    }
}

#Preview {
    VStack(spacing: PatinaSpacing.xxl) {
        PatinaEmptyState(
            icon: "tray",
            title: "No products yet",
            message: "Products you capture will appear here, ready to add to a room."
        )

        PatinaEmptyState(
            icon: "camera.viewfinder",
            title: "Scan your first room",
            message: "Walk a room to build a 3D model and discover matching pieces.",
            ctaTitle: "Start a scan",
            ctaAction: {}
        )
    }
    .background(PatinaColors.Background.primary)
}
