//
//  HouseWidgetPayload.swift
//  PatinaWidgetShared
//
//  The widget's half of the contract with the app (W6, Q8).
//
//  This file is compiled into TWO targets — `PatinaWidget` and `PatinaTests` —
//  through its own `PBXFileSystemSynchronizedRootGroup`. The extension cannot
//  borrow a file out of the app's synchronized group without borrowing all ~600
//  of them, so the shared surface is this one folder and nothing else. It keeps
//  the widget's real decoder and its real link vocabulary under test.
//
//  It deliberately does NOT decode `HouseRecord`. That object carries
//  `needsYou` — the count of what is owed — and Q8 rules the widget carries what
//  MOVED, never what is owed. A separate file with a separate shape makes the
//  ruling structural: there is no member here to render a count from, so no
//  later edit can leak one onto a Lock Screen.
//
//  It is the widget's OWN mirror of the payload X2's `WidgetSnapshot` writes
//  (`waves/w6/x2-tasks.md` §0) — a different type, on purpose. Nothing is
//  shared at the source level between the app and the extension, so the two
//  halves meet only at the JSON, and every field the producer might not send
//  decodes as optional here. Whatever the app omits, the widget still draws
//  something true.
//
//  Foundation only. No WidgetKit, no SwiftUI, no app types.
//

import Foundation

/// One thing that moved, as the app worded it.
struct HouseWidgetPayloadRow: Codable, Equatable, Sendable {

    /// `HouseRecordRow.id`, verbatim, when the app sent one. It is the whole
    /// payload of `patina://record/<id>`: the app resolves it back to the row's
    /// own route against the record it wrote itself, so no route vocabulary is
    /// duplicated here where it could drift.
    let id: String?

    /// The row's own sentence.
    let title: String

    /// The date the thing actually happened. Never substituted, never "now".
    let date: Date

    init(id: String? = nil, title: String, date: Date) {
        self.id = id
        self.title = title
        self.date = date
    }
}

/// What the app leaves for the widget.
///
/// Every field beyond the required core is optional on decode, so the widget
/// renders correctly whether the app writes the minimal shape or the fuller
/// one. Unknown keys are ignored by `JSONDecoder`, and there is no member for
/// `needsYou`, for a count, or for a badge — by construction.
struct HouseWidgetPayload: Codable, Equatable, Sendable {

    /// At most this many rows are ever drawn, whatever the file holds.
    static let maximumRows = 2

    /// Older than this and the widget says when it was refreshed, rather than
    /// letting a stale line pass for a fresh one (C5; Q8's "may sit one open
    /// behind" is a licence to be late, not a licence to be quiet about it).
    static let stalenessThreshold: TimeInterval = 6 * 60 * 60

    /// The file X2's producer writes, in the App Group container — beside
    /// `house-record.json` and deliberately NOT it.
    static let fileName = "widget-snapshot.json"

    /// `FeatureFlags.shared.isOn(.houseWidget)` when the app wrote the file.
    ///
    /// **D5 (2026-09-02): this no longer decides whether a placed widget
    /// draws.** It used to, and `house-widget` is off for round one, so a
    /// tester who added the widget read "Open Patina to see your house."
    /// forever with two real rows in the file (GAP7B-02). The flag gates in-app
    /// promotion; a widget somebody has already placed draws what the app gave
    /// it. Still decoded, because W2 may gate promotion with it.
    let flagOn: Bool

    /// The account the app built this payload for. Absent — or explicitly
    /// null, which is what sign-out writes — is the signed-out placeholder, and
    /// the only thing the widget refuses to draw (B-16). The extension cannot
    /// ask who is signed in; it does not have to, because the app says.
    let ownerId: String?

    /// When the app last built this payload.
    let refreshedAt: Date

    /// MOVED rows only, newest first.
    let movedRows: [HouseWidgetPayloadRow]

    /// One line about the house, worded by the app.
    let houseLine: String?

    /// The start of the MOVED window. The eyebrow's day name and the empty
    /// line's day name both come from here — never from "now".
    let sinceDate: Date?

