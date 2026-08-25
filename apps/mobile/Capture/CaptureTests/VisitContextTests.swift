//  VisitContextTests.swift
//  CaptureTests
//
//  The visit spine (Field Companion wave 3, packages 3-2). Patina Field is not
//  live anywhere, so there is deliberately NO legacy-decode test here.

import Foundation
import Testing
@testable import CaptureKit

struct VisitContextTests {

    private let identity = CaptureSessionIdentity(userID: "u1", workspaceID: "w1")
    private let now = Date(timeIntervalSince1970: 1_800_000_000)

    @Test func aContextWithNoKindIsNotAVisit() {
        let context = CaptureSessionContext(identity: identity, startedAt: now, lastActivityAt: now)
        #expect(context.kind == nil)
        #expect(!context.isVisit)
    }

    @Test func aKindedContextIsAVisitUntilItEnds() {
        var context = CaptureSessionContext(identity: identity, startedAt: now,
                                            lastActivityAt: now, kind: .site,
                                            kit: .walkThrough, label: "Maple St")
        #expect(context.isVisit)
        context.endedAt = now.addingTimeInterval(600)
        #expect(!context.isVisit)
    }

    @Test func theVisitRoundTripsThroughCodable() throws {
        let context = CaptureSessionContext(
            identity: identity, startedAt: now, lastActivityAt: now,
            kind: .sourcing, kit: .install, label: "High Point 214",
            scanRoomID: "r1", projectsInMind: ["p1", "p2"], endedAt: nil)
        let data = try JSONEncoder().encode(context)
        let decoded = try JSONDecoder().decode(CaptureSessionContext.self, from: data)
        #expect(decoded == context)
        #expect(decoded.kit == .install)
        #expect(decoded.kit?.rawValue == "install")
    }

    @Test func kitRawValuesAreTheSchemaVocabulary() {
        #expect(FieldVisitKit.walkThrough.rawValue == "walk_through")
        #expect(FieldVisitKit.tradeWalk.rawValue == "trade_walk")
        #expect(FieldVisitKit.install.rawValue == "install")
        #expect(FieldVisitKind.allCases.map(\.rawValue) == ["site", "sourcing"])
    }

    private func visit(startedAt: Date, lastActivityAt: Date,
                       endedAt: Date? = nil) -> CaptureSessionContext {
        CaptureSessionContext(identity: identity, startedAt: startedAt,
                              lastActivityAt: lastActivityAt, kind: .site,
                              label: "Maple St", endedAt: endedAt)
    }

