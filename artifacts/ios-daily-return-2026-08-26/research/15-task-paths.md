# 15 — Task paths today (T1–T14)

Source: `artifacts/ios-daily-return-2026-08-26/source/instruments.md` §1. Paths are **code-read** at
`main @ 3cd84ecb3`; no simulator was run in this lane.

**Conventions.** An *act* is one deliberate user interaction — a tap, a swipe, a picker choice, or a
type-and-submit. Scrolling is not an act. Opening the Companion orb counts as 1 act; each Companion
row is another. "Home" always means `DailyRoomView`
(`apps/mobile/Patina/Patina/Features/Home/Views/DailyRoomView.swift:11`), whose live composition is
only: **greeting header (date · `?` · bell · monogram) → `Next Move` card → editorial story card →
`Active Room` card** (`:104-145`). Labels are quoted exactly as they appear in source.

**The load-bearing fact for every path below:** the home has **no** "Browse pieces", **no** "Saved",
**no** "Get design help", and **no** Projects/Proposals/Invoices/Decisions door. Those blocks exist
(`StudioHubSection`, `MarketplaceLinksSection`, `WorkWithDesignerCTA`) but are mounted by nothing
since `126e59a11` — see `10-code-anatomy.md` A1/A2. So most tasks route through the **Companion orb**
or through **monogram → Profile**.

---

## T1 — "Fresh install. What is this for, and what do I do first?"

| # | Screen | Control (verbatim) | Lands on | File:line |
|---|---|---|---|---|
| — | Splash | — (1.5 s, word `PATINA`) | Auth | `Features/Splash/Views/SplashView.swift:25`; `App/Coordinators/AppCoordinator.swift:77-81` |
| 1 | Auth wall — `"Welcome home"` / `"Start with a piece you love"` | `Sign in with Apple` · `Continue with Google` · `Continue with email` · **`Look around first`** | Onboarding | `Features/Authentication/Views/AuthScreenView.swift:38-124`; `ContentView.swift:36-70` |
| 2 | Onboarding 1 — "Every room tells a story" | `Start Your Journey` | page 2 | `Features/Onboarding/Views/OnboardingFlowView.swift:29-34` |
| 3 | Onboarding 2 — "See it in your space" | `Continue` | page 3 | `:35-40` |
| 4 | Onboarding 3 — "Find your style first" | `Let's begin` | Style quiz | `:55-60` |
| 5–9 | Style quiz ×5 questions | option cards + `Continue` | `StyleResultView` | `Features/StyleQuiz/Models/QuizModels.swift:23-26,60` |
| 10 | Style result | continue | Home | `Features/StyleQuiz/Views/StyleResultView.swift` |
| — | Home | First-launch tour auto-starts | popover step 1 | `DailyRoomView.swift:34`; `Features/Help/FirstLaunchTour.swift:227-252` |
| 11 | Tour 1 — **"Welcome to Patina"** / "This is your Daily Room — picks and stories chosen for your space." | next | tour 3 (step 2 is dropped) | `FirstLaunchTour.swift:228-235` |
| 12 | Tour 3 — **"Your profile"** / "Rooms, saved pieces, and settings live here." | next | Companion intro | `:244-251` |
| 13 | Companion intro bubble — **"I'm your Companion."** / "Tap me any time, anywhere in Patina — I'll show you the way to what's next." | `Show me` / `Later` | Home | `Features/Companion/Views/CompanionIntroBubble.swift:69-76` |
| 14 | Home — `Next Move` card | **"Bring your first room into Patina"** / "A short scan gives the Companion a real space to work from." | scan flow | `Features/Home/Models/TodayExperience.swift:120-128`; `DailyRoomView.swift:116-120,223-225` |

**Acts: ~14 to reach the first real choice; 1 act (the Next Move card) once on Home.**

