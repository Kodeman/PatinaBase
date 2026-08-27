# Instruments — The Daily Return (Patina iOS client app)

Paste-by-reference: briefs point at sections of this file. Read only the sections your brief names.

## §0 Program facts

- App under review: **Patina** (client app), `apps/mobile/Patina`, bundle `cloud.patina.app`,
  SwiftUI, iOS 18+ target, main @ `3cd84ecb3` (2026-08-26). Sister app Patina Field
  (`apps/mobile/Capture`) is OUT of scope.
- Navigation model today: **no tab bar** (ruled R29). The home ("Daily Room", `DailyRoomView`) is
  marketplace-first with a Studio hub rail that unlocks by engagement tier
  (`discovering → engaged → activeProject`, `Core/State/EngagementTier.swift`); the **Companion**
  (living orb, `Features/Companion`) is the other nav door. Routes = `AppRoute`
  (`App/Coordinators/Coordinator.swift:51-144`): heroFrame · yourSpaces · roomProject · roomSettings ·
  crossRoom · manualRoomEntry · roomSavedItems · emergence (Browse pieces) · roomEmergence · table
  (Saved) · pieceDetail · scanFlow · styleQuiz · styleResult · arPlacement · profile · notifications ·
  designerConsultation · designRequests · projectList/Detail · decisionList/Detail ·
  threadList/Detail · proposalList/Detail · invoiceList/Detail · budget · documentList.
- Evidence: iOS Simulator **iPhone 17 Pro** (udid `973D1724-90BF-4A0A-B02D-481D561547B3`, iOS 26.5)
  against the **local** Supabase stack (`http://127.0.0.1:54321`, Postgres `127.0.0.1:54322`,
  mail UI `http://127.0.0.1:54324`). Guest + signed-in client walks. No device, no prod walk.
