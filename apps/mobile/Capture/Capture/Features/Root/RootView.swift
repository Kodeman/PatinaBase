//  RootView.swift
//  Capture
//
//  The app shell: Camera and Work are peer realms with independent
//  NavigationStacks, both driven by CaptureCoordinator and RouteRegistry.

import SwiftUI
import CaptureKit

struct RootView: View {
    @Environment(AppContainer.self) private var container
    /// Starts in `.launching`; `.task` resolves the opening phase from the
    /// session (restored → `.ready`; none → `.auth`). Mock mode reports
    /// authenticated instantly, so it settles on `.ready` with no visible delay.
    @State private var coordinator = CaptureCoordinator(phase: .launching)
    /// Flips true once `ScreenRegistry.registerAll` has run in `.task`. Because
    /// `RouteRegistry.hasRoute(...)` is a plain lookup (not observable), the root
    /// would otherwise render the static placeholder once and never swap to the
    /// real viewfinder. This @State makes `rootContent` re-evaluate post-register.
    @State private var registered = false
    /// Step for the phase-based onboarding flow (real mode with no session).
    @State private var onboardingFlowStep = 0
    /// Runs `field://login` deep-link sign-in (portal QR handoff). Owned by the
    /// composition root so the deep-link handler, this shell, and Q1 share one
    /// instance; configured in `.task` once `coordinator` can be bound.
    private var portalLogin: PortalLoginController { container.portalLogin }

