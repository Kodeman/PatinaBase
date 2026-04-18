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

struct QuietConversationFlowHost: View {

    @Environment(\.appCoordinator) private var coordinator
    @Environment(\.dismiss) private var dismiss
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @State private var step: Step = .initial
    @State private var scanViewModel: ScanViewModel?
    @State private var session: RoomScanSession?
    @State private var profile: StyleProfileResponse?
    @State private var flaggedForDesigner: Bool = false
    @State private var conversationViewModel: StyleConversationViewModel?

    private enum Step: Equatable {
        case initial
        case threshold
        case fallback
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
                    withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.3)) {
                        step = .softLanding
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
        step = .initial
    }
}
