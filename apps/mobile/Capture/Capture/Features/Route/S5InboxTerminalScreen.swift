//  S5InboxTerminalScreen.swift
//  Capture
//
//  S5 · Sent to inbox. The terminal state for anything deferred. Confirms the
//  specimen is safely held and previews what finishing it involves — a clean
//  handoff from the field to triage (F-12). Offline this reads "queued — will
//  sync" and routes via U1.

import SwiftUI
import CaptureKit

struct S5InboxTerminalScreen: View {
    let specimen: Specimen?
    let coordinator: CaptureCoordinator
    let analytics: any CaptureAnalytics

    @State private var appeared = false

    var body: some View {
        VStack(spacing: 20) {
            Spacer(minLength: 8)

            ZStack {
                Circle()
                    .fill(CaptureColor.warning.opacity(0.14))
                    .frame(width: 96, height: 96)
                Image(systemName: "tray.and.arrow.down.fill")
                    .font(CaptureType.title)
                    .foregroundStyle(CaptureColor.warning)
            }
            .scaleEffect(appeared ? 1 : 0.7)
            .opacity(appeared ? 1 : 0)
            .animation(.spring(response: 0.45, dampingFraction: 0.7), value: appeared)

            VStack(spacing: 6) {
                Text(isConfirmed ? "Held for you" : "Held on this device")
                    .font(CaptureType.title)
                    .foregroundStyle(CaptureColor.ink)
                Text(leftToFinish)
                    .font(CaptureType.callout)
                    .foregroundStyle(CaptureColor.inkSoft)
                    .multilineTextAlignment(.center)
            }

            VStack(alignment: .leading, spacing: 6) {
                Text(isConfirmed ? "What's left to finish" : transferLabel)
                    .font(CaptureType.eyebrow)
                    .textCase(.uppercase)
                    .foregroundStyle(CaptureColor.warning)
                Text(isConfirmed
                     ? "Confirm the material, verify the trade price, then promote it to the library."
                     : "Nothing is lost. Patina will send it to the studio and confirm when it lands.")
                    .font(CaptureType.callout)
                    .foregroundStyle(CaptureColor.inkSoft)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .routeCard(tint: CaptureColor.paper)

            Spacer(minLength: 8)

            VStack(spacing: 10) {
                RouteActionButton("See what's waiting", systemImage: "tray.full", kind: .secondary) {
                    coordinator.dismissSheet()
                    // No dedicated inbox route exists; the library search surface
                    // carries the inbox filter (U2). See manifest seam note.
                    coordinator.navigate(to: .librarySearch)
                }
                RouteActionButton("Capture next", systemImage: "camera", kind: .primary) {
                    coordinator.popToRoot()
                    coordinator.dismissSheet()
                }
            }
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(CaptureColor.paper3)
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .accessibilityIdentifier(CaptureScreenID.s5Inbox.rawValue)
        .sensoryFeedback(.impact(weight: .medium), trigger: appeared)
        .onAppear { appeared = true }
        .task {
            analytics.screen(CaptureScreenID.s5Inbox.rawValue)
            analytics.event(
                isConfirmed ? "capture.route_completed" : "capture.route_queued",
                ["destination": "inbox"])
        }
    }

    private var transfer: CaptureTransferState {
        specimen?.transferState ?? .local
    }

    private var isConfirmed: Bool {
        transfer.phase == .complete && transfer.receiptID != nil
    }

    private var transferLabel: String {
        switch transfer.phase {
        case .uploading: return "Uploading"
        case .awaitingConfirmation: return "Awaiting confirmation"
        case .retryableFailure: return "Retry needed"
        default: return "Queued to sync"
        }
    }

    private var leftToFinish: String {
        guard let specimen else { return "Held safely — finish it tonight." }
        let guessCount = specimen.provenanceRaw.values
            .filter { $0 == ProvenanceSource.smartGuess.rawValue }.count
        let priceUnverified = specimen.priceTradeCents == nil
            || specimen.provenance(for: .price) == .smartGuess

        var parts: [String] = []
        if guessCount > 0 {
            parts.append(guessCount == 1 ? "1 guess to confirm" : "\(guessCount) guesses to confirm")
        }
        if priceUnverified { parts.append("1 price to verify") }
        return parts.isEmpty ? "Held safely — promote it whenever you’re ready." : parts.joined(separator: " · ")
    }
}

#if DEBUG
import CaptureKitMocks

#Preview {
    let demo = RoutePreviewData.make()
    return S5InboxTerminalScreen(specimen: demo.specimen, coordinator: CaptureCoordinator(),
                                 analytics: MockCaptureAnalytics())
}
#endif
