# GAP8 — production composition mapping for the five signed-in modules

Lane GAP8 · gap-fill finder · 2026-09-01 · **READ-ONLY** (SELECT-only SQL against Strata
`bkvcixdmuyejfzcijpdg`, one read-only GROQ query against Sanity `kv3qrinl/production`, static
Swift reads). No code edits, no git writes, no production writes. **Nothing here is
simulator- or device-verified**; every screen state below is *derived* — code-read plus
server-verified data — because a production walk is impossible (A3-16: `tester@patina.cloud`
+ `000000` does not authenticate in the app; Sign in with Apple is unusable on a Simulator;
creating a production account is forbidden).

Modules in scope: `DailyRoomView` + `TodayExperience`/`HomeComposition`, `YourSpacesView`,
`RecommendationsView`, `StudioHubView`/`StudioQueueBuilder`, `BadgeCountService`.

---

## 0. The two accounts this lane models

| | brand-new account (email code, in-app signup) | `tester@patina.cloud` |
|---|---|---|
| uid | — | `86cdd0aa-403c-4154-ae63-69105425e506` |
| `profiles.display_name` | **NULL** (`handle_new_user` reads `raw_user_meta_data->>'display_name'`/`full_name`; `AuthService.sendMagicLink` sends only `role`) | `Test Guy` (written by the studio-invite accept) |
| `profiles.full_name` | NULL | NULL |
| `profiles.role` / `is_designer` | `homeowner` / false | **`designer` / true** |
| projects / decisions / invoices / proposals | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 (verified) |
| comms thread participations | 0 | **0** (verified) |
| rooms / saved_items | 0 / 0 | **0 / 0** (verified) |
| `notification_log` rows the app can see | **0** | **1** (see §5) |
| leads / design requests | 0 | 0 |

Neither account can reach `EngagementTier` above `.discovering`: `resolve()` needs a project,
proposal, invoice, decision or a live lead, and both have none. `resolveState` returns
`.known(.discovering)` once `BadgeCountService.hasLoaded` and
`DesignRequestStatusService.hasLoaded` are true — which they will be, because all five
carrying fetches return `200 []` (grants and RLS verified; see §6).

---

## 1. Server facts re-verified in this lane (Strata, this session)

```
editorial_stories        3 rows, 3 published, 0 with hero_image_url
products                 15 total, 1 with layer='catalog' AND status='published'
  that row               id a7fa2107…  name "Smoke Test Ceramic Lamp"
                         brand NULL · vendor_id NULL · retailer_id NULL
                         images []     · published_at NULL · price_retail 2000
                         category 'lighting'
vendors 4 · profiles 24
migrations               … 00530, 00531, 00532, [GAP], 00541 … 00554
to_regclass('public.client_designer_roster') → NULL
to_regclass('public.profile_presence')       → NULL
pg_proc get_direct_order_terms               → 0
pg_proc increment_scan_upload_attempt        → 0
products.photo_verified_at / shipping_flat_cents → absent
```

`get_recommendations` signature **on Strata**, verbatim from `pg_get_function_result`:

```
TABLE(id text, name text, price_cents integer, match_score integer, maker_name text,
      maker_location text, maker_story text, image_url text, usdz_url text,
      style_tags text[], material_tags text[], badges text[], category text, tier text)
```

That is the **00067 frozen prefix and nothing else** — the fourteen columns 00533 was written
to widen. Absent from the wire: `dimensions, lead_time_weeks, brand, description,
published_at, finish, patina_managed, photo_verified_at, source_url, shipping_flat_cents`
(`supabase/migrations/00533_piece_detail_contract.sql:85-96`).

### The editorial rows — the single most consequential difference from the local seed

`supabase/migrations/00143_editorial_stories.sql:138-175` seeds the three rows with
`published_at = NOW() - INTERVAL '1 day' / '2 days' / '3 days'`. That is evaluated **when the
migration runs**. On a local `pnpm supabase:reset` the story is *yesterday*. On Strata it ran
once, and the values are frozen:

| id | tag | title | published_at | read_minutes | body chars | hero_image_url |
|---|---|---|---|---|---|---|
| …1a01 | Maker Spotlight | The Grain Whisperer of Maine | **2026-07-06** | 4 | 489 | NULL |
| …2a02 | Editor's Note | Patina: The slow shape of home | **2026-07-05** | 3 | 386 | NULL |
| …3a03 | Material Study | A defense of imperfect linen | **2026-07-04** | 5 | 387 | NULL |

Today is 2026-09-01. **The story a production tester meets is 57 days old.**

### Sanity — live first-launch-tour copy (read-only GROQ, this session)

`kv3qrinl / production`, all three `_updatedAt 2026-07-28T19:44:27Z`:

- `ios-app/first-launch-tour/step-1-home` → heading **"Welcome to Patina"**, body
  **"This is your Daily Room — picks and stories chosen for your space."**
- `ios-app/first-launch-tour/step-2-saved` → **"Save what you love"** /
  "Add pieces to a room with + Add — they follow you everywhere."
- `ios-app/first-launch-tour/step-3-profile` → **"Your profile"** /
  "Rooms, saved pieces, and settings live here."

