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
//  W1-B-03 (the no-options line) and W1-B-08 (the deferral pair's two layout
//  branches) took this past SwiftLint's 500-line `file_length`. The consent
//  sheet below is the obvious thing to lift out, and four suites in three
//  other lanes read it AT THIS PATH — `DecisionSheetDetentTests`,
//  `MoneyAndStudioCopyTests`, `TapTargetTests`, `TopBandFoldTests` — so the
//  split is a wave-wide edit, not a hygiene one. Scoped here instead; the
//  split belongs to W2's R3 pass, with those pins.
// swiftlint:disable file_length

import SwiftUI

struct DecisionDetailView: View {
    let decisionId: String
    @State private var viewModel = DecisionDetailViewModel()
    @Environment(\.appCoordinator) private var coordinator
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 24) {
                if let decision = viewModel.decision {
                    header(decision)
                    submitFailureBanner(decision)
                    if viewModel.hasNoRenderableOptions {
                        // SP-17: never a stack of blank, untappable cards.
                        Text(DecisionOptionCopy.allUnavailableLine)
                            .font(PatinaTypography.bodySmall)
                            .foregroundStyle(PatinaColors.Text.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(.horizontal, 24)
                            .accessibilityIdentifier("decisionDetail.optionsPending")
                    } else if viewModel.awaitsClientSignoff {
                        // W1-B-03: the act the screen had no shape for. An
                        // Approval decision carries no options BY DESIGN — the
                        // absence is what it is, not a gap — and 00564's
                        // `approve_client_signoff` is what resolves it. It goes
                        // through the same consent step as a choice, because it
                        // is the same contractual moment.
                        signoffAction
                    } else if viewModel.hasNoOptionsAtAll {
                        // A decision with no options that is NOT a sign-off is
                        // still waiting on its designer, and still says so.
                        Text(DecisionOptionCopy.nothingToChooseYetLine)
                            .font(PatinaTypography.bodySmall)
                            .foregroundStyle(PatinaColors.Text.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(.horizontal, 24)
                            .accessibilityIdentifier("decisionDetail.noOptions")
                    } else {
                        ForEach(viewModel.options) { option in
                            optionCard(option)
                        }
                    }
                    deferralActs(decision)
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
            .padding(.bottom, MoneyScreenMetrics.bottomClearance(houseFirst: coordinator.isHouseFirstRoot))
        }
        .background(PatinaColors.Background.primary)
        // U18: standard pushed-screen chrome — the header above carries
        // the title, so the chrome adds only the back chevron.
        .patinaScreen(title: nil)
        .task { await viewModel.load(decisionId: decisionId) }
        // C4-12 (L1-B's note C-L1B-2): exactly what the `.task` above calls.
        .refreshable { await viewModel.load(decisionId: decisionId) }
        .sheet(item: $viewModel.pendingDeferral) { deferral in
            DecisionDeferSheet(
                deferral: deferral,
                decisionTitle: viewModel.decision?.title,
                isSending: viewModel.isSendingDeferral,
                failure: viewModel.deferralFailure,
                onSend: { note in
                    Task {
                        if let threadId = await viewModel.sendDeferral(note: note) {
                            coordinator.navigate(to: .threadDetail(threadId: threadId))
                        }
                    }
                },
                onCancel: { viewModel.cancelDeferral() }
            )
            .presentationDetents(DecisionSheetDetents.detents(for: dynamicTypeSize))
        }
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
                .presentationDetents(DecisionSheetDetents.detents(for: dynamicTypeSize))
            } else if viewModel.isApprovingSignoff {
                // W1-B-03: the same sheet, the same contractual moment, named
                // for the act. A sign-off has no option to put in the title, so
                // the subject is the decision itself.
                DecisionConsentSheet(
                    eyebrow: DecisionOptionCopy.signoffConsentEyebrow,
                    optionTitle: viewModel.decision?.title ?? "this sign-off",
                    isSubmitting: viewModel.isSubmitting,
                    onConfirm: { consent, signature in
                        Task {
                            await viewModel.confirmSignoff(
                                decisionId: decisionId,
                                consent: consent,
                                signature: signature
                            )
                        }
                    },
                    onCancel: { viewModel.cancelSignoff() }
                )
                .presentationDetents(DecisionSheetDetents.detents(for: dynamicTypeSize))
            }
        }
    }

    /// The option the client tapped "Choose this" on, resolved from the VM.
    private var pendingOption: RemoteDecisionOption? {
        guard let id = viewModel.pendingOptionId else { return nil }
        return viewModel.options.first(where: { $0.id == id })
    }

    /// `.sheet(isPresented:)` binding driven by whichever act is pending — an
    /// option the client tapped, or the sign-off (`W1-B-03`), which has no
    /// option to remember. Dismissing the sheet (swipe or Cancel) clears both.
    private var consentSheetBinding: Binding<Bool> {
        Binding(
            get: { viewModel.pendingOptionId != nil || viewModel.isApprovingSignoff },
            set: {
                if !$0 {
                    viewModel.cancelSelection()
                    viewModel.cancelSignoff()
                }
            }
        )
    }

    /// `W1-B-03`: one line saying whose the decision is, and the act.
    private var signoffAction: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(DecisionOptionCopy.signoffPrompt)
                .font(PatinaTypography.bodySmall)
                .foregroundStyle(PatinaColors.Text.secondary)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("decisionDetail.signoffPrompt")

            PatinaButton(
                DecisionOptionCopy.signoffAction,
                style: .primary,
                isLoading: viewModel.isSubmitting && viewModel.isApprovingSignoff,
                isEnabled: !viewModel.isSubmitting
            ) {
                viewModel.beginSignoff()
            }
            .accessibilityIdentifier("decisionDetail.signoff")
        }
        .padding(.horizontal, 24)
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
            // SP-15: the date reached the Studio hub and stopped there; the
            // decision itself never said where it stood. P-04 / R8: past its
            // date it is the ruled sentence in body ink, never red.
            if !viewModel.isResolved, let standing = DateDisplay.approval(dueDate: decision.due_date, askedAt: decision.created_at) {
                Text(standing.text)
                    .font(PatinaTypography.bodySmallMedium)
                    .foregroundStyle(standing.isStillOpen ? PatinaColors.Text.primary : PatinaColors.Text.secondary)
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
                HStack(spacing: 18) {
                    Button(failure.retryLabel) {
                        viewModel.retrySelection()
                    }
                    .font(PatinaTypography.bodySmallMedium)
                    .foregroundStyle(PatinaColors.Text.interactive)
                    .accessibilityIdentifier("decisionDetail.failure.retry")
                    if failure.offersDesignerMessage, viewModel.messageRoute != nil {
                        Button("Message your designer") {
                            Task {
                                if let threadId = await viewModel.messageDesigner() {
                                    coordinator.navigate(to: .threadDetail(threadId: threadId))
                                }
                            }
                        }
                        .font(PatinaTypography.bodySmallMedium)
                        .foregroundStyle(PatinaColors.Text.interactive)
                        .accessibilityIdentifier("decisionDetail.failure.message")
                    }
                }
                .frame(minHeight: 44)
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
            Text("You’ve responded to this decision")
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
                        // SP-17: client-voiced. The old line sent a homeowner
                        // to a portal she cannot open.
                        Text(DecisionOptionCopy.unavailableLine)
                            .font(PatinaTypography.bodySmall)
                            .foregroundStyle(PatinaColors.Text.muted)
                    }
                }
                Spacer()
                if isRecommended {
                    Text("Recommended")
                        // C-06: the badge is one word in a capsule beside a
                        // title that takes the rest of the row. At
                        // accessibility-extra-large the capsule was squeezed
                        // below the word's own width and it wrapped inside
                        // itself — "Recommende / d". One line, tightened, and
                        // never split.
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
}

