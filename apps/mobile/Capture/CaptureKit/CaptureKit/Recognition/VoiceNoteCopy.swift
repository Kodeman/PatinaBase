//  VoiceNoteCopy.swift
//  CaptureKit
//
//  The two rungs of §15.4's voice failure ladder that both surfaces must say
//  identically — N4 (the specimen voice sheet) and F2 (the in-scan / non-Pro
//  context capture). Held here, verbatim from the package, so the two cannot
//  drift and so a copy change is one edit rather than a grep.
//
//  Bound by the same laws as every other string in this app: degrade honestly,
//  never block, never silently drop — and never "AI".

import Foundation

public enum VoiceNoteCopy {
    /// The recognizer is unavailable or unauthorized and the note is recording
    /// anyway (§15.4, "Recognizer unavailable / denied"). Says what happens
    /// next without naming a mechanism.
    public static let recognitionUnavailable = "We'll write this up when it lands."

    /// VoiceRecordingPolicy's 20-minute / 24-segment cap ended the note rather
    /// than the designer (§15.4, §7.4). Never a silent stop — and never a
    /// clock time, which is why "note ended at 20:00" was withdrawn.
    public static let capReached =
        "This note reached twenty minutes and stopped. Start another when you're ready."
}