    var body: some View {
        @Bindable var coord = coordinator
        realmShell
        .environment(coordinator)
        .environment(container.companion)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            companionSurface
        }
        .sheet(item: $coord.sheet) { sheet in
            RouteRegistry.shared.view(for: sheet)
        }
        .fullScreenCover(isPresented: Binding(
            get: { coord.onboardingStep != nil },
            set: { if !$0 { coord.onboardingStep = nil } }
        )) {
            OnboardingScreens.view(forStep: coord.onboardingStep ?? 0, analytics: container.analytics)
        }
        .task {
            ScreenRegistry.registerAll(container: container, coordinator: coordinator)
            registered = true
            // Wire the portal-QR sign-in controller; a signed-in exchange leaves
            // onboarding for the app surface. Replays any cold-start login link.
            portalLogin.configure(
                session: container.session,
                authorizer: container.authorizer,
                onSignedIn: { if coordinator.phase != .ready { coordinator.phase = .ready } }
            )
            // Resolve the opening phase honestly from the session: a restored
            // session goes straight to the viewfinder; no session lands on
            // O1/O2 onboarding. Mock mode is authenticated immediately, so this
            // settles on `.ready` and the `-CaptureScreen` harness is unaffected.
            await container.session.waitForReady()
            if coordinator.phase == .launching {
                coordinator.phase = container.session.isAuthenticated ? .ready : .auth
            }
            if container.session.isAuthenticated {
                await container.sync.reconcilePendingTransfers()
                await container.siteScan.reconcilePendingUploads()
            }
            if let raw = AppConfiguration.initialScreenRaw,
               let id = CaptureScreenID.allCases.first(where: { $0.rawValue.hasSuffix(raw) }) {
                CaptureDeepLink.drive(screen: id, coordinator: coordinator, store: container.store)
            }
        }
        .task(id: companionPlacement) {
            applyCompanionPlacement()
        }
        .onOpenURL { url in
            CaptureDeepLink.handle(url, coordinator: coordinator, store: container.store, login: portalLogin)
        }
        .onChange(of: coordinator.phase) {
            // Entering onboarding (cold start with no session, or after sign-out)
            // always restarts the flow at O1.
            if coordinator.phase == .auth { onboardingFlowStep = 0 }
        }
        // Portal-QR sign-in over a live session: confirm before switching.
        .alert(
            "Sign in with this code?",
            isPresented: Binding(
                get: { portalLogin.confirmPrompt != nil },
                set: { if !$0 { portalLogin.cancelSwitch() } }
            ),
            presenting: portalLogin.confirmPrompt
        ) { _ in
            Button("Sign in") { portalLogin.confirmSwitch() }
            Button("Cancel", role: .cancel) { portalLogin.cancelSwitch() }
        } message: { prompt in
            Text(prompt.currentEmail.map {
                "You’re signed in as \($0). Continue to sign in with this code?"
            } ?? "You’re already signed in. Continue to sign in with this code?")
        }
        .overlay(alignment: .top) { portalLoginToast }
    }

    @ViewBuilder private var companionSurface: some View {
        if !usesFeatureOwnedCompanionSurface {
            FieldCompanionHearthView(
                presentation: container.companion.presentation,
                onOpen: expandCompanion,
                onDismiss: { container.companion.send(.dismiss) },
                onAction: handleCompanionAction
            )
            .padding(.vertical, 8)
        }
    }

    private var usesFeatureOwnedCompanionSurface: Bool {
        guard coordinator.phase == .ready else { return false }
        switch coordinator.path(for: coordinator.activeRealm).last {
        case .siteScan, .syncStatus:
            return true
        default:
            return false
        }
    }

    private var companionPlacement: FieldCompanionPlacement {
        guard coordinator.phase == .ready,
              coordinator.guestAccessToken == nil,
              coordinator.onboardingStep == nil else {
            return .hidden(.onboarding)
        }

        let realm = coordinator.activeRealm
        let route = coordinator.path(for: realm).last
        switch route {
        case .siteScan, .syncStatus:
            return .featureOwned
        default:
            break
        }
        if coordinator.sheet != nil {
            return .hidden(.modalPresented)
        }
        if realm == .camera, route == nil {
            return .hidden(.cameraActive)
        }
        switch route {
        case .qrScan:
            return .hidden(.featureOwned)
        default:
            return .collapsed(realm, route)
        }
    }

    private func applyCompanionPlacement() {
        switch companionPlacement {
        case let .hidden(reason):
            container.companion.send(.hide(reason: reason))
        case .featureOwned:
            break
        case let .collapsed(realm, route):
            container.companion.send(.collapse(
                hint: companionHint(for: realm, route: route),
                action: nil
            ))
        }
    }

    private func companionHint(for realm: FieldRealm, route: CaptureRoute?) -> String {
        switch route {
        case .syncStatus:
            return "Sync status"
        case .specimen:
            return "Review this specimen"
        case .session:
            return "Review this session"
        case .settings, .account:
            return "Field settings"
        default:
            return realm == .work ? "What needs you" : "Next steps"
        }
    }

    private func expandCompanion() {
        guard case let .collapsed(content) = container.companion.presentation else {
            return
        }
        let destination: FieldCompanionAction
        let detail: String
        switch coordinator.activeRealm {
        case .camera:
            destination = .init(id: "realm.work", label: "Open Work")
            detail = "Keep capturing, or see what needs your attention in Work."
        case .work:
            destination = .init(id: "realm.camera", label: "Open Camera")
            detail = "Your active work stays in place while you return to Camera."
        }
        container.analytics.event("field.companion_opened", [
            "realm": coordinator.activeRealm.rawValue
        ])
        container.companion.send(.communicate(.init(
            title: content.hint,
            detail: detail,
            primaryAction: destination
        )))
    }

    private func handleCompanionAction(_ action: FieldCompanionAction) {
        container.analytics.event("field.companion_action", ["action": action.id])
        switch action.id {
        case "realm.work":
            coordinator.switchRealm(.work)
        case "realm.camera":
            coordinator.switchRealm(.camera)
        default:
            break
        }
    }

    @ViewBuilder private var realmShell: some View {
        switch coordinator.activeRealm {
        case .camera:
            realmNavigation(.camera)
        case .work:
            realmNavigation(.work)
        }
    }

    private func realmNavigation(_ realm: FieldRealm) -> some View {
        NavigationStack(path: Binding(
            get: { coordinator.path(for: realm) },
            set: { coordinator.replacePath($0, for: realm) }
        )) {
            rootContent(for: realm)
                .navigationDestination(for: CaptureRoute.self) { route in
                    RouteRegistry.shared.view(for: route)
                }
        }
    }

    /// Transient banner for portal-QR deep-link sign-in outcomes.
    @ViewBuilder private var portalLoginToast: some View {
        if let toast = portalLogin.toast {
            Text(toast.message)
                .font(CaptureType.footnote)
                .foregroundStyle(CaptureColor.paper)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .background(
                    Capsule().fill(toastTint(toast.kind))
                )
                .padding(.horizontal, 24)
                .padding(.top, 12)
                .frame(maxWidth: .infinity)
                .transition(.move(edge: .top).combined(with: .opacity))
                .accessibilityIdentifier("portalLogin.toast")
        }
    }

    private func toastTint(_ kind: PortalLoginToast.Kind) -> Color {
        switch kind {
        case .success: return CaptureColor.verdigris
        case .info:    return CaptureColor.ink2
        case .error:   return CaptureColor.error
        }
    }

    @ViewBuilder private func rootContent(for realm: FieldRealm) -> some View {
        if let accessToken = coordinator.guestAccessToken {
            GuestSiteRequestRootView(
                accessToken: accessToken,
                container: container,
                coordinator: coordinator)
        } else { switch coordinator.phase {
        case .launching:
            ViewfinderPlaceholder()
        case .auth, .permissionPriming:
            // Real mode, no restored session → the O1→O4 onboarding sequence,
            // wired to the real "Continue with Patina" authorizer.
            OnboardingFlowView(
                step: $onboardingFlowStep,
                authorizer: container.authorizer,
                analytics: container.analytics,
                onSelectWorkspace: { container.session.selectWorkspace(id: $0) },
                // Real mode starts O2 empty — the real orgs arrive from
                // authorize(); demo seeding is mock-only (harness/previews).
                seedWorkspaces: AppConfiguration.runsRealServices ? [] : OnboardingWorkspace.demo,
                onSignOut: {
                    Task { await container.session.signOut() }
                    onboardingFlowStep = 0   // back to O1; fresh O2 on return
                },
                onComplete: { coordinator.phase = .ready }
            )
        case .ready:
            // `registered` is read first so this recomputes once registration
            // runs. Each realm owns a stable root; crossing between them replaces
            // the live camera hierarchy, triggering ViewfinderScreen's stop().
            let rootRoute: CaptureRoute = realm == .camera ? .viewfinder : .work
            if registered, RouteRegistry.shared.hasRoute(rootRoute) {
                RouteRegistry.shared.view(for: rootRoute)
            } else {
                ViewfinderPlaceholder()
            }
        } }
    }
}

private enum FieldCompanionPlacement: Equatable {
    case hidden(FieldCompanionHiddenReason)
    case featureOwned
    case collapsed(FieldRealm, CaptureRoute?)
}
