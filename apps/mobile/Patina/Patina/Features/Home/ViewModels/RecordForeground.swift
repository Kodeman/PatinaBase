//
//  RecordForeground.swift
//  Patina
//
//  Who asks for a record rebuild, and how often. `RecordRefresh` owns the
//  ORDER of one; this owns the ask.
//
//  The only foreground trigger the app had lived on `DailyRoomView`
//  (`.onChange(of: scenePhase)`), so it fired only when Today was mounted:
//  coming back to the app from Studio, Spaces or Pieces rebuilt nothing, and
//  since the widget's timeline reload rides `RecordSnapshotStore.save`, the
//  widget then leaned on its own staleness line instead of the rows that had
//  actually moved (`waves/w6/integration.md` §6.2). The trigger belongs at the
//  app root, which is the one place that sees every foreground.
//
//  Both callers come through `run`, so there is one spelling of what a rebuild
//  is. Asks that overlap — the root's and Today's, when the person foregrounds
//  ONTO Today — coalesce onto the first, so one foreground costs one rebuild
//  rather than two. It is a cost fix, not a safety property: a second rebuild
//  seconds later would compute its six-hour suppression from the snapshot's
//  `window.end` and reuse the OLD anchor, so the `isNew` ticks survive either
//  way (`HouseRecord.build`). The tick hazard the root really introduced is the
//  visit stamp, and `stampVisit` is what answers it.
//
//  The root's pass paints nothing, so it does not stamp the visit. Whoever puts
//  the record on screen does — including a joiner that took a record built by a
//  pass which did not.
//

import Foundation
import SwiftData

@MainActor
enum RecordForeground {

    /// The record that was built, and the saved pieces it was built over —
    /// Today draws its own count off the same rows.
    struct Outcome {
        let record: HouseRecord
        let saved: [TableItemModel]
        /// Whether the pass that built this record also moved the visit stamp.
        /// A joiner that paints a record built by a pass which did not is the
        /// one that owes the stamp.
        let stampedVisit: Bool
    }

    /// The rebuild currently running, and its result. Both are cleared by the
    /// task itself, on the main actor, before any awaiter resumes.
    private static var inFlight: Task<Void, Never>?
    private static var lastOutcome: Outcome?

    // MARK: - The asks

    /// The app root's foreground pass: the two services the record reads,
    /// then the rebuild.
    ///
    /// Nothing is painted here — the root has no record on screen. Today
    /// paints from its own call, or from the snapshot this pass just saved.
    static func onForeground() async {
        guard AuthService.shared.isAuthenticated else { return }
        let context = PersistenceController.shared.container.mainContext
        // The builder is pure and reads whatever these two are holding, so the
        // order is the same one `DailyRoomView` runs (`DailyRoomViewModel
        // .refreshRecord`'s doc comment). Foregrounding ONTO Today asks both
        // services twice — from here and from Today's own `scenePhase` hook —
        // so each of them joins the ask already in flight instead of doubling
        // six PostgREST reads on the app's hottest path.
        await BadgeCountService.shared.refresh()
        await DesignRequestStatusService.shared.refresh()
        let story = try? await todaysStoryRow()
        // `stampVisit: false`: nothing was shown here.
        await run(context: context, story: story, stampVisit: false)
    }

    /// One rebuild for this foreground, whoever asked first.
    ///
    /// - Parameter story: the editorial row the record's MOVED story is built
    ///   from. Today hands over the row it already fetched for the card;
    ///   the root fetches one, so a rebuild from Studio does not silently drop
    ///   the story row the previous record carried.
    @discardableResult
    static func run(
        context: ModelContext?,
        story: RemoteEditorialStory?,
        stampVisit: Bool = true,
        paint: @escaping @MainActor (HouseRecord) -> Void = { _ in }
    ) async -> Outcome? {
        let (outcome, ranTheRebuild) = await coalesce {
            await rebuild(context: context, story: story, stampVisit: stampVisit, paint: paint)
        }
        // A caller that joined a rebuild already in flight missed its paints,
        // so it takes the built record here.
        if let outcome, !ranTheRebuild { paint(outcome.record) }
        // Today joining the root's pass is the case this covers: the record
        // reached the screen, but the pass that built it did not claim a visit.
        if stampVisit, let outcome, !outcome.stampedVisit {
            LastSeenStore.shared.markSeen(now: Date())
        }
        return outcome
    }

    // MARK: - The mechanism

