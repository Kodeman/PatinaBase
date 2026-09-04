# First Flight · W1 — acceptance walk B

Walker **B**, 2026-09-03, on the integration tip `d65c9b47ba2c9a1ece9b86050821ea88b36b86fd`.

| | |
|---|---|
| Device | `EDFCE6CF-F87A-48D4-AF32-E1A3D8B0AEF5` (`ff-w1-walk-b`), light appearance, 9:41 status bar |
| App | `…/agent-ff-w1-integration/apps/mobile/Patina/.build/DerivedData/Build/Products/Debug-iphonesimulator/Patina.app` |
| Launch | `xcrun simctl launch EDFCE6CF-F87A-48D4-AF32-E1A3D8B0AEF5 cloud.patina.app -DeploymentTarget local` — **no `-PatinaFlags`**, repeated on every launch |
| Account | `client@patina.dev` / `password123` (W0 fixture) |
| Shots | `artifacts/ios-testflight-polish-2026-09-01/shots/w1-walk-b/` (84 frames) |
| Lanes in scope | **L1-B**, **L1-C**, **L1-X** coverage tables + extra ids `L07-01`, `L07-02`, `L07-03`, `L07-05` |

No production write of any kind. The only database touched is `127.0.0.1:54322`. `git` was never run in
the main checkout. Kong is left **Up** (`gateway=200`).

---

## 0. The stack had to be repaired before the walk could start

The local Supabase stack was **half-dead** when this walk opened. Recording it because it cost the first
twenty minutes and it will bite the next walker.

```
$ docker ps -a --format '{{.Names}}\t{{.Status}}' | grep -E 'kong|edge'
supabase_edge_runtime_supabase   Exited (255) 9 minutes ago
supabase_kong_supabase           Exited (127) 9 minutes ago
$ curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:54321/auth/v1/settings
000
```

`docker inspect supabase_kong_supabase` said why:

```
com.supabase.cli.workdir = /Users/kody/Code/patina-merged/.codex/worktrees/agent-tester-notes
… mount src=…/agent-tester-notes/supabase/templates/email-change.html … not a directory
```

The whole stack had been created from the **dead `agent-tester-notes` worktree** — steward.md §2 records
it as a husk, and it is: no `.git` file, no `.git/worktrees/agent-tester-notes` entry, only `.claude/`
and `supabase/` left behind. Its `supabase/templates/*.html` went with the worktree, so Docker had
created **empty directories** at each of the six bind-mount sources and kong could not mount a directory
onto a file.

Repair, inside the husk only — no git, no tracked file, nothing production:

```bash
rmdir the six docker-created directories, then
cp /Users/kody/Code/patina-merged/supabase/templates/<six>.html \
   /Users/kody/Code/patina-merged/.codex/worktrees/agent-tester-notes/supabase/templates/
docker start supabase_kong_supabase        # → Up, /auth/v1/settings = 200
```

Minutes later a **peer session ran `supabase stop` and then `supabase start`** — every container was
removed and recreated while this walk was mid-sign-in (that is what produced the sign-in failure in shot
`03` on the first attempt). The stack that came back is owned by the main checkout
(`com.supabase.cli.workdir = /Users/kody/Code/patina-merged`) and is complete, edge runtime included. The
data survived: migration head `00559`, both walk accounts present, and the password grant returns a token
for `a0000000-…-0005`.

> **For the next reader:** the local stack is shared with live peer sessions and can vanish underneath a
> walk. A one-off "backend is down" symptom in any W1 walk should be re-tested before it is filed.

---

## 1. The two findings that dominate this walk

### W1-B-02 — every coordinator-driven modal is inert on the shipped root (**blocker**)

On the four-tab `house-first` root — the root D1 makes the product — **no sheet driven by
`AppCoordinator.presentedSheet` ever presents.** Two independent reproductions, three taps each,
`describe_screen` with `all: true` afterwards showing no sheet content anywhere in the tree:

| entry point | code | result |
|---|---|---|
| Your Spaces header `+` "Add a room" | `YourSpacesView.swift:161` → `presentedSheet = .newRoom` | nothing (shot `09`) |
| Studio → MORE → **Settings** | `ProfileView.swift:155` → `presentedSheet = .settings` | nothing (shot `27`) |

It is **not** a dead tap and **not** a stale environment: the same screens' `coordinator.navigate(to:)`
calls work (Whole Home → cross-room pushes fine), and sheets a *view* owns present normally — the
proposal sign sheet, both decision sheets and the inline help popovers all open. The break is specific to
the `.sheet(item: coordinator.presentedSheet)` driver in `ContentView.swift:91-95` when
`mainContent` resolves to `HouseFirstRoot()` (`ContentView.swift:154-160`).

**What that costs a round-one tester on the shipped root:** Settings, Account, **Sign out**, the QR
scanner, the in-context auth sheet, "Add a room" from Spaces, Move/Copy item, and the Design-services
flow are all unreachable. `grep -rn "signOut()" Patina/Features` returns only `SettingsView.swift` and
`AccountView.swift`, and `AccountView` is reached from inside `SettingsView` — so **there is no way to
sign out of the app on the root every tester will see.** The Companion menu's "Your studio · STYLE ·
SETTINGS" row navigates to the Studio hub, not to Settings (shots `71`, `72`).

Consequence for this walk: `A-100`, `C-23`, `A-99`, `C5-05`, `B-60`, `B-15`, `GAP3-18` and `C2-06` could
not be exercised at all. They are recorded **BLOCKED**, not passed.

### W1-B-01 — the numeric keyboard toolbar renders three "Done" buttons (**major**)

Focusing any numeric field on Manual Room Entry draws **three "Done" buttons side by side** in the
keyboard accessory bar, below the tab bar (shots `13`, `14`). `ManualRoomEntryView` has three
`.numberPad`/`.decimalPad` fields, and integration commit `1773570b1` (note `B-L1A-2`, finding `C9-08`)
put `.keyboardDoneToolbar()` on each of them; SwiftUI merges every `ToolbarItemGroup(placement:
.keyboard)` in the hierarchy, so one toolbar per field stacks into one bar with three buttons. The fix is
one toolbar per *screen*, not per field.

---

## 2. Ledger