⚠ Tour step 2 — **"Save what you love"** / "Add pieces to a room with + Add — they follow you
everywhere." — never renders: its anchor `.addToRoom` mounts in no view (grep: only `.homeGreeting`
`Features/Home/Views/DailyGreetingHeader.swift:57` and `.profileMonogram` `:99`), so the model drops
it after the 1.5 s grace (`FirstLaunchTour.swift:190-195`). The first-run explanation of the app's
save loop is silently omitted, and the `+ Add` control it names does not exist on the shipped home.

**Guest note:** picking `Look around first` produces an identical path — onboarding and the quiz run
for guests too (`AppCoordinator.derivePhase()`, `:233-246`).

---

## T2 — "7:40am, coffee, phone in hand. Why would I open Patina today?"

Path: launch → Home. **0 acts to see everything the home has.**

What is on that first screen, and what could differ from yesterday:

| Block | Today's content | Differs from yesterday? |
|---|---|---|
| Date line, e.g. `WEDNESDAY · AUG 26` | `DateFormatter "EEEE · MMM d"` (`Features/Home/ViewModels/DailyRoomViewModel.swift:85-89`) | **Yes — the only guaranteed change.** |
| Heading `"Today"` | literal (`DailyGreetingHeader.swift:40`) | No. No time-of-day greeting — `TimeOfDay` is never read by the home (`10-code-anatomy.md` A20). |
| `Next Move` card | one deterministic branch of an 8-input ladder (`TodayExperience.swift:48-160`) | Only if a draft/scan/request/decision/message/room/style state changed |
| Editorial story card | `editorial_stories` `order=sort_order.desc,published_at.desc&limit=1` (`Core/Network/EditorialStoriesAPIClient.swift:72-79`) | Only if an editor published/reordered. Not a daily rotation. The clay **unread dot is hard-coded on** (`:119,130`). |
| `Active Room` card | local room + `"Latest save: {piece}"` (`Features/Home/Views/TodayModules.swift:104-163`) | Only if the user themselves saved something |
| Bell badge | `notification_log` unread count | Only if the backend wrote a row |

**Dead end for T2:** there is nothing else to open. The screen ends at the Active Room card and a
120 pt Companion spacer (`DailyRoomView.swift:142`). For a steady-state discovering user with one
room, one style profile and one saved piece, the Next Move reads, every morning, verbatim:

> **Return to Living Room** — "1 piece is gathering there."
> (`TodayExperience.swift:153-159`)

---

## T3 — "Find a sofa for our living room."

There is **no search** anywhere in the app (grep: no search field, no `p_query`). Two paths exist.

**Path A — via the Companion (the shortest real path).**
1. Tap the Companion orb → panel "Where to next?" (`Features/Companion/Services/CompanionContextProvider.swift:179`)
2. Tap **`Your recommendations`** (hint "Based on your rooms" / "Pieces for your style" / "Take the quiz first") → `RecommendationsView` (`Features/Companion/Services/CompanionActionRows.swift:92-113`)
3. Tap chip **`Seating`** — client-side filter over the already-fetched ≤20 rows; `p_category` is never sent (`Features/Recommendations/ViewModels/RecommendationsViewModel.swift:44,48-51`)
4. Tap a card → `ProductDetailView` (`Features/Recommendations/Views/RecommendationsView.swift:154`)

**Acts: 4.**

**Path B — via the room.** Home → `Active Room` card (1) → `"Browse Picks for This Room"` /
Companion `See recommendations` (2) → room-scoped `RecommendationsView` → card (3). **Acts: 3**, but
only when the room has synced a `remoteId` (`RecommendationsView.swift:106-111`); a local-only room
falls back to the unscoped marketplace.

**What is legible on the detail screen without hunting** (`Features/ProductDetail/Views/ProductDetailView.swift:141-267`):
maker + location mono tag, H2 name, materials as a `·`-joined subtitle, full price, `"{n}% match"`,
"Provenance" badge chips, maker-story card.

