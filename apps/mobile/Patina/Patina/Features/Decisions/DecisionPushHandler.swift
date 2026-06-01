//
//  DecisionPushHandler.swift
//  Patina
//
//  PT-D-2-T4-2: push-notification handling for decision pushes
//  (`decision_required` / `decision_overdue` / `decision_resolved`).
//
//  The APNs *routing* contract already lives in `NotificationRouter`
//  (App/DeepLinking) and `PatinaAppDelegate`: any envelope carrying
//  `entity_type: "decision"` + `entity_id` resolves to
//  `.decisionDetail(decisionId:)` and the log row is marked opened. This
//  file adds the *type-aware* layer the deck calls for — recognising the
//  three decision push `type` strings the backend RPCs emit
//  (`notify_decision_required/overdue/resolved`) so the app can present
//  them with the right copy / urgency and so a tap on a decision push lands
//  on the decision rather than the generic feed.
//
//  Scope note: this is intentionally a self-contained stub inside the
//  Decisions territory. The `PatinaAppDelegate` (in App/) can call
//  `DecisionPushHandler.handle(apnsUserInfo:)` to opt the decision pushes
//  into in-app presentation + routing without the delegate having to know
//  the decision type taxonomy. Until that one-line wiring lands (a conductor
//  micro-PR to App/AppDelegate.swift), the existing entity-based router
//  already routes decision taps correctly — this handler is additive.
//

import Foundation

/// The decision-related push notification kinds emitted by the backend
/// (`00173`-era `notify_decision_*` RPCs). The raw values match the
/// `notification_log.type` / APNs `type` strings on the wire.
public enum DecisionPushType: String, Sendable, CaseIterable {
    /// A decision was sent and now needs the client's response.
    case required = "decision_required"
    /// A pending decision blew past its due date.
    case overdue = "decision_overdue"
    /// A decision was resolved (selection applied / designer override).
    case resolved = "decision_resolved"

    /// SF Symbol for the in-app feed / banner. Overdue reads as urgent.
    public var icon: String {
        switch self {
        case .required: return "checklist"
        case .overdue: return "exclamationmark.triangle.fill"
        case .resolved: return "checkmark.seal.fill"
        }
    }

    /// Default banner title when the payload omits an explicit `title`.
    public var defaultTitle: String {
        switch self {
        case .required: return "A decision needs you"
        case .overdue: return "A decision is overdue"
        case .resolved: return "Decision confirmed"
        }
    }

    /// Whether this type should nudge the app badge / surface prominently.
    /// `resolved` is informational; the other two are action-required.
    public var isActionRequired: Bool {
        switch self {
        case .required, .overdue: return true
        case .resolved: return false
        }
    }
}

/// A resolved decision push: the type, the target route (if the payload
/// carried a decision id), and the originating `notification_log` id.
public struct DecisionPush: Sendable {
    public let type: DecisionPushType
    public let decisionId: String?
    public let notificationLogId: String?

    /// The in-app route this push should open. Falls back to the decisions
    /// list when the envelope didn't carry a specific decision id.
    public var route: AppRoute {
        if let decisionId, !decisionId.isEmpty {
            return .decisionDetail(decisionId: decisionId)
        }
        return .decisionList
    }
}

/// Recognises and routes decision pushes. Pure / stateless — no UI, no
/// side effects beyond the explicit `route(_:)` / `markOpened(_:)` helpers
/// the caller invokes on the main actor / a Task.
public enum DecisionPushHandler {

    /// Parse an APNs `userInfo` dictionary into a `DecisionPush` if (and
    /// only if) it is one of the decision push types. Returns `nil` for any
    /// other notification so the caller can fall through to the generic
    /// `NotificationRouter` path.
    ///
    /// Accepts the decision id from either the dedicated `decision_id` key
    /// or the generic `entity_id` (when `entity_type == "decision"`), so it
    /// works with both the decision RPC envelopes and the shared envelope
    /// shape used by `NotificationRouter`.
    public static func parse(apnsUserInfo userInfo: [AnyHashable: Any]) -> DecisionPush? {
        guard
            let rawType = userInfo["type"] as? String,
            let type = DecisionPushType(rawValue: rawType)
        else {
            return nil
        }

        let entityType = (userInfo["entity_type"] as? String)?.lowercased()
        let decisionId = (userInfo["decision_id"] as? String)
            ?? (entityType == "decision" ? userInfo["entity_id"] as? String : nil)
        let logId = (userInfo["notification_log_id"] as? String)
            ?? (userInfo["notification_id"] as? String)

        return DecisionPush(type: type, decisionId: decisionId, notificationLogId: logId)
    }

    /// Convenience for the APNs delegate: if the payload is a decision push,
    /// push its route through `DeepLinkHandler` and mark the log row opened.
    /// Returns `true` when handled (so the delegate can skip the generic
    /// router), `false` otherwise. The delegate calling this is the only
    /// wiring needed in App/ — left as a stub call site per the deck.
    @MainActor
    @discardableResult
    public static func handle(apnsUserInfo userInfo: [AnyHashable: Any]) -> Bool {
        guard let push = parse(apnsUserInfo: userInfo) else { return false }

        #if DEBUG
        PatinaLog.nav.debug(
            "[DecisionPush] \(push.type.rawValue) → \(push.route.displayName) (logId=\(push.notificationLogId ?? "nil"))"
        )
        #endif

        DeepLinkHandler.shared.navigate(to: push.route)

        if let logId = push.notificationLogId {
            Task {
                do {
                    try await NotificationsAPIClient.shared.markOpened(id: logId)
                } catch {
                    #if DEBUG
                    PatinaLog.nav.error("[DecisionPush] markOpened failed for \(logId): \(error.localizedDescription)")
                    #endif
                }
            }
        }
        return true
    }
}