`FirstLaunchTour` renders `loaded?.body ?? step.fallback?.body` — **Sanity wins**. The binary
fallbacks (`FirstLaunchTour.swift:274-299`) are the *correct, current* sentences
("This is Today — what moved in your house, and what is waiting on you.") and are never seen.
Lane B observed the Sanity copy rendering on the local walk, so this is not conditional on the
Supabase backend.

---

## 2. Every query each module issues, and its production answer

### DailyRoomView / DailyRoomViewModel

| call site | request | prod answer (both accounts) |
|---|---|---|
| `refreshTodaysStory` → `RecordForeground.todaysStoryRow` → `EditorialStoriesAPIClient.fetchCandidates` | `GET /rest/v1/editorial_stories?select=*&order=published_at.desc,sort_order.desc&limit=5` | **3 rows**; `StoryReadStore.nextStoryId` picks the first unread → *The Grain Whisperer of Maine* |
| `refreshFeedForSelectedRoom` | `POST /rest/v1/rpc/get_recommendations {p_room_id, p_limit:20, p_offset:0}` | **never fires** — guarded on `selectedRoomID` + `remoteIdByLocal`, and there are no rooms (`DailyRoomViewModel.swift:279-286`). `allRecommendations = []`, `isFeedLoading = false`, `feedError = nil` |
| `refreshNewThisWeek` | `POST …/get_recommendations {p_limit:24}` | **0 rows** (§3) — and structurally unusable (§4) |
| `refreshProjectRooms` | `GET /rest/v1/project_rooms?...` | **never fires** — `BadgeCountService.projects` is empty (`:407-411`) |
| `refreshRecord` → `RecordForeground.run` | composes over `BadgeCountService` + saved items + the story row | **`HouseRecord.empty`** (§4) |
| `ProfileService.mirrorLastSeenIfNeeded` | `UPSERT /rest/v1/profile_presence` | **HTTP 404 `PGRST205`** — table absent. Swallowed at `.debug` (`ProfileService.swift:168-172`) |
| `RoomSyncCoordinator.reconcile` → `RoomsAPIClient.listRooms` | `GET /rest/v1/rooms?select=*` | `200 []` |
| `NotificationsViewModel.load` → `NotificationsAPIClient.list` | `GET /rest/v1/notification_log?select=*&channel=in.(in_app,push)&status=in.(queued,sending,delivered,unconfirmed,opened,clicked)&order=created_at.desc&limit=50` | new: `200 []` · tester: **`200` [1 row]** (§5) |

### BadgeCountService.performRefresh — six parallel reads

| fetch | endpoint | prod answer |
|---|---|---|
| `DecisionsAPIClient.listPending` | `client_decisions?status=eq.pending&…` | `200 []` |
| `MessagingAPIClient.listThreadSummaries` | `comms_threads?select=…&order=last_message_at.desc` | `200 []` |
| `ProposalsAPIClient.listProposals` | `rpc/list_client_proposals` | `200 []` |
| `InvoicesAPIClient.listInvoices` | `invoices?select=…` | `200 []` |
| `ProjectsAPIClient.listProjects` | `projects?select=<projectSelect>&order=updated_at.desc` | `200 []` |
| `RosterAPIClient.listRoster` | `client_designer_roster?client_id=eq.<uid>&status=eq.active` | **HTTP 404 `PGRST205`** — view absent (00536 unapplied). Swallowed by `try?` (`BadgeCountService.swift:200`) |

Result: `hasLoaded = true`, `lastRefreshFailed = false`, every count 0, `roster` permanently `[]`,
`attentionCount = 0`, `attentionHint = nil`, `studioHint = nil`.

### StudioHubViewModel.load — seven sources + OrdersService

`projects / decisions / proposals / invoices / documents(project_documents) / threads /
notifications`, all `200 []` except `notifications` for tester (1 row). `OrdersService.refresh()`
reads `fulfillment_orders`; `authenticated` **has** the SELECT grant (verified) and RLS carries
only `*_select_admin` / `*_select_agent_reader`, so a client gets `200 []` — no visible error.
`failedSources = []` → no partial-load notice, no error state.

### RecommendationsView / RecommendationsViewModel

`loadRecommendations(roomId: nil)` → `POST rpc/get_recommendations {p_limit:20, p_offset:0}` →
0 rows → `withholdingUnresolvedMakers([]) == []` → `products = []`.
`seedSavedState` → `saved_items?user_id=eq.<uid>` → `200 []`.

### YourSpacesView

No network of its own beyond `RoomSyncCoordinator.reconcile` (`200 []`). Renders off a
SwiftData `@Query`, which is empty on a fresh install.

---

## 3. Why `get_recommendations` returns zero (derivation, not a call)

A3 established the chain server-side; this lane re-verified its two load-bearing inputs.
Calling the RPC writes a `match_events` row, so it was **not** invoked.

1. Stage-0 candidate filter is `p.layer='catalog' AND p.status='published'` → **1 row**.
2. That row is the smoke-test lamp: `brand NULL`, `vendor_id NULL`, `images []`,
   `published_at NULL` (verified above).
3. Signal-less callers resolve to the shared neutral profile
   `ae460000-0000-4000-8000-00000000e057` whose `style_vector` is NULL → the ANN insert is
   skipped; the spectrum fallback needs `_aesthete_product_spectrum(p.id)` non-null, and A3
   measured it NULL for that row → `_ae_cand` empty → **0 rows out**.