    /// PINNED, in every visit-state test. `now` is 1_800_000_000 =
    /// 2027-01-15T08:00:00Z; `.current` would put a 30-minute-old
    /// `lastActivityAt` on Jan 14 in US Pacific, where the
    /// never-across-a-calendar-day rule fires first and the state reads `.none`
    /// instead of `.stale`. The rule under test is a calendar rule, so the
    /// calendar is an input, never an ambient.
    private var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "America/Chicago")!
        return calendar
    }

    @Test func aFreshVisitIsActive() {
        // Bind ONCE. `visitID` defaults to `UUID()` (CaptureSessionContext.swift:57)
        // and `CaptureSessionContext` is Equatable over every stored property, so
        // two `visit(…)` calls can never compare equal.
        let context = visit(startedAt: now, lastActivityAt: now.addingTimeInterval(-60))
        let state = CaptureSessionContextPolicy.visitState(
            for: context, now: now, calendar: calendar)
        #expect(state == .active(context))
    }

    @Test func pastThirtyMinutesTheVisitGoesStaleNotAway() {
        let last = now.addingTimeInterval(-(CaptureSessionContextPolicy.staleConfirmWindow + 60))
        let context = visit(startedAt: last, lastActivityAt: last)
        let state = CaptureSessionContextPolicy.visitState(
            for: context, now: now, calendar: calendar)
        #expect(state == .stale(context))
    }

    @Test func pastTwelveHoursTheVisitAutoEnds() throws {
        // A LOCAL `now` at 20:00 Chicago. The shared `now` is 02:00 Chicago, so
        // ANY 12-hour-old fixture measured from it lands on the previous day and
        // the calendar-day guard returns `.none` first — delete the auto-end
        // guard entirely and such a test stays green, asserting nothing. From
        // 20:00 both fixtures below sit on the same Chicago day, so the auto-end
        // guard is the only rule that can separate them.
        let evening = try #require(calendar.date(from: DateComponents(
            year: 2027, month: 1, day: 15, hour: 20, minute: 0, second: 0)))
        let dead = evening.addingTimeInterval(-(CaptureSessionContextPolicy.autoEndWindow + 60))
        let alive = evening.addingTimeInterval(-(CaptureSessionContextPolicy.autoEndWindow - 60))
        #expect(calendar.isDate(dead, inSameDayAs: evening))
        #expect(calendar.isDate(alive, inSameDayAs: evening))

        #expect(CaptureSessionContextPolicy.visitState(
            for: visit(startedAt: dead, lastActivityAt: dead),
            now: evening, calendar: calendar) == .none)

        // Its sibling one minute inside the window is stale, not gone.
        let context = visit(startedAt: alive, lastActivityAt: alive)
        #expect(CaptureSessionContextPolicy.visitState(
            for: context, now: evening, calendar: calendar) == .stale(context))
    }

    @Test func aVisitNeverResumesAcrossACalendarDay() {
        let yesterday = calendar.date(byAdding: .day, value: -1, to: now)!
        // Inside both windows, but a different calendar day.
        let state = CaptureSessionContextPolicy.visitState(
            for: visit(startedAt: yesterday, lastActivityAt: now.addingTimeInterval(-60)),
            now: now, calendar: calendar)
        #expect(state == .none)
    }

    @Test func anEndedVisitReadsAsNone() {
        let state = CaptureSessionContextPolicy.visitState(
            for: visit(startedAt: now, lastActivityAt: now, endedAt: now),
            now: now, calendar: calendar)
        #expect(state == .none)
    }

    @Test func aBackwardsClockClosesTheVisitRatherThanTrustingIt() {
        // now < lastActivityAt: a manual clock change, or a DST/NTP correction.
        // Inherited from CaptureSessionContextPolicy.resolve
        // (CaptureSessionContext.swift:82). R3-1 frames a WRONG visit as the
        // systematic error, so refusing to resume is the safe branch — but it
        // silently drops an open visit, which is worth an explicit test.
        let state = CaptureSessionContextPolicy.visitState(
            for: visit(startedAt: now, lastActivityAt: now.addingTimeInterval(600)),
            now: now, calendar: calendar)
        #expect(state == .none)
    }

    @Test func endVisitActuallyEndsTheVisit() {
        let context = visit(startedAt: now.addingTimeInterval(-3600), lastActivityAt: now)
        let ended = CaptureSessionContextPolicy.ended(context, now: now)
        #expect(ended.visitID == context.visitID)   // the SAME visit, closed
        #expect(ended.endedAt == now)
        #expect(!ended.isVisit)
    }

    @Test func startingAVisitCarriesBothRoomLanesWithoutCrossing() {
        let draft = CaptureVisitDraft(kind: .site, kit: .walkThrough, label: "Maple St",
                                      projectID: "p1", projectName: "Maple St",
                                      projectRoomID: "project-room-1",
                                      scanRoomID: "scan-room-1", room: "Living")
        let context = CaptureSessionContextPolicy.started(draft, identity: identity, now: now)
        #expect(context.routing.projectRoomID == "project-room-1")
        #expect(context.scanRoomID == "scan-room-1")
        #expect(context.routing.projectID == "p1")
        #expect(context.routing.room == "Living")
        #expect(context.label == "Maple St")
        #expect(context.kit == .walkThrough)
        // FC-R6: a site visit routes to the inbox, a sourcing run to the library.
        #expect(context.routing.destination == .inbox)
        #expect(context.isVisit)
    }

    @Test func theKitCarriesTheConsentDefault() {
        #expect(CaptureVisitDraft(kind: .site, kit: .walkThrough).defaultNoteSetting == .conversation)
        #expect(CaptureVisitDraft(kind: .site, kit: .tradeWalk).defaultNoteSetting == .solo)
        #expect(CaptureVisitDraft(kind: .site, kit: .install).defaultNoteSetting == .solo)
        #expect(CaptureVisitDraft(kind: .site).defaultNoteSetting == .solo)
        #expect(CaptureVisitDraft(kind: .sourcing).defaultNoteSetting == .solo)
    }

    @Test func projectsInMindAreCappedAtFour() {
        let draft = CaptureVisitDraft(kind: .sourcing, label: "High Point 214",
                                      projectsInMind: ["a", "b", "c", "d", "e"])
        let context = CaptureSessionContextPolicy.started(draft, identity: identity, now: now)
        #expect(context.projectsInMind == ["a", "b", "c", "d"])
        #expect(context.label == "High Point 214")
        #expect(context.routing.destination == .library)
    }

    // MARK: - resolve: the visit's rules outrank the 4-hour routing window

    @Test func resolveDoesNotBringYesterdaysVisitBackButKeepsTheRouting() {
        // 23:00 last night, resolved at 02:00: inside the 4-hour window, across a
        // calendar day. `current` PERSISTS what `resolve` returns, so before this
        // rule the capture kept yesterday's visitID (ViewfinderModel mints
        // sessionID from it) and refreshed its lastActivityAt, which is the clock
        // the 12-hour auto-end reads.
        let lastNight = now.addingTimeInterval(-3 * 60 * 60)
        let routing = CaptureRoutingMemory(
            destination: .inbox, projectID: "p1", projectName: "Maple St",
            projectRoomID: "project-room-1", room: "Living")
        let stored = CaptureSessionContext(
            identity: identity, startedAt: lastNight, lastActivityAt: lastNight,
            routing: routing, kind: .site, kit: .walkThrough, label: "Maple St",
            scanRoomID: "scan-room-1", projectsInMind: ["p1"])

        let resolved = CaptureSessionContextPolicy.resolve(
            existing: stored, identity: identity, now: now, calendar: calendar)

        #expect(resolved.visitID != stored.visitID)
        #expect(resolved.startedAt == now)
        #expect(resolved.lastActivityAt == now)
        #expect(resolved.kind == nil)
        #expect(resolved.kit == nil)
        #expect(resolved.label == nil)
        #expect(resolved.scanRoomID == nil)
        #expect(resolved.projectsInMind.isEmpty)
        #expect(!resolved.isVisit)
        // Routing memory has always been day-agnostic; it survives.
        #expect(resolved.routing == routing)
    }

    @Test func resolveStillResumesTodaysVisit() {
        let earlier = now.addingTimeInterval(-600)
        let stored = visit(startedAt: earlier, lastActivityAt: earlier)

        let resolved = CaptureSessionContextPolicy.resolve(
            existing: stored, identity: identity, now: now, calendar: calendar)

        #expect(resolved.visitID == stored.visitID)
        #expect(resolved.kind == .site)
        #expect(resolved.label == "Maple St")
        #expect(resolved.lastActivityAt == now)
    }

    // MARK: - the store, on CaptureLifecycleTests' UserDefaults-injection pattern

    @Test @MainActor func endVisitClosesTheSameVisitRatherThanReplacingIt() throws {
        let suite = "visit-context-tests-\(UUID().uuidString)"
        let defaults = try #require(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let store = CaptureSessionContextStore(defaults: defaults, key: "context")
        let closingTime = now.addingTimeInterval(3600)

        let open = store.startVisit(
            CaptureVisitDraft(kind: .site, kit: .walkThrough, label: "Maple St"),
            identity: identity, now: now)
        let closed = store.endVisit(identity: identity, now: closingTime)

        #expect(closed.visitID == open.visitID)
        #expect(closed.endedAt == closingTime)
        #expect(!closed.isVisit)
        #expect(store.visitState(identity: identity, now: closingTime,
                                 calendar: calendar) == .none)

        // A second "End visit" tap leaves the closed record readable.
        let again = store.endVisit(identity: identity, now: now.addingTimeInterval(7200))
        #expect(again == closed)
    }

    @Test @MainActor func endVisitWithNothingOpenMintsAKindlessContext() throws {
        let suite = "visit-context-tests-\(UUID().uuidString)"
        let defaults = try #require(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let store = CaptureSessionContextStore(defaults: defaults, key: "context")

        let fresh = store.endVisit(identity: identity, now: now)

        #expect(fresh.kind == nil)
        #expect(fresh.endedAt == nil)
        #expect(!fresh.isVisit)
        #expect(store.visitState(identity: identity, now: now, calendar: calendar) == .none)
    }

    @Test @MainActor func startVisitPersistsAVisitTheStoreReadsBackAsActive() throws {
        let suite = "visit-context-tests-\(UUID().uuidString)"
        let defaults = try #require(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let store = CaptureSessionContextStore(defaults: defaults, key: "context")

        let started = store.startVisit(
            CaptureVisitDraft(kind: .sourcing, label: "High Point 214",
                              projectsInMind: ["p1", "p2"]),
            identity: identity, now: now)
        let state = store.visitState(identity: identity, now: now.addingTimeInterval(60),
                                     calendar: calendar)

        #expect(state == .active(started))
        #expect(state.context?.label == "High Point 214")
        #expect(state.isVisit)

        // A stranger's device reads nothing of hers.
        let other = CaptureSessionIdentity(userID: "u2", workspaceID: "w1")
        #expect(store.visitState(identity: other, now: now, calendar: calendar) == .none)
    }

    // MARK: - The capture inherits the visit (task 7)

    @MainActor
    @Test func aDraftInheritsTheVisitOnBothLanes() throws {
        let store = try CaptureStore.inMemory()
        let draft = CaptureVisitDraft(kind: .site, kit: .walkThrough, label: "Maple St",
                                      projectID: "p1", projectName: "Maple St",
                                      projectRoomID: "sr1", scanRoomID: "r1", room: "Living")
        let context = CaptureSessionContextPolicy.started(draft, identity: identity, now: now)

        let specimen = store.newDraft(sessionID: context.visitID)
        specimen.venue = context.routing.stamped(onto: specimen.venue ?? VenueStamp())
        specimen.inherit(context)
        try store.save()

        #expect(specimen.captureSessionID == context.visitID)
        #expect(specimen.venue?.projectId == "p1")
        #expect(specimen.venue?.projectRoomId == "sr1")   // project_rooms lane only
        #expect(specimen.venue?.room == "Living")
        #expect(specimen.visitKind == .site)
        #expect(specimen.visitKit == .walkThrough)
        #expect(specimen.visitLabel == "Maple St")
        #expect(specimen.visitStartedAt == now)
        #expect(specimen.noteSetting == .conversation)
        #expect(!specimen.isUnplaced)
    }

    @MainActor
    @Test func aCaptureWithNoVisitIsUnplacedAndCarriesNoVisitFacts() throws {
        let store = try CaptureStore.inMemory()
        let context = CaptureSessionContext(identity: identity, startedAt: now, lastActivityAt: now)
        let specimen = store.newDraft(sessionID: context.visitID)
        // Seeded, not fresh: a fresh draft is already nil on every visit field,
        // so asserting nil on one would pass with `inherit` as an empty body.
        // Starting from a specimen that CARRIES a visit pins the clearing.
        specimen.visitKind = .site
        specimen.visitKit = .install
        specimen.visitLabel = "Maple St"
        specimen.visitStartedAt = now.addingTimeInterval(-3600)
        specimen.visitEndedAt = now.addingTimeInterval(-600)
        specimen.inherit(context)
        try store.save()

        #expect(specimen.isUnplaced)
        #expect(specimen.visitKind == nil)
        #expect(specimen.visitKit == nil)
        #expect(specimen.visitLabel == nil)
        // The kind-guard in `inherit`: a kindless context must not ship a start
        // time. A row with visit_started_at set and visit_kind NULL claims a
        // visit that never happened.
        #expect(specimen.visitStartedAt == nil)
        #expect(specimen.visitEndedAt == nil)
        #expect(specimen.venue?.projectId == nil)
    }

    /// FC-R6 (Ruling 3): the unplaced set INCLUDES committed rows. PLACEMENT is
    /// the only thing that clears `isUnplaced` — sync state never enters it, so
    /// a capture that reached the server hours ago with no project still waits
    /// on Today until she files it.
    @MainActor
    @Test func aCommittedCaptureWithNoProjectIsStillUnplaced() throws {
        let store = try CaptureStore.inMemory()
        let specimen = store.newDraft()
        specimen.status = .committed
        specimen.remoteId = "fc_1"
        try store.save()

        #expect(specimen.isUnplaced)
        #expect(specimen.hasConfirmedCaptureReceipt)
    }

    // MARK: - The launch table (task 16, spec §5.3 / FC-R1)

    @Test func theLaunchTableIsExactlyTheFourRowsInTheSpec() {
        let active = CaptureVisitState.active(
            visit(startedAt: now, lastActivityAt: now))
        let stale = CaptureVisitState.stale(
            visit(startedAt: now, lastActivityAt: now.addingTimeInterval(-3600)))

        #expect(FieldLaunchPolicy.destination(visitState: active,
                                              deepLinkedToCapture: false) == .viewfinder)
        #expect(FieldLaunchPolicy.destination(visitState: stale,
                                              deepLinkedToCapture: false) == .today)
        #expect(FieldLaunchPolicy.destination(visitState: .none,
                                              deepLinkedToCapture: false) == .today)
        #expect(FieldLaunchPolicy.destination(visitState: .none,
                                              deepLinkedToCapture: true) == .viewfinderUnplaced)
        #expect(FieldLaunchPolicy.destination(visitState: active,
                                              deepLinkedToCapture: true) == .viewfinder)
        // The one crossing the four rows do not name, pinned deliberately
        // (R109). Spec §5.3 row 4 reads "using the open visit", and a STALE
        // visit is open — but a stale visit is the one she is being asked to
        // confirm, so the deep link lands her on C1 unplaced rather than
        // stamping captures with a visit she has not vouched for. Flipping this
        // is a product decision, not a tidy-up.
        #expect(FieldLaunchPolicy.destination(visitState: stale,
                                              deepLinkedToCapture: true) == .viewfinderUnplaced)
    }

    @Test func flippingFCR1BackToCameraFirstNeedsOneFlag() {
        // PASSED, never mutated. `theLaunchTableIsExactlyTheFourRowsInTheSpec`
        // reads the same policy from the same non-@MainActor suite, and Swift
        // Testing runs tests in parallel by default.
        #expect(FieldLaunchPolicy.destination(visitState: .none,
                                              deepLinkedToCapture: false,
                                              todayIsHome: false) == .viewfinderUnplaced)
        #expect(FieldLaunchPolicy.destination(
            visitState: .stale(visit(startedAt: now,
                                     lastActivityAt: now.addingTimeInterval(-3600))),
            deepLinkedToCapture: false,
            todayIsHome: false) == .viewfinderUnplaced)
        // And the shipped default is still Today (FC-R1(a)).
        #expect(FieldLaunchPolicy.todayIsHome)
        #expect(FieldLaunchPolicy.destination(visitState: .none,
                                              deepLinkedToCapture: false) == .today)
    }

    @Test func destinationsCarryTheirRealm() {
        #expect(FieldLaunchDestination.today.realm == .work)
        #expect(FieldLaunchDestination.viewfinder.realm == .camera)
        #expect(FieldLaunchDestination.viewfinderUnplaced.realm == .camera)
    }

    /// An OPEN visit wins over Today whichever door she came through, and it is
    /// the live visit that wins: `.active` outranks both `todayIsHome` and the
    /// deep link, while a visit the day rule or the 12-hour rule already killed
    /// reads `.none` here and lands her on Today.
    @Test func anActiveVisitOutranksTodayFromEveryDoor() {
        let live = visit(startedAt: now, lastActivityAt: now)
        #expect(FieldLaunchPolicy.destination(visitState: .active(live),
                                              deepLinkedToCapture: false,
                                              todayIsHome: true) == .viewfinder)
        #expect(FieldLaunchPolicy.destination(visitState: .active(live),
                                              deepLinkedToCapture: true,
                                              todayIsHome: false) == .viewfinder)

        // Yesterday's visit is not an open visit. `now` is 02:00 Chicago, so a
        // visit three hours old started on the previous calendar day: still
        // inside the 12-hour window, and killed by the calendar-day rule alone.
        // Without that rule its 3-hour idle would read `.stale` and still land
        // on Today — so the assertion on the state is what makes this row real.
        let yesterday = visit(startedAt: now.addingTimeInterval(-3 * 3600),
                              lastActivityAt: now.addingTimeInterval(-3 * 3600))
        let state = CaptureSessionContextPolicy.visitState(
            for: yesterday, now: now, calendar: calendar)
        #expect(state == .none)
        #expect(FieldLaunchPolicy.destination(visitState: state,
                                              deepLinkedToCapture: false) == .today)
    }

    // MARK: - C3's inline mic (task 20) — FC-R11 is a GATE, not a caption

    @MainActor
    @Test func aCardNoteInheritsTheVisitsConsentPosture() throws {
        let store = try CaptureStore.inMemory()
        let walkThrough = CaptureSessionContextPolicy.started(
            CaptureVisitDraft(kind: .site, kit: .walkThrough, label: "Maple St",
                              projectID: "p1", projectName: "Maple St"),
            identity: identity, now: now)
        let tradeWalk = CaptureSessionContextPolicy.started(
            CaptureVisitDraft(kind: .site, kit: .tradeWalk, label: "Maple St",
                              projectID: "p1", projectName: "Maple St"),
            identity: identity, now: now)

        let a = store.newDraft(sessionID: walkThrough.visitID)
        a.inherit(walkThrough)
        #expect(a.noteSetting == .conversation)

        let b = store.newDraft(sessionID: tradeWalk.visitID)
        b.inherit(tradeWalk)
        #expect(b.noteSetting == .solo)
    }

    @Test func theAffirmationLineOnlyAppearsOnAConversationNote() {
        #expect(FieldNoteSetting.conversation.affirmation
                == "Everyone here knows this is being recorded")
        #expect(FieldNoteSetting.solo.affirmation == nil)
        #expect(FieldAffirmationPolicy.chipTitle(noteSetting: .conversation)
                == "Everyone here knows this is being recorded")
        #expect(FieldAffirmationPolicy.chipTitle(noteSetting: .solo) == nil)
        #expect(FieldAffirmationPolicy.chipTitle(noteSetting: nil) == nil)
    }

    @Test func aConversationNoteCannotStartUntilSheTapsTheAffirmation() {
        // FC-R11 is a GATE, on C3 and on C6 alike — not a line of text.
        #expect(FieldAffirmationPolicy.recordingIsBlocked(
            noteSetting: .conversation, affirmed: false))
        #expect(!FieldAffirmationPolicy.recordingIsBlocked(
            noteSetting: .conversation, affirmed: true))
        // A solo note is never gated, tapped or not.
        #expect(!FieldAffirmationPolicy.recordingIsBlocked(
            noteSetting: .solo, affirmed: false))
        #expect(!FieldAffirmationPolicy.recordingIsBlocked(
            noteSetting: nil, affirmed: false))
    }

    @MainActor
    @Test func theWalkThroughKitIsWhatMakesTheCardGated() throws {
        // The kit carries the default (FC-R11), so the C3 card inside a
        // walk-through is gated without her choosing anything.
        let store = try CaptureStore.inMemory()
        let walkThrough = CaptureSessionContextPolicy.started(
            CaptureVisitDraft(kind: .site, kit: .walkThrough, label: "Maple St"),
            identity: identity, now: now)
        let card = store.newDraft(sessionID: walkThrough.visitID)
        card.inherit(walkThrough)
        #expect(FieldAffirmationPolicy.recordingIsBlocked(
            noteSetting: card.noteSetting, affirmed: false))
    }

    @Test func theHoldGestureBelongsToTheCardAndTheToggleToVoiceMode() {
        #expect(FieldVoiceGesture.forSurface(.quickConfirmCard) == .pressAndHold)
        #expect(FieldVoiceGesture.forSurface(.voiceMode) == .tapToStartTapToStop)
        #expect(FieldVoiceGesture.forSurface(.voiceSheet) == .tapToStartTapToStop)
        #expect(FieldVoiceGesture.forSurface(.scanContext) == .tapToStartTapToStop)
    }

    @Test func insideAVisitTheDestinationIsAlreadyAnswered() {
        let site = CaptureVisitState.active(CaptureSessionContext(
            identity: identity, startedAt: now, lastActivityAt: now, kind: .site))
        let sourcing = CaptureVisitState.active(CaptureSessionContext(
            identity: identity, startedAt: now, lastActivityAt: now, kind: .sourcing))

        #expect(FieldDestinationPolicy.destination(for: site) == .inbox)
        #expect(FieldDestinationPolicy.destination(for: sourcing) == .library)
        #expect(FieldDestinationPolicy.destination(for: .none) == .undecided)
    }

    @Test func onlyASourcingVisitMayRecommendLibrary() {
        let sourcing = CaptureVisitState.active(CaptureSessionContext(
            identity: identity, startedAt: now, lastActivityAt: now, kind: .sourcing))
        let site = CaptureVisitState.active(CaptureSessionContext(
            identity: identity, startedAt: now, lastActivityAt: now, kind: .site))

        // A confidently classified photo of a damaged baseboard, on a site visit,
        // must NEVER recommend "mint a product".
        #expect(FieldDestinationPolicy.recommendation(
            for: site, hasUnconfirmedGuess: false) == .inbox)
        #expect(FieldDestinationPolicy.recommendation(
            for: .none, hasUnconfirmedGuess: false) == .inbox)
        #expect(FieldDestinationPolicy.recommendation(
            for: sourcing, hasUnconfirmedGuess: false) == .library)
        // Even on a market run, an unconfirmed guess still parks it.
        #expect(FieldDestinationPolicy.recommendation(
            for: sourcing, hasUnconfirmedGuess: true) == .inbox)
    }

    /// A STALE sourcing visit is still an open visit — she has not answered
    /// "where" twice, so the door's answer stands until she ends it.
    @Test func aStaleVisitStillAnswersTheDestination() {
        let stale = CaptureVisitState.stale(CaptureSessionContext(
            identity: identity, startedAt: now, lastActivityAt: now, kind: .sourcing))
        #expect(FieldDestinationPolicy.destination(for: stale) == .library)
        #expect(FieldDestinationPolicy.recommendation(
            for: stale, hasUnconfirmedGuess: false) == .library)
    }

    /// FC-R2: `case nil` is what encodes "a kindless context is not a visit."
    /// `visitState(for:)` cannot build one, but the policy accepts ANY
    /// `CaptureVisitState`, so the guard shape is pinned here directly.
    @Test func aKindlessContextIsNotAVisitToThePolicy() {
        let kindless = CaptureSessionContext(
            identity: identity, startedAt: now, lastActivityAt: now)
        #expect(kindless.kind == nil)
        for state in [CaptureVisitState.active(kindless), .stale(kindless)] {
            #expect(FieldDestinationPolicy.destination(for: state) == .undecided)
            #expect(FieldDestinationPolicy.recommendation(
                for: state, hasUnconfirmedGuess: false) == .inbox)
            #expect(FieldDestinationPolicy.stamp(remembered: .library, for: state) == .undecided)
        }
    }

    /// R138. Routing memory is day-agnostic and outlives the visit that wrote
    /// it, so a remembered `.library` would be STAMPED onto a new draft and walk
    /// straight around `saveFromCard`'s `== .undecided` test. `.library` is
    /// honoured only while a sourcing visit is open; everything else memory
    /// still carries, so no explicit choice is ever overridden.
    @Test func aRememberedLibraryNeedsAnOpenSourcingVisit() {
        let sourcing = CaptureVisitState.active(CaptureSessionContext(
            identity: identity, startedAt: now, lastActivityAt: now, kind: .sourcing))
        let site = CaptureVisitState.active(CaptureSessionContext(
            identity: identity, startedAt: now, lastActivityAt: now, kind: .site))

        // Row 1 — the sourcing visit ended; the kindless context still carries
        // its `.library`. S3 must ask again rather than mint a product.
        #expect(FieldDestinationPolicy.stamp(remembered: .library, for: .none) == .undecided)
        // Row 2 — one deliberate Library tap inside a SITE visit wrote memory.
        // Every later capture on that visit must NOT inherit it.
        #expect(FieldDestinationPolicy.stamp(remembered: .library, for: site) == .inbox)
        // Row 3 — her explicit `.inbox` on a market run is still her choice.
        #expect(FieldDestinationPolicy.stamp(remembered: .inbox, for: sourcing) == .inbox)
        // Row 4 — the case that earned it, unchanged.
        #expect(FieldDestinationPolicy.stamp(remembered: .library, for: sourcing) == .library)
    }

    /// The constraint is one-directional: it only ever holds `.library` back.
    /// Nothing else memory carries is touched, in or out of a visit.
    @Test func theStampConstrainsOnlyLibrary() {
        let site = CaptureVisitState.active(CaptureSessionContext(
            identity: identity, startedAt: now, lastActivityAt: now, kind: .site))
        for state in [CaptureVisitState.none, site] {
            #expect(FieldDestinationPolicy.stamp(remembered: .inbox, for: state) == .inbox)
            #expect(FieldDestinationPolicy.stamp(remembered: .undecided, for: state) == .undecided)
        }
    }
}