**What is not there at all:** dimensions (the column `products.dimensions JSONB` exists —
`supabase/migrations/00001_initial_schema.sql:35` — and is neither returned by
`get_recommendations` (`00246_aesthete_quiz_bridge.sql:199-214`) nor decoded by
`Core/Models/ProductModel.swift:30-41`), lead time, stock, shipping, returns, description, or the
maker's own URL. **Two of the five fields the task asks to be legible do not exist in the app.**

---

## T4 — "Save it. Find it again tomorrow."

**Save: 1 act.** Either the ♥ in the piece-detail top bar
(`ProductDetailView.swift:131-134`) or the primary button **`Add to Room`** (`:377`), or the ♥ /
swipe-right / ⋯ → `Save` on the browse card (`RecommendationsView.swift:180,282,312`).

⚠ On the standard `.pieceDetail(pieceId:)` entry no room context is passed
(`ContentView.swift:292-294`), so **both** controls run the same local-only
`toggleSave` — a `TableItemModel` insert with no `saved_items` mirror and no room
(`Features/ProductDetail/ViewModels/ProductDetailViewModel.swift:104-125`). `isSaved` is never seeded
from storage, so tomorrow the same piece shows **`Add to Room`** again and a second row is inserted.
The `Saved ✓` state does not survive leaving the screen.

**Find it again tomorrow:**
1. Tap the Companion orb
2. Tap **`Saved`** — hint `"{n} saved pieces"` (`CompanionActionRows.swift:217-223`)
3. In `CollectionsView` the default tab is **`Boards`**, which is empty; tap **`All items`**

**Acts: 3** — *and only if the row appears at all.* `collectionsRow` returns `nil` when
`context.tableItemCount == 0` (`CompanionActionRows.swift:219`), and `tableItemCount` is computed as
the sum of **room** `SavedItem`s (`DailyRoomView.swift:265`), not `TableItemModel` rows. **A piece
saved from Browse or from the piece detail does not increment it.** So for a user whose only saves
came the way the app invites them to save, the Companion's `Saved` row never appears and
`.table` has **no door anywhere in the app**.

**Dead end, verbatim.** If the user does find `Saved`, the default tab reads:

> **"No boards yet"** / "Save pieces from recommendations to create your first board" / `Create Board`
> (`Features/Collections/Views/CollectionsView.swift:156-176`)

and if they create one:

> **"This board is empty"** / `Browse pieces`
> (`:227-245`)

— which it will remain, because `CollectionsViewModel.addToBoard(_:productId:)` (`:101`) has no call
site anywhere in the app. **A board can be created but can never contain a piece.**

**"Attached to my room":** only via `AddToRoomSheet` — which nothing presents — or via
`addToAttachedRoom`, which needs a room context the standard path never supplies. Room-scoped Saved
(`.roomSavedItems`) filters on `TableItemModel.roomId`, a field no code ever writes
(`Core/Models/TableItemModel.swift:51`), so it is always empty.

---

## T5 — "See it in my room."

**Getting a room (Simulator):** Home → `Next Move` **"Bring your first room into Patina"** (1) →
`QuietConversationFlowHost` detects no LiDAR (`Features/RoomScan/Views/QuietConversationFlowHost.swift:151`,
`Features/Walk/Services/RoomCaptureService.swift:241-242`) → manual `ScanFallbackEntryView` → fields
(name, ceiling height, windows, orientation) → **`Save Room`** — **≈6 acts.**
The manual form is otherwise reachable only from the Companion row `Add a room manually`
(`Features/Companion/Services/CompanionAreaBuilders.swift:128`).

**Getting a piece into the room:** the only working route is a **room-scoped** browse —
Home → `Active Room` card (1) → the room's `"Browse Picks for This Room"` (2) → card (3) → the
detail's `Add to Room`, which now has a `roomRemoteId` and POSTs `saved_items` (4). **Acts: 4.**
From an unscoped browse the piece lands in the flat local table instead (T4).

