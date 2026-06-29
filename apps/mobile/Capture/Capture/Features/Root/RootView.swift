//  RootView.swift
//  Capture
//
//  CP0 placeholder: a static mock viewfinder that proves CaptureKit links and
//  the field-instrument palette renders. Team B replaces the viewfinder body in
//  Phase 1; the RouteRegistry + coordinator drive real navigation.

import SwiftUI
import CaptureKit

struct RootView: View {
    @Environment(AppContainer.self) private var container

    var body: some View {
        ZStack {
            CaptureColor.ink.ignoresSafeArea()

            // Mock "scene" gradient stands in for the live camera feed (CP0).
            LinearGradient(
                colors: [Color(hex: 0x4A5247), Color(hex: 0x1C1D17)],
                startPoint: .top, endPoint: .bottom
            )
            .ignoresSafeArea()

            VStack {
                HStack {
                    Label("High Point · Showroom 214", systemImage: "mappin.and.ellipse")
                        .font(CaptureType.eyebrow)
                        .padding(.horizontal, 10).padding(.vertical, 6)
                        .background(.black.opacity(0.4), in: Capsule())
                        .foregroundStyle(CaptureColor.paper)
                    Spacer()
                }
                .padding()

                Spacer()

                Text("Capture in the room.")
                    .font(CaptureType.display)
                    .foregroundStyle(CaptureColor.paper)

                Spacer()

                HStack(spacing: 28) {
                    ForEach(CameraMode.allCases, id: \.self) { mode in
                        Text(mode.rawValue.uppercased())
                            .font(CaptureType.eyebrow)
                            .foregroundStyle(mode == .photo ? CaptureColor.paper : CaptureColor.paper.opacity(0.5))
                    }
                }

                Circle()
                    .fill(CaptureColor.paper)
                    .frame(width: 62, height: 62)
                    .overlay(Circle().stroke(CaptureColor.paper.opacity(0.3), lineWidth: 4).padding(-4))
                    .padding(.vertical, 28)
                    .accessibilityLabel("Shutter")
            }
        }
        .accessibilityIdentifier(CaptureScreenID.c1Viewfinder.rawValue)
    }
}
