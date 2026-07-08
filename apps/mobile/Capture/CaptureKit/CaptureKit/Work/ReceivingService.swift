//  ReceivingService.swift
//  CaptureKit
//
//  G1/G2/G3 seam — goods-in: list arriving POs, upload inspection photos, submit
//  an inspection outcome. PURE Foundation (no SDK): the app's concrete mirrors the
//  reference `ReceiveDeliveryViewModel` (purchase_orders SELECT + the photo-upload
//  →  receiving_inspections → damage_claims write path); the mock returns fixtures
//  and echoes stored refs. Wave G builds the screens against this.
//
//  DTO shaping (from ReceiveDeliveryViewModel):
//  `eta` ← confirmed_eta (a YYYY-MM-DD calendar date), `poNumber` ← vendor_po_number,
//  `vendorName`/`projectName` ← the embedded vendor/project. The outcome enum
//  mirrors `ReceivingOutcome` (clean/damaged/partial) and adds `refused` per the
//  Field brief.

import Foundation

/// A purchase order that is currently arriving (G1).
public struct FieldArrivingPO: Identifiable, Sendable, Codable {
    public let id: String
    public let poNumber: String?
    public let vendorName: String?
    public let projectName: String?
    /// Confirmed ETA (calendar date).
    public let eta: Date?
    public let status: String
    /// `purchase_order_payment_pattern` enum value, when set.
    public let paymentPattern: String?

    public init(id: String, poNumber: String? = nil, vendorName: String? = nil,
                projectName: String? = nil, eta: Date? = nil, status: String,
                paymentPattern: String? = nil) {
        self.id = id
        self.poNumber = poNumber
        self.vendorName = vendorName
        self.projectName = projectName
        self.eta = eta
        self.status = status
        self.paymentPattern = paymentPattern
    }
}

/// Inspection outcome. Mirrors the reference `receiving_inspection_outcome` type
/// (clean/damaged/partial, migration 00150); `refused` is the Field addition.
public enum FieldInspectionOutcome: String, Sendable, Codable, CaseIterable {
    case clean
    case damaged
    case partial
    case refused
}

/// A completed inspection ready to submit (G3). `photoRefs` are the stored
/// URLs/paths returned by `uploadInspectionPhoto`.
public struct FieldInspectionSubmission: Sendable, Codable {
    public let poID: String
    public let outcome: FieldInspectionOutcome
    public let notes: String?
    public let photoRefs: [String]
    /// Free-text damage description (required by the concrete when outcome != clean).
    public let damageDescription: String?

    public init(poID: String, outcome: FieldInspectionOutcome, notes: String? = nil,
                photoRefs: [String] = [], damageDescription: String? = nil) {
        self.poID = poID
        self.outcome = outcome
        self.notes = notes
        self.photoRefs = photoRefs
        self.damageDescription = damageDescription
    }
}

public protocol ReceivingService: Sendable {
    /// POs currently arriving (in_production/shipped with a confirmed ETA).
    func arrivingPOs() async throws -> [FieldArrivingPO]
    /// Upload one inspection photo; returns the stored URL/path (a `photoRef`).
    func uploadInspectionPhoto(_ data: Data, poID: String) async throws -> String
    /// Persist the inspection (+ damage claim when the outcome isn't clean).
    func submitInspection(_ submission: FieldInspectionSubmission) async throws
}
