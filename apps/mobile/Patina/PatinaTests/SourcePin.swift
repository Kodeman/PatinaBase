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

    /// The same source with every `//` comment removed.
    ///
    /// Every pin here is a substring grep, and the fixes they enforce come with
    /// a comment naming the shape that was removed — so `.disabled(`,
    /// `.ultraThinMaterial`, `Font.custom(` and `"$2K"` all reappear in the very
    /// comment that explains why they are gone, and the pin fires on its own
    /// documentation. Stripping comments is the difference between measuring
    /// the code and measuring the file. Quote tracking keeps a `//` inside a
    /// string literal (a URL, say) out of it.
    static func code(_ source: String) -> String {
        source
            .components(separatedBy: "\n")
            .map { line -> String in
                var inString = false
                var previous: Character?
                var index = line.startIndex
                while index < line.endIndex {
                    let character = line[index]
                    if character == "\"" && previous != "\\" { inString.toggle() }
                    if !inString, character == "/", previous == "/" {
                        return String(line[line.startIndex..<line.index(before: index)])
                    }
                    previous = character
                    index = line.index(after: index)
                }
                return line
            }
            .joined(separator: "\n")
    }

    /// `read` with the comments stripped — what a code-shape pin should use.
    static func readCode(_ relativePath: String) throws -> String {
        code(try read(relativePath))
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
