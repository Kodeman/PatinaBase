//
//  DesignRequestFlowView.swift
//  Patina
//
//  The one "request design services" flow, presented from the `.designServices`
//  sheet. Guests compose freely; auth is required only to start uploading.
//  Steps: pickScans → details → review (cellular consent / offline) → sending
//  (upload + submit) → success. Scans upload sequentially with
//  `intent: .userRequested`, then the atomic `submit_design_request` RPC runs.
//  Nothing uploads or submits until the user taps "Send".
//

import SwiftUI
import SwiftData

struct DesignRequestFlowView: View {

    let preselectedScanIds: [UUID]
    let preselectedRoomId: UUID?
    let onClose: () -> Void

    @Environment(\.modelContext) private var modelContext

    // Observe auth so the in-flow auth sheet can continue on the flip.
    @State private var authService = AuthService.shared
    private let syncService = RoomScanSyncService.shared

    @State private var coordinator: DesignRequestCoordinator?
    @State private var step: Step = .pickScans

    // Composing state (ephemeral until "Send" persists a draft).
    @State private var selectedScanIds: [UUID] = []
    @State private var primaryScanId: UUID?
    @State private var projectType: DesignServiceType?
    @State private var budget: DesignBudget?
    @State private var timeline: DesignTimeline = .flexible
    @State private var requestDescription: String = ""

    @State private var showAuthSheet = false
    @State private var awaitingAuthToSend = false

    // Resume-or-discard for an in-flight draft found on open.
    @State private var resumeDraft: DesignRequestDraft?
    @State private var didBootstrap = false

    enum Step: Equatable {
        case pickScans
        case details
        case review
        case sending
        case success
    }

