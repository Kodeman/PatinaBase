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

    /// First table entry whose keyword matches a WHOLE WORD of the label, or
    /// nil. Nil means "we could not tell" — never `.unknown` dressed up as an
    /// answer.
    ///
    /// Word-boundary, not longest-match: the table is a flat list of
    /// single-word keywords with no length ordering, and none of the known
    /// mis-mappings ("tapestry" via "tap", "skylight" via "light", "printer"
    /// via "print") has a second, longer candidate to prefer over the short
    /// one — the failure was a short keyword matching INSIDE an unrelated
    /// word, not a shorter keyword beating a longer one. Splitting both the
    /// label and each keyword into alphanumeric tokens and comparing whole
    /// tokens fixes that without reordering the table.
    ///
    /// The cost is that a compound Vision identifier no longer rides in on the
    /// word inside it — which is right for "chairlift" and wrong for
    /// "bookshelf", so a compound that genuinely names furniture earns its OWN
    /// table row ("bookshelf", "spotlight") rather than a looser match rule.
    ///
    /// The plural it keeps is only the REGULAR one: a trailing "s" or "es" on
    /// the keyword's last token ("chairs", "benches"). "shelves" does not find
    /// "shelf" and "draperies" does not find "drapery" — no irregular plural
    /// matches, and none did under the old substring test either.
    public static func category(forVisionLabel label: String) -> SpecimenCategory? {
        let labelTokens = tokens(from: label)
        guard !labelTokens.isEmpty else { return nil }
        for entry in tokenizedTable
        where labelTokens.containsWholeWordMatch(for: entry.tokens) {
            return entry.category
        }
        return nil
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
    /// True if `keywordTokens` appears as a CONSECUTIVE run inside `self`,
    /// comparing each token for equality except the keyword's last token,
    /// which also accepts itself plus a bare "s" or "es"
    /// ("chair"/"chairs", "bench"/"benches") — a whole-word plural, never a
    /// substring match ("chairlift" does not find "chair").
    func containsWholeWordMatch(for keywordTokens: [String]) -> Bool {
        guard !keywordTokens.isEmpty, count >= keywordTokens.count else { return false }
        for start in 0...(count - keywordTokens.count) {
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
            if matched { return true }
        }
        return false
    }
}
