# 11 — Canon digest (G2)

Purpose: what Kody has already ruled, what July already fixed, what was proposed and never built.
Nothing below is a new finding. Sources: `docs/design/ios-ux-review/index.html` (June, R01–R26),
`docs/design/ios-alignment-program/index.html` (July alignment, R27–R33), `docs/design/ios-ux-review-2026-07/`
(`index.html` U01–U46, `glossary.md`, `DELIVERY.md`), `apps/mobile/Patina/CLAUDE.md`, `apps/mobile/CLAUDE.md`,
root `CLAUDE.md`, `.claude/skills/patina-brand-voice/SKILL.md`, `instruments.md` §0/§6.

---

## 1. Ruling ledger R01–R33

**R01–R26 (June master plan, `docs/design/ios-ux-review/index.html`).** Not policy rulings — 26
device-verified/code-verified findings, all with a fix. **All 26 were implemented the same day**,
2026-06-10, in four waves on main: Wave 0 `949d48da`, Wave 1 `4c12efc8` (P0s: R01–R07, R09, R11,
R20–R21), Wave 2 `15e69a71` (R10, R12–R19, R23, R25), Wave 3 `e8a77e92`+`1d854e69` (R08, R22, R24,
R26) — deck line 312. July UX review confirms "No regressions found on R01–R26" (deck line 15) and
its own Scope section reconfirms "All shipped… no regressions" (deck line 611). Status below =
**delivered**; constraint = whether a client-app redesign must preserve the pattern.

| R# | Ruled | Constrains redesign |
|---|---|---|
| R01 | Scan CTA must be a real tappable `Button`, ≥44pt | advisory — don't regress reachability |
| R02 | Never stack a text link flush against a full-width button | advisory |
| R03 | Settings sheet must sit in a `NavigationStack`; no dead chevrons | advisory |
| R04 | Every pushed screen gets back chevron + edge-swipe restored | **binding pattern** — `PatinaScreenChrome` now exists (see U18) |
| R05 | Style quiz needs an exit affordance | advisory (superseded in form — quiz now uses ✕, see U18 exemption) |
| R06 | Decision options need a minimum render contract (name+image+price) before Approve | advisory |
| R07 | `.accessibilityHidden` background content under any overlay | advisory |
| R08 | Adopt the semantic dark palette everywhere; force Light until done | **binding** — dark mode is load-bearing now, not aspirational |
| R09 | Companion intents route through `AppCoordinator.handleIntent` | advisory |
| R10 | Room item rows tappable → product detail | advisory |
| R11 | No orphaned overlay state leaking across screens | advisory |
| R12 | Never silently create a room on an empty scan finish | superseded — see U40 (this exact defect class recurred and was refixed 2026-07-28) |
| R13 | "Leave scan" option in pause menu | advisory |
| R14 | Surface scan upload/sync status on room cards | advisory |
| R15 | Branded `PatinaAsyncImage` failure state | **binding** — the shared component now exists app-wide |
| R16 | Human-readable phase/status formatter, never raw enums | advisory |
| R17 | Real room imagery in the style quiz | advisory |
| R18 | Chat anatomy for threads (bubbles, sender, time) | advisory |
| R19 | Thread list identity: name, preview, unread weight | advisory |
| R20 | Decision rows: project context + "Discuss this" | advisory |
| R21 | Companion AX identity + labelled switches | advisory |
| R22 | Dynamic Type via scaled tokens app-wide | **binding** |
| R23 | Project detail leads with substance, collapses empties | advisory |
| R24 | Token/spacing/radius adoption sweep + CI ratchet | **binding mechanism** — the ratchet (`docs/design/ios-alignment-program` scorecard) still tracks raw-usage counts today |
| R25 | Product share via `ShareLink` | advisory |
| R26 | Native patterns: search, swipe actions, context menus, Reduce Motion | advisory |

**R27–R33 (July alignment, `docs/design/ios-alignment-program/index.html`).** Real policy rulings,
ratified by Kody 2026-07-09, all "each as recommended" (deck line 403). Binding unless noted.

