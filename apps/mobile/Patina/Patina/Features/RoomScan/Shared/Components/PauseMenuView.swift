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
    let onDismiss: () -> Void

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
                    .font(.custom("PlayfairDisplay-Regular", size: 28))
                    .foregroundColor(PatinaColors.offWhite)

                VStack(spacing: 0) {
                    menuRow(label: "Resume Scanning", action: onResume)
                    divider
                    menuRow(label: "Finish With What We Have", action: onFinish)
                    divider
                    menuRow(
                        label: "Start Over",
                        foreground: PatinaColors.terracotta,
                        action: onStartOver
                    )
                }
            }
            .padding(.horizontal, 32)
        }
    }

    private func menuRow(
        label: String,
        foreground: Color = PatinaColors.pearl,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Text(label)
                .font(.custom("Inter-Regular", size: 16))
                .foregroundColor(foreground)
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

#Preview {
    PauseMenuView(
        onResume: {},
        onFinish: {},
        onStartOver: {},
        onDismiss: {}
    )
}