- Output root: `artifacts/ios-daily-return-2026-08-26/` — `research/`, `shots/`, `mock/`, `source/`.
- Prior review series (do NOT re-report what July delivered unless it regressed — check
  `docs/design/ios-ux-review-2026-07/DELIVERY.md` status per U#): June R01–R26
  (`docs/design/ios-ux-review/index.html`), July alignment R27–R33
  (`docs/design/ios-alignment-program/index.html`), July U01–U46
  (`docs/design/ios-ux-review-2026-07/index.html`, `glossary.md`, `DELIVERY.md`).
- Canonical names (July glossary): **Daily Room** (home) · **Your Spaces** (rooms) · **Your Designer** ·
  **Your Studio** (projects/proposals/invoices/budget/documents/decisions/notifications) ·
  **Get design help** (the one designer CTA) · **Saved** (tabs Boards / All items) · **Browse pieces** ·
  **Sign in on the web** (QR) · loading "One moment…" · retry "Let's try that again".
- Brand voice (`.claude/skills/patina-brand-voice/SKILL.md`): technology silent; designers are the
  intelligence layer, never labor; Midwest, plain-spoken; lexicon patina/provenance/heirloom/grain/
  workshop/maker/studio/trade; avoid luxury/elevated/curated/AI-powered/marketplace-speak.

## §1 Task script T1–T14

Walkers run T1→T14 in order as **one week in the life**, first person, present tense. Never skip a
task because it "obviously has no path" — narrate the search; the search is the finding. Homeowners
run all fourteen; designers run T1, T2, T6, T7, T8, T9, T10 as themselves plus T14; UX/UI lenses run
all fourteen as their lens. "Path today" is filled by G1 in `research/15-task-paths.md`.

| # | In their words | Return / purchase relevance | Success looks like |
|---|---|---|---|
| T1 | "Fresh install. What is this for, and what do I do first?" | first-five-minutes → day-2 return | Knows the one thing to do; does it; lands somewhere worth returning to |
| T2 | "7:40am, coffee, phone in hand. Why would I open Patina *today*?" | the daily-return probe | Something on the first screen is new since yesterday and about *my* home |
| T3 | "Find a sofa for our living room." | browse → detail | Finds one; price, maker, materials, dimensions, lead time legible without hunting |
| T4 | "Save it. Find it again tomorrow." | investment the app remembers | Saved is one tap; it's where I expect tomorrow; it's attached to my room |
| T5 | "See it in my room." | room as the object of return | Room exists (manual entry in sim; scan on device); piece lands in it; AR reachable |
| T6 | "Is this the one? Help me decide." | decision aids | Compare/notes/share/ask-a-designer exist and are findable |
| T7 | "Buy it." | the purchase probe | Name the dead end verbatim; what the app offers instead; how many taps to money |
| T8 | "I've ordered / my designer ordered — where is it?" | post-purchase return | Status of a piece/proposal/invoice/order in one place; what changed since last look |
| T9 | "Get a designer's help with this room." | conversion to engaged tier | Get design help → request → status → match, without losing the room |
| T10 | "The designer sent a proposal / an invoice is due. How do I find out?" | notification earning | Which pushes I'd allow, what earns the permission, what the app can actually send today |
| T11 | "Two weeks away. I'm back." | the re-entry moment | What greets me; nothing punishes absence; the house moved on and I can see how |
| T12 | "Show my partner." | household as the retention unit | Share a piece/room/board; second person can act; no dead share |
| T13 | "One-handed on the bus · dark mode · larger text." | reach | Primary acts reachable by thumb; dark mode legible; XL type doesn't break the home |
| T14 | *(designers)* "My client just installed this. What do they see of me, and what do I want them doing in here between our meetings? Would I send them here to buy?" | designer trust + margin | Designer visible in the client's home; purchases credit the designer; nothing competes with the relationship |

## §2 Homeowner personas (H1–H3)

**Walk format (every task, first person, present tense):**
```
T{n} — {the task in my words}
First glance:       what my eye lands on in 3 seconds, named literally (labels quoted)
Where I'd tap:      the exact word/control, and why
Where I'd hesitate: the moment I stop, and what I'm asking myself
Where I'd leave:    Pinterest / Wayfair / text my designer / close the app — or "didn't"
Would I come back tomorrow for this? yes/no + the one reason
Obviousness {1-5}   (1 could not find · 3 second guess · 5 without thinking)
```
Quote labels verbatim. "I expected a ___ and there wasn't one" is the deliverable. End with:
**Three things that would make me open this every day** and **What would make me buy here
instead of the maker's own site**.

**H1 · Maya (32) & Devon (34), Grand Rapids MI — Opus.** First house, 1,400 sq ft 1950s ranch,
living room empty since closing in May. Budget ≈ $6–9k this year, spent slowly. Nightly ritual =
twenty minutes on the couch: Pinterest, Wayfair, Facebook Marketplace, and the Zillow habit that
never went away after closing. "Designer" sounds like money they don't have. Tolerance for
onboarding: low; for a quiz: one, if it pays off on the next screen. Stakes: buying the wrong sofa
once; the room staying empty another season. **Her question:** "Will this give me a reason at 9pm
that Pinterest doesn't?"

**H2 · Ruth (47), Des Moines IA — Sonnet.** 1920s foursquare, engaged a designer three months
ago (activeProject tier): dining room + primary bedroom, mid-procurement, one invoice open, a
proposal she signed in June. Two kids, a job, and a loathing of email threads. Wants status and
decisions in one place and to know where the money went. Checks packages the way other people
check the weather. Tolerance medium; leaves the moment she has to ask her designer what a label
means. Stakes: missing a decision her designer is waiting on; not knowing an install date moved.
**Her question:** "Can I check on my house the way I check on a package?"

**H3 · Walt (63), Madison WI — Opus.** Downsizing from a four-bedroom to a two-bedroom condo.
Fewer, better pieces; reads the maker's story; buys once and keeps thirty years; skeptical of apps
and allergic to being "engaged." Morning ritual: Apple News, weather, the Journal Sentinel on the
iPad, coffee. Has money; wants his time respected. Stakes: a $4,000 chair bought from a screen; a
piece that arrives not as described. **His question:** "Does this respect my time, and would I trust
it with a four-thousand-dollar chair?"

## §3 Interior designer personas (D1–D3)

Same walk format as §2, with **"What I want my client doing here"** and **"What would make me
stop sending clients here"** as the closing lines. Designers know the Patina designer portal
(The Document, `apps/designer-portal`) and judge the client app as its other half.

**D1 · Leah (38), solo residential designer, Columbus OH — Opus.** Eight years, 6–10 clients a
year, one job always in install; sells product at trade margin; came off Ivy + a Google Sheet. Runs
her jobs in The Document. Expects, in order: my client sees *me* (name, studio, the job), my client
can act on what I'm waiting on (approve, sign, pay), my client shops *with* me not around me.
Tolerance high but conditional — will not accept a client surface that costs her a phone call.
**Her question:** "What do my clients see of me in here, and does this help or compete?"

**D2 · Priya (44), principal of a three-person studio, Minneapolis — Sonnet.** Eleven live jobs,
two designers + a procurement coordinator. Her inbox is the enemy; she wants client self-serve
that reduces Tuesday's forty emails, not a new channel that adds to them. Reviews, never edits.
**Her question:** "Would sending clients here cut my inbox in half or triple it?"

**D3 · Tom (51), kitchen/bath + furnishings, Milwaukee — Sonnet.** Procurement-heavy; six-figure
FF&E budgets; sells product; has been burned by clients buying the "same" piece direct and then
calling him when it arrived damaged. **His question:** "If my client buys a $3,200 sideboard in this
app, who gets paid, who's responsible when it arrives damaged, and does it show up on my FF&E
schedule?"

## §4 UX/UI lens briefs (U1–U3)

**U1 · Retention & habit design — Opus.** Frameworks used honestly: Hook (trigger → action →
variable reward → investment), Fogg B=MAP, jobs-to-be-done for the *return* job, first-week
retention curve, notification-permission earning (pre-permission moments), iOS return surfaces
(Home Screen widgets, Lock Screen widgets, Live Activities, App Intents/Spotlight, Shortcuts,
Wallet passes). Ethics: Patina's voice forbids manipulative loops — name any streak/badge/urgency
idea you reject and why. Questions: (1) Inventory today's triggers — external (push = backend
stub; email; SMS?) and internal (what feeling sends someone here?). (2) What investment does the
app already remember (rooms, saved, style profile, design request) and which of it is *visible* on
return? (3) What is the variable reward today (daily story? new pieces? designer messages?) and
is it actually variable? (4) Draw the day-1/day-2/day-7/day-30 curve as the app is built today —
where does it go flat? (5) For each tier, name the one honest reason to open tomorrow. (6) Which
iOS return surfaces are unused, and which fit the brand? (7) Rank ten return mechanics by
honesty × plausibility × cost.