| # | Shot | What it shows |
|---|---|---|
| 01 | `01-welcome-cold.png` | Cold launch, Welcome: Apple + email + "Look around first" + "Have a password? Sign in", legal footer. **No Google** (D3). Terms/Privacy links measure 44 pt tall in the AX tree (`GAP1B-08`). |
| 02 | `02-signin-filled.png` | Sign-in sheet with `client@patina.dev` typed |
| 03 | `03-today-signedin.png` | The peer `supabase stop` landing: "Something went wrong on our side. Try again, or write to hello@patina.cloud." — an honest 5xx surface. Retried after the stack returned; succeeded. |
| 04 | `04-post-signin.png` | Post-sign-in onboarding carousel ("Every room tells a story" / "Let's begin" / Skip) |
| 05 | `05-today-root.png` | **Today on the four-tab root** with no `-PatinaFlags` — D1a holds |
| 06 | `06-today-inline-help-tooltip.png` | Greeting `?` tooltip — clipped top **and** bottom (`B-07`, `C-18`) |
| 07 | `07-today-pull-to-refresh.png` | Today after a pull-down |
| 08 | `08-spaces-root.png` | Spaces root; one `?`, labelled "About Your Spaces", 44 × 44 (`C-05`) |
| 09 | `09-spaces-add-room-sheet.png` | The `+` tapped three times — **no sheet** (W1-B-02) |
| 10 | `10-spaces-help-tooltip.png` | Spaces tooltip — clipped top and bottom, second surface for `B-07`/`C-18` |
| 11 | `11-companion-menu.png` | Companion menu, first open: coach mark **above** the menu, every row visible (`A-50`) |
| 12 | `12-manual-room-entry.png` | Manual entry: chips 44 pt, wrapped to two rows, filled selection (`C6-18`); Length/Width **empty** with placeholders, Save Room disabled (`GAP4-03`) |
| 13 | `13-manual-entry-numpad-toolbar.png` | **Three "Done" buttons** (W1-B-01) |
| 14 | `14-manual-entry-filled.png` | Save Room enabled once both dimensions are typed |
| 15 | `15-spaces-after-add.png` | Room added; Whole Home 1 room → **2 rooms** |
| 16 | `16-scan-fallback.png` | Scan fallback: persistent **"Not now"** (`GAP4-02`), empty dimension fields, disabled CTA (`GAP4-03`) |
| 17 | `17-scan-fallback-not-now.png` | "Not now" lands on Today — not a dead end |
| 18–21 | `18…21` | Room detail → Room Settings → Delete confirm |
| 20 | `20-room-settings-scrolled.png` | Back chevron floating over the scrolling "Room Name" label, no bar, no material (`A-89`) |
| 22 | `22-after-delete.png` | Delete pops **straight back to the Spaces list** (`B-04`); Whole Home back to **1 room** (`B-03`) |
| 23 | `23-studio-hub.png` | Studio hub: **1 ROOM** — the deleted room is gone from Studio too (`B-03`) |
| 24–26 | `24…26` | Studio scrolled; `26` shows YOUR ROOMS with only Guest Bedroom |
| 25, 79 | `25`, `79-studio-header-scroll-edge.png` | "Your Studio" header is an **opaque band with a hairline**; content is masked as it scrolls under (`B-27`) |
| 27 | `27-settings-sheet.png` | Settings tapped — **nothing opens** (W1-B-02) |
| 28 | `28-thread-list.png` | Notifications feed: 5 rows, 3 unread, "Mark all read" |
| 29 | `29-notifications-marked-read.png` | After "Mark all read": dots gone, control gone |
| 30 | `30-today-badge-cleared.png` | Bell badge **cleared** on Today |
| 31 | `31-thread-detail.png` | Thread: header with back + avatar + project line and a hairline; **composer sits above the tab bar and is tappable** (`L07-02`) |
| 32 | `32-thread-send-online.png` | Send works — message appended, composer cleared |
| 33–35, 81 | `33` (t≈3 s), `34` (t≈11 s), `81` (t≈33 s), `35` (t≈63 s) | Send with kong paused: spinner → **"We couldn't send that. Nothing was lost — your message is still here." + "Try again"**, text restored in the composer (`L07-03`) |
| 36–37 | `36`, `37` | Cold launch with kong paused: record rows survive; **designer seat missing**; no staleness signal |
| 38 | `38-studio-backend-down-t2.png` | Studio loading state is honest: spinner + "Gathering your Studio…" (`R-01`) |
| 39 | `39-studio-backend-down-t38.png` | Studio failure: honest error card **but** "Nothing needs your attention right now." printed above it (`R-01`) |
| 40 | `40-studio-recovered-ptr.png` | **Pull-to-refresh recovers the Studio completely** once kong is back |
| 41, 78 | `41-studio-staleness-warm.png`, `78-studio-stale-count-no-staleness-line.png` | Failed refresh on a warm hub: **"5 things need your eye" kept as current, no staleness line** (`L07-05`) |
| 42–45 | `42…45` | Pieces: loading, browse, save, unsave |
| 46–48 | `46…48` | Proposal list → detail (rendered in ~2 s, `R-05`) → Sign CTA |
| 48 | `48-proposal-sign-cta.png` | Back chevron floating over the scrolling "Timeline" heading (`A-89`); five Selections lines with **no money** (`L07-07`, W2) |
| 49–50 | `49`, `50` | Sign sheet at `large`: Cancel below the fold at `.medium`, reachable at `.large` |
| 51–52 | `51`, `52` | Sign sheet at accessibility-extra-large: **"TOTA / L", "EXPI / RY"**, nothing actionable at `.medium` (`L07-09`, W2) |
| 53 | `53-studio-axxl.png` | Studio at AX-XL — stats reflow vertically, no mid-word break |
| 54 | `54-decisions-list-axxl.png` | Decision card title breaks mid-word: **"Design Developme / nt sign-off"** |
| 55–56, 80 | `55`, `56`, `80` | The **Approval** decision has no approve control at either text size — only "Not yet", "Neither of these", "Discuss this with your designer" |
| 57–58 | `57`, `58` | Decisions list; the Product decision renders two option cards with "Choose this" |
| 59–60 | `59`, `60` | Consent sheet at `large` **and** at AX-XL: **Approve and Cancel both fully on screen**, Cancel full-width ≥ 44 pt (`GAP1B-01`, `GAP1B-07`) |
| 61–62 | `61`, `62` | Defer sheet at AX-XL **and** `large`: **Send and Cancel both fully on screen** (`GAP1B-02`, `GAP1B-07`) |
| 63–64 | `63`, `64` | Invoice list; invoice detail with **"Pay $4,250.00" pinned to the bottom safe area at rest** (`GAP2-24`) |
| 65–66 | `65`, `66` | After Pay fails: failure panel **scrolled into view and un-clipped**, Pay still visible, two recovery actions (`B-28`) |
| 67–68 | `67`, `68` | Documents (3 fixture files); a broken file gives an honest "Couldn't open this file" alert |
| 69–70 | `69`, `70` | Order (shipped, honest) and Projects (3 — **all three belong to this client in the seed**, verified in SQL) |
| 71–72 | `71`, `72` | Companion menu on Studio; "Your studio" navigates to the hub, **not** to Settings |
| 73–75 | `73`, `74`, `75` | Browse **loading** and **error** both fill the screen edge to edge (`R-06`); retry recovers to 16 pieces |
| 76–77 | `76`, `77` | Product detail: one band ("Good match"), same as the grid card (`C-11`); Back/Share/Save **pinned in an opaque chrome band** while content scrolls (`A-45`) |
| 82 | `82-today-axxl.png` | Today greeting at AX-XL: **"Good afternoon" wraps cleanly**, no mid-word break (`C-06`, `GAP1B-03`) |
| 83 | `83-first-launch-tour-step1.png` | First-launch tour step 1: **Skip/Next are Patina brown/charcoal, not system blue** (`B-09`); the bubble sits over two live record rows with no dim or cut-out |
| 84 | `84-today-after-refresh-online.png` | **Pull-to-refresh on Today restores everything** — the record rows and the designer seat come back |

---

## 3. Verdict per id in scope

### 3.1 L1-B — 28 rows

