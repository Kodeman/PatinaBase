//
//  OrderSheet.swift
//  Patina
//
//  M5a — the screen that takes $4,200 from somebody who has never bought
//  furniture from a phone. Drawn on the `AddToRoomSheet` pattern (the drag
//  handle, the title over a mono eyebrow, the flat `Background.primary`
//  ground) so it belongs to the same app as the sheet it replaces.
//
//  The sheet owns the whole of Path A: the terms read, the disclosure, the
//  Safari hand-off and the poll. `OrderHandoff` holds the state; this file
//  only draws it. Which is why the copy lives in `OrderSheetContent` and not
//  in this `body` — a sentence that branches on a server setting is a fact to
//  be tested, not a ternary buried in a VStack.
//

import SwiftUI

struct OrderSheet: View {

    let product: Product
    let fitLine: String?
    /// Called with the settled order when the payment lands, so the caller can
    /// swap the sheet for `OrderPlacedView`.
    let onPlaced: (DirectOrder) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var handoff = OrderHandoff()
    @State private var terms: DirectOrderTerms = .unknown
    @State private var hasLoadedTerms = false
    @State private var designerFirstName: String?

    private var content: OrderSheetContent {
        OrderSheetContent.make(
            product: product,
            terms: terms,
            fitLine: fitLine,
            order: handoff.order,
            designerFirstName: designerFirstName
        )
    }

    var body: some View {
        VStack(spacing: 0) {
            handle
            header
            ScrollView(showsIndicators: false) { scrollBody }
            footer
        }
        .frame(maxWidth: .infinity)
        .background(PatinaColors.Background.primary)
        .presentationDetents([.large])
        .task {
            guard !hasLoadedTerms else { return }
            hasLoadedTerms = true
            terms = (try? await DirectOrdersAPIClient.shared.fetchTerms()) ?? .unknown
            PostHogService.shared.capture("order_sheet_shown", properties: [
                "product_id": product.id,
                "tax_shipping_enabled": terms.taxShippingEnabled
            ])
        }
        .onChange(of: handoff.order?.designerId) { _, designerId in
            // The server named a designer. Only now does the app look up who
            // that is — it never resolves one to decide whether to disclose.
            guard let designerId else { return }
            Task {
                let names = await ProfileLookupService.shared.names(for: [designerId])
                designerFirstName = PieceActResolver.firstName(of: names[designerId.lowercased()])
            }
        }
        .onChange(of: handoff.phase) { _, phase in
            if case .placed(let order) = phase { onPlaced(order) }
        }
        .fullScreenCover(item: checkoutBinding) { wrapped in
            SafariView(url: wrapped.url) { handoff.checkoutDismissed() }
                .ignoresSafeArea()
        }
        .onDisappear { handoff.stopPolling() }
    }

    // MARK: - Chrome