4. **Even at step 4 the app would drop it.** With no `brand` column on the wire,
   `Product.resolvedMakerName` (`ProductModel.swift:222-230`) falls to `makerName`, which the
   RPC sets to `COALESCE(v.name,'Unknown Maker')` = the literal it explicitly rejects →
   `hasResolvableMaker == false` → withheld by
   `ProductAPIClient.withholdingUnresolvedMakers`.

**The consequence for the fix program: publishing catalogue rows will not, on its own, put
pieces on screen.** Until 00533 ships (adding `brand` to the projection) *or* every published
catalog product carries a `vendors` row, the client withholds it.

---

## 4. `published_at` is not on the wire — NEW THIS WEEK is structurally dead

`NewThisWeek.rows` (`NewThisWeekRail.swift:24-37`) keeps only products whose
`publishedAt` is non-nil and inside seven days, and returns `[]` below a floor of 3.
`Product.publishedAt` decodes from the key `published_at` — which the Strata
`get_recommendations` **does not return**. So `newThisWeekCount` is `0` for every caller, on
every launch, **whatever the catalogue contains**. `HomeComposition.blocks` therefore never
appends `.newThisWeek` on production. This is a 00533 dependency, not a content gap.

### The Record never draws either

`HouseRecord.build` window-filters MOVED rows to a rolling 7 days (`HouseRecord.swift:271-284`),
with only `.matchedDesigner` and `.savedPieceRepriced` exempt as standing conditions. The
story row (`storyRow`, `:535`) carries the story's real `published_at` = **2026-07-06** → it
falls outside the window → dropped. NEEDS YOU is empty (0 decisions / 0 proposals / 0 invoices).
So `record.needsYou == []` and `record.moved == []` → `record.isEmpty == true`.

`HomeComposition.recordDraws` returns `!record.isEmpty || (isSignedIn && tier >= .engaged)` —
false on both counts. **The Record card does not mount on production for any first-round
tester.** Locally the same code mounts it, because the seeded story is *yesterday* and lands
inside the window — which is precisely the row visible in `shots/A/44-home-signedin.png`
("A new story from the workshop. — AUG 31").

---

## 5. `tester@patina.cloud`'s one notification

```
id       adf06c58-ceee-44f3-9a5e-9e9b0f8218d8
type     welcome_series      channel in_app      status delivered
opened_at NULL   clicked_at NULL   created_at 2026-09-01 17:30:04Z
metadata { "headline": "Welcome. Replay the walkthrough anytime from the Help shelf.",
           "message": "", "deep_link": "https://app.patina.cloud/help" }
```

The other three rows are `channel = 'email'` and are filtered out by the app's
`channel=in.(in_app,push)`. RLS: `Users can read own notification logs — auth.uid() = user_id`
→ visible.

What `AppNotification.init(from:)` (`NotificationsAPIClient.swift:127-161`) does with it:

- `entity_type` / `entity_id` → absent → `AppNotificationType(entityType:)` returns nil
- → `AppNotificationType(serverType: "welcome_series")` → `default` → **`.newRecommendations`**
- `title = metadata["title"] ?? type.defaultTitle` → the key is `headline`, not `title` →
  **"New pieces for you"**
- `body = metadata["body"] ?? metadata["preview"] ?? ""` → the key is `message` → **`""`**
- `isRead = false` → the bell draws an unread badge of **1**
- `route = NotificationRouter.route(for:)` → `guard let entityType, let entityId` fails →
  **nil** → `handleTap` marks it read and navigates nowhere
  (`NotificationFeedView.swift:223-225`)

Origin: `welcome_series` is the **designer** onboarding drip
(`00292_designer_onboarding_enrollment.sql`), gated on `profiles.is_designer`. tester has
`is_designer = true` because Kody accepted a studio invite on that account. A brand-new
homeowner gets zero rows — so this defect belongs to *exactly the account handed to testers*.

Knock-on: `StudioQueueBuilder.notificationRow` emits for tester → `attentionSummary
.unreadUpdateCount = 1` → the Studio subhead reads **"1 new Studio update"**.

---

## 6. (a) Predicted production screen state, per module

Flags OFF (TestFlight first launch) → single-stack root, no tab bar, Companion orb at the
bottom. Everything below is *derived*, not observed.

### 6.1 Today — `DailyRoomView`

`HomeComposition.blocks(for:)` with
`isSignedIn: true, tier: .discovering, record: .empty, roomCount: 0, newThisWeekCount: 0,
hasStory: true, hasDesigner: false, localRoomCount: 0, savedPieceCount: 0`:

```
[.header, .nextMove, .startWithARoom, .story]
```

(`recordDraws` false → no `.record`; `nextMoveDraws` true; no seat, no `.roomHero`
(needs localRoomCount == 1), `.startWithARoom` not `.houseRail`, no `.newThisWeek`,
no `.savedSummary`, no `.signInLine` when signed in.)

Rendered, top to bottom:

1. `DailyGreetingHeader` — "TUESDAY · SEP 1" / "Good afternoon." / bell / "?" / **Studio pill,
   no badge** (`attentionCount == 0`). Bell badge: **none** for a new account, **1** for tester.
2. `TodayNextMoveCard` — `TodayExperience.roomMove` with `activeRoom == nil` →
   **"Bring your first room into Patina" / "A short scan gives the Companion a real space to
   work from."**, `camera.viewfinder`, `↗`.
