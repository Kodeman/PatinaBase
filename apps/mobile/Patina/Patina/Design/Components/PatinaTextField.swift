//
//  PatinaTextField.swift
//  Patina
//
//  Patina Design System - Text Field
//
//  The de-facto "softCream fill + pearl/clay border" text field, lifted
//  into a single reusable component (PT-5-2). Supports an optional label,
//  placeholder, helper text, an error state, and a secure variant.
//

import SwiftUI

/// Patina Design System - Text Field
///
/// A labelled text field matching the de-facto pattern across the app
/// (soft-cream fill, rounded clay-tinted border). Use the `error` binding
/// to surface validation copy; when set, the border and helper text turn
/// to the error accent.
public struct PatinaTextField: View {
    private let label: String?
    private let placeholder: String
    @Binding private var text: String
    private let helper: String?
    private let error: String?
    private let icon: String?
    private let isSecure: Bool
    private let keyboardType: UIKeyboardType
    private let textContentType: UITextContentType?
    private let autocapitalization: TextInputAutocapitalization

    @FocusState private var isFocused: Bool

    public init(
        _ placeholder: String,
        text: Binding<String>,
        label: String? = nil,
        helper: String? = nil,
        error: String? = nil,
        icon: String? = nil,
        isSecure: Bool = false,
        keyboardType: UIKeyboardType = .default,
        textContentType: UITextContentType? = nil,
        autocapitalization: TextInputAutocapitalization = .sentences
    ) {
        self.placeholder = placeholder
        self._text = text
        self.label = label
        self.helper = helper
        self.error = error
        self.icon = icon
        self.isSecure = isSecure
        self.keyboardType = keyboardType
        self.textContentType = textContentType
        self.autocapitalization = autocapitalization
    }

    private var hasError: Bool { error?.isEmpty == false }

    private var borderColor: Color {
        if hasError { return PatinaColors.error }
        return isFocused
            ? PatinaColors.Text.interactive.opacity(0.5)
            : PatinaColors.clay.opacity(0.2)
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: PatinaSpacing.xs) {
            if let label {
                Text(label)
                    .font(PatinaTypography.caption)
                    .foregroundStyle(PatinaColors.Text.muted)
            }

            HStack(spacing: PatinaSpacing.md) {
                if let icon {
                    Image(systemName: icon)
                        .foregroundStyle(
                            hasError ? PatinaColors.error : PatinaColors.Text.muted
                        )
                        .frame(width: 20)
                }

                field
                    .foregroundStyle(PatinaColors.Text.primary)
                    .tint(PatinaColors.Text.secondary)
                    .focused($isFocused)
            }
            .font(PatinaTypography.body)
            .padding(PatinaSpacing.md)
            .background(PatinaColors.Background.secondary)
            .clipShape(RoundedRectangle(cornerRadius: PatinaRadius.lg))
            .overlay(
                RoundedRectangle(cornerRadius: PatinaRadius.lg)
                    .stroke(borderColor, lineWidth: hasError ? 1.5 : 1)
            )
            .animation(.easeInOut(duration: 0.15), value: isFocused)
            .animation(.easeInOut(duration: 0.15), value: hasError)

            // Helper / error supporting text. Error wins when present.
            if let error, !error.isEmpty {
                Text(error)
                    .font(PatinaTypography.caption)
                    .foregroundStyle(PatinaColors.error)
                    .accessibilityIdentifier("patinaTextField.errorText")
            } else if let helper, !helper.isEmpty {
                Text(helper)
                    .font(PatinaTypography.caption)
                    .foregroundStyle(PatinaColors.Text.muted)
            }
        }
    }

    @ViewBuilder
    private var field: some View {
        if isSecure {
            SecureField(placeholder, text: $text)
                .textContentType(textContentType)
        } else {
            TextField(placeholder, text: $text)
                .keyboardType(keyboardType)
                .textContentType(textContentType)
                .textInputAutocapitalization(autocapitalization)
        }
    }
}

// MARK: - Preview

#Preview {
    struct PatinaTextFieldPreview: View {
        @State private var email = ""
        @State private var password = "hunter2"
        @State private var name = "Edo"

        var body: some View {
            VStack(spacing: PatinaSpacing.lg) {
                PatinaTextField(
                    "you@example.com",
                    text: $email,
                    label: "Email",
                    helper: "We'll only use this to sign you in.",
                    icon: "envelope",
                    keyboardType: .emailAddress,
                    textContentType: .emailAddress,
                    autocapitalization: .never
                )

                PatinaTextField(
                    "Password",
                    text: $password,
                    label: "Password",
                    error: "Must be at least 8 characters.",
                    icon: "lock",
                    isSecure: true,
                    textContentType: .password
                )

                PatinaTextField(
                    "Display name",
                    text: $name,
                    label: "Display name",
                    icon: "person"
                )
            }
            .padding(PatinaSpacing.xl)
            .background(PatinaColors.Background.primary)
        }
    }

    return PatinaTextFieldPreview()
}
