//
//  CollectionsView.swift
//  Patina
//
//  Collections / Saved items with board tabs and grid layout
//

import SwiftUI

struct CollectionsView: View {
    @State private var activeTab = "Boards"
    private let tabs = ["Boards", "All Items"]

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header
            Text("Collections")
                .font(.custom("PlayfairDisplay-Regular", size: 28))
                .foregroundColor(PatinaColors.charcoal)
                .padding(.top, 56)
                .padding(.horizontal, 24)
                .padding(.bottom, 16)

            // Tabs
            HStack(spacing: 24) {
                ForEach(tabs, id: \.self) { tab in
                    Button {
                        activeTab = tab
                    } label: {
                        VStack(spacing: 0) {
                            Text(tab)
                                .font(PatinaTypography.bodySmall)
                                .foregroundColor(tab == activeTab ? PatinaColors.charcoal : PatinaColors.agedOak)
                                .fontWeight(tab == activeTab ? .medium : .regular)
                                .padding(.vertical, 12)

                            Rectangle()
                                .fill(tab == activeTab ? PatinaColors.clay : Color.clear)
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
                VStack(alignment: .leading, spacing: 24) {
                    boardSection(title: "Living Room Ideas", count: 8, gradients: [
                        PatinaGradients.leather, PatinaGradients.wood,
                        PatinaGradients.linen, PatinaGradients.rattan, PatinaGradients.stone
                    ])

                    boardSection(title: "Office Refresh", count: 5, gradients: [
                        PatinaGradients.metal, PatinaGradients.stone,
                        PatinaGradients.wood, PatinaGradients.linen
                    ])
                }
                .padding(24)
                .padding(.bottom, 100)
            }
        }
        .background(PatinaColors.offWhite)
        .navigationBarTitleDisplayMode(.inline)
    }

    // MARK: - Board Section

    private func boardSection(title: String, count: Int, gradients: [LinearGradient]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(title)
                    .font(PatinaTypography.h5)
                    .foregroundColor(PatinaColors.charcoal)
                Spacer()
                MonoLabel(text: "\(count) items")
            }

            // 3-column grid with first item spanning 2x2
            let columns = [
                GridItem(.flexible(), spacing: 6),
                GridItem(.flexible(), spacing: 6),
                GridItem(.flexible(), spacing: 6)
            ]

            LazyVGrid(columns: columns, spacing: 6) {
                ForEach(Array(gradients.enumerated()), id: \.offset) { index, gradient in
                    if index == 0 {
                        gradient
                            .aspectRatio(1, contentMode: .fill)
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                    } else {
                        gradient
                            .aspectRatio(1, contentMode: .fill)
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                    }
                }
            }
        }
    }
}

#Preview {
    CollectionsView()
}
