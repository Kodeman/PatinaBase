//
//  StudioHubView.swift
//  Patina
//
//  The client's project work, organized by what state it is in instead of by
//  backend object type.
//

import SwiftUI

struct StudioHubView: View {
    @Environment(\.appCoordinator) private var coordinator
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @State private var authService = AuthService.shared
    @State private var viewModel = StudioHubViewModel.shared

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            header

            if !authService.isAuthenticated {
                guestState
            } else if viewModel.isLoading && !viewModel.hasLoaded {
                loadingState
            } else {
                // L07-05: the staleness line is drawn ABOVE the branch, so it
                // reaches the total-failure shape too. Inside the `else` it was
                // structurally unreachable — the one shape that most needs it —
                // and a warm hub kept printing "5 things need your eye" as
                // current with every section replaced by the error card and
                // nothing anywhere saying when that count was last true.
                if let stalenessLine = viewModel.stalenessLine {
                    StudioHubStalenessLine(text: stalenessLine)
                }

                if viewModel.failedSources.count == 7 {
                    errorState
                } else {
                    if let loadMessage = viewModel.loadMessage {
                        partialLoadNotice(loadMessage)
                    }

                    ForEach(StudioQueueSectionKind.allCases) { kind in
                        sectionCard(viewModel.snapshot.section(kind))
                    }
                }
            }
        }
        // `W2R3-n1`: the hub's number was a load-time snapshot. Keyed on the
        // auth flag alone this re-ran only across a sign-in, so three
        // consecutive Today→Studio re-entries inside one session all read
        // "Ten" while the homeowner's real set had fallen to eight. The key
        // now moves when she ARRIVES here, and the guard is why it does not
        // also refetch eight sources on the way out.
        .task(id: studioEntryKey) {
            guard isOnStudio else { return }
            await viewModel.load()
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("StudioHub")
    }

    /// Whether the Studio is the surface she is looking at. The flag-off root
    /// has no tabs — the hub is pushed there, and mounting is arriving — so it
    /// is always true.
    private var isOnStudio: Bool {
        !coordinator.isHouseFirstRoot || coordinator.tabs.selected == .studio
    }

    /// Four states, not one per tab: switching between two tabs that are not
    /// the Studio does not move it, so nothing re-runs until she comes back.
    private var studioEntryKey: String {
        "\(authService.isAuthenticated)#\(isOnStudio)"
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            MonoLabel(text: "STUDIO", size: PatinaTypography.monoMedium)
                .foregroundStyle(PatinaColors.Text.secondary)
                .accessibilityAddTraits(.isHeader)

            Text("The work around your home, in one place.")
                .font(PatinaTypography.h4)
                .foregroundStyle(PatinaColors.Text.primary)
                .fixedSize(horizontal: false, vertical: true)

            // SP-16: the subhead prints THE attention count, not this
            // screen's own recomputation of it — but `attentionHint` is nil
            // whenever nothing is awaiting, so the rest of the chain still has
            // to answer or a client with three unread threads reads "Nothing
            // needs your attention right now." above a block that says
            // otherwise.
            if let hint = BadgeCountService.shared.studioHint
                ?? viewModel.snapshot.attentionSummary.hint {
                Text(hint)
                    .font(PatinaTypography.bodySmallMedium)
                    .foregroundStyle(PatinaColors.Text.interactive)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityLabel("Studio summary: \(hint)")
            } else if viewModel.hasLoaded && viewModel.failedSources.isEmpty {
                // R-01: `hasLoaded` alone is "a load finished", not "a load
                // answered". A failed refresh leaves every hint nil, so the
                // hub printed "Nothing needs your attention right now."
                // directly above its own "We couldn't gather your Studio"
                // card — an assertion of emptiness on the strength of a
                // request that never landed. Emptiness is only claimable when
                // something actually came back.
                Text("Nothing needs your attention right now.")
                    .font(PatinaTypography.bodySmall)
                    .foregroundStyle(PatinaColors.Text.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private var loadingState: some View {
        HStack(spacing: 12) {
            ProgressView()
                .tint(PatinaColors.Text.interactive)
            Text("Gathering your Studio…")
                .font(PatinaTypography.bodySmall)
                .foregroundStyle(PatinaColors.Text.secondary)
        }
        .frame(maxWidth: .infinity, minHeight: 112)
        .background(PatinaColors.Background.secondary)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Gathering your Studio")
    }

    private var errorState: some View {
        VStack(alignment: .leading, spacing: 12) {
            Image(systemName: "wifi.exclamationmark")
                .font(.system(size: 22, weight: .regular))
                .foregroundStyle(PatinaColors.Text.interactive)
                .accessibilityHidden(true)

            Text(viewModel.loadMessage ?? "We couldn’t gather your Studio.")
                .font(PatinaTypography.bodySmall)
                .foregroundStyle(PatinaColors.Text.primary)
                .fixedSize(horizontal: false, vertical: true)

            Button("Try again") {
                Task { await viewModel.load() }
            }
            .font(PatinaTypography.bodySmallMedium)
            .foregroundStyle(PatinaColors.Text.interactive)
            .frame(minHeight: 44)
            .contentShape(Rectangle())
            .accessibilityHint("Refreshes projects, decisions, conversations, and records.")
            .accessibilityIdentifier("StudioHub.RetryButton")
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(PatinaColors.Background.secondary)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private var guestState: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Your Studio begins with a project.")
                .font(PatinaTypography.bodySmallMedium)
                .foregroundStyle(PatinaColors.Text.primary)

            Text("Sign in to see conversations, decisions, proposals, invoices, and shared files.")
                .font(PatinaTypography.bodySmall)
                .foregroundStyle(PatinaColors.Text.secondary)
                .fixedSize(horizontal: false, vertical: true)

            // B-13: the card used to send a guest to Settings, which then held
            // no sign-in row either — two dead ends pointing at each other.
            // `.auth` presents `AuthSheet`, which dismisses itself the moment a
            // session lands.
            Button("Sign in") {
                coordinator.presentedSheet = .auth
            }
            .font(PatinaTypography.bodySmallMedium)
            .foregroundStyle(PatinaColors.Text.interactive)
            .frame(minHeight: 44)
            .contentShape(Rectangle())
            .accessibilityHint("Opens the sign-in screen.")
            .accessibilityIdentifier("StudioHub.GuestSignInButton")
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(PatinaColors.Background.secondary)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private func partialLoadNotice(_ message: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "exclamationmark.circle")
                .foregroundStyle(PatinaColors.Text.interactive)
                .frame(width: 24, height: 24)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 6) {
                Text(message)
                    .font(PatinaTypography.bodySmall)
                    .foregroundStyle(PatinaColors.Text.primary)
                    .fixedSize(horizontal: false, vertical: true)

                Button("Refresh") {
                    Task { await viewModel.load() }
                }
                .font(PatinaTypography.bodySmallMedium)
                .foregroundStyle(PatinaColors.Text.interactive)
                .frame(minHeight: 44)
                .contentShape(Rectangle())
                .accessibilityIdentifier("StudioHub.PartialRefreshButton")
            }
        }
        .padding(14)
        .background(PatinaColors.clay.opacity(0.12))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .accessibilityElement(children: .contain)
    }

    private func sectionCard(_ section: StudioQueueSection) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            sectionHeader(section)

            Divider()
                .overlay(PatinaColors.Border.hairline)
                .accessibilityHidden(true)

            sectionContent(section)
        }
        .background(PatinaColors.Background.secondary)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(PatinaColors.Border.hairline, lineWidth: 1)
        }
        .accessibilityIdentifier("StudioHub.Section.\(section.kind.rawValue)")
    }

    private func sectionHeader(_ section: StudioQueueSection) -> some View {
        HStack(spacing: 10) {
            Image(systemName: section.kind.systemImage)
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(PatinaColors.Text.interactive)
                .frame(width: 28, height: 28)
                .background(PatinaColors.clay.opacity(0.12))
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                .accessibilityHidden(true)

            Text(section.kind.title)
                .font(PatinaTypography.bodySmallMedium)
                .foregroundStyle(PatinaColors.Text.primary)

            Spacer(minLength: 8)

            // P-24: the hub counts in words. A figure at the end of a row is
            // the count chip the refusals name, whatever it is drawn in.
            Text(PatinaCount.inWords(sectionBadgeCount(section)))
                .font(PatinaTypography.monoLabel)
                .foregroundStyle(PatinaColors.Text.secondary)
                .accessibilityLabel(sectionBadgeLabel(section))
        }
        .padding(14)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
    }

    /// SP-16 named three numbers on one screen, and "Awaiting you 3" under a
    /// header reading "4 things need your eye" was the third. Every other
    /// section badge counts its cards; this one counts the things, because it
    /// is the one the header also speaks for.
    private func sectionBadgeCount(_ section: StudioQueueSection) -> Int {
        section.kind == .awaitingYou
            ? viewModel.snapshot.attentionSummary.awaitingCount
            : section.rows.count
    }

    private func sectionBadgeLabel(_ section: StudioQueueSection) -> String {
        section.kind.badgeLabel(count: sectionBadgeCount(section))
    }

    @ViewBuilder
    private func sectionContent(_ section: StudioQueueSection) -> some View {
        if section.rows.isEmpty {
            Text(section.kind.emptyMessage)
                .font(PatinaTypography.bodySmall)
                .foregroundStyle(PatinaColors.Text.secondary)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, minHeight: 54, alignment: .leading)
                .padding(.horizontal, 14)
                .accessibilityLabel("\(section.kind.title). \(section.kind.emptyMessage)")
        } else {
            ForEach(Array(section.rows.enumerated()), id: \.element.id) { index, row in
                sectionRow(row, kind: section.kind)

                if index < section.rows.count - 1 {
                    Divider()
                        .padding(.leading, 56)
                        .overlay(PatinaColors.Border.hairline)
                        .accessibilityHidden(true)
                }
            }
        }
    }

    private func sectionRow(
        _ row: StudioQueueRow,
        kind: StudioQueueSectionKind
    ) -> some View {
        Button {
            open(row, in: kind)
        } label: {
            rowLabel(row)
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(row.accessibilityLabel)
        .accessibilityHint("Opens \(row.route.displayName).")
        .accessibilityIdentifier("StudioHub.Row.\(row.id)")
    }

    @ViewBuilder
    private func rowLabel(_ row: StudioQueueRow) -> some View {
        if dynamicTypeSize.isAccessibilitySize {
            HStack(alignment: .top, spacing: 12) {
                rowIcon(row)

                VStack(alignment: .leading, spacing: 5) {
                    rowText(row)
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(PatinaColors.Text.interactive)
                        .padding(.top, 2)
                        .accessibilityHidden(true)
                }
                Spacer(minLength: 0)
            }
            .padding(14)
            .frame(maxWidth: .infinity, minHeight: 60, alignment: .leading)
            .contentShape(Rectangle())
        } else {
            HStack(spacing: 12) {
                rowIcon(row)
                rowText(row)
                Spacer(minLength: 8)
                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(PatinaColors.Text.interactive)
                    .accessibilityHidden(true)
            }
            .padding(14)
            .frame(maxWidth: .infinity, minHeight: 60, alignment: .leading)
            .contentShape(Rectangle())
        }
    }

    private func rowIcon(_ row: StudioQueueRow) -> some View {
        Image(systemName: row.systemImage)
            .font(.system(size: 16, weight: .regular))
            .foregroundStyle(PatinaColors.Text.interactive)
            .frame(width: 32, height: 32)
            .accessibilityHidden(true)
    }

    private func rowText(_ row: StudioQueueRow) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(row.title)
                .font(PatinaTypography.bodySmallMedium)
                .foregroundStyle(PatinaColors.Text.primary)
                .fixedSize(horizontal: false, vertical: true)

            Text(row.detail)
                .font(PatinaTypography.bodySmall)
                .foregroundStyle(PatinaColors.Text.secondary)
                .fixedSize(horizontal: false, vertical: true)

            if let meta = row.meta {
                Text(meta)
                    .font(PatinaTypography.monoLabel)
                    .foregroundStyle(PatinaColors.Text.interactive)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private func open(_ row: StudioQueueRow, in section: StudioQueueSectionKind) {
        SessionMetricsService.shared.recordInteraction()
        PostHogService.shared.capture(
            "studio_queue_item_activated",
            properties: [
                "section": section.rawValue,
                "destination": row.route.analyticsScreenName
            ]
        )
        coordinator.navigate(to: row.route)
    }
}

/// `L07-05` (note O12): what the reader is looking at, while the notice above
/// says what went wrong. A sentence by ruling — never a dot, never a badge.
/// It sits outside `StudioHubView` so the view's body stays inside SwiftLint's
/// `type_body_length` ceiling.
private struct StudioHubStalenessLine: View {
    let text: String

    var body: some View {
        Text(text)
            .font(PatinaTypography.bodySmall)
            .foregroundStyle(PatinaColors.Text.secondary)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityIdentifier("StudioHub.StalenessLine")
    }
}