| id | verdict | evidence |
|---|---|---|
| `C7-01` | **not walkable** | needs a deliberately corrupt store. Three cold launches, no crash-loop, no recovery notice. |
| `C7-02` | **PASS (weak)** | the Saved surface renders ("Saved · NOTHING YET", `43`) and a save/unsave round trip works (`44`, `45`) with no `BoardModel` trap. Boards themselves were not exercised. |
| `C4-16` | **PASS (indirect)** | with kong paused, the message send failed at 15–33 s and the Studio load at ~30 s, not at `URLSession.shared`'s 60 s. Shots `34`, `81`, `39`. |
| `A3-18` | **not walkable** | payload shape is invisible from the UI. |
| `C7-17` | **PASS (weak)** | the single-piece read renders (`76`) and the saved-pieces read renders (`44`); no all-or-nothing blank. |
| `A-34` | **PASS, with the §7 caveat** | every card and the detail show a **qualitative band** ("Good match", "Worth a look") — no 40–46 % percentages anywhere (`43`, `76`). §7 records that L1-C's `matchVerdict` guard (`46752b646`) is unmerged, so an **unscored** piece would still draw a band; the fixture has no unscored piece, so that half is unproven either way. |
| `C-11` | **PASS** | Fixture Oak Dining Table reads "Good match" on the grid (`43`) and "Good match" on the detail (`76`) in the same session — one verdict, one scope. |
| `C7-13` | **not walkable** | telemetry queue is invisible from the UI. |
| `C7-15` | **not walkable** | needs a real scan upload. |
| `C7-05` | **not walkable** | needs LiDAR. |
| `GAP4-02` | **PASS** | a persistent "Not now" sits on the fallback entry screen and lands the user on Today (`16`, `17`). |
| `GAP4-03` | **PASS ×2** | Length/Width start **empty** with placeholders and the CTA is disabled, on both the manual-entry form (`12`) and the scan-fallback form (`16`). |
| `GAP4-25` | **not walkable** | Rescan needs a completed LiDAR scan. |
| `C1-18` | **PASS (unmeasured)** | every cold launch reached content in ≤ 3 s; no 1.5 s dwell was perceptible. Not timed with instruments. |
| `C1-19` | **PASS** | cold launch with kong **paused** reached the Today root, not a terminal splash (`36` at t≈3 s). |
| `C4-03` | **PASS (2 of 3)** | Studio distinguishes loading (`38`) from failure (`39`); Browse distinguishes loading (`73`) from error (`74`). The Spaces branch is not exercisable — this client always has a room. |
| `R-01` | **FAIL (partial)** | the failure state renders an honest error card, but the summary line above it still says **"Nothing needs your attention right now."** while the fetch has failed. Shot `39`. |
| `R-02` | **FAIL** | the first offline cold launch kept the rows but **dropped the designer seat** (`36`, `37`); a later cold launch replaced the whole record with **"Nothing needs you right now." / "Nothing moved yet."** — a false assertion of emptiness for a client with an overdue decision, an unpaid invoice and a sent proposal (`83`). One pull-to-refresh brings all of it back (`84`), which is the proof the data was never gone. |
| `L07-05` | **FAIL** | no staleness line in either failure shape. Cold: no counts, honest error, but "Nothing needs your attention right now." Warm: **"5 things need your eye" is kept and printed as current** while every section is replaced by the error card, and `StudioHub.StalenessLine` never appears. Shots `41`, `78`. The render site landed (note O12); nothing ever produces a line. |
| `R-05` | **PASS** | proposal detail rendered in ~2 s, fully populated (`47`) — no 65–185 s "One moment…". |
| `B-03` | **PASS** | after the delete the Studio reads **1 ROOM** and YOUR ROOMS holds only Guest Bedroom (`23`, `26`); Whole Home went 2 → 1 (`22`). |
| `B-04` | **PASS** | Delete pops to the Spaces list; no dead detail, no hedged not-found (`22`). |
| `B-15` | **BLOCKED** | no reachable sign-out — W1-B-02. |
| `GAP3-18` | **BLOCKED** | same. |
| `C2-06` | **BLOCKED** | same. |
| `C4-12` | **PASS** | `.refreshable` is on all four roots and every Studio detail in the merged tree, and two pulls were exercised end to end: Studio recovered from its error state (`40`) and Today restored its whole record (`84`). |
| `R-03` | **HALF FAIL** | pull-to-refresh: **PASS** (`84`). Staleness line on Today: **absent**. L1-C declined note `C-L1B-1`'s third half and routed it to L1-B after merge (`l1c-tasks.md:71`); integration.md §3's applied-note list does not contain it, and `grep -rn 'stalenessLine' Patina/Features` resolves only to `StudioHubViewModel`/`StudioHubView`. Confirmed on screen: Today shows a wiped record with no "last updated" of any kind (`83`). |
| `A-81` | **PASS** | every count now names what it counts: bell `AXValue "3 unread"`, Studio "5 things need your eye" / "Awaiting you, 5 things awaiting you", Today's NEEDS YOU is a capped list with "See all →". The numbers differ (3 vs 5) but each is labelled, which is the finding's second option. |
| `R-10` | **PASS** | no `?` opens the Sanity help panel any more — both doors open an inline tooltip carrying a local fallback sentence, so "No help articles yet … on the way" never appears (`06`, `10`). |

### 3.2 L1-C — 28 rows

