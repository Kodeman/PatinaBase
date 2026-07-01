//  CaptureLifecycle.swift
//  CaptureKit
//
//  The capture lifecycle as a pure state machine (spec §11). Whatever the entry
//  or mode, a capture goes live → freezes to a specimen → loops while enriched →
//  may rest in a session → gets routed → resolves to saved / inbox / queued.

import Foundation

public enum CaptureLifecycle {
    public enum State: String, Codable, Sendable, CaseIterable {
        case viewfinder    // C1 live
        case captured      // C3 shutter fired, frame frozen
        case specimen      // C5 card/sheet up
        case enriching     // N1–N5 sub-action in flight
        case session       // V1 batch
        case routed        // S1 stamped + placed
        case saved         // S4 library (terminal)
        case inbox         // S5 inbox (terminal)
        case queued        // R4 offline (transient terminal until signal)
        case failed        // sync error
    }

    public enum EnrichKind: Sendable { case ocr, code, measure, voice, smartGuess }

    public enum Event: Sendable {
        case shutter
        case addShot
        case openSpecimen
        case beginEnrich(EnrichKind)
        case finishEnrich
        case openSession
        case assignVenue
        case chooseDestination(CaptureDestination)
        case save
        case enqueueOffline
        case commitSucceeded
        case commitFailed(String)
        case retry
    }

    /// Pure reducer — unit-tested in CaptureTests.
    public static func reduce(_ state: State, _ event: Event) -> State {
        switch (state, event) {
        case (.viewfinder, .shutter):                return .captured
        case (.captured, .openSpecimen):             return .specimen
        case (.captured, .addShot):                  return .captured
        case (.specimen, .addShot):                  return .specimen
        case (_, .beginEnrich):                      return .enriching
        case (.enriching, .finishEnrich):            return .specimen
        case (_, .openSession):                      return .session
        case (_, .assignVenue):                      return .routed
        case (_, .chooseDestination(.library)):      return .routed
        case (_, .chooseDestination(.inbox)):        return .routed
        case (_, .chooseDestination(.undecided)):    return state
        case (_, .enqueueOffline):                   return .queued
        case (.routed, .save):                       return .routed
        case (_, .commitSucceeded):                  return .saved
        case (_, .commitFailed):                     return .failed
        case (.failed, .retry):                      return .queued
        case (.queued, .retry):                      return .queued
        default:                                     return state
        }
    }

    public static func isTerminal(_ state: State) -> Bool {
        state == .saved || state == .inbox
    }
}
