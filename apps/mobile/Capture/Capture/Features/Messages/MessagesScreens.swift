//  MessagesScreens.swift
//  Capture · Wave M (Messages)
//
//  Registrar for M1 (`.inbox`) and M2 (`.thread(id)`). Wave M keeps these seams
//  and swaps the placeholders.

import SwiftUI
import CaptureKit

enum MessagesScreens {
    @MainActor
    static func register(into r: RouteRegistry, container: AppContainer, coordinator: CaptureCoordinator) {
        // M1 · .inbox
        r.registerRoute(CaptureRoute.inbox.registryKey) { _ in
            AnyView(InboxPlaceholder())
        }

        // M2 · .thread(id)
        r.registerRoute(CaptureRoute.thread("").registryKey) { route in
            guard case let .thread(id) = route else { return AnyView(EmptyView()) }
            return AnyView(ThreadPlaceholder(threadID: id))
        }
    }
}
