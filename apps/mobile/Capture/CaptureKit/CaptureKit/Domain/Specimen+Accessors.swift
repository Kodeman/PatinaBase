//  Specimen+Accessors.swift
//  CaptureKit
//
//  Typed accessors over the raw-string storage, and the SINGLE sanctioned
//  mutation path (`setValue`) so provenance + updatedAt always stay in sync.

import Foundation

public extension Specimen {
    var category: SpecimenCategory {
        get { SpecimenCategory(rawValue: categoryRaw) ?? .unknown }
        set { categoryRaw = newValue.rawValue }
    }
    var destination: CaptureDestination {
        get { CaptureDestination(rawValue: destinationRaw) ?? .undecided }
        set { destinationRaw = newValue.rawValue }
    }
    var status: CaptureStatus {
        get { CaptureStatus(rawValue: statusRaw) ?? .draft }
        set { statusRaw = newValue.rawValue }
    }

    /// Provenance of a field, if it has been set.
    func provenance(for key: FieldKey) -> ProvenanceSource? {
        provenanceRaw[key.rawValue].flatMap(ProvenanceSource.init(rawValue:))
    }

    var primaryPhoto: CapturePhoto? {
        photos.first(where: { $0.isPrimary }) ?? photos.sorted(by: { $0.order < $1.order }).first
    }

    /// Has any field been set by a smart guess that the designer hasn't confirmed?
    var hasUnconfirmedGuess: Bool {
        provenanceRaw.values.contains(ProvenanceSource.smartGuess.rawValue)
    }

    /// THE mutation entry point: writes the field, records provenance, bumps updatedAt.
    /// Guesses never overwrite a value a tag/scan/measure/human already set
    /// (the spec's "guesses never overwrite" rule, N5).
    func setValue(_ value: String?, for key: FieldKey, source: ProvenanceSource) {
        if source == .smartGuess, let existing = provenance(for: key),
           existing != .smartGuess {
            return // don't clobber a confirmed/recognised value with a guess
        }
        switch key {
        case .title:     title = value
        case .maker:     maker = value
        case .sku:       sku = value
        case .colorway:  colorway = value
        case .material:  materialNote = value
        case .price:     priceTradeCents = value.flatMap { Int($0) }
        case .sourceURL: sourceURL = value
        case .note:      note = value
        case .category:  if let v = value { categoryRaw = v }
        case .dimensions: break // dimensions live in `measurements`; use addMeasurement
        }
        provenanceRaw[key.rawValue] = source.rawValue
        touch()
    }

    func setConfidence(_ confidence: Double, for key: FieldKey) {
        guessConfidenceRaw[key.rawValue] = confidence
    }

    func addMeasurement(axis: MeasurementAxis, millimeters: Double, source: MeasureSource) {
        let m = CaptureMeasurement(axisRaw: axis.rawValue, millimeters: millimeters, sourceRaw: source.rawValue)
        m.specimen = self
        measurements.append(m)
        provenanceRaw[FieldKey.dimensions.rawValue] =
            (source == .arkit ? ProvenanceSource.measure : ProvenanceSource.manual).rawValue
        touch()
    }

    func touch() { updatedAt = Date() }
}
