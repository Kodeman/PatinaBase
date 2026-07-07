//  CaptureScreenID.swift
//  CaptureKit
//
//  Frozen per-screen accessibility identifiers (33 entries) — the deterministic
//  handles XCUITest and MobAI use to drive and assert every screen.

import Foundation

public enum CaptureScreenID: String, CaseIterable, Sendable {
    // Flow 0 — first run & permissions
    case o1Welcome            = "screen.O1.welcome"
    case o2Connect            = "screen.O2.connect"
    case o3CameraPriming      = "screen.O3.camera-priming"
    case o4Ready              = "screen.O4.ready"
    // Flow 1 — entry points
    case e1AppIcon            = "screen.E1.app-icon"
    case e2SystemEntry        = "screen.E2.system-entry"
    case e3ShareSheet         = "screen.E3.share-sheet"
    // Flow 2 — core capture
    case c1Viewfinder         = "screen.C1.viewfinder"
    case c2Framing            = "screen.C2.framing"
    case c3Specimen           = "screen.C3.specimen-forms"
    case c4MultiShot          = "screen.C4.multi-shot"
    case c5SpecimenSheet      = "screen.C5.specimen-sheet"
    // Flow 3 — enrich in place
    case n1TagOCR             = "screen.N1.tag-ocr"
    case n2Scan               = "screen.N2.scan"
    case n3Measure            = "screen.N3.measure"
    case n4Voice              = "screen.N4.voice"
    case n5SmartGuess         = "screen.N5.smart-guess"
    // Flow 4 — resilience & edges
    case r1LowLight           = "screen.R1.low-light"
    case r2OCRFallback        = "screen.R2.ocr-fallback"
    case r3Denied             = "screen.R3.denied"
    case r4Offline            = "screen.R4.offline"
    // Flow 5 — route & save
    case s1Assign             = "screen.S1.assign"
    case s2CreateProject      = "screen.S2.create-project"
    case s3Destination        = "screen.S3.destination"
    case s4Saved              = "screen.S4.saved"
    case s5Inbox              = "screen.S5.inbox"
    // Flow 6 — session & review
    case v1SessionTray        = "screen.V1.session-tray"
    case v2Cull               = "screen.V2.cull"
    case v3Detail             = "screen.V3.detail"
    // Flow 7 — utilities & settings
    case u1Sync               = "screen.U1.sync"
    case u2LibrarySearch      = "screen.U2.library-search"
    case t1Settings           = "screen.T1.settings"
    case t2Account            = "screen.T2.account"
}
