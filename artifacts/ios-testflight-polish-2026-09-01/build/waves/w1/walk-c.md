# First Flight · W1 — walker C acceptance walk

**Device** `ff-w1-walk-c` `75D265E3-AC2F-426D-9820-DB21B27DCDD4` (explicit on every call).
**Build** the steward's signed simulator product from
`.codex/worktrees/agent-ff-w1-integration/apps/mobile/Patina/.build/DerivedData/Build/Products/Debug-iphonesimulator/Patina.app`,
integration tip `d65c9b47ba2c9a1ece9b86050821ea88b36b86fd`.
**Launch** `xcrun simctl launch 75D265E3-AC2F-426D-9820-DB21B27DCDD4 cloud.patina.app -DeploymentTarget local`
on every launch — no `-PatinaFlags` (D1a), no `--uitesting`, no `CODE_SIGNING_ALLOWED=NO`.
**Account** `client@patina.dev` / `password123` (dev seed), against the local stack.
**Shots + ledger** `shots/w1-walk-c/` and `shots/w1-walk-c/ledger.md`.
**Simulator restored** at the end: `appearance light`, `content_size large` (read back, shot A8).

---

## 0. One environment repair, before anything could be walked

The local API gateway was **down** when the walk started: `supabase_kong_supabase` was
`Exited (127)` and nothing answered on `127.0.0.1:54321`. Cause, from `docker start`:

```
error mounting ".../.codex/worktrees/agent-tester-notes/supabase/templates/email-change.html"
to rootfs at "/home/kong/templates/email/email_change.html": not a directory
```

A peer session had run `supabase start` from the **`agent-tester-notes`** worktree, which has no
`supabase/config.toml` and no templates; Docker auto-created the six template paths as empty
**directories**, and kong can no longer bind them onto files. Repaired without touching that
worktree: `docker stop/rm supabase_kong_supabase`, then `npx supabase stop` + `npx supabase start`
**from the main checkout** (project_id `supabase`, so the container names are shared). Data was
preserved — `Starting database from backup…`, 15 `auth.users`, `schema_migrations` head 00559.

> ⚠ For the steward: kong's binds now point at `/Users/kody/Code/patina-merged/supabase/templates`.
> If a peer session runs `supabase start` from a sparse worktree again, kong breaks the same way.

**No production write of any kind was made.** The only database touched is `127.0.0.1:54322`.

---

## 1. Verdicts — every id in scope

Legend: **PASS** = closed as the audit described, with the shot. **FAIL** = still happens.
**NOT VERIFIED** = the walk could not reach the state; recorded, never guessed.

### 1.1 L1-D — the 18 ids in `l1d-tasks.md`'s coverage table

| id | verdict | evidence |
|---|---|---|
| `A3-01` | **NOT VERIFIED** | the local catalogue has 16 published pieces, so the honest empty state never renders. `EmptyStateCallSiteTests` is the only bar this walk could not exercise. Shot 24 |
| `A-11` | **NOT VERIFIED** | the style quiz was skipped at onboarding and not re-entered; the quiz iconography was never on screen |
| `A-36` | **PASS** | every product image 400s from local storage, and every slot draws a **designed placeholder** — brand mark + "Tap to retry" — not a flat colour block, and it distinguishes a failed load from a miss. Shots 24, 25, 41 |
| `A-73` | **PASS** | filled primaries measured white/ink-on-cream, not white-on-tan: piece detail **14.24:1**, invoice Pay **14.24:1**, tour Next **13.53:1**. Auth half: the password Sign in button is charcoal with a white label. Shots 03, 25, 26, 92 |
| `A-90` | **PASS** | "Pay $4,250.00" is ink on the cream primary at **14.24:1** (was ~2.2:1 disabled tan). Shot 26 |
| `A3-17` | **NOT VERIFIED** | the editorial row on Today carries no read-time badge, but I did not open the story itself, so the "1 min read" claim path was not exercised |
| `B-18` | **PASS** (placeholder half) | the missing-image case is the designed placeholder, not a bare grey block. The one image that did load (`Woven Jute Area Rug 8x10`) matched its product. Shots 24, 77 |
| `C-01` | **PASS** | the Companion mark measures **11.15:1** in dark (was 1.15:1) and **7.86:1** in light — adaptive both ways. Shots 20, 09 |
| `C-02` | **PASS** | the Companion panel subtitle "5 things need your eye." measures **5.71:1** against the fixed dark panel (was 1.11:1); the title 8.03:1. Shot 21 |
| `C-20` | **PASS** | dark-mode de-emphasised ink: meta "SEP 3" **7.48:1**, section labels **9.72:1**, body **12.42:1** — was 2.66 / 4.27. Shot 20 |
| `C-27` | **PASS** | the Pieces card draws the placeholder, and the overlay chrome is a white label on a charcoal capsule, not 2.01:1 over cream. Shot 24 |
| `C-41` | **PASS** | one primary token everywhere: the same cream/charcoal pill on the piece detail, the invoice ("Pay"), the proposal ("Sign proposal") and the tour ("Next"). No gold-vs-white pair anywhere on the walk. Shots 25, 26, 28, 92 |
| `C3-01` | **PASS** | `PatinaColors.pearl` has **0** production call sites outside `Tokens/PatinaColors.swift` / `Tokens/PatinaGradients.swift` (5 remaining hits are test files asserting on the string). The dark hairline is adaptive and measures 1.07:1 against the card — visible, and no longer the 12.8:1 light-only pearl. Shot 20 |
| `C3-05` | **PASS** (scoped) | no white-on-`clay` selected state appeared on the walk: the "All" filter chip and the tour CTA are charcoal + inverse ink (13.53:1). I did not enumerate all ~15 controls the finding names — the ones on the walked path are clean. Shots 42, 92 |
| `C3-15` | **PASS** | **0** inline `.font(.custom(` in production code (all 8 grep hits are test files or a doc comment) |
| `C5-14` | **PASS** | one money format everywhere on the walk — `$4,250.00` on Today, the record row, the invoice header, line items, subtotal, total and the Pay button; `$340` / `$890` / `$680` / `$780` / `$1,550` / `$18,500.00` elsewhere. **No `K` form was seen on any surface.** Shots 09, 24, 26, 27, 65, 71 |
| `P-25` | **NOT VERIFIED** | signed in with the password path, so the OTP field was never rendered |
| `P-35` | **PASS** | in dark the Apple button flips to a **white** ground with a black label — label 21:1, button ground vs page 18.6:1. No pure black on near-black. Shot A6 |

### 1.2 L1-F — the 17 ids in `l1f-tasks.md`'s coverage table, plus `C2-06`

