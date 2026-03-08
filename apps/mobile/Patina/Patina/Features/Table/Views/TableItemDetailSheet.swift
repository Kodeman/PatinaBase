//
//  TableItemDetailSheet.swift
//  Patina
//
//  Detail sheet for viewing and editing a saved table item
//

import SwiftUI

/// Detail view for a table item
public struct TableItemDetailSheet: View {

    // MARK: - Properties

    let item: TableItemModel
    let onDismiss: () -> Void
    let onDelete: () -> Void
    let onUpdateNotes: (String) -> Void

    @State private var notes: String = ""
    @State private var isEditing = false
    @State private var showDeleteConfirmation = false

    // MARK: - Body

    public var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: PatinaSpacing.lg) {
                    // Hero image
                    heroImage

                    // Content
                    VStack(spacing: PatinaSpacing.md) {
                        // Title and brand
                        titleSection

                        Divider()
                            .background(PatinaColors.clayBeige.opacity(0.3))

                        // Stats section
                        statsSection

                        Divider()
                            .background(PatinaColors.clayBeige.opacity(0.3))

                        // Patina section
                        patinaSection

                        Divider()
                            .background(PatinaColors.clayBeige.opacity(0.3))

                        // Notes section
                        notesSection

                        Spacer(minLength: PatinaSpacing.xl)
                    }
                    .padding(.horizontal, PatinaSpacing.lg)
                }
            }
            .background(PatinaColors.Background.primary)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Done") {
                        onDismiss()
                    }
                    .foregroundStyle(PatinaColors.mochaBrown)
                }

                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button(role: .destructive) {
                            showDeleteConfirmation = true
                        } label: {
                            Label("Remove from Table", systemImage: "trash")
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                            .foregroundStyle(PatinaColors.mochaBrown)
                    }
                }
            }
            .confirmationDialog(
                "Remove from Table?",
                isPresented: $showDeleteConfirmation,
                titleVisibility: .visible
            ) {
                Button("Remove", role: .destructive) {
                    onDelete()
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("This item will be removed from your table. This action cannot be undone.")
            }
            .onAppear {
                notes = item.notes ?? ""
            }
        }
    }

    // MARK: - Subviews

    private var heroImage: some View {
        ZStack {
            // Background
            PatinaColors.offWhite

            if let imageURL = item.imageURL, let url = URL(string: imageURL) {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let image):
                        image
                            .resizable()
                            .aspectRatio(contentMode: .fit)
                    case .failure:
                        imagePlaceholder
                    case .empty:
                        ProgressView()
                            .tint(PatinaColors.clayBeige)
                    @unknown default:
                        imagePlaceholder
                    }
                }
            } else {
                imagePlaceholder
            }

            // Patina badge overlay
            VStack {
                HStack {
                    Spacer()
                    PatinaBadge(level: PatinaLevel(days: item.daysSinceSaved))
                        .padding(PatinaSpacing.md)
                }
                Spacer()
            }
        }
        .frame(height: 300)
        .patinaEffect(days: item.daysSinceSaved, animated: false)
        .padding(.horizontal, PatinaSpacing.lg)
        .padding(.top, PatinaSpacing.md)
    }

    private var imagePlaceholder: some View {
        VStack(spacing: PatinaSpacing.sm) {
            Image(systemName: "chair.lounge.fill")
                .font(.system(size: 64))
                .foregroundStyle(PatinaColors.clayBeige)

            Text("No image")
                .font(PatinaTypography.bodySmall)
                .foregroundStyle(PatinaColors.clayBeige)
        }
    }

    private var titleSection: some View {
        VStack(alignment: .leading, spacing: PatinaSpacing.xs) {
            Text(item.name)
                .font(PatinaTypography.headlineSerif)
                .foregroundStyle(PatinaColors.charcoal)

            if let brand = item.brandName {
                Text(brand)
                    .font(PatinaTypography.body)
                    .foregroundStyle(PatinaColors.mochaBrown)
            }

            if let price = item.formattedPrice {
                Text(price)
                    .font(PatinaTypography.headlineMedium)
                    .foregroundStyle(PatinaColors.charcoal)
                    .padding(.top, PatinaSpacing.xxs)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var statsSection: some View {
        HStack(spacing: PatinaSpacing.lg) {
            StatItem(
                icon: "calendar",
                title: "Saved",
                value: formattedSaveDate
            )

            StatItem(
                icon: "eye",
                title: "Views",
                value: "\(item.viewCount)"
            )

            StatItem(
                icon: "clock",
                title: "Age",
                value: "\(item.daysSinceSaved)d"
            )
        }
        .frame(maxWidth: .infinity)
    }

    private var patinaSection: some View {
        VStack(alignment: .leading, spacing: PatinaSpacing.sm) {
            Text("Patina Development")
                .font(PatinaTypography.bodyMedium)
                .foregroundStyle(PatinaColors.charcoal)

            // Progress bar
            VStack(alignment: .leading, spacing: PatinaSpacing.xs) {
                GeometryReader { geometry in
                    ZStack(alignment: .leading) {
                        // Background track
                        RoundedRectangle(cornerRadius: 4)
                            .fill(PatinaColors.clayBeige.opacity(0.2))

                        // Progress fill
                        RoundedRectangle(cornerRadius: 4)
                            .fill(
                                LinearGradient(
                                    colors: [
                                        PatinaColors.clayBeige,
                                        PatinaColors.mochaBrown
                                    ],
                                    startPoint: .leading,
                                    endPoint: .trailing
                                )
                            )
                            .frame(width: geometry.size.width * item.patinaLevel)
                    }
                }
                .frame(height: 8)

                HStack {
                    Text("Fresh")
                        .font(PatinaTypography.caption)
                        .foregroundStyle(PatinaColors.clayBeige)

                    Spacer()

                    Text("\(Int(item.patinaLevel * 100))% developed")
                        .font(PatinaTypography.captionMedium)
                        .foregroundStyle(PatinaColors.mochaBrown)

                    Spacer()

                    Text("Antique")
                        .font(PatinaTypography.caption)
                        .foregroundStyle(PatinaColors.clayBeige)
                }
            }

            Text("Items develop patina over time. After 30 days, they reach full antique status.")
                .font(PatinaTypography.caption)
                .foregroundStyle(PatinaColors.mochaBrown.opacity(0.8))
                .padding(.top, PatinaSpacing.xxs)
        }
    }

    private var notesSection: some View {
        VStack(alignment: .leading, spacing: PatinaSpacing.sm) {
            HStack {
                Text("Notes")
                    .font(PatinaTypography.bodyMedium)
                    .foregroundStyle(PatinaColors.charcoal)

                Spacer()

                Button(isEditing ? "Done" : "Edit") {
                    if isEditing && notes != item.notes {
                        onUpdateNotes(notes)
                    }
                    isEditing.toggle()
                }
                .font(PatinaTypography.bodySmallMedium)
                .foregroundStyle(PatinaColors.mochaBrown)
            }

            if isEditing {
                TextEditor(text: $notes)
                    .font(PatinaTypography.body)
                    .foregroundStyle(PatinaColors.charcoal)
                    .scrollContentBackground(.hidden)
                    .padding(PatinaSpacing.sm)
                    .frame(minHeight: 100)
                    .background(PatinaColors.offWhite)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .overlay {
                        RoundedRectangle(cornerRadius: 8)
                            .strokeBorder(PatinaColors.clayBeige.opacity(0.5), lineWidth: 1)
                    }
            } else {
                if notes.isEmpty {
                    Text("Tap edit to add notes about this piece")
                        .font(PatinaTypography.body)
                        .foregroundStyle(PatinaColors.clayBeige)
                        .italic()
                } else {
                    Text(notes)
                        .font(PatinaTypography.body)
                        .foregroundStyle(PatinaColors.charcoal)
                }
            }
        }
    }

    // MARK: - Helpers

    private var formattedSaveDate: String {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        return formatter.string(from: item.savedAt)
    }
}

// MARK: - Stat Item

private struct StatItem: View {
    let icon: String
    let title: String
    let value: String

    var body: some View {
        VStack(spacing: PatinaSpacing.xxs) {
            Image(systemName: icon)
                .font(.system(size: 20))
                .foregroundStyle(PatinaColors.clayBeige)

            Text(value)
                .font(PatinaTypography.bodyMedium)
                .foregroundStyle(PatinaColors.charcoal)

            Text(title)
                .font(PatinaTypography.caption)
                .foregroundStyle(PatinaColors.mochaBrown)
        }
        .frame(maxWidth: .infinity)
    }
}

// MARK: - Preview

#Preview("Table Item Detail") {
    let item = TableItemModel(
        name: "Mid-Century Lounge Chair",
        productId: "123",
        savedAt: Date().addingTimeInterval(-86400 * 20),
        notes: "Love the walnut finish. Would look great in the reading nook.",
        brandName: "Herman Miller",
        priceInCents: 289900
    )
    item.viewCount = 12

    return TableItemDetailSheet(
        item: item,
        onDismiss: {},
        onDelete: {},
        onUpdateNotes: { _ in }
    )
}
