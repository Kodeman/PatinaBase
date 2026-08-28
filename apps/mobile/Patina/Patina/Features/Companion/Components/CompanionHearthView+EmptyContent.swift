//
//  CompanionHearthView+EmptyContent.swift
//  Patina
//
//  The no-expanded-content convenience initialiser, lifted out of
//  `CompanionHearthView.swift` so that file stays inside the length gate.
//

import SwiftUI

public extension CompanionHearthView where ExpandedContent == EmptyView {
    init(
        presentation: CompanionPresentationState,
        attention: MarkAttention = .calm,
        wakePhase: WakePhase = .awake,
        onPrimaryAction: (() -> Void)? = nil,
        onHintAction: (() -> Void)? = nil,
        onDismiss: (() -> Void)? = nil
    ) {
        self.init(
            presentation: presentation,
            attention: attention,
            wakePhase: wakePhase,
            onPrimaryAction: onPrimaryAction,
            onHintAction: onHintAction,
            onDismiss: onDismiss
        ) {
            EmptyView()
        }
    }
}
