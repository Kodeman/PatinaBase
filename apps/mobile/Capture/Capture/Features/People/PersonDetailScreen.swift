//  PersonDetailScreen.swift
//  Capture · W5 (the People room, on the job)
//
//  PR2 · A person, opened from a roster row (`screen.PR2.person`). Identity,
//  channels with tap-to-call and tap-to-text where the consent record allows,
//  the contact rule, the seats they hold, and authority.
//
//  PR-t is the shape of the Authority region: the yes or the no, in words. The
//  figure lives on the desk, where nobody is reading over the designer's
//  shoulder on a job site — `FieldAuthorityWords.phoneSafe` is what keeps one
//  from arriving here through a free-text grant.
//
//  Read-only. Editing a rule, a document or an authority grant belongs to the
//  desk (ux-4-field-mobile §5).

import SwiftUI
import CaptureKit

// MARK: - Model

@MainActor
@Observable
final class PersonDetailModel {
    private let projectID: String
    private let personID: String
    private let people: any PeopleRoomService
    private let analytics: any CaptureAnalytics

    var card: FieldPersonCard?
    var isLoading = false
    var errorMessage: String?
    private var hasLoaded = false

    init(projectID: String, personID: String, people: any PeopleRoomService,
         analytics: any CaptureAnalytics) {
        self.projectID = projectID
        self.personID = personID
        self.people = people
        self.analytics = analytics
    }

    func appear() async {
        analytics.screen(CaptureScreenID.pr2Person.rawValue)
        guard !hasLoaded else { return }
        await load()
    }

    func load() async {
        isLoading = true
        errorMessage = nil
        do {
            card = try await people.person(projectID: projectID, personID: personID)
            hasLoaded = true
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }
}

// MARK: - Screen

struct PersonDetailScreen: View {
    @State private var model: PersonDetailModel

    init(projectID: String, personID: String, people: any PeopleRoomService,
         analytics: any CaptureAnalytics) {
        _model = State(wrappedValue: PersonDetailModel(
            projectID: projectID, personID: personID, people: people, analytics: analytics))
    }

