//
//  NotificationCategories.swift
//  Patina
//
//  `P-22`. The lock screen as the first frame.
//
//  Three categories — `PATINA_DECISION`, `PATINA_PROPOSAL`, `PATINA_INVOICE` —
//  each carrying two acts and no more: **Open**, and **Ask a question**. Both
//  are foreground: they carry the reader into the app, where the document is.
//
//  There is no Approve and no Sign, ever. A one-tap approve from a lock screen
//  would consent to a document nobody has opened, and a phone face-up on a
//  counter is not proof of who tapped it. That refusal is the reason this file
//  exists at all — the categories are what makes the OS draw OUR two acts
//  instead of leaving the banner bare.
//
//  Thread identifiers are the backend's: `decision-<id>`, `proposal-<id>`,
//  `invoice-<id>`, so a reminder REPLACES the letter it repeats rather than
//  stacking a second one under it. This file names that shape once, on the
//  category, so the app reads the same string the sender wrote.
//
//  Ruled OUT of this build (`rulings-2026-09-04.md`): the Notification Service
//  Extension that would carry an option swatch. A new target needs its own
//  provisioning and an archive-side decision; the banner degrades to plain
//  text, which is what it draws today.
//

import Foundation
import UserNotifications

/// The three lock-screen categories, and the vocabulary each one speaks.
///
/// The raw value is the `aps.category` string on the wire. `entityType` is the
/// same row's `entity_type`, so one enum answers both the OS and the router.
public enum PatinaNotificationCategory: String, CaseIterable, Sendable {
    case decision = "PATINA_DECISION"
    case proposal = "PATINA_PROPOSAL"
    case invoice = "PATINA_INVOICE"

    /// `metadata.entity_type` / the APNs envelope's own key (00534:149).
    public var entityType: String {
        switch self {
        case .decision: return "decision"
        case .proposal: return "proposal"
        case .invoice: return "invoice"
        }
    }

    /// The category a payload names, whichever key it names it under. `aps` is
    /// where APNs itself puts it; the flat key is accepted because the envelope
    /// is hand-assembled per call site.
    public static func from(apnsUserInfo userInfo: [AnyHashable: Any]) -> PatinaNotificationCategory? {
        if let aps = userInfo["aps"] as? [AnyHashable: Any],
           let raw = aps["category"] as? String,
           let category = PatinaNotificationCategory(rawValue: raw) {
            return category
        }
        if let raw = userInfo["category"] as? String {
            return PatinaNotificationCategory(rawValue: raw)
        }
        // Nothing named a category: the entity does, which is what every
        // pre-P-22 envelope carries and what a Wave 1 push still is.
        guard let entity = (userInfo["entity_type"] as? String)?.lowercased() else { return nil }
        return PatinaNotificationCategory.allCases.first { $0.entityType == entity }
    }

    /// `decision-<id>` — the thread the backend groups this letter under, so a
    /// reminder collapses onto the ask it repeats instead of stacking.
    public func threadIdentifier(entityId: String) -> String {
        "\(entityType)-\(entityId)"
    }

    /// The entity a thread identifier names, or nil when the string is not one
    /// of ours. Read from the FIRST hyphen only: an entity id can contain them.
    public static func entity(fromThreadIdentifier identifier: String) -> (
        category: PatinaNotificationCategory, entityId: String
    )? {
        guard let separator = identifier.firstIndex(of: "-") else { return nil }
        let prefix = String(identifier[identifier.startIndex..<separator])
        let id = String(identifier[identifier.index(after: separator)...])
        guard !id.isEmpty,
              let category = allCases.first(where: { $0.entityType == prefix })
        else { return nil }
        return (category, id)
    }
}

/// The two acts. Never an outcome — see the file header.
public enum PatinaNotificationAction: String, CaseIterable, Sendable {
    case open = "PATINA_OPEN"
    case askQuestion = "PATINA_ASK_QUESTION"

    /// The word on the button. Plain, second person, no urgency register (R8).
    public var title: String {
        switch self {
        case .open: return "Open"
        case .askQuestion: return "Ask a question"
        }
    }
}

/// Builds and registers the category set, and says where each act lands.
///
/// Pure except for `register`, so the whole table is a fact a test can hold.
public enum NotificationCategories {

    /// Words no lock-screen act may carry. An approval given from a banner is
    /// an approval given to an unread document; this is the pin that keeps a
    /// later hand from adding one.
    static let refusedActionWords = ["approve", "sign", "accept", "pay", "decline"]

    /// The two acts, in the order the OS draws them.
    public static func actions() -> [UNNotificationAction] {
        PatinaNotificationAction.allCases.map { action in
            UNNotificationAction(
                identifier: action.rawValue,
                title: action.title,
                // Foreground, both: each one carries her into the app. A
                // background action would answer for her without showing her
                // anything, which is the whole refusal.
                options: [.foreground]
            )
        }
    }

    /// One category per rail, each carrying the same two acts.
    public static func categories() -> [UNNotificationCategory] {
        let acts = actions()
        return PatinaNotificationCategory.allCases.map { category in
            UNNotificationCategory(
                identifier: category.rawValue,
                actions: acts,
                intentIdentifiers: [],
                options: []
            )
        }
    }

