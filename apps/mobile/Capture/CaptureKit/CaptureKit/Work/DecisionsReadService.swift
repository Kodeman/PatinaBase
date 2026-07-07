//  DecisionsReadService.swift
//  CaptureKit
//
//  D1/D2 seam — READ-ONLY client-decisions surface: the pending list and one
//  decision's options. PURE Foundation (no SDK): the app's concrete maps the
//  reference `DecisionsAPIClient` rows (client_decisions + client_decision_options
//  with the embedded catalog product) into these Field DTOs via its `resolved*`
//  accessors; the mock returns fixtures. Wave D builds the read screens against
//  this. (Selecting/consenting is a web-only write path — NOT in this seam.)
//
//  DTO shaping (from DecisionsAPIClient selects):
//  `sentAt` ← client_decisions.created_at (creation ≈ sent); `projectName` ←
//  embedded project.name; `clientName` is a resolved display string (no name
//  column on the decision). Option fields use the reference `resolved*` fallbacks
//  (manual field first, linked-product fallback); `priceLabel` is a formatted
//  string built from the resolved cents.

import Foundation

/// A pending decision for the D1 list.
public struct FieldDecision: Identifiable, Sendable, Codable {
    public let id: String
    public let title: String
    /// Embedded `project.name`, when the decision is linked to a project.
    public let projectName: String?
    /// Resolved client display name (concrete joins the participant → profile).
    public let clientName: String?
    public let status: String
    /// When the decision was sent to the client (≈ created_at).
    public let sentAt: Date?
    /// When the client first opened it (`viewed_at`), nil while unseen.
    public let viewedAt: Date?

    public init(id: String, title: String, projectName: String? = nil,
                clientName: String? = nil, status: String,
                sentAt: Date? = nil, viewedAt: Date? = nil) {
        self.id = id
        self.title = title
        self.projectName = projectName
        self.clientName = clientName
        self.status = status
        self.sentAt = sentAt
        self.viewedAt = viewedAt
    }
}

/// One option on a decision (resolved manual-first / product-fallback).
public struct FieldDecisionOption: Identifiable, Sendable, Codable {
    public let id: String
    public let title: String
    /// The designer's note (`designer_note`); no product fallback.
    public let note: String?
    /// Resolved hero image (manual `image_url` else the product's first image).
    public let imageURL: URL?
    /// Formatted price label from the resolved cents (e.g. "$3,120").
    public let priceLabel: String?
    public let isRecommended: Bool
    public let isSelected: Bool

    public init(id: String, title: String, note: String? = nil, imageURL: URL? = nil,
                priceLabel: String? = nil, isRecommended: Bool = false, isSelected: Bool = false) {
        self.id = id
        self.title = title
        self.note = note
        self.imageURL = imageURL
        self.priceLabel = priceLabel
        self.isRecommended = isRecommended
        self.isSelected = isSelected
    }
}

/// A decision plus its options for the D2 detail.
public struct FieldDecisionDetail: Sendable, Codable {
    public let decision: FieldDecision
    /// The designer's framing of the choice (`client_decisions.context`).
    public let context: String?
    public let options: [FieldDecisionOption]

    public init(decision: FieldDecision, context: String? = nil, options: [FieldDecisionOption] = []) {
        self.decision = decision
        self.context = context
        self.options = options
    }
}

public protocol DecisionsReadService: Sendable {
    /// Pending decisions, soonest-due first.
    func listPending() async throws -> [FieldDecision]
    /// One decision with its options.
    func decisionDetail(id: String) async throws -> FieldDecisionDetail
}
