//  CaptureLiveActivityController.swift
//  Capture
//
//  Team D — the offline-sync Live Activity driver (R4 / U1). Starts, updates,
//  and ends the Dynamic Island / Lock Screen activity using the FROZEN shared
//  `CaptureSyncAttributes` (CaptureKit). Team F renders the widget against the
//  same attributes; this side only mutates its ContentState.
//
//  Gated with `#if canImport(ActivityKit)` + availability so the app compiles
//  for the iphonesimulator SDK; on a simulator `areActivitiesEnabled` is false,
//  so every call is a safe no-op and the rest of the app still runs.

import Foundation
import CaptureKit
#if canImport(ActivityKit)
import ActivityKit
#endif

@MainActor
final class CaptureLiveActivityController {
    private let sessionStartedAt: Date
    private var venueLabel: String?

    #if canImport(ActivityKit)
    private var activity: Activity<CaptureSyncAttributes>?
    #endif

    init(sessionStartedAt: Date = Date(), venueLabel: String? = nil) {
        self.sessionStartedAt = sessionStartedAt
        self.venueLabel = venueLabel
    }

    /// Begin (or refresh) the offline-sync activity. No-op when activities are
    /// disabled (simulator, user setting) or one is already running.
    func start(venueLabel: String? = nil, state: CaptureSyncAttributes.ContentState) {
        #if canImport(ActivityKit)
        guard #available(iOS 16.1, *) else { return }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }
        if let label = venueLabel { self.venueLabel = label }
        guard activity == nil else { update(state); return }
        let attributes = CaptureSyncAttributes(sessionStartedAt: sessionStartedAt,
                                               venueLabel: self.venueLabel)
        do {
            activity = try Activity.request(
                attributes: attributes,
                content: .init(state: state, staleDate: nil)
            )
        } catch {
            activity = nil
        }
        #endif
    }

    /// Reflect the latest queued/uploading/failed counts on the live activity.
    func update(_ state: CaptureSyncAttributes.ContentState) {
        #if canImport(ActivityKit)
        guard #available(iOS 16.1, *), let activity else { return }
        Task { await activity.update(.init(state: state, staleDate: nil)) }
        #endif
    }

    /// End the activity (queue drained, or session over).
    func end(_ finalState: CaptureSyncAttributes.ContentState? = nil) {
        #if canImport(ActivityKit)
        guard #available(iOS 16.1, *), let activity else { return }
        let content = finalState.map { ActivityContent(state: $0, staleDate: nil) }
        Task { await activity.end(content, dismissalPolicy: .immediate) }
        self.activity = nil
        #endif
    }

    var isRunning: Bool {
        #if canImport(ActivityKit)
        if #available(iOS 16.1, *) { return activity != nil }
        return false
        #else
        return false
        #endif
    }
}
