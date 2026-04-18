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

    @State private var step: Step = .initial
    @State private var scanViewModel: ScanViewModel?
    @State private var session: RoomScanSession?
    @State private var profile: StyleProfileResponse?
    @State private var flaggedForDesigner: Bool = false
    @State private var conversationViewModel: StyleConversationViewModel?
    /// Scan id the review step operates on; populated when the Walk finishes
    /// so the ScanReviewView can read the on-disk manifest for that bundle.
    @State private var reviewScanId: UUID?

    private enum Step: Equatable {
        case initial
        case threshold
        case fallback
        case review
        case softLanding
        case conversation
        case reveal
        case floorPlan
    }

    var body: some View {
        ZStack {
            content
        }
        .onAppear(perform: bootstrap)
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
            PatinaColors.offWhite.ignoresSafeArea()

        case .threshold:
            if let vm = scanViewModel {
                ScanThresholdView(viewModel: vm) { scanned, _ in
                    session = scanned
                    // Use the capture service's current scan id as the review
                    // bundle id. Falls back to a fresh UUID if somehow unset
                    // (the ReviewView will surface an error state).
                    reviewScanId = vm.captureService.currentScanId
                    withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.3)) {
                        step = .review
                    }
                }
            }

        case .fallback:
            ScanFallbackEntryView(userId: currentUserId()) { scanned in
                session = scanned
                withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.3)) {
                    step = .conversation
                }
            }

        case .review:
            if let vm = scanViewModel, let scanId = reviewScanId {
                ScanReviewView(
                    captureService: vm.captureService,
                    scanId: scanId,
                    onComplete: {
                        // User finished review — kick off the advanced bundle
                        // upload and advance to the Soft Landing transition.
                        kickOffReviewUpload(scanId: scanId)
                        withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.3)) {
                            step = .softLanding
                        }
                    },
                    onCancel: {
                        // User chose "Discard" — drop the bundle and return to
                        // the home screen. The ScanRecoveryService handles
                        // both the on-disk bundle and the SwiftData row.
                        let ctx = modelContext
                        Task { @MainActor in
                            await ScanRecoveryService.shared.discard(scanId, in: ctx)
                        }
                        dismiss()
                        coordinator.navigate(to: .heroFrame)
                    }
                )
            }

        case .softLanding:
            if let session = session {
                SoftLandingView(session: session) { outcome in
                    switch outcome {
                    case .startConversation:
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
            if let session = session {
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
                        dismiss()
                        coordinator.navigate(to: .emergence(pieceId: nil))
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
        reviewScanId = nil
        step = .initial
    }

    /// Kick off the background upload for a review-finalized scan bundle.
    /// The review view has already called `finalizeBundleAfterReview(...)` on
    /// the capture service, so the manifest is sealed and the bundle is safe
    /// to enqueue for upload. We hand the heavy lifting to
    /// `RoomUploadService` which writes a `RoomScanPackage` row and detaches
    /// the real upload task.
    private func kickOffReviewUpload(scanId: UUID) {
        guard let vm = scanViewModel, let session else { return }
        guard let roomData = vm.captureService.processRoom() else { return }

        // The v2 flow doesn't build a FirstWalkStyleSignals up front; an empty
        // one is fine — the Conversation step will populate style signals via
        // its own pipeline (Wave 5/6 will plumb them into the upload payload).
        let emptySignals = FirstWalkStyleSignals()

        let bundlePath = vm.captureService.bundleWriter?.relativePath
        RoomUploadService.shared.uploadInBackground(
            session: session,
            roomData: roomData,
            styleSignals: emptySignals,
            bundlePath: bundlePath,
            remoteRoomId: nil,
            modelContext: modelContext
        )
    }
}
