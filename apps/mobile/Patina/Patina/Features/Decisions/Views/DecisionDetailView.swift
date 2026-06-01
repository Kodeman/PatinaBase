//
//  DecisionDetailView.swift
//  Patina
//
//  Decision detail: option cards with image + description and a "Choose
//  this" CTA per option. Tapping a CTA opens the consent step
//  (`DecisionConsentSheet`) where the client click-throughs or e-signs;
//  on confirm the choice is fed through `apply_decision`. Designer-side
//  sees the same view read-only (RLS enforces who can respond).
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
                        optionCard(option)
                    }
                } else if let error = viewModel.error {
                    errorView(error)
                } else {
                    ProgressView()
                        .tint(PatinaColors.Text.interactive)
                        .padding(.top, 80)
                        .frame(maxWidth: .infinity)
                }
            }
            .padding(.bottom, 120)
        }
        .background(PatinaColors.offWhite)
        .task { await viewModel.load(decisionId: decisionId) }
        .sheet(isPresented: consentSheetBinding) {
            if let option = pendingOption {
                DecisionConsentSheet(
                    optionTitle: option.title ?? "this option",
                    isSubmitting: viewModel.isSubmitting,
                    onConfirm: { consent, signature in
                        Task {
                            await viewModel.confirmSelection(
                                decisionId: decisionId,
                                consent: consent,
                                signature: signature
                            )
                        }
                    },
                    onCancel: { viewModel.cancelSelection() }
                )
                .presentationDetents([.medium, .large])
            }
        }
    }

    /// The option the client tapped "Choose this" on, resolved from the VM.
    private var pendingOption: RemoteDecisionOption? {
        guard let id = viewModel.pendingOptionId else { return nil }
        return viewModel.options.first(where: { $0.id == id })
    }

    /// `.sheet(isPresented:)` binding driven by the VM's `pendingOptionId`.
    /// Dismissing the sheet (swipe or Cancel) clears the pending option.
    private var consentSheetBinding: Binding<Bool> {
        Binding(
            get: { viewModel.pendingOptionId != nil },
            set: { if !$0 { viewModel.cancelSelection() } }
        )
    }

    private func header(_ decision: RemoteClientDecision) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            MonoLabel(text: "DECISION")
                .tracking(2)
            Text(decision.title ?? "Decision")
                .font(PatinaTypography.h2)
                .foregroundStyle(PatinaColors.charcoal)
            if let description = decision.description, !description.isEmpty {
                Text(description)
                    .font(PatinaTypography.bodySmall)
                    .foregroundStyle(PatinaColors.mocha)
            }
            if viewModel.isResolved {
                resolvedBanner
            }
        }
        .padding(.top, 56)
        .padding(.horizontal, 24)
    }

    private var resolvedBanner: some View {
        HStack(spacing: 6) {
            Image(systemName: "checkmark.seal.fill")
                .foregroundStyle(PatinaColors.sage)
            Text("You've responded to this decision")
                .font(PatinaTypography.bodySmallMedium)
                .foregroundStyle(PatinaColors.sage)
        }
        .padding(.top, 4)
    }

    private func optionCard(_ option: RemoteDecisionOption) -> some View {
        let isRecommended = option.is_recommended ?? false
        let isSelected = viewModel.isSelected(option)

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
                        .foregroundStyle(PatinaColors.charcoal)
                    if let description = option.description, !description.isEmpty {
                        Text(description)
                            .font(PatinaTypography.caption)
                            .foregroundStyle(PatinaColors.agedOak)
                    }
                }
                Spacer()
                if isRecommended {
                    Text("Recommended")
                        .font(PatinaTypography.monoTiny)
                        .foregroundStyle(PatinaColors.Text.interactive)
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
                        .foregroundStyle(PatinaColors.mocha)
                }
                Spacer()
                optionAction(option, isSelected: isSelected)
            }
        }
        .padding(16)
        .background(PatinaColors.softCream)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(isSelected ? PatinaColors.sage : .clear, lineWidth: 1.5)
        )
        .padding(.horizontal, 24)
    }

    @ViewBuilder
    private func optionAction(_ option: RemoteDecisionOption, isSelected: Bool) -> some View {
        if isSelected {
            HStack(spacing: 6) {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundStyle(PatinaColors.sage)
                Text("Your choice")
                    .font(PatinaTypography.bodySmallMedium)
                    .foregroundStyle(PatinaColors.sage)
            }
            .accessibilityIdentifier("decisionOption.selected")
        } else if !viewModel.isResolved {
            PatinaButton(
                "Choose this",
                style: .primary,
                isLoading: viewModel.isSubmitting && viewModel.pendingOptionId == option.id,
                isEnabled: !viewModel.isSubmitting
            ) {
                viewModel.beginSelection(optionId: option.id)
            }
            .accessibilityIdentifier("decisionOption.choose")
        }
    }

    private func errorView(_ msg: String) -> some View {
        VStack(spacing: 12) {
            Text(msg)
                .font(PatinaTypography.bodySmall)
                .foregroundStyle(PatinaColors.mocha)
            Button("Try Again") {
                Task { await viewModel.load(decisionId: decisionId) }
            }
            .font(PatinaTypography.bodySmallMedium)
            .foregroundStyle(PatinaColors.Text.interactive)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 80)
    }
}

