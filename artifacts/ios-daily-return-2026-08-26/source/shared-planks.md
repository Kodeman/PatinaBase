# Shared planks — the repairs both directions carry

**The Daily Return · Patina iOS client · 2026-08-26 · main `3cd84ecb3`**

Twenty planks. Every one of them is a **repair**, not a choice: the app already claims the thing,
already holds the data, or already ships the screen — and the claim is false, the data never
arrives, or the screen cannot be reached. Whichever direction Kody rules for, this list is the same
list. Direction A and Direction B build *on top of* it.

Ordered by the severity of what each one fixes (S0 funnel breaks first), not by cost.

**Not here, on purpose** — these are direction-level choices and belong to A/B, not to the shared
floor: what mounts on the home at each tier, whether a client can buy a piece directly (C24) and
who gets credited if she does, which events earn a push and what the app promises in exchange
(C26), widgets / Lock Screen / Live Activities, a household or second seat, and whether Boards get
a remote mirror. Where a plank touches the edge of one of those, it stops at the honest repair and
says so.

**Duplicate clusters merged when citing:** F04=F31=F32 · F16=F34 · F23=F29 · F28=F36 · F22=F26 ·
F30=F37. Findings the verifiers refuted as written (F18, F21, F33, F35, F39, F57, F75, F82, F88,
F94, F116, F149, F166, F181) are cited only in their narrowed, surviving form, and are marked as
such.

| id | plank | worst finding | size |
|---|---|---|---|
| SP-01 | Every piece detail loads, and the error has a door | F04 S1 · blocks the whole browse lane | S |
| SP-02 | The browse grid is one card size, and the chips can be reached | F05 S0 | M |
| SP-03 | The share names Patina, and the link opens the app | F01 S0 | M |
| SP-04 | A proposal is called what it is, and the sheet restates it | F02 S0 · F03 S0 | M |
| SP-05 | The client's project screen stops talking to the designer | F20 S0 | S |
| SP-06 | Guest work belongs to the guest | F23 S0 | M |
| SP-07 | The matched designer becomes visible (one filter) | F10 S0 · 8 findings, one cause | M |
| SP-08 | The bell shows what is already waiting; the permission is earned | F08 S0 | M |
| SP-09 | The last tap of a design request has a way back | F27 S0 | S |
| SP-10 | The piece says what it is: size, lead time, maker | F17 S0 | L |
| SP-11 | A piece can be put in a room, and room browse is the room's | F15 S0 | M |
| SP-12 | Saved has a door, and opens where the pieces are | F14 S0 | M |
| SP-13 | A client can start the conversation | F21 (narrowed) S0 | M |
| SP-14 | Save once, and it is still saved tomorrow | F122 S1 | M |
| SP-15 | Money screens carry the date and the failure | F102 S1 | M |
| SP-16 | One count, and a budget that is a budget | F41 S1 | M |
| SP-17 | A decision can be deferred, and shows the colour | F44 S2 · F59 S1 | M |
| SP-18 | Signals that are not real come down | F64 S1 · F46 S1 | S |
| SP-19 | Nothing covers the button; nothing is smaller than a thumb | F49 S1 · F114 S1 | M |
| SP-20 | Sign Out, and a way to close the account | F45 S1 · App Store 5.1.1(v) | S |

---

## SP-01 — Every piece detail loads, and the error has a door

**Findings answered:** F04 (=F31, =F32).

**What changes.** The piece detail is the terminus of every browse path and it fails on every one of
them: tapping any card — guest, signed-in, dark, room-scoped — lands on `"Couldn't load product"` /
`"Let's try that again."`, retry repeats it, and there is no back chevron on the failure state, so
the only exit is the Companion's `"Home"` row. The cause is a `PGRST201` ambiguous-embed error: the
direct fetch asks for `select=*,vendors(name,made_in,brand_story)` while `products` carries **two**
foreign keys to `vendors` (`vendor_id` from 00001, `retailer_id` added by 00011). Qualify the embed
as `vendors!products_vendor_id_fkey(name,made_in,brand_story)` and the screen loads. Separately, the
error state gets the same back control the loaded screen has, so a failure is never a trap: keep
`"Couldn't load product"` / `"Let's try that again."` verbatim and add the chevron.

**Where.** `apps/mobile/Patina/Patina/Core/Network/ProductAPIClient.swift:99` (the embed) ·
`Features/ProductDetail/Views/ProductDetailView.swift:36-44`, `:413-430` (error state, missing back)
· constraint names from `supabase/migrations/00001_initial_schema.sql:39` and
`supabase/migrations/00011_add_retailer_id.sql:6`.

**Backend delta.** None. Client-side only (§12 has no row for this — it is a query bug).

**Size.** S. **Risk.** Low. The fix depends on the default constraint name (`products_vendor_id_fkey`)
being the same on Strata as in the migrations — confirm once against prod before shipping, because a
renamed constraint would swap one error for another. Shots: `g-17-piece-detail-top.png`,
`g-17b-piece-detail-after-retry.png`, `g-17c-after-edge-swipe-back.png`, `x-04-piece-detail.png`.

---

## SP-02 — The browse grid is one card size, and the chips can be reached

**Findings answered:** F05, F100, F136, F159, F192, F213.

**What changes.** `"Browse pieces"` is the app's only shopping surface and its left column runs off
the screen: a maker reads `"...M & BOARD"`, a name reads `"...rloom Oak"` / `"...ing Table"`, a price
reads `",200"`. Cards render at four different heights and one draws as a flat gradient with no
image. Pin the `LazyVGrid` to two fixed-width columns with one card aspect and one gutter, and clip
every image to that frame so an image that arrives late cannot resize its neighbour. At XXL Dynamic
Type the filter row (`All / Seating / Tables / Lighting / Storage`) overflows and `"Storage"` clips to
`"Stor"` with no scroll affordance — put the row in a horizontal `ScrollView` with a trailing fade.
And the subtitle changes: `"10 pieces curated for your space"` → **"10 pieces chosen for your
space"** (`"chosen for this room"` when scoped), because "curated" is not how anyone here talks.
The chips filter only the ≤20 rows already fetched, so tapping `"Seating"` rewrites the subtitle to
`"3 pieces curated for your space"` as though the catalog held three sofas: send the chip's category
as `p_category` (the RPC already accepts it) so the number is the real one, or drop the count from
the filtered subtitle.

