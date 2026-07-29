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

    @MainActor
    public static func specimen(
        id: UUID,
        store: CaptureStore,
        runsRealServices: Bool,
        userID: String?,
        workspaceID: String?
    ) -> Specimen? {
        switch resolve(
            runsRealServices: runsRealServices,
            userID: userID,
            workspaceID: workspaceID
        ) {
        case .globalFixtures:
            return store.specimen(id: id)
        case .owner(let owner):
            return store.specimen(id: id, owner: owner)
        case .unavailable:
            return nil
        }
    }

    @MainActor
    public static func newDraft(
        store: CaptureStore,
        sessionID: UUID? = nil,
        runsRealServices: Bool,
        userID: String?,
        workspaceID: String?
    ) -> Specimen? {
        switch resolve(
            runsRealServices: runsRealServices,
            userID: userID,
            workspaceID: workspaceID
        ) {
        case .globalFixtures:
            return store.newDraft(sessionID: sessionID)
        case .owner(let owner):
            return store.newDraft(sessionID: sessionID, owner: owner)
        case .unavailable:
            return nil
        }
    }
}
