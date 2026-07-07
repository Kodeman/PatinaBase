//  DecisionsPlaceholders.swift
//  Capture · Wave D (Decisions, read-only)
//
//  D1/D2 freeze placeholders. Wave D replaces these with the real pending list +
//  read-only decision detail, reading from `container.decisions`.

import SwiftUI
import CaptureKit

struct DecisionListPlaceholder: View {
    var body: some View {
        FieldPlaceholderScreen(screenID: .d1DecisionList, title: "Decisions", wave: "D",
                               symbol: "checkmark.seal")
    }
}

struct DecisionDetailPlaceholder: View {
    let decisionID: String
    var body: some View {
        FieldPlaceholderScreen(screenID: .d2DecisionDetail, title: "Decision", wave: "D",
                               symbol: "checkmark.seal", note: "Decision \(decisionID)")
    }
}
