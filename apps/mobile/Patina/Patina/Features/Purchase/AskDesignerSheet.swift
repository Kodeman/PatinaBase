//
//  AskDesignerSheet.swift
//  Patina
//
//  M7 — Path B. The client shops *with* the designer instead of around her.
//
//  The thread is the one they already share: `DesignerThreadOpener` picks the
//  project thread where a project exists and the direct thread where the
//  relationship is only a claimed lead, and both RPCs are idempotent, so this
//  sheet adds a message to one conversation rather than minting an inbox item
//  per piece (D2's test).
//
//  Nothing sends without a tap, and the message is the reader's to rewrite.
//

import SwiftUI

struct AskDesignerSheet: View {

    let product: Product
    let designerFirstName: String?
    /// The room the piece screen was opened from, where there was one. The
    /// picker in M7 is a room *chooser*; the app's rooms are local, so the
    /// sheet shows the room it is already in and offers no false choice
    /// between rooms it cannot scope the request to.
    let roomName: String?

    @Environment(\.dismiss) private var dismiss

    @State private var message: String = ""
    @State private var isSending = false
    @State private var failure: MoneyFailure?
    @State private var didSend = false

    private var who: String { designerFirstName ?? "your designer" }

    var body: some View {
        VStack(spacing: 0) {
            handle
            header
            ScrollView(showsIndicators: false) { editor }
            footer
        }
        .frame(maxWidth: .infinity)
        .background(PatinaColors.Background.primary)
        .presentationDetents([.medium, .large])
        .task {
            if message.isEmpty {
                message = AskComposer.defaultMessage(product: product, roomName: roomName)
            }
        }
    }

    private var handle: some View {
        RoundedRectangle(cornerRadius: 2)
            .fill(PatinaColors.Text.muted.opacity(0.25))
            .frame(width: 36, height: 4)
            .padding(.top, 18)
            .padding(.bottom, 14)
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(designerFirstName.map { "Ask \($0)" } ?? "Ask your designer")
                .font(PatinaTypography.h5)
                .foregroundStyle(PatinaColors.Text.primary)
            MonoLabel(text: product.name, size: PatinaTypography.monoSmall)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 24)
        .padding(.bottom, 14)
    }

    private var editor: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                thumbnail
                MonoLabel(
                    text: [product.resolvedMakerName, priceText].compactMap { $0 }
                        .joined(separator: " · ")
                )
                Spacer(minLength: 0)
            }

            if let roomName {
                HStack {
                    MonoLabel(text: "For", size: PatinaTypography.monoSmall)
                    Text(roomName)
                        .font(PatinaTypography.body)
                        .foregroundStyle(PatinaColors.Text.primary)
                    Spacer(minLength: 0)
                }
                .padding(14)
                .background(PatinaColors.Background.secondary)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            }

            TextEditor(text: $message)
                .font(PatinaTypography.body)
                .foregroundStyle(PatinaColors.Text.primary)
                .scrollContentBackground(.hidden)
                .frame(minHeight: 84)
                .padding(10)
                .background(PatinaColors.Background.secondary)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                .accessibilityIdentifier("AskDesignerSheet.Message")
        }
        .padding(.horizontal, 24)
        .padding(.bottom, 12)
    }

    @ViewBuilder
    private var thumbnail: some View {
        if let imageURL = product.imageURL, let url = URL(string: imageURL) {
            PatinaAsyncImage(url: url)
                .frame(width: 56, height: 56)
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        } else {
            product.placeholderGradient
                .frame(width: 56, height: 56)
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        }
    }

    private var priceText: String? {
        product.priceCents > 0 ? PatinaCurrency.format(cents: product.priceCents) : nil
    }

    private var footer: some View {
        VStack(spacing: 8) {
            if let failure {
                VStack(alignment: .leading, spacing: 8) {
                    Text(failure.sentence)
                        .font(PatinaTypography.bodySmall)
                        .foregroundStyle(PatinaColors.Text.error)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityIdentifier("AskDesignerSheet.Failure")
            }

            PatinaButton(
                didSend ? "Sent" : "Send to \(who)",
                style: .primary,
                isLoading: isSending,
                isEnabled: !didSend
            ) {
                Task { await send() }
            }
            .accessibilityIdentifier("AskDesignerSheet.Send")

            Text(Self.caption(firstName: designerFirstName, hasRoom: roomName != nil, sent: didSend))
                .font(PatinaTypography.caption)
                .foregroundStyle(PatinaColors.Text.muted)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("AskDesignerSheet.Caption")
        }
        .padding(.horizontal, 24)
        .padding(.top, 12)
        .padding(.bottom, 30)
    }

    /// M7's caption names the three things the message carries. It may only
    /// name the room when there IS one: the walk caught it promising
    /// "the piece, the price and the room" to a client with no rooms at all,
    /// over a message that carried two of the three (C5).
    ///
    /// The app knows the designer's name and does not know their gender, so
    /// the caption uses the name it has (the mock's "She'll" was written for
    /// one designer, not for every one of them).
    static func caption(firstName: String?, hasRoom: Bool, sent: Bool) -> String {
        let who = (firstName?.isEmpty == false) ? firstName! : "Your designer"
        let verb = sent ? "has" : "will see"
        let what = hasRoom ? "the piece, the price and the room" : "the piece and the price"
        return "\(who) \(verb) \(what)."
    }

    private func send() async {
        guard !isSending, !didSend else { return }
        isSending = true
        failure = nil
        let relationship = DesignerThreadOpener.currentRelationship
        do {
            guard let threadId = try await DesignerThreadOpener.openThread(with: relationship) else {
                // No thread can exist for this relationship. The act should
                // not have drawn; say so plainly rather than pretending.
                failure = MoneyFailure(
                    "We couldn't reach your designer. Nothing has been sent.",
                    offersDesignerMessage: false
                )
                isSending = false
                return
            }
            _ = try await MessagingAPIClient.shared.sendMessage(
                threadId: threadId,
                body: AskComposer.body(message: message, product: product, roomName: roomName)
            )
            didSend = true
            PostHogService.shared.capture("ask_designer_sent", properties: [
                "has_room": roomName != nil,
                "product_id": product.id
            ])
            HapticManager.shared.notification(.success)
        } catch {
            MoneyFailureCopy.log("ask-designer", error)
            failure = MoneyFailure(
                "We couldn't send that. Your designer hasn't seen it yet.",
                offersDesignerMessage: false
            )
        }
        isSending = false
    }
}