| id | verdict | evidence |
|---|---|---|
| `C9-04` | **PASS** | every root's last row clears the tab bar; Save Room (`14`), Pay (`64`), Sign proposal (`48`) and the Studio tail (`26`) all sit above it. The one control that does not is the keyboard accessory bar — a different mechanism (W1-B-01). |
| `C5-02` | **PASS** | the six `?` doors no longer reach Sanity; the inline tooltip prints its own fallback text (`06`, `10`). |
| `C-05` | **PASS** | one help affordance per header, distinct labels ("About Your Spaces", "About Today"), 44 × 44 hit box in the AX tree. |
| `B-07` | **FAIL** | the tooltip's text overflows the bubble **top and bottom** on two surfaces: Today (`06` — first line cut above the rounded rect, "one active room." cut off below) and Spaces (`10` — first line cut, "Scroll past the Whole Home bar to see them." cut). |
| `C-18` | **FAIL (both halves)** | same clipping as `B-07`, **and** the trigger is still unreachable to VoiceOver on Today: `describe_screen(nested: true)` returns the greeting as `AXGroup "Today"` with `children: []`, while the identical component on Spaces is exposed as `AXButton "About Your Spaces"`. The `.accessibilityElement(children: .contain)` + `.accessibilityLabel("Today")` pair at `DailyGreetingHeader.swift:153-155` swallows it. |
| `A-100` | **BLOCKED** | W1-B-02 — the Settings sheet never opens. |
| `C-23` | **BLOCKED** | same. |
| `A-99` | **BLOCKED** | same. |
| `C5-05` | **BLOCKED** | the Help Center row is inside Settings. |
| `A1-14` | **not walked** | `DesignerConsultationView` is behind "Get design help", which was not opened this walk. |
| `A-50` | **PASS** | the Companion's first-run coach mark is anchored **above** the menu; every menu row stays visible (`11`). |
| `B-10` | **PARTIAL** | the Companion case passes (`11`). The first-launch tour's step 1 is anchored below its target and the target stays visible, but the bubble is drawn over two live record rows with **no dim and no highlight cut-out**, which is the other half of the fix (`83`). |
| `B-09` | **PASS** | tour Skip/Next are Patina ink and a charcoal pill — no system blue anywhere in the tour (`83`). |
| `B-27` | **PASS** | the "Your Studio" title band is opaque with a hairline and masks content scrolling beneath it; the floating capsule is gone (`25`, `79`). |
| `A-89` | **FAIL** | the circular back control still floats over scrolling content with no bar and no material, on two of the finding's own screens: Room Settings, over the "Room Name" label (`20`), and the proposal detail, over the "Timeline" heading (`48`, and again at AX-XL). |
| `A-45` | **PASS** | product detail's Back / Share / Save are pinned in an opaque chrome band; content scrolls beneath them (`76` → `77`). |
| `GAP1B-01` | **PASS** | consent sheet at `large` (`59`) **and** at accessibility-extra-large (`60`): Approve and Cancel both fully on screen, pinned at the bottom. |
| `GAP1B-02` | **PASS** | defer sheet at accessibility-extra-large (`61`) **and** `large` (`62`): Send and Cancel both fully on screen. |
| `GAP1B-07` | **PASS** | Cancel on both sheets is a full-width outlined button ≥ 44 pt, not a 17.6 pt ghost link. |
| `B-28` | **PASS** | after the payment failure the panel is scrolled into view and un-clipped, and **Pay stays visible above the tab bar** with two recovery actions (`66`). |
| `GAP2-24` | **PASS** | "Pay $4,250.00" is a pinned bottom footer, fully visible **at rest** on an iPhone 17 Pro (`64`). |
| `C6-18` | **PASS (2 of 3 halves)** | chips measure exactly 44 pt in the AX tree, the row wraps to two lines, and selection is a filled pill with inverse ink, not colour-only (`12`). The `.isSelected` **trait** cannot be read through `describe_screen`, so that half is unverified rather than failed. |
| `B-60` | **BLOCKED** | the Add-a-new-room sheet is exactly the sheet W1-B-02 kills. |
| `R-06` | **PASS** | Browse fills the screen edge to edge in **loading** (`73`) and **error** (`74`); no cream band floats over a white ground. |
| `C-06` | **PARTIAL FAIL** | the Today header (`82`) and the Studio header (`53`) reflow cleanly at AX-XL with no mid-word break. Three other surfaces still break mid-word at the same size: the Decisions card title **"Design Developme / nt"** (`54`), the sign sheet's **"TOTA / L"** and **"EXPI / RY"** (`51`, `52`), and the decision option badge **"Recommende / d"**. |
| `GAP1B-03` | **PASS** | "Good afternoon" takes the full content width and wraps at a word boundary at accessibility-extra-large; the bell/Studio cluster has moved out of the greeting's band (`82`). |
| `GAP4-16` | **not walked** | the Reveal lives inside the style-quiz flow, which this walk did not enter. |
| `P-34` | **not walked** | Welcome was not exercised at accessibility-XXXL (L1-A's row). |
| `GAP1B-08` | **PASS** | on the Welcome screen `auth.welcome.termsLink` and `auth.welcome.privacyLink` both report `height: 44` in the AX tree, as do `auth.welcome.passwordButton` and the sign-in form's "Forgot password?" / "Email me a code" / "Sign up" links. |

### 3.3 L1-X — 1 row

| id | verdict | evidence |
|---|---|---|
| `L07-01` | **PASS at the level this walk can reach; the app path is unproven** | `00559` is the head of `supabase_migrations.schema_migrations` on the local stack, so the multi-studio signing migration is applied. The client app cannot exercise the finding: it needs a designer who belongs to two active studios, which the fixture does not create, and completing a signature would have mutated the shared fixture out from under walkers A and C. The sign sheet itself opens and accepts input (`49`–`52`). |

### 3.4 The four extra ids

| id | verdict | evidence |
|---|---|---|
| `L07-01` | as above | — |
| `L07-02` | **PASS** | the composer sits above the tab bar, is tappable, accepts text and sends (`31`, `32`). |
| `L07-03` | **PASS, with a timing note** | the failure surfaces **inline above the composer** — "We couldn't send that. Nothing was lost — your message is still here." with **Try again** — and the typed text is restored. It is not instant: nothing at t≈3 s or t≈11 s, present by t≈33 s (`33`, `34`, `81`, `35`). That is the network request budget, not the old "at least a minute", but a tester holding the phone waits ~20–30 s in silence. |
| `L07-05` | **FAIL** | see §3.1. |

---

## 4. New defects

| id | severity | where | what happens | fix | lane · related |
|---|---|---|---|---|---|
| **W1-B-02** | **blocker** | `ContentView.swift:91-95` + `Features/Navigation/HouseFirstRoot.swift` | On the `house-first` root no `coordinator.presentedSheet` sheet presents. Settings, Account, **Sign out**, QR, in-context auth, Add-a-room, Move/Copy, Design services are all unreachable. Reproduced on `.newRoom` (shot `09`) and `.settings` (shot `27`), each three taps, `describe_screen(all: true)` empty of sheet content. | Host the sheet driver **inside** `HouseFirstRoot`'s `rootContent` (or move it onto the selected tab's `NavigationStack`) so it lives in the same presentation context as the tab stacks, and pin it with a test that presents each `PresentedSheet` case on the house-first root. | L1-F (owns `AppCoordinator`) / L1-C (`HouseFirstRoot`) · blocks `A-100`, `C-23`, `A-99`, `C5-05`, `B-60`, `B-15`, `GAP3-18`, `C2-06` |
| **W1-B-01** | major | `Features/Rooms/Views/ManualRoomEntryView.swift:70,147` (+ the windows field) | Three "Done" buttons in one keyboard accessory bar (shots `13`, `14`). `.keyboardDoneToolbar()` was applied per field by `1773570b1`; SwiftUI merges every keyboard `ToolbarItemGroup` in the hierarchy. | One `.keyboardDoneToolbar()` per screen (attach it to the form's root, or gate it on `focusedField != nil`), and change `KeyboardDismissalTests` from "every bare numeric field carries the modifier" to "every screen with numeric fields yields exactly one keyboard toolbar". | L1-B · `C9-08`, note `B-L1A-2` |
| **W1-B-03** | major | `Features/Decisions/Views/DecisionDetailView.swift` | The **Approval** decision the client is blocking ("Design Development sign-off — drawing set B", badge `Approval`, Overdue Aug 30) offers **no approve control** at either text size — only "Not yet", "Neither of these" and "Discuss this with your designer" (shots `56`, `80`). A decision with no `options` rows renders no primary action, so the client cannot do the one thing Procurement is waiting on. | Synthesise an Approve/Decline pair when a decision of kind `approval` has no options, or render the approval CTA from the decision itself rather than from its option list. | L1-C · new (adjacent to `GAP1B-01`) |
| **W1-B-04** | major | `Features/Profile/Views/StudioHubView.swift` + `Features/Home/Views/DailyRoomView.swift` | Two surfaces assert emptiness the moment a fetch fails: the Studio prints "Nothing needs your attention right now." directly above its own "We couldn't gather your Studio" card (`39`), and Today replaces a live record with "Nothing needs you right now." / "Nothing moved yet." (`83`) — recoverable only by pulling to refresh (`84`). | Suppress the empty-summary sentence whenever `lastLoadFailed` is true (Studio) and keep the persisted record rows on a failed refresh instead of writing the empty result through (Today). | L1-B · `R-01`, `R-02` |
| **W1-B-05** | major | `Features/Home/Views/DailyGreetingHeader.swift:153-155` | The greeting's `HelpInfoIcon` is invisible to VoiceOver: `describe_screen(nested: true)` returns `AXGroup "Today"` with `children: []`, while the identical component on Spaces is a reachable `AXButton "About Your Spaces"`. | Drop `.accessibilityLabel("Today")` from the `.contain` container (or move the label to the date/greeting text and leave the container unlabelled) so the child button stays in the tree; add an AX-tree assertion for "About Today" beside the existing `HelpDoorRemovalTests`. | L1-C · `C-18` |
| **W1-B-06** | minor | `Features/Rooms/**` vs `Features/Profile/Views/StudioHubView.swift` | The same room is described two ways: Your Spaces says **"180 sq ft · Typed, not scanned"** and the room card in the Studio says **"SCANNED SEP 3"** (shots `08` vs `26`). The Room Settings screen also labels typed dimensions "Scan Data — 120 sq ft · 2 windows detected" (`19`). | Derive the provenance label from one source (`room.captureMethod`) and use it on all three surfaces; "detected" belongs only to a real scan. | L1-B (room model) / L1-C (Studio card) · new |
| **W1-B-07** | minor | `Features/Recommendations/Views/RecommendationsView.swift`, `Features/Documents/DocumentListView.swift`, `Features/Invoices/Views/InvoiceDetailView.swift` | Straight ASCII apostrophes survive on screens the deck normalised elsewhere, sometimes beside a U+2019 in the same viewport: "Couldn**'**t load recommendations" next to "Let**’**s try that again" (`74`); "Couldn**'**t open this file / We couldn**'**t open this file. Please try again." (`68`); "Remind me the day before it**'**s due", "WHAT**'**S INCLUDED" (`64`). The document alert also repeats its title as its body. | Extend the `A-06` apostrophe sweep to these three files and give the document alert a body that adds something the title does not. | L1-E · `A-06`, deck |
| **W1-B-08** | minor | `Features/Decisions/Views/DecisionDetailView.swift` | "Not yet" and "Neither of these" sit shoulder to shoulder with almost no gutter; at accessibility-extra-large they read as one run of text and the tap targets abut (`55`, `.tmp12` frame). | Give the secondary pair the same 44 pt full-width treatment the sheets' Cancel now has, or stack them above `.xxLarge`. | L1-C · `GAP1B-07` |
| **W1-B-09** | polish | `Features/Help/FirstLaunchTour.swift` | At accessibility-extra-large the tour bubble truncates its own title — "Welcome to Pat…" (`82`) — and at any size the bubble is drawn over live content with no dim or highlight cut-out (`83`). | Let the tour title wrap, and add the dim/cut-out `B-10`'s fix names. | L1-C · `B-10` |

**Checked and cleared, so nobody re-files them:** the client seeing three projects (Birch Hollow,
Marrow & Vale Residence, Aspen Loft Refresh) is **not** a leak — `select name, client_id from
public.projects` shows all three carry `client_id = a0000000-…-0005`. The full-colour emoji room-type
tiles on the scan-fallback screen are the known open row `GAP4-06` (T1/minor, L1-A), not new.

---

## 5. What this walk could not reach

- **Everything behind `presentedSheet`** — see W1-B-02. That is the sign-out half of the wave
  (`B-15`, `GAP3-18`, `C2-06`) and the whole Settings-sheet group (`A-100`, `C-23`, `A-99`, `C5-05`),
  plus `B-60`. The scope's *"sign out → guest shows nothing of the previous account → sign in as
  `james.okafor@example.com`"* leg is therefore **not performed**: there is no reachable sign-out on the
  root under test, and reinstalling the app would have tested a fresh install, not the sign-out path the
  three findings are about.
- **Anything needing LiDAR or a real upload** — `GAP4-25`, `C7-15`, `C7-05`.
- **Anything invisible from the UI** — `C7-01`, `A3-18`, `C7-13`.
- **`GAP4-16`, `P-34`, `A1-14`** — surfaces this walk's route did not enter.
- **`L07-01`'s app path** — needs a two-studio designer, and signing would have mutated the shared
  fixture for the other walkers.

Deliberately **not** done, to keep the shared local fixture intact for walkers A and C: the proposal was
not signed and no decision was approved or deferred (both sheets were opened, measured and cancelled).
Fixture state this walk did change: one room added and deleted (net zero), one message sent in the
Aspen Loft thread, and the notification feed marked read.

---

# Re-walk 1 — on the fix-round-1 tip

Walker **B**, 2026-09-03, on `first-flight/w1-integration` tip
`1e9372fb27d23597ad1a6a176aa5d4f9f794b954`.

| | |
|---|---|
| Device | `EDFCE6CF-F87A-48D4-AF32-E1A3D8B0AEF5` (`ff-w1-walk-b`), light appearance, 9:41 status bar |
| Launch | `xcrun simctl launch … cloud.patina.app -DeploymentTarget local`, no `-PatinaFlags`, on every launch |
| Build proof | installed `Patina.debug.dylib` sha256 `34690a5c41ddd39b3656238867ee07e552753cff40aa5ae011aabe796f0f9b88` == the worktree build product's; `strings` finds `RecordStaleness`, `keptPreviousRecord`, `PatinaScreenChrome` in it |
| Shots | `artifacts/ios-testflight-polish-2026-09-01/shots/w1-walk-b-r1/` (45 frames + `ledger.md`) |
| Accounts | `client@patina.dev`, plus `james.okafor@example.com` for the isolation leg |

No production write of any kind; the only database touched is `127.0.0.1:54322`. `git` was never run in
the main checkout. Kong was paused twice for the offline probes (18:20:34→18:32:28, 18:34:12→18:36:02)
and is left **Up** (`/auth/v1/settings` = 200). The device is left signed in as `client@patina.dev` at the
default text size with the fixture unchanged.

---

## 0. The harness fault that produced W1-B-02 — and how it was found

The re-walk opened with **every tap silently ignored**. `device_action` returned `Tapped at (x, y)`,
`describe_screen` and `simctl io screenshot` both worked, and nothing on the device moved — including
the HOME button. A full `simctl shutdown` + `boot` did not fix it.

The cause is blitz's idb layer, not the app:

```
$ ps aux | grep EDFCE6CF | grep idb
73888 …/.blitz/idb-companion/bin/idb_companion --udid EDFCE6CF-…   # started 15:10
75980 …/.blitz/python/bin/idb … shell --no-prompt --udid EDFCE6CF-…
```

Both were bound to a **previous boot session** of the simulator. Killing them, removing
`/tmp/idb/EDFCE6CF-…_companion.sock` and starting a fresh `idb_companion` restored HID immediately:

```
$ idb ui tap --udid EDFCE6CF-… 201 607   →  the sign-in sheet presented on the first tap
```

Blitz's own `device_action` then reported `Error executing tap: Shell process not available` (its child
shell had been killed and does not respawn), so **this whole re-walk drove HID through `idb ui tap /
text / swipe` directly**, with `describe_screen` for the tree and `xcrun simctl io … screenshot` for every
frame. No desktop capture was used.

