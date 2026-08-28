//
//  DailyRoomView.swift
//  Patina
//
//  Today, recomposed around the Record (R1 "now", Direction B §2).
//
//  The blocks this screen mounts are decided by `HomeComposition`, not by the
//  order somebody typed them in: the record draws at every tier that has
//  something true to say, and at guest and discovering an empty record draws
//  nothing at all. The Next Move keeps the second slot only when nothing needs
//  the person — when something does, the record IS the next move.
//
//  The record is UNFLAGGED (R1): rolling it back is deleting one mount.
//
// swiftlint:disable file_length

import SwiftUI
import SwiftData

struct DailyRoomView: View { // swiftlint:disable:this type_body_length
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
    /// SP-08 / Q7: the ask arrives here, once, the first time something
    /// money-shaped is actually waiting for this client.
    @State private var isPushPrimerPresented = false
    @Namespace private var cardNamespace

    private var requestStatus: DesignRequestStatusService {
        DesignRequestStatusService.shared
    }

    private var badges: BadgeCountService {
        BadgeCountService.shared
    }

    /// One tour model per root, and this view hosts only the flag-off root's.
    ///
    /// `FirstLaunchTour` publishes its model down its own subtree. On the
    /// house-first root Today is one of four sibling stacks and B-8's step 3
    /// points at the bar, so the host has to sit above all four —
    /// `HouseFirstRoot` owns it there. Hosting it here as well would put a
    /// second model over Today's anchors and split the tour in half.
    /// `isHouseFirstRoot` is the flag read once at launch and held
    /// (`AppCoordinator`), not a live re-read.
    ///
    /// Only the HOST is gated. Both hosts run the same step list (R4): the
    /// sentences B-8 replaces were untrue on this root too, and the second list
    /// existed only to keep a step alive whose anchor no view has mounted since
    /// W2.
    @ViewBuilder
    var body: some View {
        if coordinator.isHouseFirstRoot {
            screenBody
        } else {
            // `navigationPath` is the flag-off root's single stack.
            FirstLaunchTour(canAutoStart: coordinator.navigationPath.isEmpty) {
                screenBody
            }
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
            presentPushPrimerIfEarned()
        }
        .task {
            // One pass, in order: the record is built over whatever these two
            // services are holding, so it is rebuilt after both have landed —
            // and `markSeen` is stamped inside that rebuild, never before it
            // (`RecordRefresh`).
            await badges.refresh()
            await requestStatus.refresh()
            syncCompanionContext()
            await viewModel.refreshProjectRooms()
            await viewModel.refreshRecord()
            // The visit is stamped inside that rebuild; the server mirror
            // follows it (B §3 — the second device needs `last_seen_at`
            // before the widget does).
            await ProfileService.shared.mirrorLastSeenIfNeeded()
        }
        .task {
            await viewModel.refreshNewThisWeek()
        }
        .task {
            // The house rail draws the account's own rooms beside its project
            // rooms; they only reach this phone if something asks for them.
            await RoomSyncCoordinator.shared.reconcile(store: RoomStore(context: modelContext))
        }
        .task {
            let candidates = await ScanRecoveryService.shared
                .scanForRecoverableSessions(in: modelContext)
            resumableScan = candidates.max(by: { $0.createdAt < $1.createdAt })
        }
        .onChange(of: viewModel.selectedRoomID) { _, _ in
            syncCompanionContext()
        }
        .onChange(of: AuthService.shared.isAuthenticated) { _, isAuthenticated in
            guard isAuthenticated else { return }
            Task {
                await RoomSyncCoordinator.shared.reconcile(store: RoomStore(context: modelContext))
                await badges.refresh()
                await viewModel.refreshProjectRooms()
                await viewModel.refreshRecord()
                await notificationsViewModel.load()
                presentPushPrimerIfEarned()
            }
        }
        .onChange(of: scenePhase) { _, newPhase in
            guard newPhase == .active else { return }
            viewModel.load()
            syncCompanionContext()
            Task {
                await badges.refresh()
                await requestStatus.refresh()
                syncCompanionContext()
                await viewModel.refreshProjectRooms()
                await viewModel.refreshRecord()
                await ProfileService.shared.mirrorLastSeenIfNeeded()
                await viewModel.refreshNewThisWeek()
                // The feed is what the primer trigger reads, and signing in
                // inside this view's lifetime does not re-run the `.task`
                // above — so a client who signed in on this screen would not
                // meet the primer until a relaunch.
                await notificationsViewModel.load()
                presentPushPrimerIfEarned()
            }
        }
        .helpPanel(
            isPresented: $isHelpPanelPresented,
            surfaceKey: SurfaceKeys.IOSApp.Home.root
        )
        .sheet(isPresented: $isPushPrimerPresented) {
            PushPrimerView { isPushPrimerPresented = false }
        }
    }

