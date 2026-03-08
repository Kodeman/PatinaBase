//
//  WalkViewModel.swift
//  Patina
//
//  ViewModel for the Walk experience
//

import SwiftUI
import Observation

/// ViewModel for the Walk (AR room scanning) experience
@MainActor
@Observable
public final class WalkViewModel {

    // MARK: - Properties

    /// Current state of the walk
    private(set) var state: WalkState = .notStarted

    /// Current room being walked
    var currentRoom: String = "Your Living Room"

    /// Current narration being displayed
    private(set) var currentNarration: WalkNarration?

    /// Whether thinking indicator should show
    private(set) var isThinking = false

    /// Progress through the walk (0-1)
    var progress: Double = 0

    /// Number of areas scanned
    private(set) var areasScanned: Int = 0

    /// Total areas to scan (for demo)
    let totalAreas: Int = 5

    /// All narrations for this walk
    private var narrations: [WalkNarration] = []
    private var narrationIndex = 0
    private var narrationTask: Task<Void, Never>?

    // MARK: - State

    public enum WalkState: Equatable {
        case notStarted
        case starting
        case walking
        case paused
        case completed
    }

    // MARK: - Initialization

    public init() {
        narrations = WalkNarration.sampleNarrations
    }

    // MARK: - Actions

    /// Start the walk experience
    public func startWalk() {
        guard state == .notStarted else { return }

        state = .starting
        HapticManager.shared.impact(.medium)

        // Transition to walking after brief delay
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) { [weak self] in
            self?.state = .walking
            self?.beginNarration()
        }
    }

    /// Pause the walk
    public func pauseWalk() {
        guard state == .walking else { return }
        state = .paused
        narrationTask?.cancel()
    }

    /// Resume the walk
    public func resumeWalk() {
        guard state == .paused else { return }
        state = .walking
        showNextNarration()
    }

    /// Complete the walk
    public func completeWalk() {
        state = .completed
        narrationTask?.cancel()
        HapticManager.shared.notification(.success)
    }

    /// Reset for a new walk
    public func reset() {
        state = .notStarted
        currentNarration = nil
        isThinking = false
        progress = 0
        areasScanned = 0
        narrationIndex = 0
        narrationTask?.cancel()
    }

    // MARK: - Narration

    private func beginNarration() {
        narrationIndex = 0
        showNextNarration()
    }

    private func showNextNarration() {
        guard state == .walking else { return }
        guard narrationIndex < narrations.count else {
            // Walk complete
            completeWalk()
            return
        }

        narrationTask?.cancel()
        narrationTask = Task { [weak self] in
            guard let self = self else { return }

            // Show thinking indicator
            await MainActor.run {
                self.isThinking = true
                self.currentNarration = nil
            }

            // Brief pause before showing narration
            try? await Task.sleep(nanoseconds: 1_500_000_000) // 1.5 seconds

            guard !Task.isCancelled else { return }

            // Show narration
            let narration = self.narrations[self.narrationIndex]
            await MainActor.run {
                withAnimation(.easeOut(duration: 0.5)) {
                    self.isThinking = false
                    self.currentNarration = narration
                }
                HapticManager.shared.companionPulse()
            }

            // Update progress
            await MainActor.run {
                self.areasScanned = min(self.areasScanned + 1, self.totalAreas)
                self.progress = Double(self.areasScanned) / Double(self.totalAreas)
            }

            // Wait for narration duration
            let duration = UInt64(narration.pauseDuration * 1_000_000_000)
            try? await Task.sleep(nanoseconds: duration)

            guard !Task.isCancelled else { return }

            // Move to next narration
            await MainActor.run {
                self.narrationIndex += 1
            }

            self.showNextNarration()
        }
    }
}
