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
        // R33 (Wave 2): the legacy Capture faces (Fraunces/Hanken/Plex) are
        // retired — CaptureType now renders the shared PatinaDesignKit faces
        // (PlayfairDisplay/Inter/DMMono), registered process-wide here.
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
