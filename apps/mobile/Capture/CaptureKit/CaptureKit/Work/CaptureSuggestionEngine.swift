//  CaptureSuggestionEngine.swift
//  CaptureKit
//
//  The learned filing place (spec §2.2): remember where a capture was FILED
//  against its project; next visit, proximity offers that project back. Free,
//  on-device, offline, explainable, and needing zero schema on `projects` —
//  which is why it replaces CLVisit as the first suggestion source, with no
//  Always-location entitlement and no App Review conversation.
//
//  A suggestion is ALWAYS a question. The basis is shown in WORDS; the
//  confidence exists only to ORDER the tray (Principle 4).

import Foundation

public struct CaptureSuggestion: Equatable, Sendable {
    public let projectID: String
    /// FC-R5: the `project_rooms` lane, when a suggestion reaches a room at all.
    /// Never a `public.rooms` id.
    public let projectRoomID: String?
    public let basis: FieldSuggestionBasis
    /// ORDERS the tray. NEVER RENDERED (Principle 4).
    public let confidence: Double
    /// The basis, in WORDS — this is what a designer sees, always.
    public let reason: String

    public init(projectID: String, projectRoomID: String?,
                basis: FieldSuggestionBasis, confidence: Double, reason: String) {
        self.projectID = projectID
        self.projectRoomID = projectRoomID
        self.basis = basis
        self.confidence = confidence
        self.reason = reason
    }
}

public enum CaptureSuggestionEngine {
    public static let proximityRadiusMeters: Double = 150
    /// One filing is a coincidence. The gate is what turns a single remembered
    /// coordinate into a place she works.
    public static let minimumFilingsForCentroid = 3

    /// Computed ON DEVICE at capture time, so it exists offline (§13.4).
    public static func suggest(coordinate: CaptureCoordinate?,
                               venueLabel: String?,
                               projects: [CaptureProjectSnapshot],
                               now: Date) -> CaptureSuggestion? {
        // Standing somewhere she has filed from before is the strongest thing
        // this engine knows, so it is asked first and a venue name only answers
        // when it comes back empty.
        if let coordinate, let nearest = nearestFilingPlace(to: coordinate, in: projects) {
            let count = nearest.project.filedCaptureCount
            let noun = count == 1 ? "capture" : "captures"
            return CaptureSuggestion(
                projectID: nearest.project.id,
                projectRoomID: nil,
                basis: .proximity,
                confidence: confidence(forDistance: nearest.distance, filings: count),
                reason: "You filed \(count) \(noun) to \(nearest.project.name) from right here")
        }

        if let venueLabel = venueLabel?.trimmingCharacters(in: .whitespacesAndNewlines),
           !venueLabel.isEmpty,
           let match = projects.first(where: {
               $0.name.localizedCaseInsensitiveCompare(venueLabel) == .orderedSame
           }) {
            return CaptureSuggestion(
                projectID: match.id,
                projectRoomID: nil,
                basis: .venue,
                confidence: 0.45,
                reason: "You're at a place called \(match.name)")
        }

        // No signal is an answer. Guessing from a bare project list would put a
        // question in front of her that nothing on this phone can stand behind.
        return nil
    }

    private struct Candidate {
        let project: CaptureProjectSnapshot
        let distance: Double
    }

    private static func nearestFilingPlace(to coordinate: CaptureCoordinate,
                                           in projects: [CaptureProjectSnapshot]) -> Candidate? {
        projects
            .compactMap { project -> Candidate? in
                guard project.filedCaptureCount >= minimumFilingsForCentroid,
                      let filingPlace = project.lastFiledCoordinate else { return nil }
                let distance = coordinate.distanceMeters(to: filingPlace)
                guard distance <= proximityRadiusMeters else { return nil }
                return Candidate(project: project, distance: distance)
            }
            .min { $0.distance < $1.distance }
    }

    /// Closer and more-often-filed ⇒ higher. Bounded to 0.5…0.95 so a suggestion
    /// never reads as certainty, and never as noise.
    private static func confidence(forDistance distance: Double, filings: Int) -> Double {
        let nearness = 1 - min(1, distance / proximityRadiusMeters)
        let history = min(1, Double(filings) / 10)
        return min(0.95, 0.5 + 0.45 * (0.7 * nearness + 0.3 * history))
    }
}
