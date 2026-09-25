//
//  SourcePin.swift
//  CaptureTests
//
//  Reads a source file out of the app target so a test can pin a fact that
//  only exists in the view layer — which ink a `foregroundStyle` draws, which
//  token a background fills with. Modelled on `PatinaTests/SourcePin.swift`.
//

import Foundation

enum SourcePin {

    /// - Parameter relativePath: path under `apps/mobile/Capture/`, e.g.
    ///   `"Capture/Features/Capture/FieldAffirmationChip.swift"`.
    static func read(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // CaptureTests
            .deletingLastPathComponent() // apps/mobile/Capture
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// The same source with every `//` comment removed.
    ///
    /// A pin here is a substring grep, and the fix it enforces comes with a
    /// comment naming the shape that was removed — so the removed token name
    /// reappears in the very comment that explains why it is gone, and the
    /// pin would fire on its own documentation. Stripping comments is the
    /// difference between measuring the code and measuring the file. Quote
    /// tracking keeps a `//` inside a string literal out of it.
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
}
