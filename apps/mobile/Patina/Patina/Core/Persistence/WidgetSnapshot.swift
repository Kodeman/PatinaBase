//
//  WidgetSnapshot.swift
//  Patina
//
//  What the widget is allowed to know.
//
//  `house-record.json` carries `needsYou` — the list of what is owed. Q8 and
//  C5 forbid the widget from carrying that ("carries what moved, not what is
//  owed"), and B §4 / 2x-panel-u1 §6 forbid a count on either family: "a
//  running tally of chores on the Lock Screen is the instrument §10 refuses
//  with a true number in it".
//
//  A widget that decoded `HouseRecord` would be one line of code from breaking
//  that ruling. So it decodes this instead — a payload with no `needsYou`
//  field to read, no count of anything, and no badge number. The rule is
//  structural, not a review comment, and `WidgetSnapshotTests` decodes the
//  written file and asserts the key is absent.
//
//  Two more rules live in the shape:
//   • `refreshedAt` is when the APP wrote the file, never "now". Q8 permits the
//     widget to sit one open behind; it must be able to SAY so.
//   • `ownerId` names the account the payload was built for (B-16). It was
//     omitted on the theory that the file is CLEARED on sign-out instead — but
//     `RecordSnapshotStore.remove()`'s only caller is
//     `LocalStoreReset.wipeUserScopedData()`, which runs when a DIFFERENT
//     account signs IN. Sign-out itself calls neither, so a signed-out phone
//     kept a named designer and "Leah Hartwell picked up your request." on its
//     Home Screen. Two things close it: the sign-out seam writes a placeholder
//     (`clearForSignedOut()`), and the payload says whose it is so a file that
//     survives some path nobody has thought of can still be judged. A widget
//     process cannot ask who is signed in — but the app can, and does.
//
//  The contract with W6's X1 lane is the JSON on disk, published in
//  `waves/w6/x2-tasks.md` §0: the keys below are the property names verbatim,
//  dates are ISO8601, and the widget keeps its own local mirror of these
//  shapes. Nothing is shared at the source level.
//

import Foundation

/// One MOVED row, as the widget draws it. No `isNew`: "new" is computed
/// against `LastSeenStore` at build time, and a widget re-deriving it against
/// its own clock would be fabricating.
struct WidgetRow: Codable, Equatable, Sendable {
    let id: String
    let title: String
    let date: Date
    let route: WidgetRouteToken?
}

/// `AppRoute` is `Hashable`, not `Codable`, and belongs to the coordinator.
/// The same `kind` vocabulary `HouseRecord`'s own token uses, so the two files
/// on disk can never disagree about what a destination is called.
struct WidgetRouteToken: Codable, Equatable, Sendable {
    let kind: String
    let id: String?

    init?(_ route: AppRoute) {
        switch route {
        case .decisionDetail(let value): self.init(kind: "decision", id: value)
        case .proposalDetail(let value): self.init(kind: "proposal", id: value)
        case .invoiceDetail(let value): self.init(kind: "invoice", id: value)
        case .threadDetail(let value): self.init(kind: "thread", id: value)
        case .projectDetail(let value): self.init(kind: "project", id: value)
        case .pieceDetail(let value): self.init(kind: "piece", id: value)
        case .designRequests(let value): self.init(kind: "designRequests", id: value)
        case .orderDetail(let value): self.init(kind: "order", id: value)
        default: return nil
        }
    }

    private init(kind: String, id: String?) {
        self.kind = kind
        self.id = id
    }
}

/// The whole of what leaves the app for the widget.
struct WidgetSnapshot: Codable, Equatable, Sendable {

    /// The file name the app writes and the widget reads. Beside
    /// `house-record.json`, in the same container, resolved the same way.
    static let fileName = "widget-snapshot.json"

    /// The `kind:` X1's `Widget` must declare. One widget, both families
    /// (Q8: "one small widget, Home + Lock Screen"), so one kind string —
    /// `WidgetCenter.shared.reloadTimelines(ofKind:)` names it on every write.
    static let widgetKind = "PatinaHouseWidget"

    /// MOVED only, in the order the record drew them: newest first, at most
    /// three. NEEDS YOU is not projected and has no field here.
    let movedRows: [WidgetRow]
    /// The house rail's first room, or nil when the house has none yet.
    let houseLine: String?
    /// The start of the record's MOVED window — the day the widget's eyebrow
    /// names (`SINCE THU`, M6b) and the day its empty line names (`Nothing
    /// moved since Thursday.`). It is the window the app actually computed,
    /// never "now" and never a day the widget invents: without it X1 falls
    /// back to `What moved` / `Nothing moved.`, which is honest but is not the
    /// ruled copy.
    let sinceDate: Date?
    /// When the app last wrote this file. The widget says this when the
    /// snapshot is stale.
    let refreshedAt: Date
    /// `house-widget`, as the app last resolved it.
    ///
    /// **D5 (2026-09-02) changed what this gates.** It used to decide whether a
    /// placed widget drew anything at all, which meant a round-one tester —
    /// `house-widget` off, and staying off — read "Open Patina to see your
    /// house." forever with two real rows sitting in this file (GAP7B-02). It
    /// is still written, because W2 may gate in-app *promotion* with it, and it
    /// no longer reaches the render path.
    let flagOn: Bool

    /// The account this payload was built for. nil is the signed-out
    /// placeholder, and the only payload the widget refuses to draw (B-16).
    let ownerId: String?

    /// The projection. MOVED rows only, and nothing derived from `needsYou`
    /// reaches it — not its contents, not its count, not whether it is empty.
    ///
    /// A row with no route is dropped here rather than drawn with the plain
    /// door underneath it: the widget carries an id, the app resolves it, and a
    /// row whose id resolves to nothing sends every tap to Today with no
    /// explanation. A story has no destination in this app, so it has no place
    /// on a surface whose only affordance is a tap (GAP7B-05).
    init(record: HouseRecord, houseLine: String?, refreshedAt: Date, flagOn: Bool, ownerId: String?) {
        self.movedRows = record.moved.compactMap { row in
            guard let route = row.route.flatMap(WidgetRouteToken.init) else { return nil }
            return WidgetRow(id: row.id, title: row.title, date: row.date, route: route)
        }
        self.houseLine = houseLine
        self.sinceDate = record.window.start
        self.refreshedAt = refreshedAt
        self.flagOn = flagOn
        self.ownerId = ownerId
    }

    init(
        movedRows: [WidgetRow],
        houseLine: String?,
        sinceDate: Date?,
        refreshedAt: Date,
        flagOn: Bool,
        ownerId: String?
    ) {
        self.movedRows = movedRows
        self.houseLine = houseLine
        self.sinceDate = sinceDate
        self.refreshedAt = refreshedAt
        self.flagOn = flagOn
        self.ownerId = ownerId
    }
}
