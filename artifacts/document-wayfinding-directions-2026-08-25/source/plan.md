# The Document — Wayfinding Review & Two Directions

## Context

Kody asked for a team review of the designer portal's document interface — layout, navigation, flow — with a **UX/UI team** and an **Interior Design practitioner team** weighing in, ending in an HTML proposal with UI mockups and **two directions** that make it *always obvious what to do next and how to reach the items a designer needs*.

The surface is **The Document**: `/desk` + `/doc/[id]` (one paper per engagement; fixed 7-section spine brief→discovery→direction→proposal→project→install→care) + the Studio Drawer/⌘K global nav + rooms + shelves (Plan room / Spec book / Mood boards / Call sheet / Knowledge) + the Drafting Room, across three width tiers (<1180 bottom bar · 1180–1439 compact · ≥1440 full spine + margin rail + Shelved Spine). It has an append-only DECISIONS ledger through **I143 (2026-08-16)** and eight decks in 45 days. Two of the most severe findings ever recorded were **never ruled**: **T4 "no fleet view — 'show me everything in Install' has no path"** and **T2 "install is a label on project mode, not a mode"**. The standing complaint is verbatim *"designers have to hunt for things"* / *"the pilot designer fled to the legacy portal twice"*. The `worktable` stage-adaptive composition (ruled "the destination" on 2026-08-15) is merged behind a fail-closed flag and **has never been rendered for a human**.

What makes this review different from the last eight: it is scoped to **wayfinding + next-action obviousness across the whole system**, it seats practitioners beside UX lenses, every finding survives three refuters before an author sees it, and it renders the Worktable for the first time.

**Kody's rulings at plan time (2026-08-25):** Direction A tightens *within* doctrine; Direction B *may amend* doctrine with every amendment named and priced. Evidence = local dev, both flag states, no prod walk. Baseline = both compositions (live flag-off AND Worktable flag-on); each direction must say how it lands on each.

Session model is Fable → Fable orchestrates and adversarially reviews only; every execution step runs in subagents via the Workflow tool (ultracode on). Four workflows run in sequence with a Fable review checkpoint between each.

## Scope & deliverable

- **In**: `/desk`; `/doc/[id]` in every stage; spine / running index / rooms block / shelves at all three tiers; Studio Drawer, ⌘K, `g` chords; shelf leaves; Drafting Room; every visible label; both `worktable` states.
- **Out**: internals of Library/People/Room View, client portal, iOS, schema changes, in-flight items (O10/O11, I114 session) — cited as inputs only. Nothing is built into the product.
- **Deliverable**: `artifacts/document-wayfinding-directions-2026-08-25/` — `presentation.html` (house deck format, published as a private Artifact) + `research/` + `shots/` + `probe/` + `source/` + `mock/` + `RESUME.md`. Committed by explicit pathspec (precedent `8617ab30`), never `git add -A`. DECISIONS.md is **not** appended — Kody rules first.

## Team (right-sized, ~38 agents across 4 workflows)

| Group | Agents | Model | Job |
|---|---|---|---|
| Evidence | E0 env+state ladder · E1 shots flag-off · E2 shots flag-on · E3 Chrome probe | Sonnet | Boot gate, RPC-only state lift, ~67 PNGs at 1440/1280/390, interactive probe log |
| Grounding | G1 code anatomy · G2 canon digest | Opus · Sonnet | Verified anatomy at HEAD; constraint ledger from DECISIONS.md |
| **UX/UI team** | U1 IA & wayfinding · U2 interaction/next-act · U3 hierarchy & width tiers · U4 content & lexicon · U5 reach (kbd/mobile/a11y) | U1 Opus, rest Sonnet | Walk the 16-task script against the evidence pack; report every finding with severity + confidence |
| **Interior Design team** | P1 solo principal, 6 jobs (Leah-grounded) · P2 3-person studio principal · P3 junior, week one · P4 FF&E/procurement-heavy | P1 Opus, rest Sonnet | Same script, first-person: glance → click → hesitate → give up, obviousness 1–5 |
| Verification | V1 code-truth · V2 canon-truth · V3 repro (Chrome) | Opus · Sonnet · Sonnet | Each refutes the whole deduped set; a finding survives only if none kills it |
| Directions | S0 shared planks · A/B authors · 4 critics (practitioner + feasibility per lane) · A/B revise · J1 workflow judge · J2 feasibility judge | Sonnet · Opus×2 · Sonnet×4 · Opus×2 · Opus×2 | Two lanes distinct by construction; cross-critique; 7-axis rubric, two score sets |
| Mockups + deck | M0 kit · M1/M2 fragments · M3 assemble · D1 deck · D2 fact-check · D3 visual QA · D4 revise | Sonnet · Opus×2 · Sonnet · Opus · Sonnet×2 · Opus | 5 screens per direction on one specimen; house-format deck; every claim traced; rendered QA |
| Publish | C1 commit | Sonnet | Pathspec commit; Fable publishes the Artifact and writes memory |

Rules in every brief: report every finding with confidence + severity, no severity filter; implementer never reviews its own work; write outputs only to the program folder (durable path — the scratchpad is wiped on resume); Sonnet briefs state scope literally ("all 16 tasks", "all 3 tiers").

## Workflow 1 — Evidence + Grounding (6 agents, ~1.5–2 h)

Script: `.claude/workflows/document-wayfinding-program.js` adapted from `.claude/workflows/field-companion-program.js` (meta/phase/parallel/schema/digest conventions), with `OUT = artifacts/document-wayfinding-directions-2026-08-25` instead of the scratchpad. Each phase skips an agent whose output file already exists (cheap resume).