**U2 · Interaction, navigation & visual — Sonnet.** HIG; the no-tab-bar model (Companion + hub
rail); affordance and hierarchy; motion (Reduce Motion gates); dark mode (dynamic tokens); Dynamic
Type; one-handed reach zones; consistency with PatinaDesignKit. Questions: (1) Reachability graph
of the home at each tier — every door, act-count, anything >2 acts. (2) Is the Companion carrying
nav weight a tab bar would, and where does it fail (discoverability, cost, hidden state)? (3) First
viewport per tier — work or chrome? (4) Cards, chips, rails: what looks tappable and isn't, and
the reverse. (5) Dark mode + XL type on the home, piece detail, Saved, room. (6) Where does motion
add meaning vs decoration? (7) Which screens own bespoke exits (quiz, product detail, AR, scan)
and is the exit obvious?

**U3 · Commerce UX — Opus.** Browse → save → decide → buy → track. Trust signals (price,
dimensions, materials, maker, lead time, shipping, returns, who is responsible); checkout paths
on iOS for **physical goods** (Stripe hosted Checkout in SFSafariViewController — the rail invoices
already use — vs Stripe PaymentSheet with Apple Pay — vs "order through your designer"); App
Store Review Guideline 3.1.3(e)/3.1.5(a): physical goods must NOT use IAP; order tracking and
post-purchase return loops; designer-attributed purchases (when a designer is engaged, the piece
belongs on their FF&E schedule and the commission/margin is theirs). Questions: (1) Trace the
purchase dead end today — verbatim. (2) Which trust fields exist on `products` and which are
shown. (3) Design the three purchase paths (direct, through-designer, quote) and say when each
applies by tier. (4) Minimum viable order state machine and where it lives (svc_orders? new
table?). (5) What Walt needs to see before paying $4,000. (6) Post-purchase: what brings someone
back after the order. (7) Apple Pay: available via hosted Checkout? Via PaymentSheet? Cost of
each.