| R# | Ruled | Source anchor | Constrains redesign |
|---|---|---|---|
| R27 | Create shared `apps/mobile/PatinaDesignKit` Swift package (fonts included), both apps consume it; verbatim-port fallback if tooling resists | §04 "One Brand" | **binding** — the package exists (`apps/mobile/PatinaDesignKit/`), confirmed on disk |
| R28 | Split Field's verdigris: action-uses → clay, success-uses → success `#7A9B76` | §04, ruling card | **binding** |
| R29 | Ship a "Studio" home-hub rail, **not a tab bar**; tab bar re-asked post-Track-D once real usage exists | §05 "The Shell" | **binding** — this is C1 below |
| R30 | Stripe Checkout return: poll on Safari dismiss first (zero backend change); `patina://` deep-link fast-follow only if dismissal feels dead | §06 "The Rail" | **binding** |
| R31 | Delete `RoomSummary.mockAll` seeded rooms for new/guest users; replace with `PatinaEmptyState` scan CTA | §04/§02, ruling card | **binding** |
| R32 | Backlog ratified, in this order: reviews → scope-change requests → direct orders → GDPR export/erase. Out of scope until a separate go-ahead | §10 "Later" | **binding** — this is the entire content of digest §5 below |
| R33 | Retire Fraunces / Hanken Grotesk / IBM Plex Mono from the Field bundle once the token rebrand lands and is verified on-screen | §04, ruling card | **binding** (Field-scoped, out of this app's review) |

---

## 2. U01–U46 by theme — condensed from `DELIVERY.md`

Every U# is closed: **22 DELIVERED-VERIFIED**, **23 DELIVERED-CODE** (device-owed or a named
unwalked variant — code is present and read at tip `74f01410`), **1 N/A** (U25, evidence-only, "no
action now"). **None is fair game as a fresh finding unless it has regressed on this program's own
walk.** What *is* fair game is the explicit residual list at the end of this section — DELIVERY.md
names these itself as still open.

| Theme (July deck) | U# | Status | One line |
|---|---|---|---|
| **0 · Funnel breaks** | U38 | VERIFIED | Quiz CTA now routes to `.emergence`, not Home |
| | U39 | VERIFIED | Per-row tolerant decode; blank-grid error now renders with retry |
| | U40 | VERIFIED | Non-LiDAR fallback now persists the room via `RoomStore`, lands on the room, not the marketplace |
| **1 · Honest chrome** | U01 | VERIFIED | Real identity (`UserIdentity` enum); no hardcoded "Kody" anywhere |
| | U02 | VERIFIED | Real varying match scores off `get_recommendations`, not a hardcoded 80% |
| | U03 | VERIFIED | Real categories flow; empty-check runs on the filtered list |
| | U04 | CODE | Fake "Suggested Next" insight deleted outright |
| | U05 | CODE | All 7 named dead controls wired or removed |
| | U06 | CODE | Companion room rows honor `roomId` (not walked, code-verified) |
| | U07 | CODE | "Browse Picks for This Room" routes room-scoped, not a root reset |
| **2 · One name per concept** | U08 | CODE | Entry CTA is **"Get design help"** everywhere; 2 in-flow exceptions retained (see §3) |
| | U09 | VERIFIED | Saved surface unified; 1 dead-code string survivor, unreachable (see residuals) |
| | U10 | CODE | Both Settings and Account read "Sign in on the web" |
| | U11 | VERIFIED | All 4 engineering-vocabulary sites rewritten in plain language |
| **3 · Buttons look like buttons** | U12 | CODE | 5 of 6 named sites fixed; 1 residual (see below) |
| | U13 | CODE | Explicit "Open room →" button added |
| | U14 | VERIFIED | Visible ⋯ menu replaces swipe-only skip |
| | U15 | CODE — **device-owed** | Persistent Finish control; unwalkable, no LiDAR in Sim |
| | U16 | CODE | CrossRoom tap → detail; move/copy behind ⋯ |
| | U17 | CODE | Dead `.swipeActions` deleted |
| | U18 | VERIFIED | Shared `PatinaScreenChrome`; 3 screens deliberately exempt (see §6 C21) |
| **4 · Tell users why things are missing** | U19 | VERIFIED (both halves) | Locked-Studio narration at `.discovering` and `.engaged` |
| | U20 | VERIFIED (both halves) | Companion gating now reads `EngagementTier`, not auth/roomCount |
| | U21 | VERIFIED | Guest auth presents as a sheet over context; 1 unwalked variant (residual) |
| | U22 | CODE | All 8 Studio empty states now name trigger + conditional CTA |
| | U23 | VERIFIED | "All rooms →" chip added to home |
| **5 · Saved/Browse permanent home** | U24 | VERIFIED (both halves) | `MarketplaceLinksSection` persists at every tier above `.discovering` |
| | U25 | **N/A** | Tab-bar evidence recorded for the post-Track-D re-eval, not litigated — see §1 R29 |
| **6 · Every wait/failure speaks** | U26 | CODE — device-owed | Scan-review save error now an inline banner, retry-able |
| | U27 | CODE | Room rename autosaves (debounced + flush on disappear) |
| | U28 | CODE — device-owed | "Save without notes" preserves hero pick + reorder |
| | U29 | CODE | All 5 named silent-error sites now render `PatinaErrorState` |
| | U30 | CODE | One loading component, one retry label ("Let's try that again") everywhere |
| | U31 | CODE | All 5 named dead-end empty states now have a CTA |
| **7 · Fix the first five minutes** | U32 | VERIFIED | Tour rewritten; Sanity CMS copy patched to match; renumbers visibly, never vanishes |
| | U33 | CODE — flag-gated | Quiz-first onboarding no longer promises a camera it doesn't ask for |
| | U34 | VERIFIED | Companion mark has standing "NEXT STEPS" text label, decays at `.learned`; escalation timer deleted |
| | U35 | CODE — device-owed | Manual-start cue visible from t=0 |
| | U36 | CODE — device-owed | 3-level button hierarchy on post-scan confirmation |
| | U37 | VERIFIED | Reveal screen's duplicate secondary CTA deleted |
| **Live-walk additions** | U41 | CODE | Companion touch-through/z-order fixed; the ✕-non-response was a harness artifact, not a bug (see §6 note) |
| | U42 | CODE | Companion panel recomputes from live state on every open |
| | U43 | VERIFIED | "47% Style Confidence" replaced with qualitative copy |
| | U44 | VERIFIED | Home footer links promoted to `bodySmallMedium`, 44pt row (folds into U24) |
| | U45 | VERIFIED (both halves) | `EngagementTierState` tri-state; promote-only, never silently demotes on backend failure |
| | U46 | VERIFIED | Design-request Review step now shows Budget + Vision verbatim |
| **Theme 8 (hygiene, unnumbered)** | — | **DONE, all 13 items** | Dead code deleted app-wide, independently verified zero dangling refs |

### Residuals DELIVERY.md itself names as still open — fair game for new findings

**Device-owed (LiDAR — Simulator forks to the fallback path, cannot be exercised without hardware):**
U15, U26, U28, U35, U36, the "Sending your scan — n of m" upload line (part of U11), the
completed-rescan path (`resetForRescan()` → second capture → accept — never walked in any pass),
the salvaged `ScanWalkView.sessionLostOverlay` tracking-loss copy (worth a device pass to confirm
it reads right in context), and the walk-first onboarding variant of U33 (flags fail closed under
`--uitesting`, only quiz-first was reviewable).

**Named follow-ups (net-new, never part of the review's 46 items, explicitly out of scope for THIS
program to claim closed):**
- Local-only room backfill service — rooms stranded at `.local` sync state from before the
  coordinator started stamping honestly.
- Companion UI-test coverage gap (touch/AX behavior, beyond `CompanionActionMatrixTests`' content pins).
- `RoomsAPIClient` injectable-session seam — the keychain-fallback fix is exercised manually only.
- Match-score badge (list) vs. detail-footer label discrepancy — not reproduced consistently, needs
  re-isolation on a product where it diverges (`obs-match-badge-49-vs-69.png`).
- Add-to-Room ("+ Add") gives no visible feedback and no confirmed `saved_items` row.
- Onboarding reveal eyebrow copy-consistency check ("YOUR PRIMARY STYLE" vs. "YOUR STYLE, FOUND").
- §F dead-error-contract residuals (none named sites, same defect class as U29): `ARPlacementManager.swift:133`,
  `RoomCaptureService.swift:265,276` (errorMessage set, never read); `CompanionViewModel.swift:51,361–362`
  (`sendUserMessage`'s full error contract — `errorMessage`/`lastFailedMessageText`/`retryLastMessage()` —
  has no caller, a deletion candidate — this is the correct citation for "conversational-companion dead
  code," distinct from the already-deleted Theme-8 conversational-Companion *view* set, see §5);
  `RecommendationsViewModel.saveFailureMessage` (rendered but as a bespoke banner, not the canonical
  `PatinaErrorState`); `CompanionContext.contextSummary`'s retired `"Your Table: N pieces gathering"`
  string (unreachable, would resurface if rewired — same item as the U09 residual above).
- U12's residual: `DailyProductCard.swift`/`RecommendationsView.productCard` still has no
  "opens detail" affordance; `ScanPickerView.swift:234` still a bare `.onTapGesture`. Neither file
  touched anywhere in the program.
- U21's unwalked variant: the Studio-row entry point into the auth sheet (vs. the walked Notifications
  entry point) — same plumbing, genuinely unexercised.
- **The Companion intro bubble still pre-empts first-launch tour step 2** (`15-tour-defect-companion-intro-after-next.png`)
  — carried from the draft, unaddressed by any commit in the final passes. `FirstLaunchTour.swift:185–187`
  anticipates "a competing first-run surface" stepping in — this is that surface. **This directly
  contradicts any assumption that Companion-intro-after-tour sequencing is settled** (see §6 C8 correction).
- Harness rules (verification-methodology, not app defects): never install `CODE_SIGNING_ALLOWED=NO`
  builds for a session/auth walk; assert entitlements post-install; HID-preflight-tap before trusting
  a synthetic tap's negative result; never batch layout-changing taps.

---

## 3. Glossary — canonical names

Source: `docs/design/ios-ux-review-2026-07/glossary.md` (design authority: final) + `DELIVERY.md`
per-row confirmation of what's actually live at tip `74f01410`.

| Screen / feature | The one name | Source |
|---|---|---|
| Designer-help entry CTA (everywhere outside the flow) | **"Get design help"** (room-scoped: "…with this room") | glossary §Design services; U08 DELIVERED-CODE |
| Design-request flow sheet | nav title **"Your design request"** | glossary; U08 |
| Saved surface | **"Saved"** (tabs: "Boards" / "All items") | glossary §Saved & browse; U09 DELIVERED-VERIFIED |
| Browse entry + screen title | **"Browse pieces"** ("Browse pieces →" as entry label) | glossary; U09 |
| QR portal-login | **"Sign in on the web"** (both Settings and Account) | glossary §Account/QR; U10 DELIVERED-CODE |
| Style reveal header | eyebrow **"YOUR STYLE, FOUND"** | glossary §Scan & style; U11 |
| Room stat cells | "Items" / **"Match"** / **"In AR"** | glossary; U11 (closed the "Avg Match" straggler in `89c5b54a`) |
| Retry label (everywhere) | **"Let's try that again"** | glossary §Loading/error/empty; U29/U30 |
| Default loading label | **"One moment…"** | glossary; U30 |
| Marketplace block header (Studio rail) | **"MARKETPLACE"** | glossary §Tier narration; U24 |

**Two documented in-flow exceptions** (glossary §Design services; reconfirmed in `DELIVERY.md` U08
row as deliberate, not oversights):
1. **`DesignerConsultationView`** keeps headline "Work with a designer"; its button reads **"Start
   a request"** — you're already inside design services, a second "Get design help" would be redundant.
2. **`DesignRequestStatusView`**'s terminal CTA reads **"Start a new request"**.

---

## 4. Voice rules for in-app copy, notifications, purchase language

Source: `.claude/skills/patina-brand-voice/SKILL.md`.

**Hard rules that bind app copy specifically:**
- Technology is the silent enabler — never lead with AI/algorithm/engine mechanics/ML/"powered by"
  in anything a user reads. Outcomes first. (This is why U11's fix deleted "THE AESTHETE ENGINE" and
  "full spatial intelligence" rather than softening them.)
- Designers are the intelligence layer, never labor — no gig framing, no "unlimited revisions" energy.
- Numbers must be true and sourced — no puffery stats. (This is the same rule that killed the fake
  "80% match" pill (U02) and the internal-telemetry "47% Style Confidence" (U43) — the brand rule and
  the July review's Law One, "never lie," are the same constraint stated twice.)
- Avoid: disrupt, revolutionize, AI-powered, curated, luxury, elevated (as filler), bespoke (unless
  literally custom), gig, marketplace-speak in consumer copy.
- Prefer: patina, provenance, heirloom, grain, workshop, maker, hand-built, honest materials, grows
  with your space, trade, studio.
- Decks/docs: Playfair headlines, Inter body, DM Mono labels; understatement over exclamation.

**Five example rewrites (typical app-copy patterns → voice-corrected):**

| Typical draft | Voice violation | Rewrite |
|---|---|---|
| "Our AI stylist found 12 new picks for your space!" | leads with AI; exclamation; "picks" without provenance | "New from the maker network this week — 12 pieces for your Living Room." |
| "Unlimited design revisions with your Patina designer" | gig-platform framing of the designer's labor | "Your designer refines the plan with you until it's right." |
| "This chair is 80% matched to your style" | fabricated precision (this is literally U02's bug — never re-propose a version of this string even reworded) | "Solid walnut, hand-rubbed oil finish — in the warm-minimal range you saved." |
| "Marketplace deal: save 15% today only" | marketplace-speak + manufactured urgency (forbidden dark pattern, brand skill + program §7/§11) | "Hearth & Grain, Asheville NC — hand-turned in walnut since 1988." (real provenance, no countdown) |
| "Powered by our matching engine — curated just for you" | "powered by," "curated," engine-mechanics lead | "Chosen for the room you scanned, and the maker behind it." |

---

## 5. Proposed before, not built

Everything the three decks or the orchestrator-memory facts deferred, backlogged, or left as a
named-but-unaddressed gap. These are legitimate territory for new proposals in this program — they
were never delivered, and (for the R32 backlog) Kody has already sequenced them.

| Item | Status | Source |
|---|---|---|
| Tab-bar re-evaluation | Deferred to "post-Track-D, once real usage exists"; U25 tabled evidence (2 stable destinations: Browse, Saved) without litigating | R29; Later item 06; U25 |
| Direct "buy now" orders | Ratified backlog item #3 of 4, not yet designed. "IA-only, no in-app checkout" was July's home-rework *scope*, not doctrine | R32; Later item 03; C11 |
| Client reviews surface | Ratified backlog item #1 of 4 — first item once the rail lands | R32; Later item 01 |
| Scope-change requests (client-initiated) | Ratified backlog item #2 of 4 | R32; Later item 02 |
| GDPR export/erase (data-rights self-service) | Ratified backlog item #4 of 4 | R32; Later item 04 |
| Board-canvas fidelity (beyond thumbnail grid) | Named backlog; Wave 2 (D.1 proposals) deliberately shipped thumbnails-only to avoid "the boards-fidelity rabbit hole" | Later item 05; RISK 06 (alignment deck §08) |
| Parked scan-bundle re-entry (closest match: the completed-rescan path) | `resetForRescan()` → second capture → accept — code exists, **never walked in any of the three verification passes** | `DELIVERY.md` OPEN ITEMS, device-owed list |
| MonoLabel ramp | The component exists and is already used 29× in the client app (`PatinaDesignKit/Components/MonoLabel.swift`); the still-open "ramp" is (a) Field's adoption of it as part of Track B.2 componentadoption (Field-scoped, out of this review), and (b) the client-side token-ratchet residual itself — alignment-deck scorecard still shows "148 raw `.font(.system(size:` baselines" and "ratchet C = 146" bypass sites as of 2026-07-09 | Alignment deck §04 component-adoption table; §02 scorecard ("Typography" A−, "Component kit" B+ rows) |
| PatinaButton `secondaryTinted` | **Not found.** `PatinaButton.swift` (`apps/mobile/PatinaDesignKit/Sources/PatinaDesignKit/Components/PatinaButton.swift:11-16`) defines only `.primary/.secondary/.ghost/.clay/.destructive` — no `secondaryTinted` case exists in code, and no deck or memory fact proposes it under that name. Flagging as unverified rather than fabricating a source; may be a mis-citation in the brief, or a variant proposed outside these three decks | none located |
| Realtime badge counts (publication-backed) | Today: poll-on-foreground floor only (`BadgeCountService`); a Supabase realtime publication would need migration 00285+ and isn't built | RISK 07 (alignment deck §08); §05 "The Shell" body text |
| APNs push send | Backend stub — no send path exists; polling is the only live return mechanism today (R30's poll-first half is load-bearing, not just a preference) | C14 (orchestrator memory); R30 |
| Homeowner cancel of a design/match request | No cancel action exists on requests — explicitly named and left untouched by the July UX review | R106 clause 6 "Arrival Arc" (July UX review deck, "Not reopened" §, line ~1633) |
| Conversational-Companion dead code (still open) | The *view* set (`CompanionConversationView`, `QuickActionsBar`, `ContextBar`, `InputBar`, `CompanionAuthPanel`, `setCompanionSheet`) **was already deleted** — Theme 8, DONE. The still-open piece is a different symbol: `CompanionViewModel.swift:51,361–362`'s full error contract on `sendUserMessage` (`errorMessage`/`lastFailedMessageText`/`retryLastMessage()`) has zero callers — a named deletion candidate, not yet acted on | `DELIVERY.md` Follow-ups (§2 residuals above) |
| Companion intro bubble vs. first-launch tour step 2 | Genuinely still colliding — not addressed by any commit through the final hardening wave | `DELIVERY.md` "Not carried forward" note (§2 residuals above) |
| Field Settings (T1) real dials | Template screen, not yet built out — Field-scoped, out of this app's review | Later item 08 |
| Companion mock-fallback removal (behind real auth) | Named backlog, not yet done | Later item 07 |

---

## 6. Canon guard C1–C16 — corrected and extended

Base rows from `instruments.md` §6, verified against the three decks. Unmarked rows are accurate as
written. Corrections and additions below.

**Corrections:**

- **C8** (Companion coaching phases; intro "sequenced after the first-launch tour") — the phase model,
  ≤6-row cap, and "NEXT STEPS" label decay are all confirmed delivered (U34 DELIVERED-VERIFIED,
  decay confirmed after 3 navs). **But the "intro sequenced after the tour" half is not settled** —
  `DELIVERY.md` names an open, unaddressed defect: the Companion intro bubble still pre-empts tour
  step 2 (`FirstLaunchTour.swift:185–187`; see §5 above). Treat C8's sequencing claim as **aspirational,
  not delivered** until re-walked.
- **C9** (auth sheet "never ejects") — true and DELIVERED-VERIFIED for the walked path (guest tapping
  a "Sign in to…" row from Notifications). The Studio-row entry variant of the *same* `AuthSheet`
  plumbing was never exercised in any of the three verification passes — same code path, low risk,
  but unproven. Don't claim it as verified if a new walk finds it broken; it would be a genuine new
  finding, not a regression.
- **C10** (money rail — "3s/60s poll-on-dismiss") — the existence of the rail (proposals/invoices/
  budget/documents, `sign_proposal` RPC, Stripe hosted Checkout in `SFSafariViewController`) is
  confirmed by the alignment deck §06. The specific "3s/60s" polling cadence is **not stated in any
  of the three decks** — that number would need code confirmation (G1's territory), not deck citation.
- **C12** (room scan fallback) — imprecise as written. There are **two separate non-LiDAR paths**,
  not one: (1) `NewRoomSheet` → `ManualRoomEntryView`, which always persisted correctly via `RoomStore`
  (June deck, July UX review deck line ~82); and (2) the "Start a scan" CTA's conversation-based
  fallback (`.fallback → .conversation → … → .floorPlan`), which **used to discard the room entirely**
  — this was Theme-0's U40 funnel break, now fixed to write through the same `RoomStore` path. Both
  now persist; they are functionally distinct entry points a redesign should keep distinguishing.

**Additions:**

- **C17 — Tier-narration copy is canonical and delivered.** All 8 Studio empty-state strings, the
  discovering/engaged locked-row copy, and the "MARKETPLACE" block header are fixed strings in
  `glossary.md` §Tier narration and §Loading/error/empty, and are DELIVERED-CODE/VERIFIED (U19, U22,
  U24). A finding proposing different empty-state wording for these 8 surfaces would conflict with
  ratified copy — cite the glossary, don't re-word.
- **C18 — First-launch tour content is canonical and delivered.** `glossary.md` §First-launch tour
  (WP-FT) is the ratified 3-step copy; U32 is DELIVERED-VERIFIED including the Sanity CMS documents
  (not just the Swift fallback) and the renumber-not-vanish mechanism, pinned by
  `FirstLaunchTourTests`. Don't re-propose different tour copy; the open gap here is the Companion-
  intro collision (§5), not the tour's own content.
- **C19 — The screen-chrome exemptions are deliberate, not gaps.** `ProductDetailView`,
  `ARPlacementView`, `StyleQuizView` (plus `.scanFlow`/`.preScanChecklist`) are recorded
  N/A-BY-DESIGN for the shared `PatinaScreenChrome` back-chevron pattern — "own exits, per COMMON's
  SKIP list" (commit `c87a2124`). A finding that these screens "lack standard back chrome" would be
  re-litigating a ruled exemption, not discovering a bug.
- **C20 — The Companion escalation timer is deleted, not dormant.** The 20-second stuck-user
  `runUnusedCompanionEscalation` poll was removed outright (U34) in favor of the standing text label.
  Don't propose re-adding a timer-based nudge; that would reverse a ruled fix.
- **C21 — Device-owed items are code-complete, not missing.** U15, U26, U28, U35, U36, and the "n of
  m" upload line are all implemented and code-read at tip; they are unverifiable in Simulator because
  `RoomCaptureService.isSupported` is false there (no RoomPlan). A sim-only walk cannot re-flag these
  as bugs — it can only note they remain unverified and need a device pass (already tracked, §5).
- **C22 — The alignment deck's own pre-ruling findings are a separate, not-fully-tracked layer.**
  The July alignment deck's "Evidence" section (§03, 2026-07-09 fresh sim walk) surfaced defects that
  are distinct from both R27–R33 and U01–U46 — e.g. "Dark-mode companion scrim bleeds… appears on
  nearly every dark capture" (Systemic, 21/23 shots) and "Onboarding never releases the user" (the
  worst-listed ship-blocker, assigned to "Track E"). **No U# or DELIVERY.md row maps to the scrim-bleed
  item specifically** — it predates the July UX review's numbering and isn't named in `DELIVERY.md`'s
  46 items. Treat it as unconfirmed-status, not closed; worth a direct re-check on this program's own
  dark-mode walk rather than assuming June/July fixed it.

---

## 7. The deck series' own conventions

So the new deck sits in the lineage rather than breaking it.

**Numbering & id systems.** Each deck owns a disjoint id space that survives across the series: R01–R26
(June, device findings), R27–R33 (July alignment, policy rulings), U01–U46 (July UX review, net-new
findings). IDs are never reused; a later deck's "Scope: not reopened" section (July UX review §"Not
reopened," `docs/design/ios-ux-review-2026-07/index.html` lines ~1604–1650) explicitly names the
earlier IDs it respects rather than restating them. **This program's own `instruments.md` §5 finding
schema continues the practice** with a fourth namespace (seat-prefixed ids like `H1-04`) and a
mandatory `already_ruled`/`july_status` field pointing back at R#/U#/C# — the same discipline, made
machine-checkable.

**Section rhythm.** Every deck opens each numbered section with a short mono-caps eyebrow, then a
large serif "reveal" headline using `<em>` to land the twist word (class `.rv` in the July UX review
CSS — e.g. "The bones are right. The *surface* keeps breaking trust in them."), then a one-line lede.
Sections are numbered `01…0N` in a persistent side/top nav that also anchors mid-scroll (`#bar`
scroll-progress indicator in all three). The July UX review closes with an explicit **"Scope: what
this review does not reopen"** section — a convention worth keeping in the new deck.

**Severity/evidence taxonomy — NOT constant across decks, worth knowing before citing "P0":**
- June deck: P0 = "broken or trust-damaging, fix first"; P1 = "friction that erodes the experience";
  P2 = "polish that compounds." Evidence chip: "Device-verified." Effort: S/M/L.
- July UX review deck: P0 = "broken promise"; P1 = "discoverability"; P2 = "polish." Evidence chips:
  "live capture" / "code-verified" / "live + code" (three-way, not the June deck's binary). Effort:
  XS/S/M/L.
- July alignment deck uses letter grades (A/A−/B+/B−/D/C+/F, class `.grade`, large italic serif) for
  its Scorecard instead of P0–P2 — it's grading *state against the brand*, not triaging fixes — and
  a separate ad-hoc severity vocabulary in its Evidence section ("Ship-blocker," "Systemic," "Trust,"
  "Guest," "Content," "Layout").
- **This program's own schema (`instruments.md` §5) uses S0–S3, a fourth, distinct scale** — a
  deliberate break from P0–P2, not an accident; don't conflate an S0 in this program's output with a
  P0 in the prior decks when cross-referencing.

**The "evidence vs. analysis register" device** (July UX review deck only — the most structurally
elaborate of the three). CSS defines two parallel token sets: `--ev-*` (evidence register — dark
ground, `#211E1B`/`#2A2724`/`#171513`, "sampled from the captures themselves," per the file's own
header comment) and `--an-*` (analysis register — light paper, `#F2EDE6`/`#FAF7F1`/`#E8E1D6`).
Every section wraps in `.reg` (analysis/paper) or `.reg-ev` (evidence/dark); **components read only
the active register's custom properties** (`docs/design/ios-ux-review-2026-07/index.html:66-76`), so
a shot-heavy "what the walk showed" passage renders as a literal dark panel and a "here's the fix"
passage renders as light paper — the register change *is* the "this is a screenshot vs. this is our
recommendation" signal, not a caption. Severity tokens (`--sev0/1/2`) are independent of the accent
color so P0/P1/P2 stays legible against either register. Both `--ev-*` and `--an-*` sets have full
light/dark-mode variants (`@media (prefers-color-scheme:dark)` guarded by `:root:not([data-theme="light"])`,
plus a `:root[data-theme="dark"]` override) — this is the only one of the three decks built to survive
the *viewer's* dark mode, not just to describe the app's.

**Typography, by deck:**
- June + July-alignment decks: Google Fonts direct-load — Playfair Display / Inter / DM Mono (`index.html:7-9`
  in both), palette `--paper #F6F2E9`, `--ink #2C2926`, `--clay #A8674A`/`#8C4F36` deep, `--charcoal #211E1B`.
- July UX review deck: **platform-native stack**, not Google Fonts — `--serif: ui-serif,"New York","Playfair Display",Georgia,serif`;
  `--sans: -apple-system,BlinkMacSystemFont,"SF Pro Text",…`; `--mono: ui-monospace,"SF Mono","DM Mono",Menlo,…`
  (lines 34-36) — deliberately typeset in "the platform's own faces," per its file-header comment, a
  step further into "the app's own voice" than the other two decks' direct brand-font load.
- This program's own deck plan (`instruments.md` §10) specifies Playfair Display / Inter / DM Mono via
  Google Fonts with real fallback stacks — closer to the June/alignment convention than the July UX
  review's platform-native one; worth a deliberate choice, not a default, given the July deck set a
  precedent for the opposite approach.