**AR — the dead end.** `product.hasARModel` is `usdzURL != nil`
(`Core/Models/ProductModel.swift:110-112`), and `usdz_url` is **`NULL::text`** in the RPC
(`supabase/migrations/00246_aesthete_quiz_bridge.sql:281`) and hard-coded `nil` in the direct product
fetch (`Core/Network/ProductAPIClient.swift:192`). Therefore:

- the AR button in the piece-detail action bar is gated on `hasARModel` and **never renders**
  (`ProductDetailView.swift:346-367`);
- the room's stat row shows `In AR` = **0**, always (`Features/Rooms/Views/RoomProjectView.swift:241`);
- the two remaining doors — the Companion's `Try in your room` (`CompanionActionRows.swift:85-90`)
  and a room item's `.viewAR` action (`RoomProjectView.swift:349-353`) — land on `ARPlacementView`,
  which says, verbatim:

> **"3D model not available for this product"**
> (`Features/ARPlacement/Views/ARPlacementView.swift:200`)

**Sim-only limits:** on Simulator, `RoomCaptureSession.isSupported` is false and ARKit world tracking
is unavailable, so the LiDAR walk, the depth/keyframe instrument, and `ARPlacementView`'s camera
cannot be exercised at all. Everything above about AR is **code-read**, not sim-verified — but the
`usdz_url` nullity is a server-contract fact, not a device limitation.

---

## T6 — "Is this the one? Help me decide."

Available on the piece detail (`ProductDetailView.swift:89-138,338-399`):

| Decision aid | Present | Acts | Note |
|---|---|---|---|
| Share | ✔ | 1 | `ShareLink` → `https://app.patina.cloud/library/<id>`, message `"{name} by {maker} on Patina"` (`Features/Shared/PatinaPortalLinks.swift:16-22`) |
| Save / revisit | ✔ | 1 | but see T4 |
| Maker story + provenance badges | ✔ | 0 | `:232-267` |
| Contextual help `?` | ✔ | 1 | surface `ios-app/product-detail`; ships an empty state until Sanity authoring lands (`:48-54`) |
| **Compare two pieces** | ✘ | — | no compare surface anywhere |
| **Notes on a piece** | ✘ | — | `TableItemModel.notes` (`:42`) and `CreateSavedItemPayload.notes` exist; **no UI writes either** |
| **Ask a designer, from here** | ✘ on screen | 2 via Companion | the piece-detail screen has **no** `Get design help` control (grep: the CTA appears on 11 other surfaces, not this one). The Companion's `.pieceDetail` menu carries it — orb (1) → `Get design help` (2) → the design-request sheet (`Features/Companion/Services/CompanionAreaBuilders.swift:65-70`) |
| Dimensions / lead time to decide against | ✘ | — | T3 |

**Acts to ask a human about the piece you are looking at: 2, and only if you know the orb is a menu.**

---

## T7 — "Buy it." — the purchase probe

**The path ends on the piece detail.** There is no cart, no checkout, no "Buy", no "Request a quote",
no vendor link, no `source_url` surfaced, and no price-inquiry affordance anywhere in the app. The
only Stripe rail (`create-checkout-session` → `SFSafariViewController`) belongs to **designer
invoices** (`Features/Invoices/Views/InvoiceDetailView.swift:45-52`,
`Services/API/InvoicesAPIClient.swift:7-16`) and is unreachable without a designer-created invoice.

**What the screen offers instead, verbatim** (`ProductDetailView.swift:338-399`):

> `Add to Room`  — and, once tapped —  `Saved ✓`

with, in the top bar, only: back chevron · `?` · Share · ♥.

**Taps to money: undefined — there is no path.** The nearest thing to a commercial next step is:
Companion orb (1) → `Get design help` (2) → `pickScans` (3) → `details` (4) → `review` (5) →
`Send` (6) → wait for a human to be matched (`Features/DesignServices/DesignRequestFlowView.swift:60-65`).
That is a lead form, not a purchase.