> **This is what W1-B-02 was.** A tap that never reaches the device is indistinguishable, from the
> outside, from a door that does nothing. Every future walk should confirm HID with one control that
> is *known* to work before filing any "tap does nothing" defect.

---

## 1. W1-B-02 is withdrawn — the sheets present

Three separate `AppCoordinator.PresentedSheet` cases were presented on the shipped `house-first` root,
each on the **first** tap:

| entry point | case | result |
|---|---|---|
| Your Spaces header `+` | `.newRoom` | "Add a new room" sheet (shot `06`) |
| Studio → MORE → Settings | `.settings` | Settings sheet (shot `09`) |
| Guest Studio → "Sign in" | `.auth` | the in-context auth sheet (shot `41`) |

`PresentedSheetHostTests` (`1e9372fb2`) reaches the same conclusion by source pin. The finding was a
harness artefact; the eight ids it blocked were all walked this round and all pass (§3).

---

## 2. Verdict on every FAIL the first walk recorded

| id | was | now | evidence |
|---|---|---|---|
| `R-01` | FAIL (partial) | **PASS** | Studio's cold failure renders the honest card with **no** "Nothing needs your attention right now." anywhere above it (`33`); the loading state is equally clean (`31`, `32`). |
| `R-02` | FAIL | **PASS on the rows, FAIL on the designer seat** | An offline cold launch now keeps the whole Record — three NEEDS YOU rows, three MOVED rows, "See all" (`26` at t≈4 s, `30` after the fetch failed). The **designer seat is still dropped**: "Leah Hartwell · Aspen Loft Refresh · Message" is present online (`02`, `45`) and absent on every offline frame (`26`, `27`, `30`), with "YOUR HOUSE" following the card directly. |
| `L07-05` | FAIL | **PASS** | Warm hub, failed refresh: **"5 things need your eye" + "Last updated 1 minute ago." + "We couldn't gather your Studio…"** in that order (`34`, `36`). The cold shape prints no staleness line, which is correct — there is no earlier count to be stale (`33`). |
| `R-03` | HALF FAIL | **PASS** | Today prints **"Last updated 12 minutes ago."** at the head of the Record while offline (`30`, and behind the tour in `28`/`29`). Pull-to-refresh already passed in round one. |
| `B-07` | FAIL | **PASS** | Today's tooltip shows all four lines inside the bubble with padding above the first and below the last (`03`); Spaces' shows all five, "Scroll past the Whole Home bar to see them." fully visible (`05`). |
| `C-18` | FAIL (both halves) | **PASS (both halves)** | Clipping as above. VoiceOver: `describe_screen(nested: true)` now returns `AXButton "About Today"` at `{{161.17, 133.33}, {44, 44}}`, help "Shows additional information.", and the date line carries the surface name as `AXStaticText "TODAY. THURSDAY · SEP 3"`. Was `AXGroup "Today"` / `children: []`. |
| `A-89` | FAIL | **PASS** | On both of the finding's own screens the scroll-edge scrim fades content out as it travels under the chevron: Room Settings, where "Room Settings / GUEST BEDROOM" dissolves rather than sitting at full contrast behind the disc (`14`), and the proposal detail, where "Timeline" does the same (`15`). |
| `C-06` | PARTIAL FAIL | **PASS on all three named surfaces** | Decisions card title wraps on word boundaries — "Design / Development sign- / off — drawing set / B" — with the badge on its own line (`19`); the sign sheet's labels hold one line each, **"TOTAL"** and **"EXPIRY"** (`16`); the option badge reads **"Recommended"** in one capsule (`22`). Today (`44`) and Studio (`18`) headers reflow cleanly. One **new** break appeared in the sign sheet's *value* column — see `W1-B-10`. |
| `B-10` | PARTIAL | **PARTIAL — the dim landed, the cut-out does not track step 1** | The scrim is drawn on every step. Pixel-probed: on **step 3** the un-dimmed rect is x 251–349 pt on the tab-bar row — the Studio tab, exactly (`29`); on **step 2** it is the record card, matching that step's `.todayRecord` anchor (`28`). On **step 1** there is no un-dimmed region anywhere outside the popover itself — the greeting the bubble names measures rgb ≈ (172,170,167) against an un-dimmed (250,247,242), i.e. it stays dimmed (`27`, and again for the guest run in `39`). |