    var body: some View {
        ZStack {
            CaptureColor.paper.ignoresSafeArea()
            content
        }
        .navigationTitle(model.card?.name ?? "Person")
        .navigationBarTitleDisplayMode(.inline)
        .task { await model.appear() }
        .accessibilityIdentifier(CaptureScreenID.pr2Person.rawValue)
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

    private func loaded(_ card: FieldPersonCard) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                header(card)
                channels(card)
                rule(card)
                seats(card)
                authority(card)
            }
            .padding(20)
        }
        .refreshable { await model.load() }
    }

    // MARK: Identity

    private func header(_ card: FieldPersonCard) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(card.name)
                .font(CaptureType.title)
                .foregroundStyle(CaptureColor.ink)
                .fixedSize(horizontal: false, vertical: true)
            if let line = [card.firmName, card.roleAtFirm].compactMap({ $0 })
                .filter({ !$0.isEmpty }).joined(separator: " · ").nonEmpty {
                Text(line)
                    .font(CaptureType.callout)
                    .foregroundStyle(CaptureColor.inkSoft)
            }
            HStack(spacing: 10) {
                PeopleWordLabel(word: card.reachWord)
                if let consent = card.consentWord { PeopleWordLabel(word: consent) }
                if let paper = card.paperWord { PeopleWordLabel(word: paper) }
            }
            if let said = card.consentSentence {
                Text(said)
                    .font(CaptureType.footnote)
                    .foregroundStyle(CaptureColor.inkSoft)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    // MARK: Channels

    private func channels(_ card: FieldPersonCard) -> some View {
        PeopleSection(title: "Channels") {
            if card.channels.isEmpty {
                Text("Nothing on file yet. Add a phone or email to reach them.")
                    .font(CaptureType.footnote)
                    .foregroundStyle(CaptureColor.inkSoft)
                    .padding(16)
            }
            ForEach(card.channels) { channel in
                if channel.id != card.channels.first?.id { PeopleDivider() }
                PersonChannelRow(channel: channel, blocked: card.contactRuleBlocks)
            }
        }
    }

    // MARK: The rule

    private func rule(_ card: FieldPersonCard) -> some View {
        PeopleSection(title: "Contact rule") {
            VStack(alignment: .leading, spacing: 8) {
                if let rule = card.contactRule {
                    PeopleClause(text: rule, blocks: card.contactRuleBlocks,
                                 routedTo: card.routeToName)
                } else {
                    Text("No contact rule on file.")
                        .font(CaptureType.footnote)
                        .foregroundStyle(CaptureColor.inkSoft)
                }
            }
            .padding(16)
        }
    }

    // MARK: Seats

    private func seats(_ card: FieldPersonCard) -> some View {
        PeopleSection(title: "Seats") {
            if card.seats.isEmpty {
                Text("No open seat on this project.")
                    .font(CaptureType.footnote)
                    .foregroundStyle(CaptureColor.inkSoft)
                    .padding(16)
            }
            ForEach(card.seats) { seat in
                if seat.id != card.seats.first?.id { PeopleDivider() }
                VStack(alignment: .leading, spacing: 4) {
                    Text(seat.projectName)
                        .font(CaptureType.body)
                        .foregroundStyle(CaptureColor.ink)
                    Text(seat.words)
                        .font(CaptureType.footnote)
                        .foregroundStyle(CaptureColor.inkSoft)
                        .fixedSize(horizontal: false, vertical: true)
                    if let stage = seat.stageWord { PeopleWordLabel(word: stage) }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(16)
                .accessibilityElement(children: .combine)
            }
        }
    }

    // MARK: Authority (PR-t)

    private func authority(_ card: FieldPersonCard) -> some View {
        PeopleSection(title: "Authority on this job") {
            VStack(alignment: .leading, spacing: 6) {
                if card.authorityWords.isEmpty {
                    Text(FieldAuthorityWords.none)
                        .font(CaptureType.footnote)
                        .foregroundStyle(CaptureColor.inkSoft)
                } else {
                    PeoplePlainWords(words: card.authorityWords)
                }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityIdentifier("people.authority")
        }
    }
}

// MARK: - One channel

/// A phone dials; an email opens a letter. A text is offered only where the
/// consent record says the number may be texted — the record is the gate
/// (R-AY), so a channel with no word offers no text.
struct PersonChannelRow: View {
    let channel: FieldPersonChannel
    let blocked: Bool

    private var mayText: Bool {
        channel.isPhone && channel.consentWord == "Texting" && !blocked
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                Text(channel.kind)
                    .font(CaptureType.eyebrow)
                    .textCase(.uppercase)
                    .foregroundStyle(CaptureColor.inkSoft)
                if channel.preferred {
                    Text("preferred")
                        .font(CaptureType.footnote)
                        .foregroundStyle(CaptureColor.inkSoft)
                }
                Spacer(minLength: 8)
                if let word = channel.consentWord { PeopleWordLabel(word: word) }
            }
            .padding(.horizontal, 16)
            if channel.isPhone {
                PeopleTelLine(display: channel.value, e164: nil,
                              identifier: "people.channel.\(channel.id)")
                if mayText, let url = textURL {
                    Link("Text them", destination: url)
                        .font(CaptureType.callout)
                        .foregroundStyle(CaptureColor.verdigrisInk)
                        .padding(.horizontal, 16)
                        .frame(minHeight: 44)
                        .accessibilityIdentifier("people.text.\(channel.id)")
                }
            } else {
                Text(channel.value)
                    .font(CaptureType.body)
                    .foregroundStyle(CaptureColor.ink)
                    .padding(.horizontal, 16)
                    .frame(minHeight: 44)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let held = channel.heldReason {
                PeopleClause(text: held, blocks: true)
                    .padding(.horizontal, 16)
            }
        }
        .padding(.vertical, 10)
    }

    private var textURL: URL? {
        guard let number = FieldPhoneLine.dialable(display: channel.value) else { return nil }
        return URL(string: "sms:\(number)")
    }
}

private extension String {
    var nonEmpty: String? { isEmpty ? nil : self }
}

#if DEBUG
import CaptureKitMocks

#Preview("Person") {
    NavigationStack {
        PersonDetailScreen(
            projectID: PeopleRoomFixtures.projectID,
            personID: PeopleRoomFixtures.personID,
            people: MockPeopleRoomService(),
            analytics: MockCaptureAnalytics())
    }
}
#endif
