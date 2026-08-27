//
//  PatinaApp.swift
//  Patina
//
//  Created by Kody Kochaver on 1/18/26.
//

import SwiftUI
import SwiftData

@main
struct PatinaApp: App {
    @UIApplicationDelegateAdaptor(PatinaAppDelegate.self) private var appDelegate
    @State private var coordinator: AppCoordinator
    /// PT-6-16: typed cross-view event bus, replacing two NotificationCenter
    /// names + the `pendingScanRecovery` UserDefaults flag.
    @State private var scanEvents = ScanEventChannel()
    @Environment(\.scenePhase) private var scenePhase
    /// Wave 3 dark-mode: user appearance override (System / Light / Dark),
    /// set from Settings → Preferences → Appearance. `system` resolves to a
    /// nil preferredColorScheme so the app follows the OS appearance.
    @AppStorage(AppearanceSetting.storageKey) private var appearanceRaw = AppearanceSetting.system.rawValue

    /// Whether the app is running in UI test mode
    static var isUITesting: Bool {
        ProcessInfo.processInfo.arguments.contains("--uitesting")
    }

    /// Whether to use mock AR in the Walk phase
    static var useMockAR: Bool {
        isUITesting || ProcessInfo.processInfo.arguments.contains("--mockar")
    }

    /// Whether to reset onboarding state (for UI testing)
    static var shouldResetOnboarding: Bool {
        ProcessInfo.processInfo.arguments.contains("--resetonboarding")
    }

    /// Pre-seeded email for the magic-link UI-test bootstrap in
    /// `AuthenticationView`. Set the `UITEST_AUTH_EMAIL` environment variable
    /// on the simulator (XCUITest scheme) to drive an end-to-end auth flow.
    /// Returns `nil` outside of UI testing.
    static var uitestingAuthEmail: String? {
        guard isUITesting else { return nil }
        let value = ProcessInfo.processInfo.environment["UITEST_AUTH_EMAIL"]
        return (value?.isEmpty == false) ? value : nil
    }

    /// Pre-seeded OTP token paired with `uitestingAuthEmail`. Set
    /// `UITEST_AUTH_OTP` on the simulator environment to drive verification.
    /// Returns `nil` outside of UI testing.
    static var uitestingAuthOtp: String? {
        guard isUITesting else { return nil }
        let value = ProcessInfo.processInfo.environment["UITEST_AUTH_OTP"]
        return (value?.isEmpty == false) ? value : nil
    }

    init() {
        // B.3 (Wave 3): register PatinaDesignKit's vendored faces
        // (PlayfairDisplay / Inter / DMMono) process-wide via CTFontManager —
        // the single source of these fonts now that the app-bundle TTF copies
        // + UIAppFonts entries are retired. PatinaTypography resolves them by
        // PostScript name, which works for CTFontManager-registered faces.
        PatinaFonts.registerAll()

        // Reset onboarding state if requested (for UI testing)
        if Self.shouldResetOnboarding {
            AppSettings.shared.hasSeenThreshold = false
            AppSettings.shared.hasCompletedOnboarding = false
            AppSettings.shared.roomCount = 0
        }
        _coordinator = State(initialValue: AppCoordinator())

        // Configure sync service with SwiftData context for persistent queue
        let modelContext = PersistenceController.shared.container.mainContext
        RoomScanSyncService.shared.configure(modelContext: modelContext)

        // Initialize PostHog analytics (skip during UI testing)
        if !Self.isUITesting {
            PostHogService.shared.initialize()
        }

        // Resolve every feature flag once, before the root is chosen, and hold
        // the answer for the session.
        FeatureFlags.shared.resolveAtLaunch()
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .preferredColorScheme((AppearanceSetting(rawValue: appearanceRaw) ?? .system).colorScheme)
                .environment(\.appCoordinator, coordinator)
                .environment(\.scanEventChannel, scanEvents)
                .modelContainer(PersistenceController.shared.container)
                .onOpenURL { url in
                    DeepLinkHandler.shared.handle(url)
                }
                .onAppear {
                    // Configure deep link handler with coordinator
                    DeepLinkHandler.shared.configure(coordinator: coordinator)
                }
                .task(priority: .utility) {
                    // Scan bundle housekeeping on launch: evict oldest synced
                    // bundles if we're over the disk budget, then surface any
                    // recoverable sessions left over from a prior crash /
                    // termination. Both run silently on the main actor's
                    // SwiftData context.
                    let context = PersistenceController.shared.container.mainContext

                    // Strict-local hold migration: flip pre-hold `.pending`
                    // bundles (no bytes server-side) into `.heldLocal`, and
                    // un-strand cellular-parked rows. Runs BEFORE
                    // resumePendingUploads so we never resume a bundle we just
                    // decided to hold. Version-guarded — no-ops after the
                    // first run.
                    ScanHoldMigrator.shared.migrateIfNeeded(in: context)

                    await ScanDiskBudget.shared.evictIfNeeded(in: context)
                    let candidates = await ScanRecoveryService.shared.scanForRecoverableSessions(in: context)
                    // PT-6-16: publish onto the typed channel instead of
                    // posting a NotificationCenter name + writing the
                    // `pendingScanRecovery` UserDefaults flag. Observers read
                    // `scanEventChannel.pendingRecoveryCandidateCount`.
                    scanEvents.setRecoveryCandidateCount(candidates.count)

                    // Design-request draft resume: if a request was left
                    // mid-upload / awaiting-submit when the app was killed,
                    // surface it for a "resume your request" banner. The flow
                    // is never auto-reopened or auto-submitted.
                    if let draft = try? context.fetch(DesignRequestDraft.activeDraftDescriptor).first,
                       draft.phase.needsResumePrompt {
                        scanEvents.setPendingDesignRequestDraft(draft.id)
                    } else {
                        scanEvents.setPendingDesignRequestDraft(nil)
                    }

                    // Resume any advanced scan bundles left in syncing/failed
                    // state from a prior session. `uploadAdvancedScanBundle`
                    // is idempotent (uploaded artifacts are skipped), so
                    // re-entering is safe. Runs after the housekeeping pass
                    // above so we don't retry bundles we're about to evict.
                    // Held bundles are excluded by construction (the resume
                    // predicate fetches syncing/failed only).
                    await RoomScanSyncService.shared.resumePendingUploads(in: context)
                }
                .onChange(of: scenePhase) { _, newPhase in
                    switch newPhase {
                    case .active:
                        PostHogService.shared.capture("app_open")
                        // Retry any persistent-queue scan uploads that were
                        // stranded while the app was suspended / offline.
                        Task { @MainActor in
                            await RoomScanSyncService.shared.processQueueIfOnline()
                        }
                        // Push: for a returning user who already granted
                        // notification authorization in a prior session,
                        // re-register on every foreground to keep the
                        // uploaded token fresh. No-ops (no prompt, no call)
                        // if authorization was never granted.
                        Task { @MainActor in
                            await PushTokenService.shared.reregisterIfAuthorized()
                        }
                    case .background:
                        PostHogService.shared.capture("app_background")
                        PostHogService.shared.flush()
                    default:
                        break
                    }
                }
        }
    }
}