**Where.** `Features/Recommendations/Views/RecommendationsView.swift:134-147` (grid + chip row),
`:197-210` (card) · `apps/mobile/PatinaDesignKit/Sources/PatinaDesignKit/Components/PatinaAsyncImage.swift:30-35`
· `Features/Recommendations/ViewModels/RecommendationsViewModel.swift:52-59` (subtitle copy).

**Backend delta.** None.

**Size.** M. **Risk.** Layout regression at accessibility sizes — the gate is the iOS build plus a
Dynamic Type XXL pass on the grid (patina-ios-verification). Shots: `g-15-browse-pieces-grid.png`,
`g-15b-browse-grid-settled.png`, `g-16-filter-chip-seating.png`, `d-03-browse-pieces.png`.

---

## SP-03 — The share names Patina, and the link opens the app

**Findings answered:** F01, F183, F53, F169.

**What changes.** The single most-cited finding in the program: a homeowner sharing a chair with her
husband hands him a sheet titled **"Patina Designer Portal"** / **"app.patina.cloud"**. The client app
shares `https://app.patina.cloud/library/<productId>` — the designer portal's Library route — so the
link preview carries the portal's Open Graph title, and because the app declares no
`com.apple.developer.associated-domains` entitlement (only the custom `patina://` scheme), the link
cannot open the app even when the app is installed. Three moves: point the share at a client-facing
piece route whose Open Graph title is the piece and its maker; keep the share message verbatim as
`"{name} by {maker} on Patina"`; add associated domains and route the piece path into the existing
`DeepLinkHandler` so an installed app opens on the piece. Everything else about sharing — sharing a
room, a board, a status — is direction work; this plank only makes the one share the app already has
tell the truth.

**Where.** `Features/Shared/PatinaPortalLinks.swift:14-22` (the URL) ·
`Features/ProductDetail/Views/ProductDetailView.swift:117-121` (subject/message) ·
`Patina/Patina.entitlements:4-11` · `Patina/Info.plist:15-27` ·
`App/DeepLinking/DeepLinkHandler.swift:75-92` (host cases).

**Backend delta.** No migration and no edge function. Web-side: a client-facing piece route with its
own OG title and an `/.well-known/apple-app-site-association` file served from the host — portal
work under `infra/deploy-portal.sh`, not §12.

**Size.** M. **Risk.** Universal links need the Team ID + bundle id in the AASA file and a portal
deploy before the entitlement does anything; iOS caches AASA, so verify on a device, not the
Simulator. Neutral for App Review. Shot: `g-19-share-sheet.png`.

---

## SP-04 — A proposal is called what it is, and the sheet restates it

**Findings answered:** F02, F03, F173; carries a ruling on F71/F95.

**What changes.** Two repairs on the app's most binding instrument. First, the proposals list prints
`"SIGNED (1)"` over a card reading `"Sample accepted proposal"` / `"$100,000.00"` for a proposal
whose status is `accepted` and which has **no signature record** — the app is telling a client she
signed a hundred-thousand-dollar document she did not sign. The list builds that section as
`section("Signed", viewModel.accepted, …)`, where `accepted` filters `status == "accepted"`: change
the title string to **"Accepted"** (it renders `"ACCEPTED (1)"`) and reserve `"Signed"` for rows
where `sign_proposal` has actually returned. Second, the e-signature
sheet restates nothing: it shows `"SIGN PROPOSAL"`, the project title, `"Type your full name to
e-sign. Signing confirms the scope and kicks off your project."`, a name field and a disabled
button. Above the name field, print what is being agreed to — project name, total, the deposit line,
and the expiry date — all fields the bundle already returns, and none invented. Keep the existing
instruction line verbatim below them. Third, `sign_proposal` sends no confirmation email (the client
API layer says so in a carry-forward comment) — after a signature the client gets nothing in writing;
add the send on the existing `send-email` chokepoint.

**Where.** `Features/Proposals/Views/ProposalListView.swift:59`, `:165-172` ·
`Features/Proposals/ViewModels/ProposalsViewModel.swift:26-28` ·
`supabase/migrations/00063_proposal_system_v2.sql:45-46` (the status vocabulary already separates
accepted from signed) · `Features/Proposals/Views/ProposalSignSheet.swift:13-77` ·
`Services/API/ProposalsAPIClient.swift:385-403` (`:403` = the "no confirmation email" comment).

**Backend delta.** The confirmation email is one edge-function send through `_shared/send-email.ts`
(§12 §6 — the chokepoint exists; `notification_log` is written by it). **Open ruling for Kody, not a
code fix:** `get_client_proposal_bundle` nulls `unit_sell_price`, `line_total_cents` and
`vendor_name` unless the project's `client_visibility_tier = 'full'`, and the default is
`'milestone'` — so the client signs a scope whose line prices are hidden by policy (F71, F95). That
is a data-policy decision; name it in the deck, do not "fix" it in the app.

**Size.** M. **Risk.** The restated terms are legal copy — Kody signs off on the wording; the app
must print only fields the bundle returns, never a term it composed. Shots: `c-09-proposals-list.png`,
`c-11c-sign-sheet.png`, `x-05-proposal-detail.png`.

---

## SP-05 — The client's project screen stops talking to the designer

**Findings answered:** F20, F60, F69, F70, F84, F171.

**What changes.** The homeowner's own project screen prints two strings written for somebody else: a
stat tile labelled **"CLIENT VIEW"** with the value **"Milestone"** — the raw `client_visibility_tier`
column, shown to the very person it governs — and a boxed line reading **"Set up phases, payments, and
FF&E in the portal →"**, an instruction for the designer, on the client's phone. Delete the CLIENT
VIEW tile from the client build. Replace the portal line, per missing section, with client-voiced
copy that names what is not ready yet: **"Your designer is still putting this together."** (proposal),
**"No invoices yet."**, **"No documents yet."** The screen also fetches phases and milestones it then
discards (F76, F125) — rendering what it already has is direction work; removing what it should never
have shown is not.

