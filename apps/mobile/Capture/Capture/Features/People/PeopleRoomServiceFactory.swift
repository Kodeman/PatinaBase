//  PeopleRoomServiceFactory.swift
//  Capture · W5 (the People room, on the job)
//
//  Real-mode factory for the People room seam. Mock mode wires
//  `MockPeopleRoomService` directly in `AppContainer`, so this always returns
//  the Supabase-backed service. Reads are RLS-scoped by the client's auth
//  session; the two writes read `session.ownerIdentity` for the studio.

import CaptureKit

enum PeopleRoomServiceFactory {
    static func make(deps: WorkServiceDependencies) -> any PeopleRoomService {
        SupabasePeopleRoomService(client: deps.client, session: deps.session,
                                  linkBaseURL: AppConfiguration.guestSiteBaseURL)
    }
}
