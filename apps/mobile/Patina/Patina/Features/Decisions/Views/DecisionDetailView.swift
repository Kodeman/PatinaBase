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
    @Environment(\.appCoordinator) private var coordinator

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 24) {
                if let decision = viewModel.decision {
                    header(decision)
                    submitFailureBanner(decision)
                    ForEach(viewModel.options) { option in
                        optionCard(option)
                    }
                    if let threadId = viewModel.discussThreadId {
                        discussAction(threadId)
                    }
                } else if let error = viewModel.error {
                    errorView(error)
                } else {
                    PatinaLoadingState()
                        .padding(.top, 80)
                }
            }
            .padding(.bottom, 120)
        }
        .background(PatinaColors.Background.primary)
        // U18: standard pushed-screen chrome — the header above carries
        // the title, so the chrome adds only the back chevron.
        .patinaScreen(title: nil)
        .task { await viewModel.load(decisionId: decisionId) }
        .sheet(isPresented: consentSheetBinding) {
            if let option = pendingOption {
                DecisionConsentSheet(
                    optionTitle: option.resolvedTitle ?? "this option",
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
                .foregroundStyle(PatinaColors.Text.primary)
            if let description = decision.description, !description.isEmpty {
                Text(description)
                    .font(PatinaTypography.bodySmall)
                    .foregroundStyle(PatinaColors.Text.secondary)
            }
            // SP-15: "Overdue · Aug 22" reached the Studio hub and stopped
            // there; the decision itself never said it was late.
            if !viewModel.isResolved, let due = DateDisplay.due(decision.due_date) {
                Text(due.text)
                    .font(PatinaTypography.bodySmallMedium)
                    .foregroundStyle(due.isPastDue ? PatinaColors.error : PatinaColors.Text.secondary)
                    .padding(.top, 2)
                    .accessibilityIdentifier("decisionDetail.due")
            }
            if viewModel.isResolved {
                resolvedBanner
            }
        }
        .padding(.top, 56)
        .padding(.horizontal, 24)
    }

    /// SP-15 / C5: a failed submit is visible, in Patina's voice, where the
    /// client is looking — with the two acts that follow it.
    @ViewBuilder
    private func submitFailureBanner(_ decision: RemoteClientDecision) -> some View {
        if let failure = viewModel.submitFailure {
            VStack(alignment: .leading, spacing: 10) {
                Text(failure.sentence)
                    .font(PatinaTypography.bodySmall)
                    .foregroundStyle(PatinaColors.Text.primary)
                    .fixedSize(horizontal: false, vertical: true)
                if let threadId = viewModel.discussThreadId {
                    Button("Message your designer") {
                        coordinator.navigate(to: .threadDetail(threadId: threadId))
                    }
                    .font(PatinaTypography.bodySmallMedium)
                    .foregroundStyle(PatinaColors.Text.interactive)
                    .frame(minHeight: 44)
                    .accessibilityIdentifier("decisionDetail.failure.message")
                }
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(PatinaColors.error.opacity(0.1))
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .padding(.horizontal, 24)
            .accessibilityIdentifier("decisionDetail.failure")
        }
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
        // R06 render contract: title/description/image resolve through the
        // manual fields first, then the linked product. A card with none of
        // the three must say so and must not be approvable.
        let hasDetails = option.hasRenderableContent

        return VStack(alignment: .leading, spacing: 12) {
            if let imageURL = option.resolvedImageURL {
                PatinaAsyncImage(url: imageURL)
                    .frame(maxWidth: .infinity)
                    .frame(height: 180)
                    .clipped()
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            }

            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    if hasDetails {
                        Text(option.resolvedTitle ?? "Option")
                            .font(PatinaTypography.h5)
                            .foregroundStyle(PatinaColors.Text.primary)
                        if let description = option.resolvedDescription {
                            Text(description)
                                .font(PatinaTypography.caption)
                                .foregroundStyle(PatinaColors.Text.muted)
                        }
                    } else {
                        Text("Details unavailable — view in portal")
                            .font(PatinaTypography.bodySmall)
                            .foregroundStyle(PatinaColors.Text.muted)
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
                if let cents = option.resolvedPriceCents {
                    Text(Self.formattedPrice(cents: cents))
                        .font(PatinaTypography.bodySmallMedium)
                        .foregroundStyle(PatinaColors.Text.secondary)
                }
                Spacer()
                optionAction(option, isSelected: isSelected, hasDetails: hasDetails)
            }
        }
        .padding(16)
        .background(PatinaColors.Background.secondary)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(isSelected ? PatinaColors.sage : .clear, lineWidth: 1.5)
        )
        .padding(.horizontal, 24)
    }

    @ViewBuilder
    private func optionAction(_ option: RemoteDecisionOption, isSelected: Bool, hasDetails: Bool) -> some View {
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
            // Approval is contractual — a contentless card can't be chosen
            // here (R06); PatinaButton's isEnabled dims + disables.
            PatinaButton(
                "Choose this",
                style: .primary,
                isLoading: viewModel.isSubmitting && viewModel.pendingOptionId == option.id,
                isEnabled: !viewModel.isSubmitting && hasDetails
            ) {
                viewModel.beginSelection(optionId: option.id)
            }
            .accessibilityIdentifier("decisionOption.choose")
        }
    }

    /// Cents → "$1,234" (whole dollars), matching the app-wide convention
    /// (see `SavedItem.fullFormattedPrice` / RoomItemRow).
    private static func formattedPrice(cents: Int) -> String {
        let dollars = cents / 100
        return "$\(NumberFormatter.localizedString(from: NSNumber(value: dollars), number: .decimal))"
    }

    /// Quiet R20 affordance: jump to the project's comms thread to talk the
    /// decision over before committing. Only shown when the thread resolved.
    private func discussAction(_ threadId: String) -> some View {
        Button {
            coordinator.navigate(to: .threadDetail(threadId: threadId))
        } label: {
            HStack(spacing: 6) {
                Image(systemName: "bubble.left")
                Text("Discuss this with your designer")
            }
            .font(PatinaTypography.bodySmallMedium)
            .foregroundStyle(PatinaColors.Text.interactive)
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 24)
        .accessibilityIdentifier("decisionDetail.discuss")
    }

    private func errorView(_ msg: String) -> some View {
        PatinaErrorState(
            message: msg,
            action: { Task { await viewModel.load(decisionId: decisionId) } }
        )
        .padding(.top, 80)
    }
}