**Where.** `Features/Projects/Views/ProjectDetailView.swift:108-126` (stat row),
`:128-151` (missing-section link; `:143` is the portal string).

**Backend delta.** None.

**Size.** S. **Risk.** None. Shots: `c-08-project-detail.png`, `x-02b-projects-list-bonus.png`.

---

## SP-06 — Guest work belongs to the guest

**Findings answered:** F23 (=F29), F124, F28 (=F36), F113.

**What changes.** A guest types a room and saves a piece; the next account to sign in on that phone
inherits both. `client@patina.dev` — zero rooms and zero saved items server-side — showed
`"ACTIVE ROOM / Living Room"`, `"1 ROOM"`, `"1 SAVED PIECE"` and a `"✦ Modern Warmth"` badge it never
earned. This is documented as intended (`AuthService.swift:169-197`: a nil previous owner "claims the
store WITHOUT wiping, so a guest who scanned a room keeps it after signing up"), and the intent is
right for the one-person case — but the same rule hands one person's room to a different person's
account on a shared phone, and every count on Today, Profile and the Companion presents device data
as account data. Two changes, neither of which loses a guest's work: scope the local-store fetches by
owner so an account only ever counts its own rows, and make the claim explicit at the first sign-in
after guest work — one sheet: **"Keep the room and the pieces you saved on this phone?"** with
**"Keep them"** and **"Start fresh"**. Until a save is mirrored to the account, carry the label
`"SAVED ON THIS PHONE"` (already truthful on Your Spaces) onto the counts that quote it.

**Where.** `Services/Auth/AuthService.swift:169-197` (`reconcileLocalStoreOwner` /
`shouldWipeLocalStore`) · `Features/Companion/Views/CompanionOverlay.swift:190-195` (unfiltered
`fetchCount`) · `Core/Persistence/RoomStore.swift` · `Core/Persistence/LocalStoreReset.swift`.

**Backend delta.** None for the prompt. Mirroring a claimed room/save to the account uses `rooms` and
`saved_items`, which already exist and whose `room_id` is nullable (`00055_saved_items.sql`).

**Size.** M. **Risk.** This is the one plank that can destroy a user's data if it is got wrong. Keep
the wipe branch promote-only, keep the existing unit tests on `shouldWipeLocalStore`, and never wipe
on sign-out (the app does not sync rooms back down). Shots: `c-02-home-immediately-after-signin.png`,
`c-03-home-top-activeproject.png`, `g-38-relaunch-returning-guest.png`.

---

## SP-07 — The matched designer becomes visible (one filter)

**Findings answered:** F10, F24, F25, F73, F74, F111, F128, F175.

**What changes.** Eight findings, one line of code. `DesignRequestStatusService.fetchLeadRows` asks
`/rest/v1/leads` with `client_request_id=not.is.null`, so a lead created from the designer portal
never comes back, never promotes the engagement tier, and never reaches the Today branch that is
**already built** for exactly this case (`TodayExperience.swift:80-91` renders
`"See your design request"` with the status line). The result: an account whose request was accepted
and claimed eight days ago sees a home reading `"Bring your first room into Patina"` — byte-identical
to the guest home — a Studio of five zeroes, and a `"Get design help"` button whose only act is to
file a second, indistinguishable request (`"Your design request"` / `"No scans on this phone yet"` /
`"Request without a scan"`). Drop the filter (RLS already scopes `leads` to the homeowner), and the
matched surface the app already owns lights up. Then two small follow-ons in the same lane: the
design-request sheet opens on the existing request's stage instead of the compose step when a
non-terminal request exists, and the Studio seeds an "Awaiting you" row from the promoted request so
a matched client's Studio is never all zeroes. **Do not design a new module for this** — the module
exists.

**Where.** `Services/DesignServices/DesignRequestStatusService.swift:733-740` (the query item at
`:737`), `:396-404` · `Core/State/EngagementTier.swift:111-125` ·
`Features/Home/Models/TodayExperience.swift:80-91` ·
`Features/DesignServices/DesignRequestFlowView.swift:60-99` ·
`Features/Profile/ViewModels/StudioQueueBuilder.swift:12-36` · seed evidence
`supabase/seed/leads_room_scans.sql:119-126`.

**Backend delta.** None.

**Size.** M (the filter is one line; the sheet branch and the Studio row are the rest).
**Risk.** Removing the filter admits every lead RLS lets the homeowner see, including leads from
other intake paths — scope on the client relationship rather than on `client_request_id`, and verify
against `james.okafor@example.com` (C29, one accepted lead, matched designer). Shots:
`c-31-engaged-home-top.png`, `c-32-engaged-companion.png`, `c-32c-engaged-studio-rows.png`,
`c-33-engaged-design-request-again.png`.

---

## SP-08 — The bell shows what is already waiting; the permission is earned

**Findings answered:** F08, F85, F72, F160, F47, F167, F199.

**What changes.** On the same device, in the same minute: the bell reads `"Nothing yet"` /
`"Updates from your designer will land here."` while the Studio two screens away lists a decision
overdue since Aug 22, a $4,250.00 invoice due Sep 1, and a proposal to review by Sep 8. The feed
reads `notification_log`, and nothing in the money or decision rail writes a client-facing row
(`proposal-send` writes an `in_app` row on the real send path; the review's seed bypassed it; invoice
and decision events write for the designer or email only). Two repairs, one cheap and one durable.
Cheap and immediate: the feed's empty state falls back to the same queue the Studio already computes,
so the bell can never contradict the Studio — and the empty CTA branches by tier, because offering
`"Get design help"` to a client who has had a designer for three months is its own insult:
**"Message your designer"** at engaged/activeProject, `"Get design help"` only at discovering. Durable:
write client-facing `notification_log` rows on invoice-sent/due and decision-raised the way
proposal-send already does. The permission moment moves too: today authorization is requested exactly
once per install, silently, immediately after a design-request submission — unrelated to money. Ask
it instead at the first event a client would actually want to hear about, preceded by one screen of
copy: **"We'll tell you when your designer sends something that needs you — a decision, a proposal,
or an invoice. Nothing else."** *Which* events fire a push is a direction question (C26); that the ask
is explained, and asked in the right room, is not.

**Where.** `Features/Notifications/Views/NotificationFeedView.swift:125-138` (empty state + CTA) ·
`Core/Network/NotificationsAPIClient.swift:18-59` (feed source + status filter) ·
`Services/API/PushTokenService.swift:87-108` (`promptForAuthorizationAfterFirstSubmission`), `:57-62`
· `Features/Settings/Views/SettingsView.swift:68-80` ·
`App/DeepLinking/NotificationRouter.swift:60-88` (proposal/invoice routes already exist,
forward-compatible).

**Backend delta.** §12: push send **exists and is provisioned** — `apns-send` is complete,
`device_push_tokens` is live, and a new emission is "1 new call site" (`invoke_edge_function`). The
in-app row is the same size: an insert into `notification_log` from the existing `invoice-send` /
decision paths (`00092_decision_cron.sql:16-19`, `supabase/functions/invoice-reminders/index.ts:17-45`).
`notification_log`'s INSERT policy is service-role only (00041), so a trigger written from a
designer's authenticated update must be SECURITY DEFINER — the pattern 00289 already uses.

**Size.** M. **Risk.** Duplicate or contradictory rows if both the fallback and the log rows render —
de-duplicate on entity id. A silent permission prompt that now never fires is a regression to watch:
keep the one-per-install guard. Shots: `c-21-notifications-signed-in.png`, `d-10-notifications.png`,
`c-06b-studio-awaiting-you.png`.

---

## SP-09 — The last tap of a design request has a way back

**Findings answered:** F27, F112, F141.

**What changes.** A guest fills in four screens — `"What kind of help?"`, `"Budget (optional)"`,
`"Timeline"`, `"Your vision (optional)"` — reviews, taps `"Send request"`, and is thrown the full
gate (`"PATINA"` / `"Welcome home"` / `"Start with a piece you love"`) as a sheet with **no Cancel, no
✕ and no `"Look around first →"`** — the escape hatches the same screen offers when it is the front
door. The work is not lost but nothing on screen says so. Two lines of repair: say it on the way in —
at the Review step, **"You'll sign in to send this."** — and give the soft-wall variant of the sheet a
Cancel and a title naming what it is gating: **"Sign in to send your request"**. This restores C9
("the auth sheet presents over context and never ejects") rather than amending it.

**Where.** `Features/Authentication/Views/AuthSheet.swift:21-43` ·
`Features/Authentication/Views/AuthScreenView.swift:100-112` ·
`Features/DesignServices/DesignRequestFlowView.swift:60-99` (the Review step).

**Backend delta.** None.

**Size.** S. **Risk.** None. Shots: `g-32-design-request-review.png`, `g-33-after-send-request.png`,
`g-35-auth-wall-no-dismiss.png`.

---

## SP-10 — The piece says what it is: size, lead time, maker

**Findings answered:** F17, F142, F143, F179, F86, F145, F62, F146, F153.

**What changes.** For a $4,000 chair the app offers a name, a joined materials line, a price, a
`"{n}% match"` pill and provenance chips — and no dimension, no lead time, no stock, no shipping, no
returns, and a maker line that is often the retailer. `products.dimensions` (jsonb
`{width,height,depth,unit}`) exists in the schema since 00001 and is neither returned by
`get_recommendations` nor decoded by `ProductModel`. `lead_time_weeks` exists but is CHECK-required
only for `layer='studio'`, so the catalog layer the client reads carries no guarantee.
`products.brand` holds the actual maker (`"Nordic Atelier"`) while the card prints the vendor
(`"ROOM & BOARD"`), and where no vendor resolves the RPC prints the literal string
**`"Unknown Maker"`** — on a marketplace whose whole argument is provenance. `source_url` is populated
on 9 of 21 local rows and never returned. Widen the RPC to return `dimensions`, `lead_time_weeks`,
`brand` and `source_url`; decode them; print two lines under the price — **"38″ W × 20″ D × 30″ H"**
and **"Ships in 8–10 weeks"** — and omit each line entirely when the column is null rather than
printing a placeholder. Source the maker line from `brand` with the vendor as fallback, and withhold
a product with no resolvable maker from the feed instead of shipping it as `"Unknown Maker"`.

**Where.** `supabase/migrations/00246_aesthete_quiz_bridge.sql:273-300` (the projection; `:278` is
the `COALESCE(v.name,'Unknown Maker')`) · `Core/Models/ProductModel.swift:12-58`, `:50` ·
`Features/ProductDetail/Views/ProductDetailView.swift` (price block) ·
`supabase/migrations/00001_initial_schema.sql:35,37`.

**Backend delta.** **One migration.** `get_recommendations` carries a `RETURNS TABLE` its own comment
calls a *"FROZEN iOS contract (00067 signature … byte-compatible)"* — widening it means DROP and
recreate, with every caller re-verified (patina-db-migrations). Additive columns are safe for the
app's JSON decoding, so older installs keep working. Plus a **catalog data pass**, which is editorial
work rather than engineering: §12 records `vendors` already carrying `name/made_in/brand_story` and
joined by the RPC, and the local stack has 0 of 104 vendors with `made_in` or `brand_story`
populated — the fields stay hidden until someone fills them.

**Size.** L. **Risk.** The DROP/recreate on a frozen contract is the real risk — stage it, and ship
the app decode in the same wave. Shipping/returns/liability copy does not exist as a column anywhere
(F144) and is **not** invented here: a purchase path that needs it is direction work. Shots:
`g-17-piece-detail-top.png`, `c-25-piece-detail-client.png`, `g-15-browse-pieces-grid.png`.

---

## SP-11 — A piece can be put in a room, and room browse is the room's

**Findings answered:** F15, F65, F194, F123.

**What changes.** The room's own primary button reads **"Browse Picks for This Room"**, and opens the
same generic grid — `"Browse pieces / 10 pieces curated for your space"` — with no room name and no
room filter, and the card menu there offers only `"Save"`, `"Share"`, `"Not for me"`, `"View
details"`. There is no way, anywhere in the app, to put a piece into a room: the app invites the loop
and then closes it. `AddToRoomSheet` already exists and is not mounted. Mount it from the card menu
as **"Add to room"** whenever the reader has at least one room, pass the room's `remoteId` through
the room-scoped browse so the grid is actually that room's, and title it with the room's name. Where
a room has no `remoteId` yet, sync it before offering the CTA — the current silent fallback to the
generic feed is what produces the mismatch. Cut the room's stacked triple ask (body copy
`"…Browse your Daily Room to start building this room."` over a button `"Browse Picks for This
Room"` over a link) to one control: **"Browse pieces for the Living Room"**. And once a piece can
carry a room, Today's `"0 pieces saved"` on a room that holds one stops lying.