| id | verdict | evidence |
|---|---|---|
| `L07-02` | **PASS** | on the four-tab root the composer sits clear above the tab bar, takes focus, accepts text and its send button enables. Shots 29, 30 |
| `A-63` | **NOT VERIFIED** | the guest notifications empty state was never reached (walk was signed in throughout) |
| `A-80` | **NOT VERIFIED** (notifications) | the feed resolved too fast to catch a frame. The same honesty pattern **is** present elsewhere — the decision detail shows "One moment…" before it answers (shots 56, 62) — but that is not this row's screen |
| `B-16` | **PASS** | before sign-out `widget-snapshot.json` carries `"ownerId":"A0000000-0000-0000-0000-000000000005"`; **after sign-out it is replaced with `{"refreshedAt":…,"movedRows":[],"flagOn":false}` and `house-record.json` is deleted outright.** No previous-account payload survives |
| `C-13` | **PASS** | the thread has a real header — avatar "LH", "Leah Hartwell", "Aspen Loft Refresh". Shot 29 |
| `C-14` | **PASS** | the thread's content is real messages; the "Project conversation opened." audit line is suppressed. Shot 29 |
| `C2-02` | **PARTIAL PASS** | not isolatable from outside the process, but `patina://today` fired at a cold app landed on Today rather than being swallowed (shots 70, 71), and every scheme link fired at a running app arrived |
| `C2-07` | **FAIL** | "Mark all read" clears every unread row in the feed and the button disappears (shot 11) — **the bell still badges 3** on return to Today (shot 12) and after leaving and re-entering the tab (shot 14). Re-opening the feed shows the three unread rows **back** (shot 15). Root cause below: `W1-C-01` |
| `C2-09` | **PASS** | tapped "Turn on notifications" → iOS prompt → **Don't Allow** → the primer immediately re-renders "Notifications are off for Patina. You can turn them on in Settings." and the CTA becomes **Open Settings**. Not a silent no-op. Shots 06–08 |
| `C2-21` | **FAIL** | a link tapped while signed out is **not acknowledged**. Both `https://client.patina.cloud/invoices/<id>` and `patina://record/invoice:<id>` were fired at the Welcome screen; `describe_screen` shows no pending-link notice — only `auth.welcome.errorBanner`. Shots A0, A1 |
| `C4-04` | **PASS** | with the API stopped mid-send, an inline banner appears **above the composer within ~6 s**: "We couldn't send that. Nothing was lost — your message is still here." + **Try again**, and the draft stays in the composer (9.72:1 / 6.21:1 in dark). Shot 31 |
| `GAP7B-02` | **NOT VERIFIED on a placed widget** | the springboard widget gallery could not be opened by synthetic taps (3 attempts, §3). Evidence that survives: the snapshot is written with `"flagOn":false` **and** a populated `movedRows`, and `HouseWidget.swift` declares `.supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular, .accessoryCircular])` unconditionally |
| `GAP7B-03` | **NOT VERIFIED on a placed widget** | `HouseWidgetViews.swift:212-213` carries `.lineLimit(2)` + `.minimumScaleFactor(0.8)` on the row title — the prescribed fix is in the code, unproven on glass |
| `GAP7B-04` | **NOT VERIFIED on a placed widget** | `.systemMedium` is in `supportedFamilies`; `systemSmall` has ONE `.widgetURL(PatinaWidgetLinks.link(for: snapshot?.drawableRows.first))` and `systemMedium` gives each row its own `Link(destination:)`. Code matches the ruled fix |
| `GAP7B-05` | **PASS** | `house-record.json` contains the route-less `story:a8b3f8a0-…` row; `widget-snapshot.json` contains **only** the routed order row. The projection excludes rows with no route, exactly as ruled |
| `GAP7B-09` | **FAIL** | after firing a link while signed out and then signing back in, the app lands on **Today** — the queued invoice never arrives. Shots A2, A3 |
| `L07-03` | **PASS** | the send failure is inline and immediate, not silent for a minute. Shot 31 |
| `C2-06` | **PASS** | sign-out drops the previous account's stacks — the app lands on Welcome, and signing back in lands on Today with no residue of the invoice/proposal screens that were open before. Shots 97, A2 |

### 1.3 The extra ids

| id | verdict | evidence |
|---|---|---|
| `GAP1B-01` | **PASS** | at `accessibility-extra-extra-extra-large` the decision consent sheet is full height with **Approve and Cancel pinned at the bottom and fully on screen**; the body scrolls under them. Shots 66, 67 |
| `GAP1B-02` | **PASS** | the defer sheet at AX3XL shows **Send** un-clipped and **Cancel** present, both pinned. (The message-preview box clips its own text — polish, `W1-C-15`.) Shot 68 |
| `GAP1B-03` | **PASS** | "Good afternoon" holds one line at XXXL and wraps **at the word** at AX3XL ("Good / afternoon"); the bell/help cluster moves to its own row. Shots 40, 54 |
| `C-06` | **FAIL (partial)** | the **Today** half is closed (as `GAP1B-03`). The **Companion** half — which this finding's own evidence names (`shots/C/36,37-ax3xl-companion`) — still breaks mid-word: "Want a **recommendati / on?**" at AX3XL. Shot 50 |
| `P-34` | **PASS** | at AX3XL the Welcome screen no longer collapses: "Welcome home" wraps at the word, "Continue with email" and "Look around first" **wrap inside their buttons instead of truncating**, "Have a password? Sign in" wraps, the legal links **stack** on their own lines, and the screen scrolls. Shots 98, 99 |

---

## 2. The scope walk, screen by screen

**Dark mode** — Today, Spaces, Pieces, a piece, Studio, a proposal, an invoice, messages, Settings,
the Companion open, Welcome: all walked (shots 20–35, A6). Orb visible (11.15:1), hairlines visible
(adaptive, 1.07:1 against the card), primary buttons legible (14.24:1), **Pay legible** (14.24:1).

**Dynamic Type** — `extra-extra-extra-large` then `accessibility-extra-extra-extra-large` on the same
screens. The **tab bar stays intact at both sizes**, all five items present and labelled (shots 40,
54). Sheets are usable: the consent and defer sheets pin their button pairs, the Companion panel
scrolls to all its rows. Mid-word breaks and clipping that remain are `W1-C-03/-04/-05`.

**Tooltips / coach marks** — the Companion coaching mark (shot 21) sits above the panel rows it
describes; tour steps 1 and 3 point at the greeting and the Studio tab, and both targets stay
visible (shots 92, 94). Step 2's popover overlays the tab bar, though its target — the record card —
is above it and visible (`W1-C-13`).