## 2.1 The nine new defects the first walk filed

| id | status | evidence |
|---|---|---|
| `W1-B-01` | **OPEN** | Focusing Length on Manual Room Entry still draws **three "Done" buttons** side by side below the tab bar (`35`). `ManualRoomEntryView.swift` was not touched by the fix round. |
| `W1-B-02` | **WITHDRAWN** | §1 — not reproducible; harness fault (§0). |
| `W1-B-03` | **OPEN** | The Approval decision ("Design Development sign-off — drawing set B", Overdue Aug 30) still offers only "Not yet", "Neither of these", "Discuss this with your designer" — no approve control, at either text size (`20`, `21` scrolled to the end). |
| `W1-B-04` | **PARTLY FIXED** | Its Studio half is `R-01` (fixed) and its Today half is `R-02` (rows fixed, designer seat not). Keep the seat half open. |
| `W1-B-05` | **FIXED** | Same evidence as `C-18`'s VoiceOver half. |
| `W1-B-06` | **OPEN** | Same room, two provenance stories: Your Spaces "180 SQ FT · TYPED, NOT SCANNED" (`04`) vs the Studio card "SCANNED SEP 3" (`08`); Room Settings still heads the block "Scan Data". |
| `W1-B-07` | **OPEN, and wider than filed** | Counting quoted string literals under `apps/mobile/Patina/Patina`: **168** carry a straight apostrophe against **134** carrying U+2019. `PatinaErrorState.retryLabel = "Let’s try that again"` (curly) renders directly beneath `RecommendationsViewModel`'s `"Couldn't load recommendations"` (straight). Every `Couldn't load …` view-model string is affected — 14 files, not the three the finding names. |
| `W1-B-08` | **OPEN** | "Not yet" and "Neither of these" still abut with no gutter and read as one run at AX-XL, on both decision kinds (`20`, `21`, `22`). |
| `W1-B-09` | **HALF FIXED / half not re-walkable** | The dim it asked for exists (see `B-10`). The AX-XL title truncation ("Welcome to Pat…") could not be re-tested: the tour is one-shot per install and had already run at the default size by the time the text size was raised. |

## 3. The eight ids W1-B-02 had blocked — all walked, all pass

| id | verdict | evidence |
|---|---|---|
| `A-100` | **PASS** | The Settings sheet carries a **Done** control, top right (`09`). |
| `C-23` | **PASS** | A visible drag indicator sits at the top of the sheet (`09`, `37`). |
| `A-99` | **PASS** | Appearance is applied **inside** the sheet and survives a round trip: System → Dark turns the sheet dark (`12`), Dark → Light turns it light again (`13`). No stuck-dark sheet. Left on System. |
| `C5-05` | **PASS** | SUPPORT holds "Contact us" and "Terms & privacy" only — **the Help Center row is gone** (`10`). |
| `B-60` | **PASS** | "Add a new room" is one opaque ground at a fixed detent, two identical tiles, SF Symbols in both rows (camera-viewfinder, ruler) — no `◎`, no `📐` (`06`). |
| `B-15` | **PASS** | Sign out is reachable (Settings → Sign out → "Sign out?" confirm, `37`), lands on Welcome (`38`), and leaves nothing behind: guest Today has no record rows and an empty house (`39`), guest Studio reads "Guest / 0 ROOMS / 0 SAVED" with no taste portrait (`40`), and signing in as `james.okafor@example.com` gives "Awaiting you 0 / Nothing needs a decision. / In progress 0" (`42`) and "No rooms yet" (`43`). |
| `GAP3-18` | **PASS** | Same evidence — no room, no saved piece, no style profile crosses the sign-out. |
| `C2-06` | **PASS** | The sign-out happened on the **Studio** tab and the app came back on **Today** with an empty stack; the second account opened on its own Studio with no page of account A's beneath it. |

## 4. New defects found in this re-walk

| id | severity | where | what happens | fix | lane · related |
|---|---|---|---|---|---|
| **W1-B-10** | minor | `Features/Proposals/Views/ProposalSignSheet.swift` (the value column beside `MonoLabel`) | `C-06`'s label fix took, and the **value** now breaks instead: at accessibility-extra-large TOTAL reads **"$18,500 / .00"** — a contract's money figure split after the thousands group (`16`, `17`). | Give `Text(line.value)` the same one-line treatment the label got (`lineLimit(1)` + `minimumScaleFactor` + `allowsTightening`), or drop the fixed label column above `.accessibility1` and stack label over value. | L1-C · `C-06` |
| **W1-B-11** | minor | `Features/Profile/Views/StudioHubView.swift` (the "MEMBER SINCE …" caption) | At accessibility-extra-large the mono caption spans the full 402 pt with no margin and clips at both edges — the leading "M" is cut and "2026" runs into the right edge (`18`). | `minimumScaleFactor` + `allowsTightening` on the caption, or let it wrap above `.accessibility1`. | L1-C · `C-06` |
| **W1-B-12** | minor | `ContentView.sheetContent(for: .auth)` → `AuthSheet()` | The in-context auth sheet presents with **no Done/Cancel control and no drag indicator** (`41`) — the exact pair `A-100`/`C-23` gave Settings. A reader who does not know to swipe down has no visible way out. | Apply the same sheet chrome to `AuthSheet` (`presentationDragIndicator(.visible)` + a Done/Cancel), or route both through one shared modifier so a new `PresentedSheet` case cannot ship without it. | L1-C · `A-100`, `C-23` |
| **W1-B-13** | polish | the guest / empty `YourSpacesView` CTA | "**◎** Scan Your First Room" still carries the `◎` glyph `B-60` replaced on the add-room sheet — the same character, one screen away (`43`). | Use the SF Symbol the add-room sheet now uses. | L1-C · `B-60` |
| **W1-B-14** | polish | `Features/Help/FirstLaunchTour.swift` step 2 | Step 2's copy names a control it does not point at: "Add pieces to a room with **+ Add**", while its anchor is `.todayRecord` — so the new spotlight lights the Record card (`28`). Invisible before the cut-out landed; obvious now. | Either move the step to the `+ Add` anchor or rewrite the copy to describe the Record. | L1-C · `B-10` |
| **W1-B-15** | polish | `FirstLaunchTourScrim` in `Features/Help/FirstLaunchTour.swift` | The scrim is an overlay on `content()`, so the top safe area stays un-dimmed: a bright cream band from y 0 to **y 62 pt** sits above the dim on every tour step (`27`, `28`, `29`, `39`) — pixel-probed rgb (250,247,242) above, (180,178,175) below. | `.ignoresSafeArea()` on the scrim so the dim reaches the screen edge. | L1-C · `B-10` |

## 5. What this re-walk still could not reach

- **`W1-B-09`'s title-truncation half** — the first-launch tour runs once per install, and it had already
  been consumed at the default text size before the size could be raised. It needs a reinstall plus
  `content_size accessibility-extra-large` set *before* first launch.
- Everything round one recorded as **not walkable** (`C7-01`, `A3-18`, `C7-13`, `C7-15`, `C7-05`,
  `GAP4-25`) or **not walked** (`GAP4-16`, `P-34`, `A1-14`) is unchanged — none of it was touched by the
  fix round.

