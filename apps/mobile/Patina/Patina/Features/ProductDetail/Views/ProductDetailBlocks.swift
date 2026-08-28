//
//  ProductDetailBlocks.swift
//  Patina
//
//  The piece screen's stateless blocks — the spec rows, the provenance badge,
//  the maker-story card, the floating circle button, the share text — plus the
//  two chrome types the screen wraps itself in.
//
//  Split out of `ProductDetailView.swift` when W4's fix round put the room
//  picker and the fit line on that screen and carried it past the 500-line
//  ceiling. Nothing here reads the view's own state: every one of these takes
//  what it draws as an argument, which is why they live in an extension in
//  another file at all (Swift's `private` reaches only the same file).
//

import SwiftUI

extension ProductDetailView {

    /// One presentation, not two. This screen carried `.helpPanel` — itself a
    /// `sheet(isPresented:)` — and then a second sheet for the room picker; a
    /// second sheet on one chain is the defect `RoomProjectView` already hit in
    /// this wave (`waves/w4/h1-notes.md`), and the one that loses is the older
    /// `?`. Both go through one `item:` binding, as they do there.
    enum Presented: Identifiable {
        case help
        case roomPicker
        /// Path B — the message into the conversation she already watches.
        case askDesigner
        /// Path C — the question that becomes a lead.
        case askAboutPiece(reason: String?)
        /// Path A — M5a.
        case order
        /// M5c, over the flow once the row settles.
        case orderPlaced(DirectOrder)
        /// C9's soft wall. A guest tapping Buy meets this and **nothing is
        /// written** — `create_direct_order` is never called.
        case authWall

        var id: String {
            switch self {
            case .help: return "help"
            case .roomPicker: return "roomPicker"
            case .askDesigner: return "askDesigner"
            case .askAboutPiece: return "askAboutPiece"
            case .order: return "order"
            case .orderPlaced(let order): return "orderPlaced-\(order.id)"
            case .authWall: return "authWall"
            }
        }
    }

    /// The room's longest wall beside the piece's own width, or nothing.
    /// Static because the screen holds the answer in `@State` rather than
    /// rebuilding it on every scroll frame.
    static func fitLine(
        for product: Product?,
        rooms: [RoomModel],
        preferredLocalId: UUID?,
        preferredRemoteId: String?
    ) -> RoomFitLine? {
        guard let product,
              let room = RoomFitLine.room(
                  preferredLocalId: preferredLocalId,
                  preferredRemoteId: preferredRemoteId,
                  in: rooms
              ) else { return nil }
        return RoomFitLine.make(room: room, product: product)
    }

    /// The room the screen already belongs to — a room-scoped browse, a Daily
    /// Room chip. Resolved through the local store so a screen that only
    /// carries the server's id still writes the local row's room.
    static func contextRoom(in store: RoomStore, localId: UUID?, remoteId: String?) -> RoomModel? {
        if let localId, let room = store.room(id: localId) { return room }
        if let remoteId { return store.room(remoteId: remoteId) }
        return nil
    }

    /// Web deep link for a piece — matches the Library piece route at
    /// `app/(document)/library/[id]` on app.patina.cloud.
    static func shareURL(for product: Product) -> URL {
        PatinaDeepLinks.productURL(forProductId: product.id)
    }

    /// `makerName` is the vendor join and can be the literal "Unknown Maker";
    /// the share text names a maker only when one resolves (a-notes.md §3).
    static func shareMessage(for product: Product) -> String {
        guard let maker = product.resolvedMakerName else {
            return "\(product.name) on Patina"
        }
        return "\(product.name) by \(maker) on Patina"
    }

    func floatingCircleButton(icon: String) -> some View {
        Circle()
            .fill(.ultraThinMaterial)
            .frame(width: 36, height: 36)
            .overlay(
                Image(systemName: icon)
                    .font(.system(size: 16))
                    .foregroundStyle(PatinaColors.Text.primary)
            )
    }

