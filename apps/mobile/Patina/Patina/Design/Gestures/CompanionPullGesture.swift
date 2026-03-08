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
    /// Add long press to activate voice input (spec section 9.3: 0.5s hold)
    public func companionLongPressGesture(
        onActivate: @escaping () -> Void
    ) -> some View {
        self.onLongPressGesture(
            minimumDuration: CompanionConstants.longPressDuration,  // 0.5s per spec
            maximumDistance: 20
        ) {
            HapticManager.shared.impact(.medium)
            onActivate()
        }
    }
}
