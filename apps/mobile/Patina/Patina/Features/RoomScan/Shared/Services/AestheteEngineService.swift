//
//  AestheteEngineService.swift
//  Patina
//
//  Protocol + two implementations for the Aesthete Engine scoring step.
//  v2.0 ships LocalAestheteEngine (on-device Swift scoring).
//  HTTPAestheteEngine is a stub for when services/aesthete-engine/ (FastAPI)
//  is deployed — swap the implementation in one place, no call-site changes.
//
//  Per "Quiet Conversation" plan — approved decisions: on-device scoring.
//

import Foundation

/// Errors the Aesthete Engine can surface.
public enum AestheteEngineError: Error, LocalizedError {
    case notImplemented
    case transport(Error)
    case decoding(Error)
    case invalidResponse

    public var errorDescription: String? {
        switch self {
        case .notImplemented:   return "Aesthete Engine HTTP client not yet implemented"
        case .transport(let e): return "Network error: \(e.localizedDescription)"
        case .decoding(let e):  return "Could not decode aesthete response: \(e.localizedDescription)"
        case .invalidResponse:  return "Aesthete Engine returned an invalid response"
        }
    }
}

/// Abstract interface for the Aesthete Engine.
public protocol AestheteEngineService {
    func score(_ request: StyleScoreRequest) async throws -> StyleProfileResponse
}

// MARK: - Local (on-device) implementation

/// Pure-Swift scoring that runs without any backend dependency.
/// Ships in v2.0 so the iOS redesign isn't blocked on the FastAPI service.
public struct LocalAestheteEngine: AestheteEngineService {

    /// Artificial latency bounds so the Contemplative Pause has something to pause on.
    private let minLatency: Double
    private let maxLatency: Double

    public init(minLatency: Double = 0.2, maxLatency: Double = 0.4) {
        self.minLatency = minLatency
        self.maxLatency = maxLatency
    }

    public func score(_ request: StyleScoreRequest) async throws -> StyleProfileResponse {
        // Simulate a realistic network/compute delay so the Pause feels earned.
        let latency = Double.random(in: minLatency...maxLatency)
        try? await Task.sleep(nanoseconds: UInt64(latency * 1_000_000_000))

        let vector = Self.computeVector(from: request.responses)
        let (aesthetic, confidence) = Self.nearestAesthetic(to: vector)
        let spectrum = Self.spectrumValues(for: vector)

        return StyleProfileResponse(
            profileId: UUID().uuidString,
            aestheticName: aesthetic.name,
            spectrumValues: spectrum,
            tags: aesthetic.tags,
            confidence: confidence,
            matchingProducts: Self.estimatedMatchingProducts(confidence: confidence)
        )
    }

    // MARK: - Scoring internals

    /// Weighted sum of all Q1-Q5 contributions. Q1 (visual resonance) is the anchor.
    static func computeVector(from responses: StyleResponseModel) -> ImageAttributes {
        var total = ImageAttributes.zero

        if let q1 = responses.visualResonance {
            total = total + (q1.attributes * 1.0) // strongest signal
        }

        // Q2: divide by count so users who multi-select don't over-contribute.
        if !responses.lifestyleFactors.isEmpty {
            let count = Float(responses.lifestyleFactors.count)
            let perWeight = 0.5 / count
            for factor in responses.lifestyleFactors {
                total = total + (factor.attributes * perWeight)
            }
        }

        // Q3: same treatment — up to 3 materials, distributed weight.
        if !responses.materialPreferences.isEmpty {
            let count = Float(responses.materialPreferences.count)
            let perWeight = 0.7 / count
            for material in responses.materialPreferences {
                total = total + (material.attributes * perWeight)
            }
        }

        if let q4 = responses.investmentTier {
            total = total + (q4.attributes * 0.4)
        }

        if let q5 = responses.priority {
            total = total + (q5.attributes * 0.4)
        }

        return total.clamped
    }