// MARK: - The acts below the options

/// `W1-B-08` grew the deferral pair into two layout branches and a shared
/// control, which took `DecisionDetailView`'s body past SwiftLint's 300-line
/// `type_body_length`. These four are a different job from the screen's
/// composition above — the acts that do NOT resolve the decision — so they
/// move to an extension rather than buying a scoped disable.
extension DecisionDetailView {

    /// SP-17: the two answers a real client gives, alongside the choices.
    /// Neither resolves the decision — both open a note into the thread with
    /// her designer and leave the decision `pending`. They draw only where
    /// there is a thread to reach: a decision with no project and no designer
    /// relationship has nowhere to send a note, and an act that cannot succeed
    /// is not offered.
    @ViewBuilder
    private func deferralActs(_ decision: RemoteClientDecision) -> some View {
        if !viewModel.isResolved, viewModel.canDefer {
            VStack(alignment: .leading, spacing: 10) {
                if let sent = viewModel.sentDeferral {
                    Text("You told your designer: \(sent.actLabel.lowercased()). This decision is still open.")
                        .font(PatinaTypography.caption)
                        .foregroundStyle(PatinaColors.Text.muted)
                        .accessibilityIdentifier("decisionDetail.deferralSent")
                }
                // W1-B-08: the pair sat shoulder to shoulder with a 12 pt
                // gutter, and at accessibility sizes the two labels grew into
                // one run of text with their tap targets touching — "Not
                // yetNeither of these". Above `.accessibility1` they stack,
                // each full width; below it the gutter is a real one and each
                // label holds its own line.
                if dynamicTypeSize.isAccessibilitySize {
                    VStack(alignment: .leading, spacing: 4) {
                        ForEach(DecisionDeferral.allCases) { deferral in
                            deferralAct(deferral)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                } else {
                    HStack(spacing: 24) {
                        ForEach(DecisionDeferral.allCases) { deferral in
                            deferralAct(deferral)
                        }
                        Spacer(minLength: 0)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 24)
        }
    }

    /// One deferral act, so both layout branches in `deferralActs` draw the
    /// same control rather than two copies that can drift (`W1-B-08`).
    private func deferralAct(_ deferral: DecisionDeferral) -> some View {
        Button(deferral.actLabel) {
            viewModel.beginDeferral(deferral)
        }
        .font(PatinaTypography.bodySmallMedium)
        .foregroundStyle(PatinaColors.Text.interactive)
        .fixedSize(horizontal: false, vertical: true)
        .frame(minHeight: 44)
        .contentShape(Rectangle())
        .accessibilityIdentifier("decisionDetail.defer.\(deferral.rawValue)")
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

// MARK: - Sheet detents

/// GAP1B-01 / GAP1B-02. Both decision sheets were declared
/// `.presentationDetents([.medium, .large])`, and a sheet offered `.medium`
/// rests there. At `accessibility-extra-large` the content grew ~2.5x inside
/// a half-screen sheet: Approve rendered ~17 pt of its 49.9 pt on an 874 pt
/// display, Cancel sat 58 pt below the edge, and `showsIndicators: false`
/// hid that the sheet scrolled at all. The consent sheet is the app's
/// e-signature surface — it had no reachable primary act and no reachable
/// way out.
///
/// Above `.accessibility1` there is one honest answer and it is the whole
/// screen. Below it the two-detent sheet is unchanged.
enum DecisionSheetDetents {
    static func detents(for size: DynamicTypeSize) -> Set<PresentationDetent> {
        size.isAccessibilitySize ? [.large] : [.medium, .large]
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
    /// `W1-B-03`: the same sheet serves a choice and a sign-off, and names
    /// which it is. Defaulted, so the option path is unchanged.
    var eyebrow: String = "CONFIRM YOUR CHOICE"
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
                    MonoLabel(text: eyebrow)
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

            }
            .padding(24)
        }
        .background(PatinaColors.Background.primary)
        .patinaTopBand()
        // GAP1B-01: the act does not travel with the scroll. An inset keeps
        // both controls on screen at every text size and every offset.
        .safeAreaInset(edge: .bottom, spacing: 0) {
            VStack(spacing: 12) {
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

                // GAP1B-07: `.ghost` renders as bare left-aligned text and
                // measured 17.6 pt against the 44 pt floor. `.secondary` is
                // the same component, full width and 52 pt tall.
                PatinaButton("Cancel", style: .secondary, isEnabled: !isSubmitting) {
                    onCancel()
                    dismiss()
                }
            }
            .padding(.horizontal, 24)
            .padding(.top, 12)
            .padding(.bottom, 16)
            .background(PatinaColors.Background.primary)
        }
    }
}

#Preview {
    NavigationStack {
        DecisionDetailView(decisionId: "preview")
    }
}
