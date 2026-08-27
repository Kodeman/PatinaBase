//
//  DecisionListView.swift
//  Patina
//
//  Pending client-decision list. Tap a row → detail.
//

import SwiftUI

struct DecisionListView: View {
    @Environment(\.appCoordinator) private var coordinator
    @State private var viewModel = DecisionsListViewModel()

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 14) {
                header
                content
            }
            .padding(.bottom, MoneyScreenMetrics.bottomClearance)
        }
        .background(PatinaColors.Background.primary)
        // U18: standard pushed-screen chrome — the header above carries
        // the title, so the chrome adds only the back chevron.
        .patinaScreen(title: nil)
        .moneyScreenTopBand()
        .task { await viewModel.load() }
        .refreshable { await viewModel.load() }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            MonoLabel(text: "DECISIONS")
                .tracking(2)
            // U22: kept static — the empty case names itself in
            // `emptyView`'s PatinaEmptyState below; repeating that exact
            // line here doubled the same sentence on an empty Studio.
            Text("Awaiting your call")
                .font(PatinaTypography.h3)
                .foregroundStyle(PatinaColors.Text.primary)
        }
        .padding(.top, 56)
        .padding(.horizontal, 24)
    }

    @ViewBuilder
    private var content: some View {
        if viewModel.isLoading && viewModel.decisions.isEmpty {
            PatinaLoadingState()
                .padding(.top, 60)
        } else if let error = viewModel.error, viewModel.decisions.isEmpty {
            PatinaErrorState(message: error, action: { Task { await viewModel.load() } })
                .padding(.top, 60)
        } else if viewModel.decisions.isEmpty {
            emptyView
        } else {
            VStack(spacing: 12) {
                ForEach(viewModel.decisions) { d in
                    Button {
                        coordinator.navigate(to: .decisionDetail(decisionId: d.id))
                    } label: {
                        decisionCard(d)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 24)
            .padding(.top, 12)
        }
    }

    private func decisionCard(_ d: RemoteClientDecision) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(d.title ?? "Decision")
                    .font(PatinaTypography.h5)
                    .foregroundStyle(PatinaColors.Text.primary)
                Spacer()
                if let type = d.decision_type {
                    Text(type.capitalized)
                        .font(PatinaTypography.monoTiny)
                        .foregroundStyle(PatinaColors.Text.interactive)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(PatinaColors.clay.opacity(0.1))
                        .clipShape(Capsule())
                }
            }
            // R20: project context so the client knows which engagement
            // this decision belongs to (embedded `projects(name)`).
            if let projectName = d.project?.name, !projectName.isEmpty {
                Text(projectName)
                    .font(PatinaTypography.caption)
                    .foregroundStyle(PatinaColors.Text.muted)
            }
            if let description = d.description, !description.isEmpty {
                Text(description)
                    .font(PatinaTypography.caption)
                    .foregroundStyle(PatinaColors.Text.muted)
                    .lineLimit(3)
            }
            // SP-15: the same due line the Studio hub prints.
            if let due = DateDisplay.due(d.due_date) {
                Text(due.text)
                    .font(PatinaTypography.captionSmall)
                    .foregroundStyle(due.isPastDue ? PatinaColors.error : PatinaColors.Text.muted)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(PatinaColors.Background.secondary)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .accessibilityElement(children: .combine)
        .accessibilityLabel(decisionAccessibilityLabel(d))
    }

    /// Aggregated VoiceOver label for a decision card: title + type + description,
    /// so focus lands once instead of stopping on each Text.
    private func decisionAccessibilityLabel(_ d: RemoteClientDecision) -> String {
        var parts: [String] = [d.title ?? "Decision"]
        if let type = d.decision_type { parts.append(type.capitalized) }
        if let projectName = d.project?.name, !projectName.isEmpty { parts.append(projectName) }
        if let description = d.description, !description.isEmpty { parts.append(description) }
        if let due = DateDisplay.due(d.due_date) { parts.append(due.text) }
        return parts.joined(separator: ", ")
    }

    /// U22: names the surface, names the trigger, and offers the one CTA
    /// that actually unblocks it — track an in-flight request if one
    /// exists, otherwise start one.
    private var emptyView: some View {
        PatinaEmptyState(
            icon: "checkmark.circle",
            title: "Nothing waiting on you",
            message: "When your designer needs a call from you, it lands here.",
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

#Preview {
    NavigationStack {
        DecisionListView()
            .environment(\.appCoordinator, AppCoordinator())
    }
}
