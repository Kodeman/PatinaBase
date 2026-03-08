//
//  ThresholdViewModel.swift
//  Patina
//
//  ViewModel for the Threshold entry experience
//

import SwiftUI
import Combine

/// ViewModel for the Threshold entry experience
@Observable
public final class ThresholdViewModel {

    // MARK: - State

    /// Current time of day for atmosphere
    public private(set) var timeOfDay: TimeOfDay = .current

    /// Whether the threshold has been completed
    public private(set) var isCompleted = false

    /// Progress of the time cycle animation (0-1)
    public private(set) var cycleProgress: Double = 0

    // MARK: - Private

    private var timeProgressionTask: Task<Void, Never>?
    private let coordinator: AppCoordinator?

    // MARK: - Initialization

    public init(coordinator: AppCoordinator? = nil) {
        self.coordinator = coordinator
        self.timeOfDay = .current
    }

    // MARK: - Time Progression

    /// Start the gentle time-of-day cycling animation
    public func startTimeProgression() {
        // Cancel any existing task
        timeProgressionTask?.cancel()

        // In demo mode, cycle through times slowly
        // In production, this would sync with actual time
        timeProgressionTask = Task { @MainActor in
            // Start at current time
            timeOfDay = .current

            // For demo purposes, we can cycle through times
            // Remove this loop for production to use real time
            #if DEBUG
            // Optional: uncomment to see time cycling in debug
            // await cycleThroughTimes()
            #endif
        }
    }

    /// Stop time progression
    public func stopTimeProgression() {
        timeProgressionTask?.cancel()
        timeProgressionTask = nil
    }

    /// Demo mode: cycle through all times of day
    @MainActor
    private func cycleThroughTimes() async {
        let times: [TimeOfDay] = [.dawn, .day, .evening, .night]
        var index = times.firstIndex(of: timeOfDay) ?? 0

        while !Task.isCancelled {
            try? await Task.sleep(nanoseconds: 10_000_000_000) // 10 seconds per phase

            index = (index + 1) % times.count
            withAnimation(.easeInOut(duration: 2.0)) {
                timeOfDay = times[index]
            }
        }
    }

    // MARK: - Actions

    /// Complete the threshold and transition to main experience
    public func completeThreshold() {
        guard !isCompleted else { return }

        isCompleted = true
        stopTimeProgression()

        // Notify coordinator to transition
        coordinator?.completeThreshold()
    }
}
