//
//  ServiceAcceptanceDetailView.swift
//  Patina
//
//  US-52 WP-10C-d. One agreed-services request. A required signer on a sent
//  request gets three acts of one weight (Accept / Accept with conditions /
//  Return); everyone else reads it. Unknown values from a newer server read
//  as read-only.
//

import SwiftUI

struct ServiceAcceptanceDetailView: View {
    @Bindable var model: ServiceAcceptanceModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ScrollView(showsIndicators: false) {
            ServiceAcceptanceDetailContent(model: model)
                .padding(24)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(PatinaColors.Background.primary)
        .patinaTopBand()
        .safeAreaInset(edge: .bottom, spacing: 0) { footer }
        .presentationDragIndicator(.visible)
        .interactiveDismissDisabled(model.isSubmitting)
    }

    // MARK: - Footer

    /// Pinned, as on the defer sheet, so the commitment never falls below
    /// the fold at large text sizes.
    @ViewBuilder
    private var footer: some View {
        VStack(spacing: 12) {
            if let request = model.presentedRequest, model.canRespond(request), let choice = model.choice {
                PatinaButton(
                    model.refusal == .failed
                        ? ServiceAcceptanceCopy.tryAgain : ServiceAcceptanceCopy.submitLabel(choice),
                    style: .primary,
                    isLoading: model.isSubmitting,
                    isEnabled: model.canSubmit
                ) {
                    Task { await model.submit(for: request) }
                }
                .accessibilityIdentifier("serviceAcceptance.submit")
                PatinaButton(ServiceAcceptanceCopy.back, style: .secondary, isEnabled: !model.isSubmitting) {
                    model.choose(nil)
                }
            } else {
                PatinaButton(ServiceAcceptanceCopy.close, style: .secondary) { dismiss() }
                    .accessibilityIdentifier("serviceAcceptance.close")
            }
        }
        .padding(.horizontal, 24)
        .padding(.top, 12)
        .padding(.bottom, 16)
        .background(PatinaColors.Background.primary)
    }
}