    private var handle: some View {
        RoundedRectangle(cornerRadius: 2)
            .fill(PatinaColors.Text.muted.opacity(0.25))
            .frame(width: 36, height: 4)
            .padding(.top, 18)
            .padding(.bottom, 14)
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text("Order")
                .font(PatinaTypography.h5)
                .foregroundStyle(PatinaColors.Text.primary)
            MonoLabel(text: content.eyebrow, size: PatinaTypography.monoSmall)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 24)
        .padding(.bottom, 14)
    }

    /// Safari is presented from an `item:` binding so the URL identifies the
    /// cover; the handoff owns the value and nothing else may set it.
    private var checkoutBinding: Binding<IdentifiableURL?> {
        Binding(
            get: { handoff.checkoutURL.map(IdentifiableURL.init(url:)) },
            set: { _ in }
        )
    }

    // MARK: - Body

    @ViewBuilder
    private var scrollBody: some View {
        VStack(alignment: .leading, spacing: 0) {
            pieceRow
            if let description = content.description {
                Text(description)
                    .font(PatinaTypography.bodySmall)
                    .foregroundStyle(PatinaColors.Text.secondary)
                    .lineSpacing(3)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.bottom, 12)
            }
            specList
            if let fit = content.fitLine {
                Text(fit)
                    .font(PatinaTypography.caption)
                    .foregroundStyle(PatinaColors.Text.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.bottom, 12)
                    .accessibilityIdentifier("OrderSheet.FitLine")
            }
            moneyList
            Text(content.taxLine)
                .font(PatinaTypography.bodySmall)
                .foregroundStyle(PatinaColors.Text.muted)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.bottom, 12)
                .accessibilityIdentifier("OrderSheet.TaxLine")
            responsibility
            if let inset = content.creditedInset {
                Text(inset)
                    .font(PatinaTypography.bodySmall)
                    .foregroundStyle(PatinaColors.Text.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(14)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(PatinaColors.Background.secondary)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .accessibilityIdentifier("OrderSheet.CreditedInset")
            }
        }
        .padding(.horizontal, 24)
        .padding(.bottom, 16)
    }

    private var pieceRow: some View {
        HStack(spacing: 12) {
            thumbnail
            if let makerLine = content.makerLine {
                MonoLabel(text: makerLine, color: PatinaColors.clay)
            }
            Spacer(minLength: 0)
        }
        .padding(.bottom, 14)
    }

    @ViewBuilder
    private var thumbnail: some View {
        if let imageURL = content.imageURL, let url = URL(string: imageURL) {
            PatinaAsyncImage(url: url)
                .frame(width: 72, height: 72)
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        } else {
            product.placeholderGradient
                .frame(width: 72, height: 72)
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        }
    }

    private var specList: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(content.specRows, id: \.label) { row in
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    Text(row.label)
                        .font(PatinaTypography.bodySmall)
                        .foregroundStyle(PatinaColors.Text.muted)
                    Spacer(minLength: 8)
                    Text(row.value)
                        .font(PatinaTypography.bodySmall)
                        .foregroundStyle(PatinaColors.Text.primary)
                        .multilineTextAlignment(.trailing)
                }
                .padding(.vertical, 9)
                .accessibilityElement(children: .combine)
            }
        }
        .padding(.bottom, 12)
    }

    private var moneyList: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(content.moneyRows, id: \.label) { row in
                HStack(alignment: .firstTextBaseline) {
                    Text(row.label)
                        .font(PatinaTypography.body)
                        .foregroundStyle(PatinaColors.Text.primary)
                    Spacer(minLength: 8)
                    Text(row.value)
                        .font(PatinaTypography.h5)
                        .foregroundStyle(PatinaColors.Text.primary)
                }
                .padding(.top, 10)
                .padding(.bottom, 8)
                .overlay(alignment: .top) {
                    Rectangle()
                        .frame(height: 1)
                        .foregroundStyle(PatinaColors.Border.hairline)
                }
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("OrderSheet.Money.\(row.label)")
            }
        }
    }

    private var responsibility: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(content.soldBy)
                .font(PatinaTypography.bodySmallMedium)
                .foregroundStyle(PatinaColors.Text.primary)
                .accessibilityIdentifier("OrderSheet.SoldBy")
            if let paragraph = content.responsibilityParagraph {
                Text(paragraph)
                    .font(PatinaTypography.caption)
                    .foregroundStyle(PatinaColors.Text.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let contact = content.contactLine {
                Text(contact)
                    .font(PatinaTypography.caption)
                    .foregroundStyle(PatinaColors.Text.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.bottom, 12)
    }

    // MARK: - Footer

    @ViewBuilder
    private var footer: some View {
        VStack(spacing: 8) {
            if let failure = handoff.failure {
                // The failure sits ABOVE the act, not under the fold. The Pay
                // path put it below and the walk never saw it (SP-01).
                VStack(alignment: .leading, spacing: 8) {
                    Text(failure.sentence)
                        .font(PatinaTypography.bodySmall)
                        .foregroundStyle(PatinaColors.Text.error)
                        .fixedSize(horizontal: false, vertical: true)
                    Button(failure.retryLabel) { handoff.reset() }
                        .font(PatinaTypography.uiSmall)
                        .foregroundStyle(PatinaColors.Text.interactive)
                        .accessibilityIdentifier("OrderSheet.Retry")
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityIdentifier("OrderSheet.Failure")
            }

            if case .confirming = handoff.phase {
                Text("Confirming payment… This usually takes a few seconds.")
                    .font(PatinaTypography.bodySmall)
                    .foregroundStyle(PatinaColors.Text.muted)
            }

            if case .unconfirmed = handoff.phase {
                Text(OrderFailureCopy.unconfirmed.sentence)
                    .font(PatinaTypography.bodySmall)
                    .foregroundStyle(PatinaColors.Text.muted)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("OrderSheet.Unconfirmed")
            }

            PatinaButton(
                primaryLabel,
                style: .primary,
                isLoading: handoff.isWorking,
                isEnabled: content.isPrimaryEnabled
            ) {
                Task { await primaryTapped() }
            }
            .accessibilityIdentifier("OrderSheet.Primary")

            if let reason = content.disabledReason {
                Text(reason)
                    .font(PatinaTypography.caption)
                    .foregroundStyle(PatinaColors.Text.muted)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("OrderSheet.DisabledReason")
            } else {
                Text(content.safariNote)
                    .font(PatinaTypography.caption)
                    .foregroundStyle(PatinaColors.Text.muted)
            }
        }
        .padding(.horizontal, 24)
        .padding(.top, 12)
        .padding(.bottom, 30)
    }

    /// The second tap exists only where the server named a designer, so the
    /// disclosure is read before money moves.
    private var primaryLabel: String {
        if case .disclosing = handoff.phase { return "Continue to payment" }
        return content.primaryLabel
    }

    private func primaryTapped() async {
        switch handoff.phase {
        case .disclosing:
            await handoff.confirmDisclosure()
        default:
            PostHogService.shared.capture("order_created_tapped", properties: [
                "product_id": product.id
            ])
            await handoff.begin(productId: product.id)
        }
    }
}
