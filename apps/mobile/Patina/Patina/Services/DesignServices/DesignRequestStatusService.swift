//
//  DesignRequestStatusService.swift
//  Patina
//
//  Reads the status of the homeowner's submitted design requests and keeps the
//  local `SubmittedDesignRequest` receipts reconciled. Modelled on
//  `BadgeCountService`: `@MainActor @Observable` singleton, a polling-floor
//  refresh (appear + foreground + push) with a debounced `refreshSoon()`, and
//  guests resolving to a cleared state without a network round-trip.
//
//  Read path: a plain PostgREST select on `public.leads` (no RPC — homeowner
//  SELECT already passes RLS, verified in migration 00014). We disambiguate the
//  two `profiles` FKs with the `designer:profiles!designer_id(...)` embed hint
//  (the `homeowner_id` FK is the other), mirroring `SupabaseLeadsService`
//  (apps/mobile/Capture) and `use-leads.ts` (packages/supabase). Only
//  app-originated rows (`client_request_id IS NOT NULL`) are considered — the
//  same discriminator the submit RPC stamps.
//
//  Stage derives from `(designer_id, status)` JOINTLY, never status alone:
//  claiming a request sets `designer_id` without changing `status` (00286), so
//  status-only mapping would show every claimed request as "finding" forever.
//

import Foundation
import Observation
import SwiftData
import Supabase

// MARK: - Stage

/// The homeowner-facing lifecycle stage of a design request, derived from the
/// server `(designer_id, status)` pair. Raw values are stable — they are
/// persisted in `SubmittedDesignRequest.dismissedStageRaw` to drive the
/// "reappears when the stage advances" card behaviour.
public enum DesignRequestStage: String, Sendable, CaseIterable {
    /// Pooled, no designer yet.
    case finding
    /// A designer is assigned and looking at the request.
    case reviewing
    /// The assigned designer has reached out.
    case inTouch
    /// Accepted — an active working relationship.
    case matched
    /// Declined.
    case closed
    /// Expired without a match.
    case expired

    /// Pure mapping from the server row. `status` is `leads.status`
    /// (`new/viewed/contacted/accepted/declined/expired`); `designerId` is
    /// `leads.designer_id`. Unit-tested — see `DesignRequestStageTests`.
    public static func from(designerId: UUID?, status: String) -> DesignRequestStage {
        switch status {
        case "accepted": return .matched
        case "declined": return .closed
        case "expired": return .expired
        case "contacted":
            return designerId == nil ? .finding : .inTouch
        default: // new / viewed / anything unexpected
            return designerId == nil ? .finding : .reviewing
        }
    }

    /// Terminal, non-actionable outcomes.
    public var isTerminal: Bool {
        self == .closed || self == .expired
    }

    /// A successful, active match.
    public var isMatched: Bool { self == .matched }

    /// Whether promotion visibility uses the 14-day window (terminal or
    /// matched) rather than always-on (non-terminal in-progress stages).
    public var isTerminalOrMatched: Bool { isTerminal || isMatched }

    /// Stages that merit a hub-row attention badge — the user has something to
    /// act on (a designer reached out, or a live match with messages).
    public var needsAttention: Bool {
        self == .inTouch || self == .matched
    }

    /// Badge state for `PatinaStatusBadge`.
    public var badgeState: PatinaStatusBadge.State {
        switch self {
        case .finding, .reviewing, .inTouch: return .info
        case .matched: return .success
        case .closed, .expired: return .warning
        }
    }

    /// Short badge label (rendered uppercase by `PatinaStatusBadge` and by the
    /// hub row's `textCase`).
    public var badgeTitle: String {
        switch self {
        case .finding: return "Finding your designer"
        case .reviewing: return "In review"
        case .inTouch: return "In touch"
        case .matched: return "Designer matched"
        case .closed: return "Not matched"
        case .expired: return "Expired"
        }
    }

    /// One-line status copy. `designerName` falls back to "your designer".
    public func subtitle(designerName: String?) -> String {
        let name = designerName ?? "your designer"
        switch self {
        case .finding:
            return "We're matching your request with a designer."
        case .reviewing:
            return "A designer is reviewing your request."
        case .inTouch:
            return "\(name) has reached out — check your messages."
        case .matched:
            return "You're working with \(name)."
        case .closed:
            return "This one didn't work out. Send a new request anytime."
        case .expired:
            return "This request expired. Send a new request anytime."
        }
    }

