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

    var body: some View {
        ZStack {
            content
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
                        dismiss()
                        coordinator.navigate(to: .heroFrame)
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
            PatinaColors.Background.primary.ignoresSafeArea()

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
                        dismiss()
                        coordinator.navigate(to: .heroFrame)
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
                        dismiss()
                        coordinator.navigate(to: .heroFrame)
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
                            dismiss()
                            coordinator.navigate(to: .emergence(pieceId: nil))
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

    private func resetForRescan() {
        session = nil
        profile = nil
        scanViewModel = nil
        conversationViewModel = nil
        reviewScan = nil
        savedScanId = nil
        refineRequested = false
        step = .initial
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
            dismiss()
            if let roomId {
                coordinator.navigate(to: .roomProject(roomId: roomId))
            } else {
                // Defensive: the session vanished under us. Home is still a
                // coherent landing spot; a nil route is not.
                coordinator.navigate(to: .heroFrame)
            }
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

        let roomId: UUID
        do {
            let result = try await creation.createManualRoom(
                name: draft.name,
                roomType: draft.roomType,
                widthFeet: draft.widthFeet,
                lengthFeet: draft.lengthFeet,
                ceilingHeightFeet: draft.ceilingHeightFeet,
                orientationRaw: "",
                windowCount: draft.windowCount,
                doorCount: draft.doorCount
            )
            roomId = result.room.id
        } catch {
            // Mirrors ManualRoomEntryView's offline fallback: guests and
            // offline users get a local-only room rather than nothing.
            let local = store.createRoom(
                name: draft.name,
                roomType: draft.roomType,
                widthFeet: draft.widthFeet,
                lengthFeet: draft.lengthFeet,
                ceilingHeightFeet: draft.ceilingHeightFeet,
                orientationRaw: "",
                windowCount: draft.windowCount,
                doorCount: draft.doorCount,
                manualEntry: true
            )
            RoomSelectionStore.shared.select(localId: local.id, remoteId: nil)
            roomId = local.id
            #if DEBUG
            PatinaLog.scan.error("[QuietConversationFlowHost] fallback room remote sync failed, created locally only: \(error)")
            #endif
        }

        current.localRoomId = roomId
        session = current
        return roomId
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
