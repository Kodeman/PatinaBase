//
//  QuietConversationFlowHost.swift
//  Patina
//
//  Single container view that owns the entire "Quiet Conversation" flow
//  state so the 5 movements can share a RoomScanSession without losing
//  data as we move between screens.
//
//  Keeping the flow in one SwiftUI state container sidesteps the problem
//  of passing associated values through NavigationPath — we just switch
//  on an internal `Step` enum.
//

import SwiftUI
import SwiftData

struct QuietConversationFlowHost: View {

    @Environment(\.appCoordinator) private var coordinator
    @Environment(\.dismiss) private var dismiss
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.modelContext) private var modelContext

    @State private var step: InternalFlowStep = .initial
    @State private var scanViewModel: ScanViewModel?
    @State private var session: RoomScanSession?
    @State private var profile: StyleProfileResponse?
    @State private var flaggedForDesigner: Bool = false
    @State private var conversationViewModel: StyleConversationViewModel?
    /// PT-4-8: set when a returning user explicitly asks to refine their style
    /// ("Refine my style" / "Update my style"). Without this, a user who
    /// already has a saved StyleProfile skips Movement 2 (the style
    /// conversation) entirely — Walk → SavedConfirmation → SoftLanding →
    /// FloorPlan — so they don't re-take the quiz they already finished.
    @State private var refineRequested: Bool = false
    /// Scan id the review step operates on; populated when the Walk finishes
    /// so the ScanReviewView can read the on-disk manifest for that bundle.
    /// Driven as an `Identifiable` item for `.fullScreenCover(item:)` so the
    /// review sits on top of the host without relying on an internal `step`
    /// swap inside a NavigationStack destination (which iOS 26 SwiftUI has
    /// been observed to collapse unpredictably — #bug repro'd via MobAI).
    @State private var reviewScan: ReviewBundleID?
    /// Scan id held after the review finishes so the saved-confirmation step
    /// can observe the matching RoomScanPackage while the upload runs.
    @State private var savedScanId: UUID?
    /// U40: in-flight guard on the fallback room write so a double-tap of
    /// "Accept" on the floor plan can't start two creates before the first
    /// one stamps `session.localRoomId`.
    @State private var isSavingFallbackRoom = false
    /// Route to land on once this host's own pop has committed.
    ///
    /// The host is a *pushed* NavigationStack destination, so `dismiss()`
    /// pops it by mutating the very path a follow-on `navigate(to:)` pushes
    /// onto. Doing both in one turn leaves the stack holding an empty pushed
    /// container — the landing destination's body never mounts, so the user
    /// gets a black screen with the system back chevron even though the room
    /// saved correctly. Holding the route until `onDisappear` keeps the pop
    /// and the push in separate turns.
    @State private var exitRoute: AppRoute?

    /// Identifiable wrapper so `.fullScreenCover(item:)` can present the
    /// review on any distinct scan completion.
    private struct ReviewBundleID: Identifiable, Equatable {
        let id: UUID
    }

    /// The internal movement steps of the Quiet Conversation flow. PT-3-6:
    /// these used to leak into `AppRoute` (`.scanWalk`, `.scanReview`, …)
    /// where they rendered `EmptyView()` because the host actually owns
    /// them. They now live here, driven by `@State`, and the nav layer only
    /// knows about the single `.scanFlow(reason:)` entry route.
    enum InternalFlowStep: Equatable {
        case initial
        case threshold
        case fallback
        case savedConfirmation
        case softLanding
        case conversation
        case reveal
        case floorPlan
    }

    /// GAP4-02: the steps that hold a person with no way back.
    ///
    /// `ContentView` mounts this host with `.toolbar(.hidden, for:
    /// .navigationBar)`, so there is no system chevron by construction and
    /// the interactive pop is dead with it. On `.fallback` that left a screen
    /// whose whole accessibility tree carried no dismiss control at all, and
    /// on `.initial` a bare background. This is the way out of both.
    private var showsLeaveControl: Bool {
        step == .fallback || step == .initial
    }

    var body: some View {
        ZStack {
            content

            if showsLeaveControl {
                VStack {
                    HStack {
                        Button("Not now") { leaveFlow(landingOn: .heroFrame) }
                            .font(PatinaTypography.bodySmallMedium)
                            .foregroundStyle(PatinaColors.Text.interactive)
                            .frame(minWidth: 44, minHeight: 44)
                            .contentShape(Rectangle())
                            .accessibilityHint("Leaves setting up this room and goes back home.")
                            .accessibilityIdentifier("QuietConversationFlowHost.LeaveButton")
                        Spacer()
                    }
                    .padding(.horizontal, 16)
                    Spacer()
                }
            }
        }
        .onAppear {
            #if DEBUG
            PatinaLog.scan.debug("[QuietConversationFlowHost] host onAppear step=\(step)")
            #endif
            bootstrap()
        }
        .onDisappear {
            #if DEBUG
            PatinaLog.scan.debug("[QuietConversationFlowHost] host onDisappear step=\(step)")
            #endif
            guard let route = exitRoute else { return }
            exitRoute = nil
            let nav = coordinator
            Task { @MainActor in
                nav.navigate(to: route)
            }
        }
        .onChange(of: step) { oldValue, newValue in
            #if DEBUG
            PatinaLog.scan.debug("[QuietConversationFlowHost] step changed \(oldValue) → \(newValue)")
            #endif
        }
        .fullScreenCover(item: $reviewScan) { review in
            if let vm = scanViewModel {
                ScanReviewView(
                    captureService: vm.captureService,
                    scanId: review.id,
                    session: session,
                    onComplete: {
                        #if DEBUG
                        PatinaLog.scan.debug("[QuietConversationFlowHost] review onComplete scanId=\(review.id)")
                        #endif
                        holdScanLocally(scanId: review.id)
                        savedScanId = review.id
                        reviewScan = nil
                        withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.3)) {
                            step = .savedConfirmation
                        }
                    },
                    onCancel: {
                        #if DEBUG
                        PatinaLog.scan.debug("[QuietConversationFlowHost] review onCancel scanId=\(review.id)")
                        #endif
                        let ctx = modelContext
                        Task { @MainActor in
                            await ScanRecoveryService.shared.discard(review.id, in: ctx)
                        }
                        reviewScan = nil
                        leaveFlow(landingOn: .heroFrame)
                    }
                )
                .onAppear {
                    #if DEBUG
                    PatinaLog.scan.debug("[QuietConversationFlowHost] review cover appeared scanId=\(review.id)")
                    #endif
                }
            }
        }
    }

    // MARK: - Bootstrap

    private func bootstrap() {
        guard step == .initial else { return }
        let hasLidar = RoomCaptureService.isSupported
        if hasLidar {
            let userId = currentUserId()
            let vm = ScanViewModel(userId: userId, hasLidar: true)
            scanViewModel = vm
            step = .threshold
        } else {
            step = .fallback
        }
    }

    private func currentUserId() -> String {
        // Fall back to the device's vendor identifier if not authenticated.
        // Supabase auth integration will provide a real user id where available.
        UIDevice.current.identifierForVendor?.uuidString ?? "anonymous"
    }

    // MARK: - Content router

    @ViewBuilder
    private var content: some View {
        switch step {
        case .initial:
            // GAP4-25: this was a bare background colour, and `resetForRescan`
            // put the flow back into it without re-running `bootstrap()` —
            // which only ever ran from `onAppear`, and `onAppear` does not
            // fire again. Tapping Rescan on the floor plan left an entirely
            // empty cream screen whose accessibility tree was one node, with
            // no way out but force-quitting. `resetForRescan` bootstraps now;
            // this is what the moment before it looks like.
            ZStack {
                PatinaColors.Background.primary.ignoresSafeArea()
                VStack(spacing: 12) {
                    ProgressView()
                        .tint(PatinaColors.Text.interactive)
                    Text("Getting ready…")
                        .font(PatinaTypography.bodySmall)
                        .foregroundStyle(PatinaColors.Text.secondary)
                }
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("QuietConversationFlowHost.Initial")
            }

        case .threshold:
            if let vm = scanViewModel {
                ScanThresholdView(viewModel: vm) { scanned, reason in
                    session = scanned
                    // An abandoned scan (user tapped Finish before capture
                    // started, tapped Start Over, or the flow was cancelled)
                    // has no bundle on disk — route straight home rather than
                    // presenting a broken review step.
                    if reason == .userAbandon
                        || vm.captureService.currentScanId == nil {
                        #if DEBUG
                        PatinaLog.scan.debug("[QuietConversationFlowHost] .threshold → abandon (reason=\(reason)) — skipping review")
                        #endif
                        leaveFlow(landingOn: .heroFrame)
                        return
                    }
                    // Real scan — present the review as a full-screen cover
                    // layered OVER the threshold host. This sidesteps an iOS
                    // 26 SwiftUI quirk where swapping internal `step` to
                    // `.review` inside a NavigationStack destination causes
                    // the destination view to collapse ~700ms after the
                    // child view mounts.
                    let resolvedScanId = vm.captureService.currentScanId
                        ?? scanned.sessionId
                    #if DEBUG
                    PatinaLog.scan.debug("[QuietConversationFlowHost] .threshold → review cover scanId=\(resolvedScanId) reason=\(reason)")
                    #endif
                    reviewScan = ReviewBundleID(id: resolvedScanId)
                }
            }

        case .fallback:
            ScanFallbackEntryView(userId: currentUserId()) { scanned in
                session = scanned
                withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.3)) {
                    step = .conversation
                }
            }

        case .savedConfirmation:
            if let scanId = savedScanId {
                ScanSavedConfirmationView(
                    scanId: scanId,
                    onDone: {
                        leaveFlow(landingOn: .heroFrame)
                    },
                    onSetStyle: {
                        withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.3)) {
                            step = .softLanding
                        }
                    }
                )
            }

        case .softLanding:
            if let session = session {
                SoftLandingView(session: session) { outcome in
                    switch outcome {
                    case .startConversation:
                        // The user explicitly chose to (re)take the style
                        // conversation ("Update my style"). Treat this as an
                        // explicit refine so the Movement-2 skip guard lets the
                        // conversation through even for returning users.
                        refineRequested = true
                        withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.3)) {
                            step = .conversation
                        }
                    case .skipToFloorPlan(let existingProfile):
                        profile = existingProfile
                        withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.3)) {
                            step = .floorPlan
                        }
                    }
                }
            }

        case .conversation:
            // PT-4-8: returning users with a saved StyleProfile skip Movement 2
            // unless they explicitly asked to refine it. This guards every
            // route into `.conversation` (not just the SoftLanding fork), so a
            // returning user is never silently funneled back into the quiz.
            if !refineRequested, let existingProfile = StyleProfileStore.shared.currentProfile {
                ProfileSkipBridge {
                    profile = existingProfile
                    withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.3)) {
                        step = .floorPlan
                    }
                }
            } else if let session = session {
                let vm = ensureConversationViewModel(for: session)
                StyleConversationContainerView(viewModel: vm, onComplete: { resolved in
                    profile = resolved
                    flaggedForDesigner = resolved.aestheticName.isEmpty == false && StyleProfileStore.shared.currentProfile?.profileId == resolved.profileId
                    withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.3)) {
                        step = .reveal
                    }
                })
            }

        case .reveal:
            if let profile = profile {
                RevealView(
                    profile: profile,
                    onPrimaryAction: {
                        ScanAnalytics.shared.track(.revealCtaTapped(flaggedForDesigner: flaggedForDesigner))
                        withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.3)) {
                            step = .floorPlan
                        }
                    },
                    onExploreAction: {
                        ScanAnalytics.shared.track(.revealProfileExplored)
                        withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.3)) {
                            step = .floorPlan
                        }
                    }
                )
            }

        case .floorPlan:
            if let session = session {
                ScanFloorPlanPreviewView(
                    session: session,
                    onAccept: {
                        ScanAnalytics.shared.track(.floorplanAccepted)
                        if session.scanMethod == .manual {
                            acceptFallbackFloorPlan()
                        } else {
                            // LiDAR sessions already wrote their RoomModel in
                            // `holdScanLocally` after the review step — saving
                            // again here would create a second room.
                            leaveFlow(landingOn: .emergence(pieceId: nil))
                        }
                    },
                    onRescan: {
                        ScanAnalytics.shared.track(.floorplanRescan)
                        resetForRescan()
                    }
                )
            }
        }
    }

    /// Lazily create the conversation view model once per session so it survives
    /// parent body re-renders. Stored in `@State` for SwiftUI lifetime management.
    private func ensureConversationViewModel(for session: RoomScanSession) -> StyleConversationViewModel {
        if let existing = conversationViewModel { return existing }
        let vm = StyleConversationViewModel(session: session)
        DispatchQueue.main.async {
            conversationViewModel = vm
        }
        return vm
    }

    /// The single exit from the flow. Pops this host and lands the user on
    /// `route` once the pop has settled — never both in the same turn (see
    /// `exitRoute`).
    private func leaveFlow(landingOn route: AppRoute) {
        exitRoute = route
        dismiss()
    }

    private func resetForRescan() {
        session = nil
        profile = nil
        scanViewModel = nil
        conversationViewModel = nil
        reviewScan = nil
        savedScanId = nil
        refineRequested = false
        step = .initial
        // GAP4-25: `.initial` is a waiting room, not a destination. Nothing
        // else drives the flow out of it — `bootstrap()` runs from `onAppear`,
        // which does not fire again on an internal step change.
        bootstrap()
    }

    /// Seal a review-finalized scan bundle on the phone — strictly local, no
    /// upload. The review view has already called `finalizeBundleAfterReview`
    /// on the capture service, so the manifest is sealed. `RoomUploadService`
    /// writes a `.heldLocal` `RoomScanPackage` row and persists the local
    /// `RoomModel` so the room appears in "Your Spaces"; nothing leaves the
    /// device until the user explicitly requests design services.
    private func holdScanLocally(scanId: UUID) {
        guard let vm = scanViewModel, let session else { return }
        guard let roomData = vm.captureService.processRoom() else { return }

        let bundlePath = vm.captureService.bundleWriter?.relativePath
        RoomUploadService.shared.holdLocally(
            session: session,
            roomData: roomData,
            bundlePath: bundlePath,
            modelContext: modelContext
        )
    }
}

