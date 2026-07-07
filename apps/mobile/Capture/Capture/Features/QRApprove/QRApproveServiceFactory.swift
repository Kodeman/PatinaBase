//  QRApproveServiceFactory.swift
//  Capture · Wave Q (QR portal-login approval)
//
//  Real-mode factory for the portal-auth approval seam. AppContainer calls this in
//  real mode; the freeze returns the mock. Wave Q replaces ONLY the body below
//  (biometric gate + verify request) and adds its real service file(s) in this
//  directory.

import CaptureKit
import CaptureKitMocks

enum QRApproveServiceFactory {
    static func make(deps: WorkServiceDependencies) -> any PortalAuthApprovalService {
        // TODO(wave-Q): replace with the real Supabase-backed PortalAuthApprovalService.
        MockPortalAuthApprovalService()
    }
}
