//
//  WhisperState.swift
//  Patina
//
//  Progress-driven state for the Whisper Bar (Quiet Conversation PRD §4.2).
//  Maps scan progress to evolving guide text, sub-text, and haptic cues.
//

import Foundation

/// Haptic cue associated with a Whisper Bar threshold crossing.
public enum WhisperHaptic: Equatable {
    case none
    case soft
    case medium
    case success
}

/// Discrete whisper state driven by scan progress.
/// The bands follow PRD §4.2 "Whisper Bar Progression".
public struct WhisperState: Equatable {

    /// The raw normalized scan progress at the time this state was computed (0...1).
    public let progress: Float

    /// Primary italic guide text shown in the Whisper Bar.
    public let text: String

    /// Small mono caption shown below the guide text.
    public let subtext: String

    /// Haptic cue the view model should fire when this threshold is first crossed.
    public let haptic: WhisperHaptic

    /// The band identifier — used by the view model to detect threshold crossings.
    public let band: Band

    public enum Band: Int, Equatable, Comparable {
        case threshold
        case early
        case midEarly
        case mid
        case late
        case finishing
        case complete

        public static func < (lhs: Band, rhs: Band) -> Bool {
            lhs.rawValue < rhs.rawValue
        }
    }

    /// Compute the whisper state for a given progress value.
    public static func forProgress(_ p: Float) -> WhisperState {
        let clamped = min(max(p, 0), 1)
        switch clamped {
        case 0..<0.10:
            return WhisperState(
                progress: clamped,
                text: "Let's walk your room together.",
                subtext: "Move slowly to begin",
                haptic: .none,
                band: .threshold
            )
        case 0.10..<0.25:
            return WhisperState(
                progress: clamped,
                text: "That's it. Nice and slow.",
                subtext: "Keep moving · Walls detected",
                haptic: .soft,
                band: .early
            )
        case 0.25..<0.45:
            return WhisperState(
                progress: clamped,
                text: "Beautiful. Step toward the window now.",
                subtext: "\(Int(clamped * 100))% captured · Keep going",
                haptic: .none,
                band: .midEarly
            )
        case 0.45..<0.65:
            return WhisperState(
                progress: clamped,
                text: "I can see this room taking shape.",
                subtext: "\(Int(clamped * 100))% captured · Keep going",
                haptic: .soft,
                band: .mid
            )
        case 0.65..<0.85:
            return WhisperState(
                progress: clamped,
                text: "Almost there. Just the far corner.",
                subtext: "\(Int(clamped * 100))% captured",
                haptic: .none,
                band: .late
            )
        case 0.85..<0.95:
            return WhisperState(
                progress: clamped,
                text: "Perfect. Let me take one more look…",
                subtext: "Finalizing",
                haptic: .medium,
                band: .finishing
            )
        default:
            return WhisperState(
                progress: clamped,
                text: "Your room is captured. Now let's talk about you.",
                subtext: "Scan complete · Style discovery begins",
                haptic: .success,
                band: .complete
            )
        }
    }

    // MARK: - Edge-case overrides

    /// Low-light override per PRD §4.3.1.
    public static var lowLight: WhisperState {
        WhisperState(
            progress: 0,
            text: "Try a light switch — I'll wait.",
            subtext: "Low light detected",
            haptic: .none,
            band: .threshold
        )
    }

    /// Fast-movement override per PRD §4.3.2.
    public static var fastMovement: WhisperState {
        WhisperState(
            progress: 0,
            text: "Easy does it. The room isn't going anywhere.",
            subtext: "Slow down",
            haptic: .none,
            band: .threshold
        )
    }

    /// Feature-loss override per PRD §4.3.3.
    public static var featureLoss: WhisperState {
        WhisperState(
            progress: 0,
            text: "Point toward something with texture — a bookshelf, a rug.",
            subtext: "Looking for detail",
            haptic: .none,
            band: .threshold
        )
    }

    /// Room-too-large override per PRD §4.3.4.
    public static var roomTooLarge: WhisperState {
        WhisperState(
            progress: 0,
            text: "That's a lot of space. Let's focus on this area first.",
            subtext: "Section scanning enabled",
            haptic: .none,
            band: .threshold
        )
    }

    /// Idle override per PRD §4.3.5.
    public static var idle: WhisperState {
        WhisperState(
            progress: 0,
            text: "Still here. Take your time.",
            subtext: "30 seconds idle",
            haptic: .none,
            band: .threshold
        )
    }
}
