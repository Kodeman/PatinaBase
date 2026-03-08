//
//  QuickActionsBar.swift
//  Patina
//
//  Horizontal scrolling bar of quick action chips
//  Appears during pull gesture and in expanded state
//  Per spec section 4.4: 48px height
//

import SwiftUI

// MARK: - Quick Actions Bar

/// Horizontal scrolling bar of context-aware quick actions
/// Per spec: 48px height, horizontal scroll, 8px vertical / 14px horizontal padding on chips
public struct QuickActionsBar: View {
    let actions: [QuickAction]
    let onAction: (QuickAction) -> Void

    @State private var visibleActions: Set<UUID> = []

    // Per spec section 4.4: 48px height
    private let barHeight: CGFloat = 48

    public init(
        actions: [QuickAction],
        onAction: @escaping (QuickAction) -> Void
    ) {
        self.actions = actions
        self.onAction = onAction
    }

    public var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: PatinaSpacing.sm) {
                ForEach(Array(actions.enumerated()), id: \.element.id) { index, action in
                    QuickActionChip(action: action) {
                        onAction(action)
                    }
                    .opacity(visibleActions.contains(action.id) ? 1 : 0)
                    .offset(y: visibleActions.contains(action.id) ? 0 : 10)
                    .onAppear {
                        // Stagger animation for each chip
                        let delay = 0.05 * Double(index)
                        withAnimation(.spring(response: 0.4, dampingFraction: 0.8).delay(delay)) {
                            visibleActions.insert(action.id)
                        }
                    }
                }
            }
            .padding(.horizontal, PatinaSpacing.lg)
        }
        .frame(height: barHeight)  // 48px per spec
    }
}

// MARK: - Quick Action Chip

/// Individual quick action button
/// Per spec: 8px vertical padding, 14px horizontal padding
public struct QuickActionChip: View {
    let action: QuickAction
    let onTap: () -> Void

    public init(action: QuickAction, onTap: @escaping () -> Void) {
        self.action = action
        self.onTap = onTap
    }

    public var body: some View {
        Button(action: {
            HapticManager.shared.impact(.light)
            onTap()
        }) {
            HStack(spacing: PatinaSpacing.xs) {
                if action.isPrimary {
                    Image(systemName: action.icon)
                        .font(.system(size: 12, weight: .medium))
                }

                Text(action.title)
                    .font(.system(size: 12, weight: .medium))  // Spec: Inter Medium 12pt
            }
            .foregroundColor(action.isPrimary ? .white : PatinaColors.mochaBrown)
            .padding(.horizontal, 14)  // Spec: 14px horizontal
            .padding(.vertical, 8)      // Spec: 8px vertical
            .background(
                action.isPrimary
                    ? AnyShapeStyle(PatinaColors.clayBeige)
                    : AnyShapeStyle(PatinaColors.Background.secondary)
            )
            .cornerRadius(PatinaRadius.xl)
        }
        .buttonStyle(PressableButtonStyle())
    }
}

// MARK: - Context Indicator

/// Shows current context at the top of expanded Companion
public struct ContextIndicator: View {
    let context: CompanionContext
    let hasNotification: Bool

    public init(context: CompanionContext, hasNotification: Bool = false) {
        self.context = context
        self.hasNotification = hasNotification
    }

    public var body: some View {
        HStack(spacing: PatinaSpacing.sm) {
            // Context icon
            ZStack {
                RoundedRectangle(cornerRadius: PatinaRadius.sm)
                    .fill(hasNotification ? PatinaColors.clayBeige : PatinaColors.Background.secondary)
                    .frame(width: 28, height: 28)

                Image(systemName: context.contextIcon)
                    .font(.system(size: 12))
                    .foregroundColor(hasNotification ? .white : PatinaColors.mochaBrown)
            }

            // Context text
            Text(context.contextSummary)
                .font(PatinaTypography.caption)
                .foregroundColor(hasNotification ? .white : PatinaColors.Text.secondary)
                .lineLimit(1)

            Spacer()
        }
        .padding(.horizontal, PatinaSpacing.md)
        .padding(.vertical, PatinaSpacing.sm)
        .background(hasNotification ? PatinaColors.clayBeige : PatinaColors.Background.secondary)
    }
}

// MARK: - Notification Banner

/// Banner shown when Companion has a notification to share
public struct CompanionNotificationBanner: View {
    let notification: CompanionNotification
    let onShow: () -> Void
    let onDismiss: () -> Void
    let onTellMore: () -> Void

    public init(
        notification: CompanionNotification,
        onShow: @escaping () -> Void,
        onDismiss: @escaping () -> Void,
        onTellMore: @escaping () -> Void
    ) {
        self.notification = notification
        self.onShow = onShow
        self.onDismiss = onDismiss
        self.onTellMore = onTellMore
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: PatinaSpacing.md) {
            // Notification message
            Text(notification.message)
                .font(PatinaTypography.patinaVoice)
                .foregroundColor(PatinaColors.Text.primary)
                .lineSpacing(4)

            // Quick actions
            HStack(spacing: PatinaSpacing.sm) {
                Button("Show me") {
                    HapticManager.shared.impact(.light)
                    onShow()
                }
                .font(PatinaTypography.bodySmallMedium)
                .foregroundColor(.white)
                .padding(.horizontal, PatinaSpacing.md)
                .padding(.vertical, PatinaSpacing.sm)
                .background(PatinaColors.clayBeige)
                .cornerRadius(PatinaRadius.lg)

                Button("Later") {
                    onDismiss()
                }
                .font(PatinaTypography.bodySmall)
                .foregroundColor(PatinaColors.Text.muted)

                Button("Tell me more first") {
                    onTellMore()
                }
                .font(PatinaTypography.bodySmall)
                .foregroundColor(PatinaColors.Text.secondary)
            }
        }
        .padding(PatinaSpacing.lg)
        .background(PatinaColors.Background.secondary)
        .cornerRadius(PatinaRadius.lg)
    }
}

// MARK: - Preview

#Preview("Quick Actions Bar") {
    VStack {
        QuickActionsBar(
            actions: QuickActionFactory.actions(for: .roomList),
            onAction: { action in
                print("Selected: \(action.title)")
            }
        )
        .background(Color.white)

        QuickActionsBar(
            actions: QuickActionFactory.actions(for: .emergence(pieceId: nil)),
            onAction: { _ in }
        )
        .background(Color.white)
    }
    .padding()
    .background(PatinaColors.Background.primary)
}

#Preview("Context Indicator") {
    VStack(spacing: 20) {
        ContextIndicator(
            context: CompanionContext(currentScreen: .table, tableItemCount: 4),
            hasNotification: false
        )

        ContextIndicator(
            context: CompanionContext(currentScreen: .emergence(pieceId: nil)),
            hasNotification: true
        )
    }
    .padding()
}
