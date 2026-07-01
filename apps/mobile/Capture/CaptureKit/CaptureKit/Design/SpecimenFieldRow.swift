//  SpecimenFieldRow.swift
//  CaptureKit
//
//  A single editable field with its provenance badge — the shared building block
//  of the C5 capture sheet (Team B) and the V3 detail (Team E).

import SwiftUI

public struct SpecimenFieldRow: View {
    private let label: String
    @Binding private var value: String
    private let source: ProvenanceSource?
    private let placeholder: String

    public init(_ label: String, value: Binding<String>,
                source: ProvenanceSource? = nil, placeholder: String = "—") {
        self.label = label
        self._value = value
        self.source = source
        self.placeholder = placeholder
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(label)
                    .font(CaptureType.eyebrow)
                    .textCase(.uppercase)
                    .foregroundStyle(CaptureColor.inkSoft)
                Spacer()
                if let source { ProvenanceBadge(source) }
            }
            TextField(placeholder, text: $value)
                .font(CaptureType.body)
                .foregroundStyle(CaptureColor.ink)
        }
        .padding(.vertical, 8)
        .overlay(alignment: .bottom) {
            Rectangle().fill(CaptureColor.line).frame(height: 1)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(label)
        .accessibilityValue(value.isEmpty ? placeholder : value)
    }
}
