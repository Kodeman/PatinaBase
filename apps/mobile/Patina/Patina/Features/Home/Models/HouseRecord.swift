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

/// Composes the record out of what the app already fetched. Pure: it issues
/// no query, so every rule below is testable and none of them can be true on
/// a screen and false in a test.
@MainActor
enum HouseRecordBuilder {

    /// Three per eyebrow; the rest sit behind `See all →`.
    static let maxRowsPerEyebrow = 3
    /// A rebuild inside this window keeps the previous anchor, so the fourth
    /// open of the day does not re-date the card under the reader.
    static let suppressionWindow: TimeInterval = 6 * 60 * 60
    static let rollingWindow: TimeInterval = 7 * 24 * 60 * 60

    /// `previous` is the last record built this session (or loaded from the
    /// snapshot). It exists only for the six-hour suppression; omitting it
    /// simply builds a fresh anchor.
    static func build( // swiftlint:disable:this function_parameter_count
        from badges: BadgeCountService,
        saved: [TableItemModel],
        products: [Product],
        story: RemoteEditorialStory?,
        liveLead: DesignRequestStatus?,
        lastSeen: Date?,
        now: Date = Date(),
        previous: HouseRecord? = nil
    ) -> HouseRecord {
        let suppressing = previous.map {
            now.timeIntervalSince($0.window.end) < suppressionWindow
                && now >= $0.window.end
        } ?? false

        let anchor = suppressing ? previous?.lastSeenAt : lastSeen
        let windowStart = suppressing
            ? (previous?.window.start ?? defaultWindowStart(now: now, lastSeen: anchor))
            : defaultWindowStart(now: now, lastSeen: anchor)
        let window = DateInterval(start: min(windowStart, now), end: now)

        let designerName = resolveDesignerName(badges: badges, liveLead: liveLead)

        // NEEDS YOU is deliberately NOT window-filtered: an open obligation
        // does not age out of view. Nothing decays (B §1).
        let needsYou = needsYouRows(badges: badges, designerName: designerName, now: now)
            .map { $0.markingNew(against: anchor) }
            .sorted { $0.date < $1.date }

        let moved = movedRows(
            badges: badges, saved: saved, products: products, story: story,
            liveLead: liveLead, designerName: designerName
        )
        // Two MOVED rows are standing conditions rather than dated events and
        // are not aged out:
        //  • the matched designer — "a matched request stays on the record
        //    until it resolves" (B §1; the two silent 14-day decays this
        //    program removes are exactly this row disappearing);
        //  • a repriced saved piece — nothing on the wire says when the price
        //    moved, so the row is dated by the save, which is the only date
        //    the app can stand behind.
        // Everything else carries a real event date and is filtered by it.
        .filter { row in
            switch row.kind {
            case .matchedDesigner, .savedPieceRepriced: return true
            default: return window.contains(row.date)
            }
        }
        .map { $0.markingNew(against: anchor) }
        .sorted { $0.date > $1.date }

        return HouseRecord(
            needsYou: Array(needsYou.prefix(maxRowsPerEyebrow)),
            moved: Array(moved.prefix(maxRowsPerEyebrow)),
            window: window,
            lastSeenAt: anchor,
            hasMoreNeedsYou: needsYou.count > maxRowsPerEyebrow,
            hasMoreMoved: moved.count > maxRowsPerEyebrow
        )
    }

    /// A rolling seven days, widened back to the last visit when that visit
    /// was longer ago — "you were last here on the 12th" runs longer, and
    /// still counts no days at the person.
    private static func defaultWindowStart(now: Date, lastSeen: Date?) -> Date {
        let rolling = Calendar.current.startOfDay(for: now)
            .addingTimeInterval(-rollingWindow)
        guard let lastSeen else { return rolling }
        return min(rolling, lastSeen)
    }

