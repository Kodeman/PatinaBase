//
//  ScanHUDView.swift
//  Patina
//
//  The top-left scan HUD: progress ring + short label.
//  Per PRD §4.2.
//

import SwiftUI

struct ScanHUDView: View {

    /// 0...1 normalized scan progress.
    let progress: Float

    /// If true, show a "Slow down" warning state (Terracotta).
    var isFastMovementWarning: Bool = false

    /// If true, use static rendering (Reduce Motion).
    var reduceMotion: Bool = false

    private var clamped: CGFloat {
        CGFloat(min(max(progress, 0), 1))
    }

    private var isComplete: Bool {
        clamped >= 0.999
    }

    private var label: String {
        if isFastMovementWarning { return "Slow down" }
        if isComplete { return "Complete" }
        switch clamped {
        case ..<0.25:  return "Scanning"
        case ..<0.50:  return "25%"
        case ..<0.75:  return "50%"
        default:       return "75%"
        }
    }

    var body: some View {
        HStack(spacing: 10) {
            ZStack {
                // Track
                Circle()
                    .stroke(PatinaColors.clay.opacity(0.25), lineWidth: 2.5)

                if isComplete {
                    Image(systemName: "checkmark")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(PatinaColors.Text.interactive)
                        .transition(.opacity)
                } else {
                    Circle()
                        .trim(from: 0, to: clamped)
                        .stroke(
                            isFastMovementWarning ? PatinaColors.terracotta : PatinaColors.clay,
                            style: StrokeStyle(lineWidth: 2.5, lineCap: .round)
                        )
                        .rotationEffect(.degrees(-90))
                        .animation(reduceMotion ? nil : .linear(duration: 0.25), value: clamped)
                }
            }
            .frame(width: 36, height: 36)

            Text(label)
                .font(PatinaTypography.mono)
                .tracking(0.5)
                .textCase(.uppercase)
                .foregroundStyle(isFastMovementWarning
                    ? PatinaColors.terracotta
                    : Color.white.opacity(0.6))
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(
            Text(isComplete
                ? "Scan complete"
                : "Scanning, \(Int(progress * 100)) percent captured")
        )
        .accessibilityValue(Text("\(Int(clamped * 100)) percent"))
    }
}

#Preview {
    VStack(spacing: 20) {
        ScanHUDView(progress: 0.12)
        ScanHUDView(progress: 0.45)
        ScanHUDView(progress: 0.78)
        ScanHUDView(progress: 1.0)
        ScanHUDView(progress: 0.6, isFastMovementWarning: true)
    }
    .padding()
    .background(Color.black)
}
