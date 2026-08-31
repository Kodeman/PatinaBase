//  SmartGuessKeywords.swift
//  CaptureKit
//
//  The Vision-label → SpecimenCategory mapping, lifted out of the app target so
//  it runs under capture-gate.sh (CaptureTests links CaptureKit alone). The
//  Vision request that produces the labels stays app-side and is owed a device
//  pass; this table is pure and is the part that quietly rots.

import Foundation

public enum SmartGuessKeywords {

    public static let table: [(keyword: String, category: SpecimenCategory)] = [
        ("armchair", .seating), ("chair", .seating), ("sofa", .seating), ("couch", .seating),
        ("stool", .seating), ("bench", .seating), ("seat", .seating),
        ("table", .table), ("desk", .table), ("nightstand", .table),
        ("lamp", .lighting), ("light", .lighting), ("chandelier", .lighting),
        ("sconce", .lighting), ("spotlight", .lighting),
        ("cabinet", .storage), ("shelf", .storage), ("bookshelf", .storage),
        ("bookcase", .storage), ("dresser", .storage),
        ("wardrobe", .storage), ("credenza", .storage),
        ("rug", .rug), ("carpet", .rug),
        ("curtain", .textile), ("fabric", .textile), ("textile", .textile), ("pillow", .textile),
        ("cushion", .textile), ("drapery", .textile),
        ("vase", .decor), ("bowl", .decor), ("sculpture", .decor), ("mirror", .decor),
        ("painting", .art), ("artwork", .art), ("print", .art),
        ("faucet", .plumbing), ("sink", .plumbing), ("tap", .plumbing),
        ("tile", .tile),
        ("knob", .hardware), ("handle", .hardware), ("hinge", .hardware)
    ]

    /// The category a Vision label names, or nil. Nil means "we could not
    /// tell" — never `.unknown` dressed up as an answer.
    ///
    /// Matching is WHOLE-WORD, not substring: "chairlift" is not a chair,
    /// "tapestry" is not a tap, "skylight" is not a light. Both the label and
    /// each keyword are split into alphanumeric tokens and compared as tokens.
    ///
    /// Where several rows match, the MOST SPECIFIC one wins, and specificity in
    /// an English compound noun is position: the head is the last word. "table
    /// lamp" is a lamp; "coffee table" is a table; "wall sconce" is a sconce.
    /// First-match-wins read "table lamp" as furniture purely because `table`
    /// sits above `lamp` in the list, which made the answer a fact about table
    /// ORDER rather than about the label — the same family of wrong answer as
    /// the substring bug. Ties (two rows ending on the same token) go to the
    /// longer keyword, then to the earlier row.
    ///
    /// A compound written as ONE word still earns its own row ("bookshelf",
    /// "spotlight"): the head-noun rule reads across tokens, not inside them.
    ///
    /// The plural it keeps is only the REGULAR one: a trailing "s" or "es" on
    /// the keyword's last token ("chairs", "benches"). "shelves" does not find
    /// "shelf" and "draperies" does not find "drapery" — no irregular plural
    /// matches, and none did under the old substring test either.
    public static func category(forVisionLabel label: String) -> SpecimenCategory? {
        let labelTokens = tokens(from: label)
        guard !labelTokens.isEmpty else { return nil }
        var best: Match?
        for entry in tokenizedTable {
            guard let head = labelTokens.lastWholeWordMatchEnd(for: entry.tokens) else {
                continue
            }
            let candidate = Match(head: head, length: entry.tokens.count,
                                  category: entry.category)
            if let best, (best.head, best.length) >= (candidate.head, candidate.length) {
                continue
            }
            best = candidate
        }
        return best?.category
    }

    /// A row that matched: how far into the label it reached, how many tokens
    /// it spent getting there, and what it says the thing is.
    private struct Match {
        let head: Int
        let length: Int
        let category: SpecimenCategory
    }

    /// `table`, tokenized ONCE. `category(forVisionLabel:)` runs per Vision
    /// observation, and re-splitting every keyword on every call was 40-odd
    /// tokenizations per label for a table that never changes. Derived from
    /// `table` rather than written out again, so the two cannot drift.
    private static let tokenizedTable: [(tokens: [String], category: SpecimenCategory)] =
        table.compactMap { entry in
            let keywordTokens = tokens(from: entry.keyword)
            return keywordTokens.isEmpty ? nil : (keywordTokens, entry.category)
        }

    private static func tokens(from string: String) -> [String] {
        string.lowercased()
            .components(separatedBy: CharacterSet.alphanumerics.inverted)
            .filter { !$0.isEmpty }
    }
}

private extension Array where Element == String {
    /// The index of the LAST token of the last place `keywordTokens` appears as
    /// a CONSECUTIVE run inside `self`, or nil. Each token is compared for
    /// equality except the keyword's last, which also accepts itself plus a
    /// bare "s" or "es" ("chair"/"chairs", "bench"/"benches") — a whole-word
    /// plural, never a substring match ("chairlift" does not find "chair").
    ///
    /// Last rather than first, and an index rather than a Bool, because the
    /// caller resolves a compound by its head noun: how far into the label a
    /// row matched is the thing being compared.
    func lastWholeWordMatchEnd(for keywordTokens: [String]) -> Int? {
        guard !keywordTokens.isEmpty, count >= keywordTokens.count else { return nil }
        for start in stride(from: count - keywordTokens.count, through: 0, by: -1) {
            var matched = true
            for offset in keywordTokens.indices {
                let labelToken = self[start + offset]
                let keywordToken = keywordTokens[offset]
                let isLastKeywordToken = offset == keywordTokens.count - 1
                if labelToken == keywordToken { continue }
                if isLastKeywordToken,
                   labelToken == keywordToken + "s" || labelToken == keywordToken + "es" {
                    continue
                }
                matched = false
                break
            }
            if matched { return start + keywordTokens.count - 1 }
        }
        return nil
    }
}
