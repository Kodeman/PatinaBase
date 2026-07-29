//  ViewfinderControls.swift
//  Capture
//
//  The five thumb-reach regions of the C1 viewfinder, plus the C4 multi-shot
//  HUD and the dark "scene" backdrop the simulator falls back to. All chrome is
//  in the field-instrument palette; nothing is buried in a menu.

import SwiftUI
import CaptureKit

// MARK: - Scene backdrop (simulator fallback for the live feed)

struct ViewfinderSceneBackdrop: View {
    let luma: Double

    var body: some View {
        ZStack {
            CaptureColor.ink
            LinearGradient(
                colors: [CaptureColor.verdigrisInk, CaptureColor.ink2, CaptureColor.ink],
                startPoint: .top, endPoint: .bottom
            )
            // A soft pool of "light" so the dark scene reads as a dim showroom.
            RadialGradient(
                colors: [CaptureColor.ink2.opacity(0.0), CaptureColor.ink.opacity(0.55)],
                center: .center, startRadius: 60, endRadius: 460
            )
            .blendMode(.multiply)
        }
        .overlay(CaptureColor.ink.opacity(max(0, 0.25 - luma * 0.25)))   // dim further in low light
    }
}

// MARK: - Venue chip (auto-stamped, top-left)

struct ViewfinderVenueChip: View {
    let label: String?

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: "mappin.and.ellipse")
                .font(CaptureType.footnote)
            Text(label ?? "Locating venue…")
                .font(CaptureType.eyebrow)
                .textCase(.uppercase)
                .lineLimit(1)
            Text("· auto")
                .font(CaptureType.eyebrow)
                .foregroundStyle(CaptureColor.goldenHour)
        }
        .foregroundStyle(CaptureColor.paper)
        .padding(.horizontal, 10).padding(.vertical, 7)
        .background(.black.opacity(0.42), in: Capsule())
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Venue, auto-stamped: \(label ?? "locating")")
    }
}

// MARK: - Work affordance (W1 entry, top-leading)

/// Small briefcase pill that opens the designer/pro Work dashboard. Sits above the
/// venue chip so it never crowds the shutter or mode selector.
struct ViewfinderWorkButton: View {
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Image(systemName: "briefcase.fill")
                    .font(CaptureType.footnote)
                Text("Work")
                    .font(CaptureType.eyebrow)
                    .textCase(.uppercase)
            }
            .foregroundStyle(CaptureColor.paper)
            .padding(.horizontal, 10).padding(.vertical, 7)
            .background(.black.opacity(0.42), in: Capsule())
            .frame(minHeight: 44)
        }
        .accessibilityLabel("Work")
        .accessibilityHint("Switches to Work and keeps your place in Camera")
        .accessibilityIdentifier("field.realm.work")
    }
}

// MARK: - Night / torch status pills (top-right)

struct ViewfinderNightChip: View {
    var body: some View {
        HStack(spacing: 5) {
            Image(systemName: "moon.stars.fill").font(CaptureType.footnote)
            Text("Night").font(CaptureType.eyebrow).textCase(.uppercase)
        }
        .foregroundStyle(CaptureColor.goldenHour)
        .padding(.horizontal, 9).padding(.vertical, 6)
        .background(.black.opacity(0.42), in: Capsule())
        .overlay(Capsule().stroke(CaptureColor.goldenHour.opacity(0.5), lineWidth: 1))
        .accessibilityLabel("Night capture suggested")
    }
}

struct ViewfinderTorchPill: View {
    let on: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 5) {
                Image(systemName: "bolt.fill")
                    .font(CaptureType.footnote)
                    .opacity(on ? 1 : 0.7)
                Text(on ? "On" : "Auto").font(CaptureType.eyebrow).textCase(.uppercase)
            }
            .foregroundStyle(on ? CaptureColor.goldenHour : CaptureColor.paper)
            .padding(.horizontal, 9).padding(.vertical, 6)
            .background(.black.opacity(0.42), in: Capsule())
        }
        .accessibilityLabel(on ? "Torch on" : "Torch auto")
    }
}

// MARK: - Low-light hint (R1, above the shutter)

struct ViewfinderLowLightHint: View {
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                Image(systemName: "bolt.fill").font(CaptureType.callout)
                Text("Low light — tap for torch")
                    .font(CaptureType.callout)
            }
            .foregroundStyle(CaptureColor.paper)
            .padding(.horizontal, 14).padding(.vertical, 9)
            .background(CaptureColor.terracotta.opacity(0.85), in: Capsule())
        }
        .accessibilityLabel("Low light. Tap to turn on the torch.")
    }
}

// MARK: - Level readout (C2)

struct ViewfinderLevelReadout: View {
    let isLevel: Bool

