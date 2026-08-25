//  VisitDoorTests.swift
//  CaptureTests
//
//  V0 — the door (spec §7.3). Three taps and ≤8 s, IN AIRPLANE MODE.

import Foundation
import Testing
@testable import CaptureKit

@MainActor
struct VisitDoorTests {

    private let owner = CaptureOwnerIdentity(userID: "u1", workspaceID: "w1")!

    private final class StubProjects: ProjectsService, @unchecked Sendable {
        var list: [FieldProject] = []
        var detail: [String: FieldProjectDetail] = [:]
        var offline = false
        struct Offline: Error {}
        func listProjects() async throws -> [FieldProject] {
            if offline { throw Offline() }
            return list
        }
        func projectDetail(id: String) async throws -> FieldProjectDetail {
            if offline { throw Offline() }
            guard let d = detail[id] else { throw Offline() }
            return d
        }
    }

    private func makeCache(_ service: StubProjects) throws -> CaptureProjectCache {
        let store = try CaptureStore.inMemory()
        return CaptureProjectCache(store: store, projects: service)
    }

    private func seededService() -> StubProjects {
        let service = StubProjects()
        let maple = FieldProject(id: "p1", name: "Maple St residence", status: "active")
        let harbor = FieldProject(id: "p2", name: "Harbor loft", status: "active")
        service.list = [maple, harbor]
        service.detail["p1"] = FieldProjectDetail(
            project: maple,
            specRooms: [FieldProjectRoom(id: "sr1", name: "Living"),
                        FieldProjectRoom(id: "sr2", name: "Dining")],
            rooms: [FieldProjectRoom(id: "r1", name: "Living")])
        return service
    }

    @Test func theDoorOpensOnSiteVisitAndListsCachedProjects() async throws {
        let service = seededService()
        let cache = try makeCache(service)
        let model = FieldVisitDoorModel(cache: cache, owner: owner)
        await model.load()

        #expect(model.kind == .site)
        #expect(model.projects.map(\.id).sorted() == ["p1", "p2"])
        #expect(model.offlineCaption == nil)
        #expect(!model.canStart)                    // no project chosen yet
    }

    @Test func offlineRendersTheCacheWithAnHonestLineNotAnEmptyList() async throws {
        let service = seededService()
        let cache = try makeCache(service)
        let warm = FieldVisitDoorModel(cache: cache, owner: owner)
        await warm.load()

        service.offline = true
        let model = FieldVisitDoorModel(cache: cache, owner: owner)
        await model.load()

        #expect(model.isOffline)
        #expect(model.projects.count == 2)          // never an empty list
        #expect(model.offlineCaption == "2 projects on this phone. Others need signal.")
    }

    @Test func choosingAProjectMergesBothRoomLanesAndOffersWholeHouseFirst() async throws {
        let service = seededService()
        let cache = try makeCache(service)
        let model = FieldVisitDoorModel(cache: cache, owner: owner)
        await model.load()
        await model.select(projectID: "p1")

        #expect(model.roomOptions.first?.isWholeHouse == true)
        let living = try #require(model.roomOptions.first { $0.name == "Living" })
        #expect(living.projectRoomID == "sr1")
        #expect(living.scanRoomID == "r1")
        let dining = try #require(model.roomOptions.first { $0.name == "Dining" })
        #expect(dining.projectRoomID == "sr2")
        #expect(dining.scanRoomID == nil)           // never cross-assigned
        #expect(model.canStart)                     // Whole house is a valid answer
    }

    @Test func theDraftStampsOnlyTheLegalLanePerRoom() async throws {
        let service = seededService()
        let cache = try makeCache(service)
        let model = FieldVisitDoorModel(cache: cache, owner: owner)
        await model.load()
        await model.select(projectID: "p1")
        model.selectedRoom = model.roomOptions.first { $0.name == "Dining" }
        model.kit = .tradeWalk

        let draft = try #require(model.draft())
        #expect(draft.kind == .site)
        #expect(draft.kit == .tradeWalk)
        #expect(draft.projectID == "p1")
        #expect(draft.label == "Maple St residence")
        #expect(draft.projectRoomID == "sr2")
        #expect(draft.scanRoomID == nil)
        #expect(draft.room == "Dining")
        #expect(draft.defaultNoteSetting == .solo)
    }

