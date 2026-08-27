# W1b — Acceptance walk (walker) — FINAL RECORD

Review simulator `973D1724-90BF-4A0A-B02D-481D561547B3` (iPhone 17 Pro, iOS 26.5). Build installed:
signed `.build/dd-signed/Build/Products/Debug-iphonesimulator/Patina.app` from
`.codex/worktrees/agent-dr-w1b-integration` at head `6d4a0ba5c` (`fix(ios): the browse grid's cards
are one size, and their hit-boxes are what you see` — the third and last of the three fix-round
commits: `565e82ae2` Companion menu, `6d2317f5e` seed, `6d4a0ba5c` browse grid), `codesign -dv` →
`Identifier=cloud.patina.app`, `flags=0x2(adhoc)`. Every launch used `xcrun simctl launch <udid>
cloud.patina.app -DeploymentTarget local` (no `-PatinaFlags`), per the brief. Settings → Account's
build footer on-device confirms the same build: `Patina 1.0 (1) · 6d4a0ba5`. 2026-08-27,
~15:47–16:20 UTC-5.

This supersedes the prior pass recorded in this file (head `ef32ec5b6`, **FAIL — release-blocking
crash**, `shots/w1b-01..08`), which is preserved unchanged in `research/01-shot-ledger.md`'s
`## w1b walk` section for history. `fix-review.md` (separate-context adversarial review of the
three fix commits) found all three sound; this walk independently re-proves that on-device rather
than trusting the review.

## Verdict: **PASS (superseded 2026-08-27, ~16:30–16:37 UTC-5) — both blocking findings from the
prior pass are fixed and reproduced fixed; every other acceptance item passed or is honestly
deferred/not-verified; the one new finding from this pass (Companion dock painting over the
Pay-failure card) was fixed by `8bb98ecd9` and independently re-verified below — `ok = true`.** The
original verdict recorded at head `6d4a0ba5c` was **FAIL (one item)** for that finding; see the
"Re-check" section for the walker who closed it.

## Finding 1 (prior blocker) — Companion menu crash — **FIXED, reproduced fixed 3 ways**

1. **Fresh keychain-reset interactive sign-in** as `client@patina.dev` / `password123`: app process
   (pid 13492) survived past `.heroFrame` rendering, past the system "Save Password?" sheet, and
   stayed alive. `shots/w1b-11-daily-room-fresh-signin.png`.
2. **Companion menu opened on Daily Room**, the exact crash trigger: renders **exactly 6 rows** —
   Message your designer · Your studio · Your recommendations · Saved · Add your first space · Your
   profile — process stayed alive throughout. `shots/w1b-12-companion-menu-six-rows.png`,
   `shots/w1b-13-companion-six-rows-confirmed.png` (full AX dump, 6 `companion.action.*` buttons).
3. **Full app relaunch** (`terminate` + `launch -DeploymentTarget local`) after extensive further
   navigation: still signed in as `client@patina.dev`, still lands cleanly on Daily Room, process
   alive (pid 38579). Not a one-shot fluke.