## §5 Finding schema

```json
{ "id": "H1-04", "seat": "H1", "task_ids": ["T2","T11"],
  "key": "home|discovering|nothing-new-since-yesterday",
  "surface": "Daily Room", "tier": "discovering|engaged|activeProject|guest|all",
  "class": "return|purchase|trust|wayfinding|content|reach",
  "title": "Nothing on the home changes day to day",
  "observation": "verbatim what is on screen — labels quoted exactly",
  "why_it_matters": "one sentence tying it to return or purchase",
  "evidence": { "shots": ["g-03-home-discovering.png"], "refs": ["apps/mobile/Patina/Patina/Features/Home/Views/DailyRoomView.swift:120-160"] },
  "severity": "S0|S1|S2|S3", "confidence": 0.85,
  "already_ruled": null, "july_status": null,
  "proposal_seed": "one line, one move" }
```
Rules: `severity` S0 = breaks return or purchase or trust (funnel break); S1 = major friction;
S2 = hesitation; S3 = polish. `confidence` < 0.5 must append "what would settle this".
`already_ruled` cites R#/U#/C# — still a valid finding, but Lane A cannot spend it. `july_status`
cites the DELIVERY.md row if the item overlaps U01–U46 (regression vs residual vs new). `key` =
`surface|tier|kebab-slug` so identical findings collide across seats. No `task_ids` → drop.
`evidence` needs at least one of shots/refs. Quote labels verbatim.

## §6 Canon guard (authors before drafting; verifiers before judging)

| # | Ruled / standing — do not silently re-propose | Where |
|---|---|---|
| C1 | No tab bar; Studio home-hub rail + Companion ARE the nav. Re-evaluation was scheduled "post-Track-D" and U25 logged tab-bar evidence without litigating it | R29 (alignment deck), U25 |
| C2 | Home is marketplace-first with 3-tier progressive disclosure; projects/messages not front-and-center for a new user; morphs as a designer is engaged | Kody 2026-07-14; `EngagementTier.swift`; `DailyRoomView.bottomSection(tier:)` |
| C3 | Editorial feel of the Daily Room (story card, greeting, room feed); room scan stays prominent | Kody 2026-07-14 |
| C4 | Canonical names per July glossary (§0) — one verb for the designer CTA ("Get design help"), one name for Saved, "Browse pieces" | `docs/design/ios-ux-review-2026-07/glossary.md`, U08/U09 |
| C5 | Honesty: no fabricated stats or match numbers, no "Suggested next", no dead controls; errors rendered; tier never demotes on failure (promote-only) | U02/U04/U05/U29/U43/U45 |
| C6 | Brand voice: technology silent, designers = intelligence layer, Midwest, no luxury haze, no AI framing | `patina-brand-voice` |
| C7 | Tokens: Vision palette via PatinaDesignKit (`Tokens/PatinaColors.swift`), Playfair Display / Inter / DM Mono, dynamic dark mode, Reduce Motion gated; camera/AR/companion chrome deliberately dark | R27/R28, June Wave 3 |
| C8 | Companion = living orb with coaching phases (new → learning → learned), ≤6 rows per route context, "NEXT STEPS" label decays; intro sequenced after the first-launch tour | Living Companion 2026-07-21, U34/U41/U42 |
| C9 | Auth = Supabase only; passwordless-first + soft wall; guests browse; the auth sheet presents over context and never ejects | U21, `4a59a27c0` |
| C10 | Money rail exists client-side: proposals (sign via `sign_proposal` RPC), invoices (Stripe hosted Checkout in SFSafariViewController + 3s/60s poll-on-dismiss), budget, documents, decisions | R30, alignment Waves 2–3 |
| C11 | **Direct orders are a ratified backlog item**, sequenced reviews → scope changes → direct orders → GDPR. Not yet designed. "IA-only, no in-app checkout" was the *scope* of the July home rework, not doctrine | R32; `project_ios_marketplace_first_home` |
| C12 | Room scan = RoomPlan/LiDAR on device; non-LiDAR fallback = manual room entry that persists | U40 |
| C13 | No new NestJS services; new backend = migrations + edge functions; realtime = publication or broadcast; pg_cron for scheduled work | root CLAUDE.md |
| C14 | APNs push send is a backend stub; polling floor is the live mechanism (R30 poll-first, deep-link fast-follow if dead) | R30, nav program |
| C15 | Physical goods must not be sold through Apple IAP; external payment (Stripe) is the compliant rail. Digital services (a design consultation) are a separate question — name it if you touch it | App Store Review Guidelines 3.1.3(e), 3.1.5(a) |
| C16 | Feature flags are PostHog, fail-closed; `--uitesting` resets auth and disables flags | reference_feature_flags |

