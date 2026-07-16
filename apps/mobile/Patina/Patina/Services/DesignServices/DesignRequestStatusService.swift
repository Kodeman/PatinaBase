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
    /// A designer has claimed the request and taken it in hand — the
    /// introduction (the Match Ceremony) is still pending (R106 §1). Replaces
    /// the former `.reviewing`. NOTE: `dismissedStageRaw` values persisted as
    /// "reviewing" by older builds no longer match this case's raw value
    /// ("held") — an accepted meaning change: a request dismissed while
    /// "reviewing" reappears once, now labelled `.held`.
    case held
    /// The assigned designer has reached out (legacy `contacted` path, no
    /// ceremony).
    case inTouch
    /// The designer sent an introduction with offered call times; the client
    /// hasn't picked one yet (Match Ceremony delivered — R106 §6).
    case introduced
    /// The client picked a discovery slot — the first call is booked.
    case booked
    /// Accepted — an active working relationship (legacy accepted rows with no
    /// ceremony).
    case matched
    /// Declined.
    case closed
    /// Expired without a match.
    case expired

    /// Pure mapping from the server row. Precedence, highest first: a terminal
    /// status (declined/expired) always wins; then a delivered introduction
    /// (`match_ceremonies.state` sent/picked) — a picked slot ⇒ `.booked`,
    /// otherwise `.introduced`; then the legacy `(designer_id, status)`
    /// derivation. Unit-tested — see `DesignRequestStageTests`.
    ///
    /// `status` is `leads.status`
    /// (`new/viewed/contacted/accepted/declined/expired`); `designerId` is
    /// `leads.designer_id`; `introduction` is the `match_ceremonies` embed,
    /// present only when the homeowner may see it (RLS delivers it at
    /// `sent`/`picked`, never `draft`).
    public static func from(
        designerId: UUID?,
        status: String,
        introduction: IntroductionInfo?
    ) -> DesignRequestStage {
        if status == "declined" { return .closed }
        if status == "expired" { return .expired }
        if let introduction, introduction.state == "sent" || introduction.state == "picked" {
            return introduction.pickedSlotId != nil ? .booked : .introduced
        }
        switch status {
        case "accepted": return .matched          // legacy accepted rows, no ceremony
        case "contacted": return designerId == nil ? .finding : .inTouch
        default: return designerId == nil ? .finding : .held
        }
    }

    /// Terminal, non-actionable outcomes.
    public var isTerminal: Bool {
        self == .closed || self == .expired
    }

    /// A successful, active match. The ceremony stages (`.introduced`/`.booked`)
    /// are deliberately NOT "matched": they are live, always-promoted, in-motion
    /// stages, not the 14-day-windowed matched relationship.
    public var isMatched: Bool { self == .matched }

    /// Whether promotion visibility uses the 14-day window (terminal or
    /// matched) rather than always-on (non-terminal in-progress stages).
    public var isTerminalOrMatched: Bool { isTerminal || isMatched }

    /// Stages that merit a hub-row attention badge — the user has something to
    /// act on (a designer reached out, an introduction awaits her pick, or a
    /// live match with messages).
    public var needsAttention: Bool {
        self == .inTouch || self == .introduced || self == .matched
    }

    /// Badge state for `PatinaStatusBadge`.
    public var badgeState: PatinaStatusBadge.State {
        switch self {
        case .finding, .held, .inTouch: return .info
        case .introduced, .booked, .matched: return .success
        case .closed, .expired: return .warning
        }
    }

    /// Short badge label (rendered uppercase by `PatinaStatusBadge` and by the
    /// hub row's `textCase`).
    public var badgeTitle: String {
        switch self {
        case .finding: return "Finding your designer"
        case .held: return "In hand"
        case .inTouch: return "In touch"
        case .introduced: return "You're matched"
        case .booked: return "Discovery booked"
        case .matched: return "Designer matched"
        case .closed: return "Not matched"
        case .expired: return "Expired"
        }
    }

    /// One-line status copy. The arrival-arc stages (`.held`/`.introduced`/
    /// `.booked`) name the studio, with precedence studioName → designerName →
    /// "Your designer"; older stages keep their prior designer-name-only copy.
    public func subtitle(studioName: String? = nil, designerName: String? = nil) -> String {
        let studio = studioName ?? designerName ?? "Your designer"
        switch self {
        case .finding:
            return "We're matching your request with a designer."
        case .held:
            return "\(studio) has taken your request in hand — introduction on its way."
        case .inTouch:
            return "\(designerName ?? "your designer") has reached out — check your messages."
        case .introduced:
            return "\(studio) sent you an introduction and times for your first call."
        case .booked:
            return "You're set with \(studio). The call is on the calendar."
        case .matched:
            return "You're working with \(designerName ?? "your designer")."
        case .closed:
            return "This one didn't work out. Send a new request anytime."
        case .expired:
            return "This request expired. Send a new request anytime."
        }
    }

    /// Headline for the promoted home card / detail hero. `bookedSlotStartsAt`
    /// (the picked ceremony slot) fills the `.booked` headline with the call
    /// day + time; without it a generic booked headline is used.
    public func cardTitle(
        studioName: String? = nil,
        designerName: String? = nil,
        bookedSlotStartsAt: Date? = nil
    ) -> String {
        let studio = studioName ?? designerName ?? "Your designer"
        switch self {
        case .finding:
            return "Your design request is on its way"
        case .held:
            return "\(studio) has your request in hand"
        case .inTouch:
            return "Your designer reached out"
        case .introduced:
            return "You're matched — meet \(studio)"
        case .booked:
            if let bookedSlotStartsAt {
                return "Discovery · \(Self.formatBookedSlot(bookedSlotStartsAt))"
            }
            return "Discovery call booked"
        case .matched:
            return "You're matched with \(designerName ?? "your designer")"
        case .closed:
            return "Your request wasn't matched"
        case .expired:
            return "Your request expired"
        }
    }

    /// "Tue, Jul 22 at 2:00 PM"-style label for a booked discovery slot. Pixel
    /// detail (locale, relative "today/tomorrow") is owned by the match-screen
    /// lane; this is the graceful default the existing surfaces render today.
    private static func formatBookedSlot(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "EEE, MMM d 'at' h:mm a"
        return formatter.string(from: date)
    }
}

