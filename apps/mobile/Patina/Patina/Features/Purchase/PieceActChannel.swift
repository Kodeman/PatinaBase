//
//  PieceActChannel.swift
//  Patina
//
//  The seam between the Companion's piece-context row and the piece screen's
//  own act.
//
//  The Companion panel draws over the piece, not inside it, so its rows can
//  navigate but cannot reach the screen's sheets. Every other Companion row
//  either pushes a route or raises an app-level sheet; this one has to do
//  neither — "Ask Leah to source this" from the Companion must open the same
//  sheet the bar opens, on the same piece, or the two surfaces would offer the
//  same words and do different things.
//
//  One token, bumped on request. The piece screen watches it and opens its own
//  act; a stale token (the screen was replaced) is simply never read.
//

import Foundation
import Observation

@MainActor
@Observable
final class PieceActChannel {

    static let shared = PieceActChannel()

    /// Bumped when a Companion row asks the piece screen to perform its act.
    private(set) var requestToken: Int = 0

    /// The act the piece currently on screen resolved. The Companion's
    /// enrichment seam reads it — the row builders stay pure functions of
    /// `(route, context, isAuthenticated)`, exactly as `designerRelationship`
    /// and `engagementTier` already do.
    private(set) var currentAct: PieceAct?

    init() {}

    func publish(_ act: PieceAct?) {
        currentAct = act
    }

    func requestAct() {
        requestToken &+= 1
    }
}