3. `StartWithARoomBlock` — "YOUR HOUSE" eyebrow / "Start with a room" / the two cards
   *Type the dimensions* + *Scan it*.
4. `DailyStoryCard` at hero height 180 (`storyWeight` = `.hero` because the record is empty) —
   gradient `hero`, **no photograph**, chip **"JUL 6 · 4 MIN READ"**, eyebrow
   "MAKER SPOTLIGHT", "The Grain Whisperer of Maine", unread dot.
5. `Spacer(120)`.

**This is byte-for-byte the guest home already captured in `shots/A/27-guest-home.png`, minus
the "Sign in to keep this on every device." line and with the chip reading JUL 6 instead of
AUG 31.** Signing in changes nothing a tester can see.

Companion caption: `projectAttentionSummary` is nil (no promoted request, `studioHint` nil) →
the orb caption stays the default "NEXT STEPS", never "N THINGS NEED YOUR EYE".

First-launch tour: step 2's anchor `.todayRecord` never mounts → the model drops it after the
grace window and renumbers → **"Step 1 of 2" → "Step 2 of 2"**, exactly as lane B saw locally.
Step 1's rendered body is Sanity's *"This is your Daily Room — picks and stories chosen for
your space."* over a screen with no picks.

### 6.2 Spaces — `YourSpacesView`

`@Query` → 0 rooms → `rooms.isEmpty` → the empty branch. On the flag-off root
`isTabRoot == false`, so the "Your Spaces" header is **not** drawn — only:
sync pill (absent), "⌂" tile, **"No rooms yet"** + `HelpInfoIcon`, the scan-CTA paragraph,
**"◎ Scan Your First Room"**. Identical to the local guest capture; no production delta.

### 6.3 Pieces / Browse — `RecommendationsView`

- Title "Browse pieces"; subtitle **"0 pieces chosen for your space"**
- `SavedDoorRow` only on the tab root (flags OFF → not drawn)
- chips All / Seating / Tables / Lighting / Storage
- `viewModel.filteredProducts.isEmpty` → `PatinaEmptyState`
  icon `sparkles`, title **"Nothing here yet"**, message **"Save pieces you love or take the
  style quiz to tune what shows up."**, CTA **"Take the style quiz"** → `.styleQuiz`
- R-06's "does not fill the screen" applies: this state sits at `.padding(.top, 60)` in a
  `VStack` under the chips, with the rest of the screen empty.

Every chip re-issues the RPC with `p_category` and returns the same empty state.

### 6.4 Studio — `StudioHubView` + `StudioQueueBuilder`

Header: "STUDIO" / "The work around your home, in one place." / subhead —
`BadgeCountService.studioHint` is nil for both accounts, so it falls to
`snapshot.attentionSummary.hint`:

- brand-new account → nil → **"Nothing needs your attention right now."**
- tester → `unreadUpdateCount == 1` → **"1 new Studio update"**

Five section cards, always all five (`ForEach(StudioQueueSectionKind.allCases)`):

| section | badge | content |
|---|---|---|
| Awaiting you | `0` | empty message **"Nothing needs a decision."** |
| In progress | `0` | **"No active projects yet."** |
| Conversation | **`1`** (new) / **`2`** (tester) | row *Conversation · "No messages yet"* → `.threadList`; tester also *Studio updates · "1 unread update"* → `.notifications` |
| Money & documents | `0` | **"No shared records yet."** |
| Archive | `0` | **"Nothing has been archived."** |

`conversationThreadRow` is emitted unconditionally (SP-13), which is why the Conversation
badge reads a non-zero **category** count over a row that says nothing exists.

Enclosing `ProfileView` header: avatar monogram + `UserIdentity.displayName`, "Member since
Sep 1, 2026", style badge, **0 ROOMS / 0 SAVED**. Name resolution
(`ProfileViewModel.swift:16-47`, `ProfileService.swift:189-191`):

- tester → `profiles.display_name = "Test Guy"` → **"Test Guy"**, monogram "T"
- brand-new email-code account → display_name and full_name NULL → falls through to
  `profiles.email` → `localPart` → **the email's local part**, e.g. "jane.smith", monogram "J"
- Apple → `captureAppleName` writes the name to **GoTrue user metadata** *after*
  `handle_new_user` created the profile row, and `UserIdentity` consults the profile branch
  first (which is never empty, because it ends at `email`) → the captured name is **never
  read**; a private-relay tester is greeted by a random relay local part.

### 6.5 BadgeCountService

Every count 0, `roster` `[]` (its fetch 404s), `hasLoaded` true, `lastRefreshFailed` false,
`attentionCount` 0, `attentionHint` nil, `studioHint` nil, `activeProjectCount` 0.

---

## 7. (b) Existing findings whose severity changes on production

### Vanish / unreachable — measured only because the local seed had data