Fixture state this re-walk changed: nothing. The proposal was opened and cancelled, both decision
screens were read only, no room was added or deleted, the notification feed was not touched, and the
appearance setting was returned to System.

---

# Re-walk 2 — on the fix-round-2 tip

Walker **B**, 2026-09-03, on `first-flight/w1-integration` tip
`08397a7d21441baee0c0ea634f75e68fd410f2d8` (was `1e9372fb2`).

| | |
|---|---|
| Device | `EDFCE6CF-F87A-48D4-AF32-E1A3D8B0AEF5` (`ff-w1-walk-b`), light appearance, 9:41 status bar |
| Launch | `xcrun simctl launch EDFCE6CF-… cloud.patina.app -DeploymentTarget local`, no `-PatinaFlags`, on every launch |
| Build proof | tip commit `08397a7d2` at `2026-09-03 20:34:40 -0500`; build product written `20:37`; installed bundle's `Patina.debug.dylib` sha256 `d70c1d00c12e9a0fdadcc708ffb675aef728e1f1f60bab74763ea10ad9b42529` == the worktree build product's, byte for byte |
| Shots | `artifacts/ios-testflight-polish-2026-09-01/shots/w1-walk-b-r2/` (65 frames + `ledger.md`) |
| Accounts | `client@patina.dev`, plus `james.okafor@example.com` for the isolation leg |
| Scope | only what re-walk 1 left FAIL/OPEN, plus every surface the fixer's 7 commits touched on my lanes |

No production write of any kind; the only database touched is `127.0.0.1:54322`. `git` was never run
in the main checkout — every `git` call ran inside
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-ff-w1-integration` (`git rev-parse
--show-toplevel` confirmed). Kong was paused twice (20:54:21→20:59:0x, 21:0x→21:0x) and is left **Up**
(`/auth/v1/settings` = 200). The device is left signed in as `client@patina.dev`, text size `large`.

## 0. HID preflight, and one hazard for the next walker

The stale-`idb_companion` fault from re-walk 1 was present again: blitz's `describe_screen` returned
`Failed to parse UI description`, and `idb` refused the socket:

```
Failed to connect to companion at address DomainSocketAddress(
  path='/tmp/idb/EDFCE6CF-…_companion.sock'): [Errno 61] Connection refused
