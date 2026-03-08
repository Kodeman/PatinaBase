//
//  RequestDesignServicesSheet.swift
//  Patina
//
//  Sheet for requesting design services for a room.
//  Creates a lead in the system for designer matching.
//

import SwiftUI

/// Sheet for requesting design services
struct RequestDesignServicesSheet: View {

    // MARK: - Properties

    let roomId: UUID?
    let roomName: String?
    let onDismiss: () -> Void

    // MARK: - State

    @State private var selectedService: DesignServiceType = .consultation
    @State private var selectedTimeline: DesignTimeline = .flexible
    @State private var selectedBudget: DesignBudget = .fiveToFifteen
    @State private var projectDescription = ""
    @State private var isSubmitting = false
    @State private var showSuccess = false
    @State private var errorMessage: String?

    @StateObject private var service = DesignServicesService.shared

    // MARK: - Body

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: PatinaSpacing.xl) {
                    // Header with room context
                    if let roomName = roomName {
                        roomContextCard(roomName)
                    }

                    // Service type selection
                    serviceTypeSection

                    // Project description
                    descriptionSection

                    // Timeline selection
                    timelineSection

                    // Budget selection
                    budgetSection

                    Spacer(minLength: 120)
                }
                .padding(.horizontal, PatinaSpacing.xl)
                .padding(.top, PatinaSpacing.lg)
            }
            .background(PatinaColors.Background.primary)
            .navigationTitle("Get Design Help")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        onDismiss()
                    }
                    .foregroundColor(PatinaColors.Text.secondary)
                }
            }
            .overlay(alignment: .bottom) {
                submitButton
            }
            .overlay {
                if showSuccess {
                    successOverlay
                }
            }
        }
    }

    // MARK: - Room Context Card

    private func roomContextCard(_ name: String) -> some View {
        HStack(spacing: PatinaSpacing.md) {
            ZStack {
                RoundedRectangle(cornerRadius: PatinaRadius.md)
                    .fill(PatinaColors.clayBeige.opacity(0.2))
                    .frame(width: 60, height: 60)

                Image(systemName: "cube.transparent")
                    .font(.system(size: 24))
                    .foregroundColor(PatinaColors.clayBeige)
            }

            VStack(alignment: .leading, spacing: 4) {
                Text("Getting help for")
                    .font(PatinaTypography.caption)
                    .foregroundColor(PatinaColors.Text.muted)

                Text(name)
                    .font(PatinaTypography.h3)
                    .foregroundColor(PatinaColors.Text.primary)
            }

            Spacer()
        }
        .padding(PatinaSpacing.lg)
        .background(PatinaColors.Background.secondary)
        .cornerRadius(PatinaRadius.lg)
    }

    // MARK: - Service Type Section

    private var serviceTypeSection: some View {
        VStack(alignment: .leading, spacing: PatinaSpacing.md) {
            Text("What do you need?")
                .font(PatinaTypography.eyebrow)
                .foregroundColor(PatinaColors.Text.muted)

            VStack(spacing: PatinaSpacing.sm) {
                ForEach(DesignServiceType.allCases, id: \.self) { serviceType in
                    Button {
                        withAnimation(.easeInOut(duration: 0.2)) {
                            selectedService = serviceType
                        }
                        HapticManager.shared.impact(.light)
                    } label: {
                        HStack(spacing: PatinaSpacing.md) {
                            Image(systemName: serviceType.icon)
                                .font(.system(size: 20))
                                .foregroundColor(
                                    selectedService == serviceType
                                        ? PatinaColors.clayBeige
                                        : PatinaColors.Text.secondary
                                )
                                .frame(width: 28)

                            VStack(alignment: .leading, spacing: 2) {
                                Text(serviceType.displayName)
                                    .font(PatinaTypography.bodyMedium)
                                    .foregroundColor(PatinaColors.Text.primary)

                                Text(serviceType.description)
                                    .font(PatinaTypography.caption)
                                    .foregroundColor(PatinaColors.Text.muted)
                                    .lineLimit(2)
                            }

                            Spacer()

                            Image(systemName: selectedService == serviceType ? "checkmark.circle.fill" : "circle")
                                .font(.system(size: 22))
                                .foregroundColor(
                                    selectedService == serviceType
                                        ? PatinaColors.clayBeige
                                        : PatinaColors.Text.muted
                                )
                        }
                        .padding(PatinaSpacing.md)
                        .background(
                            selectedService == serviceType
                                ? PatinaColors.clayBeige.opacity(0.1)
                                : PatinaColors.Background.secondary
                        )
                        .cornerRadius(PatinaRadius.md)
                        .overlay(
                            RoundedRectangle(cornerRadius: PatinaRadius.md)
                                .stroke(
                                    selectedService == serviceType ? PatinaColors.clayBeige : Color.clear,
                                    lineWidth: 1.5
                                )
                        )
                    }
                }
            }
        }
    }

    // MARK: - Description Section

    private var descriptionSection: some View {
        VStack(alignment: .leading, spacing: PatinaSpacing.md) {
            Text("Tell us about your vision")
                .font(PatinaTypography.eyebrow)
                .foregroundColor(PatinaColors.Text.muted)

            ZStack(alignment: .topLeading) {
                if projectDescription.isEmpty {
                    Text("What style are you drawn to? Any specific pieces you're looking for? What feeling do you want the space to have?")
                        .font(PatinaTypography.body)
                        .foregroundColor(PatinaColors.Text.muted)
                        .padding(.horizontal, 4)
                        .padding(.top, 8)
                }

                TextEditor(text: $projectDescription)
                    .font(PatinaTypography.body)
                    .foregroundColor(PatinaColors.Text.primary)
                    .scrollContentBackground(.hidden)
                    .frame(minHeight: 120)
            }
            .padding(PatinaSpacing.md)
            .background(PatinaColors.Background.secondary)
            .cornerRadius(PatinaRadius.md)
        }
    }

    // MARK: - Timeline Section

    private var timelineSection: some View {
        VStack(alignment: .leading, spacing: PatinaSpacing.md) {
            Text("When do you want to start?")
                .font(PatinaTypography.eyebrow)
                .foregroundColor(PatinaColors.Text.muted)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: PatinaSpacing.sm) {
                    ForEach(DesignTimeline.allCases, id: \.self) { timeline in
                        Button {
                            withAnimation(.easeInOut(duration: 0.2)) {
                                selectedTimeline = timeline
                            }
                            HapticManager.shared.impact(.light)
                        } label: {
                            Text(timeline.displayName)
                                .font(PatinaTypography.bodySmall)
                                .foregroundColor(
                                    selectedTimeline == timeline
                                        ? PatinaColors.offWhite
                                        : PatinaColors.Text.secondary
                                )
                                .padding(.horizontal, PatinaSpacing.md)
                                .padding(.vertical, PatinaSpacing.sm)
                                .background(
                                    selectedTimeline == timeline
                                        ? PatinaColors.clayBeige
                                        : PatinaColors.Background.secondary
                                )
                                .cornerRadius(PatinaRadius.sm)
                        }
                    }
                }
            }
        }
    }

    // MARK: - Budget Section

    private var budgetSection: some View {
        VStack(alignment: .leading, spacing: PatinaSpacing.md) {
            Text("Budget range")
                .font(PatinaTypography.eyebrow)
                .foregroundColor(PatinaColors.Text.muted)

            VStack(spacing: PatinaSpacing.sm) {
                ForEach(DesignBudget.allCases, id: \.self) { budget in
                    Button {
                        withAnimation(.easeInOut(duration: 0.2)) {
                            selectedBudget = budget
                        }
                        HapticManager.shared.impact(.light)
                    } label: {
                        HStack {
                            Text(budget.displayName)
                                .font(PatinaTypography.bodyMedium)
                                .foregroundColor(PatinaColors.Text.primary)

                            Spacer()

                            Image(systemName: selectedBudget == budget ? "checkmark.circle.fill" : "circle")
                                .font(.system(size: 20))
                                .foregroundColor(
                                    selectedBudget == budget
                                        ? PatinaColors.clayBeige
                                        : PatinaColors.Text.muted
                                )
                        }
                        .padding(PatinaSpacing.md)
                        .background(
                            selectedBudget == budget
                                ? PatinaColors.clayBeige.opacity(0.1)
                                : PatinaColors.Background.secondary
                        )
                        .cornerRadius(PatinaRadius.md)
                        .overlay(
                            RoundedRectangle(cornerRadius: PatinaRadius.md)
                                .stroke(
                                    selectedBudget == budget ? PatinaColors.clayBeige : Color.clear,
                                    lineWidth: 1.5
                                )
                        )
                    }
                }
            }

            // Error message
            if let error = errorMessage {
                Text(error)
                    .font(PatinaTypography.caption)
                    .foregroundColor(.red)
                    .padding(.top, PatinaSpacing.sm)
            }
        }
    }

    // MARK: - Submit Button

    private var submitButton: some View {
        Button {
            Task {
                await submitRequest()
            }
        } label: {
            HStack(spacing: PatinaSpacing.sm) {
                if isSubmitting {
                    ProgressView()
                        .tint(PatinaColors.offWhite)
                } else {
                    Image(systemName: "sparkles")
                    Text("Find My Designer")
                }
            }
            .font(PatinaTypography.bodyMedium)
            .foregroundColor(PatinaColors.offWhite)
            .frame(maxWidth: .infinity)
            .padding(.vertical, PatinaSpacing.md)
            .background(
                projectDescription.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                    ? PatinaColors.clayBeige.opacity(0.5)
                    : PatinaColors.clayBeige
            )
            .cornerRadius(PatinaRadius.lg)
        }
        .disabled(isSubmitting || projectDescription.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        .padding(.horizontal, PatinaSpacing.xl)
        .padding(.bottom, PatinaSpacing.xl)
        .background(
            LinearGradient(
                colors: [
                    PatinaColors.Background.primary.opacity(0),
                    PatinaColors.Background.primary
                ],
                startPoint: .top,
                endPoint: .center
            )
        )
    }

    // MARK: - Success Overlay

    private var successOverlay: some View {
        ZStack {
            Color.black.opacity(0.5)
                .ignoresSafeArea()

            VStack(spacing: PatinaSpacing.lg) {
                Image(systemName: "sparkles")
                    .font(.system(size: 60))
                    .foregroundStyle(
                        LinearGradient(
                            colors: [PatinaColors.clayBeige, PatinaColors.softCream],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )

                Text("Request Sent!")
                    .font(PatinaTypography.h2)
                    .foregroundColor(.white)

                Text("We'll match you with designers who specialize in \(selectedService.displayName.lowercased())")
                    .font(PatinaTypography.body)
                    .foregroundColor(.white.opacity(0.8))
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, PatinaSpacing.xl)

                Text("You'll hear back within 24 hours")
                    .font(PatinaTypography.caption)
                    .foregroundColor(.white.opacity(0.6))
            }
            .padding(PatinaSpacing.xxl)
        }
        .transition(.opacity)
    }

    // MARK: - Actions

    private func submitRequest() async {
        isSubmitting = true
        errorMessage = nil
        defer { isSubmitting = false }

        let request = DesignServiceRequest(
            serviceType: selectedService,
            timeline: selectedTimeline,
            budget: selectedBudget,
            description: projectDescription.trimmingCharacters(in: .whitespacesAndNewlines),
            roomId: roomId
        )

        do {
            _ = try await service.submitRequest(request)

            HapticManager.shared.notification(.success)

            withAnimation(.spring(response: 0.3)) {
                showSuccess = true
            }

            // Dismiss after a delay
            try? await Task.sleep(nanoseconds: 3_000_000_000)
            onDismiss()

        } catch let error as DesignServicesError {
            HapticManager.shared.notification(.error)
            errorMessage = error.errorDescription
        } catch {
            HapticManager.shared.notification(.error)
            errorMessage = error.localizedDescription
        }
    }
}

// MARK: - Preview

#Preview {
    RequestDesignServicesSheet(
        roomId: UUID(),
        roomName: "Living Room",
        onDismiss: {}
    )
}
