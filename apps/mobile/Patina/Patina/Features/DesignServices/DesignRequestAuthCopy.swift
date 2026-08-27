//
//  DesignRequestAuthCopy.swift
//  Patina
//
//  SP-09 — the last tap of a design request has a way back.
//
//  A guest fills in four screens, taps "Send request", and gets the full gate
//  as a sheet with no Cancel, no ✕ and no "Look around first" (AuthSheet
//  passes `showGuest: false`). Two lines of repair: say it on the way in, and
//  give the soft wall a title naming what it is gating plus a Cancel. This
//  restores C9 ("the auth sheet presents over context and never ejects").
//

import Foundation

enum DesignRequestAuthCopy {

    /// Title on the soft-wall sheet — names the thing being gated, so the
    /// sheet reads as a step in the request rather than a front door.
    static let wallTitle = "Sign in to send your request"

    /// Shown on the Review step to a guest, before the send is attempted.
    static let reviewHint = "You'll sign in to send this."
}
