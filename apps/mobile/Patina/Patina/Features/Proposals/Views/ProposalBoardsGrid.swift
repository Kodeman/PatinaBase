//
//  ProposalBoardsGrid.swift
//  Patina
//
//  Proposal boards rendered as a PatinaAsyncImage thumbnail grid (R30 / D.1),
//  NOT a canvas. Each board becomes a titled card with a small grid of its
//  image thumbnails and an item count. Boards with no imagery collapse to a
//  quiet monogram tile.
//

import SwiftUI

struct ProposalBoardsGrid: View {
    let boards: [RemoteProposalBoard]

    private let columns = [
        GridItem(.flexible(), spacing: 6),
        GridItem(.flexible(), spacing: 6),
        GridItem(.flexible(), spacing: 6)
    ]

    var body: some View {
        if !boards.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                MonoLabel(text: "Boards")
                    .padding(.horizontal, 24)
                VStack(spacing: 16) {
                    ForEach(boards) { board in
                        boardCard(board)
                    }
                }
                .padding(.horizontal, 24)
            }
        }
    }

    private func boardCard(_ board: RemoteProposalBoard) -> some View {
        let thumbnails = Array(board.thumbnailURLs.prefix(6))
        return VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(board.name ?? "Board")
                    .font(PatinaTypography.h5)
                    .foregroundStyle(PatinaColors.Text.primary)
                Spacer()
                Text(board.itemCount == 1 ? "1 item" : "\(board.itemCount) items")
                    .font(PatinaTypography.monoLabel)
                    .tracking(0.4)
                    .textCase(.uppercase)
                    .foregroundStyle(PatinaColors.Text.muted)
            }

            if thumbnails.isEmpty {
                emptyTile
            } else {
                LazyVGrid(columns: columns, spacing: 6) {
                    ForEach(Array(thumbnails.enumerated()), id: \.offset) { _, url in
                        PatinaAsyncImage(url: url)
                            .aspectRatio(1, contentMode: .fill)
                            .frame(maxWidth: .infinity)
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                    }
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(PatinaColors.Background.secondary)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(board.name ?? "Board"), \(board.itemCount) items")
    }

    private var emptyTile: some View {
        RoundedRectangle(cornerRadius: 8)
            .fill(PatinaColors.Background.primary)
            .frame(height: 80)
            .overlay(
                Image(systemName: "square.grid.2x2")
                    .font(.system(size: 20))
                    .foregroundStyle(PatinaColors.Text.muted.opacity(0.5))
            )
    }
}

#Preview {
    ScrollView {
        ProposalBoardsGrid(boards: [])
    }
    .background(PatinaColors.Background.primary)
}
