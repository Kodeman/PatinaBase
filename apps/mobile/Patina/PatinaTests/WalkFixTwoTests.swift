//
//  WalkFixTwoTests.swift
//  PatinaTests
//
//  The W1 acceptance walk's second fix round. One `@Test` per finding, so a
//  half-applied round cannot hide behind a sibling assertion.
//
//  Several of these are source pins rather than rendered assertions. That is
//  the honest bar for a SwiftUI layout rule the unit tier cannot render: where
//  a rule CAN be evaluated (a threshold, a copy string, a resolver) it is
//  called, and where it cannot the pin says what the file must contain and
//  names the shot the walk measured.
//

import Testing
import Foundation
import SwiftUI
import Supabase
@testable import Patina

@MainActor
struct WalkFixTwoTests {

    // MARK: - W1-B-03 · a decision with no options is not a missing button

    /// The fixture's overdue "Design Development sign-off — drawing set B"
    /// carries zero `client_decision_options` rows, so the detail drew nothing
    /// between the header and the two deferral acts and read as an approval
    /// screen whose approve control had gone missing (shots 20, 21).
    @Test("a decision with no options says so instead of drawing nothing")
    func aDecisionWithNoOptionsSaysSo() throws {
        let viewModel = DecisionDetailViewModel()
        viewModel.decision = try JSONDecoder().decode(
            RemoteClientDecision.self,
            from: Data("""
            { "id": "d-signoff", "title": "Design Development sign-off",
              "status": "pending", "decision_type": "approval",
              "created_at": "2026-08-30T12:00:00Z" }
            """.utf8)
        )
        viewModel.options = []
        viewModel.isLoading = false

        #expect(viewModel.hasNoOptionsAtAll)
        // …and it is not the SP-17 case, which is about options that render blank.
        #expect(!viewModel.hasNoRenderableOptions)
    }

    /// A screen still fetching must not assert emptiness — the same rule
    /// `R-01` applied to the Studio.
    @Test("the no-options line waits for the fetch")
    func theNoOptionsLineWaitsForTheFetch() {
        let viewModel = DecisionDetailViewModel()
        viewModel.isLoading = true
        #expect(!viewModel.hasNoOptionsAtAll, "a loading screen must claim nothing")

        viewModel.isLoading = false
        #expect(!viewModel.hasNoOptionsAtAll, "no decision means no claim either")
    }

