//
//  LifestyleRealityView.swift
//  Patina
//
//  Q2: Lifestyle Reality. Flex-wrap pills, multi-select.
//  Per PRD §4.6.2.
//

import SwiftUI

struct LifestyleRealityView: View {

    @Bindable var viewModel: StyleConversationViewModel

    var body: some View {
        StylePillFlow(spacing: 10) {
            ForEach(LifestyleFactor.allCases) { factor in
                StylePillButton(
                    label: factor.label,
                    emoji: factor.emoji,
                    isSelected: viewModel.responses.lifestyleFactors.contains(factor),
                    onToggle: { viewModel.toggleQ2(factor) }
                )
            }
        }
        .padding(.horizontal, 24)
    }
}

/// Minimal flex-wrap layout so pills wrap naturally. Named with a `Style`
/// prefix to avoid colliding with the existing ProductDetail FlowLayout.
struct StylePillFlow: Layout {

    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxWidth = proposal.width ?? .infinity
        let rows = computeRows(subviews: subviews, maxWidth: maxWidth)
        let height = rows.reduce(0) { $0 + $1.height } + CGFloat(max(0, rows.count - 1)) * spacing
        return CGSize(width: maxWidth, height: height)
    }

    func placeSubviews(
        in bounds: CGRect,
        proposal: ProposedViewSize,
        subviews: Subviews,
        cache: inout ()
    ) {
        let rows = computeRows(subviews: subviews, maxWidth: bounds.width)
        var y = bounds.minY
        for row in rows {
            var x = bounds.minX
            for item in row.items {
                item.view.place(
                    at: CGPoint(x: x, y: y),
                    proposal: ProposedViewSize(width: item.size.width, height: item.size.height)
                )
                x += item.size.width + spacing
            }
            y += row.height + spacing
        }
    }

    private struct Row {
        var items: [(view: LayoutSubview, size: CGSize)]
        var height: CGFloat
    }

    private func computeRows(subviews: Subviews, maxWidth: CGFloat) -> [Row] {
        var rows: [Row] = [Row(items: [], height: 0)]
        var x: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x + size.width > maxWidth, !(rows.last?.items.isEmpty ?? true) {
                rows.append(Row(items: [], height: 0))
                x = 0
            }
            rows[rows.count - 1].items.append((subview, size))
            rows[rows.count - 1].height = max(rows[rows.count - 1].height, size.height)
            x += size.width + spacing
        }
        return rows
    }
}
