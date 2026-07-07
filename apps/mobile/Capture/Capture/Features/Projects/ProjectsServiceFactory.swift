//  ProjectsServiceFactory.swift
//  Capture · Wave P (Projects)
//
//  Real-mode factory for the Projects seam. AppContainer calls this in real
//  mode only (mock mode wires MockProjectsService directly), so this always
//  returns the Supabase-backed service. Reads are RLS-scoped by the client's
//  auth session — `deps.session` isn't needed here.

import CaptureKit

enum ProjectsServiceFactory {
    static func make(deps: WorkServiceDependencies) -> any ProjectsService {
        SupabaseProjectsService(client: deps.client)
    }
}