    /// Headline for the promoted home card / detail hero.
    public func cardTitle(designerName: String?) -> String {
        switch self {
        case .finding:
            return "Your design request is on its way"
        case .reviewing:
            return "A designer is reviewing your request"
        case .inTouch:
            return "Your designer reached out"
        case .matched:
            return "You're matched with \(designerName ?? "your designer")"
        case .closed:
            return "Your request wasn't matched"
        case .expired:
            return "Your request expired"
        }
    }
}

// MARK: - Status DTO

/// A single submitted request, enriched with the live server state and the
/// local dismissal record. Value type so visibility rules stay pure.
public struct DesignRequestStatus: Identifiable, Sendable, Equatable {
    public let leadId: UUID
    public let statusRaw: String
    public let designerId: UUID?
    public let designerName: String?
    public let projectTypeRaw: String?
    public let budgetRange: String?
    public let timeline: String?
    public let requestDescription: String?
    public let scanCount: Int
    public let createdAt: Date
    public let updatedAt: Date?
    public var dismissedAt: Date?
    public var dismissedStageRaw: String?

    public var id: UUID { leadId }

    public var stage: DesignRequestStage {
        DesignRequestStage.from(designerId: designerId, status: statusRaw)
    }

    public var projectType: DesignServiceType? {
        projectTypeRaw.flatMap(DesignServiceType.init(rawValue:))
    }

    public var projectTypeDisplay: String {
        projectType?.displayName ?? "Design request"
    }

    /// The moment the current stage was reached — the anchor for the 14-day
    /// terminal/matched promotion window. Falls back to `createdAt`.
    public var stageAnchor: Date { updatedAt ?? createdAt }

    /// Whether the promoted home card should surface this request now.
    ///
    /// Unified rule: a request dismissed AT its current stage is hidden; a
    /// non-terminal request is otherwise always shown (so it reappears once
    /// the stage advances past a prior dismissal); a terminal/matched request
    /// is shown only within 14 days of reaching that stage. Terminal/matched
    /// stages never advance, so a dismissal there is permanent.
    public func isVisibleForPromotion(now: Date = Date(), window: TimeInterval = 14 * 86_400) -> Bool {
        if let dismissedStageRaw, dismissedStageRaw == stage.rawValue {
            return false
        }
        if stage.isTerminalOrMatched {
            return now.timeIntervalSince(stageAnchor) <= window
        }
        return true
    }

    /// "sent 3d ago"-style relative phrase for the card subtitle.
    public var relativeSubmitted: String {
        let interval = Date().timeIntervalSince(createdAt)
        if interval < 60 { return "just now" }
        if interval < 3_600 { return "\(max(1, Int(interval / 60)))m ago" }
        if interval < 86_400 { return "\(Int(interval / 3_600))h ago" }
        return "\(Int(interval / 86_400))d ago"
    }
}

// MARK: - Service

/// App-wide status of the homeowner's submitted design requests. `@Observable`
/// so the home card and the "Your Designer" hub row re-render when a refresh
/// lands.
@MainActor
@Observable
public final class DesignRequestStatusService {

    public static let shared = DesignRequestStatusService()

    /// All app-originated requests, newest first.
    public private(set) var requests: [DesignRequestStatus] = []

    /// True once a refresh has completed for an authenticated session. Guests
    /// never load — the surfaces stay hidden.
    public private(set) var hasLoaded: Bool = false

    @ObservationIgnored private var pendingRefresh: Task<Void, Never>?

    private init() {}

    // MARK: Derived surfaces

    /// The single request the home card should promote, if any: the newest
    /// one that passes `isVisibleForPromotion`.
    public var promotedRequest: DesignRequestStatus? {
        requests
            .filter { $0.isVisibleForPromotion() }
            .max(by: { $0.createdAt < $1.createdAt })
    }

    /// Count of requests needing user attention — drives the hub-row badge.
    public var attentionCount: Int {
        requests.filter { $0.stage.needsAttention }.count
    }

    // MARK: Refresh