**Compliance note for U3:** because the app sells nothing today, App Store Review Guideline
3.1.3(e)/3.1.5(a) is not currently engaged; the invoice rail already uses the compliant external
(Stripe hosted) path.

---

## T8 — "I've ordered / my designer ordered — where is it?"

There is no order object in the client app, so "where is it" resolves to project/proposal/invoice
state. That state is **two acts behind a monogram**:

1. Home → tap the **monogram avatar** (top-right, no label; accessibility label `"Profile"`,
   `DailyGreetingHeader.swift:125`) → `ProfileView`
2. Scroll past avatar/stats to **`StudioHubView`** (`Features/Profile/Views/ProfileView.swift:123`)
3. Tap a section row — **`Awaiting you`** / `In progress` / `Conversation` / `Money & documents` /
   `Archive` (`Features/Profile/ViewModels/StudioQueueModels.swift:21-25`)

**Acts: 3** to a list, 4 to a detail.

Shortcut when something is genuinely pending: the home's `Next Move` becomes
**"Review a project decision"** — "{n} decisions need your eye." or **"Pick up the conversation"** —
"{n} unread messages are waiting." (`TodayExperience.swift:95-117`), **1 act**. But the ladder is
*strictly ordered*: a design-request continuation outranks both (`:48-56`), and once the counts hit
zero the card falls all the way back to `"Return to {Room}"` — i.e. **an active project with nothing
pending is invisible on the home.**

**"What changed since I last looked":** nothing computes it. The Studio queue shows current state
and due dates (`Features/Profile/ViewModels/StudioQueueBuilder.swift:92,140,178`), never a delta. No
last-seen timestamp exists for any of these surfaces.

---

## T9 — "Get a designer's help with this room."

**From the room (the coherent path):** Home → `Active Room` card (1) → scroll → CTA
**`Get design help with this room`** (2) → the design-request sheet opens **pre-scoped to that room**
(`Features/Rooms/Views/RoomProjectView.swift:65-70`) → `pickScans` (3) → `details` (4) → `review`
(5) → `Send` (6). **Acts: 6.** The room never leaves the request — `roomId` rides in the sheet's
associated value (`AppCoordinator.swift:598`).

Note: on an **empty** room the CTA is absent — the empty block offers only
`"Browse Picks for This Room"` (`RoomProjectView.swift:302-328`); the designer CTA is drawn under
the item list (`:65`) and, for `.overRange` budgets, as the nudge `"Get design help with this room →"`
(`Features/Rooms/BudgetAssessment.swift:45`).

**From the home:** there is no designer CTA. Alternatives: monogram → Profile →
**`Get design help`** (3 acts, room context lost — `roomId: nil`,
`Features/Profile/Views/ProfileView.swift:153-155`), or Companion orb → `Get design help` (2 acts;
`designerRow` passes the *active room* id on emergence/room surfaces, `nil` on the home,
`Features/Companion/Services/CompanionActionRows.swift:176-190`).

**Then, status.** After submit, `PushTokenService.promptForAuthorizationAfterFirstSubmission()` fires
the one and only notification prompt (`Services/API/PushTokenService.swift:87-108`). The request
becomes the home's `Next Move`: **"See your design request"** with the stage line as its detail
(`TodayExperience.swift:80-91`) — **1 act to the status detail** thereafter. Stage copy ladder in
`10-code-anatomy.md` A9. At `introduced`, `MatchIntroductionView` shows **"You're matched."**,
a `Portfolio` link, and slots with `Tap to book` / `Pick a time` /
`None of these work? Propose another time →`
(`Features/DesignServices/MatchIntroductionView.swift:93,126,239,281,294`).

---

## T10 — "The designer sent a proposal / an invoice is due. How do I find out?"