**Where.** `Features/Home/Views/AddToRoomSheet.swift` (exists, unmounted) ·
`Features/Recommendations/Views/RecommendationsView.swift:304-335` (card menu) ·
`Features/Rooms/Views/RoomProjectView.swift:302-330` (the three CTAs) ·
`Features/Recommendations/ViewModels/RecommendationsViewModel.swift:99-110` (room scoping) ·
`Features/Home/Views/TodayModules.swift:158-163` (the count).

**Backend delta.** None — `saved_items.room_id` already exists and is nullable
(`00055_saved_items.sql`).

**Size.** M. **Risk.** Room sync failure now blocks a CTA that used to (wrongly) succeed — say so on
screen rather than falling back silently. Shots: `g-27b-room-picks.png`,
`g-27c-card-menu-in-room-context.png`, `g-20-card-more-menu.png`, `d-06-room-detail.png`.

---

## SP-12 — Saved has a door, and opens where the pieces are

**Findings answered:** F14, F42, F133, F148, F174, F180 (F39/F149/F181 in their narrowed form: the
row is gated on the *total* saved count, not a room-scoped one).

**What changes.** Two doors, both shut. The Companion's `"Saved"` row — the only route to Saved
anywhere in the app — is returned **only** when the saved count is above zero, so a reader with
nothing saved has no way to see the screen that would teach them what saving is for; and the count it
gates on is not the count the row displays. Show the row unconditionally, with the empty count as its
own hint. Then Saved opens on the **"Boards"** tab by default, reading `"No boards yet"` / `"Save
pieces from recommendations to create your first board"` / `"Create Board"` — while the piece the
reader just saved sits one tab over under `"All items"`, and boards can never fill because
`addToBoard` is never called from anywhere. Default to `"All items"` whenever the board count is
zero, and either wire the card menu's save path to `addToBoard` or take Boards out of the app until it
holds something. (A remote mirror for boards — so they survive a reinstall or reach a second device —
is direction work, not this plank.)