**First-launch tour** — `--resetonboarding` **alone did not produce it** (`W1-C-10`). After clearing
`patina.onboarding.completedUserIds.v1` the tour ran: three steps, Skip + Next/Done, **Next 13.53:1
white on the Patina charcoal primary, Skip 7.44:1** — the same primary token as the rest of the app
(shots 92–94).

**Deep links** — `patina://today` → Today; `patina://record/invoice:b0000000-…-e142` → invoice
detail. AASA: `/invoices/<id>`, `/proposals/<id>`, `/decisions/<id>` and `/piece/<id>` (singular)
all open in the app. `/pieces/<id>` (plural) opens **Safari** — see `W1-C-12`. Signed-out link:
`C2-21` / `GAP7B-09` both fail (above).

**Widget** — coverage gap, §3.

---

## 3. Coverage gap — the placed widget

The Home Screen widget gallery could not be opened. Long-press on empty space reliably enters
jiggle mode (shots 81, 83), but every tap on the "Edit" pill — three attempts with settle, at
(72,33), (71,32) and via `describe_after` — **exits jiggle mode instead of opening the Add Widget
sheet** (shots 82, 84). Per PROGRAM.md §7 hard rule 10 this is recorded rather than looped on.

Consequence: `GAP7B-02`, `-03`, `-04` are **not device-verified**. What the walk could prove is in
their rows above (snapshot contents + the widget source), and `GAP7B-05` is proven outright from the
written snapshot. **A placed-widget pass belongs on the device runbook**, alongside D5's other
widget rows.

---

## 4. New defects

| id | severity | where | what happens | fix | lane | related |
|---|---|---|---|---|---|---|
| `W1-C-01` | **blocker** | `supabase/migrations` — RLS on `public.notification_log` | The table has **no UPDATE policy for `authenticated`**: only *"Service role can update notification logs"* with `USING (auth.uid() IS NULL)`. `NotificationsAPIClient.markOpened` / `markAllOpened` PATCH and PostgREST answers **204 with zero rows affected** (kong log 20:17:14), so the optimistic read is reverted on the next fetch and the bell can never reach zero for a real user. Verified: all 6 `notification_log` rows still `opened_at IS NULL` after "Mark all read" | Add an UPDATE policy `USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)` scoped to the surfaced channels, or a `SECURITY DEFINER` RPC `mark_notifications_opened`. The client-side unit bars cannot see this — an SQL test is the right pin | L1-X / backend | `C2-07` |
| `W1-C-02` | **major** | `AppCoordinator` / `AuthScreenView` | A link tapped while signed out is neither acknowledged on the auth screen nor delivered after sign-in. Fired both a universal link and a `patina://` link at the Welcome screen; `describe_screen` shows no notice, and signing back in lands on Today | The `pendingLinkNotice` wiring exists (`ContentView` passes `coordinator.pendingLinkNotice`) but nothing rendered it here, and the FIFO did not drain at `.main`. Needs the queue's drain point re-checked against a real sign-out → sign-in transition, not only the unit fixture | L1-F | `C2-21`, `GAP7B-09` |
| `W1-C-03` | **major** | `CompanionPanel` headline | At `accessibility-extra-extra-extra-large` the panel title breaks mid-word: "Want a recommendati / on?" | The same treatment `DailyGreetingHeader` got — `minimumScaleFactor` plus a word-safe wrap — on the panel title | L1-C / L1-D | `C-06` |
| `W1-C-04` | **major** | Pieces grid card (`ProductCard` verdict pill) | At XXXL the match pill clips mid-word to "Good matc" with the favourite heart drawn on top of it; at AX3XL the pill overflows its card entirely, covers the image placeholder, and the price is clipped by the tab bar | Let the pill wrap or scale, give the heart its own lane, and let the card grow with the type ramp | L1-C | `C-06`, `A-34` |
| `W1-C-05` | **major** | `ProductDetailView` purchase bar | At XXXL the primary CTA truncates: "Ask Leah to sour…" | Two-line label + `minimumScaleFactor`, or stack the two actions above `.xxLarge` | L1-C | `P-34` |
| `W1-C-06` | **minor** | app-wide copy | The app ships **152 non-comment user-facing string literals with a straight `'`** while 48 files already type U+2019 — and both spellings appear on one screen (the decision error shows "Couldn't load this decision" beside "Let's try that again"). Named sites seen on the walk: `PushPrimerView.swift:25` ("We'll…", and **two test suites pin the straight byte**), the Companion coaching mark ("you're", "I'll"), `InvoiceDetail` ×3 ("it's", "We'll", "WHAT'S INCLUDED"), `StudioHubView` Budget row ("What's been billed") — whose Companion twin the deck already fixed | Extend `BrandVoiceLintTests` to an apostrophe rule over `SourceScan.code(in:)` and sweep, rather than fixing deck rows one at a time | L1-E | `A-06` |
| `W1-C-07` | **minor** | onboarding intro | A **successful** password sign-in lands on the signed-out onboarding carousel, which still offers `Onboarding.SignInButton` "I already have an account — Sign in" | Hide the sign-in affordance when a session already exists | L1-A | — |
| `W1-C-08` | **major** | `SettingsView` preferences | The **Notifications toggle reads ON** while iOS authorization is `.denied` — on the same launch where the primer had just said "Notifications are off for Patina" | Read `notificationSettings().authorizationStatus` and reflect it, the way `C2-09`'s primer now does | L1-F | `C2-09` |
| `W1-C-09` | **minor** | `AuthScreenView` error banner | Immediately after a **successful** sign-out the Welcome screen shows "Something went wrong on our side. Try again, or write to hello@patina.cloud." Reproduced twice (shots 97, A6). It also occupies the slot a pending-link notice would use | Do not surface a provider/sign-out error on a clean sign-out; give the link notice its own row | L1-A | `W1-C-02` |
| `W1-C-10` | **minor** | `PatinaApp.swift:67-71` | `--resetonboarding` clears only `hasSeenThreshold`, `hasCompletedOnboarding`, `roomCount`. It does **not** clear `patina.onboarding.completedUserIds.v1` or `help-system.tour.*`, so neither the intro nor the first-launch tour can be replayed — the flag the walk brief depends on is inert | Clear both keys under the same flag | L0.1 / L1-C | — |
| `W1-C-11` | **minor** (PLAUSIBLE) | networking | After the API was deliberately stopped for ~60 s and restored, every subsequent request **timed out at 30 s** (`NSLocalizedDescription=The request timed out`, `client_decisions` + `client_decision_options`) and **nothing reached kong**, while the same query answered from the host in 17 ms. One relaunch still showed it; a second relaunch cleared it | Not isolated — may be a simulator/host networking artefact rather than the app. Worth one deliberate airplane-mode round trip on the device pass before it is called a defect | L1-B | — |
| `W1-C-12` | **minor** | `apple-app-site-association/route.ts` vs `DeepLinkHandler.route(forUniversalLink:)` | AASA publishes `/piece/*` (singular). The app's route table also accepts `/pieces/*`, and a `/pieces/<id>` link therefore **falls through to Safari** on the production client portal instead of opening the app. Separately, `notification_log.metadata->>'deep_link'` contains **`/doc/<id>`**, which AASA does not claim and the route table cannot resolve | Settle one spelling and publish every path a producer writes — including `/doc/*` — or stop writing the ones AASA does not claim | L1-F / L1-X | `GAP7B-09` |
| `W1-C-13` | **polish** | `FirstLaunchTour` step 2 | The step-2 popover is drawn over the tab bar and the house rail (its own target, the record card, stays visible above it) | Offset the popover above the bar's safe area | L1-C | — |
| `W1-C-14` | **polish** | proposal detail | The floating circular Back button overlaps scrolled content — it sits on top of the "Timeline" heading (shot 28) | Give the scroll view top inset for the floating control, or fade it on scroll | L1-C | — |
| `W1-C-15` | **polish** | `DecisionDeferSheet` | At AX3XL the message-preview box clips its own text mid-line ("Oak vs Wind…") while the buttons below are fine | Let the preview scroll or grow | L1-C | `GAP1B-02` |

