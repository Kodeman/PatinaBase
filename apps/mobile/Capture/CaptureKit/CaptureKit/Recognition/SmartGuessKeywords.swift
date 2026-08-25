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
        ("lamp", .lighting), ("light", .lighting), ("chandelier", .lighting), ("sconce", .lighting),
        ("cabinet", .storage), ("shelf", .storage), ("bookcase", .storage), ("dresser", .storage),
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

    /// First table entry whose keyword appears in the label, or nil. Nil means
    /// "we could not tell" — never `.unknown` dressed up as an answer.
    public static func category(forVisionLabel label: String) -> SpecimenCategory? {
        let id = label.lowercased()
        for entry in table where id.contains(entry.keyword) {
            return entry.category
        }
        return nil
    }
}
