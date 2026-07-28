//
//  DailyRoomView.swift
//  Patina
//
//  The Daily Room — editorial home screen for Patina iOS.
//

import SwiftUI
import SwiftData

struct DailyRoomView: View {
    @Environment(\.appCoordinator) private var coordinator
    @Environment(\.modelContext) private var modelContext
    @Environment(\.scenePhase) private var scenePhase
    /// Launch-time signals (scan recovery, design-request resume) published
    /// by PatinaApp's housekeeping task.
    @Environment(\.scanEventChannel) private var scanEvents
    /// Reduce Motion: nil animation = instant state change, so card→detail
    /// morphs and the toast appear without movement.
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var viewModel = DailyRoomViewModel()
    /// PT-3-7: drives the bell unread-count badge in the greeting header.
    @State private var notificationsViewModel = NotificationsViewModel()
    @State private var expandedStory: DailyStory?
    @State private var expandedRecommendation: DailyRecommendation?
    /// Drives the contextual help-panel sheet attached to the Home surface.
    /// Set true by the `?` affordance in `DailyGreetingHeader`.
    @State private var isHelpPanelPresented: Bool = false
    /// PT-4-9: the most recent saved, in-progress scan that the user can
    /// resume. Populated from `ScanRecoveryService` on appear; cleared when
    /// the user dismisses the resume card or continues the scan.
    @State private var resumableScan: ScanRecoveryService.RecoveryCandidate?
    @Namespace private var cardNamespace

    /// Tracked `@Observable` read — the promoted design-request status card
    /// re-renders when a status refresh lands.
    private var requestStatus: DesignRequestStatusService { DesignRequestStatusService.shared }

    var body: some View {
        // First-launch tour wraps the entire screen so the three coachmark
        // anchors (greeting header / + Add / profile monogram) all receive the
        // orchestrator via SwiftUI environment. The orchestrator auto-starts
        // the 3-step sequence on the first launch and persists resolution
        // state so subsequent launches DO NOT re-trigger.
        //
        // `canAutoStart` gates that one-shot on Home actually being visible:
        // post-onboarding we land here with `.emergence` already pushed, and
        // firing the tour under that cover would spend it on a screen nobody
        // sees. Tour fires on first visible Home, by design.
        FirstLaunchTour(canAutoStart: coordinator.navigationPath.isEmpty) {
            screenBody
        }
    }

    /// U05: the toast's "View" opens the room the piece was just added to.
    /// Nil when no room is resolvable, which drops the button rather than
    /// leaving a control that does nothing.
    private var toastViewAction: (() -> Void)? {
        guard let roomId = viewModel.toastRoomID else { return nil }
        return { coordinator.navigate(to: .roomProject(roomId: roomId)) }
    }

    /// R07: the story/product detail "overlays" are conditional siblings in
    /// this same ZStack, not real modal presentations — without explicit
    /// hiding, every background home control stays in the VoiceOver tree
    /// while one is open.
    private var isDetailOverlayPresented: Bool {
        expandedRecommendation != nil || expandedStory != nil
    }

