//  V1SessionTrayScreen.swift
//  Capture
//
//  V1 · Session tray. Swiping up from the viewfinder reveals everything captured
//  on this visit, grouped by venue with each record's status. The hub for
//  finishing a sourcing run in one sitting: tap a row to open its detail (V3),
//  step through them (V2), or batch-route the lot (S1).

import Foundation
import SwiftUI
import CaptureKit
import PatinaDesignKit

struct V1SessionTrayScreen: View {
    let store: CaptureStore
    let session: any SessionProviding
    let coordinator: CaptureCoordinator

    @State private var items: [Specimen] = []
    @State private var player = VoiceSegmentPlayer()
    @State private var playingSpecimenID: UUID?
    private let sessionContext = CaptureSessionContextStore.shared

    private var groups: [(venue: String, items: [Specimen])] {
        let grouped = Dictionary(grouping: items) { specimen in
            specimen.venue?.placemarkName ?? "This visit"
        }
        return grouped
            .map { (venue: $0.key, items: $0.value.sorted { $0.createdAt > $1.createdAt }) }
            .sorted { ($0.items.first?.createdAt ?? .distantPast) > ($1.items.first?.createdAt ?? .distantPast) }
    }

    var body: some View {
        ZStack {
            CaptureColor.paper3.ignoresSafeArea()

            if items.isEmpty {
                emptyState
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 22) {
                        Text("This visit")
                            .font(CaptureType.display)
                            .foregroundStyle(CaptureColor.ink)
                            .padding(.top, 4)

                        ForEach(groups, id: \.venue) { group in
                            venueSection(group.venue, group.items)
                        }
                    }
                    .padding(20)
                    .padding(.bottom, 96)
                }
            }
        }
        .safeAreaInset(edge: .bottom) {
            if !items.isEmpty { footer }
        }
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("End visit", action: endVisit)
                    .font(CaptureType.callout)
                    .foregroundStyle(CaptureColor.inkSoft)
            }
        }
        .accessibilityIdentifier(CaptureScreenID.v1SessionTray.rawValue)
        .onAppear(perform: reload)
        .onDisappear { player.stop() }
    }

    private func venueSection(_ venue: String, _ specimens: [Specimen]) -> some View {
        let doneCount = specimens.filter { $0.destination != .undecided }.count
        return VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("\(venue.uppercased()) · \(specimens.count) CAPTURES")
                    .font(CaptureType.eyebrow)
                    .foregroundStyle(CaptureColor.inkSoft)
                Spacer()
                Text("Done \(doneCount)")
                    .font(CaptureType.eyebrow)
                    .foregroundStyle(CaptureColor.success)
            }

            VStack(spacing: 0) {
                ForEach(specimens, id: \.id) { specimen in
                    if specimen.id != specimens.first?.id {
                        Divider().background(CaptureColor.line)
                    }
                    row(specimen)
                }
            }
            .routeCard()
        }
    }

    private func row(_ specimen: Specimen) -> some View {
        let playable = playableSegments(specimen)
        return HStack(spacing: 12) {
            Button {
                coordinator.navigate(to: .specimen(specimen.id))
            } label: {
                VStack(alignment: .leading, spacing: 3) {
                    Text(specimen.title ?? "Untitled capture")
                        .font(CaptureType.bodyEmph)
                        .foregroundStyle(CaptureColor.ink)
                    Text("\(RouteFormat.time(specimen.createdAt)) · \(RouteFormat.descriptor(for: specimen).uppercased())")
                        .font(CaptureType.monoSmall)
                        .foregroundStyle(CaptureColor.inkSoft)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.vertical, 12)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            if !playable.isEmpty {
                playButton(specimen.id, playable)
            }

            // The play control has to sit OUTSIDE a navigation button to receive
            // its own touches, which splits the row in two - and the chevron is
            // the only thing on it that says "this row navigates", so the
            // trailing block gets its own button rather than going inert.
            Button {
                coordinator.navigate(to: .specimen(specimen.id))
            } label: {
                HStack(spacing: 12) {
                    RouteStatusChip(kind: RouteFormat.status(for: specimen))
                    Image(systemName: "chevron.right")
                        .font(CaptureType.footnote)
                        .foregroundStyle(CaptureColor.line2)
                }
                .padding(.vertical, 12)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Open capture")
        }
    }

    /// The segments of this note whose bytes are still on THIS phone.
    /// `voiceAudioSegmentsRaw` outlives them: once a capture is receipted the
    /// sync service deletes the local files and leaves the array standing, and
    /// VoiceSegmentPlayer skips an unreadable file in silence — so a control
    /// gated on the array alone offered Play and then played nothing, with no
    /// message. Playing the remote object instead is wave 4 (portal playback);
    /// until then the control is simply absent once the audio has left.
    private func playableSegments(_ specimen: Specimen) -> [URL] {
        (specimen.voiceAudioSegmentsRaw ?? []).compactMap { name in
            let url = store.mediaURL(for: name)
            let values = try? url.resourceValues(
                forKeys: [.isRegularFileKey, .fileSizeKey]
            )
            guard values?.isRegularFile == true,
                  (values?.fileSize ?? 0) > 0 else { return nil }
            return url
        }
    }

    private func playButton(_ specimenID: UUID, _ segments: [URL]) -> some View {
        let playing = player.isPlaying && playingSpecimenID == specimenID
        return Button {
            player.stop()
            if playing {
                playingSpecimenID = nil
            } else {
                playingSpecimenID = specimenID
                player.play(segments)
            }
        } label: {
            Image(systemName: playing ? "stop.fill" : "play.fill")
                .font(CaptureType.footnote)
                .foregroundStyle(CaptureColor.verdigris)
                .frame(width: 32, height: 32)
                .background(Circle().fill(CaptureColor.paper2))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(playing ? "Stop the voice note" : "Play the voice note")
    }

    private var footer: some View {
        HStack(spacing: 10) {
            RouteActionButton("Review each", systemImage: "rectangle.stack", kind: .secondary) {
                coordinator.present(.cullDeck)
            }
            // "Route all N" presented the picker for exactly ONE record. Until the
            // visit spine lands, say what the button actually does: it places the
            // next unplaced capture, one at a time.
            RouteActionButton(placeButtonTitle, systemImage: "arrow.up.forward", kind: .primary) {
                if let next = items.first(where: { $0.venue?.projectId == nil }) ?? items.first {
                    coordinator.present(.assignVenue(next.id))
                }
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 12)
        .padding(.bottom, 8)
        .background(.ultraThinMaterial)
    }

    private var placeButtonTitle: String {
        let unplaced = items.filter { $0.venue?.projectId == nil }.count
        return unplaced > 0 ? "Place \(unplaced)" : "Review placement"
    }

    private var emptyState: some View {
        PatinaEmptyState(icon: "tray",
                         title: "Nothing captured yet",
                         message: "Captures from this visit gather here.")
    }

    private func reload() {
        let context = sessionContext.current(identity: identity)
        switch localListScope {
        case .globalFixtures:
            items = store.session(visitID: context.visitID)
        case .owner(let owner):
            items = store.session(visitID: context.visitID, owner: owner)
        case .unavailable:
            items = []
        }
    }

    private func endVisit() {
        _ = sessionContext.endVisit(identity: identity)
        items = []
        coordinator.popToRoot()
    }

    private var identity: CaptureSessionIdentity {
        CaptureSessionIdentity(
            userID: session.userID,
            workspaceID: session.workspaceID)
    }

    private var localListScope: CaptureLocalListScope {
        CaptureOwnerProjectionPolicy.resolve(
            runsRealServices: AppConfiguration.runsRealServices,
            userID: session.userID,
            workspaceID: session.workspaceID)
    }
}

#if DEBUG
import CaptureKitMocks

#Preview {
    let demo = RoutePreviewData.make()
    return NavigationStack {
        V1SessionTrayScreen(
            store: demo.store, session: MockSessionProviding(),
            coordinator: CaptureCoordinator())
    }
}
#endif
