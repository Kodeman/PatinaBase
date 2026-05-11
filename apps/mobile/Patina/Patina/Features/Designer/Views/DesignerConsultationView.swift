//
//  DesignerConsultationView.swift
//  Patina
//
//  Full designer consultation screen per v4 spec:
//  Hero, designer card, room tag selector, vision textarea, submit CTA
//

import SwiftUI
import SwiftData

struct DesignerConsultationView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var modelContext
    @State private var selectedRoomIds: Set<UUID> = []
    @State private var visionText = ""
    @State private var isSubmitting = false
    @State private var showSuccess = false

    // Load rooms for tag selection
    @State private var rooms: [RoomModel] = []

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 0) {
                // Hero
                VStack(alignment: .leading, spacing: 8) {
                    Text("Work with a designer")
                        .font(PatinaTypography.h2)
                        .foregroundColor(PatinaColors.offWhite)

                    Text("Share your vision and rooms. A Patina designer will reach out within 48 hours to help bring your space to life.")
                        .font(PatinaTypography.bodySmall)
                        .foregroundColor(PatinaColors.pearl)
                        .lineSpacing(4)
                }
                .padding(24)
                .padding(.top, 40)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(PatinaColors.charcoal)

                // Designer card
                designerCard
                    .padding(.horizontal, 24)
                    .padding(.top, 28)

                // Room selection
                VStack(alignment: .leading, spacing: 10) {
                    Text("Which rooms?")
                        .font(PatinaTypography.bodySmallMedium)
                        .foregroundColor(PatinaColors.mocha)

                    if rooms.isEmpty {
                        Text("No rooms scanned yet — scan a room first for better recommendations")
                            .font(PatinaTypography.caption)
                            .foregroundColor(PatinaColors.agedOak)
                    } else {
                        FlowLayout(spacing: 8) {
                            ForEach(rooms) { room in
                                roomTag(room)
                            }
                        }
                    }
                }
                .padding(.horizontal, 24)
                .padding(.top, 24)

                // Vision text
                VStack(alignment: .leading, spacing: 10) {
                    Text("Your vision")
                        .font(PatinaTypography.bodySmallMedium)
                        .foregroundColor(PatinaColors.mocha)

                    ZStack(alignment: .topLeading) {
                        if visionText.isEmpty {
                            Text("I want a space that feels...")
                                .font(PatinaTypography.bodySmall)
                                .foregroundColor(PatinaColors.agedOak)
                                .italic()
                                .padding(.horizontal, 14)
                                .padding(.vertical, 12)
                        }

                        TextEditor(text: $visionText)
                            .font(PatinaTypography.bodySmall)
                            .foregroundColor(PatinaColors.charcoal)
                            .scrollContentBackground(.hidden)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 8)
                    }
                    .frame(minHeight: 100)
                    .background(PatinaColors.softCream)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(PatinaColors.pearl, lineWidth: 1.5)
                    )
                }
                .padding(.horizontal, 24)
                .padding(.top, 24)

                // Submit
                PatinaButton("Submit Request", style: .primary) {
                    submitRequest()
                }
                .padding(.horizontal, 24)
                .padding(.top, 32)
                .padding(.bottom, 120)
                .disabled(isSubmitting)
                .opacity(isSubmitting ? 0.6 : 1)
            }
        }
        .background(PatinaColors.offWhite)
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { loadRooms() }
        .overlay {
            if showSuccess {
                successOverlay
            }
        }
    }

    // MARK: - Designer Card

    private var designerCard: some View {
        HStack(spacing: 16) {
            Circle()
                .fill(PatinaGradients.earth)
                .frame(width: 60, height: 60)

            VStack(alignment: .leading, spacing: 4) {
                Text("Matched Designer")
                    .font(PatinaTypography.h5)
                    .foregroundColor(PatinaColors.charcoal)

                MonoLabel(text: "Based on your style profile")

                Text("We'll pair you with a designer who understands your aesthetic")
                    .font(PatinaTypography.caption)
                    .foregroundColor(PatinaColors.mocha)
                    .lineSpacing(2)
            }
        }
        .padding(20)
        .background(PatinaColors.softCream)
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }

    // MARK: - Room Tag

    private func roomTag(_ room: RoomModel) -> some View {
        let isSelected = selectedRoomIds.contains(room.id)
        return Button {
            if isSelected {
                selectedRoomIds.remove(room.id)
            } else {
                selectedRoomIds.insert(room.id)
            }
            HapticManager.shared.impact(.light)
        } label: {
            Text(room.name)
                .font(PatinaTypography.caption)
                .foregroundColor(isSelected ? .white : PatinaColors.mocha)
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .background(isSelected ? PatinaColors.clay : PatinaColors.softCream)
                .clipShape(Capsule())
                .overlay(
                    Capsule()
                        .stroke(isSelected ? PatinaColors.clay : PatinaColors.pearl, lineWidth: 1.5)
                )
        }
        .buttonStyle(.plain)
    }

    // MARK: - Submit

    private func submitRequest() {
        guard !isSubmitting else { return }
        isSubmitting = true
        let request = DesignServiceRequest(
            serviceType: .consultation,
            timeline: .flexible,
            budget: .fiveToFifteen,
            description: visionText.trimmingCharacters(in: .whitespacesAndNewlines),
            roomId: selectedRoomIds.first
        )
        Task { @MainActor in
            do {
                _ = try await DesignServicesService.shared.submitRequest(request)
                isSubmitting = false
                showSuccess = true
                HapticManager.shared.notification(.success)
            } catch {
                isSubmitting = false
                HapticManager.shared.notification(.error)
                #if DEBUG
                print("[DesignerConsultation] submit failed: \(error.localizedDescription)")
                #endif
            }
        }
    }

    // MARK: - Success Overlay

    private var successOverlay: some View {
        ZStack {
            Color.black.opacity(0.4)
                .ignoresSafeArea()

            VStack(spacing: 20) {
                ZStack {
                    Circle()
                        .stroke(PatinaColors.clay, lineWidth: 3)
                        .frame(width: 76, height: 76)
                    Image(systemName: "checkmark")
                        .font(.system(size: 30, weight: .medium))
                        .foregroundColor(PatinaColors.clay)
                }

                Text("Request Submitted")
                    .font(PatinaTypography.h3)
                    .foregroundColor(PatinaColors.charcoal)

                Text("A designer will reach out within 48 hours")
                    .font(PatinaTypography.bodySmall)
                    .foregroundColor(PatinaColors.agedOak)
                    .multilineTextAlignment(.center)

                PatinaButton("Done", style: .primary) {
                    dismiss()
                }
                .padding(.horizontal, 40)
                .padding(.top, 8)
            }
            .padding(32)
            .background(PatinaColors.offWhite)
            .clipShape(RoundedRectangle(cornerRadius: 24))
            .padding(.horizontal, 32)
        }
    }

    // MARK: - Data

    private func loadRooms() {
        let descriptor = FetchDescriptor<RoomModel>(sortBy: [SortDescriptor(\.createdAt, order: .reverse)])
        rooms = (try? modelContext.fetch(descriptor)) ?? []
    }
}

#Preview {
    DesignerConsultationView()
}