    /// The one place a designer's name is chosen, so two rows of one card
    /// cannot name the same person two ways. Nil when nobody is known — the
    /// rows then say "Your designer", never a guess.
    private static func resolveDesignerName(
        badges: BadgeCountService,
        liveLead: DesignRequestStatus?
    ) -> String? {
        if let name = liveLead?.designerName, !name.isEmpty { return name }
        if let name = badges.projects.compactMap({ $0.designer?.displayName }).first,
           name != "your designer" { return name }
        if let name = badges.pendingDecisions
            .compactMap({ $0.project?.designer?.displayName }).first { return name }
        if let name = badges.payableInvoices.compactMap({ $0.designer?.displayName }).first,
           name != "your designer" { return name }
        return nil
    }

    private static func subject(_ name: String?) -> String { name ?? "Your designer" }
}

// MARK: - NEEDS YOU

private extension HouseRecordBuilder {

    static func needsYouRows(
        badges: BadgeCountService,
        designerName: String?,
        now: Date
    ) -> [HouseRecordRow] {
        StudioQueueBuilder.itemizedAwaitingRows(
            decisions: badges.pendingDecisions,
            proposals: badges.pendingProposals,
            invoices: badges.payableInvoices,
            designerFallback: designerName,
            now: now
        )
        .compactMap { item in
            // A row draws only for a real event with its real date. An item
            // that cannot say when it was asked does not draw at all.
            guard let asked = item.askedAt else { return nil }
            return HouseRecordRow(
                id: item.id,
                kind: kind(for: item.kind),
                title: title(for: item),
                detail: detail(for: item),
                date: asked,
                state: state(for: item, now: now),
                isNew: false,
                route: item.route
            )
        }
    }

    static func kind(for itemKind: StudioQueueItemRow.Kind) -> HouseRecordRow.Kind {
        switch itemKind {
        case .decision: return .decisionAsked
        case .proposal: return .proposalSent
        case .invoice: return .invoiceDue
        }
    }

    static func title(for item: StudioQueueItemRow) -> String {
        switch item.kind {
        case .decision: return "\(subject(item.designerName)) asked you to choose."
        case .proposal: return "\(subject(item.designerName)) sent a proposal to review."
        // Not attributed: an invoice is due whoever sent it, and the mock's
        // line is the plain one.
        case .invoice: return "Your invoice is due."
        }
    }

    static func detail(for item: StudioQueueItemRow) -> String? {
        // The subject of the thing — the decision's own question, the
        // proposal's own name, the invoice's own number.
        item.title
    }

    static func state(for item: StudioQueueItemRow, now: Date) -> HouseRecordRow.State {
        switch item.kind {
        case .invoice:
            return .amount(cents: item.amountCents ?? 0, due: item.dueAt)
        case .decision, .proposal:
            guard let due = item.dueAt else { return .none }
            let calendar = Calendar.current
            if calendar.startOfDay(for: due) < calendar.startOfDay(for: now) {
                return .overdue
            }
            return .due(due)
        }
    }
}

// MARK: - MOVED

private extension HouseRecordBuilder {

    static func movedRows(
        badges: BadgeCountService,
        saved: [TableItemModel],
        products: [Product],
        story: RemoteEditorialStory?,
        liveLead: DesignRequestStatus?,
        designerName: String?
    ) -> [HouseRecordRow] {
        var rows: [HouseRecordRow] = []
        if let matched = matchedDesignerRow(liveLead: liveLead, designerName: designerName) {
            rows.append(matched)
        }
        rows.append(contentsOf: messageRows(badges: badges, designerName: designerName))
        rows.append(contentsOf: savedPieceRows(saved: saved, products: products))
        if let story = storyRow(story) {
            rows.append(story)
        }
        return rows
    }

    /// "Leah Hartwell picked up your request." — the fact the app hides today.
    static func matchedDesignerRow(
        liveLead: DesignRequestStatus?,
        designerName: String?
    ) -> HouseRecordRow? {
        guard let lead = liveLead, lead.designerId != nil else { return nil }
        let picked = lead.updatedAt ?? lead.createdAt
        return HouseRecordRow(
            id: "lead:\(lead.leadId.uuidString)",
            kind: .matchedDesigner,
            title: "\(subject(lead.designerName ?? designerName)) picked up your request.",
            detail: nil,
            date: picked,
            state: .none,
            isNew: false,
            route: .designRequests(focusLeadId: lead.leadId.uuidString)
        )
    }