// MARK: - Consent Sheet

enum DecisionConsentValidation {
    static func normalizedSignature(_ signature: String) -> String {
        signature.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    static func canConfirm(requiresSignature: Bool, signature: String) -> Bool {
        !requiresSignature || normalizedSignature(signature).count >= 2
    }
}

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
        DecisionConsentValidation.canConfirm(
            requiresSignature: requireSignature,
            signature: signature
        )
    }

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 20) {
                VStack(alignment: .leading, spacing: 6) {
                    MonoLabel(text: "CONFIRM YOUR CHOICE")
                        .tracking(2)
                    Text(optionTitle)
                        .font(PatinaTypography.h3)
                        .foregroundStyle(PatinaColors.Text.primary)
                    Text("Approving sends your decision to your designer and unblocks any work waiting on it.")
                        .font(PatinaTypography.bodySmall)
                        .foregroundStyle(PatinaColors.Text.secondary)
                }

                Toggle(isOn: $requireSignature) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Add my signature")
                            .font(PatinaTypography.bodySmallMedium)
                            .foregroundStyle(PatinaColors.Text.primary)
                        Text("Type your full name to e-sign this approval.")
                            .font(PatinaTypography.caption)
                            .foregroundStyle(PatinaColors.Text.muted)
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
                        ? DecisionConsentValidation.normalizedSignature(signature)
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
        .background(PatinaColors.Background.primary)
    }
}

#Preview {
    NavigationStack {
        DecisionDetailView(decisionId: "preview")
    }
}
