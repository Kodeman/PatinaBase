//  FieldCapturePayload.swift
//  CaptureKit
//
//  The `p_payload` envelope for the `commit_field_capture` RPC (migration 00235).
//  PURE Foundation/Codable — no SwiftData persistence types leak out, no SDK — so
//  it unit-tests in the CaptureKit-only target and the app layer just encodes it
//  and hands it to supabase-swift.
//
//  KEYS ARE THE CONTRACT. The RPC reads camelCase JSON keys via `->>` / `#>>`
//  (e.g. `thumbnailUrl`, `priceTradeCents`, `attributes.styleTags`,
//  `venue.accuracyM`, `voice.audioPath`, photo `publicUrl`). The Supabase
//  PostgREST encoder applies NO key strategy, so these property names ARE the
//  wire keys — do NOT rename one without editing migration 00235's extraction.
//
//  Optional fields are omitted when nil (Swift synthesises `encodeIfPresent`),
//  which the RPC tolerates (every `#>>`/`->>` read coalesces a missing key to
//  NULL / '{}'). That keeps a bare capture's payload minimal.

import Foundation

public struct FieldCapturePayload: Codable, Equatable, Sendable {
    public var title: String?
    public var notes: String?
    public var category: String?
    public var subcategory: String?
    public var measurements: Measurements?
    public var tag: Tag?
    public var barcode: Barcode?
    public var attributes: Attributes?
    /// FieldKey.rawValue -> smart-guess confidence (0...1). Stored raw by 00235.
    public var guesses: [String: Double]?
    public var voice: Voice?
    public var photos: [Photo]
    public var thumbnailUrl: String?
    public var venue: Venue?
    /// FieldKey.rawValue -> ProvenanceSource.rawValue. Stored raw by 00235 and
    /// copied onto the minted product's `capture_provenance`.
    public var provenance: [String: String]?
    public var device: Device?
    /// 'note' | 'context' | nil. Read by the W1 migration into
    /// field_captures.capture_kind, which CHECKs ('specimen','note','context').
    public var captureKind: String?
    public var schemaVersion: Int

    /// Bumped only alongside a 00235-side reader change.
    public static let currentSchemaVersion = 2

    // ── Nested envelopes (each key path is read individually by 00235) ────────

    public struct Measurements: Codable, Equatable, Sendable {
        public var width: Double?
        public var height: Double?
        public var depth: Double?
        public var unit: String?
    }

    public struct Tag: Codable, Equatable, Sendable {
        public var vendorName: String?
        public var sku: String?
        public var priceTradeCents: Int?
        public var priceRetailCents: Int?
        /// `::uuid` in 00235 — only ever a valid UUID string or omitted.
        public var vendorId: String?
    }

    public struct Barcode: Codable, Equatable, Sendable {
        public var value: String?
        public var symbology: String?
        /// `::uuid` in 00235 — only ever a valid UUID string or omitted.
        public var catalogMatchProductId: String?
    }

    public struct Attributes: Codable, Equatable, Sendable {
        public var materials: [String]?
        public var colors: [String]?
        public var finish: String?
        public var styleTags: [String]?
        public var materialTags: [String]?
    }

    public struct Voice: Codable, Equatable, Sendable {
        /// Relative filename from the builder; the app upgrades it to the full
        /// `<uid>/<clientToken>/<file>` capture-media object path at upload time.
        public var audioPath: String?
        /// Ordered segment filenames; the app upgrades each to its full
        /// `<uid>/<clientToken>/<file>` object path at upload time, exactly as
        /// it already does for `audioPath`.
        public var audioSegments: [String]?
        /// True only when a segment that WAS written could not be read at upload
        /// time — full disk, reinstall, retention sweep. A dropped segment is
        /// OMITTED from `audioSegments`, never a hole and never a null, so this
        /// flag is the only signal that the ordered list is short. Omitted when
        /// nothing was lost: a `false` on every well-formed note is noise.
        /// Audio that never existed yields no filename at all and never lands
        /// here — the recorder drops a segment it failed to start.
        public var audioLost: Bool?
        /// 'device' | 'device_partial' — which reading produced `transcript`.
        public var transcriptSource: String?
        public var transcript: String?
        public var partialTranscript: String?
        public var durationSeconds: Double?
    }