| id | why it cannot occur on production |
|---|---|
| **A-34** every recommendation scores 40–46 % | zero recommendations; no match pill renders |
| **A-35** product images contradict titles | those rows are local-seed only; the 1 prod catalog row has `images []` |
| **A-36** two cards are flat colour blocks | no cards |
| **A-37 / A-38 / A-39** the "why this piece" line | the reason line is composed client-side over products that never arrive |
| **A-42** same piece, two match scores (41 vs 50) | requires a product in both grid and detail |
| **A-43** "Designers Pick" · **A-44** "Accent-Chair" slug | product-detail badges on a seeded row |
| **C-11 / shots C/11-dark-browse** three match scores 45–57 %, repeated truncated rationale, orb over row-2 cards | the browse grid is an empty state on production |
| **C5-16** rooms print the literal "UNKNOWN MAKER" | needs a `saved_items` row whose `makerName` came from the RPC; the app withholds every such product before it can be saved, and no production account has saves. Its own 0.85 confidence note asked exactly this question — **answered: `products.brand` coverage on Strata is 0/1, and `brand` is not even on the wire** |
| **A-81** four different counts of "what needs you" | bell 0, Studio pill unbadged, caption "NEXT STEPS", no NEEDS YOU list — one number, and it is zero |
| **A-83** "MOVED" is an opaque header · **A-84** one greyed row | the Record card does not mount (§4) |
| **A-85** orb occludes the designer card and room rail | no designer seat, no house rail |
| **A-96** (partly) room imagery is a gradient block | no rooms exist to draw |
| **R-01 / R-02** outage-time false empties in the Studio and on Today | the "false" half is unreachable: the Studio's true state *is* empty, so an outage cannot contradict it. The **timing** half (~50 s spinner, no retry) still stands |
| **C4-03** (half) two empty states *lie to a client who has data* | no production tester has rooms or saves, so the lie cannot occur. The **"indistinguishable from a failed fetch"** half stands and gets worse (below) |
| **C4-01** unknown tier shows a paying client the brand-new home | there are no paying clients on production; the composition it warns about **is** the correct one |

### Get worse on production

| id | why |
|---|---|
| **R-06** browse doesn't fill the screen in loading/error/empty | the empty state is no longer an edge case — it is the app's entire marketplace, on every launch, forever |
| **A-65** nothing the guest just did appears on the home | on production the quiz is followed by *zero* products anywhere, so the five questions are provably pointless |
| **A-68** the MAKER SPOTLIGHT hero has no photograph | it is now the **only** content block on Today, and it is two months old |
| **A-66** four names for one place | the tour's Sanity copy ("your Daily Room") is the live text, and it is the first sentence the app speaks |
| **A-58 / A-63** guest has no home worth the name | unchanged for guests, but now equally true *signed in* — signing in adds nothing to Today |
| **A-80** notifications show the empty state while loading | for tester this resolves to one dead row; for everyone else the bell is permanently empty, so the empty state is the only state |
| **A-59/A-60/A-61/A-62** tour craft + "Your profile" vs "Studio" | **unchanged** — the copy is Sanity-sourced and identical on prod; step count drops 3 → 2 |
| **C4-17** no skeletons; Today has no loading state at all | Today's only async block is the story; on production it is the only thing that can be slow, and its absence collapses the screen to two cards |
| **G-15 / testflight-config** | unchanged by data |

### Unchanged

`YourSpacesView` (identical: 0 rooms locally as guest and on production), every auth/onboarding
finding before the first fetch, every visual-system/Dynamic-Type/dark-mode finding measured on
chrome rather than content, and the whole `G-*` gate lane.

---

## 8. (c) Only closable by Kody signing a real tester in

1. **Does the email-code path actually deliver on Strata?** The `{{ .Token }}` magic-link
   template patch (2026-07-12) lives only in the dashboard; nothing in-repo tracks it and it
   was not re-verified this session or by A3. If it regressed, the first-round tester cannot
   sign in at all — a blocker nobody can see from here.
2. **What the Studio header actually prints for a fresh account** (§6.4) — needs a real signup,
   which is forbidden. Predicted: the email local part.
3. **Whether Apple sign-in yields a private-relay address**, and what the header/monogram then
   read.
4. **Whether the first-launch tour's Sanity fetch succeeds in a Release/TestFlight build.**
   R-10 recorded the *article-list* GROQ returning HTTP 400 on the same project; the coachmark
   path is a different query and rendered fine in Debug. If it 400s in Release the tour falls
   back to the binary copy — which would silently *fix* GAP8-05.
5. **tester@patina.cloud's bell** (§5) — the predicted "New pieces for you" / empty body /
   dead tap needs one screenshot to confirm.
6. **The live `get_recommendations` response for an authenticated caller.** Calling it writes a
   `match_events` row (and can insert a `client_style_profiles` row), so it was derived, not
   invoked. One authenticated call from Kody settles it.
7. **Whether PostHog resolves the three flags on a second launch** for a targeted tester, and
   therefore whether any tester ever sees the four-tab root.
8. **The push primer.** `PushPrimerTrigger.shouldPresent(rows:)` reads the notification feed;
   with 0 rows (new account) it cannot fire, and with tester's one `welcome_series` row the
   trigger's predicate is untested against a non-money row.

## 9. Not verified in this lane

- Anything simulator- or device-observed. Every screen state is derived.
- The live RPC response (§8.6) and the live GoTrue mail templates (§8.1).
- Whether `_aesthete_product_spectrum` is genuinely NULL for the one catalog row — taken from
  A3's server-verified measurement rather than re-run (the function's volatility was not
  checked, and this lane made no calls that could write).
