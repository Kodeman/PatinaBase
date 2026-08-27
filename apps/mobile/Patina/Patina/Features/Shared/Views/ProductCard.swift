//
//  ProductCard.swift
//  Patina
//
//  Shared product card used in Collections (saved items, board previews)
//  and anywhere a compact, tappable product summary is needed.
//
//  The editorial variant used on the daily home lives in
//  Features/Home/Views/DailyProductCard.swift — it's tightly coupled to
//  DailyRecommendation (why-copy, tier, match, insight, pairing, matched
//  geometry) and intentionally kept separate. This file handles the
//  non-editorial cases so Collections stops rolling its own row layout.
//

import SwiftUI

// MARK: - Data

/// Minimal data a compact product card needs. Adapters keep view models
/// free from UI concerns.
public struct ProductCardData: Identifiable, Hashable {
    public let id: String
    public let name: String
    public let makerName: String?
    public let formattedPrice: String?
    public let imageURL: String?

    public init(
        id: String,
        name: String,
        makerName: String? = nil,
        formattedPrice: String? = nil,
        imageURL: String? = nil
    ) {
        self.id = id
        self.name = name
        self.makerName = makerName
        self.formattedPrice = formattedPrice
        self.imageURL = imageURL
    }
}

// MARK: - Card

/// Compact product card. Matches the visual language of `DailyProductCard`
/// (PlayfairDisplay price, DMMono maker line, softCream background,
/// 14pt corner radius) without the editorial overlays.
public struct ProductCard: View {
    public enum Style {
        /// Standalone card used in lists (saved items tab).
        case list
        /// Small tile used in grid board previews.
        case tile
    }

    let data: ProductCardData
    let style: Style
    let onTap: () -> Void
    /// R26: optional context-menu hooks. When either is set the card grows a
    /// long-press menu with View details / Share / Remove — only actions the
    /// call site can actually perform today.
    let shareURL: URL?
    let onRemove: (() -> Void)?
    /// SP-12: the boards this piece can be added to, and what to do when one
    /// is picked. Empty means the app has no boards yet and the action does
    /// not draw. `BoardModel.addItem` had no caller anywhere before this, so
    /// a board could never fill.
    let boardTargets: [ProductCardBoardTarget]
    let onAddToBoard: ((ProductCardBoardTarget) -> Void)?

    public init(
        data: ProductCardData,
        style: Style = .list,
        shareURL: URL? = nil,
        onRemove: (() -> Void)? = nil,
        boardTargets: [ProductCardBoardTarget] = [],
        onAddToBoard: ((ProductCardBoardTarget) -> Void)? = nil,
        onTap: @escaping () -> Void
    ) {
        self.data = data
        self.style = style
        self.shareURL = shareURL
        self.onRemove = onRemove
        self.boardTargets = boardTargets
        self.onAddToBoard = onAddToBoard
        self.onTap = onTap
    }

    public var body: some View {
        Button(action: onTap) {
            switch style {
            case .list:
                listLayout
            case .tile:
                tileLayout
            }
        }
        .buttonStyle(.plain)
        .modifier(ProductCardContextMenu(
            name: data.name,
            shareURL: shareURL,
            onRemove: onRemove,
            boardTargets: boardTargets,
            onAddToBoard: onAddToBoard,
            onViewDetails: onTap
        ))
    }

    // MARK: - List (saved items)