### §6b Post-grounding corrections and additions (2026-08-26, after W1a)

G2 corrected C8/C9/C10/C12 and added C17–C22 in `research/11-canon-digest.md` §6 — read that
section as part of this guard. The rows below come from G1/G3/G5 and override anything above
that contradicts them.

| # | Standing fact | Where |
|---|---|---|
| C23 | **The shipped home is Option B's "Today"** (commit `126e59a11`, 2026-07-29): four modules at every tier — date + "Today" header, one Next Move, one editorial story, one Active Room — under the contracts in `apps/mobile/Patina/OPTION_B_ACCEPTANCE.md` (Companion collapsed by default as the relationship layer; Today = exactly one next move, one real story, one active room, truthful fallbacks; Studio grouped by attention). The July tier-gated marketplace-first rail (C2/C3: StudioHubSection, MarketplaceLinksSection, WorkWithDesignerCTA, RoomChipRail, DailyProductCard, AddToRoomSheet…) is **orphaned in code, not ruled over** — it is one mount away (`DailyRoomStateBlocks.swift:25`). Treat the C2-vs-C23 conflict as an **open ruling for Kody**: Direction A may re-mount orphaned rail pieces only where Option B's Today contract permits and must name the conflict; Direction B may amend either. No finding may assume Option B was a mistake — it was accepted. | `research/10-code-anatomy.md` A1/A2, `OPTION_B_ACCEPTANCE.md` |
| C24 | **Direct orders exist on the backend** — `public.direct_orders` (00276), `create_direct_order` RPC, `create-checkout-session` dispatches on `direct_order_id`, `stripe-webhook` settles + emails receipts. Zero iOS client code. Status vocabulary is only `pending_payment / paid / canceled` (+ `refunded`). **No designer attribution**: no designer_id / project_id / commission / FF&E link (`00301_marketplace_vitals.sql:37-40` says so). The attribution decision is open and free to make now. | `research/12-backend-reality.md` §5, §12; `17-gap-fills.md` G3 |
| C25 | **Apple Pay is already inside the Checkout the app opens** — `payment_method_types` includes `card`, the container is SFSafariViewController (Apple Pay on the Web works there; WKWebView would not). Empirically unproven on a device. PaymentSheet would cost a new SPM dependency, merchant-id entitlement, a new backend mode, and re-doing ACH/surcharge/poll settle. | `17-gap-fills.md` G2 |
| C26 | **Push send is real, not a stub** — `apns-send` is complete and provisioned on Strata (APNS_* secrets since 2026-07-16); `device_push_tokens` live; five callers (three design-request SQL triggers + `fulfillment-notify` + `site-request-dispatch`). **None** fires for proposals, invoices, decisions or direct orders. `fulfillment-notify` can push confirmed/in_production/shipped/delivered/eta_change/substitution but only when an admin operator sends it, and only on the BOH `fulfillment_orders` rail. Adding a trigger = one `invoke_edge_function` call site. Corrects C14. | `17-gap-fills.md` G1; `12-backend-reality.md` §6 |
| C27 | **Local-environment defects are not app findings**: the local OTP mail carries no 6-digit code (template server 404 — sign in with password `password123` for the walk accounts); iOS's "Save Password?" system sheet after sign-in; **every local edge function returns 503** (edge runtime cannot boot a worker) — so `companion-context`/`companion-message`/`morning-brief`/`create-checkout-session` were dead in the walk: the Companion's server-backed replies and the "Pay $4,250" → Checkout handoff could not be seen (c-14 shows the failure copy, not the product); `user_settings`/`notification_preferences` 406; the stack was booted from a deleted worktree path; the simulator keychain outlives app deletion (a walk artifact, not a product behaviour). Never write these up as product defects. **Genuinely app-side and fair game** (verify against migrations on main before calling it shipped): the product-detail `PGRST201` ambiguous `vendors(...)` embed (`ProductAPIClient.swift:99` — `products` has two FKs to `vendors`); the guest's device-scoped local store being adopted by whichever account signs in next. | `research/02-steward-boot.md` §7–8; `03-walk-observations.md`; `17-gap-fills.md` G6 |
| C28 | Honesty candidates the grounding already found (fair game, cite them): story unread dot hard-coded `true`; `usdz_url` always NULL so AR never renders; `dimensions` exists but is never returned/decoded; `lead_time_weeks` column exists but is unpopulated for the catalog layer; boards can be created but never hold a piece; room-scoped Saved always empty; re-saving duplicates rows; tour step 2 anchor mounts nowhere; no widget/App Intent/Live Activity/associated-domains; notification permission asked once, only after a design request, with no pre-permission copy. | `research/10-code-anatomy.md` key facts |
| C29 | Walk accounts: `client@patina.dev` = activeProject (3 projects, 4 proposals/0 signed, 6 decisions, **1 open invoice INV-2026-0142 $4,250 seeded for this review**, 0 rooms); `james.okafor@example.com` = engaged (1 accepted lead, matched designer). Local catalog: 21 products (17 with images), 7 categories, 104 vendors, 3 editorial stories. No prod counts and no usage data were available to this review. | `research/12-backend-reality.md` §8–10 |

