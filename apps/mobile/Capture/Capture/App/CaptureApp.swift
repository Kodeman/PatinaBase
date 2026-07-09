//  CaptureApp.swift
//  Capture
//
//  @main entry. INTEGRATION OWNER edits this file only; feature teams deliver
//  self-contained screens registered via RouteRegistry.

import SwiftUI
import SwiftData
import CaptureKit
import PatinaDesignKit

@main
struct CaptureApp: App {
    @State private var container = AppContainer()

    init() {
        CaptureFonts.registerIfNeeded()
        // R27 Wave 0: shared design-kit fonts (PlayfairDisplay/Inter/DMMono)
        // are registered but UNUSED — CaptureType still renders the Capture
        // faces. The value flip is Wave 1.
        PatinaFonts.registerAll()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(container)
                .modelContainer(container.store.container)
        }
    }
}
