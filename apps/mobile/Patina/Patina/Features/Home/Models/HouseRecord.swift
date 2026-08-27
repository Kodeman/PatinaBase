//
//  HouseRecord.swift
//  Patina
//
//  The Record — what moved on your house while you were away, and what is
//  waiting on you. Direction B's home, R1 "now".
//
//  Honesty (C5) is the whole point of the type: a row exists only for a real
//  event carrying its own real date, `isNew` comes from `LastSeenStore` and
//  never from a day count shown to the person, and an empty half is an empty
//  array — the builder never pads, never invents, never counts days at anyone.
//  Whether an empty half is *drawn* is the caller's decision, by tier.
//

import Foundation

/// One dated thing that happened, or one thing waiting.
struct HouseRecordRow: Identifiable, Codable, Equatable, Sendable {

    enum Kind: String, Codable, Sendable {
        /// NEEDS YOU
        case decisionAsked
        case proposalSent
        case invoiceDue
        /// MOVED
        case messageReceived
        /// Fed by the fulfillment rail from W4 on; no source before then, so
        /// the record simply never emits one.
        case orderMoved
        case savedPieceRepriced
        case savedPieceWithdrawn
        case story
        case matchedDesigner
    }

    /// What sits on the right of the row. `amount` carries the figure the
    /// screen prints; the caller decides when it turns red (money that is
    /// actually late), because only it knows `now`.
    enum State: Codable, Equatable, Sendable {
        case none
        case overdue
        case due(Date)
        case amount(cents: Int, due: Date?)
        case new
    }

    let id: String
    let kind: Kind
    let title: String
    let detail: String?
    /// The date the thing actually happened or was asked. Never substituted.
    let date: Date
    let state: State
    /// True when `date` postdates the last visit. False for everything on a
    /// first run, because there is no last visit to be new against.
    let isNew: Bool
    let route: AppRoute?

    private enum CodingKeys: String, CodingKey {
        case id, kind, title, detail, date, state, isNew, route
    }

    init(
        id: String, kind: Kind, title: String, detail: String?,
        date: Date, state: State, isNew: Bool, route: AppRoute?
    ) {
        self.id = id
        self.kind = kind
        self.title = title
        self.detail = detail
        self.date = date
        self.state = state
        self.isNew = isNew
        self.route = route
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        kind = try container.decode(Kind.self, forKey: .kind)
        title = try container.decode(String.self, forKey: .title)
        detail = try container.decodeIfPresent(String.self, forKey: .detail)
        date = try container.decode(Date.self, forKey: .date)
        state = try container.decode(State.self, forKey: .state)
        isNew = try container.decode(Bool.self, forKey: .isNew)
        route = try container.decodeIfPresent(RouteToken.self, forKey: .route)?.route
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encode(kind, forKey: .kind)
        try container.encode(title, forKey: .title)
        try container.encodeIfPresent(detail, forKey: .detail)
        try container.encode(date, forKey: .date)
        try container.encode(state, forKey: .state)
        try container.encode(isNew, forKey: .isNew)
        try container.encodeIfPresent(route.flatMap(RouteToken.init(_:)), forKey: .route)
    }
}

/// `AppRoute` is `Hashable`, not `Codable`, and belongs to the coordinator —
/// so the snapshot carries a token for exactly the routes the record emits.
/// An unmapped route encodes as absent and decodes to nil: a row that loses
/// its destination across a cold launch is a smaller failure than a snapshot
/// that will not decode at all.
private struct RouteToken: Codable {
    let kind: String
    let id: String?

    init?(_ route: AppRoute) {
        switch route {
        case .decisionDetail(let value): self = RouteToken(kind: "decision", id: value)
        case .proposalDetail(let value): self = RouteToken(kind: "proposal", id: value)
        case .invoiceDetail(let value): self = RouteToken(kind: "invoice", id: value)
        case .threadDetail(let value): self = RouteToken(kind: "thread", id: value)
        case .projectDetail(let value): self = RouteToken(kind: "project", id: value)
        case .pieceDetail(let value): self = RouteToken(kind: "piece", id: value)
        case .designRequests(let value): self = RouteToken(kind: "designRequests", id: value)
        default: return nil
        }
    }

    private init(kind: String, id: String?) {
        self.kind = kind
        self.id = id
    }

    var route: AppRoute? {
        switch kind {
        case "designRequests": return .designRequests(focusLeadId: id)
        default: break
        }
        guard let id else { return nil }
        switch kind {
        case "decision": return .decisionDetail(decisionId: id)
        case "proposal": return .proposalDetail(proposalId: id)
        case "invoice": return .invoiceDetail(invoiceId: id)
        case "thread": return .threadDetail(threadId: id)
        case "project": return .projectDetail(projectId: id)
        case "piece": return .pieceDetail(pieceId: id)
        default: return nil
        }
    }
}

/// The card: two eyebrows, the window they cover, and the visit they are new
/// against.
struct HouseRecord: Codable, Equatable, Sendable {

    /// Ordered by the date each was asked, ascending. At most three; the rest
    /// sit behind `hasMoreNeedsYou`.
    let needsYou: [HouseRecordRow]
    /// Newest first. At most three; the rest sit behind `hasMoreMoved`.
    let moved: [HouseRecordRow]
    /// What the MOVED half covers: a rolling seven days, widened back to the
    /// last visit when that visit was longer ago.
    let window: DateInterval
    /// The visit `isNew` was computed against; nil on a first run.
    let lastSeenAt: Date?
    let hasMoreNeedsYou: Bool
    let hasMoreMoved: Bool

    var isEmpty: Bool { needsYou.isEmpty && moved.isEmpty }

    /// Nothing known yet — before the first build, and after a failed load.
    /// Draws nothing at any tier.
    static let empty = HouseRecord(
        needsYou: [], moved: [],
        window: DateInterval(start: .distantPast, duration: 0),
        lastSeenAt: nil, hasMoreNeedsYou: false, hasMoreMoved: false
    )
}
