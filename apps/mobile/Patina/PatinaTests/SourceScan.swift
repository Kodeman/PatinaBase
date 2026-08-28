//
//  SourceScan.swift
//  PatinaTests
//
//  Strips comments before a source pin reads a file, so a pin can say "this
//  symbol does not appear in the code" without the prose that explains why it
//  does not appear turning the pin red. `SourcePin` reads; this filters.
//

import Foundation

enum SourceScan {

    /// True for a line that is entirely a comment — `//`, `///`, or a
    /// continuation line inside a block comment written in the house style.
    static func isComment(_ line: String) -> Bool {
        let trimmed = line.trimmingCharacters(in: .whitespaces)
        return trimmed.hasPrefix("//") || trimmed.hasPrefix("*") || trimmed.hasPrefix("/*")
    }

    /// `source` with every whole-line comment removed.
    static func code(in source: String) -> String {
        source
            .components(separatedBy: .newlines)
            .filter { !isComment($0) }
            .joined(separator: "\n")
    }
}
