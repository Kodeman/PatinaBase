# 14 — Grounding gaps (G4)

Read: `instruments.md` §1–§6, §9; `10-code-anatomy.md`, `15-task-paths.md`, `16-token-table.md`,
`11-canon-digest.md`, `12-backend-reality.md` (all five present, all read in full). No missing files.

**Headline:** coverage across the five files is strong — most T1–T14 × seat cells are fully grounded,
and G1/G2/G3 independently corroborate each other on the big facts (AR dead, no cart, no household,
tier system unused). The four contradictions below are load-bearing precisely because they sit under
canon (§6) that verifiers are told not to silently re-litigate — an author who trusts the stale half
of any of these will write a finding a verifier then wrongly blesses or wrongly kills.

---

## A. Contradictions between files

### 1. C1/C2 (nav + home canon) vs. the Option‑B rewrite G1 found

- `instruments.md:189` — **C1**: "No tab bar; Studio home-hub rail + Companion ARE the nav... Re-evaluation
  scheduled 'post-Track-D'."
- `instruments.md:190` — **C2**: "Home is marketplace-first with 3-tier progressive disclosure... morphs
  as a designer is engaged | Kody 2026-07-14; `EngagementTier.swift`; `DailyRoomView.bottomSection(tier:)`."
- vs. `10-code-anatomy.md:111-112` — "`DailyRoomView.content`... mounts **four things, in this order, at
  every tier including guest**. There is no tier branch left in the view."
- and `10-code-anatomy.md:153-156` — "**Where it is read today:** `CompanionAreaBuilders.swift:23-25`...
  and the dormant `HomeStudioBlock`... **`DailyRoomView` never reads it.**"

`DailyRoomView.bottomSection(tier:)` — the exact symbol C2 cites as the mechanism — is gone; the
Studio-hub-rail nav C1 forbids re-proposing is orphaned (`10-code-anatomy.md` A1, A2). Both canon rows
predate the Option-B rewrite (`126e59a11`, `6dbc6f964`) that G1 discovered. **A direction that re-mounts
the tier-gated home is restoring shipped-but-disconnected code, not violating C1/C2** — verifiers need
this distinction or they will reject a legitimate fix as "re-litigating ruled canon."

### 2. C14 (APNs is a stub) vs. G3's correction

- `instruments.md:202` — **C14**: "APNs push send is a backend stub; polling floor is the live mechanism."
- `10-code-anatomy.md:541-543` and `15-task-paths.md:287-290` both restate C14 as standing without
  checking the backend.
- vs. `12-backend-reality.md:236-244` — "APNs send — this is **NOT** a stub; it is a complete
  implementation... `apns-send`... `APNS_AUTH_KEY, APNS_KEY_ID, APNS_TEAM_ID, APNS_TOPIC` all present in
  Strata... Callers already wired: `accept_design_request` (00330), `ceremony_complete` (00331),
  `refresh_offered_slots` (00334)."

Both halves are true for different scopes: push **infrastructure** is fully built and live-wired for
three match/design-request triggers; push is a **stub only for proposal-sent / invoice-due**, which are
exactly what T10 asks about and match none of the three wired triggers. A finding that says "build APNs"
overstates the work; a finding that says "push already covers this" understates the gap. State both
halves explicitly — see gap G1 below.

### 3. `products.lead_time_weeks` — exists or not

- `10-code-anatomy.md:249` (A5 trust-field table): **"lead time | no column exists | ✘ | ✘ | ✘"**
- vs. `12-backend-reality.md:40-42`: "`lead_time_weeks integer` exists but **only required (CHECK) for
  `layer='studio'`** (`00152_three_layer_catalog.sql:83-95`) — catalog-layer (the layer the client app
  reads) has no lead-time guarantee."

The column exists; it's `get_recommendations` that doesn't return it and the client that doesn't decode
it (both correctly captured elsewhere in the same A5 table for other fields, just mis-stated here for
this one row). Consequence for scope: a "show lead time" finding is *wire an existing column through the
RPC and the client*, not *add a migration* — a real complexity difference for T3/U3 findings.

### 4. Why first-launch-tour step 2 never renders — two different causal claims

- `10-code-anatomy.md:595-600`: attributes the drop to `.firstLaunchTourAnchor(.addToRoom)` existing "in
  **no view**" because the block that carried it (`DailyProductCard`) is orphaned; the tour's own
  availability tracker drops the step after a 1.5 s grace. `10-code-anatomy.md:601` then states Companion
  intro is "sequenced *after* the tour resolves" as settled fact.
