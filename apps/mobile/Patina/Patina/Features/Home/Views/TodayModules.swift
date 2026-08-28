//
//  TodayModules.swift
//  Patina
//
//  Option B's compact Today modules.
//

import SwiftUI

struct TodayNextMoveCard: View {
    let move: TodayNextMove
    let onTap: () -> Void

    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        Button(action: onTap) {
            Group {
                if dynamicTypeSize.isAccessibilitySize {
                    accessibilityContent
                } else {
                    compactContent
                }
            }
            .padding(16)
            .background(PatinaColors.Background.secondary)
            .clipShape(RoundedRectangle(cornerRadius: PatinaRadius.xl, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(move.title). \(move.detail)")
        .accessibilityHint("Opens today's recommended next step.")
        .accessibilityIdentifier("DailyRoomView.TodayNextMove")
    }

    private var compactContent: some View {
        HStack(spacing: 14) {
            moveIcon

            moveCopy

            Spacer(minLength: 4)

            moveArrow
        }
    }

    private var accessibilityContent: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 14) {
                moveIcon

                MonoLabel(text: "Next Move", size: PatinaTypography.monoSmall)

                Spacer()

                moveArrow
            }

            moveCopy(showLabel: false)
        }
    }

    private var moveIcon: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(PatinaColors.clay.opacity(0.14))
            Image(systemName: move.symbol)
                .font(.system(size: 20, weight: .medium))
                .foregroundStyle(PatinaColors.Text.interactive)
        }
        .frame(width: 54, height: 54)
        .accessibilityHidden(true)
    }

    private var moveCopy: some View {
        moveCopy(showLabel: true)
    }

    private func moveCopy(showLabel: Bool) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            if showLabel {
                MonoLabel(text: "Next Move", size: PatinaTypography.monoSmall)
            }
            Text(move.title)
                .font(PatinaTypography.h5)
                .foregroundStyle(PatinaColors.Text.primary)
                .fixedSize(horizontal: false, vertical: true)
            Text(move.detail)
                .font(PatinaTypography.caption)
                .foregroundStyle(PatinaColors.Text.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var moveArrow: some View {
        Image(systemName: "arrow.up.right")
            .font(.system(size: 14, weight: .medium))
            .foregroundStyle(PatinaColors.Text.interactive)
            .accessibilityHidden(true)
    }
}

// `TodayActiveRoomCard` and its artwork lived here until the Record took the
// home: one active room is now one card on YOUR HOUSE (`YourHouseRail`), which
// draws the designer's project rooms beside it. Nothing referenced them once
// `DailyRoomView` was recomposed, so they are gone rather than dead.
