//
//  ContentView.swift
//  Patina
//
//  Created by Kody Kochaver on 1/18/26.
//

import SwiftUI

/// Main content view that manages navigation based on app state
struct ContentView: View {
    @Environment(\.appCoordinator) private var coordinator

    /// Sheet presentation flags for the `.auth` phase. Apple, Google, and
    /// Guest complete in-place; the email-code flow and the password fallback
    /// each open a form sheet.
    @State private var showingEmailCode = false
    @State private var showingPasswordSignIn = false

    var body: some View {
        ZStack {
            // Root view is selected purely from the derived phase. No
            // imperative dismiss, no overlay-while-also-routing — the
            // observer in AppCoordinator drives every transition.
            switch coordinator.phase {
            case .launching:
                SplashView {
                    // Splash's intrinsic 2s onComplete fires after the
                    // animation. The phase observer is what actually
                    // transitions out of `.launching` (gated on auth
                    // readiness + `splashMinimumDeadline`); this closure
                    // is a no-op kept only because SplashView's API
                    // requires one.
                }

            case .auth:
                AuthScreenView(
                    onSignInWithApple: { result, rawNonce in
                        Task {
                            let viewModel = AuthViewModel()
                            await viewModel.handleAppleSignIn(result: result, rawNonce: rawNonce)
                        }
                    },
                    onSignInWithGoogle: {
                        // Failures set AuthService.errorMessage, which the
                        // welcome screen's error banner surfaces.
                        Task {
                            try? await AuthService.shared.signInWithGoogle()
                        }
                    },
                    onContinueWithEmail: {
                        AuthService.shared.clearError()
                        showingEmailCode = true
                    },
                    onBrowseAsGuest: { coordinator.guestModeOptIn = true },
                    onUsePassword: {
                        AuthService.shared.clearError()
                        showingPasswordSignIn = true
                    },
                    errorMessage: AuthService.shared.errorMessage
                )
                .transition(.opacity)
                // Passwordless email code (unified sign-up + sign-in).
                .sheet(isPresented: $showingEmailCode) {
                    AuthenticationView(initialMode: .magicLink)
                }
                // Password fallback for returning users.
                .sheet(isPresented: $showingPasswordSignIn) {
                    AuthenticationView(initialMode: .signIn)
                }

            case .onboarding:
                OnboardingFlowHost()
                    .transition(.opacity)

            case .main:
                mainContent
                    .transition(.opacity)
            }
        }
        .animation(.easeInOut(duration: 0.5), value: coordinator.phase)
        // PT-3-8 / PT-0-5: one sheet driver for all app-level modals,
        // replacing five boolean flags + five manual `Binding(get:set:)`
        // blocks. SwiftUI clears `presentedSheet` on dismiss.
        .sheet(item: Binding(
            get: { coordinator.presentedSheet },
            set: { coordinator.presentedSheet = $0 }
        )) { sheet in
            sheetContent(for: sheet)
        }
    }

    // MARK: - Sheet Content

    @ViewBuilder
    private func sheetContent(for sheet: AppCoordinator.PresentedSheet) -> some View {
        switch sheet {
        case .settings:
            // PT-0-5: the real SettingsView (notifications / haptics /
            // cellular upload). AccountView is reachable from inside it.
            SettingsView()
        case .qr:
            QRScannerView()
        case .auth:
            AuthSheet()
        case .designServices(let roomId, let preselectedScanIds):
            DesignRequestFlowView(
                preselectedScanIds: preselectedScanIds,
                preselectedRoomId: roomId,
                onClose: { coordinator.presentedSheet = nil },
                onTrack: { leadId in
                    coordinator.navigate(to: .designRequests(focusLeadId: leadId))
                }
            )
        case .newRoom:
            NewRoomSheet()
                .presentationDetents([.medium])
                // PT-5-11: every detent sheet sets the 24pt corner radius.
                .presentationCornerRadius(24)
        case .moveItem(let itemId):
            MoveOrCopyItemSheet(itemId: itemId)
                .presentationDetents([.medium, .large])
                // PT-5-11: every detent sheet sets the 24pt corner radius.
                .presentationCornerRadius(24)
        }
    }

    // MARK: - Main Content

    private var mainContent: some View {
        ZStack {
            PatinaColors.Background.primary
                .ignoresSafeArea()

            // Navigation stack for main features
            NavigationStack(path: Binding(
                get: { coordinator.navigationPath },
                set: { newValue in
                    #if DEBUG
                    if newValue.count != coordinator.navigationPath.count {
                        PatinaLog.nav.debug("[ContentView] navigationPath.count \(coordinator.navigationPath.count) → \(newValue.count)")
                    }
                    #endif
                    coordinator.navigationPath = newValue
                }
            )) {
                mainHomeView
                    .navigationDestination(for: AppRoute.self) { route in
                        destinationView(for: route)
                    }
                    // R04: pushed destinations hide the system nav bar,
                    // which disables UIKit's edge-swipe-back. Re-enable it
                    // for the whole stack (guarded to never fire at root).
                    .interactivePopGestureEnabled()
            }

            // Companion is always present in the `.main` phase. The
            // `.auth` and `.onboarding` phases live in their own root
            // branches above, so this overlay is only reached when the
            // user is already in the main app.
            CompanionOverlay()
        }
        .onChange(of: coordinator.phase) { old, new in
            #if DEBUG
            PatinaLog.nav.debug("[ContentView] phase \(old) → \(new)")
            #endif
        }
    }

    // MARK: - Home View

    /// The client home surface. Patina is a client-only app, so every
    /// signed-in user lands on the DailyRoom.
    @ViewBuilder
    private var mainHomeView: some View {
        DailyRoomView()
    }

    // MARK: - Navigation Destinations

