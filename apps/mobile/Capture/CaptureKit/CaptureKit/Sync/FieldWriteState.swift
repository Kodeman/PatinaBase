//  FieldWriteState.swift
//  CaptureKit
//
//  Shared state for the post-commit write lanes FC-R4 opened: a margin note
//  and a project task, both written by the designer's own phone, both riding
//  the existing capture outbox rather than a second queue.
//
//  `refused` is the one state that matters and the one the placement lane has
//  no equivalent for. project_tasks' only INSERT-capable policy is
//  "Designers manage their project tasks" (00169:61-62), a FOR ALL policy with
//  no explicit WITH CHECK — so Postgres reuses its USING clause,
//  `projects.designer_id = auth.uid()`, and a studio co-member gets 42501.
//  FC-R8 rules that per-designer, so 42501 is a FACT about this designer and
//  this project, not a transient error: retrying it forever would be a lie.
//  The lane closes and the caller degrades honestly.

import Foundation

public enum FieldWriteState: String, Codable, Sendable {
    case pending
    case writing
    case written
    case failed
    case refused
}

public enum FieldWriteOutcome: Equatable, Sendable {
    case written
    case alreadyWritten
    case deferred(String)
    case refused(String)
    case failed(String)
}

public enum FieldWriteClassifier {
    /// PostgREST surfaces the SQLSTATE as `code`; the SDK sometimes only gives
    /// a message. Both paths must reach the same verdict.
    public static func outcome(code: String?, message: String) -> FieldWriteOutcome {
        let lowered = message.lowercased()

        if code == "42501" || lowered.contains("row-level security")
            || lowered.contains("permission denied") {
            return .refused(message)
        }
        if code == "23505" || lowered.contains("duplicate key") {
            return .alreadyWritten
        }
        if code == "PGRST301"
            || lowered.contains("offline")
            || lowered.contains("jwt")
            || lowered.contains("network connection was lost")
            || lowered.contains("could not connect") {
            return .deferred(message)
        }
        return .failed(message)
    }
}
