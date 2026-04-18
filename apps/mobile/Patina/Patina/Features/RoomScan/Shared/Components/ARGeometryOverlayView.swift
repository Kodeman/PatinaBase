//
//  ARGeometryOverlayView.swift
//  Patina
//
//  Decorative overlay that renders detected wall lines, pulsing corner dots,
//  and a faint floor plane fill on top of the RoomCaptureView.
//
//  Per PRD §4.2 "AR Geometry Overlay".
//
//  NOTE: This is a *visual* overlay — it draws stylized hints rather than
//  tracking real AR plane coordinates. The RoomCaptureView underneath
//  already shows Apple's own feature visualization. We add warmth on top.
//

import SwiftUI

struct ARGeometryOverlayView: View {

    /// When true, corner dots stop pulsing (Reduce Motion).
    var reduceMotion: Bool = false

    /// Fades the whole overlay out — used during the Soft Landing.
    var opacity: Double = 1.0

    @State private var pulse: CGFloat = 0.6

    var body: some View {
        GeometryReader { geo in
            ZStack {
                // Floor plane fill — softly tinting the lower third
                LinearGradient(
                    colors: [
                        PatinaColors.clay.opacity(0),
                        PatinaColors.clay.opacity(0.03)
                    ],
                    startPoint: .top,
                    endPoint: .bottom
                )

                // Subtle wall line hints at the outer edges
                Path { path in
                    let inset: CGFloat = 40
                    path.addRect(CGRect(
                        x: inset,
                        y: inset + 60,
                        width: geo.size.width - inset * 2,
                        height: geo.size.height - inset * 2 - 120
                    ))
                }
                .stroke(PatinaColors.clay.opacity(0.2), lineWidth: 1)

                // Pulsing corner dots
                ForEach(cornerPositions(in: geo.size), id: \.self) { position in
                    Circle()
                        .fill(PatinaColors.clay)
                        .frame(width: 8, height: 8)
                        .shadow(color: PatinaColors.clay.opacity(0.6), radius: 16)
                        .position(position)
                        .scaleEffect(pulse)
                }
            }
            .opacity(opacity)
            .allowsHitTesting(false)
            .onAppear {
                guard !reduceMotion else { return }
                withAnimation(.easeInOut(duration: 1.2).repeatForever(autoreverses: true)) {
                    pulse = 1.0
                }
            }
        }
    }

    private func cornerPositions(in size: CGSize) -> [CGPoint] {
        let inset: CGFloat = 40
        let topY = inset + 60
        let bottomY = size.height - inset - 60
        return [
            CGPoint(x: inset, y: topY),
            CGPoint(x: size.width - inset, y: topY),
            CGPoint(x: inset, y: bottomY),
            CGPoint(x: size.width - inset, y: bottomY)
        ]
    }
}

#Preview {
    ZStack {
        Color.black
        ARGeometryOverlayView()
    }
    .ignoresSafeArea()
}