**What the app can send today: nothing.** APNs receive-side is wired end to end
(`App/AppDelegate.swift:38-174`, `Services/API/PushTokenService.swift`), the entitlement is
`aps-environment = development` (`apps/mobile/Patina/Patina/Patina.entitlements:5-6`), and the send
side is a documented backend stub (C14). There are **no local notifications** — no
`UNNotificationRequest` anywhere in the app — so the app cannot even remind you itself. There are no
widgets and no Live Activities (`10-code-anatomy.md` A15). **Polling is the mechanism**:
`BadgeCountService.refresh()` on appear / foreground / push, 5 parallel queries, no realtime
(`Services/Badges/BadgeCountService.swift:17-20,69-126`).

**What earns the permission today:** exactly one moment — the first successful design-request
submission, once per install, with **no pre-permission screen and no rationale copy**
(`PushTokenService.swift:87-108`). A user who never submits a request is never asked.

**So the answer to "how do I find out" is: you open the app and hope the Next Move card changed.**
Path when it does: Home → `Next Move` "Review a project decision" (1). Path when it does not, for a
proposal or an invoice — neither of which has a `Next Move` branch at all
(`TodayExperience.swift:95-118` covers only decisions and messages):

Home → monogram (1) → scroll to `StudioHubView` → `Awaiting you` → **`Proposals`** —
"{n} proposals are ready to review" / "Review by {date}" (2)
(`Features/Profile/ViewModels/StudioQueueBuilder.swift:128-150`) → `ProposalDetailView` (3) →
**`Sign proposal`** (4) → type full name → `Sign` (5) — `sign_proposal` RPC
(`Services/API/ProposalsAPIClient.swift:385-403`).

Invoices: same 3 acts to `InvoiceDetailView`, then **`Pay`** → hosted Stripe Checkout in
`SFSafariViewController`, then a 3 s/60 s poll on dismiss
(`Features/Invoices/ViewModels/InvoicesViewModel.swift:81-161`). Copy: "Pay securely by card or bank
transfer." (`InvoiceDetailView.swift:218`).

**Acts to pay an invoice from a cold open: 5.** ⚠ `sign_proposal` does not send the confirmation
email (carry-forward note, `ProposalsAPIClient.swift:403`).

---

## T11 — "Two weeks away. I'm back."

**0 acts.** The first screen is byte-identical to the one from fourteen days ago except:

- the **date line** (`"EEEE · MMM d"`);
- the **story card**, *if and only if* an editor published a row with a higher
  `sort_order`/`published_at` (`EditorialStoriesAPIClient.swift:72-79`) — the unread dot is on
  either way (`:119`);
- the **bell badge**, if the backend wrote `notification_log` rows;
- the **Next Move**, if one of eight state machines advanced.

Nothing punishes absence, and nothing acknowledges it: there is **no last-seen timestamp** for the
feed, story, room, or saved list, and no "new since your last visit" anywhere
(`10-code-anatomy.md` A20). `ContextMemoryStore` records only a coarse activity kind + opaque id +
time, and is **off until the user turns it on** (`Features/Settings/Views/SettingsView.swift:169-172`).

Two silent time-based changes a returning user *might* notice: a matched design-request card
disappears from promotion 14 days after the stage was reached
(`Services/DesignServices/DesignRequestStatusService.swift:352-360`), and the Companion orb
graduates to `.learned` — its "calm" attention state — at 14 days
(`Features/Companion/Models/CompanionCoachingModel.swift`, `daysToLearned`). Neither is explained.

The Companion *does* have written re-entry copy — "Evening. Something surfaced while you were away."
(`Features/Companion/Services/CompanionVoice.swift:70`) — but it lives in the conversation rail, not
on the home, and the home never reads `TimeOfDay`.

---

## T12 — "Show my partner."

