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

import Combine
import Foundation
import SwiftData
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
    /// Nil in mock mode, exactly as `AppContainer` holds it.
    let visitCloseDrainer: VisitCloseOutboxDrainer?

    @State private var specimens: [Specimen] = []
    /// Paired once per CHANGE, not per body pass. Read by four computed
    /// properties, each of which the body evaluates — re-pairing per read built
    /// a VisitReviewRow per capture roughly six times per pass.
    @State private var paired: [(specimen: Specimen, row: VisitReviewRow)] = []
    /// The playable segments per capture, stat'ed once per change rather than on
    /// every body pass: `playableSegments` touches the filesystem per row.
    @State private var playable: [UUID: [URL]] = [:]
    #if canImport(UIKit)
    /// Decoded thumbnails, keyed by capture. Filled by the row's own `.task`,
    /// never inside `body`.
    @State private var thumbnails: [UUID: UIImage] = [:]
    #endif
    @State private var startedAt = Date()
    /// Snapshotted on appear: the offered minutes must not tick while she reads.
    @State private var closedAt = Date()
    @State private var player = VoiceSegmentPlayer()
    @State private var playingSpecimenID: UUID?
    /// The standing close record's own state, or nil when there is none. The
    /// button reads THIS rather than a "she tapped" flag: a local insert is not
    /// a send, and saying "Logged." before the row exists is the §3.3 failure.
    @State private var closeState: FieldWriteState?
    @State private var projectID: String?
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
        // A placement landing (S1, presented over this screen) or a transcript
        // finishing while she reads must show. Memoizing at `.onAppear` alone
        // made the rows a snapshot of the moment the screen opened. Every one of
        // those lands as a store save, and the thumbnail cache is keyed by
        // capture, so the decode still never re-runs and never enters `body`.
        .onReceive(NotificationCenter.default.publisher(for: ModelContext.didSave)
            .receive(on: RunLoop.main)) { _ in refreshRows() }
        .onDisappear { player.stop() }
    }

    // MARK: - What the visit produced

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
        let playable = playable[specimen.id] ?? []
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
        ZStack {
            RoundedRectangle(cornerRadius: 6).fill(CaptureColor.paper2)
            #if canImport(UIKit)
            if let image = thumbnails[specimen.id] {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
                    .clipShape(RoundedRectangle(cornerRadius: 6))
            } else {
                micGlyph
            }
            #else
            micGlyph
            #endif
        }
        .frame(width: 40, height: 40)
        .task(id: specimen.id) { await loadThumbnail(specimen) }
    }

    private var micGlyph: some View {
        Image(systemName: "mic.fill")
            .font(CaptureType.footnote)
            .foregroundStyle(CaptureColor.inkSoft)
    }

    /// Decoding a JPEG is not a view's work. Off the main actor, once per
    /// capture, cached for the life of the screen — the same image read that
    /// used to run inside `body`, and therefore on every pass.
    private func loadThumbnail(_ specimen: Specimen) async {
        #if canImport(UIKit)
        guard thumbnails[specimen.id] == nil,
              let photo = specimen.photos.first(where: { $0.isPrimary })
                  ?? specimen.photos.first
        else { return }
        let path = store.mediaURL(for: photo.thumbnailFilename ?? photo.filename).path
        let decoded = await Task.detached(priority: .utility) {
            UIImage(contentsOfFile: path)
        }.value
        guard !Task.isCancelled, let decoded else { return }
        thumbnails[specimen.id] = decoded
        #endif
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
            timeOffer
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

    /// One tap logs the visit as the hours it took. The offer is hidden
    /// entirely when the visit has no project — project_time_entries.project_id
    /// is NOT NULL, so there would be nothing to log it against — and equally
    /// when the close has no owner to be drained under
    /// (`VisitReviewComposer.closeOwnerUserID`).
    @ViewBuilder
    private var timeOffer: some View {
        if let projectID, !projectID.isEmpty, let ownerUserID {
            RouteActionButton(offerLabel, systemImage: "clock", kind: .secondary) {
                logTheHours(projectID: projectID, ownerUserID: ownerUserID)
            }
            .disabled(!VisitReviewComposer.timeOfferEnabled(closeState: closeState))
        }
    }

    /// What is true right now. A record that exists but has not landed is being
    /// logged, not logged; one the server closed for good says so rather than
    /// claiming a send that never happened.
    private var offerLabel: String {
        switch closeState {
        case .none:                     return VisitReviewComposer.timeOffer(
                                                   minutes: summary.elapsedMinutes)
        case .written:                  return "Logged."
        case .refused, .unwritable:     return "These hours didn't log."
        case .pending, .writing, .failed: return "Logging these hours."
        }
    }

    /// `CaptureSessionIdentity` substitutes "anonymous" for a user id it cannot
    /// resolve, and `project_time_entries.user_id` is a NOT NULL uuid — so an
    /// offer taken on that substitute could only ever mint a record that fails.
    /// The sibling write lanes guard the owner id at composition time for the
    /// same reason (LocalCaptureSyncService); this never queues a doomed close.
    private var ownerUserID: UUID? {
        VisitReviewComposer.closeOwnerUserID(
            runsRealServices: AppConfiguration.runsRealServices,
            userID: session.userID,
            workspaceID: session.workspaceID)
    }

    /// The row is written locally and drained later: she is standing in a house
    /// with one bar, and the hours should not depend on her having signal at the
    /// moment she taps. Always a completed entry — never a running timer.
    private func logTheHours(projectID: String, ownerUserID: UUID) {
        // Re-read rather than trust `@State`. SwiftData UPSERTS on
        // `@Attribute(.unique)`: a second insert for this visitID would not
        // throw, it would overwrite the standing row — including the freshly
        // minted timeEntryID — and reset it to pending, which is exactly how one
        // visit ends up as two project_time_entries rows.
        guard standingClose() == nil else {
            // A standing record the offer let her tap again is one still owed a
            // send (pending or backing off), so the tap is a retry, not a
            // second entry.
            closeState = standingClose()?.state
            resumeCloseOutbox()
            return
        }
        store.context.insert(FieldVisitCloseRecord(
            visitID: visitID,
            timeEntryID: UUID(),
            projectID: projectID,
            ownerUserID: ownerUserID.uuidString,
            startedAt: startedAt,
            endedAt: closedAt,
            durationMinutes: summary.elapsedMinutes))
        try? store.save()
        closeState = standingClose()?.state
        resumeCloseOutbox()
    }

    /// The record is durable, but nothing sends it until a drainer runs — and
    /// `RootView` resumes this one once per owner per launch, so without a kick
    /// from here the hours land at the NEXT cold launch rather than now.
    /// `SiteRequestScreens` resumes its own drainer from the feature path for
    /// exactly this reason.
    ///
    /// `.userInitiated`: a `.failed` record is backing off for up to an hour,
    /// and an automatic pass selects nothing at all — which made this tap a
    /// button that looked alive and did nothing. The delay a failure schedules
    /// is unchanged; only her own tap steps over it.
    private func resumeCloseOutbox() {
        Task { @MainActor in
            await visitCloseDrainer?.resume(trigger: .userInitiated)
            closeState = standingClose()?.state
        }
    }

    private func standingClose() -> FieldVisitCloseRecord? {
        let id = visitID
        let descriptor = FetchDescriptor<FieldVisitCloseRecord>(
            predicate: #Predicate { $0.visitID == id })
        return ((try? store.context.fetch(descriptor)) ?? []).first
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
            projectID = context.routing.projectID
        }
        // Re-entering the screen must not offer the hours a second time, and
        // the button says what the standing record actually is.
        closeState = standingClose()?.state
        refreshRows()
    }

    /// Everything derived from the visit's captures. Separate from `load` so a
    /// change can re-run it without also re-stamping `closedAt`, which would
    /// make the offered minutes tick while she reads.
    private func refreshRows() {
        switch localListScope {
        case .globalFixtures:
            specimens = store.session(visitID: visitID)
        case .owner(let owner):
            specimens = store.session(visitID: visitID, owner: owner)
        case .unavailable:
            specimens = []
        }
        // Paired so the screen's grouping uses the same judgement the mapper is
        // tested on, rather than a second opinion about what a note is.
        paired = specimens
            .sorted { $0.createdAt < $1.createdAt }
            .map { ($0, VisitReviewRow(specimen: $0)) }
        // `uniquingKeysWith`, not `uniqueKeysWithValues`: the latter TRAPS on a
        // duplicate id, and the fetch's uniqueness is not this view's to promise.
        playable = Dictionary(
            specimens.map { ($0.id, playableSegments($0)) },
            uniquingKeysWith: { first, _ in first })
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
                coordinator: coordinator, analytics: container.analytics,
                visitCloseDrainer: container.visitCloseOutboxDrainer))
        }
    }
}
