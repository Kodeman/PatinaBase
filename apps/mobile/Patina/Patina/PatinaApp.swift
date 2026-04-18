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
    @State private var coordinator: AppCoordinator
    @Environment(\.scenePhase) private var scenePhase

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

    init() {
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
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(\.appCoordinator, coordinator)
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
                    await ScanDiskBudget.shared.evictIfNeeded(in: context)
                    let candidates = await ScanRecoveryService.shared.scanForRecoverableSessions(in: context)
                    if !candidates.isEmpty {
                        UserDefaults.standard.set(true, forKey: "pendingScanRecovery")
                        NotificationCenter.default.post(
                            name: .patinaScanRecoveryCandidatesDidAppear,
                            object: nil,
                            userInfo: ["count": candidates.count]
                        )
                    } else {
                        UserDefaults.standard.set(false, forKey: "pendingScanRecovery")
                    }
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

// MARK: - Notifications

public extension Notification.Name {
    /// Posted from the launch task when `ScanRecoveryService` finds one or
    /// more unfinished scan bundles worth offering recovery for. The
    /// `userInfo` carries `"count": Int`. Views that own the recovery
    /// prompt observe this; the `pendingScanRecovery` UserDefaults flag is
    /// also set so late-subscribers can still pick it up.
    static let patinaScanRecoveryCandidatesDidAppear = Notification.Name("patinaScanRecoveryCandidatesDidAppear")
}
