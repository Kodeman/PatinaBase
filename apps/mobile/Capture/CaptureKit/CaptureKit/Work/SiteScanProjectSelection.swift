import Foundation
import Observation

/// The setup picker's room options and filing IDs belong to its latest selection.
@MainActor
@Observable
public final class SiteScanProjectSelection {
    private let projects: any ProjectsService
    private var generation = 0

    public private(set) var selectedProjectID: String?
    public private(set) var rooms: [FieldVisitRoomOption] = []
    public var selectedRoomID: String?

    public var selectedScanRoomID: String? {
        rooms.first { $0.id == selectedRoomID }?.scanRoomID
    }

    public var selectedFilingRoomID: String? {
        rooms.first { $0.id == selectedRoomID }?.projectRoomID
    }

    public init(projects: any ProjectsService) {
        self.projects = projects
    }

    public func selectProject(_ id: String?) async {
        generation += 1
        let requestGeneration = generation
        selectedProjectID = id
        selectedRoomID = nil
        rooms = []
        guard let id else { return }
        // Room pick is optional — on failure the uploader makes a new room.
        guard let detail = try? await projects.projectDetail(id: id),
              requestGeneration == generation else { return }
        rooms = FieldVisitRoomMerge.merge(
            specRooms: detail.specRooms.map { CaptureCachedRoom(id: $0.id, name: $0.name) },
            rooms: detail.rooms.map { CaptureCachedRoom(id: $0.id, name: $0.name) })
    }
}