**Share a piece: 1 act** from the detail top bar, or 2 via the browse card's ⋯ →
`Share` (`Features/Recommendations/Views/RecommendationsView.swift:318-324`), or from a Saved row
(`Features/Collections/Views/CollectionsView.swift:285`). All three share the same URL:
`https://app.patina.cloud/library/<productId>` (`Features/Shared/PatinaPortalLinks.swift:16-22`).

**Share a room: no path.** **Share a board: no path.** **Share the Saved list: no path.** Grep finds
exactly three `ShareLink` sites, all product links (plus `ScanSharingService` for the designer
hand-off).

**Second person can act: no.** There is **no invite, household, partner, co-viewer, or shared-account
concept anywhere in the app** — no invite flow, no household model, no second-seat RLS path invoked
from the client. The recipient's only affordance is a web link into the designer-portal Library
route.

**Dead share risk:** the app has **no associated-domains entitlement**
(`apps/mobile/Patina/Patina/Patina.entitlements` declares only `aps-environment` and
`com.apple.developer.applesignin`) and `Info.plist` declares only the custom scheme `patina`
(`Patina/Info.plist:15-27`). So the link the app hands your partner **cannot open the app** even if
they have it installed — it opens Safari.

---

## T13 — "One-handed on the bus · dark mode · larger text."

**Reach.** Every primary act on the home is a full-width card in the lower two-thirds
(`Next Move` at `DailyRoomView.swift:116-120`, `Active Room` at `:125-140`) — thumb-friendly. The
Companion orb sits in a reserved 120 pt bottom hearth (`ContentView.swift:166`,
`DailyRoomView.swift:142`) — the best-placed control in the app. The **three top-right glyphs**
(bell, `?`, monogram, `DailyGreetingHeader.swift:59-99`) are the worst: they are 36 pt targets in the
top-right corner, and the monogram is the **only door to the entire Studio** (T8).

**Dark mode.** Fully tokenized: every semantic color resolves through a trait-aware
`UIColor` provider (`PatinaColors.patinaDynamic`,
`apps/mobile/PatinaDesignKit/Sources/PatinaDesignKit/Tokens/PatinaColors.swift:154-166`) over a
warm-graphite dark palette (`:75-88`). A user override lives at Settings → Preferences →
`Appearance` (System / Light / Dark), applied app-wide via `.preferredColorScheme`
(`PatinaApp.swift:22,87`; `Features/Settings/Views/SettingsView.swift:204-236`). Deliberate
exceptions: `Background.dark` is static charcoal for camera/AR chrome
(`PatinaColors.swift:105-106`).

**Dynamic Type.** Every token is `relativeTo:`-anchored (`PatinaTypography.swift:21-104`), with two
deliberate fixed-size glyphs — the profile monogram and the 20 pt studio monogram
(`:106-116`). Accessibility-size branches are hand-written in the places that would break:
`TodayNextMoveCard` re-stacks vertically (`Features/Home/Views/TodayModules.swift:19-62`), Profile
stats go from a row to a column (`Features/Profile/Views/ProfileView.swift:184-201`), the room rail
switches from horizontal scroll to a `LazyVStack` (`:252-269`), and `StudioHubView` rows re-stack
(`Features/Profile/Views/StudioHubView.swift:254-287`).

**Motion.** Reduce Motion is honoured at every animated site: the story morph
(`DailyRoomView.swift:54,154`), the Strata mark's breathing
(`PatinaDesignKit/.../Components/StrataMarkView.swift:69-87`), the Companion shell
(`PatinaCompanionMotion.shellAnimation(reduceMotion:)`,
`PatinaDesignKit/.../Tokens/PatinaCompanionMotion.swift:23-30`), onboarding page changes
(`Features/Onboarding/Views/OnboardingFlowView.swift:74`).

**Acts: 0 — nothing here is a path; it is a property.** The one reach finding: the Studio is behind
a 36 pt unlabelled circle in the far corner.

---

