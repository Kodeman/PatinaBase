//
//  CaptionEditorSheet.swift
//  Patina
//
//  Per-photo caption editor sheet for the post-scan Review screen (PT-6-3).
//  Shows the photo and a free-form note editor bound to the parent's captions.
//  Behavior-preserving extraction from ScanReviewView.captionSheet.
//

import SwiftUI

/// Note editor for a single supporting photo.
struct CaptionEditorSheet: View {

    let photoId: UUID
    let manifest: ScanManifest
    let photoLoader: ScanReviewPhotoLoader
    /// Two-way binding into the parent's caption for this photo.
    @Binding var caption: String
    /// Dismiss the sheet.
    let onDismiss: () -> Void

    var body: some View {
        let photo = manifest.photos.first(where: { $0.id == photoId })
        return NavigationStack {
            VStack(alignment: .leading, spacing: 16) {
                if let photo = photo {
                    photoLoader.image(for: photo)
                        .frame(height: 280)
                        .frame(maxWidth: .infinity)
                        .clipShape(RoundedRectangle(cornerRadius: 16))
                }

                scanReviewSectionLabel("Note for this photo")

                ZStack(alignment: .topLeading) {
                    RoundedRectangle(cornerRadius: 12)
                        .fill(PatinaColors.Background.secondary)
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(PatinaColors.pearl, lineWidth: 1.5)

                    if caption.isEmpty {
                        Text("What's worth noticing here?")
                            .font(PatinaTypography.bodySmall)
                            .foregroundStyle(PatinaColors.Text.muted.opacity(0.7))
                            .padding(.horizontal, 16)
                            .padding(.vertical, 14)
                            .allowsHitTesting(false)
                    }

                    TextEditor(text: $caption)
                        .font(PatinaTypography.bodySmall)
                        .foregroundStyle(PatinaColors.Text.primary)
                        .scrollContentBackground(.hidden)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                }
                .frame(minHeight: 120)

                Spacer()
            }
            .padding(24)
            .background(PatinaColors.Background.primary.ignoresSafeArea())
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
}
