//  S4SavedTerminalScreen.swift
//  Capture
//
//  S4 · Saved — success. The terminal success state, confirmed with a satisfying
//  success haptic. Shows where it landed and the two real next moves: inspect the
//  specimen (V3), or keep working the room (back to the viewfinder).

import SwiftUI
import CaptureKit

struct S4SavedTerminalScreen: View {
    let specimen: Specimen?
    let coordinator: CaptureCoordinator
    let analytics: any CaptureAnalytics

    @State private var appeared = false

    var body: some View {
        VStack(spacing: 20) {
            Spacer(minLength: 8)

            ZStack {
                Circle()
                    .fill(accent.opacity(0.12))
                    .frame(width: 96, height: 96)
                Image(systemName: isConfirmed ? "checkmark" : "arrow.up")
                    .font(CaptureType.display)
                    .foregroundStyle(accent)
            }
            .scaleEffect(appeared ? 1 : 0.6)
            .opacity(appeared ? 1 : 0)
            .animation(.spring(response: 0.45, dampingFraction: 0.6), value: appeared)

            VStack(spacing: 6) {
                Text(isConfirmed ? "Kept to your library" : "Saved on this device")
                    .font(CaptureType.title)
                    .foregroundStyle(CaptureColor.ink)
                if let where_ = landed {
                    Text(where_)
                        .font(CaptureType.callout)
                        .foregroundStyle(CaptureColor.inkSoft)
                        .multilineTextAlignment(.center)
                }
            }

            VStack(alignment: .leading, spacing: 6) {
                Text(isConfirmed ? "Confirmed by Patina" : transferLabel)
                    .font(CaptureType.eyebrow)
                    .textCase(.uppercase)
                    .foregroundStyle(accent)
                Text(isConfirmed
                     ? "Photos, measures, the tag and your voice note are ready to reuse."
                     : "Nothing is lost. Patina will finish sending this capture and confirm when it lands.")
                    .font(CaptureType.callout)
                    .foregroundStyle(CaptureColor.inkSoft)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .routeCard(tint: CaptureColor.paper)

            Spacer(minLength: 8)

            VStack(spacing: 10) {
                if specimen != nil {
                    RouteActionButton("View", systemImage: "doc.text.magnifyingglass", kind: .secondary) {
                        if let id = specimen?.id {
                            coordinator.navigate(to: .specimen(id))
                        }
                        coordinator.dismissSheet()
                    }
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
        .accessibilityIdentifier(CaptureScreenID.s4Saved.rawValue)
        .sensoryFeedback(.success, trigger: appeared)
        .onAppear { appeared = true }
        .task {
            analytics.screen(CaptureScreenID.s4Saved.rawValue)
            analytics.event(
                isConfirmed ? "capture.route_completed" : "capture.route_queued",
                ["destination": "project"])
        }
    }

    private var transfer: CaptureTransferState {
        specimen?.transferState ?? .local
    }

    private var isConfirmed: Bool {
        transfer.phase == .complete && transfer.receiptID != nil
    }

    private var accent: Color {
        isConfirmed ? CaptureColor.success : CaptureColor.goldenHour
    }

    private var transferLabel: String {
        switch transfer.phase {
        case .uploading: return "Uploading"
        case .awaitingConfirmation: return "Awaiting confirmation"
        case .retryableFailure: return "Retry needed"
        default: return "Queued to sync"
        }
    }

    private var landed: String? {
        guard let venue = specimen?.venue else { return nil }
        var parts: [String] = []
        if let project = venue.projectName { parts.append(project) }
        if let room = venue.room { parts.append(room) }
        if let placemark = venue.placemarkName { parts.append("from \(placemark)") }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }
}

#if DEBUG
import CaptureKitMocks

#Preview {
    let demo = RoutePreviewData.make()
    return S4SavedTerminalScreen(specimen: demo.specimen, coordinator: CaptureCoordinator(),
                                 analytics: MockCaptureAnalytics())
}
#endif
