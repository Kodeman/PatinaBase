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

    /// U06: when set, the All Items tab scopes to this room's saved items
    /// and the header names the room. The Boards tab is unaffected — a
    /// board can span rooms, so it stays global.
    var roomId: UUID?

    /// Lookup table from productId → TableItemModel, built from savedItems
    /// so board tiles can render real thumbnails for their product IDs.
    private var itemsByProductId: [String: TableItemModel] {
        Dictionary(uniqueKeysWithValues: viewModel.savedItems.compactMap { item in
            item.productId.map { ($0, item) }
        })
    }

    /// U06: All Items filtered to `roomId` when set, else the full table.
    private var scopedSavedItems: [TableItemModel] {
        CollectionsViewModel.items(viewModel.savedItems, inRoom: roomId)
    }

    /// U06: resolved room name for the header scope line, when `roomId` is set.
    private var scopedRoomName: String? {
        guard let roomId else { return nil }
        return RoomStore(context: modelContext).room(id: roomId)?.name
    }

    /// B §3: the row names the room it was saved into. One fetch for the
    /// whole list — a `room(id:)` per row would be a query per row.
    private var roomNamesById: [UUID: String] {
        Dictionary(
            RoomStore(context: modelContext).allRooms().map { ($0.id, $0.name) },
            uniquingKeysWith: { first, _ in first }
        )
    }

    /// The saved piece whose note sheet is open, by local id.
    @State private var notePieceId: UUID?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header
            VStack(alignment: .leading, spacing: 2) {
                HStack {
                    Text("Saved")
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
                    .accessibilityHint("Creates a new board.")
                }
                // U06: names the room this Saved surface is scoped to.
                if let scopedRoomName {
                    Text(scopedRoomName)
                        .font(PatinaTypography.caption)
                        .foregroundStyle(PatinaColors.Text.muted)
                }
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
            // R26: pull-to-refresh re-fetches the local store and awaits the
            // remote saved-items reconciliation.
            .refreshable {
                await viewModel.refresh(context: modelContext)
            }
        }
        .background(PatinaColors.Background.primary)
        // U18: standard pushed-screen chrome — the "Saved" header above
        // carries the title, so the chrome adds only the back chevron.
        .patinaScreen(title: nil)
        .onAppear {
            viewModel.loadData(context: modelContext)
        }
        .alert("New Board", isPresented: $viewModel.isCreatingBoard) {
            TextField("Board name", text: $viewModel.newBoardName)
            Button("Create") { viewModel.createBoard(context: modelContext) }
            Button("Cancel", role: .cancel) { viewModel.newBoardName = "" }
        } message: {
            Text("Give this board a name")
        }
    }

    // MARK: - All Items Tab

    private var allItemsContent: some View {
        VStack(alignment: .leading, spacing: 12) {
            if scopedSavedItems.isEmpty {
                VStack(spacing: 12) {
                    Spacer().frame(height: 40)
                    Text("No saved items yet")
                        .font(PatinaTypography.h5)
                        .foregroundStyle(PatinaColors.Text.primary)
                    Text("Browse recommendations and save pieces you love")
                        .font(PatinaTypography.bodySmall)
                        .foregroundStyle(PatinaColors.Text.muted)
                    // U31: a dead end otherwise — give the empty "All items"
                    // tab a real path to pieces instead of leaving the user
                    // with nothing to tap.
                    Button {
                        coordinator.navigate(to: .emergence(pieceId: nil))
                    } label: {
                        Text("Browse pieces")
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
            } else {
                // R26: rows live in a VStack (not a List), so swipe actions
                // can't apply — the card's context menu carries the
                // remove/share/details actions instead.
                // Read once for the list, not once per row: `roomNamesById` is
                // a computed property that runs a fetch, and reading it inside
                // the row was the per-row query its own comment warns against.
                let roomNames = roomNamesById
                ForEach(scopedSavedItems) { item in
                    savedRow(item, roomNames: roomNames)
                }
            }
        }
        .padding(24)
        .padding(.bottom, 100)
        .sheet(isPresented: Binding(
            get: { notePieceId != nil },
            set: { if !$0 { notePieceId = nil } }
        )) {
            if let item = scopedSavedItems.first(where: { $0.id == notePieceId }) {
                SavedNoteSheet(pieceName: item.name, note: item.notes) { note in
                    viewModel.setNote(note, on: item, context: modelContext)
                }
            }
        }
    }

    /// B §3: the piece, then what the reader knows about their own save —
    /// the day, the room, and their note. Nothing else: B §10 refuses a
    /// compare surface by name.
    private func savedRow(_ item: TableItemModel, roomNames: [UUID: String]) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            ProductCard(
                data: ProductCardData(tableItem: item),
                style: .list,
                shareURL: item.productId.map { PatinaDeepLinks.productURL(forProductId: $0) },
                onRemove: {
                    viewModel.removeSavedItem(item, context: modelContext)
                },
                // SP-12: the only path that puts a piece on a board.
                // Without it `addToBoard` had no caller and a board
                // could never hold anything.
                boardTargets: boardTargets,
                onAddToBoard: { target in
                    addSavedItem(item, toBoardId: target.id)
                }
            ) {
                let pieceId = item.productId ?? item.id.uuidString
                coordinator.navigate(to: .pieceDetail(pieceId: pieceId))
            }

            savedRowFooter(item, roomNames: roomNames)
        }
        .padding(.bottom, 6)
    }

    @ViewBuilder
    private func savedRowFooter(_ item: TableItemModel, roomNames: [UUID: String]) -> some View {
        let note = SavedRowMeta.note(item.notes)
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(SavedRowMeta.line(
                    savedAt: item.savedAt,
                    roomName: item.roomId.flatMap { roomNames[$0] }
                ))
                .font(PatinaTypography.caption)
                .foregroundStyle(PatinaColors.Text.muted)

                Spacer(minLength: 0)

                Button {
                    notePieceId = item.id
                } label: {
                    Text(note == nil ? "Add a note" : "Edit note")
                        .font(PatinaTypography.captionMedium)
                        .foregroundStyle(PatinaColors.Text.interactive)
                        .frame(minHeight: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(
                    note == nil ? "Add a note about \(item.name)" : "Edit your note about \(item.name)"
                )
            }

            if let note {
                Text(note)
                    .font(PatinaTypography.bodySmall)
                    .foregroundStyle(PatinaColors.Text.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.horizontal, 4)
    }
}

#Preview {
    CollectionsView()
}

