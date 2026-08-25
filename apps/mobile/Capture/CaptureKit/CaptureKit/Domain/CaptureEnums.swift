//  CaptureEnums.swift
//  CaptureKit
//
//  Frozen domain vocabulary for Patina Field (T-03).
//  These enums are part of the SwiftData schema surface — adding cases is safe,
//  renaming/removing is a foundation-owner-only, migration-bearing change.

import Foundation

/// The ways the viewfinder can read a thing (C1 mode selector), plus `voice`.
/// `voice` is a RESERVED case: it exists so this frozen enum is edited exactly
/// once, and it is deliberately kept out of `viewfinderSelectable` until wave 3
/// builds C6 — a VOICE pill whose shutter takes a photo would be a new lie in
/// the wave that removes the old ones.
public enum CameraMode: String, Codable, CaseIterable, Sendable {
    case photo, tag, measure, scan, voice
}

public extension CameraMode {
    /// The modes C1 actually offers, in display order — a literal, not a
    /// predicate over `allCases`. A future non-selectable case can't silently
    /// admit itself here the way a filter would; adding one is Wave 3's own
    /// one-token edit, not a rule to re-derive. Wave 3 appends `.voice` when
    /// C6 exists.
    static var viewfinderSelectable: [CameraMode] {
        [.photo, .tag, .measure, .scan]
    }
}

/// Coarse category for a specimen — seeds smart-guess (N5) and library filters.
public enum SpecimenCategory: String, Codable, CaseIterable, Sendable {
    case seating, table, lighting, storage, textile, rug, decor, hardware
    case material, paint, tile, wallcovering, plumbing, appliance, art, unknown
}

/// Editable fields on a specimen that carry per-field provenance.
public enum FieldKey: String, Codable, CaseIterable, Sendable {
    case title, maker, sku, colorway, material, price, sourceURL, category, note, dimensions
}

/// How a field's value was obtained — drives the V3/C5 provenance badge colour.
/// verdigris = value/success, brass = recognised data, rust = friction/edge.
public enum ProvenanceSource: String, Codable, CaseIterable, Sendable {
    case manual          // typed by the designer
    case ocr             // N1 tag/label OCR
    case code            // N2 barcode/QR
    case measure         // N3 AR / manual measure
    case voice           // N4 voice transcript
    case smartGuess      // N5 vision/heuristic guess (unconfirmed)
    case imported        // E3 share-sheet / photos import
    case edited          // a recognised/measured value the designer changed
}

/// Library (keep) vs inbox (triage) — S3 destination decision.
public enum CaptureDestination: String, Codable, Sendable {
    case undecided, library, inbox
}

/// Lifecycle/sync status of a specimen record.
public enum CaptureStatus: String, Codable, Sendable {
    case draft        // being built (C3/C5)
    case ready        // user committed; in the local outbox
    case queued       // offline, awaiting signal (R4)
    case uploading    // artifacts uploading
    case committed    // landed server-side (library or inbox)
    case failed       // sync error; retryable
}

/// Which dimension a measurement reads (N3).
public enum MeasurementAxis: String, Codable, CaseIterable, Sendable {
    case width, height, depth, diagonal, custom
}

/// How a measurement was taken (N3).
public enum MeasureSource: String, Codable, Sendable {
    case arkit, manual
}
