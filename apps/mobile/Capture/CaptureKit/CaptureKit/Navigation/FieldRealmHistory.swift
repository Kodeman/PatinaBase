//  FieldRealmHistory.swift
//  CaptureKit
//
//  Pure navigation state for Option B's two-realm shell. Camera and Work own
//  independent stacks so crossing the realm boundary never destroys context.

import Foundation

public enum FieldRealm: String, CaseIterable, Hashable, Sendable {
    case camera
    case work
}

public struct FieldRealmHistory: Equatable, Sendable {
    public private(set) var activeRealm: FieldRealm
    private var cameraPath: [CaptureRoute]
    private var workPath: [CaptureRoute]

    public init(
        activeRealm: FieldRealm = .camera,
        cameraPath: [CaptureRoute] = [],
        workPath: [CaptureRoute] = []
    ) {
        self.activeRealm = activeRealm
        self.cameraPath = cameraPath
        self.workPath = workPath
    }

    public var activePath: [CaptureRoute] {
        path(for: activeRealm)
    }

    public func path(for realm: FieldRealm) -> [CaptureRoute] {
        switch realm {
        case .camera: cameraPath
        case .work: workPath
        }
    }

    public mutating func activate(_ realm: FieldRealm) {
        activeRealm = realm
    }

    public mutating func push(_ route: CaptureRoute) {
        switch activeRealm {
        case .camera: cameraPath.append(route)
        case .work: workPath.append(route)
        }
    }

    public mutating func replacePath(_ path: [CaptureRoute], for realm: FieldRealm) {
        switch realm {
        case .camera: cameraPath = path
        case .work: workPath = path
        }
    }

    public mutating func goBack() {
        switch activeRealm {
        case .camera:
            if !cameraPath.isEmpty { cameraPath.removeLast() }
        case .work:
            if !workPath.isEmpty { workPath.removeLast() }
        }
    }

    public mutating func popToRoot() {
        replacePath([], for: activeRealm)
    }
}
