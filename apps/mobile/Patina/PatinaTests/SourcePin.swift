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

    /// Every `.swift` file under a directory in the app target, so a pin can
    /// say "nowhere in the app" instead of "not in these twelve files" — a
    /// hard-coded list goes green the moment a thirteenth file reintroduces
    /// what the pin forbids.
    static func swiftFiles(under relativePath: String) -> [String] {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent(relativePath)
        guard let walker = FileManager.default.enumerator(
            at: root, includingPropertiesForKeys: nil
        ) else { return [] }
        return walker
            .compactMap { $0 as? URL }
            .filter { $0.pathExtension == "swift" }
            .map(\.path)
            .sorted()
    }
}
