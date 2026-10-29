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
    @State private var documentError: String?
    @State private var documentLoading: String?
    @State private var previewURL: IdentifiableURL?

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            if let request = model.presentedRequest {
                let settled = model.settlement(for: request)
                header(request, settled: settled)
                references(request)
                evidenceSection
                if settled == nil, let note = ServiceAcceptanceCopy.roleNote(request) {
                    Text(note)
                        .font(PatinaTypography.bodySmall)
                        .foregroundStyle(PatinaColors.Text.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("serviceAcceptance.roleNote")
                }
                if let settled { settledSection(settled) }
                responses(request)
                if let reading = model.studioService(for: request) { StudioServiceSection(reading: reading) }
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
        // Re-read when another request opens or this one's outcome lands.
        .task(id: evidenceKey) {
            documentError = nil
            documentLoading = nil
            if let request = model.presentedRequest { await model.loadEvidence(for: request) }
        }
        .onChange(of: model.evidenceFailed) { _, failed in
            if failed {
                let canRespond = model.presentedRequest.map(model.canRespond) ?? false
                AccessibilityNotification.Announcement(ServiceAcceptanceCopy.evidenceError(canRespond: canRespond)).post()
            }
        }
        .task(id: studioServiceKey) {
            if let request = model.presentedRequest { await model.loadStudioService(for: request) }
        }
        .fullScreenCover(item: $previewURL) { item in
            DocumentQuickLook(fileURL: item.url) { previewURL = nil }
                .ignoresSafeArea()
        }
    }

    private var evidenceKey: String? {
        model.presentedRequest.map {
            "\($0.requestId)|\($0.requestNumber)|\($0.scopeEditionId)|\($0.scopeContentHash)|\($0.evidenceManifestHash)"
        }
    }

    private var studioServiceKey: String? {
        model.presentedRequest.map { "\($0.requestId)|\($0.aggregateOutcome.rawValue)" }
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
        }
        .accessibilityIdentifier("serviceAcceptance.references")
    }

    private var evidenceSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            if let evidence = model.presentedEvidence, model.evidenceReady {
                VStack(alignment: .leading, spacing: 16) {
                    MonoLabel(text: "Agreed scope")
                    ForEach(evidence.scope.packages) { package in
                        VStack(alignment: .leading, spacing: 5) {
                            Text("\(package.label) · \(ServiceAcceptanceCopy.inclusion(package.inclusion))")
                                .font(PatinaTypography.bodySmallMedium)
                            if let condition = package.conditionText { help(condition) }
                            if let design = ServiceAcceptanceCopy.party(package.responsibilities.design) {
                                help("Design: \(design)")
                            }
                            if let purchasing = ServiceAcceptanceCopy.party(package.responsibilities.purchasing) {
                                help("Purchasing: \(purchasing)")
                            }
                            if let installation = ServiceAcceptanceCopy.party(package.responsibilities.installation) {
                                help("Installation: \(installation)")
                            }
                            ForEach(Array(package.phases.enumerated()), id: \.offset) { _, phase in
                                help("\(phase.name) · \(ServiceAcceptanceCopy.service(phase.service))")
                            }
                        }
                        .padding(package.inclusion == "excluded" ? 12 : 0)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(package.inclusion == "excluded" ? PatinaColors.Background.secondary : PatinaColors.Background.primary)
                    }
                    MonoLabel(text: "Issued evidence")
                    ForEach(Array(evidence.evidence.members.enumerated()), id: \.offset) { index, member in
                        VStack(alignment: .leading, spacing: 5) {
                            Text(member.title).font(PatinaTypography.bodySmallMedium)
                            help(ServiceAcceptanceCopy.source(member.kind))
                            if let issuedAt = member.issuedAt { help("Issued \(DateDisplay.fromTimestamp(issuedAt))") }
                            if let content = member.content { AcceptanceEvidenceValue(value: content) }
                            ForEach(Array(member.documents.enumerated()), id: \.offset) { documentIndex, document in
                                let documentKey = "\(index)|\(documentIndex)"
                                Button(document.title) {
                                    documentLoading = documentKey
                                    documentError = nil
                                    Task {
                                        defer { documentLoading = nil }
                                        do {
                                            let url = try await DocumentsAPIClient.shared.downloadedFileURL(
                                                storagePath: document.path, title: document.title)
                                            previewURL = IdentifiableURL(url: url)
                                        } catch {
                                            documentError = documentKey
                                            AccessibilityNotification.Announcement(ServiceAcceptanceCopy.documentError(document.title)).post()
                                        }
                                    }
                                }
                                .disabled(documentLoading != nil)
                                .font(PatinaTypography.bodySmallMedium)
                                .foregroundStyle(PatinaColors.Text.interactive)
                                .accessibilityHint(documentError == documentKey
                                    ? ServiceAcceptanceCopy.documentError(document.title) : "Opens this issued document.")
                                if documentError == documentKey {
                                    help(ServiceAcceptanceCopy.documentError(document.title))
                                }
                            }
                        }
                    }
                }
                .accessibilityIdentifier("serviceAcceptance.evidence")
            } else if model.evidenceChanged {
                VStack(alignment: .leading, spacing: 8) {
                    Text(ServiceAcceptanceCopy.evidenceChanged)
                        .font(PatinaTypography.bodySmall)
                        .foregroundStyle(PatinaColors.Text.error)
                    Button(ServiceAcceptanceCopy.reviewAgain) { Task { await model.reload() } }
                        .font(PatinaTypography.bodySmallMedium)
                        .foregroundStyle(PatinaColors.Text.interactive)
                }
            } else if model.evidenceFailed {
                VStack(alignment: .leading, spacing: 8) {
                    Text(ServiceAcceptanceCopy.evidenceError(canRespond: model.presentedRequest.map(model.canRespond) ?? false))
                        .font(PatinaTypography.bodySmall)
                        .foregroundStyle(PatinaColors.Text.error)
                    Button(ServiceAcceptanceCopy.tryAgain) {
                        Task {
                            await model.retryEvidence()
                            if model.evidenceReady {
                                AccessibilityNotification.Announcement(ServiceAcceptanceCopy.evidenceLoaded).post()
                            }
                        }
                    }
                        .font(PatinaTypography.bodySmallMedium)
                        .foregroundStyle(PatinaColors.Text.interactive)
                        .accessibilityIdentifier("serviceAcceptance.evidence.retry")
                }
            } else {
                help("Loading the agreed scope and evidence…")
            }
        }
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
                if model.signersChanged { signersChangedNotice }
            }
        } else {
            // P-16: three doors, one weight.
            VStack(spacing: 12) {
                ForEach(ServiceAcceptanceChoice.allCases) { choice in
                    PatinaButton(
                        ServiceAcceptanceCopy.choiceLabel(choice),
                        style: .secondary,
                        isEnabled: !model.isSubmitting && model.evidenceReady
                    ) {
                        model.choose(choice)
                    }
                    .accessibilityIdentifier("serviceAcceptance.choose.\(choice)")
                    .accessibilityHint(ServiceAcceptanceCopy.evidenceHint(ready: model.evidenceReady))
                }
            }
        }
    }

    /// R3: a read brought another signer policy revision after she picked her
    /// act. Her words are kept; Submit stays off until she reviews again.
    private var signersChangedNotice: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(ServiceAcceptanceCopy.signersChanged)
                .font(PatinaTypography.caption)
                .foregroundStyle(PatinaColors.Text.error)
                .fixedSize(horizontal: false, vertical: true)
            Button(ServiceAcceptanceCopy.reviewAgain) { Task { await model.reviewAgain() } }
                .font(PatinaTypography.bodySmallMedium)
                .foregroundStyle(PatinaColors.Text.interactive)
                .disabled(model.isLoading)
                .accessibilityIdentifier("serviceAcceptance.reviewAgain")
        }
        .accessibilityIdentifier("serviceAcceptance.signersChanged")
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

private struct AcceptanceEvidenceValue: View {
    let value: JSONValue

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            switch value {
            case .object(let facts):
                ForEach(facts.keys.sorted().filter { $0 != "unit" }, id: \.self) { key in
                    HStack(alignment: .top) {
                        Text(ServiceAcceptanceCopy.factLabel(key) + ":")
                        if let fact = facts[key] {
                            if case .some(.string(let unit)) = facts["unit"],
                               case .int(let number) = fact {
                                Text("\(number) \(unit)")
                            } else if case .some(.string(let unit)) = facts["unit"],
                                      case .double(let number) = fact {
                                Text("\(number) \(unit)")
                            } else {
                                AcceptanceEvidenceValue(value: fact)
                            }
                        }
                    }
                }
            case .array(let values):
                ForEach(Array(values.enumerated()), id: \.offset) { _, item in
                    AcceptanceEvidenceValue(value: item)
                }
            case .string(let text): Text(text)
            case .int(let number): Text(String(number))
            case .double(let number): Text(String(number))
            case .bool(let flag): Text(flag ? "Yes" : "No")
            case .null: EmptyView()
            }
        }
        .font(PatinaTypography.caption)
        .foregroundStyle(PatinaColors.Text.secondary)
    }
}