    /// Install them. Called once at launch from `PatinaAppDelegate` — the OS
    /// keeps the set for the life of the install, and a banner that arrives
    /// before this has run simply draws without its acts.
    ///
    /// `setCategories` is injected so a test can read what would be registered
    /// without a notification centre and without touching the device's own.
    public static func register(
        setCategories: (Set<UNNotificationCategory>) -> Void = { categories in
            UNUserNotificationCenter.current().setNotificationCategories(categories)
        }
    ) {
        setCategories(Set(categories()))
    }

    // MARK: - Where an act lands

    /// The route a tapped act opens.
    ///
    /// - `Open`, and the plain banner tap, resolve through `NotificationRouter`
    ///   exactly as they did before this file existed: the entity pair, then
    ///   the portal deep link (P-06).
    /// - `Ask a question` opens the conversation about THIS document: the
    ///   thread the envelope names, else the document's own screen. The inbox
    ///   is the last resort, for a letter that names nothing.
    /// - A dismissal opens nothing.
    ///
    /// Nil means "this act does not navigate"; the caller decides whether that
    /// is a dismissal (do nothing) or an unknown entity (open the feed).
    public static func route(
        forActionIdentifier actionIdentifier: String,
        apnsUserInfo userInfo: [AnyHashable: Any],
        threadIdentifier: String? = nil
    ) -> AppRoute? {
        if actionIdentifier == UNNotificationDismissActionIdentifier { return nil }
        if PatinaNotificationAction(rawValue: actionIdentifier) == .askQuestion {
            return conversationRoute(apnsUserInfo: userInfo, threadIdentifier: threadIdentifier)
        }
        return NotificationRouter.resolve(apnsUserInfo: userInfo).route
            ?? route(forThreadIdentifier: threadIdentifier)
    }

    /// The sender's own grouping key, read as a destination.
    ///
    /// `decision-<id>` says both which rail and which row, so it is the last
    /// thing that can name the entity when the envelope that reached this
    /// device carried neither a pair nor a link — a reminder that collapsed
    /// onto an earlier letter, say. Nil for any identifier that is not ours.
    static func route(forThreadIdentifier identifier: String?) -> AppRoute? {
        guard let identifier,
              let read = PatinaNotificationCategory.entity(fromThreadIdentifier: identifier)
        else { return nil }
        return NotificationRouter.route(
            forEntityType: read.category.entityType, entityId: read.entityId
        )
    }

    /// The thread this letter belongs to; failing that, the document it is
    /// about; failing that, the inbox.
    ///
    /// Ruled mid-Wave 2: *the `PATINA_*` envelope carries `thread_id` when the
    /// entity's project has a thread; the action opens that thread, else the
    /// entity's own screen. Never the inbox as a dead end.*
    ///
    /// **`thread_id` is on the wire, and the first leg is the live one.**
    /// `apns-send/index.ts`'s `resolveProjectThreadId` walks the entity to its
    /// project (`client_decisions` / `proposals` / `invoices`) and the project
    /// to its single `comms_threads` row of kind `project`, and
    /// `buildApnsPayload` writes it as `thread_id` — omitted, never blank,
    /// where there is no single thread to open. `entity_type: "thread"` is the
    /// same fact in the envelope's own vocabulary, which a message push
    /// already carries.
    ///
    /// The document's own screen is the ruled fall-back for a project with no
    /// thread: it keeps the letter's identity, where the inbox threw it away.
    ///
    /// **This act is not one of the three doors.** `ProjectApprovalCopy.acts`
    /// is Approve / Return / Hold (`P-16`) — three OUTCOMES, and a banner may
    /// never carry an outcome (see the file header). "Ask a question" writes
    /// nothing: it is the way to reach the studio about the document, which is
    /// why it keeps a word none of the doors uses and why it lands on a
    /// conversation rather than on an answer.
    ///
    /// The inbox stays the last resort, for an envelope that names no entity
    /// at all: it is where she writes to the studio, and it is never a dead
    /// end.
    static func conversationRoute(
        apnsUserInfo userInfo: [AnyHashable: Any],
        threadIdentifier: String? = nil
    ) -> AppRoute {
        if let threadId = userInfo["thread_id"] as? String, !threadId.isEmpty {
            return .threadDetail(threadId: threadId)
        }
        if (userInfo["entity_type"] as? String)?.lowercased() == "thread",
           let threadId = userInfo["entity_id"] as? String, !threadId.isEmpty {
            return .threadDetail(threadId: threadId)
        }
        return NotificationRouter.resolve(apnsUserInfo: userInfo).route
            ?? route(forThreadIdentifier: threadIdentifier)
            ?? .threadList
    }

    /// Whether this response should be treated as an opening at all. A
    /// dismissal is not: the letter was cleared, not read, and marking it
    /// opened would tell the studio she has seen something she has not.
    public static func isOpening(actionIdentifier: String) -> Bool {
        actionIdentifier != UNNotificationDismissActionIdentifier
    }
}