**Where.** `Features/Companion/Services/CompanionActionRows.swift:217-222` (the `nil` return) ·
`Features/Companion/Services/CompanionAreaBuilders.swift:28-49` (both home branches) ·
`Features/Collections/ViewModels/CollectionsViewModel.swift:18` (default tab), `:101` ·
`Features/Collections/Views/CollectionsView.swift:124-130` (board creation), `:149-179`, `:227-245`.

**Backend delta.** None.

**Size.** M. **Risk.** Low. Shots: `g-21-saved-empty-boards-tab.png`, `c-22-saved-signed-in.png`,
`c-22b-saved-all-items.png`, `g-14b-companion-next-steps.png`.

---

## SP-13 — A client can start the conversation

**Findings answered:** F21/F33/F35/F82/F94 **in their narrowed, verified form only** — messaging
ships (ThreadListView, ThreadDetailView, MessagingAPIClient, and a `"Message your designer"` Companion
row on project, decision, documents, notifications and design-request screens). The surviving finding
is: **a client cannot start a thread**, the Studio's `"Conversation"` block is the one block drawn
without a chevron, and the home Companion carries no message row. Also F150, F87, F59.

**What changes.** `StudioQueueBuilder.conversationThreadRow` returns `nil` when the thread list is
empty, so the Studio renders the static line `"Conversation"` / `"No project conversations yet."` with
no route — the client's only visible messaging surface is a dead end, which is exactly why six seats
concluded messaging does not exist. Emit the row with `route: .threadList` even at zero threads. Then
give `ThreadListView`'s empty state (`"No conversations yet"` / `"Messages with your designer land
here once you're working together."`) a real act: today its CTA is `"Get design help"` or `"Track your
request"`; add **"Message your designer"**, calling the RPC that already exists —
`rpc_start_project_thread(p_project_id)` is idempotent, SECURITY DEFINER, and granted to
`authenticated`; `rpc_start_direct_thread(counterpart)` covers a matched client with no project yet.
`MessagingAPIClient` has `listThreads`, `listMessages`, `sendMessage`, `markRead` and **no create** —
that is the one method to add. Finally, put the same act where the question actually occurs: on the
piece detail (whose action bar is back / `?` / Share / ♥ and nothing else) and on the decision detail,
tier-branched — `"Get design help"` at discovering, **"Message your designer"** once she has one — with
the piece or decision named in the opening message.

**Where.** `Features/Profile/ViewModels/StudioQueueBuilder.swift:186-219` (`:195-198` is the `nil`) ·
`Features/Profile/Views/StudioHubView.swift:216-223` (routeless empty section) ·
`Features/Messaging/Views/ThreadListView.swift:180-200` (empty state + CTA) ·
`Core/Network/MessagingAPIClient.swift:131-217` (no create call) ·
`Features/ProductDetail/Views/ProductDetailView.swift:86-138` ·
`Features/Decisions/Views/DecisionDetailView.swift:44-61`, `:206-232`.

**Backend delta.** **None.** `supabase/migrations/00103_comms_rpcs.sql:51` (`rpc_start_direct_thread`),
`:113-172` (`rpc_start_project_thread`), `:173` (GRANT to `authenticated`).

**Size.** M. **Risk.** A client who can open a thread can start one the designer does not want —
D2's inbox is the enemy. The thread is scoped to a project the designer already owns, and the system
message `"Project conversation opened."` the RPC writes keeps the record clean. Shots:
`c-19-messages-empty.png`, `c-06c-studio-bottom.png`, `c-18-decision-detail.png`.

