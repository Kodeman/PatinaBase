# Arrival → production: design-panel brief

Orchestrator: Fable. Date: 2026-09-27. Program: US-14 production delivery.
Recon reports (read all eight + the critique before proposing):
`artifacts/arrival-production-2026-09-27/research/{desk-surface,document-surface,briefing-data,flags-gating,gates-deploy,engine-spec,doctrine-rulings,environment,critique}.md`
Source of truth for behaviour: the mockup engine at main `7dbd203bc`,
`artifacts/designer-portal-motion-2026-09-25/design/cinematic/arrival.{js,css}` and the ARRIVAL v3
MERGED CONTRACT (Sidequest SQ-333 comment; CLI: `node /Users/kody/.claude/plugins/cache/eigenwise-toolshed/sidequest/5.3.2/bin/sidequest.js comments SQ-333 --project /Users/kody/Code/patina-merged --json --full`).

## Kody's rulings (fixed — do not re-open)

1. **No feature flag. 100% of production on first deploy.** No PostHog flag, no per-user gate, no
   env kill-switch dressed as a flag. The engine's own guard ladder (CSS sentinel, `fonts.check`,
   budget, reduced-motion card layer, "failure = the ordinary page") is the in-product safety; the
   rollback lever is a Cloudflare redeploy-prior-good. `?arrive=0` may survive **only** as an e2e/test
   seam, never documented to users.
2. Every open R-DM ruling (R-DM18–38) ships as the **option-A build** already in the mockup.
3. An arrival plays on the Desk and on every Document. Any input advances; Escape advances; Skip
   is the only path straight to rest; Tab/lone modifiers do not advance (SQ-333 O1).
4. Voice/doctrine constraints in `doctrine-rulings.md` §(a) 1–16 are binding. No "AI", no lure,
   preview rule (T3: nothing exclusive to the card), one SR announcement, reduced-motion floor.

## Outcome

The production designer portal (`apps/designer-portal`, Next 16 App Router, React 19, Cloudflare
Worker via OpenNext, Supabase Strata) opens the Desk (`/desk`) and every Document (`/doc/[id]`)
with the arrival v3 choreography, driven by **real data**, on every unanchored open, for every
designer, on desktop and phone, with the exact input model, guard ladder, reduced-motion path and
failure model of the mockup. Verified by (a) unit tests on the pure selection/gate, (b) a Playwright
lane against a local production build (`next build --webpack && next start`) that ports the
real-Chromium lane B1–B13 assertions to the portal's real routes, (c) the designer-portal type/lint/
jest gates, (d) a deploy through `./infra/deploy-portal.sh designer` and a live probe.

## Non-goals

- No change to the client portal, admin portal, iOS apps, edge functions, or NestJS services.
- No new need rules beyond what the contract names; no redesign of the Desk or Document at rest.
- No engagement telemetry (dwell, delight, replay counts). Constraint 10.
- No first-hand/onboarding branch (R-DM7 A).
- No mockup-only chrome (replay buttons, `.mc` panel, `?rm=1`/`?scale=0`, fixture JSON).

## The contested seams — propose on every one of these, S1–S8

**S1 · Where the headline comes from.** `briefing-data.md` §0 shows production already computes
"the one sentence" on both surfaces: the Desk's first claim card (`deriveDeskClaims`, band → oldest
dueOn → name) and the Document's `LensBand` line 2 (`redLetterRows` from `rankOperationalNeeds`).
The mockup's `select()` re-ranks with its own comparator (band → NEED_RANK → oldest → kind → section)
over an invented 11-kind vocabulary. Options: (a) the arrival **lifts the page's own sentence** and
its act (T3 holds by construction; one comparator; the real 20 `NeedKind`s flow through untouched);
(b) port `select()` and key it on real `NeedKind` with a presentation map; (c) an adapter from real
kinds to mockup kinds. State which nodes carry `data-part="headline|act|act2|f1|f2|f3|name|stage|
crown|job|warn|head|settle"` on each surface, by file:line, and how R2/R5 ("Overdue N days:" prefix,
≤8 words), R1 (paused), R3/R4 (quiet) and the Desk brief form are produced from production fields.

