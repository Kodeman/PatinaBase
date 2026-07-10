//  ViewfinderFramingGuides.swift
//  Capture
//
//  C2 framing chrome — the only thing drawn over the live scene: a rule-of-thirds
//  grid, a centre reticle, and a horizon level bar that turns verdigris when the
//  phone is square. Guides go soft when level so they never crowd the shot.

import SwiftUI
import CaptureKit

struct ViewfinderFramingGuides: View {
    let roll: Double
    let isLevel: Bool
    let showGrid: Bool
    let reduceMotion: Bool

    private var guideOpacity: Double { isLevel ? 0.10 : 0.22 }

    var body: some View {
        ZStack {
            if showGrid {
                ruleOfThirds
            }
            reticle
            levelHorizon
        }
        .animation(reduceMotion ? nil : .easeInOut(duration: 0.25), value: isLevel)
    }

    // Rule-of-thirds overlay
    private var ruleOfThirds: some View {
        GeometryReader { geo in
            let w = geo.size.width, h = geo.size.height
            Path { p in
                for i in 1...2 {
                    let x = w * CGFloat(i) / 3
                    p.move(to: CGPoint(x: x, y: 0)); p.addLine(to: CGPoint(x: x, y: h))
                    let y = h * CGFloat(i) / 3
                    p.move(to: CGPoint(x: 0, y: y)); p.addLine(to: CGPoint(x: w, y: y))
                }
            }
            .stroke(CaptureColor.paper.opacity(guideOpacity), lineWidth: 0.5)
        }
    }

    // Corner-tick reticle, centred
    private var reticle: some View {
        ZStack {
            ForEach(0..<4, id: \.self) { corner in
                ReticleTick()
                    .stroke(CaptureColor.paper.opacity(guideOpacity + 0.06), lineWidth: 1.5)
                    .frame(width: 22, height: 22)
                    .rotationEffect(.degrees(Double(corner) * 90))
                    .offset(reticleOffset(corner))
            }
        }
        .frame(width: 168, height: 168)
    }

    private func reticleOffset(_ corner: Int) -> CGSize {
        switch corner {
        case 0: return CGSize(width: -73, height: -73)
        case 1: return CGSize(width: 73, height: -73)
        case 2: return CGSize(width: 73, height: 73)
        default: return CGSize(width: -73, height: 73)
        }
    }

    // Horizon bar tilted by roll; locks to verdigris + "— level —" when square
    private var levelHorizon: some View {
        ZStack {
            // Fixed reference notch
            Rectangle()
                .fill(CaptureColor.paper.opacity(0.25))
                .frame(width: 26, height: 2)

            VStack(spacing: 6) {
                Rectangle()
                    .fill(isLevel ? CaptureColor.success : CaptureColor.paper.opacity(0.55))
                    .frame(width: 96, height: 2)
                if isLevel {
                    Text("— level —")
                        .font(CaptureType.eyebrow)
                        .foregroundStyle(CaptureColor.success)
                }
            }
            .rotationEffect(.radians(reduceMotion ? 0 : clampedRoll))
        }
        .accessibilityHidden(true)
    }

    private var clampedRoll: Double { min(max(roll, -0.6), 0.6) }
}

/// One L-shaped corner tick for the reticle.
private struct ReticleTick: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: rect.minX, y: rect.midY))
        p.addLine(to: CGPoint(x: rect.minX, y: rect.minY))
        p.addLine(to: CGPoint(x: rect.midX, y: rect.minY))
        return p
    }
}