    /// Find the closest named aesthetic in (warmth, complexity, formality, era) space.
    /// Returns confidence derived from how clearly this aesthetic beat the runner-up.
    static func nearestAesthetic(to vector: ImageAttributes) -> (NamedAesthetic, Float) {
        let distances = NamedAesthetics.all.map { aesthetic -> (NamedAesthetic, Float) in
            let d = distance(vector, aesthetic.ideal)
            return (aesthetic, d)
        }.sorted { $0.1 < $1.1 }

        guard let best = distances.first else {
            // Safety fallback — should never happen as the list is non-empty.
            return (NamedAesthetics.all[0], 0.5)
        }

        // Confidence: scale based on the gap between best and runner-up, clamped.
        // A clear winner (wide gap) → higher confidence. A tight race → lower.
        let runnerUpDistance = distances.count > 1 ? distances[1].1 : best.1 * 1.5
        let gap = max(0, runnerUpDistance - best.1)
        let confidence = min(1.0, max(0.4, 0.55 + (gap * 0.6)))

        return (best.0, confidence)
    }

    /// Euclidean distance in the 4-dimensional attribute space.
    static func distance(_ a: ImageAttributes, _ b: ImageAttributes) -> Float {
        let dw = a.warmth - b.warmth
        let dc = a.complexity - b.complexity
        let df = a.formality - b.formality
        let de = a.era - b.era
        return (dw * dw + dc * dc + df * df + de * de).squareRoot()
    }

    /// Map the 4-dim vector to the 5 colored spectrum segments from PRD §4.8.
    /// Order: [Clay, Sage, Dusty Blue, Terracotta, Golden Hour]
    /// Each value is 0...1 and the 5 together shape the spectrum bar.
    static func spectrumValues(for vector: ImageAttributes) -> [Float] {
        // Map channels to the 5 segments using mostly positive, clamped projections.
        // Clay       → warmth + era (heritage / wooded / traditional lean)
        // Sage       → -complexity + -formality (calm, breathable)
        // Dusty Blue → -warmth + -era (modern cool)
        // Terracotta → warmth + complexity (layered warmth)
        // Golden     → formality + warmth (refined glow)
        let clay       = normalize((vector.warmth + vector.era) / 2)
        let sage       = normalize((-vector.complexity - vector.formality) / 2)
        let dustyBlue  = normalize((-vector.warmth - vector.era) / 2)
        let terracotta = normalize((vector.warmth + vector.complexity) / 2)
        let golden     = normalize((vector.formality + vector.warmth) / 2)

        return [clay, sage, dustyBlue, terracotta, golden]
    }

    /// Map [-1, 1] → [0.1, 1.0] so no band is invisible.
    private static func normalize(_ v: Float) -> Float {
        let zeroToOne = (v + 1) / 2
        return min(1, max(0.1, zeroToOne))
    }

    /// Very rough placeholder for "matching products" until the real backend ships.
    /// Ranges from 40 (low confidence) to 240 (high confidence).
    static func estimatedMatchingProducts(confidence: Float) -> Int {
        Int(40 + (confidence * 200))
    }
}

// MARK: - HTTP (future backend) stub

/// Stub client for the eventual FastAPI service at `services/aesthete-engine/`.
/// Currently throws `.notImplemented`; swap `LocalAestheteEngine()` for
/// `HTTPAestheteEngine(baseURL: …)` at the injection site once the service ships.
public struct HTTPAestheteEngine: AestheteEngineService {

    public let baseURL: URL
    public let session: URLSession

    public init(baseURL: URL, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.session = session
    }

    public func score(_ request: StyleScoreRequest) async throws -> StyleProfileResponse {
        // TODO: implement once services/aesthete-engine/ (FastAPI) is deployed.
        // POST {baseURL}/api/aesthete/score with JSON body, decode StyleProfileResponse.
        throw AestheteEngineError.notImplemented
    }
}

// MARK: - Factory

public enum AestheteEngine {
    /// Returns the active implementation. Swap this to flip between local and HTTP.
    public static func make() -> AestheteEngineService {
        LocalAestheteEngine()
    }
}
