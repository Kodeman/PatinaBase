# W3 — walk (final record, after the re-walk)

This file is the final W3 acceptance record. It supersedes the original walk below by
incorporating the re-walk that closed both of `fix-review.md`'s MAJOR findings. The original
walk's table (items 1–8, run against `d0879b10a`) is kept verbatim as "First pass" for the
record; "Re-walk" is the current, binding verdict.

**Verdict: PASS.** Every merge-rule item (`rulings-fable.md`, end) holds on glass, including the
two items the first pass could not check (`V-1`/`V-2`, fixed in `c25c758bf` / `28597eaa7`, both
re-proved independently below — not just re-read from `fix2-log.md`). The one open item — the
fresh-install tour's Sanity copy — is **not** a FAIL: `rulings-fable.md` ruling 5 disposes it as
**OWED (Kody)**, a content-ops step outside this program's code, and it is carried that way here
too. `ok = true`.

## Re-walk — 2026-08-28

Same review device, **`973D1724-90BF-4A0A-B02D-481D561547B3`** (iPhone 17 Pro / iOS 26.5,
402×874 pt). Installed
`/Users/kody/Library/Developer/Xcode/DerivedData/Patina-fqrqjvpfaowactdbiglvkpeuvzpz/Build/Products/Debug-iphonesimulator/Patina.app`
(`xcrun simctl install`, unsandboxed); `codesign -dv` confirms `Identifier=cloud.patina.app`,
`Signature=adhoc` — not `CODE_SIGNING_ALLOWED=NO`. This binary is `fix2-log.md`'s build, integration
tip `28597eaa7` (`a3fd05af9` + `c25c758bf` + `28597eaa7`), the last two commits closing `fix-review.md`'s
V-1 and V-2. Read `waves/w3/walk.md` (the prior pass, this file's own history),
`waves/w3/rulings-fable.md` (the merge rule is this re-walk's script), and `waves/w3/fix-review.md`
before this pass. Local Supabase was down at the start of this walk (`docker`/`supabase:start` had
to be brought up before sign-in worked — noted since the trap cost real time and isn't specific to
this app). Shots: `shots/w3-25.png` through `shots/w3-41.png`; ledger:
`research/01-shot-ledger.md` §"w3 re-walk".

### Accounts used

| Account | Tier | Password | Source |
|---|---|---|---|
| `client@patina.dev` | engaged / active project (Leah Hartwell, Birch Hollow) | `password123` | `supabase/seed/dev-accounts.sql:19` |
| Guest (`Look around first`) | discovering, no persisted session | — | — |

### Merge-rule results (flag on)

| # | Item | Tier | Result | Evidence |
|---|---|---|---|---|
| 1 | Onboarding does not let the tour fire over the Pieces tab | client, guest | **PASS** | `w3-25` — both a fresh client sign-in and a fresh guest run the 5-question style quiz and land on `Browse pieces` (`Pieces` tab selected); `describe_screen`'s AX tree has no tour element, confirming the tour did not auto-start there |
| 2 | Today header carries no Studio pill (signed-in) | client | **PASS** | `w3-26` — header AX tree is `Today` group + `Notifications` (bell) + `Help` only; no `Studio` element anywhere in the header |
| 3 | Studio tab title reads "Your Studio" | client | **PASS** | `w3-27` — tab-root heading `AXLabel: "Your Studio"` |
| 4 | Studio tab → Settings → Sign Out and Delete Account present | client | **PASS (not performed)** | `w3-28` — `SettingsView.SignOutButton` ("Sign Out") and `SettingsView.DeleteAccountButton` ("Delete account") both present and enabled, three taps from the bar (Studio → Settings). Neither tapped, per brief |
| 5 | **V-2 close-out** — Studio tab's Companion menu does not offer the screen it's already on | client, signed in | **PASS** | `w3-29` — Companion panel on the Studio tab: exactly 5 rows (Decisions waiting · Messages · Proposals · Billed to date · Home), **no "Your profile" row**. This is the exact frame `fix2-log.md` named as "still owed to Kody's signed-in walk" — confirmed live, not from source |
| 6 | Invoice detail's Pay footer clears the bar | client, default + XXL | **PASS** | `w3-30` (default, gap ≈69pt above the bar) / `w3-31` (XXL, `invoiceDetail.pay` frame ends y=722, bar starts y=791 — 69pt clear) |
| 7 | Proposal detail's Sign footer clears the bar | client, default + XXL | **PASS** | `w3-32` (default) / `w3-33` (XXL — `proposalDetail.sign` frame ends y=783, bar starts y=791, 8pt clear) |
| 8 | Piece detail's Add to Room capsule clears the bar | client, default + XXL | **PASS** | `w3-34` (default) / `w3-35` (XXL — capsule ends y=783, bar starts y=791). The PGRST201 "every piece detail is hard-broken" defect logged in `research/01-shot-ledger.md` did **not** reproduce this pass — the product loaded normally both times |
| 9 | Flag-on dark on Today | client | **PASS** | `w3-36` — captured via `xcrun simctl io screenshot` (not just the MCP tool) per the program's dark-mode trap; genuinely dark background, bar reads `Today Spaces Pieces Studio` legibly, no Studio pill |
| 10 | **V-1 close-out** — fresh-install guest tour: step popover on the bar's Studio tab item, no occlusion | guest, first launch | **PASS** | `w3-37` (step 1 of 2, on Today) → `w3-38` (step 2 of 2 — the popover card sits at y 642–773, fully **above** the bar row at y 791+; `Today Spaces Pieces Studio` all read clearly beneath the card, unlike `w3-fix-03`'s pre-fix occlusion) |
| 11 | Step numbering says "Step 1 of 2" when the guest's Record is empty | guest, first launch | **PASS — confirmed empty** | `w3-37` — the guest's Today shows no `NEEDS YOU` record block (`Start with a room` renders instead), and the tour reads `Step 1 of 2, …` — i.e. the 2-of-2 count is because `.todayRecord` never mounts for this empty record, exactly as `n3-fix-log.md` describes, not a separate defect |

### Flag-off results

| # | Item | Tier | Result | Evidence |
|---|---|---|---|---|
| 12 | Today identical in structure to `w3-13-flagoff-today-client-final.png` | client | **PASS, structurally** | `w3-39` — same `NEEDS YOU` / `MOVED` / `See all` card, the Leah Hartwell designer seat with `Message`, `YOUR HOUSE` rail (Dining Room / Living Room), floating Companion orb, no tab bar. Row *contents* differ (later timestamp, "Early morning" vs "Good night" greeting) because the underlying data and capture time moved on — expected, not a structural break. No tab bar, no `.studio`/`.profile` route dispatch visible anywhere on this root |
| 13 | The header pill (the former "monogram") still opens Profile | client | **PASS** | `w3-40` — tapping `DailyRoomView.StudioButton` ("Your Studio", header) on the flag-off root pushes `ProfileView` (`ProfileView.HelpButton`, `Client User`, `STUDIO`/`YOUR PROFILE` sections, `Settings` row) — the same destination it opened before W3, unchanged by the tab-bar refactor |

### Sanity copy — OWED (Kody), not FAIL

`w3-37` still shows the retired pre-B-8 sentence ("This is your Daily Room — picks and stories
chosen for your space.") because the three Sanity documents in `n3-sanity-copy.md` remain
unpublished — `rulings-fable.md` ruling 5 disposes this as content ops, not a code defect, to be
done before `house-first` is enabled for anyone. Reproduced again this pass for completeness; not
counted against the merge rule, per the ruling.

## First pass — 2026-08-28 (superseded verdict, kept for the record)

Walker, 2026-08-28. Review device **`973D1724-90BF-4A0A-B02D-481D561547B3`** (iPhone 17 Pro / iOS
26.5, 402×874 pt). Installed
`/Users/kody/Library/Developer/Xcode/DerivedData/Patina-fqrqjvpfaowactdbiglvkpeuvzpz/Build/Products/Debug-iphonesimulator/Patina.app`
(`xcrun simctl install`, unsandboxed) — `codesign -dv` confirms `Identifier=cloud.patina.app`,
`Signature=adhoc`, **not** `CODE_SIGNING_ALLOWED=NO`. This build corresponds to the integration
branch's last code-changing commit `d0879b10a` (tip `ccf1031f7` is docs-only on top of it). Read
`waves/w3/integration.md`, `waves/w3/steward.md`, `source/rulings-2026-08-27.md`,
`source/direction-b.md` §8/§2/§11, `source/build-plan-critique.md` B7/B8/M18, and `waves/w2/{integration,walk}.md`
before this walk. Shots: `shots/w3-*.png`; ledger: `research/01-shot-ledger.md` §"w3 walk".

**Original verdict: NOT a clean PASS.** One acceptance item failed on glass — the fresh-install
tour did not show the rewritten (B-8) copy. Everything else checked passed, including two items
independently re-verified beyond what `integration.md` already claimed (dark+XXL bar legibility,
the Spaces-root no-chevron fix). `ok = false` was returned for this reason; the failure was a
**known, already-surfaced item** (`integration.md` §7 item 1), not a new regression, and did not
touch W2's unflagged Record. This item is carried forward as OWED (Kody) above, per
`rulings-fable.md` ruling 5 — it never gated the merge rule and does not gate this re-walk either.

### Accounts used

| Account | Tier | Password | Source |
|---|---|---|---|
| `client@patina.dev` | engaged / active project (Leah Hartwell, Birch Hollow) | `password123` | `supabase/seed/dev-accounts.sql:19` |
| `james.okafor@example.com` | matched / lead (Leah Hartwell picked up the request) | `password123` | `supabase/seed/leads_room_scans.sql:54` |
| Guest (`Look around first`) | discovering, no persisted session | — | — |

### Results

| # | Item | Tier(s) checked | Result | Evidence |
|---|---|---|---|---|
| 1 | Studio reachable in one tap | client, james, guest | **PASS** | `w3-02`, `w3-10`, `w3-12` — one tap on the bar's `Studio` item lands on `Your Studio` for all three tiers, correct empty/populated states per tier |
| 2 | Every tab's VoiceOver label = canonical name (`scan_ui`/`describe_screen`) | client, james (bar), guest | **PASS** | `describe_screen` AX tree, all three sessions: `Today` · `Your Spaces` · `Browse pieces` · `Your Studio` · `Companion` — B-7(a) verbatim, matching M1 §6 |
| 3 | Companion mark in the bar expands to six rows | client, on Today | **PASS** | `w3-14` — exactly six: Message your designer · Your studio · Your recommendations · Saved · Add your first space · Your profile. (On a pushed screen with less context the panel drew 5, which is ≤6 and expected — the composition is content-driven, not fixed) |
| 4 | A fresh install shows the rewritten (B-8) tour | guest, first launch | **FAIL (now OWED-Kody, see above)** | `w3-11` — step 1's popover reads **"Welcome to Patina" / "This is your Daily Room — picks and stories chosen for your space."**, the retired pre-B-8 sentence, with **`Step 1 of 2`**. Root cause per `integration.md` §7.1: `FirstLaunchTourPopoverCard.resolvedBody` prefers the Sanity CMS body over the local fallback, and the three Sanity documents were never updated with B-8's rewrite — `waves/w3/n3-sanity-copy.md` has the corrected text, unapplied. Additional wrinkle logged: the `Step 1 of 2` denominator is consistent with `defaultSteps`' `.todayRecord` anchor (step 2) never mounting for a guest, whose Record draws nothing when empty (W2's synthesis graft) — confirmed by the re-walk above |
| 5 | Dark + XXL on Today | client | **PASS** (after a local capture-setup fix — see below) | `w3-05`, `w3-05b` — bar reads `Today Spaces Pieces Studio`, no truncation, genuinely dark background |
| 6 | Dark + XXL on Pieces | client | **PASS** | `w3-06`, `w3-06b` — same bar check, dark confirmed |
| 7 | Dark + XXL on Studio | client | **PASS** | `w3-07` — dark, legible at XXL |
| 8 | Flag off restores the W2 root byte-for-byte | client (final state) | **PASS, structurally** | `w3-08`, `w3-13` vs `w2-01`/`w2-02`: same card structure — NEEDS YOU / MOVED / See all, the designer seat with Message, YOUR HOUSE rail, dock hint at the bottom, no tab bar. Row *contents* differ from the W2 shots because the underlying data has moved on (later dates, a new message) — that is expected, not a structural break |

### A capture trap hit and cleared this walk

`xcrun simctl ui … appearance dark` sets the OS trait, but the app persists its **own**
`patina.appearance` override (`AppearanceSetting`, `@AppStorage` key `patina.appearance`,
`Services/Settings/AppearanceSetting.swift`) applied via `.preferredColorScheme` in `PatinaApp.swift`.
This install had it stuck on `Light` from an earlier lane's walk, so the first two dark-mode capture
attempts (both the MCP screenshot tool *and* a direct `xcrun simctl io screenshot`) were genuinely
light-rendered — not the N2-documented tool artifact, a real leftover setting. Cleared with
`xcrun simctl spawn <udid> defaults write cloud.patina.app patina.appearance -string dark` + relaunch;
confirmed dark on both capture paths before shooting items 5–7. Reset to `system` afterward. Worth
folding into the program's dark-mode walk checklist so the next lane doesn't lose time to it. The
re-walk found this setting already at `system` and did not need the workaround.

### Also observed, not gating (first pass — both items closed by the re-walk above)

- **Sign Out / Settings is not reachable from the flag-on root at all** — closed: item 4 of the
  re-walk's merge-rule table proves Studio tab → Settings → Sign Out/Delete Account, three taps
  from the bar, no flag-off relaunch needed.
- **Guest session does not survive a relaunch** — reproduced twice (matches `integration.md` §7.6
  and N2's prior finding); still open, filed to W4 lane H2 per `rulings-fable.md` item 9. Not this
  wave's item.
- The Companion panel's row list did not visibly scroll under accessibility-XXL in one context (an
  early coaching-card state on Today), clipping the last one or two rows off the bottom of the
  sheet. Not re-chased this round; not part of the merge rule.

## Leave state

Simulator left **signed in as `client@patina.dev`, flag off, on the Daily Room** — `w3-41` is that
exact frame (this re-walk's leave state; supersedes `w3-13` as the current reference). Appearance
reset to `system`/light, text size reset to the default (`medium`).