    /// Run `work`, unless a run is already in flight — in which case wait for
    /// that one and take its answer. The flag is whether THIS call is the one
    /// whose `work` ran.
    static func coalesce(
        _ work: @escaping @MainActor () async -> Outcome?
    ) async -> (outcome: Outcome?, ranTheWork: Bool) {
        if let existing = inFlight {
            await existing.value
            return (lastOutcome, false)
        }
        lastOutcome = nil
        let task = Task { @MainActor in
            lastOutcome = await work()
            inFlight = nil
        }
        inFlight = task
        await task.value
        return (lastOutcome, true)
    }

    private static func rebuild(
        context: ModelContext?,
        story: RemoteEditorialStory?,
        stampVisit: Bool,
        paint: @escaping @MainActor (HouseRecord) -> Void
    ) async -> Outcome? {
        guard AuthService.shared.isAuthenticated else { return nil }
        // The record's `orderMoved` rows read what the orders service holds,
        // the same way the rest of the builder reads what `BadgeCountService`
        // already fetched — one holder, so the card and Studio → Ordered can
        // never disagree about what moved.
        await OrdersService.shared.refresh()
        let saved = savedItems(in: context)
        let products = await savedPieceProducts(for: saved)

        let outcome = RecordRefresh.run(
            sessionUserId: AuthService.shared.currentUserId,
            stampVisit: stampVisit,
            build: { previous, lastSeenAt in
                HouseRecordBuilder.build(
                    from: BadgeCountService.shared,
                    saved: saved,
                    products: products,
                    story: story,
                    liveLead: DesignRequestStatusService.shared.liveLead,
                    lastSeen: lastSeenAt,
                    orders: OrdersService.shared.movedOrders,
                    now: Date(),
                    previous: previous
                )
            },
            paint: paint
        )
        return Outcome(
            record: outcome.record,
            saved: saved,
            stampedVisit: outcome.steps.contains(.stamped)
        )
    }

    // MARK: - The inputs

    /// Today's story row — SP-18's pick, in one place, so the card and the
    /// record's MOVED row can never name two different stories.
    ///
    /// A foreground onto Today asks twice — this pass, and the card's own
    /// `refreshTodaysStory()` — so a concurrent ask joins the fetch in flight
    /// rather than making the same read again. The pick is deterministic over
    /// the candidates, so the joiner's answer is the same answer.
    static func todaysStoryRow() async throws -> RemoteEditorialStory? {
        if let existing = inFlightStory {
            return try await existing.value
        }
        let task = Task { () throws -> RemoteEditorialStory? in
            let candidates = try await EditorialStoriesAPIClient.shared.fetchCandidates()
            let pickedId = StoryReadStore().nextStoryId(from: candidates.map(\.id))
            return candidates.first { $0.id == pickedId }
        }
        inFlightStory = task
        defer { inFlightStory = nil }
        return try await task.value
    }

    /// The story read currently in flight, if any.
    private static var inFlightStory: Task<RemoteEditorialStory?, Error>?

    static func savedItems(in context: ModelContext?) -> [TableItemModel] {
        guard let context else { return [] }
        let descriptor = FetchDescriptor<TableItemModel>(
            sortBy: [SortDescriptor(\.savedAt, order: .reverse)]
        )
        return (try? context.fetch(descriptor)) ?? []
    }

    /// The saved pieces' catalogue rows, **withdrawn ones included** — the
    /// only read that can feed the record's "no longer available" row, because
    /// `get_recommendations` filters a withdrawn product out by construction
    /// (r1-notes §1). A failure here costs the two discovering rows and
    /// nothing else: they draw nothing rather than a guess (C5).
    static func savedPieceProducts(for saved: [TableItemModel]) async -> [Product] {
        let ids = Array(Set(saved.compactMap(\.productId)))
        guard !ids.isEmpty else { return [] }
        // Chunked: every id goes into one `id=in.(…)` query string, and a few
        // hundred saved pieces would push the URL past what PostgREST and the
        // edge in front of it will accept — costing both discovering rows.
        var products: [Product] = []
        for chunk in stride(from: 0, to: ids.count, by: productIdsPerRead) {
            let slice = Array(ids[chunk..<min(chunk + productIdsPerRead, ids.count)])
            do {
                products += try await ProductAPIClient.shared.fetchProducts(ids: slice)
            } catch {
                #if DEBUG
                PatinaLog.ui.error("[RecordForeground] saved-piece products failed: \(error)")
                #endif
                return []
            }
        }
        return products
    }

    /// Ids per `id=in.(…)` read. A uuid plus its separator is ~37 characters,
    /// so 100 keeps the query string well inside every hop's limit.
    private static let productIdsPerRead = 100
}