// MARK: - Consent Sheet

/// Captures the client's consent before committing a decision. Two modes,
/// mirroring `client_decisions.client_consent_method` (migration 00117):
///   • Click-through  — a single confirm tap.
///   • E-signature    — the client types their full legal name.
/// The choice is fed back to the caller via `onConfirm(method, signature?)`.
private struct DecisionConsentSheet: View {
    let optionTitle: String
    let isSubmitting: Bool
    let onConfirm: (DecisionsAPIClient.ConsentMethod, String?) -> Void
    let onCancel: () -> Void

    @State private var requireSignature = false
    @State private var signature = ""
    @Environment(\.dismiss) private var dismiss

    private var canConfirm: Bool {
        if requireSignature {
            return !signature.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        }
        return true
    }

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 20) {
                VStack(alignment: .leading, spacing: 6) {
                    MonoLabel(text: "CONFIRM YOUR CHOICE")
                        .tracking(2)
                    Text(optionTitle)
                        .font(PatinaTypography.h3)
                        .foregroundStyle(PatinaColors.charcoal)
                    Text("Approving sends your decision to your designer and unblocks any work waiting on it.")
                        .font(PatinaTypography.bodySmall)
                        .foregroundStyle(PatinaColors.mocha)
                }

                Toggle(isOn: $requireSignature) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Add my signature")
                            .font(PatinaTypography.bodySmallMedium)
                            .foregroundStyle(PatinaColors.charcoal)
                        Text("Type your full name to e-sign this approval.")
                            .font(PatinaTypography.caption)
                            .foregroundStyle(PatinaColors.agedOak)
                    }
                }
                .tint(PatinaColors.clay)

                if requireSignature {
                    PatinaTextField(
                        "Full name",
                        text: $signature,
                        label: "Signature",
                        icon: "signature",
                        textContentType: .name,
                        autocapitalization: .words
                    )
                    .accessibilityIdentifier("decisionConsent.signatureField")
                }

                PatinaButton(
                    "Approve",
                    style: .clay,
                    isLoading: isSubmitting,
                    isEnabled: canConfirm && !isSubmitting
                ) {
                    let method: DecisionsAPIClient.ConsentMethod =
                        requireSignature ? .electronicSignature : .clickThrough
                    let sig = requireSignature
                        ? signature.trimmingCharacters(in: .whitespacesAndNewlines)
                        : nil
                    onConfirm(method, sig)
                }
                .accessibilityIdentifier("decisionConsent.approve")

                PatinaButton("Cancel", style: .ghost, isEnabled: !isSubmitting) {
                    onCancel()
                    dismiss()
                }
            }
            .padding(24)
        }
        .background(PatinaColors.offWhite)
    }
}

#Preview {
    NavigationStack {
        DecisionDetailView(decisionId: "preview")
    }
}
