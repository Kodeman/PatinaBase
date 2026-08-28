//
//  ProjectDetailView.swift
//  Patina
//
//  Read-only project detail: phases timeline, payment milestones, FF&E
//  summary. Surface for both client and designer; designer-side currently
//  shares the same view (no edit affordances yet — design follow-up).
//

import SwiftUI

struct ProjectDetailView: View {
    let projectId: String
    /// Read for the pinned-footer clearance only: the bar owns the bottom
    /// edge on the house-first root, the Companion dock on the flag-off one.
    @Environment(\.appCoordinator) private var coordinator
    @State private var viewModel = ProjectDetailViewModel()

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 24) {
                if let project = viewModel.project {
                    header(project)
                    // R23: lead with substance — budget, dates, visibility —
                    // before any section can render as an empty placeholder.
                    overviewCard(project)
                    if let proposalId = viewModel.linkedProposalId {
                        ProjectProposalLink(proposalId: proposalId)
                    }
                    // SP-13: the one act a client wants on a project they can
                    // only read. The RPC is idempotent, so this opens the
                    // existing thread when there is one.
                    ProjectMessageDesignerLink(projectId: project.id)
                    if !viewModel.phases.isEmpty { phasesSection }
                    if !viewModel.milestones.isEmpty { milestonesSection }
                    if viewModel.hasInvoices { ProjectInvoicesLink() }
                    if viewModel.hasDocuments { ProjectDocumentsLink() }
                    if !viewModel.ffe.isEmpty { ffeSection }
                    // SP-05: empty sections say, in the client's words, what
                    // her designer has not put together yet.
                    if !missingSectionLines.isEmpty {
                        notReadyYetCard
                    }
                } else if let error = viewModel.error {
                    errorView(error)
                } else {
                    PatinaLoadingState()
                        .padding(.top, 80)
                }
            }
            .padding(.bottom, MoneyScreenMetrics.bottomClearance(houseFirst: coordinator.isHouseFirstRoot))
        }
        .background(PatinaColors.Background.primary)
        // U18: standard pushed-screen chrome — the header above carries
        // the title, so the chrome adds only the back chevron.
        .patinaScreen(title: nil)
        .task { await viewModel.load(projectId: projectId) }
    }

    // MARK: - Header

    private func header(_ project: RemoteProject) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            MonoLabel(text: "PROJECT")
                .tracking(2)
            Text(project.name)
                .font(PatinaTypography.h2)
                .foregroundStyle(PatinaColors.Text.primary)
            if let phase = project.current_phase {
                // R16: formatted phase vocabulary, never the raw slug.
                Text("Currently: \(PhaseDisplay.label(for: phase))")
                    .font(PatinaTypography.caption)
                    .foregroundStyle(PatinaColors.Text.muted)
            }
            // Wave 6 / D2: the studio behind this project — resolved async
            // and independent of the rest of the header (see StudioIdentityLine).
            StudioIdentityLine(projectId: project.id)
        }
        .padding(.top, 56)
        .padding(.horizontal, 24)
    }

    // MARK: - Overview (R23)

    /// Key facts card rendered directly under the project name: budget,
    /// status, start/target dates, and client visibility when present.
    @ViewBuilder
    private func overviewCard(_ project: RemoteProject) -> some View {
        let facts = overviewFacts(project)
        if !facts.isEmpty {
            LazyVGrid(
                columns: [
                    GridItem(.flexible(), alignment: .topLeading),
                    GridItem(.flexible(), alignment: .topLeading),
                ],
                alignment: .leading,
                spacing: 14
            ) {
                ForEach(facts, id: \.0) { fact in
                    VStack(alignment: .leading, spacing: 2) {
                        MonoLabel(text: fact.0)
                        Text(fact.1)
                            .font(PatinaTypography.bodySmallMedium)
                            .foregroundStyle(PatinaColors.Text.secondary)
                    }
                }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(PatinaColors.Background.secondary)
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .padding(.horizontal, 24)
        }
    }

    private func overviewFacts(_ project: RemoteProject) -> [(String, String)] {
        ProjectDetailCopy.overviewFacts(project)
    }

    // MARK: - Not-ready-yet sections (SP-05)

    /// SP-05: the client is told what is not ready yet, in her own words —
    /// never handed the designer's portal instruction.
    private var missingSectionLines: [String] {
        ProjectDetailCopy.missingSectionLines(
            phases: viewModel.phases.isEmpty,
            payments: viewModel.milestones.isEmpty,
            ffe: viewModel.ffe.isEmpty
        )
    }

    private var notReadyYetCard: some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(missingSectionLines, id: \.self) { line in
                Text(line)
                    .font(PatinaTypography.caption)
                    .foregroundStyle(PatinaColors.Text.muted)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .stroke(PatinaColors.pearl, lineWidth: 1)
        )
        .padding(.horizontal, 24)
        .accessibilityIdentifier("projectDetail.notReadyYet")
    }

    // MARK: - Phases (W4 — F76/F125)

    // R23: only rendered when phases exist — the empty state collapses
    // into `notReadyYetCard` instead.
    //
    // W4: the rows the detail has always fetched, drawn as the timeline they
    // are — a connecting rail down the dots and the current phase marked. The
    // data was on the wire the whole time; this draws it. Nothing is composed:
    // every line is a column of `project_phases`.
    private var phasesSection: some View {
        let currentId = ProjectDetailCopy.currentPhaseId(
            phases: viewModel.phases,
            currentPhaseKey: viewModel.project?.current_phase
        )
        return VStack(alignment: .leading, spacing: 8) {
            MonoLabel(text: "Phases")
                .padding(.horizontal, 24)

            VStack(spacing: 0) {
                ForEach(Array(viewModel.phases.enumerated()), id: \.element.id) { index, phase in
                    phaseRow(
                        phase,
                        isCurrent: phase.id == currentId,
                        isFirst: index == 0,
                        isLast: index == viewModel.phases.count - 1
                    )
                }
            }
            .background(PatinaColors.Background.secondary)
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .padding(.horizontal, 24)
        }
    }

    private func phaseRow(
        _ phase: RemoteProjectPhase,
        isCurrent: Bool,
        isFirst: Bool,
        isLast: Bool
    ) -> some View {
        HStack(alignment: .top, spacing: 12) {
            phaseMarker(phase, isCurrent: isCurrent, isFirst: isFirst, isLast: isLast)
            VStack(alignment: .leading, spacing: 2) {
                if isCurrent {
                    MonoLabel(text: "Current")
                }
                // R16: designer-defined name wins; otherwise the formatted
                // designer label for the slug — never `phase_key.capitalized`.
                Text(phase.name ?? PhaseDisplay.label(for: phase.phase_key))
                    .font(isCurrent ? PatinaTypography.bodyMedium : PatinaTypography.bodySmallMedium)
                    .foregroundStyle(PatinaColors.Text.primary)
                Text(phaseStatusLine(phase))
                    .font(PatinaTypography.caption)
                    .foregroundStyle(PatinaColors.Text.muted)
            }
            Spacer()
            if let fee = phase.fee_cents {
                Text(formatPrice(fee))
                    .font(PatinaTypography.monoTiny)
                    .foregroundStyle(PatinaColors.Text.secondary)
            }
        }
        .padding(.vertical, 14)
        .padding(.horizontal, 16)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(phaseAccessibilityLabel(phase, isCurrent: isCurrent))
    }

    /// The rail: a dot per phase, joined above and below except at the ends,
    /// so the column reads as one run of time rather than a stack of chips.
    private func phaseMarker(
        _ phase: RemoteProjectPhase,
        isCurrent: Bool,
        isFirst: Bool,
        isLast: Bool
    ) -> some View {
        let color = phaseColor(for: phase.status)
        return VStack(spacing: 0) {
            Rectangle()
                .fill(isFirst ? Color.clear : PatinaColors.pearl)
                .frame(width: 1, height: 8)
            ZStack {
                if isCurrent {
                    Circle()
                        .stroke(color, lineWidth: 1.5)
                        .frame(width: 16, height: 16)
                }
                Circle()
                    .fill(color)
                    .frame(width: 10, height: 10)
            }
            .frame(width: 16, height: 16)
            Rectangle()
                .fill(isLast ? Color.clear : PatinaColors.pearl)
                .frame(width: 1)
                .frame(maxHeight: .infinity)
        }
        .frame(width: 16)
        .accessibilityHidden(true)
    }

    /// The status the server gave, plus the dates it gave — never a date the
    /// app worked out for itself.
    private func phaseStatusLine(_ phase: RemoteProjectPhase) -> String {
        var parts = [PhaseDisplay.statusLabel(for: phase.status ?? "pending")]
        if let start = phase.start_date {
            parts.append(DateDisplay.fromDateString(start))
        }
        if let end = phase.end_date {
            parts.append(DateDisplay.fromDateString(end))
        }
        return parts.joined(separator: " · ")
    }

    private func phaseAccessibilityLabel(_ phase: RemoteProjectPhase, isCurrent: Bool) -> String {
        let name = phase.name ?? PhaseDisplay.label(for: phase.phase_key)
        let prefix = isCurrent ? "Current phase. " : ""
        return "\(prefix)\(name). \(phaseStatusLine(phase))"
    }

    private func phaseColor(for status: String?) -> Color {
        switch status?.lowercased() {
        case "in_progress": return PatinaColors.clay
        case "completed":   return PatinaColors.sage
        default:            return PatinaColors.agedOak.opacity(0.4)
        }
    }

    // MARK: - Milestones

    // R23: only rendered when milestones exist (see `notReadyYetCard`).
    private var milestonesSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            MonoLabel(text: "Payments")
                .padding(.horizontal, 24)

            VStack(spacing: 0) {
                ForEach(viewModel.milestones) { milestone in
                    milestoneRow(milestone)
                }
            }
            .background(PatinaColors.Background.secondary)
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .padding(.horizontal, 24)
        }
    }

    private func milestoneRow(_ m: RemotePaymentMilestone) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(m.title ?? "Payment")
                    .font(PatinaTypography.bodySmallMedium)
                    .foregroundStyle(PatinaColors.Text.primary)
                if let due = m.due_date {
                    Text("Due \(due)")
                        .font(PatinaTypography.caption)
                        .foregroundStyle(PatinaColors.Text.muted)
                }
            }
            Spacer()
            if let amount = m.amount_cents {
                Text(formatPrice(amount))
                    .font(PatinaTypography.bodySmallMedium)
                    .foregroundStyle(PatinaColors.Text.secondary)
            }
        }
        .padding(.vertical, 14)
        .padding(.horizontal, 16)
        .overlay(alignment: .bottom) {
            Rectangle()
                .fill(PatinaColors.pearl)
                .frame(height: 1)
        }
    }

    // MARK: - FF&E summary

    // R23: only rendered when FF&E items exist (see `notReadyYetCard`).
    private var ffeSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            MonoLabel(text: "FF&E")
                .padding(.horizontal, 24)
            VStack(spacing: 0) {
                ForEach(viewModel.ffe) { item in
                    HStack {
                        Text(item.name ?? "Item")
                            .font(PatinaTypography.bodySmall)
                            .foregroundStyle(PatinaColors.Text.primary)
                        Spacer()
                        if let total = item.client_line_total_cents {
                            Text(formatPrice(total))
                                .font(PatinaTypography.monoTiny)
                                .foregroundStyle(PatinaColors.Text.secondary)
                        }
                    }
                    .padding(.vertical, 12)
                    .padding(.horizontal, 16)
                    .overlay(alignment: .bottom) {
                        Rectangle()
                            .fill(PatinaColors.pearl)
                            .frame(height: 1)
                    }
                }
            }
            .background(PatinaColors.Background.secondary)
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .padding(.horizontal, 24)
        }
    }

    private func errorView(_ msg: String) -> some View {
        PatinaErrorState(
            message: msg,
            action: { Task { await viewModel.load(projectId: projectId) } }
        )
        .padding(.top, 80)
    }

    private func formatPrice(_ cents: Int) -> String {
        let dollars = cents / 100
        return "$\(dollars.formatted())"
    }
}

