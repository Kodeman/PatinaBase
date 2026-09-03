//
//  ChangedSurfaceShotTests.swift
//  PatinaTests
//
//  The self-check, taken through the renderer because HID could not drive the
//  app on this clone.
//
//  `xcrun simctl io … screenshot` works and `device_action tap` reports success
//  — the AX tree answers, the coordinates land — but the app does not act on
//  the tap, so no walk reaches Today, piece detail or a sheet. Rather than claim
//  a walk that did not happen, this renders the exact components the fix round
//  changed, at 3x, in both appearances, through the same `ImageRenderer` path
//  `HouseRecordRowInkTests` measures with — and writes them where a reviewer can
//  look at them.
//
//  It asserts as well as photographs: a component that rasterises to one flat
//  tone drew nothing, and a shot of nothing is worse than no shot.
//

import Testing
import SwiftUI
import UIKit
import Foundation
@testable import Patina

@MainActor
struct ChangedSurfaceShotTests {

    /// The app's Documents directory, inside the simulator's data container.
    ///
    /// Not the repo path: the test process is sandboxed and can *read* the
    /// checkout (that is how `SourcePin` works) but cannot write to it. The
    /// PNGs are collected afterwards with
    /// `xcrun simctl get_app_container <udid> cloud.patina.app data`.
    private static var shotsDirectory: URL {
        FileManager.default
            .urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("w1-l1d-r4", isDirectory: true)
    }

    private static func write(
        _ view: some View,
        _ name: String,
        size: CGSize,
        _ style: UIUserInterfaceStyle
    ) -> Int {
        let raster = RenderPin.raster(view, size: size, style: style)
        let renderer = ImageRenderer(
            content: AnyView(
                view
                    .frame(width: size.width, height: size.height)
                    .environment(\.colorScheme, style == .dark ? .dark : .light)
            )
        )
        renderer.scale = 3
        if let png = renderer.uiImage?.pngData() {
            try? FileManager.default.createDirectory(
                at: shotsDirectory, withIntermediateDirectories: true
            )
            try? png.write(
                to: shotsDirectory.appendingPathComponent(
                    "\(name)-\(PatinaContrast.name(style)).png"
                )
            )
        }
        return raster.distinctTones
    }

    private static func card(@ViewBuilder _ content: () -> some View) -> some View {
        content()
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(PatinaColors.Background.secondary)
    }

    @Test("every surface this round changed renders, in both appearances")
    func theChangedSurfacesRender() {
        for style in PatinaContrast.appearances {
            for (name, count) in Self.shoot(style) {
                #expect(
                    count > 4,
                    "\(name) rasterised to \(count) tone(s) in \(PatinaContrast.name(style)) — it drew nothing, and the shot is evidence of nothing"
                )
            }
        }
    }

    private static func shoot(_ style: UIUserInterfaceStyle) -> [String: Int] {
        var tones: [String: Int] = [:]

        // C-20 — the Record's two rows, one tappable and one not.
        tones["record-rows"] = Self.write(
            Self.card {
                VStack(alignment: .leading, spacing: 0) {
                    HouseRecordRowView(row: Self.row(route: .threadList))
                    HouseRecordRowView(row: Self.row(route: nil))
                }
            },
            "10-record-rows", size: CGSize(width: 360, height: 130), style
        )

        // A-73 — the status badge's four states, ink on its own wash.
        tones["status-badges"] = Self.write(
            Self.card {
                HStack(spacing: 8) {
                    PatinaStatusBadge(state: .error, text: "Declined")
                    PatinaStatusBadge(state: .warning, text: "Pending")
                    PatinaStatusBadge(state: .success, text: "Approved")
                    PatinaStatusBadge(state: .info, text: "Draft")
                }
            },
            "11-status-badges", size: CGSize(width: 400, height: 60), style
        )

        // C-01 — the Companion disc, fill plus its new edge, on the page.
        tones["companion-orb"] = Self.write(
            CompanionMarkView(attention: .calm, wakePhase: .awake, surface: .disc)
                .frame(width: 96, height: 96)
                .background(PatinaColors.Background.primary),
            "12-companion-orb", size: CGSize(width: 96, height: 96), style
        )

        // C-27 — piece detail's floating chrome, on the scrim.
        tones["hero-chrome"] = Self.write(
            HStack(spacing: 8) {
                ProductDetailChromeProbe(icon: "chevron.left")
                ProductDetailChromeProbe(icon: "questionmark")
                ProductDetailChromeProbe(icon: "square.and.arrow.up")
                ProductDetailChromeProbe(icon: "heart")
            }
            .padding(12)
            .background(PatinaColors.Background.tertiary),
            "13-hero-chrome", size: CGSize(width: 220, height: 60), style
        )

        // A3-01 / RL1D-R3-11 — the two empty-state sentences, side by side.
        tones["empty-states"] = Self.write(
            VStack(spacing: 24) {
                PatinaEmptyState(PatinaEmptyStateContent.stillChoosingPieces)
                PatinaEmptyState(PatinaEmptyStateContent.noPiecesInThisCategory)
            }
            .padding(20)
            .background(PatinaColors.Background.primary),
            "14-empty-states", size: CGSize(width: 360, height: 420), style
        )

        return tones
    }

    private static func row(route: AppRoute?) -> HouseRecordRow {
        HouseRecordRow(
            id: "row:\(route == nil ? "quiet" : "tappable")",
            kind: .messageReceived,
            title: route == nil
                ? "A new story from the workshop."
                : "Your designer sent a message.",
            detail: nil,
            date: Date(timeIntervalSince1970: 1_756_684_800),
            state: .none,
            isNew: false,
            isStandingCondition: false,
            route: route
        )
    }
}

/// `floatingCircleButton` is a method on `ProductDetailView`'s block extension,
/// which needs the whole view to construct. This is its body, verbatim, so the
/// shot shows the shipped pairing rather than an approximation of it —
/// `ImagePlaceholderTests.chromeOverAPhotographUsesTheScrim` is what guarantees
/// the two stay the same.
private struct ProductDetailChromeProbe: View {
    let icon: String

    var body: some View {
        Circle()
            .fill(PatinaColors.Scrim.chrome)
            .frame(width: 36, height: 36)
            .overlay(
                Image(systemName: icon)
                    .font(.system(size: 16))
                    .foregroundStyle(PatinaColors.OnDark.primary)
            )
    }
}
