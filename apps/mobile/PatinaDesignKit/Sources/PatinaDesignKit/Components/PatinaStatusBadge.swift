//
//  PatinaStatusBadge.swift
//  Patina
//
//  Patina Design System - Status badge (PT-5-3)
//

import SwiftUI

/// Patina Design System - Compact status badge with semantic states.
public struct PatinaStatusBadge: View {

    /// Semantic state driving the badge's color and default icon.
    public enum State {
        case info
        case success
        case warning
        case error

        /// The wash behind the badge, at 14 %. A background takes the 3:1
        /// non-text bar, and these clear it.
        public var tint: Color {
            switch self {
            case .info: return PatinaColors.dustyBlue
            case .success: return PatinaColors.success
            case .warning: return PatinaColors.warning
            case .error: return PatinaColors.error
            }
        }

        /// The ink: a 12 pt uppercase label and its glyph, which take the 4.5:1
        /// body bar. `A-73` — `error` painted the label as well as the wash, and
        /// `PatinaColors.error` on its own 14 % wash is **2.65:1** on the light
        /// canvas. `Text.error` is the value that carries a sentence: 4.89:1
        /// light, 5.20:1 dark. The other three states resolve to their wash
        /// value here because no W1 finding measured them; they are 1.82–2.55:1
        /// on the light canvas and are reported as a gap, not silently fixed —
        /// `theStatusBadgeInkClearsAAOnItsOwnWash` measures error alone and
        /// says so.
        public var inkTint: Color {
            switch self {
            case .error: return PatinaColors.Text.error
            default: return tint
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

    public init(state: State, text: String) {
        self.state = state
        self.text = text
    }

    public var body: some View {
        HStack(spacing: PatinaSpacing.xs) {
            Image(systemName: state.icon)
                .font(PatinaTypography.caption)
            Text(text)
                .font(PatinaTypography.captionMedium)
                .tracking(0.5)
                .textCase(.uppercase)
        }
        .foregroundStyle(state.inkTint)
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