- Sanity persona resolution: every `ios-app/*` document is `persona: "all"` while the app's
  enum is `designer|maker|consumer|admin`; the tour rendered locally, so the fallback chain
  works, but the exact GROQ path was not traced.
- PostHog flag state, APNs credentials, App Store Connect state.

---

# LANE GAP8 — FINDING LEDGER

All findings are **server-verified + code-read**. None is simulator- or device-verified.

---

## GAP8-01 · Today's only content block is a 57-day-old story, and it prints the date
- area `today-home` · severity **major** · testerVisible **yes** · confidence 0.98 · effort S
- where: `supabase/migrations/00143_editorial_stories.sql:138-175`;
  `Features/Home/Views/DailyStoryCard.swift:22-24,78-82`;
  `Features/Home/Views/HouseRecordCard.swift:126` (`HouseRecordDates.short` = `"MMM d"`, no year)
- evidence: the seed inserts `published_at = NOW() - INTERVAL '1 day'`, evaluated when the
  migration ran. Strata rows, verified: `2026-07-06 / 07-05 / 07-04`. Today is 2026-09-01.
  `datedReadTimeLabel` = `"\(HouseRecordDates.short(date)) · \(story.readTimeLabel)"`,
  `.textCase(.uppercase)` → the chip on production reads **"JUL 6 · 4 MIN READ"**.
  Every audit shot (`shots/A/27-guest-home.png`, `44-home-signedin.png`) reads "AUG 31",
  because a local `supabase:reset` re-evaluates `NOW()`.
- why it matters: on production this card is the *only* content on the app's home screen
  (GAP8-02/03/04), it carries no photograph (A-68), and it stamps its own staleness in a chip.
  A tester's first impression of a "Daily" surface is content from two months ago.
- fix: give `editorial_stories` real rows with real dates on Strata, or drive `published_at`
  from a scheduled refresh; add the year to the chip when the date is not in the current year.

## GAP8-02 · The Record — Today's headline block — never mounts for any first-round tester
- area `today-home` · severity **major** · testerVisible **yes** · confidence 0.95 · effort M
- where: `Features/Home/Models/HouseRecord.swift:271-284,535-548,186`;
  `Features/Home/Models/TodayExperience.swift:253-256,273-297`
- evidence: NEEDS YOU is empty (0 decisions/proposals/invoices, verified for tester and
  structurally for any new account). The one MOVED row a content-free account can produce is
  the story row, and `build` drops any MOVED row outside a rolling 7-day window
  (`window.contains(row.date)`) — the story is 57 days old. So `record.isEmpty` is true, and
  `recordDraws` = `!isEmpty || (isSignedIn && tier >= .engaged)` is false at `.discovering`.
  Locally the same code mounts a six-row card (`shots/A/44-home-signedin.png`) purely because
  the seeded story is yesterday.
- why it matters: the Record is the unflagged centrepiece of the W1 home. On production the
  signed-in Today is identical to the guest Today minus one line — signing in buys the tester
  nothing visible. Three audit findings (A-81, A-83, A-84) and one tour step were measured
  against a card no tester will see.
- fix: decide what the Record says at `discovering` with an empty house — today it says
  nothing at all, which is the one option the composition rules never contemplated.

## GAP8-03 · NEW THIS WEEK can never render on production — `published_at` is not on the wire
- area `today-home` · severity **major** · testerVisible **yes** · confidence 0.97 · effort M
- where: `Features/Home/Views/NewThisWeekRail.swift:24-37`; `Core/Models/ProductModel.swift:41,68,108`;
  `supabase/migrations/00533_piece_detail_contract.sql:85-96`
- evidence: `pg_get_function_result` for `public.get_recommendations` on Strata returns the
  14-column 00067 prefix only — no `published_at`, `brand`, `description`, `dimensions`,
  `patina_managed`. `Product.publishedAt` decodes from `published_at`, so it is always nil;
  `NewThisWeek.rows` keeps only rows with a non-nil `publishedAt` inside 7 days →
  always `[]` → `HomeComposition.blocks` never appends `.newThisWeek`.
- why it matters: this is not "the catalogue is empty" — the rail is dead **whatever** Kody
  publishes, until 00533 lands. Any fix plan that assumes seeding products restores the home
  is wrong.
- fix: apply 00533–00540 to Strata (they are the iOS server contract and the migration ledger
  jumps 00532 → 00541).

## GAP8-04 · Even with a catalogue, every product surface stays empty until 00533 or vendor rows land
- area `product` · severity **major** · testerVisible **yes** · confidence 0.92 · effort M
- where: `Core/Network/ProductAPIClient.swift:75-92`; `Core/Models/ProductModel.swift:222-233`;
  00246:278 (`maker_name := COALESCE(v.name,'Unknown Maker')`)
- evidence: with `brand` absent from the pre-00533 projection, `resolvedMakerName` falls to
  `makerName`, which the RPC sets to the literal `Unknown Maker` for any product with no
  vendor — and `resolvedMakerName` explicitly rejects that literal. `withholdingUnresolvedMakers`
  then drops the row from both feeds. Strata's one `layer='catalog' AND status='published'`
  row has `brand NULL` **and** `vendor_id NULL`, so it fails both paths.
