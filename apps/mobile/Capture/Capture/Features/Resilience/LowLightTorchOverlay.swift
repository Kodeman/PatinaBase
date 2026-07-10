//  LowLightTorchOverlay.swift
//  Capture
//
//  Team D — R1 (low light & focus). A composable overlay, NOT a registered
//  screen: the C1 viewfinder (Team B) drops it in when CameraService reports
//  `isLowLight` / a low luma frame. Surfaces the torch + a Night capture mode
//  rather than letting the designer ship a muddy frame — and never blocks the
//  shutter (the "Capture anyway" affordance always stays live).

import SwiftUI
import UIKit
import CaptureKit
import CaptureKitMocks   // #Preview only

struct LowLightTorchOverlay: View {
    /// The single arbiter of the capture device — torch goes through here so we
    /// never fight Team B/C for the AVCaptureSession.
    let camera: any CameraService
    var reason: String = "Low light — tap for torch"
    /// True when focus can't lock — drives the warning haptic + "check image" note.
    var focusUnstable: Bool = false
    /// Optional hook so the viewfinder can flag the next frame "check image".
    var onCaptureAnyway: (() -> Void)?

    @State private var torchOn = false
    @State private var nightOn = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            // ── Tap-for-torch banner ──
            Button { toggleTorch() } label: {
                HStack(spacing: 8) {
                    Image(systemName: torchOn ? "bolt.fill" : "bolt.slash.fill")
                        .font(CaptureType.callout)
                        .foregroundStyle(torchOn ? CaptureColor.verdigris2 : CaptureColor.terracotta)
                        .symbolEffect(.pulse, isActive: !reduceMotion && !torchOn)
                    Text(torchOn ? "Torch on" : reason)
                        .font(CaptureType.monoBody)
                        .foregroundStyle(CaptureColor.paper3)
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(
                    Capsule().fill(CaptureColor.ink.opacity(0.72))
                )
                .overlay(
                    Capsule().stroke((torchOn ? CaptureColor.verdigris2 : CaptureColor.terracotta).opacity(0.5),
                                     lineWidth: 1)
                )
                .contentShape(Capsule())
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("r1.torchToggle")
            .accessibilityLabel(torchOn ? "Turn torch off" : "Low light. Tap for torch.")

            // ── Night mode + capture-anyway row ──
            HStack(spacing: 8) {
                chip(title: "Night", systemImage: "moon.stars.fill", on: nightOn) {
                    nightOn.toggle()
                    haptic(.light)
                    // Night = longer exposure + stabilisation hint; auto-lights the torch.
                    if nightOn, !torchOn { toggleTorch() }
                }
                .accessibilityIdentifier("r1.nightToggle")

                if onCaptureAnyway != nil {
                    chip(title: "Capture anyway", systemImage: "camera.fill", on: false) {
                        if focusUnstable { haptic(.warning) }
                        onCaptureAnyway?()
                    }
                    .accessibilityIdentifier("r1.captureAnyway")
                }
            }
        }
        .padding(12)
        .accessibilityElement(children: .contain)
    }

    @ViewBuilder
    private func chip(title: String, systemImage: String, on: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Image(systemName: systemImage).font(CaptureType.footnote)
                Text(title).font(CaptureType.monoSmall)
            }
            .foregroundStyle(on ? CaptureColor.ink : CaptureColor.paper3)
            .padding(.horizontal, 12)
            .padding(.vertical, 7)
            .background(
                Capsule().fill(on ? CaptureColor.goldenHour : CaptureColor.ink.opacity(0.55))
            )
            .overlay(Capsule().stroke(CaptureColor.paper3.opacity(0.25), lineWidth: 1))
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }

    private func toggleTorch() {
        torchOn.toggle()
        camera.setTorch(torchOn ? .on : .off)
        haptic(.light)
    }

    private enum Haptic { case light, warning }
    private func haptic(_ kind: Haptic) {
        switch kind {
        case .light:
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
        case .warning:
            UINotificationFeedbackGenerator().notificationOccurred(.warning)
        }
    }
}

#Preview("R1 · low light") {
    ZStack {
        CaptureColor.ink2.ignoresSafeArea()
        VStack {
            Spacer()
            LowLightTorchOverlay(camera: MockCameraService(),
                                 focusUnstable: true,
                                 onCaptureAnyway: {})
        }
    }
}