---

## 5. Things worth the closer's eye that are not defects

- **`patina.auth.enabledProviders.v1` is cached as `["apple","email"]`** while the local
  `GET /auth/v1/settings` reports `apple: false`. The Welcome screen therefore still shows the Apple
  button against the local stack. This could be a stale cache from an earlier prod-pointed launch
  rather than a D3 regression — it needs one clean-keychain launch against a stack whose settings
  disagree before anyone calls it either way.
- **`A-34` / `C-11` are visibly open on this tip**, exactly as `integration.md` §7 predicts: every
  Pieces card and the piece detail draw a green "Good match" / "Worth a look" capsule
  unconditionally (shots 24, 25, 77).
- **The three attention counts now agree**: the bell says "3 unread", Studio's updates row says
  "3 unread updates", and the Companion says "5 things need your eye" (a different, correctly
  labelled quantity). `RL1F-25`'s three-way disagreement is gone (shots 33, 21).
- **Side effects of this walk on the shared local fixture**, recorded for honesty: one message
  ("Walk C composer check") was created in thread `c0ff0000-…-0001` when the app retried the send
  after kong came back (`POST /rest/v1/comms_messages 201`, 20:39:08); notification authorization on
  this simulator is now **denied**; and `patina.onboarding.completedUserIds.v1` +
  `patina.companion.coachmarkSeen` were deleted from this simulator's app preferences to make the
  tour reachable. All three are local to walker C's clone or to the dev database.

---
---

# Re-walk 1 — fix round 1

**Build** integration tip **`1e9372fb27d23597ad1a6a176aa5d4f9f794b954`**, clean tree.
Verified the installed product is that tip, not the old one: `Patina.debug.dylib` in the
simulator's bundle is **byte-identical** (`sha256 34690a5c41ddd39b…`) to the worktree's, the
worktree's generated `GitCommit.sha` reads `1e9372fb`, `.gatelogs/tip-walkerbuild.log` ends
`** BUILD SUCCEEDED **`, and the new symbols are in the binary
(`DailyRoomView.RecordStaleness`, `About Today` — all `PRESENT`).

> The 59 KB `Patina` file in the bundle is only the launcher; the app's code is in the 69 MB
> `Patina.debug.dylib` beside it. Grepping the launcher returns nothing for *any* app string,
> including pre-existing ones — a false "the build is stale" signal. Grep the dylib.

**Scope** the four ids this walk marked FAIL (`C2-07`, `C2-21`, `GAP7B-09`, `C-06`), the fifteen
`W1-C-*` defects it filed, and the fixer's touches that land on walker C's surfaces
(`DailyGreetingHeader`, `PatinaScreenChrome`, `FirstLaunchTour*`, `AuthScreenView`, `AuthService`,
`PushPrimerView`, `DecisionListView`/`DetailView`).

**Shots + ledger** `shots/w1-walk-c-rewalk/` and its `ledger.md`.
Simulator left as found: `appearance light`, `content_size large`, both read back.
**No production write of any kind.** The only database touched is `127.0.0.1:54322`.

---

## 0. The blocker this re-walk hit: HID input is dead, because the Mac is locked

The HID preflight failed at the first step. `describe_screen` and `xcrun simctl io … screenshot`
both answer correctly, but **every synthetic tap is swallowed** — two taps on
`DailyRoomView.BellButton` at its own reported centre (364.5, 136) left the screen unchanged
(shots 02, 03). That is the exact failure mode `steward.md` §3 rule 9 warns about, and the cause is
not the simulator:

```
$ python3 -c "import Quartz; d=Quartz.CGSessionCopyCurrentDictionary(); \
              print(d.get('CGSSessionScreenIsLocked'))"
True
```

`Simulator` is running (pid 702) but has **no on-screen window** — the Quartz enumeration from
`steward.md` §3 returns nothing for it, and the only window owners are `Window Server`,
`loginwindow` and `iTerm`. `open -a Simulator` cannot attach a window over a locked screen. I have
no way to unlock Kody's Mac and did not try. Per `PROGRAM.md` §7 hard rule 10 this is recorded once,
not looped on.