    var body: some View {
        Text(isLevel ? "Hold steady · level" : "Tilt to level the frame")
            .font(CaptureType.footnote)
            .foregroundStyle(isLevel ? CaptureColor.success : CaptureColor.paper.opacity(0.7))
            .accessibilityLabel(isLevel ? "Level" : "Not level")
    }
}

// MARK: - Torch + grid toggle cluster (C2)

struct ViewfinderControlCluster: View {
    let torchOn: Bool
    let gridOn: Bool
    let onTorch: () -> Void
    let onGrid: () -> Void

    var body: some View {
        VStack(spacing: 14) {
            toggle(system: torchOn ? "bolt.fill" : "bolt.slash",
                   active: torchOn, label: "Torch", action: onTorch)
            toggle(system: "square.grid.3x3", active: gridOn, label: "Grid", action: onGrid)
        }
    }

    private func toggle(system: String, active: Bool, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: system)
                .font(CaptureType.body)
                .foregroundStyle(active ? CaptureColor.goldenHour : CaptureColor.paper)
                .frame(width: 42, height: 42)
                .background(.black.opacity(0.38), in: Circle())
        }
        .accessibilityLabel("\(label) \(active ? "on" : "off")")
    }
}

// MARK: - Mode selector (C1, PHOTO · TAG · MEASURE · SCAN)

struct ViewfinderModeSelector: View {
    let mode: CameraMode
    let onSelect: (CameraMode) -> Void

    var body: some View {
        HStack(spacing: 22) {
            ForEach(CameraMode.allCases, id: \.self) { item in
                Button { onSelect(item) } label: {
                    VStack(spacing: 5) {
                        Text(item.rawValue.uppercased())
                            .font(CaptureType.eyebrow)
                            .foregroundStyle(item == mode ? CaptureColor.paper : CaptureColor.paper.opacity(0.45))
                        Circle()
                            .fill(item == mode ? CaptureColor.goldenHour : .clear)
                            .frame(width: 4, height: 4)
                    }
                }
                .accessibilityLabel("\(item.rawValue) mode")
                .accessibilityAddTraits(item == mode ? [.isSelected] : [])
            }
        }
    }
}

// MARK: - Shutter (C1, tap = one frame, hold = multi-shot)

struct ViewfinderShutter: View {
    let isHolding: Bool
    let count: Int
    let capturing: Bool

    var body: some View {
        ZStack {
            Circle()
                .stroke(isHolding ? CaptureColor.goldenHour : CaptureColor.paper.opacity(0.4), lineWidth: 4)
                .frame(width: 78, height: 78)
            Circle()
                .fill(isHolding ? CaptureColor.goldenHour : CaptureColor.paper)
                .frame(width: capturing ? 56 : 62, height: capturing ? 56 : 62)
            if isHolding {
                Text("\(count)")
                    .font(CaptureType.title2)
                    .foregroundStyle(CaptureColor.ink)
            }
        }
        .contentShape(Circle())
        .accessibilityLabel("Shutter")
        .accessibilityHint("Tap to capture, hold for a multi-shot specimen")
    }
}

// MARK: - Session tray handle (V1, swipe up)

struct ViewfinderSessionHandle: View {
    let count: Int
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 3) {
                Image(systemName: "chevron.up").font(CaptureType.footnote)
                Text("\(count)")
                    .font(CaptureType.monoSmall)
            }
            .foregroundStyle(CaptureColor.paper)
            .frame(width: 46, height: 46)
            .background(.black.opacity(0.38), in: Circle())
            .overlay(
                Circle().stroke(count > 0 ? CaptureColor.verdigris.opacity(0.7) : .clear, lineWidth: 1.5)
            )
        }
        .accessibilityLabel("Session tray, \(count) captured")
        .accessibilityHint("Opens this visit's captures")
    }
}

// MARK: - Multi-shot HUD (C4)

struct ViewfinderMultiShotOverlay: View {
    let count: Int

    var body: some View {
        VStack(spacing: 10) {
            HStack(spacing: 8) {
                Circle().fill(CaptureColor.goldenHour).frame(width: 9, height: 9)
                Text("holding · \(count)")
                    .font(CaptureType.monoBody)
                    .foregroundStyle(CaptureColor.paper)
            }
            Text("\(count) \(count == 1 ? "angle" : "angles") · release to keep")
                .font(CaptureType.footnote)
                .foregroundStyle(CaptureColor.paper.opacity(0.75))
        }
        .padding(.horizontal, 18).padding(.vertical, 12)
        .background(.black.opacity(0.5), in: RoundedRectangle(cornerRadius: 14))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Multi-shot, \(count) angles. Release to keep.")
        .accessibilityIdentifier(CaptureScreenID.c4MultiShot.rawValue)
    }
}