- why it matters: SP-10's rule is right, but on production it silently converts "product with
  no vendor row" into "product that does not exist". A content push that adds catalog rows
  without vendors will look like the deploy did nothing.
- fix: ship 00533 so `brand` reaches the client, or make vendor attachment a publish gate; and
  log the withheld count outside `#if DEBUG` so this is visible in prod telemetry.

## GAP8-05 · The first sentence the app says on production is false, and it comes from Sanity
- area `help-tour` · severity **major** · testerVisible **yes** · confidence 0.95 · effort S
- where: Sanity `kv3qrinl/production`, `helpContent` `_id cb2047b7-8ea6-4b6b-9f4d-12e2e66b9c54`,
  surfaceKey `ios-app/first-launch-tour/step-1-home`, `_updatedAt 2026-07-28T19:44:27Z`;
  `Features/Help/FirstLaunchTour.swift:274-282`
- evidence: live body, verbatim — **"This is your Daily Room — picks and stories chosen for
  your space."** The binary fallback on main is the correct, current sentence
  ("This is Today — what moved in your house, and what is waiting on you."), and
  `FirstLaunchTour` renders `loaded?.body ?? step.fallback?.body`, so **Sanity wins**.
  Lane B observed the Sanity text rendering on the local walk, so the CMS path is live.
  On production there are zero picks (GAP8-03/04).
- why it matters: the tour is the first thing a tester reads, it names the screen something the
  app never calls it (A-66), and it promises the one thing production cannot deliver.
  Step 3's Sanity copy is likewise stale ("Your profile" against a control labelled "Studio" —
  A-60), so A-60 does **not** vanish on production.
