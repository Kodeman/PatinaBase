//
//  PatinaAsyncImage.swift
//  Patina
//
//  Patina Design System - Remote image with branded placeholder/failure states
//
//  Every remote image in the app should render through this wrapper so that
//  loading and failure never appear as bare rectangles (UX master plan R15).
//  Failure shows the strata mark on a quiet surface and retries on tap.
//

import SwiftUI

public struct PatinaAsyncImage: View {
    let url: URL?
    var contentMode: ContentMode = .fill

    @State private var retryToken = 0

    public init(url: URL?, contentMode: ContentMode = .fill) {
        self.url = url
        self.contentMode = contentMode
    }

    public var body: some View {
        Group {
            if let url {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .empty:
                        loadingPlaceholder
                    case .success(let image):
                        // SP-02: `.aspectRatio(.fill)` answers a proposal with
                        // a size LARGER than the proposal on one axis, and a
                        // call site's `.frame(maxWidth: .infinity)` does not
                        // clamp an oversized child. Left loose, a 1200-wide
                        // photo at `height: 340` reported 556 pt on a 402 pt
                        // screen and dragged its whole container off-canvas —
                        // the browse grid's runaway cards and the piece
                        // detail's unreachable Back chevron were the same bug
                        // seen twice. Painting the image as an overlay on a
                        // `Color.clear` makes the component report exactly the
                        // size it was given, whatever the image's aspect.
                        Color.clear
                            .overlay {
                                image
                                    .resizable()
                                    .aspectRatio(contentMode: contentMode)
                            }
                            .clipped()
                    case .failure:
                        failurePlaceholder
                    @unknown default:
                        loadingPlaceholder
                    }
                }
                .id(retryToken)
            } else {
                failurePlaceholder
            }
        }
    }

    private var loadingPlaceholder: some View {
        Rectangle()
            .fill(PatinaColors.Background.secondary)
            .overlay(
                StrataMarkView(color: PatinaColors.clay, scale: 0.9)
                    .opacity(0.35)
            )
            .accessibilityHidden(true)
    }

    private var failurePlaceholder: some View {
        Rectangle()
            .fill(PatinaColors.Background.secondary)
            .overlay(
                VStack(spacing: PatinaSpacing.sm) {
                    StrataMarkView(color: PatinaColors.clay, scale: 1.0)
                    if url != nil {
                        Text("Tap to retry")
                            .font(PatinaTypography.caption)
                            .foregroundStyle(PatinaColors.Text.muted)
                    }
                }
            )
            .contentShape(Rectangle())
            .onTapGesture {
                guard url != nil else { return }
                retryToken += 1
            }
            .accessibilityLabel(url == nil ? "Image unavailable" : "Image failed to load")
            .accessibilityHint(url == nil ? "" : "Double tap to retry loading the image.")
    }
}

// MARK: - Preview

#Preview("States") {
    VStack(spacing: 20) {
        PatinaAsyncImage(url: URL(string: "https://invalid.patina.test/missing.jpg"))
            .frame(width: 220, height: 140)
            .clipShape(RoundedRectangle(cornerRadius: PatinaRadius.lg, style: .continuous))

        PatinaAsyncImage(url: nil)
            .frame(width: 220, height: 140)
            .clipShape(RoundedRectangle(cornerRadius: PatinaRadius.lg, style: .continuous))
    }
    .padding(40)
    .background(PatinaColors.Background.primary)
}