    @Test("the detail renders the no-options line")
    func theDetailRendersTheNoOptionsLine() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Decisions/Views/DecisionDetailView.swift")
        )
        #expect(code.contains("viewModel.hasNoOptionsAtAll"))
        #expect(code.contains("DecisionOptionCopy.nothingToChooseYetLine"))
        #expect(code.contains("decisionDetail.noOptions"))
    }

    // MARK: - W1-B-08 · the two deferral acts stop abutting

    /// "Not yet" and "Neither of these" sat shoulder to shoulder with a 12 pt
    /// gutter; at accessibility sizes they read as one run of text and the tap
    /// targets touched, on both decision kinds (shots 20, 21, 22).
    @Test("the deferral pair stacks at accessibility sizes and has a real gutter below")
    func theDeferralPairDoesNotAbut() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Decisions/Views/DecisionDetailView.swift")
        )
        #expect(code.contains("if dynamicTypeSize.isAccessibilitySize {"),
                "the pair still shares one row at every text size (W1-B-08)")
        #expect(!code.contains("HStack(spacing: 12) {\n                    ForEach(DecisionDeferral"),
                "the 12 pt gutter is back")
        #expect(code.contains("private func deferralAct("),
                "the two branches must draw one control, not two copies")
    }

    // MARK: - W1-C-15 · the defer sheet's preview grows with its text

    @Test("the deferral note box rides the type ramp")
    func theDeferralNoteBoxScales() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Decisions/Views/DecisionDeferSheet.swift")
        )
        #expect(code.contains("@ScaledMetric"),
                "the note box is still a hard 120 pt while its text scales (W1-C-15)")
        #expect(code.contains("frame(minHeight: noteMinHeight)"))
    }

    // MARK: - W1-B-10 · the sign sheet's money figure

    /// `C-06` fixed the label column and the VALUE broke instead: at
    /// accessibility-extra-large TOTAL read "$18,500 / .00" — a contract's
    /// money figure split after the thousands group (shots 16, 17).
    @Test("the sign sheet’s value column holds one line")
    func theSignSheetValueHoldsOneLine() throws {
        let source = try SourcePin.read("Patina/Features/Proposals/Views/ProposalSignSheet.swift")
        let block = try #require(source.range(of: "Text(line.value)"))
        let after = String(source[block.lowerBound...].prefix(400))
        #expect(after.contains(".lineLimit(1)"))
        #expect(after.contains(".minimumScaleFactor("))
        #expect(after.contains(".allowsTightening(true)"))
    }

    // MARK: - W1-C-05 · the piece detail's primary CTA

    /// "Ask Leah to sour…" in a 144.33 × 52 frame at XXXL (shot 11); the full
    /// string survived only in the AX label.
    @Test("the purchase bar stacks its actions above xxLarge")
    func thePurchaseBarStacksAtLargeType() {
        #expect(!PurchaseActionBar.stacksActions(at: .large))
        #expect(!PurchaseActionBar.stacksActions(at: .xLarge))
        #expect(PurchaseActionBar.stacksActions(at: .xxLarge))
        #expect(PurchaseActionBar.stacksActions(at: .xxxLarge))
        #expect(PurchaseActionBar.stacksActions(at: .accessibility3))
    }

    @Test("the primary label may take two lines and scale")
    func thePrimaryLabelWraps() throws {
        let source = try SourcePin.read("Patina/Features/Purchase/PurchaseActionBar.swift")
        let block = try #require(source.range(of: "Text(act.primaryLabel)"))
        let after = String(source[block.lowerBound...].prefix(400))
        #expect(after.contains(".lineLimit(2)"))
        #expect(after.contains(".minimumScaleFactor(0.6)"))
    }

    // MARK: - W1-C-04 · the Pieces grid's match pill

    /// At XXXL the pill clipped to "Good matc" with the favourite heart drawn
    /// on top of it; at AX3XL it overflowed the card entirely. The badge and
    /// the two chrome buttons were independent overlays in one ZStack.
    @Test("the match pill and the card chrome share one row")
    func theMatchPillHasItsOwnLane() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Recommendations/Views/RecommendationsView.swift")
        )
        let row = try #require(code.range(of: "HStack(alignment: .top, spacing: 6) {"))
        let block = String(code[row.lowerBound...].prefix(900))
        // `W1-S-01` put the pill behind `matchVerdict` — an unscored piece
        // wears no badge — so the row's first member is the unwrapped verdict.
        #expect(block.contains("if let verdict = product.matchVerdict"))
        #expect(block.contains("Text(verdict)"))
        #expect(block.contains("saveButton(product)"))
        #expect(block.contains("menuButton(product)"))
        #expect(block.contains(".minimumScaleFactor(0.5)"),
                "the pill still clips rather than scaling (W1-C-04)")
    }

    // MARK: - W1-C-03 · the Companion headline

    /// The AX branch already gave the title a full-width row and it STILL broke
    /// mid-word at AX3XL — "Want a recommendati / on?" (shot 50). Unbounded
    /// wrapping makes `minimumScaleFactor` inert.
    @Test("the Companion title has a line ceiling, so its scale factor engages")
    func theCompanionTitleCannotBreakMidWord() throws {
        let source = try SourcePin.read(
            "Patina/Features/Companion/Components/CompanionHearthView.swift"
        )
        let block = try #require(source.range(of: "Text(content.title)"))
        let after = String(source[block.lowerBound...].prefix(400))
        #expect(after.contains(".lineLimit(3)"),
                "without a line ceiling SwiftUI wraps first and never scales (W1-C-03)")
        #expect(after.contains(".minimumScaleFactor(0.5)"))
    }

    // MARK: - W1-C-08 · the Settings notifications row

    /// `P-07` moved the read into `NotificationsRowModel`, which the row now
    /// asks — the pin follows it there rather than going green on a row that
    /// binds a local bool again.
    @Test("the Settings notifications row reads iOS authorization")
    func settingsReadsNotificationAuthorization() throws {
        let model = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Settings/NotificationsRowModel.swift")
        )
        #expect(model.contains("notificationSettings().authorizationStatus"),
                "the row still binds a local bool alone (W1-C-08)")
        #expect(model.contains("PushTokenService.outcome(for: status)"),
                "the denied rule must be the one C2-09's primer uses")

        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Settings/Views/SettingsView.swift")
        )
        #expect(code.contains("notificationsAuthorization.refresh()"))
        #expect(code.contains("notificationsAuthorization.state == .denied"))
        #expect(code.contains("SettingsView.NotificationsDenied"))
    }

    // MARK: - W1-C-09 · a sign-out that worked says nothing

    /// The Welcome screen showed "Something went wrong on our side." after a
    /// successful sign-out (shots 97, A6), and because `AuthStatusSlot` ranks
    /// `errorMessage` above `pendingLinkNotice` that banner also occupied the
    /// slot `C2-21`'s notice needs.
    @Test("a throw with no session left is a sign-out, not a failure")
    func aSignOutWithNoSessionLeftIsSilent() {
        #expect(AuthService.signOutOutcome(sessionRemains: false) == .signedOut)
        #expect(AuthService.signOutOutcome(sessionRemains: true) == .failed)
    }

    @Test("signOut asks what happened before it says anything")
    func signOutChecksBeforeItSpeaks() throws {
        let source = try SourcePin.read("Patina/Services/Auth/AuthService.swift")
        let start = try #require(source.range(of: "public func signOut() async throws"))
        let block = String(source[start.upperBound...].prefix(1800))
        let check = try #require(block.range(of: "Self.signOutOutcome(sessionRemains:"))
        let setError = try #require(block.range(of: "setError(Self.authErrorSentence(error), scope: .root)"))
        #expect(check.lowerBound < setError.lowerBound,
                "the banner is still raised before anything asks whether the session survived")
    }

    // MARK: - W1-C-10 · --resetonboarding actually resets

    /// The flag cleared three `AppSettings` booleans and nothing else, so
    /// neither the intro carousel nor the first-launch tour could be replayed
    /// and walker C had to delete defaults by hand to reach the tour.
    @Test("--resetonboarding clears the account record and the tour state")
    func resetOnboardingClearsEverythingThatGatesIt() throws {
        let code = SourceScan.code(in: try SourcePin.read("Patina/PatinaApp.swift"))
        let start = try #require(code.range(of: "if Self.shouldResetOnboarding {"))
        let block = String(code[start.upperBound...].prefix(400))
        #expect(block.contains("OnboardingCompletion.shared.forgetAll()"),
                "patina.onboarding.completedUserIds.v1 still survives the flag (W1-C-10)")
        #expect(block.contains("forgetAllFirstLaunchTourState()"),
                "help-system.tour.* still survives the flag (W1-C-10)")
    }

    @Test("the tour-state sweep clears every key under its prefix")
    func theTourSweepClearsThePrefix() {
        let suite = UserDefaults(suiteName: "patina.tests.tour.\(UUID().uuidString)")!
        suite.set(Data("{}".utf8), forKey: firstLaunchTourStateStoragePrefix + "home-v1")
        suite.set(Data("{}".utf8), forKey: firstLaunchTourStateStoragePrefix + "other-v2")
        suite.set("keep", forKey: "patina.unrelated.key")

        forgetAllFirstLaunchTourState(suite)

        #expect(suite.data(forKey: firstLaunchTourStateStoragePrefix + "home-v1") == nil)
        #expect(suite.data(forKey: firstLaunchTourStateStoragePrefix + "other-v2") == nil)
        #expect(suite.string(forKey: "patina.unrelated.key") == "keep",
                "the sweep reached past its own prefix")
    }

    // MARK: - W1-C-12 · one spelling for the piece path

    /// AASA publishes `/piece/*` and client-portal serves `/piece`; the app
    /// also accepted `/pieces/*`, a path no producer writes and no page serves,
    /// so a `/pieces/<id>` link fell through to Safari.
    @Test("the app claims exactly the piece path the association publishes")
    func thePiecePathHasOneSpelling() throws {
        let host = PatinaDeepLinks.clientHost
        let singular = try #require(URL(string: "https://\(host)/piece/abc-123"))
        #expect(DeepLinkHandler.route(forUniversalLink: singular) == .pieceDetail(pieceId: "abc-123"))

        let plural = try #require(URL(string: "https://\(host)/pieces/abc-123"))
        #expect(DeepLinkHandler.route(forUniversalLink: plural) == nil,
                "the app still claims a path the AASA does not publish (W1-C-12)")
    }

    // MARK: - W1-B-06 · one provenance story per room

    /// The same Guest Bedroom read "180 SQ FT · TYPED, NOT SCANNED" in Your
    /// Spaces and "SCANNED SEP 3" on the Studio's room card (shots 04 vs 08),
    /// and Room Settings headed its block "Scan Data" with "2 windows
    /// detected" for dimensions the person typed.
    @Test("one source decides whether a room was scanned")
    func provenanceHasOneSource() {
        let typed = RoomModel(name: "Guest Bedroom", roomType: "bedroom", hasBeenScanned: false)
        let scanned = RoomModel(name: "Living Room", roomType: "living", hasBeenScanned: true)
        let formatter = DateFormatter()
        formatter.dateFormat = "MMM d"
        let day = Date(timeIntervalSince1970: 1_756_900_000)

        #expect(typed.provenanceLine() == "Typed, not scanned")
        #expect(typed.provenanceLine(on: day, formattedBy: formatter) == "Typed, not scanned",
                "a date must not turn a typed room into a scanned one (W1-B-06)")
        #expect(scanned.provenanceLine() == "Scanned")
        #expect(scanned.provenanceLine(on: day, formattedBy: formatter).hasPrefix("Scanned "))
    }

    @Test("all three surfaces read that one source")
    func everySurfaceReadsTheOneSource() throws {
        for path in [
            "Patina/Features/Profile/Views/ProfileView.swift",
            "Patina/Features/Home/Views/RoomHeroCard.swift",
            "Patina/Features/Rooms/Views/RoomProjectView.swift"
        ] {
            let code = SourceScan.code(in: try SourcePin.read(path))
            #expect(code.contains("provenanceLine("), "\(path) still decides provenance for itself")
        }
        let settings = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Rooms/Views/RoomSettingsView.swift")
        )
        #expect(settings.contains("room.hasBeenScanned ? \"Scan Data\" : \"Room measurements\""),
                "Room Settings still calls typed dimensions Scan Data (W1-B-06)")
        #expect(!settings.contains("windows detected\")"),
                "\"detected\" is still unconditional (W1-B-06)")
    }
}

