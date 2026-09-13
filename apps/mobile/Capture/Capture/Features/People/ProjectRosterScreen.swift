//  ProjectRosterScreen.swift
//  Capture · W5 (the People room, on the job)
//
//  PR1 · The project roster (`screen.PR1.roster`). Everyone on THIS job, in four
//  bands — this week, later, bidding, done — with the site access card at the
//  head and one act: mint a field link for somebody met on site (PR-s).
//
//  Scope is the ruling, not an omission (ux-4-field-mobile §5): there is no
//  studio-wide Directory here, no compliance upload, no authority editing, and
//  no trade-facing surface. Field's job is the job in front of the designer.
//
//  Offline: the last good copy renders immediately with a "Last loaded …" line;
//  a refresh that cannot reach the studio leaves the copy standing and says so,
//  and a mint asked for with no signal is queued, retried on the next load that
//  reaches the studio, and its link printed here when it lands.

import SwiftUI
import CaptureKit

// MARK: - Model

@MainActor
@Observable
final class ProjectRosterModel {
    let projectID: String
    private let people: any PeopleRoomService
    private let cache: PeopleRoomCache
    private let session: any SessionProviding
    private let analytics: any CaptureAnalytics

    var roster: FieldProjectRoster?
    /// Set when what is on screen came off disk rather than the studio.
    var cachedAt: Date?
    var isLoading = false
    var errorMessage: String?
    var pendingNotices = 0
    /// Mints owed because there was no signal when they were asked for.
    var pendingMints = 0
    /// Queued mints that landed on a later load — the roster prints each link,
    /// because a link nobody sees is a link nobody handed on.
    var mintedOffline: [FieldLinkMintReceipt] = []
    private var hasLoaded = false

    init(projectID: String, people: any PeopleRoomService, cache: PeopleRoomCache,
         session: any SessionProviding, analytics: any CaptureAnalytics) {
        self.projectID = projectID
        self.people = people
        self.cache = cache
        self.session = session
        self.analytics = analytics
    }

    var bands: [(band: FieldRosterBand, seats: [FieldRosterSeat])] {
        guard let roster else { return [] }
        return FieldRosterGrouping.grouped(
            roster.seats, week: FieldRosterWeek.containing(roster.asOf))
    }

    /// "12 on the job this week · 5 reachable by text · 4 with accounts · 2 on paper"
    var vitals: String? {
        let week = bands.first { $0.band == .thisWeek }?.seats ?? []
        guard !week.isEmpty else { return nil }
        let texting = week.filter { $0.consentWord == "Texting" }.count
        let accounts = week.filter { $0.reachWord == "Account" }.count
        let onPaper = week.filter { $0.reachWord == "On paper" }.count
        return "\(week.count) on the job this week · \(texting) reachable by text "
            + "· \(accounts) with accounts · \(onPaper) on paper"
    }

    func appear() async {
        analytics.screen(CaptureScreenID.pr1Roster.rawValue)
        guard !hasLoaded else { return }
        showCachedCopy()
        await load()
    }

    func load() async {
        isLoading = true
        errorMessage = nil
        let owner = session.ownerIdentity
        do {
            let fresh = try await people.roster(projectID: projectID)
            roster = fresh
            cachedAt = nil
            hasLoaded = true
            cache.saveRoster(fresh, owner: owner)
            await cache.drain(projectID: projectID, owner: owner, using: people)
            await drainMints(owner: owner)
        } catch {
            errorMessage = error.localizedDescription
            showCachedCopy()
        }
        pendingNotices = cache.pendingNotices(projectID: projectID, owner: owner).count
        pendingMints = cache.pendingMints(projectID: projectID, owner: owner).count
        isLoading = false
    }

    /// A mint asked for with no signal, kept and made good.
    func queueMint(_ draft: FieldLinkMintDraft) {
        let owner = session.ownerIdentity
        cache.queueMint(draft, owner: owner)
        pendingMints = cache.pendingMints(projectID: projectID, owner: owner).count
    }

    private func drainMints(owner: CaptureOwnerIdentity?) async {
        let landed = await cache.drainMints(projectID: projectID, owner: owner, using: people)
        guard !landed.isEmpty else { return }
        let known = Set(mintedOffline.map(\.id))
        mintedOffline += landed.filter { !known.contains($0.id) }
    }

    private func showCachedCopy() {
        let owner = session.ownerIdentity
        guard let cached = cache.loadRoster(projectID: projectID, owner: owner) else { return }
        roster = cached.value
        cachedAt = cached.storedAt
        hasLoaded = true
    }
}

