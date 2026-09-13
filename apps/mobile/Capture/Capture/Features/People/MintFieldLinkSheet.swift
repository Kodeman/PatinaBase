//  MintFieldLinkSheet.swift
//  Capture · W5 (the People room, on the job)
//
//  PR-s · A framer's second turns up unannounced. The designer, in her own
//  session, puts him on the roster and hands him a link — the person card and
//  the seat are made at the same moment, and the link's end date is the job's,
//  in words (PR-d).
//
//  This is a studio-staff write, never a trade-facing door: the seat it makes
//  carries no login, and the link it mints opens the Call Sheet and the site
//  access card and nothing else.

import SwiftUI
import CaptureKit

struct MintFieldLinkSheet: View {
    let projectID: String
    let people: any PeopleRoomService
    let onMinted: () -> Void
    /// No signal is not a failure: the mint is handed to the roster's queue and
    /// retried on the next load that reaches the studio, and the link it makes
    /// is printed there (ux-4-field-mobile §6.4).
    let onQueued: (FieldLinkMintDraft) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var fullName = ""
    @State private var firmName = ""
    @State private var trade = ""
    @State private var phone = ""
    @State private var partyKind = "sub"
    @State private var minted: FieldLinkMint?
    @State private var errorMessage: String?
    @State private var isWorking = false

    private let kinds = ["sub", "installer", "receiver", "gc", "other"]

    var body: some View {
        NavigationStack {
            ZStack {
                CaptureColor.paper.ignoresSafeArea()
                if let minted {
                    result(minted)
                } else {
                    form
                }
            }
            .navigationTitle("Met on site")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
            }
        }
    }

    // MARK: The form

    private var form: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                field("FULL NAME", text: $fullName, identifier: "people.mint.name")
                field("COMPANY", text: $firmName, identifier: "people.mint.firm")
                field("TRADE", text: $trade, identifier: "people.mint.trade")
                field("MOBILE", text: $phone, identifier: "people.mint.phone")
                kindPicker
                Text("This puts them on the roster and opens the Call Sheet and the "
                     + "site access card for the job's window. It never opens billing "
                     + "or the agreement.")
                    .font(CaptureType.footnote)
                    .foregroundStyle(CaptureColor.inkSoft)
                    .fixedSize(horizontal: false, vertical: true)
                if let errorMessage {
                    Text(errorMessage)
                        .font(CaptureType.footnote)
                        .foregroundStyle(CaptureColor.terracotta)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Button("Add them and mint a link") { Task { await mint() } }
                    .font(CaptureType.bodyEmph)
                    .foregroundStyle(CaptureColor.verdigris)
                    .frame(minHeight: 44)
                    .disabled(fullName.trimmingCharacters(in: .whitespaces).isEmpty || isWorking)
                    .accessibilityIdentifier("people.mint.submit")
            }
            .padding(20)
        }
    }

    private func field(_ label: String, text: Binding<String>, identifier: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(CaptureType.eyebrow)
                .foregroundStyle(CaptureColor.inkSoft)
            TextField("", text: text)
                .font(CaptureType.body)
                .textFieldStyle(.plain)
                .padding(12)
                .frame(minHeight: 44)
                .overlay(Rectangle().stroke(CaptureColor.line))
                .accessibilityLabel(label.capitalized)
                .accessibilityIdentifier(identifier)
        }
    }

    private var kindPicker: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("WHAT THEY ARE HERE FOR")
                .font(CaptureType.eyebrow)
                .foregroundStyle(CaptureColor.inkSoft)
            Picker("What they are here for", selection: $partyKind) {
                ForEach(kinds, id: \.self) { Text($0).tag($0) }
            }
            .pickerStyle(.segmented)
            .accessibilityIdentifier("people.mint.kind")
        }
    }

    // MARK: The link

    private func result(_ mint: FieldLinkMint) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("\(fullName) is on the roster.")
                    .font(CaptureType.title)
                    .foregroundStyle(CaptureColor.ink)
                    .fixedSize(horizontal: false, vertical: true)
                Text(mint.expirySentence)
                    .font(CaptureType.body)
                    .foregroundStyle(CaptureColor.ink2)
                    .fixedSize(horizontal: false, vertical: true)
                Text(mint.url)
                    .font(CaptureType.monoSmall)
                    .foregroundStyle(CaptureColor.ink)
                    .textSelection(.enabled)
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .overlay(Rectangle().stroke(CaptureColor.line))
                    .accessibilityIdentifier("people.mint.link")
                HStack(spacing: 16) {
                    Button("Copy the link") { UIPasteboard.general.string = mint.url }
                        .font(CaptureType.bodyEmph)
                        .foregroundStyle(CaptureColor.verdigris)
                        .frame(minHeight: 44)
                        .accessibilityIdentifier("people.mint.copy")
                    ShareLink(item: mint.url) { Text("Share it") }
                        .font(CaptureType.bodyEmph)
                        .foregroundStyle(CaptureColor.verdigris)
                        .frame(minHeight: 44)
                }
                Button("Done") {
                    onMinted()
                    dismiss()
                }
                .font(CaptureType.bodyEmph)
                .foregroundStyle(CaptureColor.verdigrisInk)
                .frame(minHeight: 44)
            }
            .padding(20)
        }
    }

    private func mint() async {
        isWorking = true
        errorMessage = nil
        let request = FieldLinkMintRequest(
            projectID: projectID,
            fullName: fullName.trimmingCharacters(in: .whitespaces),
            firmName: firmName.nilWhenBlank,
            trade: trade.nilWhenBlank,
            partyKind: partyKind,
            phone: phone.nilWhenBlank)
        do {
            minted = try await people.mintFieldLink(request)
        } catch {
            onQueued(FieldLinkMintDraft(request: request))
            errorMessage = "That did not land: \(error.localizedDescription) "
                + "\(request.fullName) is queued — the link will be minted when the "
                + "studio is reachable again, and it will be waiting on the call sheet."
        }
        isWorking = false
    }
}

private extension String {
    var nilWhenBlank: String? {
        let trimmed = trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}

#if DEBUG
import CaptureKitMocks

#Preview("Mint a field link") {
    MintFieldLinkSheet(projectID: PeopleRoomFixtures.projectID,
                       people: MockPeopleRoomService(),
                       onMinted: {},
                       onQueued: { _ in })
}
#endif