---

## SP-14 — Save once, and it is still saved tomorrow

**Findings answered:** F122, F63, F67, F147, F203, F211, F118 (=F132, =F178, =F185, =F207), F163,
F191, F210.

**What changes.** The one loop the whole nightly ritual depends on. On the real route
(`.pieceDetail(pieceId:)` passes only a product id) the primary button `"Add to Room"` runs a
local-only `toggleSave`, `isSaved` is never seeded from storage, and saving again inserts a **second**
row — so a piece saved yesterday says `"Add to Room"` again today, and the count climbs while the
library does not. On the browse card the heart stays outlined after a tap with no toast and no count
change. Four fixes: seed `isSaved` from the store on appear; make `toggleSave` idempotent on
`productId`; mirror every save to `saved_items` with a null room, not only room-scoped ones (the
column is nullable), so a save survives a reinstall and reaches a second device; and confirm the act
— fill the heart optimistically and show one line, **"Saved"**, with **"See all"**. Route both prices
through the one currency formatter (`"$4200"` on the Saved row versus `"$4,200"` on the grid). And the
tour that promises this loop: the shipped tour runs `"Step 1 of 2 / Welcome to Patina"` →
`"Step 2 of 2 / Your profile"`, because the declared middle step — `"Save what you love"` / `"Add
pieces to a room with + Add — they follow you everywhere."` — is anchored to a control that mounts
nowhere. Re-anchor it to the control that performs the save once SP-11 and this plank give it one, and
while the file is open: offset each bubble **below** its anchor (both steps currently cover the card
they describe) and style `"Skip"` / `"Next"` / `"Done"` as Patina controls, not the app's only
system blue.

**Where.** `Features/ProductDetail/ViewModels/ProductDetailViewModel.swift:18`, `:44-78`, `:104-125`
· `ContentView.swift:292-294` (the route that drops room context) ·
`Features/Recommendations/ViewModels/RecommendationsViewModel.swift:138-196`, `:230-238` ·
`Core/Models/TableItemModel.swift:104-109` · `Core/Models/SavedItem.swift:78-90` ·
`Features/Help/FirstLaunchTour.swift:186-196` (step declaration), `:227-253` (bubble + controls),
`:838-856` (anchors).

**Backend delta.** None — `saved_items` accepts a null `room_id` (`00055_saved_items.sql`).

**Size.** M. **Risk.** Mirroring every save server-side changes what "saved" means for guests, who
have no account — keep the local store authoritative until sign-in and reconcile through SP-06's
claim step, or the two planks will fight. Shots: `g-22-saved-one-piece.png`,
`d-check10-after-heart-tap.png`, `g-09-home-tour-step1.png`, `g-10-home-tour-step2.png`.

---

## SP-15 — Money screens carry the date and the failure

**Findings answered:** F102 (=F48, =F92, =F156), F127, F164, F68 (=F78, =F83, =F89, =F104), F157,
F200, F201.

**What changes.** Three repairs on the screens where money actually moves. **The date you need is on
the screen you leave:** `"Due Sep 1, 2026"` prints on the invoices list and is gone on the invoice
detail; `"Expires Sep 8"` prints on the proposals list and is gone on the proposal detail;
`"Overdue · Aug 22"` prints on the Studio hub and is gone on the decisions list and detail. Carry the
line onto every detail — under the balance, above the pay button — and turn it red once past due.
**Failure is one red line under a live button:** when the checkout hand-off fails, `"Unable to start
payment. Please try again."` is inserted *below* a still-fully-enabled `"Pay $4,250.00"`, shoving
`"Pay securely by card or bank transfer."` half off the bottom edge, with no retry control and no way
to reach a person. Render it as the app's own error state above the button, dim the button while in
flight, and offer two acts: **"Try again"** and **"Message your designer"**. **The bank-transfer
banner is unconditional:** when the 60-second post-Checkout poll expires the app sets `.achPending`
regardless of method, so a card payer is told a bank transfer has started and to expect 3–5 business
days. Branch on the settled method, and default to the truth: **"We haven't seen this payment yet.
We'll update this as soon as it clears."** Two smaller items ride along: say what the hand-off is
before it happens (`"Payment opens securely in Safari."` under the Pay button — Apple Pay is already
available inside that Checkout per C25, so do not promise a wallet the device may not have), and give
a paid invoice somewhere to live — today the only payments UI is `"PAYMENTS / No payments recorded
yet."` and `"AWAITING PAYMENT (1)"` is the list's only section.

**Where.** `Features/Invoices/Views/InvoiceDetailView.swift:225-240` (header), `:195-222` (pay button
+ error), `:213-221` (caption), `:96-110` (settle banner) ·
`Features/Invoices/ViewModels/InvoicesViewModel.swift:110-126` (checkout start), `:135-157` (poll
timeout → `.achPending`) · `Features/Invoices/Views/InvoiceListView.swift:189-192` ·
the same due/expiry carry on proposals and decisions lists.

**Backend delta.** None.

**Size.** M. **Risk.** The failure path could not be exercised end-to-end in this review — every
local edge function returned 503 (C27), so `c-14` shows the failure copy, not the product. Re-verify
the settle branch against a real Checkout before shipping the banner change. Shots:
`c-12-invoices-list.png`, `c-13-invoice-detail.png`, `c-13b-invoice-detail-scrolled.png`,
`c-14-pay-handoff.png`, `d-08-invoice-detail.png`.

---

## SP-16 — One count, and a budget that is a budget

**Findings answered:** F41, F56 (=F93, =F103, =F115, =F155).

**What changes.** One screen prints three different answers to "how much needs me?": the Studio
header reads `"4 things need your eye"`, its footer reads `"4 THINGS NEED YOUR EYE"`, and the block
directly between them reads `"Awaiting you 3"` — while Today and the Companion both say two. Compute
the attention count **once**, from `BadgeCountService`, and let every surface read that number. Then
the budget: `"Your budget"` / `"ACROSS YOUR PROJECTS"` reports `"$4,250 BILLED / $0 PAID / $4,250
OUTSTANDING"` — which is one invoice on one of the client's three projects, whose budgets total
$725,000 on the projects list two taps away, and whose own project detail says `"BUDGET $120,000"`.
Either aggregate every project the client owns, or rename the screen to what it computes:
**"Billed to date"**, with the project budget shown separately and labelled as the designer's figure.
Renaming is the honest one-day fix; aggregating is the better one and needs no new data — the projects
list already fetches the budgets.

