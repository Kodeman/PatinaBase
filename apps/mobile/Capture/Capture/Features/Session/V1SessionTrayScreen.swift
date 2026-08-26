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
    let analytics: any CaptureAnalytics
    let sync: any CaptureSyncService

    @State private var items: [Specimen] = []
    @State private var unplaced: [Specimen] = []
    @State private var scope: FieldTrayScope = .unplacedOnly
    @State private var placedJustNow: Set<UUID> = []
    @State private var player = VoiceSegmentPlayer()
    @State private var playingSpecimenID: UUID?
    private let sessionContext = CaptureSessionContextStore.shared

    private var groups: [(venue: String, items: [Specimen])] {
        let grouped = Dictionary(grouping: items) { specimen in
            specimen.venue?.placemarkName ?? "This visit"
        }
        return grouped
            .map { (venue: $0.key, items: ordered($0.value)) }
            .sorted {
                ($0.items.map(\.createdAt).max() ?? .distantPast)
                    > ($1.items.map(\.createdAt).max() ?? .distantPast)
            }
    }

    /// `items` is always this visit's own captures now (Task 25 stopped it
    /// doubling as the unplaced list), so it stays newest-first: its records
    /// are answered, and `place(…)` leaves `suggested_*` standing, so a
    /// leftover question must not be allowed to reorder answered work. The
    /// unplaced section below carries its own FieldTraySuggestionOrder.
    private func ordered(_ specimens: [Specimen]) -> [Specimen] {
        specimens.sorted { $0.createdAt > $1.createdAt }
    }

    /// The unplaced tray leads with the strongest question — the confidence
    /// decides the sequence and is never shown (Task 27).
    private var unplacedGroups: [(venue: String, items: [Specimen])] {
        let grouped = Dictionary(grouping: unplaced) { specimen in
            specimen.venue?.placemarkName ?? "This visit"
        }
        return grouped
            .map { (venue: $0.key, items: FieldTraySuggestionOrder.ordered($0.value)) }
            .sorted {
                ($0.items.map(\.createdAt).max() ?? .distantPast)
                    > ($1.items.map(\.createdAt).max() ?? .distantPast)
            }
    }

    var body: some View {
        ZStack {
            CaptureColor.paper3.ignoresSafeArea()

            if items.isEmpty && unplaced.isEmpty {
                emptyState
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 22) {
                        Text(scope.title)
                            .font(CaptureType.display)
                            .foregroundStyle(CaptureColor.ink)
                            .padding(.top, 4)

                        ForEach(groups, id: \.venue) { group in
                            venueSection(group.venue, group.items)
                        }

                        if !unplaced.isEmpty {
                            unplacedSection
                        }
                    }
                    .padding(20)
                    .padding(.bottom, 96)
                }
            }
        }
        .safeAreaInset(edge: .bottom) {
            if !(items.isEmpty && unplaced.isEmpty) { footer }
        }
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            // Task 25 made the tray itself honest about whether a visit is
            // open; this button was the one place left that still offered to
            // end one regardless. Hidden rather than reworded in the
            // unplaced-only scope — the footer already carries "Start a
            // visit" as its primary action there, so a second entry point in
            // the corner would just duplicate it instead of promising
            // anything the footer doesn't.
            if case .visit = scope {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("End visit", action: endVisit)
                        .font(CaptureType.callout)
                        .foregroundStyle(CaptureColor.inkSoft)
                }
            }
        }
        .accessibilityIdentifier(CaptureScreenID.v1SessionTray.rawValue)
        .onAppear(perform: reload)
        .onDisappear { player.stop() }
    }

    /// Spec §7.8: while a visit is open, an older unplaced capture stays
    /// visible underneath it instead of going invisible. Its own header is
    /// only shown when it trails a visit section — when there is no visit
    /// open, `scope.title` above already reads "Not placed yet" and this
    /// list is the whole tray, so a second identical heading would just
    /// repeat itself.
    @ViewBuilder
    private var unplacedSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            if !items.isEmpty {
                Text("Not placed yet")
                    .font(CaptureType.title2)
                    .foregroundStyle(CaptureColor.ink)
            }
            ForEach(unplacedGroups, id: \.venue) { group in
                venueSection(group.venue, group.items)
            }
        }
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
        VStack(alignment: .leading, spacing: 0) {
            rowBody(specimen)
            placedSyncingLine(specimen)
            suggestionRow(specimen)
        }
    }

    /// §13.5: a suggestion accepted on a capture that already committed needs
    /// the server to learn the project on the next drain. `placedJustNow`
    /// marks that gap so it reads as "placed · syncing" instead of looking
    /// stuck — and clears itself the moment `reload()` finds the record
    /// complete (Task 27's placement call site is where it's raised).
    @ViewBuilder
    private func placedSyncingLine(_ specimen: Specimen) -> some View {
        if placedJustNow.contains(specimen.id), specimen.transferState.phase != .complete {
            Text("placed · syncing")
                .font(CaptureType.footnote)
                .foregroundStyle(CaptureColor.inkSoft)
                .padding(.bottom, 8)
        }
    }

    /// The suggestion is ASKED, never asserted, and its basis is always in words.
    /// Only an unplaced capture is ever asked — a placed one has her answer.
    @ViewBuilder
    private func suggestionRow(_ specimen: Specimen) -> some View {
        if specimen.isUnplaced,
           let reason = specimen.suggestionReason,
           let projectID = specimen.suggestedProjectID {
            Button {
                accept(specimen, projectID: projectID)
            } label: {
                Text("\(reason). Place it here?")
                    .font(CaptureType.footnote)
                    .foregroundStyle(CaptureColor.verdigrisInk)
                    .multilineTextAlignment(.leading)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .frame(minHeight: 44)
            .padding(.bottom, 10)
            .accessibilityIdentifier("tray.suggestion")
        }
    }

    /// She answered the question, so the answer becomes the FACT.
    /// NEVER `route_field_capture`: that RPC hardcodes destination 'library'
    /// (00235:332) and would mint a product out of a damaged baseboard.
    private func accept(_ specimen: Specimen, projectID: String) {
        specimen.place(projectID: projectID,
                       projectRoomID: specimen.suggestedProjectRoomID,
                       room: nil)
        try? store.save()
        if let basis = specimen.suggestionBasis {
            analytics.emit(FieldVisitTelemetry.suggestionAccepted(basis: basis))
        }
        placedJustNow.insert(specimen.id)
        reload()
        // §13.5: filing works offline. The local record is written now; the
        // EXISTING outbox carries the project to the server on the next drain.
        // No second queue — and for a capture that has not committed yet this
        // is the same outbox entry its first commit would use anyway.
        Task { await sync.enqueue(specimen.id) }
    }

    private func rowBody(_ specimen: Specimen) -> some View {
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
            // Task 25: the primary follows the tray's scope, not a placement
            // count — a visit in progress is finished by ending it, and an
            // unplaced-only tray is cleared by opening a visit to place into.
            RouteActionButton(scope.footerPrimary, systemImage: primaryIcon, kind: .primary) {
                switch scope {
                case .visit:
                    endVisit()
                case .unplacedOnly:
                    coordinator.present(.visit)
                }
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 12)
        .padding(.bottom, 8)
        .background(.ultraThinMaterial)
    }

    private var primaryIcon: String {
        switch scope {
        case .visit: return "checkmark.circle"
        case .unplacedOnly: return "mappin.and.ellipse"
        }
    }

    /// True only once fix 1 lands below: a committed-but-unplaced capture
    /// keeps showing under "Not placed yet" until she files it, so the tray
    /// is only ever truly empty when nothing is waiting on her at all.
    private var emptyState: some View {
        PatinaEmptyState(icon: "tray",
                        title: "Nothing waiting",
                        message: "Everything you've captured is placed.")
    }

    private func reload() {
        // Read-only: `.current` would resolve/persist a fresh context even with
        // no visit open, which is exactly the state this scope must tell apart
        // from a real one. `visitState` reports without minting anything.
        let visitState = sessionContext.visitState(identity: identity)
        scope = FieldTrayScopeBuilder.scope(for: visitState)
        // Spec §7.8: the tray WIDENS rather than swaps. `items` stays this
        // visit's own captures; `unplaced` is `unfiled(owner:)` — which
        // INCLUDES `.committed` rows on purpose (Ruling 3, Task 15): the
        // tray empties on placement, not on sync — minus anything already
        // showing under the visit, so a capture from this visit never
        // renders twice.
        let allUnfiled: [Specimen]
        switch localListScope {
        case .globalFixtures:
            items = visitState.context.map { store.session(visitID: $0.visitID) } ?? []
            allUnfiled = store.unfiled()
        case .owner(let owner):
            items = visitState.context.map { store.session(visitID: $0.visitID, owner: owner) } ?? []
            allUnfiled = store.unfiled(owner: owner)
        case .unavailable:
            items = []
            allUnfiled = []
        }
        unplaced = FieldTrayUnplacedFilter.excluding(allUnfiled, visibleIn: items)
        // A `placedJustNow` mark clears once the record it names is complete.
        placedJustNow = placedJustNow.filter { id in
            guard let match = (items + unplaced).first(where: { $0.id == id }) else { return false }
            return match.transferState.phase != .complete
        }
    }

    private func endVisit() {
        // Site 2 of 4 (spec §14): read the visit's own counts BEFORE `endVisit`
        // closes the context — afterwards `visitState` reads `.none` and they
        // are unrecoverable. `unplaced` (the @State array) has already had this
        // visit's own unplaced rows excluded for display, so the count comes
        // fresh from the store instead of undercounting them.
        if let context = sessionContext.visitState(identity: identity).context {
            let counts = FieldVisitEndCounts.compute(
                context: context, store: store,
                runsRealServices: AppConfiguration.runsRealServices,
                userID: session.userID, workspaceID: session.workspaceID)
            analytics.emit(FieldVisitTelemetry.visitEnd(
                duration: counts.duration, captures: counts.captures,
                notes: counts.notes, scans: counts.scans, unplaced: counts.unplaced))
        }
        _ = sessionContext.endVisit(identity: identity)
        reload()
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
            coordinator: CaptureCoordinator(),
            analytics: MockCaptureAnalytics(),
            sync: InMemoryCaptureSyncService())
    }
}
#endif