// MARK: - W1-C-10 · the half of `--resetonboarding` that is not on this device

/// `WalkFixTwoTests` closed the local half of the flag; walker C's re-walk 2
/// found the residual and located it exactly: the tour ran on the very next
/// launch after `profiles.help_state` was set to `{}` by hand on the local
/// stack (shots 55, 56), having refused to replay twice with the flag alone
/// (52, 54). `forgetAllFirstLaunchTourState()` walks UserDefaults, and the
/// tour's v2 backing is a Supabase column.
@MainActor
struct ResetOnboardingReachesTheServerTests {

    private func makeAdapter() -> SupabaseHelpStateAdapter {
        SupabaseHelpStateAdapter(
            // Nothing is expected to answer: `performSave` logs and drops on
            // failure by design (spec §13.4), and every read under test is
            // against the in-memory cache.
            client: SupabaseClient(
                supabaseURL: URL(string: "http://127.0.0.1:1")!,
                supabaseKey: "test-anon-key"
            ),
            userId: "00000000-0000-0000-0000-0000000000aa"
        )
    }

    @Test("forgetting the tours empties the blob's tour entries")
    func forgettingTheToursEmptiesThem() async {
        let adapter = makeAdapter()
        await adapter.setTourEntry(
            FirstLaunchTourModel.defaultTourKey,
            patch: HelpStateBlob.TourEntry(launched: true)
        )
        #expect(await adapter.cachedTourEntry(FirstLaunchTourModel.defaultTourKey) != nil)

        await adapter.forgetAllTours()

        #expect(
            await adapter.cachedTourEntry(FirstLaunchTourModel.defaultTourKey) == nil,
            "the hydrated `launched: true` survives --resetonboarding (W1-C-10)"
        )
    }

    @Test("and leaves the feature announcements alone")
    func forgettingTheToursLeavesAnnouncements() async {
        let adapter = makeAdapter()
        await adapter.setFeatureAnnouncement(
            "spaces-tab",
            patch: HelpStateBlob.FeatureAnnouncementEntry(dismissedAt: "2026-09-01T00:00:00Z")
        )
        await adapter.setTourEntry(
            FirstLaunchTourModel.defaultTourKey,
            patch: HelpStateBlob.TourEntry(completed: true)
        )

        await adapter.forgetAllTours()

        #expect(await adapter.cachedTourEntry(FirstLaunchTourModel.defaultTourKey) == nil)
        #expect(
            await adapter.cachedFeatureAnnouncement("spaces-tab") != nil,
            "the flag is named for onboarding; announcements are not it"
        )
    }

    /// This test host launches without the flag, so the ask is absent and
    /// nothing is cleared — which is the case every real launch takes.
    @Test("a launch that did not ask clears nothing")
    func aLaunchWithoutTheFlagClearsNothing() {
        #expect(FirstLaunchTourLaunchReset.isRequested == false)
        #expect(FirstLaunchTourLaunchReset.consume() == false)
    }

    /// The wiring, in the order it has to run: hydrate, clear, then hand the
    /// adapter to the model. Clearing after `enableSupabaseSync` would race the
    /// model's own first read, and clearing before `loadState()` would be
    /// overwritten by the merge.
    @Test("the adapter install clears the server copy between hydrate and hand-off")
    func theInstallClearsBetweenHydrateAndHandOff() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Help/FirstLaunchTour.swift")
        )
        let hydrate = try #require(code.range(of: "await adapter.loadState()"))
        let clear = try #require(code.range(of: "await adapter.forgetAllTours()"))
        let handOff = try #require(code.range(of: "model.enableSupabaseSync(adapter: adapter)"))
        #expect(hydrate.lowerBound < clear.lowerBound)
        #expect(clear.lowerBound < handOff.lowerBound)
        #expect(code.contains("if FirstLaunchTourLaunchReset.consume()"))
    }

    /// Spent once per process: the install runs from a `.task(id: canAutoStart)`
    /// that re-fires whenever Today comes back on screen, and a second clear
    /// would erase a `completed` this same launch had just recorded.
    @Test("the ask is spent once, and reads the same flag the local clear does")
    func theAskIsSpentOnce() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Help/FirstLaunchTour.swift")
        )
        #expect(code.contains("private static var isSpent = false"))
        #expect(code.contains("guard isRequested, !isSpent else { return false }"))
        #expect(code.contains("static var isRequested: Bool { PatinaApp.shouldResetOnboarding }"),
                "the two halves of the flag can now be spelled differently (W1-C-10)")
    }
}
