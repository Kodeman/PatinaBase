//
//  Persona.swift
//  Patina
//
//  Persona enumeration for the Help & Guidance System.
//
//  Mirrors the web `Persona` type in `packages/help-system/src/contentTypes.ts`.
//  Note: the web type additionally allows the sentinel value `"all"` for content
//  that targets every persona. On iOS we keep the user-facing persona enum
//  closed to the four real personas and represent the fallback case as
//  `persona == nil` at the call site (see `HelpContentFetcher` in G2).
//
//  Raw values are intentionally lowercase to match the Sanity schema enum
//  options (spec §7.2.1) and the wire shape from GROQ queries.
//

import Foundation

/// A user-facing persona that drives help-content selection.
///
/// The four values mirror the Sanity `persona` enum at
/// `studios/help-system/schemas/helpContent.ts` (minus the `"all"` sentinel,
/// which is modelled as `nil` on iOS).
public enum Persona: String, Codable, CaseIterable, Sendable {
    case designer = "designer"
    case maker = "maker"
    case consumer = "consumer"
    case admin = "admin"
}
