//  CaptureApp.swift
//  Capture
//
//  @main entry. INTEGRATION OWNER edits this file only; feature teams deliver
//  self-contained screens registered via RouteRegistry.

import SwiftUI
import SwiftData
import UIKit
import CaptureKit
import PatinaDesignKit

@main
struct CaptureApp: App {
    @UIApplicationDelegateAdaptor(CaptureAppDelegate.self) private var appDelegate
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

/// App-delegate seam for the site-scan background URLSession (Field Capture P1 · item
/// 8, Part 3). When iOS relaunches Field in the background to hand off finished upload
/// events, it calls this with the system's completion handler; we park it where the
/// uploader can flush it once its session drains (`urlSessionDidFinishEvents`). Any
/// other session identifier is completed immediately.
final class CaptureAppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication,
                     handleEventsForBackgroundURLSession identifier: String,
                     completionHandler: @escaping () -> Void) {
        if identifier == FieldBackgroundScanUploader.sessionIdentifier {
            FieldBackgroundScanUploader.systemCompletionHandler = completionHandler
        } else {
            completionHandler()
        }
    }
}