    /// Fetch the homeowner's requests and reconcile local receipts. Guests
    /// resolve to a cleared state without a network round-trip. A failed fetch
    /// keeps the previous list (a stale floor beats a flickering empty state);
    /// on a cold, never-loaded launch it falls back to the local receipts so
    /// the card can paint offline.
    public func refresh() async {
        guard AuthService.shared.isAuthenticated else {
            requests = []
            hasLoaded = false
            return
        }

        if requests.isEmpty {
            // Instant paint on cold launch; the server fetch enriches below.
            hydrateFromLocal()
        }

        do {
            let rows = try await fetchLeadRows()
            requests = reconcile(rows)
            hasLoaded = true
        } catch {
            if !hasLoaded { hydrateFromLocal() }
        }
    }

    /// Debounced refresh for bursty triggers (a push can deliver a banner and
    /// a tap back-to-back). Coalesces calls within the window.
    public func refreshSoon(after delay: Duration = .seconds(1)) {
        pendingRefresh?.cancel()
        pendingRefresh = Task { [weak self] in
            try? await Task.sleep(for: delay)
            guard !Task.isCancelled else { return }
            await self?.refresh()
        }
    }

    // MARK: Dismissal

    /// Record a dismissal of the promoted card for `request` at its current
    /// stage. The card reappears once the stage advances; a terminal/matched
    /// dismissal is permanent.
    public func dismiss(_ request: DesignRequestStatus) {
        let stageRaw = request.stage.rawValue
        let leadId = request.leadId
        let context = PersistenceController.shared.container.mainContext
        let descriptor = FetchDescriptor<SubmittedDesignRequest>(
            predicate: #Predicate { $0.leadId == leadId }
        )
        if let row = try? context.fetch(descriptor).first {
            row.dismissedAt = Date()
            row.dismissedStageRaw = stageRaw
            try? context.save()
        }
        // Reflect the dismissal in-memory so `promotedRequest` recomputes
        // without waiting for the next server round-trip.
        requests = requests.map { existing in
            guard existing.leadId == leadId else { return existing }
            var updated = existing
            updated.dismissedAt = Date()
            updated.dismissedStageRaw = stageRaw
            return updated
        }
    }

    // MARK: - Local hydration

    /// Build `requests` from the local `SubmittedDesignRequest` receipts (no
    /// network). Used for instant cold-launch paint and the offline fallback.
    private func hydrateFromLocal() {
        let context = PersistenceController.shared.container.mainContext
        let descriptor = FetchDescriptor<SubmittedDesignRequest>(
            sortBy: [SortDescriptor(\.submittedAt, order: .reverse)]
        )
        guard let rows = try? context.fetch(descriptor) else { return }
        requests = rows.map { row in
            DesignRequestStatus(
                leadId: row.leadId,
                statusRaw: row.lastKnownStatusRaw,
                designerId: row.designerId,
                designerName: row.designerName,
                projectTypeRaw: row.projectTypeRaw,
                budgetRange: nil,
                timeline: nil,
                requestDescription: nil,
                scanCount: row.scanCount,
                createdAt: row.submittedAt,
                updatedAt: row.lastRefreshedAt,
                dismissedAt: row.dismissedAt,
                dismissedStageRaw: row.dismissedStageRaw
            )
        }
    }

    // MARK: - Reconciliation

    /// Merge freshly-fetched server rows with local receipts, emitting the
    /// enriched `DesignRequestStatus` list (newest first).
    private func reconcile(_ rows: [LeadStatusRow]) -> [DesignRequestStatus] {
        let context = PersistenceController.shared.container.mainContext
        let result = rows.compactMap { enriched(from: $0, in: context) }
        try? context.save()
        return result.sorted { $0.createdAt > $1.createdAt }
    }