## T14 — (designers) "What do my clients see of me?"

Walk it as the client of an `activeProject` designer.

| Where the designer appears | Copy / element | File:line |
|---|---|---|
| Home | **nowhere.** No name, no studio, no avatar, at any tier. The only trace is a Next Move detail line like "Sarah has your request in hand" while a request is pre-project (`TodayExperience.swift:80-91`) | `DailyRoomView.swift:104-145` |
| Profile → Studio hub | section rows only ("Active project", "Invoices", "Decisions") — the studio is **not** named in the queue | `Features/Profile/ViewModels/StudioQueueBuilder.swift:88-184` |
| Project detail | `StudioIdentityLine` — a 20 pt logo (or 2-initial monogram) + studio name. Renders **nothing** while resolving, and nothing at all when the resolver has no brand — a solo designer with only a personal name is invisible | `Features/Projects/Views/StudioIdentityLine.swift:18-41` |
| Design-request status | stage copy naming the studio ("{studio} has taken your request in hand — introduction on its way.") | `Services/DesignServices/DesignRequestStatusService.swift:139-157` |
| Match introduction | **"You're matched."**, intro text, `credentialLine`, `Portfolio` link, call slots | `Features/DesignServices/MatchIntroductionView.swift:93,126,239` |
| Messages | thread bubbles; composer `"Type a message…"` | `Features/Messaging/Views/ThreadDetailView.swift:266` |
| Pre-match placeholder | `DesignerConsultationView` — hero "Work with a designer" / "Send your room scans to a Patina designer. They'll reach out to help bring your space to life — and your scans stay on your phone until you choose to share them." + a card reading **"Matched Designer"** / "Based on your style profile" / "We'll pair you with a designer who understands your aesthetic" | `Features/DesignServices/DesignerConsultationView.swift:21-25,62-68` |

**"What do I want them doing here between meetings?"** — the acts the client actually has:
sign a proposal (5 acts, T10), pay an invoice (5 acts, T10), resolve a decision (4 acts + e-sign),
reply to a thread (4 acts), browse (4 acts, T3), save (1 act, but see T4), request more design help.

**"Would I send them here to buy?"** — there is nothing to buy (T7). Nothing in the app can credit a
purchase to a designer, because the app takes no money for goods. The only money the client can move
is an invoice the designer raised in the portal — which is exactly the attribution D1/D3 want, and
also the only commerce that exists.

---

## Simulator-only limits (declare these in every walk)

`RoomPlan`, LiDAR depth, and ARKit world tracking are **unavailable in the iOS Simulator**. In this
program that means:

| Capability | Sim behaviour | Consequence for the walks |
|---|---|---|
| `RoomCaptureSession.isSupported` | `false` | `QuietConversationFlowHost` always takes the **manual** fork (`Features/RoomScan/Views/QuietConversationFlowHost.swift:151`); the guided walk, threshold, HUD, coverage coach and keyframe instrument are never seen |
| `ARWorldTrackingConfiguration.supportsSceneReconstruction(.mesh)` | `false` | `ARPlacementViewModel` mesh gate is off (`Features/ARPlacement/ViewModels/ARPlacementViewModel.swift:115`) |
| `ARPlacementView` camera | no session | AR cannot be walked at all — *and it would dead-end anyway on `usdz_url = NULL` (T5)* |
| Camera / photo capture | no device camera | the camera-permission primer and posed-photo capture are not exercisable |
| APNs | no push delivery on Simulator | T10's push half is **code-read only**; `didFailToRegisterForRemoteNotifications` is expected and logged quietly (`App/AppDelegate.swift:69-76`) |
| `--uitesting` launch arg | resets auth, disables PostHog flags (`PatinaApp.swift:25-27,79-81`) | a flagged variant (e.g. `onboarding_walk_first`) cannot be observed under it |

Per instruments §11, every camera / LiDAR / AR claim in this file is labelled **code-read**.