/// The scrolling body of the sheet, split out so it renders on its own.
struct ServiceAcceptanceDetailContent: View {
    @Bindable var model: ServiceAcceptanceModel

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            if let request = model.presentedRequest {
                let settled = model.settled[request.requestId]
                header(request, settled: settled)
                references(request)
                if settled == nil, let note = ServiceAcceptanceCopy.roleNote(request) {
                    Text(note)
                        .font(PatinaTypography.bodySmall)
                        .foregroundStyle(PatinaColors.Text.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("serviceAcceptance.roleNote")
                }
                if let settled { settledSection(settled) }
                responses(request)
                if model.canRespond(request) { respondSection(request) }
            } else if model.isLoading || model.isFirstLoad {
                PatinaLoadingState()
            } else {
                Text(model.loadFailed ? ServiceAcceptanceCopy.loadFailed : ServiceAcceptanceCopy.unavailable)
                    .font(PatinaTypography.bodySmall)
                    .foregroundStyle(PatinaColors.Text.secondary)
            }
            refusalLine
        }
    }

    // MARK: - Read

    private func header(_ request: RemoteServiceAcceptanceRequest, settled: ServiceAcceptanceSettled?) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            MonoLabel(text: "\(ServiceAcceptanceCopy.eyebrow) · \(ServiceAcceptanceCopy.requestNumber(request.requestNumber))")
                .tracking(2)
            Text(ServiceAcceptanceCopy.detailTitle)
                .font(PatinaTypography.h3)
                .foregroundStyle(PatinaColors.Text.primary)
            Text(ServiceAcceptanceCopy.intro)
                .font(PatinaTypography.bodySmall)
                .foregroundStyle(PatinaColors.Text.secondary)
                .fixedSize(horizontal: false, vertical: true)
            if let sentAt = request.sentAt {
                Text(ServiceAcceptanceCopy.sent(DateDisplay.fromTimestamp(sentAt)))
                    .font(PatinaTypography.captionSmall)
                    .foregroundStyle(PatinaColors.Text.muted)
            }
            Text(ServiceAcceptanceCopy.status(request, settled: settled))
                .font(PatinaTypography.bodySmallMedium)
                .foregroundStyle(PatinaColors.Text.primary)
                .padding(.top, 4)
                .accessibilityIdentifier("serviceAcceptance.status")
        }
    }

    /// F1: the exact references the request binds, drawn before any act.
    private func references(_ request: RemoteServiceAcceptanceRequest) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            MonoLabel(text: ServiceAcceptanceCopy.referencesTitle(request))
            reference(ServiceAcceptanceCopy.scopeEditionLabel, request.scopeEditionId)
            reference(ServiceAcceptanceCopy.scopeReference(request.scopeContentHash), request.scopeContentHash)
            reference(ServiceAcceptanceCopy.evidenceReference(request.evidenceManifestHash),
                      request.evidenceManifestHash)
            help(ServiceAcceptanceCopy.referencesNote)
        }
        .accessibilityIdentifier("serviceAcceptance.references")
    }

    private func reference(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(PatinaTypography.bodySmallMedium)
                .foregroundStyle(PatinaColors.Text.primary)
            Text(value)
                .font(PatinaTypography.caption)
                .foregroundStyle(PatinaColors.Text.secondary)
                .fixedSize(horizontal: false, vertical: true)
                .textSelection(.enabled)
        }
        .accessibilityElement(children: .combine)
    }

    /// F4: acknowledged by the server, or settled by a refusal, and not yet
    /// reconciled by a good read. Read-only, with a way to reload.
    private func settledSection(_ settled: ServiceAcceptanceSettled) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            if let answer = settled.answer {
                MonoLabel(text: ServiceAcceptanceCopy.recorded)
                Text(ServiceAcceptanceCopy.response(answer.recordedKind))
                    .font(PatinaTypography.bodySmallMedium)
                    .foregroundStyle(PatinaColors.Text.primary)
                ForEach(Array(answer.conditionTexts.enumerated()), id: \.offset) { _, text in
                    Text("• \(text)")
                        .font(PatinaTypography.caption)
                        .foregroundStyle(PatinaColors.Text.primary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if let reason = answer.returnReason {
                    Text(reason)
                        .font(PatinaTypography.caption)
                        .foregroundStyle(PatinaColors.Text.primary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            if model.loadFailed {
                help(ServiceAcceptanceCopy.refreshFailed)
            }
            Button(ServiceAcceptanceCopy.reload) { Task { await model.reload() } }
                .font(PatinaTypography.bodySmallMedium)
                .foregroundStyle(PatinaColors.Text.interactive)
                .disabled(model.isLoading)
                .accessibilityIdentifier("serviceAcceptance.settled.reload")
        }
        .accessibilityIdentifier("serviceAcceptance.settled")
    }

    private func responses(_ request: RemoteServiceAcceptanceRequest) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            MonoLabel(text: ServiceAcceptanceCopy.responsesLabel)
            ForEach(request.signers) { signer in
                signerRow(signer, isViewer: signer.signerId == request.viewerSignerId)
            }
        }
    }

    private func signerRow(_ signer: RemoteServiceAcceptanceSigner, isViewer: Bool) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline) {
                Text(isViewer ? ServiceAcceptanceCopy.you : ServiceAcceptanceCopy.slot(signer.slot))
                    .font(PatinaTypography.bodySmallMedium)
                    .foregroundStyle(PatinaColors.Text.primary)
                Spacer(minLength: 12)
                MonoLabel(text: signer.required ? ServiceAcceptanceCopy.required : ServiceAcceptanceCopy.optional)
            }
            Text(responseLine(signer.response))
                .font(PatinaTypography.caption)
                .foregroundStyle(PatinaColors.Text.secondary)
            if let response = signer.response {
                ForEach(Array(response.conditions.enumerated()), id: \.offset) { _, condition in
                    Text("• \(condition.text)")
                        .font(PatinaTypography.caption)
                        .foregroundStyle(PatinaColors.Text.primary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if let reason = response.returnReason, !reason.isEmpty {
                    Text(reason)
                        .font(PatinaTypography.caption)
                        .foregroundStyle(PatinaColors.Text.primary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(PatinaColors.Background.secondary)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .accessibilityElement(children: .combine)
    }

    private func responseLine(_ response: RemoteServiceAcceptanceResponse?) -> String {
        guard let response else { return ServiceAcceptanceCopy.noResponseYet }
        let verb = ServiceAcceptanceCopy.response(response.response)
        guard let method = ServiceAcceptanceCopy.method(response.method) else { return verb }
        return "\(verb) \(method)"
    }

    // MARK: - Respond

    @ViewBuilder
    private func respondSection(_ request: RemoteServiceAcceptanceRequest) -> some View {
        if let choice = model.choice {
            VStack(alignment: .leading, spacing: 14) {
                MonoLabel(text: ServiceAcceptanceCopy.choiceLabel(choice))
                switch choice {
                case .accept:
                    statement(ServiceAcceptanceCopy.acceptStatement(request))
                case .acceptWithConditions:
                    conditionsComposer
                    statement(ServiceAcceptanceCopy.acceptStatement(request))
                case .returnToStudio:
                    returnComposer
                    statement(ServiceAcceptanceCopy.returnStatement)
                }
                if let issue = model.draftIssue, let line = ServiceAcceptanceCopy.issue(issue) {
                    Text(line)
                        .font(PatinaTypography.caption)
                        .foregroundStyle(PatinaColors.Text.error)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("serviceAcceptance.issue")
                }
            }
        } else {
            // P-16: three doors, one weight.
            VStack(spacing: 12) {
                ForEach(ServiceAcceptanceChoice.allCases) { choice in
                    PatinaButton(
                        ServiceAcceptanceCopy.choiceLabel(choice),
                        style: .secondary,
                        isEnabled: !model.isSubmitting
                    ) {
                        model.choose(choice)
                    }
                    .accessibilityIdentifier("serviceAcceptance.choose.\(choice)")
                }
            }
        }
    }

    private func statement(_ text: String) -> some View {
        Text(text)
            .font(PatinaTypography.bodySmall)
            .foregroundStyle(PatinaColors.Text.primary)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityIdentifier("serviceAcceptance.statement")
    }

    private var conditionsComposer: some View {
        VStack(alignment: .leading, spacing: 8) {
            MonoLabel(text: ServiceAcceptanceCopy.conditionsLabel)
            ForEach(model.conditions.indices, id: \.self) { index in
                noteField(
                    ServiceAcceptanceCopy.conditionPlaceholder,
                    text: $model.conditions[index]
                )
                .accessibilityIdentifier("serviceAcceptance.condition.\(index)")
            }
            if model.canAddCondition {
                Button(ServiceAcceptanceCopy.addCondition) { model.addCondition() }
                    .font(PatinaTypography.bodySmallMedium)
                    .foregroundStyle(PatinaColors.Text.interactive)
                    .accessibilityIdentifier("serviceAcceptance.addCondition")
            }
            help(ServiceAcceptanceCopy.conditionsHelp)
        }
    }

    private var returnComposer: some View {
        VStack(alignment: .leading, spacing: 8) {
            MonoLabel(text: ServiceAcceptanceCopy.returnLabel)
            noteField(ServiceAcceptanceCopy.returnPlaceholder, text: $model.returnReason)
                .accessibilityIdentifier("serviceAcceptance.returnReason")
            help(ServiceAcceptanceCopy.returnHelp)
        }
    }

    private func noteField(_ placeholder: String, text: Binding<String>) -> some View {
        TextField(placeholder, text: text, axis: .vertical)
            .lineLimit(2...6)
            .font(PatinaTypography.bodySmall)
            .foregroundStyle(PatinaColors.Text.primary)
            .textFieldStyle(.plain)
            .padding(12)
            .overlay {
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .strokeBorder(PatinaColors.Border.strong, lineWidth: 1)
            }
    }

    private func help(_ text: String) -> some View {
        Text(text)
            .font(PatinaTypography.caption)
            .foregroundStyle(PatinaColors.Text.muted)
            .fixedSize(horizontal: false, vertical: true)
    }

    @ViewBuilder
    private var refusalLine: some View {
        if let refusal = model.refusal {
            VStack(alignment: .leading, spacing: 8) {
                Text(ServiceAcceptanceCopy.refusal(refusal))
                    .font(PatinaTypography.caption)
                    .foregroundStyle(refusal == .paused ? PatinaColors.Text.secondary : PatinaColors.Text.error)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("serviceAcceptance.refusal")
                if refusal == .stale {
                    Button(ServiceAcceptanceCopy.reload) { Task { await model.reload() } }
                        .font(PatinaTypography.bodySmallMedium)
                        .foregroundStyle(PatinaColors.Text.interactive)
                        .accessibilityIdentifier("serviceAcceptance.reload")
                }
            }
        }
    }
}