    @Test func wholeHouseStampsNeitherRoomLane() async throws {
        let service = seededService()
        let cache = try makeCache(service)
        let model = FieldVisitDoorModel(cache: cache, owner: owner)
        await model.load()
        await model.select(projectID: "p1")
        model.selectedRoom = .wholeHouse

        let draft = try #require(model.draft())
        #expect(draft.projectRoomID == nil)
        #expect(draft.scanRoomID == nil)
        #expect(draft.room == nil)
    }

    @Test func theQueryFiltersTheCachedList() async throws {
        let service = seededService()
        let cache = try makeCache(service)
        let model = FieldVisitDoorModel(cache: cache, owner: owner)
        await model.load()
        model.query = "harbor"
        #expect(model.projects.map(\.id) == ["p2"])
    }

    // ── Wave 3, task 12: the sourcing branch and the already-open branch ──

    private final class StubLocation: LocationService, @unchecked Sendable {
        var venue: VenueStamp?
        func requestWhenInUse() async -> Bool { true }
        func currentVenue() async -> VenueStamp? { venue }
    }

    private let identity = CaptureSessionIdentity(userID: "u1", workspaceID: "w1")
    private let openedAt = Date(timeIntervalSince1970: 1_800_000_000)

    private func opened(_ draft: CaptureVisitDraft) -> CaptureSessionContext {
        CaptureSessionContextPolicy.started(draft, identity: identity, now: openedAt)
    }

    @Test func sourcingPrefillsTheVenueAndCapsProjectsInMindAtFour() async throws {
        let service = seededService()
        let cache = try makeCache(service)
        let model = FieldVisitDoorModel(cache: cache, owner: owner)
        await model.load()
        model.kind = .sourcing

        let location = StubLocation()
        location.venue = VenueStamp(placemarkName: "High Point · Showroom 214")
        await model.prefillVenue(from: location)
        #expect(model.venueName == "High Point · Showroom 214")
        #expect(model.canStart)

        for id in ["a", "b", "c", "d", "e"] { model.toggleProjectInMind(id) }
        #expect(model.projectsInMind == ["a", "b", "c", "d"])
        #expect(model.projectsInMindIsFull)
        model.toggleProjectInMind("a")
        #expect(model.projectsInMind == ["b", "c", "d"])

        let draft = try #require(model.draft())
        #expect(draft.kind == .sourcing)
        #expect(draft.label == "High Point · Showroom 214")
        #expect(draft.projectID == nil)
        #expect(draft.projectsInMind == ["b", "c", "d"])
    }

    @Test func prefillNeverOverwritesWhatSheTyped() async throws {
        let service = seededService()
        let cache = try makeCache(service)
        let model = FieldVisitDoorModel(cache: cache, owner: owner)
        model.kind = .sourcing
        model.venueName = "Kohler outlet"
        let location = StubLocation()
        location.venue = VenueStamp(placemarkName: "High Point · Showroom 214")
        await model.prefillVenue(from: location)
        #expect(model.venueName == "Kohler outlet")
    }

    @Test func sourcingRefusesABlankVenueAndTrimsTheOneSheGives() async throws {
        let service = seededService()
        let cache = try makeCache(service)
        let model = FieldVisitDoorModel(cache: cache, owner: owner)
        await model.load()
        model.kind = .sourcing

        #expect(!model.canStart)
        #expect(!model.projectsInMindIsFull)
        #expect(model.draft() == nil)
        model.venueName = "   "
        #expect(!model.canStart)
        #expect(model.draft() == nil)

        model.venueName = "  Kohler outlet  "
        #expect(model.canStart)
        let draft = try #require(model.draft())
        #expect(draft.label == "Kohler outlet")
        #expect(draft.projectID == nil)
        #expect(draft.projectRoomID == nil)
        #expect(draft.scanRoomID == nil)
        #expect(draft.projectsInMind.isEmpty)
    }

    @Test func anAlreadyOpenVisitOpensTheDoorInChangeMode() async throws {
        let service = seededService()
        let cache = try makeCache(service)
        let now = Date(timeIntervalSince1970: 1_800_000_000)
        let open = CaptureSessionContextPolicy.started(
            CaptureVisitDraft(kind: .site, kit: .walkThrough, label: "Maple St residence",
                              projectID: "p1", projectName: "Maple St residence"),
            identity: identity, now: now)

        let model = FieldVisitDoorModel(cache: cache, owner: owner, existing: .active(open))
        await model.load()

        #expect(model.isChangingAnOpenVisit)
        #expect(model.primaryTitle == "Change")
        #expect(model.selectedProjectID == "p1")
        #expect(model.kit == .walkThrough)
    }

