//
//  StyleConversationViewModel.swift
//  Patina
//
//  Observable model for the 5-question Style Conversation.
//  Per PRD §4.6.
//

import Foundation
import SwiftUI

@MainActor
@Observable
public final class StyleConversationViewModel {

    // MARK: - State

    /// Current question index (1...5).
    public private(set) var currentQuestion: Int = 1

    /// Accumulated answers.
    public private(set) var responses = StyleResponseModel()

    /// Room type hint so Q5 can show the correct contextual card set.
    public let roomType: String

    /// Session context (used to build StyleScoreRequest).
    public let session: RoomScanSession

    /// Start time — used for the conversation_completed total duration.
    private let startedAt: Date = Date()

    /// The aesthete engine injected at init time.
    private let engine: AestheteEngineService

    private let analytics = ScanAnalytics.shared
    private let haptics = ScanHaptics.shared

    // MARK: - Callbacks

    public var onFinished: ((StyleProfileResponse) -> Void)?

    public init(
        session: RoomScanSession,
        engine: AestheteEngineService = AestheteEngine.make()
    ) {
        self.session = session
        self.roomType = session.features.roomType.isEmpty ? "living_room" : session.features.roomType
        self.engine = engine
        analytics.track(.conversationStarted)
    }

    // MARK: - Whisper top text per question

    public var whisperTop: String {
        switch currentQuestion {
        case 1: return "Your room is captured · Let's discover your style"
        case 2: return "Keep going — you're doing great"
        case 3: return "Almost there"
        case 4: return "One more thought"
        case 5: return "Last one"
        default: return ""
        }
    }

    public var progressFraction: Float {
        Float(currentQuestion) / 5.0
    }

    // MARK: - Answers

    public func answerQ1(_ choice: VisualResonance) {
        responses.visualResonance = choice
        analytics.track(.q1Answered(selection: choice.rawValue))
        haptics.imageOrPillSelect()
        // Auto-advance after 0.6s per PRD §4.6.1
        Task { [weak self] in
            try? await Task.sleep(for: .seconds(0.6))
            self?.advance()
        }
    }

    public func toggleQ2(_ factor: LifestyleFactor) {
        if let idx = responses.lifestyleFactors.firstIndex(of: factor) {
            responses.lifestyleFactors.remove(at: idx)
        } else {
            responses.lifestyleFactors.append(factor)
        }
        haptics.imageOrPillSelect()
    }

    public func submitQ2() {
        guard !responses.lifestyleFactors.isEmpty else { return }
        analytics.track(.q2Answered(selections: responses.lifestyleFactors.map { $0.rawValue }))
        advance()
    }

    /// Toggles a material selection. Returns true if accepted, false if rejected (>3).
    @discardableResult
    public func toggleQ3(_ material: MaterialPreference) -> Bool {
        if let idx = responses.materialPreferences.firstIndex(of: material) {
            responses.materialPreferences.remove(at: idx)
            haptics.swatchSelect()
            return true
        }
        guard responses.materialPreferences.count < 3 else {
            haptics.swatchRejected()
            return false
        }
        responses.materialPreferences.append(material)
        haptics.swatchSelect()
        return true
    }

    public func submitQ3() {
        guard !responses.materialPreferences.isEmpty else { return }
        analytics.track(.q3Answered(selections: responses.materialPreferences.map { $0.rawValue }))
        advance()
    }

    public func answerQ4(_ tier: InvestmentTier) {
        responses.investmentTier = tier
        analytics.track(.q4Answered(tier: tier.rawValue))
        haptics.imageOrPillSelect()
        // Deferred advance onto next run loop — same pattern as Q1
        Task { [weak self] in
            try? await Task.sleep(for: .seconds(0.6))
            guard let self else { return }
            self.currentQuestion = min(self.currentQuestion + 1, 5)
        }
    }

    public func answerQ5(_ choice: PriorityChoice) {
        responses.priority = choice
        analytics.track(.q5Answered(selection: choice.rawValue))
        haptics.prioritySelect()
        // Auto-advance after 0.8s per PRD §4.6.5
        Task { [weak self] in
            try? await Task.sleep(for: .seconds(0.8))
            guard let self else { return }
            await self.finish()
        }
    }

    // MARK: - Navigation

    public var canContinueQ2: Bool { !responses.lifestyleFactors.isEmpty }
    public var canContinueQ3: Bool { !responses.materialPreferences.isEmpty }

    private func advance() {
        currentQuestion = min(currentQuestion + 1, 5)
    }

    private func finish() async {
        let total = Date().timeIntervalSince(startedAt)
        analytics.track(.conversationCompleted(totalSeconds: total))

        let request = StyleScoreRequest(
            userId: session.userId,
            roomId: session.sessionId.uuidString,
            responses: responses,
            roomType: roomType
        )

        do {
            let profile = try await engine.score(request)
            StyleProfileStore.shared.save(profile)
            onFinished?(profile)
        } catch {
            // On failure, fall back to the local engine so the flow never
            // dead-ends. The HTTP stub currently throws; LocalAestheteEngine
            // should always succeed.
            let fallback = try? await LocalAestheteEngine().score(request)
            if let fallback {
                StyleProfileStore.shared.save(fallback)
                onFinished?(fallback)
            }
        }
    }
}
