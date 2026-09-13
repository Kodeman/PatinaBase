//  SiteAccessScreen.swift
//  Capture · W5 (the People room, on the job)
//
//  PR3 · The site access card (`screen.PR3.site-access`). Arriving at a locked,
//  unmanned site with one bar is exactly when a designer reaches for a phone,
//  so this screen is read-mostly, fully cached, and orders itself the way the
//  moment does: who to call first, then the way in, the key holder, the hours,
//  receiving, and who was told.
//
//  PR-r: THERE IS NO CODE FIELD, and there is not meant to be one. The card
//  prints that the code is held off Patina and names who to ask. PR-w: studio
//  only — the card says so on its own face.
//
//  One write: "Log who was told", an inline band (never a modal, R-20). With no
//  signal it queues and says so; it never fails silently and never spins.

import SwiftUI
import CaptureKit

// MARK: - Model

@MainActor
@Observable
final class SiteAccessModel {
    let projectID: String
    private let people: any PeopleRoomService
    private let cache: PeopleRoomCache
    private let session: any SessionProviding
    private let analytics: any CaptureAnalytics

    var card: FieldSiteAccessCard?
    var cachedAt: Date?
    var errorMessage: String?
    var queuedNotices: [FieldSiteNoticeDraft] = []
    var noticeOutcome: String?
    var draft = ""
    private var hasLoaded = false

    init(projectID: String, people: any PeopleRoomService, cache: PeopleRoomCache,
         session: any SessionProviding, analytics: any CaptureAnalytics) {
        self.projectID = projectID
        self.people = people
        self.cache = cache
        self.session = session
        self.analytics = analytics
    }

    func appear() async {
        analytics.screen(CaptureScreenID.pr3SiteAccess.rawValue)
        guard !hasLoaded else { return }
        showCachedCopy()
        await load()
    }

    func load() async {
        errorMessage = nil
        let owner = session.ownerIdentity
        do {
            let fresh = try await people.siteAccess(projectID: projectID)
            card = fresh
            cachedAt = nil
            hasLoaded = true
            cache.saveSiteAccess(fresh, owner: owner)
            await cache.drain(projectID: projectID, owner: owner, using: people)
        } catch {
            errorMessage = error.localizedDescription
            showCachedCopy()
        }
        queuedNotices = cache.pendingNotices(projectID: projectID, owner: owner)
    }

    /// The one write. Lands, or queues and says so.
    func logWhoWasTold() async {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        let owner = session.ownerIdentity
        let notice = FieldSiteNoticeDraft(projectID: projectID, what: text)
        do {
            _ = try await people.recordNotice(notice)
            draft = ""
            noticeOutcome = "Written down."
            await load()
        } catch {
            cache.queue(notice, owner: owner)
            queuedNotices = cache.pendingNotices(projectID: projectID, owner: owner)
            draft = ""
            noticeOutcome = "No signal. This note will send when you have some."
        }
    }

    private func showCachedCopy() {
        let owner = session.ownerIdentity
        guard let cached = cache.loadSiteAccess(projectID: projectID, owner: owner) else { return }
        card = cached.value
        cachedAt = cached.storedAt
        hasLoaded = true
    }
}

// MARK: - Screen

struct SiteAccessScreen: View {
    @State private var model: SiteAccessModel
    @State private var isLogging = false

    init(projectID: String, people: any PeopleRoomService, cache: PeopleRoomCache,
         session: any SessionProviding, analytics: any CaptureAnalytics) {
        _model = State(wrappedValue: SiteAccessModel(
            projectID: projectID, people: people, cache: cache,
            session: session, analytics: analytics))
    }

    var body: some View {
        ZStack {
            CaptureColor.paper.ignoresSafeArea()
            content
        }
        .navigationTitle("Site access")
        .navigationBarTitleDisplayMode(.inline)
        .task { await model.appear() }
        .accessibilityIdentifier(CaptureScreenID.pr3SiteAccess.rawValue)
    }

