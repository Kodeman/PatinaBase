//
//  HeroPickerSheet.swift
//  Patina
//
//  Hero-photo picker sheet for the post-scan Review screen (PT-6-3). Shows the
//  top-ranked photos in a grid and lets the user choose the room's hero.
//  Behavior-preserving extraction from ScanReviewView.heroPickerSheet.
//

import SwiftUI

/// Grid sheet for choosing the hero photo.
struct HeroPickerSheet: View {

    let manifest: ScanManifest
    let photoLoader: ScanReviewPhotoLoader
    /// The id currently treated as hero in the UI (nil falls back to manifest).
    let selectedHeroPhotoId: UUID?
    /// Called with the chosen photo id.
    let onSelect: (UUID) -> Void
    /// Dismiss the sheet without changing the selection.
    let onDismiss: () -> Void

    var body: some View {
        let ranked = topPhotosByScore(limit: 10)
        NavigationStack {
            ScrollView {
                LazyVGrid(
                    columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)],
                    spacing: 12
                ) {
                    ForEach(ranked, id: \.id) { photo in
                        Button(action: { onSelect(photo.id) }) {
                            ZStack(alignment: .topTrailing) {
                                photoLoader.image(for: photo)
                                    .frame(height: 180)
                                    .frame(maxWidth: .infinity)
                                    .clipShape(RoundedRectangle(cornerRadius: 12))
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 12)
                                            .stroke(
                                                isEffectiveHero(photoId: photo.id)
                                                    ? PatinaColors.Interactive.active
                                                    : PatinaColors.Border.strong,
                                                lineWidth: isEffectiveHero(photoId: photo.id) ? 2 : 1
                                            )
                                    )

                                if isEffectiveHero(photoId: photo.id) {
                                    Image(systemName: "checkmark.circle.fill")
                                        .font(.system(size: 18))
                                        .foregroundStyle(PatinaColors.Text.primary)
                                        .padding(8)
                                }
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(16)
            }
            .background(PatinaColors.Background.primary.ignoresSafeArea())
            .navigationTitle("Pick Hero Photo")
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

    // MARK: - Hero detection

    private func effectiveHeroEntry() -> ScanManifest.PhotoEntry? {
        if let id = selectedHeroPhotoId,
           let match = manifest.photos.first(where: { $0.id == id }) {
            return match
        }
        if let manifestHero = manifest.photos.first(where: { $0.isUserSelectedHero }) {
            return manifestHero
        }
        if let heroKind = manifest.photos.first(where: { $0.kind == .hero }) {
            return heroKind
        }
        return manifest.photos.first
    }

    private func isEffectiveHero(photoId: UUID) -> Bool {
        effectiveHeroEntry()?.id == photoId
    }

    // MARK: - Ranking

    /// Top photos by quality score — falls back to capture order when scores
    /// are nil so the picker always has something to show.
    private func topPhotosByScore(limit: Int) -> [ScanManifest.PhotoEntry] {
        let ranked = manifest.photos.sorted { lhs, rhs in
            Self.rankingKey(for: lhs) > Self.rankingKey(for: rhs)
        }
        return Array(ranked.prefix(limit))
    }

    /// Ranking fallback: quality score when available, otherwise a small
    /// negative based on capture order so later shots lose the tiebreaker.
    private static func rankingKey(for photo: ScanManifest.PhotoEntry) -> Float {
        if let score = photo.qualityScore { return score }
        if let idx = photo.orderIndex { return -Float(idx) / 1000.0 }
        return -Float(photo.timestampSeconds) / 1000.0
    }
}