    @Test func waveThreeOffersOnlyTheConsentPosture() throws {
        let service = seededService()
        let cache = try makeCache(service)
        let model = FieldVisitDoorModel(cache: cache, owner: owner)
        #expect(model.offeredKits == [.walkThrough, .tradeWalk, .install])
        #expect(model.consentPosture == .solo)
        model.kit = .walkThrough
        #expect(model.consentPosture == .conversation)
    }

    /// The spec-room lane alone. Matching on `scanRoomID` alone would land on
    /// Whole house, which is exactly the silent degrade this restore exists to stop.
    @Test func anOpenVisitRestoresARoomStoredOnTheSpecLaneOnly() async throws {
        let service = seededService()
        let cache = try makeCache(service)
        let open = opened(CaptureVisitDraft(
            kind: .site, kit: .install, label: "Maple St residence",
            projectID: "p1", projectName: "Maple St residence",
            projectRoomID: "sr2", scanRoomID: nil, room: "Dining"))

        let model = FieldVisitDoorModel(cache: cache, owner: owner, existing: .active(open))
        await model.load()

        let restored = try #require(model.selectedRoom)
        #expect(restored.name == "Dining")
        #expect(restored.projectRoomID == "sr2")
        #expect(restored.scanRoomID == nil)
        #expect(!restored.isWholeHouse)

        let draft = try #require(model.draft())
        #expect(draft.projectRoomID == "sr2")
        #expect(draft.scanRoomID == nil)
        #expect(draft.room == "Dining")
    }

    /// The scan lane alone. Matching on `projectRoomID` alone would land on
    /// Whole house here — the same degrade, from the other side.
    @Test func anOpenVisitRestoresARoomStoredOnTheScanLaneOnly() async throws {
        let service = seededService()
        service.detail["p2"] = FieldProjectDetail(
            project: FieldProject(id: "p2", name: "Harbor loft", status: "active"),
            specRooms: [],
            rooms: [FieldProjectRoom(id: "r9", name: "Porch")])
        let cache = try makeCache(service)
        let open = opened(CaptureVisitDraft(
            kind: .site, kit: .install, label: "Harbor loft",
            projectID: "p2", projectName: "Harbor loft",
            projectRoomID: nil, scanRoomID: "r9", room: "Porch"))

        let model = FieldVisitDoorModel(cache: cache, owner: owner, existing: .active(open))
        await model.load()

        let restored = try #require(model.selectedRoom)
        #expect(restored.name == "Porch")
        #expect(restored.projectRoomID == nil)
        #expect(restored.scanRoomID == "r9")
        #expect(!restored.isWholeHouse)

        let draft = try #require(model.draft())
        #expect(draft.projectRoomID == nil)
        #expect(draft.scanRoomID == "r9")
        #expect(draft.room == "Porch")
    }

    @Test func aStoredRoomThatNoLongerMatchesRestoresAsNilRatherThanInvented() async throws {
        let service = seededService()
        let cache = try makeCache(service)
        let open = opened(CaptureVisitDraft(
            kind: .site, kit: .install, label: "Maple St residence",
            projectID: "p1", projectName: "Maple St residence",
            projectRoomID: "sr-gone", scanRoomID: nil, room: "Cellar"))

        let model = FieldVisitDoorModel(cache: cache, owner: owner, existing: .active(open))
        await model.load()

        #expect(model.selectedRoom == nil)
        #expect(model.roomOptions.count == 3)        // Whole house, Living, Dining
        let draft = try #require(model.draft())
        #expect(draft.projectRoomID == nil)
        #expect(draft.scanRoomID == nil)

        // The mirror, on the scan lane: the case a `public.rooms`-side
        // reconstruction repair would get wrong.
        let stale = opened(CaptureVisitDraft(
            kind: .site, kit: .install, label: "Maple St residence",
            projectID: "p1", projectName: "Maple St residence",
            projectRoomID: nil, scanRoomID: "r-gone", room: "Cellar"))
        let mirror = FieldVisitDoorModel(cache: cache, owner: owner, existing: .active(stale))
        await mirror.load()

        #expect(mirror.selectedRoom == nil)
        #expect(mirror.roomOptions.count == 3)
        let mirrorDraft = try #require(mirror.draft())
        #expect(mirrorDraft.projectRoomID == nil)
        #expect(mirrorDraft.scanRoomID == nil)
    }

