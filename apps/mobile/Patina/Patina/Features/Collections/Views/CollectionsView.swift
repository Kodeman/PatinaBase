//
//  CollectionsView.swift
//  Patina
//
//  Collections / Saved items with board tabs, creation, and grid layout
//

import SwiftUI
import SwiftData

struct CollectionsView: View {
    @Environment(\.modelContext) private var modelContext
    @Environment(\.appCoordinator) private var coordinator
    @State private var viewModel = CollectionsViewModel()

    /// Lookup table from productId → TableItemModel, built from savedItems
    /// so board tiles can render real thumbnails for their product IDs.
    private var itemsByProductId: [String: TableItemModel] {
        Dictionary(uniqueKeysWithValues: viewModel.savedItems.compactMap { item in
            item.productId.map { ($0, item) }
        })
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header
            HStack {
                Text("Collections")
                    .font(PatinaTypography.h2)
                    .foregroundStyle(PatinaColors.Text.primary)

                Spacer()

                Button {
                    viewModel.isCreatingBoard = true
                } label: {
                    Image(systemName: "plus.circle")
                        .font(.system(size: 22))
                        .foregroundStyle(PatinaColors.Text.interactive)
                        .frame(minWidth: 44, minHeight: 44)
                        .contentShape(Rectangle())
                }
                .accessibilityLabel("New board")
                .accessibilityHint("Creates a new collection board.")
            }
            .padding(.top, 56)
            .padding(.horizontal, 24)
            .padding(.bottom, 16)

            // Tabs
            HStack(spacing: 24) {
                ForEach(viewModel.tabs, id: \.self) { tab in
                    Button {
                        withAnimation(.spring(response: 0.3)) {
                            viewModel.activeTab = tab
                        }
                    } label: {
                        VStack(spacing: 0) {
                            Text(tab)
                                .font(PatinaTypography.bodySmall)
                                .foregroundStyle(tab == viewModel.activeTab ? PatinaColors.Text.primary : PatinaColors.Text.muted)
                                .fontWeight(tab == viewModel.activeTab ? .medium : .regular)
                                .padding(.vertical, 12)

                            Rectangle()
                                .fill(tab == viewModel.activeTab ? PatinaColors.clay : Color.clear)
                                .frame(height: 2)
                        }
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 24)
            .overlay(alignment: .bottom) {
                Rectangle().fill(PatinaColors.pearl).frame(height: 1)
            }

            // Content
            ScrollView(showsIndicators: false) {
                if viewModel.activeTab == "Boards" {
                    boardsContent
                } else {
                    allItemsContent
                }
            }
        }
        .background(PatinaColors.Background.primary)
        .toolbarTitleDisplayMode(.inline)
        .onAppear {
            viewModel.loadData(context: modelContext)
        }
        .alert("New Board", isPresented: $viewModel.isCreatingBoard) {
            TextField("Board name", text: $viewModel.newBoardName)
            Button("Create") { viewModel.createBoard(context: modelContext) }
            Button("Cancel", role: .cancel) { viewModel.newBoardName = "" }
        } message: {
            Text("Give your collection a name")
        }
    }

    // MARK: - Boards Tab

    private var boardsContent: some View {
        VStack(alignment: .leading, spacing: 24) {
            if viewModel.boards.isEmpty {
                emptyBoardsState
            } else {
                ForEach(viewModel.boards) { board in
                    boardSection(board)
                }
            }
        }
        .padding(24)
        .padding(.bottom, 100)
    }

    private var emptyBoardsState: some View {
        VStack(spacing: 16) {
            Spacer().frame(height: 40)
            Image(systemName: "rectangle.stack")
                .font(.system(size: 36))
                .foregroundStyle(PatinaColors.clay.opacity(0.5))

            Text("No boards yet")
                .font(PatinaTypography.h5)
                .foregroundStyle(PatinaColors.Text.primary)

            Text("Save pieces from recommendations to create your first board")
                .font(PatinaTypography.bodySmall)
                .foregroundStyle(PatinaColors.Text.muted)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 260)

            Button {
                viewModel.isCreatingBoard = true
            } label: {
                Text("Create Board")
                    .font(PatinaTypography.uiAction)
                    .foregroundStyle(PatinaColors.Text.inverse)
                    .padding(.horizontal, 24)
                    .frame(height: 44)
                    .background(PatinaColors.Interactive.active)
                    .clipShape(Capsule())
            }
            .padding(.top, 8)
        }
        .frame(maxWidth: .infinity)
    }

    private func boardSection(_ board: BoardModel) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(board.name)
                    .font(PatinaTypography.h5)
                    .foregroundStyle(PatinaColors.Text.primary)
                Spacer()
                MonoLabel(text: "\(board.itemCount) items")
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel("\(board.name), \(board.itemCount) item\(board.itemCount == 1 ? "" : "s")")

            // Grid placeholder (items would show product thumbnails)
            let columns = [
                GridItem(.flexible(), spacing: 6),
                GridItem(.flexible(), spacing: 6),
                GridItem(.flexible(), spacing: 6)
            ]

            if board.itemCount > 0 {
                LazyVGrid(columns: columns, spacing: 6) {
                    ForEach(Array(board.items.prefix(6).enumerated()), id: \.offset) { _, productId in
                        if let item = itemsByProductId[productId] {
                            ProductCard(
                                data: ProductCardData(tableItem: item),
                                style: .tile
                            ) {
                                coordinator.navigate(to: .pieceDetail(pieceId: productId))
                            }
                        } else {
                            PatinaGradients.warm
                                .aspectRatio(1, contentMode: .fill)
                                .clipShape(RoundedRectangle(cornerRadius: 10))
                        }
                    }
                }
            } else {
                RoundedRectangle(cornerRadius: 12)
                    .fill(PatinaColors.Background.secondary)
                    .frame(height: 80)
                    .overlay(
                        Text("Empty board")
                            .font(PatinaTypography.caption)
                            .foregroundStyle(PatinaColors.Text.muted)
                    )
            }
        }
    }

    // MARK: - All Items Tab

    private var allItemsContent: some View {
        VStack(alignment: .leading, spacing: 12) {
            if viewModel.savedItems.isEmpty {
                VStack(spacing: 12) {
                    Spacer().frame(height: 40)
                    Text("No saved items yet")
                        .font(PatinaTypography.h5)
                        .foregroundStyle(PatinaColors.Text.primary)
                    Text("Browse recommendations and save pieces you love")
                        .font(PatinaTypography.bodySmall)
                        .foregroundStyle(PatinaColors.Text.muted)
                }
                .frame(maxWidth: .infinity)
            } else {
                ForEach(viewModel.savedItems) { item in
                    ProductCard(
                        data: ProductCardData(tableItem: item),
                        style: .list
                    ) {
                        let pieceId = item.productId ?? item.id.uuidString
                        coordinator.navigate(to: .pieceDetail(pieceId: pieceId))
                    }
                }
            }
        }
        .padding(24)
        .padding(.bottom, 100)
    }
}

#Preview {
    CollectionsView()
}