    /// Arms the once-per-install gate as it presents, so the ask is spent on a
    /// screen the person actually sees rather than on a background pass.
    private func presentPushPrimerIfEarned() {
        guard PushPrimerTrigger.shouldPresent(rows: notificationsViewModel.notifications) else { return }
        guard PushTokenService.shared.armAuthorizationPromptGate() else { return }
        isPushPrimerPresented = true
    }

    // MARK: - Composition

    private var tier: EngagementTier {
        switch EngagementTier.currentState {
        case .known(let tier): return tier
        // While the two services are still in flight the screen asserts
        // nothing about the person: the record's truthful empties wait for a
        // real answer, and the snapshot it painted stands in the meantime.
        case .unknown: return .discovering
        }
    }

    private var designerSeat: DesignerSeat? {
        DesignerSeat.make(
            liveLead: requestStatus.liveLead,
            projects: badges.projects,
            // W4: the seat follows the Record, not `updated_at` — the project
            // carrying the most urgent NEEDS YOU row, so `Message` opens the
            // conversation the screen is about (W2 walk §2).
            record: viewModel.record,
            decisions: badges.pendingDecisions,
            proposals: badges.pendingProposals,
            invoices: badges.payableInvoices,
            nextMoveDetail: nextMove.detail
        )
    }

    private var compositionInput: HomeCompositionInput {
        HomeCompositionInput(
            isSignedIn: AuthService.shared.isAuthenticated,
            tier: tier,
            record: viewModel.record,
            roomCount: viewModel.houseRoomCards.count,
            newThisWeekCount: viewModel.newThisWeek.count,
            hasStory: viewModel.todayStory != nil || viewModel.storyLoadFailed,
            hasDesigner: designerSeat != nil,
            localRoomCount: viewModel.roomModels.count,
            savedPieceCount: viewModel.savedItems.count
        )
    }

    private var blocks: [HomeBlock] { HomeComposition.blocks(for: compositionInput) }

