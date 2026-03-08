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
                .onChange(of: scenePhase) { _, newPhase in
                    switch newPhase {
                    case .active:
                        PostHogService.shared.capture("app_open")
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
