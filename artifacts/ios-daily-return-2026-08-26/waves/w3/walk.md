# W3 — walk (acceptance)

Walker, 2026-08-28. Review device **`973D1724-90BF-4A0A-B02D-481D561547B3`** (iPhone 17 Pro / iOS
26.5, 402×874 pt). Installed
`/Users/kody/Library/Developer/Xcode/DerivedData/Patina-fqrqjvpfaowactdbiglvkpeuvzpz/Build/Products/Debug-iphonesimulator/Patina.app`
(`xcrun simctl install`, unsandboxed) — `codesign -dv` confirms `Identifier=cloud.patina.app`,
`Signature=adhoc`, **not** `CODE_SIGNING_ALLOWED=NO`. This build corresponds to the integration
branch's last code-changing commit `d0879b10a` (tip `ccf1031f7` is docs-only on top of it). Read
`waves/w3/integration.md`, `waves/w3/steward.md`, `source/rulings-2026-08-27.md`,
`source/direction-b.md` §8/§2/§11, `source/build-plan-critique.md` B7/B8/M18, and `waves/w2/{integration,walk}.md`
before this walk. Shots: `shots/w3-*.png`; ledger: `research/01-shot-ledger.md` §"w3 walk".

**Verdict: NOT a clean PASS. One acceptance item fails on glass — the fresh-install tour does not
show the rewritten (B-8) copy. Everything else checked PASSES**, including two items independently
re-verified beyond what `integration.md` already claimed (dark+XXL bar legibility, the Spaces-root
no-chevron fix). `ok = false` is returned for this reason; the failure is a **known, already-surfaced
item** (integration.md §7 item 1), not a new regression, and does not touch W2's unflagged Record.

## Accounts used

| Account | Tier | Password | Source |
|---|---|---|---|
| `client@patina.dev` | engaged / active project (Leah Hartwell, Birch Hollow) | `password123` | `supabase/seed/dev-accounts.sql:19` |
| `james.okafor@example.com` | matched / lead (Leah Hartwell picked up the request) | `password123` | `supabase/seed/leads_room_scans.sql:54` |
| Guest (`Look around first`) | discovering, no persisted session | — | — |

## Results

| # | Item | Tier(s) checked | Result | Evidence |
|---|---|---|---|---|
| 1 | Studio reachable in one tap | client, james, guest | **PASS** | `w3-02`, `w3-10`, `w3-12` — one tap on the bar's `Studio` item lands on `Your Studio` for all three tiers, correct empty/populated states per tier |
| 2 | Every tab's VoiceOver label = canonical name (`scan_ui`/`describe_screen`) | client, james (bar), guest | **PASS** | `describe_screen` AX tree, all three sessions: `Today` · `Your Spaces` · `Browse pieces` · `Your Studio` · `Companion` — B-7(a) verbatim, matching M1 §6 |
| 3 | Companion mark in the bar expands to six rows | client, on Today | **PASS** | `w3-14` — exactly six: Message your designer · Your studio · Your recommendations · Saved · Add your first space · Your profile. (On a pushed screen with less context the panel drew 5, which is ≤6 and expected — the composition is content-driven, not fixed) |
| 4 | A fresh install shows the rewritten (B-8) tour | guest, first launch | **FAIL** | `w3-11` — step 1's popover reads **"Welcome to Patina" / "This is your Daily Room — picks and stories chosen for your space."**, the retired pre-B-8 sentence, with **`Step 1 of 2`**. Root cause per `integration.md` §7.1: `FirstLaunchTourPopoverCard.resolvedBody` prefers the Sanity CMS body over the local fallback, and the three Sanity documents were never updated with B-8's rewrite — `waves/w3/n3-sanity-copy.md` has the corrected text, unapplied. Independently reproduced this walk, not just re-read from the report. Additional wrinkle not previously logged: the `Step 1 of 2` denominator is consistent with `defaultSteps`' `.todayRecord` anchor (step 2) never mounting for a guest, whose Record draws nothing when empty (W2's synthesis graft) — see the ledger for the reasoning, not independently confirmed against the runtime step-filtering code |
| 5 | Dark + XXL on Today | client | **PASS** (after a local capture-setup fix — see below) | `w3-05`, `w3-05b` — bar reads `Today Spaces Pieces Studio`, no truncation, genuinely dark background |
| 6 | Dark + XXL on Pieces | client | **PASS** | `w3-06`, `w3-06b` — same bar check, dark confirmed |
| 7 | Dark + XXL on Studio | client | **PASS** | `w3-07` — dark, legible at XXL |
| 8 | Flag off restores the W2 root byte-for-byte | client (final state) | **PASS, structurally** | `w3-08`, `w3-13` vs `w2-01`/`w2-02`: same card structure — NEEDS YOU / MOVED / See all, the designer seat with Message, YOUR HOUSE rail, dock hint at the bottom, no tab bar. Row *contents* differ from the W2 shots because the underlying data has moved on (later dates, a new message) — that is expected, not a structural break. Did not re-run a pixel diff against a `main` build (integration.md named the same gap: "what was not done"); relied on the same structural proof integration.md gives — `ContentView`'s `legacyMainContent` is untouched, verified again by inspection |

## A capture trap hit and cleared this walk

`xcrun simctl ui … appearance dark` sets the OS trait, but the app persists its **own**
`patina.appearance` override (`AppearanceSetting`, `@AppStorage` key `patina.appearance`,
`Services/Settings/AppearanceSetting.swift`) applied via `.preferredColorScheme` in `PatinaApp.swift`.
This install had it stuck on `Light` from an earlier lane's walk, so the first two dark-mode capture
attempts (both the MCP screenshot tool *and* a direct `xcrun simctl io screenshot`) were genuinely
light-rendered — not the N2-documented tool artifact, a real leftover setting. Cleared with
`xcrun simctl spawn <udid> defaults write cloud.patina.app patina.appearance -string dark` + relaunch;
confirmed dark on both capture paths before shooting items 5–7. Reset to `system` afterward. Worth
folding into the program's dark-mode walk checklist so the next lane doesn't lose time to it.

## Also observed, not gating

- **Sign Out / Settings is not reachable from the flag-on root at all.** The Studio *tab*
  (`StudioHubView` wrapper) has no Settings entry; the header's duplicate `Studio` pill
  (`DailyGreetingHeader.studioButton`, integration.md §6a's already-named deviation) also lands on the
  same tab-root wrapper, not on `ProfileView`. To sign out between accounts this walk had to relaunch
  **without** the flag to reach `ProfileView`'s `Settings` row. This is downstream of the same §6a/§7.2
  "two Studio doors" / "Studio reports Profile" items integration.md already raised for Fable — not a
  new item, but concretely: **on the flag-on root as currently merged, a signed-in user has no way to
  sign out, delete their account, or change appearance/notifications without the flag being turned
  off first.** Worth a line in whatever ruling closes §6a/§7.2.
- **Guest session does not survive a relaunch** — reproduced twice (matches `integration.md` §7.6 and
  N2's prior finding). Not re-investigated.
- The Companion panel's row list did not visibly scroll under accessibility-XXL in one context (an
  early coaching-card state on Today), clipping the last one or two rows off the bottom of the sheet.
  Seen in passing while establishing the six-row count; not chased further since the acceptance line
  only requires dark+XXL on Today/Pieces/Studio, not the Companion sheet.

## Leave state

Simulator left **signed in as `client@patina.dev`, flag off, on the Daily Room** — `w3-13` is that
exact frame. Appearance reset to `system`, text size reset to the default (`medium`).