## §7 Direction constraints

Each direction is a document (`source/direction-a.md`, `source/direction-b.md`) with these
sections, in this order:
1. **Name + thesis** (one sentence) and **the day it is built around** — say what is on the first
   screen at 7:40am (Walt), 12:30pm (Ruth), 9:10pm (Maya), and after two weeks away.
2. **Home composition per tier** (guest · discovering · engaged · activeProject) — what mounts,
   in what order, what is new day to day and *why it is honestly new*.
3. **The investment the app remembers** — and where it shows on return.
4. **Return surfaces beyond the app** — notifications (what earns the permission; what the backend
   can send today vs after which delta), widgets/Lock Screen/Live Activities, email.
5. **The purchase path** — direct / through-designer / quote, by tier; the order state machine;
   where money is taken (hosted Checkout, PaymentSheet); what Walt sees before paying; what D3
   sees after; Apple compliance.
6. **The designer in the client's home** — how the designer is visible, credited, protected.
7. **Findings answered** — table finding id → what changes.
8. **Amendments** (Direction B only): `B-n amends C# — what · why (finding ids) · cost · rollback`.
   Direction A must list zero amendments and say where it *declines* to go and what that costs.
9. **First slice** (≤ 2 weeks, one iOS engineer + edge functions) → **waves** → backend deltas
   (tables, RPCs, edge functions, crons) → **risks** (Apple review, data, perf) → **rollback**.
