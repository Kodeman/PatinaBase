//
//  HelpModule.swift
//  Patina
//
//  Module marker for the Help & Guidance System on iOS.
//
//  The Help module mirrors the web `@patina/help-system` package and provides
//  contextual help content (tooltips, empty states, field helpers, articles,
//  etc.) sourced from Sanity CMS. Content is identified by a surface key —
//  e.g. `"designer-portal/today/dashboard"` — and selected by persona.
//
//  Sprint 1 scope (this module):
//  - G1: data models + module marker (this task)
//  - G2: Swift Sanity client (uses URLSession + GROQ queries; no third-party SDK)
//  - G3: iOS surface key registry (parallel namespace to web; spec §6.2)
//
//  Sprint 2 will add the SwiftUI reactive layer (`@Observable` content loader,
//  view modifiers, etc.) on top of these primitives.
//
//  References:
//  - Spec: docs/prds/Guide/patina-help-guidance-engineering-handoff.md
//  - Web parity: packages/help-system/src/contentTypes.ts
//  - Web parity: packages/help-system/src/surfaceKeys.ts
//

import Foundation

/// Module-level version marker. Bump on breaking changes to the public types
/// in `Features/Help/`. Consumers may compare against `HelpModuleVersion.version`
/// to feature-detect at runtime (e.g., when reading a cached payload encoded by
/// an older module version).
public enum HelpModuleVersion {
    /// SemVer string. Pre-1.0 — public surface is allowed to break between
    /// Sprint 1 tasks (G1 → G2 → G3); we will move to 1.0.0 once Sprint 2
    /// publishes the reactive layer.
    public static let version = "0.1.0"
}
