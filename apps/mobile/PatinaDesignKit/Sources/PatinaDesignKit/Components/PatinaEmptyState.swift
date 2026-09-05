//
//  PatinaEmptyState.swift
//  Patina
//
//  Patina Design System - Empty state (PT-5-5)
//

import SwiftUI

/// The words of an empty state, without the view — so a sentence the whole app
/// has to say identically can be written once and read by a test.
public struct PatinaEmptyStateContent: Equatable, Sendable {
    public let icon: String
    public let title: String
    public let message: String
    public let ctaTitle: String?

    public init(icon: String, title: String, message: String, ctaTitle: String? = nil) {
        self.icon = icon
        self.title = title
        self.message = message
        self.ctaTitle = ctaTitle
    }
}

/// Patina Design System - Centered empty/zero state with an icon, title,
/// supporting body, and an optional call-to-action button.
public struct PatinaEmptyState: View {
    /// `P-17`: optional. A glyph that carries a STATE is refused on the
    /// approval surfaces — the empty decision list said "nothing waiting on
    /// you" under a check mark, which is a check mark used as status. Nil
    /// draws the words alone, in the same layout; every other surface keeps
    /// its illustrative glyph, which is a picture of a thing, not a verdict.
    let icon: String?
    let title: String
    let message: String
    var ctaTitle: String?
    var ctaAction: (() -> Void)?

    public init(
        icon: String? = nil,
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

    public init(_ content: PatinaEmptyStateContent, ctaAction: (() -> Void)? = nil) {
        self.init(
            icon: content.icon,
            title: content.title,
            message: content.message,
            ctaTitle: content.ctaTitle,
            ctaAction: ctaAction
        )
    }

    public var body: some View {
        VStack(spacing: PatinaSpacing.md) {
            if let icon {
                Image(systemName: icon)
                    .font(.system(size: 40, weight: .light))
                    .foregroundStyle(PatinaColors.Text.muted)
            }

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

// MARK: - The sentences more than one surface has to say

public extension PatinaEmptyStateContent {
    /// `A3-01`. Production's `get_aesthete_matches` returns zero rows for every
    /// tester: `products` holds one `catalog`/`published` row, named
    /// "Smoke Test Ceramic Lamp", with no image. Whether or not the catalogue
    /// lands before build 1 (`D2`), every product surface has to say the same
    /// true thing when nothing comes back — and it must not offer a door there
    /// is nothing behind.
    static let stillChoosingPieces = PatinaEmptyStateContent(
        icon: "square.stack",
        title: "Nothing here yet",
        message: "Your designer is still choosing pieces for you. This fills in as they do."
    )

    /// `RL1D-R3-11`. Browse's category chip is sent to the RPC, so an empty
    /// category returns zero rows through the same branch as an empty
    /// catalogue. `stillChoosingPieces` would then tell a tester who tapped
    /// "Lighting" that her designer has not started, over a catalogue that is
    /// fine. This is the sentence for that case, and it names the way out.
    ///
    /// Wording sent to L1-E as `D→E-3`; the condition that selects it is
    /// L1-D's and ships either way.
    static let noPiecesInThisCategory = PatinaEmptyStateContent(
        icon: "line.3.horizontal.decrease",
        title: "Nothing in this one",
        message: "There is nothing here yet. Try another kind of piece."
    )
}

#Preview {
    VStack(spacing: PatinaSpacing.xxl) {
        PatinaEmptyState(
            icon: "tray",
            title: "Still building the collection",
            message: "New pieces are added by hand — check back soon."
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
