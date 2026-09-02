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

public extension View {

    /// A "Done" bar above the keyboard. Put it on every field whose keyboard
    /// has no Return key — every `.numberPad` and `.decimalPad`.
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
    @FocusState private var isFocused: Bool

    func body(content: Content) -> some View {
        content
            .focused($isFocused)
            .toolbar {
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("Done") { isFocused = false }
                        .font(PatinaTypography.bodyMedium)
                        .foregroundStyle(PatinaColors.Text.interactive)
                        .accessibilityIdentifier("keyboard.doneButton")
                }
            }
    }
}
