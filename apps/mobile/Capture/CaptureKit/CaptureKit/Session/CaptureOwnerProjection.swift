//
//  CaptureOwnerProjection.swift
//  CaptureKit
//
//  Resolves how user-facing local lists may read the shared device store.
//  Production is owner-scoped and fail-closed; previews and the launch harness
//  intentionally retain their unowned fixture rows.
//

import Foundation

public enum CaptureLocalListScope: Equatable, Sendable {
    case globalFixtures
    case owner(CaptureOwnerIdentity)
    case unavailable
}

public enum CaptureOwnerProjectionPolicy {
    public static func resolve(
        runsRealServices: Bool,
        userID: String?,
        workspaceID: String?
    ) -> CaptureLocalListScope {
        guard runsRealServices else { return .globalFixtures }
        guard let owner = CaptureOwnerIdentity(
            userID: userID,
            workspaceID: workspaceID
        ) else {
            return .unavailable
        }
        return .owner(owner)
    }
}
