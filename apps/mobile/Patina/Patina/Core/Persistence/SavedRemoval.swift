//
//  SavedRemoval.swift
//  Patina
//
//  Un-saving a piece, in one place.
//
//  A save writes the piece to three places: the Saved table's own
//  `TableItemModel`, the room's `SavedItem` when a room was chosen, and the
//  account's `saved_items` mirror. Three screens un-save, and until this file
//  only one of them took back all three:
//
//    · `ProductDetailViewModel.toggleSave` — took all three (fix round 2, M-1)
//    · `CollectionsViewModel.removeSavedItem` — took the table row only
//    · `RecommendationsViewModel.unsaveProduct` — took the table rows only
//
//  So a piece added to a room from the piece screen and then removed from
//  Pieces → Saved, or from a recommendation's ⋯ menu, left the room still
//  saying "1 saved piece" and still counting its price against the budget
//  (fix2-review MAJ-2). That is a C5 failure — a figure the app knows to be
//  wrong — on a surface the walk script visits.
//
//  The inverse of what `addToRoom` wrote, and the only way to write it.
//

import Foundation
import SwiftData

@MainActor
public enum SavedRemoval {

    /// Take a piece out of everywhere a save put it.
    ///
    /// `knownRemoteId` is the mirror row when the caller already holds it
    /// (`RecommendationsViewModel` keeps them in `remoteSavedItemIds`); without
    /// one the mirror is found by listing the account's rows, which is what the
    /// piece screen has always done.
    ///
    /// The local half is synchronous — the reader's next frame must not show a
    /// count the app has already decided is wrong. The mirror is best-effort
    /// and off the caller's frame, exactly as it was on the piece screen.
    public static func remove(
        productId: String,
        context: ModelContext,
        knownRemoteId: String? = nil
    ) {
        removeLocally(productId: productId, context: context)
        Task { await removeMirror(productId: productId, knownRemoteId: knownRemoteId) }
    }

    /// The local half alone, for callers that own their own mirror step or are
    /// under test. Returns how many `TableItemModel` rows went, so a caller can
    /// keep its own published copy in step without re-fetching.
    @discardableResult
    public static func removeLocally(productId: String, context: ModelContext) -> Int {
        let descriptor = FetchDescriptor<TableItemModel>(
            predicate: #Predicate { $0.productId == productId }
        )
        let rows = (try? context.fetch(descriptor)) ?? []
        for row in rows { context.delete(row) }

        // The room's own copy. Iterating a value-typed snapshot of `items` so
        // deleting inside the loop is safe.
        let store = RoomStore(context: context)
        for room in store.allRooms() {
            for item in Array(room.items) where item.productId == productId {
                store.removeItem(item)
            }
        }

        return rows.count
    }

    /// The account's copy. Silent on failure: the local store is the saved
    /// thing (SP-14), and a mirror that did not land is not something to put in
    /// front of a homeowner mid-gesture.
    static func removeMirror(productId: String, knownRemoteId: String? = nil) async {
        guard SavedItemMirror.shouldAttempt(
            isAuthenticated: AuthService.shared.isAuthenticated
        ) else { return }
        do {
            if let knownRemoteId {
                try await RoomsAPIClient.shared.deleteItem(id: knownRemoteId)
                return
            }
            let userId = try await RoomsAPIClient.shared.resolveUserId()
            let rows = try await RoomsAPIClient.shared.listItems(forUserId: userId)
            for row in rows where row.product_id == productId {
                try await RoomsAPIClient.shared.deleteItem(id: row.id)
            }
        } catch {
            #if DEBUG
            PatinaLog.ui.error("[SavedRemoval] mirror failed: \(error.localizedDescription)")
            #endif
        }
    }
}