    @ViewBuilder private var content: some View {
        if let message = model.errorMessage, model.card == nil {
            PeopleErrorState(message: message) { await model.load() }
        } else if let card = model.card {
            loaded(card)
        } else {
            ProgressView().tint(CaptureColor.inkSoft)
        }
    }

    private func loaded(_ card: FieldSiteAccessCard) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                head(card)
                callFirst(card)
                wayIn(card)
                keyHolder(card)
                prose("Hours", card.hours, fallback: "No hours on file.")
                prose("Receiving", card.receiving, fallback: "No receiving note on file.")
                whoWasTold(card)
            }
            .padding(20)
        }
        .refreshable { await model.load() }
    }

    private func head(_ card: FieldSiteAccessCard) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(card.projectName)
                .font(CaptureType.title)
                .foregroundStyle(CaptureColor.ink)
            if let address = card.address {
                Text(address)
                    .font(CaptureType.callout)
                    .foregroundStyle(CaptureColor.ink2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Text(FieldSiteAccessRules.studioOnly)
                .font(CaptureType.footnote)
                .foregroundStyle(CaptureColor.inkSoft)
                .fixedSize(horizontal: false, vertical: true)
            if let cachedAt = model.cachedAt {
                PeopleStaleLine(storedAt: cachedAt, pendingWrites: model.queuedNotices.count)
            }
        }
    }

    // MARK: Who to call first

    private func callFirst(_ card: FieldSiteAccessCard) -> some View {
        PeopleSection(title: "Who to call first") {
            if card.callFirst.isEmpty {
                Text("No emergency line on file.")
                    .font(CaptureType.footnote)
                    .foregroundStyle(CaptureColor.inkSoft)
                    .padding(16)
            }
            ForEach(card.callFirst) { contact in
                if contact.id != card.callFirst.first?.id { PeopleDivider() }
                SiteAccessCallLine(contact: contact)
            }
        }
    }

    // MARK: The way in

    private func wayIn(_ card: FieldSiteAccessCard) -> some View {
        PeopleSection(title: "The way in") {
            VStack(alignment: .leading, spacing: 8) {
                Text(card.wayIn)
                    .font(CaptureType.body)
                    .foregroundStyle(CaptureColor.ink)
                    .fixedSize(horizontal: false, vertical: true)
                if let gate = card.gateControl {
                    Text(gate)
                        .font(CaptureType.body)
                        .foregroundStyle(CaptureColor.ink)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityIdentifier("people.wayIn")
        }
    }

    private func keyHolder(_ card: FieldSiteAccessCard) -> some View {
        PeopleSection(title: "Key holder") {
            Text(card.keyHolderLine ?? "No key holder on file.")
                .font(CaptureType.body)
                .foregroundStyle(card.keyHolderLine == nil ? CaptureColor.inkSoft : CaptureColor.ink)
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func prose(_ title: String, _ text: String?, fallback: String) -> some View {
        PeopleSection(title: title) {
            Text(text ?? fallback)
                .font(CaptureType.body)
                .foregroundStyle(text == nil ? CaptureColor.inkSoft : CaptureColor.ink)
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    // MARK: Who was told — the one write

    private func whoWasTold(_ card: FieldSiteAccessCard) -> some View {
        PeopleSection(title: "Who was told") {
            ForEach(card.notices) { notice in
                if notice.id != card.notices.first?.id { PeopleDivider() }
                Text(SiteAccessCopy.line(notice))
                    .font(CaptureType.footnote)
                    .foregroundStyle(CaptureColor.ink2)
                    .padding(16)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .fixedSize(horizontal: false, vertical: true)
            }
            ForEach(model.queuedNotices) { queued in
                PeopleDivider()
                VStack(alignment: .leading, spacing: 4) {
                    Text(queued.what)
                        .font(CaptureType.footnote)
                        .foregroundStyle(CaptureColor.ink2)
                        .fixedSize(horizontal: false, vertical: true)
                    Text("Will send when you have signal.")
                        .font(CaptureType.footnote)
                        .foregroundStyle(CaptureColor.goldenHour)
                }
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            PeopleDivider()
            logBand
        }
    }

    private var logBand: some View {
        VStack(alignment: .leading, spacing: 10) {
            Button(isLogging ? "Never mind" : "Log who was told") {
                isLogging.toggle()
            }
            .font(CaptureType.bodyEmph)
            .foregroundStyle(CaptureColor.verdigris)
            .frame(minHeight: 44)
            .accessibilityIdentifier("people.logWhoWasTold")
            if isLogging {
                Text("WHAT CHANGED AND WHO YOU TOLD")
                    .font(CaptureType.eyebrow)
                    .foregroundStyle(CaptureColor.inkSoft)
                TextEditor(text: $model.draft)
                    .font(CaptureType.body)
                    .frame(minHeight: 88)
                    .overlay(Rectangle().stroke(CaptureColor.line))
                    .accessibilityLabel("What changed and who you told")
                    .accessibilityIdentifier("people.noticeDraft")
                Button("Save this note") {
                    Task {
                        await model.logWhoWasTold()
                        isLogging = false
                    }
                }
                .font(CaptureType.bodyEmph)
                .foregroundStyle(CaptureColor.verdigris)
                .frame(minHeight: 44)
                .accessibilityIdentifier("people.saveNotice")
            }
            if let outcome = model.noticeOutcome {
                Text(outcome)
                    .font(CaptureType.footnote)
                    .foregroundStyle(CaptureColor.inkSoft)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - Pieces

/// R-X: at phone width the WHOLE line is the `tel:` target, at least 44pt tall.
struct SiteAccessCallLine: View {
    let contact: FieldSiteContactLine

    var body: some View {
        if let url = FieldPhoneLine.telURL(e164: contact.phoneE164,
                                           display: contact.phoneDisplay) {
            Link(destination: url) { row }
                .buttonStyle(.plain)
                .accessibilityLabel("Call \(contact.name), \(contact.role)")
                .accessibilityAddTraits(.isButton)
                .accessibilityIdentifier("people.callFirst.\(contact.id)")
        } else {
            row
        }
    }

    private var row: some View {
        HStack(spacing: 10) {
            Text(contact.line)
                .font(CaptureType.body)
                .foregroundStyle(CaptureColor.verdigrisInk)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 8)
            Image(systemName: "phone")
                .font(CaptureType.footnote)
                .foregroundStyle(CaptureColor.verdigrisInk)
                .accessibilityHidden(true)
        }
        .padding(.horizontal, 16)
        .frame(minHeight: 44)
        .contentShape(Rectangle())
    }
}

enum SiteAccessCopy {
    /// "Lockbox changed to version 3. 16 October 2026, by Priya Natarajan.
    ///  Told: Luis Ochoa, Ngozi Eze."
    static func line(_ notice: FieldSiteNotice) -> String {
        var parts = ["\(notice.what) \(FieldPeopleDates.long(notice.when))"]
        if let by = notice.by { parts.append("by \(by)") }
        var line = parts.joined(separator: ", ") + "."
        if !notice.toldNames.isEmpty {
            line += " Told: \(notice.toldNames.joined(separator: ", "))."
        }
        return line
    }
}

#if DEBUG
import CaptureKitMocks

#Preview("Site access") {
    NavigationStack {
        SiteAccessScreen(
            projectID: PeopleRoomFixtures.projectID,
            people: MockPeopleRoomService(),
            cache: PeopleRoomCache(directory: FileManager.default.temporaryDirectory
                .appendingPathComponent("people-room-preview", isDirectory: true)),
            session: MockSessionProviding(),
            analytics: MockCaptureAnalytics())
    }
}
#endif