    // Split into one dispatcher + 4 grouped helpers (U18 chrome-cleanup
    // pushed the single switch over SwiftLint's function_body_length /
    // cyclomatic_complexity thresholds). Same exhaustive case coverage as
    // before, just delegated by group — no behavior change.
    @ViewBuilder
    private func destinationView(for route: AppRoute) -> some View {
        switch route {
        case .heroFrame, .roomList, .yourSpaces, .roomDetail, .roomProject,
             .roomSettings, .crossRoom, .manualRoomEntry, .roomSavedItems:
            roomsDestination(for: route)

        case .scanFlow, .emergence, .roomEmergence, .table, .pieceDetail:
            discoveryDestination(for: route)

        case .styleQuiz, .styleResult, .arPlacement, .preScanChecklist:
            styleDestination(for: route)

        case .profile, .notifications, .designerConsultation, .designRequests,
             .projectList, .projectDetail, .decisionList, .decisionDetail:
            workCoreDestination(for: route)

        case .threadList, .threadDetail, .proposalList, .proposalDetail,
             .invoiceList, .invoiceDetail, .budget, .documentList:
            workDocumentsDestination(for: route)
        }
    }

    @ViewBuilder
    private func roomsDestination(for route: AppRoute) -> some View {
        switch route {
        case .heroFrame:
            // `.heroFrame` is a root-reset (it clears the nav path); it is
            // never pushed as a destination, so this arm is unreachable.
            // The home surface is rendered by `mainHomeView`.
            EmptyView()

        case .roomList, .yourSpaces:
            YourSpacesView()

        case .roomDetail(let roomId), .roomProject(let roomId):
            RoomProjectView(roomId: roomId)

        case .roomSettings(let roomId):
            RoomSettingsView(roomId: roomId)

        case .crossRoom:
            CrossRoomView()

        case .manualRoomEntry:
            ManualRoomEntryView()

        case .roomSavedItems(let roomId):
            CollectionsView(roomId: roomId)

        default:
            EmptyView() // unreachable — dispatched only for the cases above
        }
    }

    @ViewBuilder
    private func discoveryDestination(for route: AppRoute) -> some View {
        switch route {
        case .scanFlow:
            // The single Quiet Conversation entry. The host owns the entire
            // internal step sequence (threshold → walk → review → … →
            // floorPlan) so the movements share one RoomScanSession without
            // the nav stack losing data between steps (PT-3-5 / PT-3-6).
            QuietConversationFlowHost()
                .toolbar(.hidden, for: .navigationBar)

        case .emergence(let pieceId):
            if let pieceId {
                ProductDetailView(productId: pieceId)
                    .toolbar(.hidden, for: .navigationBar)
            } else {
                RecommendationsView()
            }

        case .roomEmergence(let roomId):
            // U06/U07: `roomId` here is the LOCAL SwiftData `RoomModel.id`
            // (this case's payload type, per Coordinator.swift) — NOT the
            // remote id the `get_recommendations` RPC and the
            // `saved_items.room_id` FK expect. RecommendationsView resolves
            // it to `RoomModel.remoteId` itself before either is used,
            // falling back to the unscoped marketplace if the room hasn't
            // synced yet.
            RecommendationsView(roomId: roomId.uuidString)

        case .table:
            CollectionsView()

        case .pieceDetail(let pieceId):
            ProductDetailView(productId: pieceId)
                .toolbar(.hidden, for: .navigationBar)

        default:
            EmptyView() // unreachable — dispatched only for the cases above
        }
    }

    @ViewBuilder
    private func styleDestination(for route: AppRoute) -> some View {
        switch route {
        case .styleQuiz:
            StyleQuizView()
                .toolbar(.hidden, for: .navigationBar)

        case .styleResult(let result):
            StyleResultView(result: result, showsChrome: true)

        case .arPlacement(let productId, let roomRemoteId):
            ARPlacementView(productId: productId, roomRemoteId: roomRemoteId)
                .toolbar(.hidden, for: .navigationBar)

        case .preScanChecklist:
            PreScanChecklistView {
                coordinator.navigate(to: .scanFlow(reason: .fresh))
            }
            .toolbar(.hidden, for: .navigationBar)

        default:
            EmptyView() // unreachable — dispatched only for the cases above
        }
    }

    @ViewBuilder
    private func workCoreDestination(for route: AppRoute) -> some View {
        switch route {
        case .profile:
            ProfileView()

        case .notifications:
            NotificationFeedView()

        case .designerConsultation:
            DesignerConsultationView()

        case .designRequests(let focusLeadId):
            DesignRequestStatusView(focusLeadId: focusLeadId)

        case .projectList:
            ProjectListView()

        case .projectDetail(let projectId):
            ProjectDetailView(projectId: projectId)

        case .decisionList:
            DecisionListView()

        case .decisionDetail(let decisionId):
            DecisionDetailView(decisionId: decisionId)

        default:
            EmptyView() // unreachable — dispatched only for the cases above
        }
    }

    @ViewBuilder
    private func workDocumentsDestination(for route: AppRoute) -> some View {
        switch route {
        case .threadList:
            ThreadListView()

        case .threadDetail(let threadId):
            ThreadDetailView(threadId: threadId)

        case .proposalList:
            ProposalListView()

        case .proposalDetail(let proposalId):
            ProposalDetailView(proposalId: proposalId)

        case .invoiceList:
            InvoiceListView()

        case .invoiceDetail(let invoiceId):
            InvoiceDetailView(invoiceId: invoiceId)

        case .budget:
            BudgetView()

        case .documentList:
            DocumentListView()

        default:
            EmptyView() // unreachable — dispatched only for the cases above
        }
    }
}

// MARK: - Preview

#Preview {
    ContentView()
        .environment(\.appCoordinator, AppCoordinator())
}
