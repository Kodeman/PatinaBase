//  FieldCopyAudit.swift
//  CaptureKit
//
//  FC-R3: the word "Inbox" leaves Field's user-facing copy — this package has
//  no inbox to name, and "Capture Inbox" is doubly taken (field_captures and
//  proposal_captures). And the technology is the silent enabler: nothing a
//  designer reads ever says "AI".
//
//  IDENTIFIERS ARE NOT COPY. CaptureDestination.inbox, CaptureRoute.inbox
//  (which is Messages, M1 — a different sense) and CaptureScreenID.s5Inbox all
//  stay exactly as they are: the wire contract, the analytics and the screenshot
//  harness key on them.

import Foundation

public enum FieldCopyAudit {
    public static let forbiddenWords = ["inbox", "ai"]

    /// Whole-word, case-insensitive. "maintain" must not trip the "ai" rule.
    public static func contains(_ word: String, in text: String) -> Bool {
        let pattern = "\\b\(NSRegularExpression.escapedPattern(for: word))\\b"
        return text.range(of: pattern, options: [.regularExpression, .caseInsensitive]) != nil
    }
}

/// The non-Pro context screen (spec §7.11). R108.2: this is NEVER a scan, and
/// the copy must never imply otherwise.
public enum FieldContextCaptureCopy {
    public static let eyebrow = "Photos & notes"
    public static let detail =
        "These reach the studio as soon as you have signal — they're notes, not a scan."

    public static func title(visitLabel: String?) -> String {
        guard let visitLabel, !visitLabel.isEmpty else {
            return "Photos & notes for this room."
        }
        return "Photos & notes for \(visitLabel)."
    }
}
