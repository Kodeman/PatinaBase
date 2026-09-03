//
//  PatinaAsyncImage.swift
//  PatinaDesignKit
//
//  Patina Design System - Remote image with branded loading / failed / missing
//  states.
//
//  Every remote image in the app should render through this wrapper so that
//  loading and failure never appear as bare rectangles (UX master plan R15).
//
//  A-36 / C-27 / B-18 split what used to be two states into three. "The photo
//  has not arrived yet", "the photo would not load" and "this piece has no
//  photograph" are three different sentences, and the browse grid was saying
//  none of them: two of ten pieces rendered as flat colour rectangles carrying
//  a heart, a ⋯ and a "45% match" badge over nothing, because the call sites
//  fell through to a bare gradient instead of coming here at all.
//

import SwiftUI

/// The three things a remote image can be, named so a call site and a test can
/// both say which one they mean.
public enum PatinaAsyncImageState: Equatable, Sendable {
    /// A URL that has not answered yet.
    case loading
    /// A URL that answered with something unusable. Retryable.
    case failed
    /// No URL at all — the piece has no photograph. Not retryable, and not the
    /// same thing as a slow network.
    case missing

    public var accessibilityLabel: String {
        switch self {
        case .loading: return "Loading image"
        case .failed: return "Image failed to load"
        case .missing: return "No photograph yet"
        }
    }
}

public struct PatinaAsyncImage: View {
    let url: URL?
    var contentMode: ContentMode = .fill
    /// What this image is of. Printed under the mark when the piece has no
    /// photograph, so a missing image still says which piece it belongs to
    /// (B-18) instead of being an anonymous slab.
    var caption: String?

    @State private var retryToken = 0
    @State private var shimmerPhase: CGFloat = -1
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    public init(url: URL?, contentMode: ContentMode = .fill, caption: String? = nil) {
        self.url = url
        self.contentMode = contentMode
        self.caption = caption
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
                missingPlaceholder
            }
        }
    }

    // MARK: - Loading

    private var loadingPlaceholder: some View {
        Rectangle()
            .fill(PatinaColors.Background.secondary)
            .overlay(
                StrataMarkView(color: PatinaColors.clay, scale: 0.9, accessibility: .decorative)
                    .opacity(0.35)
            )
            .overlay(shimmer)
            .clipped()
            // Hidden, and therefore given no label: a tile that is still
            // loading has nothing to say that the card's own combined label
            // does not already say, and announcing "Loading image" mid-scroll
            // is noise. `PatinaAsyncImageState.loading.accessibilityLabel`
            // exists for the other two states, which are not hidden.
            .accessibilityHidden(true)
    }

    /// A single pass of light across the tile, so "not here yet" reads as
    /// motion rather than as a permanent grey rectangle. Still under Reduce
    /// Motion, which is when the mark alone carries the state.
    @ViewBuilder
    private var shimmer: some View {
        if reduceMotion {
            EmptyView()
        } else {
            GeometryReader { geo in
                LinearGradient(
                    stops: [
                        .init(color: PatinaColors.OnDark.primary.opacity(0), location: 0),
                        .init(color: PatinaColors.OnDark.primary.opacity(0.18), location: 0.5),
                        .init(color: PatinaColors.OnDark.primary.opacity(0), location: 1)
                    ],
                    startPoint: .leading,
                    endPoint: .trailing
                )
                .frame(width: geo.size.width * 0.6)
                .offset(x: shimmerPhase * geo.size.width * 1.6)
                .animation(
                    .linear(duration: 1.4).repeatForever(autoreverses: false),
                    value: shimmerPhase
                )
                .onAppear { shimmerPhase = 1 }
            }
            .allowsHitTesting(false)
        }
    }

    // MARK: - Failed

    private var failurePlaceholder: some View {
        markPlaceholder(
            state: .failed,
            secondLine: "Tap to retry"
        )
        .contentShape(Rectangle())
        .onTapGesture { retryToken += 1 }
        .accessibilityLabel(PatinaAsyncImageState.failed.accessibilityLabel)
        .accessibilityHint("Double tap to retry loading the image.")
    }

    // MARK: - Missing

    /// A-36's "distinguish loading from permanently-missing", and B-18's
    /// "mark + product name". No retry affordance, because there is nothing to
    /// retry — and no shimmer, because nothing is coming.
    private var missingPlaceholder: some View {
        markPlaceholder(state: .missing, secondLine: caption)
            .accessibilityLabel(
                caption.map { "\(PatinaAsyncImageState.missing.accessibilityLabel). \($0)" }
                    ?? PatinaAsyncImageState.missing.accessibilityLabel
            )
    }

    private func markPlaceholder(
        state: PatinaAsyncImageState,
        secondLine: String?
    ) -> some View {
        Rectangle()
            .fill(PatinaColors.Background.secondary)
            .overlay(
                VStack(spacing: PatinaSpacing.sm) {
                    StrataMarkView(color: PatinaColors.clay, scale: 1.0, accessibility: .decorative)
                    if let secondLine, !secondLine.isEmpty {
                        Text(secondLine)
                            .font(PatinaTypography.caption)
                            .foregroundStyle(PatinaColors.Text.muted)
                            .multilineTextAlignment(.center)
                            .lineLimit(2)
                            .padding(.horizontal, PatinaSpacing.sm)
                    }
                }
            )
            .clipped()
    }
}

// MARK: - Chrome over an image (C-27)

extension View {
    /// Puts a control that floats over a photograph on an opaque ground.
    ///
    /// C-27: the heart and ⋯ are `Circle().fill(.ultraThinMaterial)` and the
    /// match pill is `.background(.ultraThinMaterial)`. Over a light tile in
    /// dark mode the material inverts to a light-on-light wash — the chrome
    /// measured 2.01:1 and the pill's text 1.86:1. A material's contrast is a
    /// function of what is behind it; a scrim's is not.
    public func patinaChromeScrim<S: Shape>(_ shape: S) -> some View {
        background(shape.fill(PatinaColors.Scrim.chrome))
    }

    public func patinaChromeScrim() -> some View {
        patinaChromeScrim(Capsule())
    }
}

// MARK: - Preview

#Preview("States") {
    VStack(spacing: 20) {
        PatinaAsyncImage(url: URL(string: "https://invalid.patina.test/missing.jpg"))
            .frame(width: 220, height: 140)
            .clipShape(RoundedRectangle(cornerRadius: PatinaRadius.lg, style: .continuous))

        PatinaAsyncImage(url: nil, caption: "Wool Kilim Runner")
            .frame(width: 220, height: 140)
            .clipShape(RoundedRectangle(cornerRadius: PatinaRadius.lg, style: .continuous))

        Text("92% match")
            .font(PatinaTypography.monoLabel)
            .foregroundStyle(PatinaColors.OnDark.primary)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .patinaChromeScrim()
    }
    .padding(40)
    .background(PatinaColors.Background.primary)
}