10. **What it deliberately does not do.**
Sticky ≠ manipulative: no streaks-for-streaks, no fake urgency, no dark patterns. Variable reward
comes from real events (new pieces from makers, designer activity, room progress, seasons, the
piece's story). Every screen the direction names must be drawable as a mock (§9).

## §8 Judge rubric

Three judges score separately; scores are never averaged across judges.
- **J1 · Homeowner return** — for each of H1/H2/H3: "would they open it tomorrow?" 0–10 with the
  screen that earns it; the 7:40am / 12:30pm / 9:10pm test; two-weeks-away test; honesty of the
  reward. Total /40.
- **J2 · Purchase & designer trust** — would D1/D2/D3 send clients here (0–10 each); is the
  purchase path compliant, attributable, and trustworthy for a $4,000 piece (0–10). Total /40.
- **J3 · Feasibility** — first-slice realism (0–10), backend deltas vs C13 (0–10), Apple review
  and data risk (0–10), rollback (0–10). Total /40.
Each judge lists grafts: what the losing direction has that the winner should take.

## §9 Mock + screen-sheet spec

- Phone frame: **402×874 CSS px** (iPhone 17 Pro logical points, matches the shots), Dynamic
  Island, status bar "9:41", home indicator, safe areas honoured. Drawn in HTML/CSS only — no
  raster mock art; product photography = real seed images already in the repo or the shots, or an
  honest placeholder tile with a maker/material label.
- Tokens from PatinaDesignKit (`Tokens/PatinaColors.swift`, `PatinaTypography.swift`,
  `PatinaSpacing.swift`) — G1 produces the table in `research/16-token-table.md`. Fonts via Google
  Fonts (`Playfair Display`, `Inter`, `DM Mono`) with real fallback stacks; the deck build inlines
  nothing heavier than that.
- Each direction: at least six screens — (1) home at discovering, (2) home at activeProject,
  (3) piece detail with the purchase/ask acts, (4) the room, (5) the purchase flow (order sheet →
  payment handoff → order placed), (6) the return moment (a notification or widget + what greets
  you). Shared planks get their own mocks where they are visual (e.g. widget, notification
  permission moment). Dark variants for at least the home and the piece detail.
- **Screen sheet** (the "UI screen details" Kody asked for), one per mock, rendered beside it:
  purpose · entry points · components (existing `Features/…` view vs new) · copy verbatim ·
  data source (table / RPC / edge function) · states (loading / empty / error) · interactions +
  analytics event names · tier behaviour · what is new vs today.

## §10 Deck outline + design plan

Sections: cover · the ask + assumptions (simulated panel, evidence level) · the app today (anatomy
in one picture; shot strip) · the panel (nine seats, one line each) · what we found (themes, shots,
seat quotes, finding ids) · why people would return (the honest rituals) · why people would buy
here (Apple rule, designer margin, trust) · shared planks · Direction A + mocks + screen sheets ·
Direction B + mocks + screen sheets · the purchase path (both) · compare + judges · recommendation
+ sequence · ten questions for Kody · colophon (evidence, run ids, what is simulated).

Design plan (deck chrome, distinct from the mocks which use the app's own tokens): the deck's
structure is **a day** — Morning · Midday · Evening · Two weeks later — because time-of-day *is*
the thesis; use it as the section spine and encode it in the eyebrow, not with numbered markers.
Palette from the app's ground (`#FAF7F2` off-white, `#2C2926` charcoal, `#5C4A3C` mocha,
`#C4A57B` clay) plus one deck-only ink for evidence captions; light and dark both designed. Type:
Playfair Display (display, restrained), Inter (body), DM Mono (labels, data). Phone mocks are the
hero; shots sit in an "evidence" register that is visibly different from the "proposal" register.
No emoji markers, no accent rails on rounded cards, no everything-centered.

## §11 Honesty rules for the deck

- The panel is simulated. Say so on the ask page and in the colophon. Seat quotes are synthesized
  reviews, never "customer research."
- Evidence levels are labelled per claim: **sim-verified** (a shot) · **code-read** (file:line) ·
  **inferred**. Camera/LiDAR/AR claims are code-read only in this program.
- No invented usage numbers. If PostHog/App Store data is unavailable, the deck says "no usage data
  was available to this review" rather than estimating.
- No figure in a mock that the seed does not contain unless labelled as example copy.
- Every finding id in the deck resolves to `research/31-verified-findings.json`.
