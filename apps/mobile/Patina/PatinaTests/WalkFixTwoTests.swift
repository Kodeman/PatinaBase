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
        #expect(block.contains("Text(product.matchLabel)"))
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

    @Test("the Settings notifications row reads iOS authorization")
    func settingsReadsNotificationAuthorization() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Settings/Views/SettingsView.swift")
        )
        #expect(code.contains("notificationSettings().authorizationStatus"),
                "the row still binds a local bool alone (W1-C-08)")
        #expect(code.contains("PushTokenService.outcome(for: status) == .denied"),
                "the denied rule must be the one C2-09's primer uses")
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
