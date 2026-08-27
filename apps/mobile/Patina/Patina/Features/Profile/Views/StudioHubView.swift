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
            } else if viewModel.failedSources.count == 7 {
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
        .task(id: authService.isAuthenticated) {
            await viewModel.load()
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("StudioHub")
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
            } else if viewModel.hasLoaded {
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

            Button("Open settings") {
                coordinator.presentedSheet = .settings
            }
            .font(PatinaTypography.bodySmallMedium)
            .foregroundStyle(PatinaColors.Text.interactive)
            .frame(minHeight: 44)
            .contentShape(Rectangle())
            .accessibilityHint("Opens account settings where you can sign in.")
            .accessibilityIdentifier("StudioHub.GuestSettingsButton")
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
                .overlay(PatinaColors.pearl)
                .accessibilityHidden(true)

            sectionContent(section)
        }
        .background(PatinaColors.Background.secondary)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(PatinaColors.pearl, lineWidth: 1)
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

            Text("\(sectionBadgeCount(section))")
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
        section.kind == .awaitingYou
            ? "\(sectionBadgeCount(section)) things awaiting you"
            : "\(section.rows.count) categories"
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
                        .overlay(PatinaColors.pearl)
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
