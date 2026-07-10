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
                Text("Parked in your inbox")
                    .font(CaptureType.title)
                    .foregroundStyle(CaptureColor.ink)
                Text(leftToFinish)
                    .font(CaptureType.callout)
                    .foregroundStyle(CaptureColor.inkSoft)
                    .multilineTextAlignment(.center)
            }

            VStack(alignment: .leading, spacing: 6) {
                Text("Next in the inbox")
                    .font(CaptureType.eyebrow)
                    .textCase(.uppercase)
                    .foregroundStyle(CaptureColor.warning)
                Text("Confirm the material, verify the trade price, then promote it to the library.")
                    .font(CaptureType.callout)
                    .foregroundStyle(CaptureColor.inkSoft)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .routeCard(tint: CaptureColor.paper)

            Spacer(minLength: 8)

            VStack(spacing: 10) {
                RouteActionButton("Open inbox", systemImage: "tray.full", kind: .secondary) {
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
#Preview {
    let demo = RoutePreviewData.make()
    return S5InboxTerminalScreen(specimen: demo.specimen, coordinator: CaptureCoordinator())
}
#endif