// MARK: - Fallback room persistence (U40)

extension QuietConversationFlowHost {

    /// Accept handler for the manual (non-LiDAR) path. Before U40 this branch
    /// shared the LiDAR `dismiss(); navigate(.emergence)` exit, which meant
    /// everything the user typed on the fallback entry screen — room type,
    /// dimensions, windows, doors — evaporated the moment the flow closed: no
    /// `RoomModel` was ever written. Now the room is created first and the
    /// user lands in it.
    fileprivate func acceptFallbackFloorPlan() {
        guard !isSavingFallbackRoom else { return }
        isSavingFallbackRoom = true
        Task { @MainActor in
            let roomId = await persistFallbackRoom()
            isSavingFallbackRoom = false
            // Defensive: a nil id means the session vanished under us. Home is
            // still a coherent landing spot; a nil route is not.
            let landing = roomId.map { AppRoute.roomProject(roomId: $0) } ?? .heroFrame
            leaveFlow(landingOn: landing)
        }
    }

    /// Persist the manually-entered room and return its local id.
    ///
    /// Idempotent through `session.localRoomId`, so an accept that follows a
    /// rescan-then-accept can't produce a duplicate room.
    @MainActor
    fileprivate func persistFallbackRoom() async -> UUID? {
        guard var current = session, current.scanMethod == .manual else { return nil }
        if let existing = current.localRoomId { return existing }

        let draft = FallbackRoomDraft(session: current)
        let store = RoomStore(context: modelContext)
        let creation = RoomCreationCoordinator(store: store)

        // One insert per accept, online or not: the coordinator keeps its own
        // local room and reports `isLocalOnly` rather than throwing, so there
        // is no failure path here that could add a second room.
        let result = await creation.createManualRoom(
            name: draft.name,
            roomType: draft.roomType,
            widthFeet: draft.widthFeet,
            lengthFeet: draft.lengthFeet,
            ceilingHeightFeet: draft.ceilingHeightFeet,
            orientationRaw: "",
            windowCount: draft.windowCount,
            doorCount: draft.doorCount
        )

        current.localRoomId = result.room.id
        session = current
        return result.room.id
    }
}

/// PT-4-8: invisible bridge that runs a one-shot skip action on appear. Used
/// when a returning user lands on the `.conversation` step but already has a
/// saved StyleProfile — we route them past Movement 2 without rendering the
/// conversation. Mutating host state from `.onAppear` (rather than inline in
/// the body) keeps SwiftUI from complaining about state changes during view
/// evaluation.
private struct ProfileSkipBridge: View {
    let action: () -> Void

    var body: some View {
        PatinaColors.Background.primary
            .ignoresSafeArea()
            .onAppear(perform: action)
    }
}
