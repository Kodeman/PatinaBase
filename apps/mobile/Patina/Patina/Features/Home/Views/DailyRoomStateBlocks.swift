//
//  DailyRoomStateBlocks.swift
//  Patina
//
//  The states the Daily Room can be in besides "here are your picks":
//  the tier-gated studio block, a filter that matched nothing, and a story
//  that failed to arrive. Extracted from `DailyRoomView` so each state is
//  legible on its own — and so the one invariant that matters (an
//  unresolved tier NEVER renders the designer pitch) lives somewhere small
//  enough to check at a glance.
//

import SwiftUI

// MARK: - Studio block (U19 / U24 / U45)

/// The tier-gated bottom of the home surface.
///
/// - `.known(.discovering)`: the designer bridge plus the narration line that
///   names what engaging a designer opens.
/// - `.known(tier)`: the Studio hub (which filters its own rows by tier) plus
///   the marketplace block, so hiring a designer never closes the shop.
/// - `.unknown`: a skeleton, or a retry when the badge refresh outright
///   failed. Never the discovering pitch — see `EngagementTierState`.
struct HomeStudioBlock: View {
    let state: EngagementTierState
    let unreadNotifications: Int
    let roomCount: Int

    @Environment(\.appCoordinator) private var coordinator

    var body: some View {
        switch state {
        case .known(.discovering):
            discoveringBlock

        case .known(let tier):
            StudioHubSection(
                unreadNotifications: unreadNotifications,
                roomCount: roomCount,
                tier: tier
            )
            MarketplaceLinksSection()

        case .unknown:
            if BadgeCountService.shared.lastRefreshFailed {
                PatinaErrorState(
                    message: "We couldn't reach your studio.",
                    action: {
                        Task { await BadgeCountService.shared.refresh() }
                        Task { await DesignRequestStatusService.shared.refresh() }
                    }
                )
                .padding(.horizontal, 20)
                .padding(.top, 28)
            } else {
                skeleton
            }
        }
    }

    private var discoveringBlock: some View {
        VStack(alignment: .leading, spacing: 10) {
            WorkWithDesignerCTA(
                onWorkWithDesigner: { coordinator.navigate(to: .designerConsultation) },
                onBrowse: { coordinator.navigate(to: .emergence(pieceId: nil)) },
                onSaved: { coordinator.navigate(to: .table) }
            )

            // U19: the CTA asked for a commitment without saying what it
            // buys. This names the surfaces the relationship unlocks.
            Text("Your Studio — projects, messages, invoices — opens when you start with a designer.")
                .font(PatinaTypography.monoLabel)
                .tracking(0.4)
                .textCase(.uppercase)
                .foregroundStyle(PatinaColors.Text.muted)
                .lineSpacing(2)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, 4)
        }
        .padding(.horizontal, 20)
        .padding(.top, 20)
    }

    /// Placeholder for the studio block while the tier is still resolving.
    /// Redacted rather than absent so the home doesn't jump when the real
    /// rows land.
    private var skeleton: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Studio")
                .font(PatinaTypography.monoMedium)
                .tracking(1)
                .textCase(.uppercase)
                .foregroundStyle(PatinaColors.Text.muted)

            ForEach(0..<3, id: \.self) { _ in
                VStack(alignment: .leading, spacing: 4) {
                    Text("Placeholder row")
                        .font(PatinaTypography.h5)
                        .foregroundStyle(PatinaColors.Text.primary)
                    Text("Placeholder meta line")
                        .font(PatinaTypography.monoLabel)
                        .foregroundStyle(PatinaColors.Text.muted)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .frame(height: 140, alignment: .top)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 20)
        .padding(.top, 20)
        .redacted(reason: .placeholder)
        .accessibilityHidden(true)
    }
}

// MARK: - Filtered-empty feed (U03)

/// The active category filter matched nothing in a non-empty feed. Names the
/// filter and offers the one-tap way back to everything; the chips stay
/// mounted above, so the way out is where the user already is.
struct HomeFilteredFeedEmpty: View {
    let filterLabel: String
    let onShowAll: () -> Void

    var body: some View {
        VStack(spacing: PatinaSpacing.xs) {
            Text("Nothing in \(filterLabel) for this room yet.")
                .font(PatinaTypography.bodySmall)
                .foregroundStyle(PatinaColors.Text.muted)
                .multilineTextAlignment(.center)

            Button(action: onShowAll) {
                Text("Show all")
                    .font(PatinaTypography.bodySmallMedium)
                    .foregroundStyle(PatinaColors.Text.interactive)
                    .frame(minHeight: 36)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityHint("Clears the category filter.")
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 20)
        .padding(.top, 24)
    }
}

// MARK: - Story retry (U29)

/// Today's editorial story failed to load. A slim retry in the story slot —
/// the alternative was an unexplained gap where the hero belongs.
struct HomeStoryRetryRow: View {
    let onRetry: () -> Void

    var body: some View {
        HStack(spacing: PatinaSpacing.sm) {
            Text("Today's story couldn't load")
                .font(PatinaTypography.bodySmall)
                .foregroundStyle(PatinaColors.Text.muted)

            Spacer(minLength: PatinaSpacing.xs)

            Button(action: onRetry) {
                Text("Let's try that again")
                    .font(PatinaTypography.bodySmallMedium)
                    .foregroundStyle(PatinaColors.Text.interactive)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
        .frame(minHeight: 44)
        .padding(.horizontal, 20)
        .padding(.top, 14)
    }
}

#Preview("Discovering") {
    ScrollView {
        HomeStudioBlock(state: .known(.discovering), unreadNotifications: 0, roomCount: 1)
            .environment(\.appCoordinator, AppCoordinator())
    }
    .background(PatinaColors.Background.primary)
}

#Preview("Unknown — skeleton") {
    ScrollView {
        HomeStudioBlock(state: .unknown, unreadNotifications: 0, roomCount: 1)
            .environment(\.appCoordinator, AppCoordinator())
    }
    .background(PatinaColors.Background.primary)
}

#Preview("Filtered empty + story retry") {
    VStack(spacing: 32) {
        HomeFilteredFeedEmpty(filterLabel: "Seating", onShowAll: {})
        HomeStoryRetryRow(onRetry: {})
    }
    .background(PatinaColors.Background.primary)
}
