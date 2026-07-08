//  ProjectsSupport.swift
//  Capture · Wave P (Projects)
//
//  Presentation helpers shared by P1/P2: status/phase text + tint mapping,
//  money/date formatting, and the small chip + error-state views both screens
//  use. Kept generic on the *shape* of a status string (contains "hold",
//  "complet", …) rather than an exact enum match: the mock fixtures
//  (CaptureKitMocks.WorkFixtures — frozen) use an illustrative vocabulary
//  ("in_progress", "proposed", "due") that doesn't always match the real
//  Postgres CHECK-constraint vocabulary (e.g. `project_status`,
//  `project_ffe_items.status`), and every screen must render sensibly on
//  mocks as well as against the real service (wave rules §4).

import SwiftUI
import CaptureKit

enum ProjectsFormat {
    // MARK: Text

    /// "on_hold" → "On hold", "design" → "Design" — sentence case, matches the
    /// mock fixtures' own `phaseLabel` style (e.g. "Design development").
    static func humanize(_ raw: String) -> String {
        let spaced = raw.replacingOccurrences(of: "_", with: " ")
        guard let first = spaced.first else { return spaced }
        return first.uppercased() + spaced.dropFirst()
    }

    // MARK: Tints (CaptureColor.provenance(_:) precedent: a handful of
    // semantic buckets, not a 1:1 per-value palette)

    /// Project status (P1/P2 header): active = verdigris, on-hold/other =
    /// brass, closed = ink-soft — the exact three buckets the brief specifies.
    /// Real vocabulary is the `project_status` enum (00001 + 00084): active,
    /// completed, archived, on_hold, draft.
    static func projectStatusTint(_ status: String) -> Color {
        let s = status.lowercased()
        if s.contains("active") || s.contains("progress") { return CaptureColor.verdigris }
        if s.contains("clos") || s.contains("complet") || s.contains("archiv") || s.contains("cancel") {
            return CaptureColor.inkSoft
        }
        return CaptureColor.brass // on_hold, draft, and anything else ("other")
    }

    /// Execution lifecycle (phases, FF&E items): not-started reads quiet,
    /// in-flight reads brass ("recognised, being worked"), done reads
    /// verdigris, anything stuck/delayed/blocked reads rust.
    static func lifecycleTint(_ status: String) -> Color {
        let s = status.lowercased()
        if s.contains("delay") || s.contains("block") || s.contains("refus") || s.contains("cancel") {
            return CaptureColor.rust
        }
        if s.contains("complet") || s.contains("delivered") || s.contains("installed") {
            return CaptureColor.verdigris
        }
        if s.contains("not_started") || s == "pending" { return CaptureColor.inkSoft }
        return CaptureColor.brass // in_progress, specified, quoted, approved, ordered, production, shipped, …
    }

    /// Milestone money status: paid = verdigris, due/outstanding = brass,
    /// pending/upcoming = ink-soft.
    static func milestoneTint(_ status: String) -> Color {
        let s = status.lowercased()
        if s.contains("paid") { return CaptureColor.verdigris }
        if s.contains("due") || s.contains("outstanding") { return CaptureColor.brass }
        return CaptureColor.inkSoft
    }

    // MARK: Money

    static func money(cents: Int?) -> String {
        guard let cents else { return "—" }
        return (Double(cents) / 100).formatted(.currency(code: "USD"))
    }

    // MARK: Dates

    static func shortDate(_ date: Date?) -> String {
        guard let date else { return "—" }
        return date.formatted(date: .abbreviated, time: .omitted)
    }
}

// MARK: - Shared chip

/// A small uppercase, tinted pill — used for project status, milestone
/// status, and FF&E/phase lifecycle status alike (tint supplied by the
/// caller via `ProjectsFormat`).
struct ProjectTintChip: View {
    let text: String
    let tint: Color

    var body: some View {
        Text(text)
            .font(CaptureType.eyebrow)
            .textCase(.uppercase)
            .foregroundStyle(tint)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(tint.opacity(0.12), in: Capsule())
    }
}

// MARK: - Shared error state

/// Inline error + retry — used whenever a service call fails outright
/// (wave rules §6: screens never crash, never show a raw error, always offer
/// a way back in).
struct ProjectsErrorState: View {
    let message: String
    let retry: () async -> Void

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "exclamationmark.triangle")
                .font(CaptureType.title)
                .foregroundStyle(CaptureColor.rust)
            Text("Couldn't load this")
                .font(CaptureType.bodyEmph)
                .foregroundStyle(CaptureColor.ink)
            Text(message)
                .font(CaptureType.footnote)
                .foregroundStyle(CaptureColor.inkSoft)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 24)
            Button("Retry") { Task { await retry() } }
                .font(CaptureType.callout.weight(.semibold))
                .foregroundStyle(CaptureColor.verdigris)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(24)
        .background(CaptureColor.paper)
    }
}

// MARK: - Shared card chrome (mirrors the rounded/stroked "paper3" card used
// throughout Settings/Account/Session — kept local to Projects/ rather than
// depending on another flow's directory)

extension View {
    func projectsCard() -> some View {
        background(RoundedRectangle(cornerRadius: 14).fill(CaptureColor.paper3))
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(CaptureColor.line, lineWidth: 1))
    }
}
