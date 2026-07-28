//
//  ScanControlsView.swift
//  Patina
//
//  Top-right pause control for the active scan view.
//  Per PRD §4.2.
//
//  U05: the `?` help control was a documented no-op — the Whisper Bar
//  already carries in-flow coaching — so it was removed rather than wired.
//

import SwiftUI

struct ScanControlsView: View {

    let onPause: () -> Void

    var body: some View {
        controlButton(system: "pause.fill", accessibility: "Pause scan", action: onPause)
    }

    private func controlButton(
        system: String,
        accessibility: String,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Image(systemName: system)
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(Color.white.opacity(0.7))
                .frame(width: 36, height: 36)
                .background(
                    Circle()
                        .fill(Color.white.opacity(0.12))
                        .background(.ultraThinMaterial, in: Circle())
                )
                .overlay(
                    Circle().stroke(Color.white.opacity(0.10), lineWidth: 1)
                )
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(accessibility))
        .frame(minWidth: 44, minHeight: 44) // 44pt touch target
    }
}

#Preview {
    ScanControlsView(onPause: {})
        .padding()
        .background(Color.black)
}
