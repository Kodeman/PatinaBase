//
//  CompanionVoice.swift
//  Patina
//
//  Consistent voice patterns for the Companion
//  Warm, curious, unhurried - never robotic, never salesy
//

import Foundation

// MARK: - Companion Voice

/// Service for generating responses in Patina's voice
public final class CompanionVoice {

    public static let shared = CompanionVoice()

    private init() {}

    // MARK: - Voice Principles

    /*
     Voice Guidelines:
     - Uses "I" sparingly: "I noticed" not "I think you should"
     - Asks, doesn't tell: "Would you like to..." not "You should..."
     - Specific, not generic: Names pieces, makers, materials
     - Sensory language: Touch, warmth, weight, grain
     - Time references: "gathering", "aging", "developing"
     */

    // MARK: - Time of Day

    /// Get time-appropriate greeting
    public func greeting(for timeOfDay: TimeOfDay, isReturning: Bool) -> String {
        if isReturning {
            return returningGreeting(for: timeOfDay)
        } else {
            return firstTimeGreeting(for: timeOfDay)
        }
    }

    private func firstTimeGreeting(for timeOfDay: TimeOfDay) -> String {
        switch timeOfDay {
        case .dawn:
            return "Good morning. The early light is kind to beautiful things."
        case .morning:
            return "Good morning. I'm Patina — here to help you find pieces that belong."
        case .day:
            return "Hello. I'm Patina — here to help you find pieces that belong in your space."
        case .afternoon:
            return "Good afternoon. I'm Patina — here to help you discover what belongs in your space."
        case .evening:
            return "Good evening. This is a nice time to think about the things we live with."
        case .night:
            return "Hello. Quiet hours are good for contemplating what matters in a space."
        }
    }

    private func returningGreeting(for timeOfDay: TimeOfDay) -> String {
        switch timeOfDay {
        case .dawn:
            return "Good morning. Ready when you are."
        case .morning:
            return "Good morning. Ready to explore?"
        case .day:
            return "Welcome back. What shall we explore today?"
        case .afternoon:
            return "Good afternoon. What shall we explore?"
        case .evening:
            return "Evening. Something surfaced while you were away."
        case .night:
            return "Hello again. I've been thinking about your collection."
        }
    }

    // MARK: - Context Responses

    /// Response for Walk context
    public func walkResponse(progress: Float?, roomName: String?) -> String {
        if let progress = progress {
            if progress < 0.3 {
                return "We're just getting started. Take your time — every angle matters."
            } else if progress < 0.7 {
                return "The space is revealing itself. I'm noticing the light here."
            } else if progress < 1.0 {
                return "Almost there. A few more moments and I'll know this room well."
            } else {
                return "Beautiful. I have a sense of this space now. Shall I show you what might belong here?"
            }
        }
        return "Ready to walk? I'll guide you through capturing your space."
    }

    /// Response for Emergence context
    public func emergenceResponse(pieceName: String, maker: String) -> String {
        let templates = [
            "This piece caught my attention for you. \(pieceName) by \(maker).",
            "\(pieceName) — there's something about this one. \(maker) made it with intention.",
            "Something surfaced. \(maker)'s \(pieceName). Would you like to know why?",
            "\(pieceName). From \(maker). It might speak to your space."
        ]
        return templates.randomElement()!
    }

    /// Response for Table context
    public func tableResponse(itemCount: Int, agedItemCount: Int) -> String {
        if itemCount == 0 {
            return "Your table is empty — a blank canvas. What will you gather here?"
        } else if itemCount == 1 {
            return "One piece on your table. Every collection starts somewhere."
        } else if agedItemCount > 0 {
            let aged = agedItemCount == 1 ? "One has been gathering here" : "\(agedItemCount) have been gathering here"
            return "\(aged) for a while. They're developing patina in your collection."
        } else {
            return "\(itemCount) pieces gathering. I see threads connecting them."
        }
    }

    /// Response for Room List context
    public func roomListResponse(roomCount: Int) -> String {
        if roomCount == 0 {
            return "No rooms yet. Would you like to walk your first space together?"
        } else if roomCount == 1 {
            return "One space captured. Ready to explore another?"
        } else {
            return "\(roomCount) rooms in your home. Each has its own character."
        }
    }

    // MARK: - Action Responses

    /// Response when piece is added to table
    public func addedToTableResponse(pieceName: String) -> String {
        let templates = [
            "\(pieceName) will gather here now. Give it time.",
            "Invited to your table. \(pieceName) joins the gathering.",
            "\(pieceName) stays. Let's see how it ages alongside the others."
        ]
        return templates.randomElement()!
    }

    /// Response when piece drifts away
    public func driftResponse(pieceName: String) -> String {
        let templates = [
            "Letting \(pieceName) drift. The right piece will surface.",
            "\(pieceName) returns to the ether. Something else will emerge.",
            "Not this time. The search continues."
        ]
        return templates.randomElement()!
    }

    /// Response when walk completes
    public func walkCompleteResponse(roomName: String) -> String {
        let templates = [
            "I know this \(roomName) now. Shall I show you what might belong here?",
            "Your \(roomName) is captured. The space has character — I can work with this.",
            "Beautiful. The \(roomName) is ready. Let me find pieces that speak to it."
        ]
        return templates.randomElement()!
    }

    // MARK: - Observation Responses

    /// Generate an observation about lingering
    public func lingerObservation(pieceName: String, material: String?) -> String {
        if let material = material {
            return "I noticed you lingered on \(pieceName). There's something about \(material) that wants to be touched."
        }
        return "You paused on \(pieceName). Something caught your eye."
    }

    /// Generate a resonance observation
    public func resonanceObservation(piece1: String, piece2: String) -> String {
        let templates = [
            "\(piece1) and \(piece2) seem to speak to each other. Both on your table now.",
            "There's a conversation between \(piece1) and \(piece2). Can you see it?",
            "I notice \(piece1) and \(piece2) share something — maybe the era, or the maker's approach."
        ]
        return templates.randomElement()!
    }

    // MARK: - Encouragement

    /// Gentle encouragement when user seems stuck
    public func encouragement() -> String {
        let templates = [
            "Take your time. The right pieces aren't going anywhere.",
            "No rush. I'm here whenever you're ready.",
            "Sometimes the best discoveries happen slowly.",
            "Ready when you are. No rush."
        ]
        return templates.randomElement()!
    }

    /// Response when user hasn't engaged in a while
    public func gentlePrompt() -> String {
        let templates = [
            "Still here if you need me.",
            "Anything I can help with?",
            "The pieces are patient. So am I.",
            "Whenever you're ready."
        ]
        return templates.randomElement()!
    }
}

// Note: TimeOfDay is defined in Features/Threshold/Models/TimeOfDay.swift
