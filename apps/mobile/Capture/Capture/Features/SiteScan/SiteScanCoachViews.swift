//  SiteScanCoachViews.swift
//  Capture · Wave F (Pro site-scan) · Field Capture P1 · item 5 — coach + QA UI
//
//  F2 live coach overlay (per-surface checklist + on-site warnings) and the F3
//  end-of-scan scorecard card. Reads the pure `CoverageSnapshot` / `Scorecard`
//  (CaptureKit) produced by `FieldCoverageCoach` (device) or `MockScanSession`
//  (Simulator), so both paths render identically.
//
//  ⚠️ ALL user-facing strings here are ESCALATE-class PLACEHOLDERS (per the package
//  authority note — coach wording / verdict copy is designer-visible). They are
//  flagged in the item-5 report for Kody's M2 review; wording is deliberately plain.
//  Typography-first, no box shadows (brand grain).

import SwiftUI
import CaptureKit

// MARK: - F2 live coach overlay

struct SiteScanCoachOverlay: View {
    let snapshot: CoverageSnapshot

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if !snapshot.warnings.isEmpty {
                HStack(spacing: 8) {
                    ForEach(snapshot.warnings, id: \.self) { warning in
                        Text(SiteScanCoachCopy.warning(warning))
                            .font(CaptureType.footnote)
                            .foregroundStyle(CaptureColor.paper)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 5)
                            .background(CaptureColor.warning, in: Capsule())
                    }
                }
            }
            if !snapshot.checklist.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(snapshot.checklist, id: \.surface) { item in
                        Label {
                            Text(SiteScanCoachCopy.surface(item.surface))
                                .font(CaptureType.footnote)
                                .foregroundStyle(CaptureColor.paper)
                        } icon: {
                            Image(systemName: item.covered ? "checkmark.circle.fill" : "circle")
                                .foregroundStyle(item.covered ? CaptureColor.success : CaptureColor.paper3)
                        }
                    }
                }
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 12))
        .accessibilityElement(children: .combine)
        .accessibilityLabel(Text("Coverage \(snapshot.coveragePct) percent"))
    }
}

// MARK: - F3 scorecard card

struct SiteScanScorecardCard: View {
    let scorecard: Scorecard

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 10) {
                Circle()
                    .fill(SiteScanCoachCopy.verdictColor(scorecard.verdict))
                    .frame(width: 12, height: 12)
                Text(SiteScanCoachCopy.verdictTitle(scorecard.verdict))
                    .font(CaptureType.title2)
                    .foregroundStyle(CaptureColor.ink)
            }

            HStack(spacing: 20) {
                metric("Coverage", "\(scorecard.coveragePct)%")
                metric("Sharp frames", "\(Int((scorecard.sharpFrameRatio * 100).rounded()))%")
                metric("Tracking", scorecard.trackingHealth.rawValue.capitalized)
                metric("Anchors", "\(scorecard.anchorCount)")
            }

            if !scorecard.namedGaps.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Before you leave")           // ESCALATE placeholder
                        .font(CaptureType.eyebrow)
                        .foregroundStyle(CaptureColor.ink2)
                    ForEach(scorecard.namedGaps, id: \.surface) { gap in
                        Label {
                            Text(gap.phrase).font(CaptureType.footnote).foregroundStyle(CaptureColor.ink)
                        } icon: {
                            Image(systemName: "exclamationmark.circle")
                                .foregroundStyle(CaptureColor.error)
                        }
                    }
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(CaptureColor.paper2, in: RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(CaptureColor.line, lineWidth: 1))
    }

    private func metric(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value).font(CaptureType.bodyEmph).foregroundStyle(CaptureColor.ink)
            Text(label).font(CaptureType.monoSmall).foregroundStyle(CaptureColor.inkSoft)
        }
    }
}

// MARK: - ESCALATE placeholder copy (flagged for Kody's M2 review)

enum SiteScanCoachCopy {

    /// Humanize a checklist key ("wall:north" → "North wall"). PLACEHOLDER.
    static func surface(_ key: String) -> String {
        if key == "floor" { return "Floor" }
        if key == "ceiling" { return "Ceiling" }
        if key.hasPrefix("wall:") {
            return "\(key.dropFirst(5).capitalized) wall"
        }
        if key.hasPrefix("opening:") {
            return "Opening \(key.dropFirst(8))"
        }
        return key
    }

    /// On-site warning copy. PLACEHOLDER.
    static func warning(_ warning: CoachWarning) -> String {
        switch warning {
        case .moveSlower: return "Slow down"
        case .holdSteady: return "Hold steady"
        case .tooDark:    return "Add light"
        case .tooFar:     return "Move closer"
        }
    }

    /// Verdict headline. PLACEHOLDER.
    static func verdictTitle(_ verdict: Scorecard.Verdict) -> String {
        switch verdict {
        case .green: return "Looks complete"
        case .amber: return "Usable — review the gaps"
        case .red:   return "Gaps to fix before you leave"
        }
    }

    static func verdictColor(_ verdict: Scorecard.Verdict) -> Color {
        switch verdict {
        case .green: return CaptureColor.success
        case .amber: return CaptureColor.warning
        case .red:   return CaptureColor.error
        }
    }
}
