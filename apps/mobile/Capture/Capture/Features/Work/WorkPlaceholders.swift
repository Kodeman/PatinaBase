//  WorkPlaceholders.swift
//  Capture · Wave W (Work dashboard)
//
//  W1 freeze placeholder. Unlike the other flows' plain placeholders, the Work
//  dashboard shows four live tile stubs (Projects / Leads / Decisions / Messages)
//  that navigate to each flow's route — proving the Phase 2 route graph end to end
//  on mocks. Wave W replaces this with the real dashboard.

import SwiftUI
import CaptureKit

struct WorkDashboardPlaceholder: View {
    let coordinator: CaptureCoordinator

    private struct Tile: Identifiable {
        let id = UUID()
        let title: String
        let symbol: String
        let route: CaptureRoute
    }

    private let tiles: [Tile] = [
        Tile(title: "Projects", symbol: "folder", route: .projectList),
        Tile(title: "Leads", symbol: "person.crop.circle.badge.questionmark", route: .leadList),
        Tile(title: "Decisions", symbol: "checkmark.seal", route: .decisionList),
        Tile(title: "Messages", symbol: "bubble.left.and.bubble.right", route: .inbox)
    ]

    private let columns = [GridItem(.flexible(), spacing: 14), GridItem(.flexible(), spacing: 14)]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("Wave W")
                    .font(CaptureType.eyebrow)
                    .textCase(.uppercase)
                    .foregroundStyle(CaptureColor.inkSoft)

                Text("Work")
                    .font(CaptureType.display)
                    .foregroundStyle(CaptureColor.ink)

                Text("Wave W builds this dashboard. The tiles below already route through the frozen graph.")
                    .font(CaptureType.callout)
                    .foregroundStyle(CaptureColor.inkSoft)

                LazyVGrid(columns: columns, spacing: 14) {
                    ForEach(tiles) { tile in
                        Button { coordinator.navigate(to: tile.route) } label: {
                            tileLabel(tile)
                        }
                        .accessibilityLabel("Open \(tile.title)")
                    }
                }
                .padding(.top, 4)
            }
            .padding(20)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(CaptureColor.paper)
        .navigationTitle("Work")
        .navigationBarTitleDisplayMode(.inline)
        .accessibilityIdentifier(CaptureScreenID.w1Work.rawValue)
    }

    private func tileLabel(_ tile: Tile) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Image(systemName: tile.symbol)
                .font(CaptureType.title2)
                .foregroundStyle(CaptureColor.brass)
            Text(tile.title)
                .font(CaptureType.bodyEmph)
                .foregroundStyle(CaptureColor.ink)
        }
        .frame(maxWidth: .infinity, minHeight: 96, alignment: .topLeading)
        .padding(16)
        .background(RoundedRectangle(cornerRadius: 14).fill(CaptureColor.paper3))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(CaptureColor.line, lineWidth: 1))
        .contentShape(Rectangle())
    }
}
