//  OfflineQueueBanner.swift
//  Capture
//
//  Team D — R4 (offline capture & queue). A composable banner, NOT a registered
//  screen: the C1 viewfinder / session tray drop it in when there's no signal.
//  "No signal · saving on device · N queued" — captures complete fully and queue
//  on-device; tap (or swipe up) routes to the U1 sync status (Team C). Nothing
//  here waits on the network (F-11).

import SwiftUI
import CaptureKit

struct OfflineQueueBanner: View {
    let queuedCount: Int
    /// Venue context, e.g. "Salvage yard · offline".
    var venueLabel: String?
    /// Tap / swipe-up → review the queue (U1).
    var onTap: (() -> Void)?

    var body: some View {
        Button { onTap?() } label: {
            HStack(spacing: 10) {
                Image(systemName: "wifi.slash")
                    .font(CaptureType.callout)
                    .foregroundStyle(CaptureColor.rust2)
                    .accessibilityHidden(true)

                VStack(alignment: .leading, spacing: 1) {
                    Text("No signal · saving on device")
                        .font(CaptureType.monoBody)
                        .foregroundStyle(CaptureColor.paper3)
                    if let venueLabel {
                        Text(venueLabel)
                            .font(CaptureType.eyebrow)
                            .foregroundStyle(CaptureColor.paper2.opacity(0.8))
                    }
                }

                Spacer(minLength: 8)

                // Queued count pill.
                HStack(spacing: 5) {
                    Image(systemName: "tray.full.fill")
                        .font(CaptureType.footnote)
                    Text("\(queuedCount)")
                        .font(CaptureType.monoBody)
                        .monospacedDigit()
                }
                .foregroundStyle(CaptureColor.ink)
                .padding(.horizontal, 9)
                .padding(.vertical, 4)
                .background(Capsule().fill(CaptureColor.brass2))

                if onTap != nil {
                    Image(systemName: "chevron.up")
                        .font(CaptureType.footnote)
                        .foregroundStyle(CaptureColor.paper2.opacity(0.7))
                        .accessibilityHidden(true)
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(
                RoundedRectangle(cornerRadius: 12).fill(CaptureColor.ink.opacity(0.78))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12).stroke(CaptureColor.rust2.opacity(0.45), lineWidth: 1)
            )
            .contentShape(RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("r4.offlineBanner")
        .accessibilityElement(children: .combine)
        .accessibilityLabel("No signal. Saving on device. \(queuedCount) queued.")
        .accessibilityHint("Review the offline queue")
    }
}

#Preview("R4 · offline queue") {
    ZStack {
        CaptureColor.ink2.ignoresSafeArea()
        VStack(spacing: 16) {
            OfflineQueueBanner(queuedCount: 5, venueLabel: "Salvage yard · offline", onTap: {})
            OfflineQueueBanner(queuedCount: 1, venueLabel: nil, onTap: nil)
        }
        .padding()
    }
}
