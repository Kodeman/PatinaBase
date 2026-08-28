//
//  TabRoot.swift
//  Patina
//
//  W3 · N2. The three tab roots the house-first bar mounts beside Today, and
//  the one seam that tells a screen it is a root rather than a pushed copy of
//  itself.
//
//  Why a seam at all: `YourSpacesView` and `RecommendationsView` are pushed
//  destinations that existed long before the bar, so both call `.patinaScreen`,
//  which pins a back chevron. As a tab root neither has anywhere to go back to,
//  and both drew the chevron anyway in the first flag-on shots. Rather than
//  branch inside two screens — and rather than fork them — the wrapper puts
//  `isTabRoot` in the environment and the chrome reads it. Every other screen
//  in the app, and the whole flag-off root, gets the default `false` and is
//  unchanged.
//
//  The canonical title comes from `PatinaTab.canonicalName` and is never
//  re-typed here — not even in a comment, which `TabRootTitleTests` pins.
//  B-7 (a) splits the word on the bar from the destination's canonical name,
//  and one source for the second half is what stops the two from drifting.
//

import SwiftUI

// MARK: - The seam

private struct IsTabRootKey: EnvironmentKey {
    static let defaultValue = false
}

extension EnvironmentValues {
    /// True only for the view a `PatinaTab` mounts as its stack's root. False
    /// everywhere else, including every pushed appearance of the same screen.
    var isTabRoot: Bool {
        get { self[IsTabRootKey.self] }
        set { self[IsTabRootKey.self] = newValue }
    }
}

extension View {
    /// Marks this view as `tab`'s root and gives it that destination's
    /// canonical name (C4).
    func tabRoot(_ tab: PatinaTab) -> some View {
        environment(\.isTabRoot, true)
            .navigationTitle(tab.canonicalName)
    }
}

// MARK: - The three roots

/// Spaces. `YourSpacesView` already prints its canonical name in its own
/// header, so the navigation title here is the canonical record rather than a
/// second drawn string — the screen hides the system bar via `.patinaScreen`.
struct SpacesTabRoot: View {
    var body: some View {
        YourSpacesView()
            .tabRoot(.spaces)
    }
}

/// Pieces. `RecommendationsView` prints its canonical name in its own header
/// and, as a tab root, draws M9's `Saved` door above the chips.
struct PiecesTabRoot: View {
    var body: some View {
        RecommendationsView()
            .tabRoot(.pieces)
    }
}

/// Studio. `StudioHubView` is a section, not a screen — no scroll view, no
/// title of its own — so this root supplies both. Unlike the other two it does
/// not hide the system bar, which is why its title is the one that draws.
struct StudioTabRoot: View {
    var body: some View {
        ScrollView {
            StudioHubView()
                .padding(.horizontal, 24)
                .padding(.top, 12)
                .padding(.bottom, 24)
        }
        .background(PatinaColors.Background.primary)
        .tabRoot(.studio)
        .navigationBarTitleDisplayMode(.large)
    }
}
