//  V4VisitReviewScreen.swift
//  Capture
//
//  V4 · Visit review (§7.9, Flow 7). Ending a visit is not a dismissal — it is
//  a receipt: what the visit produced, what is still waiting, and the door out.
//  Every count and every line of copy comes from VisitReviewComposer, so this
//  view does no arithmetic of its own.
//
//  ⚠ The groups are Captures · Notes · Unplaced. §7.9 also names Scans; a scan
//  is not a Specimen and the device keeps no visit-keyed scan record, so
//  counting them here would mean guessing.
//
//  This screen is now the ONLY caller of endVisit on the tray path, so the
//  spec §14 explicit-end emission moved here with it.

import Foundation
import SwiftUI
import CaptureKit
import PatinaDesignKit
#if canImport(UIKit)
import UIKit
#endif

struct V4VisitReviewScreen: View {
    let visitID: UUID
    let store: CaptureStore
    let session: any SessionProviding
    let coordinator: CaptureCoordinator
    let analytics: any CaptureAnalytics

    @State private var specimens: [Specimen] = []
    @State private var startedAt = Date()
    /// Snapshotted on appear: the offered minutes must not tick while she reads.
    @State private var closedAt = Date()
    @State private var player = VoiceSegmentPlayer()
    @State private var playingSpecimenID: UUID?
    private let sessionContext = CaptureSessionContextStore.shared

    var body: some View {
        ZStack {
            CaptureColor.paper3.ignoresSafeArea()
            VStack(spacing: 0) {
                if specimens.isEmpty {
                    emptyState
                } else {
                    list
                }
                footer
            }
        }
        .navigationTitle("Visit review")
        .navigationBarTitleDisplayMode(.inline)
        .accessibilityIdentifier(CaptureScreenID.v4VisitReview.rawValue)
        .onAppear(perform: load)
        .onDisappear { player.stop() }
    }

    // MARK: - What the visit produced

    /// Paired so the screen's grouping uses the same judgement the mapper is
    /// tested on, rather than a second opinion about what a note is.
    private var paired: [(specimen: Specimen, row: VisitReviewRow)] {
        specimens
            .sorted { $0.createdAt < $1.createdAt }
            .map { ($0, VisitReviewRow(specimen: $0)) }
    }

    private var captures: [Specimen] { paired.filter(\.row.hasPhoto).map(\.specimen) }

    private var notes: [Specimen] {
        paired.filter { !$0.row.hasPhoto && $0.row.hasTranscript }.map(\.specimen)
    }

    private var unplaced: [Specimen] { paired.filter { !$0.row.isPlaced }.map(\.specimen) }

    private var summary: VisitReviewSummary {
        VisitReviewComposer.summarize(rows: paired.map(\.row),
                                      startedAt: startedAt, now: closedAt)
    }