    /// Reconcile one server row against its local receipt (update the
    /// status/designer/refresh stamp, inserting the receipt if this device
    /// doesn't know it — reinstall / second device) and return the enriched
    /// status carrying the local dismissal state.
    private func enriched(from row: LeadStatusRow, in context: ModelContext) -> DesignRequestStatus? {
        guard let leadId = UUID(uuidString: row.id) else { return nil }
        let designerId = row.designer_id.flatMap { UUID(uuidString: $0) }
        let designerName = row.designer?.full_name ?? row.designer?.display_name
        let scanCount = row.lead_room_scans?.count ?? 0
        let createdAt = Self.parseDate(row.created_at) ?? Date()

        let descriptor = FetchDescriptor<SubmittedDesignRequest>(
            predicate: #Predicate { $0.leadId == leadId }
        )
        let receipt = (try? context.fetch(descriptor).first) ?? {
            let inserted = SubmittedDesignRequest(
                leadId: leadId,
                homeownerId: AuthService.shared.currentUser?.id,
                submittedAt: createdAt,
                projectTypeRaw: row.project_type,
                scanCount: scanCount,
                pooledAtSubmit: designerId == nil,
                lastKnownStatusRaw: row.status,
                designerId: designerId,
                designerName: designerName
            )
            context.insert(inserted)
            return inserted
        }()
        receipt.lastKnownStatusRaw = row.status
        receipt.designerId = designerId
        receipt.designerName = designerName
        receipt.scanCount = scanCount
        if receipt.projectTypeRaw == nil { receipt.projectTypeRaw = row.project_type }
        receipt.lastRefreshedAt = Date()

        return DesignRequestStatus(
            leadId: leadId,
            statusRaw: row.status,
            designerId: designerId,
            designerName: designerName,
            projectTypeRaw: row.project_type,
            budgetRange: row.budget_range,
            timeline: row.timeline,
            requestDescription: row.project_description,
            scanCount: scanCount,
            createdAt: createdAt,
            updatedAt: row.updated_at.flatMap(Self.parseDate),
            dismissedAt: receipt.dismissedAt,
            dismissedStageRaw: receipt.dismissedStageRaw
        )
    }

    // MARK: - Network

    private static let selectColumns =
        "id,status,designer_id,project_type,budget_range,timeline,project_description,"
        + "created_at,updated_at,contacted_at,accepted_at,declined_at,client_request_id,"
        + "designer:profiles!designer_id(full_name,display_name),lead_room_scans(scan_id)"

    private func fetchLeadRows() async throws -> [LeadStatusRow] {
        let url = APIConfiguration.apiURL
            .appendingPathComponent("/rest/v1/leads")
            .appending(queryItems: [
                URLQueryItem(name: "select", value: Self.selectColumns),
                URLQueryItem(name: "client_request_id", value: "not.is.null"),
                URLQueryItem(name: "order", value: "created_at.desc")
            ])
        var request = URLRequest(url: url)
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue(APIConfiguration.anonKey, forHTTPHeaderField: "apikey")
        request.timeoutInterval = APIConfiguration.requestTimeout
        if let token = try? await SupabaseClientManager.shared.client.auth.session.accessToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        let (data, response) = try await URLSession.shared.data(for: request)
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            throw RoomsAPIError.http(
                status: http.statusCode,
                body: String(data: data, encoding: .utf8) ?? ""
            )
        }
        return try JSONDecoder().decode([LeadStatusRow].self, from: data)
    }

    /// Tolerant ISO-8601 parse (fractional seconds first, then plain) —
    /// mirrors `NotificationsAPIClient`.
    private static func parseDate(_ string: String) -> Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fractional.date(from: string) ?? ISO8601DateFormatter().date(from: string)
    }
}

// MARK: - Wire rows (literal PostgREST column names)
// swiftlint:disable identifier_name

private struct LeadStatusRow: Decodable {
    let id: String
    let status: String
    let designer_id: String?
    let project_type: String?
    let budget_range: String?
    let timeline: String?
    let project_description: String?
    let created_at: String
    let updated_at: String?
    let contacted_at: String?
    let accepted_at: String?
    let declined_at: String?
    let client_request_id: String?
    let designer: LeadDesignerRow?
    let lead_room_scans: [LeadScanRef]?
}

private struct LeadDesignerRow: Decodable {
    let full_name: String?
    let display_name: String?
}

private struct LeadScanRef: Decodable {
    let scan_id: String?
}

// swiftlint:enable identifier_name

// URLComponents helper — append query items to a URL (file-local mirror of the
// `RoomsAPIClient` helper; the other is `private` to its file).
private extension URL {
    func appending(queryItems: [URLQueryItem]) -> URL {
        guard var comps = URLComponents(url: self, resolvingAgainstBaseURL: false) else { return self }
        comps.queryItems = (comps.queryItems ?? []) + queryItems
        return comps.url ?? self
    }
}