    public struct Photo: Codable, Equatable, Sendable {
        /// capture-media object path set at upload time (`CapturePhoto.remotePath`).
        public var path: String?
        /// Public URL for the minted product's image set. nil for the private
        /// capture-media bucket (00234) — the product simply gets no image here.
        public var publicUrl: String?
        public var isPrimary: Bool
        public var isDuplicate: Bool
        public var width: Int
        public var height: Int
        public var order: Int
        public var captureMode: String
    }

    public struct Venue: Codable, Equatable, Sendable {
        public var lat: Double?
        public var lng: Double?
        public var accuracyM: Double?
        public var label: String?
        public var placeId: String?
        /// ISO8601 string — `(v_payload#>>'{venue,capturedAt}')::timestamptz`.
        public var capturedAt: String?
        public var timezone: String?
    }

    public struct Device: Codable, Equatable, Sendable {
        public var model: String?
        public var osVersion: String?
        public var appVersion: String?
        public init(model: String? = nil, osVersion: String? = nil, appVersion: String? = nil) {
            self.model = model
            self.osVersion = osVersion
            self.appVersion = appVersion
        }
    }
}

// MARK: - Builder (Specimen + children → payload)

public extension FieldCapturePayload {
    /// Map a `Specimen` (and its cascade children) into the wire envelope.
    ///
    /// `clientToken` is intentionally absent — it is the RPC's `p_client_capture_id`
    /// argument, not a payload field. Photo `path` comes from each
    /// `CapturePhoto.remotePath` (set at upload); a not-yet-uploaded photo simply
    /// omits its path.
    init(specimen s: Specimen, device: Device) {
        self.title = s.title?.nonEmpty
        self.notes = s.note?.nonEmpty
        // Emit the raw category unless it is the sentinel "unknown".
        self.category = s.categoryRaw == SpecimenCategory.unknown.rawValue ? nil : s.categoryRaw.nonEmpty
        self.subcategory = nil // no Specimen source in the frozen schema
        self.measurements = Self.buildMeasurements(s.measurements)
        self.tag = Self.buildTag(s)
        self.barcode = Self.buildBarcode(s)
        self.attributes = Self.buildAttributes(s)
        self.guesses = s.guessConfidenceRaw.isEmpty ? nil : s.guessConfidenceRaw
        self.voice = Self.buildVoice(s)
        self.photos = s.photos
            .sorted { $0.order < $1.order }
            .map {
                Photo(path: $0.remotePath?.nonEmpty,
                      publicUrl: $0.publicURL?.nonEmpty,
                      isPrimary: $0.isPrimary,
                      isDuplicate: $0.isDuplicate,
                      width: $0.width,
                      height: $0.height,
                      order: $0.order,
                      captureMode: $0.captureModeRaw)
            }
        self.thumbnailUrl = nil // private bucket (00234) → no public thumbnail yet
        self.venue = s.venue.map(Self.buildVenue)
        self.provenance = s.provenanceRaw.isEmpty ? nil : s.provenanceRaw
        self.device = device
        self.captureKind = s.captureKindRaw?.nonEmpty
        self.schemaVersion = Self.currentSchemaVersion
    }

    // ── piecewise mappers ─────────────────────────────────────────────────────

