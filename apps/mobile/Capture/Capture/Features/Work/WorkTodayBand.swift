//  WorkTodayBand.swift
//  Capture
//
//  The Today band (spec §7.1). Above "Needs you", never a blank screen.

import SwiftUI
import CaptureKit

struct WorkTodayBand: View {
    let band: FieldTodayBand
    let onCamera: () -> Void
    let onStartVisit: () -> Void
    let onResume: () -> Void
    let onEndVisit: () -> Void
    let onOpenUnplaced: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            switch band.visit {
            case .none:
                EmptyView()
            case .open(let label, let startedAt, _, _, _):
                openRow(label: label, startedAt: startedAt)
                Divider().background(CaptureColor.line)
            case .stale(_, let startedAt):
                staleRow(startedAt: startedAt)
                Divider().background(CaptureColor.line)
            }

            if let unplacedLine = band.unplacedLine {
                Button(action: onOpenUnplaced) {
                    HStack {
                        Text(unplacedLine)
                            .font(CaptureType.body)
                            .foregroundStyle(CaptureColor.ink)
                        Spacer()
                        Image(systemName: "chevron.right")
                            .font(CaptureType.footnote)
                            .foregroundStyle(CaptureColor.line2)
                    }
                    .frame(minHeight: 44)
                    .padding(.vertical, 14)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityHint("Opens what you haven’t placed yet")
                .accessibilityIdentifier("today.unplaced")
                Divider().background(CaptureColor.line)
            }

            if let offlineLine = band.offlineLine {
                Label(offlineLine, systemImage: "wifi.exclamationmark")
                    .font(CaptureType.footnote)
                    .foregroundStyle(CaptureColor.inkSoft)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.vertical, 10)
                Divider().background(CaptureColor.line)
            }

            RouteActionButton("Start a visit", systemImage: "plus", kind: .primary,
                              action: onStartVisit)
                .padding(.vertical, 12)
                .accessibilityIdentifier("today.start-visit")
        }
        .padding(.horizontal, 14)
        .background(RoundedRectangle(cornerRadius: 14)
            .fill(CaptureColor.verdigris.opacity(0.14)))
        .overlay(RoundedRectangle(cornerRadius: 14)
            .stroke(CaptureColor.verdigris.opacity(0.28), lineWidth: 1))
        .accessibilityIdentifier("today.band")
    }

    private func openRow(label: String, startedAt: Date) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "circle.fill")
                .font(CaptureType.footnote)
                .foregroundStyle(CaptureColor.verdigris)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 3) {
                Text(label)
                    .font(CaptureType.bodyEmph)
                    .foregroundStyle(CaptureColor.ink)
                    .fixedSize(horizontal: false, vertical: true)
                Text("started \(RouteFormat.time(startedAt))"
                     + (band.visitSubtitle.map { " · \($0)" } ?? ""))
                    .font(CaptureType.footnote)
                    .foregroundStyle(CaptureColor.inkSoft)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 8)
            Button(action: onCamera) {
                Label("Camera", systemImage: "camera.fill")
                    .font(CaptureType.footnote)
                    .foregroundStyle(CaptureColor.verdigrisInk)
                    .frame(minHeight: 44)
            }
            .buttonStyle(.plain)
            .accessibilityHint("Switches to Camera and keeps your place in Today")
            .accessibilityIdentifier("today.visit.camera")
        }
        .padding(.vertical, 14)
    }

    /// The place is named ONCE: `visitSubtitle` is already "Still at Maple St?",
    /// so repeating the bare label above it just says the same thing twice.
    private func staleRow(startedAt: Date) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            if let subtitle = band.visitSubtitle {
                Text(subtitle)
                    .font(CaptureType.bodyEmph)
                    .foregroundStyle(CaptureColor.ink)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Text("started \(RouteFormat.time(startedAt))")
                .font(CaptureType.footnote)
                .foregroundStyle(CaptureColor.inkSoft)
            HStack(spacing: 10) {
                RouteActionButton("Resume", kind: .secondary, action: onResume)
                RouteActionButton("End visit", kind: .ghost, action: onEndVisit)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 14)
        .accessibilityIdentifier("today.visit.stale")
    }
}
