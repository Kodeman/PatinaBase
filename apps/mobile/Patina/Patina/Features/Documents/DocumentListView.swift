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
        .overlay(alignment: .topLeading) {
            BackChevronButton(style: .light) { coordinator.goBack() }
                .padding(.top, 8)
                .padding(.leading, 18)
        }
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
            ProgressView()
                .tint(PatinaColors.Text.interactive)
                .padding(.top, 60)
                .frame(maxWidth: .infinity)
        } else if let error = viewModel.error, viewModel.isEmpty {
            errorView(error)
        } else if viewModel.isEmpty {
            emptyView
        } else {
            ForEach(viewModel.groups) { group in
                DocumentGroupSection(group: group, viewModel: viewModel)
            }
        }
    }

    private var emptyView: some View {
        VStack(spacing: 8) {
            Image(systemName: "folder")
                .font(.system(size: 28))
                .foregroundStyle(PatinaColors.sage)
            Text("No documents yet")
                .font(PatinaTypography.bodySmall)
                .foregroundStyle(PatinaColors.Text.secondary)
            Text("Contracts, drawings, and other files your designer shares will appear here.")
                .font(PatinaTypography.caption)
                .foregroundStyle(PatinaColors.Text.muted)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)
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
                        Rectangle().fill(PatinaColors.pearl).frame(height: 1)
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
        .accessibilityLabel("\(document.resolvedTitle), \(document.kindLabel)")
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