// MARK: - Proposal link (Wave 2 / D.1)

/// A real push to the signed proposal this project activated from. Extracted
/// as its own view so ProjectDetailView stays under the type-body ceiling.
private struct ProjectProposalLink: View {
    let proposalId: String
    @Environment(\.appCoordinator) private var coordinator

    var body: some View {
        Button {
            coordinator.navigate(to: .proposalDetail(proposalId: proposalId))
        } label: {
            HStack(spacing: 12) {
                Image(systemName: "doc.text")
                    .font(PatinaTypography.uiSmall)
                    .foregroundStyle(PatinaColors.Text.interactive)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Proposal")
                        .font(PatinaTypography.bodySmallMedium)
                        .foregroundStyle(PatinaColors.Text.primary)
                    Text("View the signed proposal")
                        .font(PatinaTypography.caption)
                        .foregroundStyle(PatinaColors.Text.muted)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(PatinaTypography.uiSmall)
                    .foregroundStyle(PatinaColors.Text.muted)
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(PatinaColors.Background.secondary)
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 24)
        .accessibilityIdentifier("projectDetail.proposalLink")
    }
}

// MARK: - Invoices link (Wave 2 / D.2)

/// A push to the client's invoices where this project has any. Extracted as
/// its own view so ProjectDetailView stays under the type-body ceiling.
private struct ProjectInvoicesLink: View {
    @Environment(\.appCoordinator) private var coordinator

