//
//  ContextBar.swift
//  Patina
//
//  Context bar for expanded Companion showing current screen context
//  Per spec section 4.4: 40px height, icon + label, Soft Cream background
//

import SwiftUI

/// Context bar displayed at the top of expanded Companion
/// Shows current screen context with icon and label
public struct ContextBar: View {
    let context: CompanionContext
    var hasNotification: Bool = false

    // Per spec: 40px height
    private let barHeight: CGFloat = 40

    public init(context: CompanionContext, hasNotification: Bool = false) {
        self.context = context
        self.hasNotification = hasNotification
    }

    public var body: some View {
        HStack(spacing: PatinaSpacing.sm) {
            // Context icon (spec: 20×20px rounded square)
            ZStack {
                RoundedRectangle(cornerRadius: PatinaRadius.sm)
                    .fill(hasNotification ? PatinaColors.clayBeige : PatinaColors.Background.secondary)
                    .frame(width: 20, height: 20)

                Image(systemName: context.contextIcon)
                    .font(.system(size: 10, weight: .medium))
                    .foregroundColor(hasNotification ? .white : PatinaColors.mochaBrown)
            }

            // Context label (spec: 11pt Inter, Mocha Brown)
            Text(contextLabel)
                .font(.system(size: 11, weight: .regular))  // 11pt Inter
                .foregroundColor(hasNotification ? .white : PatinaColors.mochaBrown)
                .lineLimit(1)

            Spacer()
        }
        .padding(.horizontal, PatinaSpacing.md)
        .frame(height: barHeight)
        .background(hasNotification ? PatinaColors.clayBeige : PatinaColors.Background.secondary)
    }

    // MARK: - Context Labels (per spec section 5.2)

    private var contextLabel: String {
        switch context.currentScreen {
        case .conversation:
            return "Getting to know you"

        case .walk, .walkSession:
            if let room = context.activeRoom {
                let progress = Int((context.walkProgress ?? 0) * 100)
                return "Walking: \(room.name) (\(progress)% complete)"
            }
            return "Walking your space"

        case .emergence:
            if let piece = context.viewingPiece {
                return "Viewing: \(piece.name) by \(piece.maker)"
            }
            return "Something emerged"

        case .table:
            let count = context.tableItemCount
            return "Your Table: \(count) piece\(count == 1 ? "" : "s") gathering"

        case .roomList:
            return "Your Rooms"

        case .pieceDetail:
            if let piece = context.viewingPiece {
                return "Viewing: \(piece.name)"
            }
            return "Piece details"

        default:
            return context.contextSummary
        }
    }
}

// MARK: - Preview

#Preview("Default") {
    VStack(spacing: 20) {
        ContextBar(
            context: CompanionContext(currentScreen: .roomList, roomCount: 3),
            hasNotification: false
        )

        ContextBar(
            context: CompanionContext(currentScreen: .table, tableItemCount: 4),
            hasNotification: false
        )

        ContextBar(
            context: CompanionContext(currentScreen: .emergence(pieceId: nil)),
            hasNotification: true
        )
    }
    .padding()
    .background(PatinaColors.Background.primary)
}
