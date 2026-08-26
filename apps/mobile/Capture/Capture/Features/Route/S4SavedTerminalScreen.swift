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
                Image(systemName: terminalIcon)
                    .font(CaptureType.display)
                    .foregroundStyle(accent)
            }
            .scaleEffect(appeared ? 1 : 0.6)
            .opacity(appeared ? 1 : 0)
            .animation(.spring(response: 0.45, dampingFraction: 0.6), value: appeared)

            VStack(spacing: 6) {
                Text(title)
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
                Text(eyebrow)
                    .font(CaptureType.eyebrow)
                    .textCase(.uppercase)
                    .foregroundStyle(accent)
                Text(explanation)
                    .font(CaptureType.callout)
                    .foregroundStyle(CaptureColor.inkSoft)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .routeCard(tint: CaptureColor.paper)

            Spacer(minLength: 8)

            VStack(spacing: 10) {
                if confirmedDestination == .inbox {
                    RouteActionButton("See what's waiting", systemImage: "tray.full", kind: .secondary) {
                        coordinator.dismissSheet()
                        coordinator.navigate(to: .librarySearch)
                    }
                } else if specimen != nil {
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
                ["destination": analyticsDestination])
        }
    }

    private var transfer: CaptureTransferState {
        specimen?.transferState ?? .local
    }

    private var isConfirmed: Bool {
        confirmedDestination != nil
    }

    private var confirmedDestination: CaptureDestination? {
        CaptureRouteSafetyPolicy.confirmedDestination(
            recordedDestination: specimen?.destination ?? .undecided,
            transfer: transfer)
    }

    private var terminalIcon: String {
        switch confirmedDestination {
        case .library: return "checkmark"
        case .inbox: return "tray.and.arrow.down.fill"
        case .undecided, nil: return "arrow.up"
        }
    }

    private var title: String {
        switch confirmedDestination {
        case .library: return "Kept to your library"
        case .inbox: return "Held for you"
        case .undecided, nil: return "Saved on this device"
        }
    }

    private var eyebrow: String {
        switch confirmedDestination {
        case .library: return "Confirmed by Patina"
        case .inbox: return "Safe in Patina"
        case .undecided, nil: return transferLabel
        }
    }

    private var explanation: String {
        switch confirmedDestination {
        case .library:
            return "Photos, measures, the tag and your voice note are ready to reuse."
        case .inbox:
            return "It's held safely for review, before it joins the library."
        case .undecided, nil:
            if transfer.phase == .complete {
                return "Patina has the receipt, but the destination still needs confirmation."
            }
            return "Nothing is lost. Patina will finish sending this capture and confirm when it lands."
        }
    }

    private var accent: Color {
        switch confirmedDestination {
        case .library: return CaptureColor.success
        case .inbox: return CaptureColor.warning
        case .undecided, nil: return CaptureColor.goldenHour
        }
    }

    private var transferLabel: String {
        switch transfer.phase {
        case .uploading: return "Uploading"
        case .awaitingConfirmation: return "Awaiting confirmation"
        case .retryableFailure: return "Retry needed"
        case .complete: return "Destination unconfirmed"
        default: return "Queued to sync"
        }
    }

    private var landed: String? {
        var parts: [String] = []
        switch confirmedDestination {
        case .library: parts.append("Library")
        case .inbox: parts.append("Held")
        case .undecided, nil: break
        }
        if let venue = specimen?.venue {
            if let project = venue.projectName { parts.append(project) }
            if let room = venue.room { parts.append(room) }
            if let placemark = venue.placemarkName { parts.append("from \(placemark)") }
        }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    private var analyticsDestination: String {
        (confirmedDestination ?? specimen?.destination ?? .undecided).rawValue
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