**S2 · The since line (F2) and the anchor.** No per-designer visit record exists (R-DM19). Options:
(a) migration `006NN_arrival_anchors.sql` (draft in `briefing-data.md` §3) + `mark_arrival` RPC +
a SECURITY INVOKER `arrival_changes(p_since, p_engagement_id)` union reader over the high-confidence
sources in §2 (decision_events, coordination_item_revisions, comms_messages, project_notes,
sms_messages, install_windows.confirmed_at, schedule_revisions), hook in `@patina/supabase`;
(b) anchor via RPC now, changes reader deferred: F2 prints "First visit." on no anchor and is
**omitted** (slot filled by the next fact) when an anchor exists but no reader — never "Nothing new
since …" that could be false; (c) no DB work in v1: F2 slot carries the second need / milestone.
Weigh truthfulness under RLS holes (co-members can't see `decision_events`, 00584) against the
"bring her up to speed in seconds" value. Note: the 30-minute visit window for *suppression*
(one arrival per visit, Desk once per visit) stays in sessionStorage per the mockup regardless.

**S3 · Port strategy and mount.** `engine-spec.md` §8 recommends (A) a typed near-verbatim port:
`select.ts` (pure), `gate.ts`, `engine.ts`, mounted by one `<Arrival>` client component. Pin: module
location (portal-local `src/lib/arrival/` vs a package), the `K` host adapter surface for the
portal (sheet/overlay open state, unsaved drafts, reduced motion), listener target (`window`
capture — React 19 attaches to the root container), the `data-arr-skip` exclusion list (TesterWidget,
DebugPanel, toasts, ⌘K, LogStrip, MobileBar…), `unwire()` on unmount/pathname change, StrictMode
double-effect handling, and how `fonts.check` is built from `next/font` family names.

**S4 · Pre-paint hide and the budget.** The mockup hides the body (`arr-pre`) from the first byte
and declines at 1500 ms from `timeOrigin`. In production: both routes are `'use client'`, data
arrives after hydration, the Document shows "Picking up…" until resolved, and Desk→Document is a
soft navigation with no `load`. Options for the hard load: a parser-blocking inline `<script>` in
the root layout that sets `arr-pre` for `/desk` and `/doc/*` (with the sessionStorage gate) + safety
timer; or no pre-paint hide (the ordinary skeleton paints, then the card composes over it); or
hide only from the route component's first commit (`useLayoutEffect`). Pin the **ready signal**
(data resolved + marked nodes mounted + fonts) and the **budget** for hard vs soft entries (what
number, measured from what, and what the user sees while waiting — bare paper vs skeleton). Pin
what happens on the Desk when `useDeskEngagements` takes 2–4 s on a cold Strata read.

**S5 · Landing geometry on the real DOM.** The engine measures rects before frame 0 and animates
the page's own nodes; `collect()` walks the DOM for parts (cap 12 desktop / 8 phone). The real
Document renders one active section + settled bars + letterhead + spine (hidden <1180px) + LensBand;
the real Desk renders header + roster head + claims grid + ledger + strips. Pin: which containers
are the assembly field, how `readingY` is computed without `.spine`, how the spine's own
`overflow-y-auto` and Tailwind `overflow-x-hidden` interact with `arr-on`, what `finish()`es when
React re-renders a kept node mid-flight (60 s refetch, late sub-hooks), and how the entry-move
collision (`doc-raise` on the Document grid, `desk-settle` on cards) is resolved: the arrival
replaces them and they become the `decline` path.

**S6 · Phone and put-down.** <1180px the spine is hidden and replaced by MobileBar/sheets. Pin the
phone card (flush-left, s=1), the phone reading position without a spine bar, the put-down target
the Desk's `pl-from-doc` scroll uses, and that touch-scroll after Act 3 is native.

**S7 · Verification lanes.** Pin the exact commands per piece: `pnpm --filter @patina/designer-portal
type-check | lint | test -- <file>`; a new Playwright spec `apps/designer-portal/e2e/arrival/*.spec.ts`
run `--project=chromium` against `next build --webpack && next start -p 3000` with local Supabase
(never `next dev` — Watchpack EMFILE under agent load), which B1–B13 assertions port and what seed
data they need (name the seeded engagement(s) or the seed change required); a vitest/jest suite for
`select.ts`/`gate.ts` porting the vm oracle's T2–T7 budgets and the shuffle/one-day-later tests.

**S8 · Rollout without a flag.** No flag exists. Pin: the deploy recipe (trio export from
`wrangler.jsonc` in the same shell + `./infra/deploy-portal.sh designer`), the live probe (served
chunk grep for a marker string, e.g. `arr-ok`; deployments list bottom row; a signed-in walk
recorded via the Chrome tab), the rollback (`npx wrangler rollback <prev id> --name
patina-designer-portal --yes` **only if verified live this session**, else redeploy prior SHA), and
the one telemetry event allowed (a task question: how the arrival ended — `skip|timer|key|pointer|
focus|decline`, no durations).

## Hard facts every proposal must respect

- Disk: ~49 GiB free; a full worktree costs ~15 GB. **At most 3 concurrent build worktrees.**
  Propose the piece split accordingly (a wave-1 shared-surface piece, then ≤3 parallel pieces).
- Migration numbering head on disk `00674`; next `00675`, provisional until merge.
- `PATINA_ALLOW_LOCAL_PROD_DEPLOY` does not exist; the deploy gate is procedural (in-session ask —
  granted).
- Fonts are `next/font` (Playfair Display, Inter, DM Mono) with hashed family names on `<body>`.
- `reactStrictMode: true`; root layout `<html suppressHydrationWarning>`.
- `arrival-arc` is a live flag for the Match Ceremony — never reuse the name for anything.
- Desk cards use `desk-settle` once per session; Document grid uses `doc-raise`/`doc-fade`.
- `next build --webpack` is the committed build; Next `~16.2.6`.
- Only designer-portal's lint config resolves; its type gate is `type-check`, not `build`.

## Deliverable (each proposal, ≤ 2,500 words, written to the path you are given)

1. One paragraph: the spine of your approach and what it optimises for.
2. S1–S8, each: the decision, the concrete seam (signatures / file paths / DOM marks / SQL), the
   verify command, cost (S/M/L), and what it forecloses.
3. Piece split: wave 1 (shared surface, one worktree) → wave 2 (≤3 parallel pieces), each with
   file boundaries (explicit pathspecs), the shared types it consumes, and its scoped verify.
4. Risks you would refuse to ship without closing, with the evidence that closes them.
5. Design-reopen evidence: what finding would invalidate your proposal.

Do not write code under `apps/` or `packages/`. Read anything. Cite `file:line` for every claim
about the portal.

---

## Addendum after the critique (`research/critique.md` — read it in full; it overrides the above where they differ)

Corrections to the seams above:

- **S1**: 19 `NeedKind`s, not 20 (`desk-derivation.ts:109-138`). R143 (`DECISIONS.md:10856`) makes the Desk a
  hybrid — a claim takes a card, a quiet job takes a line — so the Desk headline carrier is the **top Claim
  card's sentence** (`desk-claim-card.tsx:170-181`), never a ledger row. Three rankers exist today
  (`deriveDeskClaims` band→dueOn→name; the Document's `rankOperationalNeeds`; the mockup comparator with a
  kind rank). Rule which one wins on each surface and why the card and the page can never disagree.
- **S2**: R-DM19 option A is ruled (a per-designer anchor ships). Contest only the **changes reader** scope
  and the honest degradation when the viewer's RLS view is thinner than the owner's (co-members cannot see
  `decision_events`, 00584; `sms_messages.party_id` is not a user id so `by ≠ viewer` cannot apply). The
  anchor must key on the engagement chain so signing does not reset "since" (`00590:62,224`: project
  `engagement_id = p.id`, proposal = `pr.chain_root_id`). Order the RPC honestly: a SELECT on mount for the
  anchor and `mark_arrival` after the arrival settles, or the RPC on the critical path — pick and justify.
  RPC writes happen for every designer (no flag).
- **S3**: production `busy()` predicate = `document.querySelector('[role="dialog"]')` + `isEditableTarget`
  + `openShelf` (`page.tsx:1377-1380`) + an open DeskWalkthrough / Desk-arbiter MarginNote / teaching note
  (R-DM7, critique R15). Escape: the Document's put-down listens on `document` keydown **bubble**
  (`page.tsx:1370-1389`); the engine must `stopPropagation` from `window` capture during compose/hold, with
  a regression test (critique R6). `useDeskEngagements` has a **60 s `refetchInterval`**
  (`use-desk-engagements.ts:179`) — the MutationObserver→`finish()` guard is mandatory.
- **S4 (the central question)**: pin the **play matrix** — hard load (sign-in lands on `/desk` by
  `window.location.replace`, bookmarks, refresh), soft entry (`next/link` Desk→Doc), `router.replace`
  redirect (proposal→project after signing, `page.tsx:1266-1271`, which also fires `markSealTurn`),
  popstate/BFCache, same-document query change. Kody's ruling stands: the Desk plays once per 30-min visit;
  **every Document opens with an arrival** (the mockup's per-open rule; act-band links bypass per R-DM21).
  The morning open **must play**: define the budget from data-ready, not `timeOrigin`, and say what she
  sees while data loads (bare paper vs skeleton vs "Picking up…"), for how long at most, on a cold Strata
  read of 2–4 s. `arr-pre` must never hide the persistent chrome (CommandBar, MobileBar, TesterWidget) on
  a soft entry — hide the route content, not `<body>`, or add it only once the Briefing is ready.
  Say whether an inline pre-paint script in the root layout is still needed at all under your model
  (prod CSP allows `'unsafe-inline'`, `next.config.js:88-89`; note the fragility).
- **S4b · Addresses that decline**: `/desk?book=…|account=…|authorization=…` (DeskDoorway,
  `desk-doorway.tsx:13-24`, incl. the Stripe Checkout return `?book=orders&checkout=success`),
  `/doc/[id]?sheet=call`, `?ffeItemId=`. Enumerate the `useSearchParams` consumers under `(document)` and
  pin the decline list. **R-DM21 without a hash**: most Desk acts go to the same `/doc/{id}` URL as the name
  link (`desk-roster-derivation.ts:394-402`; others open a sheet or go to `/drafting/…?flagged=1`,
  `/ceremony/…`). Pin the click-time token (`pl-arrive`-style) and the landing call
  (`jumpToRegion`/`landOnFfeAnchor`/`jumpToSection`) that replaces `#rec`.
- **S5**: production renders **one active section** + SettledBars + letterhead + LensBand + spine. Define
  "assembles into the page" under that model. Crown: the rail is `hidden` <1180px (`doc-spine.tsx:140`);
  mark the letterhead StrataMark second in DOM order so `part()` finds it on phone. Competing entry
  moments needing a precedence rule: `desk-settle`, `doc-raise`, `markSealTurn`, Match Ceremony
  (`arrival-arc`), DeskWalkthrough, Desk-arbiter MarginNote, Return Teaching notes.
- **S6**: mobile put-down exists (`mobile-sheets.tsx:606-610`). Timezone: the engine compares UTC
  midnights; find the studio's zone source (`fmtDayTime` timezone arg, `desk-derivation.ts:522`) or rule
  that `today` is the browser-local date.
- **S7**: designer-portal's unit runner is **jest** (`package.json:18`), not vitest; jsdom has no
  `Element.animate`, so jest covers `select`/`gate`/`briefing` only and the engine is proven in Playwright.
  **36 existing e2e specs hit `/desk` or `/doc/*`** — with no flag, the first-click swallow and
  `pointer-events:none` until Act 3 will break them. Pin the test seam: a separate Playwright
  config/project + port for the arrival lane, and for the existing suite one of: a shared `addInitScript`
  fixture setting a sessionStorage kill; `?arrive=0`; declining under `navigator.webdriver` unless a
  sessionStorage opt-in is set. State the trade-off (the third also hides the arrival from any automation).
  Seed data: name which seeded engagement(s) give the Desk a claim and a Document a need, or the seed change.
- **S8**: the telemetry event carries **no duration** (`held_ms` is a dwell measurement — dropped).
  Migration: reserve `00675` in `docs/engineering/migration-number-reservations.md` as the DB piece's first
  act; `supabase migration list --linked` must show only 00675 pending before push (`--include-all` may be
  required because of the stray `20260910152111_*` file). Apply locally with `supabase migration up`, not
  a reset (shared Postgres). Every local build/e2e exports the **local** trio explicitly (`.env.local` may
  point at Strata; a local `next start` against prod would write `arrival_anchors` rows into prod).
- **Fonts (critique R13)**: `FACES` must be built from `next/font` `.style.fontFamily`; otherwise the
  arrival always declines and nobody notices. The Playwright lane must assert that the arrival **plays** on
  a warm soft entry and on a simulated cold Desk open.

Baseline wave plan to refine (critique §4): W0 preflight → W1 three disjoint worktrees (A: migration +
`@patina/supabase` hook; B: engine port + jest; C: briefing adapters + presentation map + analytics) →
W2 single-owner integration (`app/layout.tsx`, `(document)/layout.tsx`, `desk/page.tsx`,
`desk-roster.tsx`, `desk-claim-card.tsx`, `doc/[id]/page.tsx`, `doc-spine.tsx`, `doc-letterhead.tsx`,
LensBand) → W3 Playwright arrival lane + existing suite + adversarial review → W4 ship gated on clean
review. Challenge this split where you can show a better one; otherwise refine the file boundaries and
the frozen `types.ts` that B and C share.
