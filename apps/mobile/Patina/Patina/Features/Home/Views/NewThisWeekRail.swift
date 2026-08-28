//
//  NewThisWeekRail.swift
//  Patina
//
//  NEW THIS WEEK (B §2 block 4, M2 block 4).
//
//  The supply floor is the whole point: the rail renders at three or more rows
//  whose `published_at` is genuinely inside seven days, and otherwise does not
//  render at all. It never pads, never repeats, and never calls a row new
//  because the app happened to fetch it today. Below the floor the block goes
//  dark — the honest failure, and the reason discovering is promised a weekly
//  return rather than a daily one.
//

import SwiftUI

enum NewThisWeek {

    static let window: TimeInterval = 7 * 24 * 60 * 60

    /// The rows the rail may draw — newest first — or an empty array, which
    /// means the block does not draw. There is no third answer: a shortfall is
    /// never topped up from older stock.
    static func rows(
        from products: [Product],
        now: Date = Date(),
        floor: Int = HomeComposition.newThisWeekFloor
    ) -> [Product] {
        let fresh = products
            .filter { product in
                guard let published = product.publishedAt else { return false }
                // A future timestamp is not news either; it is a scheduled row
                // that has not happened yet.
                return published <= now && now.timeIntervalSince(published) <= window
            }
            .sorted { ($0.publishedAt ?? .distantPast) > ($1.publishedAt ?? .distantPast) }
        return fresh.count >= floor ? fresh : []
    }

    /// "Three pieces joined Patina this week." — the count spelled, because it
    /// is a sentence and not a metric.
    static func footer(count: Int) -> String? {
        guard count > 0 else { return nil }
        let formatter = NumberFormatter()
        formatter.numberStyle = .spellOut
        let spelled = formatter.string(from: NSNumber(value: count)) ?? "\(count)"
        let noun = count == 1 ? "piece" : "pieces"
        return "\(spelled.prefix(1).uppercased() + spelled.dropFirst()) \(noun) joined Patina this week."
    }
}

struct NewThisWeekRail: View {
    let products: [Product]
    var onProduct: (Product) -> Void = { _ in }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            MonoLabel(text: "NEW THIS WEEK")
                .padding(.horizontal, PatinaSpacing.mdLarge)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(alignment: .top, spacing: PatinaSpacing.xsm) {
                    ForEach(products) { product in
                        card(product)
                    }
                }
                .padding(.horizontal, PatinaSpacing.mdLarge)
                .padding(.top, PatinaSpacing.sm)
            }

            if let footer = NewThisWeek.footer(count: products.count) {
                Text(footer)
                    .font(PatinaTypography.caption)
                    .foregroundStyle(PatinaColors.Text.muted)
                    .padding(.horizontal, PatinaSpacing.mdLarge)
                    .padding(.top, PatinaSpacing.sm)
            }
        }
        .accessibilityIdentifier("DailyRoomView.NewThisWeek")
    }

    private func card(_ product: Product) -> some View {
        Button {
            onProduct(product)
        } label: {
            VStack(alignment: .leading, spacing: 0) {
                Group {
                    if let raw = product.imageURL, let url = URL(string: raw), url.scheme != nil {
                        PatinaAsyncImage(url: url, contentMode: .fill)
                    } else {
                        // Adaptive, so an unloaded image is not a light band
                        // on a dark card.
                        PatinaColors.Background.primary
                    }
                }
                .frame(width: 160, height: 112)
                .clipped()
                .accessibilityHidden(true)

                VStack(alignment: .leading, spacing: 2) {
                    // SP-10: the brand, not the vendor, where the row carries one.
                    MonoLabel(text: product.brand ?? product.makerName)
                        .lineLimit(1)
                    Text(product.name)
                        .font(PatinaTypography.bodySmallMedium)
                        .foregroundStyle(PatinaColors.Text.primary)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                    Text(product.fullFormattedPrice)
                        .font(PatinaTypography.caption)
                        .foregroundStyle(PatinaColors.Text.secondary)
                }
                .padding(.horizontal, PatinaSpacing.sm)
                .padding(.vertical, PatinaSpacing.sm)
            }
            .frame(width: 160, alignment: .topLeading)
            .background(PatinaColors.Background.secondary)
            .clipShape(RoundedRectangle(cornerRadius: PatinaRadius.xl, style: .continuous))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(product.name). \(product.fullFormattedPrice)")
    }
}
