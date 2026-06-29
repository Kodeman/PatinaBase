//  ProvenanceBadge.swift
//  CaptureKit
//
//  The "how was this obtained" chip shown on every recognised field (C5/V3).
//  Shared so Team B (capture sheet) and Team E (review detail) don't reinvent it.

import SwiftUI

public struct ProvenanceBadge: View {
    private let source: ProvenanceSource
    public init(_ source: ProvenanceSource) { self.source = source }

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
                            style: StrokeStyle(lineWidth: 1, dash: source == .smartGuess ? [3, 2] : []))
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
