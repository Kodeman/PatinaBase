//  LeadListScreen.swift
//  Capture · Wave L (Leads)
//
//  L1 · open leads (route `.leadList`, id `l1LeadList`). Newest-first list —
//  client name, source chip, relative age, budget when present. Read-only v1:
//  no status transitions (triage happens on the web portal). Row -> L2.

import SwiftUI
import CaptureKit

@MainActor
@Observable
final class LeadListModel {
    private let service: any LeadsService
    private let analytics: any CaptureAnalytics
    let coordinator: CaptureCoordinator

    private(set) var leads: [FieldLead] = []
    private(set) var isLoading = false
    private(set) var errorMessage: String?

    init(container: AppContainer, coordinator: CaptureCoordinator) {
        self.service = container.leads
        self.analytics = container.analytics
        self.coordinator = coordinator
    }

    /// `.task {}` entry — fires the screen-view event once per appearance.
    func start() async {
        analytics.screen(CaptureScreenID.l1LeadList.rawValue)
        await fetch()
    }

    /// `.refreshable {}` — same fetch, no repeat screen-view event.
    func refresh() async { await fetch() }

    private func fetch() async {
        isLoading = true
        do {
            let fetched = try await service.listOpenLeads()
            leads = fetched
            errorMessage = nil
        } catch {
            // Keep any already-loaded leads on screen; surface a banner rather
            // than blanking the list (wave rule: never blank on a failure).
            errorMessage = "Couldn't load leads. Pull to try again."
        }
        isLoading = false
    }

    func open(_ lead: FieldLead) {
        analytics.event("leads.open_result")
        coordinator.navigate(to: .leadDetail(lead.id))
    }
}

struct LeadListScreen: View {
    @State private var model: LeadListModel

    init(container: AppContainer, coordinator: CaptureCoordinator) {
        _model = State(wrappedValue: LeadListModel(container: container, coordinator: coordinator))
    }

    var body: some View {
        content
            .background(CaptureColor.paper)
            .navigationTitle("Leads")
            .navigationBarTitleDisplayMode(.large)
            .task { await model.start() }
            .accessibilityIdentifier(CaptureScreenID.l1LeadList.rawValue)
    }

    @ViewBuilder
    private var content: some View {
        if model.isLoading && model.leads.isEmpty {
            ProgressView()
                .tint(CaptureColor.verdigris)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if let message = model.errorMessage, model.leads.isEmpty {
            errorState(message)
        } else if model.leads.isEmpty {
            emptyState
        } else {
            list
        }
    }

    // MARK: list

    private var list: some View {
        ScrollView {
            VStack(spacing: 0) {
                if let message = model.errorMessage {
                    errorBanner(message)
                        .padding(.bottom, 8)
                }
                ForEach(model.leads) { lead in
                    if lead.id != model.leads.first?.id {
                        Rectangle().fill(CaptureColor.line).frame(height: 1).padding(.leading, 20)
                    }
                    row(lead)
                }
            }
            .padding(.vertical, 8)
        }
        .refreshable { await model.refresh() }
    }

    private func row(_ lead: FieldLead) -> some View {
        Button {
            model.open(lead)
        } label: {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 5) {
                    Text(lead.clientName)
                        .font(CaptureType.bodyEmph)
                        .foregroundStyle(CaptureColor.ink)
                        .lineLimit(1)

                    HStack(spacing: 8) {
                        if let source = trimmed(lead.source) {
                            sourceChip(source)
                        }
                        if let age = LeadFormat.age(lead.createdAt) {
                            Text(age)
                                .font(CaptureType.monoSmall)
                                .foregroundStyle(CaptureColor.inkSoft)
                        }
                    }
                }

                Spacer(minLength: 8)

                VStack(alignment: .trailing, spacing: 6) {
                    if let budget = lead.budgetLabel {
                        Text(budget)
                            .font(CaptureType.monoSmall)
                            .foregroundStyle(CaptureColor.inkSoft)
                    }
                    Image(systemName: "chevron.right")
                        .font(CaptureType.footnote)
                        .foregroundStyle(CaptureColor.line2)
                }
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 13)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
    }

    private func sourceChip(_ source: String) -> some View {
        // clayDeep(light)/clay(dark), AA on the cream list in light mode;
        // goldenHour was sub-AA on cream (R28/R33 text-chip classification).
        Text(source)
            .font(CaptureType.eyebrow)
            .textCase(.uppercase)
            .foregroundStyle(CaptureColor.verdigrisInk)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .overlay(Capsule().stroke(CaptureColor.verdigrisInk.opacity(0.4), lineWidth: 1))
    }

    private func trimmed(_ s: String?) -> String? {
        guard let s = s?.trimmingCharacters(in: .whitespacesAndNewlines), !s.isEmpty else { return nil }
        return s
    }

    // MARK: states

    private func errorBanner(_ message: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.caption2)
                .foregroundStyle(CaptureColor.terracotta)
            Text(message)
                .font(CaptureType.footnote)
                .foregroundStyle(CaptureColor.ink)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(RoundedRectangle(cornerRadius: 10).fill(CaptureColor.terracotta.opacity(0.16)))
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(CaptureColor.terracotta.opacity(0.4), lineWidth: 1))
        .padding(.horizontal, 20)
    }

    private func errorState(_ message: String) -> some View {
        VStack(spacing: 14) {
            Image(systemName: "wifi.exclamationmark")
                .font(CaptureType.display)
                .foregroundStyle(CaptureColor.inkSoft)
            Text(message)
                .font(CaptureType.body)
                .foregroundStyle(CaptureColor.ink)
                .multilineTextAlignment(.center)
            Button("Try again") { Task { await model.refresh() } }
                .font(CaptureType.bodyEmph)
                .foregroundStyle(CaptureColor.verdigris)
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var emptyState: some View {
        VStack(spacing: 10) {
            Image(systemName: "person.crop.circle.badge.questionmark")
                .font(CaptureType.display)
                .foregroundStyle(CaptureColor.inkSoft)
            Text("No open leads.")
                .font(CaptureType.title2)
                .foregroundStyle(CaptureColor.ink)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

#if DEBUG
#Preview("Lead list") {
    NavigationStack {
        LeadListScreen(container: AppContainer(), coordinator: CaptureCoordinator())
    }
}
#endif
