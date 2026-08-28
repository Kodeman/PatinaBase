//
//  CompanionBarSlotTests.swift
//  PatinaTests
//
//  B-2: the collapsed Companion stops being a centered floating orb over
//  content and becomes the tab bar's trailing slot — same Strata mark, same
//  coaching phases, same rows, same panel, expanding from the bar.
//
//  Almost every pin here is a source pin, and deliberately so. `displayMode`,
//  the `.onChange` wiring and the panel's bottom lift are private computed
//  members of a SwiftUI `View`; there is no seam that renders them without a
//  host. What CAN be pinned is that the wiring exists, that it is wired in the
//  order that makes it safe, and — the half that matters most — that C8's
//  frozen surfaces did not move while it was being wired.
//

import Foundation
import SwiftUI
import Testing
@testable import Patina

@MainActor
struct CompanionBarSlotTests {

    private static let overlayPath = "Patina/Features/Companion/Views/CompanionOverlay.swift"
    private static let rootPath = "Patina/Features/Navigation/HouseFirstRoot.swift"

    // MARK: - The slot is the door

    @Test
    func theOverlayObservesTheFlagTheBarSlotWrites() throws {
        // N1 shipped the slot as a mark and NOT a control because
        // `toggleCompanion()` had no observer: the tap presented nothing while
        // `HouseFirstRoot`'s `.accessibilityHidden(isCompanionExpanded)` took
        // all four stacks out of the VoiceOver tree (`n1-notes.md` §2a, §4d).
        // This is the observer.
        let code = SourceScan.code(in: try SourcePin.read(Self.overlayPath))

        #expect(code.contains("onChange(of: coordinator.isCompanionExpanded)"))
        #expect(code.contains("expandToPanel()"))
        #expect(code.contains("collapseToButton()"))
    }

    @Test
    func theObserverCannotReEnterOnTheOverlaysOwnWrites() throws {
        // `expandToPanel()` sets `isCompanionExpanded = true` itself, so the
        // observer fires on the overlay's own write too. Both arms are guarded
        // on `state.isExpanded`, which has already moved by then, so the second
        // pass is a no-op instead of a loop.
        let source = try SourcePin.read(Self.overlayPath)
        guard let range = source.range(of: "onChange(of: coordinator.isCompanionExpanded)") else {
            Issue.record("the overlay does not observe the flag at all")
            return
        }
        let handler = String(source[range.lowerBound...].prefix(400))

        #expect(handler.contains("!state.isExpanded"))
        #expect(handler.contains("state.isExpanded"))
    }

    @Test
    func theBarsSlotIsAControlWithTheFifthVoiceOverName() throws {
        // M1 §6 names five VoiceOver labels for the bar: the four canonical
        // destinations and "Companion".
        let root = SourceScan.code(in: try SourcePin.read(Self.rootPath))

        #expect(root.contains("coordinator.toggleCompanion()"))
        #expect(root.contains(#".accessibilityLabel("Companion")"#))
        // M1 §6 again: the trailing slot is the Strata mark, not an icon.
        #expect(root.contains("StrataMarkView"))
    }

    // MARK: - The floating dock retires where the bar carries it

