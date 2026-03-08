//
//  FirstLaunchContainerView.swift
//  Patina
//
//  Container view that orchestrates the first-time user onboarding flow.
//  Switches between scenes based on FirstLaunchState.
//

import SwiftUI
import SwiftData

/// Container view for the first-launch onboarding flow
struct FirstLaunchContainerView: View {
    @Environment(\.appCoordinator) private var coordinator
    @Environment(\.modelContext) private var modelContext
    @State private var showCompanionOverlay = false
    @State private var savedRoomId: UUID?

    private var firstLaunchCoordinator: FirstLaunchCoordinator? {
        coordinator.firstLaunchCoordinator
    }

    private var currentState: FirstLaunchState {
        firstLaunchCoordinator?.currentState ?? .threshold
    }

    var body: some View {
        ZStack {
            // Background
            PatinaColors.Background.primary
                .ignoresSafeArea()

            // Main content based on current state
            content
                .animation(.easeInOut(duration: 0.5), value: currentState)

            // Companion overlay (conditional based on state)
            if currentState.showsCompanion && currentState != .walkActive {
                CompanionOverlay()
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .environment(\.firstLaunchCoordinator, firstLaunchCoordinator)
        .onAppear {
            // Delay companion appearance for smooth entrance
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                showCompanionOverlay = true
            }
        }
    }

    // MARK: - Content View

    @ViewBuilder
    private var content: some View {
        switch currentState {
        case .threshold:
            ThresholdView(onComplete: handleThresholdComplete)
                .transition(.opacity)

        case .walkInvitation:
            WalkInvitationView(
                onLetsWalk: handleLetsWalk,
                onNotYet: handleNotYet
            )
            .transition(.opacity)

        case .cameraPermission:
            CameraPermissionView(
                onPermissionResult: handlePermissionResult
            )
            .transition(.opacity)

        case .walkActive:
            // Walk view with AR scanning
            WalkView()
                .transition(.opacity)
                .onAppear {
                    firstLaunchCoordinator?.startWalk()
                }

        case .walkComplete:
            WalkCompleteView(
                styleSignals: firstLaunchCoordinator?.styleSignals ?? FirstWalkStyleSignals(),
                roomName: firstLaunchCoordinator?.roomName ?? "Living Room",
                onShowMe: handleShowMe
            )
            .transition(.opacity)

        case .firstEmergence:
            // First emergence with room context
            EmergenceView(
                pieceId: nil,
                isFirstEmergence: true,
                roomContext: firstLaunchCoordinator?.capturedRoomData,
                onAction: handleEmergenceAction
            )
            .transition(.opacity)

        case .roomNaming:
            RoomNamingView(onComplete: handleRoomNamed)
                .transition(.opacity)

        case .complete:
            // Transition to main app
            Color.clear
                .onAppear {
                    coordinator.completeFirstLaunch(roomId: savedRoomId)
                }
        }
    }

    // MARK: - Action Handlers

    private func handleThresholdComplete(holdDuration: TimeInterval) {
        firstLaunchCoordinator?.completeThreshold(holdDuration: holdDuration)
    }

    private func handleLetsWalk() {
        firstLaunchCoordinator?.handleWalkInvitationChoice(.letsWalk)
    }

    private func handleNotYet() {
        firstLaunchCoordinator?.handleWalkInvitationChoice(.notYet)
    }

    private func handlePermissionResult(_ result: CameraPermissionResult) {
        firstLaunchCoordinator?.handleCameraPermission(result)
    }

    private func handleShowMe() {
        firstLaunchCoordinator?.showFirstEmergence()
    }

    private func handleEmergenceAction(_ action: EmergenceAction) {
        firstLaunchCoordinator?.handleEmergenceAction(action)
    }

    private func handleRoomNamed(_ name: String, _ type: String) {
        firstLaunchCoordinator?.updateRoomName(name, type: type)

        // Save the room to SwiftData
        if let roomData = firstLaunchCoordinator?.capturedRoomData {
            let room = RoomModel(
                id: roomData.roomId,
                name: name,
                roomType: type,
                hasBeenScanned: true,
                width: Double(roomData.dimensions.width),
                length: Double(roomData.dimensions.length),
                height: Double(roomData.dimensions.height),
                heroFrameData: roomData.heroFrameData,
                heroFrameScore: roomData.heroFrameScore
            )
            modelContext.insert(room)

            do {
                try modelContext.save()
                savedRoomId = room.id
            } catch {
                print("Error saving room: \(error)")
            }
        }

        firstLaunchCoordinator?.completeOnboarding()
    }
}

// MARK: - Preview

#Preview("First Launch - Threshold") {
    let coordinator = AppCoordinator()
    coordinator.firstLaunchCoordinator?.transition(to: .threshold)
    return FirstLaunchContainerView()
        .environment(\.appCoordinator, coordinator)
}

#Preview("First Launch - Walk Invitation") {
    let coordinator = AppCoordinator()
    coordinator.firstLaunchCoordinator?.transition(to: .walkInvitation)
    return FirstLaunchContainerView()
        .environment(\.appCoordinator, coordinator)
}