**So this re-walk was driven without HID**, using the routes that still work:
`simctl openurl` (deep links, universal links, and the app's own magic-link callback),
`simctl ui content_size` / `appearance`, `simctl keychain reset`, `describe_screen`, screenshots,
authenticated PostgREST calls against the local stack, and the merged source. Every verdict below
says which route produced it. **Anything that needs a tap, a swipe or a scroll is marked NOT
RE-WALKED, never guessed** — §4 lists them for a Kody-run or unlocked-screen pass.

---

## 1. The four ids this walk marked FAIL

| id | re-walk verdict | evidence |
|---|---|---|
| `C2-07` | **FAIL — unchanged** | The fix round touches **no** non-`apps/mobile/` path (`git diff --name-only d65c9b47b..1e9372fb2 \| grep -v '^apps/mobile/'` is empty), so the RLS root cause `W1-C-01` is untouched. Proven directly rather than through the UI: with a real `client@patina.dev` bearer token the user **can** `SELECT` its 6 rows, and the PATCH the app's `markAllOpened` issues answers **`HTTP/1.1 200` with `Content-Length: 2`** — an empty array, zero rows — after which the table still reads **`6 of 6 still unread`**. The only UPDATE policy on `public.notification_log` is still *"Service role can update notification logs"*, `USING (auth.uid() IS NULL)`. |
| `C2-21` | **PASS on a clean signed-out state** — and the residual is now precisely located | Shot 21. `simctl keychain reset` → launch → Welcome with an **empty** status slot (shot 20) → universal link `/invoices/b0000000-…-e142` → `describe_screen` returns `auth.welcome.linkNotice` = **"We'll open what you tapped once you're in."** at `{57.8, 317.7} 286×17`, and the five controls below sit at 352.333 / 413.583 / 518.25 / 585 / 756 — nothing moved. **The half that is still broken is not the notice, it is the slot**: `AuthScreenView.AuthStatusSlot.message` returns `errorMessage` **before** `pendingLinkNotice`, so on the path my first walk actually drove — sign out, then tap a link — `W1-C-09`'s spurious "Something went wrong on our side." still wins the one slot and the notice never appears. See the sharpened `W1-C-09` row in §3. |
| `GAP7B-09` | **PASS** | Shot 22. With the invoice link held from the step above, I signed in and **the app opened the invoice** — "Awaiting payment · INV-2026-0142 · Pay $4,250.00" — not Today. The queue drains on the `.auth → .main` transition. ⚠ **Method, stated plainly:** with HID dead I could not type into the password form, so I signed in through the app's own implicit-flow magic-link callback, `patina://auth/callback#access_token=…&refresh_token=…`, with a token pair minted by GoTrue's password grant for `client@patina.dev`. That is a real session arriving at `handleAuthURL` → `handleMagicLinkURL`, and it is the same phase transition the drain hooks; it is **not** the typed-password path my first walk used. One password sign-in on an unlocked screen still owes this row. |
| `C-06` (Companion half) | **FAIL — unchanged**, source-verified, not re-walked on glass | The commit that says it closes `C-06` (`72744cbd8`) fixes three *other* surfaces — the Decisions card title, `ProposalSignSheet`'s "TOTA / L" and the "Recommended" badge. The Companion is not among them: `git diff --name-only d65c9b47b..1e9372fb2` matches **nothing** for `CompanionPanel`, and the headline itself, `CompanionContextProvider.swift:194` `"Want a recommendation?"`, is untouched. The panel needs a tab tap to open, so the "Want a recommendati / on?" break is **not re-walked** — but nothing in the round could have changed it. |

---

## 2. The fifteen `W1-C-*` defects

| id | re-walk verdict | evidence |
|---|---|---|
| `W1-C-01` | **OPEN — unchanged** | §1 above. No migration in the round; authenticated PATCH → 0 rows; policy unchanged. This is still the wave's blocker and it is a **backend** row — the client-side unit bars cannot see it, exactly as filed. |
| `W1-C-02` | **MOSTLY CLOSED** | Both halves the finding named now work when the slot is free: the notice renders (shot 21) and the queue drains into the invoice (shot 22). What is left is the precedence collision, which belongs to `W1-C-09` — closing that one closes this one on the real path. |
| `W1-C-03` | **OPEN — unchanged** (source) | `CompanionPanel` not touched. Not re-walked (needs a tap). |
| `W1-C-04` | **OPEN — unchanged** (source) | `RecommendationsView` and `ProductCard` both `NOT TOUCHED`. Not re-walked — the Pieces grid needs a tab tap, and Today's "NEW THIS WEEK" is `NewThisWeekRail`, a different component, so it is not a substitute surface. |
| `W1-C-05` | **OPEN — confirmed on glass** | Shot 11. At `extra-extra-extra-large` the piece detail's primary CTA still truncates to **"Ask Leah to sour…"** (`PurchaseActionBar.Primary`, 144.33 × 52). Untouched in the round. |
| `W1-C-06` | **OPEN — and the count went up, 152 → 159** | The one named site the round did fix is `PushPrimerView` (that was `W1-A-01`, and the two suites that pinned the straight byte moved with it). No lint rule was added, so the class is still open, and four live sites were on screen during this re-walk: `AppCoordinator.swift:109` **"We'll open what you tapped once you're in."** — the new link notice, on the Welcome screen (shot 21); `InvoiceDetailBlocks.swift:23` "What's included"; `InvoiceReminder.swift:32` "Remind me the day before it's due"; and `InvoiceReminder.swift:71`, which types a **curly** double-quote `\u{201C}` and a **straight** apostrophe *in the same literal* (shot 22). The fix stands as filed: a rule over `SourceScan.code(in:)`, not another row-by-row pass. |
| `W1-C-07` | **NOT RE-WALKED** | Needs a completed UI sign-in to reach the onboarding carousel. The magic-link route I used sets `hasCompletedOnboarding = true` deliberately (`DeepLinkHandler.handleAuthURL`), so it cannot exercise this row. |
| `W1-C-08` | **OPEN — unchanged** (source) | `SettingsView` `NOT TOUCHED`. `SettingsView.swift:153-157` still binds the Notifications row to `settings.notificationsEnabled`, a local `AppSettings` bool; nothing reads `notificationSettings().authorizationStatus`. Not re-walked (Settings needs a tap). |
| `W1-C-09` | **OPEN — unchanged, and now load-bearing for `C2-21`** | The `AuthService` diff is only `W1-A-06`'s OTP sentence; the `default` branch still returns "Something went wrong on our side. Try again, or write to hello@patina.cloud." and nothing suppresses it on a clean sign-out. Because `AuthStatusSlot` ranks `errorMessage` above `pendingLinkNotice`, this one banner is what keeps `C2-21` broken on the real sign-out → link path. **Fixing `W1-C-09` closes `C2-21` for free**; the alternative the first walk suggested — give the notice its own row — also works and is the safer of the two. Not re-walked: a sign-out needs a tap. |
| `W1-C-10` | **OPEN — unchanged** | `PatinaApp.swift:67-71` still clears exactly three keys (`hasSeenThreshold`, `hasCompletedOnboarding`, `roomCount`); `grep completedUserIds PatinaApp.swift` is empty. |
| `W1-C-11` | **NOT RE-TESTED** | Filed PLAUSIBLE and asking for one deliberate airplane-mode round trip on the device pass. Nothing in this round touches networking; the re-walk did not reproduce the conditions. Verdict unchanged. |
| `W1-C-12` | **OPEN — unchanged** | `apple-app-site-association/route.ts:40` still publishes `["/piece/*", "/invoices/*", "/proposals/*", "/decisions/*"]` — singular `/piece`, and no `/doc/*`, while `DeepLinkHandler:290` still accepts `"piece", "pieces"`. No non-`apps/mobile/` file changed in the round. |
| `W1-C-13` | **NOT RE-WALKED**, and probably not addressed | `FirstLaunchTour.swift` and `FirstLaunchTourPopoverPlacement.swift` **were** touched, but for `B-10` — a scrim with the anchor punched out of it, plus a `rect` on `AnchorGeometry`. Neither changes where step 2's popover is placed relative to the tab bar. The tour needs taps to advance, so this is unproven either way. |
| `W1-C-14` | **NOT RE-WALKED — plausible fix present** | `440a312ea` adds exactly what this row asked for: a 56 pt scroll-edge `LinearGradient` scrim on `PatinaScreenChrome`, `.light` style, non-hit-testing, on pushed screens only. The overlap only appears **scrolled**, and a swipe is HID — shot 10 is scroll-top, where the control sits clear. Worth one scroll on an unlocked screen. |
| `W1-C-15` | **OPEN — unchanged** (source) | `Features/Decisions/Views/DecisionDeferSheet.swift` is `NOT TOUCHED`; the round's Decisions work is in `DecisionListView` and `DecisionDetailView`. Not re-walked (the sheet needs a tap). |

---

## 3. Regression check on the surfaces the fixer touched

- **`DailyGreetingHeader` / the Today help door (`C-18`, `B-07`)** — no regression on my surface.
  At `large` the door is now a real `AXButton` labelled **"About Today"** at `{161.2, 133.3} 44×44`
  (shot 01) rather than the collapsed `AXGroup` the fixer describes. At AX3XL the greeting still
  wraps at the word — "Good / evening" — and the tab bar keeps all five items (shots 12, 13), so
  `GAP1B-03`'s PASS holds.
  One small change worth an eye, **not filed as a defect**: at AX3XL the `?` now sits inline beside
  "Good" with the bell dropped to its own row below, where the first walk saw the bell and the door
  travel together. It is legible, 44 pt and reachable; it just reads as detached from the word it
  belongs to.
- **`PatinaScreenChrome` (`A-89`)** — scrim present in source, unproven on glass (`W1-C-14`).
- **`AuthScreenView` / `AuthService`** — the legal links are now `Button` + in-app `SafariView`, and
  the y-values of the five controls above them are unchanged (shot 21), so `P-29`'s zero-shift
  result survives. The status slot's error-first precedence is unchanged (`W1-C-09`).
- **`A-34` / `C-11` remain open on this tip**, exactly as `integration.md` §7 predicts — the piece
  detail still draws a green "Good match" capsule (shot 11). Not mine, recorded so it is not
  re-reported.

---

## 4. What still owes a pass on an unlocked screen

Nothing below is a new claim; each is a row this re-walk could not reach because input was dead.

| id | the one action it needs |
|---|---|
| `C-06` / `W1-C-03` | open the Companion at AX3XL |
| `W1-C-04` | the Pieces tab at XXXL and AX3XL |
| `W1-C-07` | a completed **password** sign-in |
| `W1-C-08` | the Settings screen, with notifications denied |
| `W1-C-09` + `C2-21`'s real path | sign out, then fire a link |
| `W1-C-13` | run the tour to step 2 |
| `W1-C-14` | scroll the proposal detail |
| `W1-C-15` | open the defer sheet at AX3XL |
| `GAP7B-09` | re-confirm via the typed-password path |
| `C2-07` | unchanged regardless — it is closed by a migration, not by the app |


---
---

# Re-walk 2 — fix round 2

**Build** integration tip **`08397a7d2`**, tree clean. Proven to be what is installed, not a source
pin: the simulator bundle's `Patina.debug.dylib` is byte-identical to the worktree product
(`sha256 d70c1d00c12e9a0fdadcc708ffb675aef728e1f1f60bab74763ea10ad9b42529`, both paths), and the
dylib carries the string `08397a7d`. `git diff --name-only 1e9372fb2..08397a7d2` = 202 files, of
which exactly two are outside `apps/mobile/`: `supabase/migrations/00562_notification_log_owner_opened.sql`
and its RLS test.

**HID is alive this round.** `CGSSessionScreenIsLocked` returns `None`; the preflight tap on
`auth.welcome.passwordButton` opened the sign-in sheet. Everything below was driven by real taps,
swipes and typing unless a row says otherwise.

**Scope** the four ids the first walk marked FAIL, the fifteen `W1-C-*` rows, and the fixer's
touches that land on walker C's surfaces.

**Shots + ledger** `shots/w1-walk-c-rewalk2/` + its `ledger.md` (63 shots).
Simulator left as found — `content_size large`, `appearance light`, both read back.
**No production write of any kind.** The only database touched is `127.0.0.1:54322`.

---

## 1. The four ids the first walk marked FAIL

| id | verdict | evidence |
|---|---|---|
| `C2-07` | **PASS — closed** | Walked end to end, not asserted from the migration. Before: bell badges **3**, three unread rows (shots 06, 07). Tapped **Mark all read** → rows clear (08) → Today's bell has **no badge** (09) → still none after a tab round trip (10) → **still none after a cold relaunch**, i.e. after a fresh server fetch (11). The database agrees: the six `notification_log` rows for `client@patina.dev` read `0 unread, status opened` immediately after the tap, where the first walk left them `6 of 6 unread`. The app's PATCH names `opened_at` + `status`, which is exactly what 00562's column grant `(opened_at, clicked_at, status)` allows — so the narrowed grant does not break the one write the client makes. Fixture restored to 6 unread afterwards. |
| `C2-21` | **PASS on the real path** | The first walk's failing path was *sign out, then tap a link*, where `W1-C-09`'s spurious banner took the one status slot. Walked exactly that: Settings → Sign out → Welcome with an **empty** slot (61), then a universal link → **"We’ll open what you tapped once you’re in."** in that slot (62). Also passes from a cold signed-out launch (02). |
| `GAP7B-09` | **PASS on the typed-password path** | The re-walk-1 pass leaned on a magic-link callback because HID was dead; that debt is paid. Twice this round I typed `client@patina.dev` / `password123` into the form and tapped **Sign in** with a link held — and the app opened **the invoice** (`Awaiting payment · INV-2026-0142 · Pay $4,250.00`), not Today: once from a cold signed-out launch (03→04→05) and once from the sign-out → link → sign-in sequence (61→62→63). |
| `C-06` (Companion half) | **PASS** | Reproduced in the exact context the finding names. `panelTitle` returns "Want a recommendation?" only on `.emergence` — the **Pieces** screen — which is what the first walk's shot 50 was standing on. At AX3XL on Pieces the headline now reads **"Want a / recommendation?"**, wrapped at the word with the long word scaled to fit (25). Walk 1's shot 50 read "Want a / recommendati / on?". The same shot also shows the row caption "ADD TO A COLLECTION" now fully rendered, where walk 1 clipped it mid-word. |

---

## 2. The fifteen `W1-C-*` rows

| id | verdict | evidence |
|---|---|---|
| `W1-C-01` | **CLOSED** | 00562 is applied to the local stack: `pg_policies` now carries `Users can mark own notifications opened` `UPDATE` `{authenticated}` beside the old service-role policy, and `information_schema.column_privileges` shows `authenticated` holding UPDATE on **exactly** `opened_at`, `clicked_at`, `status` with no table-level UPDATE grant left. Proven through the UI, not just the policy: §1's `C2-07` row. The deferred anon-key half is called out in the migration's own header and remains owed — I did not re-test it. |
| `W1-C-02` | **CLOSED** | Both halves on the real path: the notice renders after a sign-out (62) and the queue drains into the invoice after a typed-password sign-in (63). |
| `W1-C-03` | **CLOSED** | §1's `C-06` row, shot 25. The mechanism is `lineLimit(3)` + `minimumScaleFactor(0.5)` on the panel title — a line ceiling is what makes the scale factor engage. |
| `W1-C-04` | **CLOSED** | XXXL (21): the pill reads **"Good match"** in full, the heart sits beside it in its own lane, the price is inside the card. Walk 1's shot 42 read "Good matc" with the heart drawn on top. AX3XL (22, 23): the pill stays inside its card as "Good…", does not cover the image, and the price ($120 / $4,200) is fully legible once the card is scrolled into view — the card grows with the ramp. |
| `W1-C-05` | **CLOSED** | At XXXL the purchase bar **stacks**: "Ask Leah to source this" on one full-width primary, "Add to room" below it, no truncation (20). Walk 1 measured "Ask Leah to sour…" at 144.33 × 52. |
| `W1-C-06` | **CLOSED** | Counted the app target myself rather than trusting the sweep: **282** double-quoted literals carry U+2019 between letters and **2** carry U+0027 — and both of those two are *trailing comments* (`case beginning    // "Let's begin"` at `CoverageAnalyzer.swift:63` and `:65`), sitting beside `narration` values that are curly. Every site the first two walks named renders curly on glass: the link notice (02), `WHAT’S INCLUDED` / "Remind me the day before it’s due" / "We’ll send one notification: “…”" (05), Studio's "What’s been billed, and what’s been paid" (16), and the pair that shared one viewport — "Couldn’t load this decision" above "Let’s try that again" (28). The rule I asked for exists and is app-wide: `AppApostropheLintTests.everyAppLiteralIsCurly` walks every `.swift` under `Patina/` with a >300-file floor so an empty walk cannot pass. |
| `W1-C-07` | **OPEN — the fix is not applied** | The affordance is still there: `Onboarding.SignInButton` "I already have an account — Sign in" is present on carousel page 1, page 2 and the style quiz **while a live client session exists** (48, 49, 51, 55 + `describe_screen`) — the session is provably live, since skipping the quiz lands straight on Today with Leah Hartwell and the client's rows (51). ⚠ Honest caveat: walk 1's exact entry (a fresh password sign-in landing on the carousel) did **not** reproduce, because `OnboardingCompletion` now remembers this account on this install — both sign-ins this round went straight through (04, 63). I reached the carousel with `--resetonboarding` instead. The defect as described is live; its trigger is narrower than walk 1 implied. |
| `W1-C-08` | **CLOSED** | The Notifications row is no longer a switch reading ON against a denied authorization. It reads **"Notifications are off in iOS Settings"** with a slashed-bell icon and a chevron — a door, not a toggle (17). Authorization on this simulator is still `.denied` from walk 1, so this is the exact launch condition the finding named. |
| `W1-C-09` | **CLOSED** | Signed out through the real control (Settings → Sign out → confirm) and the Welcome screen came back with an **empty status slot** — no "Something went wrong on our side." (61). Walk 1 reproduced that banner twice on this same path. |
| `W1-C-10` | **HALF CLOSED — and the residual is now located** | The carousel half is fixed: `--resetonboarding` replays the intro (48), where before it was inert. The **tour half is not**. Twice after `--resetonboarding` the tour did not run (52 with the flag, 54 after a further plain relaunch), because `forgetAllFirstLaunchTourState()` walks **UserDefaults only** and the tour's v2 backing is Supabase `profiles.help_state` — which read `{"tours": {"ios-first-launch-tour": {"launched": true}}}` throughout. The tour ran on the very next launch after I set that column to `{}` on the **local** stack (55, 56). So the flag still cannot replay the tour on any device whose profile carries the row. Fix: have `--resetonboarding` clear the profile's `help_state` too (or have the adapter honour the reset), not only the local keys. |
| `W1-C-11` | **OPEN — no longer "PLAUSIBLE", and now with a mechanism** | Reproduced on a **healthy** stack with no deliberate outage. Twice, a decision opened by deep link hung on "One moment…" and fell to "Couldn’t load this decision" (26–33), and the CFNetwork log says what happened: `[C67 … url: http://127.0.0.1:54321/rest/v1/client_decisions … ] start` → `Socket received CONNECTED` → `reporting state ready` → **`event: client:data_stall @3.114s`**, with the twin `[C68 … client_decision_options]` doing the same. Kong logged **nothing** for either — kong writes its access line on response, so a request that stalls before the server answers leaves no trace, and both really did stall. Controls, all on the same build and simulator: the identical queries answer from the host in **7 ms / 20 ms**; the simulator's own **Safari** reaches kong on the same URL instantly (34); the same decision opens **first try** from the in-app Decisions list, with both requests logged 200 (37); the deep link works at a **warm** app (38); an **invoice** deep link at cold launch works (39); and a later cold-launch decision deep link succeeded (41). So it is intermittent, it clusters around the ~16-request burst a cold launch fires, and it is client-side of a connected socket. It still owes the deliberate airplane-mode round trip on the device pass — but it is no longer a maybe, and its worst face is a push notification tapped from a cold app landing on an error screen whose retry does not recover. |
| `W1-C-12` | **CLOSED, with its second half dismissed on evidence** | The app now claims exactly what the association publishes: `DeepLinkHandler` case is `"piece"` alone, AASA is `["/piece/*", "/invoices/*", "/proposals/*", "/decisions/*"]`, and `ls apps/client-portal/src/app` serves `piece` (singular) — one spelling, agreed across all three. On glass `/piece/<id>` opens the app (12) and `/pieces/<id>` opens Safari (13), which is unchanged behaviour but now honest: nothing writes that URL and the portal has no such route. The `/doc/*` half is not a client-app row and the fixer's SQL is right — I re-ran it: all three `/doc/<id>` rows in `notification_log` belong to `a0000000-…-0004` (`designer@patina.dev`), none to the client. |
| `W1-C-13` | **OPEN — unchanged, now confirmed on glass** | Ran the tour to step 2 (57). The popover is drawn **over the tab bar**: the tab row is covered from "Today" rightward, with only a sliver of the first label and the Companion glyph showing. Its own target stays visible above it, exactly as filed. Step 3 (58) is the proof the placement machinery can do better — its popover sits **above** the bar with the Studio tab punched out of the scrim beneath it. The `B-10` scrim work did not change step 2's placement. |
| `W1-C-14` | **CLOSED** | Scrolled the proposal detail (19). The scroll-edge scrim from `440a312ea` is doing its job: the "Timeline" heading fades to near-invisible as it passes under the floating Back button, and the next heading ("Terms") sits clear below it. No legible text is overlapped any more. |
| `W1-C-15` | **CLOSED** | The defer sheet at AX3XL (44, 45). Walk 1's shot 68 shows the preview box with a hard bottom edge slicing its third line through the middle of the glyphs. Now the box grows with the ramp and **scrolls**: three complete lines, "About Dining chairs - Shaker Oak vs Windsor", no cut-through. `GAP1B-02` still passes alongside it — Send and Cancel pinned and whole. |

---

## 3. The fixer's other touches on my surfaces

- **`GAP1B-01`** — re-checked at AX3XL: the consent sheet still pins **Approve** and **Cancel** at the
  bottom, both fully on screen, body scrolling under them (47). No regression from `W1-B-03`'s
  rework of `DecisionDetailView`.
- **`B-10` step 1** (walker B's row, my screen) — confirmed independently: at step 1 the greeting
  block is **punched out** of the scrim while everything above and below is dimmed (56).
- **`W1-B-08`** (walker B's) — "Not yet" and "Neither of these" now stack full width at AX3XL (43),
  where they used to read as one run.
- **`W1-B-06`** (walker B's) — Your Spaces and the Studio card now agree: "Guest Bedroom /
  TYPED, NOT SCANNED" (16).
- **Settings sheet** — it now carries a drag indicator and a **Done** control (17), which is
  `W1-B-12`/`A-100`'s pair; not mine, recorded so it is not re-reported.
- **`A-34` / `C-11`** — still open on this tip, as `integration.md` §7 predicts. Worth one note: the
  piece detail reached by link showed **"Not scored yet"** (12), so the capsule is not
  *unconditionally* green; the Pieces grid still shows "Good match" / "Worth a look" on every card
  (21, 23). Not mine either way.

---

## 4. New defects this round

| id | severity | where | what happens | fix | lane | related |
|---|---|---|---|---|---|---|
| `W1-C-16` | **minor** | `DecisionDetailViewModel` / `DecisionDetailView` | A decision the client **cannot read** renders as **"Couldn’t load this decision" + "Let’s try that again"** — a network error whose retry can never succeed. Proven: `/decisions/b0000000-…-0d2c01` is the same client's own project, status **`draft`**; PostgREST answered the app **`200` with body length 2** (`[]`) for both the decision and its options, and the screen still blamed the load (40). Notification and email deep links carry decision ids; a decision pulled back to draft, resolved or deleted gives every one of those links a false error | Distinguish "no row" from "the fetch failed". `decision == nil` after a **successful** response is "this isn’t available any more", with a way back to Decisions — not a retry | L1-B | `W1-B-03`, `W1-C-11` |
| `W1-C-17` | **minor** | `DecisionDetailView` option row CTA | At AX3XL the per-option primary truncates to **"Choo…"** on both options, beside prices that are full size (43). Same class as `W1-C-05`, on a surface that round did not touch — and this one is the button that resolves the decision | The `PurchaseActionBar` treatment: stack the price above a full-width CTA above `.accessibility1`, or two-line the label with `minimumScaleFactor` | L1-B / L1-C | `W1-C-05`, `W1-B-08` |
| `W1-C-18` | **polish** | `RecommendationsView` header | At AX3XL the screen title truncates rather than wrapping — **"Browse pie…"** — and the Saved row's value truncates to "NOTHIN…" (22, 23), while the subtitle below wraps correctly. Every other headline on the walk wraps at the word | `lineLimit` + `minimumScaleFactor` on the title, the same pairing `C-06` got; let the Saved value wrap or drop to its own line | L1-C | `C-06`, `W1-C-03` |
| `W1-C-19` | **polish** (PLAUSIBLE) | `FirstLaunchTour` persistence | Completing the tour does not record `completed`. After tapping **Done** on step 3 of 3, `help-system.tour.ios-first-launch-tour` holds the bytes `{"launched":true}` and `profiles.help_state` reads `{"tours": {"ios-first-launch-tour": {"launched": true}}}` — so `FirstLaunchTourState.isResolved` stays **false** and a finished tour is stored identically to one that merely auto-started and was never seen. Suppression happens to work today because the orchestrator gates on `launched`. ⚠ I signed out between the Done tap and the read, so a sign-out-side reset is not excluded | Write `completed: true` + `completedAt` on `complete()` and let `isResolved` carry the suppression, so `launched` can go back to meaning "attempted" | L1-C | `W1-C-10`, `B-10` |

---

## 5. What still owes a pass, and what I changed

**Owed**

| id | what it needs |
|---|---|
| `W1-C-11` | one deliberate airplane-mode round trip on a physical device, plus a cold-launch push tap — the failure clusters at launch |
| `A3-01`, `A-11`, `A3-17`, `A-63`, `A-80`, `P-25` | unchanged from walk 1 — states this fixture cannot produce |
| `GAP7B-02/-03/-04` | still a placed-widget pass; the springboard gallery is unreachable by synthetic taps |

**Local-fixture side effects, recorded for honesty** — all on `127.0.0.1:54322` or this simulator's
own container, nothing in production:

- `notification_log` for `client@patina.dev` was marked read by the walk and **restored** to
  `6 of 6 unread, status delivered` afterwards (verified).
- `profiles.help_state` for that user was set to `{}` to reach the tour at all (§2 `W1-C-10`); the
  app rewrote it to its pre-walk value `{"tours": {"ios-first-launch-tour": {"launched": true}}}` on
  the next run, verified.
- Onboarding was reset twice with `--resetonboarding` and re-completed; the style quiz was skipped
  both times. Notification authorization on this simulator remains **denied**, as walk 1 left it.
