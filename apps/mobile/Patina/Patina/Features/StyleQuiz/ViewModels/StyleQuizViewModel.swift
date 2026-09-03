//
//  StyleQuizViewModel.swift
//  Patina
//
//  Manages state, navigation, timing, and submission for the style quiz
//

import SwiftUI
import SwiftData

@Observable
final class StyleQuizViewModel {

    // MARK: - State

    var currentQuestion: Int = 0
    var selections: [Int: Set<Int>] = [:]
    var isSubmitting = false
    var result: StyleProfileResult?
    var isComplete = false

    let questions = QuizContent.allQuestions

    // MARK: - Timing

    private var questionStartTime: Date = Date()
    private var questionTimings: [Int: TimeInterval] = [:]

    /// The scheduled single-select auto-advance, held so `goBack()` can
    /// cancel it.
    @ObservationIgnored
    private var pendingAdvance: Task<Void, Never>?

    /// Where saved progress lives. A seam so a test can use its own suite
    /// rather than writing into `UserDefaults.standard` beside 1600 others.
    @ObservationIgnored
    private let defaults: UserDefaults

    // MARK: - Computed Properties

    var currentQuestionData: QuizQuestion {
        questions[currentQuestion]
    }

    /// A-21 — answers recorded, not the index of the question being shown.
    ///
    /// The bar counted the current question as done throughout: Q1 read 20 %
    /// before anything was chosen, and Q5 read "STEP 5 OF 5 · 100%" with a
    /// full bar while nothing was selected and Continue was disabled.
    var progress: Float {
        guard !questions.isEmpty else { return 0 }
        return Float(answeredCount) / Float(questions.count)
    }

    /// Questions with at least one option chosen.
    var answeredCount: Int {
        selections.values.filter { !$0.isEmpty }.count
    }

    var canAdvance: Bool {
        selections[currentQuestion] != nil && !(selections[currentQuestion]?.isEmpty ?? true)
    }

