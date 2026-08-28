//
//  SavedItemNoteMirror.swift
//  Patina
//
//  The note on a saved piece, written locally first and mirrored to
//  `saved_items.notes` (00055:29; owner UPDATE under RLS at 00055:56).
//
//  Local-first is the honest order here: the reader typed the sentence on
//  their device, so their device is where it lands. The PATCH is best effort
//  — offline, the note is still on the row in front of them, and the next
//  successful write carries it up.
//

import Foundation
import Supabase

enum SavedItemNoteMirror {

    /// Explicit shape rather than a dictionary literal: clearing a note is a
    /// real `null`, and a `[String: String?]` is one inference away from
    /// encoding nothing at all.
    private struct NotePatch: Encodable {
        let notes: String?
    }

    /// Push `note` onto every `saved_items` row this account holds for
    /// `productId`. 00537 §3 de-duplicated the table behind two partial
    /// unique indexes, so that is one row per room the piece sits in — and
    /// one note about a piece is one note about a piece, whichever room it
    /// was saved into.
    ///
    /// Returns silently on every failure: nothing the reader is looking at
    /// waits on this.
    static func mirror(note: String?, productId: String) async {
        guard let userId = await AuthService.shared.currentUserId else { return }
        do {
            try await supabase.database
                .from("saved_items")
                .update(NotePatch(notes: note))
                .eq("user_id", value: userId)
                .eq("product_id", value: productId)
                .execute()
        } catch {
            PatinaLog.sync.debug(
                "SavedItemNoteMirror: note kept locally — \(error.localizedDescription)"
            )
        }
    }
}