**Where.** `Features/Profile/ViewModels/StudioQueueModels.swift:93-103` ·
`Features/Profile/ViewModels/StudioQueueBuilder.swift:26-31`, `:72-80` ·
`Features/Budget/BudgetView.swift:36-42`, `:104` · `Features/Budget/BudgetViewModel.swift:5-24`,
`:37-52`.

**Backend delta.** None.

**Size.** M. **Risk.** A single count is only true if every surface refreshes on the same poll — the
badge floor is `scenePhase → .active` plus home appear, with no realtime (R29), so expect a lag
window and do not print a number the client can disprove by pulling to refresh. Shots:
`c-06b-studio-awaiting-you.png`, `c-15-budget.png`, `c-03-home-top-activeproject.png`.

---

## SP-17 — A decision can be deferred, and shows the colour

**Findings answered:** F44, F59, and the surviving half of F75/F88/F116/F166 — **confirmation already
exists** (`"Choose this"` opens DecisionConsentSheet with a confirm, an optional e-signature and
Approve/Cancel), so this plank does not re-propose it. What survives is: no defer, no "neither", and
no colour on a colour decision.

**What changes.** `"Rug color - Natural vs Sand"` presents two text-only cards, both `"$850"`, one
badged `"Recommended"` — a colour decision with no colour. The option card already renders
`resolvedImageURL` when one is present, so this is a content contract, not a layout bug: require an
image or a swatch per option before it can render as choosable, and replace the fallback
`"Details unavailable — view in portal"` with client-voiced copy that does not send a homeowner to the
designer's portal. Then give the client the two answers a real client gives: alongside the two choice
buttons, **"Not yet"** and **"Neither of these"**. Neither needs a new decision state — both open the
project thread from SP-13 with the decision named and leave the decision `pending`, which is exactly
what a designer wants to hear. Carry `"Overdue · Aug 22"` from the Studio hub onto the decision list
card and the detail, so the client can see which one has been waiting.

**Where.** `Features/Decisions/Views/DecisionDetailView.swift:111-145` (option card + fallback copy),
`:206-232` (act row), `:280-309` (the existing consent sheet — leave it) · seed evidence
`supabase/seed/decisions.sql:110-120`.

**Backend delta.** None. Deliberately: `client_decisions.status` is CHECK-constrained to
`draft/pending/responded/expired` (`00062_client_management_v2.sql:80-81`), and routing "not yet"
through a message rather than a new status avoids a migration and keeps the designer's queue truthful.

**Size.** M. **Risk.** Withholding an imageless option from the choosable state could leave a decision
with nothing to tap — fall back to "your designer is still adding the options" rather than rendering a
blank choice. Shots: `c-17-decisions-list.png`, `c-18-decision-detail.png`.

---

## SP-18 — Signals that are not real come down

**Findings answered:** F64 (=F110, =F182, =F193), F158, F46 (=F61), F131.

**What changes.** Four signals on screen that no data can ever support. The room's stat row reads
`"0 ITEMS"`, `"— MATCH"`, `"0 IN AR"` — and `"IN AR"` can never be anything but zero, because
`get_recommendations` hard-codes `usdz_url` to `NULL::text` and the direct fetch hard-codes it nil, so
`hasARModel` is false on every path and the AR affordances never draw. Take the AR stat and every
AR-shaped row out until a product carries a model; label `"MATCH"` with what it matches against, or
drop it. Profile's `"63% MATCH"` (which read `"48% MATCH"` on the same device before sign-in, with
nothing on screen explaining either) gets the rationale line the app already computes, or comes down.
And the editorial story: `"MAKER SPOTLIGHT / The Grain Whisperer of Maine"` is the same card on the
guest home, the engaged home, the activeProject home, in dark mode, and after every relaunch — served
by an unfiltered query for the single highest `sort_order` row out of the three that exist — and its
unread dot is hard-coded `true`, so it is permanently marked new. Drive the dot from a real per-story
read timestamp, and serve the highest-`sort_order` story the reader has **not** opened, falling back
to the newest. That is the honest repair. How often a new story arrives, and whether Today should lean
on it at all, is direction work — three stories is not a daily habit and nobody should pretend it is.

**Where.** `Core/Network/ProductAPIClient.swift:192` (usdz nil) · `Core/Models/ProductModel.swift:110`
· `Features/ProductDetail/Views/ProductDetailView.swift:344-368` ·
`Features/Rooms/Views/RoomProjectView.swift:235-243` (stat row) ·
`supabase/migrations/00246_aesthete_quiz_bridge.sql:283` (`NULL::text AS usdz_url`) ·
`Features/Profile/Views/ProfileView.swift:203-222` (the percentage) ·
`Core/Network/EditorialStoriesAPIClient.swift:71-90`, `:117-131` ·
`Features/Home/ViewModels/DailyRoomViewModel.swift:196-201` ·
`Features/Home/Views/DailyStoryCard.swift:80-87` (the dot).

**Backend delta.** None to take the signals down. §12: a real AR asset needs a `products.usdz_url`
column plus an asset pipeline — out of scope, and the reason the stat comes down rather than being
filled. Story rotation needs no backend either at this scale (editorial publishes more rows); a
per-user-per-day pick would need a new RPC and only if a direction asks for one.

**Size.** S. **Risk.** Removing AR affordances is a visible subtraction — flag it for Kody as such;
the alternative is a marketplace that offers a feature it cannot perform. Shots: `d-06-room-detail.png`,
`g-28b-room-view.png`, `c-26-profile.png`, `g-12-home-discovering-top.png`.

---

## SP-19 — Nothing covers the button; nothing is smaller than a thumb

**Findings answered:** F49 (=F81, =F172), F137, F114 (=F107, =F135, =F176), F97, F40 (=F109), F187
(=F177, =F195).