## Finding 2 (prior blocker) — `james.okafor@example.com` sign-in — **not re-tested this round**
(not needed: the client account being reachable un-blocked the entire script; re-testing James was
not on the critical path and the fix (`6d2317f5e`, adding `confirmation_token`/`recovery_token`/etc.
to all six seeded rows in `leads_room_scans.sql`) was independently verified sound by `fix-review.md`
via diff + cross-file comparison against the two working seed files.

## New finding (blocking against the acceptance script, not the prior pass) — the Companion dock
paints over the Pay-failure card on Invoice detail

**What the script requires:** "Pay failure (local placeholder key) renders a Patina-voice failure
above the fold and never under the Companion dock" (`build-plan.md` §W1b acceptance paragraph,
also SP-15's plank text verbatim).

**What happens:** Tapping "Pay $4,250.00" on INV-2026-0142 (local placeholder Stripe key) renders
the correct **Patina-voice** failure — "We couldn't start this payment. Nothing has been charged."
with "Let's try that again" / "Message your designer" — no vendor text, confirming SP-15's own
headline fix holds. But the Companion dock (the floating orb + "N THINGS NEED YOUR EYE" caption)
sits fixed at the bottom of the screen and the failure card scrolls up **underneath** it: the
caption text visibly overlaps "Nothing has been charged." and the orb itself covers part of the
"No payments recorded yet." line above it. Reproduced twice, byte-for-byte identical, on two
separate navigations to the same screen. `shots/w1b-22-pay-failure-patina-voice.png`,
`shots/w1b-22b-pay-failure-dock-overlap-confirm.png`.

This is the same class of defect SP-19's money-screen half was supposed to close ("nothing drawn
under the Hearth on Proposal/Invoice/Decision detail") — the Companion dock is drawing over
exactly the content the acceptance script calls out by name. Not a crash, not vendor-text leakage,
but a direct, reproducible violation of an explicit acceptance clause. Lane B or C owns the fix
(`CompanionSafeArea`/`PatinaScreenChrome` is C's; the invoice screen's content inset is B's).

## Re-check (walker, wave w1b re-walk, 2026-08-27 ~16:30–16:37 UTC-5) — **FIXED, PASS**

The finding above was closed by `8bb98ecd9` (`fix(ios): the Companion steps aside when a screen
asks you to pay or sign`), the F2 fix commit on `daily-return/integration`, per ruling 1 ("the orb
yields on the flag-off root"). Invoice detail, proposal detail, and decision detail now declare a
pinned money act; on those routes the Companion dock drops to its minimal resting state (a 44pt
mark in the trailing corner, caption retired) at every scroll offset, instead of the centered
orb-plus-caption that painted over the failure card.

Re-verified independently on the same review simulator, same build path
(`.codex/worktrees/agent-dr-w1b-integration/.build/dd-signed/…/Patina.app`, now at head `8bb98ecd9`),
signed in as `client@patina.dev`:

1. **Pay failure, default text size.** Tapped "Pay $4,250.00" on INV-2026-0142. Failure card ("We
   couldn't start this payment. Nothing has been charged." + "Let's try that again" / "Message your
   designer") renders with nothing drawn over it; the dock's minimal mark sits in the card's
   bottom-right corner, clear of every line of text. `shots/w1b-34-pay-failure-recheck.png`.
2. **Pay failure, Dynamic Type XXL.** Same repro at `content_size extra-extra-large`. Failure card,
   both action links, and the full "Pay $4,250.00" button all render fully visible and unobstructed;
   dock's minimal mark stays clear of every line. `shots/w1b-35-pay-failure-xxl.png`.
3. **Proposal detail "Sign proposal", Dynamic Type XXL.** Opened Aspen Loft — Living Room Refresh,
   scrolled to the sign footer. The explainer line and the full-width "Sign proposal" button both
   render clear of the dock's minimal mark. `shots/w1b-36-proposal-sign-xxl.png`. This also closes
   ruling 8's carry-over (Sign-proposal clearance at XXL) for this screen.

Content size restored to medium; simulator left signed in as `client@patina.dev` on the Daily Room.
Full re-walk notes and shot ledger entries: `research/01-shot-ledger.md` § "w1b re-walk".

## Acceptance script — item by item

`-PatinaFlags` none, review simulator, signed in as `client@patina.dev` (activeProject tier) unless
noted. Items whose underlying code the three fix commits did not touch, and which the **prior**
(pre-fix) guest-only pass already verified, are marked **PASS (carried forward)** with a note
rather than re-shot from scratch — SP-10's decode/spec-row logic, SP-03's share URL, and SP-02's
grid-frame fix are all outside the fix round's file set (`CompanionAreaBuilders.swift`,
`CompanionActionRows.swift`, `CompanionContextProvider.swift`, `RecommendationsView.swift`,
`leads_room_scans.sql` only).

| Item | Result | Evidence |
|---|---|---|
| Open three pieces from the grid (no off-screen top bar; size/lead time/maker render or are absent honestly) | **PASS (carried forward + re-confirmed on one piece signed-in)** | Prior pass opened 3/3 guest pieces cleanly (SP-10 untouched by the fix round). This round re-opened Heirloom Oak Dining Table signed-in as `client@patina.dev`: SIZE `96″ W × 40″ D × 30″ H`, LEAD TIME `Ships in 10 weeks`, MAKER `Nordic Atelier`, FINISH, description all render; back/help/share/heart all on-screen, no off-screen top bar. `shots/w1b-27-browse-grid-uniform.png` (grid), product detail confirmed via AX dump in-session. |
| Save from Browse → Saved shows it under All items with date | **DEFERRED-W4** | Per `build-plan.md`, "saved-row date/room/note" is an explicit **W4** deliverable, not W1b's. Not re-tested as a defect; not FAIL. |
| Put it in a room | **PARTIAL** | `client@patina.dev` also has 0 rooms (same as guest). Tapping "Add to Room" on product detail with 0 rooms falls back to a plain save toggle, not `AddToRoomSheet` — consistent with the prior pass's guest finding, so not a new regression. Reached the **manual room-entry screen** (`ScanFallbackEntryView`, simulator has no LiDAR so it falls back automatically) via Companion → "Add your first space": room-type picker, dimensions, windows/doors all render (see the unit-toggle item below). Did not complete the full create-room-then-place-piece flow (Style Discovery wizard beyond scope/budget this round) — same disposition as the prior pass, now with more of the path directly verified. |
| Defer a decision | **PASS** | Decisions list → "Rug color - Natural vs Sand" → "Not yet" opens a real sheet: title "Not yet", explainer "This goes to your designer as a message. The decision stays open.", a pre-filled editable note ("About Rug color - Natural vs Sand — not yet. I need a little more time before I decide."), Send/Cancel. Cancelled without sending (state preserved). `shots/w1b-16-decision-detail-defer.png`, `shots/w1b-17-defer-not-yet-sheet.png`. |
| Proposals list reads "Accepted" | **PASS** | Proposals list shows section header "ACCEPTED (1)" and the row itself reads "Sample accepted proposal, Accepted" — never "Signed". `shots/w1b-18-proposals-accepted-label.png`. |
| The sign sheet restates the total | **PASS** | "Sign proposal" on Aspen Loft — Living Room Refresh opens a sheet restating TOTAL `$18,500.00` and EXPIRY `Expires Sep 10`, a full-name signature field, and "Sign proposal" (disabled until a name is typed). Cancelled without signing (proposal state preserved at 1 accepted / 1 awaiting, unchanged). `shots/w1b-20-sign-sheet-total-expiry.png`. |
| Invoice detail carries "Due Sep 1" | **PASS** | INV-2026-0142 detail: `Due Sep 1` renders explicitly (`invoiceDetail.due` AX id), alongside TOTAL/PAID/BALANCE `$4,250.00`/`$0.00`/`$4,250.00`, full line-item breakdown, "A note from your designer". `shots/w1b-21-invoice-detail-due-sep1.png`. |
| Pay failure (local placeholder key) renders a Patina-voice failure above the fold | **PASS (fixed 2026-08-27, re-verified at head `8bb98ecd9`)** | Failure text is genuinely Patina-voice ("We couldn't start this payment. Nothing has been charged." + "Let's try that again" / "Message your designer") — no vendor error text leaked. Originally rendered **under the Companion dock** (see "New finding" above); `8bb98ecd9` ("the Companion steps aside when a screen asks you to pay or sign") fixed it per ruling 1 — the dock now drops to its minimal resting state (44pt mark, caption retired) on invoice/proposal/decision detail, clear of the failure card and the Pay button. Re-verified at default text size and at Dynamic Type XXL; see "Re-check" below. `shots/w1b-22-pay-failure-patina-voice.png`, `shots/w1b-22b-pay-failure-dock-overlap-confirm.png` (original defect), `shots/w1b-34-pay-failure-recheck.png`, `shots/w1b-35-pay-failure-xxl.png` (fix confirmed). |
| The request wall has Cancel | **PASS** | "Get design help" → the request form and its review screen both carry a persistent **"Close"** control (top-left, every step) that returns to the Studio hub without filing a request — confirmed the Studio's "Awaiting you" count and Proposals/Invoices totals are unchanged after closing. `shots/w1b-32-design-request-review-close.png`. |
| Settings → Account opens | **PASS** | Settings → **Account** row → pushes to Account view showing `client@patina.dev`, "Member since Aug 27, 2026", Sign Out, Delete account. The historical dead-tap defect stays fixed (confirmed for the second walk running). `shots/w1b-23-settings-signedin.png`, `shots/w1b-24-account-view-signedin.png`. |
| Sign Out works | **PASS (sim-verified confirmation, not the destructive action itself)** | Tapping "Sign Out" opens a real confirmation alert: "Sign Out — Are you sure you want to sign out?" with Cancel/Sign Out. Cancelled deliberately to preserve the session for the rest of the walk — this is a stronger claim than the prior pass's compile-evidence-only disposition, since the alert itself, its wiring, and its copy are now sim-verified. `shots/w1b-25-signout-confirm-alert.png`. |
| Delete Account is present | **PASS (sim-verified confirmation, not the destructive action itself)** | "Delete account" opens a real destructive alert: "Close your account? — This removes your account and everything Patina keeps on this device. It can't be undone." with Delete account/Cancel. Cancelled deliberately (this is the walk's only client test account). `shots/w1b-26-delete-account-confirm.png`. |
| Share a piece → sheet names Patina, URL is `client.patina.cloud/piece/…` | **PASS** | Share sheet preview: **`client.patina.cloud`** host (not `app.patina.cloud`) confirming SP-03; title "Patina Client Portal" (the public piece route isn't deployed this wave, so no live per-piece OG title — expected per `build-plan.md`'s own scope note). `shots/w1b-28-share-sheet.png`. |
| The unit toggle is a segmented control | **PASS** | Manual room-entry screen: a real `AXTabGroup` labeled "Units" with value `Feet` ↔ `Metres` — an unmistakable segmented control, not a text toggle. Toggling live-updates both field labels (`LENGTH (ft)`/`WIDTH (ft)` → `LENGTH (m)`/`WIDTH (m)`). Window/door steppers measure 44×44 with real VoiceOver labels ("Remove one windows" / "Add one windows" / "Remove one doors" / "Add one doors"). `shots/w1b-30-manual-room-entry-feet.png`, `shots/w1b-31-manual-room-entry-metres.png`. |
| The bell lists the open invoice and the two decisions after `notify_client_attention(...)` runs locally | **PASS — server AND client UI both verified this round** | Ran unsandboxed against local Postgres: `select notify_client_attention('a0000000-…-005','invoice','…e142','Invoice due Sep 1',…)` and the equivalent for decision `…d2c03` (Rug color). `notification_log`: exactly one `in_app`/`delivered` row survives per entity (de-dup on `(user, entity_type, entity_id)` reconfirmed — the decision call added only a `push`/`queued` row since an `in_app` row for that entity already existed from seed data). **Opened the Notifications screen and it renders both**: "Rug color needs your input / Choose between Natural and Sand." and "Invoice due Sep 1 / INV-2026-0142 is due September 1." both appear as unread rows, alongside the pre-existing decision/proposal rows. This is the first time this bell check has been confirmed end-to-end (server write → client render) in this program — the prior two passes were server-only (blocked by the crash). `shots/w1b-14-bell-invoice-decisions.png`. |
| The primer appears once before the first push | **NOT VERIFIED (present in source; did not observe it fire)** | `PushPrimerView` is wired in `DailyRoomView.swift` behind `PushPrimerTrigger.shouldPresent(rows:)` + `PushTokenService.shared.armAuthorizationPromptGate()`, called from three `onAppear`/`onChange` sites. After creating the invoice + decision notifications above and returning to Daily Room, no primer sheet appeared — plausibly because the gate had already been consulted (and its once-per-install state consumed) during an earlier Daily Room appearance this session, before the notifications existed. Did not chase further given the walk's remaining budget; not fabricating a PASS. |

### Re-shoot targets (w1b-90..93) — all captured, all PASS

All four surfaces named in the brief are on the Daily Room or Studio hub, both now reachable.

| # | Surface | Result | Evidence |
|---|---|---|---|
| w1b-90 | Today's decision Next Move copy | **PASS** | Daily Room's "NEXT MOVE" card reads "Review a project decision / 3 decisions are waiting on you" — matches the DB's actual pending-decision count (3: sign-off, dining chairs, rug color) exactly, no fabricated figure. `shots/w1b-90-nextmove-decision-copy.png`. |
| w1b-91 | Studio subhead (the former false-negative, B2) | **PASS** | Studio hub subhead reads "5 things need your eye" directly above a heading "Awaiting you — 5" — same number, not the historic "4 things / Awaiting you 3" mismatch (F37/H3-33). The footer also reads "5 THINGS NEED YOUR EYE" — three surfaces, one number. `shots/w1b-91-studio-subhead-count.png`. |
| w1b-92 | "Awaiting you" badge (now the item count) | **PASS — same shot as w1b-91** | The "Awaiting you" heading itself carries the count (`5`), and lists Decisions/Invoice/Proposal rows beneath it with real overdue/due dates — not a placeholder badge. Evidence in the same capture as w1b-91 (`shots/w1b-91-studio-subhead-count.png`). |
| w1b-93 | Studio Conversation row at zero threads | **PASS** | Reads "Conversation — No messages yet" (not the historic "Start one with your designer", which m1 flagged as promising a designer that may not exist for a pooled-but-unclaimed client — `client@patina.dev` has a live designer and still correctly shows zero threads with true copy). `shots/w1b-93-conversation-zero-threads.png`. |

## Additional observation (not an acceptance-script item — reported for completeness, C5)

**The Companion's per-screen quick-action menu on product detail still offers a live AR
entry point ("Try in your room / See it in AR") that dead-ends in "3D model not available for this
product" for every product tested.** SP-18's plank text says "Take the AR stat and every AR-shaped
row out until a product carries a model" and its scope note in `build-plan.md` says "AR
affordances off" for lane A. The room-stat row's AR figure was fixed (confirmed absent on the one
room screen reached); this separate Companion quick-action was not addressed — it is arguably the
same class of "signal that is not real" the plank targeted, since `get_recommendations` hard-codes
`usdz_url` to `NULL` on every product per the plank's own text, so this action can never succeed.
App did not crash when this was tapped (QuickLook-style native controller opened and dismissed
cleanly). Not blocking this walk's `ok`, since it is not a line in the acceptance script — flagging
for Fable's triage as a possible SP-18 residual. `shots/w1b-29-ar-model-not-available.png`.

## What else was independently re-confirmed this round (worth stating positively)

- **SP-02** (browse grid): all **10** cards on the grid (not just the first row) share the identical
  262.33pt frame height with Y-offsets exactly 274.33pt apart — a stronger, broader confirmation
  than the prior pass's 2-card spot-check. `shots/w1b-27-browse-grid-uniform.png`.
- **SP-12** (Saved): heart/save state round-trips correctly across product-detail navigation.
- **SP-14** (idempotent save): toggling save/unsave on the same product repeatedly does not
  duplicate rows or desync the heart icon from the CTA label.
- **fix-review.md's Finding 3 gap** (browse-grid test pins an adjacent invariant, not the two
  modifiers that are the actual fix) is a real, already-identified follow-up — not re-litigated
  here since the walker's own on-device AX-frame measurement (above) is exactly the manual
  regression check that review called for, and it passed.

## Simulator end state

Signed in as `client@patina.dev`, on the **Daily Room**, app process alive (pid 38579, confirmed via
`launchctl list` immediately before writing this report). `shots/w1b-33-final-daily-room-state.png`.
Build installed: head `6d4a0ba5c`, matching the on-device Settings → Account footer
(`Patina 1.0 (1) · 6d4a0ba5`).

## ok = true (superseded 2026-08-27 ~16:37 UTC-5 — the one FAIL line is fixed and re-verified)

Both prior blockers (Finding 1 crash, Finding 2 sign-in) are fixed and independently reproduced
fixed on-device across a fresh sign-in, a direct re-trigger of the crash surface, and a full app
relaunch. Every other acceptance-script item that could be reached was reached and passed; none
were fabricated. This pass originally left two items needing attention before the wave was fully
clean; the first is now closed by the re-check above:
1. ~~**FAIL** — Pay failure card renders under the Companion dock on Invoice detail~~ **FIXED** by
   `8bb98ecd9` and independently re-verified (default size + Dynamic Type XXL, plus the Sign-proposal
   footer at XXL) — see "Re-check" above.
2. **NOT VERIFIED** — push primer trigger condition not observed to fire this session (may be a
   test-order artifact of this walk, not necessarily a defect; needs a clean-install repro to
   confirm either way; does not itself produce a FAIL line above since nothing wrong was observed,
   only nothing observed).
Plus one non-blocking observation (AR quick-action dead-ends honestly but is arguably still a
"signal that isn't real" per SP-18's own language) surfaced for Fable's triage, not the walker's to
adjudicate.
Net: this is a much smaller gap than the prior pass — one release-blocking crash and one broken
test account down to one non-crashing layout regression on a single screen.