    @Test func changingTheProjectDropsTheRoomTheOpenVisitStored() async throws {
        let service = seededService()
        // p2 carries a room on the same lane and id the open visit stored. Real
        // `project_rooms` ids never collide across projects — the fixture forces
        // it so the pending lanes have something to WRONGLY match, which is the
        // only way `select`'s clear can be gated at all.
        service.detail["p2"] = FieldProjectDetail(
            project: FieldProject(id: "p2", name: "Harbor loft", status: "active"),
            specRooms: [FieldProjectRoom(id: "sr2", name: "Galley")],
            rooms: [])                               // spec lane only — matches BOTH stored lanes
        let cache = try makeCache(service)
        let open = opened(CaptureVisitDraft(
            kind: .site, kit: .install, label: "Maple St residence",
            projectID: "p1", projectName: "Maple St residence",
            projectRoomID: "sr2", scanRoomID: nil, room: "Dining"))

        let model = FieldVisitDoorModel(cache: cache, owner: owner, existing: .active(open))
        await model.select(projectID: "p2")

        #expect(model.roomOptions.count == 2)        // Whole house, Galley — a live target
        #expect(model.selectedRoom == nil)           // and the stale lanes did not take it
        await model.select(projectID: "p1")
        #expect(model.selectedRoom == nil)           // never resurrected later
    }

    /// A doomed match must not CONSUME the stored lanes. She opens the door with
    /// no signal, so the detail fetch fails and there is nothing to match; the
    /// room has to survive until a refresh can actually find it.
    @Test func aFailedDetailFetchKeepsTheStoredRoomPendingUntilItCanBeMatched() async throws {
        let service = seededService()
        let cache = try makeCache(service)
        let warm = FieldVisitDoorModel(cache: cache, owner: owner)
        await warm.load()                            // list cached, rooms never fetched

        let open = opened(CaptureVisitDraft(
            kind: .site, kit: .install, label: "Maple St residence",
            projectID: "p1", projectName: "Maple St residence",
            projectRoomID: "sr2", scanRoomID: nil, room: "Dining"))

        service.offline = true
        let model = FieldVisitDoorModel(cache: cache, owner: owner, existing: .active(open))
        await model.load()

        #expect(model.isOffline)
        #expect(model.roomOptions.count == 1)        // Whole house alone — nothing to match
        #expect(model.selectedRoom == nil)

        service.offline = false
        await model.select(projectID: "p1")

        let restored = try #require(model.selectedRoom)
        #expect(restored.name == "Dining")
        #expect(restored.projectRoomID == "sr2")
        #expect(restored.scanRoomID == nil)
        let draft = try #require(model.draft())
        #expect(draft.projectRoomID == "sr2")
        #expect(draft.room == "Dining")
    }

    /// The other half of the same guard: a room she picked herself is hers. A
    /// retry that finally resolves the rooms must not overwrite it.
    @Test func aRetryNeverOverwritesTheRoomSheChoseHerself() async throws {
        let service = seededService()
        let cache = try makeCache(service)
        let warm = FieldVisitDoorModel(cache: cache, owner: owner)
        await warm.load()

        let open = opened(CaptureVisitDraft(
            kind: .site, kit: .install, label: "Maple St residence",
            projectID: "p1", projectName: "Maple St residence",
            projectRoomID: "sr2", scanRoomID: nil, room: "Dining"))

        service.offline = true
        let model = FieldVisitDoorModel(cache: cache, owner: owner, existing: .active(open))
        await model.load()
        model.selectedRoom = .wholeHouse             // the one option she was offered

        service.offline = false
        await model.select(projectID: "p1")

        #expect(model.selectedRoom?.isWholeHouse == true)
        let draft = try #require(model.draft())
        #expect(draft.projectRoomID == nil)
        #expect(draft.scanRoomID == nil)
        #expect(draft.room == nil)
    }

    /// R71a: `CaptureSessionContext` truncates in its memberwise init, but a
    /// DECODED one assigns stored properties directly — the type is not a
    /// validation boundary, so the door trims what it is handed.
    @Test func anOverCapProjectsInMindArrivesLongAndOpensTruncated() async throws {
        let service = seededService()
        let cache = try makeCache(service)
        let base = opened(CaptureVisitDraft(
            kind: .sourcing, kit: .install, label: "High Point · Showroom 214",
            projectsInMind: ["a", "b", "c", "d"]))

        let encoded = try JSONEncoder().encode(base)
        var json = try #require(try JSONSerialization.jsonObject(with: encoded) as? [String: Any])
        json["projectsInMind"] = ["a", "b", "c", "d", "e", "f"]
        let decoded = try JSONDecoder().decode(
            CaptureSessionContext.self,
            from: try JSONSerialization.data(withJSONObject: json))
        #expect(decoded.projectsInMind.count == 6)   // the premise, proved

        let model = FieldVisitDoorModel(cache: cache, owner: owner, existing: .active(decoded))
        await model.load()

        #expect(model.projectsInMind == ["a", "b", "c", "d"])
        #expect(model.projectsInMindIsFull)
        let draft = try #require(model.draft())
        #expect(draft.projectsInMind == ["a", "b", "c", "d"])
    }

