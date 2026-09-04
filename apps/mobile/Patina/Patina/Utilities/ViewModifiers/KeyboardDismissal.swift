//
//  KeyboardDismissal.swift
//  Patina
//
//  C9-08 — a keyboard-dismiss affordance, which the app had nowhere.
//
//  Six `.numberPad` / `.decimalPad` fields ship today and a number pad has no
//  Return key, so once it is up the only way out is a control it is covering.
//  The worst of them is the six-digit sign-in code at
//  `AuthenticationView.swift:327`: the pad covers Verify, and the audit's grep
//  over all 589 Swift files found zero `ToolbarItemGroup(placement: .keyboard)`,
//  zero `.scrollDismissesKeyboard` and zero `endEditing` / `resignFirstResponder`.
//
//  Lives in `Utilities/` rather than a feature folder because the other five
//  fields belong to other screens: `RoomBudgetSheet`, `ManualRoomEntryView`
//  (×2), `RoomSettingsView` and `ScanFallbackEntryView`.
//

import SwiftUI
import UIKit

public extension View {

    /// A "Done" bar above the keyboard, for screens whose keyboards have no
    /// Return key — `.numberPad` and `.decimalPad`.
    ///
    /// **One per SCREEN, never one per field** (`W1-B-01`). SwiftUI merges
    /// every `ToolbarItemGroup(placement: .keyboard)` in the hierarchy into one
    /// accessory bar, so `ManualRoomEntryView`'s three pad fields — each
    /// carrying this modifier — drew *three* "Done" buttons side by side. The
    /// button resigns whatever is first responder rather than clearing a
    /// `@FocusState` of its own, which is what lets it live at the screen root
    /// instead of on the field.
    func keyboardDoneToolbar() -> some View {
        modifier(KeyboardDoneToolbar())
    }

    /// Swiping the scroll view puts the keyboard away, which is what the rest
    /// of iOS does. Put it on the scroll view of any form.
    func dismissKeyboardOnScroll() -> some View {
        scrollDismissesKeyboard(.interactively)
    }
}

private struct KeyboardDoneToolbar: ViewModifier {

    func body(content: Content) -> some View {
        content
            .toolbar {
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("Done") { Self.resignFirstResponder() }
                        .font(PatinaTypography.bodyMedium)
                        .foregroundStyle(PatinaColors.Text.interactive)
                        .accessibilityIdentifier("keyboard.doneButton")
                }
            }
    }

    /// Put the keyboard away without owning the focus. The previous version
    /// carried its own `@FocusState` and had to be attached to the field,
    /// which is what forced one toolbar per field (`W1-B-01`).
    private static func resignFirstResponder() {
        UIApplication.shared.sendAction(
            #selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil
        )
    }
}
