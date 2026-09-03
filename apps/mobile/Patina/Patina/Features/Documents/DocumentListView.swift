//
//  DocumentListView.swift
//  Patina
//
//  Wave 3 / D.4: the client documents list — contracts, drawings, and files
//  the designer has shared, grouped by project (newest first). Tap a row to
//  download + preview in QuickLook. Mirrors the client portal /documents page.
//

import SwiftUI

struct DocumentListView: View {
    @Environment(\.appCoordinator) private var coordinator
    @State private var viewModel = DocumentListViewModel()

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 24) {
                header
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
        .fullScreenCover(item: $viewModel.previewURL) { item in
            DocumentQuickLook(fileURL: item.url) {
                viewModel.previewURL = nil
            }
            .ignoresSafeArea()
        }
        .alert(
            "Couldn't open this file",
            isPresented: Binding(
                get: { viewModel.openError != nil },
                set: { if !$0 { viewModel.openError = nil } }
            )
        ) {
            Button("OK", role: .cancel) { viewModel.openError = nil }
        } message: {
            Text(viewModel.openError ?? "Please try again.")
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            MonoLabel(text: "DOCUMENTS", tracking: 2)
            Text("Shared with you")
                .font(PatinaTypography.h3)
                .foregroundStyle(PatinaColors.Text.primary)
        }
        .padding(.top, 56)
        .padding(.horizontal, 24)
    }

    @ViewBuilder
    private var content: some View {
        if viewModel.isLoading && viewModel.isEmpty {
            PatinaLoadingState()
                .padding(.top, 60)
        } else if let error = viewModel.error, viewModel.isEmpty {
            PatinaErrorState(message: error, action: { Task { await viewModel.load() } })
                .padding(.top, 60)
        } else if viewModel.isEmpty {
            emptyView
        } else {
            ForEach(viewModel.groups) { group in
                DocumentGroupSection(group: group, viewModel: viewModel)
            }
        }
    }

    /// U22: names the surface, names the trigger, and offers the one CTA
    /// that actually unblocks it — track an in-flight request if one
    /// exists, otherwise start one.
    private var emptyView: some View {
        PatinaEmptyState(
            icon: "folder",
            title: "No documents yet",
            message: "Contracts, drawings, and files your designer shares land here.",
            ctaTitle: studioCTATitle,
            ctaAction: presentStudioCTA
        )
        .padding(.top, 80)
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

// MARK: - Group section

private struct DocumentGroupSection: View {
    let group: DocumentProjectGroup
    let viewModel: DocumentListViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(group.projectName)
                .font(PatinaTypography.h5)
                .foregroundStyle(PatinaColors.Text.primary)
                .padding(.horizontal, 24)

            VStack(spacing: 0) {
                ForEach(Array(group.documents.enumerated()), id: \.element.id) { index, document in
                    Button { viewModel.open(document) } label: {
                        DocumentRow(document: document, isDownloading: viewModel.isDownloading(document))
                    }
                    .buttonStyle(.plain)
                    .disabled(viewModel.downloadingDocumentId != nil)
                    if index < group.documents.count - 1 {
                        Rectangle().fill(PatinaColors.Border.hairline).frame(height: 1)
                    }
                }
            }
            .background(PatinaColors.Background.secondary)
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .padding(.horizontal, 24)
        }
    }
}

// MARK: - Row

private struct DocumentRow: View {
    let document: RemoteProjectDocument
    let isDownloading: Bool

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: document.systemIcon)
                .font(PatinaTypography.uiAction)
                .foregroundStyle(PatinaColors.Text.interactive)
                .frame(width: 34, height: 34)
                .background(PatinaColors.clay.opacity(0.12))
                .clipShape(RoundedRectangle(cornerRadius: 8))

            VStack(alignment: .leading, spacing: 2) {
                Text(document.resolvedTitle)
                    .font(PatinaTypography.bodySmallMedium)
                    .foregroundStyle(PatinaColors.Text.primary)
                    .lineLimit(2)
                Text(metaLine)
                    .font(PatinaTypography.caption)
                    .foregroundStyle(PatinaColors.Text.muted)
            }

            Spacer(minLength: 8)

            if isDownloading {
                ProgressView()
                    .tint(PatinaColors.Text.interactive)
            } else {
                Image(systemName: "arrow.down.circle")
                    .font(PatinaTypography.uiSmall)
                    .foregroundStyle(PatinaColors.Text.muted)
            }
        }
        .padding(14)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityLabel(
            isDownloading
                ? "\(document.resolvedTitle), \(document.kindLabel), Downloading"
                : "\(document.resolvedTitle), \(document.kindLabel)"
        )
        .accessibilityHint("Downloads and opens the document.")
    }

    private var metaLine: String {
        var parts: [String] = [document.kindLabel]
        if let created = document.created_at {
            parts.append(DateDisplay.fromTimestamp(created))
        }
        if let size = document.sizeText {
            parts.append(size)
        }
        return parts.joined(separator: " · ")
    }
}

#Preview {
    NavigationStack {
        DocumentListView()
            .environment(\.appCoordinator, AppCoordinator())
    }
}