    var body: some View {
        Button {
            coordinator.navigate(to: .invoiceList)
        } label: {
            HStack(spacing: 12) {
                Image(systemName: "creditcard")
                    .font(PatinaTypography.uiSmall)
                    .foregroundStyle(PatinaColors.Text.interactive)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Invoices")
                        .font(PatinaTypography.bodySmallMedium)
                        .foregroundStyle(PatinaColors.Text.primary)
                    Text("View and pay your invoices")
                        .font(PatinaTypography.caption)
                        .foregroundStyle(PatinaColors.Text.muted)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(PatinaTypography.uiSmall)
                    .foregroundStyle(PatinaColors.Text.muted)
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(PatinaColors.Background.secondary)
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 24)
        .accessibilityIdentifier("projectDetail.invoicesLink")
    }
}

// MARK: - Documents link (Wave 3 / D.4)

/// A push to the client's shared documents where this project has any.
/// Extracted as its own view so ProjectDetailView stays under the type-body
/// ceiling.
private struct ProjectDocumentsLink: View {
    @Environment(\.appCoordinator) private var coordinator

    var body: some View {
        Button {
            coordinator.navigate(to: .documentList)
        } label: {
            HStack(spacing: 12) {
                Image(systemName: "folder")
                    .font(PatinaTypography.uiSmall)
                    .foregroundStyle(PatinaColors.Text.interactive)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Documents")
                        .font(PatinaTypography.bodySmallMedium)
                        .foregroundStyle(PatinaColors.Text.primary)
                    Text("Contracts, drawings, and shared files")
                        .font(PatinaTypography.caption)
                        .foregroundStyle(PatinaColors.Text.muted)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(PatinaTypography.uiSmall)
                    .foregroundStyle(PatinaColors.Text.muted)
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(PatinaColors.Background.secondary)
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 24)
        .accessibilityIdentifier("projectDetail.documentsLink")
    }
}

#Preview {
    NavigationStack {
        ProjectDetailView(projectId: "preview")
    }
}