**E0 `evidence:env-and-ladder`** (Sonnet, loads `patina-local-dev`) — sequential gate:
1. `grep NEXT_PUBLIC_SUPABASE_URL apps/designer-portal/.env.local` → must be `127.0.0.1:54321`; a `*.supabase.co` value = **STOP the program**.
2. Port 3000 holds PID 27713 serving no HTTP. `ps -p 27713 -o command` — kill only if it is a `next dev` for designer-portal; otherwise boot on `PORT=3100` and point the harness there.
3. Confirm `curl http://127.0.0.1:54321/rest/v1/` → 200 (verified up at plan time). Docker socket is sandbox-denied → all SQL via `psql postgresql://postgres:postgres@127.0.0.1:54322/postgres` (pattern: `apps/designer-portal/e2e/helpers/psql.ts`), never `docker exec`.
4. Re-apply the transient rich seeds `apps/designer-portal/scripts/the-document-{local,track1,track2}-seed.sql` (Whitfield / Olsen — not in `config.toml [db.seed]`, lost on reset).
5. Write `research/lift-states.sql` — idempotent, **RPC-only** (impersonate the seeded designer via `set session "request.jwt.claim.sub" = 'a0000000-…-0004'` as in `the-document-local-seed.sql:22`): Aspen Loft `…d1` → **install** via `advance_project_phase` (00393/00464 — confirm arg order first); Birch Hollow `…d3` → **care** via `close_project` (00238); Marrow & Vale `…d4` stays **project**; Whitfield (resolve id via proposal `b0000000-…-0001`, never pin) = rich project; proposal `…-0002` "Aspen Loft — Living Room Refresh" = **proposal sent**; a revision/clone of it (`begin_proposal_revision` / `clone_proposal` — verify signatures) = **direction**; a lead = **brief**; verify the `document_state` discovery branch (00327) yields the seeded `designer_clients` row.
6. Boot `pnpm dev:designer` with `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live` (default `auto` silently falls back to `src/lib/mock-data.ts` — false screenshots) and flags `NEXT_PUBLIC_FLAG_OVERRIDES='call-sheet:true,arrival-arc:true,room-file:true,studio-workspaces:true'` (format per `hooks/use-feature-flag.ts:49-63`; inlined at dev start → flipping requires a restart).
7. Output `research/00-env-and-seeds.md` with the resolved id table.

**E1 `evidence:shots-flag-off`** (Sonnet, loads `patina-testing`): copy `apps/designer-portal/scripts/the-document-track3-shots.mjs` → `research/wayfinding-shots.mjs` (best template: per-shot try/catch wrapper, SHOT_W/H/PREFIX env, done/failed ledger, clip-capture example). Four mandatory repairs: replace the login block with a port of `e2e/fixtures/auth.ts` (every old script waits on the deleted `**/portal**` URL; pre-seed `localStorage['help-system.welcome-shown.first-project-walkthrough']='1'` so the Desk Walkthrough dialog never inerts the page); add `e2e/helpers/hide-dev-overlays.ts` as init script; add a `full` flag (`fullPage:true` for paper, `false` for rails/⌘K/drawer); psql at 54322. Prefer aria selectors: `[data-document-shell]`, `[aria-label="Document spine"]`, `#doc-section-{key}`, `nav[aria-label="Studio drawer"]`, `[aria-label="Studio books"]`, `[role="dialog"][aria-label="Command bar"]`, `[data-margin-panel]`, `[role="alert"][aria-label="Needs attention"]`, `[data-testid="mobile-bar"]`, `[data-in-hand-room]`, `[aria-label="Document colophon actions"]`, shelf leaves by aria-label. Run three passes (`SHOT_W=1440 SHOT_H=900`, `1280×900`, `390×844` with `isMobile`), OUT → `shots/`.

Shot matrix (~55): paper per state (brief, discovery, direction, proposal-sent, project-rich, project-plain, install, care) × 3 widths fullPage; desk × 3; spine detail + hover `···`; running index mid-scroll; rooms block + room lens held; shelves block + 4 leaves + call-sheet doorway; margin rail closed/open/composer; red-letter zone; money region + Record foot; proposal-sent guide, install section, care band; ⌘K open/typed/Engine row; drawer strip/open/books/ledger sheet; `/library`, `/people`, `/rooms`, `/doc/<id>/plans`, `/doc/<id>/spec-book`, `/board/<id>`, `/drafting/<id>`; mobile bar, spine sheet, margin chips, more-actions sheet.

**Non-negotiable**: the agent `Read`s every PNG and reports `name → verified | blank | wrong-surface`; re-runs failures once. The template writes a fallback PNG on failure, so the ledger alone proves nothing. Output `research/01-shot-ledger.md`.

**E2 `evidence:shots-flag-on`** (Sonnet): restart dev with `worktable:true` added; capture the four tables (Intake/Speccing/Finalize/Delivery, `lib/document/table-derivation.ts:20-26`) at 1440 + 1280 fullPage, plus table head / leader / "ready to turn" details (~12, prefix `wt-`). Append to the ledger.

**E3 `evidence:probe`** (Sonnet, one ToolSearch loading all Chrome tools): hover-only affordances on every `···`; Esc chain (leaf → dialog → put-down, `page.tsx:530` guard); chords `g l/p/r/o/a/h/t`, `⌘K`, `/`, `?`; scroll-spy sampled at 10 positions (rootMargin `-20% 0px -62% 0px`, folded regions unmount); fold/reload persistence + index jump into a folded region; focus return after leaf/⌘K/sheet close; room-lens strand on resize 1440→1280→390 (hazard from `spine-shelves-prototype-2026-08-15/BLUEPRINT.md §3`); console errors per route. Output `probe/01-interactive-probe.md` (`{probe, steps, observed, verdict works|partial|dead|hazard, evidence}`).

