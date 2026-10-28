//
//  ServiceAcceptanceEntry.swift
//  Patina
//
//  US-52 WP-10C-d. The agreed-services requests waiting on this household,
//  drawn above the decision list and kept apart from it: the approvals list
//  and its decoder never see a service row (C4 §2.10, X08). Draws nothing
//  when there is nothing open, or when the read fails.
//

import SwiftUI

struct ServiceAcceptanceEntry: View {
    @State private var model = ServiceAcceptanceModel()
    @State private var presentedId: String?

    var body: some View {
        Group {
            if !model.openRequests.isEmpty {
                VStack(spacing: 12) {
                    ForEach(model.openRequests) { request in
                        Button {
                            presentedId = request.requestId
                        } label: {
                            card(request)
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("serviceAcceptance.entry.\(request.requestId)")
                    }
                }
                .padding(.horizontal, 24)
                .padding(.top, 12)
            }
        }
        .task { await model.load() }
        .sheet(item: Binding(
            get: { presentedId.map(PresentedRequest.init) },
            set: { presentedId = $0?.id }
        )) { presented in
            ServiceAcceptanceDetailView(model: model, requestId: presented.id)
        }
    }

    private func card(_ request: RemoteServiceAcceptanceRequest) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            MonoLabel(text: ServiceAcceptanceCopy.eyebrow)
                .tracking(2)
            Text(ServiceAcceptanceCopy.entryTitle)
                .font(PatinaTypography.h5)
                .foregroundStyle(PatinaColors.Text.primary)
                .fixedSize(horizontal: false, vertical: true)
            if let project = projectName(request) {
                Text(project)
                    .font(PatinaTypography.caption)
                    .foregroundStyle(PatinaColors.Text.muted)
            }
            Text(ServiceAcceptanceCopy.status(request))
                .font(PatinaTypography.captionSmall)
                .foregroundStyle(
                    request.canRespond ? PatinaColors.Text.primary : PatinaColors.Text.muted
                )
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(PatinaColors.Background.secondary)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .accessibilityElement(children: .combine)
    }

    /// The projection carries no project name; the projects the rail has
    /// already fetched do, matched on its `projectId`.
    private func projectName(_ request: RemoteServiceAcceptanceRequest) -> String? {
        let name = BadgeCountService.shared.projects.first { $0.id == request.projectId }?.name
        return (name?.isEmpty ?? true) ? nil : name
    }
}

/// `.sheet(item:)` wants an `Identifiable`; the request id is the identity.
private struct PresentedRequest: Identifiable {
    let id: String
}
