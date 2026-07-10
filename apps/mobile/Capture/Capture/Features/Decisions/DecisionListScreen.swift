//  DecisionListScreen.swift
//  Capture · Wave D (Decisions, read-only)
//
//  D1 — every pending decision across the designer's clients, soonest-due first
//  (server-ordered by `container.decisions.listPending()`). Read-only: this is
//  visibility into what's waiting on a client, not an inbox to act on — tapping a
//  row only opens D2's read-only detail.

import SwiftUI
import CaptureKit

@MainActor
@Observable
final class DecisionListModel {
    private let service: any DecisionsReadService
    private let analytics: any CaptureAnalytics
    private let coordinator: CaptureCoordinator

    private(set) var items: [FieldDecision] = []
    private(set) var isLoading = false
    private(set) var errorMessage: String?

    init(service: any DecisionsReadService, analytics: any CaptureAnalytics, coordinator: CaptureCoordinator) {
        self.service = service
        self.analytics = analytics
        self.coordinator = coordinator
    }

    func start() async {
        analytics.screen(CaptureScreenID.d1DecisionList.rawValue)
        await load()
    }

    func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            items = try await service.listPending()
            errorMessage = nil
        } catch {
            errorMessage = "Couldn't load decisions — pull to retry."
        }
    }

    func open(_ decision: FieldDecision) {
        analytics.event("decisions.open", ["decision_id": decision.id])
        coordinator.navigate(to: .decisionDetail(decision.id))
    }
}

struct DecisionListScreen: View {
    @State private var model: DecisionListModel

    init(decisions: any DecisionsReadService, analytics: any CaptureAnalytics, coordinator: CaptureCoordinator) {
        _model = State(wrappedValue: DecisionListModel(service: decisions, analytics: analytics, coordinator: coordinator))
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                // A failed refresh with stale data on screen still surfaces the
                // error (small banner) rather than silently keeping the old list
                // with no sign the pull-to-refresh didn't land.
                if let message = model.errorMessage, !model.items.isEmpty {
                    inlineErrorBanner(message)
                }

                if !model.items.isEmpty {
                    header
                    card
                } else if let message = model.errorMessage {
                    errorState(message)
                } else if !model.isLoading {
                    emptyState
                }
            }
            .padding(20)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(CaptureColor.paper)
        .navigationTitle("Decisions")
        .navigationBarTitleDisplayMode(.inline)
        .overlay {
            if model.isLoading && model.items.isEmpty && model.errorMessage == nil {
                ProgressView().tint(CaptureColor.goldenHour)
            }
        }
        .task { await model.start() }
        .refreshable { await model.load() }
        .accessibilityIdentifier(CaptureScreenID.d1DecisionList.rawValue)
    }

    // MARK: List

    private var header: some View {
        Text("PENDING · \(model.items.count)")
            .font(CaptureType.eyebrow)
            .textCase(.uppercase)
            .foregroundStyle(CaptureColor.inkSoft)
    }

    private var card: some View {
        VStack(spacing: 0) {
            ForEach(model.items) { decision in
                if decision.id != model.items.first?.id {
                    Divider().background(CaptureColor.line)
                }
                row(decision)
            }
        }
        .background(CaptureColor.paper3, in: RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(CaptureColor.line, lineWidth: 1))
    }

    private func row(_ decision: FieldDecision) -> some View {
        Button {
            model.open(decision)
        } label: {
            HStack(alignment: .top, spacing: 12) {
                seenIndicator(decision).padding(.top, 4)

                VStack(alignment: .leading, spacing: 3) {
                    Text(decision.title)
                        .font(CaptureType.bodyEmph)
                        .foregroundStyle(CaptureColor.ink)
                    if let subtitle = subtitle(for: decision) {
                        Text(subtitle)
                            .font(CaptureType.footnote)
                            .foregroundStyle(CaptureColor.inkSoft)
                    }
                    if let sentAt = decision.sentAt {
                        Text("Sent \(Self.dateFormatter.string(from: sentAt))")
                            .font(CaptureType.monoSmall)
                            .foregroundStyle(CaptureColor.inkSoft)
                    }
                }

                Spacer(minLength: 8)
                Image(systemName: "chevron.right")
                    .font(CaptureType.footnote)
                    .foregroundStyle(CaptureColor.line2)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(accessibilityLabel(for: decision))
    }

    private func seenIndicator(_ decision: FieldDecision) -> some View {
        Group {
            if decision.viewedAt != nil {
                Image(systemName: "checkmark.circle.fill")
                    .font(CaptureType.footnote)
                    .foregroundStyle(CaptureColor.success)
            } else {
                Circle()
                    .fill(CaptureColor.goldenHour)
                    .frame(width: 8, height: 8)
            }
        }
        .accessibilityHidden(true)   // folded into the row's combined label below
    }

    private func subtitle(for decision: FieldDecision) -> String? {
        let parts = [decision.projectName, decision.clientName].compactMap { $0 }.filter { !$0.isEmpty }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    private func accessibilityLabel(for decision: FieldDecision) -> String {
        var parts = [decision.title]
        if let subtitle = subtitle(for: decision) { parts.append(subtitle) }
        parts.append(decision.viewedAt != nil ? "Seen by client" : "Not yet seen")
        return parts.joined(separator: ", ")
    }

    // MARK: Empty / error

    private var emptyState: some View {
        VStack(spacing: 10) {
            Image(systemName: "checkmark.seal")
                .font(CaptureType.display)
                .foregroundStyle(CaptureColor.success)
            Text("Nothing waiting on clients.")
                .font(CaptureType.title2)
                .foregroundStyle(CaptureColor.ink)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 60)
    }

    private func errorState(_ message: String) -> some View {
        VStack(spacing: 12) {
            Image(systemName: "exclamationmark.triangle")
                .font(CaptureType.title)
                .foregroundStyle(CaptureColor.error)
            Text(message)
                .font(CaptureType.callout)
                .foregroundStyle(CaptureColor.inkSoft)
                .multilineTextAlignment(.center)
            Button("Try again") { Task { await model.load() } }
                .font(CaptureType.bodyEmph)
                .foregroundStyle(CaptureColor.verdigris)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 60)
    }

    /// Shown above the (still-visible, stale) list when a refresh fails —
    /// distinct from `errorState`, which replaces the whole screen only when
    /// there's no data at all to fall back on.
    private func inlineErrorBanner(_ message: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: "exclamationmark.triangle")
                .foregroundStyle(CaptureColor.error)
            Text(message)
                .font(CaptureType.footnote)
                .foregroundStyle(CaptureColor.error)
            Spacer()
            Button("Retry") { Task { await model.load() } }
                .font(CaptureType.footnote.weight(.semibold))
                .foregroundStyle(CaptureColor.error)
        }
        .padding(12)
        .background(CaptureColor.error.opacity(0.1), in: RoundedRectangle(cornerRadius: 10))
    }

    private static let dateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "MMM d"
        return formatter
    }()
}

#if DEBUG
import CaptureKitMocks

#Preview("D1 · Decision list") {
    NavigationStack {
        DecisionListScreen(
            decisions: MockDecisionsReadService(),
            analytics: MockCaptureAnalytics(),
            coordinator: CaptureCoordinator()
        )
    }
}
#endif