    static func messageRows(
        badges: BadgeCountService,
        designerName: String?
    ) -> [HouseRecordRow] {
        let me = ThreadListViewModel.currentUserId()
        return badges.threadSummaries.compactMap { summary in
            guard ThreadListViewModel.isUnread(summary, me: me),
                  let latest = summary.latestMessage,
                  let arrived = ISO8601DateParsing.dateOrDay(from: latest.created_at)
            else { return nil }
            // The counterpart in a client's thread is the studio side. Where
            // the record knows that person's name it says it; where it does
            // not it stays unattributed rather than inventing a sender.
            let title = designerName.map { "\($0) sent you a message." }
                ?? "A new message."
            return HouseRecordRow(
                id: "thread:\(summary.id)",
                kind: .messageReceived,
                title: title,
                detail: summary.title ?? summary.projects?.name,
                date: arrived,
                state: .none,
                isNew: false,
                route: .threadDetail(threadId: summary.id)
            )
        }
    }

    static func storyRow(_ story: RemoteEditorialStory?) -> HouseRecordRow? {
        guard let story,
              let raw = story.publishedAt,
              let published = ISO8601DateParsing.dateOrDay(from: raw)
        else { return nil }
        return HouseRecordRow(
            id: "story:\(story.id)",
            kind: .story,
            title: "A new story from the workshop.",
            detail: story.title,
            date: published,
            state: .none,
            isNew: false,
            route: nil
        )
    }

    /// The discovering tier's own rows: a saved piece the catalogue withdrew,
    /// and a saved piece whose price moved.
    ///
    /// Composed over the products the caller supplied — a saved piece nobody
    /// fetched draws nothing at all, which is the honest silence rather than a
    /// guess. `products.deleted_at` is on the wire from the direct product
    /// fetch (`select=*`); `get_recommendations` never returns a withdrawn
    /// row, so a withdrawn piece only ever arrives by id.
    static func savedPieceRows(
        saved: [TableItemModel],
        products: [Product]
    ) -> [HouseRecordRow] {
        let byId = Dictionary(products.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })

        return saved.compactMap { item -> HouseRecordRow? in
            guard let productId = item.productId, let product = byId[productId] else { return nil }

            // Withdrawn wins: a piece that has left the catalogue is not also
            // reported as a price change.
            if let withdrawn = product.deletedAt {
                return HouseRecordRow(
                    id: "saved-withdrawn:\(productId)",
                    kind: .savedPieceWithdrawn,
                    title: "The \(item.name) you saved is no longer available.",
                    detail: nil,
                    date: withdrawn,
                    state: .none,
                    isNew: false,
                    route: .pieceDetail(pieceId: productId)
                )
            }

            guard let savedPrice = item.priceInCents,
                  savedPrice > 0, product.priceCents > 0,
                  savedPrice != product.priceCents
            else { return nil }

            let difference = abs(savedPrice - product.priceCents)
            let direction = product.priceCents < savedPrice ? "less" : "more"

            return HouseRecordRow(
                id: "saved-repriced:\(productId)",
                kind: .savedPieceRepriced,
                // Both numbers, always. No was/now strike, no percentage, no
                // scarcity count and no countdown — the change is a fact about
                // a row, not a reason to hurry.
                title: "The \(item.name) you saved is "
                    + "\(PatinaCurrency.formatWholeDollars(cents: difference)) "
                    + "\(direction) than when you saved it.",
                detail: "Saved at \(PatinaCurrency.format(cents: savedPrice)) · "
                    + "now \(PatinaCurrency.format(cents: product.priceCents))",
                // The catalogue does not tell the client when the price
                // changed, so the row is dated when they saved it — the one
                // date the app can stand behind.
                date: item.savedAt,
                state: .none,
                isNew: false,
                route: .pieceDetail(pieceId: productId)
            )
        }
    }
}

private extension HouseRecordRow {
    /// New relative to the last visit, and to nothing else. On a first run
    /// there is no visit, so nothing is new.
    func markingNew(against lastSeen: Date?) -> HouseRecordRow {
        guard let lastSeen else { return self }
        return HouseRecordRow(
            id: id, kind: kind, title: title, detail: detail, date: date,
            state: state, isNew: date > lastSeen, route: route
        )
    }
}