    @Test
    func theRestingDockIsHiddenOnTheHouseFirstRootOnly() throws {
        let code = SourceScan.code(in: try SourcePin.read(Self.overlayPath))

        #expect(
            code.contains("coordinator.isHouseFirstRoot, !state.isExpanded"),
            "the floating dock still draws over the bar on the house-first root"
        )
        // The retirement is gated on the root, so nothing about the flag-off
        // root's resting orb changed.
        #expect(code.contains("return .resting"))
    }

    @Test
    func theRetirementCannotSwallowTheExpandedPanel() throws {
        // Ordering pin: `.expanded` must resolve BEFORE the house-first
        // retirement, or expanding the panel from the bar returns `.hidden`
        // and the Companion is stranded with no door at all.
        let code = SourceScan.code(in: try SourcePin.read(Self.overlayPath))
        guard
            let expanded = code.range(of: "if state.isExpanded { return .expanded }"),
            let retired = code.range(of: "coordinator.isHouseFirstRoot, !state.isExpanded")
        else {
            Issue.record("displayMode no longer carries both branches")
            return
        }

        #expect(expanded.lowerBound < retired.lowerBound)
    }

    @Test
    func theExpandedPanelClearsTheBarRatherThanSittingUnderIt() throws {
        // `CompanionOverlay` is a sibling of the four stacks, not a child of
        // the bar's `safeAreaInset`, so it does not inherit the bar's height.
        // Without this lift the panel's bottom edge is 83 pt under the bar.
        let code = SourceScan.code(in: try SourcePin.read(Self.overlayPath))

        #expect(code.contains("PatinaTabBar<EmptyView>.itemHeight"))
    }

    @Test
    func theHearthYieldPolicyRetiresWithTheDockItWasWrittenFor() throws {
        // `n1-notes.md` §2b: the one-argument form keeps every W1b caller's
        // answer; the overlay is the one caller that knows which root it is on.
        let code = SourceScan.code(in: try SourcePin.read(Self.overlayPath))

        guard let call = code.range(of: "yieldsToPinnedFooter(") else {
            Issue.record("the overlay no longer consults the yield policy at all")
            return
        }
        #expect(String(code[call.lowerBound...].prefix(160)).contains("houseFirst: coordinator.isHouseFirstRoot"))
    }

    @Test
    func theBarSlotDoesNotReserveTheHearthAsWell() throws {
        // B-2: the 83 pt bar REPLACES the 120 pt Hearth. Reserving both would
        // put 203 pt of dead space under every screen on the flag-on root.
        let root = SourceScan.code(in: try SourcePin.read(Self.rootPath))

        #expect(!root.contains("companionHearthReservation"))
        #expect(!root.contains("companionSafeArea()"))
    }

    // MARK: - C8: what did NOT move

    @Test
    func handleIntentIsUnchanged() throws {
        // C8 freezes the Companion's routing door. N1 satisfied it structurally
        // (the tab layer resolves the tab; `handleIntent` still calls
        // `navigate(to:)`), and this lane must not undo that by editing it.
        let coordinator = try SourcePin.read("Patina/App/Coordinators/AppCoordinator.swift")

        #expect(coordinator.contains("func handleIntent("))
        #expect(coordinator.contains("func handleIntentWithResponse("))

        // And it still routes: an intent that names a tab-root destination
        // reaches it on the house-first root without the Companion knowing a
        // tab exists.
        let houseFirst = AppCoordinator(houseFirstRoot: true)
        houseFirst.handleIntent(.showRooms)
        #expect(houseFirst.tabs.selected == .spaces)

        let legacy = AppCoordinator(houseFirstRoot: false)
        legacy.handleIntent(.showRooms)
        #expect(legacy.currentScreen == .yourSpaces)
    }

    @Test
    func theCoachingPhasesAreUntouched() {
        // C8: three phases, and the mark attention each one carries. The phase
        // ladder is the thing the bar must not disturb — the model still lives
        // in `CompanionOverlay`, which is still mounted on both roots.
        let model = CompanionCoachingModel(defaults: Self.freshDefaults())
        #expect(model.phase == .new)
        #expect(model.markAttention == .full)

        model.recordPanelExpanded()
        #expect(model.phase == .learning)
        #expect(model.markAttention == .ambient)
    }

    @Test
    func theNextStepsCaptionStillDecaysWithTheMemoryItIsGiven() {
        // The caption's copy policy is `CompanionContextualCopy`, and it is
        // untouched: live Studio attention wins, then opted-in memory, then the
        // standing "Next steps". On the house-first root the caption simply has
        // no dock to draw under — the policy itself did not change.
        #expect(
            CompanionContextualCopy.collapsedHint(memory: nil, studioAttentionHint: nil)
                == "Next steps"
        )
        #expect(
            CompanionContextualCopy.collapsedHint(memory: nil, studioAttentionHint: "5 things need your eye")
                == "5 things need your eye"
        )
    }

    @Test
    func theMenuRowsKeepTheirW1bComposition() {
        // The ≤6-row cap and the row order are W1b's; this lane moved the mark,
        // not the menu. `CompanionActionMatrixTests` owns the exhaustive grid —
        // this is the one shape the bar's slot now opens onto.
        let context = CompanionContext(
            currentScreen: .heroFrame,
            tableItemCount: 3,
            roomCount: 2
        )

        let items = CompanionActionProvider.actions(
            for: .heroFrame,
            context: context,
            isAuthenticated: true
        )

        #expect(items.count <= 6)
        #expect(items.contains { $0.label == "Saved" })
    }

    // MARK: -

    private static func freshDefaults() -> UserDefaults {
        let suite = UserDefaults(suiteName: "CompanionBarSlotTests.\(UUID().uuidString)")!
        return suite
    }
}
