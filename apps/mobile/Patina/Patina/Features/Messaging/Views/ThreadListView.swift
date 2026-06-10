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

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 14) {
                header
                content
            }
            .padding(.bottom, 120)
        }
        .background(PatinaColors.Background.primary)
        // R04: nav bar is hidden for this destination — pin a back
        // affordance over the scroll content (matches RoomProjectView).
        .overlay(alignment: .topLeading) {
            BackChevronButton(style: .light) { coordinator.goBack() }
                .padding(.top, 8)
                .padding(.leading, 18)
        }
        .task { await viewModel.load() }
        .refreshable { await viewModel.load() }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            MonoLabel(text: "MESSAGES")
                .tracking(2)
            Text(viewModel.items.isEmpty ? "No conversations yet" : "Conversations")
                .font(PatinaTypography.h3)
                .foregroundStyle(PatinaColors.Text.primary)
        }
        .padding(.top, 56)
        .padding(.horizontal, 24)
    }

    @ViewBuilder
    private var content: some View {
        if viewModel.isLoading && viewModel.items.isEmpty {
            ProgressView()
                .tint(PatinaColors.Text.interactive)
                .padding(.top, 60)
                .frame(maxWidth: .infinity)
        } else if let error = viewModel.error, viewModel.items.isEmpty {
            errorView(error)
        } else if viewModel.items.isEmpty {
            emptyView
        } else {
            VStack(spacing: 0) {
                ForEach(viewModel.items) { item in
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

    private var emptyView: some View {
        VStack(spacing: 8) {
            Image(systemName: "bubble.left.and.bubble.right")
                .font(.system(size: 28))
                .foregroundStyle(PatinaColors.Text.muted)
            Text("Start a project to begin messaging")
                .font(PatinaTypography.bodySmall)
                .foregroundStyle(PatinaColors.Text.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 80)
    }

    private func errorView(_ msg: String) -> some View {
        VStack(spacing: 10) {
            Text(msg)
                .font(PatinaTypography.bodySmall)
                .foregroundStyle(PatinaColors.Text.secondary)
            Button("Let's try that again") { Task { await viewModel.load() } }
                .font(PatinaTypography.bodySmallMedium)
                .foregroundStyle(PatinaColors.Text.interactive)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 60)
    }
}

#Preview {
    NavigationStack {
        ThreadListView()
            .environment(\.appCoordinator, AppCoordinator())
    }
}
