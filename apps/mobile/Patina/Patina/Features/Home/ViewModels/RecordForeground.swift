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
//  ONTO Today — coalesce onto the first: a second rebuild would build against
//  the visit stamp the first one had just written, and take every row's `isNew`
//  tick off on the very open that should have shown them.
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
        // .refreshRecord`'s doc comment).
        await BadgeCountService.shared.refresh()
        await DesignRequestStatusService.shared.refresh()
        let story = try? await todaysStoryRow()
        await run(context: context, story: story)
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
        paint: @escaping @MainActor (HouseRecord) -> Void = { _ in }
    ) async -> Outcome? {
        let (outcome, ranTheRebuild) = await coalesce {
            await rebuild(context: context, story: story, paint: paint)
        }
        // A caller that joined a rebuild already in flight missed its paints,
        // so it takes the built record here.
        if let outcome, !ranTheRebuild { paint(outcome.record) }
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
        return Outcome(record: outcome.record, saved: saved)
    }

    // MARK: - The inputs

    /// Today's story row — SP-18's pick, in one place, so the card and the
    /// record's MOVED row can never name two different stories.
    static func todaysStoryRow() async throws -> RemoteEditorialStory? {
        let candidates = try await EditorialStoriesAPIClient.shared.fetchCandidates()
        let pickedId = StoryReadStore().nextStoryId(from: candidates.map(\.id))
        return candidates.first { $0.id == pickedId }
    }

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
