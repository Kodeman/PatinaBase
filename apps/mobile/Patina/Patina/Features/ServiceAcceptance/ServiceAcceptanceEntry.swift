//
//  ServiceAcceptanceEntry.swift
//  Patina
//
//  US-52 WP-10C-d. The agreed-services requests sent to this household,
//  drawn above the decision list and kept apart from it: the approvals list
//  and its decoder never see a service row (C4 §2.10, X08). Open requests
//  are cards; withdrawn, superseded and decided ones stay readable under
//  Past requests. A first read in flight or failed says so, with a retry,
//  rather than looking like no request. Draws nothing only after a good
//  read finds none.
//

import SwiftUI

struct ServiceAcceptanceEntry: View {
    /// Owned by the list, so its pull-to-refresh reloads this read too.
    @Bindable var model: ServiceAcceptanceModel

    var body: some View {
        content
            .task { await model.load() }
            .sheet(item: Binding(
                get: { model.presentedRequestId.map(PresentedRequest.init) },
                set: { model.presentedRequestId = $0?.id }
            )) { _ in
                ServiceAcceptanceDetailView(model: model)
            }
    }

    @ViewBuilder
    private var content: some View {
        switch model.entryState {
        case .loading:
            HStack(spacing: 10) {
                ProgressView()
                Text(ServiceAcceptanceCopy.loading)
                    .font(PatinaTypography.caption)
                    .foregroundStyle(PatinaColors.Text.muted)
            }
            .padding(.horizontal, 24)
            .padding(.top, 12)
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("serviceAcceptance.entry.loading")
        case .firstLoadFailed:
            failure(ServiceAcceptanceCopy.loadFailed)
                .padding(.horizontal, 24)
                .padding(.top, 12)
        case .empty:
            EmptyView()
        case .loaded(let refreshFailed):
            VStack(alignment: .leading, spacing: 12) {
                if refreshFailed { failure(ServiceAcceptanceCopy.refreshFailed) }
                ForEach(model.openRequests) { request in
                    cardButton(request)
                }
                if !model.pastRequests.isEmpty {
                    DisclosureGroup {
                        VStack(spacing: 12) {
                            ForEach(model.pastRequests) { request in
                                cardButton(request)
                            }
                        }
                        .padding(.top, 8)
                    } label: {
                        MonoLabel(text: "\(ServiceAcceptanceCopy.pastRequests) · \(model.pastRequests.count)")
                    }
                    .tint(PatinaColors.Text.primary)
                    .accessibilityIdentifier("serviceAcceptance.entry.past")
                }
            }
            .padding(.horizontal, 24)
            .padding(.top, 12)
        }
    }

    private func failure(_ message: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(message)
                .font(PatinaTypography.caption)
                .foregroundStyle(PatinaColors.Text.secondary)
                .fixedSize(horizontal: false, vertical: true)
            Button(ServiceAcceptanceCopy.tryAgain) { Task { await model.load() } }
                .font(PatinaTypography.bodySmallMedium)
                .foregroundStyle(PatinaColors.Text.interactive)
                .disabled(model.isLoading)
                .accessibilityIdentifier("serviceAcceptance.entry.retry")
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityIdentifier("serviceAcceptance.entry.failed")
    }

    private func cardButton(_ request: RemoteServiceAcceptanceRequest) -> some View {
        Button {
            model.presentedRequestId = request.requestId
        } label: {
            card(request)
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("serviceAcceptance.entry.\(request.requestId)")
    }

    private func card(_ request: RemoteServiceAcceptanceRequest) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            MonoLabel(text: ServiceAcceptanceCopy.eyebrow)
                .tracking(2)
            Text(request.isOpen ? ServiceAcceptanceCopy.entryTitle
                 : ServiceAcceptanceCopy.requestNumber(request.requestNumber))
                .font(PatinaTypography.h5)
                .foregroundStyle(PatinaColors.Text.primary)
                .fixedSize(horizontal: false, vertical: true)
            if let project = projectName(request) {
                Text(project)
                    .font(PatinaTypography.caption)
                    .foregroundStyle(PatinaColors.Text.muted)
            }
            Text(ServiceAcceptanceCopy.status(request, settled: model.settlement(for: request)))
                .font(PatinaTypography.captionSmall)
                .foregroundStyle(
                    model.canRespond(request) ? PatinaColors.Text.primary : PatinaColors.Text.muted
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
