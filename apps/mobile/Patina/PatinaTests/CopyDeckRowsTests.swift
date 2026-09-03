//
//  CopyDeckRowsTests.swift
//  PatinaTests
//
//  The rows of L1-E's copy deck that land in THIS lane's files, pinned here
//  so this lane's own gate catches a regression.
//
//  `RL1B2-01`: rounds 3 and 4 of L1-E's notes (E3-L1B-1…E3-L1B-5, E4-L1B-1)
//  were unapplied on this branch, and one of them —
//  `RoomsAPIClient.swift`'s `"We didn't get a response."` — is pinned
//  UNWRAPPED in `BrandVoiceLintTests.roomsAPIClientApostrophesAreCurly` on
//  `first-flight/w1-l1e`. L1-E merges last, so a straight apostrophe this
//  lane ships is a hard red on the integration tip at merge 6, five merges
//  after anyone could still be looking for it.
//
//  The apostrophe rule below is L1-E's `lintApostrophes`, reimplemented
//  rather than shared: `BrandVoiceLintTests.swift` is L1-E's file and does
//  not exist on this branch.
//

import Foundation
import Testing
@testable import Patina

struct CopyDeckRowsTests {

    /// Every file this lane owns that carries a deck row. A file that moves
    /// makes `SourcePin.read` throw, which is a hard failure — deliberately,
    /// so a rename cannot quietly empty the sweep.
    private static let sweptFiles = [
        "Patina/Core/Network/RoomsAPIClient.swift",
        "Patina/Core/Persistence/LocalStoreRecoveryNotice.swift",
        "Patina/Features/Collections/Views/CollectionsView.swift",
        "Patina/Features/Money/MoneyFailureCopy.swift",
        "Patina/Features/RoomScan/Shared/Components/ScanUploadFailureCopy.swift",
        "Patina/Features/RoomScan/Shared/Models/NamedAesthetic.swift",
        "Patina/Features/RoomScan/Shared/Models/StyleResponseModel.swift",
        "Patina/Features/RoomScan/Views/ScanReviewView.swift",
        "Patina/Features/RoomScan/Views/ScanWalkView.swift"
    ]

    // MARK: - A-06 · the glyph

    /// The text of every string literal in `source`, with interpolations
    /// blanked and comments skipped. Handles `"""` blocks, which is what
    /// `LocalStoreRecoveryNotice`'s body is.
    static func stringLiterals(in source: String) -> [String] {
        var literals: [String] = []
        var multiline: String?
        for line in source.components(separatedBy: .newlines) {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            if var open = multiline {
                if trimmed.hasPrefix("\"\"\"") {
                    literals.append(open)
                    multiline = nil
                } else {
                    open += "\n" + line
                    multiline = open
                }
                continue
            }
            if trimmed.hasPrefix("//") || trimmed.hasPrefix("*") || trimmed.hasPrefix("/*") {
                continue
            }
            if trimmed.hasSuffix("\"\"\"") {
                multiline = ""
                continue
            }
            var cursor = line.startIndex
            while let found = line.range(
                of: #""(?:[^"\\]|\\.)*""#,
                options: .regularExpression,
                range: cursor..<line.endIndex
            ) {
                literals.append(String(line[found]))
                cursor = found.upperBound
            }
        }
        return literals.map {
            $0.replacingOccurrences(of: #"\\\([^)]*\)"#, with: " ", options: .regularExpression)
        }
    }

    @Test(
        "every deck row this lane applied types its apostrophes as U+2019 (A-06)",
        arguments: sweptFiles
    )
    func theCopyRowsUseACurlyApostrophe(path: String) throws {
        for literal in Self.stringLiterals(in: try SourcePin.read(path)) {
            #expect(
                literal.range(of: "[A-Za-z]'[A-Za-z]", options: .regularExpression) == nil,
                "\(path) ships \(literal) with a straight apostrophe (U+0027); A-06 wants U+2019"
            )
        }
    }

    // MARK: - C5-20 · the retired word

    /// `E3-L1B-5`. The enum cases keep their names — only the returned
    /// display strings change, so nothing else in the app has to move.
    @Test
    func noDisplayNameStillSaysCurated() throws {
        for path in ["Patina/Features/RoomScan/Shared/Models/StyleResponseModel.swift",
                     "Patina/Features/RoomScan/Shared/Models/NamedAesthetic.swift"] {
            for literal in Self.stringLiterals(in: try SourcePin.read(path)) {
                // `case curatedMix = "curated_mix"` is a wire value, not copy.
                // The note is explicit that the enum cases and their raw
                // values stay: only the returned display strings change.
                guard literal.range(of: #"^"[a-z0-9_]*"$"#, options: .regularExpression) == nil
                else { continue }
                #expect(
                    literal.lowercased().contains("curated") == false,
                    "\(path) still ships \(literal) — C5-20 retires the word from reader-facing copy"
                )
            }
        }
    }

    @Test
    func theRenamedBandsReadAsTheDeckWroteThem() throws {
        let styles = try SourcePin.read("Patina/Features/RoomScan/Shared/Models/StyleResponseModel.swift")
        #expect(styles.contains("\"Collected Mix\""))
        #expect(styles.contains("\"Considered Comfort\""))
        let aesthetics = try SourcePin.read("Patina/Features/RoomScan/Shared/Models/NamedAesthetic.swift")
        #expect(aesthetics.contains("\"Considered Minimal\""))
        #expect(aesthetics.contains("\"Collected\""))
    }

    // MARK: - C5-09 · the noun

    /// `E3-L1B-4`. This lane's `C4-03` hunk rewrote the block L1-E had
    /// already corrected, and carried the retired noun back in with it.
    @Test
    func theSavedPiecesEmptyStateSaysPieces() throws {
        let source = try SourcePin.read("Patina/Features/Collections/Views/CollectionsView.swift")
        #expect(source.contains("\"No saved pieces yet\""))
        #expect(source.contains("\"No saved items yet\"") == false)
    }
}
