//
//  PatinaFonts.swift
//  PatinaDesignKit
//
//  Registers the package's vendored TTFs (PlayfairDisplay, Inter, DMMono)
//  programmatically — robust in apps + extensions, which can't share a host
//  app's UIAppFonts. Mirrors CaptureKit's CaptureFonts pattern, but reads
//  from the SwiftPM resource bundle. Call once at launch. Already-registered
//  or missing fonts are tolerated (the Patina app also ships its own copies
//  via UIAppFonts until the Wave 3 dedup) — PatinaTypography falls back to
//  the system face when a font is unavailable.
//

import CoreText
import Foundation

public enum PatinaFonts {
    private static var didRegister = false

    public static func registerAll() {
        guard !didRegister else { return }
        didRegister = true
        guard let urls = Bundle.module.urls(forResourcesWithExtension: "ttf", subdirectory: nil),
              !urls.isEmpty else { return }
        CTFontManagerRegisterFontURLs(urls as CFArray, .process, true) { _, _ in true }
    }
}
