//
//  DesignRequestFlowView+Steps.swift
//  Patina
//
//  Step views (details → review → sending → success) + reusable bits for
//  DesignRequestFlowView, split out to keep the primary view file focused on
//  flow state and transitions.
//

import SwiftUI
import SwiftData

extension DesignRequestFlowView {

    // MARK: - Step: details

    var detailsStep: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 24) {
                pickerSection(
                    title: "What kind of help?",
                    options: DesignServiceType.allCases,
                    selection: $projectType,
                    label: { $0.displayName }
                )

                optionalPickerSection(
                    title: "Budget (optional)",
                    options: DesignBudget.allCases,
                    selection: $budget,
                    label: { $0.displayName }
                )

                VStack(alignment: .leading, spacing: 10) {
                    Text("Timeline")
                        .font(PatinaTypography.bodySmallMedium)
                        .foregroundStyle(PatinaColors.Text.secondary)
                    FlowLayout(spacing: 8) {
                        ForEach(DesignTimeline.allCases, id: \.self) { option in
                            chip(option.displayName, isSelected: timeline == option) {
                                timeline = option
                            }
                        }
                    }
                }

                VStack(alignment: .leading, spacing: 10) {
                    Text("Your vision (optional)")
                        .font(PatinaTypography.bodySmallMedium)
                        .foregroundStyle(PatinaColors.Text.secondary)
                    ZStack(alignment: .topLeading) {
                        if requestDescription.isEmpty {
                            Text("I want a space that feels…")
                                .font(PatinaTypography.bodySmall)
                                .foregroundStyle(PatinaColors.Text.muted)
                                .italic()
                                .padding(.horizontal, 14)
                                .padding(.vertical, 12)
                        }
                        TextEditor(text: $requestDescription)
                            .font(PatinaTypography.bodySmall)
                            .foregroundStyle(PatinaColors.Text.primary)
                            .scrollContentBackground(.hidden)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 8)
                    }
                    .frame(minHeight: 100)
                    .background(PatinaColors.Background.secondary)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(PatinaColors.pearl, lineWidth: 1.5)
                    )
                }
            }
            .padding(20)
        }
        .safeAreaInset(edge: .bottom) {
            footer {
                PatinaButton("Review", style: .primary) {
                    step = .review
                }
                .disabled(projectType == nil)
                .opacity(projectType == nil ? 0.5 : 1)
            }
        }
    }

    // MARK: - Step: review

    var reviewStep: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 20) {
                summaryRow("Scans", isRoomless ? "No scan attached" : "\(selectedScanIds.count) selected")
                if let projectType {
                    summaryRow("Help", projectType.displayName)
                }
                if let budget {
                    summaryRow("Budget", budget.displayName)
                }
                summaryRow("Timeline", timeline.displayName)
                if !requestDescription.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    // U46: the user must be able to confirm their own words
                    // before sending — render the vision text verbatim, not
                    // paraphrased or truncated.
                    multilineSummaryRow("Vision", requestDescription)
                }

                if isMetered && !cellularOptedIn {
                    consentCard
                }
                if !syncService.isNetworkAvailable {
                    offlineCard
                }
                if !authService.isAuthenticated {
                    // SP-09: said on the way IN, so the sign-in sheet after
                    // "Send request" is an expected step, not an ejection.
                    Text(DesignRequestAuthCopy.reviewHint)
                        .font(PatinaTypography.caption)
                        .foregroundStyle(PatinaColors.Text.muted)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("designRequest.review.signInHint")
                }
            }
            .padding(20)
        }
        .safeAreaInset(edge: .bottom) {
            footer {
                PatinaButton(sendButtonTitle, style: .primary) {
                    onSendTapped()
                }
            }
        }
    }

    private var consentCard: some View {
        infoCard(
            icon: "antenna.radiowaves.left.and.right",
            title: "This will use cellular data",
            body: "Sending uploads about \(estimatedBytesLabel) over your current connection. Wi-Fi is faster, but you can send now."
        )
    }

    private var offlineCard: some View {
        infoCard(
            icon: "wifi.slash",
            title: "You’re offline",
            body: "We’ll save your request. Reconnect and it will pick up right where you left off."
        )
    }

    private var sendButtonTitle: String {
        syncService.isNetworkAvailable ? "Send request" : "Save request"
    }

    // MARK: - Step: sending

    var sendingStep: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 16) {
                Text(sendingHeadline)
                    .font(PatinaTypography.h4)
                    .foregroundStyle(PatinaColors.Text.primary)

                ForEach(sendingPackages, id: \.scanId) { package in
                    ScanUploadProgressView(package: package)
                }

                if let error = coordinator?.lastError {
                    // C4-09/C5-11: `errorDescription` is now always one of
                    // `DesignServicesError`'s fixed sentences (no raw arm
                    // left), so this `??` branch is a defensive default only.
                    Text(error.errorDescription ?? "Something went wrong. Try again.")
                        .font(PatinaTypography.caption)
                        .foregroundStyle(.orange)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(20)
        }
        .safeAreaInset(edge: .bottom) {
            footer { sendingActions }
        }
    }

    @ViewBuilder
    private var sendingActions: some View {
        if let coordinator {
            if coordinator.isSubmitting {
                HStack(spacing: 10) {
                    ProgressView().tint(PatinaColors.offWhite)
                    Text("Submitting…").font(PatinaTypography.bodySmallMedium)
                }
                .frame(maxWidth: .infinity)
                .frame(height: 48)
            } else if coordinator.draft?.isRoomless == true {
                // Roomless: no uploads. The in-flight submit is the isSubmitting
                // branch above; reaching here means we're idle — a fresh entry
                // or a RESUMED draft (submit never auto-fires on resume). Always
                // offer an explicit submit so a resumed roomless request can't
                // strand on a dead spinner; "Let’s try that again" once an
                // attempt failed.
                PatinaButton(coordinator.lastError != nil ? "Let’s try that again" : "Send request",
                             style: .primary) {
                    Task { await coordinator.submit() }
                }
            } else if hasFailedUpload {
                PatinaButton("Let’s try that again", style: .primary) {
                    Task { await coordinator.retryAllFailed(); await maybeSubmit() }
                }
            } else if allUploaded {
                // All scans up, submit failed or awaiting a resumed submit.
                PatinaButton("Send request", style: .primary) {
                    Task { await coordinator.submit() }
                }
            } else {
                HStack(spacing: 10) {
                    ProgressView().tint(PatinaColors.clay)
                    Text("Sending your request…")
                        .font(PatinaTypography.bodySmallMedium)
                        .foregroundStyle(PatinaColors.Text.primary)
                }
                .frame(maxWidth: .infinity)
                .frame(height: 48)
            }
        }
    }

    // MARK: - Step: success

    var successStep: some View {
        VStack(spacing: 20) {
            Spacer()
            ZStack {
                Circle().stroke(PatinaColors.clay, lineWidth: 3).frame(width: 76, height: 76)
                Image(systemName: "checkmark")
                    .font(.system(size: 30, weight: .medium))
                    .foregroundStyle(PatinaColors.Text.interactive)
            }
            Text("Request sent")
                .font(PatinaTypography.h3)
                .foregroundStyle(PatinaColors.Text.primary)
            Text(successMessage)
                .font(PatinaTypography.bodySmall)
                .foregroundStyle(PatinaColors.Text.muted)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
            Spacer()
            footer {
                VStack(spacing: 12) {
                    PatinaButton("Track your request", style: .primary) {
                        let leadId = coordinator?.result?.leadId.uuidString
                        onClose()
                        if let leadId { onTrack(leadId) }
                    }
                    PatinaButton("Done", style: .ghost, action: onClose)
                }
            }
        }
    }

    private var successMessage: String {
        let followUp = " You can follow its progress from your home screen."
        // Push (W3-push): pairs with the authorization prompt this screen
        // triggers — names what the notification is FOR, not that one
        // exists.
        let pushNote = " We’ll tell you the instant a designer takes this in hand."
        guard let result = coordinator?.result else {
            return "A designer will reach out soon." + followUp + pushNote
        }
        let lead = result.pooled
            ? "We’re matching you with a designer. You’ll hear back soon."
            : "Your designer has your request and will reach out soon."
        return lead + followUp + pushNote
    }

    // MARK: - Reusable bits

    func footer<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        content()
            .padding(.horizontal, 20)
            .padding(.top, 12)
            .padding(.bottom, 20)
            .frame(maxWidth: .infinity)
            .background(PatinaColors.Background.primary)
    }

    private func summaryRow(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label)
                .font(PatinaTypography.bodySmallMedium)
                .foregroundStyle(PatinaColors.Text.muted)
            Spacer()
            Text(value)
                .font(PatinaTypography.bodySmallMedium)
                .foregroundStyle(PatinaColors.Text.primary)
        }
        .padding(.vertical, 6)
    }

    /// Like `summaryRow`, but stacks label above value instead of forcing
    /// both onto one line — for free-text values (e.g. Vision) that can run
    /// to a paragraph and shouldn't be squeezed or truncated.
    private func multilineSummaryRow(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(PatinaTypography.bodySmallMedium)
                .foregroundStyle(PatinaColors.Text.muted)
            Text(value)
                .font(PatinaTypography.bodySmallMedium)
                .foregroundStyle(PatinaColors.Text.primary)
        }
        .padding(.vertical, 6)
    }

    private func infoCard(icon: String, title: String, body: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 16))
                .foregroundStyle(PatinaColors.Text.interactive)
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(PatinaTypography.bodySmallMedium)
                    .foregroundStyle(PatinaColors.Text.primary)
                Text(body)
                    .font(PatinaTypography.caption)
                    .foregroundStyle(PatinaColors.Text.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 12).fill(PatinaColors.Background.secondary))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(PatinaColors.pearl, lineWidth: 1))
    }

    private func pickerSection<T: Hashable>(
        title: String,
        options: [T],
        selection: Binding<T?>,
        label: @escaping (T) -> String
    ) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .font(PatinaTypography.bodySmallMedium)
                .foregroundStyle(PatinaColors.Text.secondary)
            FlowLayout(spacing: 8) {
                ForEach(options, id: \.self) { option in
                    chip(label(option), isSelected: selection.wrappedValue == option) {
                        selection.wrappedValue = option
                    }
                }
            }
        }
    }

    private func optionalPickerSection<T: Hashable>(
        title: String,
        options: [T],
        selection: Binding<T?>,
        label: @escaping (T) -> String
    ) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .font(PatinaTypography.bodySmallMedium)
                .foregroundStyle(PatinaColors.Text.secondary)
            FlowLayout(spacing: 8) {
                ForEach(options, id: \.self) { option in
                    chip(label(option), isSelected: selection.wrappedValue == option) {
                        selection.wrappedValue = (selection.wrappedValue == option) ? nil : option
                    }
                }
            }
        }
    }

    private func chip(_ text: String, isSelected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(text)
                .font(PatinaTypography.caption)
                .foregroundStyle(isSelected ? .white : PatinaColors.Text.secondary)
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .background(isSelected ? PatinaColors.clay : PatinaColors.Background.secondary)
                .clipShape(Capsule())
                .overlay(
                    Capsule().stroke(isSelected ? PatinaColors.clay : PatinaColors.pearl, lineWidth: 1.5)
                )
        }
        .buttonStyle(.plain)
    }
}