    private var list: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                group("Captures", captures)
                group("Notes", notes)
                group("Unplaced", unplaced)
            }
            .padding(.horizontal, 20)
            .padding(.top, 8)
            .padding(.bottom, 24)
        }
    }

    @ViewBuilder
    private func group(_ title: String, _ members: [Specimen]) -> some View {
        if !members.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                Text("\(title.uppercased()) · \(members.count)")
                    .font(CaptureType.eyebrow)
                    .foregroundStyle(CaptureColor.inkSoft)
                VStack(spacing: 0) {
                    ForEach(members, id: \.id) { specimen in
                        if specimen.id != members.first?.id {
                            Divider().background(CaptureColor.line)
                        }
                        row(specimen)
                    }
                }
                .routeCard()
            }
        }
    }

    // MARK: - One capture

    private func row(_ specimen: Specimen) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            rowBody(specimen)
            rowActions(specimen)
        }
    }

    private func rowBody(_ specimen: Specimen) -> some View {
        let playable = playableSegments(specimen)
        return HStack(spacing: 12) {
            glyph(specimen)
            VStack(alignment: .leading, spacing: 3) {
                Text(rowTitle(specimen))
                    .font(CaptureType.bodyEmph)
                    .foregroundStyle(CaptureColor.ink)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                Text(specimen.venue?.room ?? "No room yet")
                    .font(CaptureType.monoSmall)
                    .foregroundStyle(CaptureColor.inkSoft)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if !playable.isEmpty {
                playButton(specimen.id, playable)
            }
            RouteStatusChip(kind: RouteFormat.status(for: specimen))
        }
        .padding(.vertical, 12)
    }

    /// The thumbnail when there is one, a mic when the capture is only words.
    @ViewBuilder
    private func glyph(_ specimen: Specimen) -> some View {
        let photo = specimen.photos.first { $0.isPrimary } ?? specimen.photos.first
        let image = photo.flatMap {
            UIImage(contentsOfFile: store.mediaURL(for: $0.thumbnailFilename ?? $0.filename).path)
        }
        ZStack {
            RoundedRectangle(cornerRadius: 6).fill(CaptureColor.paper2)
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
                    .clipShape(RoundedRectangle(cornerRadius: 6))
            } else {
                Image(systemName: "mic.fill")
                    .font(CaptureType.footnote)
                    .foregroundStyle(CaptureColor.inkSoft)
            }
        }
        .frame(width: 40, height: 40)
    }

    private func rowTitle(_ specimen: Specimen) -> String {
        if let title = specimen.title?.trimmingCharacters(in: .whitespacesAndNewlines),
           !title.isEmpty {
            return title
        }
        let words = (specimen.voiceTranscript ?? specimen.voicePartialTranscript ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return words.isEmpty ? "Untitled capture" : words
    }

    /// Place and Change room are the same destination (S1) — what differs is
    /// only what she is being asked, so the label differs and nothing else.
    private func rowActions(_ specimen: Specimen) -> some View {
        let placed = VisitReviewRow(specimen: specimen).isPlaced
        return Button(placed ? "Change room" : "Place") {
            coordinator.present(.assignVenue(specimen.id))
        }
        .font(CaptureType.footnote)
        .foregroundStyle(CaptureColor.verdigrisInk)
        .buttonStyle(.plain)
        .frame(minHeight: 44, alignment: .leading)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.bottom, 4)
    }

    // MARK: - Playback

    /// The segments whose bytes are still on THIS phone — once a capture is
    /// receipted the sync service deletes the local files and leaves the array
    /// standing, so a control gated on the array alone would play silence.
    private func playableSegments(_ specimen: Specimen) -> [URL] {
        (specimen.voiceAudioSegmentsRaw ?? []).compactMap { name in
            let url = store.mediaURL(for: name)
            let values = try? url.resourceValues(forKeys: [.isRegularFileKey, .fileSizeKey])
            guard values?.isRegularFile == true, (values?.fileSize ?? 0) > 0 else { return nil }
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

    // MARK: - The way out

    private var emptyState: some View {
        VStack(spacing: 14) {
            Text("Nothing captured on this visit.")
                .font(CaptureType.body)
                .foregroundStyle(CaptureColor.inkSoft)
                .multilineTextAlignment(.center)
            RouteActionButton("End anyway", kind: .secondary, action: done)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(.horizontal, 32)
    }

    private var footer: some View {
        VStack(spacing: 10) {
            if let caption = VisitReviewComposer.doneCaption(unplacedCount: summary.unplacedCount) {
                Text(caption)
                    .font(CaptureType.footnote)
                    .foregroundStyle(CaptureColor.inkSoft)
                    .multilineTextAlignment(.center)
            }
            RouteActionButton("Done", systemImage: "checkmark.circle", action: done)
        }
        .padding(.horizontal, 20)
        .padding(.top, 12)
        .padding(.bottom, 8)
        .background(.ultraThinMaterial)
    }

    private func done() {
        // Site 2 of 4 (spec §14): read the visit's own counts BEFORE endVisit
        // closes the context — afterwards visitState reads .none and they are
        // unrecoverable. V1's "End visit" now opens this screen instead of
        // ending the visit, so this emission moved here with the close.
        if let context = sessionContext.visitState(identity: identity).context {
            visitEndEmitter.emit(.explicit, context: context)
        }
        _ = sessionContext.endVisit(identity: identity)
        coordinator.popToRoot()
    }

    // MARK: - Loading

    private func load() {
        closedAt = Date()
        if let context = sessionContext.visitState(identity: identity).context {
            startedAt = context.startedAt
        }
        switch localListScope {
        case .globalFixtures:
            specimens = store.session(visitID: visitID)
        case .owner(let owner):
            specimens = store.session(visitID: visitID, owner: owner)
        case .unavailable:
            specimens = []
        }
    }

    private var visitEndEmitter: FieldVisitEndEmitter {
        FieldVisitEndEmitter(store: store, analytics: analytics,
                             userID: session.userID, workspaceID: session.workspaceID)
    }

    private var identity: CaptureSessionIdentity {
        CaptureSessionIdentity(userID: session.userID, workspaceID: session.workspaceID)
    }

    private var localListScope: CaptureLocalListScope {
        CaptureOwnerProjectionPolicy.resolve(
            runsRealServices: AppConfiguration.runsRealServices,
            userID: session.userID,
            workspaceID: session.workspaceID)
    }
}

/// V4's own registrar. `RouteSessionScreens.register` sits exactly on
/// SwiftLint's function_body_length limit for that file, so V4 wires itself
/// through ScreenRegistry's documented one-line-per-feature seam rather than
/// making a pre-existing guard get suppressed to fit.
enum VisitReviewScreens {
    @MainActor
    static func register(into r: RouteRegistry,
                         container: AppContainer,
                         coordinator: CaptureCoordinator) {
        r.registerRoute(CaptureRoute.visitReview(visitID: UUID()).registryKey) { route in
            guard case let .visitReview(visitID) = route else { return AnyView(EmptyView()) }
            return AnyView(V4VisitReviewScreen(
                visitID: visitID, store: container.store, session: container.session,
                coordinator: coordinator, analytics: container.analytics))
        }
    }
}
