//  CaptureFonts.swift
//  CaptureKit
//
//  Registers vendored TTFs programmatically (robust in app + extensions, which
//  can't share the host app's UIAppFonts). Call once at launch. Missing files
//  are tolerated — CaptureType then falls back to the system face.

import CoreText
import Foundation

public enum CaptureFonts {
    private static var didRegister = false

    public static func registerIfNeeded() {
        guard !didRegister else { return }
        didRegister = true
        let bundle = Bundle(for: BundleToken.self)
        guard let urls = bundle.urls(forResourcesWithExtension: "ttf", subdirectory: nil),
              !urls.isEmpty else { return }
        CTFontManagerRegisterFontURLs(urls as CFArray, .process, true) { _, _ in true }
    }

    private final class BundleToken {}
}