    private var listLayout: some View {
        HStack(spacing: PatinaSpacing.xsm) {
            thumbnail
                .frame(width: 72, height: 72)
                .clipShape(RoundedRectangle(cornerRadius: PatinaRadius.md, style: .continuous))

            VStack(alignment: .leading, spacing: 2) {
                if let maker = data.makerName, !maker.isEmpty {
                    Text(maker)
                        .font(PatinaTypography.monoLabel)
                        .tracking(0.5)
                        .textCase(.uppercase)
                        .foregroundStyle(PatinaColors.Text.muted)
                }
                Text(data.name)
                    .font(PatinaTypography.uiSmall)
                    .foregroundStyle(PatinaColors.Text.primary)
                    .lineLimit(2)
                if let price = data.formattedPrice {
                    Text(price)
                        .font(PatinaTypography.h5)
                        .foregroundStyle(PatinaColors.Text.primary)
                        .padding(.top, 2)
                }
            }

            Spacer(minLength: 0)

            Image(systemName: "chevron.right")
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(PatinaColors.Text.muted)
        }
        .padding(PatinaSpacing.xsm)
        .background(PatinaColors.Background.secondary)
        .clipShape(RoundedRectangle(cornerRadius: PatinaRadius.xl, style: .continuous))
    }

    // MARK: - Tile (board preview grid)

    private var tileLayout: some View {
        thumbnail
            .aspectRatio(1, contentMode: .fill)
            .clipShape(RoundedRectangle(cornerRadius: PatinaRadius.lg, style: .continuous))
            .overlay(alignment: .bottomLeading) {
                if let price = data.formattedPrice {
                    Text(price)
                        .font(.custom("PlayfairDisplay-Medium", size: 11, relativeTo: .caption2))
                        .foregroundStyle(PatinaColors.offWhite)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 3)
                        .background(
                            Capsule().fill(PatinaColors.charcoal.opacity(0.7))
                        )
                        .padding(6)
                }
            }
    }

    // MARK: - Thumbnail

    @ViewBuilder
    private var thumbnail: some View {
        if let urlString = data.imageURL, let url = URL(string: urlString) {
            // R15: route the app's last remote image through PatinaAsyncImage
            // so loading/failure states share the branded placeholder.
            PatinaAsyncImage(url: url, contentMode: .fill)
        } else {
            PatinaGradients.warm
        }
    }
}

// MARK: - Context menu (R26)

/// Attaches a `.contextMenu` only when the card has at least one action
/// beyond opening it — a one-item long-press menu is just noise.
private struct ProductCardContextMenu: ViewModifier {
    let name: String
    let shareURL: URL?
    let onRemove: (() -> Void)?
    let boardTargets: [ProductCardBoardTarget]
    let onAddToBoard: ((ProductCardBoardTarget) -> Void)?
    let onViewDetails: () -> Void

    private var hasBoardAction: Bool {
        onAddToBoard != nil && !boardTargets.isEmpty
    }

    func body(content: Content) -> some View {
        if shareURL == nil && onRemove == nil && !hasBoardAction {
            content
        } else {
            content.contextMenu {
                Button {
                    onViewDetails()
                } label: {
                    Label("View details", systemImage: "arrow.up.right")
                }
                if hasBoardAction, let onAddToBoard {
                    Menu {
                        ForEach(boardTargets) { board in
                            Button(board.name) { onAddToBoard(board) }
                        }
                    } label: {
                        Label("Add to board", systemImage: "rectangle.stack.badge.plus")
                    }
                }
                if let shareURL {
                    ShareLink(item: shareURL, subject: Text(name)) {
                        Label("Share", systemImage: "square.and.arrow.up")
                    }
                }
                if let onRemove {
                    Button(role: .destructive) {
                        onRemove()
                    } label: {
                        Label("Remove", systemImage: "trash")
                    }
                }
            }
        }
    }
}

// MARK: - Board target (SP-12)

/// One board a saved piece can be added to.
public struct ProductCardBoardTarget: Identifiable, Hashable, Sendable {
    public let id: String
    public let name: String

    public init(id: String, name: String) {
        self.id = id
        self.name = name
    }
}

// MARK: - Adapters

public extension ProductCardData {
    init(tableItem item: TableItemModel) {
        self.init(
            id: item.id.uuidString,
            name: item.name,
            makerName: item.brandName,
            formattedPrice: item.formattedPrice,
            imageURL: item.imageURL
        )
    }
}