    /// SP-10 — size · lead time · maker · story, drawn only for the columns
    /// this piece actually carries. A piece with none of them draws nothing.
    @ViewBuilder
    func specRows(_ product: Product) -> some View {
        let rows: [(String, String)] = [
            product.dimensionsLine.map { ("Size", $0) },
            product.leadTimeLine.map { ("Lead time", $0) },
            product.resolvedMakerName.map { ("Maker", $0) },
            product.finish.map { ("Finish", $0) }
        ].compactMap { $0 }

        if !rows.isEmpty {
            VStack(alignment: .leading, spacing: 6) {
                ForEach(rows, id: \.0) { label, value in
                    HStack(alignment: .firstTextBaseline, spacing: 10) {
                        MonoLabel(text: label, size: PatinaTypography.monoSmall)
                            .frame(width: 78, alignment: .leading)
                        Text(value)
                            .font(PatinaTypography.bodySmall)
                            .foregroundStyle(PatinaColors.Text.primary)
                            .fixedSize(horizontal: false, vertical: true)
                        Spacer(minLength: 0)
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel("\(label): \(value)")
                }
            }
            .padding(.bottom, 16)
        }

        if let story = product.productDescription {
            Text(story)
                .font(PatinaTypography.bodySmall)
                .foregroundStyle(PatinaColors.Text.secondary)
                .lineSpacing(3)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.bottom, 16)
        }
    }

    func materialBadge(text: String) -> some View {
        HStack(spacing: 5) {
            Text(text)
                .font(PatinaTypography.caption)
                .foregroundStyle(PatinaColors.Text.secondary)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(PatinaColors.Background.secondary)
        .clipShape(Capsule())
    }

    func makerStoryCard(name: String, location: String?, story: String) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                Circle()
                    .fill(PatinaGradients.earth)
                    .frame(width: 44, height: 44)

                VStack(alignment: .leading, spacing: 2) {
                    Text(name)
                        .font(PatinaTypography.bodySmallMedium)
                        .foregroundStyle(PatinaColors.Text.primary)

                    if let location {
                        MonoLabel(text: location, size: PatinaTypography.monoSmall)
                    }
                }
            }

            Text("\u{201C}\(story)\u{201D}")
                .font(PatinaTypography.bodySmall)
                .foregroundStyle(PatinaColors.Text.secondary)
                .italic()
                .lineSpacing(4)
        }
        .padding(20)
        .background(PatinaColors.Background.secondary)
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }
}

// MARK: - Badge Display Names

/// Internal rather than file-private: the piece screen draws these in its own
/// file (`badge.badgeDisplayName`), and `private` would not reach it.
extension String {
    var badgeDisplayName: String {
        switch self {
        case "fsc_certified": return "🌿 FSC Certified"
        case "handcrafted": return "✋ Handcrafted"
        case "made_in_usa": return "📍 Made in USA"
        case "sustainable": return "♻️ Sustainable"
        default: return self.replacingOccurrences(of: "_", with: " ").capitalized
        }
    }
}

// MARK: - Glass Action Bar Background (PT-5-7)

/// Applies the Liquid Glass material behind the product-detail action bar on
/// iOS 26+, and falls back to the prior flat off-white + soft shadow on older
/// OS versions. Gated with `#available` because `.glassEffect` is iOS 26.0+
/// while the app still deploys to iOS 18.
struct GlassActionBarBackground: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            content.glassEffect(.regular, in: .rect)
        } else {
            content.background(
                PatinaColors.Background.primary
                    .shadow(color: PatinaColors.mocha.opacity(0.08), radius: 8, y: -4)
            )
        }
    }
}

// MARK: - Flow Layout

struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let result = arrange(proposal: proposal, subviews: subviews)
        return result.size
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = arrange(proposal: proposal, subviews: subviews)
        for (index, position) in result.positions.enumerated() {
            subviews[index].place(at: CGPoint(x: bounds.minX + position.x, y: bounds.minY + position.y), proposal: .unspecified)
        }
    }

    private func arrange(proposal: ProposedViewSize, subviews: Subviews) -> (size: CGSize, positions: [CGPoint]) {
        let maxWidth = proposal.width ?? .infinity
        var positions: [CGPoint] = []
        var x: CGFloat = 0
        var y: CGFloat = 0
        var maxHeight: CGFloat = 0
        var rowMaxY: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x + size.width > maxWidth && x > 0 {
                x = 0
                y = rowMaxY + spacing
            }
            positions.append(CGPoint(x: x, y: y))
            rowMaxY = max(rowMaxY, y + size.height)
            x += size.width + spacing
            maxHeight = max(maxHeight, y + size.height)
        }

        return (CGSize(width: maxWidth, height: maxHeight), positions)
    }
}
