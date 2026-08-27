//
//  ThreadListView.swift
//  Patina
//
//  Inbox of human↔human conversations. Rows show who the conversation
//  is with (counterpart name for direct threads, project name for
//  project threads), a last-message preview, a compact relative time,
//  and an unread dot (R19).
//

import SwiftUI

struct ThreadListView: View {
    @Environment(\.appCoordinator) private var coordinator
    @State private var viewModel = ThreadListViewModel()
    /// R26: inline thread filter. The screen hides the navigation bar (custom
    /// header + pinned back chevron), so `.searchable` has nowhere to render —
    /// a lightweight Patina-styled search field stands in for it.
    @State private var searchText: String = ""
    /// SP-13 compose state for the empty view's "Message your designer".
    @State private var isOpeningThread = false
    @State private var openThreadFailed = false

    /// Threads matching the search text against the resolved title + preview.
    private var filteredItems: [ThreadListItem] {
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else { return viewModel.items }
        return viewModel.items.filter {
            $0.title.localizedCaseInsensitiveContains(query)
                || $0.preview.localizedCaseInsensitiveContains(query)
        }
    }

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 14) {
                header
                if !viewModel.items.isEmpty {
                    searchField
                        .padding(.horizontal, 24)
                }
                content
            }
            .padding(.bottom, 120)
        }
        .background(PatinaColors.Background.primary)
        // U18: standard pushed-screen chrome — the header above carries
        // the title, so the chrome adds only the back chevron.
        .patinaScreen(title: nil)
        .task { await viewModel.load() }
        .refreshable { await viewModel.load() }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            MonoLabel(text: "MESSAGES")
                .tracking(2)
            // U22: kept static — the empty case names itself in the
            // PatinaEmptyState below; repeating that exact line here doubled
            // the same sentence on an empty Studio.
            Text("Conversations")
                .font(PatinaTypography.h3)
                .foregroundStyle(PatinaColors.Text.primary)
        }
        .padding(.top, 56)
        .padding(.horizontal, 24)
    }

    @ViewBuilder
    private var content: some View {
        if viewModel.isLoading && viewModel.items.isEmpty {
            PatinaLoadingState()
                .padding(.top, 60)
        } else if let error = viewModel.error, viewModel.items.isEmpty {
            PatinaErrorState(message: error, action: { Task { await viewModel.load() } })
                .padding(.top, 60)
        } else if viewModel.items.isEmpty {
            emptyView
        } else if filteredItems.isEmpty {
            noMatchesView
        } else {
            VStack(spacing: 0) {
                ForEach(filteredItems) { item in
                    Button {
                        coordinator.navigate(to: .threadDetail(threadId: item.id))
                    } label: {
                        threadRow(item)
                    }
                    .buttonStyle(.plain)
                }
            }
            .background(PatinaColors.Background.secondary)
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .padding(.horizontal, 24)
            .padding(.top, 8)
        }
    }

    /// Patina-styled inline search field (stands in for `.searchable`,
    /// which needs the hidden navigation bar to render).
    private var searchField: some View {
        HStack(spacing: PatinaSpacing.sm) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 14))
                .foregroundStyle(PatinaColors.Text.muted)
            TextField("Search conversations", text: $searchText)
                .font(PatinaTypography.bodySmall)
                .foregroundStyle(PatinaColors.Text.primary)
                .autocorrectionDisabled()
                .submitLabel(.search)
            if !searchText.isEmpty {
                Button { searchText = "" } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 14))
                        .foregroundStyle(PatinaColors.Text.muted)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Clear search")
            }
        }
        .padding(.horizontal, PatinaSpacing.xsm)
        .frame(height: 40)
        .background(
            RoundedRectangle(cornerRadius: PatinaRadius.lg, style: .continuous)
                .fill(PatinaColors.Background.secondary)
        )
        .overlay(
            RoundedRectangle(cornerRadius: PatinaRadius.lg, style: .continuous)
                .stroke(PatinaColors.pearl, lineWidth: 1)
        )
        .accessibilityLabel("Search conversations")
    }

    private var noMatchesView: some View {
        VStack(spacing: PatinaSpacing.sm) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 28))
                .foregroundStyle(PatinaColors.Text.muted)
            Text("No conversations match \u{201C}\(searchText)\u{201D}")
                .font(PatinaTypography.bodySmall)
                .foregroundStyle(PatinaColors.Text.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 60)
    }

    private func threadRow(_ item: ThreadListItem) -> some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(item.title)
                    .font(item.isUnread ? PatinaTypography.bodySmallMedium : PatinaTypography.bodySmall)
                    .foregroundStyle(PatinaColors.Text.primary)
                    .lineLimit(1)
                Text(item.preview)
                    .font(PatinaTypography.caption)
                    .foregroundStyle(PatinaColors.Text.muted)
                    .lineLimit(1)
            }
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 6) {
                if let time = item.timeLabel {
                    MonoLabel(text: time, size: PatinaTypography.monoLabel, uppercase: false)
                }
                if item.isUnread {
                    Circle()
                        .fill(PatinaColors.clay)
                        .frame(width: 8, height: 8)
                }
            }
        }
        .padding(.vertical, 14)
        .padding(.horizontal, 16)
        .contentShape(Rectangle())
        .overlay(alignment: .bottom) {
            Rectangle().fill(PatinaColors.pearl).frame(height: 1)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(item.accessibilityLabel)
    }

    /// U22 + SP-13: names the surface, names the trigger, and offers the one
    /// CTA that actually unblocks it. Once a designer is on the job that CTA
    /// is the conversation itself — the Studio's Conversation block routes
    /// here at zero threads, so this is where the compose act lives.
    private var emptyView: some View {
        PatinaEmptyState(
            icon: "bubble.left.and.bubble.right",
            title: "No conversations yet",
            message: "Messages with your designer land here once you're working together.",
            ctaTitle: isOpeningThread ? "Opening\u{2026}" : emptyCTATitle,
            ctaAction: performEmptyCTA
        )
        .padding(.top, 80)
    }

    /// The live designer relationship, resolved from the same services the
    /// Companion reads.
    private var designerRelationship: DesignerRelationship {
        DesignerRelationshipResolver.resolve(
            promotedRequest: DesignRequestStatusService.shared.promotedRequest,
            projects: BadgeCountService.shared.projects,
            roster: BadgeCountService.shared.roster
        )
    }

    private var emptyCTATitle: String {
        openThreadFailed
            ? "That didn\u{2019}t go through. Try again."
            : (designerRelationship.isLive ? "Message your designer" : studioCTATitle)
    }

    private func performEmptyCTA() {
        let relationship = designerRelationship
        guard relationship.isLive else {
            presentStudioCTA()
            return
        }
        openThread(with: relationship)
    }

    /// A project thread where there is a project, a direct thread where the
    /// client is matched but has none yet. Both RPCs are idempotent.
    private func openThread(with relationship: DesignerRelationship) {
        guard !isOpeningThread else { return }
        isOpeningThread = true
        openThreadFailed = false
        Task {
            do {
                let threadId: String
                switch relationship {
                case let .project(projectId, _, _):
                    threadId = try await MessagingAPIClient.shared
                        .createThread(projectId: projectId.uuidString)
                case let .lead(_, designerId, _):
                    threadId = try await MessagingAPIClient.shared
                        .createDirectThread(counterpart: designerId)
                case .none, .roster:
                    isOpeningThread = false
                    return
                }
                isOpeningThread = false
                coordinator.navigate(to: .threadDetail(threadId: threadId))
            } catch {
                // C5: never render a vendor error to a homeowner.
                PatinaLog.ui.debug("[Messaging] open thread failed: \(error.localizedDescription)")
                isOpeningThread = false
                openThreadFailed = true
            }
        }
    }

    private var studioCTATitle: String {
        DesignRequestStatusService.shared.promotedRequest != nil ? "Track your request" : "Get design help"
    }

    private func presentStudioCTA() {
        if DesignRequestStatusService.shared.promotedRequest != nil {
            coordinator.navigate(to: .designRequests(focusLeadId: nil))
        } else {
            coordinator.navigate(to: .designerConsultation)
        }
    }
}

#Preview {
    NavigationStack {
        ThreadListView()
            .environment(\.appCoordinator, AppCoordinator())
    }
}
