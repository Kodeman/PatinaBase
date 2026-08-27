//
//  ProjectMessageDesignerLink.swift
//  Patina
//
//  SP-13: the one act a client wants on a project they can otherwise only
//  read. Its own file because ProjectDetailView is already at the file-length
//  ceiling.
//

import SwiftUI

/// Opens (or creates) the project's group thread and pushes it.
struct ProjectMessageDesignerLink: View {
    let projectId: String
    @Environment(\.appCoordinator) private var coordinator
    @State private var isOpening = false
    @State private var failed = false

    var body: some View {
        Button {
            open()
        } label: {
            HStack(spacing: 12) {
                Image(systemName: "bubble.left.and.bubble.right")
                    .font(PatinaTypography.uiSmall)
                    .foregroundStyle(PatinaColors.Text.interactive)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Message your designer")
                        .font(PatinaTypography.bodySmallMedium)
                        .foregroundStyle(PatinaColors.Text.primary)
                    Text(failed
                         ? "That didn\u{2019}t go through. Try again."
                         : "Ask a question about this project")
                        .font(PatinaTypography.caption)
                        .foregroundStyle(PatinaColors.Text.muted)
                }
                Spacer()
                if isOpening {
                    ProgressView().tint(PatinaColors.Text.interactive)
                } else {
                    Image(systemName: "chevron.right")
                        .font(PatinaTypography.uiSmall)
                        .foregroundStyle(PatinaColors.Text.muted)
                }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(PatinaColors.Background.secondary)
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(isOpening)
        .padding(.horizontal, 24)
        .accessibilityIdentifier("projectDetail.messageDesigner")
    }

    private func open() {
        guard !isOpening else { return }
        isOpening = true
        failed = false
        Task {
            do {
                let threadId = try await MessagingAPIClient.shared.createThread(projectId: projectId)
                isOpening = false
                coordinator.navigate(to: .threadDetail(threadId: threadId))
            } catch {
                // C5: never render a vendor error to a homeowner.
                PatinaLog.ui.debug("[Messaging] open project thread failed: \(error.localizedDescription)")
                isOpening = false
                failed = true
            }
        }
    }
}
