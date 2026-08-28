//
//  OrderSheetContent.swift
//  Patina
//
//  Everything M5a prints, as values — so the copy is testable without a view
//  and so no branch of it can be composed in a `body` where nobody can see it.
//
//  Two rules run through the whole type:
//
//  • The sheet prints the session's real total. The money rows come from the
//    piece and, once one exists, from the order the server created — never
//    from arithmetic the app invented.
//  • The sheet never promises delivery or tax the rail was not told to keep.
//    `tax_shipping_enabled` is a server setting that defaults OFF, and while
//    it is off the line reads "Delivery and tax are not included yet." and the
//    primary act is disabled with that reason. B §5 gates Path A on exactly
//    this ("true only once the delta above ships; until then Path A does not
//    ship"), and the critique's M14 is the same point: the copy must not
//    outrun the setting.
//

import Foundation

struct OrderSheetContent: Equatable {

    struct MoneyRow: Equatable {
        let label: String
        let value: String
    }

    /// `HEIRLOOM OAK DINING TABLE` — the mono eyebrow under the title.
    let eyebrow: String
    /// `Nordic Atelier · Aarhus, Denmark`
    let makerLine: String?
    let imageURL: String?
    let description: String?
    /// `Dimensions` / `Lead time` — guaranteed present by the gate, so the
    /// sheet does not have to imagine a world without them.
    let specRows: [MoneyRow]
    /// The room's longest wall beside the piece's own, where the room was
    /// measured on the segmented unit control. Nothing otherwise.
    let fitLine: String?
    let moneyRows: [MoneyRow]
    /// The one sentence that branches on the server setting.
    let taxLine: String
    /// `Sold and shipped by Patina.` / `Sold by Nordic Atelier, Aarhus.`
    let soldBy: String
    let responsibilityParagraph: String?
    /// `Questions or damage: …` — printed only where the config holds one.
    let contactLine: String?
    let primaryLabel: String
    let isPrimaryEnabled: Bool
    /// Why the act is off, printed where the act is. Never a server sentence.
    let disabledReason: String?
    let safariNote: String
    /// Drawn only after the server has told the app a designer will be
    /// credited. Before the order exists the sheet says nothing about it —
    /// the resolution is `create_direct_order`'s, not the app's.
    let creditedInset: String?

    static let safariNoteText = "Payment opens securely in Safari."

    static let taxEnabledLine =
        "Delivery and tax are added at payment. You'll see the full total before you pay."
    static let taxDisabledLine = "Delivery and tax are not included yet."

    /// - Parameters:
    ///   - order: the row `create_direct_order` returned, once it exists. Its
    ///     `amount_cents` is the figure the Checkout session will bill, and its
    ///     `designer_id` is the only basis for the credited inset.
    ///   - designerFirstName: resolved from the server-named `designer_id`;
    ///     nil renders "Your designer".
    static func make(
        product: Product,
        terms: DirectOrderTerms,
        fitLine: String?,
        order: DirectOrder? = nil,
        designerFirstName: String? = nil
    ) -> OrderSheetContent {
        let piecePrice = order.map { $0.unitPriceCents * max(1, $0.quantity) }
            ?? product.priceCents
        var money: [MoneyRow] = [
            MoneyRow(label: "Piece", value: PatinaCurrency.format(cents: piecePrice))
        ]
        // Freight is folded into `amount_cents` inside the RPC, so where the
        // piece carries one the sheet shows it as its own row and the two rows
        // add up to the total the session takes.
        if let freight = product.shippingFlatCents, freight > 0 {
            money.append(MoneyRow(label: "Delivery", value: PatinaCurrency.format(cents: freight)))
            // With two components the reader must not be left to add them:
            // the figure the session bills is `direct_orders.amount_cents`,
            // which the RPC folded freight into. Before the row exists the
            // same sum is printed from the catalogue's own two numbers. With
            // one component the Piece row already IS the total, and a second
            // row repeating it would be decoration.
            money.append(
                MoneyRow(
                    label: "Total",
                    value: order.map(\.formattedTotal)
                        ?? PatinaCurrency.format(cents: piecePrice + freight)
                )
            )
        }

        let enabled = terms.taxShippingEnabled
        return OrderSheetContent(
            eyebrow: product.name,
            makerLine: makerLine(product),
            imageURL: product.imageURL,
            description: product.productDescription,
            specRows: specRows(product),
            fitLine: fitLine,
            moneyRows: money,
            taxLine: enabled ? taxEnabledLine : taxDisabledLine,
            soldBy: soldBy(product),
            responsibilityParagraph: terms.responsibilityParagraph,
            contactLine: terms.contact.map { "Questions or damage: \($0)" },
            primaryLabel: "Continue to payment",
            isPrimaryEnabled: enabled,
            disabledReason: enabled ? nil : OrderFailureCopy.taxShippingDisabled,
            safariNote: safariNoteText,
            creditedInset: creditedInset(order: order, designerFirstName: designerFirstName)
        )
    }

    // MARK: - Parts

    static func makerLine(_ product: Product) -> String? {
        guard let maker = product.resolvedMakerName else { return nil }
        guard let town = product.makerLocation, !town.isEmpty else { return maker }
        return "\(maker) · \(town)"
    }

    static func specRows(_ product: Product) -> [MoneyRow] {
        [
            product.dimensionsLine.map { MoneyRow(label: "Dimensions", value: $0) },
            leadTimeValue(product).map { MoneyRow(label: "Lead time", value: $0) }
        ].compactMap { $0 }
    }

    /// `Made to order · ships in 10–12 weeks` is the mock's copy for a piece
    /// whose catalogue row carries one number; the app has one number, so it
    /// prints one — the range would be invented (C5).
    static func leadTimeValue(_ product: Product) -> String? {
        guard let weeks = product.leadTimeWeeks, weeks > 0 else { return nil }
        return "Made to order · ships in \(weeks) week\(weeks == 1 ? "" : "s")"
    }

    static func soldBy(_ product: Product) -> String {
        if product.patinaManaged == true { return "Sold and shipped by Patina." }
        guard let maker = product.resolvedMakerName else { return "Sold by the maker." }
        guard let town = product.makerLocation, !town.isEmpty else { return "Sold by \(maker)." }
        return "Sold by \(maker), \(town)."
    }

    /// B §5's disclosure, printed only once the server has named a designer on
    /// the order. R3 removes Buy from every client with a live relationship, so
    /// the only client who reaches this is one on a designer's roster — and the
    /// sentence says what is true for her: the rate is the piece's, not one
    /// negotiated with the designer, and it does not come out of her price.
    static func creditedInset(order: DirectOrder?, designerFirstName: String?) -> String? {
        guard let order, order.designerId != nil else { return nil }
        let who = designerFirstName.flatMap { $0.isEmpty ? nil : $0 } ?? "Your designer"
        return "Ordered in your name. \(who) sees it and is credited at the piece's trade rate. "
            + "This doesn't change your price."
    }
}
