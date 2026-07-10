//  FieldPlaceholderScreen.swift
//  CaptureKit
//
//  The honest freeze placeholder every Phase 2 flow renders until its wave agent
//  ships the real screen. Field-instrument styled (tokens only), carries the
//  screen's accessibility id so the harness/shots land a non-empty, assertable
//  frame from day one. Routes push it (back chevron from the host NavigationStack);
//  sheets pass `onClose` to get a Done button.

import SwiftUI

public struct FieldPlaceholderScreen: View {
    private let screenID: CaptureScreenID
    private let title: String
    /// Single-letter wave tag (e.g. "P") — shown in the eyebrow + empty-state line.
    private let wave: String
    /// SF Symbol for the flow.
    private let symbol: String
    /// Optional honest context (e.g. "hosts G2 inspection → G3 outcome").
    private let note: String?
    /// When set, renders a Done button that dismisses the presenting sheet.
    private let onClose: (() -> Void)?

    public init(screenID: CaptureScreenID,
                title: String,
                wave: String,
                symbol: String = "square.dashed",
                note: String? = nil,
                onClose: (() -> Void)? = nil) {
        self.screenID = screenID
        self.title = title
        self.wave = wave
        self.symbol = symbol
        self.note = note
        self.onClose = onClose
    }

    public var body: some View {
        VStack(spacing: 14) {
            Spacer(minLength: 24)

            ZStack {
                Circle()
                    .fill(CaptureColor.verdigrisInk.opacity(0.12))
                    .frame(width: 72, height: 72)
                Image(systemName: symbol)
                    .font(CaptureType.title)
                    .foregroundStyle(CaptureColor.verdigrisInk)
            }
            .accessibilityHidden(true)

            Text("Wave \(wave)")
                .font(CaptureType.eyebrow)
                .textCase(.uppercase)
                .foregroundStyle(CaptureColor.inkSoft)

            Text(title)
                .font(CaptureType.title)
                .foregroundStyle(CaptureColor.ink)
                .multilineTextAlignment(.center)

            Text("Wave \(wave) builds this")
                .font(CaptureType.callout)
                .foregroundStyle(CaptureColor.inkSoft)
                .multilineTextAlignment(.center)

            if let note {
                Text(note)
                    .font(CaptureType.footnote)
                    .foregroundStyle(CaptureColor.inkSoft)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
            }

            Spacer(minLength: 24)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(.horizontal, 24)
        .background(CaptureColor.paper)
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if let onClose {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done", action: onClose)
                        .font(CaptureType.bodyEmph)
                        .foregroundStyle(CaptureColor.verdigris)
                }
            }
        }
        .accessibilityIdentifier(screenID.rawValue)
    }
}
