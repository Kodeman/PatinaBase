//
//  DecisionListView.swift
//  Patina
//
//  Pending client-decision list. Tap a row → detail.
//

import SwiftUI

struct DecisionListView: View {
    @Environment(\.appCoordinator) private var coordinator
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @State private var viewModel = DecisionsListViewModel()

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 14) {
                header
                content
            }
            .padding(.bottom, MoneyScreenMetrics.bottomClearance(houseFirst: coordinator.isHouseFirstRoot))
        }
        .background(PatinaColors.Background.primary)
        // U18: standard pushed-screen chrome — the header above carries
        // the title, so the chrome adds only the back chevron.
        .patinaScreen(title: nil)
        .task { await viewModel.load() }
        .refreshable { await viewModel.load() }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            // `iosd3-M1`, as carried at the Wave-2 close: this list holds
            // approvals and option choices together, so it is titled for what
            // it is doing — never DECISIONS, the narrower word, over a mixed
            // list and over the Approvals row that opens it. `MonoLabel` sets
            // the case.
            MonoLabel(text: viewModel.eyebrow)
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
            // C-06: title and badge shared one row at every text size, so at
            // accessibility-extra-large the badge took the width the title
            // needed and "Design Development sign-off" broke inside the word —
            // "Design Developme / nt sign-off". Above the accessibility
            // threshold the badge takes its own line and the title gets the
            // whole column.
            if dynamicTypeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: 6) {
                    decisionTitle(d)
                    if let kind = d.kindChipLabel { decisionTypeBadge(kind) }
                }
            } else {
                HStack {
                    decisionTitle(d)
                    Spacer()
                    if let kind = d.kindChipLabel { decisionTypeBadge(kind) }
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
            // SP-15: the same line the Studio hub prints. P-04 / R8: a date
            // that has passed says the ask is still open, in body ink — the
            // red and the retired word are money's alone.
            if let standing = DateDisplay.approval(
                dueDate: d.due_date, askedAt: d.created_at,
                designer: d.project?.designer?.askedByName
            ) {
                Text(standing.text)
                    .font(PatinaTypography.captionSmall)
                    .foregroundStyle(
                        standing.isStillOpen ? PatinaColors.Text.primary : PatinaColors.Text.muted
                    )
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(PatinaColors.Background.secondary)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .accessibilityElement(children: .combine)
        .accessibilityLabel(decisionAccessibilityLabel(d))
    }

    private func decisionTitle(_ decision: RemoteClientDecision) -> some View {
        // `W2R1-n4`: "Decision" is the narrower word, and it was the fallback
        // over approvals too. An untitled Stage-2 row is an approval.
        Text(decision.title ?? decision.untitledRowTitle)
            .font(PatinaTypography.h5)
            .foregroundStyle(PatinaColors.Text.primary)
            .minimumScaleFactor(0.7)
            .allowsTightening(true)
            .fixedSize(horizontal: false, vertical: true)
    }

    private func decisionTypeBadge(_ label: String) -> some View {
        Text(label)
            .font(PatinaTypography.monoTiny)
            .lineLimit(1)
            .minimumScaleFactor(0.6)
            .allowsTightening(true)
            .fixedSize(horizontal: true, vertical: false)
            .foregroundStyle(PatinaColors.Text.interactive)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(PatinaColors.clay.opacity(0.1))
            .clipShape(Capsule())
    }

    /// Aggregated VoiceOver label for a decision card: title + type + description,
    /// so focus lands once instead of stopping on each Text.
    private func decisionAccessibilityLabel(_ d: RemoteClientDecision) -> String {
        var parts: [String] = [d.title ?? d.untitledRowTitle]
        if let kind = d.kindChipLabel { parts.append(kind) }
        if let projectName = d.project?.name, !projectName.isEmpty { parts.append(projectName) }
        if let description = d.description, !description.isEmpty { parts.append(description) }
        if let standing = DateDisplay.approval(
            dueDate: d.due_date, askedAt: d.created_at,
            designer: d.project?.designer?.askedByName
        ) {
            parts.append(standing.text)
        }
        return parts.joined(separator: ", ")
    }

    /// U22: names the surface, names the trigger, and offers the one CTA
    /// that actually unblocks it — track an in-flight request if one
    /// exists, otherwise start one.
    private var emptyView: some View {
        // `P-17`: no glyph. A check mark over "Nothing waiting on you" is a
        // check mark used as status, which the stamp grammar replaces
        // everywhere else on this rail and refuses outright here — there is
        // no state to mark when there is nothing to mark.
        PatinaEmptyState(
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
            .appCoordinator(AppCoordinator())
    }
}