    /// Reserved. An unrecognised value is ignored rather than refusing to draw.
    let version: Int?

    private enum CodingKeys: String, CodingKey {
        case flagOn, ownerId, refreshedAt, movedRows, houseLine, sinceDate, version
    }

    init(
        flagOn: Bool,
        refreshedAt: Date,
        movedRows: [HouseWidgetPayloadRow],
        houseLine: String? = nil,
        sinceDate: Date? = nil,
        ownerId: String? = nil,
        version: Int? = 1
    ) {
        self.flagOn = flagOn
        self.refreshedAt = refreshedAt
        self.movedRows = movedRows
        self.houseLine = houseLine
        self.sinceDate = sinceDate
        self.ownerId = ownerId
        self.version = version
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        flagOn = try container.decodeIfPresent(Bool.self, forKey: .flagOn) ?? false
        ownerId = try container.decodeIfPresent(String.self, forKey: .ownerId)
        refreshedAt = try container.decode(Date.self, forKey: .refreshedAt)
        movedRows = try container.decodeIfPresent([HouseWidgetPayloadRow].self, forKey: .movedRows) ?? []
        houseLine = try container.decodeIfPresent(String.self, forKey: .houseLine)
        sinceDate = try container.decodeIfPresent(Date.self, forKey: .sinceDate)
        version = try container.decodeIfPresent(Int.self, forKey: .version)
    }

    // MARK: - What the widget is allowed to draw

    /// The rows the widget draws. Capped here rather than at the view, so a
    /// longer file cannot widen the surface.
    ///
    /// D5: not gated on `flagOn`. A widget somebody placed draws what the app
    /// gave it; the flag decides whether the app promotes the widget.
    var drawableRows: [HouseWidgetPayloadRow] {
        isPlaceholder ? [] : Array(movedRows.prefix(Self.maximumRows))
    }

    /// True when nobody owns what is on disk — the signed-out placeholder, or a
    /// file written before the app carried an owner. The widget then draws its
    /// placeholder rather than a row it cannot attribute (B-16).
    var isPlaceholder: Bool { ownerId == nil }

    /// True when the payload is owned and the window simply held nothing.
    var isEmpty: Bool { !isPlaceholder && movedRows.isEmpty }

    // MARK: - Copy

    /// `SINCE THU` in the mock (M6b); the view uppercases it. Without a window
    /// the eyebrow names no day rather than inventing one.
    func eyebrow(locale: Locale = .autoupdatingCurrent, timeZone: TimeZone = .current) -> String {
        guard let sinceDate else { return "What moved" }
        return "Since \(Self.dayName(sinceDate, format: "EEE", locale: locale, timeZone: timeZone))"
    }

    /// M6b's empty variant, verbatim: `Nothing moved since Thursday.`
    /// The day comes from the window the app sent. Without one, the line still
    /// tells the truth and claims no day.
    func emptyLine(locale: Locale = .autoupdatingCurrent, timeZone: TimeZone = .current) -> String {
        guard let sinceDate else { return "Nothing moved." }
        return "Nothing moved since \(Self.dayName(sinceDate, format: "EEEE", locale: locale, timeZone: timeZone))."
    }

    /// `Refreshed 8 hours ago` — drawn only once the payload is genuinely old.
    /// nil while it is fresh, so a current widget carries no apology.
    func refreshedLine(
        now: Date = Date(),
        locale: Locale = .autoupdatingCurrent
    ) -> String? {
        let age = now.timeIntervalSince(refreshedAt)
        guard age >= Self.stalenessThreshold else { return nil }
        let formatter = RelativeDateTimeFormatter()
        formatter.locale = locale
        formatter.unitsStyle = .full
        return "Refreshed \(formatter.localizedString(for: refreshedAt, relativeTo: now))"
    }

