//
//  DecisionDetailView.swift
//  Patina
//
//  Decision detail: option cards with image + description, "Approve"
//  CTA per option. Designer-side sees the same view; approval is
//  client-only (RLS enforces it).
//

import SwiftUI

struct DecisionDetailView: View {
    let decisionId: String
    @State private var viewModel = DecisionDetailViewModel()
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 24) {
                if let decision = viewModel.decision {
                    header(decision)
                    ForEach(viewModel.options) { option in
                        optionCard(option, decision: decision)
                    }
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
        .task { await viewModel.load(decisionId: decisionId) }
    }

    private func header(_ decision: RemoteClientDecision) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            MonoLabel(text: "DECISION")
                .tracking(2)
            Text(decision.title ?? "Decision")
                .font(PatinaTypography.h2)
                .foregroundColor(PatinaColors.charcoal)
            if let description = decision.description {
                Text(description)
                    .font(PatinaTypography.bodySmall)
                    .foregroundColor(PatinaColors.mocha)
            }
        }
        .padding(.top, 56)
        .padding(.horizontal, 24)
    }

    private func optionCard(_ option: RemoteDecisionOption, decision: RemoteClientDecision) -> some View {
        let isRecommended = option.is_recommended ?? false
        let isApproved = viewModel.approvedOptionId == option.id
            || decision.chosen_option_id == option.id

        return VStack(alignment: .leading, spacing: 12) {
            if let url = option.image_url, let imageURL = URL(string: url) {
                AsyncImage(url: imageURL) { phase in
                    switch phase {
                    case .empty:
                        Rectangle()
                            .fill(PatinaColors.pearl)
                            .frame(height: 180)
                    case .success(let image):
                        image
                            .resizable()
                            .aspectRatio(contentMode: .fill)
                            .frame(maxWidth: .infinity)
                            .frame(height: 180)
                            .clipped()
                    case .failure:
                        Rectangle()
                            .fill(PatinaColors.pearl)
                            .frame(height: 180)
                    @unknown default:
                        Rectangle()
                            .fill(PatinaColors.pearl)
                            .frame(height: 180)
                    }
                }
                .clipShape(RoundedRectangle(cornerRadius: 12))
            }

            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(option.title ?? "Option")
                        .font(PatinaTypography.h5)
                        .foregroundColor(PatinaColors.charcoal)
                    if let description = option.description {
                        Text(description)
                            .font(PatinaTypography.caption)
                            .foregroundColor(PatinaColors.agedOak)
                    }
                }
                Spacer()
                if isRecommended {
                    Text("Recommended")
                        .font(PatinaTypography.monoTiny)
                        .foregroundColor(PatinaColors.clay)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(PatinaColors.clay.opacity(0.1))
                        .clipShape(Capsule())
                }
            }

            HStack {
                if let price = option.price_cents {
                    Text("$\((price / 100).formatted())")
                        .font(PatinaTypography.bodySmallMedium)
                        .foregroundColor(PatinaColors.mocha)
                }
                Spacer()
                if isApproved {
                    HStack(spacing: 6) {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundColor(PatinaColors.sage)
                        Text("Approved")
                            .font(PatinaTypography.bodySmallMedium)
                            .foregroundColor(PatinaColors.sage)
                    }
                } else {
                    PatinaButton(viewModel.isApproving ? "Submitting…" : "Approve", style: .primary) {
                        Task {
                            await viewModel.approve(optionId: option.id, decisionId: decision.id)
                        }
                    }
                    .disabled(viewModel.isApproving)
                }
            }
        }
        .padding(16)
        .background(PatinaColors.softCream)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .padding(.horizontal, 24)
    }

    private func errorView(_ msg: String) -> some View {
        VStack(spacing: 12) {
            Text(msg)
                .font(PatinaTypography.bodySmall)
                .foregroundColor(PatinaColors.mocha)
            Button("Try Again") {
                Task { await viewModel.load(decisionId: decisionId) }
            }
            .font(PatinaTypography.bodySmallMedium)
            .foregroundColor(PatinaColors.clay)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 80)
    }
}

#Preview {
    NavigationStack {
        DecisionDetailView(decisionId: "preview")
    }
}
