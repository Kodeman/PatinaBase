//
//  SourcePin.swift
//  PatinaTests
//
//  Reads a source file out of the app target so a test can pin a fact that
//  only exists in the view layer — a hit area, a modifier, an entitlement key.
//  The `#filePath` walk is the one `NotificationsAPIClientContractTests`
//  already uses; this lifts it out so several suites share one reader.
//

import Foundation

enum SourcePin {

    /// - Parameter relativePath: path under `apps/mobile/Patina/`, e.g.
    ///   `"Patina/Features/Settings/Views/SettingsView.swift"`.
    static func read(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // PatinaTests
            .deletingLastPathComponent() // apps/mobile/Patina
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }
}