// MARK: - Screen

struct ProjectRosterScreen: View {
    @State private var model: ProjectRosterModel
    @State private var isMinting = false
    let coordinator: CaptureCoordinator
    private let people: any PeopleRoomService

    init(projectID: String, people: any PeopleRoomService, cache: PeopleRoomCache,
         session: any SessionProviding, analytics: any CaptureAnalytics,
         coordinator: CaptureCoordinator) {
        _model = State(wrappedValue: ProjectRosterModel(
            projectID: projectID, people: people, cache: cache,
            session: session, analytics: analytics))
        self.coordinator = coordinator
        self.people = people
    }

    var body: some View {
        ZStack {
            CaptureColor.paper.ignoresSafeArea()
            content
        }
        .navigationTitle("Call sheet")
        .navigationBarTitleDisplayMode(.inline)
        .task { await model.appear() }
        .sheet(isPresented: $isMinting) {
            MintFieldLinkSheet(projectID: model.projectID, people: people,
                               onMinted: { Task { await model.load() } },
                               onQueued: { model.queueMint($0) })
        }
        .accessibilityIdentifier(CaptureScreenID.pr1Roster.rawValue)
    }

    @ViewBuilder private var content: some View {
        if let message = model.errorMessage, model.roster == nil {
            PeopleErrorState(message: message) { await model.load() }
        } else if let roster = model.roster {
            loaded(roster)
        } else {
            ProgressView().tint(CaptureColor.inkSoft)
        }
    }

    private func loaded(_ roster: FieldProjectRoster) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                head(roster)
                if !model.mintedOffline.isEmpty { mintedLinks }
                ForEach(model.bands, id: \.band) { band in
                    PeopleSection(title: band.band.heading) {
                        ForEach(band.seats) { seat in
                            if seat.id != band.seats.first?.id { PeopleDivider() }
                            RosterRow(seat: seat) { open(seat) }
                        }
                    }
                }
                mintAct
            }
            .padding(20)
        }
        .refreshable { await model.load() }
    }

    private func head(_ roster: FieldProjectRoster) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(roster.projectName)
                .font(CaptureType.title)
                .foregroundStyle(CaptureColor.ink)
            if let line = roster.siteHeadLine {
                Text(line)
                    .font(CaptureType.callout)
                    .foregroundStyle(CaptureColor.ink2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Button {
                coordinator.navigate(to: .people(screen: .pr3SiteAccess,
                                                 projectID: model.projectID, personID: nil))
            } label: {
                HStack {
                    Image(systemName: "key")
                    Text("Open the site access card")
                    Spacer()
                    Image(systemName: "chevron.right")
                }
            }
            .font(CaptureType.bodyEmph)
            .foregroundStyle(CaptureColor.verdigrisInk)
            .padding(16)
            .frame(minHeight: 44)
            .background(CaptureColor.paper3)
            .overlay(Rectangle().stroke(CaptureColor.line))
            .accessibilityIdentifier("people.openSiteAccess")
            if let vitals = model.vitals {
                Text(vitals)
                    .font(CaptureType.footnote)
                    .foregroundStyle(CaptureColor.inkSoft)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let cachedAt = model.cachedAt {
                PeopleStaleLine(storedAt: cachedAt, pendingWrites: model.pendingNotices)
            }
            if model.pendingMints > 0 {
                Text(model.pendingMints == 1
                     ? "1 link will be minted when you have signal."
                     : "\(model.pendingMints) links will be minted when you have signal.")
                    .font(CaptureType.footnote)
                    .foregroundStyle(CaptureColor.goldenHour)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("people.pendingMints")
            }
        }
    }

    /// What a queued mint turned into once there was signal. It stands on the
    /// roster until the screen is left, so the link can still be copied.
    private var mintedLinks: some View {
        PeopleSection(title: "Links that came through") {
            ForEach(model.mintedOffline) { receipt in
                if receipt.id != model.mintedOffline.first?.id { PeopleDivider() }
                mintedLink(receipt)
            }
        }
    }

    private func mintedLink(_ receipt: FieldLinkMintReceipt) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("\(receipt.name) is on the roster.")
                .font(CaptureType.bodyEmph)
                .foregroundStyle(CaptureColor.ink)
                .fixedSize(horizontal: false, vertical: true)
            Text(receipt.mint.expirySentence)
                .font(CaptureType.footnote)
                .foregroundStyle(CaptureColor.ink2)
                .fixedSize(horizontal: false, vertical: true)
            Text(receipt.mint.url)
                .font(CaptureType.monoSmall)
                .foregroundStyle(CaptureColor.ink)
                .textSelection(.enabled)
                .fixedSize(horizontal: false, vertical: true)
            Button("Copy the link") { UIPasteboard.general.string = receipt.mint.url }
                .font(CaptureType.bodyEmph)
                .foregroundStyle(CaptureColor.verdigris)
                .frame(minHeight: 44)
                .accessibilityIdentifier("people.mintedLink.\(receipt.id)")
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var mintAct: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Somebody turned up who is not on the sheet — a framer's second, "
                 + "a delivery driver. Put them on it and hand them a link.")
                .font(CaptureType.footnote)
                .foregroundStyle(CaptureColor.inkSoft)
                .fixedSize(horizontal: false, vertical: true)
            Button("Add someone met on site") { isMinting = true }
                .font(CaptureType.bodyEmph)
                .foregroundStyle(CaptureColor.verdigris)
                .frame(minHeight: 44)
                .accessibilityIdentifier("people.mintLink")
        }
        .padding(.horizontal, 4)
    }

    private func open(_ seat: FieldRosterSeat) {
        guard let personID = seat.personID else { return }
        coordinator.navigate(to: .people(screen: .pr2Person,
                                         projectID: model.projectID, personID: personID))
    }
}

