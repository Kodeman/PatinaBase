//
//  BadgeCountService+Attention.swift
//  Patina
//
//  The four read-only sentences the service composes out of the counts it
//  already holds: `attentionCount`, `attentionHint`, `activeProjectCount` and
//  `studioHint`.
//
//  They live beside their service rather than inside it because
//  `BadgeCountService.swift` sits at SwiftLint's 500-line `file_length` — the
//  same split, and the same reason, as `BadgeCountService+Decisions.swift` and
//  `BadgeCountPersistedCounts.swift`. Nothing here mutates, so nothing here
//  needed to stay in the file that owns the storage.
//

import Foundation

extension BadgeCountService {

    /// SP-16: THE attention count. One number, computed once, printed by the
    /// Profile/Studio subhead, the Companion (which is the footer on both the
    /// Studio and the Daily Room) and the Daily Room itself.
    ///
    /// It counts ITEMS, not rows — four things needing the client is four,
    /// even where the Studio groups them into three cards.
    var attentionCount: Int {
        pendingDecisionCount + proposalsAwaitingSignatureCount + payableInvoiceCount
    }

    /// That count as the one sentence every surface prints.
    var attentionHint: String? {
        StudioAttentionSummary.attentionHint(count: attentionCount)
    }

    /// Projects that are still live work — the last rung of `studioHint`.
    var activeProjectCount: Int {
        projects.filter { !StudioQueueBuilder.projectIsArchived($0) }.count
    }

    /// THE Studio sentence, and the reason `attentionHint` alone is not it.
    ///
    /// `attentionHint` is nil whenever nothing is *awaiting* the client, so a
    /// surface that printed it alone told a client with three unread threads
    /// and no decisions "Nothing needs your attention right now." directly
    /// above a Conversation block reading "3 unread threads". The count stays
    /// single-sourced; the rest of the chain `StudioAttentionSummary.hint`
    /// always had comes back with it.
    ///
    /// The one rung it cannot carry is unread Studio *updates*
    /// (`notification_log`), which this service does not fetch — consumers
    /// that have a Studio snapshot fall through to `attentionSummary.hint`
    /// for it.
    /// `P-24` / `iosd4-M2`: counted in WORDS, in the sibling's own sentences.
    /// `attentionHint` had already been ruled into words while the three rungs
    /// below still printed figures, so one surface said "One thing needs your
    /// eye" on Monday and "3 new conversations" on Tuesday. These are
    /// `StudioAttentionSummary.hint`'s lines verbatim — the same composer, so
    /// the two cannot drift again.
    var studioHint: String? {
        if let attention = attentionHint { return attention }
        if unreadMessageCount == 1 { return "One new conversation" }
        if unreadMessageCount > 1 {
            return "\(PatinaCount.inWordsCapitalized(unreadMessageCount)) new conversations"
        }
        if activeProjectCount == 1 { return "One project is moving" }
        if activeProjectCount > 1 {
            return "\(PatinaCount.inWordsCapitalized(activeProjectCount)) projects are moving"
        }
        return nil
    }
}