- fix: publish `artifacts/ios-daily-return-2026-08-26/waves/w3/n3-sanity-copy.md` to Sanity
  before the TestFlight round — it is written and unshipped. (Already on Kody's OWED list.)

## GAP8-06 · tester@patina.cloud's bell shows "New pieces for you" with an empty body and a dead tap
- area `notifications` · severity **major** · testerVisible **yes** · confidence 0.95 · effort S
- where: `Core/Network/NotificationsAPIClient.swift:127-161,224-233`;
  `App/DeepLinking/NotificationRouter.swift:61`; `Features/Notifications/Views/NotificationFeedView.swift:223-225`
- evidence: the single app-visible `notification_log` row for tester
  (`adf06c58-ceee-44f3-9a5e-9e9b0f8218d8`, `type welcome_series`, `channel in_app`,
  `opened_at NULL`) carries `metadata = {headline, message:"", deep_link}`. The mapper reads
  `metadata.title` / `metadata.body` / `metadata.preview` — none of which exist — so
  `title = AppNotificationType.newRecommendations.defaultTitle` = **"New pieces for you"** and
  `body = ""`. `entity_type` is absent → `route` is nil → the tap marks read and navigates
  nowhere. The bell draws an unread badge of **1**.
- why it matters: this is the account Kody hands testers. The first badged thing in the app
  announces new pieces on a marketplace with none, in a row with no text and no destination,
  and its real content (a designer-portal help pointer) is lost. `deep_link`
  `https://app.patina.cloud/help` is a host the app does not claim, so even a wired route would
  leave to Safari.
- fix: read `metadata.headline`/`metadata.message` alongside `title`/`body`; give
  `welcome_series` its own bucket instead of falling through to `.newRecommendations`; suppress
  designer-drip rows in the client app (gate the feed on the client-facing `type` set).
- note: origin is `00292_designer_onboarding_enrollment.sql`, gated on `profiles.is_designer`,
  which is `true` on tester because a studio invite was accepted. A brand-new homeowner sees
  none of this.

## GAP8-07 · The Studio header greets a production tester by their email local part
- area `settings-account` · severity **major** · testerVisible **yes** · confidence 0.9 · effort S
- where: `Features/Profile/ViewModels/ProfileViewModel.swift:16-47`;
  `Services/Auth/ProfileService.swift:189-191`; `Services/Auth/AuthService.swift:437,563,389-396`;
  `public.handle_new_user` (Strata, read this session)
- evidence: `handle_new_user` sets `profiles.display_name` from
  `raw_user_meta_data->>'display_name'` then `->>'full_name'`. `sendMagicLink` and `signUp`
  send only `["role": "homeowner"]` — no name — so both columns are NULL for an in-app signup.
  `ProfileService.displayName` = `displayName ?? fullName ?? email`, and `UserIdentity` takes
  the **local part** of whatever it gets. Result: "jane.smith", monogram "J".
  Worse for Apple: `captureAppleName` writes the name to **GoTrue user metadata** after the
  profile row already exists, and `UserIdentity` reads the profile candidate first — which is
  never empty because it ends at `email` — so the captured name is **never read**, and a
  private-relay tester is greeted by a random relay local part.
- why it matters: the Profile/Studio header and its 80 pt monogram are the account's identity
  in the app. Every audit shot shows "Client User" because the local seed writes one.
- fix: pass `display_name` in the OTP/sign-up metadata; and in `captureAppleName`, write to
  `profiles` (or re-fetch the profile) rather than only to auth metadata. Ask for a first name
  once, after the first sign-in, if neither arrives.

## GAP8-08 · Signed-in Today on production is the guest home minus one line
- area `today-home` · severity **major** · testerVisible **yes** · confidence 0.93 · effort L
- where: `Features/Home/Models/TodayExperience.swift:273-297`; `Features/Home/Views/DailyRoomView.swift:246-372`
- evidence: `HomeComposition.blocks` resolves to `[.header, .nextMove, .startWithARoom, .story]`
  for both accounts (derivation in GAP8.md §6.1). That is the same list a guest gets, plus
  `.signInLine` for the guest. Compare `shots/A/27-guest-home.png` (guest, local) — the
  production signed-in Today is that screen with the sign-in sentence removed and the story
  chip reading JUL 6.
- why it matters: the whole engagement-tier architecture assumes the home *morphs*. On
  production it cannot, for anybody, and there is nothing on the screen that acknowledges a
  session exists. A tester who completes onboarding, signs in, and lands here has no evidence
  the account did anything.
- fix: design the `discovering` + empty-house + empty-catalogue home as a first-class state
  rather than as the residue of four `if` statements.

## GAP8-09 · Studio on production is five boxes saying nothing exists, one of them counting to 1
- area `studio-designer` · severity **major** · testerVisible **yes** · confidence 0.9 · effort M
- where: `Features/Profile/Views/StudioHubView.swift:32,225-246`;
  `Features/Profile/ViewModels/StudioQueueBuilder.swift:344-380`;
  `Features/Profile/ViewModels/StudioQueueModels.swift:39-46`
- evidence: `ForEach(StudioQueueSectionKind.allCases)` draws all five sections unconditionally.
  With every source `200 []` the screen is: *Awaiting you 0 — "Nothing needs a decision."* ·
  *In progress 0 — "No active projects yet."* · *Conversation **1** — "Conversation / No
  messages yet"* · *Money & documents 0 — "No shared records yet."* · *Archive 0 — "Nothing
  has been archived."* The Conversation badge is `section.rows.count`, and
  `conversationThreadRow` is emitted even at zero threads (SP-13), so the badge reads 1 above a
  row that says there is nothing. Subhead: "Nothing needs your attention right now." for a new
  account; **"1 new Studio update"** for tester (from the dead notification of GAP8-06).
- why it matters: five stacked empty cards is the least inviting possible first view of a
  section named "The work around your home", and the one non-zero number on it is wrong twice
  over.
- fix: collapse the empty sections into one honest invitation until the client has a designer;
  make the Conversation badge count threads, not cards.

## GAP8-10 · The marketplace's empty state offers the one action that cannot help
- area `product` · severity **major** · testerVisible **yes** · confidence 0.93 · effort S
- where: `Features/Recommendations/Views/RecommendationsView.swift:254-265,69-76`
- evidence: with 0 products the screen renders `PatinaEmptyState(icon: "sparkles",
  title: "Nothing here yet", message: "Save pieces you love or take the style quiz to tune what
  shows up.", ctaTitle: "Take the style quiz")`, under a subtitle reading **"0 pieces chosen
  for your space"**. The style quiz is the *only* path through onboarding (A-05/P-04), so the
  tester has already taken it; retaking it cannot change the result, because the candidate set
  is one un-attributable row (GAP8-04). "Save pieces you love" instructs the tester to do the
  thing this screen exists to enable.
- why it matters: this is the app's entire marketplace, on every launch, and its only exit
  loops back into a five-question quiz the tester just finished.
- fix: an empty catalogue is an *us* state, not a *you* state — say so, and drop the CTA.
  R-06 (the state does not fill the screen) escalates with it.

## GAP8-11 · `client_designer_roster` 404s on every foreground; `profile_presence` 404s on every visit
- area `prod-readiness` · severity **minor** · testerVisible **no** · confidence 0.97 · effort S
- where: `Core/Network/RosterAPIClient.swift:40-61`; `Services/Auth/ProfileService.swift:150-172`;
  `Services/Badges/BadgeCountService.swift:200`
- evidence: `to_regclass('public.client_designer_roster')` and
  `to_regclass('public.profile_presence')` are both **NULL** on Strata (00536 / 00538–00539
  unapplied). `BadgeCountService.refresh()` runs on Today appear, on foreground and on push, and
  its sixth fetch is the roster — a guaranteed `404 PGRST205` each time, swallowed by `try?`.
  `mirrorLastSeenIfNeeded` upserts `profile_presence` on the same cadence and logs at `.debug`.
- why it matters: invisible on screen, but it is a per-launch 404 pair in the TestFlight error
  stream (PostHog error tracking is wired), the attribution roster is permanently empty, and
  `last_seen_at` never mirrors — so the Record's "since your last visit" widening can never
  work on a second device.
- fix: apply 00536 and 00538/00539 (part of the 00533–00540 block).

## GAP8-12 · "4 MIN READ" over a 489-character story
- area `copy` · severity **polish** · testerVisible **yes** · confidence 0.9 · effort S
- where: `Core/Models/DailyStory.swift:30`; `supabase/migrations/00143_editorial_stories.sql:151`
- evidence: Strata body lengths / declared read minutes: 489 chars / 4 min · 386 / 3 · 387 / 5.
  Two short paragraphs behind a chip claiming four minutes. Identical locally (same seed rows),
  so **not** a production-only defect — but on production it is attached to the only content
  block on the home screen, so it is the one number a tester can check and find wrong.
- fix: derive `read_minutes` from the body, or drop the claim until the stories are real.

