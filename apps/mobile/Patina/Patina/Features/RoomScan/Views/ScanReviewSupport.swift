//
//  ScanReviewSupport.swift
//  Patina
//
//  Shared helpers for the post-scan Review screen, extracted from
//  ScanReviewView (PT-6-3). These are small, behavior-preserving pieces the
//  review façade and its extracted subviews/sheets compose:
//   - `ScanReviewPhotoLoader`: resolves a bundle photo URL and renders the
//     image (or a neutral placeholder) exactly as the original inline helper.
//   - `scanReviewSectionLabel`: the uppercase mono section label.
//

import SwiftUI
import UIKit

/// Loads photos from a scan bundle's `photos/` directory and renders them,
/// falling back to a neutral placeholder when the file can't be found. This
/// mirrors the original `ScanReviewView.photoImage(for:)` / `photoURL(for:)` /
/// `bundleURL(for:)` chain so both the façade and the extracted sheets render
/// photos identically.
struct ScanReviewPhotoLoader {

    let scanId: UUID

    private func bundleURL() -> URL {
        let fm = FileManager.default
        let appSupport = (try? fm.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: false
        )) ?? URL(fileURLWithPath: NSHomeDirectory())
            .appendingPathComponent("Library/Application Support", isDirectory: true)
        return appSupport
            .appendingPathComponent("Scans", isDirectory: true)
            .appendingPathComponent(scanId.uuidString, isDirectory: true)
    }

    func photoURL(for entry: ScanManifest.PhotoEntry) -> URL? {
        let url = bundleURL().appendingPathComponent(entry.relativePath)
        return FileManager.default.fileExists(atPath: url.path) ? url : nil
    }

    /// Load a photo from the bundle's `photos/` directory. Falls back to a
    /// neutral placeholder when we can't find the file.
    @ViewBuilder
    func image(for entry: ScanManifest.PhotoEntry?) -> some View {
        if let entry = entry,
           let url = photoURL(for: entry),
           let data = try? Data(contentsOf: url),
           let uiImage = UIImage(data: data) {
            Image(uiImage: uiImage)
                .resizable()
                .scaledToFill()
        } else {
            Rectangle()
                .fill(PatinaColors.softCream)
                .overlay(
                    Image(systemName: "photo")
                        .font(.system(size: 28))
                        .foregroundStyle(PatinaColors.agedOak.opacity(0.5))
                )
        }
    }
}

/// Uppercase mono section label used throughout the Review screen.
func scanReviewSectionLabel(_ text: String) -> some View {
    Text(text)
        .font(PatinaTypography.mono)
        .tracking(0.6)
        .textCase(.uppercase)
        .foregroundStyle(PatinaColors.Text.interactive)
}

// MARK: - Supporting types

/// Sheet(item:) requires Identifiable; UUID isn't directly Identifiable on
/// its own, so wrap it.
struct ScanReviewPhotoIdWrapper: Identifiable, Equatable {
    let id: UUID
}
