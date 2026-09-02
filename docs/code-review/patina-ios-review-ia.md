# Patina iOS — IA & Flow Review

**Date:** 2026-05-30
**Scope:** `apps/mobile/Patina/Patina/` — navigation graph, onboarding, mental-model coherence, dead surfaces
**Track:** 4 of 4 (parallel review tracks)
**Companion docs:** [Engineering](./patina-ios-review-engineering.md) · [Visual & UX](./patina-ios-review-design.md) · [Accessibility](./patina-ios-review-accessibility.md) · [Sprint Plan](./patina-ios-sprint-plan.md)

---

Senior IA / interaction review of `apps/mobile/Patina/Patina/`. Read end-to-end: `App/PatinaApp.swift`, `App/Coordinators/AppCoordinator.swift`, `App/Coordinators/Coordinator.swift`, `App/DeepLinking/DeepLinkHandler.swift`, `App/DeepLinking/NotificationRouter.swift`, `ContentView.swift`, plus an entry-view per Features/* folder.

---

## Map of the app

```
                                 PatinaApp (SwiftUI @main)
                                       │
                                       ▼
                                  ContentView
                                       │
              ┌────────────────────────┼────────────────────────┐
              │                        │                        │
   AppCoordinator.phase  ──────────────┼────────────  (.launching / .auth / .onboarding / .main)
              │                        │                        │
              ▼                        ▼                        ▼
        ┌──────────┐             ┌──────────┐            ┌──────────────────┐
        │  Splash  │             │AuthScreen│            │OnboardingFlowHost│
        │   View   │             │  View    │            │ carousel→quiz→   │
        │ (2s min) │             │ + Apple/ │            │ styleResult →    │
        │          │             │ Google/  │            │ hasCompleted=true│
        │          │             │ Email/   │            │                  │
        │          │             │ Guest    │            │                  │
        └──────────┘             └─────┬────┘            └─────────┬────────┘
                                       │ guest opt-in              │ flag flips
                                       ▼                           ▼
                                  (.onboarding)               (.main)
                                                                   │
                                                                   ▼
                                          ┌────────────────────────────────────────────┐
                                          │  mainContent = NavigationStack(path)       │
                                          │  root = mainHomeView                       │
                                          │     ├── DailyRoomView   (consumer)         │
                                          │     └── DesignerHomeView (designer)        │
                                          │  overlay = CompanionOverlay (5 states)     │
                                          └────────────────────────────────────────────┘
                                                                   │
                  ┌──────────────────────────────────────────────────────────────────────┐
                  │   AppRoute (44 cases). All pushes funnel through AppCoordinator.    │
                  │   navigate(to:); a few are diverted to sheet flags on the coord.    │
                  └──────────────────────────────────────────────────────────────────────┘
                                                                   │
   ┌───────────────────┬──────────────────┬─────────────────┬─────────────────┬──────────────────┐
   ▼                   ▼                  ▼                 ▼                 ▼                  ▼
ROOMS              SCAN/STYLE           DISCOVERY        PROJECTS         IDENTITY          INTEROP
yourSpaces         scanThreshold        emergence        projectList      profile           qrScanner
roomProject        scanWalk             roomEmergence    projectDetail    settings(sheet)   qrApproval
roomDetail (=)     scanReview           pieceDetail      decisionList     authentication    notifications
roomSavedItems     scanSoftLanding      table (=)        decisionDetail   designServices    threadList
roomSettings       scanConversation     recommendations  threadList       (sheet)           threadDetail
crossRoom          scanReveal           styleQuiz        threadDetail
newRoom (sheet)    scanFloorPlan        styleResult      receiveDelivery
manualRoomEntry    scanFallbackEntry    designerConsult.
moveItem (sheet)   walk/walkSession      arPlacement
                   rescan
                   (legacy → re-route to QuietConversationFlowHost)
```

**One paragraph.** The app is a single `NavigationStack(path:)` driven by an `@Observable` `AppCoordinator` whose root view is selected by a derived `phase` (`launching | auth | onboarding | main`). There is no tab bar — the **Companion** floating bubble (`CompanionOverlay`) is positioned as the app's only persistent navigator, exposing 4–6 context-aware actions per screen. Sheets are tracked as booleans on the coordinator (`showingSettings`, `showingQRScanner`, `showingDesignServices`, `showingNewRoom`, `showingMoveItem`) and rendered at the ContentView root so they survive `navigationPath` pushes. `AppRoute` has 44 cases — far more than the surfaces the user can actually reach unaided; the Companion (+ DesignerHome quick cards) is the only entry point for most of them.

---

## First-launch journey

The new-user path, traced screen by screen:

1. **PatinaApp.init** schedules a splash with a hard 1.5 s floor (`splashMinimumDeadline`) plus the splash view's own 2.0 s animation timer. Net: minimum ~2.0 s before anything else can show, even if the auth state restores instantly.
2. **SplashView** — centered "PATINA" wordmark + three strata lines. Pure brand, no value prop, no copy.
3. **AuthScreenView** (phase = `.auth`) — wordmark + strata mark + "Welcome home" + "Join thousands of design enthusiasts". Five options: Sign in with Apple, Google, Email, Create Account, Browse as Guest. Guest is a tertiary text link below an "or" divider.
4. **OnboardingFlowHost** (phase = `.onboarding`) — runs only after a session lands (or guest opt-in). Three steps:
   1. `OnboardingFlowView` — 3-page paged carousel: "Every room tells a story" → "See it in your space" → "We'll need your camera". Skip available on first two pages.
   2. `StyleQuizView` — visual quiz (4 movements). Output: a `StyleProfileResult`.
   3. `StyleResultView` — shows the resolved style. Tapping "View recommendations" sets `hasCompletedOnboarding = true`, which transitions the phase to `.main`.
5. **DailyRoomView** (default `mainHomeView` for consumer / dual-role-auto / unspecified roles). On first appearance, the `FirstLaunchTour` orchestrator auto-starts a three-step coachmark tour: home greeting → saved heart on the first product card → profile monogram. Persisted via UserDefaults + Supabase `profiles.help_state`.
6. **Empty-state CTA** — if `viewModel.rooms.isEmpty`, the screen body becomes `DailyRoomEmptyState` with a single "Scan a room" CTA that navigates to `.walk`.
7. **`.walk` → QuietConversationFlowHost** — this is the route the user actually lands in. Despite being named `walk`, ContentView routes `.walk` / `.walkSession` / `.rescan` / `.scanThreshold` / `.scanFallbackEntry` all to the same host. The host detects LiDAR; if present it runs the 6–8 step "Quiet Conversation": Threshold → Walk → Review (full-screen cover) → SavedConfirmation → optional SoftLanding → StyleConversation (5 questions) → Reveal → FloorPlan → dismiss → `.emergence`.

**Friction cliffs:**

- **Cliff A — too much branding before value.** Splash (≥2 s) → AuthScreenView (no preview of the product, no carousel, no screenshots, "Browse as Guest" buried under a divider) is ~3 screens before the user sees anything they can do.
- **Cliff B — style quiz before any data.** Onboarding forces the quiz before the user has scanned a room, but the post-onboarding home screen (DailyRoomView) is built around rooms. A user who completes onboarding has a style profile and zero rooms — the entire DailyRoom screen renders an empty state with one CTA. The work the user just did (the quiz) doesn't visibly pay off.
- **Cliff C — "Walk" naming.** The post-scan flow has a second, deeper style conversation (Movement 2 of Quiet Conversation, 5 questions). A user who already did the style quiz in onboarding is asked again. The two surfaces (`StyleQuiz` and `StyleConversation`) are different code paths producing similar-shaped outcomes.
- **Cliff D — the FirstLaunchCoordinator + FirstLaunchState orchestration is dead.** The state machine and coordinator at `Features/FirstLaunch/Coordinators/FirstLaunchCoordinator.swift` is fully implemented (threshold → walkInvitation → cameraPermission → walkActive → walkComplete → firstEmergence → roomNaming → complete) but **nothing instantiates it** outside its own preview. The actual onboarding host is `OnboardingFlowHost`, which just runs carousel → quiz → result. The "Walk-First" philosophy described in `FirstLaunchState.swift` ("users experience AR magic in their space within 60 seconds") is **not what ships** — users see the carousel + quiz, not the walk.

---

## Mental-model assessment

Patina is currently five products sharing a `NavigationStack`. Whether they cohere depends on which mental model the user shows up with.

**Cluster 1 — Daily Editorial Home (coheres internally).** `Features/Home/` is the most polished feature; DailyRoomView, DailyStoryCard, DailyProductCard, RoomChipRail, RoomContextBar, AddToRoomSheet all play together. The model: "Patina is a daily curated furniture feed scoped to your room." This is consistent, readable, and where a returning consumer naturally lands.

**Cluster 2 — Room Capture & Style Discovery (coheres but is hidden).** The "Quiet Conversation" (`Features/RoomScan/QuietConversationFlowHost`) is the marquee feature — LiDAR scan + style chat + reveal + floor plan. It coheres internally as a 6-step linear flow. But its entry is buried: a "Scan a room" CTA on the empty home, a Companion action, or a `.rescan` from RoomSettings. There is no persistent affordance for "I want to capture a room" once the home has products in it.

**Cluster 3 — Discovery (split-brained).** Recommendations (`emergence`), saved items (`table`), product details (`pieceDetail`), and Style Quiz overlap in confusing ways. `EmergenceView` is implemented but unreachable — `ContentView`'s `.emergence` case renders `RecommendationsView` instead. `TableView` is implemented but unreachable — `.table` renders `CollectionsView`. The user can save items, but the verbs ("Emergence", "Table", "Collections", "Recommendations") all point at variations of the same concept.

**Cluster 4 — Designer/Project Mgmt (B2B graft).** `DesignerHomeView`, `ProjectList/Detail`, `DecisionList/Detail`, `ThreadList/Detail`, `ReceiveDeliveryView` are all from the recent "MVP v1 dual-mode" expansion. They feel like a different app — utilitarian dashboards with stat cards, no Strata Mark, no editorial typography, no Companion choreography. Dual-role users see a Workspace dropdown in AccountView (`Auto / Designer / Consumer`), but the only way to **find** that toggle is to (a) open the Companion, (b) tap "Settings", which opens AccountView (not SettingsView — see below), (c) scroll to "Workspace". Three taps for a fundamental identity switch.

**Cluster 5 — Identity & Settings (in shards).** `Profile`, `Account`, and `Settings` are three folders with overlapping responsibilities. `SettingsView` (Features/Settings) defines a real settings screen with notifications, haptics, cellular upload toggles — and **is never instantiated outside its preview**. The `.settings` route opens `AccountView` (which contains sign-out + workspace toggle + a different set of fields). `ProfileView` (the "Design Journal") is reachable only through the Companion's auto-appended "Your profile" action — nothing else navigates to `.profile`. The user has three near-synonyms for "where my stuff is" and the wiring picks one almost arbitrarily.

**Verdict.** Cluster 1 + 2 + 3 *could* read as one coherent product ("Patina the consumer app"). Cluster 4 reads as a second app that happens to share auth. Cluster 5 fights itself. The Companion does heroic work papering over the seams — its expanded panel is the only place the IA actually resolves.

---

## Friction points

1. **The `.settings` route opens an Account screen, and the actual Settings view is orphaned.** `ContentView.destinationView(for: .settings)` returns `EmptyView()`; the sheet binding on `coordinator.showingSettings` presents `AccountView`. `SettingsView` (the one with toggles for notifications, haptics, cellular upload) is referenced only in its own preview. **Why it hurts:** the user who taps "Settings" gets account info; the user who wants to turn off haptics has no path at all. **Try:** either delete `SettingsView` or wire it as the actual Settings sheet and rename the account sheet binding.

2. **`Profile` is unreachable except via the Companion.** No view in the app calls `coordinator.navigate(to: .profile)`. Only the Companion's auto-appended trailing action exposes it. The first-launch tour even points at a "profile monogram" anchor in `DailyRoomView`, but DailyGreetingHeader doesn't actually wire that anchor to a navigation — the only `.firstLaunchTourAnchor(.profileMonogram)` use I found was the tour spec itself; the header just shows a static "K" inside a circle. **Why it hurts:** the tour teaches users about a button that doesn't exist. **Try:** make the monogram a real `Button { coordinator.navigate(to: .profile) }`.

3. **`Notifications` is similarly only reachable from the Companion.** No tab, no bell-icon affordance, no header chip. A push-notification tap lands the user in a detail screen (`NotificationRouter` maps `entity_type` → `AppRoute`), but a user with badged unread can't find the inbox without expanding the Companion. **Try:** put a bell icon next to the help "?" in the Daily/Designer headers; both already have header rows for the help glyph.

4. **The `.walk`/`.walkSession`/`.rescan` routes all render `QuietConversationFlowHost`, but their `displayName`s differ.** PostHog logs three different screen names ("Walk", "Walking", "Re-scan Room") for the same underlying flow. **Why it hurts:** funnel analytics are corrupted at the entry — you can't tell from PostHog how many users started the Quiet Conversation. **Try:** collapse to a single canonical route (e.g. `.scanFlow`) and route the legacy ones to it explicitly.

5. **Style discovery happens twice.** Onboarding's `StyleQuizView` → `StyleResultView` produces a `StyleProfileResult`. After a scan, the Quiet Conversation runs `StyleConversationContainerView` (5 separate movement views: VisualResonance, MaterialConnection, LifestyleReality, InvestmentPerspective, Priority, ContemplativePause) ending in `RevealView`. A returning user who scans their first room sees both flows back-to-back. **Why it hurts:** the user is asked to do style work they already did. **Try:** if `StyleProfileStore.shared.currentProfile != nil`, skip Movement 2 entirely and route Walk → SavedConfirmation → SoftLanding → FloorPlan, only offering the conversation if explicitly requested.

6. **Designer workspace toggle requires three taps and is bound to an undiscoverable surface.** The only entry to the dual-mode toggle is Companion → Settings → "Workspace" pop-out. There's no header chip on DesignerHomeView ("← Switch to consumer") or DailyRoomView ("→ Designer workspace"). The Companion does append a context-aware route ("Consumer view" / "Designer workspace") but only when expanded. **Try:** put a tiny mode chip near the existing MonoLabel ("DESIGNER" / "CONSUMER") in each home's header; tap to switch.

7. **`Threshold` is a vestigial route that no longer renders anything.** `Coordinator.swift` declares `case threshold`, `AppRoute.threshold` exists, `AppCoordinator.navigate(to: .threshold)` is special-cased to treat it as "go to home". The `Features/Threshold/` folder still exists (`LivingSceneView` + `TimeOfDay`) and is now used only inside `WalkInvitationView` and `CameraPermissionView` — both part of the **dead** FirstLaunchCoordinator flow. **Why it hurts:** a future engineer reads "Threshold" in `AppRoute`, in companion logic, in `displayName`, and assumes there is a Threshold screen. **Try:** delete the route, delete `Features/Threshold/`, and inline `TimeOfDay` somewhere sensible (e.g. `Design/Tokens/`).

8. **`Features/Conversation/` (the generic Patina chat) is also vestigial.** `ConversationView` is referenced exactly once: the `.conversation` AppRoute renders it. Nothing navigates to `.conversation`. The Companion's `IntentDetector` returns intent enums like `.walkRoom`, `.showTable` — there is no `.conversation` intent. **Why it hurts:** a whole feature folder (ViewModels/ConversationState, Messages, StyleProfile, VoiceInputButton, TypingIndicator, MessageBubble) is implemented but disconnected. **Try:** verify with the team whether this is legacy or a planned surface; if legacy, delete; if planned, wire a Companion action.

9. **First-launch tour points at anchors that aren't all real.** `FirstLaunchTour.swift` enumerates three anchors (`homeGreeting`, `savedHeart`, `profileMonogram`). Searching the codebase only `savedHeart` is wired in `DailyRoomView` (on the first product card). The greeting and monogram anchors aren't applied to their target views, so popovers either anchor incorrectly or silently no-op. **Try:** add `.firstLaunchTourAnchor(.homeGreeting)` to `DailyGreetingHeader` and `.firstLaunchTourAnchor(.profileMonogram)` to the monogram view inside it.

10. **`HomeMode` switching navigates to `.heroFrame` — which renders `EmptyView`.** In `AccountView.applyHomeMode`, after changing mode the coordinator is navigated to `.heroFrame`. `ContentView.destinationView(for: .heroFrame)` returns `EmptyView()`. The actual home selection happens in `mainHomeView` (a non-destination ViewBuilder). The `navigate(to: .heroFrame)` call just clears the navigation path — which works, but it's structurally backwards: the route exists in `AppRoute`, has a `displayName` ("Home"), and is mapped to literally nothing. **Try:** rename `.heroFrame` → `.root` or remove the destination case entirely; only use `navigationPath = NavigationPath()` to mean "pop to root".

11. **No graceful exit from QuietConversationFlowHost mid-flow except by Cancel/Abandon.** Once the user is in `.softLanding`, `.conversation`, `.reveal`, or `.floorPlan`, the only exit is to complete (which routes to `.emergence`) or to use the system back gesture (which pops the NavigationStack entry that mounts `QuietConversationFlowHost`, abandoning the in-progress style data). Each step is presented as a separate view but the flow doesn't expose a "save progress, return later" affordance. **Why it hurts:** users who scanned but ran out of time lose their scan unless the upload already kicked off. **Try:** add a persistent "Save & continue later" button in the panel that resumes from the saved step.

12. **Auth phase → main phase transition leaks pendingDeepLink semantics.** Magic-link cold launch is correctly queued during `.launching` and drained on `.main`, but a magic-link tap **while already in `.main`** routes through `handleAuthURL` which does nothing useful (the user is already authenticated). The handler also force-clears `guestModeOptIn` on QR-deep-link, which can yank a guest user into the Auth screen mid-task. **Try:** treat magic-link-while-signed-in as a no-op with a toast ("You're already signed in"); preserve guest mode unless QR auth succeeds.

13. **Sheets sit in `ContentView` at the ZStack root, so they survive but also persist across `.phase` transitions.** If the user has the QR scanner open and an auth event flips them to `.auth`, the sheet's binding still says `true` and re-presents over the auth screen on next render. **Try:** clear all `showing*` flags inside `recomputePhase()` on transitions to `.auth` / `.launching`.

14. **Companion is the only navigator — but it's hidden during the very moments users most need orientation.** The Companion is `.hidden` during `preScanChecklist`, `floorPlanPreview`, and `styleQuiz`. In those screens, the only way back is the system back gesture or in-screen buttons (which exist but are inconsistent — `PreScanChecklistView`'s primary CTA is "Ready to scan", with no explicit Cancel). A user who taps "Scan a room" by accident has to swipe-back or wait for the host to dismiss them. **Try:** never fully hide the Companion; use `.minimal` mode (already implemented for AR/pieceDetail) so the bubble is always present.

15. **44 `AppRoute` cases, ~25 user-reachable surfaces.** The route enum has accreted: `walk` AND `walkSession` AND `rescan` AND `scanThreshold` AND `scanFallbackEntry` all route to `QuietConversationFlowHost`. `scanWalk`/`scanReview`/`scanSoftLanding`/`scanConversation`/`scanReveal`/`scanFloorPlan` are declared cases but their `destinationView` arms return `EmptyView()` because the host manages the flow internally. `threshold`, `heroFrame`, `walkInvitation`, `cameraPermission`, `walkComplete`, `firstEmergence`, `roomNaming` are first-launch cases for a flow that doesn't run. **Why it hurts:** every new contributor has to learn a routing table that no longer reflects reality; analytics screen-name buckets are diluted; the `switch` exhaustiveness is a chore. **Try:** split into `AppRoute` (user-facing) and `LegacyAppRoute` (kept for back-compat) and aggressively prune the user-facing set to the ~25 cases that have a real destination.

---

## Redundant / legacy surfaces

Evidence here means "found by grep; only Preview or self-references"; "implemented but not routed-to"; or "duplicated with another implementation that wins at runtime".

- **`Features/Threshold/`** — implemented (`LivingSceneView`, `TimeOfDay`) but only consumed by the dead FirstLaunchCoordinator pages. `.threshold` route is special-cased to silently redirect to home. **Action:** delete folder, fold `TimeOfDay` into `Design/Tokens/`.

- **`Features/FirstLaunch/Coordinators/FirstLaunchCoordinator.swift` + `Models/FirstLaunchState.swift`** — full 8-state machine, never instantiated outside its own files. The actual onboarding path is `OnboardingFlowHost` (a 3-step `@State` enum). **Action:** delete the coordinator + state model; keep `WalkInvitationView`/`CameraPermissionView`/`RoomNamingView`/`WalkCompleteView` only if they will be revived for a true Walk-First onboarding; otherwise delete those too. (CameraPermissionView still has a privacy sheet that may be valuable to preserve.)

- **`Features/Conversation/` (whole folder)** — `ConversationView` is the only destination for `.conversation`, but nothing in the app navigates to `.conversation`. ViewModels, Models (Message, StyleProfile, ConversationState), and Components (MessageBubble, TypingIndicator, VoiceInputButton) are fully built. Confused with `StyleConversation` and `Companion` chat. **Action:** confirm with PM. This is either deeply legacy or a parked feature waiting for activation.

- **`Features/Settings/Views/SettingsView.swift`** — implemented (notifications, haptics, cellular upload toggles, support links). The `.settings` route renders `EmptyView`; the sheet binding renders `AccountView`. SettingsView appears only in its own `#Preview`. **Action:** either wire SettingsView as the Settings sheet (and demote AccountView to a "View account" subscreen reachable from it) or delete the file.

- **`Features/Account/AccountView.swift`** — currently the *de facto* Settings sheet; contains: account info, workspace mode toggle, sign-out. Overlaps with Profile and Settings. **Action:** if SettingsView is revived, keep AccountView for sign-out + workspace; otherwise merge into SettingsView.

- **`Features/Profile/Views/ProfileView.swift`** — implemented but unreachable from the main UI (only the Companion's trailing action opens it). The Design Journal concept is real but invisible. **Action:** see Friction #2; wire the monogram.

- **`Features/Emergence/Views/EmergenceView.swift`** — implemented as the original "single piece reveals" screen. `.emergence(pieceId:)` routes to `RecommendationsView` (no piece) or `ProductDetailView` (with piece). `EmergenceView` is referenced only by its own preview. **Action:** if `RecommendationsView` + `ProductDetailView` are the real surfaces, delete `Features/Emergence/Views/EmergenceView.swift` and `EmergenceViewModel` (keep the components `PieceRevealView`, `PieceStoryCard`, `EmergenceActionButtons` if they're used by other views; otherwise delete them too).

- **`Features/Table/Views/TableView.swift`** — implemented with three view modes (scatter / grid / list) and a `TablePhysicsEngine`. `.table` route renders `CollectionsView`, not `TableView`. TableView is referenced only by its own previews. **Action:** decide which is the canonical "saved items" surface. The physics-table scatter is a beautiful experiment; if it's not shipping, delete the folder (including `TablePhysicsEngine`, `PatinaEffect`, `TableItemCard`).

- **`Features/Walk/Views/WalkView.swift`** — has an `@available(*, deprecated, message: "Use RoomScan flow via AppCoordinator.scanReview — v1 WalkView is kept only for legacy rows.")` annotation at line 359. Used only by its own preview. **Action:** the deprecation is honest — delete it and the WalkViewModel/MockRoomScanView once you're confident nothing else imports `WalkView`.

- **`AppRoute.heroFrame`** — has a `displayName` ("Home"), is the value of `currentScreen` at app launch, but its `destinationView` arm returns `EmptyView()`. The "home" is actually `mainHomeView`, a ViewBuilder selected outside the destination table. **Action:** keep as a marker for "I'm at root" but stop pretending it's a navigable destination; comment it clearly or rename to `.rootMarker`.

- **`AppRoute.scanWalk / scanReview / scanSoftLanding / scanConversation / scanReveal / scanFloorPlan`** — each declared with associated values, each `destinationView` arm returns `EmptyView`. The Quiet Conversation host manages them internally via its own `Step` enum. **Action:** remove the route cases (the host doesn't need them) or keep them only as analytics surface tags and route any direct calls to the host.

---

## Recommendations

Prioritized for impact-vs-effort. P0 = ship in the next sprint; P1 = next quarter; P2 = whenever.

### P0 — IA hygiene (1 sprint, no UX rework)

1. **Wire `SettingsView` as the actual Settings sheet** OR delete it. Right now "Settings" the word lies. (Friction #1, ~2 hrs.)
2. **Make `.profile` reachable from the UI.** Wire the profile monogram in `DailyGreetingHeader` and the equivalent header chip in `DesignerHomeView` as `Button { coordinator.navigate(to: .profile) }`. Bonus: fixes the FirstLaunchTour Step 3 anchor. (Friction #2, #9.)
3. **Surface notifications as a header affordance** on both home screens (bell icon next to the existing "?" help glyph). (Friction #3.)
4. **Consolidate scan-flow routes for analytics integrity.** Pick one canonical screen name for "user is in the Quiet Conversation"; route `.walk` / `.walkSession` / `.rescan` through a single PostHog screen event. (Friction #4.)
5. **Delete or document the dead surfaces:** `Features/Threshold/`, `FirstLaunchCoordinator`/`FirstLaunchState`, `EmergenceView`, `TableView` (the physics one), `WalkView` (already deprecated). Each is its own small PR with a `git rm`. (Reduces 44 routes toward ~25.)

### P1 — flow rework (a quarter)

6. **Skip the second style conversation when the user already has a profile.** Quiet Conversation Movement 2 should be conditional on `StyleProfileStore.shared.currentProfile == nil`. (Friction #5.)
7. **Add a mode-switch chip to the DesignerHomeView and DailyRoomView headers** for dual-role users; the toggle is too important to be three taps deep. (Friction #6.)
8. **Add "Save & continue later" affordance to QuietConversationFlowHost.** The flow is long; a 7-step linear gauntlet with no exit is hostile on mobile. (Friction #11.)
9. **Rethink onboarding philosophy.** Either (a) commit to the documented "Walk-First" idea — replace OnboardingFlowHost with a flow that does a quick walk before the quiz, so the post-onboarding home has rooms; or (b) delete the Walk-First docs and FirstLaunchCoordinator. As-is, the docs describe one thing and the code ships another. (Cliff B + D.)
10. **Pick one verb for "saved items".** Table, Collections, Emergence, Recommendations are four words for two ideas (recommended pieces vs. user-saved pieces). Standardize to two concepts max ("Recommendations" + "Saved" or "Discovery" + "Collections") and rename the routes + screens.

### P2 — structural

11. **Move the Companion from "only navigator" to "supplementary navigator."** It is doing too much: tab bar + help system + chat + auth gate + QR launcher + settings shortcut. Even a minimal bottom-rail with Home / Discover / Saved / Profile (the 4 surfaces dual-role users actually need) would relieve the Companion of being the single point of failure for discoverability — and let the Companion specialize in *contextual* actions (the things that change per-screen) instead of doubling as the static IA.
12. **Split AppRoute** into `AppRoute` (user-reachable, ~25 cases) and `InternalFlowStep` (the scan-flow sub-steps that should never be in NavigationStack). The current enum confuses navigation destinations with state machine steps.
13. **Add a "guest → signed in" upgrade prompt at meaningful moments** (after first scan, after first save). Guest mode is supported by the phase deriver but the app never proactively asks the guest to sign up — they have to find Settings → Sign In themselves.
14. **Reconsider whether designer-mode belongs in the same app at all.** Cluster 4 (DesignerHome / Projects / Decisions / Threads / Receiving) shares only auth with the consumer app. Visual language differs, info density differs, the Companion's context model is awkward in designer-mode (it tries to offer "Scan a room" actions on a project dashboard). A separate "Patina Studio" iOS target sharing the same Supabase backend might be a cleaner long-term answer than the dual-mode toggle.

---

**Closing note.** The Companion is genuinely clever — replacing a tab bar with a context-aware action sheet is a brave call and it mostly works. But the price is that *everything* the user could do has to fit into the Companion's per-screen action list (4–6 items), and surfaces that don't (Profile, Notifications, Settings) silently disappear from the IA. The 44-case route enum is the smoking gun: it accumulated because every new feature added a route, and the Companion is the only place forced to enumerate them. Pruning routes, surfacing the missing affordances, and committing to one onboarding philosophy will pay back for years.
