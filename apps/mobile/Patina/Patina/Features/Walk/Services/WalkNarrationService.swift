//
//  WalkNarrationService.swift
//  Patina
//
//  Manages narration during the room walk.
//  Receives feature detections and emits contextual observations.
//

import Foundation
import Combine
import SwiftUI

/// Service managing walk narration and observations
@MainActor
public final class WalkNarrationService: ObservableObject {

    // MARK: - Published State

    @Published public private(set) var currentNarration: String?
    @Published public private(set) var isThinking = false
    @Published public private(set) var observationHistory: [WalkObservation] = []

    // MARK: - State

    private var lastNarrationTime: Date = .distantPast
    private var narrationCount: Int = 0
    private var narrationCountResetTime: Date = Date()
    private var displayTask: Task<Void, Never>?
    private var openingNarrationPlayed = false

    // MARK: - Constants

    private enum Constants {
        static let minimumInterval: TimeInterval = 8.0 // 8s between narrations
        static let displayDuration: TimeInterval = 4.0 // Show for 4s
        static let maxPerMinute: Int = 3
        static let openingDelay: TimeInterval = 0.5
    }

    // MARK: - Opening Narration

    private let openingNarrations = [
        "Let's begin.",
        "Move slowly — I want to take this in."
    ]

    // MARK: - Guidance Narrations

    private let guidanceNarrations: [GuidanceType: String] = [
        .stuck: "Try moving toward that corner — I'm curious about it.",
        .tooFast: "Slower... I want to really see this.",
        .missingSide: "I haven't seen that side yet. Mind turning?",
        .goodProgress: "We're getting somewhere. Keep going.",
        .almostComplete: "Nearly there. Just a bit more of that area."
    ]

    public enum GuidanceType {
        case stuck
        case tooFast
        case missingSide
        case goodProgress
        case almostComplete
    }

    // MARK: - Initialization

    public init() {}

    // MARK: - Public Methods

    /// Play opening narration sequence
    public func playOpeningNarration() async {
        guard !openingNarrationPlayed else { return }
        openingNarrationPlayed = true

        for (index, narration) in openingNarrations.enumerated() {
            // Delay before showing
            let delay = index == 0 ? Constants.openingDelay : 2.0
            try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))

            // Show narration
            await showNarration(narration, duration: 3.0)
        }

        // Final pause before scanning begins
        try? await Task.sleep(nanoseconds: 2_000_000_000)
    }

    /// Handle a detected feature
    public func handleFeatureDetected(_ feature: DetectedFeature) {
        // Check pacing rules
        guard canShowNarration() else { return }

        // Get observation from feature
        guard let observation = feature.category.toObservation() else { return }

        // Record observation
        observationHistory.append(observation)

        // Show narration
        Task {
            await showNarration(observation.narration, duration: Constants.displayDuration)
        }
    }

    /// Show guidance narration
    public func showGuidance(_ type: GuidanceType) {
        guard canShowNarration() else { return }

        if let narration = guidanceNarrations[type] {
            Task {
                await showNarration(narration, duration: Constants.displayDuration)
            }
        }
    }

    /// Show completion narration
    public func showCompletion() {
        Task {
            // Brief thinking pause
            isThinking = true
            try? await Task.sleep(nanoseconds: 1_000_000_000)
            isThinking = false

            await showNarration("I think I have it.", duration: 3.0)
        }
    }

    /// Reset for new walk
    public func reset() {
        displayTask?.cancel()
        displayTask = nil
        currentNarration = nil
        isThinking = false
        observationHistory = []
        lastNarrationTime = .distantPast
        narrationCount = 0
        openingNarrationPlayed = false
    }

    // MARK: - Private Methods

    private func canShowNarration() -> Bool {
        let now = Date()

        // Check minimum interval
        guard now.timeIntervalSince(lastNarrationTime) >= Constants.minimumInterval else {
            return false
        }

        // Check max per minute
        if now.timeIntervalSince(narrationCountResetTime) >= 60 {
            narrationCount = 0
            narrationCountResetTime = now
        }

        guard narrationCount < Constants.maxPerMinute else {
            return false
        }

        return true
    }

    private func showNarration(_ text: String, duration: TimeInterval) async {
        // Cancel any existing display
        displayTask?.cancel()

        lastNarrationTime = Date()
        narrationCount += 1

        // Fade in
        withAnimation(.easeIn(duration: 0.3)) {
            currentNarration = text
        }

        // Hold for duration
        try? await Task.sleep(nanoseconds: UInt64(duration * 1_000_000_000))

        // Fade out (only if not cancelled)
        if currentNarration == text {
            withAnimation(.easeOut(duration: 0.3)) {
                currentNarration = nil
            }
        }
    }

    deinit {
        displayTask?.cancel()
    }
}
