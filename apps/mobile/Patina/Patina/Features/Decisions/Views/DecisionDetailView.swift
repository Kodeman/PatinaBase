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
    /// `P-30`: which plate the paged spread is resting on, so the page dot
    /// knows which one to fill. Nil on the two other layouts.
    @State private var pagedOptionId: String?
    /// `r1 M2`: the optional signature under the spread. Empty is the ordinary
    /// path, and what an unsigned hold records is `click_through`.
    @State private var spreadSignature = ""
    @Environment(\.appCoordinator) private var coordinator
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    /// `P-30`: the arrival. Reduce Motion takes the still one.
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    /// The namespace the Record row's own `matchedTransitionSource` is in.
    /// Nil where the screen was reached from somewhere that publishes none —
    /// a push notification, a deep link — and the push is then the plain one.
    @Environment(\.decisionZoomNamespace) private var zoomNamespace

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 24) {
                // P-09: the Stage-2 approval is asked FIRST and drawn whole,
                // by itself. It has to be first because 00467 hides the
                // `client_decisions` row from the homeowner being asked, so on
                // her screen there is no `decision` for the branch below to
                // find; and it is drawn whole because the pieces below it —
                // the resolved banner, the option cards, the "Not yet /
                // Neither of these" pair — all answer a question a Stage-2
                // approval does not ask.
                if viewModel.isStage2Approval {
                    ProjectApprovalScreen(viewModel: viewModel)
                } else if let decision = viewModel.decision {
                    header(decision)
                    submitFailureBanner(decision)
                    ceremony(decision)
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
        // `P-30`: the zoom is applied to the DESTINATION; the Record row
        // carries the matching `matchedTransitionSource`. Under Reduce Motion
        // neither the zoom nor the push's slide is drawn — the screen is
        // simply there (`W2R2-n1`'s rule, applied to a push).
        .modifier(
            DecisionArrival(
                decisionId: decisionId,
                namespace: zoomNamespace,
                transition: DecisionSpread.transition(reduceMotion: reduceMotion)
            )
        )
        .sheet(isPresented: consentSheetBinding) {
            if viewModel.isApprovingSignoff {
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

    /// `.sheet(isPresented:)` binding for the one act that still uses the
    /// consent step: the sign-off (`W1-B-03`), which carries no option and no
    /// spread. `P-30` took the option path off this sheet — the named held act
    /// under the plates IS the consent, and a hold that opens a second Approve
    /// button is the stack of submit buttons P-30 replaced, wearing a gesture.
    /// Dismissing the sheet (swipe or Cancel) clears it.
    private var consentSheetBinding: Binding<Bool> {
        Binding(
            get: { viewModel.isApprovingSignoff },
            set: { if !$0 { viewModel.cancelSignoff() } }
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
            // "Approval" is the ask; "decision" is reserved for a choice
            // between named alternatives (`rulings-2026-09-04.md`).
            MonoLabel(text: viewModel.isApprovalAsk ? "APPROVAL" : "DECISION")
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
            if !viewModel.isResolved, let standing = DateDisplay.approval(dueDate: decision.due_date, askedAt: decision.created_at, designer: decision.project?.designer?.askedByName) {
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

    /// `P-17`. The sage `checkmark.seal.fill` is gone: a green check on the
    /// most consequential state is exactly the read VISION §6 refuses, and a
    /// glyph standing in for a state is what the stamp grammar replaces. The
    /// sentence beside it carries the meaning, so the mark itself is hidden
    /// from VoiceOver.
    private var resolvedBanner: some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            PatinaStamp(
                state: Self.resolvedStamp,
                recordedAt: viewModel.decision?.responded_at
                    .flatMap(ISO8601DateParsing.date(from:))
            )
            Text("You’ve responded to this decision")
                .font(PatinaTypography.bodySmallMedium)
                .foregroundStyle(PatinaColors.Text.secondary)
        }
        .padding(.top, 8)
    }

    /// Every client act on the legacy rail says yes to something: choosing a
    /// named option, or giving a sign-off through `approve_client_signoff`.
    /// There is no client-reachable path that records any other outcome on a
    /// non-Stage-2 decision, so APPROVED is the one honest word here. The
    /// Stage-2 ceremony, which has three, stamps its own in
    /// `ProjectApprovalBlock`.
    static let resolvedStamp: PatinaStamp.State = .approved

    /// `P-30`: one plate of the spread. It used to carry its own "Choose this"
    /// submit; now the whole plate is the tap and the act is one, named, and
    /// below the spread.
    ///
    /// `compact` is the side-by-side and paged geometry: half the width, so
    /// the image takes a third less height and the plate still shows its
    /// title, price and note above the fold.
    private func optionCard(_ option: RemoteDecisionOption, compact: Bool = false) -> some View {
        Button {
            viewModel.chooseLeaning(optionId: option.id)
        } label: {
            plate(option, compact: compact)
        }
        .buttonStyle(.plain)
        // A resolved decision's plates are a record, not a control.
        .allowsHitTesting(!viewModel.isResolved)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(
            viewModel.leaningOptionId == option.id ? .isSelected : []
        )
        .accessibilityIdentifier("decisionOption.plate.\(option.id)")
    }

    private func plate(_ option: RemoteDecisionOption, compact: Bool) -> some View {
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
                    .frame(height: compact ? 120 : 180)
                    .clipped()
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            }

            plateNaming(option, hasDetails: hasDetails,
                        isRecommended: isRecommended, compact: compact)

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
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(PatinaColors.Background.secondary)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(plateRule(isSelected: isSelected, isLeaning: viewModel.leaningOptionId == option.id), lineWidth: 1.5)
        )
        // `P-30`: the whole plate is the tap, and the tap is a leaning. A
        // contentless plate is not leanable — the act above it would name
        // nothing — and the view model refuses it for the same reason.
        .contentShape(RoundedRectangle(cornerRadius: 16))
    }

    /// What the plate is called, and the mark that says it is recommended.
    ///
    /// `W3R1-M1`: on a compact plate the capsule takes its intrinsic width
    /// first (C-06 gave it `fixedSize`), so a 171pt plate handed the title
    /// what was left and "Shaker Oak" drew as "Shak…" — the plate could not
    /// say its own name on the exact two-option case this spread was built
    /// for. Side by side, the word goes under the title instead of beside it;
    /// at full width there is room for both on one line, which is where the
    /// mark reads best.
    private func plateNaming(
        _ option: RemoteDecisionOption,
        hasDetails: Bool,
        isRecommended: Bool,
        compact: Bool
    ) -> some View {
        VStack(alignment: .leading, spacing: 6) {
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
                Spacer(minLength: 8)
                if isRecommended, !compact {
                    recommendedCapsule
                }
            }
            if isRecommended, compact {
                recommendedCapsule
            }
        }
    }

    /// The one word, in a capsule. Drawn beside the title at full width and
    /// beneath it on a compact plate — the same mark, never a truncated title.
    private var recommendedCapsule: some View {
        Text("Recommended")
            // C-06: the badge is one word in a capsule beside a title that
            // takes the rest of the row. At accessibility-extra-large the
            // capsule was squeezed below the word's own width and it wrapped
            // inside itself — "Recommende / d". One line, tightened, and never
            // split.
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

    /// The rule around a plate. Mocha is the answer already given; clay is the
    /// leaning, which is the same pigment as the dot inside it and the page
    /// dot below. Nothing else draws a rule — an untouched plate is a plate.
    private func plateRule(isSelected: Bool, isLeaning: Bool) -> Color {
        if isSelected { return PatinaColors.Stamp.mocha }
        return isLeaning ? PatinaColors.clay : .clear
    }

    @ViewBuilder
    private func optionAction(_ option: RemoteDecisionOption, isSelected: Bool, hasDetails: Bool) -> some View {
        if isSelected {
            // `W2R1-M2`: the word and the rule, in mocha. A filled sage
            // checkmark broke three refusals at once on the screen one row
            // from the ceremony — an icon standing in for status, a fill, and
            // sage carrying approval meaning (ruled 2026-09-05: answered
            // marks are mocha; sage keeps the material states).
            Text("Your choice")
                .font(PatinaTypography.bodySmallMedium)
                .foregroundStyle(PatinaColors.Stamp.mocha)
                .accessibilityIdentifier("decisionOption.selected")
        } else if !viewModel.isResolved, viewModel.leaningOptionId == option.id, hasDetails {
            // `P-30`: the leaning mark. A filled clay dot and nothing else —
            // no word, no check, no fill behind the plate. The sentence it
            // stands for is spoken to VoiceOver by the plate's own selected
            // trait, so the dot itself is silent.
            Circle()
                .fill(PatinaColors.clay)
                .frame(width: 10, height: 10)
                .accessibilityHidden(true)
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

    /// Which ceremony a legacy decision gets. One chain, in the order the acts
    /// exclude each other. A Stage-2 approval never reaches here — the body
    /// takes it first — because a `project_artifact_v1` row DOES carry option
    /// rows (one per canonical outcome, which
    /// `_respond_project_approval_checked` looks up by `approval_outcome`) and
    /// drawing them offers "Choose this" over `apply_client_decision`, which
    /// refuses the contract.
    @ViewBuilder
    private func ceremony(_ decision: RemoteClientDecision) -> some View {
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
                spread
            }
    }

    // MARK: - `P-30` · the spread

    /// The plates, then one named act.
    ///
    /// The act is below the whole spread rather than inside each plate: two
    /// full-width submit buttons stacked vertically is a screen asking the
    /// same question twice, and neither of them said what it was agreeing to.
    private var spread: some View {
        VStack(alignment: .leading, spacing: 16) {
            switch DecisionSpread.layout(
                optionCount: viewModel.options.count,
                isAccessibilitySize: dynamicTypeSize.isAccessibilitySize
            ) {
            case .sideBySide: sideBySidePlates
            case .paged: pagedPlates
            case .stacked: stackedPlates
            }
            if !viewModel.isResolved {
                namedAct.padding(.horizontal, 24)
            }
        }
        // The haptic the leaning earns: one selection tick, on the change of
        // which plate is lit, and nothing on the act itself (`HoldToActButton`
        // fires its own).
        .sensoryFeedback(.selection, trigger: viewModel.leaningOptionId)
    }

    /// Two plates, equal, shoulder to shoulder. `maxHeight: .infinity` on each
    /// plate is what makes them equal: the row takes the taller one's height
    /// and both fill it, so a one-line option does not sit in a short card
    /// beside a three-line one and read as the lesser offer.
    private var sideBySidePlates: some View {
        HStack(alignment: .top, spacing: 12) {
            ForEach(viewModel.options) { option in
                optionCard(option, compact: true)
            }
        }
        .fixedSize(horizontal: false, vertical: true)
        .padding(.horizontal, 24)
    }

    /// One plate at a time down the page — the accessibility sizes, and a lone
    /// option.
    private var stackedPlates: some View {
        VStack(spacing: 12) {
            ForEach(viewModel.options) { option in
                optionCard(option)
            }
        }
        .padding(.horizontal, 24)
    }

    /// Three or more: a horizontally paged spread, one plate per page, with a
    /// dot rule beneath it. `.scrollTargetBehavior(.viewAligned)` rather than
    /// a `TabView` page style, which demands a fixed height a plate does not
    /// have.
    ///
    /// `W3R1-M2`: the page inset is the SCROLL VIEW's, not the row's.
    /// `containerRelativeFrame` measures the scroll view and knows nothing
    /// about padding applied inside it, so a `.padding(.horizontal, 24)` on
    /// the `LazyHStack` made every plate a full screen wide starting 24pt in —
    /// 24pt of each one, including the leaning dot that is the whole point of
    /// the tap, hung off the right edge. `safeAreaPadding` insets the
    /// container itself, which is the measurement the frame reads.
    private var pagedPlates: some View {
        VStack(alignment: .leading, spacing: 10) {
            ScrollView(.horizontal) {
                LazyHStack(spacing: 12) {
                    ForEach(viewModel.options) { option in
                        optionCard(option, compact: true)
                            .containerRelativeFrame(.horizontal, count: 1, spacing: 12)
                            .id(option.id)
                    }
                }
                .scrollTargetLayout()
            }
            .safeAreaPadding(.horizontal, 24)
            .scrollTargetBehavior(.viewAligned)
            .scrollIndicators(.hidden)
            .scrollPosition(id: $pagedOptionId)
            .accessibilityHint(DecisionSpread.pagedSpreadLabel)
            pageDots
        }
    }

    /// `P-24` / the refusals: a dot rule, never "2 of 4". The dots are drawn
    /// for the eye and hidden from VoiceOver, which reaches the plates
    /// themselves and hears each one named.
    private var pageDots: some View {
        HStack(spacing: 6) {
            ForEach(viewModel.options) { option in
                Circle()
                    .fill(
                        option.id == (pagedOptionId ?? viewModel.options.first?.id)
                            ? PatinaColors.clay
                            : PatinaColors.Text.muted.opacity(0.3)
                    )
                    .frame(width: 6, height: 6)
            }
        }
        .frame(maxWidth: .infinity)
        .accessibilityHidden(true)
    }

    /// `P-30`: one act, named for what it agrees to, and held rather than
    /// tapped. Until a plate is leaning there is no act — there is the line
    /// that says the tap is safe.
    @ViewBuilder
    private var namedAct: some View {
        if let leaning = viewModel.leaningOption {
            VStack(alignment: .leading, spacing: 12) {
                signatureLine
                // `r1 M2`: what holding it does. The consent sheet carried
                // this sentence and took it with it when P-30 replaced it.
                Text(DecisionSpread.actConsequence)
                    .font(PatinaTypography.bodySmall)
                    .foregroundStyle(PatinaColors.Text.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("decisionSpread.consequence")
                HoldToActButton(
                    title: DecisionSpread.actLabel(optionTitle: leaning.resolvedTitle),
                    isEnabled: !viewModel.isSubmitting && spreadConsent != .tooShort,
                    isBusy: viewModel.isSubmitting
                ) {
                    Task {
                        await viewModel.commitLeaning(
                            decisionId: decisionId,
                            typedName: spreadSignature
                        )
                    }
                }
                .accessibilityIdentifier("decisionSpread.act")
            }
        } else {
            Text(DecisionSpread.leaningPrompt)
                .font(PatinaTypography.bodySmall)
                .foregroundStyle(PatinaColors.Text.secondary)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("decisionSpread.prompt")
        }
    }

    /// What the held act will send, given what is in the name field.
    private var spreadConsent: DecisionSpread.Consent {
        DecisionSpread.consent(forTypedName: spreadSignature)
    }

    /// `r1 M2`. The optional typed name, restored under the spread after
    /// `P-30` retired the consent sheet the option path used to reach
    /// `client_consent_method = 'electronic_signature'` through.
    ///
    /// It is one line and it is never a gate: the act is live over an empty
    /// field, and the only state that holds it back is a field with something
    /// in it too short to be a name — which the line beneath says plainly
    /// rather than leaving a dead control.
    private var signatureLine: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(DecisionSpread.signatureTitle)
                .font(PatinaTypography.bodySmallMedium)
                .foregroundStyle(PatinaColors.Text.primary)
            Text(DecisionSpread.signatureNote)
                .font(PatinaTypography.caption)
                .foregroundStyle(PatinaColors.Text.muted)
                .fixedSize(horizontal: false, vertical: true)
            PatinaTextField(
                DecisionSpread.signatureFieldLabel,
                text: $spreadSignature,
                label: DecisionSpread.signatureFieldLabel,
                icon: "signature",
                textContentType: .name,
                autocapitalization: .words
            )
            .disabled(viewModel.isSubmitting)
            .accessibilityIdentifier("decisionSpread.signatureField")
            if spreadConsent == .tooShort {
                Text(DecisionSpread.signatureTooShort)
                    .font(PatinaTypography.caption)
                    .foregroundStyle(PatinaColors.Text.muted)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("decisionSpread.signatureTooShort")
            }
        }
    }

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
                    Text("You told your designer: \(sent.actLabel.lowercased()). "
                         + "This \(viewModel.isApprovalAsk ? "approval" : "decision") is still open.")
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
                        ForEach(viewModel.availableDeferrals) { deferral in
                            deferralAct(deferral)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                } else {
                    HStack(spacing: 24) {
                        ForEach(viewModel.availableDeferrals) { deferral in
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
