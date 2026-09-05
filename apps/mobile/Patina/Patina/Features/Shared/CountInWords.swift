//
//  CountInWords.swift
//  Patina
//
//  `P-24` / the standing refusal on numeric count chips: a homeowner surface
//  counts in words, the way the doorstep already does ("Two things moved
//  since." — `apps/client-portal/src/components/threshold/doorstep.tsx:54-59`).
//
//  The word list and the past-twelve cutoff are the web's own
//  (`instruments/standing-sentence.ts:120-144`), so the two surfaces cannot
//  say the same count two ways.
//

import Foundation

enum PatinaCount {

    private static let words = [
        "zero", "one", "two", "three", "four", "five", "six",
        "seven", "eight", "nine", "ten", "eleven", "twelve"
    ]

    /// A small count as a person says it. Past twelve the word stops helping
    /// and becomes a puzzle, so figures take over.
    static func inWords(_ count: Int) -> String {
        let whole = max(0, count)
        guard whole < words.count else { return String(whole) }
        return words[whole]
    }

    /// The same word at the head of a sentence.
    static func inWordsCapitalized(_ count: Int) -> String {
        let word = inWords(count)
        return word.prefix(1).uppercased() + word.dropFirst()
    }
}
