//  ProvenanceBadge.swift
//  CaptureKit
//
//  The "how was this obtained" chip shown on every recognised field (C5/V3).
//  Shared so Team B (capture sheet) and Team E (review detail) don't reinvent it.

import SwiftUI

public struct ProvenanceBadge: View {
    private let source: ProvenanceSource
    /// A confirmed guess keeps its "guess" origin and loses the dash: the dash
    /// marks a guess still waiting for her.
    private let confirmed: Bool
    public init(_ source: ProvenanceSource, confirmed: Bool = false) {
        self.source = source
        self.confirmed = confirmed
    }

    public var body: some View {
        Text(label)
            .font(CaptureType.eyebrow)
            .textCase(.uppercase)
            .foregroundStyle(CaptureColor.provenance(source))
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .overlay(
                RoundedRectangle(cornerRadius: 3)
                    .stroke(CaptureColor.provenance(source).opacity(0.5),
                            style: StrokeStyle(lineWidth: 1,
                                               dash: source == .smartGuess && !confirmed ? [3, 2] : []))
            )
            .accessibilityLabel("Source: \(label)")
    }

    private var label: String {
        switch source {
        case .manual: return "typed"
        case .ocr: return "tag"
        case .code: return "scan"
        case .measure: return "AR"
        case .voice: return "voice"
        case .smartGuess: return "guess"
        case .imported: return "import"
        case .edited: return "edited"
        }
    }
}
