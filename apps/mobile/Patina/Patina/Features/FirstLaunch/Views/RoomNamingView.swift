//
//  RoomNamingView.swift
//  Patina
//
//  Scene 7 of the first-launch flow: Room naming.
//  User names their room after seeing the first emergence.
//

import SwiftUI

/// Room naming view after first emergence
struct RoomNamingView: View {

    // MARK: - Properties

    let onComplete: (String, String) -> Void  // (name, type)

    // MARK: - State

    @State private var roomName = ""
    @State private var selectedType = "Living Room"
    @FocusState private var isNameFocused: Bool

    // MARK: - Animation State

    @State private var headerVisible = false
    @State private var inputVisible = false
    @State private var typesVisible = false
    @State private var buttonVisible = false

    // MARK: - Room Types

    private let roomTypes = [
        "Living Room",
        "Bedroom",
        "Dining Room",
        "Kitchen",
        "Office",
        "Bathroom",
        "Entryway",
        "Other"
    ]

    var body: some View {
        ZStack {
            // Background
            backgroundGradient

            // Content
            ScrollView {
                VStack(spacing: 0) {
                    Spacer(minLength: 60)

                    // Strata mark
                    StrataMarkView(color: PatinaColors.clayBeige, scale: 1.0, breathing: true)
                        .frame(height: 40)
                        .padding(.bottom, PatinaSpacing.xl)
                        .opacity(headerVisible ? 1 : 0)

                    // Header message
                    Text("What shall we call\nthis space?")
                        .font(PatinaTypography.patinaVoice)
                        .foregroundColor(PatinaColors.Text.primary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, PatinaSpacing.xl)
                        .padding(.bottom, PatinaSpacing.xxl)
                        .opacity(headerVisible ? 1 : 0)
                        .offset(y: headerVisible ? 0 : 20)

                    // Room name input
                    VStack(alignment: .leading, spacing: PatinaSpacing.sm) {
                        Text("Room name")
                            .font(PatinaTypography.eyebrow)
                            .foregroundColor(PatinaColors.Text.muted)

                        TextField("e.g., Master Bedroom", text: $roomName)
                            .font(PatinaTypography.body)
                            .padding(PatinaSpacing.md)
                            .background(PatinaColors.Background.secondary.opacity(0.8))
                            .cornerRadius(PatinaRadius.md)
                            .focused($isNameFocused)
                            .accessibilityIdentifier("roomNaming.nameField")
                    }
                    .padding(.horizontal, PatinaSpacing.xl)
                    .padding(.bottom, PatinaSpacing.xl)
                    .opacity(inputVisible ? 1 : 0)
                    .offset(y: inputVisible ? 0 : 20)

                    // Room type selection
                    VStack(alignment: .leading, spacing: PatinaSpacing.sm) {
                        Text("Room type")
                            .font(PatinaTypography.eyebrow)
                            .foregroundColor(PatinaColors.Text.muted)

                        LazyVGrid(columns: [
                            GridItem(.flexible()),
                            GridItem(.flexible())
                        ], spacing: PatinaSpacing.sm) {
                            ForEach(roomTypes, id: \.self) { type in
                                roomTypeButton(type)
                            }
                        }
                    }
                    .padding(.horizontal, PatinaSpacing.xl)
                    .padding(.bottom, PatinaSpacing.xxl)
                    .opacity(typesVisible ? 1 : 0)
                    .offset(y: typesVisible ? 0 : 20)

                    // Save button
                    Button(action: saveRoom) {
                        Text("Save this room")
                            .font(PatinaTypography.bodyMedium)
                            .foregroundColor(PatinaColors.offWhite)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, PatinaSpacing.md)
                            .background(
                                roomName.isEmpty
                                    ? PatinaColors.clayBeige.opacity(0.5)
                                    : PatinaColors.clayBeige
                            )
                            .cornerRadius(PatinaRadius.lg)
                    }
                    .accessibilityIdentifier("roomNaming.saveButton")
                    .disabled(roomName.isEmpty)
                    .buttonStyle(ScaleButtonStyle())
                    .padding(.horizontal, PatinaSpacing.xl)
                    .padding(.bottom, PatinaSpacing.xxxl)
                    .opacity(buttonVisible ? 1 : 0)
                    .offset(y: buttonVisible ? 0 : 20)

                    Spacer(minLength: 100)
                }
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .onAppear {
            animateEntrance()
        }
    }

    // MARK: - Background

    private var backgroundGradient: some View {
        LinearGradient(
            colors: [
                PatinaColors.charcoal,
                PatinaColors.mochaBrown.opacity(0.8),
                PatinaColors.Background.primary
            ],
            startPoint: .top,
            endPoint: .bottom
        )
        .ignoresSafeArea()
    }

    // MARK: - Room Type Button

    private func roomTypeButton(_ type: String) -> some View {
        Button {
            HapticManager.shared.impact(.light)
            selectedType = type
            if roomName.isEmpty {
                roomName = type
            }
        } label: {
            Text(type)
                .font(PatinaTypography.bodySmall)
                .frame(maxWidth: .infinity)
                .padding(PatinaSpacing.md)
                .background(
                    selectedType == type
                        ? PatinaColors.clayBeige.opacity(0.2)
                        : PatinaColors.Background.secondary.opacity(0.8)
                )
                .foregroundColor(
                    selectedType == type
                        ? PatinaColors.clayBeige
                        : PatinaColors.Text.secondary
                )
                .cornerRadius(PatinaRadius.md)
                .overlay(
                    RoundedRectangle(cornerRadius: PatinaRadius.md)
                        .stroke(
                            selectedType == type
                                ? PatinaColors.clayBeige
                                : Color.clear,
                            lineWidth: 1
                        )
                )
        }
        .buttonStyle(.plain)
    }

    // MARK: - Actions

    private func saveRoom() {
        guard !roomName.isEmpty else { return }
        HapticManager.shared.notification(.success)
        onComplete(roomName, selectedType)
    }

    // MARK: - Animation

    private func animateEntrance() {
        // Header
        withAnimation(.spring(response: 0.5, dampingFraction: 0.8).delay(0.2)) {
            headerVisible = true
        }

        // Input field
        withAnimation(.spring(response: 0.5, dampingFraction: 0.8).delay(0.5)) {
            inputVisible = true
        }

        // Room types
        withAnimation(.spring(response: 0.5, dampingFraction: 0.8).delay(0.7)) {
            typesVisible = true
        }

        // Save button
        withAnimation(.spring(response: 0.5, dampingFraction: 0.8).delay(0.9)) {
            buttonVisible = true
        }

        // Auto-focus name field after animation
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            isNameFocused = true
        }
    }
}

// MARK: - Scale Button Style

private struct ScaleButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.97 : 1.0)
            .animation(.easeInOut(duration: 0.15), value: configuration.isPressed)
    }
}

// MARK: - Preview

#Preview("Room Naming") {
    RoomNamingView { name, type in
        print("Room saved: \(name) (\(type))")
    }
}
