import XCTest
@testable import CaptureKit

final class SiteScanProjectSelectionTests: XCTestCase {
    @MainActor
    func testLateProjectResponseKeepsLatestRoomsAndFilingSelection() async throws {
        let projects = ControlledProjects()
        let selection = SiteScanProjectSelection(projects: projects)
        let slowA = Task { await selection.selectProject("A") }
        await projects.waitUntilRequested(0)
        let fastB = Task { await selection.selectProject("B") }
        await projects.waitUntilRequested(1)

        await projects.complete(1)
        await fastB.value
        selection.selectedRoomID = try XCTUnwrap(selection.rooms.first).id
        XCTAssertEqual(selection.selectedFilingRoomID, "B-filing")

        await projects.complete(0)
        await slowA.value
        XCTAssertEqual(selection.selectedProjectID, "B")
        XCTAssertEqual(selection.rooms.map(\.projectRoomID), ["B-filing"])
        XCTAssertEqual(selection.selectedFilingRoomID, "B-filing")
        XCTAssertEqual(selection.selectedScanRoomID, "B-scan")
    }

    @MainActor
    func testNoProjectDiscardsInFlightRoomsAndFilingSelection() async throws {
        let projects = ControlledProjects()
        let selection = SiteScanProjectSelection(projects: projects)
        let initialB = Task { await selection.selectProject("B") }
        await projects.waitUntilRequested(0)
        await projects.complete(0)
        await initialB.value
        selection.selectedRoomID = try XCTUnwrap(selection.rooms.first).id
        XCTAssertEqual(selection.selectedFilingRoomID, "B-filing")

        let slowA = Task { await selection.selectProject("A") }
        await projects.waitUntilRequested(1)
        XCTAssertNil(selection.selectedFilingRoomID)
        await selection.selectProject(nil)
        await projects.complete(1)
        await slowA.value

        XCTAssertNil(selection.selectedProjectID)
        XCTAssertTrue(selection.rooms.isEmpty)
        XCTAssertNil(selection.selectedRoomID)
        XCTAssertNil(selection.selectedFilingRoomID)
        XCTAssertNil(selection.selectedScanRoomID)
    }

    @MainActor
    func testEarlierRequestForSameProjectCannotReplaceNewerRooms() async throws {
        let projects = ControlledProjects()
        let selection = SiteScanProjectSelection(projects: projects)
        let earlier = Task { await selection.selectProject("A") }
        await projects.waitUntilRequested(0)
        let newer = Task { await selection.selectProject("A") }
        await projects.waitUntilRequested(1)
        await projects.complete(1, suffix: "-new")
        await newer.value
        selection.selectedRoomID = try XCTUnwrap(selection.rooms.first).id

        await projects.complete(0, suffix: "-old")
        await earlier.value
        XCTAssertEqual(selection.selectedProjectID, "A")
        XCTAssertEqual(selection.rooms.map(\.projectRoomID), ["A-new-filing"])
        XCTAssertEqual(selection.selectedFilingRoomID, "A-new-filing")
        XCTAssertEqual(selection.selectedScanRoomID, "A-new-scan")
    }
}

private actor ControlledProjects: ProjectsService {
    private struct Pending {
        let projectID: String
        let completion: CheckedContinuation<FieldProjectDetail, Never>
    }

    private var nextRequest = 0
    private var pending: [Int: Pending] = [:]
    private var waiting: [Int: CheckedContinuation<Void, Never>] = [:]

    func listProjects() async throws -> [FieldProject] { [] }

    func projectDetail(id: String) async throws -> FieldProjectDetail {
        let request = nextRequest
        nextRequest += 1
        return await withCheckedContinuation { completion in
            pending[request] = Pending(projectID: id, completion: completion)
            waiting.removeValue(forKey: request)?.resume()
        }
    }

    func waitUntilRequested(_ request: Int) async {
        if pending[request] != nil { return }
        await withCheckedContinuation { waiting[request] = $0 }
    }

    func complete(_ request: Int, suffix: String = "") {
        guard let response = pending.removeValue(forKey: request) else {
            preconditionFailure("Request must be pending before completion")
        }
        let id = response.projectID
        response.completion.resume(returning: FieldProjectDetail(
            project: FieldProject(id: id, name: id, status: "active"),
            specRooms: [FieldProjectRoom(id: "\(id)\(suffix)-filing", name: "Living")],
            rooms: [FieldProjectRoom(id: "\(id)\(suffix)-scan", name: "Living")]))
    }
}
