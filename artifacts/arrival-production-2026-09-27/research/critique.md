# Recon critique: project arrival, production build

Completeness critic, read-only, 2026-09-27. I read all 8 reports in full: desk-surface, document-surface, briefing-data, flags-gating, gates-deploy, engine-spec, doctrine-rulings and environment. Claims marked **[checked]** were confirmed by me at the file:line given.

## 1. Contradictions between reports

| # | Topic | Report A | Report B | Resolution |
|---|---|---|---|---|
| C1 | Deploy argument | environment: `./infra/deploy-portal.sh designer-portal` | gates-deploy: `./infra/deploy-portal.sh designer` | **`designer` is correct** [checked `infra/deploy-portal.sh:6,26-29`: usage `<client\|designer\|admin\|manufacturer>`]. The environment recipe fails. |
| C2 | `PATINA_ALLOW_LOCAL_PROD_DEPLOY` | environment: a live safety gate that "should stay unset unless a deploy step requires it" | gates-deploy: exists nowhere; no hook reads it | gates-deploy is right. Drop the variable from the contract. |
| C3 | Local rendered verification | environment: `pnpm dev:minimal` | gates-deploy: `next build --webpack && next start -p 3000` (dev EMFILEs under agent load) | Use build + start. `dev:minimal` also boots 3 NestJS services the arrival does not need. gates-deploy's recipe does `cd /Users/kody/Code/patina-merged`, the **main checkout**. It must run in the worktree. |
| C4 | Unit-test runner | engine-spec: "port T2–T7 … to **vitest**" | gates-deploy: designer-portal runs **jest** via next/jest | **jest** [checked `apps/designer-portal/package.json:18` `"test": "jest"`]. jsdom has no `Element.animate`, so jest covers only `select.ts` and `gate.ts`. `engine.ts` can only be proven in Playwright. |
| C5 | NeedKind count | briefing-data: 20 kinds (:109-139) | document-surface: 19 | **19** [checked `desk-derivation.ts:109-138`]. Small, but the presentation map must be total over 19 kinds. |
| C6 | Next version | desk-surface: reasons about "Next 15 default prefetch" | gates-deploy: `~16.2.6` | **16.2.6** [checked `package.json:68`]. CLAUDE.md's "Next.js 15" is stale. Prefetch and soft-navigation reasoning must target 16. |
| C7 | Mount point | desk-surface: Desk-only, inside `desk/page.tsx`. Use the `(document)` layout sibling list only if Documents also play. | engine-spec: a thin `<Arrival>` on **both** `/desk` and `/doc/[id]`, plus a raw inline head script in the **root** layout | Unresolved scope: see Q1 in §5. The inline head script must sit in the root layout either way, because only it runs before first paint. |
| C8 | Headline / card source of truth | document-surface: reuse LensBand line 2 (`redLetterRows` via `rankOperationalNeeds` from `@patina/utils`, `guideModel.headline`) | briefing-data: key on `NeedLine` from `partitionDesk` / `selectOperationalNeedsForDocument`. engine-spec: `select()` renders **both** page and card (T3 by construction). | Three answers and three rankers: shipped `deriveDeskClaims` sorts band → dueOn → name; the mockup comparator sorts band → **kind rank** → date → kind → section; the Document LensBand uses `rankOperationalNeeds`. Contested: see Q2. |
| C9 | f1/f2/f3/act part mapping | engine-spec: f1 = position line, f2 = margin-note row, f3 = custody line, act = the need's action control | document-surface table: f1..f3 = ticket rows / money-ladder rungs, **act = spine section labels (nav words)** | engine-spec is right about the engine's semantics (`act` is the need's doorway control; JS:406, 738). document-surface's table misreads the mockup, so the contract should not use it. |
| C10 | Crown node | engine-spec: `svg.sm.active` inside the spine stage | document-surface: StrataMark in `data-spine-mark` (rail) **or** letterhead (`doc-letterhead.tsx:67`) | The rail is `hidden` below 1180px (`doc-spine.tsx:140`), so on phone and tablet the crown must come from the letterhead mark. `part()` takes the first *rendered* match, so marking both works if the letterhead comes second in DOM order. The contract should say this. |
| C11 | Arrival cadence | doctrine constraint 14: "**one arrival per visit**, only on an unanchored open" | engine-spec / mockup: the Desk plays once per visit, and **Documents play on every non-late, non-back load** | engine-spec matches the code [checked `arrival.js:34-49`]: only `page==='desk'&&pl-desk` suppresses a same-visit replay. doctrine's constraint 14 overstates it. This matters much more under soft navigation (R1 in §3). |
| C12 | Analytics | flags-gating: `arrival_advanced {reason, held_ms}` | doctrine constraint 10: "never measure dwell or delight", and instrumentation "must answer a task question, not a stickiness one" | `held_ms` is a dwell measurement. Either drop it, or have Kody rule that it answers a task question (did the hold block her?). Do not ship it silently. |
| C13 | PostHog targeting precedent | flags-gating: target `distinct_id = 74056c2a-…` | MEMORY (return-teaching): the owed `teaching-notes` spec is `email_domain = kochaver.com` | Both would work, but they fail differently. flags-gating gives Kody's email as `kody@kochaver.com` (from a repo doc); this session's account email is `kody@thesaunabuild.com`. Confirm which Supabase user Kody signs in with before hard-coding an id or a domain. |
| C14 | Kody's studio | flags-gating: repo doc says Kody owns "Middle Studio" (`bb1d4d5a…`) and is **not** in Middle West | task brief: Middle West | Unresolved. It only matters if the gate or the Desk `studio` place-line is studio-scoped. |
| C15 | R143 | document-surface: couldn't find it | doctrine: cites R143 as "Desk needs and the day's line" (mandatory floor) | R143 [checked `DECISIONS.md:10856`] is "**The Desk is a hybrid — a claim takes a card, a quiet job takes a line**". The Desk headline carrier is therefore the top **Claim card's** sentence (`desk-claim-card.tsx:170-181`), not a ledger row. doctrine's gloss is loose. |
| C16 | Mobile put-down | document-surface gap: "not confirmed", "almost certainly needs its own" | — | **Exists** [checked `mobile-sheets.tsx:606-610`, "← Put down · back to the Desk", `router.push('/desk')`]. Gap closed. |

## 2. Gaps a contract author would still guess

For each gap: what's missing, then the cheapest way to get it.

1. **Which navigations play in production.** The mockup assumes hard loads. In production, Desk→Doc is a soft `next/link` navigation, and **sign-in is a hard `window.location.replace`** [checked `auth/signin/page.tsx:82,258`; `verify-otp/page.tsx:32`; `accept-invite/page.tsx:76`]. Nobody has specified the play matrix: hard load, soft entry, `router.replace` redirect (proposal→project, `doc/[id]/page.tsx:1266-1271`), popstate, and a same-document query change. *Cheapest: a design ruling (Q1), not more recon.*
2. **How the R-DM21 act-link bypass works without a hash.** In the mockup, the act link carries `#rec`. In production, most Desk acts go to `jobHref` (`/doc/{engagement_id}`), the same URL as the name link. The rest open a sheet (`openLedger`) or go to `/drafting/…?flagged=1` or `/ceremony/…` [checked `desk-derivation.ts:700,766`]. The URL cannot tell the two clicks apart. The contract needs a click-time token (like `pl-arrive`) plus a landing call (`jumpToRegion` / `landOnFfeAnchor`). *Cheapest: grep the ~5 act href builders in `desk-roster-derivation.ts:394-402`.*
3. **Query-param "addresses" must decline the arrival.** The mockup's hash rule has production equivalents that no report maps:
   - `/desk?book=…|account=…|authorization=…`, the DeskDoorway, which includes the **Stripe Checkout return** `?book=orders&checkout=success` [checked `desk-doorway.tsx:13-24`]
   - `/doc/[id]?sheet=call` and `?ffeItemId=` (`page.tsx:1102-1106, 1236-1239`)

   An arrival over a payment confirmation is the worst case. *Cheapest: enumerate the `useSearchParams` consumers in `(document)`.*
4. **Timezone for `today`.** The engine compares UTC midnights (JS:52-56). Production has a `timezone` argument in `fmtDayTime` (`desk-derivation.ts:522`) but no named source for the studio's zone. *Cheapest: grep `timezone` in `organizations` / `profiles` types and the caller of `fmtDayTime`.*
5. **The since line in v1.** The DB anchor (`mark_arrival`) is drafted. The **changes reader** (`arrival_changes`) is only proposed. It depends on `comms_messages` / `sms_messages` co-member RLS (not read), on `decision_events` being invisible to co-members (00584), and on `sms_messages.party_id` not being a user id, so the `by ≠ viewer` filter can't apply. *Cheapest: have Kody rule R-DM19 for v1 (ship the anchor only, with F2 reading "Nothing new since…" or omitted, versus the full reader). Then have one DB agent read 00101/00102 and 00640.*
6. **Production equivalents of `K.sheet.openId()`, `K.overlay` and `K.unsaved()`.** engine-spec found no unsaved-drafts registry. The Document's Escape handler uses `document.querySelector('[role="dialog"]')` and `openShelf` (`page.tsx:1377-1380`). That selector is a usable proxy for `busy()`. *Cheapest: adopt `[role="dialog"]` + `isEditableTarget` + `openShelf` as the busy predicate and state it in the contract.*
7. **Competing entry moments.** None of these are listed, and each needs a precedence rule:
   - `desk-settle` card stagger (once per session, `desk-roster.tsx:70-80`): a second Desk entry move. engine-spec named only `doc-raise`.
   - `markSealTurn` announcement after the signing redirect (`page.tsx:1269`)
   - Match Ceremony surface (`arrival-arc`)
   - `DeskWalkthrough` and the Desk-arbiter MarginNote (hire-handoff / first-touch)
   - Return Teaching notes (R-DM7)

   *Cheapest: grep the `(document)/layout.tsx` overlay list for auto-open conditions.*
8. **Strata migration state.** MEMORY disagrees with itself. The iOS entry says "00670/00671 pushed but NOT DEPLOYED"; the return-teaching entry says `db push --include-all` applied 00668–00674 on 09-26. A push of 00675 will drag any pending file with it. No report says that `--include-all` is now **required** (the stray `20260910152111_create_contact_messages.sql` sorts after 00674). *Cheapest: read-only `supabase migration list --linked` before the build wave.*
9. **Migration reservation.** `docs/engineering/migration-number-reservations.md` has entries only through 00671; 00672–00674 were never registered [checked]. No 00675+ exists on any ref or sibling worktree [checked `git log --all`]. *Cheapest: reserve 00675 in that doc as the first act of the DB piece.*
10. **Kody's identity for the gate.** The user id `74056c2a…` is consistent between MEMORY and flags-gating, but the email is not (C13). *Cheapest: one question to Kody, or one read-only Strata `auth.users` lookup under patina-prod-ops.*
11. **What `/doc/[id]` does before data.** It renders "Picking up…" (`page.tsx:2430`) and resolves the engagement client-side. What `arr-pre` shows during that gap is unspecified (see R2).
12. **Document scope under the single-active-section model.** The mockup assembles every act. Production renders exactly one section plus SettledBars (`page.tsx:2938`). The contract must say what "assembles into the page" means there (spine + letterhead + LensBand + the active section's first regions?). *Design ruling, part of Q2.*
13. **Anchor identity across signing.** The project shape's `engagement_id` is `p.id`, while the proposal shape's is `pr.chain_root_id` [checked `00590:62,224`]. A proposal Document's anchor does not carry over to the project Document after signing, so "since" resets to "First visit". Either accept this or key the anchor through the chain.

## 3. Risks the reports underplay

- **R1: Soft navigation turns a daily briefing into a toll.** Because Documents are not visit-suppressed (C11), and the budget is re-based to route entry (engine-spec §9.4), **every Desk→Doc click plays a 10-second-hold card**. Desk and Document share one layout and cached React Query data, so soft entries are exactly where the budget is met. Meanwhile, on cold hard loads (sign-in, bookmark) the client-only data path (auth, then 10 parallel Desk reads, then `useDocumentEngagement`) will often blow the 1500 ms budget, so the arrival **declines**. Net effect: production would invert the mockup. It would skip the morning open and play on every hop. Only engine-spec says "plan for it", and nobody sizes it.
- **R2: Hydration flash and blank body.** `arr-pre` hides `<body>` from the head script until boot or the safety timeout (~1700 ms). On a cold load, the page is blank for up to 1.7 s and then declines anyway (R1): a pure regression for Kody. On a soft entry, adding `arr-pre` in `useLayoutEffect` hides the **whole body, including the always-mounted chrome** (CommandBar, MobileBar, TesterWidget), which flashes the persistent shell out. Mitigations the contract must choose:
  - hide only `main` / the route content, not `body`
  - add `arr-pre` only once the Briefing is ready and data is cached
  - make the flag hint expire, and clear it the moment `useFeatureFlag` resolves false, so a killed flag doesn't keep blanking loads until the hint ages out
- **R3: Flag-hint staleness is itself a kill-switch hole.** If the pre-paint hint lives in localStorage or a cookie and the flag is turned off in PostHog, the hint still hides the body until the client resolves the flag and clears it. The kill switch is then "next load after the flag resolves", not instant. The failure is cosmetic but real.
- **R4: Playwright global override.** gates-deploy says to add the flag to `playwright.config.ts` `webServer.env`. That env is **global**, and 36 existing e2e specs go straight to `/desk` or `/doc/*` [checked by grep]. With the arrival on, `body{pointer-events:none}` until Act 3 and the first-click swallow will break or flake most of them. Use a **separate Playwright config/project with its own webServer port** for the arrival spec, or keep a query/sessionStorage kill (`?arrive=0`) and have the shared fixtures set it. Never flip it globally.
- **R5: React owns the landing nodes.** Two things re-render mid-flight:
  - `useDeskEngagements` has a **60 s `refetchInterval`** (`use-desk-engagements.ts:179`). engine-spec only named `refetchOnWindowFocus`. A refetch during the hold can reorder the Claim cards (`keepPreviousData` keeps the old data, but a new derivation re-keys cards).
  - StrictMode double effects spend `pl-arrive` twice.

  The MutationObserver→`finish()` guard is a must, not a should.
- **R6: Escape semantics.** The Document's put-down listens on `document` keydown in the **bubble** phase [checked `page.tsx:1370-1389`]. The engine must `stopPropagation` from **window capture** during compose/hold, or Escape advances *and* puts the paper down. That is the exact double-action bug the W5-R6 comment already fixed once. This works if the listener placement is right. Add a regression test.
- **R7: RLS and SECURITY DEFINER.** The `mark_arrival` draft is sound: owner-only SELECT, no write grants, pinned to `auth.uid()`, no FK so there is no existence oracle. Four risks remain:
  - `ON CONFLICT ON CONSTRAINT` with `UNIQUE NULLS NOT DISTINCT` is unproven (the report says so). Write a pgTAP test for the desk-scope upsert.
  - An INVOKER `arrival_changes` gives teammates a thinner "since" than owners (decision_events are hidden from co-members). The card will say "Nothing new" when there is news, which violates the honesty rule.
  - Calling the RPC is a write on every visit. It must sit behind the flag, so non-flag users write nothing.
  - Keep grants in `seed/00-legacy-grants.sql` in sync, or local resets drift.
- **R8: Round-trip on the critical path.** `mark_arrival` returns the anchor the since line needs, so the Briefing cannot be built until one more RPC resolves. That spends the 1500 ms budget (R1). The alternative is to read the anchor with SELECT on mount and fire `mark_arrival` after the arrival settles. Either way, the contract must order these explicitly.
- **R9: The prod-pointing `.env.local`.** No report verified it (it's sandbox-denied). The worktree has no gitignored env files at all. Every local build or e2e must export the **local** trio explicitly, and the deploy must export the **wrangler.jsonc** trio explicitly (gates-deploy (d)). A local `next start` against Strata with a working arrival RPC would write `arrival_anchors` rows into **prod** once 00675 is live.
- **R10: Deploy guard is procedural only.** No hook stops `deploy-portal.sh designer` or `supabase db push`. The only gate is the in-session user request. The workflow script must hard-gate deploy on a clean adversarial review plus green QA (MEMORY `feedback_workflow_gate_deploy_on_clean_review`), and the migration push must follow a read-only `migration list` that shows **only** 00675 pending (Gap 8).
- **R11: Disk.** There are 49 GiB free and a worktree costs ~15 GiB with node_modules and `.next`. That caps the plan at **3 concurrent worktrees**, not "2–3 plus integration". Also: 114 registered worktrees, two unregistered `.codex/worktrees` dirs, and a 2.9 GiB stale `.next` in main. Run `df -h /` before each wave. Build `.next` in at most one worktree at a time.
- **R12: Shared local Postgres.** Applying 00675 locally (or `supabase db reset`) hits the one Postgres every session shares. Other sessions are active (the agent list is long). The DB piece must announce a reset window, or apply 00675 with `migration up` rather than a reset.
- **R13: Fonts decline silently.** If `FACES` is not rebuilt from `next/font` `.style.fontFamily` (hashed names), `fonts.load` matches nothing and the arrival **always** declines. That's a "works in review, never plays in prod" failure. Assert it in the Playwright lane: the arrival must actually *play* on a warm soft entry.
- **R14: CSP is fine but fragile.** Prod `script-src` includes `'unsafe-inline'` [checked `next.config.js:88-89`], so the inline head script runs. If anyone later tightens CSP to nonces, the pre-paint gate silently stops and the arrival never plays. Note it in the contract.
- **R15: The first-hand collision (R-DM7) is untested.** Desk-arbiter MarginNotes, the walkthrough offer and teaching notes all render at the Desk head. An arrival over a first-touch note violates "must neither expand nor silently disable the teaching program". Treat an open walkthrough or teaching note as `busy()`.

## 4. Recommended wave plan

Wave 0 must finish before any worktree exists.

**W0: Rulings and preflight** (orchestrator plus one Haiku, read-only):
- Rulings from Kody or the design panel: Q1–Q3 in §5, plus C12 (`held_ms`) and R-DM19 for v1.
- Reserve 00675 in `docs/engineering/migration-number-reservations.md`.
- Read-only preflight:
  - `df -h /`
  - `scripts/repo-gc.sh` (dry-run)
  - `supabase migration list --linked` (Gap 8)
  - `supabase status`
  - `npx wrangler whoami` (full output)
  - grep `.env.local` for `NEXT_PUBLIC_SUPABASE_URL`
- Confirm Kody's user id and email (C13).

**W1: three parallel worktrees, disjoint file sets**

| Piece | Owns (exclusive) | Depends on | Model |
|---|---|---|---|
| **A: DB + hook** (lands first) | `supabase/migrations/00675_arrival_anchors.sql`; `supabase/tests/*arrival*`; `supabase/seed/00-legacy-grants.sql`; `packages/supabase/src/types/database.types.ts` (regen); `packages/supabase/src/hooks/use-arrival-anchor.ts` + index export; the reservation doc | W0 R-DM19 ruling (anchor only, or anchor plus `arrival_changes`) | Sonnet (Opus if `arrival_changes` is in scope) |
| **B: Engine port** | `apps/designer-portal/src/lib/arrival/{types,select,gate,engine,faces,prepaint}.ts`; `src/styles/arrival.css` (sentinel + classes); jest tests for select and gate (ORC T2–T7, the visit and gate cases) | nothing (pure; fixtures from the mockup JSON) | Opus |
| **C: Briefing adapters + gating + analytics** | `src/lib/arrival/{briefing-desk,briefing-document,need-presentation}.ts` (total map over 19 NeedKinds); `src/hooks/use-project-arrival-enabled.ts`; `src/lib/analytics/arrival-events.ts`; jest tests | Imports B's `types.ts` (freeze that interface in the contract up front). Stubs A's hook signature. | Sonnet |

B and C share only `types.ts`. Write it into the contract verbatim and let B own it.

**W2: Integration** (one worktree, a single owner, after A merges and types regenerate, then B and C merge). Owns:
- `app/layout.tsx` (inline head script from `prepaint.ts`, CSS import, `data-arr-skip` on DebugPanel/TesterWidget)
- `(document)/layout.tsx` (`data-arr-skip` on overlays)
- `desk/page.tsx`, `desk-roster.tsx` (retire `desk-settle` when arrival plays), `desk-claim-card.tsx` (data-part marks)
- `doc/[id]/page.tsx` (mount; replace `doc-raise` via decline; busy predicate; Escape precedence)
- `doc-spine.tsx`, `doc-letterhead.tsx` and the LensBand component (data-part marks)
- the refetch freeze

`page.tsx` is 3,435 lines, so give it to Opus and allow no parallel edits.

**W3: Verification and review.** Run these in parallel, in separate contexts:
- A Playwright arrival lane under its **own config and port** (R4), porting B1–B13 against `/desk` and `/doc/[id]`. It must include: plays on warm soft entry; declines on DeskDoorway and `?sheet=` params; Escape doesn't put the paper down; the reduced-motion floor; font decline.
- Existing desk/doc e2e specs with the flag off.
- An adversarial reviewer.

Gates, all in the worktree:
- `pnpm --filter @patina/designer-portal type-check`
- `pnpm --filter @patina/designer-portal lint`
- `pnpm --filter @patina/designer-portal test`
- the arrival Playwright spec with `--project=chromium`
- the supabase SQL tests for 00675

**W4: Ship**, only on a clean review plus green QA:
1. `supabase migration list --linked` shows only 00675 pending.
2. `supabase db push --include-all`.
3. Probe the RPC and ACL as an authenticated user.
4. Export the wrangler.jsonc trio and run `./infra/deploy-portal.sh designer`.
5. Check the bottom row of `wrangler deployments list --name patina-designer-portal`.
6. Grep the served chunks for a marker (e.g. the `--arr-ok` sentinel or `mark_arrival`).
7. Flag targeting (a human step if PostHog), then a Kody-only prod walk.

**The migration must land first for** A → W2. C can proceed against a stubbed hook signature. B has no DB dependency.

## 5. Contested questions (design panel) and what is already settled

### Contested: send these to a panel
- **Q1: Where and when does it play?** The options are: Desk only, or Desk + every Document. Hard loads only, or soft entries too. Per-visit for Documents as well (a new rule), or per-open (the mockup). A single rule has to cover R1 (production inverts the mockup), R2 (what `arr-pre` hides, and when) and R8 (anchor round-trip versus budget). This is the central question. The answer decides the mount point (C7), the gate, and whether the head script is even needed. If soft entry only, with `useLayoutEffect`, no pre-paint script is required.
- **Q2: The single source of text (T3) and the Document's shape.**
  - Port `select()` and make the Claim card sentence and the LensBand print its output. This changes shipped copy paths, and the Desk comparator gains a kind rank.
  - Or adapt production `NeedLine`s into `select()` and enforce T3 with a test.
  - Either way, rule on which ranker wins (C8), and what "assembles into the page" means under one active section (Gap 12).
- **Q3: Gating and the since line for v1.**
  - PostHog flag: needs a human dashboard step (no write-scoped key exists); runtime kill.
  - Hardcoded Kody id: kill needs a redeploy.
  - A DB-row gate: runtime kill with no PostHog.
  - All three need the pre-paint hint and its expiry (R3).
  - Bundle with this the decision on R-DM19 (ship the anchor table plus the full `arrival_changes`, or anchor only) and whether `held_ms` is allowed (C12).

### Settled by the reports (or by my checks)
- **Routes:** `/desk` is `(document)/desk/page.tsx` and `/doc/[id]` is `(document)/doc/[id]/page.tsx`. Both are `'use client'`, share one layout, and connect by soft navigation. Sign-in lands on `/desk` with a hard `location.replace`.
- **Engine port:** strategy A. A typed, near-verbatim port split into select, gate and engine. Listeners on window capture, `unwire()`, the gate re-run per route entry, and `FACES` built from `next/font` objects.
- **Vocabulary:** key on the real 19 `NeedKind`s through a presentation map. Scope out `booking`, `sample` and `care_note`. Do not reuse `project_reading_marks`.
- **Migration number:** 00675 (the head is 00674, and nothing is reserved above it). R155 is the next DECISIONS id.
- **Flag name:** must not be `arrival` or `arrival-arc` (`triage-bar.tsx:88`, `open-requests-strip.tsx:242`, `ceremony-surface.tsx:63`). Flags fail closed through `{value, isLoading}`.
- **Gates:** type-check is the real type gate (build ignores type errors); lint; jest; Playwright chromium single-spec.
- **Deploy:** `./infra/deploy-portal.sh designer` with the wrangler.jsonc trio exported. No override env var exists. Verify with the deployments-list bottom row and a chunk grep.
- **CSP:** prod permits an inline head script.
- **Doctrine:** the reduced-motion floor is unconditional. Skip stays visible under reduced motion. One `role=status` announcement. No lure. Failure means the ordinary page.
- **Put-down:** the mobile put-down exists (`mobile-sheets.tsx:606-610`).
