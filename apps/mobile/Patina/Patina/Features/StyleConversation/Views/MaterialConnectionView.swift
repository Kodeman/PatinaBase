//
//  MaterialConnectionView.swift
//  Patina
//
//  Q3: Material Connection. 2×3 swatch grid, max 3 selections.
//  Per PRD §4.6.3.
//

import SwiftUI

struct MaterialConnectionView: View {

    @Bindable var viewModel: StyleConversationViewModel

    private let swatches: [(MaterialPreference, LinearGradient)] = [
        (.weatheredOak, LinearGradient(
            colors: [Color(red: 0.55, green: 0.38, blue: 0.21), Color(red: 0.38, green: 0.25, blue: 0.12)],
            startPoint: .topLeading, endPoint: .bottomTrailing
        )),
        (.smoothMarble, LinearGradient(
            colors: [Color(red: 0.95, green: 0.94, blue: 0.92), Color(red: 0.75, green: 0.74, blue: 0.72)],
            startPoint: .topLeading, endPoint: .bottomTrailing
        )),
        (.agedLeather, LinearGradient(
            colors: [Color(red: 0.40, green: 0.22, blue: 0.10), Color(red: 0.22, green: 0.11, blue: 0.05)],
            startPoint: .topLeading, endPoint: .bottomTrailing
        )),
        (.softLinen, LinearGradient(
            colors: [Color(red: 0.95, green: 0.90, blue: 0.80), Color(red: 0.82, green: 0.75, blue: 0.62)],
            startPoint: .topLeading, endPoint: .bottomTrailing
        )),
        (.wovenRattan, LinearGradient(
            colors: [Color(red: 0.82, green: 0.68, blue: 0.45), Color(red: 0.58, green: 0.45, blue: 0.25)],
            startPoint: .topLeading, endPoint: .bottomTrailing
        )),
        (.brushedMetal, LinearGradient(
            colors: [Color(red: 0.72, green: 0.74, blue: 0.78), Color(red: 0.42, green: 0.44, blue: 0.48)],
            startPoint: .topLeading, endPoint: .bottomTrailing
        ))
    ]

    var body: some View {
        let columns = [GridItem(.flexible(), spacing: 3), GridItem(.flexible(), spacing: 3)]

        LazyVGrid(columns: columns, spacing: 3) {
            ForEach(swatches, id: \.0) { material, gradient in
                StyleSwatchCell(
                    label: material.displayName,
                    gradient: gradient,
                    isSelected: viewModel.responses.materialPreferences.contains(material),
                    onTap: {
                        _ = viewModel.toggleQ3(material)
                    }
                )
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .padding(.horizontal, 24)
    }
}