    var body: some View {
        NavigationStack {
            content
                .background(PatinaColors.Background.primary.ignoresSafeArea())
                .navigationTitle(navTitle)
                .toolbarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Close", action: onClose)
                            .foregroundStyle(PatinaColors.Text.muted)
                    }
                }
        }
        .onAppear(perform: bootstrap)
        .onChange(of: authService.isAuthenticated) { _, isAuth in
            if isAuth && awaitingAuthToSend {
                awaitingAuthToSend = false
                showAuthSheet = false
                beginSend()
            }
        }
        .onChange(of: coordinator?.result) { _, result in
            if result != nil { step = .success }
        }
        .sheet(isPresented: $showAuthSheet) {
            InFlowAuthSheet()
        }
        .alert("Resume your request?", isPresented: resumeAlertBinding) {
            Button("Resume") { resumeExisting() }
            Button("Start over", role: .destructive) { discardAndStartFresh() }
        } message: {
            Text("You have a design request in progress. Pick up where you left off, or start over.")
        }
    }

    // MARK: - Bootstrap

    private func bootstrap() {
        guard !didBootstrap else { return }
        didBootstrap = true

        let coord = DesignRequestCoordinator(modelContext: modelContext)
        coordinator = coord

        // An in-flight draft (uploading / awaiting submit) → offer resume.
        if let existing = coord.activeDraft(), existing.phase.needsResumePrompt {
            resumeDraft = existing
            return
        }
        // Any stale composing draft is cleared — composing state is ephemeral.
        coord.discardActiveDraft()
        applyPreselection()
    }

    private func applyPreselection() {
        let packages = (try? modelContext.fetch(RoomScanPackage.heldOrSyncedItems)) ?? []
        let resolved = ScanPickerSource.resolvePreselection(
            packages: packages,
            preselectedScanIds: preselectedScanIds,
            preselectedRoomId: preselectedRoomId
        )
        selectedScanIds = resolved
        primaryScanId = resolved.first
    }

    private func resumeExisting() {
        guard let coord = coordinator, let existing = resumeDraft else { return }
        coord.adopt(existing)
        // Hydrate composing state from the draft.
        selectedScanIds = existing.scanIds
        primaryScanId = existing.primaryScanId
        projectType = existing.projectTypeRaw.flatMap(DesignServiceType.init(rawValue:))
        budget = existing.budgetRaw.flatMap(DesignBudget.init(rawValue:))
        timeline = existing.timelineRaw.flatMap(DesignTimeline.init(rawValue:)) ?? .flexible
        requestDescription = existing.requestDescription
        resumeDraft = nil
        step = .sending
    }

    private func discardAndStartFresh() {
        coordinator?.discardActiveDraft()
        resumeDraft = nil
        applyPreselection()
        step = .pickScans
    }

    private var resumeAlertBinding: Binding<Bool> {
        Binding(get: { resumeDraft != nil }, set: { if !$0 { resumeDraft = nil } })
    }

    // MARK: - Content router

    @ViewBuilder
    private var content: some View {
        switch step {
        case .pickScans:  pickScansStep
        case .details:    detailsStep
        case .review:     reviewStep
        case .sending:    sendingStep
        case .success:    successStep
        }
    }

    private var navTitle: String {
        switch step {
        case .pickScans: return "Choose scans"
        case .details:   return "Your request"
        case .review:    return "Review"
        case .sending:   return "Sending"
        case .success:   return "Sent"
        }
    }

    // MARK: - Step: pick scans

    private var pickScansStep: some View {
        VStack(spacing: 0) {
            ScanPickerView(
                selectedScanIds: $selectedScanIds,
                primaryScanId: $primaryScanId,
                onDeleteHeld: deleteHeldScan
            )
            footer {
                PatinaButton("Continue", style: .primary) {
                    step = .details
                }
                .disabled(selectedScanIds.isEmpty)
                .opacity(selectedScanIds.isEmpty ? 0.5 : 1)
            }
        }
    }

    private func deleteHeldScan(_ package: RoomScanPackage) {
        let scanId = package.scanId
        Task { @MainActor in
            await ScanRecoveryService.shared.discard(scanId, in: modelContext)
        }
    }

    // MARK: - Step: details

    private var detailsStep: some View {
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

    private var reviewStep: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 20) {
                summaryRow("Scans", "\(selectedScanIds.count) selected")
                if let projectType {
                    summaryRow("Help", projectType.displayName)
                }
                if let budget {
                    summaryRow("Budget", budget.displayName)
                }
                summaryRow("Timeline", timeline.displayName)

                if isMetered && !cellularOptedIn {
                    consentCard
                }
                if !syncService.isNetworkAvailable {
                    offlineCard
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
            title: "You're offline",
            body: "We'll save your request. Reconnect and it will pick up right where you left off."
        )
    }

    private var sendButtonTitle: String {
        syncService.isNetworkAvailable ? "Send to a designer" : "Save request"
    }

    // MARK: - Step: sending

    private var sendingStep: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 16) {
                Text(sendingHeadline)
                    .font(PatinaTypography.h4)
                    .foregroundStyle(PatinaColors.Text.primary)

                ForEach(sendingPackages, id: \.scanId) { package in
                    ScanUploadProgressView(package: package)
                }

                if let error = coordinator?.lastError {
                    Text(error.errorDescription ?? "Something went wrong.")
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
            } else if hasFailedUpload {
                PatinaButton("Try again", style: .primary) {
                    Task { await coordinator.retryAllFailed(); await maybeSubmit() }
                }
            } else if allUploaded {
                // All scans up, submit failed or awaiting a resumed submit.
                PatinaButton("Send request", style: .primary) {
                    Task { await coordinator.submit() }
                }
            } else {
                ProgressView().tint(PatinaColors.clay)
                    .frame(maxWidth: .infinity)
                    .frame(height: 48)
            }
        }
    }

    // MARK: - Step: success

    private var successStep: some View {
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
                PatinaButton("Done", style: .primary, action: onClose)
            }
        }
    }

    private var successMessage: String {
        guard let result = coordinator?.result else {
            return "A designer will reach out soon."
        }
        return result.pooled
            ? "We're matching you with a designer. You'll hear back soon."
            : "Your designer has your request and will reach out soon."
    }

    // MARK: - Send handling

    private func onSendTapped() {
        guard AuthService.shared.isAuthenticated else {
            awaitingAuthToSend = true
            showAuthSheet = true
            return
        }
        beginSend()
    }

    private func beginSend() {
        guard let coordinator else { return }
        // Persist the draft from composing state, then run upload + submit.
        coordinator.createDraft(
            scanIds: selectedScanIds,
            primaryScanId: primaryScanId,
            projectType: projectType,
            budget: budget,
            timeline: timeline,
            description: requestDescription
        )
        step = .sending
        Task { await coordinator.send() }
    }

    private func maybeSubmit() async {
        guard let coordinator, allUploaded, coordinator.result == nil else { return }
        await coordinator.submit()
    }

    // MARK: - Derived

    private var sendingPackages: [RoomScanPackage] {
        let ids = coordinator?.draft?.scanIds ?? selectedScanIds
        let all = (try? modelContext.fetch(FetchDescriptor<RoomScanPackage>())) ?? []
        let byId = Dictionary(uniqueKeysWithValues: all.map { ($0.scanId, $0) })
        return ids.compactMap { byId[$0] }
    }

    private var hasFailedUpload: Bool {
        guard let phases = coordinator?.scanPhases else { return false }
        return phases.values.contains { if case .failed = $0 { return true } else { return false } }
    }

    private var allUploaded: Bool {
        guard let coordinator, let draft = coordinator.draft, !draft.scanIds.isEmpty else { return false }
        return draft.scanIds.allSatisfy {
            if case .uploaded = coordinator.scanPhases[$0] { return true } else { return false }
        }
    }

    private var sendingHeadline: String {
        if coordinator?.isSubmitting == true { return "Submitting your request…" }
        if hasFailedUpload { return "Some scans didn't upload" }
        if !syncService.isNetworkAvailable { return "Saved — waiting for a connection" }
        return "Sending your scans…"
    }

    private var isMetered: Bool { syncService.cachedIsExpensive }
    private var cellularOptedIn: Bool {
        UserDefaults.standard.bool(forKey: RoomScanSyncService.cellularOptInKey)
    }

    private var estimatedBytesLabel: String {
        let all = (try? modelContext.fetch(FetchDescriptor<RoomScanPackage>())) ?? []
        let selected = all.filter { selectedScanIds.contains($0.scanId) }
        let total = selected.reduce(0) { $0 + $1.sizeBytes }
        return ByteCountFormatter.string(fromByteCount: Int64(total), countStyle: .file)
    }

    // MARK: - Reusable bits

    private func footer<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
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

// MARK: - In-flow auth sheet

/// Wraps `AuthScreenView` for the request flow's upload gate. Guests can still
/// browse (no-op) but the flow only advances on a real sign-in.
private struct InFlowAuthSheet: View {
    @State private var showingEmailAuth = false
    @State private var showingEmailSignUp = false

    var body: some View {
        AuthScreenView(
            onSignInWithApple: { result in
                Task {
                    let viewModel = AuthViewModel()
                    await viewModel.handleAppleSignIn(result: result)
                }
            },
            onSignInWithGoogle: {
                Task { try? await AuthService.shared.signInWithGoogle() }
            },
            onSignInWithEmail: { showingEmailAuth = true },
            onCreateAccount: { showingEmailSignUp = true },
            onBrowseAsGuest: { /* no-op: the flow requires auth to upload */ }
        )
        .sheet(isPresented: $showingEmailAuth) {
            AuthenticationView()
        }
        .sheet(isPresented: $showingEmailSignUp) {
            AuthenticationView(initialMode: .signUp)
        }
    }
}
