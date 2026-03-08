//
//  WalkNarration.swift
//  Patina
//
//  Narration model for the Walk experience
//

import Foundation

/// A narration moment during the Walk
public struct WalkNarration: Identifiable, Equatable {
    public let id: String
    public let text: String
    public let type: NarrationType
    public let pauseDuration: TimeInterval

    public init(
        id: String = UUID().uuidString,
        text: String,
        type: NarrationType = .observation,
        pauseDuration: TimeInterval = 3.0
    ) {
        self.id = id
        self.text = text
        self.type = type
        self.pauseDuration = pauseDuration
    }

    public enum NarrationType {
        case observation   // "I notice the light here..."
        case appreciation  // "This space has character..."
        case question      // "What happens here?"
        case pause         // "Let's stay here a moment..."
        case transition    // "Moving on..."
    }
}

// MARK: - Mock Narrations

public extension WalkNarration {

    /// Sample narrations for the Walk experience
    static let sampleNarrations: [WalkNarration] = [
        WalkNarration(
            text: "I notice the light here... afternoon sun from the south. That changes things.",
            type: .observation,
            pauseDuration: 4.0
        ),
        WalkNarration(
            text: "Let's stay here a moment.",
            type: .pause,
            pauseDuration: 3.0
        ),
        WalkNarration(
            text: "These walls have seen conversations. I can sense the warmth.",
            type: .appreciation,
            pauseDuration: 4.0
        ),
        WalkNarration(
            text: "What happens in this corner? Reading? Thinking?",
            type: .question,
            pauseDuration: 3.5
        ),
        WalkNarration(
            text: "The ceiling height opens possibilities...",
            type: .observation,
            pauseDuration: 3.0
        ),
        WalkNarration(
            text: "I'm beginning to understand this space.",
            type: .transition,
            pauseDuration: 2.5
        ),
        WalkNarration(
            text: "There's room here for something meaningful.",
            type: .appreciation,
            pauseDuration: 3.0
        )
    ]

    /// Get narrations for a specific room type
    static func narrations(for roomType: String) -> [WalkNarration] {
        switch roomType.lowercased() {
        case "living room":
            return [
                WalkNarration(text: "A living room... where life unfolds.", type: .observation),
                WalkNarration(text: "I notice how the light falls here.", type: .observation),
                WalkNarration(text: "This is where stories are shared.", type: .appreciation),
                WalkNarration(text: "Let's see what spaces open up.", type: .transition)
            ]
        case "bedroom":
            return [
                WalkNarration(text: "A quiet space. For rest and dreams.", type: .observation),
                WalkNarration(text: "The morning light would come from...", type: .observation),
                WalkNarration(text: "Peace deserves a proper setting.", type: .appreciation)
            ]
        case "dining room":
            return [
                WalkNarration(text: "Where people gather. Where bread is broken.", type: .observation),
                WalkNarration(text: "The table is the heart of this room.", type: .appreciation),
                WalkNarration(text: "How many conversations will happen here?", type: .question)
            ]
        default:
            return sampleNarrations
        }
    }
}