    private var screenBody: some View {
        ZStack(alignment: .bottom) {
            PatinaColors.Background.primary.ignoresSafeArea()

            // R07: hide the home surface (and toast) from assistive tech
            // while a detail overlay is up; the overlays themselves carry
            // `.isModal` + an escape action.
            //
            // R29/R31: `content` now renders for zero-room users too — the
            // greeting header and Studio rail are room-independent (a client
            // can have projects/messages with a designer before ever scanning
            // a room), and the room-dependent feed swaps to an inviting scan
            // module when no rooms exist (the fake seeded rooms are gone).
            Group {
                content

                if let toast = viewModel.toastMessage, expandedRecommendation == nil {
                    // U05: "View" opens the room the piece just landed in.
                    // The button is dropped entirely rather than rendered
                    // inert when the room id is somehow unavailable.
                    AddedToRoomToast(message: toast, onView: toastViewAction)
                    .padding(.bottom, 90)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
            .accessibilityHidden(isDetailOverlayPresented)

            if let rec = expandedRecommendation {
                DailyProductDetailView(
                    recommendation: rec,
                    namespace: cardNamespace,
                    onDismiss: {
                        withAnimation(reduceMotion ? nil : .patinaHero) {
                            expandedRecommendation = nil
                        }
                    }
                )
                .zIndex(10)
                .transition(.identity)
            }

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
        .animation(reduceMotion ? nil : .easeOut(duration: 0.25), value: viewModel.toastMessage)
        .toolbar(.hidden, for: .navigationBar)
        .task {
            viewModel.modelContext = modelContext
            if viewModel.rooms.isEmpty {
                viewModel.load()
            }
        }
        // PT-3-7: hydrate the unread count for the header bell badge.
        .task {
            await notificationsViewModel.load()
        }
        // C.1 / R29: hydrate the Studio-rail badges (pending decisions +
        // unread messages). Polling floor: appear + foreground + push.
        .task {
            await BadgeCountService.shared.refresh()
        }
        // Hydrate the promoted design-request status card + hub-row state.
        // Same polling floor as the badges: appear + foreground + push.
        .task {
            await DesignRequestStatusService.shared.refresh()
        }
        // PT-4-9: surface the most recent resumable in-progress scan, if any.
        .task {
            let candidates = await ScanRecoveryService.shared
                .scanForRecoverableSessions(in: modelContext)
            // Newest first; the service returns oldest-first.
            resumableScan = candidates.max(by: { $0.createdAt < $1.createdAt })
        }
        .onChange(of: scenePhase) { _, newPhase in
            if newPhase == .active {
                viewModel.load()
                // C.1 / R29: re-poll the Studio-rail badges on foreground —
                // half of the polling floor (the other half is push receipt).
                Task { await BadgeCountService.shared.refresh() }
                // Same floor for the design-request status surfaces.
                Task { await DesignRequestStatusService.shared.refresh() }
            }
        }
        .sheet(item: $viewModel.presentingAddFor) { product in
            AddToRoomSheet(
                product: product,
                rooms: viewModel.rooms,
                onSelect: { room in
                    viewModel.addProduct(product, to: room)
                },
                onNewRoom: {
                    viewModel.presentingAddFor = nil
                    coordinator.presentedSheet = .newRoom
                }
            )
        }
        // Contextual help panel — surfaces every Sanity article whose
        // surfaceKey is `ios-app/home` or a child of it. Empty state is
        // displayed when content hasn't shipped yet (Sprint 2 default).
        .helpPanel(
            isPresented: $isHelpPanelPresented,
            surfaceKey: SurfaceKeys.IOSApp.Home.root
        )
    }

    private var content: some View {
        // Read the engagement tier here so the whole home observes the two
        // services that drive it (design-request status + badge counts); the
        // reads register as SwiftUI dependencies and the home re-renders as the
        // client progresses from marketplace → engaged → active project.
        let tierState = EngagementTier.currentState
        return ScrollView(showsIndicators: false) {
            VStack(spacing: 0) {
                DailyGreetingHeader(
                    dateString: viewModel.greetingDate.uppercased(),
                    // U01: the real client's initial. This was a hardcoded
                    // letter — every user got the developer's monogram.
                    monogram: UserIdentity.initial,
                    onHelpTap: { isHelpPanelPresented = true },
                    // PT-0-6: monogram is now the Profile entry point.
                    onMonogramTap: { coordinator.navigate(to: .profile) },
                    // PT-3-7: bell → notifications, badge from unread count.
                    onBellTap: { coordinator.navigate(to: .notifications) },
                    unreadCount: notificationsViewModel.notifications.filter { !$0.isRead }.count
                )

                // PT-4-9: resume card for a saved, in-progress scan.
                if let resumableScan {
                    ContinueScanCard(
                        photosCount: resumableScan.photosCount,
                        createdAt: resumableScan.createdAt,
                        onContinue: { continueSavedScan() },
                        onDismiss: { dismissSavedScan() }
                    )
                    .padding(.horizontal, 20)
                    .padding(.top, 8)
                }

                // Design-request resume banner: PatinaApp's launch
                // housekeeping found an in-flight DesignRequestDraft
                // (uploading / awaiting submit). Tapping reopens the
                // `.designServices` flow, whose bootstrap re-derives the
                // resume-or-discard prompt from the persisted draft. The
                // signal is consumed on tap or dismiss (one-shot per launch);
                // the flow itself also clears it on open so any other door
                // into the flow retires the banner too.
                if scanEvents.pendingDesignRequestDraftId != nil {
                    DesignRequestResumeBanner(
                        onReview: {
                            scanEvents.setPendingDesignRequestDraft(nil)
                            coordinator.presentedSheet = .designServices(
                                roomId: nil,
                                preselectedScanIds: []
                            )
                        },
                        onDismiss: {
                            scanEvents.setPendingDesignRequestDraft(nil)
                        }
                    )
                    .padding(.horizontal, 20)
                    .padding(.top, 8)
                }

                // Promoted status card for a SUBMITTED design request. The
                // service decides which request (if any) is promoted; the card
                // reappears when the stage advances after a dismissal.
                if let promoted = requestStatus.promotedRequest {
                    DesignRequestStatusCard(
                        request: promoted,
                        onOpen: {
                            coordinator.navigate(
                                to: .designRequests(focusLeadId: promoted.leadId.uuidString)
                            )
                        },
                        onDismiss: { requestStatus.dismiss(promoted) }
                    )
                    .padding(.horizontal, 20)
                    .padding(.top, 8)
                }

                // Editorial hero: the "today" story sits front and centre,
                // directly under the greeting/resume cards. The transactional
                // Studio hub is no longer stacked above it — it now grows in
                // BELOW the feed, gated by engagement tier (see bottomSection).
                if let story = viewModel.todayStory {
                    Button {
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
                } else if viewModel.storyLoadFailed {
                    // U29: a failed story fetch used to leave the slot silently
                    // empty, indistinguishable from "no story today".
                    HomeStoryRetryRow(onRetry: { viewModel.refreshTodaysStory() })
                }

                // R31: no rooms → no chip rail, no feed. One inviting scan
                // module instead of three fake seeded rooms — home and
                // Profile now agree that a new user has 0 rooms.
                if viewModel.rooms.isEmpty {
                    PatinaEmptyState(
                        icon: "camera.viewfinder",
                        title: "Scan your first room",
                        message: "Capture a room to see daily picks tailored to your space.",
                        ctaTitle: "Start a scan",
                        ctaAction: {
                            // PT-4-7: a scan started from the empty home counts
                            // toward the first-session activation funnel — this
                            // is the quiz-first variant's numerator (no-op after
                            // the first scan of the launch).
                            OnboardingFunnel.shared.markFirstSessionScanStarted()
                            coordinator.navigate(to: .scanFlow(reason: .fresh))
                        }
                    )
                    .padding(.top, 14)
                } else {
                    roomFeed
                }

                // Progressive disclosure, honestly: `.discovering` gets the
                // designer bridge + what it opens; a resolved tier gets the
                // Studio hub + the marketplace; an unresolved tier gets a
                // skeleton or a retry, never the pitch (U19/U24/U45).
                HomeStudioBlock(
                    state: tierState,
                    unreadNotifications: notificationsViewModel.notifications
                        .filter { !$0.isRead }.count,
                    roomCount: viewModel.rooms.count
                )

                Spacer().frame(height: 120)
            }
        }
    }

    /// The room-dependent half of the home surface: chip rail + filtered
    /// daily recommendations. Only rendered when at least one real room
    /// exists (R31).
    @ViewBuilder
    private var roomFeed: some View {
                RoomChipRail(
                    rooms: viewModel.rooms,
                    selectedID: viewModel.selectedRoomID,
                    onSelect: { viewModel.selectRoom($0) },
                    // U23: the rail switches rooms; this is the only door on
                    // the home to the full gallery.
                    onAllRooms: { coordinator.navigate(to: .yourSpaces) }
                )

                // U29: a failed feed request is not an empty room. It gets a
                // message and a retry, ahead of every empty-state branch.
                if let feedError = viewModel.feedError {
                    PatinaErrorState(
                        message: feedError,
                        action: { viewModel.refreshFeedForSelectedRoom() }
                    )
                    .padding(.horizontal, 20)
                    .padding(.top, 24)
                }
                // Theme V: when the recommendations rail is empty the filter
                // chips have nothing to filter — so the chips + void are
                // replaced by ONE editorial module (quiz prompt when no style
                // profile exists, otherwise a scan/browse prompt). While the
                // feed request is still in flight we render neither, so the
                // module doesn't flash before the first response lands.
                else if viewModel.allRecommendations.isEmpty {
                    if !viewModel.isFeedLoading {
                        DailyFeedEmptyModule(
                            roomName: viewModel.selectedRoom?.name,
                            roomHasItems: (viewModel.selectedRoom?.itemCount ?? 0) > 0,
                            hasStyleProfile: viewModel.hasStyleProfile,
                            onTakeQuiz: { coordinator.navigate(to: .styleQuiz) },
                            onScanRoom: { coordinator.navigate(to: .scanFlow(reason: .fresh)) },
                            onBrowse: { coordinator.navigate(to: .emergence(pieceId: nil)) }
                        )
                        .padding(.horizontal, 20)
                        .padding(.top, 14)
                    }
                } else {
                    RoomContextBar(
                        room: viewModel.selectedRoom,
                        filters: viewModel.categoryFilters,
                        activeFilterID: viewModel.activeFilterID,
                        onSelectFilter: { viewModel.selectFilter($0) },
                        onOpenRoom: {
                            guard let room = viewModel.selectedRoom else { return }
                            PostHogService.shared.capture("room_open_tapped", properties: [
                                "source": "room_context_bar"
                            ])
                            coordinator.navigate(to: .roomProject(roomId: room.id))
                        }
                    )

                    // U03: the feed has items but the active filter matches
                    // none of them — previously an unexplained void under
                    // live chips. The chips stay put so the way out is where
                    // the user already is.
                    if viewModel.recommendations.isEmpty {
                        HomeFilteredFeedEmpty(
                            filterLabel: viewModel.activeFilterLabel,
                            onShowAll: { viewModel.showAllCategories() }
                        )
                    }

                    LazyVStack(spacing: 0) {
                        ForEach(Array(viewModel.recommendations.enumerated()), id: \.element.id) { index, rec in
                            let card = DailyProductCard(
                                recommendation: rec,
                                namespace: cardNamespace,
                                isExpanded: expandedRecommendation?.id == rec.id,
                                onExpand: {
                                    withAnimation(reduceMotion ? nil : .patinaHero) {
                                        expandedRecommendation = rec
                                    }
                                },
                                onAdd: {
                                    viewModel.presentAdd(for: rec.product)
                                },
                                spatialContext: viewModel.spatialContext[rec.product.id] ?? [:]
                            )
                            if index == 0 {
                                // First-launch tour anchor — Step 2's popover
                                // attaches to the topmost daily product card, the
                                // surface that carries the "+ Add" control the
                                // step describes. Only the first card carries
                                // the anchor so the popover doesn't render
                                // multiple times for users with a long feed.
                                card.firstLaunchTourAnchor(.addToRoom)
                            } else {
                                card
                            }
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 6)
                }
    }

}

// MARK: - Saved-scan intents

private extension DailyRoomView {

    /// PT-4-9: resume the saved in-progress scan. Routes into the Quiet
    /// Conversation flow (the host re-bootstraps capture). Captures an event
    /// so resume-rate can be measured against the "Save & continue later"
    /// affordance that produced the saved bundle.
    func continueSavedScan() {
        guard let resumableScan else { return }
        HapticManager.shared.impact(.medium)
        PostHogService.shared.capture("scan_resume_tapped", properties: [
            "photos_count": resumableScan.photosCount
        ])
        // A resumed scan is conceptually a re-scan of work already in flight.
        coordinator.navigate(to: .scanFlow(reason: .rescan))
        self.resumableScan = nil
    }

    /// PT-4-9: dismiss the resume card and permanently discard the saved
    /// bundle so it doesn't keep reappearing.
    func dismissSavedScan() {
        guard let candidate = resumableScan else { return }
        HapticManager.shared.impact(.light)
        let ctx = modelContext
        Task { @MainActor in
            await ScanRecoveryService.shared.discard(candidate.id, in: ctx)
        }
        withAnimation(reduceMotion ? nil : .easeOut(duration: 0.2)) {
            resumableScan = nil
        }
    }
}

#Preview {
    NavigationStack {
        DailyRoomView()
            .environment(\.appCoordinator, AppCoordinator())
    }
}
