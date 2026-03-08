//
//  TableView.swift
//  Patina
//
//  Physics-based collection surface with patina aging
//

import SwiftUI
import SwiftData

/// The Table - Your collected pieces
/// "A physical surface where pieces accumulate and age"
struct TableView: View {

    // MARK: - Properties

    @Environment(\.modelContext) private var modelContext
    @State private var viewModel = TableViewModel()
    @State private var showSortMenu = false
    @State private var viewMode: ViewMode = .scatter

    enum ViewMode: String, CaseIterable {
        case scatter = "Scatter"
        case grid = "Grid"
        case list = "List"

        var icon: String {
            switch self {
            case .scatter: return "rectangle.on.rectangle.angled"
            case .grid: return "square.grid.2x2"
            case .list: return "list.bullet"
            }
        }
    }

    // MARK: - Body

    var body: some View {
        ZStack {
            // Table surface background
            tableBackground

            VStack(spacing: 0) {
                // Header
                tableHeader

                // Main content
                if viewModel.items.isEmpty {
                    emptyState
                } else {
                    switch viewMode {
                    case .scatter:
                        scatterContent
                    case .grid:
                        gridContent
                    case .list:
                        listContent
                    }
                }
            }
        }
        .background(PatinaColors.Background.primary)
        .sheet(isPresented: $viewModel.isShowingDetail) {
            if let item = viewModel.selectedItem {
                TableItemDetailSheet(
                    item: item,
                    onDismiss: {
                        viewModel.deselectItem()
                    },
                    onDelete: {
                        viewModel.removeItem(item)
                    },
                    onUpdateNotes: { notes in
                        viewModel.updateNotes(for: item, notes: notes)
                    }
                )
                .presentationDetents([.large])
                .presentationDragIndicator(.visible)
            }
        }
        .onAppear {
            viewModel.configure(with: modelContext)
        }
    }

    // MARK: - Table Background

