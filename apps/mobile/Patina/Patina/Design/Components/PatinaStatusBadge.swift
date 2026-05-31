//
//  PatinaStatusBadge.swift
//  Patina
//
//  Patina Design System - Status badge (PT-5-3)
//

import SwiftUI

/// Patina Design System - Compact status badge with semantic states.
struct PatinaStatusBadge: View {

    /// Semantic state driving the badge's color and default icon.
    enum State {
        case info
        case success
        case warning
        case error

        var tint: Color {
            switch self {
            case .info: return PatinaColors.dustyBlue
            case .success: return PatinaColors.success
            case .warning: return PatinaColors.warning
            case .error: return PatinaColors.error
            }
        }

        var icon: String {
            switch self {
            case .info: return "info.circle.fill"
            case .success: return "checkmark.circle.fill"
            case .warning: return "exclamationmark.triangle.fill"
            case .error: return "xmark.circle.fill"
            }
        }
    }

    let state: State
    let text: String

    var body: some View {
        HStack(spacing: PatinaSpacing.xs) {
            Image(systemName: state.icon)
                .font(PatinaTypography.caption)
            Text(text)
                .font(PatinaTypography.captionMedium)
                .tracking(0.5)
                .textCase(.uppercase)
        }
        .foregroundStyle(state.tint)
        .padding(.vertical, PatinaSpacing.xxs)
        .padding(.horizontal, PatinaSpacing.sm)
        .background(state.tint.opacity(0.14))
        .clipShape(Capsule())
    }
}

#Preview {
    VStack(alignment: .leading, spacing: PatinaSpacing.md) {
        PatinaStatusBadge(state: .info, text: "Draft")
        PatinaStatusBadge(state: .success, text: "Approved")
        PatinaStatusBadge(state: .warning, text: "Pending")
        PatinaStatusBadge(state: .error, text: "Rejected")
    }
    .padding(PatinaSpacing.xl)
    .background(PatinaColors.Background.primary)
}