**Hard gate**: `verified_count < 35` or a flag state missing → stop before Workflow 2.

**G1 `ground:code-anatomy`** (Opus) and **G2 `ground:canon-digest`** (Sonnet) run in parallel with E0–E3. G1 verifies the Explore map against HEAD (`app/(document)/**`, `components/document/**`, `lib/document/{section-derivation,table-derivation,shelves,document-index,desk-derivation,document-guide,registry}`) → `research/10-code-anatomy.md`. G2 greps DECISIONS.md (9,431 lines — never read whole; D1–D12 at `:8`, all `R\d+`, I135–I143 + errata in the last 1,200 lines) plus `apps/designer-portal/CLAUDE.md`, `artifacts/document-flow-directions-2026-08-15/delivery-plan.md`, `artifacts/spine-shelves-prototype-2026-08-15/BLUEPRINT.md` → `research/11-canon-digest.md` (constraint ledger + known-open list; confirm the Thumb-Index removal is unlogged).

**Fable checkpoint 1**: read the shot ledger and probe log; spot-check 6 PNGs (one per width, both flags); confirm the Worktable actually rendered.

## Workflow 2 — Panel + Verify (12 agents, ~1 h)

Every panelist gets the identical **evidence pack** (ledger, probe log, anatomy, canon digest, shot folder) + the **task script T1–T16** + their brief (Appendix §1–§3) + the **finding schema** (Appendix §4). Nine run in `parallel`; outputs `research/2{0..8}-panel-<key>.md` + structured findings.

Dedup in plain JS by `key = surface|width|flag|slug` (votes, max severity, max confidence) → `log()` raw vs unique vs corroborated-by-3+.

Three refuters in `parallel`, each over the **whole** deduped set: **V1 code-truth** (Opus — is the affordance genuinely absent or merely unfound? verdict `stands|narrows|misread`, file:line), **V2 canon-truth** (Sonnet — bug or ruled behavior? `ruled-against` with the DECISIONS id; note: a finding against ruled ground is still valid for Lane B, it is just not free), **V3 repro** (Sonnet, Chrome MCP — `reproduced|not-reproduced|state-dependent`). Survival = V1≠misread ∧ V2≠ruled-against-for-Lane-A ∧ V3≠not-reproduced. Write `research/30-verified-findings.{json,md}`; `deduped.length === 0` → stop.

**Fable checkpoint 2**: read the verified set; check the two historic findings (T4 fleet, T2 install-mode) and the lexicon findings are represented or explicitly refuted; check no refuter killed on "already ruled" alone.

## Workflow 3 — Directions (11 agents, ~1 h)

