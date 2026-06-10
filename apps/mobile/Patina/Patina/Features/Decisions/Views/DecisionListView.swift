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
            .padding(.bottom, 120)
        }
        .background(PatinaColors.Background.primary)
        // R04: nav bar is hidden for this destination — pin a back
        // affordance over the scroll content (matches RoomProjectView).
        .overlay(alignment: .topLeading) {
            BackChevronButton(style: .light) { coordinator.goBack() }
                .padding(.top, 8)
                .padding(.leading, 18)
        }
        .task { await viewModel.load() }
        .refreshable { await viewModel.load() }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            MonoLabel(text: "DECISIONS")
                .tracking(2)
            Text(viewModel.decisions.isEmpty ? "Nothing waiting on you" : "Awaiting your call")
                .font(PatinaTypography.h3)
                .foregroundStyle(PatinaColors.Text.primary)
        }
        .padding(.top, 56)
        .padding(.horizontal, 24)
    }

    @ViewBuilder
    private var content: some View {
        if viewModel.isLoading && viewModel.decisions.isEmpty {
            ProgressView()
                .tint(PatinaColors.Text.interactive)
                .padding(.top, 60)
                .frame(maxWidth: .infinity)
        } else if let error = viewModel.error, viewModel.decisions.isEmpty {
            errorView(error)
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
        return parts.joined(separator: ", ")
    }

    private var emptyView: some View {
        VStack(spacing: 8) {
            Image(systemName: "checkmark.circle")
                .font(.system(size: 28))
                .foregroundStyle(PatinaColors.sage)
            Text("All caught up")
                .font(PatinaTypography.bodySmall)
                .foregroundStyle(PatinaColors.Text.secondary)
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

#Preview {
    NavigationStack {
        DecisionListView()
            .environment(\.appCoordinator, AppCoordinator())
    }
}
