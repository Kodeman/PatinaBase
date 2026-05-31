//
//  ThreadListView.swift
//  Patina
//
//  Inbox of human↔human conversations.
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
        .background(PatinaColors.offWhite)
        .task { await viewModel.load() }
        .refreshable { await viewModel.load() }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            MonoLabel(text: "MESSAGES")
                .tracking(2)
            Text(viewModel.threads.isEmpty ? "No conversations yet" : "Conversations")
                .font(PatinaTypography.h3)
                .foregroundStyle(PatinaColors.charcoal)
        }
        .padding(.top, 56)
        .padding(.horizontal, 24)
    }

    @ViewBuilder
    private var content: some View {
        if viewModel.isLoading && viewModel.threads.isEmpty {
            ProgressView()
                .tint(PatinaColors.clay)
                .padding(.top, 60)
                .frame(maxWidth: .infinity)
        } else if let error = viewModel.error, viewModel.threads.isEmpty {
            errorView(error)
        } else if viewModel.threads.isEmpty {
            emptyView
        } else {
            VStack(spacing: 0) {
                ForEach(viewModel.threads) { thread in
                    Button {
                        coordinator.navigate(to: .threadDetail(threadId: thread.id))
                    } label: {
                        threadRow(thread)
                    }
                    .buttonStyle(.plain)
                }
            }
            .background(PatinaColors.softCream)
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .padding(.horizontal, 24)
            .padding(.top, 8)
        }
    }

    private func threadRow(_ thread: RemoteCommsThread) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text(thread.title ?? thread.kind.capitalized)
                    .font(PatinaTypography.bodySmallMedium)
                    .foregroundStyle(PatinaColors.charcoal)
                Text(thread.last_message_at ?? "—")
                    .font(PatinaTypography.monoTiny)
                    .foregroundStyle(PatinaColors.agedOak)
            }
            Spacer()
            Image(systemName: "chevron.right")
                .font(.system(size: 12))
                .foregroundStyle(PatinaColors.agedOak)
        }
        .padding(.vertical, 14)
        .padding(.horizontal, 16)
        .overlay(alignment: .bottom) {
            Rectangle().fill(PatinaColors.pearl).frame(height: 1)
        }
    }

    private var emptyView: some View {
        VStack(spacing: 8) {
            Image(systemName: "bubble.left.and.bubble.right")
                .font(.system(size: 28))
                .foregroundStyle(PatinaColors.agedOak)
            Text("Start a project to begin messaging")
                .font(PatinaTypography.bodySmall)
                .foregroundStyle(PatinaColors.mocha)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 80)
    }

    private func errorView(_ msg: String) -> some View {
        VStack(spacing: 10) {
            Text(msg)
                .font(PatinaTypography.bodySmall)
                .foregroundStyle(PatinaColors.mocha)
            Button("Try Again") { Task { await viewModel.load() } }
                .font(PatinaTypography.bodySmallMedium)
                .foregroundStyle(PatinaColors.clay)
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
