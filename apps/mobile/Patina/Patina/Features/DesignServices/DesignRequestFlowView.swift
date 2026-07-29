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
//  Step views + reusable bits live in DesignRequestFlowView+Steps.swift.
//

import SwiftUI
import SwiftData

struct DesignRequestFlowView: View {

    let preselectedScanIds: [UUID]
    let preselectedRoomId: UUID?
    let onClose: () -> Void
    /// Called from the success screen's "Track your request" — the sheet is
    /// closed first (`onClose`), then this navigates to the request's status
    /// detail. Carries the new `leads.id` as a string for the route.
    var onTrack: (String) -> Void = { _ in }

    @Environment(\.modelContext) var modelContext
    /// Launch-time signal channel; the home resume banner reads
    /// `pendingDesignRequestDraftId` from it, and this flow retires the
    /// signal on open (the flow now owns the resume-or-discard interaction).
    @Environment(\.scanEventChannel) private var scanEvents

    // Observe auth so the in-flow auth sheet can continue on the flip.
    @State var authService = AuthService.shared
    let syncService = RoomScanSyncService.shared

    @State var coordinator: DesignRequestCoordinator?
    @State var step: Step = .pickScans

    // Composing state (ephemeral until "Send" persists a draft).
    @State var selectedScanIds: [UUID] = []
    @State var primaryScanId: UUID?
    @State var projectType: DesignServiceType?
    @State var budget: DesignBudget?
    @State var timeline: DesignTimeline = .flexible
    @State var requestDescription: String = ""

    /// Roomless request — the user asked for design help without attaching a
    /// scan. Skips scan upload; submits with an empty scan set.
    @State var isRoomless: Bool = false

    @State var showAuthSheet = false
    @State var awaitingAuthToSend = false

    // Resume-or-discard for an in-flight draft found on open.
    @State var resumeDraft: DesignRequestDraft?
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
            AuthSheet()
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

        // Entering the flow consumes the launch-time resume signal — the
        // persisted draft (below) is the source of truth from here on, so the
        // home banner must not outlive it.
        scanEvents.setPendingDesignRequestDraft(nil)

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
        isRoomless = existing.isRoomless
        resumeDraft = nil
        step = .sending
    }

    private func discardAndStartFresh() {
        coordinator?.discardActiveDraft()
        resumeDraft = nil
        isRoomless = false
        applyPreselection()
        step = .pickScans
    }

    var resumeAlertBinding: Binding<Bool> {
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

    // U08: one flow, one title — "Your design request" throughout, not a
    // different noun per step (the step enum/logic below is untouched).
    var navTitle: String { "Your design request" }

    // MARK: - Step: pick scans

    private var pickScansStep: some View {
        VStack(spacing: 0) {
            ScanPickerView(
                selectedScanIds: $selectedScanIds,
                primaryScanId: $primaryScanId,
                onDeleteHeld: deleteHeldScan
            )
            footer {
                if selectedScanIds.isEmpty {
                    // No scan selected (or none exist): requesting help without a
                    // scan is the primary action — you don't need a room to ask.
                    PatinaButton("Request without a scan", style: .primary) {
                        startRoomless()
                    }
                } else {
                    VStack(spacing: 10) {
                        PatinaButton("Continue", style: .primary) {
                            step = .details
                        }
                        // "Both": even with scans on hand, allow requesting help
                        // without attaching one.
                        Button("Skip — request without a scan") {
                            startRoomless()
                        }
                        .font(PatinaTypography.bodySmall)
                        .foregroundStyle(PatinaColors.Text.interactive)
                    }
                }
            }
        }
    }

    /// Enter roomless mode: clear any scan selection, default the type to a
    /// consultation (user can change it), and go straight to the details form.
    private func startRoomless() {
        isRoomless = true
        selectedScanIds = []
        primaryScanId = nil
        if projectType == nil { projectType = .consultation }
        step = .details
    }

    private func deleteHeldScan(_ package: RoomScanPackage) {
        let scanId = package.scanId
        Task { @MainActor in
            await ScanRecoveryService.shared.discard(scanId, in: modelContext)
        }
    }

    // MARK: - Send handling

    func onSendTapped() {
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
            scanIds: isRoomless ? [] : selectedScanIds,
            primaryScanId: isRoomless ? nil : primaryScanId,
            isRoomless: isRoomless,
            details: DesignRequestDetails(
                projectType: projectType,
                budget: budget,
                timeline: timeline,
                description: requestDescription
            )
        )
        step = .sending
        Task { await coordinator.send() }
    }

    func maybeSubmit() async {
        guard let coordinator, allUploaded, coordinator.result == nil else { return }
        await coordinator.submit()
    }

    // MARK: - Derived

    var sendingPackages: [RoomScanPackage] {
        let ids = coordinator?.draft?.scanIds ?? selectedScanIds
        let all = (try? modelContext.fetch(FetchDescriptor<RoomScanPackage>())) ?? []
        let byId = Dictionary(uniqueKeysWithValues: all.map { ($0.scanId, $0) })
        return ids.compactMap { byId[$0] }
    }

    // Both flags read the coordinator's LIVE derivation (snapshot merged with
    // RoomScanPackage.status) — a background resumePendingUploads that
    // finishes an upload after the resume snapshot flips these without a
    // close/reopen, so `sendingActions` can never sit on the spinner branch
    // while the per-row progress views already show "Uploaded".
    var hasFailedUpload: Bool {
        coordinator?.anyScanFailed ?? false
    }

    var allUploaded: Bool {
        coordinator?.allScansUploaded ?? false
    }

    var sendingHeadline: String {
        if coordinator?.isSubmitting == true { return "Submitting your request…" }
        if isRoomless { return "Sending your request…" }
        if hasFailedUpload { return "Some scans didn't upload" }
        if !syncService.isNetworkAvailable { return "Saved — waiting for a connection" }
        return "Sending your scans…"
    }

    var isMetered: Bool { syncService.cachedIsExpensive }
    var cellularOptedIn: Bool {
        UserDefaults.standard.bool(forKey: RoomScanSyncService.cellularOptInKey)
    }

    var estimatedBytesLabel: String {
        let all = (try? modelContext.fetch(FetchDescriptor<RoomScanPackage>())) ?? []
        let selected = all.filter { selectedScanIds.contains($0.scanId) }
        let total = selected.reduce(0) { $0 + $1.sizeBytes }
        return ByteCountFormatter.string(fromByteCount: Int64(total), countStyle: .file)
    }
}