// MARK: - Introduction (Match Ceremony) DTOs

/// One offered discovery-call slot from the Match Ceremony. `nonisolated`
/// (mirroring `StudioIdentity`) so it decodes/constructs freely off the main
/// actor.
nonisolated public struct IntroductionSlot: Identifiable, Sendable, Equatable {
    public let id: UUID
    public let startsAt: Date
    public let durationMinutes: Int

    public init(id: UUID, startsAt: Date, durationMinutes: Int) {
        self.id = id
        self.startsAt = startsAt
        self.durationMinutes = durationMinutes
    }
}

/// The homeowner-visible view of a `match_ceremonies` row: the designer's
/// introduction and the offered/picked call times. Present only when RLS
/// delivers the embed (`state` sent/picked). `nonisolated` for the same reason
/// as `IntroductionSlot`/`StudioIdentity`.
nonisolated public struct IntroductionInfo: Sendable, Equatable {
    /// `match_ceremonies.state`: "draft" | "sent" | "picked". Decoded as-is and
    /// interpreted defensively (only sent/picked drive the stage).
    public let state: String
    public let ceremonyId: UUID
    public let introText: String?
    public let credentialLine: String?
    public let portfolioUrl: String?
    public let slots: [IntroductionSlot]
    public let timezone: String?
    public let offeredAt: Date?
    public let pickedSlotId: UUID?
    public let pickedSlotStartsAt: Date?
    public let threadId: UUID?
    public let createdAt: Date?

    public init(
        ceremonyId: UUID,
        state: String,
        introText: String?,
        credentialLine: String?,
        portfolioUrl: String?,
        slots: [IntroductionSlot],
        timezone: String?,
        offeredAt: Date?,
        pickedSlotId: UUID?,
        pickedSlotStartsAt: Date?,
        threadId: UUID?,
        createdAt: Date?
    ) {
        self.ceremonyId = ceremonyId
        self.state = state
        self.introText = introText
        self.credentialLine = credentialLine
        self.portfolioUrl = portfolioUrl
        self.slots = slots
        self.timezone = timezone
        self.offeredAt = offeredAt
        self.pickedSlotId = pickedSlotId
        self.pickedSlotStartsAt = pickedSlotStartsAt
        self.threadId = threadId
        self.createdAt = createdAt
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
    /// The Match Ceremony embed, when the homeowner may see it (RLS delivers it
    /// at `sent`/`picked`). Drives the `.introduced`/`.booked` stages.
    public let introduction: IntroductionInfo?
    /// Studio brand for the claiming designer, resolved (actor-cached) by the
    /// reconcile pass and last-known-persisted on the receipt. Nil until/unless
    /// the resolver returns one — supplementary branding, never load-bearing.
    public var studioName: String?

    public var id: UUID { leadId }

    public var stage: DesignRequestStage {
        DesignRequestStage.from(designerId: designerId, status: statusRaw, introduction: introduction)
    }

    public init(
        leadId: UUID,
        statusRaw: String,
        designerId: UUID?,
        designerName: String?,
        projectTypeRaw: String?,
        budgetRange: String?,
        timeline: String?,
        requestDescription: String?,
        scanCount: Int,
        createdAt: Date,
        updatedAt: Date?,
        dismissedAt: Date?,
        dismissedStageRaw: String?,
        introduction: IntroductionInfo? = nil,
        studioName: String? = nil
    ) {
        self.leadId = leadId
        self.statusRaw = statusRaw
        self.designerId = designerId
        self.designerName = designerName
        self.projectTypeRaw = projectTypeRaw
        self.budgetRange = budgetRange
        self.timeline = timeline
        self.requestDescription = requestDescription
        self.scanCount = scanCount
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.dismissedAt = dismissedAt
        self.dismissedStageRaw = dismissedStageRaw
        self.introduction = introduction
        self.studioName = studioName
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
            requests = await reconcile(rows)
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
                dismissedStageRaw: row.dismissedStageRaw,
                introduction: Self.reconstructedIntroduction(from: row),
                studioName: row.studioName
            )
        }
    }

    /// Rebuild a minimal `IntroductionInfo` from a receipt's additive ceremony
    /// columns so the offline / cold-launch paint still derives `.introduced` /
    /// `.booked`. The full ceremony (intro text, slots, credential) isn't
    /// persisted — only what the stage derivation and the booked headline need.
    /// RLS keeps a delivered ceremony visible, so the server fetch never
    /// demotes below this reconstruction.
    private static func reconstructedIntroduction(from row: SubmittedDesignRequest) -> IntroductionInfo? {
        let hasBooked = row.bookedSlotStartsAt != nil
        guard row.introducedAt != nil || hasBooked else { return nil }
        return IntroductionInfo(
            ceremonyId: row.leadId,                 // synthetic stand-in — never surfaced
            state: hasBooked ? "picked" : "sent",
            introText: nil,
            credentialLine: nil,
            portfolioUrl: nil,
            slots: [],
            timezone: nil,
            offeredAt: row.introducedAt,
            pickedSlotId: hasBooked ? row.leadId : nil,   // presence marker for .booked
            pickedSlotStartsAt: row.bookedSlotStartsAt,
            threadId: row.introThreadId,
            createdAt: row.introducedAt
        )
    }

    // MARK: - Reconciliation

    /// Merge freshly-fetched server rows with local receipts, emitting the
    /// enriched `DesignRequestStatus` list (newest first). A second, async pass
    /// resolves the claiming designers' studio brands and stamps them onto both
    /// the statuses and the receipts.
    private func reconcile(_ rows: [LeadStatusRow]) async -> [DesignRequestStatus] {
        let context = PersistenceController.shared.container.mainContext
        var statuses = rows.compactMap { enriched(from: $0, in: context) }

        // Studio-name enrichment: resolve the distinct claiming designers'
        // studio identities (actor-cached, failure-tolerant → nil) and stamp
        // the name onto the statuses + receipts. Supplementary branding, so a
        // failure just leaves `studioName` at its last-known/nil value.
        let designerIds = Set(statuses.compactMap(\.designerId))
        if !designerIds.isEmpty {
            var studioNames: [UUID: String] = [:]
            for designerId in designerIds {
                if let name = await StudioIdentityService.shared.identity(forDesigner: designerId)?.name {
                    studioNames[designerId] = name
                }
            }
            if !studioNames.isEmpty {
                statuses = statuses.map { status in
                    guard let designerId = status.designerId,
                          let name = studioNames[designerId] else { return status }
                    var updated = status
                    updated.studioName = name
                    return updated
                }
                for status in statuses {
                    guard let name = status.studioName else { continue }
                    let leadId = status.leadId
                    let descriptor = FetchDescriptor<SubmittedDesignRequest>(
                        predicate: #Predicate { $0.leadId == leadId }
                    )
                    if let receipt = try? context.fetch(descriptor).first {
                        receipt.studioName = name
                    }
                }
            }
        }

        try? context.save()
        return statuses.sorted { $0.createdAt > $1.createdAt }
    }

    /// Reconcile one server row against its local receipt (update the
    /// status/designer/refresh stamp, inserting the receipt if this device
    /// doesn't know it — reinstall / second device) and return the enriched
    /// status carrying the local dismissal state.
    private func enriched(from row: LeadStatusRow, in context: ModelContext) -> DesignRequestStatus? {
        guard var status = Self.status(from: row) else { return nil }
        let leadId = status.leadId
        let designerId = status.designerId
        let designerName = status.designerName
        let scanCount = status.scanCount
        let introduction = status.introduction

        let descriptor = FetchDescriptor<SubmittedDesignRequest>(
            predicate: #Predicate { $0.leadId == leadId }
        )
        let receipt = (try? context.fetch(descriptor).first) ?? {
            let inserted = SubmittedDesignRequest(
                leadId: leadId,
                homeownerId: AuthService.shared.currentUser?.id,
                submittedAt: status.createdAt,
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

        // Arrival-arc ceremony fields — persisted additively so the offline /
        // cold-launch paint can reconstruct the introduced/booked stage without
        // the embed (RLS delivers the embed only at sent/picked, so once set
        // these never need clearing).
        if let introduction {
            receipt.introducedAt = introduction.offeredAt ?? introduction.createdAt
            receipt.bookedSlotStartsAt = introduction.pickedSlotStartsAt
            receipt.introThreadId = introduction.threadId
        }

        // Overlay the local-only fields the pure decode can't know: the
        // dismissal record and the last-known studio name (the async reconcile
        // pass refreshes the latter).
        status.dismissedAt = receipt.dismissedAt
        status.dismissedStageRaw = receipt.dismissedStageRaw
        status.studioName = receipt.studioName
        return status
    }

    // MARK: - Decode (pure, no SwiftData)

    /// Pure decode seam: parse a `leads` select payload into the enriched
    /// public statuses — carrying the `match_ceremonies` embed and the derived
    /// stage, but WITHOUT the local receipt/dismissal/studio state that
    /// `enriched(from:)` layers on. Unit tests use this to pin the wire decode
    /// + stage derivation end-to-end.
    static func decodeStatuses(_ data: Data) throws -> [DesignRequestStatus] {
        try JSONDecoder().decode([LeadStatusRow].self, from: data).compactMap { status(from: $0) }
    }

    /// Wire row → public status, WITHOUT touching SwiftData. The dismissal and
    /// studio fields stay nil — those come from the local receipt and the async
    /// studio-identity pass respectively.
    private static func status(from row: LeadStatusRow) -> DesignRequestStatus? {
        guard let leadId = UUID(uuidString: row.id) else { return nil }
        let designerId = row.designer_id.flatMap { UUID(uuidString: $0) }
        return DesignRequestStatus(
            leadId: leadId,
            statusRaw: row.status,
            designerId: designerId,
            designerName: row.designer?.full_name ?? row.designer?.display_name,
            projectTypeRaw: row.project_type,
            budgetRange: row.budget_range,
            timeline: row.timeline,
            requestDescription: row.project_description,
            scanCount: row.lead_room_scans?.count ?? 0,
            createdAt: parseDate(row.created_at) ?? Date(),
            updatedAt: row.updated_at.flatMap(parseDate),
            dismissedAt: nil,
            dismissedStageRaw: nil,
            introduction: introduction(from: row.match_ceremonies)
        )
    }

    /// Map the `match_ceremonies` embed → the public `IntroductionInfo`. Returns
    /// nil when the embed is absent (RLS delivers it only at `sent`/`picked`).
    /// Slot timestamps decode with the same fractional-seconds-tolerant parse
    /// as every other date on the row.
    private static func introduction(from row: MatchCeremonyRow?) -> IntroductionInfo? {
        guard let row, let ceremonyId = UUID(uuidString: row.id) else { return nil }
        let slots = (row.offered_slots ?? []).compactMap { slot -> IntroductionSlot? in
            guard let slotId = UUID(uuidString: slot.id),
                  let startsAt = parseDate(slot.starts_at) else { return nil }
            return IntroductionSlot(id: slotId, startsAt: startsAt, durationMinutes: slot.duration_minutes)
        }
        return IntroductionInfo(
            ceremonyId: ceremonyId,
            state: row.state,
            introText: row.intro_text,
            credentialLine: row.credential_line,
            portfolioUrl: row.portfolio_url,
            slots: slots,
            timezone: row.timezone,
            offeredAt: row.offered_at.flatMap(parseDate),
            pickedSlotId: row.picked_slot_id.flatMap { UUID(uuidString: $0) },
            pickedSlotStartsAt: row.picked_slot_starts_at.flatMap(parseDate),
            threadId: row.thread_id.flatMap { UUID(uuidString: $0) },
            createdAt: row.created_at.flatMap(parseDate)
        )
    }

    // MARK: - Network

    private static let selectColumns =
        "id,status,designer_id,project_type,budget_range,timeline,project_description,"
        + "created_at,updated_at,contacted_at,accepted_at,declined_at,client_request_id,"
        + "designer:profiles!designer_id(full_name,display_name),lead_room_scans(scan_id),"
        // Match Ceremony embed — to-one (unique FK on lead_id). RLS delivers it
        // only when the homeowner may see it (state sent/picked); a draft
        // ceremony arrives as NULL.
        + "match_ceremonies(id,state,intro_text,credential_line,portfolio_url,offered_slots,"
        + "timezone,offered_at,picked_slot_id,picked_slot_starts_at,thread_id,created_at)"

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
    /// To-one Match Ceremony embed (unique FK on `lead_id`); null unless RLS
    /// delivers it (state sent/picked).
    let match_ceremonies: MatchCeremonyRow?
}

private struct LeadDesignerRow: Decodable {
    let full_name: String?
    let display_name: String?
}

private struct LeadScanRef: Decodable {
    let scan_id: String?
}

private struct MatchCeremonyRow: Decodable {
    let id: String
    let state: String
    let intro_text: String?
    let credential_line: String?
    let portfolio_url: String?
    let offered_slots: [OfferedSlotRow]?
    let timezone: String?
    let offered_at: String?
    let picked_slot_id: String?
    let picked_slot_starts_at: String?
    let thread_id: String?
    let created_at: String?
}

private struct OfferedSlotRow: Decodable {
    let id: String
    let starts_at: String
    let duration_minutes: Int
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
