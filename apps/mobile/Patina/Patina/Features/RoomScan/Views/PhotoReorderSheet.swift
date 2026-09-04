//
//  PhotoReorderSheet.swift
//  Patina
//
//  Supporting-photo reorder sheet for the post-scan Review screen (PT-6-3).
//  A drag-to-reorder list of the visible (non-hero, non-hidden) photos.
//  Behavior-preserving extraction from ScanReviewView.reorderSheet /
//  applyReorder / reorderableTitle.
//

import SwiftUI

/// Drag-to-reorder list for supporting photos.
struct PhotoReorderSheet: View {

    let manifest: ScanManifest
    let photoLoader: ScanReviewPhotoLoader
    /// The id currently treated as hero (excluded from reordering).
    let heroId: UUID?
    /// Photos the user chose to hide (excluded from reordering).
    let hiddenPhotoIds: Set<UUID>
    /// User-entered captions keyed by photo id.
    let captions: [UUID: String]
    /// Working order of photos (mutated in place by `.onMove`).
    @Binding var workingOrder: [UUID]
    /// Dismiss the sheet.
    let onDismiss: () -> Void

    var body: some View {
        let reorderable = workingOrder.filter { id in
            id != heroId && !hiddenPhotoIds.contains(id)
        }
        NavigationStack {
            List {
                ForEach(reorderable, id: \.self) { photoId in
                    if let photo = manifest.photos.first(where: { $0.id == photoId }) {
                        HStack(spacing: 12) {
                            photoLoader.image(for: photo)
                                .frame(width: 56, height: 56)
                                .clipShape(RoundedRectangle(cornerRadius: 8))
                            VStack(alignment: .leading, spacing: 2) {
                                Text(reorderableTitle(for: photo))
                                    .font(PatinaTypography.uiSmall)
                                    .foregroundStyle(PatinaColors.Text.primary)
                                if let caption = captions[photo.id] ?? photo.userAnnotation,
                                   !caption.isEmpty {
                                    Text(caption)
                                        .font(PatinaTypography.captionSmall)
                                        .foregroundStyle(PatinaColors.Text.muted)
                                        .lineLimit(1)
                                }
                            }
                            Spacer()
                            Image(systemName: "line.3.horizontal")
                                .font(.system(size: 14, weight: .regular))
                                .foregroundStyle(PatinaColors.Text.muted.opacity(0.6))
                        }
                        .padding(.vertical, 4)
                    }
                }
                .onMove { indices, newOffset in
                    applyReorder(indices: indices, newOffset: newOffset)
                }
            }
            .listStyle(.plain)
            .environment(\.editMode, .constant(.active))
            .background(PatinaColors.Background.primary.ignoresSafeArea())
            .scrollContentBackground(.hidden)
            .navigationTitle("Reorder Photos")
            .toolbarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { onDismiss() }
                        .foregroundStyle(PatinaColors.Text.primary)
                }
            }
        }
        .presentationDetents([.large])
    }

    /// Apply a reorder delta from a SwiftUI List `.onMove` against the subset
    /// of `workingOrder` that is currently visible (non-hero, non-hidden).
    private func applyReorder(indices: IndexSet, newOffset: Int) {
        var visible = workingOrder.filter { id in
            id != heroId && !hiddenPhotoIds.contains(id)
        }
        visible.move(fromOffsets: indices, toOffset: newOffset)

        // Reassemble workingOrder: keep hero at its current slot, preserve
        // hidden photos at their current positions, splice the reordered
        // visible sequence into the remaining slots in order.
        var result: [UUID] = []
        var visibleIter = visible.makeIterator()
        for id in workingOrder {
            if id == heroId || hiddenPhotoIds.contains(id) {
                result.append(id)
            } else if let next = visibleIter.next() {
                result.append(next)
            }
        }
        workingOrder = result
    }

    private func reorderableTitle(for photo: ScanManifest.PhotoEntry) -> String {
        if let feature = photo.associatedFeatureCategory, !feature.isEmpty {
            return feature.capitalized
        }
        switch photo.kind {
        case .hero: return "Hero"
        case .auto: return "Photo"
        case .user: return "Tapped"
        case .feature: return "Feature"
        }
    }
}
