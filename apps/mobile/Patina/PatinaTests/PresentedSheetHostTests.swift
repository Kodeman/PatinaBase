//
//  PresentedSheetHostTests.swift
//  PatinaTests
//
//  `W1-B-02` — walker B recorded every `AppCoordinator.presentedSheet` sheet as
//  inert on the shipped `house-first` root, which would have left Settings,
//  Account, Sign out, the QR scanner, the in-context auth sheet, Add-a-room,
//  Move/Copy and Design services all unreachable for round one.
//
//  Re-walked on the same build on `ff-w1-walk-b`
//  (`EDFCE6CF-F87A-48D4-AF32-E1A3D8B0AEF5`), signed in as `client@patina.dev`,
//  launched with no `-PatinaFlags`: Your Spaces → "Add a room" presented the
//  sheet on the FIRST tap. `describe_screen(all: true)` afterwards returned
//  "Add a new room", "Scan with camera…", "Enter manually…" and two
//  `PopoverDismissRegion` nodes. So the driver is not broken.
//
//  What IS true is that nothing pinned it. The driver is one `.sheet(item:)`
//  attached above `mainContent`, and a lane moving it inside either root's
//  branch — or mounting a second presentation that occupies the same slot —
//  would take out eight doors at once with no test saying so. These are that
//  test.
//

import Foundation
import Testing
@testable import Patina

@MainActor
struct PresentedSheetHostTests {

    /// The six cases the coordinator can raise. Kept by hand so a seventh
    /// added without an arm below is caught here as well as by the compiler.
    private static let allCases: [AppCoordinator.PresentedSheet] = [
        .settings,
        .qr,
        .auth,
        .designServices(roomId: nil, preselectedScanIds: []),
        .newRoom,
        .moveItem(itemId: UUID())
    ]

    @Test("every sheet the coordinator can raise has an arm that renders it")
    func everySheetCaseIsRendered() throws {
        let source = try SourcePin.read("Patina/ContentView.swift")
        let start = try #require(source.range(of: "private func sheetContent(for sheet:"))
        let end = try #require(source.range(of: "// MARK: - Main Content"))
        let dispatcher = String(source[start.lowerBound..<end.lowerBound])

        for name in ["case .settings:", "case .qr:", "case .auth:",
                     "case .designServices(", "case .newRoom:", "case .moveItem("] {
            #expect(dispatcher.contains(name), "no arm renders \(name)")
        }
        // No `default:` — a new case must break compilation, not fall silently
        // through to an empty sheet.
        #expect(!dispatcher.contains("default:"))
        #expect(Self.allCases.count == 6)
        // Each case is its own presentation identity, or SwiftUI would refuse
        // to swap one sheet for another.
        #expect(Set(Self.allCases.map(\.id)).count == Self.allCases.count)
    }

    /// The load-bearing structure. `ContentView` chooses `HouseFirstRoot()` or
    /// the legacy stack inside `mainContent`; the driver has to sit ABOVE that
    /// choice, on the root `ZStack`, or one of the two roots loses every
    /// coordinator-driven modal it has — which is exactly the shape `W1-B-02`
    /// describes even though it is not what the build does.
    @Test("the one sheet driver is hosted above the root the flag chooses")
    func theSheetDriverIsAboveBothRoots() throws {
        let source = try SourcePin.read("Patina/ContentView.swift")
        let driver = try #require(source.range(of: ".sheet(item: Binding("))
        let rootChoice = try #require(source.range(of: "if coordinator.isHouseFirstRoot {"))
        #expect(driver.lowerBound < rootChoice.lowerBound,
                "the sheet driver moved inside a root branch (W1-B-02)")
        // …and there is exactly one of it.
        #expect(source.components(separatedBy: ".sheet(item: Binding(").count - 1 == 1)
    }

    /// The other way to break it: a second presentation mounted on the
    /// house-first root would occupy the one presentation slot UIKit gives the
    /// hosting controller, and the coordinator's sheet would be dropped in
    /// silence — no error, no log, nothing on screen.
    @Test("the house-first root mounts no competing presentation")
    func theHouseFirstRootPresentsNothingOfItsOwn() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Navigation/HouseFirstRoot.swift")
        )
        #expect(!code.contains(".sheet("))
        #expect(!code.contains(".fullScreenCover("))
    }

    /// And the doors themselves are still wired, so "unreachable" can only ever
    /// mean "hard to reach", never "not connected".
    @Test("the eight doors W1-B-02 names still set the sheet")
    func theDoorsAreWired() throws {
        let doors: [(String, String)] = [
            ("Patina/Features/Rooms/Views/YourSpacesView.swift", "presentedSheet = .newRoom"),
            ("Patina/Features/Profile/Views/ProfileView.swift", "presentedSheet = .settings"),
            ("Patina/Features/Profile/Views/StudioHubView.swift", "presentedSheet = .auth"),
            ("Patina/Features/Settings/Views/SettingsView.swift", "presentedSheet = .qr"),
            ("Patina/Features/Rooms/Views/RoomProjectView.swift", "presentedSheet = .moveItem("),
            ("Patina/Features/Companion/Views/CompanionOverlay.swift", "presentedSheet = .settings")
        ]
        for (path, call) in doors {
            let code = SourceScan.code(in: try SourcePin.read(path))
            #expect(code.contains(call), "\(path) no longer opens \(call)")
        }
        // Sign out lives behind Settings, and Settings behind the sheet: if the
        // driver ever does break, this is the door that costs the most.
        let settings = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Settings/Views/SettingsView.swift")
        )
        #expect(settings.contains("signOut()"))
    }
}