1. **S0 shared planks** (Sonnet): from the verified set, the fixes both lanes adopt identically — copy, mislabels, a missing act, a dead-end shelf — **never structure**. `source/shared-planks.md`.
2. **Authors in parallel** (Opus×2, separate contexts, both receive planks + verified findings + canon guard + lane constraints + specimen + rubric): **Lane A "tighten within doctrine"** (zero D/R amendments; composition, labels, leader election, placement, guide precedence/copy, desk, ⌘K aliases; ships days–weeks; every move a revert) and **Lane B "restructure where findings demand"** (may amend doctrine — fleet/roster tier, true stage modes, persistent project map — each amendment named by id, quoting the clause, with the trade and rollback; Worktable is the destination per Q3; may propose a section↔stage mapping as a *candidate for Kody's owed I114 session* but its first slice must not depend on it). Each delivers the 8 items in Appendix §6 and states how it lands on flag-off and flag-on. Opus briefs: deliver exactly what's asked, no padding. `source/direction-{a,b}.md`.
3. **Cross-critique in parallel** (Sonnet×4, fresh contexts): practitioner critic + feasibility critic per lane; each tries to break the direction (unnamed amendments, cells >2 acts, specimen drift, "Lane B is just A but more"). `source/critique-{a,b}-{practitioner,feasibility}.md`.
4. **Authors revise** (Opus×2, same context re-invoked with their two critiques) → v2.
5. **Judges in parallel** (Opus×2): J1 practitioner-workflow (names the persona behind every score, weights axes 1,2,3,6), J2 product/engineering feasibility (cites file or ruling behind every cost, weights 4,5,6,7). Rubric in Appendix §7; both score sets reported, never averaged; each names which persona is worse off under the direction they favor. `source/judge-{workflow,feasibility}.md`.

**Fable checkpoint 3**: confirm the lanes are distinct by construction; confirm every Lane-B amendment is named/priced; pick the deck's recommendation stance (recommend one, or present the honest sequencing) from the judge reports.

## Workflow 4 — Mockups + Deck (8 agents, ~1.5 h)

1. **M0 mock kit** (Sonnet): `mock/kit.css` + `mock/KIT.md` from `apps/designer-portal/src/app/globals.css` `:root` (`--doc-paper #FCFAF6`, `--doc-sheet-2/3`, `--doc-ink-border`, charcoal/mocha/quiet-ink/clay/pearl/off-white, phase colors) and `packages/patina-design-system/src/styles/typography.css`; primitives: paper, StrataMark, scored-ink leader, spine rail, running index, margin item, seam, stamp, drawer strip. Zero `box-shadow`. Fonts: **first** grep the current `apps/designer-portal/.next/static/css/*.css` for the latin `@font-face` of Playfair Display / Inter / DM Mono and copy those three woff2 from `.next/static/media/` to `assets/fonts/` (before anything runs `rm -rf .next`); emit both a Google Fonts `<link>` and a base64 `@font-face` fallback (gstatic reachability from an Artifact is unverified — D3 decides which renders).
2. **M1/M2 fragments** (Opus×2, parallel, isolated): per direction the five screens on the **Vandersteen specimen** (Appendix §8): M1 desk ≥1440 · M2 doc project ≥1440 · M3 doc 1280 · M4 doc 390 · M5 stage-specific state; shared planks drawn identically. `mock/direction-{a,b}.html`.
3. **M3 assemble** (Sonnet): `mock/mockups.html` — triptych per direction, kit-consistent.
4. **D1 deck** (Opus; **loads `artifact-design` first**, then `patina-brand-voice`): house format — cover with thesis + `Verified against main@<sha>` + "Prepared for the Patina studio team"; generated left index; the reading (verified findings, each with "What stays true" + `file:line` + shot); the practitioner voices (short verbatim hesitations from P1–P4); Direction A and Direction B, each: thesis, map, per-stage next-act organ, item-reach table, lexicon stance, 5 mocks, Keeps/Refuses/Costs, first slice, landing on flag-off/on; compare table (rubric axes as rows, both judges' scores); recommendation and what it costs; **questions for the team** (incl. "log the Thumb-Index ruling in DECISIONS", I114 candidate mapping, T4/T2 stance); colophon (method, sources, agent roster, sha). Curated ~18 PNGs data-URI-embedded after `sips -Z 1600`; whole file ≤16 MB; theme-aware tokens per the 08-15 precedent structure; CSP: no external hosts except Google Fonts. Output `presentation.html`.
5. **D2 fact-check** (Sonnet, never saw the deck being written): every claim → shot / probe entry / `file:line`; every referenced PNG exists; specimen figures identical across all mocks. `research/60-deck-factcheck.md`. **D3 visual QA** (Sonnet, Chrome MCP): 1440 + 390, light + dark, contrast, no shadows, no clipped images, size, network requests. `research/61-deck-visualqa.md`. Parallel.
6. **D4 revise** (Opus, D1's context re-invoked with both QA reports).

**Fable checkpoint 4**: read the deck end-to-end; adversarial pass on overclaims (the 08-15 deck's v1 overclaimed the journey delta — check the numbers); then Fable publishes via `Artifact` (favicon 🧭, title from `<title>`, description one sentence).

## Publish & record

- **C1 commit** (Sonnet): compress `shots/*.png` (`pngquant`/`sips -Z`), write `RESUME.md` in the `artifacts/doc-ux-review-2026-08-13/RESUME.md` shape, `git add artifacts/document-wayfinding-directions-2026-08-25` (pathspec only; `.claude/workflows/` stays untracked like its precedent), commit `docs(the-document): wayfinding directions program — evidence, findings, two directions, deck` on main (docs-only, precedent `8617ab30`). Push is Fable's (subagent shells cannot push; pre-push hook runs portal suites — 10-min timeout).
- Fable writes memory `project_document_wayfinding_directions_2026_08_25.md` + MEMORY.md line: deck URL, the two directions, the questions awaiting Kody's ruling, owed items (Kody's read; DECISIONS entries incl. Thumb Index).

## Verification (what "done" means)

1. Evidence: ≥35 verified PNGs across 3 widths; both flag states present; probe log has verdicts for all 8 probes; `.env.local` gate passed and recorded.
2. Findings: every surviving finding cites a shot/probe/`file:line`; three refuter reports exist; T4/T2/lexicon either present or explicitly refuted with reason.
3. Directions: two lanes pass the "distinct by construction" check; zero unnamed amendments in Lane B; every item-reach cell >2 acts is a declared exception; both directions state flag-off and flag-on landings; two judge score sets on all 7 axes.
4. Deck: fact-check reports zero unresolved claims; visual QA green at 1440/390 light/dark; ≤16 MB; no external requests except Google Fonts; opens from the Artifact URL; the three plan-time rulings are stated on the cover.
5. Record: program folder committed by pathspec and pushed; memory updated; DECISIONS.md untouched; RESUME.md lists what's owed (Kody's read + rulings on the deck's questions).

## Critical files

- `apps/designer-portal/src/app/(document)/doc/[id]/page.tsx`, `desk/page.tsx`, `(document)/layout.tsx` — the surface
- `apps/designer-portal/src/lib/document/{section-derivation,table-derivation,document-guide,registry,shelves,document-index,desk-derivation}.ts(x)` — the derivations every finding and direction must cite
- `apps/designer-portal/src/components/document/{doc-spine,spine-shelved-blocks,spine-running-index,studio-drawer,command-bar,margin-rail,red-letter-zone,document-guide}.tsx`
- `apps/designer-portal/src/hooks/use-feature-flag.ts`, `apps/designer-portal/src/app/globals.css`, `apps/designer-portal/src/app/layout.tsx`
- `apps/designer-portal/scripts/the-document-track3-shots.mjs`, `e2e/fixtures/auth.ts`, `e2e/helpers/{psql,hide-dev-overlays}.ts` — harness sources
- `supabase/config.toml`, `supabase/seed/{proposals,decisions,schedule,leads_room_scans}.sql`, `apps/designer-portal/scripts/the-document-*-seed.sql`, migrations 00237/00238/00327/00393/00464 — state ladder
- `docs/design/the-document/DECISIONS.md`, `apps/designer-portal/CLAUDE.md` — canon
- `.claude/workflows/field-companion-program.js`, `artifacts/document-flow-directions-2026-08-15/presentation.html`, `artifacts/doc-ux-review-2026-08-13/RESUME.md` — precedents

---

# Appendix — Review instruments (paste into briefs verbatim)

## §1 Task script (T1–T16)

Walkers run T1→T16 in order, in one sitting, as one week. Never skip a task because it "obviously has no path" — narrate the search; the search is the finding. P1 additionally runs T1 as "back after ten days away".

| # | She says | Path today | Stage(s) | Success looks like |
|---|---|---|---|---|
| T1 | "Tell me what today actually needs — across everything." | `/desk` → Needs-your-hand folios + Studio Pulse (`desk/page.tsx:28-31,340`) | all | Narrates her day in <2 min without opening a document |
| T2 | "Show me everything that's in install." | **none** — no fleet/roster tier; ⌘K searches names, not phases | project/install | One surface answers a phase-wide question (open T4) |
| T3 | "What's my next move on this one?" | `/doc/[id]` guide; precedence gate → need → proposal lifecycle → stage default (`document-guide.ts:316-398`) | all 7 | One sentence, one named act, one click to where it happens |
| T4 | "Change the fabric on the living room sofa." | Project · FF&E region → room heading → line unfold; ≥1440 room lens lifts, never filters | project, install | ≤2 acts to the editable line |
| T5 | "Pull up the mood board for the primary bedroom." | ≥1440 shelves → Mood boards leaf → `/board/[id]`; <1440 **none** except desk Recent boards / ⌘K by name; speccing stage prints a strip | direction, project | Boards reachable at every width and from their room |
| T6 | "Where's the floor plan? Where's the spec book?" | ≥1440 Plan room / Spec book leaves; ⌘K "The plan room"; <1440 **none** | project, install | Reachable on a 1280 laptop |
| T7 | "Did the Hendricks ever open my proposal? Nudge them." | Proposal section send-wall state line (I137 SP3); from desk only if a `hesitating_proposal` need derives | proposal | Sent-state + age legible without opening the doc |
| T8 | "Add the mudroom." | FF&E → "Add a room" scored-ink line at the foot of the room list (I137 SP4) | project | Found unaided, first pass |
| T9 | "Bill the deposit. And who still owes me?" | doc money region + account band; ⌘K "Draw an invoice"; Accounts sheet `g a`; desk receivable lines | project, install, care | Picks one door without a shrug; paid/unpaid/due in one glance |
| T10 | "Install slipped a week — move it and tell me what it hits." | Schedule region → date edit → ripple (`schedule-ripple-derivation.ts`) | project, install | Sees downstream damage before committing |
| T11 | "Put this down, pick up the Byrnes." | Esc / Put down → `/desk` → folio; or ⌘K (D1 forbids tabs/split) | all | One trip; she knows which trip |
| T12 | "New inquiry — start them." | ⌘K "Capture a lead · begin a Brief" → `/ceremony/[leadId]`; or "Open a project · no proposal needed" (`registry.tsx:253-278`) | brief | The difference between the two verbs is obvious before picking |
| T13 | "Did Sturdy Oak confirm the PO?" | Orders sheet `g o` → vendors page; or a `po_unacknowledged` need routes to the ledger (`document-guide.ts:208-245`) | project, install | Ack state visible per PO without leaving the project's frame |
| T14 | "The console came in damaged — file it." | Orders → Receiving page (`damage_claim` / `awaiting_inspection` needs) | install | Claim filed where she saw the damage |
| T15 | "Who's on this job? I need the painter's cell." | Call sheet doorway (flag `call-sheet`, absent when off, `shelves.ts:52-58,75-88`); ⌘K "Open the call sheet"; People `g p` | project, install | One roster, reachable with the doc in hand |
| T16 | "Client asked a question — answer it where it's on the record." | The Post bell / `g t` → `/people?thread=`; or a `message` margin item | all | Reply lands on the record without leaving the project |

## §2 Practitioner personas (Interior Design team)

**How to walk (all four, every task), first person, present tense:**
```
T{n} — {the task in my words}
First glance:      what my eye lands on in the first 3 seconds, named literally
Where I'd click:   the exact word/control I'd reach for, and why
Where I'd hesitate: the moment I stop, and what I'm asking myself
Where I'd give up: browser tab / call someone / old tool — or "didn't"
Obviousness: {1-5}  (1 could not find · 3 second guess · 5 without thinking)
```
Rate *what to do* and *how to get there* separately when they differ. Quote labels verbatim. "I expected a ___ and there wasn't one" is the deliverable.

**P1 · Solo residential principal, 6 live projects (Leah-like) — Opus.** Madison WI; two-person studio, one job always in install. Came off Ivy (kept invoicing, resented double entry) and a Google Sheets FF&E schedule she trusts more than any app; Houzz Pro one season. Phases = the Patina Six (Consultation · Schematic · Development · Procurement · Installation · Completion; `the-document-schedule-package.md:117-118`). Expects, in order: where this job is right now, what's late, what the client is waiting on me for, the FF&E schedule. Metaphor tolerance high but conditional — will not accept one that costs a click or hides a number; her tell is fleeing to the old portal rather than arguing. Stakes: an unopened proposal past her real patience window; install week with a missing/damaged piece; Tuesday triage from one screen. Grounded in `leah-session-01-first-tuesday.html` (time-to-true-read, unaided margin acts, old-portal flights, "did the margin feel like your work or like notifications?") and `leah-session-05-one-pager.md` (which phase makes her sigh; the two-hour credenza retrace).

**P2 · Principal of a three-person studio — Sonnet.** Milwaukee; two designers + a procurement coordinator; Studio Designer (bookkeeper insists) + Dropbox + Monday meeting; eleven live jobs. Expects first: who has the ball, what changed since Friday, what's about to cost us money. Reviews FF&E, never edits it. Tolerance low-to-medium; won't tolerate asking a junior where something is. Stakes: reading eleven jobs before Monday's meeting (today = open eleven documents); a junior's uncommitted PO before the vendor's price expires; an install date moving unannounced. **Her test: strict one-document focus (D1) meets an oversight job** — say where it costs her and what, unsoftened.

**P3 · Junior designer, week one — Sonnet.** 24, Minneapolis, two years out of school; Mydoma internship, Canva, Excel. No legacy portal to flee to; only escape is asking. Expects a list of what I'm supposed to do in school words: floor plan, furniture schedule, purchase order, invoice, punch list. Tolerance near zero on first contact — recognition, never recall. Stakes: finding the FF&E schedule unaided; finding "the board"; "did that PO go out?" in front of a client. **Special assignment:** on every screen list *every* label she cannot define from the label alone, verbatim — start with `Client approvals`, `Schedule`, `Project · FF&E`, `Design authority` (`document-index.ts:36-52`) and `Plan room`, `Spec book`, `Mood boards`, `Call sheet`, `Knowledge` (`shelves.ts:33-72`); say what she thought each meant before clicking.

**P4 · FF&E/procurement-heavy designer — Sonnet.** Oak Park IL; six-figure FF&E budgets, quarterly installs; Design Manager for POs/receiving, a freight portal, a printed binder at install. Expects first: the FF&E schedule with order status per line, then what's arriving this week, then exceptions (unacknowledged, backordered, damaged). Tolerance medium; rejects any composition that separates a piece from its PO state. Stakes: install-day minus 10 reconciliation; a damage claim inside the carrier window; a vendor who never acknowledged. **Special assignment:** on T13/T14 note every time the answer requires leaving the document for a ledger sheet and whether the return trip preserved her place (sheets are supposed to slide over the document, `registry.tsx:53-54`, D8).

## §3 UX/UI lens briefs

**U1 · Information architecture & wayfinding (Opus).** Heuristics: information scent; Nielsen match-to-real-world, recognition over recall, user control & freedom; hub-and-spoke vs flat; label↔content correspondence. (1) Draw the reachability graph of `/desk` and `/doc/[id]` — every surface, every door, shortest act-count; where is anything >2 acts? (2) Three "room" nouns (`The Rooms` `g r`; the spine rooms block; `/room/[id]/file`) and three "board" doors (shelf leaf, speccing strip, desk Recent boards) — which collisions cost a wrong turn? (3) `Design authority` labels the money region — does anything carry scent toward money? (4) `Knowledge` opens onto nothing (`shelves.ts:64-70`) — what does a dead shelf cost? (5) Correct home for cross-project questions (T2): desk, a new tier, or a lens? (6) Is Desk Contents (labels + doorways only, R95) doing wayfinding work? (7) Which surfaces are ⌘K-only (pure recall)?

**U2 · Interaction & flow / next-action clarity (Sonnet).** Heuristics: visibility of system status; single primary action; Fitts; Hick; progressive disclosure; goal gradient. (1) Trace `deriveDocumentGuide` precedence — at each stage is the sentence the actual next move? (2) `stageCopy` one act per stage (`document-guide.ts:91-141`), e.g. `project` → "Review active work" — name every stage whose leader verb is a shrug, not an act. (3) I135's one-leader contract demoted real primaries — which regions now lead with the wrong word? (4) Where do ≥2 controls compete for one job (money has ≥3 doors)? (5) Round-trip cost after a sheet / leaf / Esc — is she where she was? (6) Where is a decision asked without its consequence shown (T10 ripple, T13 ack)? (7) Always-visible `···` at FF&E row density — help or noise? (8) Where is flag-gated `call-sheet` absence indistinguishable from "nobody on this job"?

**U3 · Visual hierarchy & layout across tiers (Sonnet).** Heuristics: Gestalt proximity/common region; type scale & rhythm; F-pattern; density vs legibility; graceful degradation. Tiers ≥1440 / 1180–1439 / 390. (1) First viewport per tier — work or chrome? (2) Enumerate exactly what is lost 1440→1280 (shelves, rooms block, running index, room-lens hold). (3) Zero shadows (D4) — how is depth carried, where does it fail to separate regions? (4) Where does the Record at the foot (I137) get in the way or become undiscoverable? (5) Does the red-letter zone read urgent without a badge, or decorative? (6) At 390 can she complete T3, T4, T9, T13? Rank tiers by task coverage. (7) Per-region fold persists in localStorage — can a returning designer tell folded from empty?

**U4 · Content design & lexicon (Sonnet; loads `patina-brand-voice`).** Heuristics: the brand skill (Playfair/Inter/DM Mono; plain-spoken Midwest; lexicon patina/provenance/workshop/maker/studio/trade; never AI/engine framing); match-to-real-world; plain-language pairing (studio word + trade word); label-first-word discipline. (1) Inventory every label on `/desk` and `/doc/[id]` at ≥1440: what P3 thinks it means, what it is. (2) Propose pairings that keep the voice for `Design authority`, `Knowledge`, `Call sheet`, `The Record`, `Plan room`, `In this document`. (3) `Next up` appears only in the unavailable branch (`document-guide.ts:329`) — should the guide have one stable name? (4) The seven section names vs the Patina Six — name each mismatch a designer trips on. (5) Registry aliases speak Programa/Houzz (`registry.tsx:47-49`) — do the *visible* labels, or only ⌘K? (6) Every need line and guide sentence: is it how she'd say it to herself (Leah-01 Q3)? Rewrite each that isn't. (7) Flag any engine/AI drift.

**U5 · Reach — keyboard, mobile, accessibility (Sonnet).** WCAG 2.2 AA (2.4.1, 2.4.3, 2.4.7, 1.4.3, 2.5.8); landmarks; keyboard-trap freedom; Fitts on the 60px drawer; touch targets. (1) Landmark map of `/doc/[id]` — can a screen-reader user reach the margin without traversing the paper? (2) `g` chords (`registry.tsx:85-221`) — announced anywhere visible? (3) Esc stack (bubble → sheet → put-down) — announced, predictable? (4) Drawer strip target sizes, focus order, contrast at flat edges. (5) No toast layer (R83) — are inline bands announced (live region)? (6) At 390 which of T1–T16 are reachable; which controls <44×44? (7) Room lens lift perceivable non-visually and at 4.5:1? (8) Any hover-only affordance anywhere? (Doctrine says no — verify.)

## §4 Finding schema

```json
{ "id": "U1-07", "lens": "U1", "persona": null, "task_ids": ["T2","T13"],
  "key": "desk|1440|off|no-phase-wide-view",
  "surface": "/desk", "width": "1440|1280|390|all", "flag": "off|on|both",
  "title": "No surface answers a phase-wide question",
  "observation": "verbatim what is on screen — labels quoted exactly",
  "why_it_blocks": "obvious-what-to-do | obvious-how-to-get-there | both",
  "evidence": { "shots": ["w1440-desk.png"], "refs": ["apps/designer-portal/src/app/(document)/desk/page.tsx:28-31"] },
  "severity": "blocker|high|medium|low", "confidence": 0.9,
  "already_ruled": null, "suggested_fix": "one line, one move",
  "hesitation_seconds_estimate": 45 }
```
Rules: exactly one of `lens`/`persona` non-null; no `task_ids` → drop; `title` ≤10 words states the problem; `observation` verbatim; `evidence` at least one of shots/refs; `severity` blocker = task impossible, high = only by luck/memory, medium = hesitation, low = polish; `confidence` <0.5 must append "what would settle this"; `already_ruled` cites the DECISIONS id — still valid, just not free for Lane A; `key` = `surface|width|flag|kebab-slug` so identical findings collide across lenses.

## §5 Canon guard (authors before drafting; verifiers before judging)

| # | Ruled — do not silently re-propose | Where |
|---|---|---|
| C1 | Strict one-document focus: no split views, tabs, peek/hold, persistent global nav over an open doc; Esc/Put down is the exit | D1 (DECISIONS.md:12) |
| C2 | Zero shadows anywhere; depth = value contrast + flat stacked edges | D4 (:15), `apps/designer-portal/CLAUDE.md` |
| C3 | Interruptions designer-driven; ships with zero break-through rules | D2 (:13) |
| C4 | Drawer is persistent chrome; ledgers are overlay sheets; no badges/counts | D8 (:19); R96 (`registry.tsx:17-18`) |
| C5 | No toast layer; failures = inline band at the act site | R83 (:2672) |
| C6 | Scored ink — no buttons/plates/boxes | I107 (:6584) |
| C7 | One inked leader per region; overflow always visible, never hover-gated | I135 (:8377, :8389-8393, :8404-8409) |
| C8 | Paper holds the work, shelves hold artifacts; index/rooms/shelves ≥1440 only; room lens lifts, never filters | I136 (:8427ff), errata (:8543) |
| C9 | Boards on shelves except the speccing stage | I136 + Q1 (:8881, :8678) |
| C10 | The Record at the foot of the paper | I137 (:8600, :8608) |
| C11 | Running index derived from mount order (approvals → schedule → ffe → money) | I137; `document-index.ts:33-52` |
| C12 | "Add a room" in flow at the foot of the room list; a demoted act's home is the body it acts on | I137 SP4 |
| C13 | One scored state line between send and seal; nudge prints once | I137 SP3 + errata (:8684) |
| C14 | **The Worktable is the destination**; fail-closed flag; flag-off byte-identical | Q3 / I138 (:8738, :8744-8746) |
| C15 | One registry, one entry, one icon per surface; Contents = labels + doorways only | R93/R94/R95 (`registry.tsx:14-18`) |
| C16 | R113 has two live entries (Field Capture M4 :4213; "Band is a state, not an error" :8081) — cite which | DECISIONS.md |
| C17 | Full-bleed document (D12 :211); D13 mobile spine sheet | DECISIONS.md |
| C18 | Stamps only say true things (R7); settled bars show no unfold hint (R8); files clip as a Folio (R24) | DECISIONS.md |
| C19 | **Thumb Index REMOVED by Kody — "do not re-propose"** — ⚠ NOT logged in DECISIONS.md; deck must ask for an entry | verbal ruling |
| C20 | One icon language; no second iconography | `registry.tsx:4-7, 73-76, 148-151` |

**Known-open (fair game, no amendment needed):** I114 section↔stage mapping (:9405); T4 no fleet view; T2 install-as-label; a flagged line on a sent proposal unanswerable anywhere (I140-errata); money doesn't seam on install/care (I141); `Knowledge` names a non-existent surface.

**Amendment rule (binding):** a direction may amend ruled canon only by (a) naming the entry by id and quoting the clause, (b) stating the trade in one sentence — what is gained, what is given up, (c) stating the rollback. Unnamed or unpriced → rejected on sight, doctrine-cost score 1. Form precedents: I138 A5, I137 SP4. Verifier check is mechanical: for every `already_ruled` finding, the direction either leaves the ground alone or carries a named amendment.

## §6 Direction-lane constraints

Distinct by construction — if Lane B reads as "Lane A but more", both are rejected and re-run.

**Lane A — tighten within doctrine.** Zero D/R amendments; new I-entries and copy freely. Permitted: composition/mount order, labels, leader election within a region, placement of existing acts, guide precedence and sentences, desk composition, ⌘K aliases/shortcuts, what a shelf contains. Ships days–weeks; every move a revert.

**Lane B — restructure where the findings demand it.** May amend doctrine per §5. Likely collisions: roster/fleet tier (T4/T2), true stage modes, persistent project map — each meets D1/D8; name it, price it. Worktable is the destination (C14): build toward it or explain. May propose an I114 mapping as a candidate ruling; first slice must not depend on it. Ships weeks–quarter; rollback is a flag.

**Each lane delivers, in order:** (1) thesis — one falsifiable sentence; (2) IA/map — every surface and door, act-count annotated; (3) per-stage "what's next" organ for all seven sections — wording, placement, tie-break; reconcilable with `deriveDocumentGuide` or explicitly replacing it; (4) item-reach table — rooms · products · boards · documents (plans/spec book) · money · schedule · people × three tiers × act path × count; any cell >2 = declared exception with reason; (5) lexicon stance — old → new with brand-voice justification; positions on `Design authority`, `Knowledge`, `The Record`, `In this document`, the seven names vs the Patina Six; (6) five mock screens M1 desk ≥1440 · M2 doc project ≥1440 · M3 doc 1280 · M4 doc 390 · M5 stage-specific (say why it proves the thesis); (7) Keeps / Refuses / Costs; (8) first slice — smallest shippable thing that makes a Tuesday measurably better, naming the Leah-01 metric it moves (time-to-true-read · unaided acts · old-portal flights); plus (9) how it lands on flag-off and flag-on.

**Shared planks:** copy fixes, mislabels, a missing act, a dead-end shelf — never structure — adopted identically by both lanes and drawn identically in both mocks. A plank in only one mock is not a plank.

## §7 Judge rubric (1–10 per axis; two lenses; never averaged)

J1 practitioner-workflow (names the persona per score; weights 1,2,3,6). J2 product/engineering feasibility (cites file/ruling per cost; weights 4,5,6,7).

| Axis | 3 | 6 | 9 |
|---|---|---|---|
| 1 Obviousness of next act | Exists but shrug-verb or competing leader | One real act per stage in studio language | One act, every state, in her words, reason visible |
| 2 Findability ≤2 acts | ≥1 class recall/⌘K-only; ≥3 cells over at 1280 | All 7 classes ≤2 at ≥1440; ≤2 exceptions below | All 7 classes ≤2 at all tiers with visible scent |
| 3 First-week legibility (P3) | ≥3 labels opaque on sight | Every label decodable without a glossary | Junior completes T1, T4, T8, T13 unaided day one |
| 4 Distance from today | Reorders paper / adds tier / changes section grammar | One wave of composition + copy over existing derivations | Composition, labels, placement, copy only; every move a revert |
| 5 Doctrine cost | ≥2 amendments, or any unnamed (**unnamed = 1**) | One named amendment with trade + rollback | Zero — or one that closes a known-open item |
| 6 Effort to first value | First slice is a program | Ships in a week, moves a named metric | Ships in days, moves a metric, valuable alone |
| 7 Risk | Touches sealing semantics / send-seal wall / depends on I114 | Fail-closed flag or presentation-only | Additive, reversible, no data-model change |

A direction with no findings citation for a major move is returned, not scored. Each judge states which persona is worse off under the direction they favor.

## §8 Mock specimen — "same data, two shapes"

**The Vandersteen residence** — Shorewood Hills, Madison WI. Marit & Dale Vandersteen. Studio: Middlewest Studio (Madison). Opened 2026-03-02 · phase Procurement & Orders (4 of 6) · section `project` · **install Tuesday 2026-09-15, three weeks out**. Today is Tuesday 2026-08-25; in-hand timer 0:47; The Post 3 unread (one a Vandersteen question about the mudroom bench; dot only, never a count).

Rooms: Living room 14 lines (11 ordered, 2 in transit, 1 damaged) · Dining room 8 (8 ordered, 6 delivered) · Primary bedroom 9 (7 ordered, 2 awaiting client approval, overdue) · Mudroom 5 (3 ordered, 2 unspecified).

Red-letter zone shows exactly two: **OVERDUE 6 days** — Primary bedroom client approval on the Hartland wool rug + walnut nightstands, sent 2026-08-13, owner Client. **OVERDUE 3 days** — Living room fabric selection for the reading chair; workroom needs COM by 2026-08-22 to hold install, owner Designer.

Unacknowledged PO: **PO-2026-0418** · Sturdy Oak Woodworks, Dodgeville WI · dining table + 6 side chairs · $14,880 · sent 2026-08-11, 14 days no ack · 8-week lead time already past install math. Damage claim: Living room brass-and-oak console, Fond du Lac Ironworks, delivered 2026-08-19, top panel gouged, photographed at receiving, claim drafted not filed, carrier window closes 2026-08-26 (tomorrow).

Second client: **The Byrne remodel** — Cedarburg WI, Erin Byrne, section `proposal`; design agreement sent 2026-08-19, 6 days, never opened; $9,400 fee, four milestones; no nudge sent.

Money: FF&E budget approved $184,500 · specified $171,240 · ordered $141,600 · invoiced $96,400 · paid $78,900 · outstanding $17,500 (Invoice 2026-114, 22 days) · deposit due not drawn $12,300 (PO-2026-0418, 50% at release) · design fee $34,000, 3 of 4 milestones billed · hours this week 6.4 (Mon 2.1 · Tue 4.3).

Desk (six live): Vandersteen (`project`) · Byrne (`proposal`) · Okonkwo kitchen, Middleton WI (`install`, completed 2026-08-14, punch list pending) · Reinhardt lake house, Green Lake WI (`discovery`) · Kaminski condo, Milwaukee (`direction`) · one more quiet project.