    @Test func anOpenSourcingVisitCarriesItsVenueAndAKindlessContextOpensOnSite() async throws {
        let service = seededService()
        let cache = try makeCache(service)
        let open = opened(CaptureVisitDraft(
            kind: .sourcing, kit: .tradeWalk, label: "High Point · Showroom 214",
            projectsInMind: ["p1"]))

        let model = FieldVisitDoorModel(cache: cache, owner: owner, existing: .active(open))
        #expect(model.kind == .sourcing)
        #expect(model.venueName == "High Point · Showroom 214")
        #expect(model.projectsInMind == ["p1"])
        #expect(model.kit == .tradeWalk)
        #expect(model.primaryTitle == "Change")

        // FC-R2: no visit is a NULL kind, and the door still has to open on one.
        let kindless = CaptureSessionContext(identity: identity, startedAt: openedAt,
                                             lastActivityAt: openedAt)
        let fallback = FieldVisitDoorModel(cache: cache, owner: owner, existing: .active(kindless))
        #expect(fallback.kind == .site)
        #expect(fallback.venueName.isEmpty)
        #expect(fallback.kit == nil)
    }

    /// A site visit's label is the project name, so the venue field stays empty —
    /// a sourcing label must never leak into a site visit and back.
    @Test func anOpenSiteVisitLeavesTheVenueFieldEmpty() throws {
        let service = seededService()
        let cache = try makeCache(service)
        let open = opened(CaptureVisitDraft(
            kind: .site, kit: .walkThrough, label: "Maple St residence",
            projectID: "p1", projectName: "Maple St residence"))

        let model = FieldVisitDoorModel(cache: cache, owner: owner, existing: .active(open))
        #expect(model.venueName.isEmpty)
    }

    @Test func aProjectThatIsNoLongerCachedNeitherLightsTheButtonNorDrafts() async throws {
        let service = seededService()
        let cache = try makeCache(service)
        let open = opened(CaptureVisitDraft(
            kind: .site, kit: .install, label: "Birch Row",
            projectID: "p9", projectName: "Birch Row"))

        let model = FieldVisitDoorModel(cache: cache, owner: owner, existing: .active(open))
        await model.load()

        #expect(model.selectedProjectID == "p9")
        #expect(!model.canStart)                     // never live-but-dead
        #expect(model.draft() == nil)
    }

    /// R30: the caption counts PERSISTED ROWS, not what the search box left visible.
    @Test func theOfflineCaptionCountsEveryCachedProjectNotTheFilteredOnes() async throws {
        let service = seededService()
        let cache = try makeCache(service)
        let warm = FieldVisitDoorModel(cache: cache, owner: owner)
        await warm.load()

        service.offline = true
        let model = FieldVisitDoorModel(cache: cache, owner: owner)
        await model.load()
        model.query = "harbor"

        #expect(model.projects.count == 1)
        #expect(model.offlineCaption == "2 projects on this phone. Others need signal.")
    }

    /// The contract the door's START owes the chip: what `draft()` produced is
    /// what the visit reads back, on BOTH FC-R5 lanes, and End clears it.
    @Test func startingFromTheDoorPersistsAVisitTheChipCanRead() async throws {
        let service = seededService()
        let cache = try makeCache(service)
        let identity = CaptureSessionIdentity(userID: "u1", workspaceID: "w1")
        let defaults = try #require(UserDefaults(suiteName: "test.v0.\(UUID().uuidString)"))
        let store = CaptureSessionContextStore(defaults: defaults,
                                               key: "capture.session-context.v1")
        let now = Date(timeIntervalSince1970: 1_800_000_000)

        let model = FieldVisitDoorModel(cache: cache, owner: owner)
        await model.load()
        await model.select(projectID: "p1")
        model.selectedRoom = model.roomOptions.first { $0.name == "Living" }
        model.kit = .walkThrough

        let draft = try #require(model.draft())
        store.startVisit(draft, identity: identity, now: now)

        let state = store.visitState(identity: identity, now: now.addingTimeInterval(60))
        let context = try #require(state.context)
        #expect(context.isVisit)
        #expect(context.label == "Maple St residence")
        #expect(context.routing.projectRoomID == "sr1")
        #expect(context.scanRoomID == "r1")

        _ = store.endVisit(identity: identity, now: now.addingTimeInterval(120))
        #expect(store.visitState(identity: identity, now: now.addingTimeInterval(180)) == .none)
    }

