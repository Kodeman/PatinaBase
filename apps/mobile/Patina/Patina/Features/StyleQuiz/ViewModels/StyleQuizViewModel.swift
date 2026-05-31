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

    // MARK: - Computed Properties

    var currentQuestionData: QuizQuestion {
        questions[currentQuestion]
    }

    var progress: Float {
        Float(currentQuestion + 1) / Float(questions.count)
    }

    var canAdvance: Bool {
        selections[currentQuestion] != nil && !(selections[currentQuestion]?.isEmpty ?? true)
    }

    /// Companion nudge label for the current state
    var companionNudgeLabel: String? {
        if currentQuestion < questions.count - 1, canAdvance {
            return "Next question →"
        } else if currentQuestion == questions.count - 1, canAdvance {
            return "See your style →"
        }
        return nil
    }

    // MARK: - Init

    init() {
        questionStartTime = Date()
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

        // Auto-advance for single-select after brief delay
        if questions[question].type.isSingleSelect {
            recordTiming()
            Task { @MainActor [weak self] in
                try? await Task.sleep(for: .seconds(0.5))
                self?.advance()
            }
        }
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
                print("[StyleQuiz] Server submission failed; using local result: \(error.localizedDescription)")
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

    func persistToSwiftData(context: ModelContext) {
        guard let result = result else { return }

        // Build materials list from Q3 selection
        let q3Selection = selections[2]?.first ?? 0
        let materialKey = questions[2].type.options[q3Selection].key

        // Build keywords from Q2 (lifestyle) and Q5 (catalyst)
        var keywords: [String] = []
        if let q2Selections = selections[1] {
            for idx in q2Selections {
                keywords.append(questions[1].type.options[idx].key)
            }
        }
        if let q5Selection = selections[4]?.first {
            keywords.append(questions[4].type.options[q5Selection].key)
        }

        let warmthValue: Double = result.paletteWarmth == "Warm" ? 0.75 : 0.3

        let profile = StylePreferenceModel(
            warmth: warmthValue,
            formality: 0.5,
            materials: [materialKey],
            eras: [],
            primaryColors: [],
            accentColors: [],
            patternPreference: 0.3,
            scalePreference: 0.5,
            keywords: keywords,
            confidence: result.confidence,
            budgetRange: "\(result.budgetMin)-\(result.budgetMax)"
        )

        context.insert(profile)
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