// MARK: - Boards Tab

/// The boards half of the screen, outside the view's own body so the type stays
/// inside the house limit. Same file, so `body` still reaches every member.
private extension CollectionsView {

    var boardsContent: some View {
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

    var emptyBoardsState: some View {
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

    func boardSection(_ board: BoardModel) -> some View {
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
                emptyBoardTile
            }
        }
    }

    // U31: give the empty board tile a real path to pieces instead of
    // leaving it a dead end. Extracted to keep boardSection(_:) within the
    // function-body-length gate.
    var emptyBoardTile: some View {
        RoundedRectangle(cornerRadius: 12)
            .fill(PatinaColors.Background.secondary)
            .frame(height: 80)
            .overlay(
                VStack(spacing: 4) {
                    Text("This board is empty")
                        .font(PatinaTypography.caption)
                        .foregroundStyle(PatinaColors.Text.muted)
                    Button {
                        coordinator.navigate(to: .emergence(pieceId: nil))
                    } label: {
                        Text("Browse pieces")
                            .font(PatinaTypography.captionMedium)
                            .foregroundStyle(PatinaColors.Text.interactive)
                    }
                }
            )
    }

    /// SP-12: the boards a saved piece can join. Empty until the reader makes
    /// one, and the action does not draw while it is.
    var boardTargets: [ProductCardBoardTarget] {
        viewModel.boards.map { ProductCardBoardTarget(id: $0.id.uuidString, name: $0.name) }
    }

    func addSavedItem(_ item: TableItemModel, toBoardId boardId: String) {
        guard let productId = item.productId,
              let board = viewModel.boards.first(where: { $0.id.uuidString == boardId })
        else { return }
        viewModel.addToBoard(board, productId: productId)
    }
}
