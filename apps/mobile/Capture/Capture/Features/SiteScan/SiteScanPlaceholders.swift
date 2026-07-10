//  SiteScanPlaceholders.swift
//  Capture · Wave F (Pro site-scan)
//
//  Wave F replaced the F1–F4 freeze placeholders with the real screens
//  (SiteScanSetupScreen / SiteScanHostScreen / SiteScanReviewUploadViews). This
//  file now holds the flow's shared, token-only field-instrument chrome those
//  screens compose — kept in one place so F1–F4 stay thin and consistent.

import SwiftUI
import CaptureKit

// MARK: - Titled card section (F1/F3/F4)

struct SiteScanSection<Content: View>: View {
    let title: String
    @ViewBuilder let content: () -> Content

    init(_ title: String, @ViewBuilder content: @escaping () -> Content) {
        self.title = title
        self.content = content
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(CaptureType.eyebrow).textCase(.uppercase)
                .foregroundStyle(CaptureColor.goldenHour)
                .padding(.leading, 4)
            VStack(alignment: .leading, spacing: 0) { content() }
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(RoundedRectangle(cornerRadius: 14).fill(CaptureColor.paper3))
                .overlay(RoundedRectangle(cornerRadius: 14).stroke(CaptureColor.line, lineWidth: 1))
        }
    }
}

// MARK: - Menu value label (F1 pickers)

struct SiteScanPickerLabel: View {
    let value: String

    var body: some View {
        HStack(spacing: 6) {
            Text(value)
                .font(CaptureType.body)
                .foregroundStyle(CaptureColor.ink)
                .lineLimit(1)
            Spacer(minLength: 8)
            Image(systemName: "chevron.up.chevron.down")
                .font(CaptureType.footnote)
                .foregroundStyle(CaptureColor.inkSoft)
        }
        .contentShape(Rectangle())
    }
}

// MARK: - Scanning backdrop (F2 simulator / mock fallback)

/// The dark field-instrument surface F2 shows when there is no live RoomPlan view
/// (simulator / mock). A faint reticle communicates "scanning" without pretending
/// to be a real feed. Reduce Motion suppresses the pulse.
struct SiteScanBackdrop: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var pulse = false

    var body: some View {
        ZStack {
            LinearGradient(colors: [CaptureColor.ink, CaptureColor.ink2],
                           startPoint: .top, endPoint: .bottom)
            Image(systemName: "camera.metering.matrix")
                .font(CaptureType.display)
                .imageScale(.large)
                .foregroundStyle(CaptureColor.goldenHour.opacity(reduceMotion ? 0.28 : (pulse ? 0.35 : 0.18)))
                .accessibilityHidden(true)
        }
        .onAppear {
            guard !reduceMotion else { return }
            withAnimation(.easeInOut(duration: 1.6).repeatForever(autoreverses: true)) { pulse = true }
        }
    }
}

// MARK: - Coverage meter (F2)

/// Status line + coarse coverage bar, in a translucent dark chip so it reads over
/// both the live RoomPlan view and the backdrop.
struct SiteScanCoverageMeter: View {
    let coverage: Double
    let status: String

    private var percent: Int { Int((max(0, min(1, coverage)) * 100).rounded()) }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(status)
                    .font(CaptureType.callout)
                    .foregroundStyle(CaptureColor.paper3)
                    .lineLimit(1)
                Spacer(minLength: 8)
                Text("\(percent)%")
                    .font(CaptureType.monoSmall)
                    .foregroundStyle(CaptureColor.paper3)
            }
            bar
        }
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 12).fill(CaptureColor.ink.opacity(0.55)))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Scan coverage")
        .accessibilityValue("\(percent) percent, \(status)")
    }

    private var bar: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(CaptureColor.paper3.opacity(0.25))
                Capsule().fill(CaptureColor.verdigris)
                    .frame(width: max(0, min(1, coverage)) * geo.size.width)
            }
        }
        .frame(height: 6)
    }
}

// MARK: - Rows (F3 artifacts / F4 destination)

struct SiteScanArtifactRow: View {
    let label: String
    let detail: String
    let size: String

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(label)
                    .font(CaptureType.bodyEmph)
                    .foregroundStyle(CaptureColor.ink)
                Text(detail)
                    .font(CaptureType.monoSmall)
                    .foregroundStyle(CaptureColor.inkSoft)
            }
            Spacer(minLength: 8)
            Text(size)
                .font(CaptureType.monoSmall)
                .foregroundStyle(CaptureColor.inkSoft)
        }
        .padding(.vertical, 10)
        .accessibilityElement(children: .combine)
    }
}

struct SiteScanDestinationRow: View {
    let label: String
    let value: String

    var body: some View {
        HStack {
            Text(label.uppercased())
                .font(CaptureType.eyebrow)
                .foregroundStyle(CaptureColor.inkSoft)
            Spacer(minLength: 12)
            Text(value)
                .font(CaptureType.body)
                .foregroundStyle(CaptureColor.ink)
                .lineLimit(1)
        }
        .padding(.vertical, 12)
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Action buttons

struct SiteScanPrimaryButton: View {
    let title: String
    let systemImage: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Label(title, systemImage: systemImage)
                .font(CaptureType.bodyEmph)
                .foregroundStyle(CaptureColor.paper3)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(CaptureColor.verdigris, in: RoundedRectangle(cornerRadius: 12))
        }
        .accessibilityLabel(title)
    }
}

struct SiteScanSecondaryButton: View {
    let title: String
    let systemImage: String
    let tint: Color
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Label(title, systemImage: systemImage)
                .font(CaptureType.bodyEmph)
                .foregroundStyle(tint)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(tint.opacity(0.5), lineWidth: 1))
        }
        .accessibilityLabel(title)
    }
}