    // MARK: - Init

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        questionStartTime = Date()
        restoreSavedProgress()
    }

    deinit {
        pendingAdvance?.cancel()
    }

    // MARK: - Saved Progress (R05)

    /// Whether the user has answered anything yet — drives the exit ✕'s
    /// "save or discard?" confirmation (no answers → exit silently).
    var hasAnyAnswers: Bool {
        currentQuestion > 0 || selections.contains { !$0.value.isEmpty }
    }

    private static let savedProgressKey = "styleQuiz.savedProgress.v1"

    /// Snapshot persisted to UserDefaults on "Save progress & exit" so a
    /// later quiz entry resumes at the same question with the same
    /// selections. Question timings are deliberately not persisted — the
    /// confidence heuristic tolerates missing timings.
    private struct SavedProgress: Codable {
        let currentQuestion: Int
        let selections: [Int: Set<Int>]
    }

    /// Persist the in-flight answers + position.
    ///
    /// C1-28: this used to have exactly one caller — the "Save progress &
    /// exit" button inside a confirmation dialog that only existed on the
    /// non-onboarding mount — so a call, a home swipe or a kill mid-quiz lost
    /// every answer, and the onboarding reader could not reach the save at
    /// all. It is now also called on disappear and on backgrounding.
    func saveProgress() {
        let snapshot = SavedProgress(currentQuestion: currentQuestion, selections: selections)
        if let data = try? JSONEncoder().encode(snapshot) {
            defaults.set(data, forKey: Self.savedProgressKey)
        }
    }

    /// Drop any persisted snapshot ("Discard & exit", or quiz submitted).
    func discardSavedProgress() {
        defaults.removeObject(forKey: Self.savedProgressKey)
    }

    /// Resume from a prior "Save progress & exit", if one exists. Called
    /// once from `init` — the view creates a fresh view model per entry.
    private func restoreSavedProgress() {
        guard let data = defaults.data(forKey: Self.savedProgressKey),
              let saved = try? JSONDecoder().decode(SavedProgress.self, from: data) else { return }
        currentQuestion = min(max(saved.currentQuestion, 0), questions.count - 1)
        selections = saved.selections
    }

    // MARK: - Selection

    func toggleSelection(question: Int, option: Int) {
        var current = selections[question] ?? []

        if questions[question].type.isSingleSelect {
            // Single-select: replace selection
            current = [option]
        } else {
            // Multi-select: toggle
            if current.contains(option) {
                current.remove(option)
            } else {
                current.insert(option)
            }
        }
        selections[question] = current

        // Auto-advance for single-select after brief delay. The task is HELD:
        // an unowned one fires after a Back tap made inside the half-second —
        // which is exactly when someone who mis-tapped a swatch taps it — and
        // pushes them forward again.
        if questions[question].type.isSingleSelect {
            recordTiming()
            pendingAdvance?.cancel()
            pendingAdvance = Task { @MainActor [weak self] in
                try? await Task.sleep(for: .seconds(0.5))
                guard !Task.isCancelled else { return }
                self?.advance()
            }
        }
    }

    /// Drop a scheduled auto-advance. Called wherever the reader has taken the
    /// navigation back into their own hands.
    func cancelPendingAdvance() {
        pendingAdvance?.cancel()
        pendingAdvance = nil
    }

    // MARK: - Navigation

    func advance() {
        if currentQuestion < questions.count - 1 {
            withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) {
                currentQuestion += 1
            }
            questionStartTime = Date()
        } else {
            submitQuiz()
        }
    }

    func goBack() {
        cancelPendingAdvance()
        if currentQuestion > 0 {
            withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) {
                currentQuestion -= 1
            }
            questionStartTime = Date()
        }
    }

    // MARK: - Timing

    private func recordTiming() {
        let elapsed = Date().timeIntervalSince(questionStartTime)
        questionTimings[currentQuestion] = elapsed
    }

    // MARK: - Submission

    private func submitQuiz() {
        guard !isSubmitting else { return }
        isSubmitting = true

        // Record final question timing
        recordTiming()

        // R05: a completed run supersedes any saved partial progress.
        discardSavedProgress()

        // Build the local result so we can show something immediately if the
        // network is slow. It will be replaced with the server-authoritative
        // result once the RPC returns.
        let localResult = computeLocalResult()
        self.result = localResult

        let submission = buildSubmission()
        Task { [weak self] in
            do {
                let response = try await ProductAPIClient.shared.processStyleQuiz(answers: submission)
                let serverResult = StyleProfileResult.from(serverResponse: response, fallback: localResult)
                await MainActor.run {
                    guard let self else { return }
                    self.result = serverResult
                    self.isComplete = true
                    self.isSubmitting = false
                }
            } catch {
                #if DEBUG
                PatinaLog.ui.error("[StyleQuiz] Server submission failed; using local result: \(error.localizedDescription)")
                #endif
                await MainActor.run {
                    guard let self else { return }
                    // Keep the local result already on `self.result`.
                    self.isComplete = true
                    self.isSubmitting = false
                }
            }
        }
    }

    /// Compute a style profile result locally from quiz selections
    private func computeLocalResult() -> StyleProfileResult {
        // Q1: Visual resonance → primary style
        let q1Selection = selections[0]?.first ?? 0
        let styleOptions = questions[0].type.options
        let primaryStyleKey = styleOptions[q1Selection].key

        // Q3: Material → primary material
        let q3Selection = selections[2]?.first ?? 0
        let materialOptions = questions[2].type.options
        let materialKey = materialOptions[q3Selection].key

        // Q4: Budget
        let q4Selection = selections[3]?.first ?? 0
        let budgetOptions = questions[3].type.options
        let budgetKey = budgetOptions[q4Selection].key

        let (budgetMin, budgetMax, budgetLabel) = budgetRange(for: budgetKey)

        // Warmth from style
        let warmth: String = ["warm_minimal", "classic_comfort", "eclectic_curated"].contains(primaryStyleKey) ? "Warm" : "Cool"

        // Compute confidence based on completion speed and consistency
        let avgTime = questionTimings.values.reduce(0, +) / max(Double(questionTimings.count), 1)
        let confidence = min(0.95, max(0.65, 1.0 - (avgTime / 20.0)))

        return StyleProfileResult(
            primaryStyle: primaryStyleKey,
            secondaryStyle: nil,
            primaryMaterial: materialKey.replacingOccurrences(of: "_", with: " ").capitalized,
            paletteWarmth: warmth,
            budgetLabel: budgetLabel,
            budgetMin: budgetMin,
            budgetMax: budgetMax,
            confidence: confidence
        )
    }

    private func budgetRange(for key: String) -> (Int, Int, String) {
        switch key {
        case "starter": return (500, 2000, "$500–$2K")
        case "curated_comfort": return (2000, 5000, "$2K–$5K")
        case "heirloom": return (5000, 15000, "$5K+")
        case "discuss": return (0, 0, "TBD")
        default: return (2000, 5000, "$2K–$5K")
        }
    }

    // MARK: - Persist to SwiftData

    /// The completed quiz as the shared taste-row shape. Nil until the quiz
    /// has produced a result.
    func styleSnapshot() -> StylePreferenceSnapshot? {
        guard let result else { return nil }

        // Build materials list from Q3 selection
        let q3Selection = selections[2]?.first ?? 0
        let materialKey = questions[2].type.options[q3Selection].key

        // keywords[0] is display-ready — the Profile badge renders it as-is.
        // Q2 (lifestyle) and Q5 (catalyst) follow as machine keys, in a stable
        // order (`selections` is a Set).
        var keywords: [String] = [result.displayName]
        for idx in (selections[1] ?? []).sorted() {
            keywords.append(questions[1].type.options[idx].key)
        }
        if let q5Selection = selections[4]?.first {
            keywords.append(questions[4].type.options[q5Selection].key)
        }

        return StylePreferenceSnapshot(
            keywords: keywords,
            warmth: result.paletteWarmth == "Warm" ? 0.75 : 0.3,
            formality: 0.5,
            materials: [materialKey],
            eras: [],
            confidence: result.confidence,
            budgetRange: "\(result.budgetMin)-\(result.budgetMax)"
        )
    }

    /// Write the completed quiz to SwiftData. Called from `StyleQuizView` the
    /// moment the quiz completes, so both mounts — the coordinator push and
    /// `OnboardingFlowHost` — persist through one seam.
    @MainActor
    func persistToSwiftData(context: ModelContext) {
        guard let snapshot = styleSnapshot() else { return }
        StylePreferenceStore(context: context).upsert(snapshot)
    }

    /// Build API submission payload
    func buildSubmission() -> QuizSubmission {
        let q1Key = selectedKey(for: 0) ?? "warm_minimal"
        let q2Keys = selectedKeys(for: 1)
        let q3Key = selectedKey(for: 2) ?? "soft_linen"
        let q4Key = selectedKey(for: 3) ?? "curated_comfort"
        let q5Key = selectedKey(for: 4) ?? "making_it_mine"

        let timings = questionTimings.reduce(into: [String: Double]()) { result, pair in
            result["q\(pair.key + 1)"] = round(pair.value * 10) / 10
        }

        return QuizSubmission(
            answers: .init(
                visualResonance: q1Key,
                lifestyle: q2Keys,
                material: q3Key,
                investment: q4Key,
                catalyst: q5Key
            ),
            timings: timings,
            version: "2.0"
        )
    }

    private func selectedKey(for question: Int) -> String? {
        guard let idx = selections[question]?.first else { return nil }
        return questions[question].type.options[idx].key
    }

    private func selectedKeys(for question: Int) -> [String] {
        guard let indices = selections[question] else { return [] }
        return indices.sorted().compactMap { idx in
            guard idx < questions[question].type.options.count else { return nil }
            return questions[question].type.options[idx].key
        }
    }
}
