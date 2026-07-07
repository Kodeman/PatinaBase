//  ProjectsServiceFactory.swift
//  Capture · Wave P (Projects)
//
//  Real-mode factory for the Projects seam. AppContainer calls this in real mode;
//  the freeze returns the mock. Wave P replaces ONLY the body below (backing it
//  with `deps.client` + `deps.session`) and adds its real service file(s) in this
//  same directory — no shared file changes.

import CaptureKit
import CaptureKitMocks

enum ProjectsServiceFactory {
    static func make(deps: WorkServiceDependencies) -> any ProjectsService {
        // TODO(wave-P): replace with the real Supabase-backed ProjectsService.
        MockProjectsService()
    }
}
