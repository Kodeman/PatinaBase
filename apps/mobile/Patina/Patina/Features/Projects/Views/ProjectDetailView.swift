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
    @State private var viewModel = ProjectDetailViewModel()

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 24) {
                if let project = viewModel.project {
                    header(project)
                    phasesSection
                    milestonesSection
                    ffeSection
                } else if let error = viewModel.error {
                    errorView(error)
                } else {
                    ProgressView()
                        .tint(PatinaColors.clay)
                        .padding(.top, 80)
                        .frame(maxWidth: .infinity)
                }
            }
            .padding(.bottom, 120)
        }
        .background(PatinaColors.offWhite)
        .task { await viewModel.load(projectId: projectId) }
    }

    // MARK: - Header

    private func header(_ project: RemoteProject) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            MonoLabel(text: "PROJECT")
                .tracking(2)
            Text(project.name)
                .font(PatinaTypography.h2)
                .foregroundColor(PatinaColors.charcoal)
            if let phase = project.current_phase {
                Text("Currently: \(phase)")
                    .font(PatinaTypography.caption)
                    .foregroundColor(PatinaColors.agedOak)
            }
        }
        .padding(.top, 56)
        .padding(.horizontal, 24)
    }

    // MARK: - Phases

    private var phasesSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            MonoLabel(text: "Phases")
                .padding(.horizontal, 24)

            if viewModel.phases.isEmpty {
                Text("No phases yet")
                    .font(PatinaTypography.caption)
                    .foregroundColor(PatinaColors.agedOak)
                    .padding(.horizontal, 24)
            } else {
                VStack(spacing: 0) {
                    ForEach(viewModel.phases) { phase in
                        phaseRow(phase)
                    }
                }
                .background(PatinaColors.softCream)
                .clipShape(RoundedRectangle(cornerRadius: 14))
                .padding(.horizontal, 24)
            }
        }
    }

    private func phaseRow(_ phase: RemoteProjectPhase) -> some View {
        HStack(spacing: 12) {
            Circle()
                .fill(phaseColor(for: phase.status))
                .frame(width: 10, height: 10)
            VStack(alignment: .leading, spacing: 2) {
                Text(phase.name ?? phase.phase_key.capitalized)
                    .font(PatinaTypography.bodySmallMedium)
                    .foregroundColor(PatinaColors.charcoal)
                Text((phase.status ?? "pending").capitalized)
                    .font(PatinaTypography.caption)
                    .foregroundColor(PatinaColors.agedOak)
            }
            Spacer()
            if let fee = phase.fee_cents {
                Text(formatPrice(fee))
                    .font(PatinaTypography.monoTiny)
                    .foregroundColor(PatinaColors.mocha)
            }
        }
        .padding(.vertical, 14)
        .padding(.horizontal, 16)
        .overlay(alignment: .bottom) {
            Rectangle()
                .fill(PatinaColors.pearl)
                .frame(height: 1)
                .padding(.leading, 38)
        }
    }

    private func phaseColor(for status: String?) -> Color {
        switch status?.lowercased() {
        case "in_progress": return PatinaColors.clay
        case "completed":   return PatinaColors.sage
        default:            return PatinaColors.agedOak.opacity(0.4)
        }
    }

    // MARK: - Milestones

    private var milestonesSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            MonoLabel(text: "Payments")
                .padding(.horizontal, 24)

            if viewModel.milestones.isEmpty {
                Text("No payment milestones yet")
                    .font(PatinaTypography.caption)
                    .foregroundColor(PatinaColors.agedOak)
                    .padding(.horizontal, 24)
            } else {
                VStack(spacing: 0) {
                    ForEach(viewModel.milestones) { milestone in
                        milestoneRow(milestone)
                    }
                }
                .background(PatinaColors.softCream)
                .clipShape(RoundedRectangle(cornerRadius: 14))
                .padding(.horizontal, 24)
            }
        }
    }

    private func milestoneRow(_ m: RemotePaymentMilestone) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(m.title ?? "Payment")
                    .font(PatinaTypography.bodySmallMedium)
                    .foregroundColor(PatinaColors.charcoal)
                if let due = m.due_date {
                    Text("Due \(due)")
                        .font(PatinaTypography.caption)
                        .foregroundColor(PatinaColors.agedOak)
                }
            }
            Spacer()
            if let amount = m.amount_cents {
                Text(formatPrice(amount))
                    .font(PatinaTypography.bodySmallMedium)
                    .foregroundColor(PatinaColors.mocha)
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

    private var ffeSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            MonoLabel(text: "FF&E")
                .padding(.horizontal, 24)
            if viewModel.ffe.isEmpty {
                Text("No FF&E items yet")
                    .font(PatinaTypography.caption)
                    .foregroundColor(PatinaColors.agedOak)
                    .padding(.horizontal, 24)
            } else {
                VStack(spacing: 0) {
                    ForEach(viewModel.ffe) { item in
                        HStack {
                            Text(item.name ?? "Item")
                                .font(PatinaTypography.bodySmall)
                                .foregroundColor(PatinaColors.charcoal)
                            Spacer()
                            if let total = item.line_total_cents {
                                Text(formatPrice(total))
                                    .font(PatinaTypography.monoTiny)
                                    .foregroundColor(PatinaColors.mocha)
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
                .background(PatinaColors.softCream)
                .clipShape(RoundedRectangle(cornerRadius: 14))
                .padding(.horizontal, 24)
            }
        }
    }

    private func errorView(_ msg: String) -> some View {
        VStack(spacing: 12) {
            Text(msg)
                .font(PatinaTypography.bodySmall)
                .foregroundColor(PatinaColors.mocha)
            Button("Try Again") {
                Task { await viewModel.load(projectId: projectId) }
            }
            .font(PatinaTypography.bodySmallMedium)
            .foregroundColor(PatinaColors.clay)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 80)
    }

    private func formatPrice(_ cents: Int) -> String {
        let dollars = cents / 100
        return "$\(dollars.formatted())"
    }
}

#Preview {
    NavigationStack {
        ProjectDetailView(projectId: "preview")
    }
}
