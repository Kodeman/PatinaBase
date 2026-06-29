//  OnboardingSupport.swift
//  Capture
//
//  Shared building blocks for Flow 0 (first run & permissions). These are
//  PHASE screens shown before `.ready` — not RouteRegistry routes — so the only
//  thing they share with the rest of the app is the CaptureKit design tokens.
//  Namespaced with `Onboarding*` to avoid collisions with other teams' helpers.

import SwiftUI
import CaptureKit

// MARK: - Scaffold

/// Paper-surfaced full-screen container for the paper-based Flow 0 steps
/// (O1/O2/O4). O3 paints its own dimmed-viewfinder background instead.
struct OnboardingScaffold<Content: View>: View {
    var background: Color
    private let content: Content

    init(background: Color = CaptureColor.paper, @ViewBuilder content: () -> Content) {
        self.background = background
        self.content = content()
    }

    var body: some View {
        ZStack {
            background.ignoresSafeArea()
            content
        }
    }
}

// MARK: - Brand / status glyph

/// A symbol set in a soft tinted disc — the single mark at the top of each step
/// (◆ welcome, ⧉ connect, ✓ ready).
struct OnboardingGlyph: View {
    let symbol: String
    var tint: Color = CaptureColor.verdigris

    var body: some View {
        Image(systemName: symbol)
            .font(CaptureType.title)
            .foregroundStyle(tint)
            .frame(width: 64, height: 64)
            .background(Circle().fill(tint.opacity(0.12)))
            .accessibilityHidden(true)
    }
}

// MARK: - Buttons

/// Filled forward action (verdigris = value/success).
struct OnboardingFilledButtonStyle: ButtonStyle {
    var tint: Color = CaptureColor.verdigris
    var enabled: Bool = true

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(CaptureType.bodyEmph)
            .foregroundStyle(CaptureColor.paper3)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 15)
            .background(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(tint.opacity(configuration.isPressed ? 0.82 : 1))
            )
            .opacity(enabled ? 1 : 0.55)
            .contentShape(Rectangle())
    }
}

/// Quiet secondary action (text only).
struct OnboardingGhostButtonStyle: ButtonStyle {
    var tint: Color = CaptureColor.ink

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(CaptureType.bodyEmph)
            .foregroundStyle(tint.opacity(configuration.isPressed ? 0.5 : 0.85))
            .frame(maxWidth: .infinity)
            .padding(.vertical, 13)
            .contentShape(Rectangle())
    }
}

// MARK: - Progress

/// The "this is short" cue — onboarding is a few steps, not ten.
struct OnboardingProgressDots: View {
    let index: Int   // 0-based
    let total: Int

    var body: some View {
        HStack(spacing: 6) {
            ForEach(0..<total, id: \.self) { i in
                Capsule()
                    .fill(i == index ? CaptureColor.verdigris : CaptureColor.line2)
                    .frame(width: i == index ? 18 : 6, height: 6)
            }
        }
        .accessibilityElement()
        .accessibilityLabel("Step \(index + 1) of \(total)")
    }
}