- vs. `11-canon-digest.md:255-260` (correcting `instruments.md:196`'s C8): "the 'intro sequenced after the
  tour' half is **not settled** — `DELIVERY.md` names an open, unaddressed defect: the Companion intro
  bubble **still pre-empts tour step 2**... Treat C8's sequencing claim as aspirational, not delivered."

These are two different mechanisms for the same symptom (dead anchor vs. a competing surface racing it)
and imply two different fixes (mount the anchor somewhere real vs. re-gate/reorder the Companion intro).
G2's finding predates G1's Option-B discovery and may itself be stale (the DailyProductCard-carried
anchor it assumes existed may already have been gone when DELIVERY.md's defect was logged, or the defect
may be independent of the anchor question entirely) — **this needs a fresh, targeted device/sim check**
before any tour or Companion fix proposal cites either explanation as settled.

---

## B. Facts seats/tasks need that no file provides

Most T×seat cells are fully grounded (particularly T2, T3, T5, T6, T7, T8, T9, T11, T13, T14 — dense,
cited coverage in `10-code-anatomy.md` + `15-task-paths.md`). The real gaps, cross-cut by task and seat:

| # | Missing fact | Task(s) | Seat(s) | Critical | How to settle |
|---|---|---|---|---|---|
| G1 | Whether *any* push trigger fires on proposal-sent or invoice-due — G3 names only 3 wired triggers, all design-request/match-shaped, none proposal/invoice-shaped | T10 | H2, D1, D3, U1, U3 | **Yes** | grep migrations + edge functions for `invoke_edge_function(...apns-send...)` call sites beyond the 3 named; confirm none targets `invoices`/`proposals` |
| G2 | Apple Pay availability + relative cost inside Stripe hosted Checkout (`SFSafariViewController`) vs. `PaymentSheet` — U3 Q7 asks this by name | T7 | U3 | **Yes** | check the Checkout Session config in `create-checkout-session`; no file states whether Apple Pay is enabled on that session |
| G3 | Whether a `direct_orders` purchase credits the assigned designer (commission, FF&E schedule) — the table has no `designer_id`/`project_id`/`commission_rate` column (`12-backend-reality.md:195-201`), while `products.commission_rate` exists unattached to any order (`:23`) | T7, T14 | D1, D3 | **Yes** (answer is derivable from G3's own schema dump, but stated nowhere as a finding — high risk of being missed) | state plainly: today, no. Re-derive from the direct_orders column list already in G3 §5 |
| G4 | Whether `onboarding_walk_first` is on or off for this program's local PostHog config — determines which T1 variant a walker actually sees | T1 | H1-3, D1-3, U1-3 | No | check flag state or force via launch config before walking; already known to be flag-gated/unverified (`11-canon-digest.md:110`) |
| G5 | Complete inventory of homeowner-facing email triggers — only direct-order and design-request emails are named (`12-backend-reality.md:252-255`); proposal/invoice/decision confirmation-email existence beyond "sign_proposal sends none" is unconfirmed | T10 | U1 | No | grep `supabase/functions` for `send-email` call sites per payable/decision table |
| G6 | Actual OTP sign-in round trip confirmed working end to end for either walk account — send was never triggered this pass (sandboxed `.env.local`) | any signed-in walk (T4, T8, T9, T10, T14) | H2, H3, D1-3 | **Yes** | trigger an OTP send with a readable anon key; confirm Inbucket delivery + code entry before relying on a signed-in walk |
| G7 | No local account carries an open invoice — H2/Ruth's brief needs "one invoice open" (`instruments.md:85-89`) | T10 | H2 | **Yes** | seed one invoice on `client@patina.dev` (or another activeProject account) before the walk |
| G8 | `PatinaSheetHeader` has zero visual spec anywhere in the five files (dimensions, drag handle, dismiss control, title role, divider) — needed for the mandated "order sheet" mock (`instruments.md:254`) | purchase-flow mock (T7) | mock authors | **Yes** | read `Components/PatinaSheetHeader.swift` directly — out of this lane's assigned files |
| G9 | Whether "household / partner" is a concept Kody has ever scoped, or is fully greenfield beyond R32's four ratified backlog items (which don't include it) | T12 | H-seats, U1, U3 | No | ask Kody directly; no deck names it either way |

---

## C. Token-table completeness for a CSS mock kit

| Element | Drawable from `16-token-table.md` alone? | What's missing, and where it actually lives |
|---|---|---|
| **Home** | Partial | Colors/type/gutter (20pt)/Companion 120pt hearth are in §3 (`16:171-175`). Block **order and composition** (greeting → Next Move → story → Active Room, what's new day to day) is only in `10-code-anatomy.md` A2. Combined = yes. |
| **Product card** | No | No `ProductCard` token block exists — only `MatchPill` and the `PatinaAsyncImage` placeholder rule. The 2-column grid / 160pt image / ♥ / ⋯ layout is in `10-code-anatomy.md:274` (A5), not 16. Needs both files. |
| **Button** | **Yes** | `PatinaButton` (§9) is fully specified: height 52, capsule, 5 styles with fill/label/border, press feedback, `AuthButton` variant. |
| **Chip** | **Yes** | `FilterChip` (§9) fully specified: capsule, caption type, padding, active/inactive fills. |
| **Empty state** | Yes (skeleton) | `PatinaEmptyState` (§9) visual skeleton is complete. Per-screen copy strings (the actual words) live in `10-code-anatomy.md`, not 16 — expected, not a defect. |
| **Sheet header** | **No** | `16-token-table.md:388` gives only a file:line citation, zero visual properties. Not documented in *any* of the five required files — this is gap **G8** above, not merely a cross-reference. |

**Verdict:** a mock builder needs `16-token-table.md` + `10-code-anatomy.md` together for every
composed screen; 16 alone only fully suffices for atomic components (button, chip, empty-state
skeleton). The sheet header is the one component neither file specifies at all.

---

## D. Walk-account facts the evidence lane needs

From `12-backend-reality.md` §8 (all local, verified live):

- **Two usable signed-in accounts**: `client@patina.dev` (activeProject: 3 projects, 4 proposals/1
  signed, 6 decisions, **0 invoices, 0 saved_items, 0 rooms** — `:333-336`) and
  `james.okafor@example.com` (engaged: 1 accepted lead, 0 projects — `:337-339`).
- **No account has an invoice** (`:326-328`) — blocks a live T10/H2 invoice-pay walk (gap **G7**).
- **No account has any saved_items or rooms** (`:310`, `:326`) — T4/T5 walks must create these live
  during the walk; this matches what the tasks ask anyway, not a blocker.
- **No account combines `discovering` tier + a room + a live-engaged designer** (`:341-342`) — a
  redesign direction targeting exactly that intersection cannot be evidence-walked without seeding.
- **OTP sign-in was never actually exercised** (`:344-349`) — Inbucket and its API are confirmed
  reachable, but no code was sent or entered this pass. This is gap **G6**: before any seat walks a
  signed-in task, confirm the OTP round trip actually completes in this environment.
- **PostHog usage data and prod row counts are both unavailable this pass** (`12-backend-reality.md`
  §9, §10) — any finding citing "real users do X" has no source; treat all such claims as unfounded
  unless a future pass loads the Supabase/PostHog MCP tools.

---

## Correction — 2026-08-26 (G5 lane, `17-gap-fills.md`)

The six **critical** gaps in §B are settled in `research/17-gap-fills.md`. G4, G5 and G9
(non-critical) remain open. Summary of what each answer changes:

| Gap | Status | Answer, in one line | What it changes here |
|---|---|---|---|
| **G1** | Settled | **No push on proposal-sent or invoice-due.** `apns-send` has **5** callers, not 3 — none touches a payable | §A.2's framing holds; the caller count in `12-backend-reality.md` was low. New: `fulfillment-notify` pushes `shipped`/`delivered` to homeowners, but **operator-triggered** and only on the BOH `fulfillment_orders` rail |
| **G2** | Settled | **Apple Pay is already free** in today's `SFSafariViewController` Checkout — `card` is in `payment_method_types`, Apple supports Apple Pay in `SFSafariViewController`, dashboard config is bypassed by the explicit array. PaymentSheet buys a native sheet, not the wallet | U3 Q7 becomes a **live-probe** task, not a build task. One residual: a future "pay by bank" single-rail toggle would silently kill Apple Pay |
| **G3** | Settled | **No.** A `direct_orders` purchase credits the designer nothing — no commission, no earnings row, no project, no FF&E line | Now stated as a finding, not left implicit. `00301_marketplace_vitals.sql:37-40` says it in the platform's own words |
| **G6** | Settled | **The round trip completes** (`/auth/v1/verify` → 200 + session for `client@patina.dev`). **But the local email carries no 6-digit code** — the template URL 404s and GoTrue falls back to a link-only default | §D's "never exercised" is resolved. Walkers tap the magic link or restart the stack; **do not** write "no code in the OTP email" as an app finding |
| **G7** | Settled | Seeded: **`INV-2026-0142`**, `sent`, **$4,250.00** unpaid, due **2026-09-01**, project "Aspen Loft Refresh", 2 line items — RLS-verified visible to `client@patina.dev` | §D's "no account has an invoice" is now false. H2/Ruth can walk T10 end to end, and that walk doubles as the G2 Apple Pay probe |
| **G8** | Settled **with a correction** | `PatinaSheetHeader` has **ZERO call sites** in either app — it is defined and previewed, never rendered. Full visual spec is in `17-gap-fills.md`, but the mock should draw the hand-rolled `AddToRoomSheet` pattern instead | §C's "Sheet header — No" changes from *undocumented* to *documented-but-unused*. A mock of the design-system header would depict something the app has never shown |

One environment fact found while settling G6, relevant to every lane that reads the local stack: the
running Supabase containers were booted from `/Users/kody/Code/patina-merged/.codex/worktrees/agent`
(a path that no longer exists), so the stack does not necessarily reflect `main`'s `supabase/` tree.
The `supabase` CLI also cannot run under the default sandbox — it dies reading `supabase/.env.local`,
which the sandbox denies; local keys come from `docker inspect supabase_studio_supabase` instead.
