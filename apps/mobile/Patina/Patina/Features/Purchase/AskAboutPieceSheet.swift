//
//  AskAboutPieceSheet.swift
//  Patina
//
//  Path C — "Ask about this piece". The act a piece falls to when the gate
//  refuses, when the price is null, or when Buy is not on.
//
//  Where the client has a live designer the question belongs in her thread and
//  `AskDesignerSheet` is the sheet that draws; this one is the no-designer
//  half, and it writes to the leads rail. `submit_design_request` carries the
//  piece's own uuid as its idempotency key, so a second tap on the same piece
//  replays the same lead and never writes a second one — the duplicate-lead
//  failure SP-07 exists to close, held shut by a unique index rather than by
//  the app remembering.
//

import SwiftUI

struct AskAboutPieceSheet: View {

    let product: Product
    let roomName: String?
    /// The gate's sentence, where the gate is why this sheet is open. Printed
    /// so the reader knows what the app does not know about the piece.
    let reason: String?

    @Environment(\.dismiss) private var dismiss

    @State private var message: String = ""
    @State private var isSending = false
    @State private var failure: MoneyFailure?
    @State private var outcome: Outcome?

    private enum Outcome: Equatable {
        case sent
        /// The RPC replayed an existing lead — this piece has already been
        /// asked about. Saying so is more honest than a second "Sent".
        case alreadyAsked
    }

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
                message = AskComposer.defaultQuestion(product: product)
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
            Text("Ask about this piece")
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
            if let reason {
                Text(reason)
                    .font(PatinaTypography.bodySmall)
                    .foregroundStyle(PatinaColors.Text.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("AskAboutPieceSheet.Reason")
            }

            TextEditor(text: $message)
                .font(PatinaTypography.body)
                .foregroundStyle(PatinaColors.Text.primary)
                .scrollContentBackground(.hidden)
                .frame(minHeight: 84)
                .padding(10)
                .background(PatinaColors.Background.secondary)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                .accessibilityIdentifier("AskAboutPieceSheet.Message")
        }
        .padding(.horizontal, 24)
        .padding(.bottom, 12)
    }

    private var footer: some View {
        VStack(spacing: 8) {
            if let failure {
                Text(failure.sentence)
                    .font(PatinaTypography.bodySmall)
                    .foregroundStyle(PatinaColors.Text.error)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .accessibilityIdentifier("AskAboutPieceSheet.Failure")
            }

            PatinaButton(
                sendLabel,
                style: .primary,
                isLoading: isSending,
                isEnabled: outcome == nil
            ) {
                Task { await send() }
            }
            .accessibilityIdentifier("AskAboutPieceSheet.Send")

            Text(caption)
                .font(PatinaTypography.caption)
                .foregroundStyle(PatinaColors.Text.muted)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, 24)
        .padding(.top, 12)
        .padding(.bottom, 30)
    }

    private var sendLabel: String {
        switch outcome {
        case .none: return "Send"
        case .sent: return "Sent"
        case .alreadyAsked: return "Already asked"
        }
    }

    private var caption: String {
        switch outcome {
        case .none: return "A designer will come back to you about this piece."
        case .sent: return "A designer will come back to you about this piece."
        case .alreadyAsked: return "You've already asked about this one. It's still with us."
        }
    }

    private func send() async {
        guard !isSending, outcome == nil else { return }
        guard AuthService.shared.isAuthenticated else {
            failure = MoneyFailure("Sign in to ask about this piece.", offersDesignerMessage: false)
            return
        }
        isSending = true
        failure = nil
        do {
            let result = try await DesignServicesService.shared.submitDesignRequest(
                AskComposer.leadParams(message: message, product: product, roomName: roomName)
            )
            outcome = result.idempotentReplay ? .alreadyAsked : .sent
            PostHogService.shared.capture("piece_ask_sent", properties: [
                "product_id": product.id,
                "replayed": result.idempotentReplay
            ])
            HapticManager.shared.notification(.success)
            await DesignRequestStatusService.shared.refresh()
        } catch {
            MoneyFailureCopy.log("ask-about-piece", error)
            failure = MoneyFailure(
                "We couldn't send that. Nobody has seen it yet.",
                offersDesignerMessage: false
            )
        }
        isSending = false
    }
}
