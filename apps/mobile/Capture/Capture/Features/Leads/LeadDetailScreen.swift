//  LeadDetailScreen.swift
//  Capture · Wave L (Leads)
//
//  L2 · a single lead (route `.leadDetail(id)`, id `l2LeadDetail`). Client name
//  header + status chip, meta rows (source / received / budget), and the
//  homeowner's ask as a generous serif "quote" body. Read-only v1.
//
//  No room/scan attachment section: `leads.room_scan_id` exists in the schema
//  (migration 00029) but the frozen `FieldLead` DTO has no field to carry it —
//  see the wave report for the full note.

import SwiftUI
import CaptureKit

@MainActor
@Observable
final class LeadDetailModel {
    private let service: any LeadsService
    private let analytics: any CaptureAnalytics
    let leadID: String

    private(set) var lead: FieldLead?
    private(set) var isLoading = false
    private(set) var errorMessage: String?

    init(container: AppContainer, leadID: String) {
        self.service = container.leads
        self.analytics = container.analytics
        self.leadID = leadID
    }

    /// `.task {}` entry — fires the screen-view event once per appearance.
    func start() async {
        analytics.screen(CaptureScreenID.l2LeadDetail.rawValue)
        await fetch()
    }

    func retry() async { await fetch() }

    private func fetch() async {
        isLoading = true
        do {
            lead = try await service.leadDetail(id: leadID)
            errorMessage = nil
        } catch {
            errorMessage = "Couldn't load this lead."
        }
        isLoading = false
    }
}

struct LeadDetailScreen: View {
    @State private var model: LeadDetailModel

    init(container: AppContainer, leadID: String) {
        _model = State(wrappedValue: LeadDetailModel(container: container, leadID: leadID))
    }

    var body: some View {
        content
            .background(CaptureColor.paper)
            .navigationTitle("Lead")
            .navigationBarTitleDisplayMode(.inline)
            .task { await model.start() }
            .accessibilityIdentifier(CaptureScreenID.l2LeadDetail.rawValue)
    }

    @ViewBuilder
    private var content: some View {
        if model.isLoading && model.lead == nil {
            ProgressView()
                .tint(CaptureColor.verdigris)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if let message = model.errorMessage, model.lead == nil {
            errorState(message)
        } else if let lead = model.lead {
            detail(lead)
        } else {
            missingState
        }
    }

    private func detail(_ lead: FieldLead) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                header(lead)
                metaRows(lead)
                if let note = trimmed(lead.note) {
                    noteBody(note)
                }
            }
            .padding(20)
        }
    }

    // MARK: sections

    private func header(_ lead: FieldLead) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(lead.clientName)
                .font(CaptureType.title)
                .foregroundStyle(CaptureColor.ink)
            statusChip(lead.status)
        }
    }

    private func metaRows(_ lead: FieldLead) -> some View {
        VStack(spacing: 0) {
            if let source = trimmed(lead.source) {
                metaRow("Source", value: source)
                divider
            }
            metaRow("Received", value: LeadFormat.receivedDate(lead.createdAt) ?? "—")
            if let budget = lead.budgetLabel {
                divider
                metaRow("Budget", value: budget)
            }
        }
        .background(RoundedRectangle(cornerRadius: 14).fill(CaptureColor.paper3))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(CaptureColor.line, lineWidth: 1))
    }

    private func metaRow(_ title: String, value: String) -> some View {
        HStack {
            Text(title)
                .font(CaptureType.eyebrow)
                .textCase(.uppercase)
                .foregroundStyle(CaptureColor.inkSoft)
            Spacer(minLength: 12)
            Text(value)
                .font(CaptureType.body)
                .foregroundStyle(CaptureColor.ink)
                .multilineTextAlignment(.trailing)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
    }

    private var divider: some View {
        Rectangle().fill(CaptureColor.line).frame(height: 1).padding(.leading, 16)
    }

    private func noteBody(_ note: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("The ask")
                .font(CaptureType.eyebrow)
                .textCase(.uppercase)
                .foregroundStyle(CaptureColor.verdigrisInk)
            Text(note)
                .font(CaptureType.title2)
                .foregroundStyle(CaptureColor.ink)
                .lineSpacing(7)
        }
    }

    private func statusChip(_ status: String) -> some View {
        let tint = LeadFormat.statusColor(status)
        return Text(LeadFormat.statusLabel(status))
            .font(CaptureType.eyebrow)
            .textCase(.uppercase)
            .foregroundStyle(tint)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .overlay(Capsule().stroke(tint.opacity(0.45), lineWidth: 1))
            .accessibilityLabel("Status: \(LeadFormat.statusLabel(status))")
    }

    private func trimmed(_ s: String?) -> String? {
        guard let s = s?.trimmingCharacters(in: .whitespacesAndNewlines), !s.isEmpty else { return nil }
        return s
    }

    // MARK: states

    private func errorState(_ message: String) -> some View {
        VStack(spacing: 14) {
            Image(systemName: "wifi.exclamationmark")
                .font(CaptureType.display)
                .foregroundStyle(CaptureColor.inkSoft)
            Text(message)
                .font(CaptureType.body)
                .foregroundStyle(CaptureColor.ink)
                .multilineTextAlignment(.center)
            Button("Try again") { Task { await model.retry() } }
                .font(CaptureType.bodyEmph)
                .foregroundStyle(CaptureColor.verdigris)
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var missingState: some View {
        VStack(spacing: 10) {
            Image(systemName: "person.crop.circle.badge.questionmark")
                .font(CaptureType.display)
                .foregroundStyle(CaptureColor.inkSoft)
            Text("Lead not found.")
                .font(CaptureType.body)
                .foregroundStyle(CaptureColor.ink)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

#if DEBUG
import CaptureKitMocks

#Preview("Lead detail") {
    NavigationStack {
        LeadDetailScreen(container: AppContainer(), leadID: WorkFixtures.leadID)
    }
}
#endif
