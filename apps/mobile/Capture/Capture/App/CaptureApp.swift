//  CaptureApp.swift
//  Capture
//
//  @main entry. INTEGRATION OWNER edits this file only; feature teams deliver
//  self-contained screens registered via RouteRegistry.

import SwiftUI
import SwiftData
import CaptureKit

@main
struct CaptureApp: App {
    @State private var container = AppContainer()

    init() {
        CaptureFonts.registerIfNeeded()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(container)
                .modelContainer(container.store.container)
        }
    }
}