    private var content: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 0) {
                DailyGreetingHeader(
                    dateString: viewModel.greetingDate.uppercased(),
                    greeting: TimeOfDay.current.greeting,
                    attentionCount: BadgeCountService.shared.attentionCount,
                    onHelpTap: { isHelpPanelPresented = true },
                    onStudioTap: { coordinator.navigate(to: .profile) },
                    onBellTap: { coordinator.navigate(to: .notifications) },
                    unreadCount: notificationsViewModel.notifications.filter { !$0.isRead }.count,
                    // M1's header is date, greeting and a bell. The pill is
                    // B-1's fallback door for the root without a bar; where
                    // the bar draws, the Studio tab IS the door.
                    showsStudioControl: !coordinator.isHouseFirstRoot
                )

                if blocks.contains(.record) {
                    HouseRecordCard(
                        record: viewModel.record,
                        drawsEmpties: AuthService.shared.isAuthenticated && tier >= .engaged,
                        onRow: openRecordRow,
                        onSeeAll: { half in
                            PostHogService.shared.capture("today_record_see_all_tapped", properties: [
                                "half": half.rawValue
                            ])
                            coordinator.navigate(to: .profile)
                        }
                    )
                    .padding(.horizontal, PatinaSpacing.mdLarge)
                    .padding(.top, PatinaSpacing.md)
                    // First-launch tour step 2 (B-8). The record is the block
                    // step 1 has just named; when it does not draw — a guest
                    // with nothing true to say — the tour drops the step and
                    // renumbers rather than pointing at nothing. Unconditional
                    // because the record is unflagged (R1); inert on the
                    // flag-off root, whose step list does not name this anchor.
                    .firstLaunchTourAnchor(.todayRecord)
                }

                if blocks.contains(.nextMove) {
                    TodayNextMoveCard(move: nextMove, onTap: performNextMove)
                        .padding(.horizontal, PatinaSpacing.mdLarge)
                        .padding(.top, PatinaSpacing.md)
                }

                if blocks.contains(.designerSeat), let seat = designerSeat {
                    YourDesignerSeat(
                        seat: seat,
                        isOpeningThread: viewModel.isOpeningDesignerThread,
                        onMessage: { openDesignerThread(seat) }
                    )
                    .padding(.horizontal, PatinaSpacing.mdLarge)
                    .padding(.top, PatinaSpacing.xsm)
                }

                if blocks.contains(.roomHero), let room = viewModel.roomModels.first {
                    RoomHeroCard(
                        hero: RoomHero.make(room: room),
                        onOpen: {
                            PostHogService.shared.capture("house_room_opened", properties: [
                                "read_only": false
                            ])
                            ContextMemoryStore.shared.rememberRoom(id: room.id)
                            coordinator.navigate(to: .roomProject(roomId: room.id))
                        },
                        onAddRoom: addRoom
                    )
                    .padding(.top, PatinaSpacing.md)
                }

                if blocks.contains(.houseRail) {
                    YourHouseRail(
                        cards: viewModel.houseRoomCards,
                        onCard: openHouseRoom,
                        onAddRoom: addRoom
                    )
                    .padding(.top, PatinaSpacing.xsm)
                }

                if blocks.contains(.startWithARoom) {
                    StartWithARoomBlock(onAct: addRoom)
                        .padding(.top, PatinaSpacing.md)
                }

                if blocks.contains(.newThisWeek) {
                    NewThisWeekRail(
                        products: viewModel.newThisWeek,
                        onProduct: { product in
                            PostHogService.shared.capture("piece_card_tapped", properties: [
                                "product_id": product.id, "source": "new_this_week"
                            ])
                            coordinator.navigate(to: .pieceDetail(pieceId: product.id))
                        }
                    )
                    .padding(.top, PatinaSpacing.md)
                }

                if blocks.contains(.savedSummary),
                   let summary = SavedSummary.make(items: viewModel.savedItems) {
                    SavedSummaryRow(summary: summary, onOpen: {
                        PostHogService.shared.capture("today_saved_summary_tapped", properties: [
                            "saved_count": summary.count
                        ])
                        coordinator.navigate(to: .table)
                    })
                    .padding(.top, PatinaSpacing.md)
                }

                if blocks.contains(.story) {
                    editorialModule
                }

                if blocks.contains(.signInLine) {
                    Text("Sign in to keep this on every device.")
                        .font(PatinaTypography.caption)
                        .foregroundStyle(PatinaColors.Text.muted)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, PatinaSpacing.mdLarge)
                        .padding(.top, PatinaSpacing.md)
                        .accessibilityIdentifier("DailyRoomView.SignInLine")
                }

                Spacer().frame(height: 120)
            }
        }
    }

    // MARK: - Intent

    private func openRecordRow(_ row: HouseRecordRow) {
        PostHogService.shared.capture("today_record_line_tapped", properties: [
            "kind": row.kind.rawValue
        ])
        guard let route = row.route else { return }
        coordinator.navigate(to: route)
    }

    private func openDesignerThread(_ seat: DesignerSeat) {
        PostHogService.shared.capture("designer_card_message_tapped")
        Task {
            guard let threadId = await viewModel.openDesignerThread(seat) else { return }
            coordinator.navigate(to: .threadDetail(threadId: threadId))
        }
    }

    private func openHouseRoom(_ card: HouseRoomCard) {
        PostHogService.shared.capture("house_room_opened", properties: [
            "read_only": card.isReadOnly
        ])
        switch card.origin {
        case .project(let projectId):
            coordinator.navigate(to: .projectDetail(projectId: projectId))
        case .local(let roomId):
            ContextMemoryStore.shared.rememberRoom(id: roomId)
            coordinator.navigate(to: .roomProject(roomId: roomId))
        }
    }

    private func addRoom(_ act: StartWithARoomAct) {
        PostHogService.shared.capture("house_add_room_tapped", properties: [
            "method": act.rawValue
        ])
        switch act {
        case .typeTheDimensions:
            coordinator.navigate(to: .manualRoomEntry)
        case .scanIt:
            OnboardingFunnel.shared.markFirstSessionScanStarted()
            coordinator.navigate(to: .scanFlow(reason: .fresh))
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
                    isExpanded: expandedStory?.id == story.id,
                    height: storyHeight
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

    /// Card weight follows content: the story keeps the hero footprint on a
    /// quiet day and gives way when the record filled the screen.
    private var storyHeight: CGFloat {
        switch HomeComposition.storyWeight(for: compositionInput) {
        case .hero: return 180
        case .row(let height): return height
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
            activeRoom: viewModel.activeRoomCandidate,
            activeProjectID: liveProject?.id,
            activeProjectName: liveProject?.name,
            activeProjectPhase: liveProject?.current_phase
        ))
    }

    /// W4: literally the same pick the seat makes — one function, called
    /// twice. "See where <project> stands" naming one project while the seat
    /// under it names another is the seat's W2 defect wearing the Next Move's
    /// clothes.
    private var liveProject: RemoteProject? {
        DesignerSeat.activeProject(
            projects: badges.projects,
            record: viewModel.record,
            decisions: badges.pendingDecisions,
            proposals: badges.pendingProposals,
            invoices: badges.payableInvoices
        )
    }

    private func performNextMove() { // swiftlint:disable:this cyclomatic_complexity
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
            coordinator.presentDesignServices(roomId: nil)
        case .resumeScan:
            continueSavedScan()
        case .trackDesignRequest:
            coordinator.navigate(to: .designRequests(focusLeadId: move.targetID))
        case .reviewDecisions:
            coordinator.navigate(to: .decisionList)
        case .readMessages:
            coordinator.navigate(to: .threadList)
        case .openProject:
            guard let projectId = move.targetID else { break }
            coordinator.navigate(to: .projectDetail(projectId: projectId))
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
        // SP-16: the one attention count, not the decision count alone —
        // printing that here is what made Today disagree with the Studio.
        return badges.studioHint
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