    private static func dayName(
        _ date: Date,
        format: String,
        locale: Locale,
        timeZone: TimeZone
    ) -> String {
        let formatter = DateFormatter()
        formatter.locale = locale
        formatter.timeZone = timeZone
        formatter.setLocalizedDateFormatFromTemplate(format)
        if formatter.dateFormat?.isEmpty != false { formatter.dateFormat = format }
        return formatter.string(from: date)
    }
}

/// Reads the payload the app leaves in the App Group container.
///
/// The fallback chain mirrors `RecordSnapshotStore`'s, and for the same reason:
/// `containerURL(forSecurityApplicationGroupIdentifier:)` returns nil whenever
/// the entitlement is not honoured by the running process. In the widget that
/// simply means there is nothing to read, and the widget draws its no-data
/// state — never stale content, never invented content.
struct HouseWidgetPayloadStore: Sendable {

    static let appGroupIdentifier = "group.cloud.patina.app"

    let fileURL: URL

    /// False when the App Group container was unreachable.
    let usesAppGroupContainer: Bool

    init(
        appGroupIdentifier: String = HouseWidgetPayloadStore.appGroupIdentifier,
        fileManager: FileManager = .default,
        directory: URL? = nil
    ) {
        let groupDirectory = fileManager
            .containerURL(forSecurityApplicationGroupIdentifier: appGroupIdentifier)
        let resolved = directory
            ?? groupDirectory
            ?? fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? URL(fileURLWithPath: NSTemporaryDirectory())
        self.usesAppGroupContainer = directory == nil && groupDirectory != nil
        self.fileURL = resolved.appendingPathComponent(HouseWidgetPayload.fileName)
    }

    /// nil when nothing has been written, or when what was written no longer
    /// decodes. A stale shape must draw the no-data state, not a guess.
    func load() -> HouseWidgetPayload? {
        guard let data = try? Data(contentsOf: fileURL) else { return nil }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try? decoder.decode(HouseWidgetPayload.self, from: data)
    }
}

/// Every fixed string the widget can print. Here rather than in the views so a
/// test can hold the ruled copy to its word.
enum HouseWidgetCopy {

    /// M6's screen sheet, verbatim.
    static let noData = "Open Patina to see your house."

    /// The Lock Screen has room for the invitation and nothing else.
    static let noDataShort = "Open Patina."

    static func date(_ date: Date) -> String {
        date.formatted(.dateTime.month(.abbreviated).day())
    }
}

/// The URLs the widget hands the app. `DeepLinkHandler.route(forWidgetLink:in:)`
/// is the other half; both halves are compiled into `PatinaTests`, so the round
/// trip is pinned in one place.
enum PatinaWidgetLinks {

    /// Must match `APIConfiguration.appURLScheme`.
    static let scheme = "patina"

    static let todayHost = "today"
    static let recordHost = "record"

    /// M6d: "Tapping the widget opens M1 plain."
    static var today: URL {
        URL(string: "\(scheme)://\(todayHost)") ?? URL(fileURLWithPath: "/")
    }

    /// The row's own door. `rowId` is `HouseRecordRow.id`, which can itself be a
    /// prefixed token carrying colons (`order:direct:<uuid>`), so it is escaped
    /// as a single path component.
    static func record(rowId: String) -> URL {
        let escaped = rowId.addingPercentEncoding(withAllowedCharacters: .patinaWidgetPathAllowed)
        guard let escaped, !escaped.isEmpty,
              let url = URL(string: "\(scheme)://\(recordHost)/\(escaped)") else {
            return today
        }
        return url
    }

    /// The link a drawn row should carry: its own door when the app sent an id,
    /// Today when it did not. A widget tap never dead-ends.
    static func link(for row: HouseWidgetPayloadRow?) -> URL {
        guard let id = row?.id, !id.isEmpty else { return today }
        return record(rowId: id)
    }
}

private extension CharacterSet {
    /// `urlPathAllowed` keeps `/`, which would split one row id into two path
    /// components. Everything else about it is right.
    static let patinaWidgetPathAllowed = CharacterSet.urlPathAllowed.subtracting(CharacterSet(charactersIn: "/"))
}
