//  FieldLaunchPolicy.swift
//  CaptureKit
//
//  Spec §5.3 — the whole concession to the camera-first inversion. Making the
//  day the home is FC-R1, and the mitigation is that camera-first muscle memory
//  survives INSIDE a visit, which is exactly when it is right.

import Foundation

public enum FieldLaunchDestination: Equatable, Sendable {
    /// A visit is open and active within 30 min — today's rhythm, unchanged.
    case viewfinder
    /// A stale or absent visit. Today is home (FC-R1).
    case today
    /// `field://capture` with no visit — C1 with an UNPLACED chip.
    case viewfinderUnplaced

    public var realm: FieldRealm {
        switch self {
        case .today: return .work
        case .viewfinder, .viewfinderUnplaced: return .camera
        }
    }
}

public enum FieldLaunchPolicy {
    /// FC-R1(a). Flip this to `false` and the camera is home again: Today
    /// becomes a strip reached from the TODAY pill and the visit chip is the
    /// only new chrome. Nothing else in wave 3 changes.
    ///
    /// A `let`, not a `nonisolated(unsafe) var`: the reversal is a one-character
    /// source edit, and a mutable global would be a data race the tests hit
    /// first — Swift Testing parallelises, so one test flipping it while another
    /// reads it is flaky by construction.
    public static let todayIsHome = true

    public static func destination(
        visitState: CaptureVisitState,
        deepLinkedToCapture: Bool,
        todayIsHome: Bool = FieldLaunchPolicy.todayIsHome
    ) -> FieldLaunchDestination {
        switch visitState {
        case .active:
            return .viewfinder
        case .stale, .none:
            if deepLinkedToCapture || !todayIsHome { return .viewfinderUnplaced }
            return .today
        }
    }
}
