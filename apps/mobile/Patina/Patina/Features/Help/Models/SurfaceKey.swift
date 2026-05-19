//
//  SurfaceKey.swift
//  Patina
//
//  Surface-key primitives for the Help & Guidance System.
//
//  A surface key is the canonical identifier that connects a UI location to
//  its Sanity help content (spec §6.2). Format:
//
//      {portal}/{section}/{component}[/{state}]
//
//  Lowercase, kebab-case segments, slash-separated, with at least two segments.
//  This mirrors the web regex in `packages/help-system/src/surfaceKeys.ts`:
//
//      /^[a-z0-9-]+(\/[a-z0-9-]+)+$/
//
//  The concrete iOS key catalogue lives in `Features/Help/SurfaceKeys.swift`,
//  added by task G3. This file ships only the type alias and the validator.
//

import Foundation

/// Canonical identifier for a help moment.
///
/// We use a `String` typealias rather than a wrapper struct so the type stays
/// ergonomic at every call site (`Text(verbatim: surfaceKey)`, dictionary
/// keys, `URLComponents` query items, etc.). Always validate untrusted input
/// with `isSurfaceKey(_:)` before treating a string as a surface key.
public typealias SurfaceKey = String

/// Regex literal that every valid surface key must satisfy.
///
/// Mirrors the web source of truth — keep in sync with
/// `SURFACE_KEY_REGEX` in `packages/help-system/src/surfaceKeys.ts`.
public let surfaceKeyPattern: String = "^[a-z0-9-]+(/[a-z0-9-]+)+$"

/// Error thrown by `validateSurfaceKey(_:)` when a string fails the
/// surface-key format check.
public struct InvalidSurfaceKeyError: Error, Equatable, Sendable {
    /// The string that failed validation.
    public let key: String

    public init(key: String) {
        self.key = key
    }
}

extension InvalidSurfaceKeyError: LocalizedError {
    public var errorDescription: String? {
        "Invalid surface key \"\(key)\": must match \(surfaceKeyPattern)."
    }
}

/// Returns `true` when `key` matches the surface-key format.
///
/// Examples:
///   - `isSurfaceKey("designer-portal/today")` → `true`
///   - `isSurfaceKey("designer-portal/today/dashboard")` → `true`
///   - `isSurfaceKey("designer-portal/")` → `false`
///   - `isSurfaceKey("Designer-Portal/today")` → `false`
///   - `isSurfaceKey("designer-portal")` → `false` (needs ≥2 segments)
public func isSurfaceKey(_ key: String) -> Bool {
    return key.range(of: surfaceKeyPattern, options: .regularExpression) != nil
}

/// Throwing variant of `isSurfaceKey(_:)`. Intended for tests and for any
/// boundary that wants to assert at runtime that a string is a valid
/// surface key (e.g. immediately after decoding from a network payload).
///
/// - Throws: `InvalidSurfaceKeyError` if `key` fails the format check.
public func validateSurfaceKey(_ key: String) throws {
    guard isSurfaceKey(key) else {
        throw InvalidSurfaceKeyError(key: key)
    }
}
