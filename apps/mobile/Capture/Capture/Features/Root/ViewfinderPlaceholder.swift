//  ViewfinderPlaceholder.swift
//  Capture
//
//  The C1 viewfinder home until Team B registers the real one. A static mock
//  "scene" + the mode selector + shutter, in the field-instrument palette.

import SwiftUI
import CaptureKit

struct ViewfinderPlaceholder: View {
    var body: some View {
        ZStack {
            CaptureColor.ink.ignoresSafeArea()
            LinearGradient(
                colors: [CaptureColor.ink2, CaptureColor.ink],
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
                    ForEach(CameraMode.viewfinderSelectable, id: \.self) { mode in
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