**What changes.** Three chrome failures that hit the money screens hardest. **The Companion covers the
primary act:** the Hearth is a 120-point region (64 + 36 + 20) inserted as a **bottom `safeAreaInset`
carrying an opaque `PatinaColors.Background.primary` band** on the navigation stack — so on a pushed
screen it paints over scrolled content and sits on top of `"Sign proposal"`, clipping the label to
`"Sign proposa"`, and on `"Browse Picks for This Room"`. More padding is **not** the fix: the proposal
detail already pads 140 points at `ProposalDetailView.swift:32` and still collides. Either pin a
screen's primary act in a bottom bar that sits **above** the Hearth, or let the orb yield on screens
that own a primary act. **The status bar draws over content:** `"9:41"` overprints `"Awaiting
payment"` and `"INV-2026-0142"`; at XXL the Dynamic Island pill blots out a proposal title outright.
Reserve the top safe-area inset on every scroll container and sheet header — one shared omission, not
several. **Targets:** the room form's unit toggles measure **12×13 pt** (`"ft"`) and **6×13 pt**
(`"m"`) with a text-colour change as their only feedback; the Saved `"Boards"` tab is 46×17; the
failed product screen's `"Let's try that again"` is 125×17. Raise every one to a 44-point hit area
with `contentShape`, and make ft/m a real segmented control with an unmistakable selected state. (For
the record: the unit is **not** corrupted — it persists in `UserDefaults` under
`patina.scan.manual_entry.unit` and restores on appear. The finding is reach, not data.) One more,
cheap: the room-summary step `"YOUR SPACE / Here's what I see."` renders cream-on-black-text inside a
fully dark app — the only screen in the walk to ignore the override — because its colours are
hard-coded; route it through the dynamic tokens.

**Where.** `ContentView.swift:166` · `Design/Components/CompanionSafeArea.swift:13-50`
(`reservedHeight`, the opaque background) · `Features/Proposals/Views/ProposalDetailView.swift:32`,
`:33`, `:34-38`, `:137-151` · `Features/Invoices/Views/InvoiceDetailView.swift:38-41` ·
`Features/Budget/BudgetView.swift:26-31` · `Features/RoomScan/Views/ScanFallbackEntryView.swift:28-32`,
`:71-78`, `:140-166`, `:265-280` · `Features/Rooms/Components/SpatialMetadataRow.swift:46-50` ·
`Features/StyleReveal/Views/ScanFloorPlanPreviewView.swift:22`, `:44-64` ·
`apps/mobile/PatinaDesignKit/Sources/PatinaDesignKit/Tokens/PatinaColors.swift:154-166`.

**Backend delta.** None.

**Size.** M. **Risk.** The Hearth is a ruled spatial contract (C8, "a reserved layout region, never a
painted bar") — the opaque background contradicts the contract it documents, so fixing it is a repair
of the contract, not an amendment to it. Verify at Dynamic Type XXL on the four money screens. Shots:
`c-11-proposal-detail-scrolled.png`, `d-07-proposal-detail.png`, `d-02-home-studio-rows.png`,
`g-25-manual-room-entry-metric.png`, `d-06a-room-summary-light-locked.png`.

---

## SP-20 — Sign Out, and a way to close the account

**Findings answered:** F45, F55, F139.

**What changes.** There is no way to sign out of this app. `AccountView` exists and contains a working
sign-out alert; the Settings row **"Account"** is a real `NavigationLink` to it that draws a chevron
and does not navigate — reproduced three times, in the guest tier twice and signed-in once, tapped
dead-centre of its 338×44 frame with the screen unchanged. Fix the push (the cause is unknown and
needs a bisect, not a redesign), and surface **"Sign Out"** directly in Settings rather than only
behind a screen that cannot be reached. Add **"Delete account"** in the same section: the app supports
account creation and ships no deletion path anywhere, which is an App Store review exposure, not only
a courtesy.

**Where.** `Features/Settings/Views/SettingsView.swift:48-66` (the inert row) ·
`Features/Account/AccountView.swift:52-70` (the alert copy already written), `:147-153` ·
`Services/API/APIConfiguration.swift:182`.

**Backend delta.** Sign-out: none. Deletion: an edge function that revokes the auth user and clears or
anonymises the client's rows — new work, and the only part of this plank that is not a one-day fix
(§12 has no row; it is a new function under C13).

**Size.** S for sign-out, M with deletion. **Risk.** **App Store Review Guideline 5.1.1(v)** requires
in-app account deletion for apps that let users create an account — treat this as release-gating for
the next submission, and note that deletion interacts with SP-06's local store (deleting the account
must also clear the device-local rooms and saves). Shots: `c-27-account-row-inert.png`,
`c-28-settings-client.png`, `g-02b-settings-account-inert.png`, `g-37b-settings-account-tap-guest.png`.

---

## Reading the ledger

**Backend cost of the whole floor:** one migration (SP-10's `get_recommendations` widening), one new
edge function (SP-20's account deletion, if it lands here rather than in a release-readiness wave),
`notification_log` writes on two existing paths (SP-08), one confirmation email on an existing
chokepoint (SP-04), and portal-side AASA + a client piece route (SP-03). Everything else is iOS. That
matches §12's ledger: the backends these repairs need mostly **already exist and are already
provisioned** — push, threads, direct orders, saved items, device tokens. The client app is behind its
own backend, not ahead of it.

**What a first slice looks like** — if only one week is available before either direction starts:
SP-01, SP-05, SP-07, SP-09, SP-12 and SP-20's sign-out are all S or one-line-cause repairs, and
between them they unblock the browse lane, stop the two designer-facing leaks, make a matched designer
visible, give the auth wall a door, open Saved, and let a person leave. Nothing in that list needs a
migration.

**Evidence.** Every finding id resolves to `research/31-verified-findings.json`; every shot to
`shots/`. Refutations honoured: messaging exists, decision confirmation exists, the room unit is not
corrupted, the Saved gate is total-count not room-scoped, F57 is a harness artifact, and the
engaged-tier family has one cause. The panel is simulated; the code reads and the shots are not.