// MARK: - One row

/// Name, firm and trade, the reach word, the phone as its own target, and the
/// stage word. The rule clause and the opted-out note print on the collapsed
/// row, not inside an unfold (R-S, R-T).
struct RosterRow: View {
    let seat: FieldRosterSeat
    let open: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button(action: open) { identity }
                .buttonStyle(.plain)
                .disabled(seat.personID == nil)
                .accessibilityIdentifier("people.seat.\(seat.id)")
            PeopleTelLine(display: seat.phoneDisplay, e164: seat.phoneE164,
                          words: [seat.reachWord, seat.stageWord].compactMap { $0 },
                          identifier: "people.tel.\(seat.id)")
        }
        .padding(.vertical, 12)
    }

    private var identity: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(seat.displayName)
                .font(CaptureType.bodyEmph)
                .foregroundStyle(CaptureColor.ink)
                .fixedSize(horizontal: false, vertical: true)
            if !seat.subLine.isEmpty {
                Text(seat.subLine)
                    .font(CaptureType.footnote)
                    .foregroundStyle(CaptureColor.inkSoft)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let held = seat.heldClause {
                PeopleClause(text: held, blocks: true)
            }
            if let rule = seat.contactRule {
                PeopleClause(text: rule, blocks: seat.contactRuleBlocks,
                             routedTo: seat.routeToName)
            }
            if let note = seat.optedOutNote {
                PeopleClause(text: note)
            }
            if let bid = seat.bidNote {
                Text(bid)
                    .font(CaptureType.footnote)
                    .foregroundStyle(CaptureColor.inkSoft)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let from = seat.onSiteFrom, seat.offJobAt == nil {
                Text("Starts \(FieldPeopleDates.short(from))")
                    .font(CaptureType.footnote)
                    .foregroundStyle(CaptureColor.inkSoft)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 16)
        .contentShape(Rectangle())
    }
}

// MARK: - Failure

struct PeopleErrorState: View {
    let message: String
    let retry: () async -> Void

    var body: some View {
        VStack(spacing: 12) {
            Text("Couldn't reach the studio")
                .font(CaptureType.bodyEmph)
                .foregroundStyle(CaptureColor.ink)
            Text(message)
                .font(CaptureType.footnote)
                .foregroundStyle(CaptureColor.inkSoft)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 24)
            Button("Try again") { Task { await retry() } }
                .font(CaptureType.callout.weight(.semibold))
                .foregroundStyle(CaptureColor.verdigris)
                .frame(minHeight: 44)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(24)
    }
}

#if DEBUG
import CaptureKitMocks

#Preview("Project roster") {
    NavigationStack {
        ProjectRosterScreen(
            projectID: PeopleRoomFixtures.projectID,
            people: MockPeopleRoomService(),
            cache: PeopleRoomCache(directory: FileManager.default.temporaryDirectory
                .appendingPathComponent("people-room-preview", isDirectory: true)),
            session: MockSessionProviding(),
            analytics: MockCaptureAnalytics(),
            coordinator: CaptureCoordinator())
    }
}
#endif
