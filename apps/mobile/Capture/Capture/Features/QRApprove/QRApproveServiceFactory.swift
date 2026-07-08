//  QRApproveServiceFactory.swift
//  Capture · Wave Q (QR portal-login approval)
//
//  Real-mode factory for the portal-auth approval seam. AppContainer calls this in
//  real mode; mock mode wires MockPortalAuthApprovalService directly (never
//  through here). Real mode builds SupabasePortalAuthApprovalService, which
//  uses `deps.client` for the Supabase JWT (`client.auth.session.accessToken`)
//  and `deps.session` for a fast local `isAuthenticated` check — see that
//  file for the parse/approve/reject contract and the verify-endpoint shape.

import Supabase
import CaptureKit

enum QRApproveServiceFactory {
    static func make(deps: WorkServiceDependencies) -> any PortalAuthApprovalService {
        SupabasePortalAuthApprovalService(client: deps.client, session: deps.session)
    }
}