```

Removing the socket and starting a companion **with `--grpc-domain-sock`** fixed it (starting one
without that flag binds a TCP port instead and `idb` still cannot reach it). Every tap this walk went
through `idb ui tap/text/key/swipe` with `--companion-path`, and the first thing done after the fix was
a control known to work — the Spaces tab, which responded on the first tap (`02`). No "tap does
nothing" claim is made anywhere below.

> **Hazard:** a peer agent overwrote a helper script in this session's scratchpad with one pinned to a
> **different** simulator udid (`4D075B9D-…`). Scratchpad file names are not private between agents.
> Give any device helper a udid-bearing name; a generic `hid.sh` will be taken from under you.

## 1. Verdict on everything re-walk 1 left open

| id | was (re-walk 1) | now | evidence |
|---|---|---|---|
| `R-02` / `W1-B-04` | rows PASS, **designer seat FAIL** | **PASS** | Offline cold launch (kong paused before launch): the seat "Leah Hartwell · Aspen Loft Refresh · Message" is present at t≈4 s (`26`), still present at t≈35 s (`27`) and after the fetch failed (`30`) — and it names the **right** project, the same one it names online (`01`, `55`). `Last updated 3 minutes ago.` sits at the head of the Record (`28`, `30`). |
| `B-10` step 1 | **PARTIAL** — no cut-out on step 1 | **PASS** | Pixel-probed at x 2.7 pt on `27`: y 0→62 (250,247,242); y 62→117 **dimmed** (180,178,175); **y 117.3→246 UN-DIMMED** (246,243,238 → 238,235,229) — the greeting header the bubble names, which re-walk 1 measured at (172,170,167); y 246→ dimmed (163,162,158). Step 2 lights the Record card (`28`), step 3 the Studio tab — x 280–340 at y 818 = **(238,235,230)**, byte-identical to re-walk 1's shot `29` (`29`). |
| `W1-B-01` | OPEN — three "Done" | **FIXED** | Focusing Length (`09`), Width (`10`) and the Windows count (`11`) each draws **exactly one** "Done" pill. Re-walk 1's `35` showed three side by side on the same screen. |
| `W1-B-03` | OPEN — no approve control | **PASS on the surface; the product gap stays open** | The screen no longer reads as an approval whose button went missing: it states **"There is nothing to choose here yet — your designer has not added the options."** above the two acts that work (`15`). The fixer's note records why nothing can be synthesised — `apply_client_decision` takes a `p_selected_option_id` and raises `insufficient_privilege` unless `coordination_kind = 'selection'`, and this row is `'signoff'` with no options. **A round-one tester still cannot unblock Procurement**; that is now an honest dead end rather than a broken screen, and it belongs to W2 as a backend row. |
| `W1-B-06` | OPEN — two provenance stories | **FIXED** | One string on all four surfaces: Spaces `180 SQ FT · TYPED, NOT SCANNED` (`02`), room detail `12 × 15 FT · 180 SQ FT · TYPED, NOT SCANNED` (`03`), Room Settings **"Room measurements" / `180 sq ft · Typed, not scanned`** (`04`, was "Scan Data — 120 sq ft · 2 windows detected"), Studio card **`TYPED, NOT SCANNED`** (`05`, was `SCANNED SEP 3`). |
| `W1-B-07` | OPEN, and wider than filed | **FIXED on every surface reachable this walk** | Browse error: "Couldn**’**t load recommendations" beside "Let**’**s try that again" — both U+2019 in the same viewport (`37`), the pair that made the finding. Invoice detail: `Remind me the day before it**’**s due`, `We**’**ll send one notification: “…”`, `WHAT**’**S INCLUDED` (`38`). Documents alert: **"Couldn**’**t open this file"**, and the body is now different text — "This document isn**’**t available to open yet." — so the title-repeat half is closed too (`40`). Also curly in passing: `Don**’**t have an account?` and `That doesn**’**t look like an email address yet.` on the sign-in form, `Let**’**s begin` / `You**’**ll still get` on the carousel and add-room sheet. |
| `W1-B-08` | OPEN — abutting pair | **FIXED** | At AX-XL the two stack: `Not yet` `{{24, 594.33}, {103.67, 44}}` and `Neither of these` `{{24, 642.33}, {230.67, 44}}` — separate rows, each 44 pt, a 4 pt vertical gap, no longer one run of text (`18`). At default size the gutter is a real 24 pt (was 12) and both are 44 pt tall (`15`, `16`). |
| `W1-B-09` | HALF FIXED / half not re-walkable | **the filed half is FIXED; a worse one replaced it** | The title no longer truncates — at accessibility-extra-large it **wraps** to "Welcome / to Patina" (`61`). But the bubble now clips its own step counter and its last body line and exposes **no Skip/Next at all** — see `W1-B-18`. |
| `W1-B-10` | new (re-walk 1) | **FIXED** | Sign sheet at AX-XL: **`TOTAL` … `$18,500.00`** on one unbroken line, `EXPIRY` … `Expires Sep 17` likewise (`22`). Re-walk 1 read "$18,500 / .00". The label column's `C-06` fix still holds. |
| `W1-B-11` | new (re-walk 1) | **OPEN — not in the fix round** | At AX-XL the caption measures `{{0.5, 359.33}, {401, 35.33}}` on a 402 pt screen: no margin either side, the leading `M` cut and `2026` running into the right edge (`19`). Not in any of the seven commits, and the screen confirms it. |
| `W1-B-12` | new (re-walk 1) | **FIXED** | The in-context `.auth` sheet now carries **`Sheet Grabber`** `{{163, 57}, {76, 25}}` and **`Done`** `{{342, 74}, {44, 44}}` — the same chrome `A-100`/`C-23` gave Settings (`47`). |
| `W1-B-13` | new (re-walk 1) | **FIXED** | The empty-Spaces CTA reads "Scan Your First Room" behind the **camera-viewfinder SF Symbol** the add-room sheet uses — no `◎` (`52`, account B's empty state). |
| `W1-B-14` | new (re-walk 1) | **OPEN — not in the fix round** | Step 2 still says "Add pieces to a room with **+ Add** — they follow you everywhere." while its spotlight lights the Record card (`28`). |
| `W1-B-15` | new (re-walk 1) | **OPEN, deliberately** | The un-dimmed cream band above the scrim is still there: y 0→62 pt reads (250,247,242) against (180,178,175) below, on every tour step (`27`, `28`, `29`). Commit `7c119e563` records that `.ignoresSafeArea()` was tried and reverted because it moves the cut-out out of the anchors' coordinate space and step 3's spotlight went to (157,156,152). I agree with the trade as stated; the row stays open as polish. |

### Regression checks on the surfaces the fix round touched

| what | result |
|---|---|
| `L07-05` warm shape | **holds** — warm hub, failed refresh: `5 things need your eye` + **`Last updated 1 minute ago.`** + "We couldn’t gather your Studio…" (`35`) |
| `R-03` Today staleness | **holds** — `Last updated 3 minutes ago.` at the head of the offline Record (`28`, `30`) |
| `R-01` | **holds** — the Studio failure card no longer carries "Nothing needs your attention right now." above it (`33`) |
| `C-06` | **holds** at AX-XL on all four re-checked surfaces: decision title, "Recommended" capsule (`17`), sign-sheet labels **and** values (`22`) |
| `A-100`, `C-23`, `C5-05` | **hold** — Settings sheet has Done 44×44 and a grabber; SUPPORT is "Contact us" + "Terms & privacy" only (`41`) |
| `B-60` | **holds** — add-room sheet, two SF-Symbol tiles, one opaque ground (`07`) |
| `GAP4-03` | **holds** — manual entry starts empty, CTA disabled (`08`) |
| `GAP2-24` | **holds** — `Pay $4,250.00` pinned at rest (`38`) |
| `B-15` / `GAP3-18` / `C2-06` across a real account change | **hold** — sign-out lands on Welcome with **no error banner** (`43`, the `W1-C-09` half), and `james.okafor@example.com` opens on "Awaiting you 0 / Nothing needs a decision." (`51`) and "No rooms yet" (`52`) |
| `W1-C-10` (`--resetonboarding`) | **works for the carousel** (`23`, `60`) and for the tour **when the account's Supabase `profiles.help_state` is not in the way** — see the note under `W1-B-16` |

## 2. New defects found in this re-walk

| id | severity | where | what happens | fix | lane · related |
|---|---|---|---|---|---|
| **W1-B-16** | major | `Features/Profile/ViewModels/StudioHubViewModel.swift` (staleness source) + the cold-launch floor added by `4790ab8eb` | The R-02 floor now carries the Studio count across a cold launch, but not the timestamp that makes it honest. Offline cold launch: the hub prints **"5 things need your eye"** as current above "We couldn’t gather your Studio…" with **no `Last updated …` line anywhere in the tree** (`33`; `describe-all` returns the summary and the error card and no staleness text). This is `L07-05`'s exact failure shape, re-opened on the path the R-02 fix created — re-walk 1 passed it only because the cold shape then had no count to be stale. The warm shape still prints the line (`35`), so the gap is the cold branch alone. | Persist `lastLoadedAt` beside the retained counts in the floor and let `StudioHub.StalenessLine` render from it on a cold-launch failure exactly as it does on a warm one; add a test that a floor-restored count never renders without a staleness line. | L1-B · `L07-05`, `R-02`, `R-01` |
| **W1-B-17** | major | the auth seam changed by `4790ab8eb` (`Services/Auth/AuthService.swift` `settledUserId` seeding) + `SessionScope.reset()` | After signing out, the **guest** Your Spaces still lists the previous account's room — "Guest Bedroom, 180 sq ft · Typed, not scanned, $9,000 Budget" and "Whole Home, 1 room · 0 items · $0 total" — on a device where the same guest session's Studio says **"Guest / Rooms: 0"** and Today says "Start with a room". Reproduced twice, once per sign-out (`44`/`45`/`46`, then `56`→`57`/`58`/`59`). Signing in as a **different** account does clear it (`52`, "No rooms yet"), so the reset fires on an account change and not on a sign-out to guest — which is what seeding `settledUserId` from `local_store_owner_user_id` changes about the `A → nil` transition. This is the scope's own "sign out → guest shows nothing of the previous account" leg, and on a shared phone it is a privacy leak. | Treat `A → nil` as a scope change too: reset the local store on sign-out, or scope `YourSpacesView`'s room query to the signed-in owner and show the guest empty state when there is none. Pin it with a test that asserts the guest room list is empty after a sign-out from a seeded account. | L1-F (auth seam) / L1-B (rooms) · `B-15`, `GAP3-18`, `C2-06`, `R-02` |
| **W1-B-18** | major | `Features/Help/FirstLaunchTour.swift` (the popover's 320 pt cap) | At accessibility-extra-large the tour bubble clips its own content **and offers no way through it**: the "Step 1 of 2" counter is not drawn, the title's ascenders are cut by the bubble's top edge, the last body line "your space." overflows below the rounded rect onto the dimmed content, and **`describe-all` returns three elements — Application, `Group 'dismiss popup'`, and the Heading — with no Skip and no Next** (`61`). At default size the same step draws both buttons (`27`). The only exit is a tap on the surrounding scrim, which abandons rather than completes the tour and which nothing on screen advertises. | Let the popover grow (or scroll) with the type ramp instead of capping at 320 pt, and keep the action row pinned inside the bubble at every size; add an AX-tree assertion that "Skip" and "Next" are present at `accessibility-extra-large`. | L1-C · `W1-B-09`, `B-10` |

Observation, not filed as mine: at AX-XL the intro carousel's third CTA ("I already have an account")
runs off the bottom of the screen (`60`) — an L1-A surface, adjacent to `P-34`.

## 3. What this re-walk could not reach

- **The signed-in tour replay while online.** `--resetonboarding` clears UserDefaults, but
  `SupabaseHelpStateAdapter` re-hydrates `profiles.help_state` and `FirstLaunchTour` returns early on
  `state.launched == true` (`FirstLaunchTour.swift:356`). The account's row read
  `{"tours": {"ios-first-launch-tour": {"launched": true}}}`, so the tour would not start online
  (`24`, `25`). It ran once the app was offline (the hydrate failed) and again as a guest — which is
  how `B-10`, `W1-B-09`, `W1-B-14`, `W1-B-15` and `W1-B-18` were reached. Worth a follow-up on
  `W1-C-10`: the flag still cannot replay the tour for a signed-in account that has one on the server.
- Everything the earlier rounds recorded as **not walkable** (`C7-01`, `A3-18`, `C7-13`, `C7-15`,
  `C7-05`, `GAP4-25`) or **not walked** (`GAP4-16`, `P-34`, `A1-14`) is unchanged — the fix round did
  not touch any of it.

## 4. Fixture state this re-walk changed

- **`public.profiles.help_state` for `a0000000-…-0005` went from
  `{"tours": {"ios-first-launch-tour": {"launched": true}}}` to `{}`** — the tour was completed while
  the app was offline (so the completion never reached Supabase), then `--resetonboarding` cleared the
  local state and the adapter pushed the cleared blob on the next sign-in. **The first-launch tour will
  therefore replay for `client@patina.dev` on the next launch.** Nothing else moved: `public.rooms` is
  still 1 row, no room was saved (the manual-entry form was filled and abandoned), the proposal was
  opened and cancelled, no decision was answered, and the notification feed was not touched.
- The device is left signed in as `client@patina.dev`, content size `large`, appearance System, kong
  **Up** (`gateway=200`).
