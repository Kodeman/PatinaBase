//
//  DailyRoomView.swift
//  Patina
//
//  Option B Today: one next move, one real editorial story, one active room.
//

import SwiftUI
import SwiftData

struct DailyRoomView: View {
    @Environment(\.appCoordinator) private var coordinator
    @Environment(\.modelContext) private var modelContext
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.scanEventChannel) private var scanEvents
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @State private var viewModel = DailyRoomViewModel()
    @State private var notificationsViewModel = NotificationsViewModel()
    @State private var expandedStory: DailyStory?
    @State private var isHelpPanelPresented = false
    @State private var resumableScan: ScanRecoveryService.RecoveryCandidate?
    @Namespace private var cardNamespace

    private var requestStatus: DesignRequestStatusService {
        DesignRequestStatusService.shared
    }

    private var badges: BadgeCountService {
        BadgeCountService.shared
    }

    var body: some View {
        FirstLaunchTour(canAutoStart: coordinator.navigationPath.isEmpty) {
            screenBody
        }
    }

    private var screenBody: some View {
        ZStack(alignment: .bottom) {
            PatinaColors.Background.primary.ignoresSafeArea()

            content
                .accessibilityHidden(expandedStory != nil)

            if let story = expandedStory {
                let featured = viewModel.allRecommendations
                    .first(where: { $0.product.id == story.featuredProductID })?.product
                DailyStoryDetailView(
                    story: story,
                    featuredProduct: featured,
                    namespace: cardNamespace,
                    onDismiss: {
                        withAnimation(reduceMotion ? nil : .patinaHero) {
                            expandedStory = nil
                        }
                    }
                )
                .zIndex(10)
                .transition(.identity)
            }
        }
        .toolbar(.hidden, for: .navigationBar)
        .task {
            viewModel.modelContext = modelContext
            viewModel.load()
            syncCompanionContext()
        }
        .task {
            await notificationsViewModel.load()
        }
        .task {
            await badges.refresh()
            syncCompanionContext()
        }
        .task {
            await requestStatus.refresh()
            syncCompanionContext()
        }
        .task {
            let candidates = await ScanRecoveryService.shared
                .scanForRecoverableSessions(in: modelContext)
            resumableScan = candidates.max(by: { $0.createdAt < $1.createdAt })
        }
        .onChange(of: viewModel.selectedRoomID) { _, _ in
            syncCompanionContext()
        }
        .onChange(of: scenePhase) { _, newPhase in
            guard newPhase == .active else { return }
            viewModel.load()
            syncCompanionContext()
            Task {
                await badges.refresh()
                await requestStatus.refresh()
                syncCompanionContext()
            }
        }
        .helpPanel(
            isPresented: $isHelpPanelPresented,
            surfaceKey: SurfaceKeys.IOSApp.Home.root
        )
    }

    private var content: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 0) {
                DailyGreetingHeader(
                    dateString: viewModel.greetingDate.uppercased(),
                    monogram: UserIdentity.initial,
                    onHelpTap: { isHelpPanelPresented = true },
                    onMonogramTap: { coordinator.navigate(to: .profile) },
                    onBellTap: { coordinator.navigate(to: .notifications) },
                    unreadCount: notificationsViewModel.notifications.filter { !$0.isRead }.count
                )

                TodayNextMoveCard(
                    move: nextMove,
                    onTap: performNextMove
                )
                .padding(.horizontal, 20)
                .padding(.top, 22)

                editorialModule

                if let room = viewModel.activeRoomModel {
                    TodayActiveRoomCard(
                        room: room,
                        recentSavedItem: viewModel.recentSavedItem,
                        onTap: {
                            PostHogService.shared.capture("today_active_room_tapped", properties: [
                                "has_scan": room.hasBeenScanned,
                                "saved_item_count": room.items.count
                            ])
                            ContextMemoryStore.shared.rememberRoom(id: room.id)
                            coordinator.navigate(to: .roomProject(roomId: room.id))
                        }
                    )
                    .padding(.horizontal, 20)
                    .padding(.top, 20)
                }

                Spacer().frame(height: 120)
            }
        }
    }

    @ViewBuilder
    private var editorialModule: some View {
        if let story = viewModel.todayStory {
            Button {
                PostHogService.shared.capture("today_editorial_story_tapped", properties: [
                    "story_id": story.id
                ])
                withAnimation(reduceMotion ? nil : .patinaHero) {
                    expandedStory = story
                }
            } label: {
                DailyStoryCard(
                    story: story,
                    namespace: cardNamespace,
                    isExpanded: expandedStory?.id == story.id
                )
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("DailyRoomView.EditorialStory")
        } else if viewModel.storyLoadFailed {
            HomeStoryRetryRow(onRetry: { viewModel.refreshTodaysStory() })
                .accessibilityIdentifier("DailyRoomView.EditorialStory")
        } else {
            ProgressView("Loading today's story…")
                .font(PatinaTypography.caption)
                .tint(PatinaColors.Text.interactive)
                .frame(maxWidth: .infinity, minHeight: 120)
                .padding(.top, 16)
                .accessibilityIdentifier("DailyRoomView.EditorialStory")
        }
    }

    private var nextMove: TodayNextMove {
        let promoted = requestStatus.promotedRequest
        return TodayExperience.nextMove(for: TodayPriorityInput(
            hasPendingDesignDraft: scanEvents.pendingDesignRequestDraftId != nil,
            resumableScanPhotoCount: resumableScan?.photosCount,
            promotedDesignRequestID: promoted?.leadId.uuidString,
            promotedDesignRequestStatus: promoted.map { request in
                request.stage.cardTitle(
                    studioName: request.studioName,
                    designerName: request.designerName,
                    bookedSlotStartsAt: request.introduction?.pickedSlotStartsAt
                )
            },
            pendingDecisionCount: badges.pendingDecisionCount,
            unreadMessageCount: badges.unreadMessageCount,
            hasStyleProfile: viewModel.hasStyleProfile,
            activeRoom: viewModel.activeRoomCandidate
        ))
    }

    private func performNextMove() {
        let move = nextMove
        PostHogService.shared.capture("today_next_move_tapped", properties: [
            "action_id": move.analyticsID
        ])
        HapticManager.shared.impact(.light)

        if move.kind == .exploreActiveRoom || move.kind == .reviewActiveRoom {
            performRoomMove(move)
            return
        }

        switch move.kind {
        case .resumeDesignRequest:
            scanEvents.setPendingDesignRequestDraft(nil)
            coordinator.presentedSheet = .designServices(roomId: nil, preselectedScanIds: [])
        case .resumeScan:
            continueSavedScan()
        case .trackDesignRequest:
            coordinator.navigate(to: .designRequests(focusLeadId: move.targetID))
        case .reviewDecisions:
            coordinator.navigate(to: .decisionList)
        case .readMessages:
            coordinator.navigate(to: .threadList)
        case .scanFirstRoom:
            OnboardingFunnel.shared.markFirstSessionScanStarted()
            coordinator.navigate(to: .scanFlow(reason: .fresh))
        case .discoverStyle:
            coordinator.navigate(to: .styleQuiz)
        case .exploreActiveRoom, .reviewActiveRoom:
            break
        }
    }

    private func performRoomMove(_ move: TodayNextMove) {
        guard let targetID = move.targetID.flatMap({ UUID(uuidString: $0) }) else {
            coordinator.navigate(to: move.kind == .reviewActiveRoom ? .yourSpaces : .emergence(pieceId: nil))
            return
        }
        ContextMemoryStore.shared.rememberRoom(id: targetID)
        if move.kind == .reviewActiveRoom {
            coordinator.navigate(to: .roomProject(roomId: targetID))
        } else {
            coordinator.navigate(to: .roomEmergence(roomId: targetID))
        }
    }

    private var projectAttentionSummary: String? {
        if let request = requestStatus.promotedRequest {
            return request.stage.cardTitle(
                studioName: request.studioName,
                designerName: request.designerName,
                bookedSlotStartsAt: request.introduction?.pickedSlotStartsAt
            )
        }
        if badges.pendingDecisionCount > 0 {
            return "\(badges.pendingDecisionCount) project \(badges.pendingDecisionCount == 1 ? "decision" : "decisions") waiting"
        }
        if badges.unreadMessageCount > 0 {
            return "\(badges.unreadMessageCount) unread project \(badges.unreadMessageCount == 1 ? "message" : "messages")"
        }
        return nil
    }

    private func syncCompanionContext() {
        coordinator.updateRoomCount(viewModel.roomModels.count)
        coordinator.updateTableItemCount(viewModel.roomModels.reduce(0) { $0 + $1.items.count })
        coordinator.companionContext.hasStyleProfile = viewModel.hasStyleProfile
        coordinator.companionContext.memory = viewModel.companionMemoryContext(
            projectAttentionSummary: projectAttentionSummary
        )
        coordinator.companionContext.attentionSummary = projectAttentionSummary

        if let room = viewModel.activeRoomModel {
            coordinator.updateActiveRoom(ActiveRoomContext(
                id: room.id,
                name: room.name,
                hasBeenScanned: room.hasBeenScanned,
                hasEmergence: room.hasActiveEmergence
            ))
        } else {
            coordinator.updateActiveRoom(nil)
        }
    }

    private func continueSavedScan() {
        guard resumableScan != nil else { return }
        coordinator.navigate(to: .scanFlow(reason: .rescan))
        resumableScan = nil
    }
}

#Preview {
    NavigationStack {
        DailyRoomView()
            .environment(\.appCoordinator, AppCoordinator())
    }
}
