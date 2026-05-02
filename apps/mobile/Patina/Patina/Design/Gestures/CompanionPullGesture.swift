//
//  CompanionPullGesture.swift
//  Patina
//
//  Gesture extensions for the floating Companion button
//  Supports tap to expand and swipe down to collapse
//

import SwiftUI

// MARK: - Swipe Down Gesture Modifier

/// Modifier that adds swipe-down-to-collapse behavior for the expanded panel
public struct CompanionSwipeDownModifier: ViewModifier {
    @Binding var state: CompanionState
    var onCollapse: () -> Void

    public func body(content: Content) -> some View {
        content
            .gesture(swipeDownGesture)
    }

    private var swipeDownGesture: some Gesture {
        DragGesture(minimumDistance: 20)
            .onEnded { value in
                // Swipe down to collapse when expanded
                if value.translation.height > 50 && state.isExpanded {
                    withAnimation(.spring(
                        response: CompanionConstants.springResponse,
                        dampingFraction: CompanionConstants.springDamping
                    )) {
                        state = .button
                    }
                    onCollapse()
                }
            }
    }
}

// MARK: - View Extensions

extension View {
    /// Add swipe-down-to-collapse behavior for Companion panel
    public func companionSwipeDownGesture(
        state: Binding<CompanionState>,
        onCollapse: @escaping () -> Void
    ) -> some View {
        modifier(CompanionSwipeDownModifier(
            state: state,
            onCollapse: onCollapse
        ))
    }
}

// MARK: - Tap Gesture Extension

extension View {
    /// Add tap to expand behavior for Companion button
    public func companionTapGesture(
        state: Binding<CompanionState>,
        onExpand: @escaping () -> Void
    ) -> some View {
        self.onTapGesture {
            guard state.wrappedValue.isButton else { return }

            HapticManager.shared.companionPulse()

            withAnimation(.spring(
                response: CompanionConstants.springResponse,
                dampingFraction: CompanionConstants.springDamping
            )) {
                state.wrappedValue = .expanded
            }

            onExpand()
        }
    }
}

// MARK: - Long Press Gesture Extension

extension View {
    /// Add long press to activate voice input (spec section 9.3: 0.5s hold).
    /// Supports drag-away to cancel: while the gesture is active, drag the
    /// finger more than `cancelDistance` (default 100pt) to abort the input
    /// without sending. A warning haptic fires on cancel; a light haptic fires
    /// on a clean release after activation.
    public func companionLongPressGesture(
        cancelDistance: CGFloat = 100,
        onActivate: @escaping () -> Void,
        onCancel: @escaping () -> Void = {},
        onRelease: @escaping () -> Void = {}
    ) -> some View {
        modifier(
            CompanionLongPressDragModifier(
                cancelDistance: cancelDistance,
                onActivate: onActivate,
                onCancel: onCancel,
                onRelease: onRelease
            )
        )
    }
}

private struct CompanionLongPressDragModifier: ViewModifier {
    let cancelDistance: CGFloat
    let onActivate: () -> Void
    let onCancel: () -> Void
    let onRelease: () -> Void

    @State private var didActivate = false
    @State private var didCancel = false

    func body(content: Content) -> some View {
        content.gesture(
            LongPressGesture(minimumDuration: CompanionConstants.longPressDuration, maximumDistance: 20)
                .sequenced(before: DragGesture(minimumDistance: 0))
                .onChanged { value in
                    switch value {
                    case .first:
                        // Long press still in progress — wait for activation.
                        break
                    case .second(let activated, let drag):
                        if activated && !didActivate {
                            didActivate = true
                            HapticManager.shared.impact(.medium)
                            onActivate()
                        }
                        if didActivate, !didCancel,
                           let drag = drag,
                           hypot(drag.translation.width, drag.translation.height) > cancelDistance {
                            didCancel = true
                            HapticManager.shared.notification(.warning)
                            onCancel()
                        }
                    }
                }
                .onEnded { _ in
                    if didActivate && !didCancel {
                        HapticManager.shared.impact(.light)
                        onRelease()
                    }
                    didActivate = false
                    didCancel = false
                }
        )
    }
}