    private static func buildMeasurements(_ ms: [CaptureMeasurement]) -> Measurements? {
        var width: Double?
        var height: Double?
        var depth: Double?
        // Chronological order → the most recent value per axis wins.
        for m in ms {
            switch MeasurementAxis(rawValue: m.axisRaw) {
            case .width:  width = m.millimeters
            case .height: height = m.millimeters
            case .depth:  depth = m.millimeters
            default: break // diagonal / custom have no {width,height,depth} slot
            }
        }
        guard width != nil || height != nil || depth != nil else { return nil }
        return Measurements(width: width, height: height, depth: depth, unit: "mm")
    }

    private static func buildTag(_ s: Specimen) -> Tag? {
        let vendorName = s.maker?.nonEmpty
        let sku = s.sku?.nonEmpty
        let trade = s.priceTradeCents
        let retail = s.priceRetailCents
        guard vendorName != nil || sku != nil || trade != nil || retail != nil else { return nil }
        return Tag(vendorName: vendorName, sku: sku,
                   priceTradeCents: trade, priceRetailCents: retail, vendorId: nil)
    }

    private static func buildBarcode(_ s: Specimen) -> Barcode? {
        // scannedCodes are "<kind>:<value>" tags (e.g. "gtin:00123", "url:https://…").
        // Treat only real barcode kinds (not url/text) as a barcode.
        var value: String?
        var symbology: String?
        for raw in s.scannedCodes {
            guard let sep = raw.firstIndex(of: ":") else { continue }
            let kind = String(raw[..<sep])
            if kind == "url" || kind == "text" { continue }
            value = String(raw[raw.index(after: sep)...]).nonEmpty
            symbology = kind.nonEmpty
            break
        }
        // catalogMatchProductId is a `::uuid` cast OUTSIDE 00235's safe-harbor, so
        // a non-UUID (catalogMatchRemoteId often holds the raw code payload) would
        // abort the whole commit. Emit only a genuine UUID.
        let catalogId = s.catalogMatchRemoteId.flatMap { UUID(uuidString: $0) }?.uuidString
        guard value != nil || catalogId != nil else { return nil }
        return Barcode(value: value, symbology: symbology, catalogMatchProductId: catalogId)
    }

    private static func buildAttributes(_ s: Specimen) -> Attributes? {
        let materials = s.materials.isEmpty ? nil : s.materials
        let colors = s.colors.isEmpty ? nil : s.colors
        let styleTags = s.styleTags.isEmpty ? nil : s.styleTags
        let finish = s.finish?.nonEmpty
        guard materials != nil || colors != nil || styleTags != nil || finish != nil else { return nil }
        return Attributes(materials: materials, colors: colors, finish: finish,
                          styleTags: styleTags, materialTags: nil)
    }

    private static func buildVoice(_ s: Specimen) -> Voice? {
        let transcript = s.voiceTranscript?.nonEmpty
        let partial = s.voicePartialTranscript?.nonEmpty
        let audioPath = s.voiceAudioFilename?.nonEmpty
        let segments = (s.voiceAudioSegmentsRaw ?? [])
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        let duration = s.voiceDurationSeconds
        guard transcript != nil || partial != nil || audioPath != nil
                || !segments.isEmpty || duration != nil else { return nil }
        return Voice(audioPath: audioPath,
                     audioSegments: segments.isEmpty ? nil : segments,
                     transcriptSource: s.voiceTranscriptSourceRaw?.nonEmpty,
                     transcript: transcript,
                     partialTranscript: partial,
                     durationSeconds: duration)
    }

    private static func buildVenue(_ v: VenueStamp) -> Venue {
        Venue(lat: v.latitude,
              lng: v.longitude,
              accuracyM: v.accuracyMeters,
              label: v.placemarkName?.nonEmpty,
              placeId: v.placeId?.nonEmpty,
              capturedAt: venueDateFormatter.string(from: v.capturedAt),
              timezone: v.timezoneIdentifier?.nonEmpty)
    }

    private static let venueDateFormatter = ISO8601DateFormatter()
}

private extension String {
    /// nil for an empty string, so absent fields stay absent in the payload.
    var nonEmpty: String? { isEmpty ? nil : self }
}