    private var tableBackground: some View {
        ZStack {
            // Wood grain texture
            LinearGradient(
                colors: [
                    Color(hex: "DED4C4"),
                    Color(hex: "C9BBA8")
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            // Subtle wood grain pattern
            Rectangle()
                .fill(
                    LinearGradient(
                        colors: [
                            Color.white.opacity(0.02),
                            Color.clear,
                            Color.white.opacity(0.02),
                            Color.clear
                        ],
                        startPoint: .leading,
                        endPoint: .trailing
                    )
                )
                .ignoresSafeArea()
        }
    }

    // MARK: - Header

    private var tableHeader: some View {
        HStack {
            VStack(alignment: .leading, spacing: PatinaSpacing.xs) {
                Text("Your Table")
                    .font(PatinaTypography.headlineSerif)
                    .foregroundStyle(PatinaColors.charcoal)

                HStack(spacing: PatinaSpacing.xs) {
                    Text("\(viewModel.items.count) pieces")
                        .font(PatinaTypography.caption)
                        .foregroundStyle(PatinaColors.mochaBrown)

                    if viewModel.totalValue > 0 {
                        Text("•")
                            .foregroundStyle(PatinaColors.clayBeige)
                        Text(viewModel.formattedTotalValue)
                            .font(PatinaTypography.captionMedium)
                            .foregroundStyle(PatinaColors.mochaBrown)
                    }
                }
            }

            Spacer()

            // View mode toggle
            Menu {
                ForEach(ViewMode.allCases, id: \.self) { mode in
                    Button {
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                            viewMode = mode
                        }
                        HapticManager.shared.selectionChanged()
                    } label: {
                        Label(mode.rawValue, systemImage: mode.icon)
                    }
                }
            } label: {
                Image(systemName: viewMode.icon)
                    .font(.system(size: 20))
                    .foregroundStyle(PatinaColors.mochaBrown)
                    .padding(PatinaSpacing.xs)
            }

            // Sort menu
            Menu {
                ForEach(TableViewModel.SortOrder.allCases, id: \.self) { order in
                    Button {
                        viewModel.setSortOrder(order)
                    } label: {
                        Label(order.rawValue, systemImage: order.icon)
                    }
                }
            } label: {
                Image(systemName: "arrow.up.arrow.down.circle")
                    .font(.system(size: 20))
                    .foregroundStyle(PatinaColors.mochaBrown)
                    .padding(PatinaSpacing.xs)
            }
        }
        .padding(.horizontal, PatinaSpacing.lg)
        .padding(.vertical, PatinaSpacing.md)
        .background(
            Rectangle()
                .fill(.ultraThinMaterial)
        )
    }

    // MARK: - Empty State

    private var emptyState: some View {
        VStack(spacing: PatinaSpacing.xl) {
            Spacer()

            // Icon
            ZStack {
                Circle()
                    .stroke(PatinaColors.clayBeige.opacity(0.3), lineWidth: 2)
                    .frame(width: 120, height: 120)

                Image(systemName: "rectangle.stack")
                    .font(.system(size: 48))
                    .foregroundStyle(PatinaColors.clayBeige)
            }

            // Message
            VStack(spacing: PatinaSpacing.md) {
                Text("Your table awaits")
                    .font(PatinaTypography.headlineSerif)
                    .foregroundStyle(PatinaColors.charcoal)

                Text("As you explore and discover pieces that resonate, they'll gather here—aging gracefully over time, developing their own patina.")
                    .font(PatinaTypography.body)
                    .foregroundStyle(PatinaColors.mochaBrown)
                    .multilineTextAlignment(.center)
                    .lineSpacing(4)
                    .padding(.horizontal, PatinaSpacing.xl)
            }

            // CTA
            PatinaButton("Start Exploring", style: .secondary) {
                // Navigate to conversation
            }

            Spacer()

            // Bottom padding for companion overlay
            Spacer().frame(height: 100)
        }
    }

    // MARK: - Scatter View (Physics-based)

    private var scatterContent: some View {
        GeometryReader { geometry in
            ZStack {
                ForEach(viewModel.items) { item in
                    TableItemCard(
                        item: item,
                        isSelected: viewModel.selectedItem?.id == item.id,
                        onTap: {
                            viewModel.selectItem(item)
                        },
                        onDragChanged: { position in
                            viewModel.updatePosition(for: item, x: Float(position.x), y: Float(position.y))
                        },
                        onDragEnded: { position, velocity in
                            viewModel.updatePosition(for: item, x: Float(position.x), y: Float(position.y))
                        }
                    )
                    .position(item.position)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .contentShape(Rectangle())
            .onTapGesture {
                viewModel.deselectItem()
            }
        }
        .padding(.bottom, 100) // Space for companion
    }

    // MARK: - Grid View

    private var gridContent: some View {
        ScrollView {
            LazyVGrid(
                columns: [
                    GridItem(.flexible(), spacing: PatinaSpacing.md),
                    GridItem(.flexible(), spacing: PatinaSpacing.md)
                ],
                spacing: PatinaSpacing.md
            ) {
                ForEach(viewModel.items) { item in
                    TableItemCard(
                        item: item,
                        isSelected: viewModel.selectedItem?.id == item.id,
                        onTap: {
                            viewModel.selectItem(item)
                        },
                        onDragChanged: { _ in },
                        onDragEnded: { _, _ in }
                    )
                }
            }
            .padding(PatinaSpacing.lg)
            .padding(.bottom, 120) // Space for companion
        }
    }

    // MARK: - List View

    private var listContent: some View {
        ScrollView {
            LazyVStack(spacing: PatinaSpacing.sm) {
                ForEach(viewModel.items) { item in
                    TableItemCardCompact(item: item) {
                        viewModel.selectItem(item)
                    }
                }
            }
            .padding(PatinaSpacing.lg)
            .padding(.bottom, 120) // Space for companion
        }
    }
}

// MARK: - Preview

#Preview("Empty Table") {
    TableView()
        .modelContainer(PersistenceController.previewContainer)
}

#Preview("With Items") {
    TableView()
        .modelContainer(PersistenceController.previewContainer)
}