    /// The hold the door hangs its primary on, and why it has to be the MODEL's.
    /// `canStart` is TRUE in this state — `draft()` reads `selectedRoom` alone, so
    /// a "Change" taken here writes BOTH lanes nil and demotes the visit to Whole
    /// house behind a button that looked live. And a CALLER-side mirror of the
    /// rule ("is this still the restored project, with no room and no merged
    /// list?") re-fires after a switch away and back — holding Change forever for
    /// lanes `select` already threw away.
    @Test func awaitingARestoredRoomHoldsWhilePendingAndNeverReturnsAfterASwitch() async throws {
        let service = seededService()
        service.detail["p2"] = FieldProjectDetail(
            project: FieldProject(id: "p2", name: "Harbor loft", status: "active"),
            specRooms: [], rooms: [])
        let cache = try makeCache(service)
        let warm = FieldVisitDoorModel(cache: cache, owner: owner)
        await warm.load()                            // list cached, rooms never fetched

        let open = opened(CaptureVisitDraft(
            kind: .site, kit: .install, label: "Maple St residence",
            projectID: "p1", projectName: "Maple St residence",
            projectRoomID: "sr2", scanRoomID: nil, room: "Dining"))

        service.offline = true
        let model = FieldVisitDoorModel(cache: cache, owner: owner, existing: .active(open))
        await model.load()

        #expect(model.roomOptions.count == 1)        // Whole house alone
        #expect(model.canStart)                      // live-looking...
        #expect(model.isAwaitingRestoredRoom)        // ...and the door holds it

        await model.select(projectID: "p2")
        #expect(!model.isAwaitingRestoredRoom)       // `select` cleared the lanes
        await model.select(projectID: "p1")
        #expect(!model.isAwaitingRestoredRoom)       // and they never come back
    }

    /// The escape hatch the door offers under that hold: choosing Whole house
    /// herself is a real answer, so the hold lifts even though the rooms never
    /// arrived — otherwise a designer with no signal could never change a visit.
    @Test func choosingWholeHouseLiftsTheHoldWhileTheRoomsStayUnreachable() async throws {
        let service = seededService()
        let cache = try makeCache(service)
        let warm = FieldVisitDoorModel(cache: cache, owner: owner)
        await warm.load()

        let open = opened(CaptureVisitDraft(
            kind: .site, kit: .install, label: "Maple St residence",
            projectID: "p1", projectName: "Maple St residence",
            projectRoomID: "sr2", scanRoomID: nil, room: "Dining"))

        service.offline = true
        let model = FieldVisitDoorModel(cache: cache, owner: owner, existing: .active(open))
        await model.load()
        #expect(model.isAwaitingRestoredRoom)

        model.selectedRoom = model.roomOptions.first { $0.isWholeHouse }
        #expect(!model.isAwaitingRestoredRoom)
        let draft = try #require(model.draft())
        #expect(draft.projectRoomID == nil)          // and Whole house is what lands
        #expect(draft.scanRoomID == nil)
    }

    /// Sourcing carries no room at all, so a hold taken there could never be
    /// released — she would be locked out of starting a market run by a room she
    /// is no longer choosing.
    @Test func sourcingIsNeverAwaitingARestoredRoom() async throws {
        let service = seededService()
        let cache = try makeCache(service)
        let warm = FieldVisitDoorModel(cache: cache, owner: owner)
        await warm.load()

        let open = opened(CaptureVisitDraft(
            kind: .site, kit: .install, label: "Maple St residence",
            projectID: "p1", projectName: "Maple St residence",
            projectRoomID: "sr2", scanRoomID: nil, room: "Dining"))

        service.offline = true
        let model = FieldVisitDoorModel(cache: cache, owner: owner, existing: .active(open))
        await model.load()
        #expect(model.isAwaitingRestoredRoom)

        model.kind = .sourcing
        #expect(!model.isAwaitingRestoredRoom)
    }
}
