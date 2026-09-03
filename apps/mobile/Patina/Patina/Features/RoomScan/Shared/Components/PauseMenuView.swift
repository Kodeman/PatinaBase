//
//  PauseMenuView.swift
//  Patina
//
//  Full-screen frosted overlay shown when the user taps the Pause button.
//  Per PRD §4.4.
//

import SwiftUI

struct PauseMenuView: View {

    let onResume: () -> Void
    let onFinish: () -> Void
    let onStartOver: () -> Void
    /// R13: abandon the scan entirely and route home. The row asks for
    /// confirmation before invoking this.
    let onLeave: () -> Void
    let onDismiss: () -> Void

    /// R12: whether "Finish With What We Have" is actionable. Below the
    /// meaningful-data threshold the row renders disabled with an inline
    /// caption so an effectively-empty scan can't silently "finish".
    var isFinishEnabled: Bool = true

    @State private var showLeaveConfirmation = false

    var body: some View {
        ZStack {
            PatinaColors.charcoal
                .opacity(0.92)
                .background(.ultraThinMaterial)
                .ignoresSafeArea()
                .onTapGesture(perform: onDismiss)
                .accessibilityLabel(Text("Dismiss pause menu"))

            VStack(spacing: 32) {
                Text("Paused")
                    .font(PatinaTypography.h2)
                    .foregroundStyle(PatinaColors.offWhite)

                VStack(spacing: 0) {
                    menuRow(label: "Resume Scanning", action: onResume)
                    divider
                    finishRow
                    divider
                    menuRow(
                        label: "Start Over",
                        foreground: PatinaColors.terracotta,
                        action: onStartOver
                    )
                    divider
                    menuRow(
                        label: "Leave Scan",
                        foreground: PatinaColors.terracotta,
                        action: { showLeaveConfirmation = true }
                    )
                }
            }
            .padding(.horizontal, 32)
        }
        .alert("Discard this scan?", isPresented: $showLeaveConfirmation) {
            Button("Discard Scan", role: .destructive, action: onLeave)
            Button("Keep Scanning", role: .cancel) {}
        } message: {
            Text("Nothing from this walk will be saved.")
        }
    }

    /// R12: the finish row, disabled with an inline caption when the scan
    /// hasn't captured enough to be worth saving yet.
    @ViewBuilder
    private var finishRow: some View {
        if isFinishEnabled {
            menuRow(label: "Finish With What We Have", action: onFinish)
        } else {
            VStack(spacing: 4) {
                Text("Finish With What We Have")
                    .font(PatinaTypography.body)
                    .foregroundStyle(PatinaColors.OnDark.muted.opacity(0.5))
                Text("Walk a little more first")
                    .font(PatinaTypography.monoSmall)
                    .tracking(0.5)
                    .textCase(.uppercase)
                    .foregroundStyle(PatinaColors.OnDark.muted)
            }
            .frame(maxWidth: .infinity, minHeight: 44)
            .padding(.vertical, 14)
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Finish With What We Have. Disabled. Walk a little more first.")
        }
    }

    private func menuRow(
        label: String,
        foreground: Color = PatinaColors.OnDark.primary,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Text(label)
                .font(PatinaTypography.body)
                .foregroundStyle(foreground)
                .frame(maxWidth: .infinity, minHeight: 44)
                .padding(.vertical, 14)
        }
        .buttonStyle(.plain)
    }

    private var divider: some View {
        Rectangle()
            .fill(PatinaColors.clay.opacity(0.2))
            .frame(height: 1)
    }
}

#Preview("Finish enabled") {
    PauseMenuView(
        onResume: {},
        onFinish: {},
        onStartOver: {},
        onLeave: {},
        onDismiss: {}
    )
}

#Preview("Finish disabled — below threshold") {
    PauseMenuView(
        onResume: {},
        onFinish: {},
        onStartOver: {},
        onLeave: {},
        onDismiss: {},
        isFinishEnabled: false
    )
}
