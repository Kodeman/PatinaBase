//  S3DestinationScreen.swift
//  Capture
//
//  S3 · Destination. Makes the catch-vs-keep decision explicit. The recommendation
//  now asks FieldDestinationPolicy, which lifts the wave-2 hold at Inbox for
//  exactly one case: an open sourcing visit (spec Flow 6, F-12).
//  On success it hands off to the S4 (saved) or S5 (inbox) terminal.
//  Retired from the DEFAULT path rather than deleted: inside a visit the door
//  already answered "where", so ViewfinderModel.saveFromCard() commits straight
//  from the C3 card. This screen is what she still reaches from V3, from a
//  deliberate revisit, and from saveFromCard's catch — the recoverable-choice
//  seam. Both routes emit capture.placed / capture.unplaced with the same shape.

import SwiftUI
import CaptureKit
#if DEBUG
import CaptureKitMocks
#endif

struct S3DestinationScreen: View {
    let specimen: Specimen?
    let store: CaptureStore
    let sync: any CaptureSyncService
    let session: any SessionProviding
    let coordinator: CaptureCoordinator
    let analytics: any CaptureAnalytics

    var body: some View {
        Group {
            if let specimen {
                S3Content(
                    specimen: specimen, store: store, sync: sync,
                    session: session, coordinator: coordinator,
                    analytics: analytics)
            } else {
                RouteMissingSpecimen()
            }
        }
        .background(CaptureColor.paper3)
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .task { analytics.screen(CaptureScreenID.s3Destination.rawValue) }
        .accessibilityIdentifier(CaptureScreenID.s3Destination.rawValue)
    }
}

private struct S3Content: View {
    let specimen: Specimen
    let store: CaptureStore
    let sync: any CaptureSyncService
    let session: any SessionProviding
    let coordinator: CaptureCoordinator
    let analytics: any CaptureAnalytics
    private let sessionContext = CaptureSessionContextStore.shared

    @State private var routing: CaptureDestination?
    @State private var routeError: String?

    private var recommended: CaptureDestination {
        if specimen.destination == .library || specimen.destination == .inbox {
            return specimen.destination
        }
        return FieldDestinationPolicy.recommendation(
            for: sessionContext.visitState(
                identity: CaptureSessionIdentity(userID: session.userID,
                                                 workspaceID: session.workspaceID)),
            hasUnconfirmedGuess: specimen.hasUnconfirmedGuess)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            RouteSheetHeader(
                eyebrow: "Decision",
                title: "Where should this go?",
                onClose: { coordinator.dismissSheet() }
            )

            destinationCard(
                destination: .library,
                glyph: "books.vertical.fill",
                title: "Library — clean & complete",
                blurb: "Confirmed fields, ready to reuse and trust."
            )

            destinationCard(
                destination: .inbox,
                glyph: "tray.full.fill",
                title: "Hold it — finish later",
                blurb: "Guesses to confirm, or a tag to verify. It waits on Today."
            )

            if let routeError {
                Label(routeError, systemImage: "exclamationmark.triangle")
                    .font(CaptureType.footnote)
                    .foregroundStyle(CaptureColor.error)
            }

            Spacer(minLength: 0)
        }
        .padding(20)
    }

    private func destinationCard(destination: CaptureDestination, glyph: String,
                                 title: String, blurb: String) -> some View {
        let isRecommended = destination == recommended
        let isRouting = routing == destination
        let accent = destination == .library ? CaptureColor.verdigris : CaptureColor.warning

        return Button {
            choose(destination)
        } label: {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Image(systemName: glyph)
                        .font(CaptureType.title2)
                        .foregroundStyle(accent)
                    Spacer()
                    if isRouting {
                        ProgressView().tint(accent)
                    } else if isRecommended {
                        Text("Recommended")
                            .font(CaptureType.eyebrow)
                            .textCase(.uppercase)
                            .foregroundStyle(accent)
                    }
                }
                Text(title)
                    .font(CaptureType.title2)
                    .foregroundStyle(CaptureColor.ink)
                Text(blurb)
                    .font(CaptureType.callout)
                    .foregroundStyle(CaptureColor.inkSoft)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            .background(isRecommended ? accent.opacity(0.08) : CaptureColor.paper)
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .overlay(
                RoundedRectangle(cornerRadius: 14)
                    .stroke(isRecommended ? accent.opacity(0.6) : CaptureColor.line,
                            lineWidth: isRecommended ? 1.5 : 1)
            )
        }
        .buttonStyle(.plain)
        .disabled(routing != nil)
    }

    private func choose(_ destination: CaptureDestination) {
        guard routing == nil else { return }
        routeError = nil
        specimen.destination = destination
        specimen.touch()
        try? store.save()

        routing = destination
        Task { @MainActor in
            do {
                try await sync.route(specimen.id, to: destination)
                remember(destination)
                // The program's headline metric — S3 is the OTHER commit route
                // (ViewfinderModel.saveFromCard() is the first): whether this
                // capture actually landed on a project, via S1's persisted
                // routing on `specimen.venue`, or is committing roving.
                if let venue = specimen.venue, venue.projectId != nil {
                    analytics.event("capture.placed", ["basis": "manual",
                                                        "has_room": String(venue.projectRoomId != nil)])
                } else {
                    analytics.event("capture.unplaced", [:])
                }
                routing = nil
                coordinator.present(destination == .library
                                    ? .savedTerminal(specimen.id)
                                    : .inboxTerminal(specimen.id))
            } catch {
                routing = nil
                routeError = "Couldn’t route it just now — it’s saved locally. Try again."
            }
        }
    }

    private func remember(_ destination: CaptureDestination) {
        let identity = CaptureSessionIdentity(
            userID: session.userID, workspaceID: session.workspaceID)
        var remembered = sessionContext.current(identity: identity).routing
        remembered.destination = destination
        sessionContext.remember(remembered, identity: identity)
    }
}

#if DEBUG
#Preview {
    let demo = RoutePreviewData.make()
    return S3DestinationScreen(
        specimen: demo.specimen,
        store: demo.store,
        sync: InMemoryCaptureSyncService(),
        session: MockSessionProviding(),
        coordinator: CaptureCoordinator(),
        analytics: MockCaptureAnalytics()
    )
}
#endif
