//
//  CompanionRestView.swift
//  Patina
//
//  Bottom rest state showing Strata mark with pull-up hint
//

import SwiftUI

/// The bottom companion rest sheet for Hero Frame
struct CompanionRestView: View {

    let useGlassStyle: Bool
    let onPullUp: () -> Void

    // Rest sheet height per spec
    private let sheetHeight: CGFloat = 85

    var body: some View {
        VStack(spacing: 8) {
            // Strata mark
            StrataMarkSmall(useGlassStyle: useGlassStyle)

            // Hint text
            Text("Pull up to explore")
                .font(.system(size: 9))
                .foregroundStyle(
                    useGlassStyle
                        ? Color.white.opacity(0.55)
                        : PatinaColors.clayBeige
                )
                .tracking(0.2)
        }
        .frame(maxWidth: .infinity)
        .frame(height: sheetHeight)
        .background {
            if useGlassStyle {
                UnevenRoundedRectangle(
                    topLeadingRadius: 26,
                    topTrailingRadius: 26
                )
                .fill(.ultraThinMaterial)
                .overlay {
                    UnevenRoundedRectangle(
                        topLeadingRadius: 26,
                        topTrailingRadius: 26
                    )
                    .fill(Color.white.opacity(0.12))
                }
                .overlay(alignment: .top) {
                    Rectangle()
                        .fill(Color.white.opacity(0.18))
                        .frame(height: 1)
                }
            } else {
                UnevenRoundedRectangle(
                    topLeadingRadius: 26,
                    topTrailingRadius: 26
                )
                .fill(Color.white.opacity(0.95))
                .shadow(color: .black.opacity(0.1), radius: 30, x: 0, y: -6)
            }
        }
        .gesture(
            DragGesture()
                .onEnded { value in
                    // Pull up gesture
                    if value.translation.height < -30 {
                        onPullUp()
                    }
                }
        )
    }
}

// MARK: - Small Strata Mark

/// Compact Strata mark for the rest state
private struct StrataMarkSmall: View {

    let useGlassStyle: Bool

    var body: some View {
        VStack(spacing: 4) {
            Capsule()
                .fill(useGlassStyle ? Color.white.opacity(0.9) : PatinaColors.mochaBrown)
                .frame(width: 22, height: 3)

            Capsule()
                .fill(useGlassStyle ? Color.white.opacity(0.6) : PatinaColors.clayBeige)
                .frame(width: 16, height: 3)

            Capsule()
                .fill(useGlassStyle ? Color.white.opacity(0.35) : PatinaColors.clayBeige.opacity(0.5))
                .frame(width: 10, height: 3)
        }
    }
}

// MARK: - Preview

#Preview("Light Style") {
    VStack {
        Spacer()
        CompanionRestView(useGlassStyle: false) {}
    }
    .background(Color(hex: "A3927C"))
    .ignoresSafeArea()
}

#Preview("Glass Style") {
    VStack {
        Spacer()
        CompanionRestView(useGlassStyle: true) {}
    }
    .background(Color(hex: "3F3B37"))
    .ignoresSafeArea()
}
